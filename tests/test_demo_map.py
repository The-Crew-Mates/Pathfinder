"""Tests for scripts/build_demo_map.py: cutting shapes to the map area, simplifying
them, and sorting OpenStreetMap objects into map layers. Offline; no downloads.

Run all tests from the repo folder with:
    python3 -m unittest discover -s tests -v
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import build_demo_map as m  # noqa: E402  (has to come after the sys.path line above)
import geo  # noqa: E402

BOX = (61.0, 23.0, 61.1, 23.2)  # south, west, north, east


class AreaBoxTests(unittest.TestCase):
    def test_box_is_the_right_size(self):
        s, w, n, e = m.area_box((61.49433, 23.71329), 1500)
        self.assertAlmostEqual(geo.distance_m((s, w), (n, w)), 3000, delta=5)
        self.assertAlmostEqual(geo.distance_m((s, w), (s, e)), 3000, delta=20)


class SimplifyTests(unittest.TestCase):
    def test_straight_line_keeps_only_its_ends(self):
        line = [(61.0 + i * 0.0001, 23.0) for i in range(50)]
        self.assertEqual(m.simplify(line), [line[0], line[-1]])

    def test_keeps_corners(self):
        corner = [(61.0, 23.0), (61.0005, 23.0), (61.001, 23.0), (61.001, 23.001), (61.001, 23.002)]
        self.assertEqual(m.simplify(corner), [corner[0], corner[2], corner[4]])

    def test_small_wiggles_go_but_big_ones_stay(self):
        line = [(61.0, 23.0), (61.00001, 23.0005), (61.0, 23.001), (61.001, 23.0015), (61.0, 23.002)]
        # The 1 m wiggle at index 1 disappears; the 111 m bump at index 3 stays.
        self.assertEqual(m.simplify(line), [line[0], line[2], line[3], line[4]])

    def test_short_lines_are_untouched(self):
        self.assertEqual(m.simplify([(61.0, 23.0), (61.1, 23.1)]), [(61.0, 23.0), (61.1, 23.1)])

    def test_huge_outline_does_not_hit_the_recursion_limit(self):
        circle = [(61.05 + 0.04 * __import__("math").sin(i / 500), 23.1 + 0.08 * __import__("math").cos(i / 500)) for i in range(20000)]
        self.assertGreater(len(m.simplify(circle)), 10)


class ClipLineTests(unittest.TestCase):
    def test_line_inside_is_unchanged(self):
        line = [(61.02, 23.05), (61.05, 23.1)]
        self.assertEqual(m.clip_line(line, BOX), [line])

    def test_line_outside_disappears(self):
        self.assertEqual(m.clip_line([(60.0, 22.0), (60.1, 22.1)], BOX), [])

    def test_line_crossing_the_area_is_cut_at_the_edges(self):
        [piece] = m.clip_line([(61.05, 22.9), (61.05, 23.3)], BOX)  # west to east, right through
        self.assertEqual(piece[0], (61.05, 23.0))
        self.assertEqual(piece[-1], (61.05, 23.2))

    def test_line_leaving_and_coming_back_becomes_two_pieces(self):
        line = [(61.05, 23.05), (61.05, 23.3), (61.06, 23.3), (61.06, 23.05)]
        pieces = m.clip_line(line, BOX)
        self.assertEqual(len(pieces), 2)
        self.assertEqual(pieces[0], [(61.05, 23.05), (61.05, 23.2)])
        self.assertEqual(pieces[1], [(61.06, 23.2), (61.06, 23.05)])


class ClipPolygonTests(unittest.TestCase):
    def test_shape_inside_is_unchanged(self):
        ring = [(61.02, 23.02), (61.02, 23.05), (61.05, 23.05), (61.02, 23.02)]
        self.assertEqual(m.clip_polygon(ring, BOX), ring)

    def test_shape_outside_disappears(self):
        self.assertEqual(m.clip_polygon([(60.0, 22.0), (60.0, 22.1), (60.1, 22.1), (60.0, 22.0)], BOX), [])

    def test_big_lake_is_cut_to_the_area(self):
        lake = [(60.0, 22.0), (60.0, 24.0), (62.0, 24.0), (62.0, 22.0), (60.0, 22.0)]  # covers everything
        clipped = m.clip_polygon(lake, BOX)
        self.assertEqual(clipped[0], clipped[-1])
        self.assertEqual({p[0] for p in clipped}, {61.0, 61.1})
        self.assertEqual({p[1] for p in clipped}, {23.0, 23.2})


class JoinRingsTests(unittest.TestCase):
    def test_joins_pieces_in_any_direction_into_one_ring(self):
        a, b, c, d = (61.0, 23.0), (61.0, 23.1), (61.1, 23.1), (61.1, 23.0)
        pieces = [[a, b, c], [a, d, c]]  # the second half runs the "wrong" way
        [ring] = m.join_rings(pieces)
        self.assertEqual(ring[0], ring[-1])
        self.assertEqual(set(ring), {a, b, c, d})

    def test_drops_pieces_that_never_close(self):
        self.assertEqual(m.join_rings([[(61.0, 23.0), (61.0, 23.1)]]), [])


class LayerTests(unittest.TestCase):
    def test_sorts_osm_tags_into_layers(self):
        self.assertEqual(m.layer_for({"highway": "primary"}), "majorRoads")
        self.assertEqual(m.layer_for({"highway": "primary_link"}), "majorRoads")
        self.assertEqual(m.layer_for({"highway": "residential"}), "roads")
        self.assertEqual(m.layer_for({"highway": "footway"}), "paths")
        self.assertEqual(m.layer_for({"natural": "water"}), "water")
        self.assertEqual(m.layer_for({"waterway": "stream"}), "streams")
        self.assertEqual(m.layer_for({"landuse": "forest"}), "forest")
        self.assertEqual(m.layer_for({"natural": "wood"}), "forest")
        self.assertEqual(m.layer_for({"leisure": "park"}), "parks")
        self.assertIsNone(m.layer_for({"highway": "bus_stop"}))
        self.assertIsNone(m.layer_for({"building": "yes"}))

    def test_build_layers_cuts_and_groups_real_shaped_data(self):
        def way(i, tags, points):
            return {"type": "way", "id": i, "tags": tags, "geometry": [{"lat": p[0], "lon": p[1]} for p in points]}

        elements = [
            way(1, {"highway": "path"}, [(61.05, 22.9), (61.05, 23.1)]),  # starts outside: cut at the edge
            way(2, {"natural": "water"}, [(61.02, 23.02), (61.02, 23.05), (61.05, 23.05), (61.02, 23.02)]),
            way(3, {"highway": "path"}, [(60.0, 22.0), (60.1, 22.0)]),  # outside: dropped
            {
                "type": "relation", "id": 4, "tags": {"natural": "water"},
                "members": [
                    {"geometry": [{"lat": 60.9, "lon": 22.9}, {"lat": 60.9, "lon": 23.3}, {"lat": 61.2, "lon": 23.3}]},
                    {"geometry": [{"lat": 61.2, "lon": 23.3}, {"lat": 61.2, "lon": 22.9}, {"lat": 60.9, "lon": 22.9}]},
                ],
            },
        ]
        layers = m.build_layers(elements, BOX)
        self.assertEqual(layers["paths"], [[[61.05, 23.0], [61.05, 23.1]]])
        self.assertEqual(len(layers["water"]), 2)  # the small pond and the big lake
        rings = [shape[0] for shape in layers["water"]]
        big_lake = next(r for r in rings if any(p[0] == 61.0 for p in r))
        self.assertEqual({p[0] for p in big_lake}, {61.0, 61.1})  # cut to the area
        self.assertEqual({p[1] for p in big_lake}, {23.0, 23.2})


if __name__ == "__main__":
    unittest.main()
