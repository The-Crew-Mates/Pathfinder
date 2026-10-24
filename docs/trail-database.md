# Trail database

This part of Pathfinder stores hiking trails and their landmarks, then turns each trail into a JSON **bundle** that the app saves for offline use.

It uses [SQLite](https://sqlite.org): the whole database is one file (`pathfinder.db`), and it comes built into Python. There's nothing to install and no account to make.

> ⚠️ **All trail data is placeholder data.** The trail names are real Nuuksio trails, but the coordinates are made up and the lengths are approximate. Never use it for real navigation. It will be replaced with OpenStreetMap data.

## Setup

You only need Python 3.10 or newer. Check with:

```bash
python3 --version
```

On Windows, type `python` instead of `python3` in all the commands below.

The database also needs SQLite 3.38 or newer, which comes with any recent Python. `create_db.py` checks this for you.

## Run the scripts

`pathfinder.db` is committed to git: it's the source of truth for the trail data and its version numbers. So after cloning the repo you already have the database. Run these from the repo folder.

**Build the bundles**

```bash
python3 scripts/build_bundles.py
```

Builds the `public/` folder: `public/index.json` (a list of every trail) and `public/trails/<slug>.json` (one bundle per trail). Old bundles are deleted first, so a trail removed from the database disappears from `public/` too.

- **Nothing is written if any trail is broken**, for example a route point with a bad coordinate. That way a half-updated folder can never be published.
- **Rebuilding unchanged data gives identical files**, because there are no "exported at" times in them. Git only shows a change when the trail data really changed.
- **Options:**
  - `--out some/folder` writes somewhere else.
  - `--base-url https://...` turns the relative `bundle_url`s in `index.json` into full URLs.

`public/` is not committed. The GitHub Action builds and publishes it (see [Publishing](#publishing)).

To look at the files the way the app sees them, start a small local web server:

```bash
python3 -m http.server --directory public 8000
```

Then open `http://localhost:8000/index.json`. Press Ctrl+C to stop the server.

**Starting over from the sample data**

These two commands delete the database and rebuild it with the 3 placeholder trails:

```bash
python3 scripts/create_db.py --reset
```

```bash
python3 scripts/seed.py
```

- `create_db.py --reset` deletes `pathfinder.db`, then runs the migration in `db/schema.sql` to create empty `trails` and `landmarks` tables. Without `--reset`, it refuses to overwrite an existing database.
- `seed.py` adds three placeholder trails: `punarinnankierros` (easy), `haukankierros` (moderate) and `korpinkierros` (hard). It's safe to run again, because trails already in the database are skipped. If anything fails, nothing is saved.

⚠️ **Only start over while testing.** It restarts every trail's `version` at 1, and an app that saved version 2 won't see a new version 1 as newer. Once the app is in use, never commit and push a reset database.

## Publishing

The GitHub Action in `.github/workflows/publish-bundles.yml` publishes the bundles on GitHub Pages. The live URLs and the steps for updating them are in the [README](../README.md#updating-the-bundles).

- **Push to `main`** that changes `pathfinder.db`, `scripts/` or `db/`: it runs `build_bundles.py` and publishes `public/`.
- **Pull request:** it only runs the build, as a check. Nothing is published.
- **By hand:** the **Actions** tab → "Publish trail bundles" → **Run workflow**.
- **If the build fails,** nothing is published and the live site keeps its last good version.

## Bundle format

The exact JSON format of `index.json` and the trail bundles is in [bundle-format.md](bundle-format.md). That's the doc for the frontend team.

## How versions work

The database counts changes for you with **triggers** (at the bottom of `db/schema.sql`): small bits of SQL it runs automatically. Editing a trail adds 1 to its `version`, and so does adding, editing or deleting one of its landmarks. Nobody has to remember to bump it.

Try it (the `sqlite3` command comes with macOS):

```bash
sqlite3 pathfinder.db "UPDATE trails SET length_km = 4.2 WHERE slug = 'haukankierros'"
```

```bash
python3 scripts/build_bundles.py
```

In `public/index.json`, Haukankierros now has `"version": 2`. So does `trail.version` in `public/trails/haukankierros.json`. The other trails stay at 1.

To publish the change, commit `pathfinder.db` and get it onto `main`. Starting over resets every version to 1, so see the warning under [Starting over](#run-the-scripts).

Tip: [DB Browser for SQLite](https://sqlitebrowser.org) is a free app for looking at and editing `pathfinder.db` without writing SQL.

## Files

| file | what it does |
|---|---|
| `db/schema.sql` | The migration: creates the tables, the data checks and the version triggers |
| `scripts/database.py` | Shared helper that opens `pathfinder.db` (and switches on the `trail_id` check) |
| `scripts/create_db.py` | Creates `pathfinder.db` from `db/schema.sql` |
| `scripts/seed.py` | Adds the 3 placeholder trails |
| `scripts/build_bundles.py` | Builds `public/index.json` and one bundle per trail in `public/trails/` |
| `pathfinder.db` | The database: the source of truth for trail data and versions (committed) |
| `public/` | The built files (not committed; the Action builds and publishes them) |
| `.github/workflows/publish-bundles.yml` | The GitHub Action that builds and publishes the bundles |
| `docs/bundle-format.md` | The exact JSON format, for the frontend team |

## Moving to Supabase later

If Pathfinder needs a shared online database after the hackathon, this schema can move to Supabase (Postgres) with a few small type changes.
