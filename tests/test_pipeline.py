import unittest
from datetime import timezone

from scorecard.pipeline import brier, candidate_market, cutoff_time, event_decision, winner_market


class PipelineTests(unittest.TestCase):
    def test_multiclass_brier_and_hit_interpretation(self):
        self.assertAlmostEqual(brier([0.8, 0.2], 0), 0.04)
        self.assertAlmostEqual(brier([0.8, 0.2], 1), 0.64)

    def test_cutoff_is_before_election_day_in_utc(self):
        point = cutoff_time("2025-11-04", 1, 15)
        self.assertEqual(point.isoformat(), "2025-11-03T15:00:00+00:00")
        self.assertEqual(point.tzinfo, timezone.utc)

    def test_candidate_filter_excludes_placeholders(self):
        valid = {"question": "Will Jane Doe win the Governor Election in 2025?", "outcomes": '["Yes", "No"]',
                 "clobTokenIds": '["one", "two"]', "volume": "200"}
        self.assertTrue(candidate_market(valid))
        self.assertFalse(candidate_market({**valid, "question": "Will Candidate A win the Governor Election in 2025?"}))
        self.assertFalse(candidate_market({**valid, "volume": "0"}))

    def test_winner_requires_unique_settled_yes(self):
        a = {"closed": True, "outcomePrices": '["1", "0"]'}
        b = {"closed": True, "outcomePrices": '["0", "1"]'}
        self.assertIs(winner_market([a, b]), a)
        self.assertIsNone(winner_market([a, a]))

    def test_coverage_rule_separates_margin_market(self):
        config = {"exclude_slugs": [], "include_title_patterns": [r"Mayoral Election$"]}
        self.assertEqual(event_decision({"slug": "nyc", "title": "New York City Mayoral Election"}, config), "candidate")
        self.assertIn("excluded", event_decision({"slug": "margin", "title": "Mayoral Election Margin"}, config))


if __name__ == "__main__":
    unittest.main()
