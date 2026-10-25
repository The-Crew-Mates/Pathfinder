// The compass heading for the Compass pop-up, hike or no hike.
//
// - During a hike it's the hike's own heading (HikeProvider.tsx), measured
//   from TRUE north once a GPS fix has given the declination.
// - Outside a hike, nothing is listening to the compass, so while `active` this
//   starts the sensors itself (sensors.ts). Without a GPS fix there's no
//   declination, so that heading is from MAGNETIC north, like a real compass.

import { useCallback, useEffect, useRef, useState } from 'react';

import { angleDifference } from '../geo/angles';
import { useHike } from './HikeProvider';
import { MotionSensors, type SensorStatus, requestSensorPermission } from './sensors';

/** Redraw for a turn of at least this many degrees, like the hike's own heading. */
const SHOW_STEP_DEGREES = 2;

export type Compass = {
  /** Degrees (0 = north, 90 = east), or null without a reading. */
  heading: number | null;
  /** Which north the heading is measured from. */
  north: 'true' | 'magnetic';
  status: SensorStatus;
  /** iPhone: ask for compass access (call it from a tap). */
  enable: () => Promise<void>;
};

export function useCompass(active: boolean): Compass {
  const { hike, phoneHeading, declination, sensors, enableSensors } = useHike();
  const [own, setOwn] = useState<{ heading: number | null; status: SensorStatus }>({ heading: null, status: 'off' });
  const motion = useRef<MotionSensors | null>(null);
  const ownActive = active && !hike;

  useEffect(() => {
    if (!ownActive) return;
    const sensorsForCompass = new MotionSensors({
      onSteps: () => {},
      onHeading: (magnetic) =>
        setOwn((old) =>
          old.heading !== null && Math.abs(angleDifference(old.heading, magnetic)) < SHOW_STEP_DEGREES
            ? old
            : { ...old, heading: magnetic },
        ),
      onStatus: (status) => setOwn((old) => ({ ...old, status: status.compass })),
    });
    motion.current = sensorsForCompass;
    sensorsForCompass.start();
    return () => {
      sensorsForCompass.stop();
      motion.current = null;
      setOwn({ heading: null, status: 'off' });
    };
  }, [ownActive]);

  const enableOwn = useCallback(async () => {
    const allowed = await requestSensorPermission();
    motion.current?.start(allowed);
  }, []);

  if (hike) {
    return { heading: phoneHeading, north: declination === null ? 'magnetic' : 'true', status: sensors.compass, enable: enableSensors };
  }
  return { heading: own.heading, north: 'magnetic', status: own.status, enable: enableOwn };
}
