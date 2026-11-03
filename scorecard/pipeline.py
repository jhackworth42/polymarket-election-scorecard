"""Discover, freeze, and score Polymarket election winner events.

Run ``python -m scorecard build --edition 2025`` from the repository root.
Every API response used in a build is retained under data/<edition>/raw/.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
import statistics
import time

import requests


ROOT = Path(__file__).resolve().parents[1]
GAMMA = "https://gamma-api.polymarket.com"
DATA = "https://data-api.polymarket.com/v2"
HORIZON_LABELS = {30: "30 days", 7: "7 days", 1: "1 day", 0: "Election day"}
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "election-scorecard/0.1 (research; public data)"})


def get_json(url: str, params: dict | None = None) -> object:
    for attempt in range(4):
        try:
            response = SESSION.get(url, params=params, timeout=25)
            if response.status_code in (429, 500, 502, 503, 504):
                time.sleep(0.6 * (attempt + 1))
                continue
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError):
            if attempt == 3:
                raise
            time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(f"Could not fetch {url}")


def save_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def parse_list(value: object) -> list:
    return json.loads(value) if isinstance(value, str) else (value or [])


def discover(config: dict) -> list[dict]:
    results = []
    for offset in range(0, 10000, 100):
        page = get_json(
            f"{GAMMA}/events",
            {
                "tag_id": config["tag_id"],
                "limit": 100,
                "offset": offset,
                "end_date_min": config["end_date_min"],
                "end_date_max": config["end_date_max"],
            },
        )
        results.extend(page)
        if len(page) < 100:
            return results
    raise RuntimeError("Discovery exceeded 10,000 events; narrow config range")


def event_decision(event: dict, config: dict) -> str:
    if event["slug"] in config["exclude_slugs"]:
        return "excluded: explicit slug rule"
    title = event["title"].strip()
    if not any(re.search(pattern, title) for pattern in config["include_title_patterns"]):
        return "excluded: not a race-winner event"
    return "candidate"


def candidate_market(market: dict) -> bool:
    question = market.get("question", "")
    if not re.match(r"(?i)^Will .+ win .+", question):
        return False
    if re.search(r"(?i)\b(person|candidate [a-z]|another candidate|other candidate|another party|other party)\b", question):
        return False
    outcomes = parse_list(market.get("outcomes"))
    tokens = parse_list(market.get("clobTokenIds"))
    return outcomes[:2] == ["Yes", "No"] and len(tokens) >= 2 and float(market.get("volume") or 0) > 0


def winner_market(markets: list[dict]) -> dict | None:
    winners = []
    for market in markets:
        prices = parse_list(market.get("outcomePrices"))
        if market.get("closed") and prices and float(prices[0]) > 0.999:
            winners.append(market)
    return winners[0] if len(winners) == 1 else None


def verify_resolution(condition_id: str, cache_path: Path) -> dict:
    if cache_path.exists():
        response = json.loads(cache_path.read_text())
    else:
        response = get_json(f"{DATA}/resolutions", {"condition": condition_id})
        save_json(cache_path, response)
    records = response.get("data", [])
    verified = any(row.get("status") == "resolved" and int(row.get("price") or 0) == 10**18 for row in records)
    return {"verified": verified, "source": f"{DATA}/resolutions?condition={condition_id}"}


def cutoff_time(day: str, horizon: int, hour: int) -> datetime:
    base = datetime.fromisoformat(day).replace(tzinfo=timezone.utc, hour=hour)
    return base - timedelta(days=horizon)


def brier(probabilities: list[float], winner_index: int) -> float:
    """Half the multiclass squared error, matching binary Brier's 0–1 scale."""
    return sum((p - int(i == winner_index)) ** 2 for i, p in enumerate(probabilities)) / 2


def snapshot(token_id: str, as_of: datetime, cache_path: Path) -> dict:
    if cache_path.exists():
        return json.loads(cache_path.read_text())
    response = get_json(
        f"{DATA}/prices-history",
        {"token_id": token_id, "as_of": int(as_of.timestamp())},
    )
    save_json(cache_path, response)
    return response


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["build"])
    parser.add_argument("--edition", default="2025")
    parser.add_argument("--refresh-discovery", action="store_true")
    parser.add_argument("--publish-site", action="store_true", help="Copy this edition into the static site")
    args = parser.parse_args()
    config = json.loads((ROOT / "config" / f"{args.edition}.json").read_text())
    outdir = ROOT / "data" / args.edition
    raw = outdir / "raw"
    discovery_path = raw / "events.json"
    events = json.loads(discovery_path.read_text()) if discovery_path.exists() and not args.refresh_discovery else discover(config)
    save_json(discovery_path, events)

    ledger = []
    included = []
    for event in events:
        reason = event_decision(event, config)
        markets = [m for m in event.get("markets", []) if candidate_market(m)] if reason == "candidate" else []
        winner = winner_market(markets) if markets else None
        if reason == "candidate" and len(markets) < 2:
            reason = "excluded: fewer than two named, traded candidates"
        elif reason == "candidate" and winner is None and args.edition == "2025":
            reason = "excluded: winner not uniquely settled"
        ledger.append({
            "event_id": event["id"], "slug": event["slug"], "title": event["title"].strip(),
            "url": f"https://polymarket.com/event/{event['slug']}",
            "market_count": len(event.get("markets", [])), "candidate_count": len(markets),
            "decision": ("included: pending" if winner is None else "included") if reason == "candidate" else reason,
        })
        if reason == "candidate":
            included.append((event, markets, winner))
    save_json(outdir / "coverage.json", ledger)
    if args.edition == "2025" or args.publish_site:
        save_json(ROOT / "site" / "coverage.json", ledger)

    jobs = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for event, markets, _ in included:
            day = config["election_day_overrides"].get(event["slug"], config["default_election_day"])
            for horizon in config["horizons_days"]:
                cutoff = cutoff_time(day, horizon, config["cutoff_hour_utc"])
                if cutoff > datetime.now(timezone.utc):
                    continue
                for market in markets:
                    token = parse_list(market["clobTokenIds"])[0]
                    cache = raw / "prices" / f"{token}_{int(cutoff.timestamp())}.json"
                    jobs[pool.submit(snapshot, token, cutoff, cache)] = (event["id"], horizon, market["id"], cutoff)
        observations = {}
        failures = []
        for future in as_completed(jobs):
            event_id, horizon, market_id, cutoff = jobs[future]
            try:
                response = future.result()
                points = response.get("data", [])
                if points:
                    observations[(event_id, horizon, market_id)] = points[0]
            except Exception as exc:
                failures.append({"event_id": event_id, "market_id": market_id, "horizon": horizon, "error": str(exc)})
    save_json(outdir / "fetch_failures.json", failures)

    races = []
    for event, markets, winner in included:
        resolution = verify_resolution(winner["conditionId"], raw / "resolutions" / f"{winner['conditionId']}.json") if winner else None
        if resolution is not None and not resolution["verified"]:
            raise ValueError(f"Winner settlement was not verified for {event['slug']}")
        day = config["election_day_overrides"].get(event["slug"], config["default_election_day"])
        candidates = [{"id": m["id"], "name": re.match(r"(?i)^Will (.+?) win ", m["question"]).group(1).strip(),
                       "question": m["question"], "condition_id": m["conditionId"],
                       "volume": float(m.get("volume") or 0)} for m in markets]
        winner_index = next((i for i, m in enumerate(markets) if winner and m["id"] == winner["id"]), None)
        forecasts = {}
        for horizon in config["horizons_days"]:
            cutoff = cutoff_time(day, horizon, config["cutoff_hour_utc"])
            values = []
            times = []
            for m in markets:
                point = observations.get((event["id"], horizon, m["id"]))
                if point is None:
                    values.append(None)
                    continue
                age = (cutoff.timestamp() - point["timestamp"]) / 3600
                values.append(float(point["price"]) if 0 <= age <= config["stale_hours_max"] else None)
                times.append({"market_id": m["id"], "observed_at": datetime.fromtimestamp(point["timestamp"], timezone.utc).isoformat(),
                              "age_hours": round(age, 2), "resolution_seconds": point.get("resolution_seconds")})
            available = [(i, v) for i, v in enumerate(values) if v is not None]
            total = sum(v for _, v in available)
            if not available or total <= 0 or (winner_index is not None and values[winner_index] is None):
                forecasts[str(horizon)] = {"status": "missing", "cutoff": cutoff.isoformat(), "observations": times}
                continue
            normalized = [v / total if v is not None else None for v in values]
            present = [(i, p) for i, p in enumerate(normalized) if p is not None]
            leader_index = max(present, key=lambda pair: pair[1])[0]
            score = brier([p or 0 for p in normalized], winner_index) if winner_index is not None else None
            forecasts[str(horizon)] = {"status": "scored" if winner_index is not None else "pending", "cutoff": cutoff.isoformat(),
                "raw_sum": round(total, 4), "probabilities": [round(p, 6) if p is not None else None for p in normalized],
                "raw_prices": values, "observations": times, "leader_index": leader_index,
                "hit": leader_index == winner_index if winner_index is not None else None,
                "brier": round(score, 6) if score is not None else None,
                "winner_probability": round(normalized[winner_index], 6) if winner_index is not None else None}
        races.append({"id": event["id"], "title": event["title"].strip(), "slug": event["slug"],
            "url": f"https://polymarket.com/event/{event['slug']}", "election_day": day,
            "winner_index": winner_index, "winner": candidates[winner_index]["name"] if winner_index is not None else None,
            "resolution": resolution,
            "candidates": candidates, "forecasts": forecasts})
    races.sort(key=lambda r: r["title"])
    summary = {}
    for horizon in config["horizons_days"]:
        scored = [r["forecasts"][str(horizon)] for r in races if r["forecasts"][str(horizon)]["status"] == "scored"]
        summary[str(horizon)] = {"label": HORIZON_LABELS[horizon], "n": len(scored),
            "hit_rate": round(sum(f["hit"] for f in scored) / len(scored), 4) if scored else None,
            "brier": round(statistics.mean(f["brier"] for f in scored), 4) if scored else None}
    result = {"edition": config["edition"], "label": config["label"], "generated_at": datetime.now(timezone.utc).isoformat(),
        "method": {"unit": "one election-winner event", "probabilities": "named, traded candidate Yes prices normalized to sum to one; missing prices treated as zero for scoring",
                   "brier": "0.5 × sum((probability - outcome)^2) across candidates", "cutoff_hour_utc": config["cutoff_hour_utc"],
                   "stale_hours_max": config["stale_hours_max"], "horizons_days": config["horizons_days"]},
        "discovered_events": len(events), "included_races": len(races), "fetch_failures": len(failures),
        "summary": summary, "races": races}
    save_json(outdir / "scorecard.json", result)
    if args.edition == "2025" or args.publish_site:
        save_json(ROOT / "site" / "scorecard.json", result)
    print(f"{len(events)} discovered; {len(races)} races included; {len(failures)} fetch failures")
    for horizon, item in summary.items():
        print(f"{item['label']}: n={item['n']}, hit={item['hit_rate']}, Brier={item['brier']}")


if __name__ == "__main__":
    main()
