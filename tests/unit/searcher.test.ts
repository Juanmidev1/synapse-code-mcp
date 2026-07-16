import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { search } from '../../src/core/search/searcher.js';

const FIXTURE_ROOT = path.resolve('tests/fixtures/simple-ts-project');

describe('searcher', () => {
  it('finds plain text matches', async () => {
    const result = await search({
      root: FIXTURE_ROOT,
      query: 'greet',
      isRegex: false,
      caseSensitive: false,
      maxFileSize: 512 * 1024,
      maxResults: 50,
    });

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.every((m) => m.file.endsWith('.ts') || m.file.endsWith('.js'))).toBe(true);
  });

  it('returns empty for non-existent term', async () => {
    const result = await search({
      root: FIXTURE_ROOT,
      query: 'THIS_STRING_DOES_NOT_EXIST_IN_FIXTURES_XYZ',
      isRegex: false,
      caseSensitive: false,
      maxFileSize: 512 * 1024,
      maxResults: 50,
    });

    expect(result.matches).toHaveLength(0);
  });

  it('respects file_pattern glob', async () => {
    const result = await search({
      root: FIXTURE_ROOT,
      query: 'greet',
      isRegex: false,
      caseSensitive: false,
      maxFileSize: 512 * 1024,
      maxResults: 50,
      filePattern: '**/*.ts',
    });

    expect(result.matches.every((m) => m.file.endsWith('.ts'))).toBe(true);
  });
});
