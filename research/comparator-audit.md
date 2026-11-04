# Comparing Polymarket with polls and forecasters

Research check: November 3, 2026. This is a source audit and scoring design, not a published accuracy ranking.

## What can be compared

Use the same settled Senate and governor races in every displayed source comparison. Match race, party/candidate, and the latest forecast **published before the selected checkpoint**. Report each source's coverage and abstentions. A source that calls only the easy races should not win a leaderboard by avoiding hard ones.

| Source | Available evidence | Comparable output | Eligible checkpoints |
| --- | --- | --- | --- |
| Polymarket | Frozen race-winner prices and observed timestamps in this repo | Win probability, favorite, Brier | 30d, 7d, 1d, 6h |
| [Inside Elections](https://insideelections.com/developer/) | Public JSON/XML ratings feed, dated October 29, 2026 | Directional party rating; Toss-up = abstain | 1d, 6h; earlier checkpoints need older archived ratings |
| [Cook Political Report](https://www.cookpolitical.com/ratings/senate-race-ratings) | Public November 2 ratings page | Directional party rating; Toss Up = abstain | 6h only until precise publication time and earlier archive are established. Its [terms](https://www.cookpolitical.com/terms-and-conditions) restrict storing and republishing ratings, so link to the source rather than copying its table. |
| [Sabato's Crystal Ball](https://sabatoscrystalball.substack.com/p/the-final-2026-ratings-democrats) | Final ratings article dated November 2, 2026; race-level maps are images | Directional party rating | 6h after a reviewed race-level transcription; earlier dated ratings need separate source records |
| [Decision Desk HQ polling averages](https://decisiondeskhq.substack.com/p/2026-election-polling-averages) | Senate and governor averages with historical dates and underlying polls | Poll leader and vote-share margin | Each checkpoint with an average available by that time |
| [Silver Bulletin FLIPR](https://www.natesilver.net/p/nate-silver-2026-midterm-election-senate-model) | Race forecast exists but the complete table is subscriber-only | Potential win probability | Do not score without accessible, dated race data |
| [VoteHub forecast](https://votehub.com/wp-content/uploads/2026/05/2026_votehub_midterm_methodology.pdf) | Race-level probability model; its Complete specification includes prediction-market prices | Win probability if a dated race snapshot is obtainable | Audit snapshot and use Legacy polls/fundamentals model for an independent comparison; Complete is partly dependent on markets |

## Scoring rules

1. **Directional calls:** On the intersection of races where every compared source made a call, report correct/total and misses. Separately report each source's own coverage and number of Toss-ups. Do not score Toss-ups as 50% predictions or force them to pick a winner.
2. **Probability forecasts:** Only sources with documented race-level win probabilities receive Brier and calibration scores. Do not assign arbitrary probabilities to Lean/Likely/Solid ratings.
3. **Polling:** Polling percentages are vote shares, not win probabilities. Compare poll leader with winner, and poll margin with final vote margin. Show the poll window and publication date; discard any poll unavailable at the checkpoint.
4. **Time:** A six-hour comparison uses the noon ET Election Day snapshot. The November 2 final expert ratings can be eligible there, but cannot automatically be used at the 10 a.m. ET November 2 one-day snapshot. The October 29 Inside Elections feed is available for both.
5. **Sample:** Rankings wait until enough competitive races have verified outcomes. Early Polymarket settlements are overwhelmingly safe seats, so a raw accuracy table would be misleading.

The first publishable pilot is the matched Senate and governor cohort at six hours out, comparing Polymarket with Inside Elections, then Cook and Sabato where a source record and reuse method are verified. The polling panel should be adjacent but use its own vote-margin error scale.
