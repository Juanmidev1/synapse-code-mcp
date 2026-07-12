import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { diffStat, getFullDiff } from '../../src/core/git/git-adapter.js';

// Runs against a real temp git repo and the real execFileSync-backed adapter
// (no mocks) to prove shell metacharacters in baseRef cannot be interpreted
// by a shell — execFileSync passes args directly to execve(), never through
// /bin/sh, unlike the execSync(string) it replaces.

describe('git-adapter — command injection safety', () => {
  let tmpRoot: string;
  let markerFile: string;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-git-inject-test-'));
    markerFile = path.join(os.tmpdir(), `synapse-inject-proof-${process.pid}-${Date.now()}.txt`);

    execFileSync('git', ['-C', tmpRoot, 'init'], { stdio: 'ignore' });
    execFileSync('git', ['-C', tmpRoot, 'config', 'user.email', 'test@test.com'], { stdio: 'ignore' });
    execFileSync('git', ['-C', tmpRoot, 'config', 'user.name', 'test'], { stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpRoot, 'a.txt'), 'hello');
    execFileSync('git', ['-C', tmpRoot, 'add', '.'], { stdio: 'ignore' });
    execFileSync('git', ['-C', tmpRoot, 'commit', '-m', 'init'], { stdio: 'ignore' });
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    try {
      fs.unlinkSync(markerFile);
    } catch {
      /* not created — expected */
    }
  });

  it('does not execute a shell payload embedded in diffStat baseRef', () => {
    const payload = `HEAD; touch ${markerFile} #`;
    expect(() => diffStat(tmpRoot, payload)).toThrow();
    expect(fs.existsSync(markerFile)).toBe(false);
  });

  it('does not execute a shell payload embedded in getFullDiff baseRef', () => {
    const payload = `HEAD\`touch ${markerFile}\``;
    expect(() => getFullDiff(tmpRoot, payload)).toThrow();
    expect(fs.existsSync(markerFile)).toBe(false);
  });

  it('does not execute a $() command substitution payload', () => {
    const payload = `HEAD$(touch ${markerFile})`;
    expect(() => diffStat(tmpRoot, payload)).toThrow();
    expect(fs.existsSync(markerFile)).toBe(false);
  });
});

describe('git-adapter — argument (flag) injection safety', () => {
  let tmpRoot: string;
  let targetFile: string;
  const originalContent = 'ORIGINAL CONTENT - DO NOT OVERWRITE';

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-git-flag-inject-test-'));
    targetFile = path.join(os.tmpdir(), `synapse-flag-inject-target-${process.pid}-${Date.now()}.txt`);
    fs.writeFileSync(targetFile, originalContent);

    execFileSync('git', ['-C', tmpRoot, 'init'], { stdio: 'ignore' });
    execFileSync('git', ['-C', tmpRoot, 'config', 'user.email', 'test@test.com'], { stdio: 'ignore' });
    execFileSync('git', ['-C', tmpRoot, 'config', 'user.name', 'test'], { stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpRoot, 'a.txt'), 'hello');
    execFileSync('git', ['-C', tmpRoot, 'add', '.'], { stdio: 'ignore' });
    execFileSync('git', ['-C', tmpRoot, 'commit', '-m', 'init'], { stdio: 'ignore' });
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(targetFile, { force: true });
  });

  it('does not let a "--output=<file>" base_ref overwrite an existing file (diffStat)', () => {
    expect(() => diffStat(tmpRoot, `--output=${targetFile}`)).toThrow();
    expect(fs.readFileSync(targetFile, 'utf-8')).toBe(originalContent);
  });

  it('does not let a "--output=<file>" base_ref overwrite an existing file (getFullDiff)', () => {
    expect(() => getFullDiff(tmpRoot, `--output=${targetFile}`)).toThrow();
    expect(fs.readFileSync(targetFile, 'utf-8')).toBe(originalContent);
  });
});
