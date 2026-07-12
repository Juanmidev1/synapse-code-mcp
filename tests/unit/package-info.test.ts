import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getPackageVersion } from '../../src/utils/package-info.js';

const originalArgv1 = process.argv[1] ?? '';

afterEach(() => {
  process.argv[1] = originalArgv1;
});

describe('getPackageVersion', () => {
  it('falls back to a default when process.argv[1] is unset', () => {
    process.argv[1] = '';
    expect(getPackageVersion()).toBe('0.1.0');
  });

  it('resolves the real package.json even when argv[1] is a symlink to a different directory', () => {
    // Mirrors a global npm install layout: <prefix>/bin/<name> -> <prefix>/lib/node_modules/<pkg>/dist/index.js
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-pkgver-test-'));
    const libDir = path.join(tmpRoot, 'lib', 'node_modules', 'fake-pkg', 'dist');
    const binDir = path.join(tmpRoot, 'bin');
    fs.mkdirSync(libDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });

    fs.writeFileSync(path.join(libDir, '..', 'package.json'), JSON.stringify({ version: '9.9.9' }));
    fs.writeFileSync(path.join(libDir, 'index.js'), '// fake entry\n');

    const binShim = path.join(binDir, 'fake-pkg');
    fs.symlinkSync(path.join(libDir, 'index.js'), binShim);

    try {
      process.argv[1] = binShim;
      expect(getPackageVersion()).toBe('9.9.9');
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('falls back to default when package.json is missing entirely', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-pkgver-nofile-'));
    const entry = path.join(tmpRoot, 'index.js');
    fs.writeFileSync(entry, '// no package.json one level up\n');

    try {
      process.argv[1] = entry;
      expect(getPackageVersion()).toBe('0.1.0');
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
