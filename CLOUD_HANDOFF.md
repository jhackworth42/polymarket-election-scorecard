# Cloud session handoff

The repo contains the site, frozen pre-election prices, 2025 historical test, 2026 result pipeline, and source comparison. The public site is [GitHub Pages](https://jhackworth42.github.io/polymarket-election-scorecard/); pushing `main` deploys `site/`.

## Fastest refresh: GitHub Actions

Open [Actions → Refresh 2026 results](https://github.com/jhackworth42/polymarket-election-scorecard/actions/workflows/refresh-results.yml), choose **Run workflow** on `main`, and wait for the refresh and the subsequent Pages deployment. The workflow pulls the latest Polymarket settlement state, rebuilds the scorecard and source comparison, runs tests, commits changed `data/2026` and `site/data`, and publishes via the Pages workflow. No local environment is needed.

## Work in a cloud coding session

```bash
git clone https://github.com/jhackworth42/polymarket-election-scorecard.git
cd polymarket-election-scorecard
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
./scripts/refresh_2026.sh
```

Review the new counts and generated site data, then publish:

```bash
git status --short
git add data/2026 site/data
git commit -m "Refresh verified 2026 election results"
git push origin main
```

The Pages workflow deploys automatically after a normal push. To preview first, run `python3 -m http.server 8000 --directory site` and open port 8000 in the cloud session.

## What is frozen and what refreshes

- `data/2026/raw/events.json` is the original tagged event inventory. **Do not use `--refresh-discovery` for routine result updates.** It could change the cohort after outcomes are known.
- Historical forecast price responses under `data/2026/raw/prices/` are cached. The four headline checkpoints are 30 days, 7 days, 1 day, and election-day noon ET (six hours before the first U.S. poll close). Monday 11:59 p.m. and Tuesday 5 p.m. ET feed the pre-close movement section.
- `--refresh-results` fetches current Gamma event state for the frozen inventory and writes compact timestamped evidence under `data/2026/raw/result_refresh/`. Verified winners are checked against Polymarket resolutions; pending races stay pending. The site never treats an unverified price leader as a result.
- `data/2026/comparators/inside.json` and `polls.json` are **frozen pre-election source picks**. Do not refresh them from current web pages. The result pipeline rebuilds `data/2026/comparison.json` and `site/data/comparison.json` automatically from these picks and newly verified winners.
- `site/data/2026.json`, `site/data/comparison.json`, and the coverage ledger are the published static inputs. The overview, full race table, and source comparison page read these directly.

## Checks before sharing a new result

1. The build should report zero price fetch failures. If it does not, inspect `data/2026/fetch_failures.json` and retry.
2. Check the verified race count and the contested/clearer split. Early settlements skew heavily toward safe races; the site must keep its sample warning.
3. For a surprising miss or a source-ranking change, open the event link and resolution evidence in the generated data before writing a takeaway.
4. Run `python3 -m unittest discover -s tests -v` after code changes. A data-only refresh already runs this in the script and workflow.

## Next analysis work

- As competitive races settle, inspect the two Brier lines and the largest high-confidence misses. Determine whether late price movement increased the eventual winner's probability.
- The source ranking is directional winner-pick accuracy on the same verified Senate/governor races where Polymarket, Inside Elections, and the frozen FutureBallot polling average all made a D/R pick. Show coverage and abstentions beside the ranking. Poll vote margins remain a separate analysis.
- Source research and the eligibility rules are in [research/comparator-audit.md](research/comparator-audit.md). Cook and Sabato ratings are not in the automated ranking; Cook's published terms restrict copying its ratings, and Sabato's final race map needs a reviewed transcription.
