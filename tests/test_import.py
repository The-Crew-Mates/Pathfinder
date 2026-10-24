"""Tests for scripts/import_trails.py. They never touch the internet or pathfinder.db.

Small hand-made examples stand in for Lipas and Overpass answers, and each
test gets a fresh throwaway database in memory.

Run all tests from the repo folder with:
    python3 -m unittest discover -s tests -v
"""

import copy
import json
import sqlite3
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import import_trails  # noqa: E402  (has to come after the sys.path line above)

# A short route walking east along latitude 60.3 (about 55 m between points).
ROUTE = [(60.3, 24.500 + i * 0.001, 30.0 + i) for i in range(10)]


def lipas_site(lipas_id=527090, name="Päivättärenpolku", pieces=None, length_km=0.5):
    """A Lipas site shaped like the real API's answer ([lon, lat, ele] coordinates)."""
    pieces = pieces if pieces is not None else [ROUTE]
    return {
        "lipas-id": lipas_id,
        "name": name,
        "status": "active",
        "properties": {"route-length-km": length_km},
        "location": {
            "city": {"city-code": 49},
            "geometries": {
                "type": "FeatureCollection",
                "features": [
                    {"type": "Feature", "geometry": {"type": "LineString",
                     "coordinates": [[lon, lat, ele] for lat, lon, ele in piece]}}
                    for piece in pieces
                ],
            },
        },
    }


def osm(element_id, lat, lon, element_type="node", **tags):
    """One Overpass result. Ways and relations come with a "center" instead of lat/lon."""
    element = {"type": element_type, "id": element_id, "tags": tags}
    if element_type == "node":
        element.update(lat=lat, lon=lon)
    else:
        element["center"] = {"lat": lat, "lon": lon}
    return element


def fresh_db():
    """An empty database in memory, built from the real schema."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript((ROOT / "db" / "schema.sql").read_text(encoding="utf-8"))
    return conn


def make_trail(lipas_id, name="Test trail", landmarks=None, length_km=1.0):
    """A prepared trail, as prepare_trail() would return it."""
    trail = {
        "source_id": f"lipas:{lipas_id}",
        "slug": import_trails.make_slug(name, lipas_id),
        "name": name,
        "region": "Espoo",
        "difficulty": "easy",
        "length_km": length_km,
        "route": [{"lat": 60.3, "lon": 24.5}, {"lat": 60.3, "lon": 24.51}],
        "warnings": [],
        "landmarks": landmarks if landmarks is not None else [
            {"name": "Parking", "type": "parking", "lat": 60.3, "lon": 24.5, "description": None}
        ],
    }
    trail["source_hash"] = import_trails.fingerprint(trail)
    return trail


def versions(conn):
    return {row["source_id"]: row["version"] for row in conn.execute("SELECT source_id, version FROM trails")}


class SmallHelperTests(unittest.TestCase):
    def test_slugs(self):
        self.assertEqual(import_trails.make_slug("Päivättärenpolku", 527090), "paivattarenpolku-527090")
        self.assertEqual(import_trails.make_slug("Polku 2,5 km", 614309), "polku-2-5-km-614309")
        self.assertEqual(import_trails.make_slug("!!!", 1), "trail-1")

    def test_difficulty_from_length(self):
        self.assertEqual(import_trails.estimate_difficulty(4.99), "easy")
        self.assertEqual(import_trails.estimate_difficulty(5), "moderate")
        self.assertEqual(import_trails.estimate_difficulty(12), "moderate")
        self.assertEqual(import_trails.estimate_difficulty(12.1), "hard")

    def test_route_pieces_swap_lon_lat(self):
        pieces = import_trails.route_pieces(lipas_site())
        self.assertEqual(pieces, [ROUTE])

    def test_route_pieces_handle_multilinestring(self):
        site = lipas_site()
        site["location"]["geometries"]["features"] = [{"geometry": {
            "type": "MultiLineString",
            "coordinates": [[[24.5, 60.3], [24.501, 60.3]], [[24.502, 60.3], [24.503, 60.3]]],
        }}]
        pieces = import_trails.route_pieces(site)
        self.assertEqual(pieces, [[(60.3, 24.5, None), (60.3, 24.501, None)],
                                  [(60.3, 24.502, None), (60.3, 24.503, None)]])

    def test_route_to_json_rounds_and_keeps_elevation_only_when_known(self):
        route = import_trails.route_to_json(
            [(60.1234567, 24.7654321, 12.345), (60.1234568, 24.7654322, 12.4), (60.2, 24.8, None)]
        )
        self.assertEqual(route, [
            {"lat": 60.12346, "lon": 24.76543, "ele": 12.3},  # the second point rounds to the same spot, so it's dropped
            {"lat": 60.2, "lon": 24.8},
        ])

    def test_landmark_types(self):
        kind = import_trails.landmark_type
        self.assertEqual(kind({"amenity": "shelter", "shelter_type": "lean_to"}), "shelter")
        self.assertIsNone(kind({"amenity": "shelter", "shelter_type": "public_transport"}))
        self.assertEqual(kind({"tourism": "wilderness_hut"}), "hut")
        self.assertEqual(kind({"tourism": "viewpoint"}), "viewpoint")
        self.assertEqual(kind({"natural": "spring"}), "water")
        self.assertEqual(kind({"amenity": "drinking_water"}), "water")
        self.assertEqual(kind({"amenity": "parking"}), "parking")
        self.assertIsNone(kind({"amenity": "parking", "access": "private"}))
        self.assertIsNone(kind({"amenity": "parking", "tourism": "information"}))  # an info board
        self.assertIsNone(kind({"amenity": "bench"}))


class PickLandmarksTests(unittest.TestCase):
    def test_near_kept_far_dropped_duplicates_merged_in_walking_order(self):
        metres_north = 1 / 111_320
        elements = [
            # The same parking lot mapped twice: an unnamed point and a named area.
            osm(1, 60.3 + 10 * metres_north, 24.5005),
            osm(2, 60.3 + 15 * metres_north, 24.5006, "way", amenity="parking", name="Big parking"),
            # A lean-to near the end of the route.
            osm(3, 60.3 + 40 * metres_north, 24.508, amenity="shelter", shelter_type="lean_to"),
            # A viewpoint 300 m away: too far.
            osm(4, 60.3 + 300 * metres_north, 24.504, tourism="viewpoint"),
            # A bus shelter right on the route: not for hikers.
            osm(5, 60.3, 24.503, amenity="shelter", shelter_type="public_transport"),
        ]
        elements[0]["tags"] = {"amenity": "parking"}
        landmarks = import_trails.pick_landmarks(elements, ROUTE)
        self.assertEqual([(lm["name"], lm["type"]) for lm in landmarks],
                         [("Big parking", "parking"), ("Shelter", "shelter")])

    def test_parking_cluster_counts_as_one_but_other_types_dont(self):
        metres_east = 1 / (111_320 * 0.4955)  # metres to degrees of longitude at latitude 60.3
        elements = [
            # Two unnamed parking lots 100 m apart: one parking area, keep the closer one.
            osm(1, 60.3 + 40 / 111_320, 24.502, amenity="parking"),
            osm(2, 60.3 + 5 / 111_320, 24.502 + 100 * metres_east, amenity="parking"),
            # Two viewpoints 100 m apart: two different places.
            osm(3, 60.3, 24.506, tourism="viewpoint"),
            osm(4, 60.3, 24.506 + 100 * metres_east, tourism="viewpoint"),
        ]
        landmarks = import_trails.pick_landmarks(elements, ROUTE)
        self.assertEqual([lm["type"] for lm in landmarks], ["parking", "viewpoint", "viewpoint"])
        self.assertAlmostEqual(landmarks[0]["lat"], round(60.3 + 5 / 111_320, 5))


class PrepareTrailTests(unittest.TestCase):
    def test_builds_a_trail_from_pieces_in_any_order(self):
        site = lipas_site(pieces=[ROUTE[5:], ROUTE[:6]])
        trail, problem, note = import_trails.prepare_trail(site)
        self.assertIsNone(problem)
        self.assertEqual(trail["slug"], "paivattarenpolku-527090")
        self.assertEqual(trail["region"], "Espoo")
        self.assertEqual(trail["difficulty"], "easy")
        self.assertAlmostEqual(trail["length_km"], 0.5, delta=0.01)
        self.assertEqual(len(trail["route"]), 10)
        self.assertEqual(trail["route"][0]["ele"], 30.0)
        self.assertIsNone(note)

    def test_skips_a_route_in_separate_parts(self):
        far_piece = [(60.4, 24.6, None), (60.4, 24.601, None)]
        trail, problem, note = import_trails.prepare_trail(lipas_site(pieces=[ROUTE, far_piece]))
        self.assertIsNone(trail)
        self.assertIn("don't connect", problem)

    def test_notes_a_big_length_difference(self):
        trail, problem, note = import_trails.prepare_trail(lipas_site(length_km=2.0))
        self.assertEqual(note, "Lipas says 2.0 km")

    def test_add_landmarks_fills_landmarks_and_fingerprint(self):
        trail, _, _ = import_trails.prepare_trail(lipas_site())
        elements = [osm(1, 60.3, 24.502, amenity="parking", name="Trailhead parking")]
        import_trails.add_landmarks(trail, elements)
        self.assertEqual([lm["name"] for lm in trail["landmarks"]], ["Trailhead parking"])
        self.assertEqual(trail["source_hash"], import_trails.fingerprint(trail))

    def test_one_overpass_query_covers_every_trail(self):
        trails = [import_trails.prepare_trail(lipas_site(lipas_id=i))[0] for i in (1, 2)]
        sent = {}

        def fake_fetch(url, form=None, refresh=False):
            sent["query"] = form["data"]
            return {"elements": []}

        real_fetch = import_trails.fetch_json
        import_trails.fetch_json = fake_fetch
        try:
            self.assertEqual(import_trails.fetch_osm_elements(trails, refresh=False), [])
        finally:
            import_trails.fetch_json = real_fetch
        # One box per trail, for each kind of landmark.
        self.assertEqual(sent["query"].count("nwr["), 2 * len(import_trails.OVERPASS_FILTERS))


class SaveTrailsTests(unittest.TestCase):
    def setUp(self):
        self.conn = fresh_db()

    def save(self, trails, active=None):
        active = active if active is not None else {t["source_id"] for t in trails}
        counts = import_trails.save_trails(self.conn, trails, active)
        self.conn.commit()
        return counts

    def test_first_import_adds_trails_at_version_1(self):
        counts = self.save([make_trail(1), make_trail(2)])
        self.assertEqual(counts, {"added": 2, "updated": 0, "unchanged": 0, "removed": 0})
        self.assertEqual(versions(self.conn), {"lipas:1": 1, "lipas:2": 1})

    def test_reimport_without_changes_keeps_versions(self):
        self.save([make_trail(1), make_trail(2)])
        counts = self.save([make_trail(1), make_trail(2)])
        self.assertEqual(counts["unchanged"], 2)
        self.assertEqual(versions(self.conn), {"lipas:1": 1, "lipas:2": 1})

    def test_changed_trail_goes_up_by_exactly_one(self):
        self.save([make_trail(1), make_trail(2)])
        changed = make_trail(1, length_km=1.5, landmarks=[
            {"name": "Lean-to", "type": "shelter", "lat": 60.3, "lon": 24.505, "description": None},
            {"name": "Spring", "type": "water", "lat": 60.3, "lon": 24.506, "description": None},
        ])
        counts = self.save([changed, make_trail(2)])
        self.assertEqual(counts["updated"], 1)
        self.assertEqual(versions(self.conn), {"lipas:1": 2, "lipas:2": 1})
        names = [r["name"] for r in self.conn.execute(
            "SELECT name FROM landmarks WHERE trail_id = (SELECT id FROM trails WHERE source_id = 'lipas:1') ORDER BY id")]
        self.assertEqual(names, ["Lean-to", "Spring"])

    def test_trail_without_landmarks_still_goes_up_by_exactly_one(self):
        # Guards against the trigger bumping twice when there are no landmark changes.
        self.save([make_trail(1, landmarks=[])])
        self.save([make_trail(1, landmarks=[], length_km=2.0)])
        self.assertEqual(versions(self.conn), {"lipas:1": 2})

    def test_rename_keeps_the_slug(self):
        self.save([make_trail(1, name="Old name")])
        self.save([make_trail(1, name="New name")])
        row = self.conn.execute("SELECT slug, name FROM trails").fetchone()
        self.assertEqual((row["slug"], row["name"]), ("old-name-1", "New name"))

    def test_trail_gone_from_lipas_is_removed_but_skipped_one_stays(self):
        self.save([make_trail(1), make_trail(2), make_trail(3)])
        # 2 is still in Lipas but was skipped this time; 3 is gone from Lipas.
        counts = self.save([make_trail(1)], active={"lipas:1", "lipas:2"})
        self.assertEqual(counts["removed"], 1)
        self.assertEqual(set(versions(self.conn)), {"lipas:1", "lipas:2"})

    def test_placeholder_trails_are_removed(self):
        self.conn.execute(
            "INSERT INTO trails (slug, name, region, difficulty, length_km, route) "
            "VALUES ('sample', 'Sample', 'x', 'easy', 1, ?)",
            (json.dumps([{"lat": 60.3, "lon": 24.5}, {"lat": 60.3, "lon": 24.51}]),),
        )
        counts = self.save([make_trail(1)])
        self.assertEqual(counts["removed"], 1)
        self.assertEqual(set(versions(self.conn)), {"lipas:1"})

    def test_dry_run_style_rollback_leaves_database_unchanged(self):
        self.save([make_trail(1)])
        import_trails.save_trails(self.conn, [make_trail(1, length_km=3.0)], {"lipas:1"})
        self.conn.rollback()
        self.assertEqual(versions(self.conn), {"lipas:1": 1})


if __name__ == "__main__":
    unittest.main()
