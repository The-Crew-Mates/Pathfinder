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
| Phase 1: Trail bundles | Built and tested, waiting for review |
| Phase 2: Publish the bundles | Not started |
| Phase 3: Real trail data | Not started |

**Already built** (branch `add-trail-database`, not merged yet):

- `db/schema.sql`: the `trails` and `landmarks` tables, data checks, and triggers that raise a trail's `version` whenever it or its landmarks change.
- `scripts/create_db.py` and `scripts/seed.py`: create `pathfinder.db` and add 3 **placeholder** Nuuksio trails (made-up coordinates).
- `pathfinder.db` is gitignored. Anyone can rebuild it with `create_db.py` + `seed.py`.
- Phase 1: `scripts/build_bundles.py` builds `public/index.json` + `public/trails/<slug>.json`. The format is documented in `docs/bundle-format.md`.

## Open questions for later phases

- **Phase 2: where the trail data lives.** A GitHub Action can only rebuild bundles from data that's in git, but `pathfinder.db` is gitignored. Decide what gets committed (the built bundles, the database, or a text export of it).
- **Phase 2: public or private repo.** This decides whether free GitHub Pages works.
- **Phase 3: schema change.** `trails.data_source` only allows `placeholder`, `osm` and `manual` today. Lipas routes will need a `lipas` value (or similar).
