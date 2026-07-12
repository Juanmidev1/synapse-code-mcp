import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { SearchMatch } from '../../types/search.js';

interface RipgrepLine {
  type: string;
  data: {
    path?: { text: string };
    line_number?: number;
    absolute_offset?: number;
    lines?: { text: string };
    submatches?: Array<{ match: { text: string }; start: number }>;
  };
}

export function isAvailable(): boolean {
  try {
    execSync('rg --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export interface SearchParams {
  root: string;
  query: string;
  isRegex: boolean;
  filePattern?: string;
  caseSensitive: boolean;
  maxResults: number;
  ig?: import('ignore').Ignore;
}

function parseRipgrepOutput(output: string, root: string): SearchMatch[] {
  const matches: SearchMatch[] = [];

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as RipgrepLine;
      if (parsed.type !== 'match') continue;

      const filePath = parsed.data.path?.text ?? '';
      const lineNum = parsed.data.line_number ?? 0;
      const lineText = parsed.data.lines?.text?.trimEnd() ?? '';
      const submatch = parsed.data.submatches?.[0];
      const col = submatch ? submatch.start + 1 : 1;
      const matchText = submatch?.match.text ?? '';

      matches.push({
        file: path.relative(root, filePath),
        line: lineNum,
        column: col,
        match: matchText,
        context: lineText,
      });
    } catch {
      // skip malformed lines
    }
  }

  return matches;
}

export async function searchAsync(params: SearchParams): Promise<SearchMatch[]> {
  return new Promise((resolve, reject) => {
    const args = ['--json', '--line-number', '--column'];

    if (!params.caseSensitive) args.push('--ignore-case');
    if (!params.isRegex) args.push('--fixed-strings');
    if (params.filePattern) args.push('--glob', params.filePattern);
    args.push('--max-count', String(params.maxResults));
    args.push(params.query, params.root);

    const proc = spawn('rg', args);
    let stdout = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code !== null && code > 1) {
        reject(new Error(`ripgrep exited with code ${code}`));
      } else {
        resolve(parseRipgrepOutput(stdout, params.root));
      }
    });

    proc.on('error', reject);
  });
}
