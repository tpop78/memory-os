---
name: memory-checkpoint
description: Use throughout any multi-step task to keep .memory/ working memory current so progress survives context compaction and new sessions. Defines when and how to write STATE.md and JOURNAL.md.
---

# Keeping working memory current

The `.memory/` directory is the source of truth for "what we're doing, how far we've got, and what's left." The context window is a cache; this directory is durable. Keep it ahead of the window.

## Before reading any file

Check the `## Already in context this session` section injected by the SessionStart hook. If a file is listed there, **skip the Read call** — the content is already present in your context window.

Files listed by the hook:
- `.memory/STATE.md (full)` — do not re-read STATE.md; use the injected copy
- `.memory/JOURNAL.md (recent entries)` — do not re-read JOURNAL.md
- `.memory/PLAN.md (referenced)` — PLAN.md content is not loaded, but its existence is confirmed; read it only if you need its full text

## When to write

Write back at every meaningful boundary — do not wait until the end:
- After completing a plan step or phase.
- After making a decision that would otherwise live only in context.
- Immediately before any risky or long operation.
- Whenever you are asked to `/checkpoint`.

## How to write

**`.memory/STATE.md`** — overwrite it (it is a snapshot, not a log). Keep all sections present and current: `Now`, `Definition of done`, `Done (n/total)`, `Remaining`, `Next action`, `Blockers / decisions`, `Session depth`. Keep it short — it is re-injected on every session start under a character cap (`MEMORY_OS_SESSION_START_MAX_CHARS`, default 6000).

**`.memory/JOURNAL.md`** — append ONE timestamped line per action. Never edit earlier lines. This is the narrative history; git over `.memory/` is the time machine.

**`.memory/PLAN.md`** — immutable once approved. Carries the Definition of Done at the top. Do not rewrite it as work progresses; reflect progress in STATE.md instead.

## Session depth

STATE.md carries a `## Session depth` section:

    ## Session depth
    checkpoints: 0  |  break_at: 15

On every checkpoint write, increment `checkpoints` by 1.

When `checkpoints >= break_at`:

1. Write a full flush of STATE.md (all sections current, every field filled).
2. Append to JOURNAL.md: `<timestamp> ↻ session breakpoint — resume in a fresh chat`
3. Output exactly the following to the user (substituting N, project name, and next action):

    Context is deep (N checkpoints). STATE.md is flushed.

    Optimising Token Usage -> Please start a fresh session and paste the below to continue seamlessly:
    ──────────────────────────────────────────
    Continue [project name]. STATE.md is current.
    Next action: [exact text from STATE.md → Next action]
    ──────────────────────────────────────────

4. Stop. Do not continue the current task.

`[project name]` is the working directory name. `[exact text from STATE.md → Next action]` is the verbatim content of the `## Next action` section.

`break_at` defaults to 15. To override, set `MEMORY_OS_BREAK_AFTER=N` in the environment and write the value into the `break_at` field in STATE.md on the first checkpoint write of a new project.

## On session start

A SessionStart hook re-injects STATE.md + recent JOURNAL lines automatically. Trust it: resume from STATE.md's `Next action` rather than re-reading the whole codebase. Reset `checkpoints` to 0 in `## Session depth` on the first checkpoint write of the new session.

## Definition of done

Always carry the Definition of Done in STATE.md so that after compaction you resume knowing not just where you stopped, but what you are steering toward.
