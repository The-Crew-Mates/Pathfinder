"""Map maths for the trail importer: distances, route length, joining route pieces.

Points are tuples that start with (lat, lon) in decimal degrees. A point may
have more numbers after that, like (lat, lon, ele); only the first two are
used for the maths.
"""

import math

EARTH_RADIUS_M = 6_371_000
METRES_PER_DEGREE_LAT = 111_320


def distance_m(a, b):
    """Distance in metres between two points, along the Earth's surface.

    This is the "haversine" formula: it accounts for the Earth being round.
    """
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def route_length_m(points):
    """Length of a route in metres: the sum of the distances between neighbouring points."""
    return sum(distance_m(a, b) for a, b in zip(points, points[1:]))


def locate_on_route(point, route):
    """Return (distance from the route, distance along the route), both in metres.

    The first number says how close the point is to the route. The second says
    how far you'd walk from the start to reach the spot nearest to the point,
    which is handy for listing landmarks in the order a hiker meets them.

    Over a few hundred metres the Earth is flat enough to use a flat map, which
    keeps the maths simple: everything is measured in metres east (x) and
    north (y) of the point.
    """
    m_per_deg_lon = METRES_PER_DEGREE_LAT * math.cos(math.radians(point[0]))

    def to_xy(p):
        return ((p[1] - point[1]) * m_per_deg_lon, (p[0] - point[0]) * METRES_PER_DEGREE_LAT)

    best_distance = math.inf
    best_along = 0.0
    walked = 0.0  # metres from the start of the route to the start of this segment
    for a, b in zip(route, route[1:]):
        ax, ay = to_xy(a)
        bx, by = to_xy(b)
        dx, dy = bx - ax, by - ay
        segment_length = math.hypot(dx, dy)
        # t says where on this segment the closest spot is: 0 = at a, 1 = at b.
        if segment_length == 0:
            t = 0.0
        else:
            t = max(0.0, min(1.0, -(ax * dx + ay * dy) / segment_length**2))
        distance = math.hypot(ax + t * dx, ay + t * dy)
        if distance < best_distance:
            best_distance = distance
            best_along = walked + t * segment_length
        walked += segment_length
    return best_distance, best_along


def join_pieces(pieces, max_gap_m=50):
    """Join route pieces into one ordered line.

    Lipas often stores a route as several pieces, in no particular order and
    some pointing the "wrong" way. We start with the longest piece, then keep
    attaching whichever remaining piece has an end closest to either end of
    the line so far, flipping it around if needed.

    Returns (line, None) if it worked, or (None, reason) if some pieces are
    more than max_gap_m away from the rest, for example a route with a side
    branch, or two separate parts. Guessing there could draw a wrong route, and
    a wrong route is worse than none.
    """
    pieces = [list(piece) for piece in pieces if len(piece) >= 2]
    if not pieces:
        return None, "it has no route line"
    pieces.sort(key=route_length_m, reverse=True)
    line = pieces.pop(0)

    while pieces:
        # Find the closest way to attach any remaining piece:
        # (gap in metres, which piece, attach at "end" or "start", flip it?)
        best = None
        for i, piece in enumerate(pieces):
            for gap, where, flip in (
                (distance_m(line[-1], piece[0]), "end", False),
                (distance_m(line[-1], piece[-1]), "end", True),
                (distance_m(line[0], piece[-1]), "start", False),
                (distance_m(line[0], piece[0]), "start", True),
            ):
                if best is None or gap < best[0]:
                    best = (gap, i, where, flip)

        gap, i, where, flip = best
        if gap > max_gap_m:
            return None, (
                f"it has {len(pieces)} piece(s) that don't connect to the rest "
                f"(the nearest is {gap:.0f} m away)"
            )

        piece = pieces.pop(i)
        if flip:
            piece.reverse()
        # If the ends practically touch (under 1 m), drop the doubled-up point.
        if where == "end":
            line.extend(piece[1:] if gap < 1 else piece)
        else:
            line[:0] = piece[:-1] if gap < 1 else piece

    return line, None
