"""Freeze public directional calls and score a shared Senate/governor cohort.

Run `python -m scorecard.comparison fetch` once for the pre-election sources,
then `python -m scorecard.comparison build` after updating the 2026 scorecard.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re

from bs4 import BeautifulSoup
import requests

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "data" / "2026" / "comparators"
SCORECARD = ROOT / "data" / "2026" / "scorecard.json"
SITE_OUTPUT = ROOT / "site" / "data" / "comparison.json"
SIX_HOUR_CUTOFF = datetime.fromisoformat("2026-11-03T17:00:00+00:00")
STATES = dict(zip(
    "Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware Florida Georgia Hawaii Idaho Illinois Indiana Iowa Kansas Kentucky Louisiana Maine Maryland Massachusetts Michigan Minnesota Mississippi Missouri Montana Nebraska Nevada New Hampshire New Jersey New Mexico New York North Carolina North Dakota Ohio Oklahoma Oregon Pennsylvania Rhode Island South Carolina South Dakota Tennessee Texas Utah Vermont Virginia Washington West Virginia Wisconsin Wyoming".replace("New Hampshire", "New_Hampshire").replace("New Jersey", "New_Jersey").replace("New Mexico", "New_Mexico").replace("New York", "New_York").replace("North Carolina", "North_Carolina").replace("North Dakota", "North_Dakota").replace("Rhode Island", "Rhode_Island").replace("South Carolina", "South_Carolina").replace("South Dakota", "South_Dakota").replace("West Virginia", "West_Virginia").split(),
    "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split()
))
STATES = {name.replace("_", " "): abbreviation for name, abbreviation in STATES.items()}
INSIDE_URL = "https://insideelections.com/wp-content/themes/inside-elections/cache/ratings_latest_{}_year=2026_district=all_clean.json"
POLL_URL = "https://futureballot.com/polls"
NAMED_PARTIES = {
    # General-election candidate labels verified against official/primary or cited race guides.
    "Mary Peltola": "D", "Dan Sullivan": "R",
    "Jonathan Kreiss-Tomkins": "D", "Bernadette Wilson": "R",
    "Xavier Becerra": "D", "Steve Hilton": "R",
}


def save(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def party_from_name(name: str | None) -> str | None:
    if not name:
        return None
    if re.search(r"(?i)\bdemocrat", name):
        return "D"
    if re.search(r"(?i)\brepublican", name):
        return "R"
    return NAMED_PARTIES.get(name)


def race_key(title: str) -> str | None:
    match = re.match(r"^(.+?) (Senate|Governor) Election Winner$", title)
    if not match:
        return None
    state = STATES.get(match.group(1))
    return f"{match.group(2).lower()}:{state}" if state else None


def poll_pick(value: str) -> str | None:
    match = re.match(r"^([DR])\+(\d+(?:\.\d+)?)\s*\(\d+\)$", value)
    return match.group(1) if match and float(match.group(2)) > 0 else None


def fetch_sources() -> None:
    session = requests.Session()
    session.headers.update({"User-Agent": "polymarket-election-scorecard/0.1 (source audit)"})
    inside = {}
    inside_times = []
    for office in ("senate", "governor"):
        url = INSIDE_URL.format(office)
        response = session.get(url, timeout=30)
        response.raise_for_status()
        payload = response.json()
        as_of = datetime.fromisoformat(payload["generated_at"])
        inside_times.append(as_of)
        if as_of > SIX_HOUR_CUTOFF:
            raise ValueError(f"Inside Elections data is after the six-hour cutoff: {as_of}")
        for row in payload["ratings"]:
            if row["rating"] == "Not Up This Cycle":
                continue
            key = f"{office}:{row['district'].upper()}"
            rating = row["rating"]
            inside[key] = {"pick": "D" if "Democrat" in rating else "R" if "Republican" in rating else None,
                           "rating": rating, "source_url": f"https://insideelections.com/ratings/{office}/"}
        print(f"Inside Elections {office}: {sum(key.startswith(office+':') for key in inside)} ratings")
    save(SOURCE_DIR / "inside.json", {"source": "Inside Elections", "as_of": max(inside_times).isoformat(),
         "source_url": "https://insideelections.com/developer/", "picks": inside})

    response = session.get(POLL_URL, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    text = soup.get_text(" ", strip=True)
    if "Polls on record as of November 2, 2026" not in text or "21:12 UTC" not in text:
        raise ValueError("FutureBallot snapshot no longer matches the pre-election November 2 record")
    tables = soup.find_all("table")
    table = next((table for table in tables if "Polling averages by race" in table.get_text(" ", strip=True)[:150]), None)
    if table is None:
        raise ValueError("Could not locate the polling-averages table")
    polls = {}
    for row in table.find_all("tr")[1:]:
        cells = [cell.get_text(" ", strip=True) for cell in row.find_all(["th", "td"])]
        if len(cells) < 5:
            continue
        match = re.fullmatch(r"(.+?) (Senate|Governor)", cells[0])
        if not match:
            continue
        state = STATES.get(match.group(1))
        if not state:
            continue
        key = f"{match.group(2).lower()}:{state}"
        polls[key] = {"pick": poll_pick(cells[3]), "average": cells[3], "latest_poll": cells[2],
                      "source_url": POLL_URL}
    save(SOURCE_DIR / "polls.json", {"source": "FutureBallot simple polling average", "as_of": "2026-11-02T21:12:00Z",
         "source_url": POLL_URL, "method": "Mean poll margin in the 30 days before each race's newest poll; ties abstain",
         "picks": polls})
    print(f"FutureBallot: {len(polls)} Senate/governor averages")


def build() -> None:
    scorecard = json.loads(SCORECARD.read_text())
    snapshots = {name: json.loads((SOURCE_DIR / f"{name}.json").read_text()) for name in ("inside", "polls")}
    rows = []
    for race in scorecard["races"]:
        if race["category"] not in ("senate", "governor"):
            continue
        key = race_key(race["title"])
        if not key:
            continue
        forecast = race["forecasts"].get("six_hours", {})
        favorite = race["candidates"][forecast["leader_index"]]["name"] if forecast.get("probabilities") else None
        winner_party = party_from_name(race["winner"]) if race["outcome_status"] == "settled" else None
        rows.append({"key": key, "title": race["title"], "url": race["url"], "status": race["outcome_status"],
            "winner_party": winner_party, "polymarket": {"pick": party_from_name(favorite),
                "confidence": forecast["probabilities"][forecast["leader_index"]] if forecast.get("probabilities") else None},
            "inside": snapshots["inside"]["picks"].get(key), "polls": snapshots["polls"]["picks"].get(key)})
    settled = [row for row in rows if row["winner_party"]]
    common = [row for row in settled if all(row[source] and row[source]["pick"] for source in ("polymarket", "inside", "polls"))]
    sources = []
    for key, label in (("polymarket", "Polymarket"), ("inside", "Inside Elections"), ("polls", "Polling average")):
        covered = sum(bool(row[key] and row[key]["pick"]) for row in rows)
        own = [row for row in settled if row[key] and row[key]["pick"]]
        hits = sum(row[key]["pick"] == row["winner_party"] for row in common)
        sources.append({"key": key, "name": label, "coverage": covered, "eligible": len(rows),
                        "settled_covered": len(own), "common_hits": hits, "common_n": len(common),
                        "common_hit_rate": round(hits / len(common), 4) if common else None})
    result = {"as_of": SIX_HOUR_CUTOFF.isoformat(), "generated_at": datetime.now(timezone.utc).isoformat(),
              "unit": "one Senate or governor race with a directional party pick at the six-hour checkpoint",
              "method": "Ranking uses only verified races where all three sources made a D/R pick; ties and Toss-ups abstain",
              "source_as_of": {key: value["as_of"] for key, value in snapshots.items()},
              "sources": sources, "common_verified_races": len(common), "races": rows}
    save(ROOT / "data" / "2026" / "comparison.json", result)
    save(SITE_OUTPUT, result)
    print(f"{len(rows)} Senate/governor races; {len(settled)} verified with party winner; {len(common)} common verified calls")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("fetch", "build"))
    args = parser.parse_args()
    if args.command == "fetch":
        fetch_sources()
    else:
        build()


if __name__ == "__main__":
    main()
