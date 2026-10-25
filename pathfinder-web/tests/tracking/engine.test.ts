import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, type Settings } from '../../src/beacons/settings';
import { destinationPoint } from '../../src/geo/distance';
import type { LatLon } from '../../src/geo/types';
import { type EngineState, type Fix, newEngine, onEstimate, onFix, onTick, resumeEngine } from '../../src/tracking/engine';

const START: LatLon = { lat: 60.30954, lon: 24.52085 }; // Haukkalampi, Nuuksio
const T0 = Date.UTC(2026, 9, 25, 9, 0);
const MINUTE = 60_000;

function fix(position: LatLon, minutes: number, accuracyM = 8): Fix {
  return { ...position, accuracyM, timestamp: T0 + minutes * MINUTE };
}

/** Feed fixes through the engine and collect the beacons it drops, with the minute each was dropped. */
function run(fixes: Fix[], settings: Settings = DEFAULT_SETTINGS, state: EngineState = newEngine()) {
  const drops: { reason: string; minute: number }[] = [];
  for (const f of fixes) {
    const step = onFix(state, f, settings);
    state = step.state;
    if (step.drop) drops.push({ reason: step.drop.reason, minute: (step.drop.timestamp - T0) / MINUTE });
  }
  return { drops, state };
}

/** A walk in one direction: one fix per minute, `metresPerMinute` apart. */
function straightWalk(from: LatLon, bearing: number, metresPerMinute: number, minutes: number, startMinute = 0): Fix[] {
  return Array.from({ length: minutes + 1 }, (_, i) =>
    fix(destinationPoint(from, i * metresPerMinute, bearing), startMinute + i),
  );
}

describe('start beacon', () => {
  it('drops a start beacon on the first good fix', () => {
    expect(run([fix(START, 0)]).drops).toEqual([{ reason: 'start', minute: 0 }]);
  });

  it('ignores fixes that are too rough, and waits for a good one', () => {
    expect(run([fix(START, 0, 120), fix(START, 1, 9)]).drops).toEqual([{ reason: 'start', minute: 1 }]);
  });
});

describe('distance rule', () => {
  it('drops a beacon after 300 m, not before', () => {
    // 80 m per minute: 240 m after 3 minutes (no beacon yet), 320 m after 4.
    const { drops } = run(straightWalk(START, 0, 80, 4));
    expect(drops).toEqual([
      { reason: 'start', minute: 0 },
      { reason: 'distance', minute: 4 },
    ]);
  });

  it('uses the distance from the settings', () => {
    const { drops } = run(straightWalk(START, 0, 80, 4), { ...DEFAULT_SETTINGS, beaconDistanceM: 100 });
    expect(drops.map((d) => d.reason)).toEqual(['start', 'distance', 'distance']);
  });

  it('does not count GPS wobble while standing still, or mistake it for turns', () => {
    // 12 minutes at a viewpoint, the position wobbling 6 m in random directions
    // (so two fixes can be 12 m apart). This once dropped five fake "turn" beacons.
    const wobble = Array.from({ length: 13 }, (_, i) =>
      fix(destinationPoint(START, 6, (i * 137) % 360), i),
    );
    const { drops, state } = run(wobble);
    expect(drops).toEqual([{ reason: 'start', minute: 0 }]);
    expect(state.distanceSinceBeaconM).toBe(0);
  });
});

describe('time rule', () => {
  it('drops a beacon after 15 minutes even when standing still', () => {
    const still = Array.from({ length: 17 }, (_, i) => fix(START, i));
    expect(run(still).drops).toEqual([
      { reason: 'start', minute: 0 },
      { reason: 'time', minute: 15 },
    ]);
  });
});

describe('turn rule', () => {
  // Walk north for 3 minutes, slow enough that the distance rule stays out of the way.
  const north = straightWalk(START, 0, 50, 3);
  const corner = north.at(-1)!;

  it('drops a beacon when the direction changes by more than 45° and stays changed for 60 s', () => {
    const east = straightWalk(corner, 90, 50, 2, 3).slice(1); // minutes 4 and 5
    const { drops } = run([...north, ...east]);
    // The turn is first seen at minute 4 and has lasted 60 s at minute 5.
    expect(drops).toEqual([
      { reason: 'start', minute: 0 },
      { reason: 'turn', minute: 5 },
    ]);
  });

  it('ignores a brief wiggle that turns back straight away', () => {
    const sidestep = fix(destinationPoint(corner, 30, 90), 4); // one minute heading east...
    const backOnCourse = straightWalk(sidestep, 0, 50, 2, 4).slice(1); // ...then north again
    const { drops } = run([...north, sidestep, ...backOnCourse]);
    expect(drops.map((d) => d.reason)).toEqual(['start']);
  });

  it('ignores a gentle bend under 45°', () => {
    const bend = straightWalk(corner, 30, 50, 3, 3).slice(1);
    expect(run([...north, ...bend]).drops.map((d) => d.reason)).toEqual(['start']);
  });
});

describe('whichever comes first', () => {
  it('starts all rules over after any beacon', () => {
    // Walk 320 m in 4 minutes (distance beacon), then stand still: the time
    // beacon comes 15 minutes after the DISTANCE beacon, not after the start.
    const walk = straightWalk(START, 0, 80, 4);
    const end = walk.at(-1)!;
    const still = Array.from({ length: 16 }, (_, i) => fix(end, 5 + i)); // minutes 5..20
    expect(run([...walk, ...still]).drops).toEqual([
      { reason: 'start', minute: 0 },
      { reason: 'distance', minute: 4 },
      { reason: 'time', minute: 19 },
    ]);
  });
});

describe('onTick (no new fix)', () => {
  it('drops a time beacon at the last position when it is recent', () => {
    const { state } = run([fix(START, 14.5)]);
    // The start beacon was at minute 14.5; tick 15 minutes later, with the fix 45 s old.
    const later = { ...state, lastFix: fix(START, 29) };
    const step = onTick(later, T0 + 29.75 * MINUTE, DEFAULT_SETTINGS);
    expect(step.drop).toMatchObject({ reason: 'time', position: START, timestamp: T0 + 29.75 * MINUTE });
  });

  it('does not drop a beacon at a position that is too old', () => {
    const { state } = run([fix(START, 0)]);
    // 15 minutes later, but the last fix is 15 minutes old: GPS is gone.
    expect(onTick(state, T0 + 15 * MINUTE, DEFAULT_SETTINGS).drop).toBeNull();
  });

  it('does nothing before the hike has started', () => {
    expect(onTick(newEngine(), T0, DEFAULT_SETTINGS).drop).toBeNull();
  });
});

describe('resuming a hike', () => {
  it('counts the time from the last saved beacon and does not drop another start beacon', () => {
    const resumed = resumeEngine({ timestamp: T0, ...START });
    const fixes = Array.from({ length: 3 }, (_, i) => fix(START, 14 + i)); // minutes 14, 15, 16
    expect(run(fixes, DEFAULT_SETTINGS, resumed).drops).toEqual([{ reason: 'time', minute: 15 }]);
  });
});

describe('estimated positions (GPS lost)', () => {
  /** Start with one GPS fix, then feed estimates every 10 m along `bearing`. */
  function estimatedWalk(bearing: number, metres: number, accuracyM = 60) {
    let state = onFix(newEngine(), fix(START, 0), DEFAULT_SETTINGS).state;
    const drops = [];
    for (let m = 10; m <= metres; m += 10) {
      const estimate = fix(destinationPoint(START, m, bearing), m / 80, accuracyM);
      const step = onEstimate(state, estimate, DEFAULT_SETTINGS);
      state = step.state;
      if (step.drop) drops.push(step.drop);
    }
    return { drops, state };
  }

  it('drops estimated beacons by distance, however big the uncertainty is', () => {
    const { drops } = estimatedWalk(0, 320, 120);
    expect(drops.map((d) => [d.reason, d.source, d.accuracyM])).toEqual([['distance', 'estimated', 120]]);
  });

  it('does nothing before the first GPS fix', () => {
    const step = onEstimate(newEngine(), fix(START, 0, 30), DEFAULT_SETTINGS);
    expect(step.drop).toBeNull();
    expect(step.state.lastBeacon).toBeNull();
  });

  it('onTick drops the time beacon at the estimate, even with no recent GPS fix', () => {
    const { state } = run([fix(START, 0)]);
    const estimate = fix(destinationPoint(START, 200, 90), 14, 40);
    const step = onTick(state, T0 + 15 * MINUTE, DEFAULT_SETTINGS, estimate);
    expect(step.drop).toMatchObject({ reason: 'time', source: 'estimated', accuracyM: 40, timestamp: T0 + 15 * MINUTE });
  });
});

