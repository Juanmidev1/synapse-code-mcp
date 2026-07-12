import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { isGitRepo, diffStat, getFullDiff } from '../../src/core/git/git-adapter.js';
import { GitError } from '../../src/utils/errors.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockExec = vi.mocked(execFileSync);

afterEach(() => {
  vi.clearAllMocks();
});

// ── isGitRepo ────────────────────────────────────────────────────────────────

describe('isGitRepo', () => {
  it('returns true when git rev-parse succeeds', () => {
    mockExec.mockReturnValue('.git\n');
    expect(isGitRepo('/some/project')).toBe(true);
  });

  it('returns false when execSync throws (not a git repo)', () => {
    mockExec.mockImplementation(() => {
      throw new Error('fatal: not a git repository');
    });
    expect(isGitRepo('/not/a/repo')).toBe(false);
  });
});

// ── diffStat ─────────────────────────────────────────────────────────────────

describe('diffStat', () => {
  it('parses modified, added, and deleted files from --name-status output', () => {
    mockExec
      .mockReturnValueOnce('.git\n')                              // isGitRepo check
      .mockReturnValueOnce('M\tsrc/server.ts\nA\tsrc/tools/new.ts\nD\tsrc/old.ts\n')  // --name-status
      .mockReturnValueOnce('');                                   // --stat (empty)

    const result = diffStat('/project', 'HEAD~1');

    expect(result.baseRef).toBe('HEAD~1');
    expect(result.changedFiles).toHaveLength(3);
    expect(result.changedFiles.find((f) => f.path === 'src/server.ts')?.status).toBe('M');
    expect(result.changedFiles.find((f) => f.path === 'src/tools/new.ts')?.status).toBe('A');
    expect(result.changedFiles.find((f) => f.path === 'src/old.ts')?.status).toBe('D');
  });

  it('parses renamed files (R status with old and new path)', () => {
    mockExec
      .mockReturnValueOnce('.git\n')
      .mockReturnValueOnce('R100\tsrc/foo.ts\tsrc/bar.ts\n')
      .mockReturnValueOnce('');

    const result = diffStat('/project', 'HEAD~1');

    const renamed = result.changedFiles[0];
    expect(renamed?.status).toBe('R');
    expect(renamed?.path).toBe('src/bar.ts');
    expect(renamed?.oldPath).toBe('src/foo.ts');
  });

  it('throws GitError when not a git repository', () => {
    mockExec.mockImplementation(() => {
      throw new Error('fatal: not a git repository');
    });

    expect(() => diffStat('/not/a/repo', 'HEAD~1')).toThrow(GitError);
  });

  it('throws GitError for an invalid ref', () => {
    mockExec
      .mockReturnValueOnce(Buffer.from('.git\n'))  // isGitRepo succeeds
      .mockImplementation(() => {
        throw new Error('fatal: bad object HEAD~999');
      });

    expect(() => diffStat('/project', 'HEAD~999')).toThrow(GitError);
    expect(() => diffStat('/project', 'HEAD~999')).toThrow(/git/i);
  });

  it('returns zero totals when no changed files', () => {
    mockExec
      .mockReturnValueOnce('.git\n')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('');

    const result = diffStat('/project', 'HEAD~1');
    expect(result.changedFiles).toHaveLength(0);
    expect(result.totalAdditions).toBe(0);
    expect(result.totalDeletions).toBe(0);
  });
});

// ── getFullDiff ───────────────────────────────────────────────────────────────

describe('getFullDiff', () => {
  it('returns raw diff output', () => {
    mockExec
      .mockReturnValueOnce('.git\n')
      .mockReturnValueOnce('diff --git a/src/foo.ts b/src/foo.ts\n+added line\n');

    const diff = getFullDiff('/project', 'HEAD~1');
    expect(diff).toContain('+added line');
  });

  it('truncates output exceeding 50 KB', () => {
    mockExec
      .mockReturnValueOnce('.git\n')
      .mockReturnValueOnce('x'.repeat(60_000));

    const diff = getFullDiff('/project', 'HEAD~1');
    expect(diff).toContain('truncated');
    expect(diff.length).toBeLessThan(60_000);
  });

  it('returns empty string when there is no diff', () => {
    mockExec
      .mockReturnValueOnce('.git\n')
      .mockReturnValueOnce('');

    const diff = getFullDiff('/project', 'HEAD~1');
    expect(diff).toBe('');
  });
});

// ── Argument (flag) injection safety ───────────────────────────────────────────

describe('git ref flag-injection safety', () => {
  it('diffStat rejects a base_ref starting with "-" without spawning a process', () => {
    expect(() => diffStat('/project', '--output=/tmp/pwned.txt')).toThrow(GitError);
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('getFullDiff rejects a base_ref starting with "-" without spawning a process', () => {
    expect(() => getFullDiff('/project', '--upload-pack=/bin/sh')).toThrow(GitError);
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('rejects a single-dash flag-like base_ref', () => {
    expect(() => diffStat('/project', '-x')).toThrow(GitError);
    expect(mockExec).not.toHaveBeenCalled();
  });
});
