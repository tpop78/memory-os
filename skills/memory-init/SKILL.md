---
name: memory-init
description: Use when the user wants to start durable working memory in a project. Creates PLAN, STATE, and JOURNAL without overwriting existing files, then helps define the active task.
---

# Initialise working memory

1. Confirm the project directory and check whether `.memory/PLAN.md`, `STATE.md`, or `JOURNAL.md`
   already exist. Never overwrite an active task.
2. Run `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/init.mjs <project-dir>` or use the equivalent
   local plugin-root path in Codex.
3. Fill PLAN with one task and a verifiable Definition of Done. Fill STATE with the current phase,
   remaining work, next action, decisions, and session depth. Append one JOURNAL line.
4. Explain that one active task is supported per checkout. Use separate git worktrees for concurrent
   tasks, or archive the completed task with `memory-task-lifecycle` before switching.
5. Ask whether memory should be team-shared in git or local-only. Never stage or commit it without
   explicit approval.

Automatic scaffolding is disabled by default. `MEMORY_OS_AUTO_INIT=on` is an explicit opt-in for
projects that intentionally want SessionStart to create the three files when absent.
