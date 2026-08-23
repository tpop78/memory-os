#!/usr/bin/env node
// Optionally mine the just-ended session for failures. Disabled unless explicitly enabled.
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

if (process.env.MEMORY_OS_HEADROOM_LEARN !== 'on') process.exit(0);

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

const candidates = [
  join(homedir(), '.local', 'bin', 'headroom'),
  '/opt/homebrew/bin/headroom',
  '/usr/local/bin/headroom',
];
const headroom = candidates.find(existsSync);
if (!headroom) process.exit(0); // not installed — skip silently

const raw = await readStdin();
let input = {};
try { input = JSON.parse(raw || '{}'); } catch { input = {}; }
const project = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
spawnSync(headroom, ['learn', '--apply', '--project', project], {
  stdio: 'inherit',
  timeout: 25_000,
});
