# Missions Kiosk Map

A clean-room, self-hosted replacement for a commercial missions-display kiosk.
No vendor code, no monthly fee, no offline-map machinery (this runs online).

## How it works

- **Backend** (`Program.cs`): a minimal ASP.NET Core app. On each request to
  `/api/ministries` it scans the data directory (see below) for subfolders,
  reads the one `.json` file inside each, and returns them all as one array —
  the folder name becomes that entry's id. It also serves the whole data
  directory at `/data`, so each entry's photos are reachable at
  `/data/<folder-name>/<filename>`.
- **Data location**: set by `"DataDirectory"` in `appsettings.json`. It's
  currently pointed at `C:\Users\admin\OneDrive\Freedom Alliance\Missionaries`
  — a folder inside the church's OneDrive — so the pastor can add or edit
  entries from his own computer via normal OneDrive sync; changes show up on
  the kiosk within seconds, no deploy or restart needed. If that setting is
  removed, it falls back to a local `data/` folder next to the project (handy
  for testing without touching the real OneDrive data).
- **Frontend** (`wwwroot/`): a single page using [MapLibre GL JS](https://maplibre.org/)
  (MIT-licensed, self-hosted in `wwwroot/lib/`) with free vector tiles from
  [OpenFreeMap](https://openfreemap.org) (no API key, no usage cap). Nearby
  entries are grouped into a cluster; tapping one zooms in exactly enough to
  separate them (or, if that's not possible, opens a pick-one list) in a
  single motion — no repeated tap-to-zoom. Tapping an individual flag goes
  straight to its detail panel. Pinch-to-zoom, scroll-wheel zoom and
  double-tap-to-zoom all work out of the box — MapLibre ships them by
  default — and the on-screen +/- zoom control is enlarged for anyone who'd
  rather tap a button.

## Adding a missionary or local ministry

The data directory itself (see `README.txt` there for the pastor-facing
version of these same instructions) works like this:

1. Copy the `_template` folder (or any existing one) and rename it — the
   folder name becomes the entry's id, so use something readable like
   `Jane Doe`.
2. Edit `profile.json` inside it (see `_template/profile.json` for every
   field — required ones are `name` and `location.lat`/`lon`).
3. Drop that entry's photo (and any other media you reference) into the same
   folder, e.g. `photo.jpg`, and reference it in the JSON as
   `"media": { "photo": "photo.jpg" }` — plain filenames, no path.
4. Save. The map picks it up on next refresh — no restart or rebuild needed.

A folder name starting with `_` or `.` is ignored (that's how `_template`
stays off the live map) — rename an entry's folder that way instead of
deleting it to pull it from the map without losing its data.

### Location policy: city-level only, never a precise address

**Never put a missionary's full street address, or their exact coordinates,
into a JSON file.** Use the coordinates of the city/town they're serving in
(e.g. what you'd get from looking up "Nairobi, Kenya", not a street address).
This is a deliberate safety choice — the map is capped at a city-level zoom
(`maxZoom: 12` in `app.js`) so nothing more precise is ever shown or
zoomable-into, which matters most for missionaries serving in sensitive or
access-restricted regions.

One consequence: several entries in the same city will often stay grouped
in one cluster even at max zoom, since there's no finer coordinate to spread
them apart — that's expected. Tapping that cluster opens a pick-one list
instead of trying to zoom in further.

Delete the four `sample-*` folders (in the OneDrive data directory) once
you've added real entries.

## Running it

```
dotnet run
```

Then open the printed `http://localhost:...` URL. For the actual kiosk,
launch Edge in kiosk mode against that URL, e.g.:

```
msedge --kiosk http://localhost:5000 --edge-kiosk-type=fullscreen
```

(Autostart-on-boot and screensaver/attract-mode are natural next steps once
you're happy with the base map — ask and we can add them.)
