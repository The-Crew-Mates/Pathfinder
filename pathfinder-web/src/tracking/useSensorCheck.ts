// "Check sensors" on the Confidence screen: runs the step counter and the
// compass for a little while without a hike, so the hiker can see they work
// (and fix a blocked one) before heading out.

import { useCallback, useEffect, useRef, useState } from 'react';

import { MotionSensors, type SensorsStatus, requestSensorPermission } from './sensors';

/** How long a check runs. */
const CHECK_MS = 15_000;

export type SensorCheck = {
  running: boolean;
  status: SensorsStatus;
  steps: number;
  /** The latest compass reading, in degrees from MAGNETIC north, or null. */
  heading: number | null;
  /** Start a check. Call it from a tap: it asks for permission first (iPhone, newer Chrome). */
  start: () => Promise<void>;
};

export function useSensorCheck(): SensorCheck {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<SensorsStatus>({ motion: 'off', compass: 'off' });
  const [steps, setSteps] = useState(0);
  const [heading, setHeading] = useState<number | null>(null);
  const sensors = useRef<MotionSensors | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    sensors.current?.stop();
    sensors.current = null;
    setRunning(false);
  }, []);

  const start = useCallback(async () => {
    const asked = requestSensorPermission(); // before any await, while it's still part of the tap
    stop();
    setSteps(0);
    setHeading(null);
    const check = new MotionSensors({
      onSteps: (count) => setSteps((total) => total + count),
      onHeading: (magnetic) => setHeading(Math.round(magnetic)),
      // After the check ends the sensors say "off"; keep showing what was found.
      onStatus: (next) => {
        if (next.motion !== 'off' || next.compass !== 'off') setStatus(next);
      },
    });
    sensors.current = check;
    setRunning(true);
    const permission = await asked;
    if (sensors.current !== check) return; // stopped (or the screen closed) while asking
    check.start(permission);
    timer.current = setTimeout(stop, CHECK_MS);
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { running, status, steps, heading, start };
}
