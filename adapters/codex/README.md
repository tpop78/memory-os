# Codex adapter

The `.memory/` contract is harness-agnostic — the same files work in Codex. Only the hook wiring differs.

1. Ensure `node` is on PATH.
2. In your Codex config, register equivalent session-start and pre-compact handlers that run:
   - start: `node <MEMORY_OS_DIR>/hooks/scripts/rehydrate.mjs`
   - pre-compact: `node <MEMORY_OS_DIR>/hooks/scripts/flush.mjs`
   The scripts read the project `cwd` from their stdin JSON and fall back to `process.cwd()`, so they work wherever Codex invokes them.
3. The scripts print plain context that Codex adds at session start; if Codex does not parse the `hookSpecificOutput` JSON shape, consume the `additionalContext` field from stdout.

> Note: confirm Codex's current hook/automation surface against its docs before wiring — adjust the handler registration accordingly. The scripts themselves are unchanged.
