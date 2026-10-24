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

**3. Export a bundle**

```bash
python3 scripts/export_bundle.py haukankierros
```

Writes `bundles/haukankierros.json`. Add `--out some/folder` to write it somewhere else. The script refuses to export a route with a broken point, and it prints a warning when the trail is placeholder data.

The bundles in `bundles/` are committed to git, so the app devs can grab them from there. `pathfinder.db` is not committed: anyone can rebuild it with steps 1 and 2.

## Bundle format

```json
{
  "format_version": 1,
  "trail_version": 1,
  "exported_at": "2026-10-24T14:20:15Z",
  "data_source": "placeholder",
  "attribution": null,
  "trail": {
    "id": 2,
    "slug": "haukankierros",
    "name": "Haukankierros",
    "region": "Nuuksio National Park",
    "difficulty": "moderate",
    "length_km": 4.0,
    "warnings": ["PLACEHOLDER DATA: coordinates are not real. Do not use for navigation.", "..."],
    "route": [{ "lat": 60.304, "lon": 24.517 }, { "lat": 60.30714, "lon": 24.51316 }],
    "updated_at": "2026-10-24T14:20:15Z"
  },
  "landmarks": [
    { "id": 4, "name": "Haukkalampi parking", "type": "parking", "lat": 60.304, "lon": 24.517, "description": "..." }
  ]
}
```

| field | meaning |
|---|---|
| `trail_version` | Goes up every time the trail or one of its landmarks changes. **If the app's saved copy has a lower number, that copy is outdated.** |
| `format_version` | Changes only when the structure of the file changes. If it's higher than the app understands, the app should ask the user to update the app instead of trying to read the file. |
| `data_source` | `placeholder`, `osm` or `manual`. The app can show a "sample data" banner for `placeholder`. |
| `attribution` | Credit text the app must show for OpenStreetMap data. `null` for other data. |
| `route` | Points in walking order. Loop trails end where they start. |
| `landmarks[].type` | `shelter`, `viewpoint`, `junction`, `water`, `parking` or `other` |
| times | UTC, in ISO 8601 format |

## How versions work

The database counts changes for you with **triggers** (at the bottom of `db/schema.sql`): small bits of SQL it runs automatically. Editing a trail adds 1 to its `version`, and so does adding, editing or deleting one of its landmarks. Nobody has to remember to bump it.

Try it (the `sqlite3` command comes with macOS):

```bash
sqlite3 pathfinder.db "UPDATE trails SET length_km = 4.2 WHERE slug = 'haukankierros'"
```

```bash
python3 scripts/export_bundle.py haukankierros
```

The export now says `trail version 2`.

Careful: `create_db.py --reset` starts every version at 1 again. An app that saved version 2 won't see a new version 1 as newer, so reset only while you're still testing.

Tip: [DB Browser for SQLite](https://sqlitebrowser.org) is a free app for looking at and editing `pathfinder.db` without writing SQL.

## Files

| file | what it does |
|---|---|
| `db/schema.sql` | The migration: creates the tables, the data checks and the version triggers |
| `scripts/database.py` | Shared helper that opens `pathfinder.db` (and switches on the `trail_id` check) |
| `scripts/create_db.py` | Creates `pathfinder.db` from `db/schema.sql` |
| `scripts/seed.py` | Adds the 3 placeholder trails |
| `scripts/export_bundle.py` | Exports one trail as `bundles/<slug>.json` |
| `bundles/` | Exported bundles for the app |

## Moving to Supabase later

If Pathfinder needs a shared online database after the hackathon, this schema can move to Supabase (Postgres) with a few small type changes.
