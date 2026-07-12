import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  resolveAndValidate,
  toRelative,
  detectLanguage,
  validateGlobPattern,
} from '../../src/utils/path-utils.js';
import { PathEscapeError } from '../../src/utils/errors.js';

const ROOT = '/tmp/synapse-test-root';

describe('resolveAndValidate', () => {
  it('returns absolute path for valid relative path', () => {
    const result = resolveAndValidate(ROOT, 'src/index.ts');
    expect(result).toBe(path.join(ROOT, 'src/index.ts'));
  });

  it('accepts path pointing exactly to root', () => {
    const result = resolveAndValidate(ROOT, '.');
    expect(result).toBe(path.resolve(ROOT));
  });

  it('throws PathEscapeError for path traversal with ..', () => {
    expect(() => resolveAndValidate(ROOT, '../etc/passwd')).toThrow(PathEscapeError);
  });

  it('throws PathEscapeError for absolute path outside root', () => {
    expect(() => resolveAndValidate(ROOT, '/etc/passwd')).toThrow(PathEscapeError);
  });

  it('throws PathEscapeError for deeply nested traversal', () => {
    expect(() => resolveAndValidate(ROOT, 'src/../../outside')).toThrow(PathEscapeError);
  });

  it('does not throw for deep nested path inside root', () => {
    const result = resolveAndValidate(ROOT, 'a/b/c/d/file.ts');
    expect(result).toContain(ROOT);
  });

  it('throws PathEscapeError for path containing a null byte', () => {
    expect(() => resolveAndValidate(ROOT, 'src/\0/file.ts')).toThrow(PathEscapeError);
  });

  // URL-encoded traversal (%2e%2e%2f) is NOT a threat for Synapse:
  // path.resolve() treats percent-encoded strings as literal filenames (no
  // URL-decoding layer exists — Synapse communicates over stdio JSON-RPC, not HTTP).
  // path.resolve('/root', '%2e%2e%2fetc%2fpasswd') → '/root/%2e%2e%2fetc%2fpasswd'
  // No test needed; documented here to avoid future confusion.
});

// ─── Symlink escape tests (requires real filesystem, uses a temp dir) ─────────

describe('resolveAndValidate — symlink escape', () => {
  let tmpRoot: string;
  let outsideFile: string;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-symlink-test-'));
    outsideFile = path.join(os.tmpdir(), 'synapse-outside-target.txt');
    fs.writeFileSync(outsideFile, 'secret');
    fs.symlinkSync(outsideFile, path.join(tmpRoot, 'evil-link'));
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    try { fs.unlinkSync(outsideFile); } catch { /* ignore */ }
  });

  it('throws PathEscapeError for a symlink inside root pointing outside', () => {
    expect(() => resolveAndValidate(tmpRoot, 'evil-link')).toThrow(PathEscapeError);
  });

  it('does not throw for a regular file inside root', () => {
    const regularFile = path.join(tmpRoot, 'normal.ts');
    fs.writeFileSync(regularFile, 'export const x = 1;');
    expect(() => resolveAndValidate(tmpRoot, 'normal.ts')).not.toThrow();
  });

  it('returns ENOENT path (no throw) for a non-existent path inside root', () => {
    const result = resolveAndValidate(tmpRoot, 'does-not-exist.ts');
    expect(result).toContain(tmpRoot);
  });
});

describe('validateGlobPattern', () => {
  it('throws PathEscapeError for a pattern escaping root with ..', () => {
    expect(() => validateGlobPattern(ROOT, '../etc/passwd')).toThrow(PathEscapeError);
  });

  it('throws PathEscapeError for a deeply nested traversal glob', () => {
    expect(() => validateGlobPattern(ROOT, '../../../../etc/*')).toThrow(PathEscapeError);
  });

  it('throws PathEscapeError for traversal combined with a wildcard tail', () => {
    expect(() => validateGlobPattern(ROOT, '../outside/**/*.ts')).toThrow(PathEscapeError);
  });

  it('throws PathEscapeError for a pattern containing a null byte', () => {
    expect(() => validateGlobPattern(ROOT, 'src/\0/*.ts')).toThrow(PathEscapeError);
  });

  it('does not throw for a pattern scoped inside root', () => {
    expect(() => validateGlobPattern(ROOT, 'src/**/*.ts')).not.toThrow();
  });

  it('does not throw for a simple extension glob', () => {
    expect(() => validateGlobPattern(ROOT, '*.md')).not.toThrow();
  });

  it('does not throw for "."', () => {
    expect(() => validateGlobPattern(ROOT, '.')).not.toThrow();
  });
});

describe('toRelative', () => {
  it('converts absolute path to relative path from root', () => {
    const abs = path.join(ROOT, 'src', 'server.ts');
    expect(toRelative(ROOT, abs)).toBe(path.join('src', 'server.ts'));
  });

  it('returns empty string for path equal to root', () => {
    expect(toRelative(ROOT, ROOT)).toBe('');
  });
});

describe('detectLanguage', () => {
  const cases: Array<[string, string]> = [
    ['file.ts', 'typescript'],
    ['component.tsx', 'typescript'],
    ['app.js', 'javascript'],
    ['app.jsx', 'javascript'],
    ['app.mjs', 'javascript'],
    ['main.py', 'python'],
    ['lib.rb', 'ruby'],
    ['main.go', 'go'],
    ['lib.rs', 'rust'],
    ['App.java', 'java'],
    ['Main.kt', 'kotlin'],
    ['App.cs', 'csharp'],
    ['main.cpp', 'cpp'],
    ['main.c', 'c'],
    ['header.h', 'c'],
    ['header.hpp', 'cpp'],
    ['index.php', 'php'],
    ['app.swift', 'swift'],
    ['README.md', 'markdown'],
    ['config.json', 'json'],
    ['config.yaml', 'yaml'],
    ['config.yml', 'yaml'],
    ['Cargo.toml', 'toml'],
    ['script.sh', 'shell'],
    ['script.bash', 'shell'],
    ['script.zsh', 'shell'],
    ['index.html', 'html'],
    ['styles.css', 'css'],
    ['styles.scss', 'scss'],
    ['query.sql', 'sql'],
    ['Makefile', 'text'],
    ['unknown.xyz', 'text'],
  ];

  for (const [filename, expected] of cases) {
    it(`detects "${filename}" as "${expected}"`, () => {
      expect(detectLanguage(filename)).toBe(expected);
    });
  }
});
