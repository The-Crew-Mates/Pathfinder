"""Build the static files the app downloads: one bundle per trail, plus an index.

Usage:
    python3 scripts/build_bundles.py
    python3 scripts/build_bundles.py --base-url https://example.com/pathfinder/
    python3 scripts/build_bundles.py --out some/other/folder

Writes:
    public/index.json           every trail, with its version and bundle URL
    public/trails/<slug>.json   one bundle per trail (the trail + its landmarks)

The whole public/ folder can be published as plain static files.
The exact JSON format is documented in docs/bundle-format.md.
"""

import argparse
import json
import re
import sys
from pathlib import Path

from database import ROOT, connect

# Bump this only when the *shape* of the files changes (a field is renamed,
# removed or moved). It lets an older app tell "I can't read this file".
FORMAT_VERSION = 1

# Credit lines the data licenses require, for each kind of data_source.
# Placeholder data needs no credit, so it gets an empty list.
ATTRIBUTIONS = {
    "osm": ["© OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright"],
}


def build_bundle(conn, trail):
    """Return one trail's bundle as a Python dict. `trail` is a row from the trails table."""
    landmarks = conn.execute(
        """
        SELECT id, name, type, lat, lon, description
        FROM landmarks
        WHERE trail_id = ?
        ORDER BY id
        """,
        (trail["id"],),
    ).fetchall()

    return {
        "format_version": FORMAT_VERSION,
        "data_source": trail["data_source"],
        "attributions": ATTRIBUTIONS.get(trail["data_source"], []),
        "trail": {
            "id": trail["id"],
            "slug": trail["slug"],
            "name": trail["name"],
            "region": trail["region"],
            "difficulty": trail["difficulty"],
            "length_km": trail["length_km"],
            "version": trail["version"],
            "updated_at": trail["updated_at"],
            "warnings": json.loads(trail["warnings"]),  # JSON text -> Python list
            "route": json.loads(trail["route"]),
        },
        "landmarks": [dict(row) for row in landmarks],
    }


def find_bad_point(route):
    """Return the position of the first route point without a sensible lat/lon, or None.

    The database only checks that the route is a list. This is the last check
    before the app gets the data, so one typo can't break navigation.
    """
    for i, point in enumerate(route):
        if not isinstance(point, dict):
            return i
        lat, lon = point.get("lat"), point.get("lon")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            return i
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return i
    return None


def to_json_bytes(data):
    """Turn a dict into the exact bytes we write to disk."""
    # indent=2 makes the files readable; ensure_ascii=False keeps ä, ö and © as they are.
    # Writing bytes (not text) means the files come out identical on Mac and Windows.
    return (json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def main():
    parser = argparse.ArgumentParser(description="Build the trail bundles and index.json.")
    parser.add_argument(
        "--out",
        type=Path,
        default=ROOT / "public",
        help="folder to write the files to (default: public/)",
    )
    parser.add_argument(
        "--base-url",
        default="",
        help="put this in front of every bundle_url, e.g. https://you.github.io/Pathfinder/ "
        "(default: relative URLs like trails/haukankierros.json)",
    )
    args = parser.parse_args()

    conn = connect()
    trails = conn.execute("SELECT * FROM trails ORDER BY slug").fetchall()
    bundles = [build_bundle(conn, trail) for trail in trails]
    conn.close()

    # Step 1: check every trail before writing anything, so one broken trail
    # can never leave a half-updated folder behind.
    for bundle in bundles:
        slug = bundle["trail"]["slug"]
        # Slugs become file names and URLs, so keep them to safe characters.
        if not re.fullmatch(r"[a-z0-9-]+", slug):
            sys.exit(f"Nothing written: slug '{slug}' may only use a-z, 0-9 and '-'.")
        route = bundle["trail"]["route"]
        bad = find_bad_point(route)
        if bad is not None:
            sys.exit(f"Nothing written: route point {bad} of '{slug}' is invalid: {route[bad]}")

    # Step 2: turn each bundle into file contents, and build its index entry.
    base_url = args.base_url.rstrip("/") + "/" if args.base_url else ""
    files = {}  # path inside the output folder -> file contents (bytes)
    index_entries = []
    for bundle in bundles:
        trail = bundle["trail"]
        path = f"trails/{trail['slug']}.json"
        files[path] = to_json_bytes(bundle)
        index_entries.append(
            {
                "id": trail["id"],
                "slug": trail["slug"],
                "name": trail["name"],
                "region": trail["region"],
                "difficulty": trail["difficulty"],
                "length_km": trail["length_km"],
                "version": trail["version"],
                "updated_at": trail["updated_at"],
                "data_source": bundle["data_source"],
                "bundle_url": base_url + path,
                "bundle_bytes": len(files[path]),
            }
        )
    files["index.json"] = to_json_bytes({"format_version": FORMAT_VERSION, "trails": index_entries})

    # Step 3: write the files. Old bundles are deleted first, so a trail that
    # was removed from the database doesn't linger. Only *.json files inside
    # trails/ are deleted, nothing else.
    trails_dir = args.out / "trails"
    trails_dir.mkdir(parents=True, exist_ok=True)
    for old_file in trails_dir.glob("*.json"):
        old_file.unlink()
    for path, contents in files.items():
        (args.out / path).write_bytes(contents)

    print(f"Wrote index.json and {len(bundles)} trail bundle(s) to {args.out}")
    placeholders = sum(1 for bundle in bundles if bundle["data_source"] == "placeholder")
    if placeholders:
        print(
            f"WARNING: {placeholders} of {len(bundles)} trails are PLACEHOLDER data. "
            "Their coordinates are made up: fine for a demo, never for real navigation.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
