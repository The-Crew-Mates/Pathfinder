// The beacon rules: decides WHEN to drop a beacon. Pure logic with no browser
// code, so it's easy to test with made-up walks (tests/tracking/engine.test.ts).
//
// A beacon is dropped when the FIRST of these happens, then all three start over:
//   - time:     X minutes since the last beacon
//   - distance: X metres walked since the last beacon
//   - turn:     the walking direction changed by more than X° and stayed changed for X seconds
// The very first good GPS fix of a hike drops a "start" beacon.
//
// While GPS is lost, the same rules run on the position estimated from steps
// and the compass (onEstimate), and those beacons are saved as "estimated".

import type { Settings } from '../beacons/settings';
import type { BeaconReason, BeaconSource } from '../beacons/types';
import { angleDifference } from '../geo/angles';
import { distanceMeters, initialBearing } from '../geo/distance';
import type { LatLon } from '../geo/types';

/** A position from GPS. */
export type Fix = LatLon & { accuracyM: number; timestamp: number };

/** Fixes worse than this (in metres) are too rough to drop beacons or measure walking with. */
export const POOR_ACCURACY_M = 50;

/**
 * GPS positions wobble even when you stand still. Two fixes can each be off by
 * their accuracy, in opposite directions, so a movement only counts as real
 * walking if it's bigger than BOTH accuracies added together (and at least
 * MIN_STEP_M). Otherwise standing at a viewpoint would add up to "300 m
 * walked", and the wobble's random directions would look like turns.
 */
export const MIN_STEP_M = 10;

export type EngineState = {
  /** When and where the last beacon was dropped, or null before the first one. */
  lastBeacon: { timestamp: number; position: LatLon } | null;
  /** Metres walked since the last beacon. */
  distanceSinceBeaconM: number;
  /** The last point that counted as real movement (see MIN_STEP_M). */
  anchor: Fix | null;
  /** The current walking direction (degrees from true north), or null before we've moved. */
  course: number | null;
  /** The walking direction when the last beacon was dropped; turns are measured against it. */
  referenceCourse: number | null;
  /** When the walking direction first moved away from referenceCourse, or null. */
  turnStartedAt: number | null;
  /** The newest good fix. */
  lastFix: Fix | null;
};

/** What to drop: the reason, where and when, and whether the position came from GPS or was estimated. */
export type Drop = {
  reason: BeaconReason;
  source: BeaconSource;
  position: LatLon;
  accuracyM: number;
  timestamp: number;
};

export type Step = { state: EngineState; drop: Drop | null };

/** A fresh hike: nothing has happened yet. */
export function newEngine(): EngineState {
  return {
    lastBeacon: null,
    distanceSinceBeaconM: 0,
    anchor: null,
    course: null,
    referenceCourse: null,
    turnStartedAt: null,
    lastFix: null,
  };
}

/** Carry on a hike after the app was reopened, counting from its last saved beacon. */
export function resumeEngine(lastBeacon: { timestamp: number; lat: number; lon: number } | null): EngineState {
  const state = newEngine();
  if (lastBeacon) {
    state.lastBeacon = { timestamp: lastBeacon.timestamp, position: { lat: lastBeacon.lat, lon: lastBeacon.lon } };
  }
  return state;
}

/** After any beacon, all three rules start over from here. */
function dropped(state: EngineState, drop: Drop): Step {
  return {
    state: {
      ...state,
      lastBeacon: { timestamp: drop.timestamp, position: drop.position },
      distanceSinceBeaconM: 0,
      referenceCourse: state.course,
      turnStartedAt: null,
    },
    drop,
  };
}

/** Feed in a new GPS fix. Returns the new state, and a beacon to drop if a rule was met. */
export function onFix(previous: EngineState, fix: Fix, settings: Settings): Step {
  if (fix.accuracyM > POOR_ACCURACY_M) return { state: previous, drop: null };
  const state: EngineState = { ...previous, lastFix: fix };
  if (!state.lastBeacon) {
    return dropped({ ...state, anchor: fix }, dropAt(fix, 'gps', 'start'));
  }
  // Only count movement bigger than the GPS wobble.
  const wobbleM = (anchor: Fix) => Math.max(MIN_STEP_M, anchor.accuracyM + fix.accuracyM);
  return applyRules(state, fix, 'gps', wobbleM, settings);
}

/**
 * Feed in a position estimated from steps and the compass (while GPS is lost).
 * Estimates don't wobble the way GPS does, so any movement of MIN_STEP_M or
 * more counts, however big the estimate's uncertainty has grown.
 */
export function onEstimate(previous: EngineState, estimate: Fix, settings: Settings): Step {
  if (!previous.lastBeacon) return { state: previous, drop: null }; // estimates always start from a GPS fix
  return applyRules({ ...previous }, estimate, 'estimated', () => MIN_STEP_M, settings);
}

function dropAt(position: Fix, source: BeaconSource, reason: BeaconReason): Drop {
  return {
    reason,
    source,
    position: { lat: position.lat, lon: position.lon },
    accuracyM: position.accuracyM,
    timestamp: position.timestamp,
  };
}

/** The distance, turn and time rules, shared by GPS fixes and estimates. */
function applyRules(
  previous: EngineState,
  position: Fix,
  source: BeaconSource,
  wobbleM: (anchor: Fix) => number,
  settings: Settings,
): Step {
  let state = previous;
  const lastBeaconAt = state.lastBeacon!.timestamp;

  // Walking: count the movement once it's bigger than the wobble.
  if (!state.anchor) {
    state.anchor = position;
  } else {
    const moved = distanceMeters(state.anchor, position);
    if (moved >= wobbleM(state.anchor)) {
      state = {
        ...state,
        distanceSinceBeaconM: state.distanceSinceBeaconM + moved,
        course: initialBearing(state.anchor, position),
        anchor: position,
      };
    }
  }

  // Turning: the direction must stay changed for a while, so a quick wiggle
  // around a rock doesn't count.
  if (state.course !== null && state.referenceCourse === null) {
    state.referenceCourse = state.course; // the first direction we ever walked in
  } else if (state.course !== null && state.referenceCourse !== null) {
    const turned = Math.abs(angleDifference(state.referenceCourse, state.course)) > settings.turnAngleDegrees;
    if (!turned) state.turnStartedAt = null;
    else if (state.turnStartedAt === null) state.turnStartedAt = position.timestamp;
  }

  // Whichever rule is met first. If two are met on the same position, the
  // order below decides which reason is recorded.
  if (state.distanceSinceBeaconM >= settings.beaconDistanceM) return dropped(state, dropAt(position, source, 'distance'));
  if (state.turnStartedAt !== null && position.timestamp - state.turnStartedAt >= settings.turnSustainSeconds * 1000) {
    return dropped(state, dropAt(position, source, 'turn'));
  }
  if (position.timestamp - lastBeaconAt >= settings.beaconIntervalMinutes * 60_000) {
    return dropped(state, dropAt(position, source, 'time'));
  }
  return { state, drop: null };
}

/**
 * Check the time rule when no new position has arrived (called every few seconds).
 * The beacon goes at the newest position, but only if it's recent: a GPS
 * position from 20 minutes ago isn't where the hiker is now. While GPS is lost,
 * pass the current `estimate` from dead reckoning, which is always up to date.
 */
export function onTick(state: EngineState, now: number, settings: Settings, estimate: Fix | null = null): Step {
  const { lastBeacon, lastFix } = state;
  if (!lastBeacon) return { state, drop: null };
  if (now - lastBeacon.timestamp < settings.beaconIntervalMinutes * 60_000) return { state, drop: null };
  if (estimate) return dropped(state, { ...dropAt(estimate, 'estimated', 'time'), timestamp: now });
  if (lastFix && now - lastFix.timestamp <= settings.gpsLostAfterSeconds * 1000) {
    return dropped(state, { ...dropAt(lastFix, 'gps', 'time'), timestamp: now });
  }
  return { state, drop: null };
}
