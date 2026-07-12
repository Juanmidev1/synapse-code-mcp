import { execFileSync } from 'node:child_process';
import { ChangedFile, GitDiffResult } from '../../types/git.js';
import { GitError } from '../../utils/errors.js';

const DIFF_SIZE_LIMIT = 50 * 1024; // 50 KB

export function isGitRepo(root: string): boolean {
  try {
    execFileSync('git', ['-C', root, 'rev-parse', '--git-dir'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function diffStat(root: string, baseRef: string): GitDiffResult {
  assertGitAvailable(root);

  const nameStatus = runGit(root, ['diff', '--name-status', baseRef]);
  const diffStatOutput = runGit(root, ['diff', '--stat', baseRef]);

  const changedFiles = parseNameStatus(nameStatus);
  mergeStatCounts(changedFiles, diffStatOutput);

  const totalAdditions = changedFiles.reduce((sum, f) => sum + (f.additions ?? 0), 0);
  const totalDeletions = changedFiles.reduce((sum, f) => sum + (f.deletions ?? 0), 0);

  return { baseRef, changedFiles, totalAdditions, totalDeletions };
}

export function getFullDiff(root: string, baseRef: string, filePaths?: string[]): string {
  assertGitAvailable(root);

  const args = ['diff', baseRef, ...(filePaths && filePaths.length > 0 ? ['--', ...filePaths] : [])];
  const output = runGit(root, args);

  if (output.length > DIFF_SIZE_LIMIT) {
    const truncated = output.slice(0, DIFF_SIZE_LIMIT);
    return truncated + `\n\n[... diff truncated at ${DIFF_SIZE_LIMIT} bytes ...]`;
  }

  return output;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function runGit(root: string, args: string[]): string {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      stdio: 'pipe',
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  } catch (err) {
    throw wrapGitError(err);
  }
}

function assertGitAvailable(root: string): void {
  if (!isGitRepo(root)) {
    throw new GitError(`"${root}" is not a git repository.`);
  }
}

function wrapGitError(err: unknown): GitError {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes('ENOENT') || msg.includes('not found')) {
      return new GitError('git is not installed or not found in PATH.');
    }
    if (msg.includes('not a git repository')) {
      return new GitError('The project root is not a git repository.');
    }
    if (msg.includes('bad object') || msg.includes('unknown revision')) {
      return new GitError(`Invalid git ref. Check that the base_ref exists.`);
    }
    return new GitError(`Git command failed: ${msg}`);
  }
  return new GitError('Git command failed with an unknown error.');
}

function parseNameStatus(output: string): ChangedFile[] {
  if (!output) return [];

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): ChangedFile | null => {
      const parts = line.split('\t');
      const rawStatus = parts[0] ?? '';
      const status = rawStatus[0] ?? 'U';

      // Renames and copies: R<score>\t<old>\t<new> or C<score>\t<old>\t<new>
      if ((status === 'R' || status === 'C') && parts.length >= 3) {
        return {
          status,
          path: parts[2] ?? '',
          oldPath: parts[1] ?? '',
        };
      }

      const filePath = parts[1] ?? '';
      if (!filePath) return null;

      const validStatuses = ['M', 'A', 'D', 'R', 'C', 'U'] as const;
      const typedStatus = validStatuses.find((s) => s === status) ?? 'U';

      return { status: typedStatus, path: filePath };
    })
    .filter((f): f is ChangedFile => f !== null);
}

function mergeStatCounts(files: ChangedFile[], statOutput: string): void {
  if (!statOutput) return;

  // Each line looks like: " src/foo.ts | 12 ++-"
  for (const line of statOutput.split('\n')) {
    const match = /^\s+(.+?)\s+\|\s+\d+\s+([+-]+)/.exec(line);
    if (!match) continue;

    const fileName = match[1]?.trim() ?? '';
    const indicators = match[2] ?? '';
    const additions = (indicators.match(/\+/g) ?? []).length;
    const deletions = (indicators.match(/-/g) ?? []).length;

    const file = files.find((f) => f.path.endsWith(fileName) || fileName.endsWith(f.path));
    if (file) {
      file.additions = additions;
      file.deletions = deletions;
    }
  }
}
