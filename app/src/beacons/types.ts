/** Where a beacon's position came from. */
export type BeaconSource = 'gps' | 'estimated';

/** Why a beacon was dropped. Shown on the debug screen; useful for testing the rules. */
export type BeaconReason = 'start' | 'time' | 'distance' | 'turn' | 'manual';

export type Beacon = {
  id: string;
  hikeId: string;
  /** When it was dropped, in milliseconds since 1970 (like Date.now()). */
  timestamp: number;
  lat: number;
  lon: number;
  source: BeaconSource;
  /** How far off the position might be, in metres. Estimated beacons get bigger values the longer GPS is gone. */
  accuracyM: number;
  note: string | null;
  /** A photo saved in the app's own folder. */
  photoUri: string | null;
  reason: BeaconReason;
};

/** A beacon before it's saved (the store gives it an id). */
export type NewBeacon = Omit<Beacon, 'id' | 'note' | 'photoUri'> & {
  note?: string | null;
  photoUri?: string | null;
};

export type HikeStatus = 'active' | 'paused' | 'ended';

export type Hike = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  status: HikeStatus;
  /** Which beacon Retrace mode is heading to (its position in time order), or null when not retracing. */
  retraceIndex: number | null;
};
