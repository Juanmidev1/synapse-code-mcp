import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import { SearchMatch } from '../../types/search.js';
import type { SearchParams } from './ripgrep-adapter.js';
import { InvalidRegexError } from '../../utils/errors.js';

export async function search(params: SearchParams): Promise<SearchMatch[]> {
  const pattern = params.filePattern
    ? path.join(params.root, params.filePattern).replace(/\\/g, '/')
    : path.join(params.root, '**/*').replace(/\\/g, '/');

  const files = await fg(pattern, {
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
  });

  const flags = params.caseSensitive ? 'g' : 'gi';
  let regex: RegExp;

  const queryStr = params.isRegex ? params.query : escapeRegex(params.query);
  try {
    regex = new RegExp(queryStr, flags);
  } catch (err) {
    throw new InvalidRegexError(queryStr, err instanceof Error ? err.message : 'malformed pattern');
  }

  const matches: SearchMatch[] = [];

  for (const filePath of files) {
    if (matches.length >= params.maxResults) break;

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      regex.lastIndex = 0;
      const m = regex.exec(line);
      if (m) {
        matches.push({
          file: path.relative(params.root, filePath),
          line: i + 1,
          column: m.index + 1,
          match: m[0],
          context: line.trimEnd(),
        });
        if (matches.length >= params.maxResults) break;
      }
    }
  }

  return matches;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
