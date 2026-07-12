# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

[Unreleased]: https://github.com/Juanmidev1/synapse-code-mcp/compare/v0.5.4...HEAD

---

## [0.5.4] — 2026-07-12

### Fixed

- **`ts-morph` never actually loaded in the published package** — `outline-extractor.ts` and `ts-resolver.ts` called bare `require('ts-morph')` inside a try/catch, which silently fails with `ReferenceError: require is not defined` in a real Node ESM build (this package ships `"type": "module"`). Both call sites were catching that error every single time and falling back to a much weaker regex-based analysis, meaning `get_semantic_context`'s dependency-graph auto-bundling always reported zero local dependencies, and `get_project_index`/`get_semantic_context outline_only` never returned interface properties, method parameter types, or other ts-morph-only detail — in every released version through v0.5.3. Fixed by loading `ts-morph` via `createRequire(import.meta.url)`, Node's documented mechanism for synchronously loading a CommonJS package from ESM. A new `tests/build/` suite now imports directly from the compiled `dist/` output (not `src/`) to catch this class of source-vs-build divergence in the future, and CI now runs the build before tests.

[0.5.4]: https://github.com/Juanmidev1/synapse-code-mcp/compare/v0.5.3...v0.5.4

---

## [0.5.3] — 2026-07-12

### Security

- **Git argument injection via `base_ref`** — a `base_ref` value starting with `-` (e.g. `--output=<path>`) was passed as a bare positional argument to `git diff`, letting git itself interpret it as a flag instead of a ref. This could overwrite an arbitrary file the server process could write to. `base_ref` is now rejected outright when it starts with `-`, since no valid git ref name can ever start with that character.

[0.5.3]: https://github.com/Juanmidev1/synapse-code-mcp/compare/v0.5.2...v0.5.3

---

## [0.5.2] — 2026-07-12

### Fixed

- `get_changed_files` now scopes the full diff (`include_diff: true`) to the files matched by `file_pattern`, instead of dumping the diff for every changed file regardless of the filter.
- `search_codebase` now surfaces an invalid regex as a clear `INVALID_REGEX` error instead of silently returning "No matches found," which could previously be mistaken for the pattern genuinely not existing in the codebase.
- `get_project_tree` now returns a typed `FILE_NOT_FOUND` error for a nonexistent subdirectory instead of leaking a raw Node `ENOENT` message with the full absolute path.
- The CLI `-V`/`--version` flag and the MCP `initialize` handshake's `serverInfo.version` now correctly report the installed package version. Previously both fell back to a hardcoded `0.1.0` under a global npm install, because version resolution followed the `bin` symlink's directory instead of its real target.

[0.5.2]: https://github.com/Juanmidev1/synapse-code-mcp/compare/v0.5.1...v0.5.2

---

## [0.5.1] — 2026-07-12

### Security

- **Command injection in `get_changed_files`** — `base_ref` was interpolated unescaped into a shell command, allowing arbitrary command execution on the host running Synapse. Git commands now run via `execFileSync` with argument arrays, never through a shell.
- **Path traversal via `file_pattern`** — `search_codebase` and `get_project_index` did not validate that `file_pattern` stayed inside the project root, allowing a crafted pattern (e.g. `../../../../etc/passwd`) to read or index files outside the served directory. Both tools now validate `file_pattern` against the project root before it reaches the glob/search engine.
- Removed an unused, independently vulnerable synchronous search function in the ripgrep adapter (dead code, never called in production, but relied on unescaped shell string construction).

[0.5.1]: https://github.com/Juanmidev1/synapse-code-mcp/compare/v0.5.0...v0.5.1

---

## [0.5.0] — 2026-07-12

### Added

- **Incremental index cache** — `get_project_index` and `get_semantic_context` now cache each file's extracted symbol outline on disk (`.synapse-cache/index.json`), keyed by content hash with a fast mtime/size pre-check. Unchanged files skip re-extraction entirely, making repeated calls on large projects significantly faster. Enabled by default; disable per-project via `"cacheEnabled": false` in `synapse.config.json`.

[0.5.0]: https://github.com/Juanmidev1/synapse-code-mcp/compare/v0.4.0...v0.5.0

---

## [0.4.0] — 2026-07-11

### Added

- **Path alias resolution in dependency graph** — `get_semantic_context` and `get_project_index` now follow `tsconfig.json` `compilerOptions.paths` aliases (e.g. `@/utils/foo`, `@components/Bar`) when building the dependency graph. Previously, non-relative imports were silently skipped even when a `tsconfig.json` was present and ts-morph could resolve them. Projects without a `tsconfig.json` continue to use relative-only resolution.

### Fixed

- `tests/fixtures` excluded from TypeScript compilation and ESLint to prevent false errors from fixture files that intentionally lack the project's `tsconfig.json` settings.

[0.4.0]: https://github.com/Juanmidev1/synapse-code-mcp/compare/v0.3.0...v0.4.0

---

## [0.3.0] — 2026-07-11

### Added

- **`get_semantic_context` — `output_format` parameter** — add `output_format: "json"` to receive the raw `SemanticContext` object (entry file, dependencies, stats) as structured JSON instead of the default Markdown text. Useful for programmatic post-processing. Default (`"markdown"`) is unchanged.

[0.3.0]: https://github.com/Juanmidev1/synapse-code-mcp/compare/v0.2.0...v0.3.0

---

## [0.2.0] — 2026-06-28

### Added

- **`get_project_index` — `output_format` parameter** — add `output_format: "json"` to receive the raw symbol data as a structured JSON object instead of the default Markdown text. Useful for programmatic post-processing (dashboards, complexity metrics, tooling). Default (`"markdown"`) is unchanged.

## [0.1.0] — 2026-06-01

### Added

- **`get_project_index`** — returns a compressed semantic map of the entire project: all exported functions, classes, interfaces, and types with their signatures. Enforced to ≤ 40% of raw source size via automated benchmark budget.
- **`get_semantic_context`** — returns a file's full source alongside its local dependency graph (configurable import depth, default 2). Supports `outline_only` mode (signatures only, ≤ 50% of full content).
- **`get_changed_files`** — lists files changed since a git ref, grouped by status (Added / Modified / Deleted / Renamed), with optional unified diff.
- **`get_project_tree`** — structured directory view respecting `.gitignore` rules, with configurable max depth.
- **`search_codebase`** — fast text/regex search across the project using ripgrep when available, with a pure Node.js fallback.
- TypeScript / JavaScript deep analysis via [ts-morph](https://ts-morph.com) (compiler API): full signatures and dependency graph traversal for relative imports.
- Regex-based symbol extraction for Python, Go, Rust, and other languages (names only; no dependency graph).
- Path traversal protection: every file read goes through `resolveAndValidate()`, which rejects paths escaping the project root.
- Binary file detection and per-file size cap (default 512 KB).
- Per-project config file (`synapse.config.json`) for overriding defaults.
- CLI flags: `--root`, `--max-file-size`, `--max-search-results`, `--max-tree-depth`, `--max-dependency-depth`, `--log-level`.
- Automated benchmark suite (`tests/performance/`) with time and heap budgets enforced in CI.
- Structured logging via [pino](https://getpino.io).

[0.2.0]: https://github.com/Juanmidev1/synapse-code-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Juanmidev1/synapse-code-mcp/releases/tag/v0.1.0
