---
description: Archive the active MemoryOS task and start a fresh PLAN, STATE, and JOURNAL for unrelated work.
---

Checkpoint the active task, choose a safe lowercase slug for it, then run:

`node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/memory-task.mjs switch <completed-task-slug>`

Fill the new PLAN and STATE before continuing. The archived task remains recoverable under
`.memory/archive/`. Do not stage or commit unless explicitly asked.
