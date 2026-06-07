# Plain copy-in (no plugin)

For setups without the plugin marketplace:

1. Clone memory-os somewhere stable; note its absolute path as `<MEMORY_OS_DIR>`.
2. Copy the `hooks` block from `settings.json` here into your project's `.claude/settings.json`, replacing `<MEMORY_OS_DIR>`.
3. Copy `templates/.memory/` into your project root as `.memory/`.
4. Optionally copy the `skills/` and `commands/` you want into `.claude/`.

Config: set `MEMORY_OS_SESSION_START_MAX_CHARS` (default 6000) or `MEMORY_OS_SESSION_START=off` in your environment.
