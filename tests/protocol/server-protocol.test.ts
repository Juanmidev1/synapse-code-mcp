/**
 * Protocol-level tests: exercise the MCP JSON-RPC layer end-to-end using
 * an in-memory transport pair so no stdio / child-process is needed.
 *
 * Pattern:
 *   InMemoryTransport.createLinkedPair() → [serverTransport, clientTransport]
 *   SynapseServer connects to serverTransport
 *   MCP Client connects to clientTransport
 *   Tests drive the client as a real AI assistant would
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SynapseServer } from '../../src/server.js';
import { loadConfig } from '../../src/config/index.js';

const FIXTURE_ROOT = path.resolve('tests/fixtures/integration-project');

type McpTextItem = { type: string; text: string };
const textContent = (r: unknown): McpTextItem[] =>
  (r as { content: McpTextItem[] }).content;
const firstText = (r: unknown): string => textContent(r)[0]!.text;

// ─── shared client / server wired via in-memory transport ───────────────────

let client: Client;

beforeAll(async () => {
  const config = loadConfig({ root: FIXTURE_ROOT });
  const synapseServer = new SynapseServer(config);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await synapseServer.connectTransport(serverTransport);

  client = new Client({ name: 'test-ai-client', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
});

// ─── Tool Registration ───────────────────────────────────────────────────────

describe('Protocol: tool registration', () => {
  it('server exposes exactly 5 tools', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(5);
  });

  it('all five expected tool names are present', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('get_project_tree');
    expect(names).toContain('get_semantic_context');
    expect(names).toContain('search_codebase');
    expect(names).toContain('get_changed_files');
    expect(names).toContain('get_project_index');
  });

  it('each tool has a non-empty description', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(typeof tool.description).toBe('string');
      expect(tool.description!.length).toBeGreaterThan(0);
    }
  });

  it('each tool exposes an inputSchema of type "object"', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  describe('get_project_tree schema', () => {
    it('has no required parameters (all optional)', async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'get_project_tree')!;
      // path, max_depth, show_hidden are all optional
      expect(tool.inputSchema.required ?? []).toHaveLength(0);
    });

    it('declares max_depth, path, and show_hidden as properties', async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'get_project_tree')!;
      const props = Object.keys(tool.inputSchema.properties ?? {});
      expect(props).toContain('max_depth');
      expect(props).toContain('path');
      expect(props).toContain('show_hidden');
    });
  });

  describe('get_semantic_context schema', () => {
    it('requires file_path', async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'get_semantic_context')!;
      expect(tool.inputSchema.required).toContain('file_path');
    });

    it('declares depth as an optional property', async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'get_semantic_context')!;
      const props = Object.keys(tool.inputSchema.properties ?? {});
      expect(props).toContain('depth');
      expect(tool.inputSchema.required ?? []).not.toContain('depth');
    });
  });

  describe('search_codebase schema', () => {
    it('requires query', async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'search_codebase')!;
      expect(tool.inputSchema.required).toContain('query');
    });

    it('declares is_regex and file_pattern as optional', async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'search_codebase')!;
      const props = Object.keys(tool.inputSchema.properties ?? {});
      expect(props).toContain('is_regex');
      expect(props).toContain('file_pattern');
      expect(tool.inputSchema.required ?? []).not.toContain('is_regex');
      expect(tool.inputSchema.required ?? []).not.toContain('file_pattern');
    });
  });
});

// ─── Successful tool calls ───────────────────────────────────────────────────

describe('Protocol: successful tool calls', () => {
  it('get_project_tree returns text content with tree structure', async () => {
    const result = await client.callTool({
      name: 'get_project_tree',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(textContent(result)).toHaveLength(1);
    const text = firstText(result);
    expect(text).toContain('app.ts');
    expect(text).toMatch(/[├└]──/);
  });

  it('get_semantic_context returns text content for a valid file', async () => {
    const result = await client.callTool({
      name: 'get_semantic_context',
      arguments: { file_path: 'src/models/user.ts' },
    });

    expect(result.isError).toBeFalsy();
    const text = firstText(result);
    expect(text).toContain('interface User');
  });

  it('search_codebase returns matches for a known symbol', async () => {
    const result = await client.callTool({
      name: 'search_codebase',
      arguments: { query: 'UserService' },
    });

    expect(result.isError).toBeFalsy();
    const text = firstText(result);
    expect(text).toContain('UserService');
  });
});

// ─── Error handling — server must NOT crash ──────────────────────────────────

describe('Protocol: error handling', () => {
  it('get_semantic_context with a non-existent file → isError=true, clean message', async () => {
    const result = await client.callTool({
      name: 'get_semantic_context',
      arguments: { file_path: 'src/ghost-file.ts' },
    });

    expect(result.isError).toBe(true);
    const text = firstText(result);
    // Must contain a human-readable error, not a raw stack trace
    expect(text).toMatch(/Error/i);
    expect(text).not.toContain('at Object.');   // no stack frames
    expect(text).not.toContain('node_modules'); // no internal paths
  });

  it('get_semantic_context with path traversal → isError=true, PATH_ESCAPE code', async () => {
    const result = await client.callTool({
      name: 'get_semantic_context',
      arguments: { file_path: '../../etc/passwd' },
    });

    expect(result.isError).toBe(true);
    const text = firstText(result);
    expect(text).toContain('PATH_ESCAPE');
  });

  it('get_semantic_context with absolute path outside root → isError=true', async () => {
    const result = await client.callTool({
      name: 'get_semantic_context',
      arguments: { file_path: '/etc/hostname' },
    });

    expect(result.isError).toBe(true);
    const text = firstText(result);
    expect(text).toMatch(/Error/i);
  });

  it('search_codebase with invalid regex → clear error, no crash', async () => {
    // An invalid regex is a client error, not "no matches" — the server must
    // surface it clearly (isError: true) rather than silently returning an
    // empty result set. The important thing: the server does not crash and
    // returns a usable, informative response either way.
    const result = await client.callTool({
      name: 'search_codebase',
      arguments: { query: '[unclosed', is_regex: true },
    });

    expect(result.isError).toBe(true);
    const text = firstText(result);
    expect(text).toMatch(/regex/i);
  });

  it('server does not crash after an error — subsequent call succeeds', async () => {
    // Force an error
    await client.callTool({
      name: 'get_semantic_context',
      arguments: { file_path: 'does-not-exist.ts' },
    });

    // Server must still respond correctly to the next call
    const recovery = await client.callTool({
      name: 'get_project_tree',
      arguments: {},
    });

    expect(recovery.isError).toBeFalsy();
    const text = firstText(recovery);
    expect(text).toContain('app.ts');
  });

  it('missing required argument (query) is rejected with a validation error', async () => {
    // The MCP SDK validates the Zod schema before invoking the handler and
    // returns isError=true with an input validation message — it does not throw.
    const result = await client.callTool({ name: 'search_codebase', arguments: {} });

    expect(result.isError).toBe(true);
    const text = firstText(result);
    expect(text).toMatch(/validation|Required|invalid/i);
  });
});
