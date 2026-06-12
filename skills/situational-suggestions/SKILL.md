---
name: situational-suggestions
description: Use when starting work in a project to detect context and propose the right optional tool — CodeGraph, Understand-Anything, taste-skill, Firecrawl, or a knowledge layer. Proposes; the user confirms.
---

# Situational tool suggestions

Detect the situation, then PROPOSE the matching tool and let the user decide. Never enable or install silently. Ask once per situation; if declined, do not nag.

| Situation detected | Propose | Note |
| --- | --- | --- |
| Code work in a repo with `.codegraph/codegraph.db` present | Use `codegraph_*` MCP queries instead of file sweeps | **Automatic** for code — no prompt needed; it only saves tokens. |
| Code work, but no `.codegraph/` present | "Want me to set up CodeGraph for token-efficient code queries?" | Agent-facing. |
| You land in an existing/unfamiliar project | "Want me to run Understand-Anything to build a comprehension graph + onboarding tour?" | User-facing comprehension (complements CodeGraph). |
| Task involves designing or redesigning a site/UI | "Want to apply taste-skill design guidance? Set the dials: Design Variance / Motion Intensity / Visual Density, and a direction (minimalist, brutalist, soft…)." | Avoids generic AI design. |
| Starting a new project from an idea, or a URL worth ingesting | "Want me to research/ingest with Firecrawl (URL → clean markdown → .memory knowledge)?" | Requires a Firecrawl key. |
| Domain knowledge is piling into `.memory/knowledge/raw/` | "This is accumulating knowledge — want me to stand up a typed-edge wiki layer (raw/wiki/outputs + index)?" | Never auto-created. |
| Project has `.memory/` but no `IDEA.md`, and `acronizer.config.json` is present on this machine (check `$ACRONIZER_CONFIG` env var or run `find ~ -name acronizer.config.json -maxdepth 10 2>/dev/null`) | "Want to add this project to your Acronizer pipeline? Run `/acronizer-add`." | Agent-facing. Propose once per session; if declined, do not repeat. |

All of these are optional and off by default (except CodeGraph detection, which is automatic for code because it has no downside).
