/**
 * Integration tests for get_changed_files.
 * Each test creates a real temporary git repository so we exercise the actual
 * git commands (not mocks) and verify the full parsing pipeline.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { handleGetChangedFiles } from '../../src/tools/get-changed-files.js';
import { loadConfig } from '../../src/config/index.js';
import { GitError } from '../../src/utils/errors.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function git(cwd: string, args: string): string {
  return execSync(`git -C "${cwd}" ${args}`, {
    stdio: 'pipe',
    encoding: 'utf-8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com',
           GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' },
  }).trim();
}

function initRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init');
  git(dir, 'config user.email "test@test.com"');
  git(dir, 'config user.name "Test"');
}

// ── Test repo setup ───────────────────────────────────────────────────────────

let repoDir: string;

beforeAll(() => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-git-'));

  initRepo(repoDir);

  // Initial commit
  fs.writeFileSync(path.join(repoDir, 'index.ts'), 'export const version = 1;\n');
  fs.writeFileSync(path.join(repoDir, 'utils.ts'), 'export function noop() {}\n');
  git(repoDir, 'add .');
  git(repoDir, 'commit -m "initial"');

  // Second commit — modify index.ts, add new.ts, delete utils.ts
  fs.writeFileSync(path.join(repoDir, 'index.ts'), 'export const version = 2;\n');
  fs.writeFileSync(path.join(repoDir, 'new.ts'), 'export const added = true;\n');
  fs.unlinkSync(path.join(repoDir, 'utils.ts'));
  git(repoDir, 'add .');
  git(repoDir, 'commit -m "second"');
});

afterAll(() => {
  fs.rmSync(repoDir, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Integration: get_changed_files', () => {
  it('lists modified file', async () => {
    const config = loadConfig({ root: repoDir });
    const result = await handleGetChangedFiles({ base_ref: 'HEAD~1' }, config);
    expect(result).toContain('index.ts');
    expect(result).toMatch(/Modified/i);
  });

  it('lists added file', async () => {
    const config = loadConfig({ root: repoDir });
    const result = await handleGetChangedFiles({ base_ref: 'HEAD~1' }, config);
    expect(result).toContain('new.ts');
    expect(result).toMatch(/Added/i);
  });

  it('lists deleted file', async () => {
    const config = loadConfig({ root: repoDir });
    const result = await handleGetChangedFiles({ base_ref: 'HEAD~1' }, config);
    expect(result).toContain('utils.ts');
    expect(result).toMatch(/Deleted/i);
  });

  it('shows the base_ref in the output', async () => {
    const config = loadConfig({ root: repoDir });
    const result = await handleGetChangedFiles({ base_ref: 'HEAD~1' }, config);
    expect(result).toContain('HEAD~1');
  });

  it('file_pattern filters results — "*.ts" matches all TS files', async () => {
    const config = loadConfig({ root: repoDir });
    const result = await handleGetChangedFiles({ base_ref: 'HEAD~1', file_pattern: '*.ts' }, config);
    expect(result).toContain('index.ts');
    expect(result).toContain('new.ts');
  });

  it('file_pattern="*.js" returns "no changed files" message when nothing matches', async () => {
    const config = loadConfig({ root: repoDir });
    const result = await handleGetChangedFiles({ base_ref: 'HEAD~1', file_pattern: '*.js' }, config);
    expect(result).toMatch(/no changed files/i);
  });

  it('include_diff=true contains diff markers', async () => {
    const config = loadConfig({ root: repoDir });
    const result = await handleGetChangedFiles({ base_ref: 'HEAD~1', include_diff: true }, config);
    expect(result).toContain('```diff');
    expect(result).toMatch(/\+/);
  });

  it('include_diff=true combined with file_pattern scopes the diff body to matched files only', async () => {
    const config = loadConfig({ root: repoDir });
    const result = await handleGetChangedFiles(
      { base_ref: 'HEAD~1', include_diff: true, file_pattern: 'index.ts' },
      config,
    );
    expect(result).toContain('diff --git a/index.ts');
    expect(result).not.toContain('diff --git a/new.ts');
    expect(result).not.toContain('diff --git a/utils.ts');
  });

  it('invalid base_ref throws GitError', async () => {
    const config = loadConfig({ root: repoDir });
    await expect(
      handleGetChangedFiles({ base_ref: 'nonexistent-branch-xyz' }, config),
    ).rejects.toThrow(GitError);
  });

  it('non-git root throws GitError', async () => {
    const config = loadConfig({ root: os.tmpdir() });
    await expect(
      handleGetChangedFiles({ base_ref: 'HEAD~1' }, config),
    ).rejects.toThrow(GitError);
  });
});
