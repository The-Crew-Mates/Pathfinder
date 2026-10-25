// The phone's motion sensor (for counting steps) and compass, in the browser.
// The logic lives in steps.ts and heading.ts; this file only connects them to
// the browser's events.
//
// - Permission: iPhone Safari, and newer Chrome on Android too, have a
//   requestPermission() for motion and orientation. Safari asks the hiker (and
//   only from a tap); Chrome doesn't ask, it answers from the site's "Motion
//   sensors" setting. Either way the answer isn't the last word: the sensors
//   are always listened to, and a sensor that sends readings counts as
//   working, whatever the answer said. Motion and compass are asked separately,
//   so one "no" doesn't switch off both.
// - The compass comes from the "deviceorientationabsolute" event on Android
//   (measured from north) and from webkitCompassHeading on iPhone.
// - A computer usually has neither, so after a few seconds without readings
//   the sensors count as unavailable.

import { headingFromOrientation } from './heading';
import { StepDetector } from './steps';

export type SensorStatus =
  | 'off' // no hike running
  | 'waiting' // started, no reading yet
  | 'active' // readings are coming in
  | 'unavailable' // this phone or browser has no such sensor
  | 'needs-permission' // the hiker has to tap to allow it (iPhone)
  | 'denied'; // refused: by the hiker, or by the site's settings

export type SensorsStatus = { motion: SensorStatus; compass: SensorStatus };

/** What requestPermission() said: 'unknown' when it hasn't been asked (or can only be asked from a tap). */
export type PermissionAnswer = 'granted' | 'denied' | 'unknown';
export type SensorPermission = { motion: PermissionAnswer; compass: PermissionAnswer };

type Options = {
  onSteps: (count: number, time: number) => void;
  /** A compass reading, in degrees from MAGNETIC north. */
  onHeading: (magnetic: number, time: number) => void;
  onStatus: (status: SensorsStatus) => void;
};

/** Seconds to wait for a first reading before calling a sensor unavailable. */
const UNAVAILABLE_AFTER_MS = 4000;

// The permission pieces, which aren't in the standard types. Chrome's
// orientation version takes `absolute`: true asks for the compass too.
type PermissionRequester = { requestPermission?: (absolute?: boolean) => Promise<'granted' | 'denied'> };
type IosOrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };

/** True where the browser has requestPermission() for the sensors (iPhone Safari, newer Chrome). */
export function sensorsNeedPermission(): boolean {
  return typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as PermissionRequester).requestPermission === 'function';
}

/** True on iPhones and iPads (iPads can say they're a Mac, but Macs have no touch screen). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

/**
 * Ask for motion and compass access. Must be called straight from a tap,
 * before any `await`, or Safari refuses. Both questions are sent at once, and
 * each gets its own answer.
 */
export async function requestSensorPermission(): Promise<SensorPermission> {
  if (!sensorsNeedPermission()) return { motion: 'granted', compass: 'granted' };
  const ask = (request: (() => Promise<'granted' | 'denied'>) | undefined): Promise<PermissionAnswer> => {
    if (!request) return Promise.resolve('granted');
    try {
      // Safari throws when it isn't called from a tap: then it can still be asked later.
      return request().then((answer) => (answer === 'granted' ? 'granted' : 'denied'), () => 'unknown');
    } catch {
      return Promise.resolve('unknown');
    }
  };
  const motionRequester = DeviceMotionEvent as PermissionRequester;
  const orientationRequester = (typeof DeviceOrientationEvent === 'undefined' ? {} : DeviceOrientationEvent) as PermissionRequester;
  const motion = ask(motionRequester.requestPermission && (() => motionRequester.requestPermission!()));
  const compass = ask(orientationRequester.requestPermission && (() => orientationRequester.requestPermission!(true)));
  return { motion: await motion, compass: await compass };
}

/** A sensor's status when listening starts, before any reading has come in. */
export function startingStatus(supported: boolean, answer: PermissionAnswer, needsPermission: boolean): SensorStatus {
  if (!supported) return 'unavailable';
  if (!needsPermission || answer === 'granted') return 'waiting';
  return answer === 'denied' ? 'denied' : 'needs-permission';
}

/** After a few seconds with no reading: still waiting means there's no such sensor; a refusal stays a refusal. */
export function statusAfterWaiting(status: SensorStatus): SensorStatus {
  return status === 'waiting' ? 'unavailable' : status;
}

/** How to turn a blocked sensor back on, for this phone. */
export function blockedSensorHelp(): string {
  return isIos()
    ? 'Safari asks only once per visit: reload the page, then tap Allow when it asks about Motion & Orientation.'
    : 'In Chrome, tap the icon left of the web address, then Permissions (or Site settings) → Motion sensors → Allow. Then tap here again.';
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

  /**
   * Start listening. `permission` is what requestSensorPermission() said, or
   * 'unknown' when it couldn't be asked (no tap, e.g. after a reload).
   */
  start(permission: SensorPermission | 'unknown' = 'unknown'): void {
    this.stop();
    if (typeof window === 'undefined') return;
    const answers = permission === 'unknown' ? { motion: 'unknown' as const, compass: 'unknown' as const } : permission;
    const needsPermission = sensorsNeedPermission();
    this.running = true;
    this.detector = new StepDetector();
    this.setStatus({
      motion: startingStatus('DeviceMotionEvent' in window, answers.motion, needsPermission),
      compass: startingStatus('DeviceOrientationEvent' in window, answers.compass, needsPermission),
    });
    // Listened to even after a "no": if readings come anyway, the sensor works.
    window.addEventListener('devicemotion', this.handleMotion);
    window.addEventListener(this.orientationEvent(), this.handleOrientation as EventListener);
    this.timer = setTimeout(() => {
      this.setStatus({ motion: statusAfterWaiting(this.status.motion), compass: statusAfterWaiting(this.status.compass) });
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
