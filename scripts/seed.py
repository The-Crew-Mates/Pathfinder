"""Add 3 sample trails in Nuuksio National Park to pathfinder.db.

Usage:
    python3 scripts/seed.py

Safe to run more than once: trails that are already in the database are
skipped. To load changed sample data, rebuild the database first:
    python3 scripts/create_db.py --reset && python3 scripts/seed.py
"""

# ============================================================================
#  PLACEHOLDER DATA - THESE ARE NOT REAL COORDINATES
#
#  The trail names are real Nuuksio trails, but every coordinate in this file
#  is made up and the lengths are only approximate. The routes are rough
#  loops drawn around the park area. Never use them for real navigation.
#
#  This will be replaced with real OpenStreetMap data later.
# ============================================================================

import json
import sqlite3
import sys

from database import connect

PLACEHOLDER_WARNING = "PLACEHOLDER DATA: coordinates are not real. Do not use for navigation."

# All three trails start at the same (made-up) parking spot. Each trail keeps
# its own copy of it in the landmarks table.
PARKING = {"lat": 60.30400, "lon": 24.51700}

TRAILS = [
    {
        "slug": "punarinnankierros",
        "name": "Punarinnankierros",
        "region": "Nuuksio National Park",
        "difficulty": "easy",
        "length_km": 2.0,
        "warnings": [PLACEHOLDER_WARNING, "Sample warning: roots and rocks on the path."],
        "route": [
            PARKING,
            {"lat": 60.30172, "lon": 24.51758},
            {"lat": 60.30086, "lon": 24.52178},
            {"lat": 60.30102, "lon": 24.52622},
            {"lat": 60.30302, "lon": 24.52821},
            {"lat": 60.30532, "lon": 24.52796},
            {"lat": 60.30611, "lon": 24.52365},
            {"lat": 60.30595, "lon": 24.51926},
            PARKING,  # it's a loop, so it ends where it started
        ],
        "landmarks": [
            {"name": "Haukkalampi parking", "type": "parking", **PARKING,
             "description": "Placeholder: sample parking area at the trail start."},
            {"name": "Lake shore", "type": "water", "lat": 60.30102, "lon": 24.52622,
             "description": "Placeholder: sample water point."},
            {"name": "Hilltop viewpoint", "type": "viewpoint", "lat": 60.30532, "lon": 24.52796,
             "description": "Placeholder: sample viewpoint."},
        ],
    },
    {
        "slug": "haukankierros",
        "name": "Haukankierros",
        "region": "Nuuksio National Park",
        "difficulty": "moderate",
        "length_km": 4.0,
        "warnings": [PLACEHOLDER_WARNING, "Sample warning: steep rocky sections, slippery when wet."],
        "route": [
            PARKING,
            {"lat": 60.30714, "lon": 24.51316},
            {"lat": 60.30733, "lon": 24.50587},
            {"lat": 60.30675, "lon": 24.49885},
            {"lat": 60.30356, "lon": 24.49568},
            {"lat": 60.29993, "lon": 24.49442},
            {"lat": 60.29774, "lon": 24.50036},
            {"lat": 60.29617, "lon": 24.50666},
            {"lat": 60.29773, "lon": 24.51308},
            {"lat": 60.30040, "lon": 24.51791},
            PARKING,
        ],
        "landmarks": [
            {"name": "Haukkalampi parking", "type": "parking", **PARKING,
             "description": "Placeholder: sample parking area at the trail start."},
            {"name": "Trail junction", "type": "junction", "lat": 60.30733, "lon": 24.50587,
             "description": "Placeholder: sample junction. Keep left to stay on the loop."},
            {"name": "Lean-to shelter", "type": "shelter", "lat": 60.30356, "lon": 24.49568,
             "description": "Placeholder: sample lean-to shelter."},
            {"name": "Cliff viewpoint", "type": "viewpoint", "lat": 60.29617, "lon": 24.50666,
             "description": "Placeholder: sample viewpoint."},
        ],
    },
    {
        "slug": "korpinkierros",
        "name": "Korpinkierros",
        "region": "Nuuksio National Park",
        "difficulty": "hard",
        "length_km": 7.5,
        "warnings": [PLACEHOLDER_WARNING, "Sample warning: long and hilly with few shortcuts back."],
        "route": [
            PARKING,
            {"lat": 60.30418, "lon": 24.52860},
            {"lat": 60.30889, "lon": 24.53511},
            {"lat": 60.31356, "lon": 24.54117},
            {"lat": 60.31881, "lon": 24.53742},
            {"lat": 60.32405, "lon": 24.53232},
            {"lat": 60.32421, "lon": 24.52057},
            {"lat": 60.32449, "lon": 24.50948},
            {"lat": 60.32041, "lon": 24.50191},
            {"lat": 60.31550, "lon": 24.49633},
            {"lat": 60.31028, "lon": 24.50049},
            {"lat": 60.30570, "lon": 24.50638},
            PARKING,
        ],
        "landmarks": [
            {"name": "Haukkalampi parking", "type": "parking", **PARKING,
             "description": "Placeholder: sample parking area at the trail start."},
            {"name": "Stream crossing", "type": "water", "lat": 60.31356, "lon": 24.54117,
             "description": "Placeholder: sample water point."},
            {"name": "Campfire shelter", "type": "shelter", "lat": 60.32405, "lon": 24.53232,
             "description": "Placeholder: sample shelter with a campfire site."},
            {"name": "Northern junction", "type": "junction", "lat": 60.32449, "lon": 24.50948,
             "description": "Placeholder: sample junction."},
            {"name": "Ridge viewpoint", "type": "viewpoint", "lat": 60.31550, "lon": 24.49633,
             "description": "Placeholder: sample viewpoint."},
        ],
    },
]


def main():
    conn = connect()
    # Trails added in this run. We only print them once they're really saved.
    added = []

    # "with conn" turns everything inside into one transaction: if anything
    # fails halfway, nothing is saved, so we never end up with half a trail.
    try:
        with conn:
            for trail in TRAILS:
                already_there = conn.execute(
                    "SELECT 1 FROM trails WHERE slug = ?", (trail["slug"],)
                ).fetchone()
                if already_there:
                    print(f"skip   {trail['slug']} (already in the database)")
                    continue

                # The ? marks are filled in by sqlite3 from the tuple that follows.
                # Never paste values into SQL yourself with f-strings: a name like
                # "Hawk's Trail" would break the query, and it's a security hole.
                cursor = conn.execute(
                    """
                    INSERT INTO trails (slug, name, region, difficulty, length_km,
                                        route, warnings, data_source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'placeholder')
                    """,
                    (
                        trail["slug"],
                        trail["name"],
                        trail["region"],
                        trail["difficulty"],
                        trail["length_km"],
                        json.dumps(trail["route"]),  # Python list -> JSON text
                        json.dumps(trail["warnings"]),
                    ),
                )
                trail_id = cursor.lastrowid  # the id SQLite just gave the new trail

                for landmark in trail["landmarks"]:
                    conn.execute(
                        """
                        INSERT INTO landmarks (trail_id, name, type, lat, lon, description)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            trail_id,
                            landmark["name"],
                            landmark["type"],
                            landmark["lat"],
                            landmark["lon"],
                            landmark["description"],
                        ),
                    )

                # Each landmark we just added bumped the trail's version (that's
                # the trigger doing its job). A brand-new trail should start at 1.
                conn.execute("UPDATE trails SET version = 1 WHERE id = ?", (trail_id,))

                added.append(trail)
    except sqlite3.Error as error:
        # The transaction was rolled back, so the database is exactly as it was.
        sys.exit(f"Seed failed, so nothing was saved: {error}")
    finally:
        conn.close()

    # Getting here means the transaction was saved, so it's now true to say so.
    for trail in added:
        print(f"added  {trail['slug']} ({len(trail['landmarks'])} landmarks)")
    print(f"Done: {len(added)} trail(s) added.")
    if added:
        print("Next, build the bundles:  python3 scripts/build_bundles.py")


if __name__ == "__main__":
    main()
