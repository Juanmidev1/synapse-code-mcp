import { z } from 'zod';
import { SynapseConfig } from '../types/config.js';
import { loadIgnore } from '../core/fs/ignore-resolver.js';
import { buildTree, treeToText } from '../core/fs/tree-builder.js';
import { resolveAndValidate, assertExists } from '../utils/path-utils.js';

export const GetProjectTreeSchema = z.object({
  path: z.string().optional().describe('Subdirectory to list (relative to project root). Defaults to root.'),
  max_depth: z.number().int().positive().max(20).optional().describe('Maximum depth to traverse. Default: config value.'),
  show_hidden: z.boolean().optional().describe('Include hidden files/dirs (starting with dot). Default: false.'),
});

export type GetProjectTreeInput = z.infer<typeof GetProjectTreeSchema>;

// eslint-disable-next-line @typescript-eslint/require-await
export async function handleGetProjectTree(
  input: GetProjectTreeInput,
  config: SynapseConfig,
): Promise<string> {
  const root = config.root;
  const maxDepth = input.max_depth ?? config.maxTreeDepth;
  const showHidden = input.show_hidden ?? false;

  const subRoot = input.path ? resolveAndValidate(root, input.path) : root;
  assertExists(subRoot);
  const ig = loadIgnore(root, config.extraIgnorePatterns);
  const result = buildTree({ root: subRoot, maxDepth, showHidden, ig });

  const treeText = treeToText(result.tree);
  const header = `Project: ${root}\nFiles: ${result.stats.totalFiles} | Directories: ${result.stats.totalDirs}\n`;

  return `${header}\n${treeText}`;
}
