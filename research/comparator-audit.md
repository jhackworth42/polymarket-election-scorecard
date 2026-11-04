# Comparing Polymarket with polls and forecasters

Research check: November 3, 2026. The first directional-call comparison is now published at [the source comparison page](https://jhackworth42.github.io/polymarket-election-scorecard/compare.html). A ranking appears when there are verified results in the shared cohort.

## What can be compared

Use the same settled Senate and governor races in every displayed source comparison. Match race, party/candidate, and the latest forecast **published before the selected checkpoint**. Report each source's coverage and abstentions. A source that calls only the easy races should not win a leaderboard by avoiding hard ones.

| Source | Available evidence | Comparable output | Eligible checkpoints |
| --- | --- | --- | --- |
| Polymarket | Frozen race-winner prices and observed timestamps in this repo | Win probability, favorite, Brier | 30d, 7d, 1d, 6h |
| [Inside Elections](https://insideelections.com/developer/) | Public JSON/XML ratings feed, dated October 29, 2026 | Directional party rating; Toss-up = abstain | 1d, 6h; earlier checkpoints need older archived ratings |
| [Cook Political Report](https://www.cookpolitical.com/ratings/senate-race-ratings) | Public November 2 ratings page | Directional party rating; Toss Up = abstain | 6h only until precise publication time and earlier archive are established. Its [terms](https://www.cookpolitical.com/terms-and-conditions) restrict storing and republishing ratings, so link to the source rather than copying its table. |
| [Sabato's Crystal Ball](https://sabatoscrystalball.substack.com/p/the-final-2026-ratings-democrats) | Final ratings article dated November 2, 2026; race-level maps are images | Directional party rating | 6h after a reviewed race-level transcription; earlier dated ratings need separate source records |
| [FutureBallot simple polling average](https://futureballot.com/polls) | Public table frozen November 2 at 21:12 UTC; 30-day mean poll margin for each race | D/R polling leader; tied average = abstain | 6h pilot |
| [Decision Desk HQ polling averages](https://decisiondeskhq.substack.com/p/2026-election-polling-averages) | Senate and governor averages with historical dates and underlying polls | Poll leader and vote-share margin | Future expansion after validating accessible current values |
| [Silver Bulletin FLIPR](https://www.natesilver.net/p/nate-silver-2026-midterm-election-senate-model) | Race forecast exists but the complete table is subscriber-only | Potential win probability | Do not score without accessible, dated race data |
| [VoteHub forecast](https://votehub.com/wp-content/uploads/2026/05/2026_votehub_midterm_methodology.pdf) | Race-level probability model; its Complete specification includes prediction-market prices | Win probability if a dated race snapshot is obtainable | Audit snapshot and use Legacy polls/fundamentals model for an independent comparison; Complete is partly dependent on markets |

## Scoring rules

1. **Directional calls:** On the intersection of races where every compared source made a call, report correct/total and misses. Separately report each source's own coverage and number of Toss-ups. Do not score Toss-ups as 50% predictions or force them to pick a winner.
2. **Probability forecasts:** Only sources with documented race-level win probabilities receive Brier and calibration scores. Do not assign arbitrary probabilities to Lean/Likely/Solid ratings.
3. **Polling:** Polling percentages are vote shares, not win probabilities. Compare poll leader with winner, and poll margin with final vote margin. Show the poll window and publication date; discard any poll unavailable at the checkpoint.
4. **Time:** A six-hour comparison uses the noon ET Election Day snapshot. The November 2 final expert ratings can be eligible there, but cannot automatically be used at the 10 a.m. ET November 2 one-day snapshot. The October 29 Inside Elections feed is available for both.
5. **Sample:** Rankings wait until enough competitive races have verified outcomes. Early Polymarket settlements are overwhelmingly safe seats, so a raw accuracy table would be misleading.

The published pilot matches Polymarket, Inside Elections, and FutureBallot simple averages in Senate and governor races at six hours out. Source picks are frozen in `data/2026/comparators/`; `python -m scorecard.comparison build` regenerates the shared-race score as Polymarket settlements arrive. Cook and Sabato remain research candidates where source records and reuse methods can be verified. A future polling margin-error panel would use its own scale.

## Named-candidate party mappings

Most Polymarket Senate/governor events use party outcome labels. Three events use named candidate outcomes at the six-hour cutoff. The comparison adapter maps their leading candidates using these race sources: [Alaska Senate](https://apnews.com/article/93d4d163acfd217521b5dce1ab7fc4a9), [Alaska governor](https://news.ballotpedia.org/2026/11/02/jonathan-kreiss-tomkins-d-david-bronson-r-treg-taylor-r-bernadette-wilson-r-and-two-other-candidates-are-running-in-the-general-election-for-governor-and-lieutenant-governor-of-alaska/), and [California governor](https://calmatters.org/california-voter-guide-2026/governor/). Unmapped named candidates remain outside the directional comparison until reviewed.
