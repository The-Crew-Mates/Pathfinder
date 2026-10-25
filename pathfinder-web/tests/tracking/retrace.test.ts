import { describe, expect, it } from 'vitest';

import type { Beacon } from '../../src/beacons/types';
import { destinationPoint } from '../../src/geo/distance';
import type { LatLon } from '../../src/geo/types';
import {
  ARRIVE_MAX_M,
  ARRIVE_MIN_M,
  type RetraceState,
  arrivalRadius,
  confirmAtBeacon,
  newRetrace,
  resumeRetrace,
  retraceGuidance,
  turnInstruction,
  updateRetrace,
} from '../../src/tracking/retrace';
import { MINUTE, START, T0, noise } from './walk';

/** A beacon `metresEast` of START, dropped `index` × 5 minutes into the hike. */
function beacon(index: number, metresEast: number, accuracyM = 5): Beacon {
  const point = destinationPoint(START, metresEast, 90);
  return {
    id: `b${index}`,
    hikeId: 'h1',
    timestamp: T0 + index * 5 * MINUTE,
    ...point,
    source: 'gps',
    accuracyM,
    note: null,
    hasPhoto: false,
    reason: index === 0 ? 'start' : 'distance',
  };
}

// A hike that walked 450 m east, dropping a beacon every 150 m.
const BEACONS = [beacon(0, 0), beacon(1, 150), beacon(2, 300), beacon(3, 450)];

/** A position `north` metres north of the point `east` metres east of START. */
function at(east: number, north = 0, accuracyM = 5): LatLon & { accuracyM: number } {
  return { ...destinationPoint(destinationPoint(START, east, 90), north, 0), accuracyM };
}

describe('starting', () => {
  it('heads for the newest beacon', () => {
    expect(newRetrace(BEACONS)).toEqual({ targetIndex: 3, closestM: null, finished: false });
  });

  it('needs at least one beacon', () => {
    expect(newRetrace([])).toBeNull();
  });

  it('carries on from a saved target after a reload', () => {
    expect(resumeRetrace(1)).toEqual({ targetIndex: 1, closestM: null, finished: false });
  });
});

describe('walking back', () => {
  it('moves from beacon to beacon, newest first, and finishes at the start', () => {
    let state = newRetrace(BEACONS)!;
    const arrived: number[] = [];
    for (const east of [450, 300, 150, 0]) {
      const step = updateRetrace(state, BEACONS, at(east));
      state = step.state;
      if (step.arrived !== null) arrived.push(step.arrived);
    }
    expect(arrived).toEqual([3, 2, 1, 0]);
    expect(state.finished).toBe(true);
  });

  it('follows a realistic walk back with GPS wobble', () => {
    const random = noise(3);
    let state = newRetrace(BEACONS)!;
    const arrived: number[] = [];
    for (let east = 460; east >= -5; east -= 5) {
      const step = updateRetrace(state, BEACONS, at(east + random() * 4, random() * 4, 8));
      state = step.state;
      if (step.arrived !== null) arrived.push(step.arrived);
    }
    expect(arrived).toEqual([3, 2, 1, 0]);
    expect(state.finished).toBe(true);
  });

  it('skips ahead to an older beacon when the hiker takes a shortcut', () => {
    const step = updateRetrace(newRetrace(BEACONS)!, BEACONS, at(150, 5));
    expect(step.arrived).toBe(1);
    expect(step.state).toEqual({ targetIndex: 0, closestM: null, finished: false });
  });

  it('does nothing more once finished', () => {
    const done: RetraceState = { targetIndex: 0, closestM: null, finished: true };
    expect(updateRetrace(done, BEACONS, at(300)).state).toBe(done);
  });

  it('remembers the closest it got, and returns the same state when nothing changed', () => {
    let state = updateRetrace(newRetrace(BEACONS)!, BEACONS, at(450, 100)).state;
    expect(state.closestM).toBeCloseTo(100, 0);
    state = updateRetrace(state, BEACONS, at(450, 60)).state;
    expect(state.closestM).toBeCloseTo(60, 0);
    const again = updateRetrace(state, BEACONS, at(450, 80));
    expect(again.state).toBe(state);
    expect(again.arrived).toBeNull();
  });
});

describe('arrival radius', () => {
  it('is both positions’ ± added, kept within its limits', () => {
    expect(arrivalRadius(beacon(0, 0, 10), at(0, 0, 12))).toBe(22);
    expect(arrivalRadius(beacon(0, 0, 3), at(0, 0, 4))).toBe(ARRIVE_MIN_M);
    expect(arrivalRadius(beacon(0, 0, 30), at(0, 0, 90))).toBe(ARRIVE_MAX_M);
  });

  it('a very rough estimate does not count as arriving', () => {
    const step = updateRetrace(newRetrace(BEACONS)!, BEACONS, at(450, 80, 90));
    expect(step.arrived).toBeNull();
    expect(step.state.targetIndex).toBe(3);
  });
});

describe('the hiker says “I’m at this beacon”', () => {
  it('moves on to the one before it, and finishes at the start', () => {
    expect(confirmAtBeacon(resumeRetrace(3))).toEqual(resumeRetrace(2));
    expect(confirmAtBeacon(resumeRetrace(0)).finished).toBe(true);
  });

  it('changes nothing once finished', () => {
    const done: RetraceState = { targetIndex: 0, closestM: null, finished: true };
    expect(confirmAtBeacon(done)).toBe(done);
  });
});

describe('guidance', () => {
  const state = resumeRetrace(3);

  it('gives the distance and direction to the target, and what is left to the start', () => {
    const g = retraceGuidance(state, BEACONS, at(450, 100), null)!;
    expect(g.target.id).toBe('b3');
    expect(g.distanceM).toBeCloseTo(100, 0);
    expect(g.bearing).toBeCloseTo(180, 0); // the beacon is due south
    expect(g.remainingM).toBeCloseTo(550, 0);
    expect(g.beaconsLeft).toBe(4);
    expect(g.minutesLeft).toBeCloseTo(550 / (4300 / 60), 1);
    expect(g.turn).toBeNull(); // no compass
  });

  it('turns relative to where the phone points, the short way round', () => {
    expect(retraceGuidance(state, BEACONS, at(450, 100), 170)!.turn).toBeCloseTo(10, 0);
    expect(retraceGuidance(state, BEACONS, at(450, 100), 190)!.turn).toBeCloseTo(-10, 0);
    // The beacon is due north; the phone points at 350°: 10° right, not 350° left.
    expect(retraceGuidance(state, BEACONS, at(450, -100), 350)!.turn).toBeCloseTo(10, 0);
  });

  it('is off track once the hiker walks well away from the closest they got', () => {
    const near: RetraceState = { targetIndex: 3, closestM: 60, finished: false };
    expect(retraceGuidance(near, BEACONS, at(450, 80), null)!.offTrack).toBe(false);
    expect(retraceGuidance(near, BEACONS, at(450, 120), null)!.offTrack).toBe(true);
    // A rough position needs a bigger margin before it counts.
    expect(retraceGuidance(near, BEACONS, at(450, 100, 50), null)!.offTrack).toBe(false);
  });

  it('is never off track right after reaching a beacon', () => {
    const next = updateRetrace(resumeRetrace(3), BEACONS, at(450)).state;
    expect(retraceGuidance(next, BEACONS, at(450, 200), null)!.offTrack).toBe(false);
  });

  it('is null once finished, or without beacons', () => {
    expect(retraceGuidance({ targetIndex: 0, closestM: null, finished: true }, BEACONS, at(0), null)).toBeNull();
    expect(retraceGuidance(state, [], at(0), null)).toBeNull();
  });
});

describe('turnInstruction', () => {
  it('puts a turn into words', () => {
    expect(turnInstruction(5)).toBe('Straight ahead');
    expect(turnInstruction(-30)).toBe('Slight left');
    expect(turnInstruction(90)).toBe('Turn right');
    expect(turnInstruction(-170)).toBe('Turn around');
    expect(turnInstruction(180)).toBe('Turn around');
  });
});
