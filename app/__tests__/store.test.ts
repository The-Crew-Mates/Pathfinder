import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_SETTINGS } from '../src/beacons/settings';
import { BeaconStore } from '../src/beacons/store';
import type { NewBeacon } from '../src/beacons/types';
import { counterIds, nodeDatabase } from '../test-helpers/nodeSqlite';

const T0 = Date.UTC(2026, 9, 25, 9, 0);

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

async function freshStore() {
  return BeaconStore.open(nodeDatabase(), counterIds());
}

describe('hikes', () => {
  it('starts a hike and finds it as the current one', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    expect(hike).toEqual({ id: 'id-1', startedAt: T0, endedAt: null, status: 'active', retraceIndex: null });
    expect(await store.getCurrentHike()).toEqual(hike);
  });

  it('allows only one hike in progress at a time', async () => {
    const store = await freshStore();
    await store.startHike(T0);
    await expect(store.startHike(T0 + 1000)).rejects.toThrow('already in progress');
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

  it('remembers where Retrace mode got to', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    await store.setRetraceIndex(hike.id, 3);
    expect((await store.getHike(hike.id))?.retraceIndex).toBe(3);
  });
});

describe('beacons', () => {
  it('saves every field and lists beacons oldest first', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    await store.addBeacon(beacon(hike.id, 30, { reason: 'distance' }));
    await store.addBeacon(
      beacon(hike.id, 0, { reason: 'start', source: 'estimated', accuracyM: 42.5, note: 'Big rock' }),
    );
    const list = await store.listBeacons(hike.id);
    expect(list.map((b) => b.reason)).toEqual(['start', 'distance']);
    expect(list[0]).toEqual({
      id: 'id-3',
      hikeId: hike.id,
      timestamp: T0,
      lat: 60.30954,
      lon: 24.52085,
      source: 'estimated',
      accuracyM: 42.5,
      note: 'Big rock',
      photoUri: null,
      reason: 'start',
    });
  });

  it('adds and clears notes and photos', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    const b = await store.addBeacon(beacon(hike.id, 0));
    await store.setBeaconNote(b.id, '  Stream crossing  ');
    await store.setBeaconPhoto(b.id, 'file:///photos/1.jpg');
    let [saved] = await store.listBeacons(hike.id);
    expect(saved.note).toBe('Stream crossing');
    expect(saved.photoUri).toBe('file:///photos/1.jpg');
    await store.setBeaconNote(b.id, '   ');
    [saved] = await store.listBeacons(hike.id);
    expect(saved.note).toBeNull();
  });

  it('refuses impossible values', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    await expect(store.addBeacon(beacon(hike.id, 0, { lat: 95 }))).rejects.toThrow();
    await expect(store.addBeacon(beacon(hike.id, 0, { accuracyM: -1 }))).rejects.toThrow();
    await expect(store.addBeacon(beacon(hike.id, 0, { source: 'magic' as 'gps' }))).rejects.toThrow();
    await expect(store.addBeacon(beacon('no-such-hike', 0))).rejects.toThrow();
  });

  it('deletes a hike together with its beacons', async () => {
    const store = await freshStore();
    const hike = await store.startHike(T0);
    await store.addBeacon(beacon(hike.id, 0));
    await store.deleteHike(hike.id);
    expect(await store.listBeacons(hike.id)).toEqual([]);
    expect(await store.listHikes()).toEqual([]);
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
  it('keeps hikes, beacons and settings after the database is closed and opened again', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pathfinder-test-'));
    const file = join(folder, 'pathfinder.db');
    try {
      const firstDb = nodeDatabase(file);
      const first = await BeaconStore.open(firstDb, counterIds());
      const hike = await first.startHike(T0);
      await first.addBeacon(beacon(hike.id, 0, { reason: 'start' }));
      await first.addBeacon(beacon(hike.id, 15));
      await first.saveSettings({ beaconDistanceM: 400 });
      firstDb.close(); // the app is closed

      const secondDb = nodeDatabase(file); // the app is opened again
      const second = await BeaconStore.open(secondDb, counterIds());
      expect((await second.getCurrentHike())?.id).toBe(hike.id);
      expect(await second.listBeacons(hike.id)).toHaveLength(2);
      expect((await second.getSettings()).beaconDistanceM).toBe(400);
      secondDb.close();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
