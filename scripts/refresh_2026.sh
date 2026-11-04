#!/usr/bin/env bash
set -euo pipefail

python3 -m scorecard build --edition 2026 --refresh-results
python3 -m unittest discover -s tests -v
python3 - <<'PY'
import json
from pathlib import Path
score = json.loads(Path('data/2026/scorecard.json').read_text())
comparison = json.loads(Path('data/2026/comparison.json').read_text())
settled = sum(race['outcome_status'] == 'settled' for race in score['races'])
print(f"Verified: {settled}/{len(score['races'])} races")
print(f"Shared Senate/governor comparison: {comparison['common_verified_races']} races")
print('Generated site data: site/data/2026.json and site/data/comparison.json')
PY
