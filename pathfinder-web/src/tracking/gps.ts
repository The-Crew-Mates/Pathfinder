// GPS, gently: instead of keeping GPS on all the time, ask for ONE position
// every "GPS fix every" seconds (60 by default). Between requests the phone can
// switch the GPS chip off, which saves battery on long hikes.
//
// It also decides when GPS counts as lost (no usable position for "GPS counts
// as lost after" seconds), and then only retries every "Retry GPS every"
// minutes, because searching for a signal that isn't there is expensive.

import type { Settings } from '../beacons/settings';
import { type Fix, POOR_ACCURACY_M } from './engine';

export type GpsStatus =
  | 'off' // no hike running
  | 'searching' // waiting for the first usable position
  | 'good' // recent usable position
  | 'lost' // no usable position for a while
  | 'denied' // the hiker (or the browser) blocked location
  | 'unsupported'; // this browser has no GPS access

type Options = {
  /** The browser's location service. Tests pass a fake one. */
  geolocation: Geolocation | undefined;
  /** Read the current settings (they can change during a hike). */
  settings: () => Settings;
  onFix: (fix: Fix) => void;
  /** Called whenever the status changes. `wasLost` is true when GPS comes back after being lost. */
  onStatus: (status: GpsStatus, wasLost: boolean) => void;
};

export class GpsTracker {
  private status: GpsStatus = 'off';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private waitingForFix = false;
  private startedAt = 0;
  private lastGoodAt: number | null = null;

  constructor(private options: Options) {}

  getStatus(): GpsStatus {
    return this.status;
  }

  start(): void {
    if (!this.options.geolocation) {
      this.setStatus('unsupported');
      return;
    }
    this.stop();
    this.startedAt = Date.now();
    this.lastGoodAt = null;
    this.setStatus('searching');
    this.request();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.waitingForFix = false;
    this.setStatus('off');
  }

  /** Ask for a position right now, e.g. when the screen comes back on. */
  requestNow(): void {
    if (this.status === 'off' || this.status === 'denied' || this.status === 'unsupported') return;
    if (this.waitingForFix) return; // a request is already on its way
    if (this.timer) clearTimeout(this.timer);
    this.request();
  }

  private request(): void {
    const settings = this.options.settings();
    this.timer = null;
    this.waitingForFix = true;
    this.options.geolocation!.getCurrentPosition(
      (position) => this.handlePosition(position),
      (error) => this.handleError(error),
      {
        enableHighAccuracy: true, // real GPS, not the rough position from Wi-Fi or masts
        maximumAge: 0, // a fresh position, not a remembered one
        timeout: Math.min(30_000, settings.gpsIntervalSeconds * 1000), // give up waiting after this long
      },
    );
  }

  private handlePosition(position: GeolocationPosition): void {
    if (this.status === 'off') return; // stopped while waiting
    this.waitingForFix = false;
    const fix: Fix = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracyM: position.coords.accuracy,
      timestamp: position.timestamp || Date.now(),
    };
    if (fix.accuracyM <= POOR_ACCURACY_M) {
      const wasLost = this.status === 'lost';
      this.lastGoodAt = Date.now();
      this.setStatus('good', wasLost);
      this.options.onFix(fix);
    } else {
      this.checkIfLost(); // a position this rough doesn't count as GPS working
    }
    this.scheduleNext();
  }

  private handleError(error: GeolocationPositionError): void {
    if (this.status === 'off') return;
    this.waitingForFix = false;
    if (error.code === error.PERMISSION_DENIED) {
      this.setStatus('denied');
      return; // asking again won't help until the hiker allows it
    }
    // Timeout or "position unavailable": normal under trees or in a valley.
    this.checkIfLost();
    this.scheduleNext();
  }

  private checkIfLost(): void {
    const lostAfterMs = this.options.settings().gpsLostAfterSeconds * 1000;
    const since = this.lastGoodAt ?? this.startedAt;
    if (Date.now() - since >= lostAfterMs) this.setStatus('lost');
  }

  private scheduleNext(): void {
    const settings = this.options.settings();
    const delay = this.status === 'lost' ? settings.gpsRetryMinutes * 60_000 : settings.gpsIntervalSeconds * 1000;
    this.timer = setTimeout(() => this.request(), delay);
  }

  private setStatus(status: GpsStatus, wasLost = false): void {
    if (status === this.status) return;
    this.status = status;
    this.options.onStatus(status, wasLost);
  }
}
