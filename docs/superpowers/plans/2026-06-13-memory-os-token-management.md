# memory-os Token Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent redundant file reads mid-session (context inventory) and signal a clean session breakpoint before context becomes unmanageable (session depth tracking).

**Architecture:** `composeContext()` in `memory.mjs` is extended to append an inventory of what was pre-loaded; `STATE.md` template gains a `## Session depth` section the agent increments on each checkpoint; `memory-checkpoint` skill gets two new rules — a context-guard (skip reads for listed files) and a breakpoint rule (flush + signal when checkpoints >= break_at).

**Tech Stack:** Node.js ESM, `node:test` + `node:assert/strict` (existing test harness, no new deps)

---

## File Map

| File | Change |
|---|---|
| `hooks/scripts/lib/memory.mjs` | Extend `composeContext()` to append inventory section |
| `hooks/scripts/lib/memory.test.mjs` | Add 2 new tests for inventory behaviour |
| `templates/.memory/STATE.md` | Add `## Session depth` section |
| `skills/memory-checkpoint/SKILL.md` | Add context-guard rule + session breakpoint rule |

---

### Task 1: Extend composeContext with context inventory (TDD)

**Files:**
- Modify: `hooks/scripts/lib/memory.test.mjs`
- Modify: `hooks/scripts/lib/memory.mjs`

- [ ] **Step 1: Write two failing tests**

Append to `hooks/scripts/lib/memory.test.mjs` — add after the existing `composeContext` tests (after line 88):

```js
test('composeContext inventory includes PLAN line when planExists is true', () => {
  const out = composeContext({ state: '## Now\nPhase 1', journalTail: 'did x', planExists: true, maxChars: 6000 });
  assert.match(out, /## Already in context this session/);
  assert.match(out, /\.memory\/PLAN\.md \(referenced\)/);
});

test('composeContext inventory omits PLAN line when planExists is false', () => {
  const out = composeContext({ state: '## Now\nPhase 1', journalTail: 'did x', planExists: false, maxChars: 6000 });
  assert.match(out, /## Already in context this session/);
  assert.doesNotMatch(out, /PLAN\.md/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test hooks/scripts/lib/memory.test.mjs
```

Expected: 2 failures — `composeContext inventory includes PLAN line...` and `composeContext inventory omits PLAN line...` both fail with `AssertionError: Input A expected to match regular expression /## Already in context this session/`.

- [ ] **Step 3: Implement the inventory in composeContext**

Replace the entire `composeContext` function in `hooks/scripts/lib/memory.mjs` (lines 44–55):

```js
export function composeContext({ state, journalTail, planExists, maxChars }) {
  const parts = [];
  if (planExists) parts.push('Active plan: see .memory/PLAN.md (definition of done at top).');
  if (state) parts.push('## Current state (.memory/STATE.md)\n' + state.trim());
  if (journalTail) parts.push('## Recent journal\n' + journalTail.trim());

  const inventoryLines = [];
  if (state) inventoryLines.push('- .memory/STATE.md (full)');
  if (journalTail) inventoryLines.push('- .memory/JOURNAL.md (recent entries)');
  if (planExists) inventoryLines.push('- .memory/PLAN.md (referenced)');
  if (inventoryLines.length > 0) {
    parts.push('## Already in context this session\n' + inventoryLines.join('\n'));
  }

  let out = parts.join('\n\n').trim();
  if (out.length > maxChars) {
    const marker = '\n…[truncated]';
    out = out.slice(0, maxChars - marker.length).trimEnd() + marker;
  }
  return out;
}
```

- [ ] **Step 4: Run all tests to verify everything passes**

```bash
node --test 'hooks/scripts/**/*.test.mjs'
```

Expected: all tests pass, including the 2 new inventory tests. The existing `composeContext returns empty string with no inputs` test still passes because `inventoryLines` is empty when all inputs are falsy.

- [ ] **Step 5: Commit**

```bash
git add hooks/scripts/lib/memory.mjs hooks/scripts/lib/memory.test.mjs
git commit -m "feat(hooks): extend composeContext with already-in-context inventory (+2 tests)"
```

---

### Task 2: Add Session depth section to STATE.md template

**Files:**
- Modify: `templates/.memory/STATE.md`

- [ ] **Step 1: Add the session depth section**

Replace the entire contents of `templates/.memory/STATE.md`:

```markdown
# State · <updated YYYY-MM-DD HH:MM>

## Now
<current phase, e.g. "Phase 1/3 — scaffolding">

## Definition of done
<copied from PLAN.md — what we are steering toward>

## Done (0/0)

## Remaining

## Next action
<the single next concrete step>

## Blockers / decisions

## Session depth
checkpoints: 0  |  break_at: 15
```

- [ ] **Step 2: Verify the template renders correctly**

```bash
cat templates/.memory/STATE.md
```

Expected: file ends with:
```
## Session depth
checkpoints: 0  |  break_at: 15
```

- [ ] **Step 3: Commit**

```bash
git add templates/.memory/STATE.md
git commit -m "feat(template): add session depth section to STATE.md (checkpoints + break_at)"
```

---

### Task 3: Update memory-checkpoint skill with context-guard and breakpoint rules

**Files:**
- Modify: `skills/memory-checkpoint/SKILL.md`

- [ ] **Step 1: Add the context-guard and session depth sections**

Replace the entire contents of `skills/memory-checkpoint/SKILL.md`:

```markdown
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

```
## Session depth
checkpoints: 0  |  break_at: 15
```

On every checkpoint write, increment `checkpoints` by 1.

When `checkpoints >= break_at`:

1. Write a full flush of STATE.md (all sections current, every field filled).
2. Append to JOURNAL.md: `<timestamp> ↻ session breakpoint — resume in a fresh chat`
3. Output exactly the following to the user (substituting N, project name, and next action):

```
Context is deep (N checkpoints). STATE.md is flushed.

Optimising Token Usage -> Please start a fresh session and paste the below to continue seamlessly:
──────────────────────────────────────────
Continue [project name]. STATE.md is current.
Next action: [exact text from STATE.md → Next action]
──────────────────────────────────────────
```

4. Stop. Do not continue the current task.

`[project name]` is the working directory name. `[exact text from STATE.md → Next action]` is the verbatim content of the `## Next action` section.

`break_at` defaults to 15. To override, set `MEMORY_OS_BREAK_AFTER=N` in the environment and write the value into the `break_at` field in STATE.md on the first checkpoint write of a new project.

## On session start

A SessionStart hook re-injects STATE.md + recent JOURNAL lines automatically. Trust it: resume from STATE.md's `Next action` rather than re-reading the whole codebase. Reset `checkpoints` to 0 in `## Session depth` on the first checkpoint write of the new session.

## Definition of done

Always carry the Definition of Done in STATE.md so that after compaction you resume knowing not just where you stopped, but what you are steering toward.
```

- [ ] **Step 2: Verify the skill file looks correct**

```bash
grep -n "Already in context\|Session depth\|checkpoints\|break_at\|Optimising Token" skills/memory-checkpoint/SKILL.md
```

Expected output (line numbers will vary):
```
<n>:## Before reading any file
<n>:Check the `## Already in context this session` section
<n>:## Session depth
<n>:checkpoints: 0  |  break_at: 15
<n>:On every checkpoint write, increment `checkpoints` by 1.
<n>:Optimising Token Usage -> Please start a fresh session
<n>:`break_at` defaults to 15.
```

- [ ] **Step 3: Run full test suite to confirm nothing broken**

```bash
node --test 'hooks/scripts/**/*.test.mjs'
```

Expected: all tests pass (skill changes are markdown only — no test impact).

- [ ] **Step 4: Commit**

```bash
git add skills/memory-checkpoint/SKILL.md
git commit -m "feat(skill): add context-guard and session depth breakpoint to memory-checkpoint"
```
