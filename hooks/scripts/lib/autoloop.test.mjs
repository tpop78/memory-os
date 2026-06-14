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
