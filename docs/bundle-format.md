# Trail bundle format

This is the contract between the trail backend and the app. It describes the JSON files the app downloads to show trails and use them offline.

The trails are real:
- **Routes** are official hiking routes and nature trails from [Lipas](https://www.lipas.fi), Finland's national database of sports and outdoor places (run by the University of Jyväskylä).
- **Landmarks** (shelters, huts, viewpoints, water and parking within 100 m of each route) come from [OpenStreetMap](https://www.openstreetmap.org).

Both must be credited in the app; see [What the app must show](#what-the-app-must-show).

## The files

```
public/
  index.json                            list of every trail
  trails/nahkiaispolku-527088.json      one bundle per trail
  trails/paivattarenpolku-527090.json
  ...
```

- **`index.json`** is small. The app fetches it to show the trail list and to check for updates.
- **A trail bundle** has everything about one trail: its route and landmarks. The app downloads it when the user wants that trail offline.

### Where to get them

The files are published on GitHub Pages. The app should fetch:

```
https://the-crew-mates.github.io/Pathfinder/index.json
```

- **Caching:** GitHub caches the files for up to 10 minutes, so a new version can take a few minutes to appear.
- **Web apps:** the files can be fetched from a web app on any domain (GitHub Pages allows cross-origin requests).

To try a local build instead, run `python3 scripts/build_bundles.py`, then start a local web server from the repo folder:

```bash
python3 -m http.server --directory public 8000
```

Then open `http://localhost:8000/index.json`.

## Conventions

- **Coordinates:** `{"lat": 60.304, "lon": 24.517}` in decimal degrees (WGS84, the same system GPS and maps use). Always named `lat`/`lon`, never a `[x, y]` pair.
- **Distances:** kilometres (`length_km`).
- **Times:** UTC in ISO 8601 format, e.g. `"2026-10-24T16:19:31Z"`.
- **Text:** UTF-8, so Finnish letters like ä and ö appear as they are.
- **Use `slug` as a trail's key** when you save trails on the phone, not `id`. The `id` can change if the database is rebuilt; the slug doesn't.
- **Ignore fields you don't know.** We may add new fields without warning, but we won't rename, remove or move existing ones without raising `format_version` (see below).

## `index.json`

```json
{
  "format_version": 1,
  "trails": [
    {
      "id": 7,
      "slug": "nahkiaispolku-527088",
      "name": "Nahkiaispolku",
      "region": "Espoo",
      "difficulty": "easy",
      "length_km": 1.96,
      "version": 1,
      "updated_at": "2026-10-24T17:44:46Z",
      "data_source": "lipas",
      "bundle_url": "trails/nahkiaispolku-527088.json",
      "bundle_bytes": 5494
    }
  ]
}
```

| field | type | meaning |
|---|---|---|
| `format_version` | integer | Version of the file *structure*. See [format_version](#format_version). |
| `trails` | list | One entry per trail, sorted by `slug`. Can be empty. |

Each entry in `trails`:

| field | type | meaning |
|---|---|---|
| `id` | integer | Database id. Don't use it as a long-term key (use `slug`). |
| `slug` | string | Stable short name: the trail's name plus its Lipas id, e.g. `nahkiaispolku-527088`. Only `a-z`, `0-9` and `-`. It never changes, even if the trail is renamed. |
| `name` | string | Display name. |
| `region` | string | Where the trail is: the municipality, e.g. `Espoo`. |
| `difficulty` | string | `easy`, `moderate` or `hard`. Lipas has no difficulty rating, so for Lipas trails it's **estimated from the length**: under 5 km easy, 5–12 km moderate, over 12 km hard. |
| `length_km` | number | Trail length in km. |
| `version` | integer | Goes up every time the trail or one of its landmarks changes. Same as `trail.version` in its bundle. |
| `updated_at` | string | When the trail last changed (UTC). |
| `data_source` | string | Where the trail comes from: `lipas`, `osm`, `manual` or `placeholder`. Show a "sample data" badge for `placeholder`. |
| `bundle_url` | string | Where to download the bundle. Usually **relative to `index.json`** (see [Downloading a bundle](#downloading-a-bundle)). |
| `bundle_bytes` | integer | Size of the bundle file in bytes, e.g. for "Download 2 KB?". |

## Trail bundle (`trails/<slug>.json`)

A real bundle, shortened (the real file has all 100+ route points):

```json
{
  "format_version": 1,
  "data_source": "lipas",
  "attributions": [
    "Route data: Lipas, University of Jyväskylä (CC BY 4.0), https://www.lipas.fi",
    "© OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright"
  ],
  "trail": {
    "id": 7,
    "slug": "nahkiaispolku-527088",
    "name": "Nahkiaispolku",
    "region": "Espoo",
    "difficulty": "easy",
    "length_km": 1.96,
    "version": 1,
    "updated_at": "2026-10-24T17:44:46Z",
    "warnings": [],
    "route": [
      { "lat": 60.31009, "lon": 24.52313, "ele": 62.2 },
      { "lat": 60.3101, "lon": 24.52324, "ele": 61.4 },
      { "lat": 60.31015, "lon": 24.52334, "ele": 59.7 }
    ]
  },
  "landmarks": [
    {
      "id": 16,
      "name": "Haukkalammen pieni pysäköintialue",
      "type": "parking",
      "lat": 60.30969,
      "lon": 24.51692,
      "description": null
    },
    {
      "id": 17,
      "name": "Haukkalammen iso pysäköintialue",
      "type": "parking",
      "lat": 60.30954,
      "lon": 24.52085,
      "description": null
    }
  ]
}
```

Names come straight from the sources, so they're usually in Finnish (or Swedish).

Top level:

| field | type | meaning |
|---|---|---|
| `format_version` | integer | Version of the file *structure*. See [format_version](#format_version). |
| `data_source` | string | `lipas`, `osm`, `manual` or `placeholder`. |
| `attributions` | list of strings | Credit lines you **must show** wherever this trail's data appears (license requirement). Lipas trails have two: Lipas for the route, OpenStreetMap for the landmarks. Empty for placeholder data. |
| `trail` | object | The trail itself (below). |
| `landmarks` | list | The trail's landmarks (below). Can be empty. |

`trail`:

| field | type | meaning |
|---|---|---|
| `id`, `slug`, `name`, `region`, `difficulty`, `length_km` | | Same as in `index.json`. |
| `version` | integer | Save this with the bundle. Compare it with `version` in `index.json` to know when your copy is outdated. |
| `updated_at` | string | When the trail last changed (UTC). |
| `warnings` | list of strings | Safety warnings to show the hiker. Can be empty. |
| `route` | list of points | The path in walking order, at least 2 points. Loop trails end where they start. Each point is `{"lat", "lon"}`, plus `"ele"` (elevation in metres above sea level) when the source has it. A phone's air-pressure sensor can be compared with `ele` to help place the hiker without GPS. |

Each landmark:

| field | type | meaning |
|---|---|---|
| `id` | integer | Database id. |
| `name` | string | Display name. |
| `type` | string | One of the types below. |
| `lat`, `lon` | number | Position in decimal degrees. |
| `description` | string or `null` | Extra info. Often `null`. |

Landmarks are listed **in the order a hiker meets them** along the route. The types are:

| `type` | meaning |
|---|---|
| `shelter` | An open shelter, like a lean-to (laavu) or campfire shelter. |
| `hut` | A wilderness hut (autiotupa): a cabin with walls, open to hikers. |
| `viewpoint` | A viewpoint. |
| `water` | Drinking water: a tap, water point or spring. |
| `parking` | A parking area. |
| `junction` | A trail junction. |
| `other` | Anything else. |

## Using the files in the app

### Downloading a bundle

`bundle_url` is relative to `index.json`, so `trails/nahkiaispolku-527088.json` sits next to `index.json` on the server. Turn it into a full URL like this (JavaScript):

```js
const url = new URL(entry.bundle_url, INDEX_URL);
```

This also works if `bundle_url` is already a full `https://` URL, so the app doesn't need to care which one it gets.

### Checking for updates

1. Fetch `index.json`.
2. For each trail saved on the phone, find its entry by `slug`:
   - **Entry's `version` is higher than the saved bundle's `trail.version`:** the saved copy is outdated. Download `bundle_url` again.
   - **Same version:** nothing to do.
   - **No entry with that slug:** the trail was removed. Tell the user, and keep or delete the saved copy.

```js
const INDEX_URL = "https://the-crew-mates.github.io/Pathfinder/index.json";
const index = await (await fetch(INDEX_URL)).json();

for (const entry of index.trails) {
  const saved = savedTrails[entry.slug]; // however you store saved bundles
  if (saved && entry.version > saved.trail.version) {
    const bundle = await (await fetch(new URL(entry.bundle_url, INDEX_URL))).json();
    savedTrails[entry.slug] = bundle;
  }
}
```

### format_version

`format_version` changes only when the structure changes (a field is renamed, removed or moved), not when trail data changes. The app should remember the highest `format_version` it understands (currently `1`). If a file has a higher number, don't try to read it. Ask the user to update the app instead.

### What the app must show

- **`attributions`:** show every line wherever the trail's data is shown, e.g. at the bottom of the trail screen and the map. OpenStreetMap and Lipas data are only free to use if they're credited.
- **Placeholder banner:** when `data_source` is `placeholder`, show a clear "sample data, not for real navigation" notice.
- **`warnings`:** show them before the hiker starts the trail.
