"""Build the demo map: real OpenStreetMap map data for one area, saved inside the web app.

Usage:
    python3 scripts/build_demo_map.py            # reuses downloads from the last 24 h
    python3 scripts/build_demo_map.py --refresh  # download everything again

Writes pathfinder-web/public/maps/tampere-varala.json, which the app draws
offline: paths, roads, water, forest, parks and wetland from OpenStreetMap,
plus official trails from Lipas and landmarks (shelters, viewpoints, water
points, parking) in the area.

OpenStreetMap's map *images* (tiles) can't be saved for offline use under
their usage rules, so the app draws the map itself from this data instead.
The map shows "© OpenStreetMap contributors" as the ODbL license requires.

The area is a 3 x 3 km square around Varala Sports Institute in Pyynikki, Tampere.
"""

import argparse
import json
import math
import urllib.parse

import geo
import import_trails as trails
from database import ROOT

AREA = {
    "id": "tampere-varala",
    "name": "Varala & Pyynikki",
    "center": (61.49433, 23.71329),  # Varalan urheiluopisto (Varala Sports Institute)
    "radius_m": 1500,
    "lipas_city_codes": [837],  # Tampere
}

# Lipas route types to show: hiking routes, nature trails, walking/outdoor routes, fitness trails.
LIPAS_ROUTE_TYPES = [4405, 4404, 4403, 4401]

OUT_FILE = ROOT / "pathfinder-web" / "public" / "maps" / f"{AREA['id']}.json"

SIMPLIFY_M = 3  # drop points that change a shape by less than this (keeps files small)

# OpenStreetMap road types, grouped by how the map draws them.
MAJOR_ROADS = {"motorway", "trunk", "primary", "secondary", "tertiary"}
MINOR_ROADS = {"residential", "unclassified", "service", "living_street", "road"}
PATHS = {"footway", "path", "track", "cycleway", "bridleway", "steps", "pedestrian"}


# --- Geometry helpers (points are (lat, lon)) -----------------------------------


def area_box(center, radius_m):
    """(south, west, north, east) of a square around `center`."""
    lat, lon = center
    d_lat = radius_m / geo.METRES_PER_DEGREE_LAT
    d_lon = d_lat / math.cos(math.radians(lat))
    return (lat - d_lat, lon - d_lon, lat + d_lat, lon + d_lon)


def simplify(points, tolerance_m=SIMPLIFY_M):
    """Douglas–Peucker: keep the points that matter for the shape, drop the rest.

    Between two kept points, find the point furthest from the straight line
    joining them. If it's further than the tolerance, keep it and look at both
    halves; otherwise drop everything in between. (Written as a loop rather than
    recursion, so a huge lake outline can't hit Python's recursion limit.)
    """
    points = list(points)
    if len(points) < 3:
        return points
    keep = {0, len(points) - 1}
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        worst, worst_i = 0.0, None
        for i in range(start + 1, end):
            d, _ = geo.locate_on_route(points[i], [points[start], points[end]])
            if d > worst:
                worst, worst_i = d, i
        if worst_i is not None and worst > tolerance_m:
            keep.add(worst_i)
            stack += [(start, worst_i), (worst_i, end)]
    return [points[i] for i in sorted(keep)]


def _inside(p, box):
    s, w, n, e = box
    return s <= p[0] <= n and w <= p[1] <= e


def clip_line(points, box):
    """Cut a line to the box. Returns a list of pieces (a line can leave and come back)."""
    s, w, n, e = box
    pieces, current = [], []

    def clip_segment(a, b):
        # Liang–Barsky: the part of segment a→b inside the box, or None.
        t0, t1 = 0.0, 1.0
        d_lat, d_lon = b[0] - a[0], b[1] - a[1]
        for p, q in ((-d_lon, a[1] - w), (d_lon, e - a[1]), (-d_lat, a[0] - s), (d_lat, n - a[0])):
            if p == 0:
                if q < 0:
                    return None
            else:
                t = q / p
                if p < 0:
                    t0 = max(t0, t)
                else:
                    t1 = min(t1, t)
        if t0 > t1:
            return None
        return (a[0] + t0 * d_lat, a[1] + t0 * d_lon), (a[0] + t1 * d_lat, a[1] + t1 * d_lon)

    for a, b in zip(points, points[1:]):
        clipped = clip_segment(a, b)
        if clipped is None:
            if len(current) >= 2:
                pieces.append(current)
            current = []
            continue
        start, end = clipped
        if not current:
            current = [start]
        elif current[-1] != start:  # the line left the box and came back
            if len(current) >= 2:
                pieces.append(current)
            current = [start]
        current.append(end)
        if end != b:  # the line leaves the box here
            pieces.append(current)
            current = []
    if len(current) >= 2:
        pieces.append(current)
    return pieces


def clip_polygon(ring, box):
    """Cut a closed shape (a lake, a forest) to the box (Sutherland–Hodgman)."""
    s, w, n, e = box
    edges = [
        (lambda p: p[1] >= w, lambda a, b: _cross_lon(a, b, w)),
        (lambda p: p[1] <= e, lambda a, b: _cross_lon(a, b, e)),
        (lambda p: p[0] >= s, lambda a, b: _cross_lat(a, b, s)),
        (lambda p: p[0] <= n, lambda a, b: _cross_lat(a, b, n)),
    ]
    output = list(ring[:-1] if ring and ring[0] == ring[-1] else ring)
    for keep, cross in edges:
        points, output = output, []
        for i, current in enumerate(points):
            previous = points[i - 1]
            if keep(current):
                if not keep(previous):
                    output.append(cross(previous, current))
                output.append(current)
            elif keep(previous):
                output.append(cross(previous, current))
        if not output:
            return []
    return output + [output[0]]


def _cross_lon(a, b, lon):
    t = (lon - a[1]) / (b[1] - a[1])
    return (a[0] + t * (b[0] - a[0]), lon)


def _cross_lat(a, b, lat):
    t = (lat - a[0]) / (b[0] - a[0])
    return (lat, a[1] + t * (b[1] - a[1]))


def join_rings(ways):
    """Join a relation's outline pieces (OSM stores big lakes as many ways) into closed rings."""
    pieces = [list(w) for w in ways if len(w) >= 2]
    rings = []
    while pieces:
        ring = pieces.pop(0)
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, piece in enumerate(pieces):
                if piece[0] == ring[-1]:
                    ring += piece[1:]
                elif piece[-1] == ring[-1]:
                    ring += piece[-2::-1]
                elif piece[-1] == ring[0]:
                    ring = piece[:-1] + ring
                elif piece[0] == ring[0]:
                    ring = piece[:0:-1] + ring
                else:
                    continue
                pieces.pop(i)
                changed = True
                break
        if ring[0] == ring[-1] and len(ring) >= 4:
            rings.append(ring)
    return rings


def rounded(points):
    """Points as compact [lat, lon] pairs, rounded to about 1 m."""
    return [[round(p[0], 5), round(p[1], 5)] for p in points]


# --- Turning OpenStreetMap data into map layers ----------------------------------


def layer_for(tags):
    """Which map layer an OpenStreetMap object belongs to, or None."""
    highway = tags.get("highway")
    if highway in MAJOR_ROADS or (highway or "").removesuffix("_link") in MAJOR_ROADS:
        return "majorRoads"
    if highway in MINOR_ROADS:
        return "roads"
    if highway in PATHS:
        return "paths"
    if tags.get("natural") == "water" or tags.get("landuse") == "reservoir":
        return "water"
    if tags.get("waterway") in ("river", "stream", "canal", "ditch", "drain"):
        return "streams"
    if tags.get("landuse") == "forest" or tags.get("natural") == "wood":
        return "forest"
    if tags.get("leisure") == "park":
        return "parks"
    if tags.get("natural") == "wetland":
        return "wetland"
    return None


AREA_LAYERS = {"water", "forest", "parks", "wetland"}  # drawn as filled shapes
LINE_LAYERS = {"majorRoads", "roads", "paths", "streams"}  # drawn as lines


def to_geom(points):
    return [(p["lat"], p["lon"]) for p in points]


def build_layers(elements, box):
    layers = {name: [] for name in sorted(AREA_LAYERS | LINE_LAYERS)}
    for element in sorted(elements, key=lambda e: (e["type"], e["id"])):
        layer = layer_for(element.get("tags", {}))
        if not layer:
            continue
        if layer in LINE_LAYERS and element["type"] == "way":
            for piece in clip_line(to_geom(element["geometry"]), box):
                line = simplify(piece)
                if len(line) >= 2:
                    layers[layer].append(rounded(line))
        elif layer in AREA_LAYERS:
            if element["type"] == "way":
                rings = [to_geom(element["geometry"])]
            else:  # a multipolygon relation: join its outer and inner pieces into rings
                rings = join_rings(to_geom(m["geometry"]) for m in element.get("members", []) if m.get("geometry"))
            shape = []
            for ring in rings:
                if len(ring) < 4 or ring[0] != ring[-1]:
                    continue
                clipped = simplify(clip_polygon(ring, box))
                if len(clipped) >= 4:
                    shape.append(rounded(clipped))
            if shape:
                # One shape can have several rings (e.g. a lake with islands); the app
                # fills them with the even-odd rule, so islands stay dry.
                layers[layer].append(shape)
    return layers


def fetch_osm(box, refresh):
    bbox = ",".join(f"{v:.5f}" for v in box)
    query = (
        "[out:json][timeout:120];("
        f'way["highway"]({bbox});'
        f'way["natural"~"^(water|wood|wetland)$"]({bbox});'
        f'relation["natural"~"^(water|wood|wetland)$"]({bbox});'
        f'way["landuse"~"^(forest|reservoir)$"]({bbox});'
        f'relation["landuse"="forest"]({bbox});'
        f'way["leisure"="park"]({bbox});'
        f'relation["leisure"="park"]({bbox});'
        f'way["waterway"~"^(river|stream|canal|ditch|drain)$"]({bbox});'
        ");out geom;"
    )
    return trails.fetch_json(trails.OVERPASS_URLS[0], form={"data": query}, refresh=refresh)["elements"]


def fetch_landmarks(box, refresh):
    """Shelters, huts, viewpoints, water points and parking in the area (same rules as the trail import)."""
    bbox = ",".join(f"{v:.5f}" for v in box)
    query = "[out:json][timeout:60];(" + "".join(f"{f}({bbox});" for f in trails.OVERPASS_FILTERS) + ");out center tags;"
    elements = trails.fetch_json(trails.OVERPASS_URLS[0], form={"data": query}, refresh=refresh)["elements"]
    places = []
    for element in sorted(elements, key=lambda e: (e["type"], e["id"])):
        tags = element.get("tags", {})
        kind = trails.landmark_type(tags)
        lat = element.get("lat", element.get("center", {}).get("lat"))
        lon = element.get("lon", element.get("center", {}).get("lon"))
        if kind and lat is not None and _inside((lat, lon), box):
            places.append({"name": tags.get("name") or trails.DEFAULT_NAMES[kind], "type": kind,
                           "lat": round(lat, 5), "lon": round(lon, 5)})
    return places


def fetch_routes(box, refresh):
    """Official Lipas trails that pass through the area, cut to the area."""
    query = urllib.parse.urlencode({
        "type-codes": ",".join(map(str, LIPAS_ROUTE_TYPES)),
        "city-codes": ",".join(map(str, AREA["lipas_city_codes"])),
        "statuses": "active",
        "page-size": 100,
    })
    routes, page = [], 1
    while True:
        data = trails.fetch_json(f"{trails.LIPAS_URL}?{query}&page={page}", refresh=refresh)
        for site in data["items"]:
            lines = []
            for piece in trails.route_pieces(site):
                for clipped in clip_line([(p[0], p[1]) for p in piece], box):
                    line = simplify(clipped)
                    if len(line) >= 2:
                        lines.append(rounded(line))
            if lines:
                routes.append({"lipasId": site["lipas-id"], "name": site["name"].strip(),
                               "typeCode": site["type"]["type-code"], "lines": lines})
        if page >= data["pagination"]["total-pages"]:
            break
        page += 1
    return sorted(routes, key=lambda r: r["lipasId"])


def main():
    parser = argparse.ArgumentParser(description="Build the demo map data for the web app.")
    parser.add_argument("--refresh", action="store_true", help="download everything again, ignoring the cache")
    args = parser.parse_args()

    box = area_box(AREA["center"], AREA["radius_m"])
    print(f"Area: {AREA['name']}, {2 * AREA['radius_m'] / 1000:.0f} x {2 * AREA['radius_m'] / 1000:.0f} km")
    print("Asking OpenStreetMap for paths, roads, water, forest and parks (one request)...")
    layers = build_layers(fetch_osm(box, args.refresh), box)
    print("Asking OpenStreetMap for landmarks...")
    places = fetch_landmarks(box, args.refresh)
    print("Asking Lipas for official trails...")
    routes = fetch_routes(box, args.refresh)

    data = {
        "formatVersion": 1,
        "id": AREA["id"],
        "name": AREA["name"],
        "center": {"lat": AREA["center"][0], "lon": AREA["center"][1]},
        "bbox": [round(v, 5) for v in box],  # south, west, north, east
        "attributions": [
            "© OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright",
            "Route data: Lipas, University of Jyväskylä (CC BY 4.0), https://www.lipas.fi",
        ],
        "layers": layers,
        "routes": routes,
        "places": places,
    }
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    OUT_FILE.write_text(text, encoding="utf-8")

    counts = ", ".join(f"{len(v)} {k}" for k, v in layers.items())
    print(f"\n{counts}; {len(routes)} Lipas trails; {len(places)} landmarks")
    print(f"Wrote {OUT_FILE.relative_to(ROOT)} ({len(text.encode()) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
