import { angleDifference } from '../src/geo/angles';
import {
  EARTH_RADIUS_M,
  destinationPoint,
  distanceMeters,
  initialBearing,
  pathLength,
} from '../src/geo/distance';

// Exact values on a sphere with the Earth's radius.
const QUARTER_CIRCLE_M = (Math.PI * EARTH_RADIUS_M) / 2; // ≈ 10,007.5 km
const ONE_DEGREE_M = (2 * Math.PI * EARTH_RADIUS_M) / 360; // ≈ 111.195 km

const HELSINKI_CATHEDRAL = { lat: 60.17027, lon: 24.95222 };
const TAMPERE_CATHEDRAL = { lat: 61.50028, lon: 23.77222 };
const NUUKSIO_HAUKKALAMPI = { lat: 60.30954, lon: 24.52085 };

describe('distanceMeters', () => {
  it('is zero from a point to itself', () => {
    expect(distanceMeters(HELSINKI_CATHEDRAL, HELSINKI_CATHEDRAL)).toBe(0);
  });

  it('measures one degree of latitude as about 111.2 km', () => {
    expect(distanceMeters({ lat: 60, lon: 24 }, { lat: 61, lon: 24 })).toBeCloseTo(ONE_DEGREE_M, 3);
  });

  it('measures a quarter of the way round the Earth exactly', () => {
    expect(distanceMeters({ lat: 0, lon: 0 }, { lat: 90, lon: 0 })).toBeCloseTo(QUARTER_CIRCLE_M, 3);
    expect(distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 90 })).toBeCloseTo(QUARTER_CIRCLE_M, 3);
  });

  it('measures Helsinki Cathedral to Tampere Cathedral as about 160 km', () => {
    const km = distanceMeters(HELSINKI_CATHEDRAL, TAMPERE_CATHEDRAL) / 1000;
    expect(km).toBeGreaterThan(158);
    expect(km).toBeLessThan(162);
  });

  it('is the same in both directions', () => {
    expect(distanceMeters(HELSINKI_CATHEDRAL, TAMPERE_CATHEDRAL)).toBeCloseTo(
      distanceMeters(TAMPERE_CATHEDRAL, HELSINKI_CATHEDRAL),
      6,
    );
  });
});

describe('initialBearing', () => {
  const origin = { lat: 0, lon: 0 };

  it('gives the four compass directions', () => {
    expect(initialBearing(origin, { lat: 10, lon: 0 })).toBeCloseTo(0, 9);
    expect(initialBearing(origin, { lat: 0, lon: 10 })).toBeCloseTo(90, 9);
    expect(initialBearing(origin, { lat: -10, lon: 0 })).toBeCloseTo(180, 9);
    expect(initialBearing(origin, { lat: 0, lon: -10 })).toBeCloseTo(270, 9);
  });

  it('points north-northwest from Helsinki to Tampere', () => {
    const bearing = initialBearing(HELSINKI_CATHEDRAL, TAMPERE_CATHEDRAL);
    expect(bearing).toBeGreaterThan(330);
    expect(bearing).toBeLessThan(345);
  });

  it('heads slightly north of east when going "due east" at 60°N (the great-circle route curves poleward)', () => {
    const bearing = initialBearing({ lat: 60, lon: 24 }, { lat: 60, lon: 25 });
    expect(bearing).toBeLessThan(90);
    expect(bearing).toBeGreaterThan(89);
  });
});

describe('destinationPoint', () => {
  it('walks 1 km due north and lands exactly 1 km north', () => {
    const end = destinationPoint(NUUKSIO_HAUKKALAMPI, 1000, 0);
    expect(end.lon).toBeCloseTo(NUUKSIO_HAUKKALAMPI.lon, 9);
    expect(end.lat - NUUKSIO_HAUKKALAMPI.lat).toBeCloseTo(1000 / ONE_DEGREE_M, 9);
  });

  it('walks 1 km east at 60.3°N: about 0.018° of longitude, since lines of longitude are closer together there', () => {
    const end = destinationPoint({ lat: 60.3, lon: 24.5 }, 1000, 90);
    const expectedDegrees = 1000 / (ONE_DEGREE_M * Math.cos((60.3 * Math.PI) / 180));
    expect(end.lon - 24.5).toBeCloseTo(expectedDegrees, 6);
    expect(end.lat).toBeCloseTo(60.3, 3); // drifts a tiny bit south of the starting latitude
  });

  it('round trip: the distance and bearing to the destination match what was walked', () => {
    for (const bearing of [0, 37, 90, 145, 222, 300]) {
      const end = destinationPoint(NUUKSIO_HAUKKALAMPI, 750, bearing);
      expect(distanceMeters(NUUKSIO_HAUKKALAMPI, end)).toBeCloseTo(750, 6);
      // Compare angles the short way round: 359.9999999° and 0° are the same direction.
      expect(Math.abs(angleDifference(bearing, initialBearing(NUUKSIO_HAUKKALAMPI, end)))).toBeLessThan(1e-6);
    }
  });

  it('keeps longitude between -180 and 180 when crossing the date line', () => {
    const end = destinationPoint({ lat: 0, lon: 179.9 }, 50_000, 90);
    expect(end.lon).toBeLessThan(-179);
  });
});

describe('pathLength', () => {
  it('adds up the legs', () => {
    const a = { lat: 60, lon: 24 };
    const b = { lat: 61, lon: 24 };
    expect(pathLength([a, b, a])).toBeCloseTo(2 * ONE_DEGREE_M, 3);
    expect(pathLength([a])).toBe(0);
  });
});
