import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'headroom-learn.mjs');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'memos-headroom-'));
  const binDir = join(root, '.local', 'bin');
  const marker = join(root, 'called.txt');
  mkdirSync(binDir, { recursive: true });
  const fake = join(binDir, 'headroom');
  writeFileSync(fake, '#!/bin/sh\nprintf "%s" "$*" > "$MEMORY_OS_TEST_MARKER"\n');
  chmodSync(fake, 0o755);
  return { root, marker };
}

function run({ root, marker }, env = {}) {
  const project = join(root, 'project');
  mkdirSync(project, { recursive: true });
  const input = JSON.stringify({ hook_event_name: 'Stop', cwd: project });
  execFileSync('node', [script], {
    input,
    env: { ...process.env, HOME: root, MEMORY_OS_TEST_MARKER: marker, ...env },
  });
  return project;
}

test('Headroom learning is disabled by default', () => {
  const f = fixture();
  run(f);
  assert.equal(existsSync(f.marker), false);
});

test('Headroom learning requires explicit opt-in and uses hook cwd', () => {
  const f = fixture();
  const project = run(f, { MEMORY_OS_HEADROOM_LEARN: 'on' });
  assert.match(readFileSync(f.marker, 'utf8'), new RegExp(`learn --apply --project ${project}$`));
});
