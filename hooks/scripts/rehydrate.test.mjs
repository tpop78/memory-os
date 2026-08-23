import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
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

test('rehydrate refuses to read through a project-controlled .memory symlink', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-rh-link-'));
  const outside = mkdtempSync(join(tmpdir(), 'memos-rh-outside-'));
  writeFileSync(join(outside, 'STATE.md'), 'SECRET OUTSIDE STATE');
  symlinkSync(outside, join(cwd, '.memory'));
  const json = JSON.parse(run(cwd));
  assert.equal(json.hookSpecificOutput.additionalContext, '');
});

test('does not auto-init .memory in a fresh git repo by default', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-ai-'));
  execFileSync('git', ['init'], { cwd, stdio: 'ignore' });
  const json = JSON.parse(run(cwd));
  assert.equal(json.hookSpecificOutput.additionalContext, '');
  assert.ok(!existsSync(join(cwd, '.memory')));
});

test('auto-inits .memory only when MEMORY_OS_AUTO_INIT=on', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-aion-'));
  execFileSync('git', ['init'], { cwd, stdio: 'ignore' });
  mkdirSync(join(cwd, '.codegraph'), { recursive: true });
  const json = JSON.parse(run(cwd, { MEMORY_OS_AUTO_INIT: 'on' }));
  assert.match(json.hookSpecificOutput.additionalContext, /scaffolded \.memory loop/);
  assert.ok(existsSync(join(cwd, '.memory', 'STATE.md')));
});

test('auto-init notice and rehydrated context together stay within the configured cap', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'memos-aicap-'));
  execFileSync('git', ['init'], { cwd, stdio: 'ignore' });
  const json = JSON.parse(run(cwd, {
    MEMORY_OS_AUTO_INIT: 'on',
    MEMORY_OS_SESSION_START_MAX_CHARS: '40',
  }));
  assert.ok(json.hookSpecificOutput.additionalContext.length <= 40);
});
