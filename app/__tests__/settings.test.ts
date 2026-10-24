import { DEFAULT_SETTINGS, SETTING_FIELDS, validateSettings } from '../src/beacons/settings';

describe('validateSettings', () => {
  it('uses the defaults the user asked for: 15 min, 300 m, 45°', () => {
    expect(DEFAULT_SETTINGS.beaconIntervalMinutes).toBe(15);
    expect(DEFAULT_SETTINGS.beaconDistanceM).toBe(300);
    expect(DEFAULT_SETTINGS.turnAngleDegrees).toBe(45);
  });

  it('fills in defaults for anything missing', () => {
    expect(validateSettings({})).toEqual({ settings: DEFAULT_SETTINGS, problems: [] });
  });

  it('accepts numbers typed as text, including a decimal comma', () => {
    const { settings, problems } = validateSettings({ beaconDistanceM: '250', deadReckoningErrorPercent: '7,5' });
    expect(problems).toEqual([]);
    expect(settings.beaconDistanceM).toBe(250);
    expect(settings.deadReckoningErrorPercent).toBe(7.5);
  });

  it('explains values that are out of range or not numbers, and keeps the default', () => {
    const { settings, problems } = validateSettings({ turnAngleDegrees: 500, beaconDistanceM: 'far' });
    expect(problems).toHaveLength(2);
    expect(problems.join(' ')).toContain('Turn angle: must be between 10 and 180');
    expect(problems.join(' ')).toContain('isn’t a number');
    expect(settings.turnAngleDegrees).toBe(DEFAULT_SETTINGS.turnAngleDegrees);
  });

  it('has a screen field for every setting, with the default inside its limits', () => {
    expect(SETTING_FIELDS.map((f) => f.key).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    for (const field of SETTING_FIELDS) {
      const value = DEFAULT_SETTINGS[field.key];
      expect(value).toBeGreaterThanOrEqual(field.min);
      expect(value).toBeLessThanOrEqual(field.max);
    }
  });
});
