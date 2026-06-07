---
name: memory-checkpoint
description: Use throughout any multi-step task to keep .memory/ working memory current so progress survives context compaction and new sessions. Defines when and how to write STATE.md and JOURNAL.md.
---

# Keeping working memory current

The `.memory/` directory is the source of truth for "what we're doing, how far we've got, and what's left." The context window is a cache; this directory is durable. Keep it ahead of the window.

## When to write

Write back at every meaningful boundary — do not wait until the end:
- After completing a plan step or phase.
- After making a decision that would otherwise live only in context.
- Immediately before any risky or long operation.
- Whenever you are asked to `/checkpoint`.

## How to write

**`.memory/STATE.md`** — overwrite it (it is a snapshot, not a log). Keep all sections present and current: `Now`, `Definition of done`, `Done (n/total)`, `Remaining`, `Next action`, `Blockers / decisions`. Keep it short — it is re-injected on every session start under a character cap (`MEMORY_OS_SESSION_START_MAX_CHARS`, default 6000).

**`.memory/JOURNAL.md`** — append ONE timestamped line per action. Never edit earlier lines. This is the narrative history; git over `.memory/` is the time machine.

**`.memory/PLAN.md`** — immutable once approved. Carries the Definition of Done at the top. Do not rewrite it as work progresses; reflect progress in STATE.md instead.

## On session start

A SessionStart hook re-injects STATE.md + recent JOURNAL lines automatically. Trust it: resume from STATE.md's `Next action` rather than re-reading the whole codebase.

## Definition of done

Always carry the Definition of Done in STATE.md so that after compaction you resume knowing not just where you stopped, but what you are steering toward.
