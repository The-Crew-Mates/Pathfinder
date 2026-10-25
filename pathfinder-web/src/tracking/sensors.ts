// The phone's motion sensor (for counting steps) and compass, in the browser.
// The logic lives in steps.ts and heading.ts; this file only connects them to
// the browser's events.
//
// - Android Chrome: works without asking. The compass comes from the
//   "deviceorientationabsolute" event, which is measured from north.
// - iPhone Safari: the hiker must allow "Motion & Orientation" once, and the
//   question can only be asked from a tap (requestPermission below). The
//   compass comes from webkitCompassHeading.
// - A computer usually has neither, so after a few seconds without readings
//   the sensors count as unavailable.

import { headingFromOrientation } from './heading';
import { StepDetector } from './steps';

export type SensorStatus =
  | 'off' // no hike running
  | 'waiting' // started, no reading yet
  | 'active' // readings are coming in
  | 'unavailable' // this phone or browser has no such sensor
  | 'needs-permission' // iPhone: the hiker has to tap to allow it
  | 'denied'; // the hiker said no

export type SensorsStatus = { motion: SensorStatus; compass: SensorStatus };

type Options = {
  onSteps: (count: number, time: number) => void;
  /** A compass reading, in degrees from MAGNETIC north. */
  onHeading: (magnetic: number, time: number) => void;
  onStatus: (status: SensorsStatus) => void;
};

/** Seconds to wait for a first reading before calling a sensor unavailable. */
const UNAVAILABLE_AFTER_MS = 4000;

// iPhone's extra pieces, which aren't in the standard types.
type PermissionRequester = { requestPermission?: () => Promise<'granted' | 'denied'> };
type IosOrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };

/** True on iPhones and iPads, where motion and compass need the hiker's OK. */
export function sensorsNeedPermission(): boolean {
  return typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as PermissionRequester).requestPermission === 'function';
}

/**
 * Ask for motion and compass access (iPhone). Must be called straight from a
 * tap, before any `await`, or Safari refuses. Returns true when allowed (and
 * on phones that don't need asking).
 */
export async function requestSensorPermission(): Promise<boolean> {
  if (!sensorsNeedPermission()) return true;
  try {
    const motion = (DeviceMotionEvent as PermissionRequester).requestPermission!();
    const orientation = (DeviceOrientationEvent as PermissionRequester).requestPermission?.() ?? Promise.resolve('granted');
    return (await motion) === 'granted' && (await orientation) === 'granted';
  } catch {
    return false; // Safari throws if it wasn't called from a tap
  }
}

export class MotionSensors {
  private status: SensorsStatus = { motion: 'off', compass: 'off' };
  private detector = new StepDetector();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(private options: Options) {}

  getStatus(): SensorsStatus {
    return this.status;
  }

  /** Start listening. `allowed` is false when the iPhone permission is missing or was refused. */
  start(allowed: boolean | 'unknown' = 'unknown'): void {
    this.stop();
    if (typeof window === 'undefined') return;
    if (sensorsNeedPermission() && allowed !== true) {
      const status = allowed === false ? 'denied' : 'needs-permission';
      this.setStatus({ motion: status, compass: status });
      return;
    }
    this.running = true;
    this.detector = new StepDetector();
    this.setStatus({
      motion: 'DeviceMotionEvent' in window ? 'waiting' : 'unavailable',
      compass: 'DeviceOrientationEvent' in window ? 'waiting' : 'unavailable',
    });
    window.addEventListener('devicemotion', this.handleMotion);
    window.addEventListener(this.orientationEvent(), this.handleOrientation as EventListener);
    this.timer = setTimeout(() => {
      this.setStatus({
        motion: this.status.motion === 'waiting' ? 'unavailable' : this.status.motion,
        compass: this.status.compass === 'waiting' ? 'unavailable' : this.status.compass,
      });
    }, UNAVAILABLE_AFTER_MS);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('devicemotion', this.handleMotion);
      window.removeEventListener(this.orientationEvent(), this.handleOrientation as EventListener);
    }
    this.running = false;
    this.setStatus({ motion: 'off', compass: 'off' });
  }

  /** Android has a separate event measured from north; elsewhere the normal one (with webkitCompassHeading on iPhone). */
  private orientationEvent(): string {
    return typeof window !== 'undefined' && 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  }

  private handleMotion = (event: DeviceMotionEvent) => {
    if (!this.running) return;
    const a = event.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    if (this.status.motion !== 'active') this.setStatus({ ...this.status, motion: 'active' });
    const now = Date.now();
    const steps = this.detector.push(a.x, a.y, a.z, now);
    if (steps > 0) this.options.onSteps(steps, now);
  };

  private handleOrientation = (event: IosOrientationEvent) => {
    if (!this.running) return;
    const screenAngle = typeof screen !== 'undefined' ? (screen.orientation?.angle ?? 0) : 0;
    let heading: number | null = null;
    if (typeof event.webkitCompassHeading === 'number' && event.webkitCompassHeading >= 0) {
      heading = (event.webkitCompassHeading + screenAngle) % 360; // iPhone: already a compass heading
    } else if (event.absolute && event.alpha !== null && event.beta !== null && event.gamma !== null) {
      heading = headingFromOrientation(event.alpha, event.beta, event.gamma, screenAngle);
    }
    if (heading === null) return;
    if (this.status.compass !== 'active') this.setStatus({ ...this.status, compass: 'active' });
    this.options.onHeading(heading, Date.now());
  };

  private setStatus(status: SensorsStatus): void {
    if (status.motion === this.status.motion && status.compass === this.status.compass) return;
    this.status = status;
    this.options.onStatus(status);
  }
}
