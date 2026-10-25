# Trail database

This part of Pathfinder stores hiking trails and their landmarks, then turns each trail into a JSON **bundle** that the app saves for offline use.

It uses [SQLite](https://sqlite.org): the whole database is one file (`pathfinder.db`), and it comes built into Python. There's nothing to install and no account to make.

The trails are real:
- **Routes:** official hiking routes and nature trails in the Nuuksio area (Espoo, Kirkkonummi and Vihti) from [Lipas](https://www.lipas.fi), University of Jyväskylä (CC BY 4.0).
- **Landmarks:** from [OpenStreetMap](https://www.openstreetmap.org) (© OpenStreetMap contributors, ODbL).

## Setup

You only need Python 3.10 or newer. Check with:

```bash
python3 --version
```

On Windows, type `python` instead of `python3` in all the commands below.

The database also needs SQLite 3.38 or newer, which comes with any recent Python. `create_db.py` checks this for you.

`pathfinder.db` is committed to git: it's the source of truth for the trail data and its version numbers. So after cloning the repo you already have the database. Run all commands from the repo folder.

## Importing real trails

```bash
python3 scripts/import_trails.py
```

For every active hiking route and nature trail in the area, this:

1. **Gets the route from Lipas.** Lipas often stores a route as several pieces in no particular order, so the import joins them into one line (gaps of up to 50 m are bridged). A route that's really in separate parts, for example with a side branch, is **skipped**, and the reason is printed. A wrong route would be worse than none.
2. **Calculates `length_km`** from the joined line. It prints a note if that's very different from Lipas's own figure.
3. **Estimates `difficulty`** from the length, because Lipas has no rating: under 5 km is easy, 5–12 km moderate, over 12 km hard.
4. **Finds landmarks** (shelters, wilderness huts, viewpoints, water and parking) **within 100 m** of the route, from OpenStreetMap. Places mapped twice are merged, bus stop shelters are left out, and landmarks are listed in the order a hiker meets them.
5. **Saves everything** in one go. If anything fails, nothing is saved.

**Running it again is safe**, and it's how you pull in updates:
- A trail whose data hasn't changed keeps its `version`, so phones don't download it again.
- A changed trail goes up by **exactly 1**.
- A trail that's no longer in Lipas is removed.
- The slug never changes, even if the trail is renamed.

**Options:**
- `--dry-run` shows what would change but saves nothing.
- `--refresh` downloads everything again. Normally, downloads from the last 24 hours are reused from the `cache/` folder, so the free services aren't asked for the same data twice.

**Changing the area:** the `AREA` list at the top of `scripts/import_trails.py` holds the municipalities. Add a municipality number (from [Statistics Finland](https://www.stat.fi/en/luokitukset/kunta/)) and its name to import more.

**Being polite to the free services:**
- OpenStreetMap is asked **once** for all routes together.
- Every request says who's asking.
- If a service is busy, the import waits and tries again.

The public Overpass server can be slow, so the import may take a few minutes.

## Building the bundles

```bash
python3 scripts/build_bundles.py
```

Builds the `public/` folder: `public/index.json` (a list of every trail) and `public/trails/<slug>.json` (one bundle per trail). Old bundles are deleted first, so a trail removed from the database disappears from `public/` too.

- **Nothing is written if any trail is broken**, for example a route point with a bad coordinate. That way a half-updated folder can never be published.
- **Rebuilding unchanged data gives identical files**, because there are no "exported at" times in them.
- **Options:**
  - `--out some/folder` writes somewhere else.
  - `--base-url https://...` turns the relative `bundle_url`s in `index.json` into full URLs.

`public/` is not committed. The GitHub Action builds and publishes it (see [Publishing](#publishing)).

To look at the files the way the app sees them, start a small local web server:

```bash
python3 -m http.server --directory public 8000
```

Then open `http://localhost:8000/index.json`. Press Ctrl+C to stop the server.

## Tests

```bash
python3 -m unittest discover -s tests -v
```

The tests run offline in under a second. They use small hand-made examples instead of the real services and a throwaway database, so they never touch `pathfinder.db`. They check:
- joining route pieces
- the 100 m landmark filter and merging duplicates
- length maths
- that re-imports keep versions right

The GitHub Action runs them on every pull request.

## Starting over

```bash
python3 scripts/create_db.py --reset
```

```bash
python3 scripts/import_trails.py
```

- **`create_db.py --reset`** deletes `pathfinder.db`, then runs the migration in `db/schema.sql` to create empty `trails` and `landmarks` tables. Without `--reset`, it refuses to overwrite an existing database.
- **`seed.py`** (instead of the import) adds three trails with **made-up placeholder coordinates**. It's for testing only. The next import removes them again.

⚠️ **Only start over while testing.** It restarts every trail's `version` at 1, and an app that saved version 2 won't see a new version 1 as newer. Once the app is in use, never commit and push a reset database.

## Publishing

The GitHub Action in `.github/workflows/publish-bundles.yml` publishes the bundles on GitHub Pages. The live URLs and the steps for updating them are in the [README](../README.md#updating-the-bundles).

- **Push to `main`** that changes `pathfinder.db`, `scripts/`, `db/` or `tests/`: it runs the tests, then `build_bundles.py`, and publishes `public/`.
- **Pull request:** it only runs the tests and the build, as a check. Nothing is published.
- **By hand:** the **Actions** tab → "Publish bundles and web app" → **Run workflow**.
- **If a test or the build fails,** nothing is published and the live site keeps its last good version.

The import doesn't run on GitHub. It talks to outside services, and a person should look at the result (and the PR check) before it goes live.

## Bundle format

The exact JSON format of `index.json` and the trail bundles is in [bundle-format.md](bundle-format.md). That's the doc for the frontend team.

## How versions work

The database counts changes for you with **triggers** (at the bottom of `db/schema.sql`): small bits of SQL it runs automatically. Editing a trail adds 1 to its `version`, and so does adding, editing or deleting one of its landmarks. The import then sets each changed trail's version to exactly "old + 1".

Try it (the `sqlite3` command comes with macOS):

```bash
sqlite3 pathfinder.db "UPDATE trails SET length_km = 2.1 WHERE slug = 'nahkiaispolku-527088'"
```

```bash
python3 scripts/build_bundles.py
```

In `public/index.json`, Nahkiaispolku now has `"version": 2`. So does `trail.version` in `public/trails/nahkiaispolku-527088.json`. The other trails stay as they were.

Hand edits to imported trails are kept until the trail changes in Lipas or OpenStreetMap. At that point the next import replaces them with the new source data.

To publish a change, commit `pathfinder.db` and get it onto `main`.

Tip: [DB Browser for SQLite](https://sqlitebrowser.org) is a free app for looking at and editing `pathfinder.db` without writing SQL.

## Files

| file | what it does |
|---|---|
| `db/schema.sql` | The migration: creates the tables, the data checks and the version triggers |
| `scripts/database.py` | Shared helper that opens `pathfinder.db` (and switches on the `trail_id` check) |
| `scripts/create_db.py` | Creates `pathfinder.db` from `db/schema.sql` |
| `scripts/import_trails.py` | Imports real trails from Lipas, plus landmarks from OpenStreetMap |
| `scripts/geo.py` | The map maths: distances, route length, joining route pieces |
| `scripts/seed.py` | Adds 3 placeholder trails, for testing only |
| `scripts/build_bundles.py` | Builds `public/index.json` and one bundle per trail in `public/trails/` |
| `tests/` | Offline tests for the import and the map maths |
| `pathfinder.db` | The database: the source of truth for trail data and versions (committed) |
| `public/` | The built files (not committed; the Action builds and publishes them) |
| `cache/` | Downloads saved by the import (not committed) |
| `.github/workflows/publish-bundles.yml` | The GitHub Action that tests, builds and publishes the bundles |
| `docs/bundle-format.md` | The exact JSON format, for the frontend team |

## Moving to Supabase later

If Pathfinder needs a shared online database after the hackathon, this schema can move to Supabase (Postgres) with a few small type changes.
