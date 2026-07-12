import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { search } from '../../src/core/search/native-adapter.js';
import { InvalidRegexError } from '../../src/utils/errors.js';

const ROOT = path.resolve('tests/fixtures/simple-ts-project');

describe('native-adapter', () => {
  it('finds plain text match and returns correct shape', async () => {
    const matches = await search({
      root: ROOT,
      query: 'greet',
      isRegex: false,
      caseSensitive: false,
      maxResults: 50,
    });

    expect(matches.length).toBeGreaterThan(0);
    const m = matches[0]!;
    expect(m).toHaveProperty('file');
    expect(m).toHaveProperty('line');
    expect(m).toHaveProperty('column');
    expect(m).toHaveProperty('match');
    expect(m).toHaveProperty('context');
    expect(m.match.toLowerCase()).toContain('greet');
  });

  it('is case-insensitive by default', async () => {
    const lower = await search({ root: ROOT, query: 'greet', isRegex: false, caseSensitive: false, maxResults: 50 });
    const upper = await search({ root: ROOT, query: 'GREET', isRegex: false, caseSensitive: false, maxResults: 50 });
    expect(lower.length).toBe(upper.length);
  });

  it('is case-sensitive when requested', async () => {
    const matches = await search({ root: ROOT, query: 'GREET', isRegex: false, caseSensitive: true, maxResults: 50 });
    expect(matches).toHaveLength(0);
  });

  it('returns empty array for non-existent term', async () => {
    const matches = await search({
      root: ROOT,
      query: 'ZZZNOTFOUNDXYZ',
      isRegex: false,
      caseSensitive: false,
      maxResults: 50,
    });
    expect(matches).toHaveLength(0);
  });

  it('respects maxResults limit', async () => {
    const matches = await search({ root: ROOT, query: 'const', isRegex: false, caseSensitive: false, maxResults: 2 });
    expect(matches.length).toBeLessThanOrEqual(2);
  });

  it('supports regex queries', async () => {
    const matches = await search({ root: ROOT, query: 'gr[e]+t', isRegex: true, caseSensitive: false, maxResults: 50 });
    expect(matches.length).toBeGreaterThan(0);
  });

  it('throws InvalidRegexError for an invalid regex instead of returning empty', async () => {
    await expect(
      search({ root: ROOT, query: '[invalid', isRegex: true, caseSensitive: false, maxResults: 50 }),
    ).rejects.toThrow(InvalidRegexError);
  });

  it('restricts results to file_pattern glob', async () => {
    const matches = await search({
      root: ROOT,
      query: 'greet',
      isRegex: false,
      caseSensitive: false,
      maxResults: 50,
      filePattern: '**/*.ts',
    });
    expect(matches.every((m) => m.file.endsWith('.ts'))).toBe(true);
  });

  it('returns file paths relative to root', async () => {
    const matches = await search({ root: ROOT, query: 'greet', isRegex: false, caseSensitive: false, maxResults: 50 });
    for (const m of matches) {
      expect(path.isAbsolute(m.file)).toBe(false);
    }
  });

  it('line numbers are 1-indexed', async () => {
    const matches = await search({ root: ROOT, query: 'greet', isRegex: false, caseSensitive: false, maxResults: 50 });
    expect(matches.every((m) => m.line >= 1)).toBe(true);
  });

  it('column numbers are 1-indexed', async () => {
    const matches = await search({ root: ROOT, query: 'greet', isRegex: false, caseSensitive: false, maxResults: 50 });
    expect(matches.every((m) => m.column >= 1)).toBe(true);
  });
});
