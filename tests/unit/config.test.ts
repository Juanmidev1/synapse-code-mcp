import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadConfig } from '../../src/config/index.js';
import { ConfigError } from '../../src/utils/errors.js';

const FIXTURE_ROOT = path.resolve('tests/fixtures/simple-ts-project');

describe('loadConfig', () => {
  it('loads config with defaults when no options provided', () => {
    const config = loadConfig({ root: FIXTURE_ROOT });
    expect(config.root).toBe(FIXTURE_ROOT);
    expect(config.maxFileSize).toBe(512 * 1024);
    expect(config.maxSearchResults).toBe(50);
    expect(config.maxTreeDepth).toBe(5);
    expect(config.maxDependencyDepth).toBe(2);
    expect(config.logLevel).toBe('info');
    expect(config.serverName).toBe('synapse-code-mcp');
    expect(config.cacheEnabled).toBe(true);
  });

  it('cacheEnabled can be overridden to false', () => {
    const config = loadConfig({ root: FIXTURE_ROOT, cacheEnabled: false });
    expect(config.cacheEnabled).toBe(false);
  });

  it('CLI args override defaults', () => {
    const config = loadConfig({
      root: FIXTURE_ROOT,
      maxFileSize: 1024,
      maxSearchResults: 10,
      maxTreeDepth: 3,
      maxDependencyDepth: 1,
      logLevel: 'debug',
    });
    expect(config.maxFileSize).toBe(1024);
    expect(config.maxSearchResults).toBe(10);
    expect(config.maxTreeDepth).toBe(3);
    expect(config.maxDependencyDepth).toBe(1);
    expect(config.logLevel).toBe('debug');
  });

  it('resolves root to absolute path', () => {
    const config = loadConfig({ root: FIXTURE_ROOT });
    expect(path.isAbsolute(config.root)).toBe(true);
  });

  it('throws ConfigError when root does not exist', () => {
    expect(() => loadConfig({ root: '/nonexistent/path/xyz' })).toThrow(ConfigError);
  });

  it('serverVersion is a non-empty string', () => {
    const config = loadConfig({ root: FIXTURE_ROOT });
    expect(typeof config.serverVersion).toBe('string');
    expect(config.serverVersion.length).toBeGreaterThan(0);
  });

  it('extraIgnorePatterns defaults to empty array', () => {
    const config = loadConfig({ root: FIXTURE_ROOT });
    expect(config.extraIgnorePatterns).toEqual([]);
  });

  it('reads synapse.config.json from project root when present', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const tmpRoot = path.join(os.default.tmpdir(), 'synapse-config-test');
    fs.default.mkdirSync(tmpRoot, { recursive: true });
    fs.default.writeFileSync(
      path.join(tmpRoot, 'synapse.config.json'),
      JSON.stringify({ maxSearchResults: 99 }),
    );
    try {
      const config = loadConfig({ root: tmpRoot });
      expect(config.maxSearchResults).toBe(99);
    } finally {
      fs.default.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
