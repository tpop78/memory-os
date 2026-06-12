# memory-os Token Management Design

## Goal

Reduce wasted tokens on large projects by (a) preventing redundant file reads mid-session and (b) signalling a clean session breakpoint before context becomes unmanageable.

## Architecture

Two lightweight additions to the existing memory-os pipeline — no new hooks, no new files beyond STATE.md template addition:

1. **Context inventory** — `composeContext()` appends a manifest of what was pre-loaded so the agent never re-reads files already in context.
2. **Session depth tracking** — STATE.md carries a `checkpoints` counter; `memory-checkpoint` skill instructs the agent to flush and signal a breakpoint when the counter hits `break_at`.

Both are agent-presented and user-initiated. Claude Code hooks cannot observe actual token counts, so the design uses checkpoint writes as a proxy for session depth.

---

## Component 1: Context Inventory

### What changes

**`hooks/scripts/lib/memory.mjs` — `composeContext()`**

After assembling STATE.md + journal tail, append an inventory section as the final part of the output:

```
## Already in context this session
- .memory/STATE.md (full)
- .memory/JOURNAL.md (last 15 lines)
- .memory/PLAN.md (referenced)      ← omitted when planExists is false
```

The inventory is derived entirely from the inputs already passed to `composeContext()` — no new reads, no new parameters.

**`hooks/scripts/rehydrate.mjs`** — no changes. It calls `composeContext()`, which now includes the inventory automatically.

### How the agent uses it

`memory-checkpoint` skill adds a **context-guard rule**:

> Before calling Read on any file, check the `## Already in context this session` section in your loaded context. If the file is listed there, skip the read — the content is already present.

This is a named rule the agent checks at the point of any Read decision, not a vague suggestion.

---

## Component 2: Session Depth Tracking

### What changes

**`templates/.memory/STATE.md`** — add one section at the bottom:

```
## Session depth
checkpoints: 0  |  break_at: 15
```

`break_at` defaults to 15. Overridden by setting `MEMORY_OS_BREAK_AFTER=N` in the environment — the agent writes the env value into STATE.md on its first checkpoint write of a new project, guided by the skill.

**`skills/memory-checkpoint/SKILL.md`** — add a **session depth rule**:

> On every checkpoint write, increment `checkpoints` by 1 in `## Session depth`. When `checkpoints >= break_at`:
>
> 1. Write a full flush of STATE.md (all sections current, every field filled).
> 2. Append to JOURNAL.md: `<timestamp> ↻ session breakpoint — resume in a fresh chat`
> 3. Output exactly:
>
> ```
> Context is deep (N checkpoints). STATE.md is flushed.
>
> Optimising Token Usage -> Please start a fresh session and paste the below to continue seamlessly:
> ──────────────────────────────────────────
> Continue [project name]. STATE.md is current.
> Next action: [exact text from STATE.md → Next action]
> ──────────────────────────────────────────
> ```
>
> 4. Stop. Do not continue the current task.

The resume prompt is composed from live STATE.md fields — `project name` from the working directory name, `Next action` verbatim from the STATE.md section. The new session's rehydrate hook loads STATE.md automatically, so the agent arrives oriented from both the paste and the rehydrated context.

---

## Configuration

| Env var | Default | Effect |
|---|---|---|
| `MEMORY_OS_BREAK_AFTER` | 15 | Sets `break_at` in STATE.md on first checkpoint of a new project |
| `MEMORY_OS_SESSION_START_MAX_CHARS` | 6000 | Existing cap on total rehydrated context (unchanged) |
| `MEMORY_OS_SESSION_START` | on | Existing enable/disable flag (unchanged) |

---

## Testing

`hooks/scripts/lib/memory.test.mjs` — two new cases added to the existing `composeContext` suite:

1. When `planExists` is true, output includes `- .memory/PLAN.md (referenced)` in the inventory section.
2. When `planExists` is false, output omits the PLAN line from the inventory section.

No new test files. No changes to `rehydrate.test.mjs` or `flush.test.mjs`.

---

## What this does not do

- Automatically start a new session (not possible from hooks)
- Use actual token counts (not available to hooks)
- Track scope or pre-load specific project files (YAGNI — not needed for stated goals)
