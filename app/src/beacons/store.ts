// Beacon storage: hikes, beacons and settings in an SQLite database on the
// phone. Everything stays on the device (no internet needed), and it survives
// the app being closed and the phone restarting.

import { DEFAULT_SETTINGS, type Settings, validateSettings } from './settings';
import type { Beacon, Hike, HikeStatus, NewBeacon } from './types';

type SqlValue = string | number | null;

/**
 * The few database functions the store needs. On the phone this is an
 * expo-sqlite database; in the tests it's Node's built-in SQLite, so the same
 * SQL gets tested for real.
 */
export interface SqlDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

// Each entry upgrades the database by one version. Never change an entry once
// it has shipped: add a new one, so phones with older data upgrade cleanly.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE hikes (
    id            TEXT PRIMARY KEY,
    started_at    INTEGER NOT NULL,
    ended_at      INTEGER,
    status        TEXT NOT NULL CHECK (status IN ('active', 'paused', 'ended')),
    retrace_index INTEGER
  );
  CREATE TABLE beacons (
    id          TEXT PRIMARY KEY,
    hike_id     TEXT NOT NULL REFERENCES hikes (id) ON DELETE CASCADE,
    timestamp   INTEGER NOT NULL,
    lat         REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lon         REAL NOT NULL CHECK (lon BETWEEN -180 AND 180),
    source      TEXT NOT NULL CHECK (source IN ('gps', 'estimated')),
    accuracy_m  REAL NOT NULL CHECK (accuracy_m >= 0),
    note        TEXT,
    photo_uri   TEXT,
    reason      TEXT NOT NULL CHECK (reason IN ('start', 'time', 'distance', 'turn', 'manual'))
  );
  CREATE INDEX beacons_by_hike_and_time ON beacons (hike_id, timestamp);
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

type HikeRow = {
  id: string;
  started_at: number;
  ended_at: number | null;
  status: HikeStatus;
  retrace_index: number | null;
};

type BeaconRow = {
  id: string;
  hike_id: string;
  timestamp: number;
  lat: number;
  lon: number;
  source: Beacon['source'];
  accuracy_m: number;
  note: string | null;
  photo_uri: string | null;
  reason: Beacon['reason'];
};

const toHike = (row: HikeRow): Hike => ({
  id: row.id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  status: row.status,
  retraceIndex: row.retrace_index,
});

const toBeacon = (row: BeaconRow): Beacon => ({
  id: row.id,
  hikeId: row.hike_id,
  timestamp: row.timestamp,
  lat: row.lat,
  lon: row.lon,
  source: row.source,
  accuracyM: row.accuracy_m,
  note: row.note,
  photoUri: row.photo_uri,
  reason: row.reason,
});

export class BeaconStore {
  private constructor(
    private db: SqlDatabase,
    private newId: () => string,
  ) {}

  /**
   * Open the store, creating or upgrading the tables if needed.
   * `newId` makes unique ids (the app uses random UUIDs).
   */
  static async open(db: SqlDatabase, newId: () => string): Promise<BeaconStore> {
    // WAL makes writes safer if the app is killed mid-write; foreign keys make
    // deleting a hike delete its beacons too.
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    let version = row?.user_version ?? 0;
    while (version < MIGRATIONS.length) {
      const sql = MIGRATIONS[version];
      const next = version + 1;
      await db.withTransactionAsync(async () => {
        await db.execAsync(sql);
        await db.execAsync(`PRAGMA user_version = ${next}`);
      });
      version = next;
    }
    return new BeaconStore(db, newId);
  }

  // --- Hikes ------------------------------------------------------------------

  /** Start a new hike. Only one hike can be active or paused at a time. */
  async startHike(now: number): Promise<Hike> {
    const current = await this.getCurrentHike();
    if (current) throw new Error('A hike is already in progress. End it before starting a new one.');
    const hike: Hike = { id: this.newId(), startedAt: now, endedAt: null, status: 'active', retraceIndex: null };
    await this.db.runAsync(
      'INSERT INTO hikes (id, started_at, ended_at, status, retrace_index) VALUES (?, ?, NULL, ?, NULL)',
      hike.id,
      hike.startedAt,
      hike.status,
    );
    return hike;
  }

  /** The hike that's active or paused, or null if there isn't one. */
  async getCurrentHike(): Promise<Hike | null> {
    const row = await this.db.getFirstAsync<HikeRow>(
      "SELECT * FROM hikes WHERE status IN ('active', 'paused') ORDER BY started_at DESC LIMIT 1",
    );
    return row ? toHike(row) : null;
  }

  async getHike(id: string): Promise<Hike | null> {
    const row = await this.db.getFirstAsync<HikeRow>('SELECT * FROM hikes WHERE id = ?', id);
    return row ? toHike(row) : null;
  }

  /** All hikes, newest first. */
  async listHikes(): Promise<Hike[]> {
    const rows = await this.db.getAllAsync<HikeRow>('SELECT * FROM hikes ORDER BY started_at DESC');
    return rows.map(toHike);
  }

  async setHikeStatus(id: string, status: HikeStatus, now: number): Promise<void> {
    await this.db.runAsync(
      'UPDATE hikes SET status = ?, ended_at = ? WHERE id = ?',
      status,
      status === 'ended' ? now : null,
      id,
    );
  }

  async setRetraceIndex(id: string, index: number | null): Promise<void> {
    await this.db.runAsync('UPDATE hikes SET retrace_index = ? WHERE id = ?', index, id);
  }

  /** Delete a hike and all its beacons. */
  async deleteHike(id: string): Promise<void> {
    await this.db.runAsync('DELETE FROM hikes WHERE id = ?', id);
  }

  // --- Beacons ----------------------------------------------------------------

  async addBeacon(input: NewBeacon): Promise<Beacon> {
    const beacon: Beacon = { ...input, id: this.newId(), note: input.note ?? null, photoUri: input.photoUri ?? null };
    await this.db.runAsync(
      `INSERT INTO beacons (id, hike_id, timestamp, lat, lon, source, accuracy_m, note, photo_uri, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      beacon.id,
      beacon.hikeId,
      beacon.timestamp,
      beacon.lat,
      beacon.lon,
      beacon.source,
      beacon.accuracyM,
      beacon.note,
      beacon.photoUri,
      beacon.reason,
    );
    return beacon;
  }

  /** A hike's beacons, oldest first (the order they were dropped). */
  async listBeacons(hikeId: string): Promise<Beacon[]> {
    const rows = await this.db.getAllAsync<BeaconRow>(
      'SELECT * FROM beacons WHERE hike_id = ? ORDER BY timestamp, rowid',
      hikeId,
    );
    return rows.map(toBeacon);
  }

  async setBeaconNote(id: string, note: string | null): Promise<void> {
    await this.db.runAsync('UPDATE beacons SET note = ? WHERE id = ?', note?.trim() || null, id);
  }

  async setBeaconPhoto(id: string, photoUri: string | null): Promise<void> {
    await this.db.runAsync('UPDATE beacons SET photo_uri = ? WHERE id = ?', photoUri, id);
  }

  // --- Settings ---------------------------------------------------------------

  /** The saved settings, with defaults for anything not saved. */
  async getSettings(): Promise<Settings> {
    const rows = await this.db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
    const saved: Record<string, unknown> = {};
    for (const row of rows) saved[row.key] = row.value;
    return validateSettings(saved).settings;
  }

  /** Save settings. Invalid values aren't saved; their problems are returned instead. */
  async saveSettings(input: Partial<Record<keyof Settings, unknown>>): Promise<string[]> {
    const { settings, problems } = validateSettings(input);
    if (problems.length > 0) return problems;
    await this.db.withTransactionAsync(async () => {
      for (const [key, value] of Object.entries(settings)) {
        await this.db.runAsync(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
          key,
          String(value),
        );
      }
    });
    return [];
  }

  async resetSettings(): Promise<void> {
    await this.db.runAsync('DELETE FROM settings');
  }

  // --- Debug ------------------------------------------------------------------

  /** Delete every hike, beacon and setting. For the debug screen only. */
  async deleteEverything(): Promise<void> {
    await this.db.execAsync('DELETE FROM beacons; DELETE FROM hikes; DELETE FROM settings;');
  }
}

export { DEFAULT_SETTINGS };
