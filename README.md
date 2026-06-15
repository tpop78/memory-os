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
- `/auto-research` runs an autonomous optimize loop on ONE asset toward ONE metric (keep winners, revert losers).

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

## The optimize loop (Auto Research)
Once you have a working baseline and a single objective number to push, `/auto-research` stands up
an autonomous optimization run under `.memory/autoloop/<tag>/`: a human-locked **INSTRUCTIONS.md**
(goal + metric + asset path + stop conditions), a locked **SCORING.sh** measuring stick (prints one
number; the agent never edits it), and a **RESULTS.tsv** ledger. The `auto-research-engineer` skill
then loops unattended — change → score → keep the winner / revert the loser → log — until a target,
a plateau, or a wall-clock cap is hit. Keep/revert uses a git branch when the asset is in git, else
file snapshots. `situational-suggestions` offers this automatically once a measurable baseline exists.

**Git:** commit `.memory/` for shareable team memory, or gitignore it for local-only. Suggested
default — commit `PLAN.md` + `STATE.md`; commit `JOURNAL.md` too unless its per-compaction churn
is unwanted.

## Config
- `MEMORY_OS_SESSION_START_MAX_CHARS` (default 6000) — re-hydration cap.
- `MEMORY_OS_SESSION_START=off` — disable injection (low-context/local models).
- `MEMORY_OS_AUTO_INIT` (default on) — on SessionStart, in a git repository that has no `.memory/`, memory-os scaffolds the loop (PLAN/STATE/JOURNAL from templates); and if the `codegraph` CLI is installed and there is no `.codegraph/`, it starts a CodeGraph index in the background. Idempotent — re-running is safe. Set to `off` to disable. (`.codegraph/` is a derived index you may want to add to `.gitignore`.)

## Test
```
npm test
```

## Acceptance
Start a task, force a compaction (or restart the session), and the agent resumes from STATE.md — stage, done/remaining, next action, definition of done — without re-reading the codebase, with the injected payload under the cap.
