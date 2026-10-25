// Hike mode: runs the hike for the whole app, so it keeps going whichever
// screen is open. It connects the pieces:
//
//   GPS tracker (gps.ts) ──fixes──▶ beacon rules (engine.ts) ──beacons──▶ storage (store.ts)
//
// and keeps the screen awake (wakeLock.ts), because a web page can't track
// with the screen off. When the page comes back after the screen was off, it
// asks for a GPS fix straight away and catches up on the time rule.
// If the app is reloaded during a hike, the hike carries on from its last beacon.

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { DEFAULT_SETTINGS, type Settings } from '../beacons/settings';
import type { Beacon, Hike } from '../beacons/types';
import { useStore } from '../lib/StoreProvider';
import { useHikeData } from '../lib/useHikeData';
import { type Drop, type EngineState, type Fix, newEngine, onFix, onTick, resumeEngine } from './engine';
import { GpsTracker, type GpsStatus } from './gps';
import { type Battery, useBattery } from './useBattery';
import { ScreenWakeLock, type WakeLockStatus } from './wakeLock';

const TICK_MS = 5000; // how often the time rule is checked between GPS fixes
const GPS_BACK_MESSAGE_MS = 30_000; // how long "GPS is back" stays up

type HikeContextValue = {
  hike: Hike | null;
  beacons: Beacon[];
  gps: GpsStatus;
  /** True for a short while after GPS returns from being lost. */
  gpsBack: boolean;
  lastFix: Fix | null;
  wakeLock: WakeLockStatus;
  battery: Battery;
  /** A problem to show the hiker, or null. */
  problem: string | null;
  startHike: () => Promise<void>;
  endHike: () => Promise<void>;
  /** Drop a beacon right here (at the latest GPS position), with an optional note and photo. */
  dropBeaconHere: (note?: string, photo?: File) => Promise<void>;
};

/** What the hike UI can read and do. */
export type HikeContextValueForUi = HikeContextValue;

const HikeContext = createContext<HikeContextValue | null>(null);

export function HikeProvider({ children }: { children: ReactNode }) {
  const storeContext = useStore();
  const { hike, beacons } = useHikeData();
  const battery = useBattery();

  const [gps, setGps] = useState<GpsStatus>('off');
  const [gpsBack, setGpsBack] = useState(false);
  const [lastFix, setLastFix] = useState<Fix | null>(null);
  const [wakeLock, setWakeLock] = useState<WakeLockStatus>('off');
  const [problem, setProblem] = useState<string | null>(null);

  // These change often and are used inside callbacks, so they live in refs.
  const engine = useRef<EngineState>(newEngine());
  const settings = useRef<Settings>(DEFAULT_SETTINGS);
  const hikeId = useRef<string | null>(null);
  const tracker = useRef<GpsTracker | null>(null);
  const screenLock = useRef<ScreenWakeLock | null>(null);
  // Saving is done one step at a time, in order, so two quick drops can't get mixed up.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const store = storeContext?.store ?? null;
  const changed = storeContext?.changed;

  // Settings can be changed on the debug screen during a hike; pick them up.
  const version = storeContext?.version;
  useEffect(() => {
    store?.getSettings().then((s) => (settings.current = s));
  }, [store, version]);

  const save = useCallback(
    (drop: Drop, extra: { note?: string; photo?: File } = {}) => {
      if (!store || !hikeId.current) return;
      const id = hikeId.current;
      queue.current = queue.current
        .then(async () => {
          const beacon = await store.addBeacon({
            hikeId: id,
            timestamp: drop.timestamp,
            lat: drop.position.lat,
            lon: drop.position.lon,
            source: 'gps',
            accuracyM: drop.accuracyM,
            reason: drop.reason,
            note: extra.note ?? null,
          });
          if (extra.photo) {
            await store.setBeaconPhoto(beacon.id, {
              type: extra.photo.type || 'image/jpeg',
              data: await extra.photo.arrayBuffer(),
            });
          }
          changed?.();
        })
        .catch((e: unknown) => setProblem(`A beacon couldn’t be saved: ${e instanceof Error ? e.message : String(e)}`));
    },
    [store, changed],
  );

  /** Start GPS, the screen lock and the time checks for the hike `id`. */
  const startTracking = useCallback(
    (id: string, state: EngineState) => {
      hikeId.current = id;
      engine.current = state;
      setProblem(null);
      tracker.current?.stop();
      tracker.current = new GpsTracker({
        geolocation: typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
        settings: () => settings.current,
        onFix: (fix) => {
          setLastFix(fix);
          const step = onFix(engine.current, fix, settings.current);
          engine.current = step.state;
          if (step.drop) save(step.drop);
        },
        onStatus: (status, wasLost) => {
          setGps(status);
          if (wasLost) {
            setGpsBack(true);
            setTimeout(() => setGpsBack(false), GPS_BACK_MESSAGE_MS);
            navigator.vibrate?.([100, 60, 100]);
          }
          if (status === 'denied') {
            setProblem('Location is blocked. Allow location for this site in your browser settings, then start again.');
          }
          if (status === 'unsupported') setProblem('This browser can’t use GPS.');
        },
      });
      tracker.current.start();
      screenLock.current ??= new ScreenWakeLock(setWakeLock);
      void screenLock.current.enable();
    },
    [save],
  );

  const stopTracking = useCallback(() => {
    tracker.current?.stop();
    tracker.current = null;
    void screenLock.current?.disable();
    hikeId.current = null;
    setLastFix(null);
  }, []);

  // Carry on a hike that was running when the app was closed or reloaded.
  const resumed = useRef(false);
  useEffect(() => {
    if (!store || resumed.current) return;
    resumed.current = true;
    (async () => {
      const current = await store.getCurrentHike();
      if (current?.status === 'active') {
        const saved = await store.listBeacons(current.id);
        startTracking(current.id, resumeEngine(saved.at(-1) ?? null));
      }
    })();
  }, [store, startTracking]);

  // Check the time rule regularly, and catch up straight away when the page
  // comes back after the screen was off.
  useEffect(() => {
    const tick = () => {
      if (!hikeId.current) return;
      const step = onTick(engine.current, Date.now(), settings.current);
      engine.current = step.state;
      if (step.drop) save(step.drop);
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !hikeId.current) return;
      tracker.current?.requestNow();
      tick();
    };
    const interval = setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [save]);

  // Stop GPS if the whole app closes.
  useEffect(() => () => stopTracking(), [stopTracking]);

  const startHike = useCallback(async () => {
    if (!store) return;
    try {
      const started = await store.startHike(Date.now());
      changed?.();
      startTracking(started.id, newEngine());
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  }, [store, changed, startTracking]);

  const endHike = useCallback(async () => {
    if (!store) return;
    const current = await store.getCurrentHike();
    stopTracking();
    setProblem(null); // a GPS problem from this hike no longer matters
    if (current) await store.setHikeStatus(current.id, 'ended', Date.now());
    changed?.();
  }, [store, changed, stopTracking]);

  const dropBeaconHere = useCallback(
    async (note?: string, photo?: File) => {
      const fix = engine.current.lastFix;
      const fresh = fix && Date.now() - fix.timestamp <= settings.current.gpsLostAfterSeconds * 1000;
      if (!hikeId.current) {
        setProblem('Start a hike first.');
        return;
      }
      if (!fix || !fresh) {
        setProblem('No recent GPS position yet, so the beacon can’t be placed. Try again in a moment.');
        tracker.current?.requestNow();
        return;
      }
      setProblem(null);
      const drop: Drop = {
        reason: 'manual',
        position: { lat: fix.lat, lon: fix.lon },
        accuracyM: fix.accuracyM,
        timestamp: Date.now(),
      };
      // A manual beacon also starts the automatic rules over.
      engine.current = {
        ...engine.current,
        lastBeacon: { timestamp: drop.timestamp, position: drop.position },
        distanceSinceBeaconM: 0,
        referenceCourse: engine.current.course,
        turnStartedAt: null,
      };
      save(drop, { note, photo });
    },
    [save],
  );

  return (
    <HikeContext.Provider
      value={{ hike, beacons, gps, gpsBack, lastFix, wakeLock, battery, problem, startHike, endHike, dropBeaconHere }}
    >
      {children}
    </HikeContext.Provider>
  );
}

export function useHike(): HikeContextValue {
  const value = useContext(HikeContext);
  if (!value) throw new Error('useHike must be used inside <HikeProvider>');
  return value;
}
