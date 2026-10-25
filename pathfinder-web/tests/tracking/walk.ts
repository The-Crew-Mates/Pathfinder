// A made-up walk for the dead reckoning tests: the readings a phone would
// record (GPS fixes, steps, compass), generated from a known true path.

import { declination } from '../../src/geo/declination';
import { destinationPoint } from '../../src/geo/distance';
import type { LatLon } from '../../src/geo/types';
import type { Reading } from '../../src/tracking/recording';

export const START: LatLon = { lat: 60.30954, lon: 24.52085 }; // Haukkalampi, Nuuksio
export const T0 = Date.UTC(2026, 9, 25, 9, 0);
export const MINUTE = 60_000;

/** A made-up random number generator, so the "noise" is the same every run. */
export function noise(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) * 2 - 1; // -1..1
  };
}

export type WalkOptions = {
  /** [minutes, true walking direction] pieces, walked one after another. */
  legs: [number, number][];
  stepLengthM?: number;
  stepsPerSecond?: number;
  /** Degrees the phone points away from the walking direction (pocket). */
  phoneOffset?: number;
  /** Minutes (from the start) with no GPS fixes at all, e.g. [8, 13]. */
  noGps?: [number, number];
  gpsEverySeconds?: number;
  gpsAccuracyM?: number;
};

/** The readings, and the true position at any time. */
export function makeWalk(options: WalkOptions): { readings: Reading[]; truth: (t: number) => LatLon } {
  const {
    legs,
    stepLengthM = 0.8,
    stepsPerSecond = 1.8,
    phoneOffset = 0,
    noGps = null,
    gpsEverySeconds = 60,
    gpsAccuracyM = 6,
  } = options;
  const random = noise();
  const decl = declination(START.lat, START.lon, new Date(T0));
  const speed = stepLengthM * stepsPerSecond; // m/s
  const totalSeconds = legs.reduce((sum, [minutes]) => sum + minutes * 60, 0);

  const truth = (t: number): LatLon => {
    let seconds = (t - T0) / 1000;
    let here = START;
    for (const [minutes, bearing] of legs) {
      const leg = Math.min(seconds, minutes * 60);
      here = destinationPoint(here, leg * speed, bearing);
      seconds -= leg;
      if (seconds <= 0) break;
    }
    return here;
  };
  const courseAt = (t: number): number => {
    let seconds = (t - T0) / 1000;
    for (const [minutes, bearing] of legs) {
      if (seconds < minutes * 60) return bearing;
      seconds -= minutes * 60;
    }
    return legs.at(-1)![1];
  };

  const readings: Reading[] = [];
  for (let s = 0; s <= totalSeconds; s++) {
    const t = T0 + s * 1000;
    const minute = s / 60;
    if (s % gpsEverySeconds === 0 && !(noGps && minute >= noGps[0] && minute < noGps[1])) {
      const p = destinationPoint(truth(t), Math.abs(random()) * gpsAccuracyM * 0.5, random() * 180);
      readings.push({ t, kind: 'fix', lat: p.lat, lon: p.lon, accuracyM: gpsAccuracyM });
    }
    if (s > 0) {
      readings.push({ t, kind: 'heading', magnetic: courseAt(t) - phoneOffset - decl + random() * 4 });
      readings.push({ t: t + 1, kind: 'steps', count: stepsPerSecond });
    }
  }
  return { readings, truth };
}
