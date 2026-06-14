// memory-os: Auto Research Engineer — deterministic helpers for the optimization loop.
// Pure/IO functions only; the loop logic itself lives in skills/auto-research-engineer/SKILL.md.

import { appendFileSync } from 'node:fs';

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
