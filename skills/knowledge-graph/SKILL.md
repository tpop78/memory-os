---
name: knowledge-graph
description: Use only after the user confirms they want a knowledge layer. Builds and maintains a typed-edge markdown wiki from raw captures.
---

# Typed-edge knowledge layer

Structure under `.memory/knowledge/`:
- `raw/` — unedited captures (never reorganised).
- `wiki/` — organised nodes the agent writes; never hand-edited by the user.
- `outputs/` — answers/briefings generated on request.
- `index.md` — written first; a short summary line per wiki node.

Each `wiki/*.md` node carries frontmatter:

```
---
type: <concept|method|source|project>
relates-to: [other-node]
supersedes: [old-node]
sourced-from: [raw/<file>.md]
contradicts: [node]
---
```

Process:
1. Read everything in `raw/`. Write `index.md` first, then one node per major topic, then fill typed edges.
2. Read the entries it needs via the index; never load the whole wiki at once.
3. Optional: an Obsidian vault can open `.memory/knowledge/` as a read-only graph viewer. The agent remains the librarian; the user does not hand-organise.
