// Dead reckoning: estimating where you are without GPS, from where you last
// knew you were, how many steps you've taken, and which way you walked.
//
// It's the method sailors used before GPS. It's never exact: every step adds
// a little error, so the estimated accuracy gets worse the further you walk.

import { angleDifference, normalizeDegrees } from './angles';
import { destinationPoint } from './distance';
import type { LatLon } from './types';

export type DeadReckoningState = {
  position: LatLon;
  /** How far off the estimate might be, in metres. Grows as you walk. */
  accuracyM: number;
  /** Accuracy of the last real GPS fix this estimate started from. */
  startAccuracyM: number;
  /** Metres walked since that fix. */
  distanceSinceFixM: number;
};

/** Start estimating from a GPS fix (or from a beacon the hiker confirmed they're at). */
export function startFrom(position: LatLon, accuracyM: number): DeadReckoningState {
  return { position, accuracyM, startAccuracyM: accuracyM, distanceSinceFixM: 0 };
}

/**
 * Move the estimate forward.
 *
 * @param steps steps taken since the last update
 * @param stepLengthM how long one step is, in metres
 * @param headingTrue the walking direction, in degrees from TRUE north
 * @param errorGrowth how much uncertainty each metre walked adds (0.1 = 10%)
 */
export function advance(
  state: DeadReckoningState,
  steps: number,
  stepLengthM: number,
  headingTrue: number,
  errorGrowth: number,
): DeadReckoningState {
  const distance = Math.max(0, steps) * stepLengthM;
  if (distance === 0) return state;
  const distanceSinceFixM = state.distanceSinceFixM + distance;
  return {
    position: destinationPoint(state.position, distance, headingTrue),
    startAccuracyM: state.startAccuracyM,
    distanceSinceFixM,
    accuracyM: state.startAccuracyM + errorGrowth * distanceSinceFixM,
  };
}

export const DEFAULT_STEP_LENGTH_M = 0.75;
export const MIN_STEP_LENGTH_M = 0.4;
export const MAX_STEP_LENGTH_M = 1.1;

/**
 * Learn the hiker's step length while GPS works: GPS distance ÷ steps,
 * blended slowly into the current value so one bad GPS reading can't throw it off.
 *
 * Returns the current value unchanged if the stretch is too short to trust.
 */
export function calibrateStepLength(
  currentM: number,
  gpsDistanceM: number,
  steps: number,
  weight = 0.2,
): number {
  if (steps < 20 || gpsDistanceM < 15) return currentM;
  const measured = gpsDistanceM / steps;
  if (measured < MIN_STEP_LENGTH_M / 2 || measured > MAX_STEP_LENGTH_M * 2) return currentM; // clearly a GPS jump
  const blended = currentM + weight * (measured - currentM);
  return Math.min(MAX_STEP_LENGTH_M, Math.max(MIN_STEP_LENGTH_M, blended));
}

/**
 * Learn the difference between the way the phone points (compass) and the way
 * the hiker actually walks (GPS course). In a pocket these can be far apart,
 * but the difference stays about the same while the phone stays put.
 *
 * Both inputs must be measured from TRUE north: turn the compass heading into
 * a true heading first (magneticToTrue), because the GPS course is true.
 *
 * Returns the new offset in degrees (-180..180): add it to the true compass
 * heading to get the walking direction.
 */
export function calibrateHeadingOffset(
  currentOffset: number,
  compassHeadingTrue: number,
  gpsCourse: number,
  weight = 0.2,
): number {
  const measured = angleDifference(compassHeadingTrue, gpsCourse);
  // Blend along the shortest way round, so 170° and -170° average to 180°, not 0°.
  const blended = currentOffset + weight * angleDifference(currentOffset, measured);
  return angleDifference(0, normalizeDegrees(blended));
}

/** The walking direction (true north) from the compass heading, the learned offset and the declination. */
export function walkingHeading(compassMagnetic: number, offset: number, declinationDegrees: number): number {
  return normalizeDegrees(compassMagnetic + offset + declinationDegrees);
}
