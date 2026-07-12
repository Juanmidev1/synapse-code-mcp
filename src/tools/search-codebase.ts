import { z } from 'zod';
import { SynapseConfig } from '../types/config.js';
import { search } from '../core/search/searcher.js';
import { validateGlobPattern } from '../utils/path-utils.js';

export const SearchCodebaseSchema = z.object({
  query: z.string().min(1).describe('Text or regex pattern to search for.'),
  is_regex: z.boolean().optional().describe('Treat query as a regular expression. Default: false.'),
  file_pattern: z.string().optional().describe('Glob pattern to restrict search scope (e.g. "**/*.ts").'),
  case_sensitive: z.boolean().optional().describe('Case-sensitive search. Default: false.'),
  max_results: z.number().int().positive().max(500).optional().describe('Maximum number of results. Default: config value.'),
});

export type SearchCodebaseInput = z.infer<typeof SearchCodebaseSchema>;

export async function handleSearchCodebase(
  input: SearchCodebaseInput,
  config: SynapseConfig,
): Promise<string> {
  const searchParams: import('../core/search/searcher.js').SearchParams = {
    root: config.root,
    query: input.query,
    isRegex: input.is_regex ?? false,
    caseSensitive: input.case_sensitive ?? false,
    maxResults: input.max_results ?? config.maxSearchResults,
  };
  if (input.file_pattern !== undefined) {
    validateGlobPattern(config.root, input.file_pattern);
    searchParams.filePattern = input.file_pattern;
  }
  const result = await search(searchParams);

  if (result.matches.length === 0) {
    return `No matches found for "${result.query}".`;
  }

  const lines: string[] = [
    `Found ${result.matches.length} match${result.matches.length !== 1 ? 'es' : ''} for "${result.query}"${result.truncated ? ' (results truncated)' : ''}:\n`,
  ];

  let lastFile = '';
  for (const match of result.matches) {
    if (match.file !== lastFile) {
      lines.push(`\n📄 ${match.file}`);
      lastFile = match.file;
    }
    lines.push(`  ${match.line}:${match.column}  ${match.context}`);
  }

  return lines.join('\n');
}
