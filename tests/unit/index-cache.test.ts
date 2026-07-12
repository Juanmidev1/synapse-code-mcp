import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  loadCacheStore,
  saveCacheStore,
  getCachedOutline,
  pruneAndSave,
  CacheStore,
} from '../../src/core/analysis/index-cache.js';
import * as outlineExtractor from '../../src/core/analysis/outline-extractor.js';

let tmpDir: string;
let filePath: string;

function writeFile(content: string): void {
  fs.writeFileSync(filePath, content);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-index-cache-'));
  filePath = path.join(tmpDir, 'sample.ts');
  writeFile('export function foo() {}\n');
  vi.restoreAllMocks();
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('index-cache', () => {
  it('cache miss on first call creates index.json with the right shape', () => {
    const store = loadCacheStore(tmpDir, { cacheEnabled: true });
    const outline = getCachedOutline(filePath, tmpDir, { cacheEnabled: true }, store);
    saveCacheStore(tmpDir, { cacheEnabled: true }, store);

    expect(outline.symbols.some((s) => s.name === 'foo')).toBe(true);

    const cacheFile = path.join(tmpDir, '.synapse-cache', 'index.json');
    expect(fs.existsSync(cacheFile)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as CacheStore;
    expect(parsed.version).toBe(1);
    expect(Object.keys(parsed.entries)).toHaveLength(1);
  });

  it('cache hit returns identical outline without re-invoking extractOutline', () => {
    const store1 = loadCacheStore(tmpDir, { cacheEnabled: true });
    getCachedOutline(filePath, tmpDir, { cacheEnabled: true }, store1);
    saveCacheStore(tmpDir, { cacheEnabled: true }, store1);

    const spy = vi.spyOn(outlineExtractor, 'extractOutline');
    const store2 = loadCacheStore(tmpDir, { cacheEnabled: true });
    const outline = getCachedOutline(filePath, tmpDir, { cacheEnabled: true }, store2);

    expect(outline.symbols.some((s) => s.name === 'foo')).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('content change invalidates and recomputes', () => {
    const store1 = loadCacheStore(tmpDir, { cacheEnabled: true });
    getCachedOutline(filePath, tmpDir, { cacheEnabled: true }, store1);
    saveCacheStore(tmpDir, { cacheEnabled: true }, store1);

    writeFile('export function bar() {}\n');

    const store2 = loadCacheStore(tmpDir, { cacheEnabled: true });
    const outline = getCachedOutline(filePath, tmpDir, { cacheEnabled: true }, store2);

    expect(outline.symbols.some((s) => s.name === 'bar')).toBe(true);
    expect(outline.symbols.some((s) => s.name === 'foo')).toBe(false);
  });

  it('new file not previously cached is computed and added', () => {
    const store = loadCacheStore(tmpDir, { cacheEnabled: true });
    getCachedOutline(filePath, tmpDir, { cacheEnabled: true }, store);

    const otherFile = path.join(tmpDir, 'other.ts');
    fs.writeFileSync(otherFile, 'export function baz() {}\n');
    const outline = getCachedOutline(otherFile, tmpDir, { cacheEnabled: true }, store);

    expect(outline.symbols.some((s) => s.name === 'baz')).toBe(true);
    expect(Object.keys(store.entries)).toHaveLength(2);
  });

  it('pruneAndSave drops entries for files no longer present', () => {
    const store = loadCacheStore(tmpDir, { cacheEnabled: true });
    getCachedOutline(filePath, tmpDir, { cacheEnabled: true }, store);

    pruneAndSave(tmpDir, { cacheEnabled: true }, store, new Set());

    const reloaded = loadCacheStore(tmpDir, { cacheEnabled: true });
    expect(Object.keys(reloaded.entries)).toHaveLength(0);
  });

  it('corrupt cache file recovers to an empty store without throwing', () => {
    const cacheDir = path.join(tmpDir, '.synapse-cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'index.json'), 'not valid json{{{');

    const store = loadCacheStore(tmpDir, { cacheEnabled: true });
    expect(store.entries).toEqual({});

    const outline = getCachedOutline(filePath, tmpDir, { cacheEnabled: true }, store);
    expect(outline.symbols.some((s) => s.name === 'foo')).toBe(true);

    saveCacheStore(tmpDir, { cacheEnabled: true }, store);
    const parsed = JSON.parse(
      fs.readFileSync(path.join(cacheDir, 'index.json'), 'utf-8'),
    ) as CacheStore;
    expect(parsed.version).toBe(1);
  });

  it('schema version mismatch is treated as an empty store', () => {
    const cacheDir = path.join(tmpDir, '.synapse-cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'index.json'),
      JSON.stringify({ version: 0, entries: { foo: {} } }),
    );

    const store = loadCacheStore(tmpDir, { cacheEnabled: true });
    expect(store.entries).toEqual({});
  });

  it('cacheEnabled:false bypasses the cache entirely', () => {
    const store = loadCacheStore(tmpDir, { cacheEnabled: false });
    const outline = getCachedOutline(filePath, tmpDir, { cacheEnabled: false }, store);
    saveCacheStore(tmpDir, { cacheEnabled: false }, store);

    expect(outline.symbols.some((s) => s.name === 'foo')).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.synapse-cache'))).toBe(false);
  });

  it('unwritable cache dir degrades gracefully without throwing', () => {
    if (process.platform === 'win32') return;

    fs.chmodSync(tmpDir, 0o444);
    try {
      const store = loadCacheStore(tmpDir, { cacheEnabled: true });
      expect(() => saveCacheStore(tmpDir, { cacheEnabled: true }, store)).not.toThrow();
    } finally {
      fs.chmodSync(tmpDir, 0o755);
    }
  });
});
