import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveMemoryDir, readState, planExists } from './memory.mjs';

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-'));
  const mem = join(cwd, '.memory');
  mkdirSync(mem, { recursive: true });
  return { cwd, mem };
}

test('resolveMemoryDir appends .memory', () => {
  assert.equal(resolveMemoryDir('/a/b'), join('/a/b', '.memory'));
});

test('readState returns null when STATE.md is absent', () => {
  const { mem } = fixture();
  assert.equal(readState(mem), null);
});

test('readState returns file contents when present', () => {
  const { mem } = fixture();
  writeFileSync(join(mem, 'STATE.md'), '# State\n## Now\nPhase 1');
  assert.match(readState(mem), /Phase 1/);
});

test('planExists reflects PLAN.md presence', () => {
  const { mem } = fixture();
  assert.equal(planExists(mem), false);
  writeFileSync(join(mem, 'PLAN.md'), '# Plan');
  assert.equal(planExists(mem), true);
});

import { tailJournal, appendJournal, appendCompactionMarker } from './memory.mjs';

test('tailJournal returns empty string when JOURNAL.md absent', () => {
  const { mem } = fixture();
  assert.equal(tailJournal(mem, 5), '');
});

test('tailJournal returns last n non-empty lines', () => {
  const { mem } = fixture();
  writeFileSync(join(mem, 'JOURNAL.md'), 'a\n\nb\nc\nd\n');
  assert.equal(tailJournal(mem, 2), 'c\nd');
});

test('appendJournal adds a line and creates the file if needed', () => {
  const { mem } = fixture();
  appendJournal(mem, 'first');
  appendJournal(mem, 'second');
  const body = readFileSync(join(mem, 'JOURNAL.md'), 'utf8');
  assert.match(body, /first\nsecond\n$/);
});

test('appendCompactionMarker suppresses consecutive markers inside the dedupe window', () => {
  const { mem } = fixture();
  writeFileSync(join(mem, 'JOURNAL.md'), '# Journal\n');

  assert.equal(appendCompactionMarker(mem, new Date('2026-08-23T01:00:00.000Z')), true);
  assert.equal(appendCompactionMarker(mem, new Date('2026-08-23T01:01:00.000Z')), false);

  const body = readFileSync(join(mem, 'JOURNAL.md'), 'utf8');
  assert.equal((body.match(/↻ compaction/g) || []).length, 1);
});

test('appendCompactionMarker records a new marker after meaningful journal activity', () => {
  const { mem } = fixture();
  writeFileSync(join(mem, 'JOURNAL.md'), '# Journal\n');
  appendCompactionMarker(mem, new Date('2026-08-23T01:00:00.000Z'));
  appendJournal(mem, '2026-08-23T01:01:00.000Z — completed a phase');

  assert.equal(appendCompactionMarker(mem, new Date('2026-08-23T01:02:00.000Z')), true);
  const body = readFileSync(join(mem, 'JOURNAL.md'), 'utf8');
  assert.equal((body.match(/↻ compaction/g) || []).length, 2);
});

import { scaffoldMemory, MEMORY_FILES } from './memory.mjs';

function templatesFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'memos-tpl-'));
  for (const f of MEMORY_FILES) writeFileSync(join(dir, f), `# template ${f}\n`);
  return dir;
}

test('scaffoldMemory creates all .memory files when missing', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-proj-'));
  const tpl = templatesFixture();
  const res = scaffoldMemory(cwd, tpl);
  assert.deepEqual(res.created.sort(), [...MEMORY_FILES].sort());
  assert.deepEqual(res.skipped, []);
  for (const f of MEMORY_FILES) {
    assert.match(readFileSync(join(cwd, '.memory', f), 'utf8'), new RegExp(`template ${f}`));
  }
});

test('scaffoldMemory is idempotent and never overwrites existing files', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-proj-'));
  const tpl = templatesFixture();
  mkdirSync(join(cwd, '.memory'), { recursive: true });
  writeFileSync(join(cwd, '.memory', 'STATE.md'), 'CUSTOM STATE — keep me');

  const res = scaffoldMemory(cwd, tpl);
  assert.ok(res.created.includes('PLAN.md') && res.created.includes('JOURNAL.md'));
  assert.deepEqual(res.skipped, ['STATE.md']);
  assert.equal(readFileSync(join(cwd, '.memory', 'STATE.md'), 'utf8'), 'CUSTOM STATE — keep me');

  const again = scaffoldMemory(cwd, tpl);
  assert.deepEqual(again.created, []);
  assert.deepEqual(again.skipped.sort(), [...MEMORY_FILES].sort());
});

import { getMaxChars, isEnabled, composeContext } from './memory.mjs';

test('getMaxChars defaults to 6000 and parses env', () => {
  assert.equal(getMaxChars({}), 6000);
  assert.equal(getMaxChars({ MEMORY_OS_SESSION_START_MAX_CHARS: '4000' }), 4000);
  assert.equal(getMaxChars({ MEMORY_OS_SESSION_START_MAX_CHARS: 'junk' }), 6000);
});

test('isEnabled is false only when explicitly off', () => {
  assert.equal(isEnabled({}), true);
  assert.equal(isEnabled({ MEMORY_OS_SESSION_START: 'on' }), true);
  assert.equal(isEnabled({ MEMORY_OS_SESSION_START: 'off' }), false);
});

test('composeContext returns empty string with no inputs', () => {
  assert.equal(composeContext({ state: null, journalTail: '', planExists: false, maxChars: 6000 }), '');
});

test('composeContext includes state and plan pointer', () => {
  const out = composeContext({ state: '## Now\nPhase 1', journalTail: 'did x', planExists: true, maxChars: 6000 });
  assert.match(out, /PLAN\.md/);
  assert.match(out, /Phase 1/);
  assert.match(out, /did x/);
});

test('composeContext stays within maxChars and marks truncation', () => {
  const big = 'x'.repeat(20000);
  const out = composeContext({ state: big, journalTail: '', planExists: false, maxChars: 6000 });
  assert.ok(out.length <= 6000, `length ${out.length} <= 6000`);
  assert.match(out, /\[truncated\]/);
});

test('composeContext honors caps shorter than the truncation marker', () => {
  const out = composeContext({ state: 'x'.repeat(100), journalTail: '', planExists: false, maxChars: 5 });
  assert.ok(out.length <= 5, `length ${out.length} <= 5`);
});

test('composeContext preserves next action and inventory before verbose done history', () => {
  const state = [
    '# State',
    '## Now',
    'Phase 4/5',
    '## Done (99/100)',
    'x'.repeat(3000),
    '## Remaining',
    '- final verification',
    '## Next action',
    'Run the release verification suite.',
    '## Blockers / decisions',
    '- no push',
  ].join('\n');
  const out = composeContext({ state, journalTail: 'old journal entry', planExists: true, maxChars: 700 });
  assert.ok(out.length <= 700);
  assert.match(out, /Run the release verification suite/);
  assert.match(out, /Already in context this session/);
  assert.doesNotMatch(out, /old journal entry/);
});

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
