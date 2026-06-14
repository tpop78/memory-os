// memory-os: Auto Research Engineer — deterministic helpers for the optimization loop.
// Pure/IO functions only; the loop logic itself lives in skills/auto-research-engineer/SKILL.md.

import { appendFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

/** Read the score a SCORING run printed: the last numeric token on the last line that has one. */
export function extractScore(stdout) {
  if (typeof stdout !== 'string') return null;
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g);
    if (m) {
      const n = Number(m[m.length - 1]);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

/** Is `candidate` a better score than `best` given the optimization direction? */
export function isBetter(candidate, best, direction) {
  if (candidate == null || Number.isNaN(candidate)) return false;
  if (best == null) return true;
  return direction === 'maximize' ? candidate > best : candidate < best;
}

/** Parse a duration like "500ms" | "30s" | "5m" | "8h" | "45" (bare = seconds) → ms, else null. */
export function parseDurationMs(s) {
  if (typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);
  if (!m) return null;
  const val = Number(m[1]);
  const mult = { ms: 1, s: 1000, m: 60000, h: 3600000 }[(m[2] || 's').toLowerCase()];
  return val * mult;
}

const DEFAULT_PLATEAU = 20;
const DEFAULT_WALLCLOCK_MS = 8 * 3600000;

/** Extract stop conditions from INSTRUCTIONS text. Missing/garbage → safe defaults. */
export function parseStopConditions(text) {
  const get = (key) => {
    const re = new RegExp(`^\\s*[-*]?\\s*${key}\\s*[:=]\\s*(.+)$`, 'im');
    const m = typeof text === 'string' ? text.match(re) : null;
    return m ? m[1].trim() : null;
  };
  const targetRaw = get('target_score');
  const plateauRaw = get('plateau_rounds');
  const capRaw = get('wallclock_cap');

  const target = targetRaw && !/^none$/i.test(targetRaw) ? Number(targetRaw) : null;
  const plateau = plateauRaw != null ? parseInt(plateauRaw, 10) : DEFAULT_PLATEAU;
  const capMs = capRaw != null ? parseDurationMs(capRaw) : DEFAULT_WALLCLOCK_MS;

  return {
    targetScore: Number.isFinite(target) ? target : null,
    plateauRounds: Number.isInteger(plateau) && plateau > 0 ? plateau : DEFAULT_PLATEAU,
    wallclockCapMs: Number.isFinite(capMs) && capMs > 0 ? capMs : DEFAULT_WALLCLOCK_MS,
  };
}

export const RESULTS_HEADER = 'round\tref\tscore\tdelta\tcost_s\tstatus\tchange';

function tsvSafe(s) {
  return String(s).replace(/[\t\r\n]+/g, ' ').trim();
}

/** Format one ledger row. score/delta null|NaN → "NA"; score 6dp; delta signed 6dp; cost 1dp. */
export function formatResultRow({ round, ref, score, delta, costS, status, change }) {
  const naNum = (v, dp, signed) => {
    if (v == null || Number.isNaN(v)) return 'NA';
    const s = Number(v).toFixed(dp);
    return signed && v >= 0 ? `+${s}` : s;
  };
  return [
    String(round),
    tsvSafe(ref),
    naNum(score, 6, false),
    naNum(delta, 6, true),
    naNum(costS, 1, false),
    tsvSafe(status),
    tsvSafe(change),
  ].join('\t');
}

/** Append a formatted ledger row (with trailing newline) to the RESULTS.tsv at `tsvPath`. */
export function appendResult(tsvPath, row) {
  appendFileSync(tsvPath, formatResultRow(row) + '\n');
}

/** sha256 each path; unreadable/missing → null. */
export function hashFiles(paths) {
  const out = {};
  for (const p of paths) {
    try { out[p] = createHash('sha256').update(readFileSync(p)).digest('hex'); }
    catch { out[p] = null; }
  }
  return out;
}

/** Compare current hashes to a baseline map. Used to detect any edit to INSTRUCTIONS/SCORING. */
export function assertUnchanged(paths, baseline) {
  const now = hashFiles(paths);
  const changed = paths.filter((p) => now[p] !== baseline[p]);
  return { ok: changed.length === 0, changed };
}

/** "git" if `dir` is inside a git work-tree, else "snapshot". */
export function detectMode(dir) {
  try {
    const out = execFileSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out === 'true' ? 'git' : 'snapshot';
  } catch {
    return 'snapshot';
  }
}

const pad = (n) => String(n).padStart(3, '0');

/** Copy each relPath (relative to cwd) into runDir/rounds/NNN/relPath. Returns the round dir. */
export function snapshotSave(runDir, round, relPaths, cwd) {
  const dest = join(runDir, 'rounds', pad(round));
  for (const rel of relPaths) {
    const to = join(dest, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(cwd, rel), to);
  }
  return dest;
}

/** Copy a saved round's files into runDir/best/. Returns the best dir. */
export function snapshotPromoteBest(runDir, round, relPaths) {
  const src = join(runDir, 'rounds', pad(round));
  const best = join(runDir, 'best');
  for (const rel of relPaths) {
    const to = join(best, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(src, rel), to);
  }
  return best;
}

/** Restore best/ back over the live asset paths (revert a losing experiment). */
export function snapshotRestoreBest(runDir, relPaths, cwd) {
  const best = join(runDir, 'best');
  for (const rel of relPaths) {
    const to = join(cwd, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(best, rel), to);
  }
}
