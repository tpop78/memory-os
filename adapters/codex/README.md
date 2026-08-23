# Codex adapter

The `.memory/` contract is harness-agnostic. Current Codex releases support plugin-bundled hooks and
discover `hooks/hooks.json` from an enabled plugin. MemoryOS also ships a native
`.codex-plugin/plugin.json` manifest.

1. Ensure `node` is on PATH and enable the plugin.
2. Review and trust the exact MemoryOS hook definitions in Codex. Changed hooks are skipped until
   their new hash is trusted.
3. Codex runs hook commands with the session working directory and supplies `PLUGIN_ROOT`; it also
   supplies `CLAUDE_PLUGIN_ROOT` for compatibility with this package.
4. SessionStart and PreCompact remain read-only unless you explicitly enable a mutation flag.

See the official OpenAI documentation for [Codex hooks](https://developers.openai.com/codex/hooks)
and [plugin packaging](https://developers.openai.com/codex/plugins/build). For a plain checkout rather
than an installed plugin, register equivalent SessionStart and PreCompact commands in a trusted Codex
hook configuration.
