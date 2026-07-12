/**
 * Guards against a class of bug where source-level tests (run by vitest's own
 * transform, which tolerates require() even in "ESM" .ts files) pass while the
 * real tsc-compiled ESM output silently breaks — this exact scenario let
 * ts-morph loading fail unnoticed across every release through v0.5.3, because
 * bare require('ts-morph') throws ReferenceError in genuine Node ESM but not
 * under vitest's transform. These tests import directly from dist/, not src/.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, '../..');
const DIST_OUTLINE = path.join(REPO_ROOT, 'dist/core/analysis/outline-extractor.js');
const DIST_RESOLVER = path.join(REPO_ROOT, 'dist/core/analysis/ts-resolver.js');

beforeAll(() => {
  execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'ignore' });
}, 60_000);

describe('compiled dist/ output — ts-morph actually loads', () => {
  it('extractOutline (from dist) returns typed interface properties, not just the bare name', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-compiled-outline-'));
    const filePath = path.join(tmpDir, 'models.ts');
    fs.writeFileSync(
      filePath,
      'export interface User {\n  id: number;\n  name: string;\n  email?: string;\n}\n',
    );

    try {
      const { extractOutline } = (await import(DIST_OUTLINE)) as typeof import('../../src/core/analysis/outline-extractor.js');
      const outline = extractOutline(filePath, tmpDir);

      // The regex fallback (extractGenericOutline) only ever emits the bare
      // interface declaration line — it cannot see members. Real ts-morph
      // analysis emits each property as its own "variable" symbol with type text.
      const propertyNames = outline.symbols.filter((s) => s.kind === 'variable').map((s) => s.name);
      expect(propertyNames).toEqual(['id', 'name', 'email']);
      expect(outline.symbols.find((s) => s.name === 'name')?.signature).toBe('name: string');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('resolveImports (from dist) resolves a plain relative import to a real file', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-compiled-resolver-'));
    const aPath = path.join(tmpDir, 'a.ts');
    const bPath = path.join(tmpDir, 'b.ts');
    fs.writeFileSync(aPath, "import { b } from './b';\nexport function a() { return b(); }\n");
    fs.writeFileSync(bPath, 'export function b() { return 1; }\n');

    try {
      const { resolveImports } = (await import(DIST_RESOLVER)) as typeof import('../../src/core/analysis/ts-resolver.js');
      const edges = resolveImports(aPath, tmpDir);

      expect(edges).toHaveLength(1);
      expect(edges[0]?.to).toBe(bPath);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
