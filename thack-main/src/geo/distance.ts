// Distances and directions on the Earth's surface.
//
// The Earth is treated as a sphere, which is accurate to about 0.5%: plenty
// for hiking, and the same model the trail backend uses (scripts/geo.py).

import { normalizeDegrees, toDegrees, toRadians } from './angles';
import type { LatLon } from './types';

export const EARTH_RADIUS_M = 6_371_000;

/** Distance in metres between two points (the "haversine" formula). */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRadians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The compass direction to walk from `from` to reach `to`, in degrees from
 * TRUE north (0 = north, 90 = east). Over long distances the direction
 * changes along the way; this is the direction at the start.
 */
export function initialBearing(from: LatLon, to: LatLon): number {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLon = toRadians(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

/** Where you end up after walking `distanceM` metres from `start` in direction `bearing` (true north). */
export function destinationPoint(start: LatLon, distanceM: number, bearing: number): LatLon {
  const angular = distanceM / EARTH_RADIUS_M;
  const theta = toRadians(bearing);
  const lat1 = toRadians(start.lat);
  const lon1 = toRadians(start.lon);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(theta),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  // Keep longitude between -180 and 180.
  return { lat: toDegrees(lat2), lon: ((toDegrees(lon2) + 540) % 360) - 180 };
}

/** Total length in metres of a path through `points`, in order. */
export function pathLength(points: readonly LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceMeters(points[i - 1], points[i]);
  return total;
}
