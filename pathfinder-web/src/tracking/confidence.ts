// The Confidence screen's score: how sure the app is of your position, as a
// number from 0 to 100 and a grade, worked out from the ± accuracy in metres.

/** At or below this many metres off, the score is 100. */
export const PERFECT_ACCURACY_M = 5;
/** At or above this many metres off, the score is 0. */
export const USELESS_ACCURACY_M = 100;

/** 100 at ±5 m or better, 0 at ±100 m or worse, in a straight line between. */
export function confidenceScore(accuracyM: number): number {
  const fraction = (USELESS_ACCURACY_M - accuracyM) / (USELESS_ACCURACY_M - PERFECT_ACCURACY_M);
  return Math.round(100 * Math.min(1, Math.max(0, fraction)));
}

export type Grade = { letter: 'A' | 'B' | 'C' | 'D' | 'E'; text: string };

export function confidenceGrade(score: number): Grade {
  if (score >= 90) return { letter: 'A', text: 'Precise' };
  if (score >= 75) return { letter: 'B', text: 'Good' };
  if (score >= 50) return { letter: 'C', text: 'Fair' };
  if (score >= 25) return { letter: 'D', text: 'Rough' };
  return { letter: 'E', text: 'Very rough' };
}
