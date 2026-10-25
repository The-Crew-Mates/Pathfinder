import { describe, expect, it } from 'vitest';

import { formatAccuracy, formatBearing, formatDistance } from '../../src/lib/format';

describe('formatDistance', () => {
  it('shows metres, then kilometres from 1 km', () => {
    expect(formatDistance(80.4)).toBe('80 m');
    expect(formatDistance(999.4)).toBe('999 m');
    expect(formatDistance(999.6)).toBe('1.0 km'); // not "1000 m"
    expect(formatDistance(1449)).toBe('1.4 km');
  });
});

describe('formatBearing', () => {
  it('shows three-digit degrees and the nearest compass point', () => {
    expect(formatBearing(0)).toBe('000° N');
    expect(formatBearing(45)).toBe('045° NE');
    expect(formatBearing(22.4)).toBe('022° N');
    expect(formatBearing(22.6)).toBe('023° NE');
    expect(formatBearing(315)).toBe('315° NW');
  });

  it('wraps angles outside 0..360', () => {
    expect(formatBearing(359.6)).toBe('000° N');
    expect(formatBearing(-90)).toBe('270° W');
    expect(formatBearing(450)).toBe('090° E');
  });
});

describe('formatAccuracy', () => {
  it('shows ± metres, or kilometres when it is very rough', () => {
    expect(formatAccuracy(8.2)).toBe('±8 m');
    expect(formatAccuracy(1200)).toBe('±1.2 km');
  });
});
