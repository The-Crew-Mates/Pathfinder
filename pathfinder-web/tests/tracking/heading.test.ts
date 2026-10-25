import { describe, expect, it } from 'vitest';

import { headingFromOrientation } from '../../src/tracking/heading';

describe('headingFromOrientation', () => {
  it('lying flat, the heading is 360 minus alpha', () => {
    expect(headingFromOrientation(0, 0, 0)).toBeCloseTo(0, 6);
    expect(headingFromOrientation(90, 0, 0)).toBeCloseTo(270, 6); // turned left: pointing west
    expect(headingFromOrientation(270, 0, 0)).toBeCloseTo(90, 6);
  });

  it('tilting the phone towards you does not change the heading', () => {
    for (const beta of [20, 45, 70, 90]) {
      expect(headingFromOrientation(300, beta, 0)).toBeCloseTo(60, 6);
    }
  });

  it('a slight sideways tilt changes it only a little', () => {
    const heading = headingFromOrientation(300, 40, 10)!;
    expect(Math.abs(heading - 60)).toBeLessThan(10);
  });

  it('adds the screen rotation when the phone is held sideways', () => {
    expect(headingFromOrientation(0, 0, 0, 90)).toBeCloseTo(90, 6);
  });

  it('returns null when there is no forward direction', () => {
    // Tilted back so "forward" (top edge and back, half each) points straight down.
    expect(headingFromOrientation(0, -45, 0)).toBeNull();
  });
});
