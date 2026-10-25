// Where the hiker is: from GPS when it works, estimated from steps and the
// compass (dead reckoning) when it doesn't. Pure logic with no browser code,
// so the live hike (HikeProvider.tsx) and replays of recorded walks
// (recording.ts) run exactly the same code, and the tests can feed it made-up
// walks (tests/tracking/position.test.ts).
//
//   GPS fixes ─┐
//   steps ─────┼─▶ this file ──▶ position (GPS or estimated) + beacons to drop
//   compass ───┘        └──────▶ the beacon rules (engine.ts)
//
// - Dead reckoning always runs: each good GPS fix restarts the estimate from
//   that fix, and each step moves it forward. So when GPS drops, the estimate
//   already includes the steps walked since the last fix.
// - While GPS works, it learns the hiker's step length and how the phone is
//   held (the difference between where it points and where the hiker walks).
// - When GPS comes back, it measures how far off the estimate was.

import type { Settings } from '../beacons/settings';
import { meanResultantLength, circularMean } from '../geo/angles';
import {
  type DeadReckoningState,
  DEFAULT_STEP_LENGTH_M,
  advance,
  calibrateHeadingOffset,
  calibrateStepLength,
  startFrom,
  walkingHeading,
} from '../geo/deadReckoning';
import { declination, isModelValid, magneticToTrue } from '../geo/declination';
import { distanceMeters, initialBearing } from '../geo/distance';
import type { LatLon } from '../geo/types';
import { type Drop, type EngineState, type Fix, MIN_STEP_M, newEngine, onEstimate, onFix, onTick } from './engine';

/** While GPS is lost, the estimate is handed to the beacon rules after every this many metres. */
const FEED_EVERY_M = MIN_STEP_M;
/** Compass readings are kept for learning at most once a second, however often the sensor reports. */
const HEADING_SAMPLE_MS = 1000;
/** A stretch only teaches the phone's offset if the compass agreed with itself this well (1 = perfectly straight). */
const STRAIGHT_ENOUGH = 0.9;
/** And only if it has at least this many compass readings. */
const MIN_HEADING_SAMPLES = 5;
/** The compass is too old to steer by after this long without a reading. */
const HEADING_STALE_MS = 5000;

export type PositionSource = 'gps' | 'estimated';

/** The hiker's position right now. */
export type CurrentPosition = Fix & { source: PositionSource };

export type Calibration = {
  /** Metres per step. */
  stepLengthM: number;
  /** Degrees to add to the (true) compass heading to get the walking direction. */
  headingOffset: number;
  /** How many stretches each value has learned from (0 = still the starting value). */
  stepLengthSamples: number;
  headingSamples: number;
};

/** Something worth showing the hiker or the debug screen. */
export type PositionEvent =
  | { kind: 'gps-lost'; at: number }
  /** GPS returned: how far the estimate was from the real fix, and how far off it claimed it might be. */
  | { kind: 'gps-back'; at: number; errorM: number; estimatedAccuracyM: number };

export type PositionState = {
  engine: EngineState;
  /** null until the first good GPS fix: there's nothing to estimate from before that. */
  deadReckoning: DeadReckoningState | null;
  calibration: Calibration;
  gpsLost: boolean;
  lastFix: Fix | null;
  /** The newest compass reading (magnetic) and when it came. */
  heading: { magnetic: number; at: number } | null;
  /** Magnetic declination where the last fix was. */
  declination: number;
  /** What's been measured since the last fix, for learning. Null while GPS is lost. */
  stretch: { from: Fix; steps: number; headings: number[]; lastHeadingAt: number } | null;
  metresSinceFeed: number;
  /** When the estimate last moved. */
  estimatedAt: number;
  totalSteps: number;
};

export type PositionStep = { state: PositionState; drops: Drop[]; events: PositionEvent[] };

export function newPosition(stepLengthM = DEFAULT_STEP_LENGTH_M, engine: EngineState = newEngine()): PositionState {
  return {
    engine,
    deadReckoning: null,
    calibration: { stepLengthM, headingOffset: 0, stepLengthSamples: 0, headingSamples: 0 },
    gpsLost: false,
    lastFix: null,
    heading: null,
    declination: 0,
    stretch: null,
    metresSinceFeed: 0,
    estimatedAt: 0,
    totalSteps: 0,
  };
}

/** The best position right now: the estimate while GPS is lost, otherwise the last GPS fix. */
export function currentPosition(state: PositionState): CurrentPosition | null {
  if (state.gpsLost && state.deadReckoning) {
    const { position, accuracyM } = state.deadReckoning;
    return { ...position, accuracyM, timestamp: state.estimatedAt, source: 'estimated' };
  }
  return state.lastFix ? { ...state.lastFix, source: 'gps' } : null;
}

/** A good GPS fix (accuracy within POOR_ACCURACY_M; the GPS tracker only passes those on). */
export function positionFix(previous: PositionState, fix: Fix, settings: Settings): PositionStep {
  const events: PositionEvent[] = [];
  let state = { ...previous };

  if (state.gpsLost && state.deadReckoning) {
    events.push({
      kind: 'gps-back',
      at: fix.timestamp,
      errorM: distanceMeters(state.deadReckoning.position, fix),
      estimatedAccuracyM: state.deadReckoning.accuracyM,
    });
  }
  if (isModelValid(new Date(fix.timestamp))) state.declination = declination(fix.lat, fix.lon, new Date(fix.timestamp));
  if (state.stretch && !state.gpsLost) state.calibration = learn(state, state.stretch, fix);

  state = {
    ...state,
    gpsLost: false,
    lastFix: fix,
    deadReckoning: startFrom({ lat: fix.lat, lon: fix.lon }, fix.accuracyM),
    estimatedAt: fix.timestamp,
    stretch: { from: fix, steps: 0, headings: [], lastHeadingAt: -Infinity },
    metresSinceFeed: 0,
  };
  const step = onFix(state.engine, fix, settings);
  state.engine = step.state;
  return { state, drops: step.drop ? [step.drop] : [], events };
}

/** Learn step length and phone offset from the stretch walked since the previous fix. */
function learn(state: PositionState, stretch: NonNullable<PositionState['stretch']>, fix: Fix): Calibration {
  const calibration = { ...state.calibration };
  const gpsDistance = distanceMeters(stretch.from, fix);
  // Only movement clearly bigger than the GPS wobble teaches anything.
  if (gpsDistance < Math.max(MIN_STEP_M, stretch.from.accuracyM + fix.accuracyM)) return calibration;

  const stepLength = calibrateStepLength(calibration.stepLengthM, gpsDistance, stretch.steps);
  if (stepLength !== calibration.stepLengthM) {
    calibration.stepLengthM = stepLength;
    calibration.stepLengthSamples++;
  }

  const mean = circularMean(stretch.headings);
  if (
    mean !== null &&
    stretch.steps >= 20 &&
    stretch.headings.length >= MIN_HEADING_SAMPLES &&
    meanResultantLength(stretch.headings) >= STRAIGHT_ENOUGH
  ) {
    calibration.headingOffset = calibrateHeadingOffset(
      calibration.headingOffset,
      magneticToTrue(mean, state.declination),
      initialBearing(stretch.from, fix),
    );
    calibration.headingSamples++;
  }
  return calibration;
}

/** GPS counts as lost (or the debug screen is pretending it is). */
export function positionGpsLost(previous: PositionState, at: number): PositionStep {
  if (previous.gpsLost) return { state: previous, drops: [], events: [] };
  return {
    state: { ...previous, gpsLost: true, stretch: null, metresSinceFeed: 0 },
    drops: [],
    events: [{ kind: 'gps-lost', at }],
  };
}

/** A compass reading, in degrees from MAGNETIC north (what the phone measures). */
export function positionHeading(previous: PositionState, magnetic: number, at: number): PositionState {
  const state = { ...previous, heading: { magnetic, at } };
  const { stretch } = state;
  if (stretch && at - stretch.lastHeadingAt >= HEADING_SAMPLE_MS) {
    state.stretch = { ...stretch, headings: [...stretch.headings, magnetic], lastHeadingAt: at };
  }
  return state;
}

/** One or more steps were detected. */
export function positionSteps(previous: PositionState, count: number, at: number, settings: Settings): PositionStep {
  let state: PositionState = { ...previous, totalSteps: previous.totalSteps + count };
  if (state.stretch) state.stretch = { ...state.stretch, steps: state.stretch.steps + count };
  const dr = state.deadReckoning;
  if (!dr || count <= 0) return { state, drops: [], events: [] };

  const errorGrowth = settings.deadReckoningErrorPercent / 100;
  const { stepLengthM, headingOffset } = state.calibration;
  const heading =
    state.heading && at - state.heading.at <= HEADING_STALE_MS
      ? walkingHeading(state.heading.magnetic, headingOffset, state.declination)
      : state.engine.course; // no compass: keep going the way GPS last saw us walk
  if (heading === null) {
    // No direction at all: the position can't move, but it gets less certain.
    const distanceSinceFixM = dr.distanceSinceFixM + count * stepLengthM;
    state.deadReckoning = { ...dr, distanceSinceFixM, accuracyM: dr.startAccuracyM + errorGrowth * distanceSinceFixM };
  } else {
    state.deadReckoning = advance(dr, count, stepLengthM, heading, errorGrowth);
  }
  state.estimatedAt = at;
  if (!state.gpsLost) return { state, drops: [], events: [] };

  state.metresSinceFeed += count * stepLengthM;
  if (state.metresSinceFeed < FEED_EVERY_M) return { state, drops: [], events: [] };
  state.metresSinceFeed = 0;
  const step = onEstimate(state.engine, estimateFix(state, at), settings);
  state.engine = step.state;
  return { state, drops: step.drop ? [step.drop] : [], events: [] };
}

/** Called every few seconds: checks the time rule, using the estimate while GPS is lost. */
export function positionTick(previous: PositionState, now: number, settings: Settings): PositionStep {
  const estimate = previous.gpsLost && previous.deadReckoning ? estimateFix(previous, now) : null;
  const step = onTick(previous.engine, now, settings, estimate);
  if (step.state === previous.engine) return { state: previous, drops: [], events: [] };
  return { state: { ...previous, engine: step.state }, drops: step.drop ? [step.drop] : [], events: [] };
}

/** A beacon dropped by hand also starts the automatic rules over. */
export function positionManualDrop(previous: PositionState, drop: Drop): PositionState {
  return {
    ...previous,
    engine: {
      ...previous.engine,
      lastBeacon: { timestamp: drop.timestamp, position: drop.position },
      distanceSinceBeaconM: 0,
      referenceCourse: previous.engine.course,
      turnStartedAt: null,
    },
  };
}

function estimateFix(state: PositionState, at: number): Fix {
  const { position, accuracyM } = state.deadReckoning!;
  return { ...position, accuracyM, timestamp: at };
}

/** Distance in metres from the current position to a point (e.g. the real GPS position while it's hidden). */
export function distanceFromCurrent(state: PositionState, point: LatLon): number | null {
  const here = currentPosition(state);
  return here ? distanceMeters(here, point) : null;
}
