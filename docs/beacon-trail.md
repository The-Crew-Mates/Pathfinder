# Beacon trail

The beacon trail helps a hiker find the way back when GPS stops working.

- **While a hike is active,** the phone quietly saves **beacons**: points along the route that the hiker can walk back to.
- **If location is lost,** the hiker switches to **Retrace mode**. The compass points to the previous beacon, then the one before it, until they reach the start or GPS comes back.

The code is in [`app/`](../app/README.md) (Expo / React Native, TypeScript).

## Requirements

- **Fully offline.** Beacons are stored on the phone and survive the app closing or the phone restarting.
- **When to drop a beacon:** every **15 minutes**, every **300 m** walked, or when the walking direction changes by more than **45°** and stays changed. Whichever comes first. All three values are configurable.
- **Each beacon stores:**
  - id
  - time
  - latitude/longitude
  - source (`gps` or `estimated`)
  - accuracy in metres
  - an optional note or photo
- **GPS lost:** estimate the position from the last known point using steps and compass heading (dead reckoning). Those beacons are saved as `estimated`, with growing uncertainty.
- **Background:** dropping beacons keeps working with the screen off and the app in the background.
- **Retrace mode shows:**
  - an arrow to the next beacon, corrected from true to magnetic north, calculated offline
  - the distance remaining
  - the beacon's note or photo
  - an **"I'm here"** button that moves on to the previous beacon
  - a message when GPS comes back
- **Battery:** hikes can last 8+ hours, so GPS isn't polled constantly.

## Progress

| Milestone | Status |
|---|---|
| 1. Beacon storage, math module (with tests), settings, debug list | **Done** |
| 2. Dropping beacons with GPS (foreground) | Not started |
| 3. Dead reckoning when GPS is lost, plus "simulate GPS loss" on the debug screen | Not started |
| 4. Retrace mode | Not started |
| 5. Background operation (Android native service) | Not started |
| 6. iOS native part (can't be tested without an iPhone) | Not started |

## Platform limits, and how we handle them

### JavaScript stops in the background on Android
React Native pauses timers when the app leaves the screen, and sensor updates become unreliable. Expo's background location task only wakes the app **when a GPS fix arrives**. With no GPS, nothing wakes it, which is exactly when dead reckoning is needed.

**Our approach (milestone 5):** a small native Android module in Kotlin runs a **foreground service**. That's the permanent "Pathfinder is recording your trail" notification Android requires for anything that keeps working in the background.
- **The service only records sensor samples:** GPS fixes, step-counter readings and compass headings, written to a small on-phone log.
- **Every minute or so,** it briefly starts the JavaScript side (a "headless task"). The TypeScript beacon engine then processes the new samples and drops beacons.
- **All the math and decisions stay in TypeScript,** in one tested place.
- **Nothing is lost if JavaScript is late:** samples carry their timestamps, so beacons get the right time and place when they're processed.

### GPS and battery
- **GPS good:** one fix per minute (configurable), with GPS switched off in between. Turns are detected from the GPS track, so the compass is off.
- **GPS lost** (no usable fix for 90 s): switch to dead reckoning, and retry GPS every 3 minutes.
- **Steps** come from the phone's hardware step counter, which uses almost no power and keeps counting with the screen off.
- **Compass** sampled about once a second, **only while GPS is lost**. On many phones that needs the processor kept awake (with the screen off), which is the main battery cost. So it's limited to the time without GPS.
- **Target:** under about 5% battery per hour with GPS available. Measured on a real 1–2 hour walk.

### Dead reckoning is rough
- **Pocket problem:** the compass shows where the *phone* points, not where the hiker walks. While GPS works, the app learns the difference between the two and applies it later.
- **Step length** starts at 0.75 m and is learned from GPS (GPS distance ÷ steps).
- **Errors still add up,** so estimated beacons show a growing ± uncertainty. The app must never present them as precise.

### Restarts
- **Beacons** are saved in SQLite on the phone, so they always survive.
- **The background service** stops when the phone restarts. Since Android 14 it generally can't restart itself without "Allow all the time" location permission. So after a restart, the hike is marked *paused*, and the app offers to resume it.
- **Some phone brands** (Xiaomi, Samsung, OnePlus and others) kill background apps aggressively. The app will show a one-time tip linking to that brand's settings ([dontkillmyapp.com](https://dontkillmyapp.com)).

### Permissions

**Android:**

| Permission | Why | Asked |
|---|---|---|
| Precise location (`ACCESS_FINE_LOCATION`) | GPS | When starting a hike |
| Physical activity (`ACTIVITY_RECOGNITION`, Android 10+) | Step counter | When starting a hike |
| Notifications (`POST_NOTIFICATIONS`, Android 13+) | The service notification, and "GPS is back" | When starting a hike |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` (Android 14+) | Running the background service | Automatically, no prompt |

- **No "Allow all the time" location is needed.** The service starts while the app is open (the hiker taps "Start hike"), so Android counts it as while-in-use access. That also keeps the app clear of Google Play's strict background-location rules.
- **If something is refused,** the app explains what won't work:
  - without physical activity → no dead reckoning, GPS beacons only
  - without notifications → the service runs, but its notification is hidden

**iOS** (planned; can't be tested without an iPhone):
- **Settings:**
  - "When in use" location
  - motion (step counter)
  - the `location` background mode
- **Risks:** compass updates in the background, and iOS suspending the app when there's no GPS signal, both need testing on a real iPhone.

## Magnetic declination

A compass points to **magnetic** north, while maps and GPS use **true** north. In southern Finland, magnetic north is about **10° east** of true north (2026), so the arrow would be 10° off without a correction.

- **The model:** the app calculates the declination offline with NOAA's **World Magnetic Model 2025**, using the coefficients in `app/src/geo/wmm2025.ts` (public domain, valid until the end of 2029).
- **The tests** check it against NOAA's 12 official test values.
- **Converting:** magnetic bearing = true bearing − declination (east is positive).

## Settings and defaults

| Setting | Default |
|---|---|
| Time between beacons | 15 min |
| Distance between beacons | 300 m |
| Turn angle | 45° |
| Turn must last | 60 s |
| GPS fix every | 60 s |
| GPS counts as lost after | 90 s |
| Retry GPS every (while lost) | 3 min |
| Estimate uncertainty growth | 10% of distance walked |

## Testing without a forest
- **Debug screen:** lists every saved beacon (time, source, accuracy, reason) and can add test beacons. Milestone 3 adds **"Simulate GPS loss"** and **"Replay a trail"**, which walks a real Nuuksio trail from our published bundles with fake steps and heading.
- **Unit tests:** `npm test` in `app/`. They also run on GitHub for every pull request that changes `app/`.
