import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveImports } from '../../src/core/analysis/ts-resolver.js';

const FIXTURE = path.resolve('tests/fixtures/alias-project');

describe('ts-resolver — path alias resolution', () => {
  it('resolves @utils/* alias to src/utils/helper.ts', () => {
    const edges = resolveImports(path.join(FIXTURE, 'src/main.ts'), FIXTURE);
    expect(edges).toHaveLength(1);
    expect(edges[0]?.to).toContain(path.join('src', 'utils', 'helper.ts'));
  });

  it('does not include paths outside the project root', () => {
    const edges = resolveImports(path.join(FIXTURE, 'src/main.ts'), FIXTURE);
    expect(edges.every((e) => e.to.startsWith(FIXTURE))).toBe(true);
  });
});
