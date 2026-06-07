import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export function resolveMemoryDir(cwd) {
  return join(cwd, '.memory');
}

function readFileSafe(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

export function readState(memoryDir) {
  return readFileSafe(join(memoryDir, 'STATE.md'));
}

export function planExists(memoryDir) {
  return existsSync(join(memoryDir, 'PLAN.md'));
}

export function tailJournal(memoryDir, n) {
  const body = readFileSafe(join(memoryDir, 'JOURNAL.md'));
  if (!body) return '';
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.slice(-n).join('\n');
}

export function appendJournal(memoryDir, line) {
  appendFileSync(join(memoryDir, 'JOURNAL.md'), `${line}\n`);
}

export function getMaxChars(env) {
  const n = Number.parseInt(env.MEMORY_OS_SESSION_START_MAX_CHARS, 10);
  return Number.isFinite(n) && n > 0 ? n : 6000;
}

export function isEnabled(env) {
  return env.MEMORY_OS_SESSION_START !== 'off';
}

export function composeContext({ state, journalTail, planExists, maxChars }) {
  const parts = [];
  if (planExists) parts.push('Active plan: see .memory/PLAN.md (definition of done at top).');
  if (state) parts.push('## Current state (.memory/STATE.md)\n' + state.trim());
  if (journalTail) parts.push('## Recent journal\n' + journalTail.trim());
  let out = parts.join('\n\n').trim();
  if (out.length > maxChars) {
    const marker = '\n…[truncated]';
    out = out.slice(0, maxChars - marker.length).trimEnd() + marker;
  }
  return out;
}
