# Missions Kiosk

Clean-room replacement for the "InTouch Missions" vendor kiosk app (Electronic
Ministry Resources) on the church lobby touchscreen TV. No vendor code is used.
The old app is still installed but no longer launched; don't copy from it.

## How it runs on this machine

- **Server**: this project, published self-contained to `publish\`, registered
  as Windows Service `MissionsKiosk` (auto-start at boot, restarts on failure
  via `sc.exe failure`). Listens on `http://localhost:5103` (hardcoded in
  `Program.cs` — launchSettings.json is dev-only and not published).
- **Login**: `admin` auto-logs in via Sysinternals Autologon (password stored
  encrypted by that tool; never put it in scripts or notes).
- **Browser**: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\kiosk-browser.vbs`
  (admin's Startup folder) waits up to ~60s for the server, then runs
  `msedge --kiosk http://localhost:5103/ --edge-kiosk-type=fullscreen --no-first-run --inprivate`.
- **Hardening**: touchscreen edge-swipe disabled
  (`HKLM\SOFTWARE\Policies\Microsoft\Windows\EdgeUI\AllowEdgeSwipe=0`) so visitors
  can't escape the browser onto admin's desktop (admin's OneDrive holds church
  financial files). Remote Desktop is disabled.
- **Maintenance**: no keyboard/mouse on the kiosk. Plug one in; Alt+F4 closes Edge.

## Data

- Lives in `C:\Users\admin\OneDrive\Freedom Alliance\Missionaries` (set by
  `DataDirectory` in `appsettings.json`), edited by the pastor via OneDrive.
- One subfolder per entry: `profile.json` + photos referenced by bare filename.
  Folder name = id. Folders starting with `_` or `.` are ignored (`_template`).
  `README.txt` there is the pastor-facing how-to.
- OneDrive only syncs while `admin` is logged in — that's why admin (not a
  separate kiosk account) is the auto-login account.
- The Missionaries folder is pinned "Always keep on this device"
  (`attrib +P -U`). Without that, Files On-Demand can leave files the pastor
  adds as online-only placeholders, which the service (not running as admin)
  may fail to read. If new entries or photos ever don't appear, check that the
  folder is still pinned (right-click it in Explorer).
- Server rescans the folder on every `/api/ministries` request; the page polls
  every 15s, so synced edits appear within ~15s with no restart.
- Photos under `/data` use normal browser caching: replacing a photo under the
  same filename can show stale for a while — use a new filename.

## Policies (decided with the user — keep)

- **Locations are city-level or region-level only, never addresses.** Map
  `maxZoom` is 12 for this reason. Region-only entries share one coordinate
  (e.g. country centroid) with a descriptive `location.label`.
- Children's birthdates / anniversaries were deliberately left out of public
  bios (Paul & Tamara Douglas had them in the old app).
- Touch UX is for elderly users: tapping a cluster does ONE zoom (computed) or
  opens a pick-one list — never repeated tap-to-zoom. Flags and zoom control
  are oversized on purpose.

## Restoring on a new/rebuilt machine

1. Install the .NET 8 SDK; clone this repo; sign in as admin with OneDrive synced.
2. `dotnet publish -c Release -o publish -r win-x64 --self-contained true`
3. Elevated PowerShell: `.\deploy\install-kiosk.ps1` (service, Startup
   launcher, edge-swipe off, RDP off, pins the OneDrive data folder; safe to re-run).
4. Sysinternals Autologon for admin (password typed into its dialog only), reboot.

`bin/`, `obj/`, `publish/` are gitignored. Missionary data is NOT in the repo —
it lives in OneDrive (and contains personal info; keep it out of source control).

## Redeploying after code changes

Frontend-only changes (`wwwroot\*`) don't need a rebuild or elevation: copy the
changed files into `publish\wwwroot\`, then restart Edge (the kiosk page does
not reload itself): `Get-Process msedge | Stop-Process -Force`, then run the
Startup `kiosk-browser.vbs` with `wscript.exe`.

Server changes (`Program.cs`, csproj) need a full republish:

The running service locks the exe, so stop it first (elevated PowerShell):

```
sc.exe stop MissionsKiosk
dotnet publish -c Release -o publish -r win-x64 --self-contained true
sc.exe start MissionsKiosk
```

The .NET SDK was installed per-user at `%USERPROFILE%\.dotnet` (not on PATH);
set `DOTNET_ROOT` and prepend it to PATH before running `dotnet`. The frontend
files are served with `Cache-Control: no-cache`, so the kiosk picks up
JS/CSS changes on next page load.

## Gotchas (learned the hard way)

- MapLibre's `getClusterExpansionZoom` / `getClusterLeaves` **hang forever** (no
  callback, no error) when clustered points share an exact coordinate. The code
  avoids them entirely (`membersNear` / `zoomToSeparate` in `app.js`). Don't
  reintroduce them.
- GeoJSON source `maxzoom` must exceed `clusterMaxZoom` or markers silently
  vanish above it.
- Clusters only regroup at whole zoom levels. `zoomToSeparate` rounds its
  target up to an integer and always goes at least one level deeper — a
  fractional zoom (e.g. +0.1) leaves the bubble unchanged and the tap looks
  dead. Verified working on the kiosk.
- `clickTolerance: 20` on the map: the 3px default turned slow/shaky finger
  taps into tiny drags that did nothing.
- `Clear-AssignedAccess` **deletes** wizard-created kiosk accounts (it deleted
  `kioskUser0`), not just the kiosk lock.
- Windows client editions allow only one interactive session: the "tscon /
  loopback RDP" trick to show one account while another syncs does not work
  (error 0x708) without patching termsrv.dll — rejected. Don't retry it.
- OpenFreeMap (tile host) is occasionally slow; the map can sit on
  "Loading map…" for 10+ seconds and then load fine. A persistently blank map
  with no console errors is usually them, not us.
- `sc.exe create` / service and account changes need an elevated PowerShell;
  Claude's shell here is not elevated — hand the user a `.ps1` to run.

## If the kiosk doesn't come up after a reboot

1. Plug in keyboard, Alt+F4 out of Edge (if it opened at all).
2. `Get-Service MissionsKiosk` — Running/Automatic? If not, `sc.exe start MissionsKiosk`
   and check Event Viewer → Application for errors.
3. Browse to `http://localhost:5103/api/ministries` — returns JSON with `count` and `errors`?
4. Did admin auto-login? If it stopped at the login screen, re-run Autologon64.exe.
5. Did Edge launch? Check the Startup `kiosk-browser.vbs` exists; run it by double-click.

## Open items

- Status as of 2026-09-26: deployed, reboot-tested, pastor's OneDrive edits
  confirmed arriving on the kiosk end to end. One-tap cluster zoom confirmed.
- "Jon Wise" in the Missionaries folder was a sync test entry — delete it if
  it's still there.

- Whitney Beorn's Instagram link was truncated in the old app — needs the full URL.
- Alan & Jill and Caleb & Erin Kohl have no photos yet (old app only had silhouettes).
- The one-off scripts in `Documents\` (`setup-kiosk.ps1`, `setup-kiosk-account.ps1`,
  `kiosk-switch-test.ps1`, `finish-kiosk-setup.ps1`) are superseded by
  `deploy\install-kiosk.ps1` and can be deleted. Rescued media from the old app: `Documents\InTouch Missions Export`.
