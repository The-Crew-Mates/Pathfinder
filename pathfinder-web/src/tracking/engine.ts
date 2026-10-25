// The beacon rules: decides WHEN to drop a beacon. Pure logic with no browser
// code, so it's easy to test with made-up walks (tests/tracking/engine.test.ts).
//
// A beacon is dropped when the FIRST of these happens, then all three start over:
//   - time:     X minutes since the last beacon
//   - distance: X metres walked since the last beacon
//   - turn:     the walking direction changed by more than X° and stayed changed for X seconds
// The very first good GPS fix of a hike drops a "start" beacon.

import type { Settings } from '../beacons/settings';
import type { BeaconReason } from '../beacons/types';
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

/** What to drop: the reason, and where and when. */
export type Drop = { reason: BeaconReason; position: LatLon; accuracyM: number; timestamp: number };

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
  let state: EngineState = { ...previous, lastFix: fix };
  const here = { lat: fix.lat, lon: fix.lon };
  const dropHere = (reason: BeaconReason): Drop => ({
    reason,
    position: here,
    accuracyM: fix.accuracyM,
    timestamp: fix.timestamp,
  });

  if (!state.lastBeacon) {
    return dropped({ ...state, anchor: fix }, dropHere('start'));
  }
  const lastBeaconAt = state.lastBeacon.timestamp;

  // Walking: only count movement bigger than the GPS wobble.
  if (!state.anchor) {
    state.anchor = fix;
  } else {
    const moved = distanceMeters(state.anchor, fix);
    if (moved >= Math.max(MIN_STEP_M, state.anchor.accuracyM + fix.accuracyM)) {
      state = {
        ...state,
        distanceSinceBeaconM: state.distanceSinceBeaconM + moved,
        course: initialBearing(state.anchor, fix),
        anchor: fix,
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
    else if (state.turnStartedAt === null) state.turnStartedAt = fix.timestamp;
  }

  // Whichever rule is met first. If two are met on the same fix, the
  // order below decides which reason is recorded.
  if (state.distanceSinceBeaconM >= settings.beaconDistanceM) return dropped(state, dropHere('distance'));
  if (state.turnStartedAt !== null && fix.timestamp - state.turnStartedAt >= settings.turnSustainSeconds * 1000) {
    return dropped(state, dropHere('turn'));
  }
  if (fix.timestamp - lastBeaconAt >= settings.beaconIntervalMinutes * 60_000) {
    return dropped(state, dropHere('time'));
  }
  return { state, drop: null };
}

/**
 * Check the time rule when no new fix has arrived (called every few seconds).
 * The beacon goes at the last GPS position, but only if that position is
 * recent: a position from 20 minutes ago isn't where the hiker is now.
 * (When GPS is lost, step 4's dead reckoning provides an estimated position instead.)
 */
export function onTick(state: EngineState, now: number, settings: Settings): Step {
  const { lastBeacon, lastFix } = state;
  if (!lastBeacon || !lastFix) return { state, drop: null };
  const fixIsFresh = now - lastFix.timestamp <= settings.gpsLostAfterSeconds * 1000;
  if (fixIsFresh && now - lastBeacon.timestamp >= settings.beaconIntervalMinutes * 60_000) {
    return dropped(state, {
      reason: 'time',
      position: { lat: lastFix.lat, lon: lastFix.lon },
      accuracyM: lastFix.accuracyM,
      timestamp: now,
    });
  }
  return { state, drop: null };
}
