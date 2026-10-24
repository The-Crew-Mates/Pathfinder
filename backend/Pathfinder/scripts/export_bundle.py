"""Export one trail and its landmarks as a JSON bundle the app saves for offline use.

Usage:
    python3 scripts/export_bundle.py haukankierros
    python3 scripts/export_bundle.py haukankierros --out some/other/folder

Writes bundles/<slug>.json. The app compares the bundle's "trail_version"
with the copy it has saved: if the new number is bigger, its copy is outdated.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from database import ROOT, connect

# Bump this only when the *shape* of the bundle changes (a field is renamed,
# removed or moved). It lets an older app tell "I can't read this file".
FORMAT_VERSION = 1

# OpenStreetMap's license requires this credit wherever its data is shown.
OSM_ATTRIBUTION = "© OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright"


def build_bundle(conn, slug):
    """Return the bundle for one trail as a Python dict, or None if there's no such trail."""
    trail = conn.execute("SELECT * FROM trails WHERE slug = ?", (slug,)).fetchone()
    if trail is None:
        return None

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
        "trail_version": trail["version"],
        "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_source": trail["data_source"],
        "attribution": OSM_ATTRIBUTION if trail["data_source"] == "osm" else None,
        "trail": {
            "id": trail["id"],
            "slug": trail["slug"],
            "name": trail["name"],
            "region": trail["region"],
            "difficulty": trail["difficulty"],
            "length_km": trail["length_km"],
            "warnings": json.loads(trail["warnings"]),  # JSON text -> Python list
            "route": json.loads(trail["route"]),
            "updated_at": trail["updated_at"],
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


def main():
    parser = argparse.ArgumentParser(description="Export one trail as a JSON bundle.")
    parser.add_argument("slug", help="the trail's slug, e.g. haukankierros")
    parser.add_argument(
        "--out",
        type=Path,
        default=ROOT / "bundles",
        help="folder to write the bundle to (default: bundles/)",
    )
    args = parser.parse_args()

    conn = connect()
    bundle = build_bundle(conn, args.slug)
    if bundle is None:
        slugs = [row["slug"] for row in conn.execute("SELECT slug FROM trails ORDER BY slug")]
        sys.exit(
            f"No trail with slug '{args.slug}'. "
            f"Available: {', '.join(slugs) or 'none yet (run seed.py)'}"
        )
    conn.close()

    route = bundle["trail"]["route"]
    bad = find_bad_point(route)
    if bad is not None:
        sys.exit(f"Not exported: route point {bad} is invalid: {route[bad]}")

    args.out.mkdir(parents=True, exist_ok=True)
    out_path = args.out / f"{args.slug}.json"
    # indent=2 makes the file readable; ensure_ascii=False keeps ä, ö and © as they are.
    out_path.write_text(json.dumps(bundle, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        f"Wrote {out_path} (trail version {bundle['trail_version']}, "
        f"{len(route)} route points, {len(bundle['landmarks'])} landmarks)"
    )
    if bundle["data_source"] == "placeholder":
        print(
            "WARNING: this trail is PLACEHOLDER data. The coordinates are made up: "
            "fine for a demo, never for real navigation.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
