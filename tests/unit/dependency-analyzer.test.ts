import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { analyze } from '../../src/core/analysis/dependency-analyzer.js';

const FIXTURE_ROOT = path.resolve('tests/fixtures/simple-ts-project');

describe('dependency-analyzer', () => {
  it('analyzes main.ts and finds utils.ts as dependency', () => {
    const mainPath = path.join(FIXTURE_ROOT, 'src', 'main.ts');
    const ctx = analyze({
      filePath: mainPath,
      root: FIXTURE_ROOT,
      maxDepth: 2,
      maxFileSize: 512 * 1024,
      cacheEnabled: false,
    });

    expect(ctx.entryFile.relativePath).toBe(path.join('src', 'main.ts'));
    expect(ctx.entryFile.language).toBe('typescript');
    const depPaths = ctx.dependencies.map((d) => d.relativePath);
    expect(depPaths.some((p) => p.includes('utils'))).toBe(true);
  });

  it('stats reflect total files and lines', () => {
    const mainPath = path.join(FIXTURE_ROOT, 'src', 'main.ts');
    const ctx = analyze({
      filePath: mainPath,
      root: FIXTURE_ROOT,
      maxDepth: 2,
      maxFileSize: 512 * 1024,
      cacheEnabled: false,
    });

    expect(ctx.stats.totalFiles).toBeGreaterThanOrEqual(1);
    expect(ctx.stats.totalLines).toBeGreaterThan(0);
  });
});
