# Pathfinder app

The Pathfinder mobile app, built with [Expo](https://expo.dev) (React Native, TypeScript, Expo SDK 58).

Its first feature is the **beacon trail**:
- **While you hike,** the phone saves *beacons*: points along your route you can walk back to.
- **If you lose GPS,** Retrace mode points you back from beacon to beacon with the compass.

The full plan, with all its milestones, is in [docs/beacon-trail.md](../docs/beacon-trail.md).

## Status

| Milestone | Status |
|---|---|
| 1. Beacon storage, math module, settings, debug list | **Done** |
| 2. Dropping beacons with GPS | Not started |
| 3. Dead reckoning when GPS is lost | Not started |
| 4. Retrace mode | Not started |
| 5. Background operation (screen off) | Not started |

## Run it on your Android phone

Milestones 1–4 only use features built into the free **Expo Go** app, so no special build is needed yet.

1. Install **Expo Go** from the Play Store on your phone.
2. On your Mac, from this folder:
   ```bash
   npm install
   ```
   ```bash
   npx expo start
   ```
3. Make sure the phone and the Mac are on the same Wi-Fi. Then scan the QR code in the terminal with Expo Go.

Changes you save on the Mac reload on the phone straight away.

Milestone 5 (working with the screen off) needs native code, which Expo Go can't run. That's when we'll make a *development build* with EAS Build, Expo's free cloud build service, and that needs an Expo account.

## Tests and checks

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npx expo lint
```

The tests run offline in about a second. They cover:
- **The math** in `src/geo/`: distance, bearing, dead reckoning, and magnetic declination checked against NOAA's official World Magnetic Model test values.
- **Storage** in `src/beacons/store.ts`: real SQL, run with Node's built-in SQLite, including a "close and reopen the app" test.
- **Settings.**

The GitHub Action in `.github/workflows/app-tests.yml` runs all three checks on every pull request that changes `app/`.

## Where things are

| Folder | What's in it |
|---|---|
| `src/app/` | Screens: hike (`index`), `settings`, `debug` (Expo Router: every file is a screen) |
| `src/geo/` | All the math, as pure functions with no Expo code, so it's easy to test |
| `src/beacons/` | Beacon types, settings and the SQLite store |
| `src/lib/` | Shared screen pieces: theme, buttons, the store provider |
| `__tests__/` | Unit tests |
| `test-helpers/` | Lets the tests use Node's SQLite instead of the phone's |

The magnetic model's numbers (`src/geo/wmm2025.ts`) come from NOAA's public-domain WMM2025 file and are valid until the end of 2029. NOAA publishes the next model, WMM2030, at the end of 2029.
