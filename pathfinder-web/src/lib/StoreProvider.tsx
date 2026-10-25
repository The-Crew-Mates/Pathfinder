// Opens the beacon database once and shares it with every screen.

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { type PersistenceStatus, requestPersistentStorage } from '../beacons/persistence';
import { BeaconStore } from '../beacons/store';

type StoreContextValue = {
  store: BeaconStore;
  /** Goes up every time data changes, so screens know to reload. */
  version: number;
  /** Call after changing data. */
  changed: () => void;
  /** Whether the browser promised to keep our data (see persistence.ts). */
  persistence: PersistenceStatus | 'checking';
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<BeaconStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [persistence, setPersistence] = useState<PersistenceStatus | 'checking'>('checking');
  const changed = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let stillWanted = true;
    BeaconStore.open()
      .then((opened) => {
        if (stillWanted) setStore(opened);
        else opened.close();
      })
      .catch((e: unknown) => {
        if (stillWanted) setError(e instanceof Error ? e.message : String(e));
      });
    requestPersistentStorage().then((status) => {
      if (stillWanted) setPersistence(status);
    });
    return () => {
      stillWanted = false;
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#0b1311] text-[#fca5a5] text-center">
        Couldn’t open the beacon storage on this device: {error}
      </div>
    );
  }
  // The screens don't need storage to draw, so show them straight away and
  // give them the store once it's open.
  return (
    <StoreContext.Provider value={store ? { store, version, changed, persistence } : null}>
      {children}
    </StoreContext.Provider>
  );
}

/** The store, or null while it's still opening (it takes a few milliseconds). */
export function useStore(): StoreContextValue | null {
  return useContext(StoreContext);
}
