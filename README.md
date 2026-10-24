yo wassup

## Trail database

Stores hiking trails and their landmarks, and exports each trail as a JSON bundle the app saves for offline use. It uses SQLite, which comes with Python, so there's nothing to install.

> ⚠️ **All trail data is placeholder data.** The coordinates are made up. Never use it for real navigation.

```bash
python3 scripts/create_db.py
python3 scripts/seed.py
python3 scripts/export_bundle.py haukankierros
```

These create `pathfinder.db`, add 3 sample trails, and write `bundles/haukankierros.json`. See [docs/trail-database.md](docs/trail-database.md) for the bundle format, how versions work and more.
