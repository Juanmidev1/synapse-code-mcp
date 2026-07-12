import { z } from 'zod';
import { SynapseConfig } from '../types/config.js';
import { diffStat, getFullDiff, isGitRepo } from '../core/git/git-adapter.js';
import { GitError } from '../utils/errors.js';

export const GetChangedFilesSchema = z.object({
  base_ref: z
    .string()
    .optional()
    .describe('Git ref to diff against (branch, tag, or commit SHA). Default: HEAD~1.'),
  include_diff: z
    .boolean()
    .optional()
    .describe('Include the full unified diff output (max 50 KB). Default: false.'),
  file_pattern: z
    .string()
    .optional()
    .describe('Glob pattern to filter changed files, e.g. "**/*.ts". Default: all files.'),
});

export type GetChangedFilesInput = z.infer<typeof GetChangedFilesSchema>;

// eslint-disable-next-line @typescript-eslint/require-await
export async function handleGetChangedFiles(
  input: GetChangedFilesInput,
  config: SynapseConfig,
): Promise<string> {
  const baseRef = input.base_ref ?? 'HEAD~1';

  if (!isGitRepo(config.root)) {
    throw new GitError(`"${config.root}" is not a git repository.`);
  }

  const result = diffStat(config.root, baseRef);

  let files = result.changedFiles;

  if (input.file_pattern) {
    const pattern = input.file_pattern;
    files = files.filter((f) => matchesGlob(f.path, pattern));
  }

  if (files.length === 0) {
    return `No changed files found between HEAD and ${baseRef}${input.file_pattern ? ` matching "${input.file_pattern}"` : ''}.`;
  }

  const parts: string[] = [];

  parts.push(`Changed files since \`${baseRef}\` (${files.length} file${files.length === 1 ? '' : 's'}):\n`);

  const byStatus = {
    A: files.filter((f) => f.status === 'A'),
    M: files.filter((f) => f.status === 'M'),
    D: files.filter((f) => f.status === 'D'),
    R: files.filter((f) => f.status === 'R'),
    C: files.filter((f) => f.status === 'C'),
    U: files.filter((f) => f.status === 'U'),
  };

  if (byStatus.A.length > 0) {
    parts.push(`**Added (${byStatus.A.length}):**`);
    for (const f of byStatus.A) {
      parts.push(`  ${f.path}${formatCounts(f.additions, f.deletions)}`);
    }
    parts.push('');
  }

  if (byStatus.M.length > 0) {
    parts.push(`**Modified (${byStatus.M.length}):**`);
    for (const f of byStatus.M) {
      parts.push(`  ${f.path}${formatCounts(f.additions, f.deletions)}`);
    }
    parts.push('');
  }

  if (byStatus.D.length > 0) {
    parts.push(`**Deleted (${byStatus.D.length}):**`);
    for (const f of byStatus.D) {
      parts.push(`  ${f.path}`);
    }
    parts.push('');
  }

  if (byStatus.R.length > 0) {
    parts.push(`**Renamed (${byStatus.R.length}):**`);
    for (const f of byStatus.R) {
      parts.push(`  ${f.oldPath ?? '?'} → ${f.path}`);
    }
    parts.push('');
  }

  if (result.totalAdditions > 0 || result.totalDeletions > 0) {
    parts.push(`**Summary:** +${result.totalAdditions} −${result.totalDeletions} lines`);
  }

  if (input.include_diff) {
    const diff = getFullDiff(config.root, baseRef);
    // NOTE: intentionally not yet scoped by file_pattern — see Bug 3 fix in v0.5.2.
    if (diff) {
      parts.push('\n---\n');
      parts.push('```diff');
      parts.push(diff);
      parts.push('```');
    }
  }

  return parts.join('\n');
}

function matchesGlob(filePath: string, pattern: string): boolean {
  const reStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '�')
    .replace(/\*/g, '[^/]*')
    .replace(/�/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${reStr}$`).test(filePath);
}

function formatCounts(additions?: number, deletions?: number): string {
  if (additions === undefined && deletions === undefined) return '';
  const a = additions ?? 0;
  const d = deletions ?? 0;
  if (a === 0 && d === 0) return '';
  return ` (+${a} −${d})`;
}
