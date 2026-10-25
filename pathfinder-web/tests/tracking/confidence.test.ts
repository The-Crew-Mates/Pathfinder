import { describe, expect, it } from 'vitest';

import { confidenceGrade, confidenceScore } from '../../src/tracking/confidence';

describe('confidence', () => {
  it('scores 100 at ±5 m or better and 0 at ±100 m or worse', () => {
    expect(confidenceScore(3)).toBe(100);
    expect(confidenceScore(5)).toBe(100);
    expect(confidenceScore(52.5)).toBe(50);
    expect(confidenceScore(100)).toBe(0);
    expect(confidenceScore(400)).toBe(0);
  });

  it('gives grades', () => {
    expect(confidenceGrade(95).letter).toBe('A');
    expect(confidenceGrade(80).letter).toBe('B');
    expect(confidenceGrade(50).letter).toBe('C');
    expect(confidenceGrade(30).letter).toBe('D');
    expect(confidenceGrade(0).letter).toBe('E');
  });
});
