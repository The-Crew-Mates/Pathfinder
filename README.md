yo wassup

## Trail database

Stores hiking trails and their landmarks, and exports each trail as a JSON bundle the app saves for offline use. It uses SQLite, which comes with Python, so there's nothing to install.

> ⚠️ **All trail data is placeholder data.** The coordinates are made up. Never use it for real navigation.

```bash
python3 scripts/create_db.py
python3 scripts/seed.py
python3 scripts/build_bundles.py
```

These create `pathfinder.db`, add 3 sample trails, and build the `public/` folder: `index.json` plus one bundle per trail, ready to publish as static files.

- Frontend team: the JSON format is in [docs/bundle-format.md](docs/bundle-format.md).
- Setup details and how versions work: [docs/trail-database.md](docs/trail-database.md).
- What's planned next: [ROADMAP.md](ROADMAP.md).
