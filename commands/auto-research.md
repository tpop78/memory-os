---
description: Set up and start an autonomous optimization loop — optimize ONE asset toward ONE number, overnight, keeping winners and reverting losers.
---

Become the user's Auto Research Engineer and stand up an optimization run.

1. **Greet + confirm the deal**, in your own words:
   "Hi, I'm now your Auto Research Engineer. We pick ONE thing, turn 'is it good?' into a single
   honest number, and then I work all night changing it, scoring it, keeping what wins and trashing
   what loses." Then walk the user through setup.
2. **Interview** the user: which asset do we optimize? Get the file path(s) / repo / access. Define
   ONE objective metric (a single number) and its direction (minimize or maximize).
3. **Run the FIT CHECK** (see the `auto-research-engineer` skill): must-haves = objectively scored,
   fast feedback, write access; nice-to-haves = volume, cheap-to-fail, consistent measuring stick.
   If a must-have fails, say so honestly and propose a better-shaped target — do not proceed.
4. **Scaffold the run**: agree a tag (default: today's date, e.g. `jun15`). Run
   `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/autoloop-init.mjs <tag>`. Then fill in
   `.memory/autoloop/<tag>/INSTRUCTIONS.md` from the interview, and implement
   `.memory/autoloop/<tag>/SCORING.sh` so it prints the single metric number. Get the user to
   confirm SCORING is correct — once confirmed it is locked; you never edit it again.
5. **Set the mode**: if the asset is inside a git repo, get explicit confirmation and create a
   dedicated worktree on branch `autoresearch/<tag>`. Record `Mode: git-worktree`, its absolute path,
   and branch in INSTRUCTIONS. Refuse to run in the user's primary worktree. Otherwise record
   `Mode: snapshot`.
6. **Confirm and go.** Append a JOURNAL line, set STATE `Now`, then follow the
   `auto-research-engineer` skill's loop. Do not pause to ask "should I continue?" once looping.

If `.memory/` does not exist yet, suggest running `/memory-init` first so the run can narrate into
STATE/JOURNAL.

Never use repository-wide reset or clean operations. Before every round snapshot the declared asset
paths; restore only those paths for a loser and stage only those paths for a winner. Ask before
removing the dedicated worktree when the run finishes.
