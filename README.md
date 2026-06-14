# memory-os

Durable working memory for AI coding agents. The context window is a cache; `.memory/` is the source of truth. Survives compaction and new sessions; keeps live context small.

📖 **Full manual:** [`docs/manual.html`](docs/manual.html) — install, the loop, config, optional modules, best practices, troubleshooting.

## What it does
- `.memory/PLAN.md` (immutable, with Definition of Done) · `STATE.md` (live snapshot) · `JOURNAL.md` (append-only log).
- `/memory-init` scaffolds the `.memory/` loop in any project (idempotent — never overwrites).
- `SessionStart` hook re-injects a **bounded** snapshot of STATE + recent journal.
- `PreCompact` hook marks the journal and re-injects STATE so it survives compaction.
- `memory-checkpoint` skill keeps STATE/JOURNAL current; `/checkpoint` flushes on demand.
- `situational-suggestions` proposes optional tools (CodeGraph, Understand-Anything, taste-skill, Firecrawl, knowledge layer) — you confirm.

## Install (plugin)
```
/plugin marketplace add tpop78/memory-os
/plugin install memory-os@memory-os
```
Then, in each project where you want working memory:
```
/memory-init
```
This creates `.memory/PLAN.md`, `STATE.md`, and `JOURNAL.md` from the templates (it never
overwrites existing files), then prompts you to fill in the plan and current state. Re-running
it is safe. (Manual alternative: copy `templates/.memory/` into your project root as `.memory/`,
or run `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/init.mjs`.)

## Install (plain)
See `adapters/plain/README.md`. Codex: see `adapters/codex/README.md`.

## The loop
1. `/memory-init` → seed `.memory/`.  2. Work; `/checkpoint` (or the `memory-checkpoint` skill)
keeps `STATE.md` + `JOURNAL.md` current.  3. On the next session or after a compaction, the hooks
re-inject STATE + recent journal so the agent resumes without re-reading the codebase.

**Boundary:** `.memory/` is the *live working state of the current effort*. Durable cross-session
facts and preferences belong in your agent's own long-term memory, not here.

**Git:** commit `.memory/` for shareable team memory, or gitignore it for local-only. Suggested
default — commit `PLAN.md` + `STATE.md`; commit `JOURNAL.md` too unless its per-compaction churn
is unwanted.

## Config
- `MEMORY_OS_SESSION_START_MAX_CHARS` (default 6000) — re-hydration cap.
- `MEMORY_OS_SESSION_START=off` — disable injection (low-context/local models).

## Test
```
npm test
```

## Acceptance
Start a task, force a compaction (or restart the session), and the agent resumes from STATE.md — stage, done/remaining, next action, definition of done — without re-reading the codebase, with the injected payload under the cap.
