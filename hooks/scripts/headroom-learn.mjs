#!/usr/bin/env node
// Mine the just-ended Claude session for failures → writes fixes to CLAUDE.md / AGENTS.md
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const candidates = [
  join(homedir(), '.local', 'bin', 'headroom'),
  '/opt/homebrew/bin/headroom',
  '/usr/local/bin/headroom',
];
const headroom = candidates.find(existsSync);
if (!headroom) process.exit(0); // not installed — skip silently

const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();
spawnSync(headroom, ['learn', '--apply', '--project', project], {
  stdio: 'inherit',
  timeout: 60_000,
});
