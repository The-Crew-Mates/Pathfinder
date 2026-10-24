"""Import real hiking trails: routes from Lipas, nearby landmarks from OpenStreetMap.

Usage:
    python3 scripts/import_trails.py             # import (reuses downloads from the last 24 h)
    python3 scripts/import_trails.py --refresh   # download everything again
    python3 scripts/import_trails.py --dry-run   # show what would change, save nothing

For each active hiking route and nature trail in AREA (below), it:
  1. joins the route's pieces into one ordered line (see scripts/geo.py)
  2. calculates length_km from that line
  3. finds shelters, huts, viewpoints, water and parking within 100 m (Overpass)
  4. saves everything in pathfinder.db, all in one transaction

Running it again is safe. A trail whose data hasn't changed keeps its version,
a changed trail goes up by exactly 1, and a trail that's no longer in Lipas is
removed. The placeholder trails are removed on the first import.

Data sources, which must be credited wherever the data is shown:
  - Lipas, University of Jyväskylä (CC BY 4.0): https://www.lipas.fi
  - © OpenStreetMap contributors (ODbL): https://www.openstreetmap.org/copyright
"""

import argparse
import hashlib
import json
import math
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

import geo
from database import ROOT, connect

# The area to import: Lipas city code -> municipality name (used as the region).
# To cover more of Finland, add municipalities here. The codes are Statistics
# Finland's municipality numbers: https://www.stat.fi/en/luokitukset/kunta/
AREA = {49: "Espoo", 257: "Kirkkonummi", 927: "Vihti"}

# Lipas type codes: 4405 = hiking route (retkeilyreitti), 4404 = nature trail (luontopolku).
TRAIL_TYPES = [4405, 4404]

LANDMARK_RADIUS_M = 100  # keep landmarks this close to the route
# Landmarks of the same type closer together than this count as one place.
# Parking lots often sit in clusters, and to a hiker a cluster is one place to park.
MERGE_RADIUS_M = {"parking": 150}
DEFAULT_MERGE_RADIUS_M = 30
MAX_GAP_M = 50  # bridge gaps up to this size when joining route pieces

LIPAS_URL = "https://api.lipas.fi/v2/sports-sites"
# Public Overpass servers, tried in this order. They're free and often busy,
# so the import asks only ONCE, for all routes together. (Other public servers
# exist, but none answered when this was written. Add one here if you find a
# reliable one.)
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
]
# Free public services ask you to say who's calling, so they can get in touch.
USER_AGENT = "Pathfinder trail importer (https://github.com/The-Crew-Mates/Pathfinder)"

# Downloads are saved here, so running the import again doesn't ask the free
# services for the same data. The folder is gitignored.
CACHE_DIR = ROOT / "cache"
CACHE_MAX_AGE_S = 24 * 60 * 60

# The OpenStreetMap objects we look for. Each line is one Overpass filter.
OVERPASS_FILTERS = [
    'nwr["amenity"="shelter"]',
    'nwr["tourism"~"^(wilderness_hut|alpine_hut)$"]',
    'nwr["tourism"="viewpoint"]',
    'nwr["amenity"~"^(drinking_water|water_point)$"]',
    'nwr["natural"="spring"]',
    'nwr["amenity"="parking"]',
]

# Name to use when an OpenStreetMap object has no name of its own.
DEFAULT_NAMES = {
    "shelter": "Shelter",
    "hut": "Wilderness hut",
    "viewpoint": "Viewpoint",
    "water": "Water",
    "parking": "Parking",
}


# --- Downloading -------------------------------------------------------------


def fetch_json(url, form=None, refresh=False):
    """Download JSON from `url` (sending `form` as a POST if given).

    Uses the cache when it can, and waits and tries again if the service is busy.
    """
    key = hashlib.sha256((url + json.dumps(form, sort_keys=True)).encode()).hexdigest()[:16]
    cache_file = CACHE_DIR / f"{key}.json"
    if (
        not refresh
        and cache_file.exists()
        and time.time() - cache_file.stat().st_mtime < CACHE_MAX_AGE_S
    ):
        return json.loads(cache_file.read_text(encoding="utf-8"))

    body = urllib.parse.urlencode(form).encode() if form else None
    request = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                text = response.read().decode("utf-8")
            break
        except (urllib.error.URLError, TimeoutError) as error:
            # 429 = "too many requests", 50x = "busy / try later". Anything else
            # (like 404) won't fix itself, so give up straight away.
            busy = not isinstance(error, urllib.error.HTTPError) or error.code in (429, 502, 503, 504)
            if attempt == 3 or not busy:
                raise
            wait = 10 * 2**attempt
            print(f"    (service busy: {error}; trying again in {wait} s)")
            time.sleep(wait)

    time.sleep(1)  # a short pause between downloads, to be polite
    CACHE_DIR.mkdir(exist_ok=True)
    cache_file.write_text(text, encoding="utf-8")
    return json.loads(text)


def fetch_lipas_sites(refresh):
    """All active hiking routes and nature trails in AREA, from Lipas."""
    sites = []
    page = 1
    while True:
        query = urllib.parse.urlencode(
            {
                "type-codes": ",".join(map(str, TRAIL_TYPES)),
                "city-codes": ",".join(map(str, AREA)),
                "statuses": "active",
                "page-size": 100,
                "page": page,
            }
        )
        data = fetch_json(f"{LIPAS_URL}?{query}", refresh=refresh)
        sites.extend(data["items"])
        if page >= data["pagination"]["total-pages"]:
            return sites
        page += 1


def route_box(route):
    """A box around a route, as Overpass wants it: "south,west,north,east".

    The margin is a bit bigger than LANDMARK_RADIUS_M; pick_landmarks() later
    keeps only what's really close enough.
    """
    lats = [point["lat"] for point in route]
    lons = [point["lon"] for point in route]
    margin_lat = 150 / geo.METRES_PER_DEGREE_LAT
    margin_lon = margin_lat / math.cos(math.radians(lats[0]))
    return (
        f"{min(lats) - margin_lat:.5f},{min(lons) - margin_lon:.5f},"
        f"{max(lats) + margin_lat:.5f},{max(lons) + margin_lon:.5f}"
    )


def fetch_osm_elements(trails, refresh):
    """Everything from OpenStreetMap we might want near ANY of the trails, in one request."""
    statements = "".join(
        f"{line}({route_box(trail['route'])});" for trail in trails for line in OVERPASS_FILTERS
    )
    query = f"[out:json][timeout:180];({statements});out center tags;"
    for number, url in enumerate(OVERPASS_URLS, 1):
        try:
            return fetch_json(url, form={"data": query}, refresh=refresh)["elements"]
        except (urllib.error.URLError, TimeoutError) as error:
            if number == len(OVERPASS_URLS):
                raise
            print(f"    ({url} didn't answer: {error}. Trying the next server.)")


# --- Turning downloads into our trails ----------------------------------------


def route_pieces(site):
    """A Lipas route's pieces, each a list of (lat, lon, ele) points.

    Lipas (like all GeoJSON) writes coordinates as [lon, lat, elevation], so
    they're swapped round here.
    """
    pieces = []
    for feature in site["location"]["geometries"]["features"]:
        geometry = feature["geometry"]
        if geometry["type"] == "LineString":
            lines = [geometry["coordinates"]]
        elif geometry["type"] == "MultiLineString":
            lines = geometry["coordinates"]
        else:
            continue
        for line in lines:
            pieces.append([(c[1], c[0], c[2] if len(c) > 2 else None) for c in line])
    return pieces


def route_to_json(line):
    """Points as we store them: {"lat", "lon"} plus "ele" when known.

    Rounded to 5 decimals (about 1 m), which is plenty for hiking and keeps
    the bundles small.
    """
    route = []
    for lat, lon, ele in line:
        point = {"lat": round(lat, 5), "lon": round(lon, 5)}
        if ele is not None:
            point["ele"] = round(ele, 1)
        # Rounding can make two neighbouring points identical; keep just one.
        if not route or (route[-1]["lat"], route[-1]["lon"]) != (point["lat"], point["lon"]):
            route.append(point)
    return route


def landmark_type(tags):
    """Our landmark type for an OpenStreetMap object, or None if we don't want it."""
    if tags.get("amenity") == "shelter":
        # Bus stop shelters are tagged as shelters too. Hikers don't need those.
        return None if tags.get("shelter_type") == "public_transport" else "shelter"
    if tags.get("tourism") in ("wilderness_hut", "alpine_hut"):
        return "hut"
    if tags.get("tourism") == "viewpoint":
        return "viewpoint"
    if tags.get("amenity") in ("drinking_water", "water_point") or tags.get("natural") == "spring":
        return "water"
    if tags.get("amenity") == "parking":
        # Some information boards at parking areas are tagged as parking too.
        # The parking area itself is mapped separately, so skip the board.
        if tags.get("tourism") == "information" or tags.get("access") in ("private", "no"):
            return None
        return "parking"
    return None


def pick_landmarks(elements, route):
    """Turn Overpass results into landmarks: near the route, no duplicates, in walking order."""
    candidates = []
    for element in elements:
        tags = element.get("tags", {})
        kind = landmark_type(tags)
        if kind is None:
            continue
        # Points have lat/lon. Areas and groups (OSM "ways" and "relations")
        # come with a "center" instead.
        lat = element.get("lat", element.get("center", {}).get("lat"))
        lon = element.get("lon", element.get("center", {}).get("lon"))
        if lat is None or lon is None:
            continue
        distance, along = geo.locate_on_route((lat, lon), route)
        if distance > LANDMARK_RADIUS_M:
            continue
        candidates.append(
            {
                "name": tags.get("name") or DEFAULT_NAMES[kind],
                "type": kind,
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "description": tags.get("description"),
                "has_name": "name" in tags,
                "distance": distance,
                "along": along,
                "osm_id": f"{element['type']}/{element['id']}",
            }
        )

    # The same place is often mapped more than once (say, a parking lot as a
    # point AND as an area). Look at named ones first, then the ones closest to
    # the route, so that's the copy that's kept.
    candidates.sort(key=lambda c: (not c["has_name"], c["distance"], c["osm_id"]))
    kept = []
    for candidate in candidates:
        radius = MERGE_RADIUS_M.get(candidate["type"], DEFAULT_MERGE_RADIUS_M)
        is_duplicate = any(
            other["type"] == candidate["type"]
            and geo.distance_m((other["lat"], other["lon"]), (candidate["lat"], candidate["lon"]))
            <= radius
            for other in kept
        )
        if not is_duplicate:
            kept.append(candidate)

    # List them in the order a hiker meets them along the route.
    kept.sort(key=lambda c: (c["along"], c["osm_id"]))
    return [{key: c[key] for key in ("name", "type", "lat", "lon", "description")} for c in kept]


def make_slug(name, lipas_id):
    """'Päivättärenpolku', 527090 -> 'paivattarenpolku-527090'.

    The Lipas id on the end keeps slugs unique, even for two trails with the same name.
    """
    # NFKD splits "ä" into "a" + a separate dot mark; encoding to ASCII drops the mark.
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    words = re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")[:50].strip("-")
    return f"{words}-{lipas_id}" if words else f"trail-{lipas_id}"


def estimate_difficulty(length_km):
    """Lipas has no difficulty rating, so estimate one from the length."""
    if length_km < 5:
        return "easy"
    if length_km <= 12:
        return "moderate"
    return "hard"


def fingerprint(trail):
    """A short code that changes whenever the trail's data changes."""
    content = {key: trail[key] for key in ("name", "region", "difficulty", "length_km", "route", "warnings", "landmarks")}
    return hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()[:16]


def prepare_trail(site):
    """Build one trail from a Lipas site, still without its landmarks.

    Returns (trail, None, note) if it worked, or (None, reason, None) if the
    trail has to be skipped. `note` is an optional heads-up worth printing.
    """
    line, problem = geo.join_pieces(route_pieces(site), MAX_GAP_M)
    if problem:
        return None, problem, None
    length_km = round(geo.route_length_m(line) / 1000, 2)
    if length_km <= 0:
        return None, "its route has no length", None

    trail = {
        "source_id": f"lipas:{site['lipas-id']}",
        "slug": make_slug(site["name"], site["lipas-id"]),
        "name": site["name"].strip(),
        "region": AREA.get(site["location"]["city"]["city-code"], "Finland"),
        "difficulty": estimate_difficulty(length_km),
        "length_km": length_km,
        "route": route_to_json(line),
        "warnings": [],
        "landmarks": [],  # filled in by add_landmarks()
    }

    note = None
    official_km = (site.get("properties") or {}).get("route-length-km")
    if official_km and abs(length_km - official_km) / official_km > 0.3:
        note = f"Lipas says {official_km} km"
    return trail, None, note


def add_landmarks(trail, osm_elements):
    """Give the trail its landmarks, and the fingerprint of its finished data."""
    route = [(point["lat"], point["lon"]) for point in trail["route"]]
    trail["landmarks"] = pick_landmarks(osm_elements, route)
    trail["source_hash"] = fingerprint(trail)


# --- Saving --------------------------------------------------------------------


def save_trails(conn, trails, active_source_ids):
    """Write prepared trails into the database. Returns counts of what changed.

    Doesn't commit: the caller decides whether to keep the changes.
    """
    counts = {"added": 0, "updated": 0, "unchanged": 0, "removed": 0}

    # Placeholder trails go, and so do imported trails that Lipas no longer lists.
    # (A trail that's still listed but was skipped this time stays as it was.)
    counts["removed"] += conn.execute("DELETE FROM trails WHERE data_source = 'placeholder'").rowcount
    for row in conn.execute("SELECT id, source_id FROM trails WHERE source_id LIKE 'lipas:%'").fetchall():
        if row["source_id"] not in active_source_ids:
            conn.execute("DELETE FROM trails WHERE id = ?", (row["id"],))
            counts["removed"] += 1

    for trail in trails:
        old = conn.execute(
            "SELECT id, version, source_hash FROM trails WHERE source_id = ?", (trail["source_id"],)
        ).fetchone()
        if old and old["source_hash"] == trail["source_hash"]:
            counts["unchanged"] += 1
            continue

        values = (
            trail["name"],
            trail["region"],
            trail["difficulty"],
            trail["length_km"],
            json.dumps(trail["route"]),
            json.dumps(trail["warnings"]),
            trail["source_hash"],
        )
        if old:
            # The slug is never changed, even if the name is: the app uses the
            # slug to recognise trails it has saved.
            conn.execute(
                """
                UPDATE trails
                SET name = ?, region = ?, difficulty = ?, length_km = ?,
                    route = ?, warnings = ?, source_hash = ?
                WHERE id = ?
                """,
                values + (old["id"],),
            )
            conn.execute("DELETE FROM landmarks WHERE trail_id = ?", (old["id"],))
            trail_id, new_version = old["id"], old["version"] + 1
            counts["updated"] += 1
        else:
            cursor = conn.execute(
                """
                INSERT INTO trails (name, region, difficulty, length_km, route, warnings,
                                    source_hash, slug, source_id, data_source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'lipas')
                """,
                values + (trail["slug"], trail["source_id"]),
            )
            trail_id, new_version = cursor.lastrowid, 1
            counts["added"] += 1

        for landmark in trail["landmarks"]:
            conn.execute(
                """
                INSERT INTO landmarks (trail_id, name, type, lat, lon, description)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (trail_id, landmark["name"], landmark["type"], landmark["lat"],
                 landmark["lon"], landmark["description"]),
            )

        # The triggers bumped the version once for every change above, but for
        # the app one import is one change. So set the version exactly. The
        # "AND version != ?" matters: setting a version to the value it already
        # has would make the trigger bump it again.
        conn.execute(
            "UPDATE trails SET version = ? WHERE id = ? AND version != ?",
            (new_version, trail_id, new_version),
        )
    return counts


def main():
    parser = argparse.ArgumentParser(description="Import real trails from Lipas and OpenStreetMap.")
    parser.add_argument("--refresh", action="store_true", help="download everything again, ignoring the cache")
    parser.add_argument("--dry-run", action="store_true", help="show what would change, but save nothing")
    args = parser.parse_args()
    # Show each progress line straight away, even when the output goes to a file.
    sys.stdout.reconfigure(line_buffering=True)

    conn = connect()
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(trails)")}
    if "source_id" not in columns:
        sys.exit(
            "This database was made before the import existed. Rebuild it first\n"
            "(this deletes the placeholder trails), then run the import again:\n"
            "  python3 scripts/create_db.py --reset"
        )

    try:
        print(f"Fetching hiking routes and nature trails in {', '.join(AREA.values())} from Lipas...")
        sites = sorted(fetch_lipas_sites(args.refresh), key=lambda site: site["lipas-id"])
        print(f"Found {len(sites)} active routes.")

        trails, notes = [], {}
        skipped = 0
        for site in sites:
            trail, problem, note = prepare_trail(site)
            if problem:
                print(f"  skip  {site['name']}: {problem}")
                skipped += 1
                continue
            trails.append(trail)
            notes[trail["source_id"]] = note

        print(f"Asking OpenStreetMap for landmarks near all {len(trails)} routes (one request)...")
        osm_elements = fetch_osm_elements(trails, args.refresh)
        for trail in trails:
            add_landmarks(trail, osm_elements)
            note = notes[trail["source_id"]]
            extra = f" (note: {note})" if note else ""
            print(f"  ok    {trail['name']}: {trail['length_km']} km, {len(trail['landmarks'])} landmark(s){extra}")
    except (urllib.error.URLError, TimeoutError) as error:
        sys.exit(f"Couldn't download the data ({error}). Nothing was saved; try again later.")

    active_source_ids = {f"lipas:{site['lipas-id']}" for site in sites}
    try:
        counts = save_trails(conn, trails, active_source_ids)
        if args.dry_run:
            conn.rollback()
        else:
            conn.commit()
    except Exception:
        conn.rollback()  # all or nothing: on any error, the database stays as it was
        raise
    finally:
        conn.close()

    summary = ", ".join(f"{n} {what}" for what, n in counts.items())
    if args.dry_run:
        print(f"\nDry run, nothing saved. Would have: {summary} ({skipped} skipped).")
    else:
        print(f"\nSaved: {summary} ({skipped} skipped).")
        print("Next: python3 scripts/build_bundles.py, then commit pathfinder.db.")


if __name__ == "__main__":
    main()
