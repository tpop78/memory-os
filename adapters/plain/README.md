# Plain copy-in (no plugin)

For setups without the plugin marketplace:

1. Clone memory-os somewhere stable; note its absolute path as `<MEMORY_OS_DIR>`.
2. Copy the `hooks` block from `settings.json` here into your project's `.claude/settings.json`, replacing `<MEMORY_OS_DIR>`.
3. Copy `templates/.memory/` into your project root as `.memory/`.
4. Optionally copy the `skills/` and `commands/` you want into `.claude/`.

Config:

- `MEMORY_OS_SESSION_START_MAX_CHARS` defaults to 6000.
- `MEMORY_OS_SESSION_START=off` disables injection.
- `MEMORY_OS_AUTO_INIT=on` opts into automatic `.memory/` scaffolding.
- `MEMORY_OS_AUTO_CODEGRAPH=on` separately opts into background CodeGraph initialization.
- `MEMORY_OS_HEADROOM_LEARN=on` opts into Stop-time Headroom learning, which may invoke an LLM and write guidance.

All automatic mutation flags are off by default.
