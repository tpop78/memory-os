---
name: memory-task-lifecycle
description: Use when a MemoryOS task is complete or the user wants to archive, list, restore, or replace the active task without stale rehydration.
---

# Archive and switch MemoryOS tasks safely

MemoryOS supports one active PLAN/STATE/JOURNAL triple per checkout. Archives live under
`.memory/archive/<timestamp>-<slug>/` and remain immutable recovery copies.

## Complete and archive

1. Checkpoint STATE and JOURNAL so the completed result and next disposition are explicit.
2. Choose a lowercase slug containing only letters, numbers, and hyphens.
3. Run `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/memory-task.mjs archive <slug> <project-dir>`.
4. Report the archive ID and verify no active root memory files remain.

## Restore

1. Run `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/memory-task.mjs list <project-dir>`.
2. Refuse to overwrite an active task. Archive it first or use a separate worktree.
3. Run `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/memory-task.mjs restore <archive-id> <project-dir>`.
4. Verify all three active files were restored. The archive remains untouched.

## Replace with a new task

Run `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/memory-task.mjs switch <completed-slug> <project-dir>`.
This archives the complete active triple and installs fresh templates. Then fill the new PLAN and
STATE before doing unrelated work.

Never delete archives, stage files, commit, or switch tasks without explicit user direction.
