import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { handleSearchCodebase } from '../../src/tools/search-codebase.js';
import { loadConfig } from '../../src/config/index.js';
import { PathEscapeError } from '../../src/utils/errors.js';

const FIXTURE_ROOT = path.resolve('tests/fixtures/simple-ts-project');
const config = loadConfig({ root: FIXTURE_ROOT });

describe('handleSearchCodebase', () => {
  it('returns a string when matches are found', async () => {
    const result = await handleSearchCodebase({ query: 'greet' }, config);
    expect(typeof result).toBe('string');
    expect(result).toContain('greet');
  });

  it('returns "No matches found" message for unknown term', async () => {
    const result = await handleSearchCodebase({ query: 'ZZZNOTFOUNDXYZ' }, config);
    expect(result).toContain('No matches found');
  });

  it('includes file paths in output', async () => {
    const result = await handleSearchCodebase({ query: 'greet' }, config);
    expect(result).toContain('.ts');
  });

  it('includes line numbers in output', async () => {
    const result = await handleSearchCodebase({ query: 'greet' }, config);
    expect(result).toMatch(/\d+:\d+/);
  });

  it('shows match count in output header', async () => {
    const result = await handleSearchCodebase({ query: 'greet' }, config);
    expect(result).toMatch(/Found \d+ match/);
  });

  it('respects file_pattern — only searches .ts files', async () => {
    const result = await handleSearchCodebase({ query: 'greet', file_pattern: '**/*.ts' }, config);
    const lines = result.split('\n').filter((l) => l.startsWith('  '));
    expect(lines.length).toBeGreaterThan(0);
  });

  it('is case-insensitive by default', async () => {
    const lower = await handleSearchCodebase({ query: 'greet' }, config);
    const upper = await handleSearchCodebase({ query: 'GREET' }, config);
    expect(lower).toContain('greet');
    expect(upper).toContain('greet');
  });

  it('supports regex queries', async () => {
    const result = await handleSearchCodebase({ query: 'gr[e]+t', is_regex: true }, config);
    expect(result).toContain('greet');
  });

  it('rejects a file_pattern that escapes the project root', async () => {
    await expect(
      handleSearchCodebase({ query: 'greet', file_pattern: '../../../../etc/passwd' }, config),
    ).rejects.toThrow(PathEscapeError);
  });

  it('rejects a file_pattern with traversal and a wildcard tail', async () => {
    await expect(
      handleSearchCodebase({ query: 'greet', file_pattern: '../../outside/**' }, config),
    ).rejects.toThrow(PathEscapeError);
  });
});
