// Helpers for compass angles in degrees, where 0 = north and 90 = east.

export const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
export const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** Wrap any angle into 0 ≤ angle < 360. For example -10 → 350, 370 → 10. */
export function normalizeDegrees(degrees: number): number {
  const wrapped = degrees % 360;
  const positive = wrapped < 0 ? wrapped + 360 : wrapped;
  // A tiny negative number like -1e-15 plus 360 rounds to exactly 360, which
  // would break the "less than 360" promise, so call that 0.
  return positive >= 360 ? 0 : positive;
}

/**
 * The smallest turn from `from` to `to`, between -180 and +180.
 * Positive means turn right (clockwise). For example 350 → 10 is +20, not +340.
 */
export function angleDifference(from: number, to: number): number {
  const diff = normalizeDegrees(to - from);
  return diff > 180 ? diff - 360 : diff;
}

/**
 * The average direction of several angles. A plain average gets this wrong:
 * the average of 350 and 10 is 180 that way, but the real average is 0.
 * So each angle becomes an arrow of length 1, the arrows are added up, and
 * the direction of the total is the answer.
 *
 * Returns null if there are no angles, or if they cancel out (like 0 and 180).
 */
export function circularMean(degrees: readonly number[]): number | null {
  let x = 0;
  let y = 0;
  for (const d of degrees) {
    x += Math.cos(toRadians(d));
    y += Math.sin(toRadians(d));
  }
  if (Math.hypot(x, y) < 1e-9) return null;
  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

/**
 * How closely several angles agree, from 0 (all over the place) to 1 (all the
 * same). It's the length of the averaged arrows from circularMean. Walking a
 * straight line gives about 0.95 or more; a zig-zag or a U-turn much less.
 */
export function meanResultantLength(degrees: readonly number[]): number {
  if (degrees.length === 0) return 0;
  let x = 0;
  let y = 0;
  for (const d of degrees) {
    x += Math.cos(toRadians(d));
    y += Math.sin(toRadians(d));
  }
  return Math.hypot(x, y) / degrees.length;
}
