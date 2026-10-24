yo wassup

## Trail database

Stores hiking trails and their landmarks in `pathfinder.db` (SQLite, which comes with Python, so there's nothing to install), and turns each trail into a JSON bundle the app downloads for offline use.

> ⚠️ **All trail data is placeholder data.** The coordinates are made up. Never use it for real navigation.

### Live trail data

The bundles are published on GitHub Pages:

- Trail list: https://the-crew-mates.github.io/Pathfinder/index.json
- One trail: https://the-crew-mates.github.io/Pathfinder/trails/haukankierros.json

Frontend team: the JSON format is in [docs/bundle-format.md](docs/bundle-format.md).

### Updating the bundles

1. Change the trail data in `pathfinder.db`, for example with [DB Browser for SQLite](https://sqlitebrowser.org). The changed trail's `version` goes up by itself.
2. Check it locally with `python3 scripts/build_bundles.py`, then look in `public/`.
3. Commit `pathfinder.db` and get it onto `main` (push, or merge a pull request).

GitHub then rebuilds and republishes the bundles by itself. You can watch it happen in the repo's **Actions** tab ("Publish trail bundles"):

- **Green tick:** the new bundles are live.
- **Red cross:** something in the data was wrong, so nothing was published and the previous version stays live. Click the run to see the error.

GitHub caches the files for up to 10 minutes, so a change can take a few minutes to show up.

More: [docs/trail-database.md](docs/trail-database.md) (scripts, starting over, how versions work) and [ROADMAP.md](ROADMAP.md) (what's planned next).
