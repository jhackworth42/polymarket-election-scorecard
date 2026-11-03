# The Forecast File

An open, reproducible scorecard for Polymarket election forecasts. The first published edition is a **2025 U.S. election historical test**; its site and data pipeline are designed for a separate 2026 midterm edition.

## See it

- [Live scorecard](https://jhackworth42.github.io/polymarket-election-scorecard/)
- [2025 coverage ledger](data/2025/coverage.json)
- [2025 scored data](data/2025/scorecard.json)

## Rebuild the historical edition

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m scorecard build --edition 2025
python -m http.server 8000 --directory site
```

Open `http://localhost:8000`. The build saves the Gamma event inventory, each historical price response, and settlement evidence under `data/2025/raw/`; `coverage.json` records every discovered event and its inclusion decision. Cached responses make repeat builds reproducible. `--refresh-discovery` refetches the event inventory; remove a cached price file to refetch that response.

The event search uses Polymarket's U.S. election tag (`1101`) and the date window in [`config/2025.json`](config/2025.json). It found 54 tagged events. The initial cohort includes direct race-winner event groups with at least two named, traded candidates and one uniquely resolved winner. Derivatives such as vote-share brackets, margins, timing bets, and parlays remain in the coverage ledger but are excluded from the main score. **This is a tagged-event cohort, not a census of every U.S. election or every Polymarket election contract.**

## Scoring

- Unit: one election-winner event, not one candidate contract.
- Cutoffs: 15:00 UTC, 30/21/14/7/3/1/0 days before each race's election day. The `0` cutoff is election-day morning in U.S. Eastern time. No post-poll-close prices enter forecast scoring.
- Candidate probabilities: historical `Yes` prices for named, traded candidates, normalized within each event to sum to one. The raw sum and each response's observation timestamp are retained.
- Staleness: a price older than 24 hours at the cutoff is excluded. A race is not scored at a horizon if its eventual winner has no usable price.
- Favorite hit rate: share of races where the highest priced candidate at the cutoff won.
- Multiclass Brier score: `0.5 * Σ(candidate_probability - outcome)^2`. The winner's outcome is 1; all others are 0. A lower mean is better.
- Contest segments: the highest candidate probability at the seven-day cutoff is fixed for the whole analysis. A race is **contested** if that value is below 80%; otherwise it is **clearer**. This uses pre-election prices, not the eventual vote margin.
- Time chart: uses only races with usable 30-day and one-day forecasts, so endpoint comparisons refer to the same races. Intermediate points retain those same races when prices are available.
- Winner: Gamma's settled outcome is checked against Polymarket's resolution endpoint. No election result is inferred from the pre-election price.

The [Data API documentation](https://data-api.polymarket.com/v2/docs) covers price history and resolutions. The historical price endpoint does not identify the returned number as an executable bid or ask, so this project labels it a historical price. The scorecard is descriptive; markets share political information and therefore do not form independent trials.

## 2026 edition plan

[`config/2026.json`](config/2026.json) records the discovery window and cutoffs. The tagged event inventory is frozen in `data/2026/raw/events.json`; rerunning without `--refresh-discovery` preserves that list. The 2025 historical test stays separate so it cannot be mistaken for a 2026 result.

```bash
# Collect available pre-election prices, without replacing the 2025 demo site.
python -m scorecard build --edition 2026

# After results, refresh settlement state for the frozen events and score settled races.
python -m scorecard build --edition 2026 --refresh-results

# When reviewed, put the 2026 edition on the public site.
python -m scorecard build --edition 2026 --refresh-results --publish-site
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

These scores are labeled **provisional** until the winner's Polymarket resolution is verified. `--refresh-results` stores each refreshed event response by run timestamp and leaves the original event inventory intact. The main 2026 editorial cohort should be Senate and governor races; House results should be analyzed as a separate cohort so hundreds of safe seats do not dominate the headline. Chamber-control markets need a separate mapping because they are party/control outcomes rather than direct candidate-winner events.

## Test

```bash
python -m unittest discover -s tests -v
```

The static site has no build dependencies. GitHub Actions deploys `site/` to GitHub Pages on pushes to `main`.
