// Tests for the beacon store. They use fake-indexeddb, a copy of the browser's
// IndexedDB that runs in Node, so no browser is needed. Each test gets its own
// fresh database.

import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/beacons/settings';
import { BeaconStore, checkBeacon } from '../../src/beacons/store';
import type { NewBeacon } from '../../src/beacons/types';

const T0 = Date.UTC(2026, 9, 25, 9, 0);
let dbCounter = 0;

async function freshStore(): Promise<BeaconStore> {
  return BeaconStore.open(`test-${++dbCounter}`);
}

function beacon(hikeId: string, minutes: number, extra: Partial<NewBeacon> = {}): NewBeacon {
  return {
    hikeId,
    timestamp: T0 + minutes * 60_000,
    lat: 60.30954,
    lon: 24.52085,
    source: 'gps',
    accuracyM: 8,
    reason: 'time',
    ...extra,
  };
}

describe('hikes', () => {
  it('starts a hike and finds it as the current one', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    expect(hike).toMatchObject({ startedAt: T0, endedAt: null, status: 'active', retraceIndex: null });
    expect(hike.id).toMatch(/^[0-9a-f-]{32,36}$/);
    expect(await store.getCurrentHike()).toEqual(hike);
  });

  it('allows only one hike in progress at a time, and the refused one is not saved', async () => {
    const store = await freshStore();
    await store.startHike(T0);
    await expect(store.startHike(T0 + 1000)).rejects.toThrow('already in progress');
    expect(await store.listHikes()).toHaveLength(1);
  });

  it('keeps a paused hike as the current one, and forgets it once ended', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    await store.setHikeStatus(hike.id, 'paused', T0 + 1000);
    expect((await store.getCurrentHike())?.status).toBe('paused');
    await store.setHikeStatus(hike.id, 'ended', T0 + 2000);
    expect(await store.getCurrentHike()).toBeNull();
    expect((await store.getHike(hike.id))?.endedAt).toBe(T0 + 2000);
  });

  it('lists hikes newest first', async () => {
    const store = await freshStore();
    const first = await store.startHike(T0);
    await store.setHikeStatus(first.id, 'ended', T0 + 1);
    const second = await store.startHike(T0 + 10);
    expect((await store.listHikes()).map((h) => h.id)).toEqual([second.id, first.id]);
  });

  it('remembers where Retrace mode got to', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    await store.setRetraceIndex(hike.id, 3);
    expect((await store.getHike(hike.id))?.retraceIndex).toBe(3);
  });

  it('refuses to change a hike that does not exist', async () => {
    const store = await freshStore();
    await expect(store.setHikeStatus('nope', 'ended', T0)).rejects.toThrow('No hike');
  });
});

describe('beacons', () => {
  it('saves every field and lists beacons oldest first', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    await store.addBeacon(beacon(hike.id, 30, { reason: 'distance' }));
    const start = await store.addBeacon(
      beacon(hike.id, 0, { reason: 'start', source: 'estimated', accuracyM: 42.5, note: '  Big rock ' }),
    );
    const list = await store.listBeacons(hike.id);
    expect(list.map((b) => b.reason)).toEqual(['start', 'distance']);
    expect(list[0]).toEqual({
      id: start.id,
      hikeId: hike.id,
      timestamp: T0,
      lat: 60.30954,
      lon: 24.52085,
      source: 'estimated',
      accuracyM: 42.5,
      note: 'Big rock',
      hasPhoto: false,
      reason: 'start',
    });
  });

  it('keeps beacons with the same time in the order they were added', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    for (const reason of ['start', 'turn', 'manual'] as const) await store.addBeacon(beacon(hike.id, 5, { reason }));
    expect((await store.listBeacons(hike.id)).map((b) => b.reason)).toEqual(['start', 'turn', 'manual']);
  });

  it('only lists the beacons of the hike asked for', async () => {
    const store = await freshStore();
    const a = await store.startHike(T0);
    await store.addBeacon(beacon(a.id, 0));
    await store.setHikeStatus(a.id, 'ended', T0);
    const b = await store.startHike(T0 + 1);
    await store.addBeacon(beacon(b.id, 0));
    await store.addBeacon(beacon(b.id, 1));
    expect(await store.listBeacons(a.id)).toHaveLength(1);
    expect(await store.listBeacons(b.id)).toHaveLength(2);
  });

  it('adds and clears notes', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    const b = await store.addBeacon(beacon(hike.id, 0));
    await store.setBeaconNote(b.id, '  Stream crossing  ');
    expect((await store.getBeacon(b.id))?.note).toBe('Stream crossing');
    await store.setBeaconNote(b.id, '   ');
    expect((await store.getBeacon(b.id))?.note).toBeNull();
  });

  it('saves, returns and removes a photo', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    const b = await store.addBeacon(beacon(hike.id, 0));
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]); // the start of a JPEG
    await store.setBeaconPhoto(b.id, { type: 'image/jpeg', data: bytes.buffer });
    expect((await store.getBeacon(b.id))?.hasPhoto).toBe(true);
    const photo = await store.getBeaconPhoto(b.id);
    expect(photo?.type).toBe('image/jpeg');
    expect(new Uint8Array(await photo!.arrayBuffer())).toEqual(bytes);

    await store.setBeaconPhoto(b.id, null);
    expect((await store.getBeacon(b.id))?.hasPhoto).toBe(false);
    expect(await store.getBeaconPhoto(b.id)).toBeNull();
  });

  it('refuses impossible values, and saves nothing', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    await expect(store.addBeacon(beacon(hike.id, 0, { lat: 95 }))).rejects.toThrow('latitude 95');
    await expect(store.addBeacon(beacon(hike.id, 0, { lon: -200 }))).rejects.toThrow('longitude');
    await expect(store.addBeacon(beacon(hike.id, 0, { accuracyM: -1 }))).rejects.toThrow('accuracy');
    await expect(store.addBeacon(beacon(hike.id, 0, { source: 'magic' as 'gps' }))).rejects.toThrow('source');
    await expect(store.addBeacon(beacon(hike.id, 0, { reason: 'bored' as 'time' }))).rejects.toThrow('reason');
    await expect(store.addBeacon(beacon(hike.id, 0, { lat: Number.NaN }))).rejects.toThrow('latitude');
    await expect(store.addBeacon(beacon('no-such-hike', 0))).rejects.toThrow("there's no hike");
    expect(await store.listBeacons(hike.id)).toEqual([]);
  });

  it('deletes a hike together with its beacons and photos', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    const b = await store.addBeacon(beacon(hike.id, 0));
    await store.setBeaconPhoto(b.id, { type: 'image/png', data: new Uint8Array([1]).buffer });
    await store.deleteHike(hike.id);
    expect(await store.listHikes()).toEqual([]);
    expect(await store.listBeacons(hike.id)).toEqual([]);
    expect(await store.getBeaconPhoto(b.id)).toBeNull();
  });
});

describe('checkBeacon', () => {
  it('accepts a good beacon', () => {
    expect(() => checkBeacon(beacon('h', 0))).not.toThrow();
  });

  it('lists every problem at once', () => {
    expect(() => checkBeacon(beacon('h', 0, { lat: 99, accuracyM: -5 }))).toThrow(/latitude 99.*accuracy -5/);
  });
});

describe('settings', () => {
  it('uses the defaults until something is saved', async () => {
    const store = await freshStore();
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('saves valid settings and refuses invalid ones', async () => {
    const store = await freshStore();
    expect(await store.saveSettings({ beaconDistanceM: '250', turnAngleDegrees: 30 })).toEqual([]);
    expect(await store.getSettings()).toEqual({ ...DEFAULT_SETTINGS, beaconDistanceM: 250, turnAngleDegrees: 30 });

    const problems = await store.saveSettings({ beaconIntervalMinutes: 0 });
    expect(problems[0]).toContain('Time between beacons');
    expect((await store.getSettings()).beaconIntervalMinutes).toBe(DEFAULT_SETTINGS.beaconIntervalMinutes);
  });

  it('resets to the defaults', async () => {
    const store = await freshStore();
    await store.saveSettings({ beaconDistanceM: 500 });
    await store.resetSettings();
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('surviving a restart', () => {
  it('keeps hikes, beacons, photos and settings after the database is closed and opened again', async () => {
    const name = `restart-${++dbCounter}`;
    const first = await BeaconStore.open(name);
    const hike = await first.startHike(T0);
    const start = await first.addBeacon(beacon(hike.id, 0, { reason: 'start', note: 'Car park' }));
    await first.addBeacon(beacon(hike.id, 15));
    await first.setBeaconPhoto(start.id, { type: 'image/jpeg', data: new Uint8Array([9, 9]).buffer });
    await first.saveSettings({ beaconDistanceM: 400 });
    first.close(); // the app is closed

    const second = await BeaconStore.open(name); // the app is opened again
    expect((await second.getCurrentHike())?.id).toBe(hike.id);
    const beacons = await second.listBeacons(hike.id);
    expect(beacons.map((b) => b.note)).toEqual(['Car park', null]);
    expect(await second.getBeaconPhoto(start.id)).not.toBeNull();
    expect((await second.getSettings()).beaconDistanceM).toBe(400);
    second.close();
  });
});

describe('deleteEverything', () => {
  it('empties every store', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    await store.addBeacon(beacon(hike.id, 0));
    await store.saveSettings({ beaconDistanceM: 400 });
    await store.deleteEverything();
    expect(await store.listHikes()).toEqual([]);
    expect(await store.listBeacons(hike.id)).toEqual([]);
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('recorded readings and calibration (database version 2)', () => {
  it('upgrades a version 1 database without losing its hikes and beacons', async () => {
    const name = `test-${++dbCounter}`;
    // A database exactly as step 2 of the web app created it.
    const old = await openDB(name, 1, {
      upgrade(database) {
        database.createObjectStore('hikes', { keyPath: 'id' }).createIndex('byStatus', 'status');
        const beacons = database.createObjectStore('beacons', { keyPath: 'seq', autoIncrement: true });
        beacons.createIndex('byId', 'id', { unique: true });
        beacons.createIndex('byHikeAndTime', ['hikeId', 'timestamp']);
        database.createObjectStore('photos', { keyPath: 'beaconId' });
        database.createObjectStore('settings');
      },
    });
    await old.add('hikes', { id: 'h1', startedAt: T0, endedAt: null, status: 'active', retraceIndex: null });
    await old.add('beacons', { ...beacon('h1', 0), id: 'b1', note: null, hasPhoto: false });
    await old.put('settings', 20, 'beaconIntervalMinutes');
    old.close();

    const store = await BeaconStore.open(name);
    expect((await store.getCurrentHike())?.id).toBe('h1');
    expect((await store.listBeacons('h1')).map((b) => b.id)).toEqual(['b1']);
    expect((await store.getSettings()).beaconIntervalMinutes).toBe(20);
    await store.addReadings('h1', [{ t: T0, kind: 'steps', count: 2 }]);
    expect(await store.hasReadings('h1')).toBe(true);
  });

  it('saves readings in chunks and gives them back in time order', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    await store.addReadings(hike.id, [
      { t: T0 + 2000, kind: 'steps', count: 1 },
      { t: T0 + 3000, kind: 'heading', magnetic: 87.5 },
    ]);
    await store.addReadings(hike.id, [{ t: T0 + 1000, kind: 'fix', lat: 60.3, lon: 24.5, accuracyM: 6 }]);
    await store.addReadings(hike.id, []); // nothing to save
    expect((await store.getReadings(hike.id)).map((r) => r.t)).toEqual([T0 + 1000, T0 + 2000, T0 + 3000]);
    expect(await store.hasReadings('another hike')).toBe(false);
  });

  it('deletes the readings with their hike', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    await store.addReadings(hike.id, [{ t: T0, kind: 'steps', count: 1 }]);
    await store.deleteHike(hike.id);
    expect(await store.getReadings(hike.id)).toEqual([]);
  });

  it('remembers the learned step length until everything is deleted', async () => {
    const store = await freshStore();
    expect(await store.getLearnedStepLength()).toBeNull();
    await store.saveLearnedStepLength(0.82);
    await store.resetSettings(); // resetting the settings keeps it
    expect(await store.getLearnedStepLength()).toBe(0.82);
    await store.deleteEverything();
    expect(await store.getLearnedStepLength()).toBeNull();
  });

  it('saves a replay as an ended hike that points to the recorded one', async () => {
    const store = await freshStore();
    const replay = await store.addReplayHike('recorded-hike', T0);
    expect(replay).toMatchObject({ status: 'ended', replayOf: 'recorded-hike', startedAt: T0, endedAt: T0 });
    expect(await store.getCurrentHike()).toBeNull();
  });
});

