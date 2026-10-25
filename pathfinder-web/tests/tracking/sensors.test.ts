import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MotionSensors,
  type SensorsStatus,
  requestSensorPermission,
  startingStatus,
  statusAfterWaiting,
} from '../../src/tracking/sensors';

/** A fake browser window that can send sensor events, like a phone with both sensors. */
function fakePhone() {
  const target = new EventTarget();
  return Object.assign(target, {
    DeviceMotionEvent: class {},
    DeviceOrientationEvent: class {},
    ondeviceorientationabsolute: null, // Android: the compass event measured from north
  });
}

/** Browser classes with requestPermission(), like iPhone Safari and newer Chrome. */
function withRequestPermission(motion: () => Promise<string>, orientation: (absolute?: boolean) => Promise<string>) {
  vi.stubGlobal('DeviceMotionEvent', Object.assign(class {}, { requestPermission: motion }));
  vi.stubGlobal('DeviceOrientationEvent', Object.assign(class {}, { requestPermission: orientation }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('startingStatus', () => {
  it('waits for readings when no permission is needed, or it was granted', () => {
    expect(startingStatus(true, 'unknown', false)).toBe('waiting');
    expect(startingStatus(true, 'granted', true)).toBe('waiting');
  });

  it('says what to do when permission is missing or refused', () => {
    expect(startingStatus(true, 'unknown', true)).toBe('needs-permission');
    expect(startingStatus(true, 'denied', true)).toBe('denied');
  });

  it('knows when the browser has no such sensor at all', () => {
    expect(startingStatus(false, 'granted', true)).toBe('unavailable');
  });

  it('after a while without readings, a waiting sensor is missing but a refusal stays a refusal', () => {
    expect(statusAfterWaiting('waiting')).toBe('unavailable');
    expect(statusAfterWaiting('denied')).toBe('denied');
    expect(statusAfterWaiting('active')).toBe('active');
  });
});

describe('requestSensorPermission', () => {
  it('says granted where the browser never asks', async () => {
    vi.stubGlobal('DeviceMotionEvent', class {});
    expect(await requestSensorPermission()).toEqual({ motion: 'granted', compass: 'granted' });
  });

  it('asks motion and compass separately, and the compass with absolute = true', async () => {
    const orientation = vi.fn(async () => 'denied');
    withRequestPermission(async () => 'granted', orientation);
    expect(await requestSensorPermission()).toEqual({ motion: 'granted', compass: 'denied' });
    expect(orientation).toHaveBeenCalledWith(true);
  });

  it('treats an error (Safari, not from a tap) as "not asked yet"', async () => {
    withRequestPermission(
      () => {
        throw new Error('NotAllowedError');
      },
      async () => {
        throw new Error('NotAllowedError');
      },
    );
    expect(await requestSensorPermission()).toEqual({ motion: 'unknown', compass: 'unknown' });
  });
});

describe('MotionSensors', () => {
  function start(permission: Parameters<MotionSensors['start']>[0]) {
    const phone = fakePhone();
    vi.stubGlobal('window', phone);
    const statuses: SensorsStatus[] = [];
    const headings: number[] = [];
    const sensors = new MotionSensors({ onSteps: () => {}, onHeading: (h) => headings.push(h), onStatus: (s) => statuses.push(s) });
    sensors.start(permission);
    return { phone, sensors, statuses, headings };
  }

  it('still listens after a "denied", and a reading makes the sensor active (newer Chrome on Android)', () => {
    withRequestPermission(async () => 'denied', async () => 'denied');
    const { phone, sensors, headings } = start({ motion: 'denied', compass: 'denied' });
    expect(sensors.getStatus()).toEqual({ motion: 'denied', compass: 'denied' });

    phone.dispatchEvent(Object.assign(new Event('devicemotion'), { accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 } }));
    phone.dispatchEvent(Object.assign(new Event('deviceorientationabsolute'), { absolute: true, alpha: 48, beta: 0, gamma: 0 }));
    expect(sensors.getStatus()).toEqual({ motion: 'active', compass: 'active' });
    expect(headings[0]).toBeCloseTo(312, 6); // alpha turns the other way from a compass heading
  });

  it('keeps a real refusal after the wait, and calls a silent sensor unavailable', () => {
    vi.useFakeTimers();
    withRequestPermission(async () => 'granted', async () => 'denied');
    const { sensors } = start({ motion: 'granted', compass: 'denied' });
    vi.advanceTimersByTime(5000);
    expect(sensors.getStatus()).toEqual({ motion: 'unavailable', compass: 'denied' });
  });

  it('stops listening when stopped', () => {
    vi.stubGlobal('DeviceMotionEvent', class {});
    const { phone, sensors, statuses } = start('unknown');
    sensors.stop();
    phone.dispatchEvent(Object.assign(new Event('devicemotion'), { accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 } }));
    expect(sensors.getStatus()).toEqual({ motion: 'off', compass: 'off' });
    expect(statuses.some((s) => s.motion === 'active')).toBe(false);
  });
});
