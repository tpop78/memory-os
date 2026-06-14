# Auto Research Engineer — Design Spec

**Date:** 2026-06-15
**Repo:** memory-os (v0.3.0 base, branch `feat/auto-research`)
**Status:** Approved (design) — pending spec review → implementation plan

## Goal

Add an autonomous **optimization loop** to memory-os: pick ONE asset, turn "is it good?" into a single honest number, then iterate unattended — change → score → keep the winner / revert the loser → log → repeat — until a target is hit or the human stops it. Adapted from Andrej Karpathy's [autoresearch](https://github.com/karpathy/autoresearch) (`program.md` / `train.py` / `prepare.py` loop), generalized from LLM-training to any objectively-scorable asset (code, config, HTML, copy, ads).

## Context & relationship to the existing loop

memory-os v0.3.0 already ships a **continuity loop** (`/memory-init` → PLAN/STATE/JOURNAL, SessionStart rehydrate + PreCompact flush + `/checkpoint`). Its purpose is *don't lose context*. This feature adds a **fitness loop** on top — its purpose is *make measurable progress unattended*. They compose: the fitness loop is a driver that runs on the `.memory/` substrate (narrating to STATE/JOURNAL) but keeps its own authoritative ledger.

This is the "optimize" stage that follows "execute" — you can only optimize an asset that already runs and has a number to push.

## Decisions (locked during brainstorming)

1. **Home/packaging:** a memory-os **skill** (`auto-research-engineer`) + command (`/auto-research`). Portable (installs with the plugin), general-purpose (not code-only), composes with `.memory/`. Acronizer is a separate cockpit that consumes the ledger.
2. **Fitness gate:** **scalar from a command.** A locked SCORING file prints ONE number; keep iff it beats the current best (direction from INSTRUCTIONS).
3. **Keep/revert:** **auto-detect git or snapshot.** If the ASSET is in a git repo → `autoresearch/<tag>` branch, commit-advance on win / `git reset` on loss. Else → file snapshots under `.memory/autoloop/<tag>/rounds/` + a `best/` copy.
4. **Autonomy:** **unattended + stop conditions.** Runs overnight without "should I continue?" prompts, but auto-halts on target reached / plateau (N rounds no improvement) / wall-clock cap. Hard guardrails always on (see §Guardrails).
5. **Proactive prompt:** `situational-suggestions` proposes `/auto-research` **post-baseline + a number exists** (a phase/DoD is met, the thing runs, and an objective dimension is in play). Propose once per situation; never nag.

## The three-file system (+ ledger)

Adapted from autoresearch's program/train/prepare:

| File | Role | Who edits |
|---|---|---|
| **INSTRUCTIONS.md** | Goal in plain English, the ONE metric, asset path(s), budget, stop conditions, rules. (≈ `program.md`) | **Human only** — agent never writes it |
| **ASSET** (path(s) in the project) | The only thing the agent changes. (≈ `train.py`) | **Agent only**, in place |
| **SCORING.sh** (or `.py`) | The locked measuring stick: runnable, prints ONE number to stdout. (≈ `prepare.py`'s `evaluate_bpb`) | **Human only** — agent reads/runs, **never edits** ("no moving the goalposts") |
| **RESULTS.tsv** | The experiment ledger (≈ `results.tsv`). **Schema = the Acronizer integration contract.** | Appended by the loop |

### File layout (a run lives under `.memory/autoloop/<tag>/`)
```
.memory/autoloop/<tag>/
  INSTRUCTIONS.md      — human-locked config
  SCORING.sh           — locked measuring stick (chmod +x), prints one number
  RESULTS.tsv          — ledger (header + one row per round)
  rounds/NN/           — snapshot mode only: per-round asset copies
  best/                — snapshot mode only: current best asset copy
```
The **ASSET stays where it lives** in the project (its path is declared in INSTRUCTIONS); it is edited in place and kept/reverted via git or snapshot. `<tag>` defaults to a date-based slug (e.g. `jun15`).

### INSTRUCTIONS.md fields
- **Goal** — what we optimize and why, plain English.
- **Metric** — `name`; `direction: minimize | maximize`; optional `target` (stop value).
- **Asset paths** — the ONLY writable paths (one or more).
- **Scoring** — path to SCORING file + how to run it (the loop captures the last numeric token of stdout).
- **Budget** — per-round wall-clock (default `5m`); hard-kill at `2x` → crash.
- **Stop conditions** — `target_score` (optional), `plateau_rounds` (default 20), `wallclock_cap` (default 8h).
- **Mode** — `git | snapshot` (auto-detected at init, recorded here).
- **Rules** (locked) — agent edits only the asset; never edits INSTRUCTIONS/SCORING; ONE change per round; revert losers; never moves the goalposts.

### RESULTS.tsv schema (the Acronizer contract)
Tab-separated, header + one row per round. NEVER commas (they break descriptions).
```
round	ref	score	delta	cost_s	status	change
0	r0	0.997900	NA	312.4	baseline	baseline as-is
1	a1b2c3d	0.993200	-0.004700	305.1	keep	raise LR to 0.04
2	r2	1.005000	+0.011800	298.7	revert	swap to GeLU
3	r3	NA	NA	14.2	crash	double width (OOM)
```
- `round` — integer (0 = baseline).
- `ref` — git short-SHA (git mode) or snapshot id `rN` (snapshot mode).
- `score` — the metric number, or `NA` for a crash.
- `delta` — signed change vs the prior best, or `NA`.
- `cost_s` — seconds the round took (.1f).
- `status` — `baseline | keep | revert | crash`.
- `change` — short, tab-safe, single-line description of the one change tried.

## Setup flow (`/auto-research`)

1. **Greeting** that confirms the deal ("…we pick ONE thing, turn 'is it good?' into a single honest number, and I work all night changing it, scoring it, keeping what wins and trashing what loses.").
2. **Interview** — which asset? gather paths / access. Define the ONE metric.
3. **FIT CHECK** — verdict on whether this is a good target:
   - **Must-haves (all three required):** (a) scored objectively (a real number, not "make it look nicer"); (b) fast feedback (minutes/hours, not weeks — no SEO-reindex / multi-month churn); (c) write-access to the asset (a file/API, not a published video).
   - **Nice-to-haves (more = more powerful):** (d) high feedback volume; (e) cheap to fail; (f) consistent measuring stick (fair, repeatable).
   - **If a must-have fails, say so honestly and propose a better-shaped target** — do not pretend.
4. **Scaffold** the run via `hooks/scripts/autoloop-init.mjs` (idempotent, never overwrites — like `init.mjs`): creates `.memory/autoloop/<tag>/` with INSTRUCTIONS (pre-filled from the interview), a SCORING stub (human completes + approves), and RESULTS.tsv (header). Auto-detect git vs snapshot mode and record it.
5. If git mode → create branch `autoresearch/<tag>` from current HEAD.
6. **Confirm**, append a JOURNAL line, set STATE `Now`, then enter the loop.

## The loop (the skill contract) — per round

```
LOOP until a stop condition fires:
1. Integrity assert: hash INSTRUCTIONS + SCORING; if changed since run start, it was the
   human (the agent never edits them) → reload + announce. Confirm the agent has not edited them.
2. Baseline: round 0 scores the asset as-is (no change) → records the baseline.
3. Form ONE hypothesis; make ONE change to the ASSET only (writes scoped to declared paths).
4. Run SCORING within the per-round budget; capture the last numeric token of stdout.
   Hard-kill at 2x budget → treat as crash.
5. Compare to current best (direction from INSTRUCTIONS):
   - better → KEEP: git commit-advance, or promote the snapshot to best/.
   - not better → REVERT to known-good: git reset, or restore best/.
   - non-numeric/error → CRASH: if trivially fixable (typo/missing import) fix + retry once;
     else log crash, revert, move on.
6. Append a RESULTS.tsv row; append a JOURNAL line; update STATE (Now + best score).
7. Check stop conditions (target reached / plateau_rounds / wallclock_cap). If hit → stop +
   summarize. Else continue — WITHOUT asking "should I continue?".
```

## Guardrails (always on)

- **Write-scope:** the agent may write ONLY the declared ASSET path(s). INSTRUCTIONS, SCORING, and everything else are off-limits.
- **Locked scoring:** the agent never edits SCORING or INSTRUCTIONS — enforced behaviorally by the skill and sanity-checked by the per-round hash assert. "No moving the goalposts."
- **Always-recoverable:** every loser reverts to a known-good ref (git or `best/`), so the asset can never be left broken or corrupted.
- **Bounded:** stop conditions guarantee a run can't silently burn a whole night on a plateau.
- **Overrides `break_at: 15`:** an auto-research run intentionally suspends the continuity loop's checkpoint-break nudge for its duration — autonomy is the mode.

## Proactive prompt — `situational-suggestions` addition

Add one row to `skills/situational-suggestions/SKILL.md`:

| Situation detected | Propose | Note |
|---|---|---|
| Project has `.memory/` and STATE shows a phase or the Definition of Done **met** (a runnable baseline exists) **and** an objective dimension is in play (tests pass but could be faster, bundle size, latency, cost, a benchmark) | "You've got a working baseline and something measurable — want to spin up an Auto Research loop (`/auto-research`) to optimize it overnight?" | Agent-facing. Propose **once per situation**; if declined, do not repeat. |

## memory-os-native structure

```
commands/auto-research.md                       — entrypoint: greet → interview → fit-check → scaffold → start loop
skills/auto-research-engineer/SKILL.md          — loop contract + fit-check + guardrails (the "program")
hooks/scripts/autoloop-init.mjs                 — scaffold .memory/autoloop/<tag>/ + 3 files (idempotent)
hooks/scripts/lib/autoloop.mjs                  — pure helpers (tested)
templates/autoloop/INSTRUCTIONS.md              — template
templates/autoloop/SCORING.sh                   — stub measuring stick (prints one number)
templates/autoloop/RESULTS.tsv                  — header row
```
Plus updates to: `README.md` (document the optimize loop), `docs/manual.html`, and `skills/situational-suggestions/SKILL.md` (the row above). Version bump to **0.4.0**.

## Testing strategy

The loop itself is **agent-driven prose** (like `program.md`) — not unit-testable. The deterministic, safety-critical helpers go in `hooks/scripts/lib/autoloop.mjs` and get node tests in the existing harness (`npm test` runs `node --test 'hooks/scripts/**/*.test.mjs'`):

- `assertUnchanged(paths, baselineHashes)` — detects any change to INSTRUCTIONS/SCORING (tamper/human-edit).
- `appendResult(tsvPath, row)` — formats/escapes a ledger row (tabs, strips newlines/tabs from `change`, `NA` for crash).
- `parseStopConditions(instructionsText)` — extracts `target_score`/`plateau_rounds`/`wallclock_cap` (+ defaults).
- `detectMode(assetPath)` — `git` if the asset is inside a git work-tree, else `snapshot`.
- `snapshotSave(tag, round, assetPaths)` / `snapshotRestoreBest(tag, assetPaths)` — copy to `rounds/NN/`, promote/restore `best/`.
- `extractScore(stdout)` — last numeric token; `NaN`/none → crash sentinel.
- `autoloop-init.mjs` — idempotent scaffolding (never overwrites — mirror `init.mjs`'s test).

## Acronizer touchpoint (contract only — its own spec/plan later)

Acronizer reads `.memory/autoloop/<tag>/RESULTS.tsv` → an "Experiments" leaderboard (best score, keep/revert/crash badges) + a score-over-rounds sparkline, and gets a "Start auto-research" job streamed to the dock. Fixing the RESULTS.tsv schema (above) now is what lets the two compose without rework. No Acronizer code is in scope here.

## Out of scope

- The Acronizer panel/job (separate spec).
- Non-scalar / multi-objective gates, and LLM-judge scoring (scalar-from-command only for v1).
- Deferred/external metrics that take days (reply rates, SEO) — the fit-check flags these as failing the fast-feedback must-have; a "paused, awaiting external number" mode is a future extension.
- Parallel multi-GPU / multi-worker runs (single sequential loop for v1).
- Rollback UI / browsing prior rounds beyond what git history + `rounds/` already give.

## Error handling summary

| Condition | Behaviour |
|---|---|
| Score command errors / non-numeric output | `crash`: trivially fixable → fix + retry once; else log crash, revert, continue |
| Round exceeds 2× budget | kill → `crash` → revert |
| Human edits INSTRUCTIONS/SCORING mid-run | hash assert detects → reload + announce (it's allowed; only the agent is barred) |
| Asset not in git | snapshot mode (auto-detected) |
| Plateau / target / wall-clock cap | stop + summarize the run |
| Fit-check must-have fails at setup | refuse to start; propose a better-shaped target |
