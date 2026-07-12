import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { handleGetProjectTree } from '../../src/tools/get-project-tree.js';
import { loadConfig } from '../../src/config/index.js';

const FIXTURE_ROOT = path.resolve('tests/fixtures/integration-project');

describe('Integration: get_project_tree', () => {
  it('returns the complete file tree of the fixture project', async () => {
    const config = loadConfig({ root: FIXTURE_ROOT });
    const result = await handleGetProjectTree({}, config);

    // Header contains the project root path
    expect(result).toContain(FIXTURE_ROOT);

    // All source files are listed
    expect(result).toContain('app.ts');
    expect(result).toContain('user-service.ts');
    expect(result).toContain('user.ts');
    expect(result).toContain('format.ts');

    // Directories are listed
    expect(result).toContain('src');
    expect(result).toContain('services');
    expect(result).toContain('models');
    expect(result).toContain('utils');
  });

  it('uses tree-style connectors (└── or ├──)', async () => {
    const config = loadConfig({ root: FIXTURE_ROOT });
    const result = await handleGetProjectTree({}, config);
    expect(result).toMatch(/[├└]──/);
  });

  it('reports correct file and directory counts in header', async () => {
    const config = loadConfig({ root: FIXTURE_ROOT });
    const result = await handleGetProjectTree({}, config);

    const filesMatch = result.match(/Files:\s*(\d+)/);
    const dirsMatch = result.match(/Directories:\s*(\d+)/);

    expect(filesMatch).not.toBeNull();
    expect(dirsMatch).not.toBeNull();

    // Fixture has: app.ts, user-service.ts, user.ts, format.ts, README.md = 5 files
    // .gitignore is hidden so not shown by default
    expect(Number(filesMatch![1])).toBe(5);

    // Fixture dirs: src/, services/, models/, utils/ = 4
    expect(Number(dirsMatch![1])).toBe(4);
  });

  it('omits gitignore-listed patterns — node_modules, dist, build, *.log are absent', async () => {
    const config = loadConfig({ root: FIXTURE_ROOT });
    const result = await handleGetProjectTree({}, config);

    expect(result).not.toContain('node_modules');
    expect(result).not.toContain('/dist');
    expect(result).not.toContain('/build');
    expect(result).not.toMatch(/\.log/);
  });

  it('max_depth 1 shows only top-level entries, not nested files', async () => {
    const config = loadConfig({ root: FIXTURE_ROOT });
    const result = await handleGetProjectTree({ max_depth: 1 }, config);

    // src dir appears at depth 1
    expect(result).toContain('src');

    // Files inside src only appear at depth 2+
    expect(result).not.toContain('app.ts');
    expect(result).not.toContain('user.ts');
  });

  it('max_depth 2 shows src/ contents but not nested sub-directories contents', async () => {
    const config = loadConfig({ root: FIXTURE_ROOT });
    const result = await handleGetProjectTree({ max_depth: 2 }, config);

    // app.ts lives directly in src/ → depth 2, must appear
    expect(result).toContain('app.ts');

    // services/ dir appears at depth 2 (listed as directory)
    expect(result).toContain('services');

    // user-service.ts lives inside services/ → depth 3, must NOT appear
    expect(result).not.toContain('user-service.ts');
  });

  it('show_hidden: true reveals .gitignore entry', async () => {
    const config = loadConfig({ root: FIXTURE_ROOT });
    const result = await handleGetProjectTree({ show_hidden: true }, config);
    expect(result).toContain('.gitignore');
  });

  it('restricts tree to a subdirectory when path option is provided', async () => {
    const config = loadConfig({ root: FIXTURE_ROOT });
    const result = await handleGetProjectTree({ path: 'src/models' }, config);

    expect(result).toContain('user.ts');
    // Files outside src/models should not appear
    expect(result).not.toContain('app.ts');
    expect(result).not.toContain('user-service.ts');
  });

  it('ignores extra patterns supplied via config', async () => {
    const config = loadConfig({ root: FIXTURE_ROOT, extraIgnorePatterns: ['*.md'] });
    const result = await handleGetProjectTree({}, config);

    expect(result).not.toContain('README.md');
    // .ts files are still listed
    expect(result).toContain('app.ts');
  });

  it('respects extraIgnorePatterns from synapse.config.json', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-config-ignore-'));

  try {
    fs.writeFileSync(
      path.join(tmpRoot, 'synapse.config.json'),
      JSON.stringify({
        extraIgnorePatterns: ['*.generated.ts'],
      }),
    );

    fs.writeFileSync(
      path.join(tmpRoot, 'keep.ts'),
      'export const x = 1;',
    );

    fs.writeFileSync(
      path.join(tmpRoot, 'test.generated.ts'),
      'export const y = 2;',
    );

    const config = loadConfig({ root: tmpRoot });
    const result = await handleGetProjectTree({}, config);

    expect(result).toContain('keep.ts');
    expect(result).not.toContain('test.generated.ts');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

  describe('with an ad-hoc temp fixture', () => {
    let tmpRoot: string;

    beforeAll(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-tree-'));
      fs.mkdirSync(path.join(tmpRoot, 'src'));
      fs.mkdirSync(path.join(tmpRoot, 'node_modules', 'lodash'), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, 'dist'));
      fs.writeFileSync(path.join(tmpRoot, 'src', 'index.ts'), 'export const x = 1;');
      fs.writeFileSync(path.join(tmpRoot, 'node_modules', 'lodash', 'index.js'), 'module.exports = {};');
      fs.writeFileSync(path.join(tmpRoot, 'dist', 'index.js'), 'export const x = 1;');
      fs.writeFileSync(path.join(tmpRoot, '.gitignore'), 'node_modules/\ndist/\n');
    });

    afterAll(() => {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it('excludes node_modules/ and dist/ via .gitignore in a fresh project', async () => {
      const config = loadConfig({ root: tmpRoot });
      const result = await handleGetProjectTree({}, config);

      expect(result).toContain('index.ts');
      expect(result).not.toContain('node_modules');
      expect(result).not.toContain('dist');
    });
  });
});
