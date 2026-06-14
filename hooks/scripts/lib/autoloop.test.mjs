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

import { mkdirSync, existsSync } from 'node:fs';
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
