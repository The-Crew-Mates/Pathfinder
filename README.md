# Pathfinder

Pathfinder helps hikers find their way back, even without GPS. As you walk it drops **beacons** (saved positions) along your route, keeps estimating where you are from your steps and the compass when GPS drops out, and leads you back beacon by beacon.

This repo has two parts:

- **The web app** (`pathfinder-web/`): an installable web app that works offline. Live at https://the-crew-mates.github.io/Pathfinder/app/. How to run and test it: [pathfinder-web/README.md](pathfinder-web/README.md).
- **The trail database** (below): real hiking trails and landmarks, published as JSON bundles for offline use.

The plan and its status are in [ROADMAP.md](ROADMAP.md).

## Trail database

Stores hiking trails and their landmarks in `pathfinder.db` (SQLite, which comes with Python, so there's nothing to install), and turns each trail into a JSON bundle the app downloads for offline use.

The trails are real hiking routes and nature trails in the Nuuksio area (Espoo, Kirkkonummi and Vihti):
- **Routes:** from [Lipas](https://www.lipas.fi), University of Jyväskylä (CC BY 4.0).
- **Landmarks:** from [OpenStreetMap](https://www.openstreetmap.org/copyright) (© OpenStreetMap contributors, ODbL).

Both must be credited wherever the data is shown.

### Live trail data

The bundles are published on GitHub Pages:

- Trail list: https://the-crew-mates.github.io/Pathfinder/index.json
- One trail: https://the-crew-mates.github.io/Pathfinder/trails/nahkiaispolku-527088.json

Frontend team: the JSON format is in [docs/bundle-format.md](docs/bundle-format.md).

### Updating the bundles

1. Get the latest trail data into `pathfinder.db`:
   - **Pull in changes from Lipas and OpenStreetMap:** run `python3 scripts/import_trails.py --refresh`. Only trails that really changed get a new `version`.
   - **Or edit by hand,** for example with [DB Browser for SQLite](https://sqlitebrowser.org). The changed trail's `version` goes up by itself.
2. Check it locally with `python3 scripts/build_bundles.py`, then look in `public/`.
3. Commit `pathfinder.db` and get it onto `main` (push, or merge a pull request).

GitHub then tests, rebuilds and republishes the bundles by itself. You can watch it happen in the repo's **Actions** tab ("Publish bundles and web app"):

- **Green tick:** the new bundles are live.
- **Red cross:** a test or something in the data failed, so nothing was published and the previous version stays live. Click the run to see the error.

GitHub caches the files for up to 10 minutes, so a change can take a few minutes to show up.

More: [docs/trail-database.md](docs/trail-database.md) (the import, scripts, tests, how versions work) and [ROADMAP.md](ROADMAP.md) (the plan and its status).
