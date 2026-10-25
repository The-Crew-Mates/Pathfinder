// Magnetic declination, calculated offline with the World Magnetic Model 2025.
//
// A compass needle points to MAGNETIC north, which isn't the same as TRUE
// north (the North Pole, which maps use). The angle between them is the
// declination, and it depends on where you are and when. In southern Finland
// it's about 10° east in 2026, so ignoring it would send a hiker 10° off course.
//
// This follows the method in NOAA's WMM2025 technical report. The tests check
// it against NOAA's official test values (tests/geo/declination.test.ts).

import { normalizeDegrees, toDegrees, toRadians } from './angles';
import { WMM_COEFFICIENTS, WMM_EPOCH, WMM_VALID_UNTIL } from './wmm2025';

// The WGS84 ellipsoid (the Earth's shape as GPS sees it), and the model's reference radius.
const WGS84_A_KM = 6378.137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const REFERENCE_RADIUS_KM = 6371.2;
const MAX_DEGREE = 12;

export type MagneticField = {
  /** Northward, eastward and downward strength of the field, in nanotesla. */
  x: number;
  y: number;
  z: number;
  /** Declination in degrees: positive = magnetic north is EAST of true north. */
  declination: number;
  /** Inclination ("dip") in degrees: positive = the field points down into the ground. */
  inclination: number;
};

/** A date as a decimal year, e.g. 1 July 2026 ≈ 2026.5, which is what the model uses. */
export function decimalYear(date: Date): number {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return year + (date.getTime() - start) / (end - start);
}

/** True if the model is valid on this date (2025 to 2030). After that, NOAA publishes a new one. */
export function isModelValid(date: Date): boolean {
  const year = decimalYear(date);
  return year >= WMM_EPOCH && year <= WMM_VALID_UNTIL;
}

/**
 * The Earth's magnetic field at a point.
 *
 * @param lat latitude in degrees (GPS latitude)
 * @param lon longitude in degrees
 * @param heightKm height above the WGS84 ellipsoid in km (about sea level for hiking; 0 is fine)
 * @param year decimal year, see decimalYear()
 */
export function magneticField(lat: number, lon: number, heightKm: number, year: number): MagneticField {
  // 1. GPS latitude is "geodetic" (it accounts for the Earth being slightly
  //    flattened). The model works on a sphere, so convert to "geocentric"
  //    latitude and distance from the Earth's centre.
  const phi = toRadians(lat);
  const lambda = toRadians(lon);
  const rc = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * Math.sin(phi) ** 2);
  const p = (rc + heightKm) * Math.cos(phi);
  const zc = (rc * (1 - WGS84_E2) + heightKm) * Math.sin(phi);
  const r = Math.hypot(p, zc);
  const phiC = Math.asin(zc / r); // geocentric latitude

  // 2. Spherical harmonics use the angle from the North Pole ("colatitude").
  const cosT = Math.sin(phiC);
  const sinT = Math.max(Math.cos(phiC), 1e-10); // avoid dividing by zero exactly at a pole

  // 3. Schmidt semi-normalised associated Legendre functions P[n][m] and
  //    their derivatives dP[n][m] (with respect to colatitude), by recursion.
  const P: number[][] = [];
  const dP: number[][] = [];
  for (let n = 0; n <= MAX_DEGREE; n++) {
    P.push(new Array(n + 1).fill(0));
    dP.push(new Array(n + 1).fill(0));
  }
  P[0][0] = 1;
  for (let n = 1; n <= MAX_DEGREE; n++) {
    for (let m = 0; m <= n; m++) {
      if (m === n) {
        const k = n === 1 ? 1 : Math.sqrt((2 * n - 1) / (2 * n));
        P[n][n] = k * sinT * P[n - 1][n - 1];
        dP[n][n] = k * (sinT * dP[n - 1][n - 1] + cosT * P[n - 1][n - 1]);
      } else {
        const a = 2 * n - 1;
        const b = n >= 2 && m <= n - 2 ? Math.sqrt((n - 1) ** 2 - m * m) : 0;
        const c = Math.sqrt(n * n - m * m);
        const prev2 = n >= 2 && m <= n - 2 ? P[n - 2][m] : 0;
        const dPrev2 = n >= 2 && m <= n - 2 ? dP[n - 2][m] : 0;
        P[n][m] = (a * cosT * P[n - 1][m] - b * prev2) / c;
        dP[n][m] = (a * (cosT * dP[n - 1][m] - sinT * P[n - 1][m]) - b * dPrev2) / c;
      }
    }
  }

  // 4. Add up the field, with each coefficient moved forward to the given year.
  const dt = year - WMM_EPOCH;
  let xPrime = 0;
  let yPrime = 0;
  let zPrime = 0;
  for (const [n, m, g0, h0, gDot, hDot] of WMM_COEFFICIENTS) {
    const g = g0 + dt * gDot;
    const h = h0 + dt * hDot;
    const ratio = (REFERENCE_RADIUS_KM / r) ** (n + 2);
    const cosM = Math.cos(m * lambda);
    const sinM = Math.sin(m * lambda);
    xPrime += ratio * (g * cosM + h * sinM) * dP[n][m];
    yPrime += (ratio * m * (g * sinM - h * cosM) * P[n][m]) / sinT;
    zPrime -= ratio * (n + 1) * (g * cosM + h * sinM) * P[n][m];
  }

  // 5. Rotate from the sphere back to the GPS (geodetic) frame.
  const psi = phiC - phi;
  const x = xPrime * Math.cos(psi) - zPrime * Math.sin(psi);
  const z = xPrime * Math.sin(psi) + zPrime * Math.cos(psi);
  const y = yPrime;

  return {
    x,
    y,
    z,
    declination: toDegrees(Math.atan2(y, x)),
    inclination: toDegrees(Math.atan2(z, Math.hypot(x, y))),
  };
}

/** Declination in degrees at a point and date (positive = east). */
export function declination(lat: number, lon: number, date: Date, heightKm = 0): number {
  return magneticField(lat, lon, heightKm, decimalYear(date)).declination;
}

/**
 * Turn a bearing measured from TRUE north (what maps and GPS give) into one
 * measured from MAGNETIC north (what the phone's compass shows).
 * With an east declination, magnetic north is to the right of true north, so
 * the same direction has a smaller magnetic bearing.
 */
export function trueToMagnetic(trueBearing: number, declinationDegrees: number): number {
  return normalizeDegrees(trueBearing - declinationDegrees);
}

/** The opposite: a compass (magnetic) heading turned into a true-north heading. */
export function magneticToTrue(magneticBearing: number, declinationDegrees: number): number {
  return normalizeDegrees(magneticBearing + declinationDegrees);
}
