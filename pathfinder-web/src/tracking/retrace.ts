// Retrace: leads the hiker back along their own beacons, newest to oldest, to
// where the hike started. Pure logic with no browser code, like engine.ts, so
// it's easy to test with made-up walks (tests/tracking/retrace.test.ts).
//
// - The target starts at the newest beacon. Arriving at it (closer than the
//   arrival radius) moves the target to the beacon before it. Arriving at the
//   first beacon means the hiker is back at the start.
// - Shortcut: coming within reach of an OLDER beacon than the target skips
//   straight to it, so a hiker who cuts a corner isn't sent back for nothing.
// - "I'm at this beacon": the hiker recognises the spot (its note or photo)
//   and moves on by hand, which also helps when the position is only estimated.
// - Off track: the distance to the target has grown well past the closest the
//   hiker got to it, so they're walking away from it.

import type { Beacon } from '../beacons/types';
import { angleDifference } from '../geo/angles';
import { distanceMeters, initialBearing, pathLength } from '../geo/distance';
import type { LatLon } from '../geo/types';

/** A beacon counts as reached within this many metres, however precise the positions are... */
export const ARRIVE_MIN_M = 15;
/** ...and never further than this, so a rough estimate can't "reach" every beacon around it. */
export const ARRIVE_MAX_M = 40;
/** Off track once the target is this much further away than the closest the hiker got (or the ±, if bigger). */
export const OFF_TRACK_MARGIN_M = 25;
/** An easy hiking pace, for the time left. */
export const WALKING_SPEED_KMH = 4.3;

/** A position with its ± accuracy, e.g. the current GPS fix or estimate. */
type Located = LatLon & { accuracyM: number };

export type RetraceState = {
  /** The beacon being walked to: its position in time order, 0 = the start beacon. */
  targetIndex: number;
  /** The closest the hiker has been to the target, in metres, or null before the first position. */
  closestM: number | null;
  /** True once the hiker is back at the start beacon. */
  finished: boolean;
};

/** Start retracing from the newest beacon, or null if there are no beacons to follow. */
export function newRetrace(beacons: readonly Beacon[]): RetraceState | null {
  return beacons.length > 0 ? resumeRetrace(beacons.length - 1) : null;
}

/** Carry on retracing after the app was reopened (the hike saves the target's index). */
export function resumeRetrace(targetIndex: number): RetraceState {
  return { targetIndex, closestM: null, finished: false };
}

/** How close counts as "at the beacon": both positions' ± added together, kept within ARRIVE_MIN_M..ARRIVE_MAX_M. */
export function arrivalRadius(beacon: Beacon, position: Located): number {
  return Math.min(ARRIVE_MAX_M, Math.max(ARRIVE_MIN_M, beacon.accuracyM + position.accuracyM));
}

/** Reaching beacon `index` makes the one before it the target, or finishes at the start. */
function arriveAt(index: number): RetraceState {
  return index === 0 ? { targetIndex: 0, closestM: null, finished: true } : resumeRetrace(index - 1);
}

/**
 * Feed in the hiker's position. Returns the new state, and the index of the
 * beacon just reached (or null). The state is returned unchanged (the same
 * object) when nothing changed.
 */
export function updateRetrace(
  state: RetraceState,
  beacons: readonly Beacon[],
  position: Located,
): { state: RetraceState; arrived: number | null } {
  if (state.finished || beacons.length === 0) return { state, arrived: null };
  const target = Math.min(state.targetIndex, beacons.length - 1);

  // The OLDEST beacon within reach, up to the target: usually the target
  // itself, but an older one if the hiker took a shortcut.
  for (let i = 0; i <= target; i++) {
    if (distanceMeters(position, beacons[i]) <= arrivalRadius(beacons[i], position)) {
      return { state: arriveAt(i), arrived: i };
    }
  }

  const distance = distanceMeters(position, beacons[target]);
  const closestM = state.closestM === null ? distance : Math.min(state.closestM, distance);
  if (target === state.targetIndex && closestM === state.closestM) return { state, arrived: null };
  return { state: { ...state, targetIndex: target, closestM }, arrived: null };
}

/** The hiker says they're at the target beacon: move on to the one before it. */
export function confirmAtBeacon(state: RetraceState): RetraceState {
  return state.finished ? state : arriveAt(state.targetIndex);
}

export type RetraceGuidance = {
  targetIndex: number;
  target: Beacon;
  /** Straight-line distance to the target, in metres. */
  distanceM: number;
  /** The direction to walk, in degrees from TRUE north. */
  bearing: number;
  /** How far to turn from where the phone points (-180..180, positive = right), or null without a compass. */
  turn: number | null;
  /** Metres left: to the target, then from beacon to beacon back to the start. */
  remainingM: number;
  /** Beacons still to reach, the target included. */
  beaconsLeft: number;
  minutesLeft: number;
  offTrack: boolean;
};

/**
 * Where to go next, from the hiker's position and the phone's compass
 * heading (degrees from TRUE north, or null when there's no compass).
 * Null when retracing is finished or there are no beacons.
 */
export function retraceGuidance(
  state: RetraceState,
  beacons: readonly Beacon[],
  position: Located,
  headingTrue: number | null,
): RetraceGuidance | null {
  if (state.finished || beacons.length === 0) return null;
  const targetIndex = Math.min(state.targetIndex, beacons.length - 1);
  const target = beacons[targetIndex];
  const distanceM = distanceMeters(position, target);
  const bearing = initialBearing(position, target);
  // The way back is the way out in reverse, so the same length.
  const remainingM = distanceM + pathLength(beacons.slice(0, targetIndex + 1));
  const offTrack =
    state.closestM !== null && distanceM > state.closestM + Math.max(OFF_TRACK_MARGIN_M, position.accuracyM);
  return {
    targetIndex,
    target,
    distanceM,
    bearing,
    turn: headingTrue === null ? null : angleDifference(headingTrue, bearing),
    remainingM,
    beaconsLeft: targetIndex + 1,
    minutesLeft: remainingM / ((WALKING_SPEED_KMH * 1000) / 60),
    offTrack,
  };
}

/** A turn (from retraceGuidance) in words. */
export function turnInstruction(turn: number): string {
  const size = Math.abs(turn);
  const side = turn < 0 ? 'left' : 'right';
  if (size < 20) return 'Straight ahead';
  if (size < 60) return `Slight ${side}`;
  if (size < 135) return `Turn ${side}`;
  return 'Turn around';
}
