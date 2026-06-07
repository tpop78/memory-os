import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'rehydrate.mjs');

function run(cwd, env = {}) {
  const stdin = JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd });
  const out = execFileSync('node', [script], { input: stdin, env: { ...process.env, ...env } });
  return out.toString();
}

function projectWithState() {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-rh-'));
  const mem = join(cwd, '.memory');
  mkdirSync(mem, { recursive: true });
  writeFileSync(join(mem, 'STATE.md'), '# State\n## Now\nPhase 2/5 — hooks');
  writeFileSync(join(mem, 'PLAN.md'), '# Plan\n## Definition of done\nround-trip works');
  return cwd;
}

test('rehydrate emits SessionStart additionalContext containing STATE', () => {
  const out = run(projectWithState());
  const json = JSON.parse(out);
  assert.equal(json.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(json.hookSpecificOutput.additionalContext, /Phase 2\/5/);
});

test('rehydrate emits empty additionalContext when disabled', () => {
  const out = run(projectWithState(), { MEMORY_OS_SESSION_START: 'off' });
  const json = JSON.parse(out);
  assert.equal(json.hookSpecificOutput.additionalContext, '');
});

test('rehydrate handles a project with no .memory dir', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-empty-'));
  const json = JSON.parse(run(cwd));
  assert.equal(json.hookSpecificOutput.additionalContext, '');
});
