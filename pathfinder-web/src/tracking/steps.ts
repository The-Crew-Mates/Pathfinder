// Step counting from the motion sensor (accelerometer). Pure logic with no
// browser code, so it's tested with made-up signals (tests/tracking/steps.test.ts).
//
// Each step makes the phone bounce: the total acceleration rises above gravity
// and falls back. So the detector:
//   1. smooths the readings, to remove jitter,
//   2. follows the slowly-changing "resting" level (gravity, about 9.8 m/s²),
//   3. counts a step each time the signal rises clearly above that level and
//      comes back down, at least MIN_STEP_GAP_MS after the previous step.
// A single bump (putting the phone down) isn't walking, so steps only count
// once MIN_STEPS_IN_A_ROW have come in a walking rhythm. Then they all count.

/** How far above the resting level (m/s²) the bounce must go to be a step. */
export const STEP_THRESHOLD = 1.2;
/** Nobody walks faster than 4 steps a second. */
export const MIN_STEP_GAP_MS = 250;
/** A gap longer than this ends a walking rhythm. */
export const MAX_STEP_GAP_MS = 2000;
/** Steps that must come in a row before any of them count. */
export const MIN_STEPS_IN_A_ROW = 4;

const SMOOTHING = 0.3; // how much each new reading moves the smoothed value
const LEVEL_SMOOTHING = 0.01; // the resting level follows much more slowly

export class StepDetector {
  private smoothed: number | null = null;
  private level = 0;
  private inPeak = false;
  private lastStepAt: number | null = null;
  /** Steps in the current rhythm that haven't been counted yet. */
  private pending = 0;
  private walking = false;

  /**
   * Feed one reading: the acceleration including gravity (m/s²) on the phone's
   * three axes, and the time in milliseconds. Returns how many steps to count
   * now (usually 0 or 1; more when a rhythm has just been confirmed).
   */
  push(x: number, y: number, z: number, time: number): number {
    const magnitude = Math.hypot(x, y, z);
    if (!Number.isFinite(magnitude)) return 0;
    if (this.smoothed === null) {
      this.smoothed = magnitude;
      this.level = magnitude;
      return 0;
    }
    this.smoothed += SMOOTHING * (magnitude - this.smoothed);
    this.level += LEVEL_SMOOTHING * (this.smoothed - this.level);
    const signal = this.smoothed - this.level;

    if (!this.inPeak) {
      if (signal > STEP_THRESHOLD) this.inPeak = true;
      return 0;
    }
    // The bounce is over once the signal falls most of the way back.
    if (signal > STEP_THRESHOLD * 0.3) return 0;
    this.inPeak = false;
    return this.onStep(time);
  }

  private onStep(time: number): number {
    const gap = this.lastStepAt === null ? Infinity : time - this.lastStepAt;
    if (gap < MIN_STEP_GAP_MS) return 0; // a double bounce, not a new step
    this.lastStepAt = time;
    if (gap > MAX_STEP_GAP_MS) {
      // A new rhythm starts: it has to prove it's walking first.
      this.walking = false;
      this.pending = 1;
      return 0;
    }
    if (this.walking) return 1;
    this.pending++;
    if (this.pending < MIN_STEPS_IN_A_ROW) return 0;
    this.walking = true;
    const counted = this.pending;
    this.pending = 0;
    return counted;
  }
}
