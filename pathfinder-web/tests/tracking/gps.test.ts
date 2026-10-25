// Tests for the GPS tracker, with a fake GPS and fake timers so minutes pass instantly.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/beacons/settings';
import type { Fix } from '../../src/tracking/engine';
import { GpsTracker, type GpsStatus } from '../../src/tracking/gps';

type Answer = { accuracy: number } | 'timeout' | 'unavailable' | 'denied';

/** A pretend GPS: answers each request after 2 s with the next answer in its list. */
class FakeGeolocation {
  answers: Answer[] = [];
  requests = 0;
  lastOptions: PositionOptions | undefined;

  getCurrentPosition(success: PositionCallback, failure?: PositionErrorCallback | null, options?: PositionOptions) {
    this.requests++;
    this.lastOptions = options;
    const answer = this.answers.shift() ?? 'timeout';
    setTimeout(() => {
      if (typeof answer === 'object') {
        success({
          coords: { latitude: 60.3, longitude: 24.5, accuracy: answer.accuracy } as GeolocationCoordinates,
          timestamp: Date.now(),
        } as GeolocationPosition);
      } else {
        const code = { denied: 1, unavailable: 2, timeout: 3 }[answer];
        failure?.({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: answer } as GeolocationPositionError);
      }
    }, 2000);
  }
}

function setup(answers: Answer[]) {
  const geo = new FakeGeolocation();
  geo.answers = answers;
  const fixes: Fix[] = [];
  const hidden: Fix[] = [];
  const readings: Fix[] = [];
  const statuses: { status: GpsStatus; wasLost: boolean }[] = [];
  const tracker = new GpsTracker({
    geolocation: geo as unknown as Geolocation,
    settings: () => DEFAULT_SETTINGS, // fix every 60 s, lost after 90 s, retry every 3 min
    onFix: (f) => fixes.push(f),
    onHiddenFix: (f) => hidden.push(f),
    onReading: (f) => readings.push(f),
    onStatus: (status, wasLost) => statuses.push({ status, wasLost }),
  });
  return { geo, tracker, fixes, hidden, readings, statuses };
}

const seconds = (s: number) => vi.advanceTimersByTime(s * 1000);

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-25T09:00:00Z') }));
afterEach(() => vi.useRealTimers());

describe('GpsTracker', () => {
  it('asks for one fresh, accurate position at a time, then waits the fix interval', () => {
    const { geo, tracker, fixes, statuses } = setup([{ accuracy: 8 }, { accuracy: 9 }]);
    tracker.start();
    expect(statuses.at(-1)?.status).toBe('searching');
    expect(geo.lastOptions).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
    seconds(2);
    expect(fixes).toHaveLength(1);
    expect(statuses.at(-1)?.status).toBe('good');
    expect(geo.requests).toBe(1);
    seconds(59);
    expect(geo.requests).toBe(1); // GPS can rest between fixes
    seconds(2);
    expect(geo.requests).toBe(2);
  });

  it('does not pass on rough positions, and they do not count as GPS working', () => {
    const { tracker, fixes, statuses } = setup([{ accuracy: 80 }]);
    tracker.start();
    seconds(2);
    expect(fixes).toHaveLength(0);
    expect(statuses.at(-1)?.status).toBe('searching');
  });

  it('marks GPS as lost after 90 s without a usable position, then only retries every 3 minutes', () => {
    const { geo, tracker, statuses } = setup([{ accuracy: 8 }, 'timeout', 'unavailable', 'timeout', 'timeout']);
    tracker.start();
    seconds(2); // good fix at 2 s
    seconds(62); // second request (64 s) fails
    expect(statuses.at(-1)?.status).toBe('good'); // only 62 s since the last good fix
    seconds(62); // third request (126 s) fails: 124 s since the good fix
    expect(statuses.at(-1)?.status).toBe('lost');
    const requestsWhenLost = geo.requests;
    seconds(170);
    expect(geo.requests).toBe(requestsWhenLost); // not every minute any more...
    seconds(15);
    expect(geo.requests).toBe(requestsWhenLost + 1); // ...but every 3 minutes
  });

  it('says when GPS comes back after being lost', () => {
    const { tracker, statuses } = setup(['timeout', 'timeout', 'timeout', { accuracy: 7 }]);
    tracker.start();
    seconds(2 + 62 + 62); // failures at 2 s, 64 s and 126 s: over 90 s since starting, so lost
    expect(statuses.at(-1)).toEqual({ status: 'lost', wasLost: false });
    seconds(182); // the retry 3 minutes later gets a good fix
    expect(statuses.at(-1)).toEqual({ status: 'good', wasLost: true });
  });

  it('stops asking if the hiker blocks location', () => {
    const { geo, tracker, statuses } = setup(['denied']);
    tracker.start();
    seconds(2);
    expect(statuses.at(-1)?.status).toBe('denied');
    seconds(600);
    expect(geo.requests).toBe(1);
  });

  it('asks straight away on requestNow, but never twice at once', () => {
    const { geo, tracker } = setup([{ accuracy: 8 }, { accuracy: 8 }]);
    tracker.start();
    tracker.requestNow(); // the first request is still waiting: ignored
    expect(geo.requests).toBe(1);
    seconds(10); // first answer arrived; next one is scheduled for 60 s later
    tracker.requestNow(); // e.g. the screen came back on
    expect(geo.requests).toBe(2);
  });

  it('stops completely, ignoring an answer that arrives after stopping', () => {
    const { geo, tracker, fixes, statuses } = setup([{ accuracy: 8 }]);
    tracker.start();
    tracker.stop();
    seconds(600);
    expect(fixes).toHaveLength(0);
    expect(statuses.at(-1)?.status).toBe('off');
    expect(geo.requests).toBe(1);
  });

  it('reports when the browser has no GPS access at all', () => {
    const statuses: GpsStatus[] = [];
    const tracker = new GpsTracker({
      geolocation: undefined,
      settings: () => DEFAULT_SETTINGS,
      onFix: () => {},
      onStatus: (s) => statuses.push(s),
    });
    tracker.start();
    expect(statuses).toEqual(['unsupported']);
  });

  it('simulated loss: lost straight away, positions hidden but still read every minute, then GPS is back', () => {
    const { geo, tracker, fixes, hidden, readings, statuses } = setup([
      { accuracy: 8 },
      { accuracy: 8 },
      { accuracy: 90 },
      { accuracy: 8 },
      { accuracy: 8 },
    ]);
    tracker.start();
    seconds(2);
    tracker.simulateLoss(true);
    expect(statuses.at(-1)).toEqual({ status: 'lost', wasLost: false });
    seconds(62); // the next fix (asked at 62 s): hidden
    expect(fixes).toHaveLength(1);
    expect(hidden).toHaveLength(1);
    seconds(62); // a rough one (asked at 124 s): neither passed on nor hidden, but recorded
    expect(hidden).toHaveLength(1);
    expect(readings).toHaveLength(3);
    expect(geo.requests).toBe(3); // still once a minute, not every 3 minutes
    tracker.simulateLoss(false); // asks at once
    seconds(2);
    expect(fixes).toHaveLength(2);
    expect(statuses.at(-1)).toEqual({ status: 'good', wasLost: true });
  });
});
