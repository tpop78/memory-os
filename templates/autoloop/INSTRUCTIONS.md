# Auto Research — Instructions (human-locked)

<!-- The agent NEVER edits this file or SCORING. Only you, the human, edit them. -->

## Goal
<one or two sentences: what asset are we optimizing, and why>

## Metric
- name: <e.g. val_bpb, load_ms, reply_rate>
- direction: minimize        <!-- minimize | maximize -->
<!-- set the number to stop at once, under Stop conditions below -->

## Asset (the ONLY thing the agent may change)
- <relative/path/to/asset>   <!-- one or more lines; nothing outside these is writable -->

## Scoring
- file: SCORING.sh           <!-- run it; the loop reads the last number it prints -->

## Budget
- per_round: 5m              <!-- wall-clock; killed at 2x -> crash -->

## Stop conditions
- target_score: none
- plateau_rounds: 20
- wallclock_cap: 8h

## Mode
- <git | snapshot>           <!-- set by /auto-research at setup -->

## Rules (locked)
- Change ONLY the asset path(s) above. One change per round.
- Never edit INSTRUCTIONS.md or SCORING.sh. Never change the definition of "better".
- Keep a winner; revert a loser to the last known-good. Log every round to RESULTS.tsv.
