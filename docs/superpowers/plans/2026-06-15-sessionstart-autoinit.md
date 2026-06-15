# SessionStart Auto-Init Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On SessionStart, memory-os auto-scaffolds the `.memory/` loop and starts a background `codegraph init` in a git project that lacks them — gated by `MEMORY_OS_AUTO_INIT` (default ON), idempotent, and fail-safe.

**Architecture:** A new pure-core + thin-IO module `hooks/scripts/lib/autoinit.mjs` (decision logic separated from side effects, dependencies injected for testing), wired into the existing `rehydrate.mjs` SessionStart hook. The `codegraph init` runs detached/unref'd so it never blocks the hook's 10s timeout.

**Tech Stack:** Node ESM, zero deps. Tests via the Node test runner: `node --test 'hooks/scripts/**/*.test.mjs'`. Reuses `scaffoldMemory` from `hooks/scripts/lib/memory.mjs`.

**Spec:** `docs/superpowers/specs/2026-06-15-sessionstart-autoinit-design.md`.

---

## File Structure

**Create:**
- `hooks/scripts/lib/autoinit.mjs` — `isAutoInitEnabled`, `summaryFor`, `planAutoInit` (pure), `runAutoInit` (IO wrapper, injectable deps).
- `hooks/scripts/lib/autoinit.test.mjs` — Node-test unit tests.

**Modify:**
- `hooks/scripts/rehydrate.mjs` — run auto-init (own flag) before composing context; prepend its note.
- `hooks/scripts/rehydrate.test.mjs` — add two integration tests (enabled in a fresh git repo; disabled via flag).
- `README.md` — document `MEMORY_OS_AUTO_INIT`.
- `docs/manual.html` — document the env var alongside the other `MEMORY_OS_*` vars.
- `.claude-plugin/plugin.json` — version bump 0.4.0 → 0.5.0.

---

## Task 1: Pure core — flag + decision

**Files:**
- Create: `hooks/scripts/lib/autoinit.mjs`
- Test: `hooks/scripts/lib/autoinit.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `hooks/scripts/lib/autoinit.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAutoInitEnabled, planAutoInit, summaryFor } from './autoinit.mjs';

test('isAutoInitEnabled defaults ON (anything but "off")', () => {
  assert.equal(isAutoInitEnabled({}), true);
  assert.equal(isAutoInitEnabled({ MEMORY_OS_AUTO_INIT: 'on' }), true);
  assert.equal(isAutoInitEnabled({ MEMORY_OS_AUTO_INIT: '1' }), true);
  assert.equal(isAutoInitEnabled({ MEMORY_OS_AUTO_INIT: 'true' }), true);
});

test('isAutoInitEnabled is OFF only when explicitly "off"', () => {
  assert.equal(isAutoInitEnabled({ MEMORY_OS_AUTO_INIT: 'off' }), false);
});

test('summaryFor builds a note from performed actions', () => {
  assert.equal(summaryFor({ scaffoldMemory: false, initCodegraph: false }), '');
  assert.match(summaryFor({ scaffoldMemory: true, initCodegraph: false }), /scaffolded \.memory loop/);
  assert.match(summaryFor({ scaffoldMemory: false, initCodegraph: true }), /codegraph index in background/);
  assert.match(summaryFor({ scaffoldMemory: true, initCodegraph: true }), /^memory-os: .+; .+\.$/);
});

test('planAutoInit: not a git work-tree → do nothing', () => {
  const p = planAutoInit({ gitWorkTree: false, memoryExists: false, codegraphExists: false, codegraphCli: true });
  assert.equal(p.scaffoldMemory, false);
  assert.equal(p.initCodegraph, false);
  assert.equal(p.summary, '');
});

test('planAutoInit: happy path → scaffold memory + init codegraph', () => {
  const p = planAutoInit({ gitWorkTree: true, memoryExists: false, codegraphExists: false, codegraphCli: true });
  assert.equal(p.scaffoldMemory, true);
  assert.equal(p.initCodegraph, true);
  assert.match(p.summary, /scaffolded \.memory loop/);
  assert.match(p.summary, /codegraph/);
});

test('planAutoInit: existing .memory is not re-scaffolded', () => {
  const p = planAutoInit({ gitWorkTree: true, memoryExists: true, codegraphExists: false, codegraphCli: true });
  assert.equal(p.scaffoldMemory, false);
  assert.equal(p.initCodegraph, true);
});

test('planAutoInit: existing .codegraph is not re-initialised', () => {
  const p = planAutoInit({ gitWorkTree: true, memoryExists: false, codegraphExists: true, codegraphCli: true });
  assert.equal(p.initCodegraph, false);
  assert.equal(p.scaffoldMemory, true);
});

test('planAutoInit: no codegraph CLI → skip codegraph only', () => {
  const p = planAutoInit({ gitWorkTree: true, memoryExists: false, codegraphExists: false, codegraphCli: false });
  assert.equal(p.scaffoldMemory, true);
  assert.equal(p.initCodegraph, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test hooks/scripts/lib/autoinit.test.mjs`
Expected: FAIL — `Cannot find module './autoinit.mjs'`.

- [ ] **Step 3: Write the implementation**

Create `hooks/scripts/lib/autoinit.mjs` (pure functions only — IO comes in Task 2):

```javascript
// memory-os: SessionStart auto-init — decide and (in Task 2) perform .memory + codegraph init.
// Pure decision logic here; side effects live in runAutoInit (injectable deps).

/** Auto-init is ON unless explicitly disabled. Mirrors isEnabled() in memory.mjs. */
export function isAutoInitEnabled(env) {
  return env.MEMORY_OS_AUTO_INIT !== 'off';
}

/** Build the one-line SessionStart note from the actions that were (or will be) done. */
export function summaryFor({ scaffoldMemory, initCodegraph }) {
  const done = [];
  if (scaffoldMemory) done.push('scaffolded .memory loop');
  if (initCodegraph) done.push('started codegraph index in background');
  return done.length ? `memory-os: ${done.join('; ')}.` : '';
}

/**
 * Pure decision: given observed state, what should auto-init do?
 * Returns { scaffoldMemory, initCodegraph, summary }. No IO.
 */
export function planAutoInit({ gitWorkTree, memoryExists, codegraphExists, codegraphCli }) {
  const scaffoldMemory = !!gitWorkTree && !memoryExists;
  const initCodegraph = !!gitWorkTree && !codegraphExists && !!codegraphCli;
  return { scaffoldMemory, initCodegraph, summary: summaryFor({ scaffoldMemory, initCodegraph }) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test hooks/scripts/lib/autoinit.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add hooks/scripts/lib/autoinit.mjs hooks/scripts/lib/autoinit.test.mjs
git commit -m "feat(autoinit): flag + pure decision core"
```

---

## Task 2: IO wrapper — `runAutoInit`

**Files:**
- Modify: `hooks/scripts/lib/autoinit.mjs`
- Modify: `hooks/scripts/lib/autoinit.test.mjs`

- [ ] **Step 1: Add failing tests**

Append to `hooks/scripts/lib/autoinit.test.mjs`. Add `runAutoInit` to the existing import from `./autoinit.mjs` at the top (making it `import { isAutoInitEnabled, planAutoInit, summaryFor, runAutoInit } from './autoinit.mjs';`), then append these tests:

```javascript
test('runAutoInit performs both actions when the plan calls for them', () => {
  const calls = [];
  const summary = runAutoInit('/proj', '/tpl', {
    isGitWorkTree: () => true,
    hasCodegraphCli: () => true,
    memoryExists: () => false,
    codegraphExists: () => false,
    doScaffold: () => calls.push('scaffold'),
    startCodegraph: () => calls.push('codegraph'),
  });
  assert.deepEqual(calls, ['scaffold', 'codegraph']);
  assert.match(summary, /scaffolded \.memory loop/);
  assert.match(summary, /codegraph index in background/);
});

test('runAutoInit does nothing outside a git work-tree', () => {
  const calls = [];
  const summary = runAutoInit('/proj', '/tpl', {
    isGitWorkTree: () => false,
    hasCodegraphCli: () => true,
    memoryExists: () => false,
    codegraphExists: () => false,
    doScaffold: () => calls.push('scaffold'),
    startCodegraph: () => calls.push('codegraph'),
  });
  assert.deepEqual(calls, []);
  assert.equal(summary, '');
});

test('runAutoInit swallows a throwing action and reflects only what succeeded', () => {
  const calls = [];
  const summary = runAutoInit('/proj', '/tpl', {
    isGitWorkTree: () => true,
    hasCodegraphCli: () => true,
    memoryExists: () => false,
    codegraphExists: () => false,
    doScaffold: () => { throw new Error('boom'); },
    startCodegraph: () => calls.push('codegraph'),
  });
  // scaffold threw → not reported; codegraph still ran
  assert.deepEqual(calls, ['codegraph']);
  assert.doesNotMatch(summary, /scaffolded/);
  assert.match(summary, /codegraph/);
});

test('runAutoInit returns "" (never throws) when a probe dep throws', () => {
  const summary = runAutoInit('/proj', '/tpl', {
    isGitWorkTree: () => { throw new Error('no git'); },
    hasCodegraphCli: () => true,
    memoryExists: () => false,
    codegraphExists: () => false,
    doScaffold: () => {},
    startCodegraph: () => {},
  });
  assert.equal(summary, '');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test hooks/scripts/lib/autoinit.test.mjs`
Expected: FAIL — `runAutoInit` is not exported.

- [ ] **Step 3: Add the implementation**

Append to `hooks/scripts/lib/autoinit.mjs` (add the imports at the TOP of the file, above the existing functions):

```javascript
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { scaffoldMemory, resolveMemoryDir } from './memory.mjs';
```

Then append at the end of the file:

```javascript
/** Real dependency implementations (overridable in tests). */
function defaultDeps(templatesDir) {
  return {
    isGitWorkTree(cwd) {
      try {
        return execFileSync('git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'true';
      } catch { return false; }
    },
    hasCodegraphCli() {
      try { execFileSync('which', ['codegraph'], { stdio: 'ignore' }); return true; }
      catch { return false; }
    },
    memoryExists(cwd) { return existsSync(join(resolveMemoryDir(cwd), 'STATE.md')); },
    codegraphExists(cwd) { return existsSync(join(cwd, '.codegraph')); },
    doScaffold(cwd) { scaffoldMemory(cwd, templatesDir); },
    startCodegraph(cwd) {
      // Detached + unref'd: indexing must NOT block the hook's 10s timeout.
      spawn('codegraph', ['init'], { cwd, detached: true, stdio: 'ignore' }).unref();
    },
  };
}

/**
 * Perform auto-init for `cwd`. Decides via planAutoInit, performs the chosen actions,
 * and returns a one-line summary of what actually succeeded. Never throws.
 * `deps` overrides individual dependencies (used by tests).
 */
export function runAutoInit(cwd, templatesDir, deps = {}) {
  const d = { ...defaultDeps(templatesDir), ...deps };
  let plan;
  try {
    plan = planAutoInit({
      gitWorkTree: d.isGitWorkTree(cwd),
      memoryExists: d.memoryExists(cwd),
      codegraphExists: d.codegraphExists(cwd),
      codegraphCli: d.hasCodegraphCli(),
    });
  } catch {
    return '';
  }
  const done = { scaffoldMemory: false, initCodegraph: false };
  if (plan.scaffoldMemory) { try { d.doScaffold(cwd); done.scaffoldMemory = true; } catch { /* non-fatal */ } }
  if (plan.initCodegraph) { try { d.startCodegraph(cwd); done.initCodegraph = true; } catch { /* non-fatal */ } }
  return summaryFor(done);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test hooks/scripts/lib/autoinit.test.mjs`
Expected: PASS (all 12 tests).

- [ ] **Step 5: Commit**

```bash
git add hooks/scripts/lib/autoinit.mjs hooks/scripts/lib/autoinit.test.mjs
git commit -m "feat(autoinit): runAutoInit IO wrapper with injectable deps"
```

---

## Task 3: Wire into `rehydrate.mjs`

**Files:**
- Modify: `hooks/scripts/rehydrate.mjs`
- Modify: `hooks/scripts/rehydrate.test.mjs`

- [ ] **Step 1: Add failing integration tests**

Append to `hooks/scripts/rehydrate.test.mjs` (extend its existing imports: add `existsSync` to the `node:fs` import and add `import { execFileSync } from 'node:child_process';` if not already present — it IS already imported in this file):

```javascript
test('auto-inits .memory in a fresh git repo when enabled (default)', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-ai-'));
  execFileSync('git', ['init'], { cwd, stdio: 'ignore' });
  // Pre-create .codegraph so the real `codegraph init` is never spawned (hermetic test).
  mkdirSync(join(cwd, '.codegraph'), { recursive: true });
  const json = JSON.parse(run(cwd));
  assert.match(json.hookSpecificOutput.additionalContext, /scaffolded \.memory loop/);
  assert.ok(existsSync(join(cwd, '.memory', 'STATE.md')));
});

test('does NOT auto-init when MEMORY_OS_AUTO_INIT=off', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-aioff-'));
  execFileSync('git', ['init'], { cwd, stdio: 'ignore' });
  run(cwd, { MEMORY_OS_AUTO_INIT: 'off' });
  assert.ok(!existsSync(join(cwd, '.memory')));
});
```

Add `existsSync` to the `node:fs` import line at the top of the file (it currently imports `mkdtempSync, mkdirSync, writeFileSync` — make it `mkdtempSync, mkdirSync, writeFileSync, existsSync`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test hooks/scripts/rehydrate.test.mjs`
Expected: FAIL — the new "auto-inits" test fails because `rehydrate.mjs` does not yet scaffold (no `.memory/STATE.md` created, note absent).

- [ ] **Step 3: Wire auto-init into `rehydrate.mjs`**

Edit `hooks/scripts/rehydrate.mjs`. Add imports below the existing `import { ... } from './lib/memory.mjs';` block:

```javascript
import { isAutoInitEnabled, runAutoInit } from './lib/autoinit.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
```

After the line `const cwd = input.cwd || process.cwd();`, insert the auto-init step (it runs on its OWN flag, independent of `isEnabled`, so disabling rehydration does not disable auto-init):

```javascript
const here = dirname(fileURLToPath(import.meta.url)); // hooks/scripts
const templatesDir = join(here, '..', '..', 'templates', '.memory');

let autoInitNote = '';
if (isAutoInitEnabled(process.env)) {
  try { autoInitNote = runAutoInit(cwd, templatesDir); } catch { autoInitNote = ''; }
}
```

Change the disabled-early-exit so it still emits the auto-init note:

```javascript
if (!isEnabled(process.env)) {
  emit(autoInitNote);
  process.exit(0);
}
```

Finally, prepend the note to the composed context before emitting. Replace:

```javascript
const context = composeContext({
  state: readState(mem),
  journalTail: tailJournal(mem, 15),
  planExists: planExists(mem),
  maxChars: getMaxChars(process.env),
});
emit(context);
process.exit(0);
```

with:

```javascript
const context = composeContext({
  state: readState(mem),
  journalTail: tailJournal(mem, 15),
  planExists: planExists(mem),
  maxChars: getMaxChars(process.env),
});
emit(autoInitNote ? `${autoInitNote}\n\n${context}` : context);
process.exit(0);
```

- [ ] **Step 4: Run the full hook test suite**

Run: `node --test 'hooks/scripts/**/*.test.mjs'`
Expected: PASS — all existing tests (the three original `rehydrate` tests still pass: the disabled-test and the no-`.memory`-dir test both use non-git tmp dirs, so auto-init is a no-op there) plus the new ones.

- [ ] **Step 5: Commit**

```bash
git add hooks/scripts/rehydrate.mjs hooks/scripts/rehydrate.test.mjs
git commit -m "feat(autoinit): wire SessionStart auto-init into rehydrate"
```

---

## Task 4: Docs + version bump

**Files:**
- Modify: `README.md`
- Modify: `docs/manual.html`
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Document the env var in `README.md`**

Find where the existing `MEMORY_OS_SESSION_START` env var is documented (search `README.md` for `MEMORY_OS_SESSION_START`). Add an entry for the new var nearby, matching the surrounding format. The content to add:

> `MEMORY_OS_AUTO_INIT` — on by default. On SessionStart, in a git repository that has no `.memory/`, memory-os scaffolds the loop (PLAN/STATE/JOURNAL); and if the `codegraph` CLI is installed and there is no `.codegraph/`, it starts a CodeGraph index in the background. Idempotent and safe to re-run. Set to `off` to disable. (`.codegraph/` is a derived index you may want to add to `.gitignore`.)

If `README.md` has no env-var section, add a short `### Environment variables` subsection listing both `MEMORY_OS_SESSION_START` and `MEMORY_OS_AUTO_INIT`.

- [ ] **Step 2: Document it in `docs/manual.html`**

Search `docs/manual.html` for `MEMORY_OS_SESSION_START`. Add a sibling entry for `MEMORY_OS_AUTO_INIT` using the same HTML structure/tags as the existing env-var entry (match the surrounding markup — e.g. the same `<code>`/`<li>`/`<tr>` pattern). Text: same as the README entry above, condensed to one or two sentences.

- [ ] **Step 3: Bump the plugin version**

In `.claude-plugin/plugin.json`, change `"version": "0.4.0"` to `"version": "0.5.0"`.

- [ ] **Step 4: Verify the full suite still passes**

Run: `node --test 'hooks/scripts/**/*.test.mjs'`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add README.md docs/manual.html .claude-plugin/plugin.json
git commit -m "docs(autoinit): document MEMORY_OS_AUTO_INIT; bump to v0.5.0"
```

---

## Final verification

- [ ] **All hook tests pass:** `node --test 'hooks/scripts/**/*.test.mjs'`
- [ ] **Manual smoke (optional):** in a throwaway git repo, run the hook with the SessionStart stdin shape and confirm `.memory/` appears and the emitted JSON's `additionalContext` starts with the `memory-os:` note; run again and confirm it's idempotent (no note, `.memory` unchanged); run with `MEMORY_OS_AUTO_INIT=off` in a fresh git repo and confirm nothing is created.

---

## Notes

- **Independent flags:** `MEMORY_OS_AUTO_INIT` (auto-init) and `MEMORY_OS_SESSION_START` (rehydration) are separate. Disabling rehydration still allows auto-init (the disabled path emits just the auto-init note); disabling auto-init leaves rehydration untouched.
- **Hermetic tests:** the integration test pre-creates `.codegraph/` so the real `codegraph init` is never spawned during the suite. Unit tests inject fakes and touch no real git/codegraph/fs.
- **Fire-and-forget codegraph:** the detached child's success/failure is irrelevant to the hook; the note reflects that an index was *started*, not completed.
