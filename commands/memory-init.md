---
description: Initialise the .memory/ loop in this project (PLAN/STATE/JOURNAL) and start working memory.
---

Stand up durable working memory for this project, then start the loop:

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/init.mjs`
   This creates `.memory/PLAN.md`, `.memory/STATE.md`, and `.memory/JOURNAL.md` from the
   templates if they do not already exist. It never overwrites an existing file, so it is
   safe to re-run.
2. Fill in `.memory/PLAN.md`: the task name, a verifiable **Definition of done**, and the
   phases. If a plan already exists under `docs/superpowers/plans/`, base PLAN.md on it.
   PLAN.md is immutable once approved.
3. Rewrite `.memory/STATE.md` to reflect the current moment: `## Now`, `## Definition of done`
   (copied from PLAN), `## Done`, `## Remaining`, `## Next action`, `## Blockers / decisions`.
4. Append ONE timestamped line to `.memory/JOURNAL.md` noting the loop was initialised.
5. Tell the user how to track `.memory/` in git: **commit** it for shareable team memory, or
   gitignore it for local-only. Default recommendation: commit `PLAN.md` + `STATE.md`; commit
   `JOURNAL.md` too unless its per-compaction churn is unwanted. Never stage or commit without
   explicit approval.

From here the loop runs on its own: the `SessionStart` hook re-injects a bounded snapshot of
STATE + recent journal, the `PreCompact` hook preserves it across compaction, and `/checkpoint`
(or the `memory-checkpoint` skill) keeps STATE/JOURNAL current as work progresses.

Boundary: `.memory/` holds the **live working state of the current effort**. Durable
cross-session facts and preferences belong in your agent's own long-term memory, not here.

One active task is supported per checkout. If the existing task is complete, use the
`memory-task-lifecycle` skill to archive it before creating a new PLAN. Use separate git worktrees
for concurrent tasks.
