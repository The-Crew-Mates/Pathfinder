// The values the hiker can change on the Settings screen, with their defaults
// and sensible limits.

export type Settings = {
  /** Drop a beacon after this many minutes... */
  beaconIntervalMinutes: number;
  /** ...or after walking this many metres... */
  beaconDistanceM: number;
  /** ...or when the walking direction changes by more than this many degrees... */
  turnAngleDegrees: number;
  /** ...and stays changed for at least this many seconds. Whichever comes first. */
  turnSustainSeconds: number;
  /** While GPS works, get a fix this often (longer saves battery). */
  gpsIntervalSeconds: number;
  /** Count GPS as lost after this long without a usable fix. */
  gpsLostAfterSeconds: number;
  /** While GPS is lost, try again this often. */
  gpsRetryMinutes: number;
  /** How fast the uncertainty of estimated positions grows, in % of the distance walked. */
  deadReckoningErrorPercent: number;
};

export const DEFAULT_SETTINGS: Settings = {
  beaconIntervalMinutes: 15,
  beaconDistanceM: 300,
  turnAngleDegrees: 45,
  turnSustainSeconds: 60,
  gpsIntervalSeconds: 60,
  gpsLostAfterSeconds: 90,
  gpsRetryMinutes: 3,
  deadReckoningErrorPercent: 10,
};

export type SettingField = {
  key: keyof Settings;
  label: string;
  unit: string;
  min: number;
  max: number;
  help: string;
};

/** Everything the Settings screen shows, in order. */
export const SETTING_FIELDS: readonly SettingField[] = [
  { key: 'beaconIntervalMinutes', label: 'Time between beacons', unit: 'min', min: 1, max: 120, help: 'Drop a beacon at least this often.' },
  { key: 'beaconDistanceM', label: 'Distance between beacons', unit: 'm', min: 25, max: 5000, help: 'Drop a beacon after walking this far.' },
  { key: 'turnAngleDegrees', label: 'Turn angle', unit: '°', min: 10, max: 180, help: 'Drop a beacon when your direction changes this much...' },
  { key: 'turnSustainSeconds', label: 'Turn must last', unit: 's', min: 5, max: 600, help: '...and stays changed this long, so small wiggles don’t count.' },
  { key: 'gpsIntervalSeconds', label: 'GPS fix every', unit: 's', min: 10, max: 600, help: 'Longer saves battery; shorter makes beacons more precise.' },
  { key: 'gpsLostAfterSeconds', label: 'GPS counts as lost after', unit: 's', min: 30, max: 1200, help: 'Switch to estimating your position after this long without GPS.' },
  { key: 'gpsRetryMinutes', label: 'Retry GPS every', unit: 'min', min: 1, max: 30, help: 'How often to look for GPS again while it’s lost.' },
  { key: 'deadReckoningErrorPercent', label: 'Estimate uncertainty growth', unit: '%', min: 1, max: 50, help: 'How quickly estimated positions become less certain, per distance walked.' },
];

/**
 * Fill in missing values with defaults and keep everything within its limits.
 * Returns the cleaned settings plus a list of problems to show the hiker.
 */
export function validateSettings(input: Partial<Record<keyof Settings, unknown>>): {
  settings: Settings;
  problems: string[];
} {
  const settings = { ...DEFAULT_SETTINGS };
  const problems: string[] = [];
  for (const field of SETTING_FIELDS) {
    const raw = input[field.key];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(value)) {
      problems.push(`${field.label}: “${String(raw)}” isn’t a number.`);
    } else if (value < field.min || value > field.max) {
      problems.push(`${field.label}: must be between ${field.min} and ${field.max} ${field.unit}.`);
    } else {
      settings[field.key] = value;
    }
  }
  return { settings, problems };
}
