---
name: firecrawl-clip
description: Use only after the user confirms they want to ingest a web page. Clips a URL into the project knowledge layer as clean markdown using Firecrawl.
---

# Firecrawl clip → knowledge/raw/

Prerequisites: a Firecrawl key is configured and the user has confirmed they want to ingest. If no key, tell the user and stop.

Steps:
1. Use the Firecrawl scrape capability (MCP tool if connected, else the documented API) to fetch the URL as clean markdown.
2. Save it to `.memory/knowledge/raw/<slug>.md` with a small frontmatter header: `source:` (the URL) and `clipped:` (today's date).
3. Append a JOURNAL line: `<ts> clipped <url> → knowledge/raw/<slug>.md`.
4. If a wiki layer exists, offer (do not force) to fold the new entry into it.

Keep raw captures unedited — organising is the knowledge layer's job, not the clipper's.
