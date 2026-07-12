import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { handleGetProjectTree } from '../../src/tools/get-project-tree.js';
import { loadConfig } from '../../src/config/index.js';
import { FileNotFoundError } from '../../src/utils/errors.js';

const FIXTURE_ROOT = path.resolve('tests/fixtures/simple-ts-project');
const config = loadConfig({ root: FIXTURE_ROOT });

describe('handleGetProjectTree', () => {
  it('returns a string with project path in header', async () => {
    const result = await handleGetProjectTree({}, config);
    expect(result).toContain(FIXTURE_ROOT);
  });

  it('lists src/ directory in output', async () => {
    const result = await handleGetProjectTree({}, config);
    expect(result).toContain('src');
  });

  it('lists known files', async () => {
    const result = await handleGetProjectTree({}, config);
    expect(result).toContain('main.ts');
    expect(result).toContain('utils.ts');
  });

  it('includes file and directory counts in header', async () => {
    const result = await handleGetProjectTree({}, config);
    expect(result).toMatch(/Files:\s*\d+/);
    expect(result).toMatch(/Directories:\s*\d+/);
  });

  it('respects max_depth — does not show files beyond depth 1', async () => {
    const result = await handleGetProjectTree({ max_depth: 1 }, config);
    expect(result).toContain('src');
    expect(result).not.toContain('main.ts');
  });

  it('uses tree-style connectors (└── or ├──)', async () => {
    const result = await handleGetProjectTree({}, config);
    expect(result).toMatch(/[├└]──/);
  });

  it('throws a typed FileNotFoundError for a nonexistent subdirectory, not a raw ENOENT', async () => {
    await expect(handleGetProjectTree({ path: 'does-not-exist' }, config)).rejects.toThrow(
      FileNotFoundError,
    );
  });
});
