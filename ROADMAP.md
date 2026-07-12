# Roadmap

This document tracks what is actively being worked on, what is planned for future releases, and what ideas are open for community contributions.

For a detailed history of shipped changes, see [CHANGELOG.md](CHANGELOG.md).

---

## In progress

Nothing active right now. Check the [open issues](https://github.com/Juanmidev1/synapse-code-mcp/issues) for work that may be under way.

---

## Planned

### Python support via tree-sitter (AST-based)

The current Python analysis uses regex heuristics to extract function and class names. The plan is to replace this with a proper [tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar so that `get_semantic_context` and `get_project_index` can return full signatures, decorators, and type annotations — the same depth of analysis currently available for TypeScript.

### Multi-root support

Running one Synapse instance per project works but is wasteful when an AI assistant needs to reason across multiple repositories simultaneously. The plan is to allow a single server instance to serve multiple roots, each scoped and isolated, addressable via a `root` parameter on each tool call.

---

## Open ideas / help wanted

These are things the maintainer would happily accept as PRs but does not have time to drive. If you want to pick one up, open an issue to discuss before writing code — see [CONTRIBUTING.md](.github/CONTRIBUTING.md#5-proposing-a-large-change).

- **Go and Rust support via tree-sitter** — extend the AST-based analysis beyond Python to Go and Rust, so dependency graph traversal and `outline_only` work for those languages too.
- **Watch mode / live reload** — re-index only changed files when the filesystem changes (using `chokidar` or native fs events), so the index stays warm without restarting the server.
- **`search_codebase` with semantic / embedding-based search** — complement the current regex/ripgrep search with a local embedding model for "find code that does X" queries.
- **VSCode / Cursor extension** — a thin extension that auto-configures Synapse for the open workspace, so users don't need to edit JSON config files manually.
