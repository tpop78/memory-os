# memory-os — SessionStart Auto-Init — Design Spec

**Date:** 2026-06-15
**Status:** Approved for planning
**Author:** Theo Popescu (with Claude)

## 1. Purpose

When you start a session in a project, memory-os should **stand up its working surfaces for you**
rather than waiting to be asked: scaffold the `.memory/` loop and start a CodeGraph index if they
are not already present. Today neither happens automatically — the SessionStart hook
(`rehydrate.mjs`) only re-injects *existing* `.memory` state, and CodeGraph is merely *suggested*
by the `situational-suggestions` skill. This feature closes that gap with a single, fail-safe,
idempotent auto-init step on SessionStart.

## 2. Behavior

Controlled by one env flag, **`MEMORY_OS_AUTO_INIT`**, which is **ON by default** (matching the
existing `MEMORY_OS_SESSION_START` convention — disabled only when explicitly set to `off`).

When enabled, on every SessionStart, for the session's `cwd`:

1. **Git guard.** Act only if `cwd` is inside a git work-tree. This is the primary safeguard against
   scaffolding `$HOME`, temp dirs, or any non-project directory. If `cwd` is not in a work-tree, do
   nothing (both steps skipped).
2. **`.memory` loop.** If `.memory/STATE.md` is absent, scaffold the loop via the existing
   `scaffoldMemory(cwd, templatesDir)` (`hooks/scripts/lib/memory.mjs`) — creates `PLAN.md`,
   `STATE.md`, `JOURNAL.md` from templates. Idempotent: `scaffoldMemory` never overwrites, and the
   absence check means an existing loop is left untouched.
3. **CodeGraph.** If `.codegraph/` is absent **and** the `codegraph` CLI is on `PATH`, spawn
   `codegraph init` **detached and unref'd in the background** (fire-and-forget). Indexing a large
   repo can exceed the hook's 10s timeout, so the hook must never await it. If the CLI is not
   installed, skip silently (no-op).
4. **Report.** Prepend a one-line note to the SessionStart `additionalContext` summarizing what was
   done (e.g. `memory-os: scaffolded .memory loop; started codegraph index in background.`), then
   let normal rehydration run — it now finds and re-injects the freshly-scaffolded `STATE.md`.

When `MEMORY_OS_AUTO_INIT=off`, there is **zero behavior change** from today.

> **Consequence of default-ON (accepted):** with the plugin installed, opening a new session in any
> git work-tree that lacks `.memory/` will create it (and, if the CodeGraph CLI is present, start an
> index). The git guard + idempotency + fail-safe design keep this bounded and non-destructive.
> Users who don't want it set `MEMORY_OS_AUTO_INIT=off`.

## 3. Architecture

Mirrors the repo's established pure-core + thin-IO + Node-test convention (as in `lib/memory.mjs`
and `lib/autoloop.mjs`).

### 3.1 New module `hooks/scripts/lib/autoinit.mjs`

- `isAutoInitEnabled(env)` → boolean. `env.MEMORY_OS_AUTO_INIT !== 'off'` (default ON), matching
  `isEnabled` in `memory.mjs`.
- `planAutoInit({ gitWorkTree, memoryExists, codegraphExists, codegraphCli })` → **pure** decision:
  `{ scaffoldMemory: boolean, initCodegraph: boolean, summary: string }`.
  - `scaffoldMemory` = `gitWorkTree && !memoryExists`.
  - `initCodegraph` = `gitWorkTree && !codegraphExists && codegraphCli`.
  - `summary` = the human note, or `''` when nothing is done.
  - No IO — this is the unit-testable heart (full decision matrix).
- `runAutoInit(cwd, templatesDir, deps)` → string summary. Thin IO wrapper that gathers the four
  inputs (via injected `deps` so tests use fakes), calls `planAutoInit`, performs the chosen
  actions, and returns the summary. Default `deps` wire the real implementations:
  - `isGitWorkTree(cwd)` — `git -C cwd rev-parse --is-inside-work-tree` via `execFileSync` in a
    try/catch (same pattern as `detectMode` in `autoloop.mjs`).
  - `hasCodegraphCli()` — `command -v codegraph` / `which codegraph` via `execFileSync` in try/catch.
  - `memoryExists(cwd)` / `codegraphExists(cwd)` — `existsSync` of `.memory/STATE.md` and `.codegraph/`.
  - `doScaffold(cwd, templatesDir)` — calls `scaffoldMemory` from `memory.mjs`.
  - `startCodegraph(cwd)` — `spawn('codegraph', ['init'], { cwd, detached: true, stdio: 'ignore' }).unref()`.

### 3.2 Wire into `hooks/scripts/rehydrate.mjs`

After parsing `cwd` and the existing `isEnabled(env)` check, and before `composeContext`:
- If `isAutoInitEnabled(process.env)` → `const note = runAutoInit(cwd, templatesDir, ...)` inside a
  try/catch.
- Prepend `note` (when non-empty) to the composed `additionalContext` so the agent and user see it.
- `templatesDir` is resolved relative to the plugin root (the same templates `init.mjs` uses).

No change to `flush.mjs` / PreCompact.

## 4. Error handling

The SessionStart hook MUST always emit valid JSON and exit 0. Therefore:
- `runAutoInit` is wrapped in try/catch in `rehydrate.mjs`; any failure yields an empty note and
  normal rehydration proceeds.
- Each `deps` probe (`isGitWorkTree`, `hasCodegraphCli`) swallows its own errors and returns a safe
  default (`false`), so a missing `git`/`codegraph` binary is a no-op, not a crash.
- `startCodegraph` failure (spawn error) is caught and treated as "not started"; it never blocks.
- The detached `codegraph init` child's own success/failure is irrelevant to the hook (fire-and-forget).

## 5. Success criteria (acceptance)

> With `MEMORY_OS_AUTO_INIT` at its default (on) and the plugin installed: starting a session in a
> git repo that has no `.memory/` creates `PLAN.md`/`STATE.md`/`JOURNAL.md` from the templates, and
> (if the `codegraph` CLI is installed) a `.codegraph/` index begins building in the background
> without blocking session start; the SessionStart context shows a one-line note of what happened.
> Re-running in the same repo does nothing (idempotent). Starting a session in a non-git directory,
> or with `MEMORY_OS_AUTO_INIT=off`, does nothing and behaves exactly as today. A failure in any
> probe or action never breaks SessionStart. `node --test 'hooks/scripts/**/*.test.mjs'` passes.

## 6. Testing

`hooks/scripts/lib/autoinit.test.mjs` (Node test runner, repo convention
`node --test 'hooks/scripts/**/*.test.mjs'`):
- `isAutoInitEnabled`: ON when unset / `'on'` / `'1'` / `'true'`; OFF only when `'off'`.
- `planAutoInit` decision matrix: not-git → neither; flag-off path is handled by `isAutoInitEnabled`
  upstream; memory exists → no scaffold; codegraph exists → no init; no CLI → no init; happy path
  (git, neither present, CLI present) → both, with a non-empty summary; summary is `''` when nothing
  is done.
- `runAutoInit` with **injected fake deps**: asserts it calls `doScaffold` / `startCodegraph` exactly
  when `planAutoInit` says to, returns the correct summary, and swallows a thrown dep without
  throwing. No real git/codegraph/fs in unit tests.

## 7. Docs

- `README.md`: document `MEMORY_OS_AUTO_INIT` (default on; what it scaffolds; CodeGraph step requires
  the `codegraph` CLI; set `off` to disable).
- `docs/manual.html`: same, alongside the existing `MEMORY_OS_SESSION_START*` env vars.
- Note in docs that `.codegraph/` is a derived index a project may wish to gitignore (memory-os does
  not edit the user's `.gitignore`).

## 8. Scope (YAGNI)

**In:** the flag-gated (default-on), git-gated, idempotent, fail-safe SessionStart auto-init of the
`.memory` loop + background `codegraph init`, with a report line and docs.

**Out:** auto-initing the autoloop/auto-research surfaces; CodeGraph re-index/refresh on change (the
CodeGraph watcher handles that); size caps or duration limits (background spawn makes duration moot);
editing the user's `.gitignore`; any interactive prompt (the default-on flag is the consent model).

## 9. Build order (informs the plan)

1. `hooks/scripts/lib/autoinit.mjs`: `isAutoInitEnabled` + `planAutoInit` (pure) + tests.
2. `runAutoInit` (IO wrapper with injectable deps) + tests with fakes.
3. Wire into `rehydrate.mjs` (try/catch, prepend note) + a focused rehydrate test for the enabled path.
4. Docs (README + manual) + bump plugin version.
