import {
  DEFAULT_STEP_LENGTH_M,
  MAX_STEP_LENGTH_M,
  advance,
  calibrateHeadingOffset,
  calibrateStepLength,
  startFrom,
  walkingHeading,
} from '../src/geo/deadReckoning';
import { distanceMeters, initialBearing } from '../src/geo/distance';

const START = { lat: 60.30954, lon: 24.52085 }; // Haukkalampi, Nuuksio

describe('advance', () => {
  it('100 steps of 0.75 m heading east moves 75 m east', () => {
    const state = advance(startFrom(START, 5), 100, 0.75, 90, 0.1);
    expect(distanceMeters(START, state.position)).toBeCloseTo(75, 6);
    expect(initialBearing(START, state.position)).toBeCloseTo(90, 6);
    expect(state.distanceSinceFixM).toBeCloseTo(75, 9);
  });

  it('grows the uncertainty with distance walked: start accuracy + 10% of the distance', () => {
    let state = startFrom(START, 5);
    state = advance(state, 100, 0.75, 90, 0.1); // 75 m
    expect(state.accuracyM).toBeCloseTo(5 + 7.5, 9);
    state = advance(state, 100, 0.75, 0, 0.1); // 150 m in total
    expect(state.accuracyM).toBeCloseTo(5 + 15, 9);
  });

  it('does nothing with zero (or negative) steps', () => {
    const start = startFrom(START, 5);
    expect(advance(start, 0, 0.75, 90, 0.1)).toBe(start);
    expect(advance(start, -3, 0.75, 90, 0.1)).toBe(start);
  });

  it('walking a square comes back to the start', () => {
    let state = startFrom(START, 5);
    for (const heading of [0, 90, 180, 270]) state = advance(state, 400, 0.75, heading, 0.1);
    expect(distanceMeters(START, state.position)).toBeLessThan(0.5);
    expect(state.accuracyM).toBeCloseTo(5 + 0.1 * 1200, 9);
  });
});

describe('calibrateStepLength', () => {
  it('moves part of the way towards the measured step length', () => {
    // 100 m in 125 steps = 0.8 m per step; 20% of the way from 0.75 is 0.76.
    expect(calibrateStepLength(DEFAULT_STEP_LENGTH_M, 100, 125)).toBeCloseTo(0.76, 9);
  });

  it('ignores stretches too short to trust', () => {
    expect(calibrateStepLength(0.75, 10, 100)).toBe(0.75); // under 15 m
    expect(calibrateStepLength(0.75, 100, 10)).toBe(0.75); // under 20 steps
  });

  it('ignores GPS jumps and stays within sensible limits', () => {
    expect(calibrateStepLength(0.75, 500, 100)).toBe(0.75); // 5 m per step: a GPS jump
    expect(calibrateStepLength(1.09, 200, 100, 1)).toBe(MAX_STEP_LENGTH_M); // 2 m per step, capped
  });
});

describe('heading offset (phone in a pocket)', () => {
  it('learns the difference between the compass and the GPS walking direction', () => {
    // The phone points 30° left of where the hiker walks.
    let offset = 0;
    for (let i = 0; i < 40; i++) offset = calibrateHeadingOffset(offset, 60, 90);
    expect(offset).toBeCloseTo(30, 2);
  });

  it('blends the short way round across ±180°', () => {
    const offset = calibrateHeadingOffset(170, 0, -170 + 360, 0.5); // current 170, measured -170
    expect(Math.abs(offset)).toBeGreaterThan(175); // ends near 180, not near 0
  });

  it('turns compass + offset + declination into the true walking direction', () => {
    // Compass says 50° magnetic, declination 10° east → 60° true, plus offset 30° → walking 90°.
    expect(walkingHeading(50, 30, 10)).toBe(90);
    expect(walkingHeading(355, 0, 10)).toBe(5);
  });
});
