---
description: Archive the completed active MemoryOS task without committing or deleting its recovery copy.
---

Checkpoint the active STATE and JOURNAL, choose a safe lowercase task slug, then run:

`node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/memory-task.mjs archive <slug>`

Report the archive ID and location. Do not stage, commit, delete, or overwrite anything else.
