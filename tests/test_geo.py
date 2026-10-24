"""Tests for scripts/geo.py: distances, route length and joining route pieces.

Run all tests from the repo folder with:
    python3 -m unittest discover -s tests -v
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import geo  # noqa: E402  (has to come after the sys.path line above)

# A straight walk east along latitude 60.3, one point every 0.001 degrees of
# longitude (about 55 m apart at this latitude).
STRAIGHT = [(60.3, 24.500 + i * 0.001) for i in range(10)]


class DistanceTests(unittest.TestCase):
    def test_one_degree_of_latitude_is_about_111_km(self):
        self.assertAlmostEqual(geo.distance_m((60.0, 24.5), (61.0, 24.5)), 111_195, delta=50)

    def test_same_point_is_zero(self):
        self.assertEqual(geo.distance_m((60.3, 24.5), (60.3, 24.5)), 0)

    def test_route_length_adds_up_the_steps(self):
        steps = sum(geo.distance_m(a, b) for a, b in zip(STRAIGHT, STRAIGHT[1:]))
        self.assertAlmostEqual(geo.route_length_m(STRAIGHT), steps)
        self.assertAlmostEqual(geo.route_length_m(STRAIGHT), 497, delta=3)

    def test_extra_numbers_like_elevation_are_ignored(self):
        self.assertEqual(geo.distance_m((60.0, 24.5, 30.0), (61.0, 24.5, 90.0)),
                         geo.distance_m((60.0, 24.5), (61.0, 24.5)))


class LocateOnRouteTests(unittest.TestCase):
    def test_point_50_m_north_of_the_middle(self):
        middle_lon = (STRAIGHT[0][1] + STRAIGHT[-1][1]) / 2
        point = (60.3 + 50 / geo.METRES_PER_DEGREE_LAT, middle_lon)
        distance, along = geo.locate_on_route(point, STRAIGHT)
        self.assertAlmostEqual(distance, 50, delta=1)
        self.assertAlmostEqual(along, geo.route_length_m(STRAIGHT) / 2, delta=3)

    def test_point_before_the_start_is_measured_to_the_start(self):
        point = (60.3, 24.499)  # about 55 m west of the first point
        distance, along = geo.locate_on_route(point, STRAIGHT)
        self.assertAlmostEqual(distance, 55, delta=2)
        self.assertEqual(along, 0)


class JoinPiecesTests(unittest.TestCase):
    def test_shuffled_and_flipped_pieces_join_back_into_the_route(self):
        pieces = [
            STRAIGHT[6:],  # the end
            list(reversed(STRAIGHT[:4])),  # the start, pointing the wrong way
            STRAIGHT[3:7],  # the middle (its ends touch the other pieces)
        ]
        line, problem = geo.join_pieces(pieces)
        self.assertIsNone(problem)
        # The longest piece decides the direction, so accept either direction.
        self.assertIn(line, (STRAIGHT, list(reversed(STRAIGHT))))

    def test_small_gaps_are_bridged(self):
        line, problem = geo.join_pieces([STRAIGHT[:5], STRAIGHT[5:]])  # gap of about 55 m...
        self.assertIsNotNone(problem)  # ...is more than the default 50 m
        line, problem = geo.join_pieces([STRAIGHT[:5], STRAIGHT[5:]], max_gap_m=60)
        self.assertIsNone(problem)
        self.assertEqual(len(line), len(STRAIGHT))

    def test_detached_piece_is_reported_not_guessed(self):
        far_away = [(60.4, 24.6), (60.4, 24.601)]
        line, problem = geo.join_pieces([STRAIGHT, far_away])
        self.assertIsNone(line)
        self.assertIn("don't connect", problem)

    def test_no_usable_pieces(self):
        line, problem = geo.join_pieces([[(60.3, 24.5)]])  # a single point isn't a line
        self.assertIsNone(line)
        self.assertIn("no route line", problem)


if __name__ == "__main__":
    unittest.main()
