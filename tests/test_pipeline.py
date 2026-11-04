import unittest
from datetime import timezone

from scorecard.pipeline import brier, candidate_market, cutoff_time, event_decision, intraday_cutoff, race_category, winner_market


class PipelineTests(unittest.TestCase):
    def test_multiclass_brier_and_hit_interpretation(self):
        self.assertAlmostEqual(brier([0.8, 0.2], 0), 0.04)
        self.assertAlmostEqual(brier([0.8, 0.2], 1), 0.64)

    def test_cutoff_is_before_election_day_in_utc(self):
        point = cutoff_time("2025-11-04", 1, 15)
        self.assertEqual(point.isoformat(), "2025-11-03T15:00:00+00:00")
        self.assertEqual(point.tzinfo, timezone.utc)

    def test_intraday_cutoffs_use_eastern_time_before_poll_close(self):
        self.assertEqual(intraday_cutoff("2026-11-03", "night_before").isoformat(), "2026-11-03T04:59:00+00:00")
        self.assertEqual(intraday_cutoff("2026-11-03", "preclose").isoformat(), "2026-11-03T22:00:00+00:00")
        self.assertEqual(intraday_cutoff("2025-11-04", "night_before").isoformat(), "2025-11-04T04:59:00+00:00")

    def test_candidate_filter_excludes_placeholders(self):
        valid = {"question": "Will Jane Doe win the Governor Election in 2025?", "outcomes": '["Yes", "No"]',
                 "clobTokenIds": '["one", "two"]', "volume": "200"}
        self.assertTrue(candidate_market(valid))
        self.assertFalse(candidate_market({**valid, "question": "Will Candidate A win the Governor Election in 2025?"}))
        self.assertFalse(candidate_market({**valid, "volume": "0"}))
        self.assertTrue(candidate_market({**valid, "question": "Will the Democratic Party win the CA-22 House seat?"}))
        self.assertTrue(candidate_market({**valid, "question": "Will the Democrats win the Texas Senate race in 2026?"}))

    def test_winner_requires_unique_settled_yes(self):
        a = {"closed": True, "outcomePrices": '["1", "0"]'}
        b = {"closed": True, "outcomePrices": '["0", "1"]'}
        self.assertIs(winner_market([a, b]), a)
        self.assertIsNone(winner_market([a, a]))

    def test_coverage_rule_separates_margin_market(self):
        config = {"exclude_slugs": [], "include_title_patterns": [r"Mayoral Election$"]}
        self.assertEqual(event_decision({"slug": "nyc", "title": "New York City Mayoral Election"}, config), "candidate")
        self.assertIn("excluded", event_decision({"slug": "margin", "title": "Mayoral Election Margin"}, config))

    def test_categories_keep_house_separate(self):
        self.assertEqual(race_category("CA-22 House Election Winner"), "house")
        self.assertEqual(race_category("Texas Senate Election Winner"), "senate")


if __name__ == "__main__":
    unittest.main()
