# Contributing to Synapse MCP

Thank you for taking the time to contribute! This guide covers everything you need to go from a fresh clone to an accepted pull request.

---

## Table of contents

1. [Setting up the local environment](#1-setting-up-the-local-environment)
2. [Running the full test suite](#2-running-the-full-test-suite)
3. [Commit conventions](#3-commit-conventions)
4. [What a good pull request looks like](#4-what-a-good-pull-request-looks-like)
5. [Proposing a large change](#5-proposing-a-large-change)
6. [Project architecture](#6-project-architecture)
7. [GitHub labels](#7-github-labels)

---

## 1. Setting up the local environment

```bash
git clone https://github.com/Juanmidev1/synapse-code-mcp.git
cd synapse-mcp
npm install

# Start in watch mode — no compile step required
npm run dev
```

To test your changes interactively against a real MCP client:

```bash
npm run build
npx @modelcontextprotocol/inspector dist/index.js --root .
```

This opens a browser UI where you can invoke all tools and inspect their input/output.

**Requirements:**
- Node.js ≥ 18
- Git (required for `get_changed_files`)
- [ripgrep](https://github.com/BurntSushi/ripgrep) *(optional)* — faster search; Synapse falls back gracefully

---

## 2. Running the full test suite

Run these three commands before opening a PR — all must pass:

```bash
npm test             # Vitest unit + integration + protocol + performance tests
npm run typecheck    # TypeScript type-check without emitting
npm run lint         # ESLint
```

**Performance budgets:** `tests/performance/` enforces upper bounds on time and heap usage. Do not remove or loosen these budgets. If your change genuinely makes something faster, you can tighten them — but never raise them without a discussion in the PR.

---

## 3. Commit conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must start with a type prefix:

| Prefix | When to use |
|---|---|
| `feat:` | New behaviour visible to users or MCP clients |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `test:` | Adding or updating tests, no production code change |
| `refactor:` | Code restructuring that doesn't add features or fix bugs |
| `perf:` | Performance improvement |
| `chore:` | Build, CI, dependency, or tooling changes |

**Why?** Conventional Commits make it possible to generate a structured CHANGELOG automatically and to determine the next semver version without manual intervention. This pays off immediately once the project reaches v1.

Examples:

```
feat: add outline_only parameter to get_semantic_context
fix: resolve symlinks in resolveAndValidate to prevent path escape
docs: document extraIgnorePatterns config field
test: add unit tests for ignore-resolver negation patterns
chore: upgrade ts-morph to v24
```

Breaking changes must include `BREAKING CHANGE:` in the commit footer or an `!` after the type, e.g. `feat!: remove --max-tree-depth flag`.

---

## 4. What a good pull request looks like

- **Tests:** every new behaviour and every bug fix must be covered by a test. If you're adding a new code path, add a unit test under `tests/unit/`. If you're changing tool output format, update the integration tests under `tests/integration/`.
- **No budget regressions:** `npm test` runs the performance suite automatically. If your change causes a budget failure, investigate before opening the PR.
- **README:** update the relevant section if your change affects a documented tool's parameters, output, or defaults.
- **Scope:** keep PRs focused. One logical change per PR makes review faster and history cleaner.

---

## 5. Proposing a large change

Before investing time in a large refactor, new tool, or architectural change, **open a GitHub issue first** and describe:
- The problem you're solving
- Your proposed solution and any alternatives you considered
- Rough implementation plan

This avoids the painful situation where a contributor spends days on a PR that the maintainer can't accept — because the direction conflicts with unreleased plans, or because it introduces a design that creates long-term maintenance burden. An issue costs five minutes; a rejected PR costs much more.

---

## 6. Project architecture

Understanding this layering is essential before contributing code.

```
src/
  index.ts        CLI entry point, argument parsing
  server.ts       MCP server, tool registration
  tools/          ← THIN HANDLERS ONLY (see below)
  core/
    fs/           File tree building, file reading, ignore resolution
    search/       ripgrep adapter + pure-Node fallback
    analysis/     Dependency graph (ts-morph), outline extractor, project indexer, index cache
    git/          Git adapter
  config/         Config loading and Zod validation
  types/          Shared TypeScript interfaces
  utils/          Logger (pino), path helpers, typed errors
tests/
  unit/           Per-module unit tests
  integration/    Tool handler integration tests
  protocol/       End-to-end MCP protocol tests
  performance/    Benchmark suite with time and heap budgets
  build/          Tests against the compiled dist/ output (catches source-vs-build divergence)
```

### The rule: tools/ are handlers, not logic

Files in `src/tools/` must do exactly three things:

1. Validate and parse tool inputs (using the Zod schema already attached to the handler)
2. Call one or more `src/core/` functions
3. Format the MCP response

**No business logic belongs in `src/tools/`.** If you find yourself writing a loop, a conditional, or any computation in a tool handler, that code belongs in `src/core/` instead.

Likewise, **`src/core/` modules must not import from `src/tools/` or `src/server.ts`** — the dependency only flows inward.

Any PR that mixes these layers will be asked to restructure before review.

### Security invariant

`pathUtils.resolveAndValidate(root, userPath)` **must be called before every file system read operation.** It throws `PathEscapeError` if the path escapes the project root. Never bypass it.

---

## 7. GitHub labels

Once the repository is public, create the following labels in the GitHub repository settings (`Settings → Labels`):

| Label | Purpose |
|---|---|
| `good first issue` | Small, self-contained tasks ideal for first-time contributors |
| `help wanted` | Issues where external contributions are actively sought |
| `bug` | Something is broken |
| `enhancement` | New feature or improvement to existing behaviour |
| `documentation` | Docs-only change |

**Recommended first step after going public:** tag 2–3 real, small issues as `good first issue` to give newcomers clear entry points. Ideal candidates: a missing test for an edge case, a documentation gap, or a small ergonomic fix.
