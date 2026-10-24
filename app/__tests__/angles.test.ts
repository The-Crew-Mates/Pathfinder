import { angleDifference, circularMean, normalizeDegrees } from '../src/geo/angles';

describe('normalizeDegrees', () => {
  it('wraps angles into 0..360', () => {
    expect(normalizeDegrees(-10)).toBe(350);
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(720)).toBe(0);
    expect(normalizeDegrees(45)).toBe(45);
  });

  it('never returns 360, even for a tiny negative number', () => {
    expect(normalizeDegrees(-1e-15)).toBe(0);
  });
});

describe('angleDifference', () => {
  it('takes the short way round', () => {
    expect(angleDifference(350, 10)).toBe(20); // not 340
    expect(angleDifference(10, 350)).toBe(-20);
  });

  it('is positive for a right turn and negative for a left turn', () => {
    expect(angleDifference(0, 90)).toBe(90);
    expect(angleDifference(90, 0)).toBe(-90);
  });

  it('calls a U-turn +180', () => {
    expect(angleDifference(0, 180)).toBe(180);
  });
});

describe('circularMean', () => {
  it('averages across north correctly', () => {
    expect(circularMean([350, 10])).toBeCloseTo(0, 9);
  });

  it('averages ordinary angles', () => {
    expect(circularMean([80, 100])).toBeCloseTo(90, 9);
  });

  it('returns null when there is nothing to average', () => {
    expect(circularMean([])).toBeNull();
    expect(circularMean([0, 180])).toBeNull(); // opposite directions cancel out
  });
});
