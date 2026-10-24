# Trail bundle format

This is the contract between the trail backend and the app. It describes the JSON files the app downloads to show trails and use them offline.

> ⚠️ **Right now all trails are placeholder data** (`"data_source": "placeholder"`). The coordinates are made up. Real data comes later (see `ROADMAP.md`, Phase 3), in exactly this format.

## The files

```
public/
  index.json                     list of every trail
  trails/haukankierros.json      one bundle per trail
  trails/korpinkierros.json
  trails/punarinnankierros.json
```

- **`index.json`** is small. The app fetches it to show the trail list and to check for updates.
- **A trail bundle** has everything about one trail: its route and landmarks. The app downloads it when the user wants that trail offline.

Until hosting is set up (Phase 2), the files are in the `public/` folder of this repo. To try them over HTTP on your own computer, run this from the repo folder:

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
      "id": 2,
      "slug": "haukankierros",
      "name": "Haukankierros",
      "region": "Nuuksio National Park",
      "difficulty": "moderate",
      "length_km": 4.0,
      "version": 1,
      "updated_at": "2026-10-24T16:19:31Z",
      "data_source": "placeholder",
      "bundle_url": "trails/haukankierros.json",
      "bundle_bytes": 2052
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
| `slug` | string | Stable short name, e.g. `haukankierros`. Only `a-z`, `0-9` and `-`. |
| `name` | string | Display name. |
| `region` | string | Where the trail is, e.g. `Nuuksio National Park`. |
| `difficulty` | string | `easy`, `moderate` or `hard`. |
| `length_km` | number | Trail length in km. |
| `version` | integer | Goes up every time the trail or one of its landmarks changes. Same as `trail.version` in its bundle. |
| `updated_at` | string | When the trail last changed (UTC). |
| `data_source` | string | `placeholder`, `osm` or `manual`. Show a "sample data" badge for `placeholder`. |
| `bundle_url` | string | Where to download the bundle. Usually **relative to `index.json`** (see [Downloading a bundle](#downloading-a-bundle)). |
| `bundle_bytes` | integer | Size of the bundle file in bytes, e.g. for "Download 2 KB?". |

## Trail bundle (`trails/<slug>.json`)

Shortened example (the real file has every route point and landmark):

```json
{
  "format_version": 1,
  "data_source": "placeholder",
  "attributions": [],
  "trail": {
    "id": 2,
    "slug": "haukankierros",
    "name": "Haukankierros",
    "region": "Nuuksio National Park",
    "difficulty": "moderate",
    "length_km": 4.0,
    "version": 1,
    "updated_at": "2026-10-24T16:19:31Z",
    "warnings": [
      "PLACEHOLDER DATA: coordinates are not real. Do not use for navigation.",
      "Sample warning: steep rocky sections, slippery when wet."
    ],
    "route": [
      { "lat": 60.304, "lon": 24.517 },
      { "lat": 60.30714, "lon": 24.51316 },
      { "lat": 60.30733, "lon": 24.50587 }
    ]
  },
  "landmarks": [
    {
      "id": 4,
      "name": "Haukkalampi parking",
      "type": "parking",
      "lat": 60.304,
      "lon": 24.517,
      "description": "Placeholder: sample parking area at the trail start."
    }
  ]
}
```

Top level:

| field | type | meaning |
|---|---|---|
| `format_version` | integer | Version of the file *structure*. See [format_version](#format_version). |
| `data_source` | string | `placeholder`, `osm` or `manual`. |
| `attributions` | list of strings | Credit lines you **must show** wherever this trail's data appears (license requirement). Empty for placeholder data. |
| `trail` | object | The trail itself (below). |
| `landmarks` | list | The trail's landmarks (below). Can be empty. |

`trail`:

| field | type | meaning |
|---|---|---|
| `id`, `slug`, `name`, `region`, `difficulty`, `length_km` | | Same as in `index.json`. |
| `version` | integer | Save this with the bundle. Compare it with `version` in `index.json` to know when your copy is outdated. |
| `updated_at` | string | When the trail last changed (UTC). |
| `warnings` | list of strings | Safety warnings to show the hiker. Can be empty. |
| `route` | list of `{lat, lon}` | The path in walking order, at least 2 points. Loop trails end where they start. |

Each landmark:

| field | type | meaning |
|---|---|---|
| `id` | integer | Database id. |
| `name` | string | Display name. |
| `type` | string | `shelter`, `viewpoint`, `junction`, `water`, `parking` or `other`. |
| `lat`, `lon` | number | Position in decimal degrees. |
| `description` | string or `null` | Extra info. Can be `null`. |

## Using the files in the app

### Downloading a bundle

`bundle_url` is relative to `index.json`, so `trails/haukankierros.json` sits next to `index.json` on the server. Turn it into a full URL like this (JavaScript):

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
