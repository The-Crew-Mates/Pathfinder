# Pathfinder roadmap: trail data backend

Pathfinder is an app that helps hikers find their way without GPS. This file is the plan for the trail data part of the backend. Future work sessions should read it first.

## Team

We're a 4-person team:

- **Frontend (2 people):** build the app, designed in Google Stitch.
- **Backend person 1:** users, trip plans and safety alerts.
- **Backend person 2 (owner of this roadmap):** the trail database, the offline trail bundles, and hosting them.

The trail database is SQLite, with `trails` and `landmarks` tables. Everything is written in Python. The owner is still learning, so choices should be explained simply.

## Working agreement

Work through the phases **one at a time**. For each phase:

1. Show the plan first.
2. Wait for an OK.
3. Build it.
4. Explain how to test it.
5. Stop. Don't start the next phase until asked.

## Phase 1: Trail bundles

- A script that reads the SQLite database and exports each trail with its landmarks as a JSON bundle (including a version number and `updated_at`).
- Generate an `index.json` listing every trail with id, name, region, difficulty, length_km, version and bundle URL.
- Put the output in a folder that can be published as static files.
- Document the exact JSON format in `docs/bundle-format.md` for the frontend team.

## Phase 2: Publish the bundles

- Publish the bundle folder as static files on GitHub Pages. If our repo is private, explain the options (GitHub Pages needs a public repo on a free account) and suggest a free alternative.
- Ideally, set up a GitHub Action that regenerates and republishes the bundles when the trail data changes.
- Add a README section with the live URLs and how to update the bundles.

## Phase 3: Real trail data

- A script that fetches official hiking routes in Finland from the Lipas API.
- Add nearby shelters, wilderness huts, viewpoints, water and parking from OpenStreetMap's Overpass API (points within about 100 m of the route).
- Calculate `length_km` from the route geometry and import everything into our SQLite tables, replacing the placeholder data.
- Credit sources properly: "© OpenStreetMap contributors" (ODbL) and Lipas / University of Jyväskylä (CC BY 4.0).

## Status

| Phase | Status |
|---|---|
| Phase 1: Trail bundles | Done (merged in PR #4) |
| Phase 2: Publish the bundles | Done (merged in PR #4, live since 2026-10-24) |
| Phase 3: Real trail data | Done (merged in PR #6, live) |
| Web app (beacon trail), steps 1–2 of 6: offline base, beacon storage + debug screen | Built and tested locally (branch `web-app`), waiting for review |

The repo lives at `github.com/The-Crew-Mates/Pathfinder` (public).

**Web app (beacon trail):** the frontend team's prototype in `pathfinder-web/` is becoming the real app: an installable web app that works offline, published at `/Pathfinder/app/`. The steps:
1. offline base: local fonts and images, PWA, math module, publishing
2. beacon storage and the debug screen
3. hike mode with GPS
4. dead reckoning
5. Retrace on the Backtrack screen
6. polish

**Decision:** a web app can't track with the screen off, so hike mode keeps the screen awake. The Expo version (`app/`, branch `beacon-trail`) is paused; its math module moved into the web app. See `pathfinder-web/README.md`.

**Already built:**

- **Database** (on `main`, PR #1):
  - `db/schema.sql`: the `trails` and `landmarks` tables, data checks, and triggers that raise a trail's `version` whenever it or its landmarks change.
  - `scripts/create_db.py`: creates `pathfinder.db`.
  - `scripts/seed.py`: adds 3 placeholder trails, now for testing only.
- **Phase 1** (on `main`): `scripts/build_bundles.py` builds `public/index.json` + `public/trails/<slug>.json`. The format is documented in `docs/bundle-format.md`.
- **Phase 2** (on `main`): `.github/workflows/publish-bundles.yml` builds and publishes `public/` on GitHub Pages whenever `pathfinder.db`, `scripts/` or `db/` change on `main`. Live at https://the-crew-mates.github.io/Pathfinder/index.json.
- **Phase 3** (branch `real-trail-data`):
  - `scripts/import_trails.py` imports active hiking routes (Lipas type 4405) and nature trails (4404) in Espoo, Kirkkonummi and Vihti, plus OpenStreetMap landmarks within 100 m. That's 30 trails; 6 more are skipped because their route pieces don't connect.
  - `scripts/geo.py` holds the map maths.
  - `tests/` holds offline tests, which the Action also runs.

**Decisions made:**

- **Where the data lives:**
  - `pathfinder.db` is committed. It's the source of truth, because the version numbers live in it; rebuilding it from scratch would reset every version to 1.
  - `public/` is not committed. The Action builds it.
  - Bundle URLs in `index.json` are relative.
- **How the import works:**
  - The import runs on a person's computer, not on GitHub. Its result is reviewed in a PR before it goes live.
  - Re-imports update in place: unchanged trails keep their version, a changed trail goes up by exactly 1, and slugs never change. Each imported trail stores `source_id` (for example `lipas:527088`) and a `source_hash` fingerprint for this.
  - OpenStreetMap is asked once for all routes (the public Overpass server is often busy). Downloads are cached for 24 h in `cache/` (not committed).
- **Data rules:**
  - Routes with detached pieces are skipped rather than guessed.
  - Difficulty is estimated from length: under 5 km easy, 5–12 km moderate, over 12 km hard.
  - Parking lots within 150 m of each other count as one place; other landmark types merge at 30 m. Information boards tagged as parking are skipped.
  - Route points include `ele` (elevation) when Lipas has it.
  - Landmark type `hut` was added for wilderness huts.

## Open questions and ideas for later

- **Skipped routes:** 6 of the 36 routes have side branches or detached parts. Supporting them would need routes made of several lines, which is a bundle format change.
- **Schema changes on a database with real versions:** the Phase 3 schema change was made by rebuilding the database, which was fine while no app had saved anything. From now on, schema changes need a migration that keeps the data and versions.
- **Better difficulty:** use elevation gain (the route has `ele`) instead of only length.
- **Bigger area:** add municipalities to `AREA` in `scripts/import_trails.py`.
