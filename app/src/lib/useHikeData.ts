// Loads a hike and its beacons, and reloads whenever the data changes.

import { useEffect, useState } from 'react';

import type { Beacon, Hike } from '../beacons/types';
import { useStore } from './StoreProvider';

/**
 * The hike in progress and its beacons. With `orLatest`, falls back to the
 * most recent ended hike when nothing is in progress (the debug screen uses this).
 */
export function useHikeData({ orLatest = false } = {}): { hike: Hike | null; beacons: Beacon[] } {
  const { store, version } = useStore();
  const [data, setData] = useState<{ hike: Hike | null; beacons: Beacon[] }>({ hike: null, beacons: [] });

  useEffect(() => {
    // If the screen closes (or data changes again) before loading finishes,
    // ignore the old result instead of showing stale data.
    let stillWanted = true;
    (async () => {
      let hike = await store.getCurrentHike();
      if (!hike && orLatest) hike = (await store.listHikes())[0] ?? null;
      const beacons = hike ? await store.listBeacons(hike.id) : [];
      if (stillWanted) setData({ hike, beacons });
    })();
    return () => {
      stillWanted = false;
    };
  }, [store, version, orLatest]);

  return data;
}
