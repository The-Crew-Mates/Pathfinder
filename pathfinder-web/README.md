# Pathfinder web app

The Pathfinder hiking app, built as an installable web app that works offline. It started as the frontend team's design prototype (made with Google AI Studio). It keeps that design, and gets real features step by step: beacons, GPS, dead reckoning and retracing your steps.

**Live:** https://the-crew-mates.github.io/Pathfinder/app/ (once the `web-app` branch is merged).

## What a web app can and can't do
- **Works offline.** The first visit saves the whole app on the phone (it's a "PWA"), so it opens with no signal. On Android Chrome you can also choose **Add to home screen**.
- **Needs the app open on screen to track.** Phone browsers stop GPS and sensors when the screen turns off or the page is hidden. Hike mode will keep the screen awake.
- **Needs HTTPS for GPS and the compass.** GitHub Pages is HTTPS. On your own computer, `localhost` also counts as secure.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:3000 on your computer.

**On your phone,** on the same Wi-Fi:
```bash
npm run dev:phone
```
This serves over HTTPS with a self-signed certificate, because phones only allow GPS and the compass on secure sites. Open the `https://…:3000` address it prints. Your phone warns about the certificate once; choose to continue.

## Checks

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest): the math (magnetic declination is checked against NOAA's official values), plus beacon storage (run with `fake-indexeddb`, including a close-and-reopen test), the beacon rules, and the GPS tracker (with a fake GPS and fake timers) |
| `npm run lint` | Typecheck |
| `npm run build` then `npm run check-offline` | Builds the app into `dist/`, then fails if anything in it loads from the internet |

The GitHub Action runs all of these on every pull request, then publishes the app at `/Pathfinder/app/` on merge.

## Hike mode
Tap **Start hike** on the Live Navigation screen. While the hike runs, on whichever screen you're on:
- **GPS, gently.** Pathfinder asks for one GPS position every "GPS fix every" seconds (60 by default), instead of keeping GPS on all the time, so the phone can rest the GPS chip in between. If there's no usable position for 90 s, GPS counts as *lost*, and it only retries every 3 minutes.
- **Beacons drop by themselves** on the first of these rules (`src/tracking/engine.ts`), and then all three start over:
  - **time:** 15 minutes since the last beacon
  - **distance:** 300 m walked
  - **turn:** the walking direction changed by more than 45° and stayed changed for 60 s
- **GPS wobble doesn't count as walking.** Standing still, GPS wobbles a few metres. A movement only counts if it's bigger than both fixes' accuracy added together, so a break at a viewpoint doesn't add up distance or fake turns.
- **Drop beacon here** saves a beacon at your current position, with an optional note and photo.
- **The screen stays on**, using the browser's Wake Lock, because a web page can't track with the screen off. The top bar shows the battery level.
- **When you come back to the app** after the screen was off, it gets a GPS fix straight away and catches up on the time rule. Nothing is tracked while the screen is off.
- **If the app is reloaded or reopened during a hike,** the hike carries on from its last beacon.

On the Live screen, the **top bar**, the **mascot's message**, the **hike panel** and the **map** show real data. The "next checkpoint" card and the confidence card are still the prototype's illustration until later steps.

## The map (demo)
- **One demo area:** a 3 × 3 km area around Varala and Pyynikki in Tampere, drawn from real map data.
- **What's on it:**
  - **from OpenStreetMap:** paths, roads, water, streams, forest and parks
  - **from Lipas:** official trails (the Pyynikki and Viikinsaari nature trails), highlighted in green
  - **landmarks:** viewpoints, parking and water points
  - **your beacons,** numbered
  - **your position,** with its ± accuracy circle
- **Using it:** it follows you while you hike. Drag to look around, use **recenter** to follow you again, and **+ / −** to zoom.
- **Offline:** the data (`public/maps/tampere-varala.json`, 165 KB) ships with the app, so the map works offline. OpenStreetMap's map *images* can't be saved for offline use under its usage rules, so the app draws the map itself from the data.
- **Credits:** the map shows "© OpenStreetMap contributors · Lipas", as their licenses require.
- **Rebuilding the data:** from the repo folder, run `python3 scripts/build_demo_map.py`. It needs internet, and `--refresh` downloads everything again.

## Beacon storage and the debug screen
- **Where beacons live:** hikes, beacons (with their notes and photos) and settings are saved in the browser's built-in database (IndexedDB), in `src/beacons/store.ts`. That data stays on the phone and survives closing the app or restarting the phone.
- **Keeping data safe:** the app asks the browser for *persistent storage*, so it won't delete beacons when the phone runs low on space. Chrome usually agrees once the app is added to the home screen.
- **Debug screen:** open it with **Debug tools** at the bottom of the Confidence screen, or add `#debug` to the address. It shows:
  - whether the browser promised to keep the data
  - the current hike and its beacons
  - test buttons: add a test beacon, attach a photo, and delete everything
  - the beacon settings (15 min / 300 m / 45° by default)

## Fonts, icons and images are bundled
Nothing is loaded from Google Fonts or image servers, so the app looks right offline.
- **Fonts:** Plus Jakarta Sans and Space Grotesk come from npm packages (Latin alphabet only, which covers ä ö å).
- **Icons:** Material Symbols, trimmed to the icons the screens use (60 KB instead of 4 MB). **If you use a new icon name, run `npm run icons`** (it needs internet). Otherwise the icon shows up as plain text. The script also finds icons chosen in code, like `{isDark ? 'light_mode' : 'dark_mode'}`.
- **Images:** they live in `src/assets/images/` and are imported in the code.

## Where things are

| Folder | What's in it |
|---|---|
| `src/components/screens/` | The three main screens: Live navigation, Active backtrack, Confidence and calibration |
| `src/components/` | The Compass, Checkpoint and QR scanner pop-ups |
| `src/components/screens/DebugScreen.tsx` | The debug screen |
| `src/geo/` | The math: distance, bearing, dead reckoning, magnetic declination (World Magnetic Model 2025) |
| `src/beacons/` | Beacon types, settings, and the IndexedDB store |
| `src/tracking/` | Hike mode: the beacon rules (`engine.ts`), GPS (`gps.ts`), keeping the screen on, the battery level, and `HikeProvider.tsx`, which runs it all |
| `src/components/hike/` | The hike panel, GPS status bar and mascot messages on the Live screen |
| `src/components/map/RealMap.tsx`, `src/map/` | The real map, and loading and projecting its data |
| `public/maps/` | The demo map's data, built by `scripts/build_demo_map.py` |
| `src/lib/` | The store provider (shares the database with every screen), and helpers |
| `src/assets/` | The bundled fonts and images |
| `tests/` | Unit tests |
| `scripts/` | `icon-font.mjs` (rebuilds the icon font), `check-offline.mjs` |
| `public/icons/` | App icons for the home screen (placeholders made from the mascot) |
