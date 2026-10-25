import { describe, expect, it } from 'vitest';

import { StepDetector } from '../../src/tracking/steps';

const G = 9.81;

/** A made-up random number generator, so the "noise" is the same every run. */
function noise(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) * 2 - 1; // -1..1
  };
}

/** Feed `seconds` of readings at 50 per second; `extra(t)` is added to gravity. Returns the steps counted. */
function count(seconds: number, extra: (t: number) => number, noiseSize = 0.3): number {
  const detector = new StepDetector();
  const random = noise();
  let steps = 0;
  for (let i = 0; i < seconds * 50; i++) {
    const t = i * 20; // ms
    steps += detector.push(0.3, 0.2, G + extra(t / 1000) + noiseSize * random(), t);
  }
  return steps;
}

describe('StepDetector', () => {
  it('counts a minute of walking at 1.8 steps a second', () => {
    const steps = count(60, (t) => 2.5 * Math.sin(2 * Math.PI * 1.8 * t));
    expect(steps).toBeGreaterThanOrEqual(106);
    expect(steps).toBeLessThanOrEqual(109);
  });

  it('counts brisk walking too (2.2 steps a second, bigger bounce)', () => {
    const steps = count(30, (t) => 4 * Math.sin(2 * Math.PI * 2.2 * t));
    expect(Math.abs(steps - 66)).toBeLessThanOrEqual(2);
  });

  it('counts nothing while standing still', () => {
    expect(count(60, () => 0, 0.4)).toBe(0);
  });

  it('does not count a few bumps, like putting the phone down', () => {
    // Three bumps, 5 seconds apart: no walking rhythm.
    const bump = (t: number) => (t % 5 < 0.2 && t > 1 ? 4 : 0);
    expect(count(16, bump)).toBe(0);
  });
});
