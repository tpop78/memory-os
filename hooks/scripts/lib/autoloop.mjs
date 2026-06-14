// memory-os: Auto Research Engineer — deterministic helpers for the optimization loop.
// Pure/IO functions only; the loop logic itself lives in skills/auto-research-engineer/SKILL.md.

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
