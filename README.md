# memory-os

Durable working memory for AI coding agents. The context window is a cache; `.memory/` is the source of truth. Survives compaction and new sessions; keeps live context small.

## What it does
- `.memory/PLAN.md` (immutable, with Definition of Done) · `STATE.md` (live snapshot) · `JOURNAL.md` (append-only log).
- `SessionStart` hook re-injects a **bounded** snapshot of STATE + recent journal.
- `PreCompact` hook marks the journal and re-injects STATE so it survives compaction.
- `memory-checkpoint` skill keeps STATE/JOURNAL current; `/checkpoint` flushes on demand.
- `situational-suggestions` proposes optional tools (CodeGraph, Understand-Anything, taste-skill, Firecrawl, knowledge layer) — you confirm.

## Install (plugin)
```
/plugin marketplace add tpop78/memory-os
/plugin install memory-os@memory-os
```
Then copy `templates/.memory/` into your project root as `.memory/`.

## Install (plain)
See `adapters/plain/README.md`. Codex: see `adapters/codex/README.md`.

## Config
- `MEMORY_OS_SESSION_START_MAX_CHARS` (default 6000) — re-hydration cap.
- `MEMORY_OS_SESSION_START=off` — disable injection (low-context/local models).

## Test
```
npm test
```

## Acceptance
Start a task, force a compaction (or restart the session), and the agent resumes from STATE.md — stage, done/remaining, next action, definition of done — without re-reading the codebase, with the injected payload under the cap.
