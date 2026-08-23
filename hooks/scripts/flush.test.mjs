import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'flush.mjs');

function run(cwd) {
  const stdin = JSON.stringify({ hook_event_name: 'PreCompact', cwd });
  return execFileSync('node', [script], { input: stdin }).toString();
}

function projectWithState() {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-fl-'));
  const mem = join(cwd, '.memory');
  mkdirSync(mem, { recursive: true });
  writeFileSync(join(mem, 'STATE.md'), '# State\n## Now\nPhase 3/5');
  writeFileSync(join(mem, 'JOURNAL.md'), '# Journal\n');
  return { cwd, mem };
}

test('flush appends a compaction marker to JOURNAL.md', () => {
  const { cwd, mem } = projectWithState();
  run(cwd);
  assert.match(readFileSync(join(mem, 'JOURNAL.md'), 'utf8'), /compaction/i);
});

test('flush deduplicates consecutive compaction markers', () => {
  const { cwd, mem } = projectWithState();
  run(cwd);
  run(cwd);
  const body = readFileSync(join(mem, 'JOURNAL.md'), 'utf8');
  assert.equal((body.match(/↻ compaction/g) || []).length, 1);
});

test('flush re-injects STATE as PreCompact additionalContext', () => {
  const { cwd } = projectWithState();
  const json = JSON.parse(run(cwd));
  assert.equal(json.hookSpecificOutput.hookEventName, 'PreCompact');
  assert.match(json.hookSpecificOutput.additionalContext, /Phase 3\/5/);
});

test('flush does not crash when .memory is absent', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-fl-empty-'));
  const json = JSON.parse(run(cwd));
  assert.equal(json.hookSpecificOutput.additionalContext, '');
});

test('flush refuses to write through a project-controlled .memory symlink', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-fl-link-'));
  const outside = mkdtempSync(join(tmpdir(), 'memos-fl-outside-'));
  const journal = join(outside, 'JOURNAL.md');
  writeFileSync(join(outside, 'STATE.md'), 'SECRET OUTSIDE STATE');
  writeFileSync(journal, '# Journal\n');
  symlinkSync(outside, join(cwd, '.memory'));
  const json = JSON.parse(run(cwd));
  assert.equal(json.hookSpecificOutput.additionalContext, '');
  assert.equal(readFileSync(journal, 'utf8'), '# Journal\n');
});
