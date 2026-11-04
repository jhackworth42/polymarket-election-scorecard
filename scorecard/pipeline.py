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
from zoneinfo import ZoneInfo

import requests


ROOT = Path(__file__).resolve().parents[1]
GAMMA = "https://gamma-api.polymarket.com"
DATA = "https://data-api.polymarket.com/v2"
HORIZON_LABELS = {30: "30 days", 21: "21 days", 14: "14 days", 7: "7 days", 3: "3 days", 1: "1 day", 0: "Election morning"}
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


def save_site_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, separators=(",", ":"), ensure_ascii=False))


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


def intraday_cutoff(day: str, name: str, tz_name: str = "America/New_York") -> datetime:
    local_day = datetime.fromisoformat(day)
    if name == "night_before":
        local = (local_day - timedelta(days=1)).replace(hour=23, minute=59, tzinfo=ZoneInfo(tz_name))
    elif name == "preclose":
        local = local_day.replace(hour=17, minute=0, tzinfo=ZoneInfo(tz_name))
    else:
        raise ValueError(f"Unknown intraday cutoff: {name}")
    return local.astimezone(timezone.utc)


def event_cutoffs(day: str, config: dict) -> list[tuple[str, datetime]]:
    regular = [(str(horizon), cutoff_time(day, horizon, config["cutoff_hour_utc"]))
               for horizon in config["horizons_days"]]
    intraday = [(name, intraday_cutoff(day, name)) for name in ("night_before", "preclose")]
    return regular + intraday


def race_category(title: str) -> str:
    lowered = title.lower()
    if "senate election winner" in lowered:
        return "senate"
    if "governor election winner" in lowered:
        return "governor"
    if "house election winner" in lowered:
        return "house"
    if "mayoral election" in lowered:
        return "mayor"
    return "other"


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
    parser.add_argument("command", choices=["build", "inventory"])
    parser.add_argument("--edition", default="2025")
    parser.add_argument("--refresh-discovery", action="store_true")
    parser.add_argument("--refresh-results", action="store_true", help="Refetch current event settlement state without changing the frozen event list")
    parser.add_argument("--publish-site", action="store_true", help="Copy this edition into the static site")
    args = parser.parse_args()
    config = json.loads((ROOT / "config" / f"{args.edition}.json").read_text())
    outdir = ROOT / "data" / args.edition
    raw = outdir / "raw"
    discovery_path = raw / "events.json"
    events = json.loads(discovery_path.read_text()) if discovery_path.exists() and not args.refresh_discovery else discover(config)
    save_json(discovery_path, events)
    if args.command == "inventory":
        print(f"Frozen {len(events)} tagged events in {discovery_path}")
        return

    ledger = []
    included = []
    calls_path = outdir / "calls.json"
    calls = json.loads(calls_path.read_text()) if calls_path.exists() else {}
    refresh_dir = raw / "result_refresh" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for event in events:
        reason = event_decision(event, config)
        markets = [m for m in event.get("markets", []) if candidate_market(m)] if reason == "candidate" else []
        if reason == "candidate" and args.refresh_results:
            current = get_json(f"{GAMMA}/events", {"slug": event["slug"]})
            if current:
                save_json(refresh_dir / f"{event['slug']}.json", {
                    "id": current[0].get("id"), "slug": current[0].get("slug"),
                    "markets": [{key: market.get(key) for key in ("id", "conditionId", "closed", "outcomePrices")}
                                for market in current[0].get("markets", [])],
                })
                current_markets = {m["id"]: m for m in current[0].get("markets", [])}
                markets = [current_markets.get(m["id"], m) for m in markets]
        winner = winner_market(markets) if markets else None
        provisional = False
        if winner is None and event["slug"] in calls:
            call = calls[event["slug"]]
            if not call.get("source_url") or not call.get("called_at"):
                raise ValueError(f"Provisional call requires source_url and called_at: {event['slug']}")
            winner = next((m for m in markets if m["conditionId"] == call.get("condition_id")), None)
            if winner is None:
                raise ValueError(f"Call condition_id not found in frozen cohort: {event['slug']}")
            provisional = True
        if reason == "candidate" and len(markets) < 2:
            reason = "excluded: fewer than two traded candidate or party outcomes"
        elif reason == "candidate" and winner is None and args.edition == "2025":
            reason = "excluded: winner not uniquely settled"
        ledger.append({
            "event_id": event["id"], "slug": event["slug"], "title": event["title"].strip(),
            "url": f"https://polymarket.com/event/{event['slug']}",
            "market_count": len(event.get("markets", [])), "candidate_count": len(markets),
            "decision": ("included: pending" if winner is None else "included: provisional" if provisional else "included") if reason == "candidate" else reason,
        })
        if reason == "candidate":
            included.append((event, markets, winner, provisional))
    save_json(outdir / "coverage.json", ledger)
    save_site_json(ROOT / "site" / "data" / f"{args.edition}-coverage.json", ledger)
    if args.edition == "2025":
        save_json(ROOT / "site" / "coverage.json", ledger)

    jobs = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for event, markets, _, _ in included:
            day = config["election_day_overrides"].get(event["slug"], config["default_election_day"])
            for horizon, cutoff in event_cutoffs(day, config):
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
    for event, markets, winner, provisional in included:
        resolution = (verify_resolution(winner["conditionId"], raw / "resolutions" / f"{winner['conditionId']}.json")
                      if winner and not provisional else None)
        if resolution is not None and not resolution["verified"]:
            raise ValueError(f"Winner settlement was not verified for {event['slug']}")
        if provisional:
            call = calls[event["slug"]]
            resolution = {"verified": False, "provisional": True, "source": call["source_url"], "called_at": call["called_at"]}
        day = config["election_day_overrides"].get(event["slug"], config["default_election_day"])
        candidates = [{"id": m["id"], "name": re.match(r"(?i)^Will (.+?) win ", m["question"]).group(1).strip(),
                       "question": m["question"], "condition_id": m["conditionId"],
                       "volume": float(m.get("volume") or 0)} for m in markets]
        winner_index = next((i for i, m in enumerate(markets) if winner and m["id"] == winner["id"]), None)
        forecasts = {}
        for horizon, cutoff in event_cutoffs(day, config):
            values = []
            times = []
            for m in markets:
                point = observations.get((event["id"], horizon, m["id"]))
                if point is None:
                    values.append(None)
                    continue
                age = (cutoff.timestamp() - point["timestamp"]) / 3600
                max_age = config.get("intraday_stale_hours_max", config["stale_hours_max"]) if horizon in ("night_before", "preclose") else config["stale_hours_max"]
                values.append(float(point["price"]) if 0 <= age <= max_age else None)
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
            "category": race_category(event["title"]),
            "winner_index": winner_index, "winner": candidates[winner_index]["name"] if winner_index is not None else None,
            "resolution": resolution, "outcome_status": "pending" if winner is None else "provisional" if provisional else "settled",
            "candidates": candidates, "forecasts": forecasts})
    races.sort(key=lambda r: r["title"])
    for race in races:
        night = race["forecasts"].get("night_before", {})
        preclose = race["forecasts"].get("preclose", {})
        if not night.get("probabilities") or not preclose.get("probabilities"):
            race["movement"] = None
            continue
        deltas = [(i, round(after - before, 6)) for i, (before, after) in
                  enumerate(zip(night["probabilities"], preclose["probabilities"]))
                  if before is not None and after is not None]
        if not deltas:
            race["movement"] = None
            continue
        biggest_index, biggest_delta = max(deltas, key=lambda item: abs(item[1]))
        before_leader = night["leader_index"]
        race["movement"] = {
            "night_before_cutoff": night["cutoff"], "preclose_cutoff": preclose["cutoff"],
            "night_before_leader_index": before_leader,
            "preclose_leader_index": preclose["leader_index"],
            "leader_flipped": before_leader != preclose["leader_index"],
            "night_before_favorite_probability": night["probabilities"][before_leader],
            "preclose_same_candidate_probability": preclose["probabilities"][before_leader],
            "favorite_move_pp": round(100 * (preclose["probabilities"][before_leader] - night["probabilities"][before_leader]), 2)
                if preclose["probabilities"][before_leader] is not None else None,
            "biggest_mover_index": biggest_index, "biggest_move_pp": round(100 * biggest_delta, 2),
            "winner_night_before_probability": night["probabilities"][race["winner_index"]]
                if race["winner_index"] is not None else None,
            "winner_preclose_probability": preclose["probabilities"][race["winner_index"]]
                if race["winner_index"] is not None else None,
        }
    for race in races:
        week = race["forecasts"].get("7", {})
        probabilities = week.get("probabilities") or []
        top = max((p for p in probabilities if p is not None), default=None)
        race["segment"] = "contested" if top is not None and top < 0.8 else "clear" if top is not None else "unclassified"
    summary = {}
    summary_by_segment = {}
    for horizon in config["horizons_days"]:
        scored = [r["forecasts"][str(horizon)] for r in races if r["forecasts"][str(horizon)]["status"] == "scored"]
        summary[str(horizon)] = {"label": HORIZON_LABELS[horizon], "n": len(scored),
            "provisional_n": sum(r["outcome_status"] == "provisional" for r in races if r["forecasts"][str(horizon)]["status"] == "scored"),
            "hit_rate": round(sum(f["hit"] for f in scored) / len(scored), 4) if scored else None,
            "brier": round(statistics.mean(f["brier"] for f in scored), 4) if scored else None}
        summary_by_segment[str(horizon)] = {}
        for segment in ("contested", "clear", "unclassified"):
            segment_scored = [r["forecasts"][str(horizon)] for r in races
                              if r["segment"] == segment and r["forecasts"][str(horizon)]["status"] == "scored"]
            summary_by_segment[str(horizon)][segment] = {
                "n": len(segment_scored),
                "hits": sum(f["hit"] for f in segment_scored),
                "brier": round(statistics.mean(f["brier"] for f in segment_scored), 4) if segment_scored else None,
            }
    paired = [r for r in races if r["forecasts"].get("30", {}).get("status") == "scored"
              and r["forecasts"].get("1", {}).get("status") == "scored"]
    paired_30 = statistics.mean(r["forecasts"]["30"]["brier"] for r in paired) if paired else None
    paired_1 = statistics.mean(r["forecasts"]["1"]["brier"] for r in paired) if paired else None
    favorite_flips = sum(r["forecasts"]["30"]["leader_index"] != r["forecasts"]["1"]["leader_index"] for r in paired)
    timeline = {}
    for horizon in config["horizons_days"]:
        timeline[str(horizon)] = {}
        for segment in ("contested", "clear"):
            group = [r["forecasts"][str(horizon)] for r in paired if r["segment"] == segment
                     and r["forecasts"][str(horizon)]["status"] == "scored"]
            timeline[str(horizon)][segment] = {"n": len(group),
                "brier": round(statistics.mean(f["brier"] for f in group), 4) if group else None}
    result = {"edition": config["edition"], "label": config["label"], "generated_at": datetime.now(timezone.utc).isoformat(),
        "method": {"unit": "one election-winner event", "probabilities": "traded candidate or party Yes prices normalized to sum to one; missing prices treated as zero for scoring",
                   "brier": "0.5 × sum((probability - outcome)^2) across candidates", "cutoff_hour_utc": config["cutoff_hour_utc"],
                   "stale_hours_max": config["stale_hours_max"], "horizons_days": config["horizons_days"],
                   "intraday_stale_hours_max": config.get("intraday_stale_hours_max"),
                   "intraday_cutoffs": {"timezone": "America/New_York", "night_before": "23:59 on the prior calendar day",
                                        "preclose": "17:00 on election day, before first U.S. general-election poll close"}},
        "discovered_events": len(events), "included_races": len(races), "fetch_failures": len(failures),
        "category_counts": {name: sum(r["category"] == name for r in races) for name in sorted({r["category"] for r in races})},
        "segmentation": {"basis": "highest candidate probability seven days before each race", "contested_if_below": 0.8},
        "summary": summary, "summary_by_segment": summary_by_segment,
        "paired_30_to_1": {"n": len(paired), "brier_30": round(paired_30, 4) if paired_30 is not None else None,
                            "brier_1": round(paired_1, 4) if paired_1 is not None else None,
                            "improvement_fraction": round((paired_30 - paired_1) / paired_30, 4) if paired_30 else None,
                            "favorite_flips": favorite_flips},
        "timeline": timeline,
        "races": races}
    save_json(outdir / "scorecard.json", result)
    save_site_json(ROOT / "site" / "data" / f"{args.edition}.json", result)
    if args.edition == "2025":
        save_json(ROOT / "site" / "scorecard.json", result)
    print(f"{len(events)} discovered; {len(races)} races included; {len(failures)} fetch failures")
    for horizon, item in summary.items():
        print(f"{item['label']}: n={item['n']}, hit={item['hit_rate']}, Brier={item['brier']}")


if __name__ == "__main__":
    main()
