# The Forecast File

An open, reproducible scorecard for Polymarket election forecasts. The front page tracks **2026 midterm pre-result price movements**; a separate 2025 historical test demonstrates the accuracy workflow.

## See it

- [2026 movement overview](https://jhackworth42.github.io/polymarket-election-scorecard/)
- [Every 2026 race](https://jhackworth42.github.io/polymarket-election-scorecard/races.html)
- [2025 historical scorecard](https://jhackworth42.github.io/polymarket-election-scorecard/2025.html)
- [2026 scored data](data/2026/scorecard.json) and [coverage ledger](data/2026/coverage.json)

## Rebuild either edition

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m scorecard build --edition 2025
python -m scorecard build --edition 2026
python -m http.server 8000 --directory site
```

Open `http://localhost:8000`. Each build saves the Gamma event inventory, each historical price response, and settlement evidence under `data/<edition>/raw/`; `coverage.json` records every discovered event and its inclusion decision. Cached responses make repeat builds reproducible. `--refresh-discovery` refetches the event inventory; remove a cached price file to refetch that response.

The event search uses Polymarket's U.S. election tag (`1101`) and each edition's configured date window. The 2025 inventory found 54 tagged events and 17 included race-winner events. The frozen 2026 inventory found 734 tagged events and 505 included race-winner events: 35 Senate, 36 governor, and 434 House. An event must have at least two traded candidate or party outcomes. The 2025 test also requires a uniquely resolved winner. Derivatives such as vote-share brackets, margins, timing bets, and parlays remain in the coverage ledger but are excluded from the main score. **This is a tagged-event cohort, not a census of every U.S. election or every Polymarket election contract.**

## Scoring

- Unit: one election-winner event, not one candidate contract.
- Cutoffs: 15:00 UTC, 30/21/14/7/3/1/0 days before each race's election day. The `0` cutoff is election-day morning in U.S. Eastern time. No post-poll-close prices enter forecast scoring.
- Outcome probabilities: historical `Yes` prices for traded candidate or party outcomes, normalized within each event to sum to one. The raw sum and each response's observation timestamp are retained.
- Staleness: a price older than 24 hours at a day-horizon cutoff is excluded. The intraday Monday and Tuesday snapshots require an observation within one hour. A race is not scored at a horizon if its eventual winner has no usable price.
- Favorite hit rate: share of races where the highest priced candidate at the cutoff won.
- Multiclass Brier score: `0.5 * Σ(candidate_probability - outcome)^2`. The winner's outcome is 1; all others are 0. A lower mean is better.
- Contest segments: the highest candidate probability at the seven-day cutoff is fixed for the whole analysis. A race is **contested** if that value is below 80%; otherwise it is **clearer**. This uses pre-election prices, not the eventual vote margin.
- Time chart: uses only races with usable 30-day and one-day forecasts, so endpoint comparisons refer to the same races. Intermediate points retain those same races when prices are available.
- Winner: Gamma's settled outcome is checked against Polymarket's resolution endpoint. No election result is inferred from the pre-election price.

The [Data API documentation](https://data-api.polymarket.com/v2/docs) covers price history and resolutions. The historical price endpoint does not identify the returned number as an executable bid or ask, so this project labels it a historical price. The scorecard is descriptive; markets share political information and therefore do not form independent trials.

## 2026 election-night workflow

[`config/2026.json`](config/2026.json) records the discovery window and cutoffs. The tagged event inventory is frozen in `data/2026/raw/events.json`; rerunning without `--refresh-discovery` preserves that list. The 2025 historical test stays separate so it cannot be mistaken for a 2026 result.

```bash
# Refresh settlement for the frozen 2026 inventory, then regenerate both site data and the scorecard.
python -m scorecard build --edition 2026 --refresh-results

# Inspect locally before committing.
python -m http.server 8000 --directory site
```

Unsettled races remain **pending**. For a preliminary election-night edition, a human can enter sourced calls in `data/2026/calls.json`, keyed by event slug. The `condition_id` must match a candidate in the frozen event inventory:

```json
{
  "example-event-slug": {
    "condition_id": "0x...",
    "source_url": "https://source.example/race-call",
    "called_at": "2026-11-04T04:10:00Z"
  }
}
```

These scores are labeled **provisional** until the winner's Polymarket resolution is verified. `--refresh-results` stores each refreshed event response by run timestamp and leaves the original event inventory intact. The main overview uses one row per race for movers and offers a T−7 contested-race filter for confidence buckets. The race table supports office, competitiveness, and move filters. Since 434 House events are included, comparisons of forecast accuracy should report office and competitiveness segments as well as the overall score. Chamber-control markets need a separate mapping because they are party/control outcomes rather than direct race-winner events.

## Intraday movement method

- **T−1:** 11:59 p.m. America/New_York on the calendar day before each election.
- **Pre-close:** 5:00 p.m. America/New_York on election day, before the first U.S. general-election poll closing.
- A race enters the movement analysis only when all its included outcome contracts have usable prices within one hour of both cutoffs. The event probabilities are normalized separately at each cutoff.
- The confidence chart groups individual candidate or party outcomes into ten-point T−1 price bands. It reports the share whose absolute price change reached five percentage points by pre-close. Its denominator is outcome contracts, not independent races.
- The largest-move ranking counts each race once, using the outcome with the largest absolute change. A leadership reversal means the highest-priced outcome changed between snapshots.
- **Contested at T−7** means the highest-priced outcome was below 80% seven days before the election. This segment is fixed before results.
- A price movement is not an election result. Accuracy, high-confidence misses, calibration, and Brier scores require a verified winner. The 2025 archive is the completed test; 2026 outcomes remain pending until settlement or a sourced provisional call.
- The 2025 historical API did not return prices within one hour of the intraday cutoffs, so its intraday movement fields are omitted rather than treating stale prices as Election Day observations.

## Test

```bash
python -m unittest discover -s tests -v
```

The static site has no build dependencies. GitHub Actions deploys `site/` to GitHub Pages on pushes to `main`.
