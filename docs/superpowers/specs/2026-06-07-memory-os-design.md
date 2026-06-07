# memory-os — Design Spec

**Date:** 2026-06-07
**Status:** Draft for review
**Author:** Theo Popescu (with Claude)

## 1. Purpose

`memory-os` is a portable, harness-agnostic backbone that gives any project **durable working memory that survives context compaction and new sessions, while keeping the live context window small.**

The guiding principle: **the context window is a cache, not the source of truth.** Every durable fact lives in a file on disk. Compaction and session restart become a cheap re-hydration from the smallest possible set of files, not a loss of state.

It is the first of two repos. The second, `dashboard` (the visual OS / "Acronizer"), is built on top of this contract in a later cycle and is out of scope here.

## 2. Success criteria (the acceptance test)

This is what "done" means and is the primary verification:

> Start a task → force a compaction (or kill and restart the session) → the agent resumes correctly from `STATE.md` — current stage, done/remaining, next action, and definition-of-done — **without re-reading the codebase**, and the injected re-hydration payload stays **under the configured char cap**.

## 3. The `.memory/` contract (harness-agnostic — plain markdown + git)

Three files, each with one clear job, distinguished by volatility:

- **`PLAN.md`** — immutable per task. Carries the **Definition of Done / success criteria at the top** (goal-driven execution). Produced by `superpowers:writing-plans`.
- **`STATE.md`** — the live checkpoint, overwritten on each update. Fixed sections:
  - `## Now` — current phase (e.g. "Phase 3/5 — wiring SessionStart hook")
  - `## Definition of done` — the goal being steered toward
  - `## Done (n/total)` — completed steps
  - `## Remaining` — open steps
  - `## Next action` — the single next concrete step
  - `## Blockers / decisions` — anything that would otherwise be lost
- **`JOURNAL.md`** — append-only, one line per meaningful action, timestamped. Never edited. Git history over `.memory/` is the time machine.

The contract is plain markdown so it is harness- and model-agnostic; any agent (Claude Code, Codex) reads and writes the same files.

## 4. Hooks — the anti-amnesia engine

Harness-level automation (the model cannot self-enforce these; they live in the harness config).

- **`SessionStart`** (fires on `startup` / `resume` / `clear` / post-`compact`) → injects `STATE.md` + the plan pointer + the last N `JOURNAL.md` lines as additional context, **bounded to a configurable char cap (~6k default)** so re-hydration cannot itself bloat the window. An off switch supports low-context / local-model setups.
- **`PreCompact`** → forces a checkpoint flush so nothing important lives only in the about-to-be-summarized window.

Together: re-hydrate cheaply on start → work and checkpoint continuously → flush before compaction → re-hydrate again. The loop is identical for "new session tomorrow" and "auto-compaction mid-task."

### Harness adapters
- **Claude Code:** `hooks/hooks.json` (auto-loaded by the plugin).
- **Codex:** equivalent config adapter under `adapters/codex/` for parity.
- **Plain fallback:** a documented `.claude/settings.json` snippet under `adapters/plain/` for setups without a plugin.

## 5. Discipline + ergonomics

- **`memory-checkpoint` skill** (authored in `superpowers:writing-skills` format) — defines *when* and *how* the agent writes back to `STATE.md` / `JOURNAL.md`: after each completed plan step, and on the `PreCompact` flush. This discipline is what makes the loop reliable rather than hopeful.
- **`/checkpoint` command** — an on-demand manual flush of verification state.

## 6. Optional modules (off by default, YAGNI-gated)

All of these follow one shared mechanism — a **situational-proposal layer**: the agent recognises a context and **proposes the relevant tool at the appropriate moment; the user confirms.** Nothing is silently always-on, and nothing is forced on a project that wants to stay simple. (CodeGraph is the one exception: for code work its detection is automatic, since it only makes the agent cheaper and carries no downside.)

- **CodeGraph (Tier 3 — code intelligence).** For code projects, the agent **auto-detects `.codegraph/codegraph.db` and prefers `codegraph_*` MCP queries over file sweeps**; if absent, it **suggests installing CodeGraph**. First-class for code, zero-cost for non-code, never a hard dependency. CodeGraph is documented and detected — not bundled (it is its own binary / MCP server with its own lifecycle).
- **Typed-edge knowledge layer (Tier 2 — domain knowledge).** When the agent detects knowledge accumulating (e.g. notes piling into `raw/`), it **proposes** standing up a `raw/ → wiki/ → outputs/` + `index.md` layer whose nodes carry frontmatter `type:` and typed edges (`relates-to`, `supersedes`, `sourced-from`, `contradicts`). The user confirms. Never auto-created. Optional read-only Obsidian viewer; Claude remains the librarian.
- **Firecrawl ingestion (web → knowledge).** The agent **offers Firecrawl at the appropriate time** — e.g. when starting a new project from an idea, or when the user references a URL worth ingesting — to clip `URL → clean markdown → knowledge/raw/`. The user confirms. Gated behind a key; off by default.
- **Understand-Anything (project comprehension / onboarding).** When the agent lands in an **existing or unfamiliar project**, it **proposes** running Understand-Anything to build an interactive knowledge graph — plain-English summaries, architectural layers, a dependency-ordered onboarding tour, and diff-impact views. This is **user-facing comprehension**, complementary to (not redundant with) CodeGraph's **agent-facing** token-efficient queries: CodeGraph makes *the agent* cheap to run on code; Understand-Anything helps *you* (or a new teammate) understand the project. Both are tree-sitter-based. External plugin — detected/proposed, not bundled.
- **taste-skill (frontend design quality).** When a task involves **designing or redesigning a site or UI**, the agent **proposes** applying taste-skill's design guidance and asks for direction — its three dials (Design Variance, Motion Intensity, Visual Density) and a style direction (minimalist, brutalist, soft, …) — to avoid generic AI "slop." The user confirms/sets the dials. Proposed only on design/redesign tasks; external skill (`npx skills add`), not bundled.

## 7. Configuration knobs (ECC-inspired)

- `MEMORY_OS_SESSION_START_MAX_CHARS` (default ~6000) — caps the re-hydration payload.
- `MEMORY_OS_SESSION_START` = `on` | `off` — disable injection for low-context / local-model setups.

## 8. Packaging & distribution

Plugin + Codex adapter + plain copy-in fallback. Primary path is a proper Claude Code plugin (versioned, one-command install), matching how `superpowers` already works.

## 9. Repo structure

```
memory-os/
├── .claude-plugin/      manifest + plugin.json + marketplace config
├── hooks/
│   ├── hooks.json       SessionStart + PreCompact (Claude Code)
│   └── scripts/         bounded rehydrate, flush
├── skills/
│   ├── memory-checkpoint/      when/how to write STATE & JOURNAL
│   ├── situational-suggestions/  proposal layer: detect context → suggest
│   │                             CodeGraph / Understand-Anything / taste-skill / Firecrawl
│   ├── firecrawl-clip/         (optional) URL → markdown → raw/
│   └── knowledge-graph/        (optional) typed-edge wiki builder
├── commands/
│   └── checkpoint.md    /checkpoint
├── adapters/
│   ├── codex/           Codex config equivalent
│   └── plain/           copy-in settings.json snippet + docs
├── templates/
│   └── .memory/         PLAN.md / STATE.md / JOURNAL.md starters
├── tests/               round-trip + bounded-output tests
├── docs/superpowers/specs/   this spec
└── README.md
```

## 10. Testing strategy

- **TDD (`superpowers:test-driven-development`) for the hook scripts:**
  - `rehydrate`: given a `STATE.md` + `JOURNAL.md`, produces correct injected context **and respects the char cap** (truncation strategy verified).
  - `flush`: writes a correct `STATE.md` snapshot from a given session state.
- **Manual round-trip verification (`superpowers:verification-before-completion`):** the §2 acceptance test — force a compaction, confirm zero-loss resume from `STATE.md`.

## 11. Out of scope (YAGNI)

- Continuous-learning "instincts" (ECC) — heavyweight; deferred.
- Harnesses beyond Claude Code + Codex.
- The dashboard / visual OS — that is repo 2 (`dashboard`).
- Any cloud / database — `memory-os` is local files + git only.

## 12. Provenance

The design is synthesised from four external reviews, with the spine (superpowers + files + git) unchanged throughout:

- **superpowers** — the discipline spine (brainstorm → plan → execute → verify) and skill/plugin format.
- **Karpathy CLAUDE.md / `karpathy-guidelines`** — think-before-coding, simplicity, surgical changes, and **Definition of Done** (elevated into `PLAN.md`/`STATE.md`).
- **"Self-improving knowledge base" video** — the `raw/wiki/outputs` + index pattern (Tier 2).
- **"AI Operating System" video** — the **typed-edge knowledge graph** refinement (Tier 2).
- **ECC** — **bounded re-hydration cap**, `/checkpoint`, and MCP-surface hygiene; validated the SessionStart/PreCompact mechanism at scale.
- **CodeGraph (tpop78 fork)** — Tier 3 code intelligence via MCP (agent-facing).
- **Understand-Anything (Lum1104)** — user-facing project comprehension / onboarding graph (proposed on unfamiliar projects).
- **taste-skill (Leonxlnx)** — frontend design-quality guidance (proposed on design/redesign tasks).
