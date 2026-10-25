import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/beacons/settings';
import { distanceMeters, destinationPoint, initialBearing } from '../../src/geo/distance';
import type { Fix } from '../../src/tracking/engine';
import {
  type PositionState,
  type PositionStep,
  currentPosition,
  newPosition,
  positionAtBeacon,
  positionFix,
  positionRestartRules,
  positionGpsLost,
  positionHeading,
  positionSteps,
  positionTick,
} from '../../src/tracking/position';
import { MINUTE, START, T0 } from './walk';

const settings = DEFAULT_SETTINGS;

function fixAt(position: { lat: number; lon: number }, minutes: number, accuracyM = 5): Fix {
  return { ...position, accuracyM, timestamp: T0 + minutes * MINUTE };
}

/** Collects drops and events while applying steps. */
function runner(state: PositionState = newPosition(0.75)) {
  const drops: PositionStep['drops'] = [];
  const events: PositionStep['events'] = [];
  return {
    get state() {
      return state;
    },
    take(step: PositionStep) {
      state = step.state;
      drops.push(...step.drops);
      events.push(...step.events);
    },
    set(next: PositionState) {
      state = next;
    },
    drops,
    events,
  };
}

/** Point the compass so that, with no offset learned, the walking direction is `trueBearing`. */
function compass(state: PositionState, trueBearing: number, at: number): PositionState {
  return positionHeading(state, trueBearing - state.declination, at);
}

describe('before GPS', () => {
  it('has no position and steps do nothing', () => {
    const r = runner();
    r.take(positionSteps(r.state, 50, T0, settings));
    expect(currentPosition(r.state)).toBeNull();
    expect(r.state.totalSteps).toBe(50);
  });
});

describe('while GPS works', () => {
  it('shows the GPS fix, and drops the start beacon', () => {
    const r = runner();
    r.take(positionFix(r.state, fixAt(START, 0), settings));
    expect(currentPosition(r.state)).toMatchObject({ ...START, source: 'gps', accuracyM: 5 });
    expect(r.drops.map((d) => [d.reason, d.source])).toEqual([['start', 'gps']]);
  });

  it('learns the step length and how the phone is held', () => {
    const r = runner();
    let here = START;
    r.take(positionFix(r.state, fixAt(here, 0), settings));
    // Walk east in 1-minute stretches of 100 steps of 0.8 m, phone pointing 30° left of the way we walk.
    for (let minute = 1; minute <= 10; minute++) {
      for (let s = 0; s < 60; s++) {
        const at = T0 + (minute - 1) * MINUTE + s * 1000;
        r.set(compass(r.state, 90 - 30, at));
      }
      r.take(positionSteps(r.state, 100, T0 + minute * MINUTE - 1, settings));
      here = destinationPoint(here, 80, 90);
      r.take(positionFix(r.state, fixAt(here, minute), settings));
    }
    const { stepLengthM, headingOffset, stepLengthSamples, headingSamples } = r.state.calibration;
    expect(stepLengthSamples).toBe(10);
    expect(headingSamples).toBe(10);
    expect(stepLengthM).toBeGreaterThan(0.79); // 0.75 → 0.8, a fifth of the way each minute
    expect(stepLengthM).toBeLessThan(0.8);
    expect(headingOffset).toBeGreaterThan(26); // 0 → 30
    expect(headingOffset).toBeLessThan(30);
  });

  it('does not learn the offset from a zig-zag', () => {
    const r = runner();
    r.take(positionFix(r.state, fixAt(START, 0), settings));
    for (let s = 0; s < 60; s++) r.set(compass(r.state, s % 2 ? 0 : 120, T0 + s * 1000));
    r.take(positionSteps(r.state, 100, T0 + 59_000, settings));
    r.take(positionFix(r.state, fixAt(destinationPoint(START, 80, 60), 1), settings));
    expect(r.state.calibration.headingSamples).toBe(0);
    expect(r.state.calibration.stepLengthSamples).toBe(1);
  });
});

describe('when GPS is lost', () => {
  function lostAfterFix() {
    const r = runner();
    r.take(positionFix(r.state, fixAt(START, 0), settings));
    r.set(compass(r.state, 90, T0 + 1000));
    r.take(positionGpsLost(r.state, T0 + 2000));
    return r;
  }

  it('estimates the position from steps and the compass, less certain the further it goes', () => {
    const r = lostAfterFix();
    r.take(positionSteps(r.state, 100, T0 + 3000, settings)); // 75 m east
    const here = currentPosition(r.state)!;
    expect(here.source).toBe('estimated');
    expect(distanceMeters(START, here)).toBeCloseTo(75, 3);
    expect(initialBearing(START, here)).toBeCloseTo(90, 3);
    expect(here.accuracyM).toBeCloseTo(5 + 7.5, 6);
    expect(r.events.map((e) => e.kind)).toEqual(['gps-lost']);
  });

  it('includes the steps walked between the last fix and the loss', () => {
    const r = runner();
    r.take(positionFix(r.state, fixAt(START, 0), settings));
    r.set(compass(r.state, 0, T0 + 29_000));
    r.take(positionSteps(r.state, 40, T0 + 30_000, settings)); // 30 m north while GPS still "works"
    expect(currentPosition(r.state)).toMatchObject({ ...START, source: 'gps' });
    r.take(positionGpsLost(r.state, T0 + 90_000));
    expect(distanceMeters(START, currentPosition(r.state)!)).toBeCloseTo(30, 3);
  });

  it('drops estimated beacons by the distance rule', () => {
    const r = lostAfterFix();
    for (let i = 1; i <= 45; i++) {
      const at = T0 + 2000 + i * 6000;
      r.set(compass(r.state, 90, at - 500));
      r.take(positionSteps(r.state, 10, at, settings)); // 337 m in all
    }
    const estimated = r.drops.filter((d) => d.source === 'estimated');
    expect(estimated.map((d) => d.reason)).toEqual(['distance']);
    expect(distanceMeters(START, estimated[0].position)).toBeGreaterThan(299.9);
    expect(estimated[0].accuracyM).toBeGreaterThan(30);
  });

  it('drops the time beacon at the estimate', () => {
    const r = lostAfterFix();
    r.set(compass(r.state, 90, T0 + 59_000));
    r.take(positionSteps(r.state, 100, T0 + 60_000, settings));
    r.take(positionTick(r.state, T0 + 15 * MINUTE, settings));
    const [drop] = r.drops.filter((d) => d.reason === 'time');
    expect(drop.source).toBe('estimated');
    expect(distanceMeters(START, drop.position)).toBeCloseTo(75, 3);
  });

  it('keeps going the way GPS last saw us walk when there is no compass', () => {
    const r = runner();
    r.take(positionFix(r.state, fixAt(START, 0), settings));
    r.take(positionFix(r.state, fixAt(destinationPoint(START, 60, 180), 1), settings)); // walked south
    r.take(positionGpsLost(r.state, T0 + 2 * MINUTE));
    r.take(positionSteps(r.state, 40, T0 + 3 * MINUTE, settings));
    const here = currentPosition(r.state)!;
    expect(distanceMeters(START, here)).toBeCloseTo(90, 0);
  });

  it('reports how far off the estimate was when GPS comes back, then uses GPS again', () => {
    const r = lostAfterFix();
    r.set(compass(r.state, 90, T0 + 59_000));
    r.take(positionSteps(r.state, 100, T0 + 60_000, settings)); // estimate: 75 m east
    const real = destinationPoint(START, 80, 100); // really: 80 m, a bit south of east
    r.take(positionFix(r.state, fixAt(real, 2), settings));
    const back = r.events.find((e) => e.kind === 'gps-back');
    expect(back).toMatchObject({ kind: 'gps-back', estimatedAccuracyM: 12.5 });
    expect(back && back.kind === 'gps-back' && back.errorM).toBeGreaterThan(10);
    expect(currentPosition(r.state)).toMatchObject({ ...real, source: 'gps' });
  });
});

describe('after Retrace stops', () => {
  /** A saved start beacon, then 20 minutes later a time beacon the app didn't save (it was retracing). */
  function afterUnsavedDrop() {
    const r = runner();
    r.take(positionFix(r.state, fixAt(START, 0), settings));
    r.take(positionFix(r.state, fixAt(START, 20), settings));
    expect(r.drops.map((d) => d.reason)).toEqual(['start', 'time']);
    return r;
  }

  it('counts from the last saved beacon, so an overdue time beacon drops at the next check', () => {
    const r = afterUnsavedDrop();
    r.set(positionRestartRules(r.state, { timestamp: T0, ...START }));
    expect(r.state.engine.distanceSinceBeaconM).toBe(0);
    r.take(positionTick(r.state, T0 + 20.5 * MINUTE, settings));
    expect(r.drops.map((d) => d.reason)).toEqual(['start', 'time', 'time']);
  });

  it('would otherwise wait for a beacon that was never saved', () => {
    const r = afterUnsavedDrop();
    r.take(positionTick(r.state, T0 + 20.5 * MINUTE, settings));
    expect(r.drops).toHaveLength(2);
  });
});

describe('at a beacon (Retrace)', () => {
  /** GPS lost, then 100 steps east: the estimate is 75 m east of START, ±12.5 m. */
  function drifted() {
    const r = runner();
    r.take(positionFix(r.state, fixAt(START, 0), settings));
    r.set(compass(r.state, 90, T0 + 1000));
    r.take(positionGpsLost(r.state, T0 + 2000));
    r.take(positionSteps(r.state, 100, T0 + 3000, settings));
    return r;
  }

  it('restarts the estimate from the beacon while GPS is lost', () => {
    const r = drifted();
    r.set(positionAtBeacon(r.state, START, 5, T0 + 4000));
    expect(currentPosition(r.state)).toMatchObject({ ...START, accuracyM: 5, source: 'estimated' });
    // The jump isn't counted as walking by the beacon rules.
    expect(r.state.engine.anchor).toMatchObject({ ...START });
    r.take(positionSteps(r.state, 40, T0 + 5000, settings)); // 30 m on from the beacon
    expect(distanceMeters(START, currentPosition(r.state)!)).toBeCloseTo(30, 3);
  });

  it('keeps the estimate if the beacon is less certain than it', () => {
    const r = drifted();
    const before = r.state;
    expect(positionAtBeacon(before, START, 30, T0 + 4000)).toBe(before);
  });

  it('changes nothing while GPS works', () => {
    const r = runner();
    r.take(positionFix(r.state, fixAt(START, 0), settings));
    const before = r.state;
    expect(positionAtBeacon(before, destinationPoint(START, 50, 0), 5, T0 + 1000)).toBe(before);
  });
});
