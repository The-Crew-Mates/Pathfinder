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

Run these from the repo folder, in this order.

**1. Create the database**

```bash
python3 scripts/create_db.py
```

Runs the migration in `db/schema.sql` and creates `pathfinder.db` with empty `trails` and `landmarks` tables. If the database already exists, it stops instead of overwriting it. To delete it and start over (this deletes all the data in it):

```bash
python3 scripts/create_db.py --reset
```

**2. Add the sample trails**

```bash
python3 scripts/seed.py
```

Adds three placeholder trails: `punarinnankierros` (easy), `haukankierros` (moderate) and `korpinkierros` (hard). It's safe to run again, because trails already in the database are skipped. If anything fails, nothing is saved. If you change the sample data in `seed.py`, run `create_db.py --reset` and then `seed.py`.

**3. Build the bundles**

```bash
python3 scripts/build_bundles.py
```

Builds the `public/` folder: `public/index.json` (a list of every trail) and `public/trails/<slug>.json` (one bundle per trail). Old bundles are deleted first, so a trail removed from the database disappears from `public/` too.

- **Nothing is written if any trail is broken**, for example a route point with a bad coordinate. That way a half-updated folder can never be published.
- **Rebuilding unchanged data gives identical files**, because there are no "exported at" times in them. Git only shows a change when the trail data really changed.
- **Options:**
  - `--out some/folder` writes somewhere else.
  - `--base-url https://...` turns the relative `bundle_url`s in `index.json` into full URLs.

The `public/` folder is committed to git, so the app devs can grab the files from there. `pathfinder.db` is not committed: anyone can rebuild it with steps 1 and 2.

To look at the files the way the app will see them once they're hosted, start a small local web server:

```bash
python3 -m http.server --directory public 8000
```

Then open `http://localhost:8000/index.json`. Press Ctrl+C to stop the server.

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

Careful: `create_db.py --reset` starts every version at 1 again. An app that saved version 2 won't see a new version 1 as newer, so reset only while you're still testing.

Tip: [DB Browser for SQLite](https://sqlitebrowser.org) is a free app for looking at and editing `pathfinder.db` without writing SQL.

## Files

| file | what it does |
|---|---|
| `db/schema.sql` | The migration: creates the tables, the data checks and the version triggers |
| `scripts/database.py` | Shared helper that opens `pathfinder.db` (and switches on the `trail_id` check) |
| `scripts/create_db.py` | Creates `pathfinder.db` from `db/schema.sql` |
| `scripts/seed.py` | Adds the 3 placeholder trails |
| `scripts/build_bundles.py` | Builds `public/index.json` and one bundle per trail in `public/trails/` |
| `public/` | The built files, ready to publish as static files |
| `docs/bundle-format.md` | The exact JSON format, for the frontend team |

## Moving to Supabase later

If Pathfinder needs a shared online database after the hackathon, this schema can move to Supabase (Postgres) with a few small type changes.
