# Auto Research Engineer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an autonomous optimization loop to memory-os — pick ONE asset, score it with a locked one-number measuring stick, and iterate unattended (change → score → keep winner / revert loser → log) until a target/plateau/wall-clock stop, surfaced via a new `/auto-research` command + `auto-research-engineer` skill.

**Architecture:** Deterministic, safety-critical helpers live in a tested ESM lib (`hooks/scripts/lib/autoloop.mjs`) + an idempotent scaffolder (`hooks/scripts/autoloop-init.mjs`), mirroring the existing `lib/memory.mjs` + `init.mjs` pattern. The loop itself is agent-driven prose in `SKILL.md` (like Karpathy's `program.md`). Templates seed a per-run `.memory/autoloop/<tag>/` directory (INSTRUCTIONS / SCORING / RESULTS.tsv). `situational-suggestions` gains a post-baseline prompt.

**Tech Stack:** Node ESM (`.mjs`, node built-ins only — `node:fs`, `node:path`, `node:crypto`, `node:child_process`), `node:test` + `node:assert/strict` (run via `npm test` = `node --test 'hooks/scripts/**/*.test.mjs'`). Claude Code plugin (commands = markdown, skills = `SKILL.md`).

> **Spec:** `docs/superpowers/specs/2026-06-15-auto-research-engineer-design.md`. Branch: `feat/auto-research` (already created, on v0.3.0). All paths relative to the memory-os repo root.

> **House style (match it):** pure functions exported from `hooks/scripts/lib/`, thin entry scripts that import them; tests colocated as `*.test.mjs` using `mkdtempSync` temp-dir fixtures; scaffolders are idempotent and never overwrite (return `{ dir, created, skipped }`). See `hooks/scripts/lib/memory.mjs` + `hooks/scripts/lib/memory.test.mjs` + `hooks/scripts/init.mjs`.

---

## File Structure

**New:**
- `hooks/scripts/lib/autoloop.mjs` — pure/deterministic helpers (scoring, comparison, stop-conditions, ledger, integrity, mode-detect, snapshots, scaffold)
- `hooks/scripts/lib/autoloop.test.mjs` — node:test suite
- `hooks/scripts/autoloop-init.mjs` — idempotent run scaffolder (entry script)
- `templates/autoloop/INSTRUCTIONS.md`, `templates/autoloop/SCORING.sh`, `templates/autoloop/RESULTS.tsv`
- `skills/auto-research-engineer/SKILL.md` — the loop contract (the "program")
- `commands/auto-research.md` — entrypoint command

**Modified:**
- `skills/situational-suggestions/SKILL.md` — add the post-baseline prompt row
- `README.md` — document the optimize loop
- `docs/manual.html` — a short section
- `package.json` + `.claude-plugin/plugin.json` — version bump to 0.4.0

**Out of scope:** any Acronizer code (separate spec); it only consumes the `RESULTS.tsv` schema defined here.

---

### Task 1: Scoring + comparison helpers (TDD)

**Files:**
- Create: `hooks/scripts/lib/autoloop.mjs`
- Test: `hooks/scripts/lib/autoloop.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `hooks/scripts/lib/autoloop.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractScore, isBetter } from './autoloop.mjs';

test('extractScore reads a bare number', () => {
  assert.equal(extractScore('0.9979\n'), 0.9979);
});
test('extractScore reads the number from a labelled last line', () => {
  assert.equal(extractScore('building...\nscore: 0.42\n'), 0.42);
});
test('extractScore ignores trailing blank lines', () => {
  assert.equal(extractScore('1.5\n\n\n'), 1.5);
});
test('extractScore handles scientific + negative', () => {
  assert.equal(extractScore('-1.2e-3'), -0.0012);
});
test('extractScore returns null when there is no number', () => {
  assert.equal(extractScore('no digits here'), null);
  assert.equal(extractScore(''), null);
  assert.equal(extractScore(undefined), null);
});

test('isBetter: lower wins when minimizing', () => {
  assert.equal(isBetter(0.99, 1.0, 'minimize'), true);
  assert.equal(isBetter(1.01, 1.0, 'minimize'), false);
});
test('isBetter: higher wins when maximizing', () => {
  assert.equal(isBetter(0.6, 0.5, 'maximize'), true);
  assert.equal(isBetter(0.4, 0.5, 'maximize'), false);
});
test('isBetter: first real score (best null) always wins', () => {
  assert.equal(isBetter(1.23, null, 'minimize'), true);
});
test('isBetter: null/NaN candidate never wins', () => {
  assert.equal(isBetter(null, 1.0, 'minimize'), false);
  assert.equal(isBetter(NaN, 1.0, 'minimize'), false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test hooks/scripts/lib/autoloop.test.mjs`
Expected: FAIL — `./autoloop.mjs` does not exist.

- [ ] **Step 3: Create `hooks/scripts/lib/autoloop.mjs` with the two functions**

```js
// memory-os: Auto Research Engineer — deterministic helpers for the optimization loop.
// Pure/IO functions only; the loop logic itself lives in skills/auto-research-engineer/SKILL.md.

/** Read the score a SCORING run printed: the last numeric token on the last line that has one. */
export function extractScore(stdout) {
  if (typeof stdout !== 'string') return null;
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g);
    if (m) {
      const n = Number(m[m.length - 1]);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

/** Is `candidate` a better score than `best` given the optimization direction? */
export function isBetter(candidate, best, direction) {
  if (candidate == null || Number.isNaN(candidate)) return false;
  if (best == null) return true;
  return direction === 'maximize' ? candidate > best : candidate < best;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test hooks/scripts/lib/autoloop.test.mjs`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add hooks/scripts/lib/autoloop.mjs hooks/scripts/lib/autoloop.test.mjs
git commit -m "feat(autoloop): scoring + comparison helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Stop-conditions parser (TDD)

**Files:**
- Modify: `hooks/scripts/lib/autoloop.mjs`
- Modify: `hooks/scripts/lib/autoloop.test.mjs`

- [ ] **Step 1: Add the failing tests** (append to the test file)

```js
import { parseDurationMs, parseStopConditions } from './autoloop.mjs';

test('parseDurationMs handles units and defaults to seconds', () => {
  assert.equal(parseDurationMs('500ms'), 500);
  assert.equal(parseDurationMs('30s'), 30000);
  assert.equal(parseDurationMs('5m'), 300000);
  assert.equal(parseDurationMs('8h'), 28800000);
  assert.equal(parseDurationMs('45'), 45000);
  assert.equal(parseDurationMs('junk'), null);
});

test('parseStopConditions returns defaults when nothing is specified', () => {
  assert.deepEqual(parseStopConditions('# nothing here'), {
    targetScore: null, plateauRounds: 20, wallclockCapMs: 28800000,
  });
});
test('parseStopConditions parses values from markdown-ish lines', () => {
  const text = [
    '- target_score: 0.95',
    '- plateau_rounds: 30',
    '- wallclock_cap: 4h',
  ].join('\n');
  assert.deepEqual(parseStopConditions(text), {
    targetScore: 0.95, plateauRounds: 30, wallclockCapMs: 14400000,
  });
});
test('parseStopConditions treats target_score "none" as null', () => {
  assert.equal(parseStopConditions('target_score: none').targetScore, null);
});
test('parseStopConditions falls back to defaults on garbage values', () => {
  const c = parseStopConditions('plateau_rounds: abc\nwallclock_cap: xyz');
  assert.equal(c.plateauRounds, 20);
  assert.equal(c.wallclockCapMs, 28800000);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test hooks/scripts/lib/autoloop.test.mjs`
Expected: FAIL — `parseDurationMs`/`parseStopConditions` not exported.

- [ ] **Step 3: Add the implementation** (append to `autoloop.mjs`)

```js
/** Parse a duration like "500ms" | "30s" | "5m" | "8h" | "45" (bare = seconds) → ms, else null. */
export function parseDurationMs(s) {
  if (typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);
  if (!m) return null;
  const val = Number(m[1]);
  const mult = { ms: 1, s: 1000, m: 60000, h: 3600000 }[(m[2] || 's').toLowerCase()];
  return val * mult;
}

const DEFAULT_PLATEAU = 20;
const DEFAULT_WALLCLOCK_MS = 8 * 3600000;

/** Extract stop conditions from INSTRUCTIONS text. Missing/garbage → safe defaults. */
export function parseStopConditions(text) {
  const get = (key) => {
    const re = new RegExp(`^\\s*[-*]?\\s*${key}\\s*[:=]\\s*(.+)$`, 'im');
    const m = typeof text === 'string' ? text.match(re) : null;
    return m ? m[1].trim() : null;
  };
  const targetRaw = get('target_score');
  const plateauRaw = get('plateau_rounds');
  const capRaw = get('wallclock_cap');

  const target = targetRaw && !/^none$/i.test(targetRaw) ? Number(targetRaw) : null;
  const plateau = plateauRaw != null ? parseInt(plateauRaw, 10) : DEFAULT_PLATEAU;
  const capMs = capRaw != null ? parseDurationMs(capRaw) : DEFAULT_WALLCLOCK_MS;

  return {
    targetScore: Number.isFinite(target) ? target : null,
    plateauRounds: Number.isInteger(plateau) && plateau > 0 ? plateau : DEFAULT_PLATEAU,
    wallclockCapMs: Number.isFinite(capMs) && capMs > 0 ? capMs : DEFAULT_WALLCLOCK_MS,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test hooks/scripts/lib/autoloop.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/scripts/lib/autoloop.mjs hooks/scripts/lib/autoloop.test.mjs
git commit -m "feat(autoloop): stop-conditions + duration parser

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Results ledger formatting (TDD)

**Files:**
- Modify: `hooks/scripts/lib/autoloop.mjs`
- Modify: `hooks/scripts/lib/autoloop.test.mjs`

- [ ] **Step 1: Add the failing tests**

```js
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RESULTS_HEADER, formatResultRow, appendResult } from './autoloop.mjs';

test('RESULTS_HEADER is the agreed tab-separated schema', () => {
  assert.equal(RESULTS_HEADER, 'round\tref\tscore\tdelta\tcost_s\tstatus\tchange');
});
test('formatResultRow: baseline row has NA delta and 6dp score', () => {
  const row = formatResultRow({ round: 0, ref: 'r0', score: 0.9979, delta: null, costS: 312.4, status: 'baseline', change: 'baseline as-is' });
  assert.equal(row, '0\tr0\t0.997900\tNA\t312.4\tbaseline\tbaseline as-is');
});
test('formatResultRow: keep row shows signed delta', () => {
  const row = formatResultRow({ round: 1, ref: 'a1b2c3d', score: 0.9932, delta: -0.0047, costS: 305.1, status: 'keep', change: 'raise LR' });
  assert.equal(row, '1\ta1b2c3d\t0.993200\t-0.004700\t305.1\tkeep\traise LR');
});
test('formatResultRow: crash row is NA score + NA delta', () => {
  const row = formatResultRow({ round: 3, ref: 'r3', score: null, delta: null, costS: 14.2, status: 'crash', change: 'OOM' });
  assert.equal(row, '3\tr3\tNA\tNA\t14.2\tcrash\tOOM');
});
test('formatResultRow: sanitizes tabs/newlines in change + ref', () => {
  const row = formatResultRow({ round: 2, ref: 'r2', score: 1.0, delta: 0.5, costS: 1, status: 'revert', change: 'tried\tA\nand B' });
  assert.equal(row, '2\tr2\t1.000000\t+0.500000\t1.0\trevert\ttried A and B');
});
test('appendResult writes a trailing-newline row to the tsv', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autoloop-'));
  const tsv = join(dir, 'RESULTS.tsv');
  appendResult(tsv, { round: 0, ref: 'r0', score: 1.0, delta: null, costS: 1, status: 'baseline', change: 'x' });
  assert.match(readFileSync(tsv, 'utf8'), /^0\tr0\t1\.000000\tNA\t1\.0\tbaseline\tx\n$/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test hooks/scripts/lib/autoloop.test.mjs`
Expected: FAIL — ledger exports missing.

- [ ] **Step 3: Add the implementation** (append to `autoloop.mjs`; add the fs import at the TOP of the file)

At the top of `autoloop.mjs`, add the import line:
```js
import { appendFileSync } from 'node:fs';
```
Append the functions:
```js
export const RESULTS_HEADER = 'round\tref\tscore\tdelta\tcost_s\tstatus\tchange';

function tsvSafe(s) {
  return String(s).replace(/[\t\r\n]+/g, ' ').trim();
}

/** Format one ledger row. score/delta null|NaN → "NA"; score 6dp; delta signed 6dp; cost 1dp. */
export function formatResultRow({ round, ref, score, delta, costS, status, change }) {
  const naNum = (v, dp, signed) => {
    if (v == null || Number.isNaN(v)) return 'NA';
    const s = Number(v).toFixed(dp);
    return signed && v >= 0 ? `+${s}` : s;
  };
  return [
    String(round),
    tsvSafe(ref),
    naNum(score, 6, false),
    naNum(delta, 6, true),
    naNum(costS, 1, false),
    tsvSafe(status),
    tsvSafe(change),
  ].join('\t');
}

/** Append a formatted ledger row (with trailing newline) to the RESULTS.tsv at `tsvPath`. */
export function appendResult(tsvPath, row) {
  appendFileSync(tsvPath, formatResultRow(row) + '\n');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test hooks/scripts/lib/autoloop.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/scripts/lib/autoloop.mjs hooks/scripts/lib/autoloop.test.mjs
git commit -m "feat(autoloop): RESULTS.tsv ledger row formatting

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Integrity check — hashFiles + assertUnchanged (TDD)

**Files:**
- Modify: `hooks/scripts/lib/autoloop.mjs`
- Modify: `hooks/scripts/lib/autoloop.test.mjs`

- [ ] **Step 1: Add the failing tests**

```js
import { writeFileSync } from 'node:fs';
import { hashFiles, assertUnchanged } from './autoloop.mjs';

test('hashFiles hashes present files and marks missing as null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autoloop-h-'));
  const a = join(dir, 'a.md');
  writeFileSync(a, 'hello');
  const missing = join(dir, 'gone.md');
  const h = hashFiles([a, missing]);
  assert.equal(typeof h[a], 'string');
  assert.equal(h[a].length, 64);
  assert.equal(h[missing], null);
});

test('assertUnchanged is ok when nothing changed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autoloop-h-'));
  const a = join(dir, 'INSTRUCTIONS.md');
  writeFileSync(a, 'goal');
  const baseline = hashFiles([a]);
  assert.deepEqual(assertUnchanged([a], baseline), { ok: true, changed: [] });
});

test('assertUnchanged flags a tampered file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autoloop-h-'));
  const a = join(dir, 'SCORING.sh');
  writeFileSync(a, 'echo 1');
  const baseline = hashFiles([a]);
  writeFileSync(a, 'echo 0   # moved the goalposts');
  const res = assertUnchanged([a], baseline);
  assert.equal(res.ok, false);
  assert.deepEqual(res.changed, [a]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test hooks/scripts/lib/autoloop.test.mjs`
Expected: FAIL — `hashFiles`/`assertUnchanged` not exported.

- [ ] **Step 3: Add the implementation** (add `node:crypto` + `readFileSync` imports at top; append functions)

At the top, extend the fs import and add crypto:
```js
import { appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
```
Append:
```js
/** sha256 each path; unreadable/missing → null. */
export function hashFiles(paths) {
  const out = {};
  for (const p of paths) {
    try { out[p] = createHash('sha256').update(readFileSync(p)).digest('hex'); }
    catch { out[p] = null; }
  }
  return out;
}

/** Compare current hashes to a baseline map. Used to detect any edit to INSTRUCTIONS/SCORING. */
export function assertUnchanged(paths, baseline) {
  const now = hashFiles(paths);
  const changed = paths.filter((p) => now[p] !== baseline[p]);
  return { ok: changed.length === 0, changed };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test hooks/scripts/lib/autoloop.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/scripts/lib/autoloop.mjs hooks/scripts/lib/autoloop.test.mjs
git commit -m "feat(autoloop): file-integrity hashing + assertUnchanged

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Mode detection — git vs snapshot (TDD)

**Files:**
- Modify: `hooks/scripts/lib/autoloop.mjs`
- Modify: `hooks/scripts/lib/autoloop.test.mjs`

- [ ] **Step 1: Add the failing tests**

```js
import { execFileSync } from 'node:child_process';
import { detectMode } from './autoloop.mjs';

test('detectMode returns "git" inside a git work-tree', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autoloop-git-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  assert.equal(detectMode(dir), 'git');
});
test('detectMode returns "snapshot" outside git', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autoloop-nogit-'));
  assert.equal(detectMode(dir), 'snapshot');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test hooks/scripts/lib/autoloop.test.mjs`
Expected: FAIL — `detectMode` not exported.

- [ ] **Step 3: Add the implementation** (add `execFileSync` import at top; append function)

At the top add:
```js
import { execFileSync } from 'node:child_process';
```
Append:
```js
/** "git" if `dir` is inside a git work-tree, else "snapshot". */
export function detectMode(dir) {
  try {
    const out = execFileSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out === 'true' ? 'git' : 'snapshot';
  } catch {
    return 'snapshot';
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test hooks/scripts/lib/autoloop.test.mjs`
Expected: PASS. (The `/var/folders` temp dir is not inside a git repo, so the negative case holds.)

- [ ] **Step 5: Commit**

```bash
git add hooks/scripts/lib/autoloop.mjs hooks/scripts/lib/autoloop.test.mjs
git commit -m "feat(autoloop): git-vs-snapshot mode detection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Snapshot save / promote / restore (TDD)

**Files:**
- Modify: `hooks/scripts/lib/autoloop.mjs`
- Modify: `hooks/scripts/lib/autoloop.test.mjs`

- [ ] **Step 1: Add the failing tests**

```js
import { mkdirSync } from 'node:fs';
import { snapshotSave, snapshotPromoteBest, snapshotRestoreBest } from './autoloop.mjs';

function projectFixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'autoloop-proj-'));
  const runDir = join(cwd, '.memory', 'autoloop', 'jun15');
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(cwd, 'asset.txt'), 'v0');
  return { cwd, runDir };
}

test('snapshotSave copies the asset into rounds/NNN preserving relative path', () => {
  const { cwd, runDir } = projectFixture();
  const dest = snapshotSave(runDir, 0, ['asset.txt'], cwd);
  assert.equal(readFileSync(join(dest, 'asset.txt'), 'utf8'), 'v0');
  assert.match(dest, /rounds\/000$/);
});

test('snapshotPromoteBest copies a round into best/', () => {
  const { cwd, runDir } = projectFixture();
  snapshotSave(runDir, 2, ['asset.txt'], cwd);
  const best = snapshotPromoteBest(runDir, 2, ['asset.txt']);
  assert.equal(readFileSync(join(best, 'asset.txt'), 'utf8'), 'v0');
});

test('snapshotRestoreBest overwrites a changed asset with best/', () => {
  const { cwd, runDir } = projectFixture();
  snapshotSave(runDir, 0, ['asset.txt'], cwd);
  snapshotPromoteBest(runDir, 0, ['asset.txt']);
  writeFileSync(join(cwd, 'asset.txt'), 'EXPERIMENT THAT LOST');
  snapshotRestoreBest(runDir, ['asset.txt'], cwd);
  assert.equal(readFileSync(join(cwd, 'asset.txt'), 'utf8'), 'v0');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test hooks/scripts/lib/autoloop.test.mjs`
Expected: FAIL — snapshot functions not exported.

- [ ] **Step 3: Add the implementation** (extend imports with `mkdirSync`, `copyFileSync` and `dirname`; append functions)

At the top, extend the fs import and add `dirname` to the path import:
```js
import { appendFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
```
Append:
```js
const pad = (n) => String(n).padStart(3, '0');

/** Copy each relPath (relative to cwd) into runDir/rounds/NNN/relPath. Returns the round dir. */
export function snapshotSave(runDir, round, relPaths, cwd) {
  const dest = join(runDir, 'rounds', pad(round));
  for (const rel of relPaths) {
    const to = join(dest, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(cwd, rel), to);
  }
  return dest;
}

/** Copy a saved round's files into runDir/best/. Returns the best dir. */
export function snapshotPromoteBest(runDir, round, relPaths) {
  const src = join(runDir, 'rounds', pad(round));
  const best = join(runDir, 'best');
  for (const rel of relPaths) {
    const to = join(best, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(src, rel), to);
  }
  return best;
}

/** Restore best/ back over the live asset paths (revert a losing experiment). */
export function snapshotRestoreBest(runDir, relPaths, cwd) {
  const best = join(runDir, 'best');
  for (const rel of relPaths) {
    const to = join(cwd, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(best, rel), to);
  }
}
```
Note: if `join`/`dirname` were already imported in an earlier task, just ensure the single import line at the top matches the combined set shown above (don't duplicate the import).

- [ ] **Step 4: Run to verify it passes**

Run: `node --test hooks/scripts/lib/autoloop.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/scripts/lib/autoloop.mjs hooks/scripts/lib/autoloop.test.mjs
git commit -m "feat(autoloop): snapshot save/promote/restore for non-git assets

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Run scaffolder + templates + entry script (TDD)

**Files:**
- Modify: `hooks/scripts/lib/autoloop.mjs`
- Modify: `hooks/scripts/lib/autoloop.test.mjs`
- Create: `hooks/scripts/autoloop-init.mjs`
- Create: `templates/autoloop/INSTRUCTIONS.md`, `templates/autoloop/SCORING.sh`, `templates/autoloop/RESULTS.tsv`

- [ ] **Step 1: Add the failing tests for the scaffolder**

```js
import { existsSync } from 'node:fs';
import { resolveAutoloopDir, scaffoldAutoloop, AUTOLOOP_FILES } from './autoloop.mjs';

function tplFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'autoloop-tpl-'));
  for (const f of AUTOLOOP_FILES) writeFileSync(join(dir, f), `# template ${f}\n`);
  return dir;
}

test('AUTOLOOP_FILES is the three-file system', () => {
  assert.deepEqual(AUTOLOOP_FILES, ['INSTRUCTIONS.md', 'SCORING.sh', 'RESULTS.tsv']);
});
test('resolveAutoloopDir nests under .memory/autoloop/<tag>', () => {
  assert.equal(resolveAutoloopDir('/p', 'jun15'), join('/p', '.memory', 'autoloop', 'jun15'));
});
test('scaffoldAutoloop creates all files when missing', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'autoloop-proj-'));
  const tpl = tplFixture();
  const res = scaffoldAutoloop(cwd, 'jun15', tpl);
  assert.deepEqual(res.created.sort(), [...AUTOLOOP_FILES].sort());
  assert.deepEqual(res.skipped, []);
  for (const f of AUTOLOOP_FILES) assert.ok(existsSync(join(res.dir, f)));
});
test('scaffoldAutoloop is idempotent and never overwrites', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'autoloop-proj-'));
  const tpl = tplFixture();
  const dir = resolveAutoloopDir(cwd, 'jun15');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'INSTRUCTIONS.md'), 'CUSTOM — keep me');
  const res = scaffoldAutoloop(cwd, 'jun15', tpl);
  assert.deepEqual(res.skipped, ['INSTRUCTIONS.md']);
  assert.equal(readFileSync(join(dir, 'INSTRUCTIONS.md'), 'utf8'), 'CUSTOM — keep me');
  const again = scaffoldAutoloop(cwd, 'jun15', tpl);
  assert.deepEqual(again.created, []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test hooks/scripts/lib/autoloop.test.mjs`
Expected: FAIL — scaffolder exports missing.

- [ ] **Step 3: Add the scaffolder** (append to `autoloop.mjs`; ensure `existsSync` is in the fs import)

Ensure the top fs import includes `existsSync`:
```js
import { appendFileSync, readFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
```
Append:
```js
export const AUTOLOOP_FILES = ['INSTRUCTIONS.md', 'SCORING.sh', 'RESULTS.tsv'];

export function resolveAutoloopDir(cwd, tag) {
  return join(cwd, '.memory', 'autoloop', tag);
}

/** Seed .memory/autoloop/<tag>/ from templates. Idempotent — never overwrites. */
export function scaffoldAutoloop(cwd, tag, templatesDir) {
  const dir = resolveAutoloopDir(cwd, tag);
  mkdirSync(dir, { recursive: true });
  const created = [];
  const skipped = [];
  for (const file of AUTOLOOP_FILES) {
    const dest = join(dir, file);
    if (existsSync(dest)) { skipped.push(file); continue; }
    copyFileSync(join(templatesDir, file), dest);
    created.push(file);
  }
  return { dir, created, skipped };
}
```

- [ ] **Step 4: Run to verify the scaffolder tests pass**

Run: `node --test hooks/scripts/lib/autoloop.test.mjs`
Expected: PASS (whole suite).

- [ ] **Step 5: Create the three templates**

`templates/autoloop/INSTRUCTIONS.md`:
```markdown
# Auto Research — Instructions (human-locked)

<!-- The agent NEVER edits this file or SCORING. Only you, the human, edit them. -->

## Goal
<one or two sentences: what asset are we optimizing, and why>

## Metric
- name: <e.g. val_bpb, load_ms, reply_rate>
- direction: minimize        <!-- minimize | maximize -->
- target_score: none         <!-- a number to stop at, or "none" -->

## Asset (the ONLY thing the agent may change)
- <relative/path/to/asset>   <!-- one or more lines; nothing outside these is writable -->

## Scoring
- file: SCORING.sh           <!-- run it; the loop reads the last number it prints -->

## Budget
- per_round: 5m              <!-- wall-clock; killed at 2x -> crash -->

## Stop conditions
- target_score: none
- plateau_rounds: 20
- wallclock_cap: 8h

## Mode
- <git | snapshot>           <!-- set by /auto-research at setup -->

## Rules (locked)
- Change ONLY the asset path(s) above. One change per round.
- Never edit INSTRUCTIONS.md or SCORING.sh. Never change the definition of "better".
- Keep a winner; revert a loser to the last known-good. Log every round to RESULTS.tsv.
```

`templates/autoloop/SCORING.sh`:
```bash
#!/usr/bin/env bash
# Auto Research — SCORING (locked measuring stick).
# Contract: run this script; it must print exactly ONE number (the score) as the
# last numeric token on its last line. The agent may READ and RUN this file but
# must NEVER edit it. No moving the goalposts.
#
# Replace the body below with your real measurement (run tests, measure latency,
# bundle size, a benchmark, etc.) and echo the single resulting number.
set -euo pipefail
echo "ERROR: SCORING.sh not implemented — define your measurement and echo one number" >&2
exit 1
```

`templates/autoloop/RESULTS.tsv`:
```
round	ref	score	delta	cost_s	status	change
```
(That single line must be tab-separated and match `RESULTS_HEADER`.)

- [ ] **Step 6: Create the entry script `hooks/scripts/autoloop-init.mjs`**

```js
#!/usr/bin/env node
// memory-os: scaffold an Auto Research run directory (.memory/autoloop/<tag>/).
// Seeds INSTRUCTIONS.md / SCORING.sh / RESULTS.tsv from templates without overwriting.
// Usage: node autoloop-init.mjs <tag> [projectDir]
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scaffoldAutoloop } from './lib/autoloop.mjs';

const here = dirname(fileURLToPath(import.meta.url)); // hooks/scripts
const templatesDir = join(here, '..', '..', 'templates', 'autoloop');
const tag = process.argv[2];
const cwd = process.argv[3] || process.env.CLAUDE_PROJECT_DIR || process.cwd();

if (!tag) {
  console.error('usage: node autoloop-init.mjs <tag> [projectDir]');
  process.exit(1);
}

const { dir, created, skipped } = scaffoldAutoloop(cwd, tag, templatesDir);
if (created.length) {
  const kept = skipped.length ? ` (kept ${skipped.join(', ')})` : '';
  console.log(`auto-research: created ${created.join(', ')} in ${dir}${kept}`);
  console.log('Next: fill in INSTRUCTIONS.md (goal, metric, asset path(s)) and implement SCORING.sh.');
} else {
  console.log(`auto-research: run already scaffolded at ${dir} (${skipped.join(', ')}).`);
}
```

- [ ] **Step 7: Verify the entry script end-to-end in a throwaway dir**

Run:
```bash
TMP=$(mktemp -d) && node hooks/scripts/autoloop-init.mjs jun15 "$TMP" && ls "$TMP/.memory/autoloop/jun15" && head -1 "$TMP/.memory/autoloop/jun15/RESULTS.tsv"
```
Expected: prints the three files created; `ls` shows `INSTRUCTIONS.md SCORING.sh RESULTS.tsv`; the RESULTS header line prints `round	ref	score	delta	cost_s	status	change`.

- [ ] **Step 8: Commit**

```bash
git add hooks/scripts/lib/autoloop.mjs hooks/scripts/lib/autoloop.test.mjs hooks/scripts/autoloop-init.mjs templates/autoloop
git commit -m "feat(autoloop): run scaffolder, entry script, and three-file templates

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: The skill — `auto-research-engineer/SKILL.md`

**Files:**
- Create: `skills/auto-research-engineer/SKILL.md`

This is the loop contract (the "program") — agent-driven prose, no unit test. Verified by content review + the markdown lint in Task 10.

- [ ] **Step 1: Create `skills/auto-research-engineer/SKILL.md`**

```markdown
---
name: auto-research-engineer
description: Use to autonomously optimize ONE asset against a single objective metric — change it, score it with a locked measuring stick, keep the winner / revert the loser, log each round, and repeat overnight until a target/plateau/wall-clock stop. Adapted from Karpathy's autoresearch loop.
---

# Auto Research Engineer

You optimize ONE asset toward ONE number. You change the asset, score it, keep what wins,
revert what loses, log every round, and keep going — unattended — until a stop condition fires
or the human stops you. The three-file system lives in `.memory/autoloop/<tag>/`.

## The three files
- **INSTRUCTIONS.md** — the goal, the metric (+direction +target), the asset path(s), the budget,
  the stop conditions, the rules. **Human-locked: you never edit it.**
- **SCORING.sh** — the locked measuring stick. Run it; read the single number it prints (the last
  numeric token on its last line). **You may read and run it; you must NEVER edit it. No moving the
  goalposts — the definition of "better" is fixed.**
- **RESULTS.tsv** — the ledger you append to. Columns: `round  ref  score  delta  cost_s  status  change`.

## Setup (only if not already scaffolded — normally `/auto-research` did this)
Scaffold with `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/autoloop-init.mjs <tag>`, then help the
human fill INSTRUCTIONS.md and implement SCORING.sh. Run the FIT CHECK below before looping.

## FIT CHECK (run before the first loop; be honest)
A target is only worth optimizing if all three MUST-HAVES hold:
1. **Objectively scored** — a real number, not "make it look nicer".
2. **Fast feedback** — minutes/hours, not weeks (no SEO-reindex / multi-month churn).
3. **Write access** — you can actually change the asset (a file/API, not a published video).
NICE-TO-HAVES (more = more powerful): high feedback volume; cheap to fail; a consistent,
repeatable measuring stick. **If a must-have fails, say so plainly and propose a better-shaped
target instead of pretending.**

## Mode (set in INSTRUCTIONS)
- **git** — the asset is in a git repo: work on branch `autoresearch/<tag>`, commit each kept round,
  `git reset --hard` to revert a loser.
- **snapshot** — not in git: before each change, the current best lives in `.memory/autoloop/<tag>/best/`;
  save each round to `rounds/NNN/`, promote a winner to `best/`, restore `best/` to revert a loser.

## The loop — repeat until a stop condition fires
1. **Integrity check.** Re-hash INSTRUCTIONS.md + SCORING.sh; confirm YOU have not changed them. If
   the human changed them mid-run, reload and announce it.
2. **Baseline (round 0).** Score the asset as-is (no change). Record it as the current best.
3. **One hypothesis, one change.** Edit ONLY the declared asset path(s). Never touch any other file.
4. **Score.** Run `SCORING.sh` within the per-round budget; read the single number. If it exceeds 2×
   the budget, kill it and treat the round as a crash.
5. **Decide** (direction from INSTRUCTIONS):
   - better than best → **keep**: commit (git) or promote snapshot to `best/`. New best.
   - not better → **revert**: `git reset --hard` (git) or restore `best/` (snapshot).
   - crashed / non-numeric → if trivially fixable (typo, missing import) fix and retry once; else
     **crash**: revert and move on.
6. **Log** one row to RESULTS.tsv (`status` = baseline|keep|revert|crash). Append a one-line note to
   `.memory/JOURNAL.md` and update `.memory/STATE.md` (`Now` = "auto-research <tag>, best=<score>").
7. **Check stop conditions** from INSTRUCTIONS: target_score reached, `plateau_rounds` consecutive
   non-improvements, or `wallclock_cap` elapsed. If any fired → STOP and summarize. Otherwise loop.

## Autonomy & guardrails
- **Do not ask "should I continue?"** Once looping, run unattended until a stop condition or the human
  interrupts. This intentionally overrides memory-os's `break_at` checkpoint nudge for the run.
- **Write only the declared asset path(s).** Never edit INSTRUCTIONS.md or SCORING.sh.
- **Every loser reverts to a known-good state** — never leave the asset broken.
- **Bounded:** the stop conditions guarantee the run ends; never loop truly forever.

## On finishing
Summarize: rounds run, baseline → best, total improvement, and where the winning asset lives
(git branch HEAD or `best/`). Offer to write a short report of the rounds.
```

- [ ] **Step 2: Sanity-check the frontmatter + plugin discovery**

Run:
```bash
head -4 skills/auto-research-engineer/SKILL.md
```
Expected: shows the `---` frontmatter with `name: auto-research-engineer` and a `description:` line (matches how the other `skills/*/SKILL.md` files are shaped).

- [ ] **Step 3: Commit**

```bash
git add skills/auto-research-engineer/SKILL.md
git commit -m "feat(autoloop): auto-research-engineer skill (the loop contract)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: The command — `/auto-research`

**Files:**
- Create: `commands/auto-research.md`

- [ ] **Step 1: Create `commands/auto-research.md`**

```markdown
---
description: Set up and start an autonomous optimization loop — optimize ONE asset toward ONE number, overnight, keeping winners and reverting losers.
---

Become the user's Auto Research Engineer and stand up an optimization run.

1. **Greet + confirm the deal**, in your own words:
   "Hi, I'm now your Auto Research Engineer. We pick ONE thing, turn 'is it good?' into a single
   honest number, and then I work all night changing it, scoring it, keeping what wins and trashing
   what loses." Then walk the user through setup.
2. **Interview** the user: which asset do we optimize? Get the file path(s) / repo / access. Define
   ONE objective metric (a single number) and its direction (minimize or maximize).
3. **Run the FIT CHECK** (see the `auto-research-engineer` skill): must-haves = objectively scored,
   fast feedback, write access; nice-to-haves = volume, cheap-to-fail, consistent measuring stick.
   If a must-have fails, say so honestly and propose a better-shaped target — do not proceed.
4. **Scaffold the run**: agree a tag (default: today's date, e.g. `jun15`). Run
   `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/autoloop-init.mjs <tag>`. Then fill in
   `.memory/autoloop/<tag>/INSTRUCTIONS.md` from the interview, and implement
   `.memory/autoloop/<tag>/SCORING.sh` so it prints the single metric number. Get the user to
   confirm SCORING is correct — once confirmed it is locked; you never edit it again.
5. **Set the mode**: if the asset is inside a git repo, create branch `autoresearch/<tag>` and
   record `Mode: git` in INSTRUCTIONS; otherwise record `Mode: snapshot`.
6. **Confirm and go.** Append a JOURNAL line, set STATE `Now`, then follow the
   `auto-research-engineer` skill's loop. Do not pause to ask "should I continue?" once looping.

If `.memory/` does not exist yet, suggest running `/memory-init` first so the run can narrate into
STATE/JOURNAL.
```

- [ ] **Step 2: Sanity-check**

Run:
```bash
head -3 commands/auto-research.md && ls commands/
```
Expected: frontmatter `description:` present; `commands/` now lists `auto-research.md` alongside `checkpoint.md`, `memory-init.md`.

- [ ] **Step 3: Commit**

```bash
git add commands/auto-research.md
git commit -m "feat(autoloop): /auto-research command (setup + fit-check + start)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Proactive prompt + docs + version bump

**Files:**
- Modify: `skills/situational-suggestions/SKILL.md`
- Modify: `README.md`
- Modify: `docs/manual.html`
- Modify: `package.json`, `.claude-plugin/plugin.json`

- [ ] **Step 1: Add the post-baseline row to `situational-suggestions`**

In `skills/situational-suggestions/SKILL.md`, add this row to the situation table (after the existing rows, before the closing prose):
```markdown
| Project has `.memory/` and STATE shows a phase or the Definition of Done **met** (a runnable baseline exists) **and** an objective dimension is in play (tests pass but could be faster, bundle size, latency, cost, a benchmark) | "You've got a working baseline and something measurable — want to spin up an Auto Research loop (`/auto-research`) to optimize it overnight?" | Agent-facing. Propose **once per situation**; if declined, do not repeat. |
```

- [ ] **Step 2: Document the optimize loop in `README.md`**

Add this section to `README.md` after the "## The loop" section:
```markdown
## The optimize loop (Auto Research)
Once you have a working baseline and a single objective number to push, `/auto-research` stands up
an autonomous optimization run under `.memory/autoloop/<tag>/`: a human-locked **INSTRUCTIONS.md**
(goal + metric + asset path + stop conditions), a locked **SCORING.sh** measuring stick (prints one
number; the agent never edits it), and a **RESULTS.tsv** ledger. The `auto-research-engineer` skill
then loops unattended — change → score → keep the winner / revert the loser → log — until a target,
a plateau, or a wall-clock cap is hit. Keep/revert uses a git branch when the asset is in git, else
file snapshots. `situational-suggestions` offers this automatically once a measurable baseline exists.
```

- [ ] **Step 3: Add a short section to `docs/manual.html`**

Open `docs/manual.html`, find where the existing loop / optional modules are documented, and add a
short `<h2>` + paragraph mirroring the README section above (same wording, HTML-formatted to match
the surrounding markup — e.g. `<h2>The optimize loop (Auto Research)</h2><p>…</p>`). Match the
file's existing heading style and any table-of-contents anchor pattern already in use.

- [ ] **Step 4: Bump the version to 0.4.0**

In `package.json`, change `"version": "0.3.0"` → `"version": "0.4.0"`.
In `.claude-plugin/plugin.json`, if it carries a `"version"` field, set it to `0.4.0` too (read the
file first; if it has no version field, leave it).

- [ ] **Step 5: Verify nothing else regressed**

Run:
```bash
npm test
grep -n "auto-research" README.md skills/situational-suggestions/SKILL.md
grep -n '"version"' package.json
```
Expected: full suite passes; the grep shows the new README section + situational-suggestions row; version reads `0.4.0`.

- [ ] **Step 6: Commit**

```bash
git add skills/situational-suggestions/SKILL.md README.md docs/manual.html package.json .claude-plugin/plugin.json
git commit -m "feat(autoloop): proactive prompt, docs, and v0.4.0 bump

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all `hooks/scripts/**/*.test.mjs` pass — the pre-existing `flush`/`rehydrate`/`memory` tests plus the new `autoloop` suite (Tasks 1–7).

- [ ] **Step 2: End-to-end scaffolder dry-run + idempotency**

Run:
```bash
TMP=$(mktemp -d)
node hooks/scripts/autoloop-init.mjs jun15 "$TMP"
node hooks/scripts/autoloop-init.mjs jun15 "$TMP"   # second run = idempotent
cat "$TMP/.memory/autoloop/jun15/INSTRUCTIONS.md" | head -5
```
Expected: first run creates the three files; second run reports "already scaffolded" and does NOT overwrite; INSTRUCTIONS shows the template header.

- [ ] **Step 3: Confirm plugin file shapes**

Run:
```bash
ls commands/ skills/ templates/autoloop/
head -4 skills/auto-research-engineer/SKILL.md
head -3 commands/auto-research.md
```
Expected: `commands/auto-research.md` present; `skills/auto-research-engineer/SKILL.md` present with valid frontmatter; `templates/autoloop/` has the three files.

- [ ] **Step 4: Finalize the branch**

Run:
```bash
git status
git --no-pager log --oneline 46b982a..HEAD
```
Then use the `superpowers:finishing-a-development-branch` skill to decide merge/PR/push.

---

## Self-Review (completed during planning)

**Spec coverage:**
- Three-file system + RESULTS schema → Tasks 3 (schema), 7 (templates). INSTRUCTIONS/SCORING/RESULTS templates → Task 7.
- Scalar-from-command gate → `extractScore` + `isBetter` (Task 1); SCORING contract (Task 7 template + Task 8 skill).
- Auto-detect git/snapshot keep-revert → `detectMode` (Task 5) + snapshots (Task 6) + skill mode section (Task 8).
- Unattended + stop conditions → `parseStopConditions` (Task 2) + skill loop/guardrails (Task 8).
- Guardrails (asset-only writes, locked-file assert, always-recoverable, override break_at) → `assertUnchanged` (Task 4) + skill (Task 8).
- FIT CHECK → skill (Task 8) + command (Task 9).
- Setup flow → command (Task 9) + scaffolder (Task 7).
- Proactive post-baseline prompt → situational-suggestions row (Task 10).
- Ledger append + JOURNAL/STATE narration → `appendResult` (Task 3) + skill steps (Task 8).
- Version 0.4.0, README, manual → Task 10. Tests → all code tasks + Task 11. Acronizer = out of scope (RESULTS schema fixed in Task 3 is the only contract).

**Placeholder scan:** No TBD/"handle errors" placeholders — every code/test step is concrete; the one inherently-bespoke artifact (SCORING.sh body) is intentionally a stub the human fills, which is the spec's design, not a plan gap. The manual.html edit (Task 10 Step 3) describes matching existing markup rather than pasting exact HTML because the surrounding structure is unknown — it points at the README wording to copy.

**Type/name consistency:** `RESULTS_HEADER` (Task 3) === the `templates/autoloop/RESULTS.tsv` header (Task 7) === the schema the skill/command reference (Tasks 8–9) === the Acronizer contract in the spec. `AUTOLOOP_FILES = ['INSTRUCTIONS.md','SCORING.sh','RESULTS.tsv']` (Task 7) matches the templates created and the scaffolder. `extractScore`/`isBetter`/`parseStopConditions`/`appendResult`/`assertUnchanged`/`detectMode`/`snapshotSave`/`snapshotPromoteBest`/`snapshotRestoreBest`/`scaffoldAutoloop`/`resolveAutoloopDir` are each defined once and referenced consistently. The incremental import lines across Tasks 1–7 converge on a single top-of-file import set — Task 6 and Task 7 explicitly note "ensure the combined import line matches; don't duplicate."
```
