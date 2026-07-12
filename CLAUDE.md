# Synapse MCP — Developer Guide

## What this project is
Synapse MCP is a TypeScript MCP (Model Context Protocol) server that exposes a local code repository to AI assistants. It runs as a background process communicating over stdio using JSON-RPC. The AI "pulls" context rather than receiving manual file pastes.

## Repository layout
- `src/index.ts` — CLI entry point, argument parsing, boots the server
- `src/server.ts` — Creates the MCP server, registers all 3 tools
- `src/tools/` — One file per MCP tool (thin handler layer, no business logic)
- `src/core/fs/` — File system operations (tree building, ignore resolution, file reading)
- `src/core/search/` — Search facade + ripgrep/native adapters
- `src/core/analysis/` — Dependency graph analysis (ts-morph for TS, regex heuristics for others)
- `src/config/` — Config loading, merging, Zod validation
- `src/utils/` — Logger (pino), path helpers with path-traversal protection, typed errors
- `src/types/` — Shared TypeScript interfaces
- `tests/unit/` — Unit tests per module
- `tests/fixtures/` — Minimal fake projects used by integration tests

## Essential commands
- `npm run dev` — Run in watch mode (tsx, no compile step needed)
- `npm run build` — Compile TypeScript to `dist/`
- `npm test` — Run all tests with Vitest
- `npm run typecheck` — Type-check without emitting
- `npm run lint` — ESLint check

## Architecture constraints (enforce strictly)
- **Tool handlers** in `src/tools/` MUST NOT contain business logic. They only validate inputs, call `core/` modules, and format the MCP response.
- **`src/core/`** modules MUST NOT import from `src/tools/` or `src/server.ts`.
- Config is passed as a parameter, never imported as a global singleton.
- **`pathUtils.resolveAndValidate()`** must be called before EVERY file system read operation — it throws `PathEscapeError` if the resolved path escapes the project root (path traversal protection).

## Key design decisions
- **stdio transport**: No HTTP. The MCP client spawns Synapse as a child process. Communication is over stdin/stdout using MCP JSON-RPC framing.
- **ripgrep fallback**: `searcher.ts` tries `rg` first (dramatically faster), falls back to pure-Node regex scan. `rg` is never a hard dependency.
- **ts-morph for TS analysis**: Wraps the TypeScript compiler API for deep analysis of TypeScript/JavaScript. Only relative imports (`./foo`, `../bar`) are followed in the dependency graph — path aliases (`@/components/Foo`) are not yet resolved.
- **`ignore` package**: The only reliable JS implementation of git's gitignore spec — handles negation patterns, anchored patterns, nested `.gitignore` files.
- **Depth-limited dependency graph**: `maxDependencyDepth` (default 2) prevents runaway recursion on large monorepos.
- **Immutable config**: Parsed once at startup, passed as frozen object. No hot-reload in v1.

## Adding a new MCP tool
1. Add input/output types to `src/types/`
2. Create `src/tools/my-tool.ts` with a Zod schema + handler function
3. Add business logic under `src/core/` (not in the handler)
4. Register the tool in `src/server.ts` using `this.server.tool(name, schema.shape, handler)`
5. Add unit tests under `tests/unit/` and update fixtures if needed

## Security notes
- `pathUtils.resolveAndValidate(root, userPath)` throws `PathEscapeError` if `userPath` resolves outside the project root.
- Binary file detection in `core/fs/file-reader.ts` prevents reading compiled artifacts.
- `MAX_FILE_SIZE` (default 512KB) is enforced before reading any file.

## Testing with MCP Inspector
```
npm run build
npx @modelcontextprotocol/inspector dist/index.js --root .
```
This opens a browser UI to invoke and inspect all tools interactively.

## Config file (optional)
Drop a `synapse.config.json` at the served project root:
```json
{
  "maxFileSize": 1048576,
  "extraIgnorePatterns": ["*.generated.ts"],
  "maxDependencyDepth": 3
}
```

## Publishing
Before tagging a new version, update ALL of the following — don't just bump the number and tag:
1. `package.json` — bump `version`
2. `CHANGELOG.md` — add a dated `## [X.Y.Z]` entry under `[Unreleased]` describing what shipped, and update the `[Unreleased]` compare link
3. `README.md` — check for anything the release touches: new/changed config options (`## Configuration`), new tools or parameters (`## Tools`), the test-count badge, the `## Project structure` diagram if new files/dirs were added under `src/`
4. `ROADMAP.md` — remove any "Planned" or "In progress" item that the release just shipped
5. `.github/CONTRIBUTING.md` — the `## Project architecture` diagram mirrors README's; keep both in sync
6. `git tag vX.Y.Z && git push origin main && git push origin vX.Y.Z`
7. CI (`release.yml`) runs `npm publish` automatically on tag push

Treat this as a checklist to run through explicitly on every version bump, not just when something happens to be obviously stale — docs drift silently otherwise.
