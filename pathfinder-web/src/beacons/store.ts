// Beacon storage: hikes, beacons, photos, settings and recorded sensor readings, saved in the browser's
// built-in database (IndexedDB). Everything stays on the phone (no internet
// needed) and survives closing the app and restarting the phone.
//
// IndexedDB doesn't check data the way SQL does, so this file checks every
// beacon itself before saving it (see checkBeacon below).

import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import type { Reading } from '../tracking/recording';
import { type Settings, validateSettings } from './settings';
import {
  BEACON_REASONS,
  BEACON_SOURCES,
  type Beacon,
  type BeaconPhoto,
  type Hike,
  type HikeStatus,
  type NewBeacon,
} from './types';

/** The name of the database in the browser. */
export const DEFAULT_DB_NAME = 'pathfinder';

// Bump this, and add a step to upgrade() below, whenever the stores change.
// Never change an existing step: phones with older data upgrade one step at a time.
const DB_VERSION = 2;

// A saved beacon also gets `seq`, a counter the database fills in. Beacons with
// the same timestamp are then still listed in the order they were added.
type StoredBeacon = Beacon & { seq?: number };

interface PathfinderDB extends DBSchema {
  hikes: { key: string; value: Hike; indexes: { byStatus: HikeStatus } };
  beacons: { key: number; value: StoredBeacon; indexes: { byId: string; byHikeAndTime: [string, number] } };
  photos: { key: string; value: BeaconPhoto & { beaconId: string } };
  settings: { key: string; value: number };
  /** A hike's recorded readings, saved in chunks as the hike goes (version 2). */
  sensorLog: { key: number; value: { hikeId: string; readings: Reading[] }; indexes: { byHike: string } };
  /** What dead reckoning has learned about the hiker, e.g. "stepLengthM" (version 2). */
  calibration: { key: string; value: number };
}

/** A random id. crypto.randomUUID only exists on secure (https) pages, so there's a fallback. */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Throws a clear error if the beacon has a value that makes no sense. */
export function checkBeacon(beacon: NewBeacon): void {
  const problems: string[] = [];
  const isNumber = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (typeof beacon.hikeId !== 'string' || beacon.hikeId === '') problems.push('it has no hike');
  if (!isNumber(beacon.timestamp)) problems.push('its time is missing');
  if (!isNumber(beacon.lat) || beacon.lat < -90 || beacon.lat > 90) problems.push(`latitude ${beacon.lat} is outside -90..90`);
  if (!isNumber(beacon.lon) || beacon.lon < -180 || beacon.lon > 180) problems.push(`longitude ${beacon.lon} is outside -180..180`);
  if (!isNumber(beacon.accuracyM) || beacon.accuracyM < 0) problems.push(`accuracy ${beacon.accuracyM} must be 0 or more`);
  if (!BEACON_SOURCES.includes(beacon.source)) problems.push(`source "${beacon.source}" must be gps or estimated`);
  if (!BEACON_REASONS.includes(beacon.reason)) problems.push(`reason "${beacon.reason}" isn't one of ${BEACON_REASONS.join(', ')}`);
  if (problems.length > 0) throw new Error(`Beacon not saved: ${problems.join('; ')}.`);
}

const withoutSeq = ({ seq: _seq, ...beacon }: StoredBeacon): Beacon => beacon;

/**
 * Cancel a transaction so nothing in it is saved. Cancelling makes `tx.done`
 * fail, which is expected here, so that failure is caught and ignored.
 */
function cancel(tx: { abort(): void; done: Promise<void> }): void {
  tx.done.catch(() => {});
  tx.abort();
}

/** The keys that cover every beacon of one hike, in time order. */
const hikeRange = (hikeId: string) => IDBKeyRange.bound([hikeId, -Infinity], [hikeId, Infinity]);

export class BeaconStore {
  private constructor(private db: IDBPDatabase<PathfinderDB>) {}

  /** Open (and if needed create or upgrade) the database. */
  static async open(name = DEFAULT_DB_NAME): Promise<BeaconStore> {
    const db = await openDB<PathfinderDB>(name, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          database.createObjectStore('hikes', { keyPath: 'id' }).createIndex('byStatus', 'status');
          const beacons = database.createObjectStore('beacons', { keyPath: 'seq', autoIncrement: true });
          beacons.createIndex('byId', 'id', { unique: true });
          beacons.createIndex('byHikeAndTime', ['hikeId', 'timestamp']);
          database.createObjectStore('photos', { keyPath: 'beaconId' });
          database.createObjectStore('settings');
        }
        if (oldVersion < 2) {
          database.createObjectStore('sensorLog', { autoIncrement: true }).createIndex('byHike', 'hikeId');
          database.createObjectStore('calibration');
        }
      },
    });
    return new BeaconStore(db);
  }

  /** Close the database (the tests use this to check data survives reopening). */
  close(): void {
    this.db.close();
  }

  // --- Hikes ------------------------------------------------------------------

  /** Start a new hike. Only one hike can be active or paused at a time. */
  async startHike(now: number): Promise<Hike> {
    const tx = this.db.transaction('hikes', 'readwrite');
    const inProgress =
      (await tx.store.index('byStatus').count('active')) + (await tx.store.index('byStatus').count('paused'));
    if (inProgress > 0) {
      cancel(tx);
      throw new Error('A hike is already in progress. End it before starting a new one.');
    }
    const hike: Hike = { id: newId(), startedAt: now, endedAt: null, status: 'active', retraceIndex: null, replayOf: null };
    await tx.store.add(hike);
    await tx.done;
    return hike;
  }

  /** Save a replay of the recorded hike `replayOf` (debug screen) as a new, already ended hike. */
  async addReplayHike(replayOf: string, now: number): Promise<Hike> {
    const hike: Hike = { id: newId(), startedAt: now, endedAt: now, status: 'ended', retraceIndex: null, replayOf };
    await this.db.add('hikes', hike);
    return hike;
  }

  /** The hike that's active or paused, or null if there isn't one. */
  async getCurrentHike(): Promise<Hike | null> {
    const index = this.db.transaction('hikes').store.index('byStatus');
    const candidates = [...(await index.getAll('active')), ...(await index.getAll('paused'))];
    candidates.sort((a, b) => b.startedAt - a.startedAt);
    return candidates[0] ?? null;
  }

  async getHike(id: string): Promise<Hike | null> {
    return (await this.db.get('hikes', id)) ?? null;
  }

  /** All hikes, newest first. */
  async listHikes(): Promise<Hike[]> {
    const hikes = await this.db.getAll('hikes');
    return hikes.sort((a, b) => b.startedAt - a.startedAt);
  }

  async setHikeStatus(id: string, status: HikeStatus, now: number): Promise<void> {
    await this.updateHike(id, (hike) => ({ ...hike, status, endedAt: status === 'ended' ? now : null }));
  }

  async setRetraceIndex(id: string, index: number | null): Promise<void> {
    await this.updateHike(id, (hike) => ({ ...hike, retraceIndex: index }));
  }

  private async updateHike(id: string, change: (hike: Hike) => Hike): Promise<void> {
    const tx = this.db.transaction('hikes', 'readwrite');
    const hike = await tx.store.get(id);
    if (!hike) {
      cancel(tx);
      throw new Error(`No hike with id ${id}.`);
    }
    await tx.store.put(change(hike));
    await tx.done;
  }

  /** Delete a hike with all its beacons, photos and recorded readings. */
  async deleteHike(id: string): Promise<void> {
    const tx = this.db.transaction(['hikes', 'beacons', 'photos', 'sensorLog'], 'readwrite');
    await tx.objectStore('hikes').delete(id);
    let chunk = await tx.objectStore('sensorLog').index('byHike').openCursor(id);
    while (chunk) {
      await chunk.delete();
      chunk = await chunk.continue();
    }
    let cursor = await tx.objectStore('beacons').index('byHikeAndTime').openCursor(hikeRange(id));
    while (cursor) {
      await tx.objectStore('photos').delete(cursor.value.id);
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  // --- Beacons ----------------------------------------------------------------

  async addBeacon(input: NewBeacon): Promise<Beacon> {
    checkBeacon(input);
    const beacon: Beacon = { ...input, id: newId(), note: input.note?.trim() || null, hasPhoto: false };
    const tx = this.db.transaction(['hikes', 'beacons'], 'readwrite');
    if (!(await tx.objectStore('hikes').get(beacon.hikeId))) {
      cancel(tx);
      throw new Error(`Beacon not saved: there's no hike with id ${beacon.hikeId}.`);
    }
    await tx.objectStore('beacons').add(beacon);
    await tx.done;
    return beacon;
  }

  /** A hike's beacons, oldest first (the order they were dropped). */
  async listBeacons(hikeId: string): Promise<Beacon[]> {
    const stored = await this.db.getAllFromIndex('beacons', 'byHikeAndTime', hikeRange(hikeId));
    return stored.map(withoutSeq);
  }

  async getBeacon(id: string): Promise<Beacon | null> {
    const stored = await this.db.getFromIndex('beacons', 'byId', id);
    return stored ? withoutSeq(stored) : null;
  }

  async setBeaconNote(id: string, note: string | null): Promise<void> {
    const tx = this.db.transaction('beacons', 'readwrite');
    const stored = await tx.store.index('byId').get(id);
    if (!stored) {
      cancel(tx);
      throw new Error(`No beacon with id ${id}.`);
    }
    await tx.store.put({ ...stored, note: note?.trim() || null });
    await tx.done;
  }

  /** Attach a photo to a beacon, or remove it with null. */
  async setBeaconPhoto(id: string, photo: BeaconPhoto | null): Promise<void> {
    const tx = this.db.transaction(['beacons', 'photos'], 'readwrite');
    const stored = await tx.objectStore('beacons').index('byId').get(id);
    if (!stored) {
      cancel(tx);
      throw new Error(`No beacon with id ${id}.`);
    }
    if (photo) await tx.objectStore('photos').put({ beaconId: id, type: photo.type, data: photo.data });
    else await tx.objectStore('photos').delete(id);
    await tx.objectStore('beacons').put({ ...stored, hasPhoto: photo !== null });
    await tx.done;
  }

  /** The beacon's photo as an image the page can show, or null if it has none. */
  async getBeaconPhoto(id: string): Promise<Blob | null> {
    const photo = await this.db.get('photos', id);
    return photo ? new Blob([photo.data], { type: photo.type }) : null;
  }

  // --- Settings ---------------------------------------------------------------

  /** The saved settings, with defaults for anything not saved. */
  async getSettings(): Promise<Settings> {
    const tx = this.db.transaction('settings');
    const [keys, values] = await Promise.all([tx.store.getAllKeys(), tx.store.getAll()]);
    const saved = Object.fromEntries(keys.map((key, i) => [key, values[i]]));
    return validateSettings(saved).settings;
  }

  /** Save settings. Invalid values aren't saved; their problems are returned instead. */
  async saveSettings(input: Partial<Record<keyof Settings, unknown>>): Promise<string[]> {
    const { settings, problems } = validateSettings(input);
    if (problems.length > 0) return problems;
    const tx = this.db.transaction('settings', 'readwrite');
    await Promise.all(Object.entries(settings).map(([key, value]) => tx.store.put(value, key)));
    await tx.done;
    return [];
  }

  async resetSettings(): Promise<void> {
    await this.db.clear('settings');
  }

  // --- Recorded readings and calibration ---------------------------------------

  /** Add readings to a hike's recording. Called every 30 s or so during a hike. */
  async addReadings(hikeId: string, readings: Reading[]): Promise<void> {
    if (readings.length === 0) return;
    await this.db.add('sensorLog', { hikeId, readings });
  }

  /** All of a hike's recorded readings, oldest first. */
  async getReadings(hikeId: string): Promise<Reading[]> {
    const chunks = await this.db.getAllFromIndex('sensorLog', 'byHike', hikeId);
    return chunks.flatMap((chunk) => chunk.readings).sort((a, b) => a.t - b.t);
  }

  /** True if the hike has any recorded readings. */
  async hasReadings(hikeId: string): Promise<boolean> {
    return (await this.db.countFromIndex('sensorLog', 'byHike', hikeId)) > 0;
  }

  /** The hiker's learned step length in metres, or null if nothing has been learned yet. */
  async getLearnedStepLength(): Promise<number | null> {
    return (await this.db.get('calibration', 'stepLengthM')) ?? null;
  }

  async saveLearnedStepLength(metres: number): Promise<void> {
    await this.db.put('calibration', metres, 'stepLengthM');
  }

  // --- Debug ------------------------------------------------------------------

  /** Delete every hike, beacon, photo, setting, recording and calibration. For the debug screen only. */
  async deleteEverything(): Promise<void> {
    const stores = ['hikes', 'beacons', 'photos', 'settings', 'sensorLog', 'calibration'] as const;
    const tx = this.db.transaction(stores, 'readwrite');
    await Promise.all([...stores.map((name) => tx.objectStore(name).clear()), tx.done]);
  }
}
