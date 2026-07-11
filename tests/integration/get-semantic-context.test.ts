import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { handleGetSemanticContext } from '../../src/tools/get-semantic-context.js';
import { loadConfig } from '../../src/config/index.js';
import { PathEscapeError, FileNotFoundError } from '../../src/utils/errors.js';
import type { SemanticContext } from '../../src/types/context.js';

const FIXTURE_ROOT = path.resolve('tests/fixtures/integration-project');
const config = loadConfig({ root: FIXTURE_ROOT });

/**
 * Dependency chain in the fixture:
 *   app.ts  ──imports──>  user-service.ts  ──imports──>  user.ts
 *
 * This tests the core Synapse guarantee: ask for app.ts and get
 * the full transitive context without having to name the deps explicitly.
 */
describe('Integration: get_semantic_context — dependency auto-bundling', () => {
  it('bundles direct dependency (depth 2): app.ts pulls in user-service.ts', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/app.ts', depth: 2 },
      config,
    );

    // Entry file is present
    expect(result).toContain('## Entry File: src/app.ts');
    expect(result).toContain('UserService');

    // Direct dependency is auto-included
    expect(result).toContain('user-service.ts');
    expect(result).toContain('class UserService');
  });

  it('bundles transitive dependency (depth 3): app.ts pulls in user-service.ts AND user.ts', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/app.ts', depth: 3 },
      config,
    );

    // Entry + depth-1 dep
    expect(result).toContain('user-service.ts');

    // Transitive dep at depth 2 — the core value prop of the tool
    expect(result).toContain('user.ts');
    expect(result).toContain('interface User');
    expect(result).toContain('createUser');
  });

  it('depth 0 returns only the entry file — no Local Dependencies section', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/app.ts', depth: 0 },
      config,
    );

    expect(result).toContain('## Entry File: src/app.ts');
    expect(result).not.toContain('## Local Dependencies');
    expect(result).not.toContain('user-service.ts');
  });

  it('leaf node (user.ts) has no local dependencies section', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/models/user.ts', depth: 2 },
      config,
    );

    expect(result).toContain('## Entry File: src/models/user.ts');
    expect(result).toContain('interface User');
    expect(result).not.toContain('## Local Dependencies');
  });

  it('each dependency block shows its depth and importer', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/app.ts', depth: 3 },
      config,
    );

    // Format: "### <path> (depth: N, imported by: <importer>)"
    expect(result).toMatch(/depth:\s*1/);
    expect(result).toMatch(/imported by:/);
  });

  it('output includes language and line count stats for entry file', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/app.ts', depth: 2 },
      config,
    );

    expect(result).toMatch(/Language:\s*typescript/);
    expect(result).toMatch(/Lines:\s*\d+/);
    expect(result).toMatch(/Total lines across context:\s*\d+/);
  });

  it('content of each dependency is wrapped in a fenced code block', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/app.ts', depth: 2 },
      config,
    );

    // At least two fenced blocks: entry + user-service
    const fenceCount = (result.match(/```typescript/g) ?? []).length;
    expect(fenceCount).toBeGreaterThanOrEqual(2);
  });

  it('does not bundle unreachable files — format.ts is NOT in app.ts context', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/app.ts', depth: 4 },
      config,
    );

    // format.ts is in the project but not imported by app.ts chain
    expect(result).not.toContain('format.ts');
    expect(result).not.toContain('formatName');
  });

  it('analyzing user-service.ts directly shows user.ts as its direct dep', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/services/user-service.ts', depth: 2 },
      config,
    );

    expect(result).toContain('## Entry File: src/services/user-service.ts');
    expect(result).toContain('user.ts');
    expect(result).toContain('interface User');
  });

  it('lists external module imports in External Modules section', async () => {
    // user-service.ts has no external imports; create a test via app.ts which
    // doesn't either — we verify External Modules is absent when there are none
    const result = await handleGetSemanticContext(
      { file_path: 'src/app.ts', depth: 2 },
      config,
    );

    // No external deps in fixture → section should not appear
    expect(result).not.toContain('## External Modules');
  });
});

describe('Integration: get_semantic_context — outline_only mode', () => {
  it('outline_only=true shows class signature for UserService', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/services/user-service.ts', depth: 0, outline_only: true },
      config,
    );

    expect(result).toContain('[outline mode]');
    expect(result).toContain('UserService (class)');
  });

  it('outline_only=true does NOT contain function bodies', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/services/user-service.ts', depth: 0, outline_only: true },
      config,
    );

    // Implementation bodies must not be present
    expect(result).not.toContain('this.users.push');
    expect(result).not.toContain('return [...this.users]');
  });

  it('outline_only=true shows method signatures', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/services/user-service.ts', depth: 0, outline_only: true },
      config,
    );

    // Method signatures should appear
    expect(result).toMatch(/add\(/);
    expect(result).toMatch(/getAll\(/);
    expect(result).toMatch(/findById\(/);
  });

  it('outline_only=true with depth=2 shows dep outlines not full content', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/app.ts', depth: 2, outline_only: true },
      config,
    );

    // user-service.ts should appear as an outlined dep, not raw code
    expect(result).toContain('user-service.ts');
    expect(result).not.toContain('this.users.push');
  });

  it('outline_only=true for leaf node shows interface properties', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/models/user.ts', depth: 0, outline_only: true },
      config,
    );

    expect(result).toContain('User (interface)');
    // Properties of the User interface
    expect(result).toMatch(/id/);
    expect(result).toMatch(/name/);
  });

  it('outline_only=false (default) still returns full content', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/models/user.ts', depth: 0 },
      config,
    );

    expect(result).not.toContain('[outline mode]');
    expect(result).toContain('```typescript');
    expect(result).toContain('interface User');
  });
});

describe('Integration: get_semantic_context — security and error handling', () => {
  it('throws PathEscapeError for path traversal attempt (../../etc/passwd)', async () => {
    await expect(
      handleGetSemanticContext({ file_path: '../../etc/passwd' }, config),
    ).rejects.toThrow(PathEscapeError);
  });

  it('throws PathEscapeError for absolute path outside project root', async () => {
    await expect(
      handleGetSemanticContext({ file_path: '/etc/hostname' }, config),
    ).rejects.toThrow(PathEscapeError);
  });

  it('throws FileNotFoundError for a non-existent relative path', async () => {
    await expect(
      handleGetSemanticContext({ file_path: 'src/ghost.ts' }, config),
    ).rejects.toThrow(FileNotFoundError);
  });

  it('path traversal that stays inside root is allowed', async () => {
    // src/services/../models/user.ts resolves to src/models/user.ts — still inside root
    const result = await handleGetSemanticContext(
      { file_path: 'src/services/../models/user.ts', depth: 0 },
      config,
    );
    expect(result).toContain('interface User');
  });
});

describe('Integration: get_semantic_context — output_format', () => {
  it('returns valid JSON when output_format is "json"', async () => {
    const result = await handleGetSemanticContext(
      { file_path: 'src/app.ts', output_format: 'json' },
      config,
    );
    const parsed = JSON.parse(result) as SemanticContext;
    expect(parsed).toHaveProperty('entryFile');
    expect(parsed).toHaveProperty('dependencies');
    expect(parsed).toHaveProperty('stats');
    expect(parsed.entryFile.relativePath).toBe('src/app.ts');
  });

  it('returns markdown by default when output_format is omitted', async () => {
    const result = await handleGetSemanticContext({ file_path: 'src/app.ts' }, config);
    expect(result).toMatch(/^#\s+/m);
    expect(() => { JSON.parse(result); }).toThrow();
  });
});
