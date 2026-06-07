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

import { tailJournal, appendJournal } from './memory.mjs';

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
