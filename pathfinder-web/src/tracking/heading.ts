// Which way the phone points, from its orientation sensor. Pure math, tested
// in tests/tracking/heading.test.ts.
//
// The browser gives three angles (alpha, beta, gamma: the phone's rotation
// around its vertical, side-to-side and front-to-back axes). Using alpha
// alone only works when the phone lies flat; tilt it towards you, as you do
// when walking with it, and the heading goes wrong. So this works out where
// the phone's "forward" really points in the world and takes its compass
// direction.
//
// "Forward" is the direction from the bottom of the screen to the top and
// away from you: halfway between the phone's top edge and its back. That
// stays sensible whether the phone lies flat (the top edge points forward)
// or stands upright (the back points forward).

import { normalizeDegrees, toDegrees, toRadians } from '../geo/angles';

/**
 * The compass heading (0 = north, 90 = east) of the phone's forward direction,
 * from the browser's absolute orientation angles (alpha measured from north).
 *
 * @param screenAngle how far the screen is turned (screen.orientation.angle):
 *   90 when the phone is held sideways with its top to the left.
 * @returns null when the phone points straight up or down, so there's no
 *   forward direction to measure.
 */
export function headingFromOrientation(alpha: number, beta: number, gamma: number, screenAngle = 0): number | null {
  const [a, b, g] = [toRadians(alpha), toRadians(beta), toRadians(gamma)];
  const [cA, sA, cB, sB, cG, sG] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(g), Math.sin(g)];
  // The phone's forward direction (0, 1, -1), turned into the world's
  // east/north by the phone's rotation (the browser applies alpha, then beta,
  // then gamma).
  const east = -cA * sG - sA * (cB + sB * cG);
  const north = -sA * sG + cA * (cB + sB * cG);
  if (Math.hypot(east, north) < 0.1) return null;
  return normalizeDegrees(toDegrees(Math.atan2(east, north)) + screenAngle);
}
