import { describe, expect, it } from 'vitest';

import {
  decimalYear,
  declination,
  isModelValid,
  magneticField,
  magneticToTrue,
  trueToMagnetic,
} from '../../src/geo/declination';

// NOAA's official WMM2025 test values (WMM2025_TEST_VALUES.txt, from
// https://www.ncei.noaa.gov/products/world-magnetic-model).
// [decimal year, height km, latitude, longitude, X nT, Y nT, Z nT, inclination °, declination °]
const NOAA_TEST_VALUES = [
  [2025.0, 0, 80, 0, 6521.6, 145.9, 54791.5, 83.21, 1.28],
  [2025.0, 0, 0, 120, 39677.8, -109.6, -10580.2, -14.93, -0.16],
  [2025.0, 0, -80, 240, 6117.5, 15751.9, -52022.5, -72.0, 68.78],
  [2025.0, 100, 80, 0, 6216.0, 92.4, 52598.8, 83.26, 0.85],
  [2025.0, 100, 0, 120, 37688.6, -96.2, -10152.1, -15.08, -0.15],
  [2025.0, 100, -80, 240, 5907.6, 14780.3, -49540.7, -72.19, 68.21],
  [2027.5, 0, 80, 0, 6500.8, 294.5, 54869.4, 83.24, 2.59],
  [2027.5, 0, 0, 120, 39701.6, -167.4, -10381.8, -14.65, -0.24],
  [2027.5, 0, -80, 240, 6200.7, 15730.3, -51783.7, -71.92, 68.49],
  [2027.5, 100, 80, 0, 6196.7, 233.8, 52670.5, 83.29, 2.16],
  [2027.5, 100, 0, 120, 37711.5, -148.7, -9969.8, -14.81, -0.23],
  [2027.5, 100, -80, 240, 5984.0, 14760.1, -49317.7, -72.1, 67.93],
] as const;

describe('magneticField matches NOAA WMM2025 test values', () => {
  it.each(NOAA_TEST_VALUES)(
    'year %s, height %s km, lat %s, lon %s',
    (year, height, lat, lon, x, y, z, inclination, decl) => {
      const field = magneticField(lat, lon, height, year);
      // NOAA rounds the field to 0.1 nT and angles to 0.01°, so allow just over half a step.
      expect(Math.abs(field.x - x)).toBeLessThanOrEqual(0.06);
      expect(Math.abs(field.y - y)).toBeLessThanOrEqual(0.06);
      expect(Math.abs(field.z - z)).toBeLessThanOrEqual(0.06);
      expect(Math.abs(field.declination - decl)).toBeLessThanOrEqual(0.006);
      expect(Math.abs(field.inclination - inclination)).toBeLessThanOrEqual(0.006);
    },
  );
});

describe('declination in Nuuksio', () => {
  it('is about 10° east in 2026', () => {
    const d = declination(60.3, 24.5, new Date(Date.UTC(2026, 9, 25)));
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(12);
  });
});

describe('decimalYear and validity', () => {
  it('turns dates into decimal years', () => {
    expect(decimalYear(new Date(Date.UTC(2025, 0, 1)))).toBe(2025);
    expect(decimalYear(new Date(Date.UTC(2026, 6, 2, 12)))).toBeCloseTo(2026.5, 2);
  });

  it('knows the model is valid from 2025 to 2030', () => {
    expect(isModelValid(new Date(Date.UTC(2026, 9, 25)))).toBe(true);
    expect(isModelValid(new Date(Date.UTC(2024, 11, 31)))).toBe(false);
    expect(isModelValid(new Date(Date.UTC(2030, 6, 1)))).toBe(false);
  });
});

describe('true and magnetic bearings', () => {
  it('subtracts an east declination to get the magnetic bearing', () => {
    // With magnetic north 10° east of true north, true north is magnetic 350°.
    expect(trueToMagnetic(0, 10)).toBe(350);
    expect(trueToMagnetic(90, 10)).toBe(80);
  });

  it('adds a west declination (negative) back', () => {
    expect(trueToMagnetic(90, -5)).toBe(95);
  });

  it('converts back the other way', () => {
    expect(magneticToTrue(350, 10)).toBe(0);
    expect(magneticToTrue(trueToMagnetic(123, 10.4), 10.4)).toBeCloseTo(123, 9);
  });
});
