// The phone's battery level, so hike mode can show what keeping the screen on costs.
// Chrome on Android supports this; other browsers return null.

import { useEffect, useState } from 'react';

type BatteryManager = EventTarget & { level: number; charging: boolean };

export type Battery = { percent: number; charging: boolean } | null;

export function useBattery(): Battery {
  const [battery, setBattery] = useState<Battery>(null);

  useEffect(() => {
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }).getBattery;
    if (!getBattery) return;
    let manager: BatteryManager | null = null;
    const update = () => {
      if (manager) setBattery({ percent: Math.round(manager.level * 100), charging: manager.charging });
    };
    let stillWanted = true;
    getBattery
      .call(navigator)
      .then((m) => {
        if (!stillWanted) return;
        manager = m;
        update();
        m.addEventListener('levelchange', update);
        m.addEventListener('chargingchange', update);
      })
      .catch(() => {});
    return () => {
      stillWanted = false;
      manager?.removeEventListener('levelchange', update);
      manager?.removeEventListener('chargingchange', update);
    };
  }, []);

  return battery;
}
