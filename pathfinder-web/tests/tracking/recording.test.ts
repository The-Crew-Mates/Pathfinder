import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/beacons/settings';
import { distanceMeters } from '../../src/geo/distance';
import { replay } from '../../src/tracking/recording';
import { MINUTE, T0, makeWalk } from './walk';

const settings = DEFAULT_SETTINGS;

describe('replay', () => {
  // 20 minutes: 10 north-east, then a turn and 10 south-east. Phone in a pocket, 30° off.
  const walk = makeWalk({ legs: [[10, 45], [10, 135]], phoneOffset: 30 });

  it('with GPS as recorded: learns the walker, drops only GPS beacons', () => {
    const report = replay(walk.readings, { settings, stepLengthM: 0.75, hideGps: null });
    expect(report.steps).toBeCloseTo(20 * 60 * 1.8, 0);
    expect(report.drops.every((d) => d.source === 'gps')).toBe(true);
    expect(report.drops.length).toBeGreaterThan(3);
    expect(report.returns).toEqual([]);
    expect(report.worstErrorM).toBeNull();
    expect(report.calibration.stepLengthM).toBeGreaterThan(0.79);
    expect(report.calibration.headingOffset).toBeGreaterThan(25);
  });

  it('with GPS hidden for a stretch: estimates, and the estimate stays within its claimed accuracy', () => {
    const hideGps = { from: T0 + 12 * MINUTE, to: T0 + 17 * MINUTE };
    const report = replay(walk.readings, { settings, stepLengthM: 0.75, hideGps });
    expect(report.hiddenFixes).toBe(5);
    const estimated = report.drops.filter((d) => d.source === 'estimated');
    expect(estimated.length).toBeGreaterThan(0);
    for (const drop of estimated) {
      expect(drop.timestamp).toBeGreaterThanOrEqual(hideGps.from);
      expect(drop.timestamp).toBeLessThan(hideGps.to);
      expect(distanceMeters(drop.position, walk.truth(drop.timestamp))).toBeLessThan(drop.accuracyM);
    }
    expect(report.returns).toHaveLength(1);
    const [back] = report.returns;
    expect(back.at).toBe(hideGps.to);
    expect(back.errorM).toBeLessThan(back.estimatedAccuracyM);
    expect(report.worstErrorM).toBeGreaterThan(0);
    expect(report.worstErrorM!).toBeLessThan(back.estimatedAccuracyM);
  });

  it('notices real GPS loss in the recording after "GPS counts as lost after"', () => {
    const lossy = makeWalk({ legs: [[15, 0]], noGps: [5, 10] });
    const report = replay(lossy.readings, { settings, stepLengthM: 0.8, hideGps: null });
    expect(report.hiddenFixes).toBe(0);
    expect(report.returns).toHaveLength(1);
    expect(report.returns[0].at).toBe(T0 + 10 * MINUTE);
    expect(report.returns[0].errorM).toBeLessThan(report.returns[0].estimatedAccuracyM);
    const estimated = report.drops.filter((d) => d.source === 'estimated');
    // Lost 90 s after the minute-4 fix.
    expect(Math.min(...estimated.map((d) => d.timestamp))).toBeGreaterThanOrEqual(T0 + 4 * MINUTE + 90_000);
  });

  it('gives an empty report for an empty recording', () => {
    expect(replay([], { settings, stepLengthM: 0.75, hideGps: null })).toMatchObject({ drops: [], steps: 0 });
  });
});
