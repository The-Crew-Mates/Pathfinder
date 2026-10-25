// Hike mode: runs the hike for the whole app, so it keeps going whichever
// screen is open. It connects the pieces:
//
//   GPS tracker (gps.ts) ─────────fixes──┐
//   motion + compass (sensors.ts) ─steps─┼─▶ position (position.ts) ──beacons──▶ storage (store.ts)
//                                        └─▶ recording (recording.ts) ─────────▶ storage
//
// and keeps the screen awake (wakeLock.ts), because a web page can't track
// with the screen off. When the page comes back after the screen was off, it
// asks for a GPS fix straight away and catches up on the time rule.
// If the app is reloaded during a hike, the hike carries on from its last beacon.
//
// Retrace (retrace.ts) runs here too: it leads the hiker back along the
// beacons. While it runs, automatic beacons aren't saved, so the walk back
// doesn't add new ones; dropping one by hand still works.

import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { DEFAULT_SETTINGS, type Settings } from '../beacons/settings';
import type { Beacon, Hike } from '../beacons/types';
import { DEFAULT_STEP_LENGTH_M } from '../geo/deadReckoning';
import { angleDifference } from '../geo/angles';
import { magneticToTrue } from '../geo/declination';
import { useStore } from '../lib/StoreProvider';
import { useHikeData } from '../lib/useHikeData';
import { type Drop, type Fix, newEngine, resumeEngine } from './engine';
import { GpsTracker, type GpsStatus } from './gps';
import {
  type Calibration,
  type CurrentPosition,
  type PositionEvent,
  type PositionState,
  type PositionStep,
  HEADING_STALE_MS,
  currentPosition,
  distanceFromCurrent,
  newPosition,
  positionAtBeacon,
  positionFix,
  positionGpsLost,
  positionHeading,
  positionManualDrop,
  positionRestartRules,
  positionSteps,
  positionTick,
} from './position';
import { type Reading, TICK_MS } from './recording';
import {
  type RetraceGuidance,
  type RetraceState,
  confirmAtBeacon as confirmRetrace,
  newRetrace,
  resumeRetrace,
  retraceGuidance,
  updateRetrace,
} from './retrace';
import { MotionSensors, requestSensorPermission, type SensorPermission, type SensorsStatus } from './sensors';
import { type Battery, useBattery } from './useBattery';
import { ScreenWakeLock, type WakeLockStatus } from './wakeLock';

const GPS_BACK_MESSAGE_MS = 30_000; // how long "GPS is back" stays up
const SAVE_READINGS_MS = 30_000; // how often recorded readings are saved
const RECORD_HEADING_MS = 1000; // the compass is recorded at most once a second
const REFRESH_MS = 1000; // how often the screens are told about new steps
const TIMELINE_LENGTH = 12;
// The compass arrow on the Backtrack screen: refreshed at most this often, and
// only for a turn of at least HEADING_SHOW_STEP degrees, so the whole app
// isn't redrawn for every tiny wobble.
const HEADING_SHOW_MS = 250;
const HEADING_SHOW_STEP = 2;

/** A moment worth showing on the Confidence screen's timeline. */
export type TimelineEvent = PositionEvent | { kind: 'gps-first'; at: number; accuracyM: number };

/** While GPS loss is simulated: how far the estimate is from where GPS really says you are. */
export type TruthCheck = { at: number; errorM: number; estimatedAccuracyM: number };

type HikeContextValue = {
  hike: Hike | null;
  beacons: Beacon[];
  gps: GpsStatus;
  /** True for a short while after GPS returns from being lost. */
  gpsBack: boolean;
  lastFix: Fix | null;
  /** Where you are: the GPS fix, or the estimate from steps and the compass while GPS is lost. */
  position: CurrentPosition | null;
  sensors: SensorsStatus;
  calibration: Calibration;
  /** Steps counted this hike, and metres walked (by step count) since the last GPS fix. */
  steps: number;
  distanceSinceFixM: number;
  /** Recent GPS events, newest last. */
  timeline: TimelineEvent[];
  simulatingGpsLoss: boolean;
  truth: TruthCheck | null;
  wakeLock: WakeLockStatus;
  battery: Battery;
  /** A problem to show the hiker, or null. */
  problem: string | null;
  startHike: () => Promise<void>;
  endHike: () => Promise<void>;
  /** Drop a beacon right here (GPS position, or the estimate while GPS is lost), with an optional note and photo. */
  dropBeaconHere: (note?: string, photo?: File) => Promise<void>;
  /** Debug screen: pretend GPS is lost, to test dead reckoning on a walk. */
  setSimulateGpsLoss: (on: boolean) => void;
  /** iPhone: ask for motion and compass access (must be called from a tap). */
  enableSensors: () => Promise<void>;
  /**
   * Where the phone points, in degrees from TRUE north, or null without a recent
   * compass reading. Before the first GPS fix the declination isn't known yet,
   * so until then it's really from magnetic north (see `declination`).
   */
  phoneHeading: number | null;
  /** Magnetic declination where the last GPS fix was (positive = east), or null before the first fix. */
  declination: number | null;
  /** Retrace progress, or null when not retracing. */
  retrace: RetraceState | null;
  /** Where to go next while retracing, or null (not retracing, finished, or no position yet). */
  guidance: RetraceGuidance | null;
  /** Start leading the hiker back from the newest beacon. */
  startRetrace: () => void;
  stopRetrace: () => void;
  /** The hiker is at the target beacon: move on to the one before it. */
  confirmAtBeacon: () => void;
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
  const [sensors, setSensors] = useState<SensorsStatus>({ motion: 'off', compass: 'off' });
  const [wakeLock, setWakeLock] = useState<WakeLockStatus>('off');
  const [problem, setProblem] = useState<string | null>(null);
  const [simulatingGpsLoss, setSimulatingGpsLoss] = useState(false);
  const [truth, setTruth] = useState<TruthCheck | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [phoneHeading, setPhoneHeading] = useState<number | null>(null);
  const [retrace, setRetraceState] = useState<RetraceState | null>(null);
  // A copy of the position state for the screens, refreshed at most once a second.
  const [shown, setShown] = useState<PositionState>(() => newPosition());

  // These change often and are used inside callbacks, so they live in refs.
  const tracking = useRef<PositionState>(newPosition());
  const settings = useRef<Settings>(DEFAULT_SETTINGS);
  const hikeId = useRef<string | null>(null);
  const tracker = useRef<GpsTracker | null>(null);
  const motion = useRef<MotionSensors | null>(null);
  const screenLock = useRef<ScreenWakeLock | null>(null);
  const readings = useRef<Reading[]>([]);
  const lastRecordedHeadingAt = useRef(0);
  const lastShownAt = useRef(0);
  const savedStepLength = useRef<number | null>(null);
  const shownHeading = useRef<{ trueHeading: number; at: number } | null>(null);
  const retracing = useRef<RetraceState | null>(null);
  const latestBeacons = useRef<Beacon[]>(beacons);
  latestBeacons.current = beacons;
  // Saving is done one step at a time, in order, so two quick drops can't get mixed up.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const store = storeContext?.store ?? null;
  const changed = storeContext?.changed;

  const setRetrace = useCallback((next: RetraceState | null) => {
    retracing.current = next;
    setRetraceState(next);
  }, []);

  // Settings can be changed on the debug screen during a hike; pick them up.
  const version = storeContext?.version;
  useEffect(() => {
    store?.getSettings().then((s) => (settings.current = s));
  }, [store, version]);

  const refresh = useCallback(() => {
    lastShownAt.current = Date.now();
    setShown(tracking.current);
  }, []);

  /** Run a job after the ones already waiting, and report it if it fails. */
  const enqueue = useCallback((job: () => Promise<void>, failure: string) => {
    queue.current = queue.current
      .then(job)
      .catch((e: unknown) => setProblem(`${failure}: ${e instanceof Error ? e.message : String(e)}`));
  }, []);

  const save = useCallback(
    (drop: Drop, extra: { note?: string; photo?: File } = {}) => {
      if (!store || !hikeId.current) return;
      const id = hikeId.current;
      enqueue(async () => {
        const beacon = await store.addBeacon({
          hikeId: id,
          timestamp: drop.timestamp,
          lat: drop.position.lat,
          lon: drop.position.lon,
          source: drop.source,
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
      }, 'A beacon couldn’t be saved');
    },
    [store, changed, enqueue],
  );

  /** Save the recorded readings so far, and the learned step length if it changed. */
  const saveReadings = useCallback(() => {
    if (!store || !hikeId.current) return;
    const id = hikeId.current;
    const batch = readings.current;
    readings.current = [];
    const stepLength = tracking.current.calibration.stepLengthM;
    const learnedNew = tracking.current.calibration.stepLengthSamples > 0 && stepLength !== savedStepLength.current;
    enqueue(async () => {
      await store.addReadings(id, batch);
      if (learnedNew) {
        await store.saveLearnedStepLength(stepLength);
        savedStepLength.current = stepLength;
      }
    }, 'The sensor recording couldn’t be saved');
  }, [store, enqueue]);

  /** Remember how far Retrace has got, so a reload carries on from there. */
  const saveRetraceIndex = useCallback(
    (index: number | null) => {
      if (!store || !hikeId.current) return;
      const id = hikeId.current;
      enqueue(() => store.setRetraceIndex(id, index), 'Retrace progress couldn’t be saved');
    },
    [store, enqueue],
  );

  /** Apply a step from position.ts: save its beacons (not while retracing) and note its events. */
  const take = useCallback(
    (step: PositionStep) => {
      tracking.current = step.state;
      if (!retracing.current) for (const drop of step.drops) save(drop);
      if (step.events.length > 0) {
        setTimeline((list) => [...list, ...step.events].slice(-TIMELINE_LENGTH));
        refresh();
      }
    },
    [save, refresh],
  );

  /** Start GPS, the sensors, the screen lock and the time checks for the hike `id`. */
  const startTracking = useCallback(
    (id: string, state: PositionState, sensorsAllowed: SensorPermission | 'unknown') => {
      hikeId.current = id;
      tracking.current = state;
      readings.current = [];
      setTimeline([]);
      setTruth(null);
      setSimulatingGpsLoss(false);
      setProblem(null);
      setRetrace(null);
      shownHeading.current = null;
      setPhoneHeading(null);
      refresh();

      // Start from the step length learned on earlier hikes.
      store?.getLearnedStepLength().then((metres) => {
        savedStepLength.current = metres;
        if (metres === null || tracking.current.calibration.stepLengthSamples > 0) return;
        tracking.current = { ...tracking.current, calibration: { ...tracking.current.calibration, stepLengthM: metres } };
        refresh();
      });

      tracker.current?.stop();
      tracker.current = new GpsTracker({
        geolocation: typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
        settings: () => settings.current,
        onReading: (fix) =>
          readings.current.push({ t: fix.timestamp, kind: 'fix', lat: fix.lat, lon: fix.lon, accuracyM: fix.accuracyM }),
        onFix: (fix) => {
          if (!tracking.current.lastFix) {
            setTimeline((list) => [...list, { kind: 'gps-first' as const, at: fix.timestamp, accuracyM: fix.accuracyM }]);
          }
          take(positionFix(tracking.current, fix, settings.current));
          refresh();
        },
        onHiddenFix: (fix) => {
          const errorM = distanceFromCurrent(tracking.current, fix);
          const estimate = currentPosition(tracking.current);
          if (errorM !== null && estimate) setTruth({ at: fix.timestamp, errorM, estimatedAccuracyM: estimate.accuracyM });
        },
        onStatus: (status, wasLost) => {
          setGps(status);
          if (status === 'lost') take(positionGpsLost(tracking.current, Date.now()));
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

      motion.current?.stop();
      motion.current = new MotionSensors({
        onSteps: (count, time) => {
          readings.current.push({ t: time, kind: 'steps', count });
          take(positionSteps(tracking.current, count, time, settings.current));
          if (time - lastShownAt.current >= REFRESH_MS) refresh();
        },
        onHeading: (magnetic, time) => {
          tracking.current = positionHeading(tracking.current, magnetic, time);
          if (time - lastRecordedHeadingAt.current >= RECORD_HEADING_MS) {
            lastRecordedHeadingAt.current = time;
            readings.current.push({ t: time, kind: 'heading', magnetic: Math.round(magnetic * 10) / 10 });
          }
          const trueHeading = magneticToTrue(magnetic, tracking.current.declination);
          const last = shownHeading.current;
          if (
            !last ||
            (time - last.at >= HEADING_SHOW_MS && Math.abs(angleDifference(last.trueHeading, trueHeading)) >= HEADING_SHOW_STEP)
          ) {
            shownHeading.current = { trueHeading, at: time };
            setPhoneHeading(trueHeading);
          }
        },
        onStatus: setSensors,
      });
      motion.current.start(sensorsAllowed);

      screenLock.current ??= new ScreenWakeLock(setWakeLock);
      void screenLock.current.enable();
    },
    [store, take, refresh, setRetrace],
  );

  const stopTracking = useCallback(() => {
    saveReadings();
    tracker.current?.stop();
    tracker.current = null;
    motion.current?.stop();
    motion.current = null;
    void screenLock.current?.disable();
    hikeId.current = null;
    tracking.current = newPosition();
    setSimulatingGpsLoss(false);
    setTruth(null);
    setRetrace(null);
    shownHeading.current = null;
    setPhoneHeading(null);
    refresh();
  }, [saveReadings, refresh, setRetrace]);

  // Carry on a hike that was running when the app was closed or reloaded.
  const resumed = useRef(false);
  useEffect(() => {
    if (!store || resumed.current) return;
    resumed.current = true;
    (async () => {
      const current = await store.getCurrentHike();
      if (current?.status === 'active') {
        const saved = await store.listBeacons(current.id);
        // No tap here, so an iPhone will ask for the sensors with a button.
        startTracking(current.id, newPosition(DEFAULT_STEP_LENGTH_M, resumeEngine(saved.at(-1) ?? null)), 'unknown');
        if (current.retraceIndex !== null) setRetrace(resumeRetrace(current.retraceIndex));
      }
    })();
  }, [store, startTracking, setRetrace]);

  // Check the time rule regularly, save the recording now and then, and catch
  // up straight away when the page comes back after the screen was off.
  useEffect(() => {
    let lastSaved = Date.now();
    const tick = () => {
      if (!hikeId.current) return;
      take(positionTick(tracking.current, Date.now(), settings.current));
      // The compass stopped reporting (or never started): stop steering by it.
      const heading = tracking.current.heading;
      if (shownHeading.current && (!heading || Date.now() - heading.at > HEADING_STALE_MS)) {
        shownHeading.current = null;
        setPhoneHeading(null);
      }
      refresh();
      if (Date.now() - lastSaved >= SAVE_READINGS_MS) {
        lastSaved = Date.now();
        saveReadings();
      }
    };
    const onVisible = () => {
      if (!hikeId.current) return;
      if (document.visibilityState === 'hidden') {
        saveReadings(); // the page may be closed while it's hidden
        return;
      }
      tracker.current?.requestNow();
      tick();
    };
    const interval = setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [take, refresh, saveReadings]);

  // Stop GPS and the sensors if the whole app closes. (Through a ref, so this
  // only runs on closing, not whenever stopTracking is re-created.)
  const stopOnClose = useRef(stopTracking);
  stopOnClose.current = stopTracking;
  useEffect(() => () => stopOnClose.current(), []);

  const startHike = useCallback(async () => {
    if (!store) return;
    // Asked first, while this still counts as part of the tap (iPhone).
    const allowed = requestSensorPermission();
    try {
      const started = await store.startHike(Date.now());
      changed?.();
      startTracking(started.id, newPosition(DEFAULT_STEP_LENGTH_M, newEngine()), await allowed);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  }, [store, changed, startTracking]);

  const endHike = useCallback(async () => {
    if (!store) return;
    const current = await store.getCurrentHike();
    stopTracking();
    setProblem(null); // a GPS problem from this hike no longer matters
    await queue.current; // let the last readings be saved first
    if (current) {
      if (current.retraceIndex !== null) await store.setRetraceIndex(current.id, null);
      await store.setHikeStatus(current.id, 'ended', Date.now());
    }
    changed?.();
  }, [store, changed, stopTracking]);

  const dropBeaconHere = useCallback(
    async (note?: string, photo?: File) => {
      if (!hikeId.current) {
        setProblem('Start a hike first.');
        return;
      }
      const here = currentPosition(tracking.current);
      const fresh =
        here && (here.source === 'estimated' || Date.now() - here.timestamp <= settings.current.gpsLostAfterSeconds * 1000);
      if (!here || !fresh) {
        setProblem('No recent GPS position yet, so the beacon can’t be placed. Try again in a moment.');
        tracker.current?.requestNow();
        return;
      }
      setProblem(null);
      const drop: Drop = {
        reason: 'manual',
        source: here.source,
        position: { lat: here.lat, lon: here.lon },
        accuracyM: here.accuracyM,
        timestamp: Date.now(),
      };
      tracking.current = positionManualDrop(tracking.current, drop);
      save(drop, { note, photo });
    },
    [save],
  );

  const setSimulateGpsLoss = useCallback((on: boolean) => {
    if (!tracker.current) return;
    tracker.current.simulateLoss(on);
    setSimulatingGpsLoss(on);
    if (!on) setTruth(null);
  }, []);

  const enableSensors = useCallback(async () => {
    const allowed = await requestSensorPermission();
    if (hikeId.current) motion.current?.start(allowed);
  }, []);

  // Retrace: each time the position (or the beacons) change, check whether the
  // target beacon has been reached, and save the progress when it moves on.
  useEffect(() => {
    const here = currentPosition(shown);
    if (!retrace || !here || !hikeId.current) return;
    const { state, arrived } = updateRetrace(retrace, beacons, here);
    if (state === retrace) return;
    setRetrace(state);
    if (arrived !== null) {
      navigator.vibrate?.(200);
      saveRetraceIndex(state.targetIndex);
    }
  }, [shown, beacons, retrace, setRetrace, saveRetraceIndex]);

  const startRetrace = useCallback(() => {
    if (!hikeId.current) {
      setProblem('Start a hike first: Retrace leads you back along its beacons.');
      return;
    }
    const state = newRetrace(latestBeacons.current);
    if (!state) {
      setProblem('No beacons yet. The first one drops with the first GPS position.');
      return;
    }
    setProblem(null);
    setRetrace(state);
    saveRetraceIndex(state.targetIndex);
  }, [setRetrace, saveRetraceIndex]);

  const stopRetrace = useCallback(() => {
    if (!retracing.current) return;
    tracking.current = positionRestartRules(tracking.current, latestBeacons.current.at(-1) ?? null);
    setRetrace(null);
    saveRetraceIndex(null);
  }, [setRetrace, saveRetraceIndex]);

  const confirmAtBeacon = useCallback(() => {
    const current = retracing.current;
    const list = latestBeacons.current;
    if (!current || current.finished || list.length === 0) return;
    const beacon = list[Math.min(current.targetIndex, list.length - 1)];
    // Without GPS, the beacon is a better idea of where we are than the estimate.
    tracking.current = positionAtBeacon(tracking.current, beacon, beacon.accuracyM, Date.now());
    const next = confirmRetrace(current);
    setRetrace(next);
    saveRetraceIndex(next.targetIndex);
    refresh();
  }, [setRetrace, saveRetraceIndex, refresh]);

  const position = currentPosition(shown);
  const value: HikeContextValue = {
    hike,
    beacons,
    gps,
    gpsBack,
    lastFix: shown.lastFix,
    position,
    sensors,
    calibration: shown.calibration,
    steps: shown.totalSteps,
    distanceSinceFixM: shown.deadReckoning?.distanceSinceFixM ?? 0,
    timeline,
    simulatingGpsLoss,
    truth,
    wakeLock,
    battery,
    problem,
    startHike,
    endHike,
    dropBeaconHere,
    setSimulateGpsLoss,
    enableSensors,
    phoneHeading,
    declination: shown.lastFix ? shown.declination : null,
    retrace,
    guidance: retrace && position ? retraceGuidance(retrace, beacons, position, phoneHeading) : null,
    startRetrace,
    stopRetrace,
    confirmAtBeacon,
  };
  return <HikeContext.Provider value={value}>{children}</HikeContext.Provider>;
}

export function useHike(): HikeContextValue {
  const value = useContext(HikeContext);
  if (!value) throw new Error('useHike must be used inside <HikeProvider>');
  return value;
}
