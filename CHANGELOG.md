# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

[Unreleased]: https://github.com/Eltortilla1/synapse-code-mcp/compare/v0.3.0...HEAD

---

## [0.3.0] — 2026-07-11

### Added

- **`get_semantic_context` — `output_format` parameter** — add `output_format: "json"` to receive the raw `SemanticContext` object (entry file, dependencies, stats) as structured JSON instead of the default Markdown text. Useful for programmatic post-processing. Default (`"markdown"`) is unchanged.

[0.3.0]: https://github.com/Eltortilla1/synapse-code-mcp/compare/v0.2.0...v0.3.0

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

[0.2.0]: https://github.com/Eltortilla1/synapse-code-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Eltortilla1/synapse-code-mcp/releases/tag/v0.1.0
