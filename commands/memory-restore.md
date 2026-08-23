---
description: List and restore an archived MemoryOS task when no active task is present.
---

Run `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/memory-task.mjs list`, select the exact archive ID, and
run `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/memory-task.mjs restore <archive-id>`. Never overwrite
an active task; archive it first or use a separate worktree.
