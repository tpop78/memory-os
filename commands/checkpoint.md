---
description: Flush current progress to .memory/STATE.md and append a JOURNAL.md line.
---

Update the project's working memory now:

1. Rewrite `.memory/STATE.md` so every section is current:
   - `## Now` — the phase you are in
   - `## Definition of done` — copied/kept from `.memory/PLAN.md`
   - `## Done (n/total)` — completed steps
   - `## Remaining` — open steps
   - `## Next action` — the single next concrete step
   - `## Blockers / decisions` — anything that would be lost otherwise
2. Append ONE timestamped line to `.memory/JOURNAL.md` describing what was just accomplished. Never edit prior journal lines.
3. Report the memory files changed. Do not stage or commit them unless the user explicitly asks.

Keep STATE.md concise — it is re-injected into context on every session start under a character cap.
