import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { buildProjectIndex } from '../../src/core/analysis/project-indexer.js';
import { loadConfig } from '../../src/config/index.js';

const FIXTURE_ROOT = path.resolve('tests/fixtures/integration-project');
const config = loadConfig({ root: FIXTURE_ROOT, cacheEnabled: false });

describe('buildProjectIndex — integration-project fixture', () => {
  it('returns a non-empty index', async () => {
    const index = await buildProjectIndex(FIXTURE_ROOT, config);
    expect(index.totalFiles).toBeGreaterThan(0);
    expect(index.totalSymbols).toBeGreaterThan(0);
  });

  it('indexes UserService class', async () => {
    const index = await buildProjectIndex(FIXTURE_ROOT, config);
    const userServiceFile = index.files.find((f) => f.relativePath.includes('user-service'));
    expect(userServiceFile).toBeDefined();

    const cls = userServiceFile?.symbols.find((s) => s.name === 'UserService' && s.kind === 'class');
    expect(cls).toBeDefined();
    expect(cls?.exported).toBe(true);
  });

  it('indexes UserService methods (add, getAll, findById)', async () => {
    const index = await buildProjectIndex(FIXTURE_ROOT, config);
    const userServiceFile = index.files.find((f) => f.relativePath.includes('user-service'));
    const methods = userServiceFile?.symbols.filter((s) => s.kind === 'method');
    const names = methods?.map((m) => m.name) ?? [];
    expect(names).toContain('add');
    expect(names).toContain('getAll');
    expect(names).toContain('findById');
  });

  it('indexes User interface with properties', async () => {
    const index = await buildProjectIndex(FIXTURE_ROOT, config);
    const userFile = index.files.find((f) => f.relativePath.includes('models/user'));
    expect(userFile).toBeDefined();

    const iface = userFile?.symbols.find((s) => s.name === 'User' && s.kind === 'interface');
    expect(iface).toBeDefined();
    expect(iface?.exported).toBe(true);
  });

  it('indexes createUser exported function', async () => {
    const index = await buildProjectIndex(FIXTURE_ROOT, config);
    const userFile = index.files.find((f) => f.relativePath.includes('models/user'));
    const fn = userFile?.symbols.find((s) => s.name === 'createUser' && s.kind === 'function');
    expect(fn).toBeDefined();
    expect(fn?.exported).toBe(true);
  });

  it('files are sorted alphabetically by relativePath', async () => {
    const index = await buildProjectIndex(FIXTURE_ROOT, config);
    const paths = index.files.map((f) => f.relativePath);
    const sorted = [...paths].sort((a, b) => a.localeCompare(b));
    expect(paths).toEqual(sorted);
  });

  it('does NOT include function bodies in any symbol signature', async () => {
    const index = await buildProjectIndex(FIXTURE_ROOT, config);
    for (const file of index.files) {
      for (const sym of file.symbols) {
        expect(sym.signature).not.toContain('return');
        expect(sym.signature).not.toContain('{');
      }
    }
  });

  it('file_pattern restricts files indexed', async () => {
    const index = await buildProjectIndex(FIXTURE_ROOT, config, {
      filePattern: 'src/models/**/*.ts',
    });
    expect(index.files.every((f) => f.relativePath.startsWith('src/models/'))).toBe(true);
    expect(index.totalFiles).toBeGreaterThan(0);
  });

  it('include_non_exported=false (default) only shows exported symbols at file level', async () => {
    const index = await buildProjectIndex(FIXTURE_ROOT, config, { includeNonExported: false });
    for (const file of index.files) {
      // Top-level symbols (not methods) should all be exported
      const topLevel = file.symbols.filter((s) => s.kind !== 'method' && s.kind !== 'variable');
      expect(topLevel.every((s) => s.exported)).toBe(true);
    }
  });
});

describe('buildProjectIndex — incremental index cache', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-cache-test-'));
  fs.cpSync(FIXTURE_ROOT, tmpRoot, { recursive: true });
  const cachedConfig = loadConfig({ root: tmpRoot, cacheEnabled: true });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('creates .synapse-cache/index.json and returns identical results on repeat calls', async () => {
    const first = await buildProjectIndex(tmpRoot, cachedConfig);
    const cacheFile = path.join(tmpRoot, '.synapse-cache', 'index.json');
    expect(fs.existsSync(cacheFile)).toBe(true);

    const second = await buildProjectIndex(tmpRoot, cachedConfig);
    expect(second.totalFiles).toBe(first.totalFiles);
    expect(second.totalSymbols).toBe(first.totalSymbols);
    expect(second.files).toEqual(first.files);
  });

  it('excludes .synapse-cache from the indexed files', async () => {
    const index = await buildProjectIndex(tmpRoot, cachedConfig);
    expect(index.files.some((f) => f.relativePath.includes('.synapse-cache'))).toBe(false);
  });
});
