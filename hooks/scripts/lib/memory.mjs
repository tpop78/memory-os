import { readFileSync, existsSync, appendFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

export const MEMORY_FILES = ['PLAN.md', 'STATE.md', 'JOURNAL.md'];

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

/**
 * Initialise the .memory/ loop in a project: create the directory and seed
 * PLAN.md / STATE.md / JOURNAL.md from templates. Idempotent — never overwrites
 * an existing file, so it is safe to re-run. Returns what it created vs kept.
 */
export function scaffoldMemory(cwd, templatesDir) {
  const dir = resolveMemoryDir(cwd);
  mkdirSync(dir, { recursive: true });
  const created = [];
  const skipped = [];
  for (const file of MEMORY_FILES) {
    const dest = join(dir, file);
    if (existsSync(dest)) {
      skipped.push(file);
      continue;
    }
    copyFileSync(join(templatesDir, file), dest);
    created.push(file);
  }
  return { dir, created, skipped };
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

  const inventoryLines = [];
  if (state) inventoryLines.push('- .memory/STATE.md (full)');
  if (journalTail) inventoryLines.push('- .memory/JOURNAL.md (recent entries)');
  if (planExists) inventoryLines.push('- .memory/PLAN.md (referenced)');
  if (inventoryLines.length > 0) {
    parts.push('## Already in context this session\n' + inventoryLines.join('\n'));
  }

  let out = parts.join('\n\n').trim();
  if (out.length > maxChars) {
    const marker = '\n…[truncated]';
    out = out.slice(0, maxChars - marker.length).trimEnd() + marker;
  }
  return out;
}
