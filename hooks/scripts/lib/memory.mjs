import {
  readFileSync, existsSync, appendFileSync, mkdirSync, copyFileSync, lstatSync, realpathSync,
} from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

export const MEMORY_FILES = ['PLAN.md', 'STATE.md', 'JOURNAL.md'];

export function resolveMemoryDir(cwd) {
  return join(cwd, '.memory');
}

/** A project-controlled .memory symlink must never redirect hook reads or writes outside cwd. */
export function isMemoryDirSafe(cwd) {
  const memoryDir = resolveMemoryDir(cwd);
  if (!existsSync(memoryDir)) return true;
  try {
    const stat = lstatSync(memoryDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    const rel = relative(realpathSync(cwd), realpathSync(memoryDir));
    return rel === '.memory' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
  } catch {
    return false;
  }
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

const COMPACTION_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

/** Append a compaction marker unless the journal already ends with a recent marker. */
export function appendCompactionMarker(memoryDir, now = new Date(), windowMs = COMPACTION_DEDUPE_WINDOW_MS) {
  const journal = readFileSafe(join(memoryDir, 'JOURNAL.md')) || '';
  const lastLine = journal.split('\n').map((line) => line.trim()).filter(Boolean).at(-1) || '';
  const match = lastLine.match(/^(.+?) ↻ compaction\b/);
  if (match) {
    const previousMs = Date.parse(match[1]);
    const ageMs = now.getTime() - previousMs;
    if (Number.isFinite(previousMs) && ageMs >= 0 && ageMs < windowMs) return false;
  }

  appendJournal(memoryDir, `${now.toISOString()} ↻ compaction — re-hydrated from STATE.md`);
  return true;
}

/**
 * Initialise the .memory/ loop in a project: create the directory and seed
 * PLAN.md / STATE.md / JOURNAL.md from templates. Idempotent — never overwrites
 * an existing file, so it is safe to re-run. Returns what it created vs kept.
 */
export function scaffoldMemory(cwd, templatesDir) {
  if (!isMemoryDirSafe(cwd)) throw new Error('Refusing to scaffold through an unsafe .memory path');
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

const TRUNCATION_MARKER = '\n…[truncated]';

function truncateText(text, maxChars) {
  const cap = Math.max(0, Math.trunc(maxChars));
  if (text.length <= cap) return text;
  if (cap === 0) return '';
  if (cap <= TRUNCATION_MARKER.length) return TRUNCATION_MARKER.slice(0, cap);
  return text.slice(0, cap - TRUNCATION_MARKER.length).trimEnd() + TRUNCATION_MARKER;
}

function selectPriorityStateSections(state) {
  const body = state.trim();
  const headings = [...body.matchAll(/^##\s+(.+)$/gm)];
  if (headings.length === 0) return body;

  const title = body.slice(0, headings[0].index).trim();
  const sections = headings.map((match, index) => ({
    name: match[1].trim(),
    text: body.slice(match.index, headings[index + 1]?.index ?? body.length).trim(),
  }));
  const priorities = [
    'Now', 'Definition of done', 'Remaining', 'Next action', 'Blockers / decisions', 'Session depth',
  ];
  const selected = priorities.flatMap((name) => sections.filter((section) => section.name === name));
  return [title, ...selected.map((section) => section.text)].filter(Boolean).join('\n\n');
}

function contextInventory({ stateMode, includeJournal, planExists }) {
  const lines = [];
  if (stateMode) lines.push(`- .memory/STATE.md (${stateMode})`);
  if (includeJournal) lines.push('- .memory/JOURNAL.md (recent entries)');
  if (planExists) lines.push('- .memory/PLAN.md (referenced)');
  return lines.length ? `## Already in context this session\n${lines.join('\n')}` : '';
}

function joinContext(parts) {
  return parts.filter(Boolean).join('\n\n').trim();
}

export function composeContext({ notice = '', state, journalTail, planExists, maxChars }) {
  const noticeBlock = notice.trim();
  const planPointer = planExists
    ? 'Active plan: see .memory/PLAN.md (definition of done at top).'
    : '';
  const stateBlock = state ? `## Current state (.memory/STATE.md)\n${state.trim()}` : '';
  const journalBlock = journalTail ? `## Recent journal\n${journalTail.trim()}` : '';
  const fullInventory = contextInventory({
    stateMode: state ? 'full' : '', includeJournal: !!journalTail, planExists,
  });
  const full = joinContext([noticeBlock, planPointer, stateBlock, journalBlock, fullInventory]);
  if (full.length <= maxChars) return full;

  const priorityState = state
    ? `## Current state (.memory/STATE.md)\n${selectPriorityStateSections(state)}`
    : '';
  const compactInventory = contextInventory({
    stateMode: state ? 'priority sections' : '', includeJournal: false, planExists,
  });
  const compactPrefix = joinContext([noticeBlock, planPointer, priorityState]);
  const compact = joinContext([compactPrefix, compactInventory]);
  if (compact.length <= maxChars) return compact;

  const separatorLength = compactPrefix && compactInventory ? 2 : 0;
  const prefixBudget = maxChars - compactInventory.length - separatorLength;
  if (prefixBudget <= 0) return truncateText(compactInventory || compactPrefix, maxChars);
  return joinContext([truncateText(compactPrefix, prefixBudget), compactInventory]);
}
