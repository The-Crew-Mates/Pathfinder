// Turning latitude/longitude into flat map coordinates (metres east and south
// of a centre point). Over a few kilometres the Earth is flat enough for this,
// and metres make zooming and distances easy.

import { METRES_PER_DEGREE_LAT } from '../geo/geo-constants';

export type Projector = {
  /** [x, y] in metres: x grows to the east, y grows to the SOUTH (like screen pixels). */
  toXY: (lat: number, lon: number) => [number, number];
  /** The opposite: map metres back to [lat, lon]. */
  toLatLon: (x: number, y: number) => [number, number];
};

export function makeProjector(centerLat: number, centerLon: number): Projector {
  const metresPerDegreeLon = METRES_PER_DEGREE_LAT * Math.cos((centerLat * Math.PI) / 180);
  return {
    toXY: (lat, lon) => [(lon - centerLon) * metresPerDegreeLon, -(lat - centerLat) * METRES_PER_DEGREE_LAT],
    toLatLon: (x, y) => [centerLat - y / METRES_PER_DEGREE_LAT, centerLon + x / metresPerDegreeLon],
  };
}

/** An SVG path for a line: "M x y L x y ...", rounded to 0.1 m to keep it short. */
export function linePath(points: [number, number][], projector: Projector): string {
  return points
    .map(([lat, lon], i) => {
      const [x, y] = projector.toXY(lat, lon);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join('');
}

/** An SVG path for a filled shape made of rings (each closed with Z). */
export function shapePath(rings: [number, number][][], projector: Projector): string {
  return rings.map((ring) => `${linePath(ring, projector)}Z`).join('');
}
