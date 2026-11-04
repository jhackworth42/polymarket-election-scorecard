import unittest

from scorecard.comparison import party_from_name, poll_pick, race_key


class ComparisonTests(unittest.TestCase):
    def test_tied_poll_average_abstains(self):
        self.assertEqual(poll_pick("D+3 (9)"), "D")
        self.assertEqual(poll_pick("R+1 (7)"), "R")
        self.assertIsNone(poll_pick("Even (15)"))
        self.assertIsNone(poll_pick("D+0 (4)"))

    def test_race_and_party_mapping(self):
        self.assertEqual(race_key("Virginia Senate Election Winner"), "senate:VA")
        self.assertEqual(race_key("New Hampshire Governor Election Winner"), "governor:NH")
        self.assertEqual(party_from_name("the Democrats"), "D")
        self.assertEqual(party_from_name("the Republican Party"), "R")
        self.assertEqual(party_from_name("Mary Peltola"), "D")
        self.assertIsNone(party_from_name("Unmapped candidate"))


if __name__ == "__main__":
    unittest.main()
