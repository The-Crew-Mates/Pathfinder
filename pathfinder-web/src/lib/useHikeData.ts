// Loads a hike and its beacons, and reloads whenever the data changes.

import { useEffect, useState } from 'react';

import type { Beacon, Hike } from '../beacons/types';
import { useStore } from './StoreProvider';

type HikeData = { hike: Hike | null; beacons: Beacon[]; loading: boolean };

/**
 * The hike in progress and its beacons. With `orLatest`, falls back to the
 * most recent ended hike when nothing is in progress (the debug screen uses this).
 */
export function useHikeData({ orLatest = false } = {}): HikeData {
  const context = useStore();
  const [data, setData] = useState<HikeData>({ hike: null, beacons: [], loading: true });

  useEffect(() => {
    if (!context) return;
    const { store } = context;
    // If the screen closes (or data changes again) before loading finishes,
    // ignore the old result instead of showing stale data.
    let stillWanted = true;
    (async () => {
      let hike = await store.getCurrentHike();
      if (!hike && orLatest) hike = (await store.listHikes())[0] ?? null;
      const beacons = hike ? await store.listBeacons(hike.id) : [];
      if (stillWanted) setData({ hike, beacons, loading: false });
    })();
    return () => {
      stillWanted = false;
    };
  }, [context, orLatest]);

  return data;
}
