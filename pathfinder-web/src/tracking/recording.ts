// Recording and replaying walks.
//
// During every hike the app records the raw readings: each GPS position
// (good or rough), each step, and the compass about once a second. They're
// saved with the hike (store.ts, "sensorLog"). Later, the debug screen can
// replay a recorded walk through exactly the same code as a live hike
// (position.ts), with different settings or with GPS hidden for a stretch,
// to see how far off dead reckoning would have been. A one-hour walk is
// roughly 10,000 readings, a few hundred KB.

import type { Settings } from '../beacons/settings';
import type { Drop, Fix } from './engine';
import { POOR_ACCURACY_M } from './engine';
import {
  type Calibration,
  type PositionState,
  type PositionStep,
  distanceFromCurrent,
  newPosition,
  positionFix,
  positionGpsLost,
  positionHeading,
  positionSteps,
  positionTick,
} from './position';

/** One recorded reading. `t` is the time in milliseconds since 1970. */
export type Reading =
  | { t: number; kind: 'fix'; lat: number; lon: number; accuracyM: number }
  | { t: number; kind: 'steps'; count: number }
  | { t: number; kind: 'heading'; magnetic: number };

/** How often the live hike checks the time rule; replays do the same. */
export const TICK_MS = 5000;

export type ReplayOptions = {
  settings: Settings;
  stepLengthM: number;
  /** Pretend GPS is lost between these times (ms since 1970), or null for no pretending. */
  hideGps: { from: number; to: number } | null;
};

export type ReplayReport = {
  drops: Drop[];
  steps: number;
  startedAt: number;
  endedAt: number;
  calibration: Calibration;
  /** Each time GPS came back: how far off the estimate was, and how far off it said it might be. */
  returns: { at: number; errorM: number; estimatedAccuracyM: number }[];
  /** The biggest distance between the estimate and a hidden real GPS position, or null if none were hidden. */
  worstErrorM: number | null;
  hiddenFixes: number;
};

/** Run a recorded walk through position.ts as if it was happening now. */
export function replay(recorded: readonly Reading[], options: ReplayOptions): ReplayReport {
  const readings = [...recorded].sort((a, b) => a.t - b.t);
  const { settings, hideGps } = options;
  const lostAfterMs = settings.gpsLostAfterSeconds * 1000;
  const report: ReplayReport = {
    drops: [],
    steps: 0,
    startedAt: readings[0]?.t ?? 0,
    endedAt: readings.at(-1)?.t ?? 0,
    calibration: newPosition(options.stepLengthM).calibration,
    returns: [],
    worstErrorM: null,
    hiddenFixes: 0,
  };
  if (readings.length === 0) return report;

  let state: PositionState = newPosition(options.stepLengthM);
  let lastGoodFixAt = report.startedAt;
  let nextTick = report.startedAt + TICK_MS;
  const hidden = (t: number) => hideGps !== null && t >= hideGps.from && t < hideGps.to;
  const take = (step: PositionStep) => {
    state = step.state;
    report.drops.push(...step.drops);
    for (const event of step.events) {
      if (event.kind === 'gps-back') report.returns.push({ at: event.at, errorM: event.errorM, estimatedAccuracyM: event.estimatedAccuracyM });
    }
  };
  // The same checks the live hike makes every few seconds: the time rule,
  // GPS counting as lost after a while without a good fix, and the pretend loss.
  const tickUntil = (t: number) => {
    while (nextTick <= t) {
      if (hidden(nextTick) || nextTick - lastGoodFixAt >= lostAfterMs) take(positionGpsLost(state, nextTick));
      take(positionTick(state, nextTick, settings));
      nextTick += TICK_MS;
    }
  };

  for (const reading of readings) {
    tickUntil(reading.t);
    if (reading.kind === 'steps') {
      report.steps += reading.count;
      take(positionSteps(state, reading.count, reading.t, settings));
    } else if (reading.kind === 'heading') {
      state = positionHeading(state, reading.magnetic, reading.t);
    } else if (reading.accuracyM <= POOR_ACCURACY_M) {
      const fix: Fix = { lat: reading.lat, lon: reading.lon, accuracyM: reading.accuracyM, timestamp: reading.t };
      if (hidden(reading.t)) {
        take(positionGpsLost(state, reading.t));
        report.hiddenFixes++;
        const error = distanceFromCurrent(state, fix);
        if (error !== null) report.worstErrorM = Math.max(report.worstErrorM ?? 0, error);
      } else {
        lastGoodFixAt = reading.t;
        take(positionFix(state, fix, settings));
      }
    }
  }
  report.calibration = state.calibration;
  return report;
}
