// Opens the on-device database once and shares the beacon store with every screen.

import { randomUUID } from 'expo-crypto';
import { openDatabaseAsync } from 'expo-sqlite';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BeaconStore } from '../beacons/store';
import { useTheme } from './theme';

type StoreContextValue = {
  store: BeaconStore;
  /** Goes up every time data changes, so screens know to reload. */
  version: number;
  /** Call after changing data. */
  changed: () => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const [store, setStore] = useState<BeaconStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const changed = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    openDatabaseAsync('pathfinder.db')
      .then((db) => BeaconStore.open(db, randomUUID))
      .then((opened) => {
        if (!cancelled) setStore(opened);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.danger }}>Couldn’t open the beacon database: {error}</Text>
      </View>
    );
  }
  if (!store) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }
  return <StoreContext.Provider value={{ store, version, changed }}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside <StoreProvider>');
  return value;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
