// Missions Map — clean-room kiosk map viewer.
// Reads /api/ministries (built server-side from data/*.json) and renders
// each entry as a colored flag pin on a MapLibre GL map, with clustering
// for entries placed close together.

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const DEFAULT_COLOR = "#3a6ea5";
const CLUSTER_RADIUS_PX = 50; // must match the "clusterRadius" used below

const loadingEl = document.getElementById("loading");
const detailEl = document.getElementById("detail");
const detailCloseBtn = document.getElementById("detail-close");
const pickerEl = document.getElementById("picker");
const pickerListEl = document.getElementById("picker-list");
const pickerCloseBtn = document.getElementById("picker-close");

let ministriesById = new Map();

// The canvas is deliberately bigger than the flag glyph drawn on it — the
// blank margin still counts as part of the tappable icon (MapLibre hit-tests
// a symbol's full image bounds, not just its opaque pixels), which is what
// actually fixes a too-small touch target on a big touchscreen, not just
// drawing a bigger-looking flag. The pole sits at the canvas's horizontal
// center and its base at the bottom edge, matching icon-anchor: "bottom"
// below, so the flag still points at its true coordinate.
function flagIconCanvas(color) {
  const w = 96;
  const h = 120;
  const poleX = w / 2;
  const poleTopY = 20;
  const poleBottomY = h - 8;
  const flagTipX = poleX + 36;
  const flagHalfHeight = 15;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  // Pole
  ctx.strokeStyle = "#3a3226";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(poleX, poleTopY);
  ctx.lineTo(poleX, poleBottomY);
  ctx.stroke();

  // Flag (triangle pennant)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(poleX, poleTopY);
  ctx.lineTo(flagTipX, poleTopY + flagHalfHeight);
  ctx.lineTo(poleX, poleTopY + flagHalfHeight * 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Base dot
  ctx.fillStyle = "#3a3226";
  ctx.beginPath();
  ctx.arc(poleX, poleBottomY, 7, 0, Math.PI * 2);
  ctx.fill();

  return ctx.getImageData(0, 0, w, h);
}

async function loadMinistries() {
  const res = await fetch("/api/ministries");
  const data = await res.json();
  if (data.errors && data.errors.length) {
    console.warn("Some ministry files failed to load:", data.errors);
  }
  return data.ministries || [];
}

function toGeoJSON(ministries) {
  const features = [];
  for (const m of ministries) {
    const loc = m.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lon !== "number") continue;
    const color = m.color || DEFAULT_COLOR;
    ministriesById.set(m.id, m);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [loc.lon, loc.lat] },
      properties: {
        id: m.id,
        name: m.name || "(unnamed)",
        iconId: `flag-${color}`,
        color,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

function photoUrl(ministry) {
  const photo = ministry.media && ministry.media.photo;
  if (!photo) return "/lib/maplibre/placeholder-none.svg";
  return `/data/${encodeURIComponent(ministry.id)}/${photo}`;
}

function linkRow(links) {
  if (!links) return "";
  const entries = [
    ["website", "Website"],
    ["giving", "Give"],
    ["email", "Email"],
  ];
  const parts = [];
  for (const [key, label] of entries) {
    const val = links[key];
    if (!val) continue;
    const href = key === "email" ? `mailto:${val}` : val;
    parts.push(`<a href="${href}" target="_blank" rel="noopener">${label}</a>`);
  }
  return parts.join("");
}

function openDetail(ministry) {
  document.getElementById("detail-photo").src = photoUrl(ministry);
  document.getElementById("detail-type").textContent =
    ministry.type === "local-ministry" ? "Local Ministry" : "Missionary";
  document.getElementById("detail-name").textContent = ministry.name || "";
  document.getElementById("detail-org").textContent = ministry.organization || "";
  document.getElementById("detail-location").textContent =
    (ministry.location && ministry.location.label) || "";
  document.getElementById("detail-bio").textContent = ministry.bio || "";
  document.getElementById("detail-links").innerHTML = linkRow(ministry.links);

  detailEl.classList.remove("hidden");
  detailEl.setAttribute("aria-hidden", "false");
}

function closeDetail() {
  detailEl.classList.add("hidden");
  detailEl.setAttribute("aria-hidden", "true");
}

function openPicker(ministries) {
  pickerListEl.innerHTML = "";
  for (const m of ministries) {
    const btn = document.createElement("button");
    btn.textContent = m.name || "(unnamed)";
    btn.addEventListener("click", () => {
      closePicker();
      openDetail(m);
    });
    pickerListEl.appendChild(btn);
  }
  pickerEl.classList.remove("hidden");
  pickerEl.setAttribute("aria-hidden", "false");
}

function closePicker() {
  pickerEl.classList.add("hidden");
  pickerEl.setAttribute("aria-hidden", "true");
}

detailCloseBtn.addEventListener("click", closeDetail);
detailEl.addEventListener("click", (e) => {
  if (e.target === detailEl) closeDetail();
});
pickerCloseBtn.addEventListener("click", closePicker);
pickerEl.addEventListener("click", (e) => {
  if (e.target === pickerEl) closePicker();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeDetail();
    closePicker();
  }
});

async function main() {
  const ministries = await loadMinistries();
  const geojson = toGeoJSON(ministries);

  const map = new maplibregl.Map({
    container: "map",
    style: MAP_STYLE,
    center: [10, 15],
    zoom: 1.6,
    // By policy this kiosk never stores a precise/street-level address for a
    // missionary (safety) — only a city-level coordinate. So there's nothing
    // to see past a city view, and capping maxZoom here means pinch/scroll/
    // double-tap zoom all naturally stop there instead of zooming into an
    // empty street grid. Raise this only if the data policy above changes.
    maxZoom: 12,
    attributionControl: true,
    // Gestures are on by default; listed here for clarity / easy tuning.
    scrollZoom: true,
    doubleClickZoom: true,
    touchZoomRotate: true,
    dragPan: true,
    // How far a finger may drift during a tap and still count as a tap
    // (default is 3px — far too strict for a slow or shaky press on a big
    // touchscreen, where the "tap" silently becomes a tiny drag instead).
    clickTolerance: 20,
  });
  map.touchZoomRotate.disableRotation(); // pinch zooms, doesn't spin the map
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  window.__map = map;
  map.on("error", (e) => console.error("maplibre error:", e && e.error ? e.error.message : e));

  map.on("load", () => {
    // One generated flag icon per distinct color used in the data.
    const colors = new Set(geojson.features.map((f) => f.properties.color));
    for (const color of colors) {
      map.addImage(`flag-${color}`, flagIconCanvas(color), { pixelRatio: 2 });
    }

    map.addSource("ministries", {
      type: "geojson",
      data: geojson,
      cluster: true,
      // Matches the map's maxZoom (12): entries in the same city are
      // *expected* to stay clustered even at max zoom, by design (city-level
      // coordinates only, see the map's maxZoom comment above). The picker
      // list is how someone browses multiple entries that never separate.
      clusterMaxZoom: 12,
      clusterRadius: 50,
      maxzoom: 13, // must exceed clusterMaxZoom or tiles above it silently render empty
    });

    map.addLayer({
      id: "clusters",
      type: "circle",
      source: "ministries",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#2f6f4f",
        // Sized for a touchscreen TV, not a mouse — a circle's own radius
        // is its tap target, so this is the actual touch-target size.
        "circle-radius": ["step", ["get", "point_count"], 29, 10, 38, 50, 50],
        "circle-stroke-width": 5,
        "circle-stroke-color": "#ffffff",
      },
    });

    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "ministries",
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-size": 22,
        "text-font": ["Noto Sans Bold"],
      },
      paint: { "text-color": "#ffffff" },
    });

    map.addLayer({
      id: "unclustered-point",
      type: "symbol",
      source: "ministries",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["get", "iconId"],
        // Bigger than it looks like it needs to be — see flagIconCanvas()
        // for why (blank canvas margin, not just visual scale, is what
        // actually grows the touch target).
        "icon-size": 1.3,
        "icon-anchor": "bottom",
        "icon-allow-overlap": true,
      },
    });

    // Which ministries are within CLUSTER_RADIUS_PX screen-pixels of a given
    // map coordinate, at the current view. Used instead of the GeoJSON
    // source's own getClusterLeaves(), which — confirmed by hand — hangs
    // forever (no result, no error, ever) when the entries in a cluster sit
    // at exactly (or almost exactly) the same coordinates. That's expected
    // to happen often here: by policy locations are only city- or even
    // region-level (see the maxZoom comment above), so many entries can
    // legitimately share one point. This is small-dataset client-side work
    // (a handful to a few hundred entries), so recomputing it per tap is
    // cheap.
    function membersNear(lngLat) {
      const centerPx = map.project(lngLat);
      const members = [];
      for (const ministry of ministriesById.values()) {
        const loc = ministry.location;
        if (!loc) continue;
        const px = map.project([loc.lon, loc.lat]);
        const dx = px.x - centerPx.x;
        const dy = px.y - centerPx.y;
        if (Math.hypot(dx, dy) <= CLUSTER_RADIUS_PX) members.push(ministry);
      }
      return members;
    }

    // The zoom level that would put the closest two members of a cluster
    // SEPARATION_MARGIN_PX apart on screen, computed directly from their
    // real current on-screen distance (pixel distance from a fixed pair of
    // coordinates scales with 2^zoom, so this needs no simulated projection
    // and no async cluster math). Returns null when no zoom up to maxZoom
    // would do it — including when members sit at the exact same coordinate,
    // where no amount of zooming can ever separate them.
    const SEPARATION_MARGIN_PX = CLUSTER_RADIUS_PX + 20;
    function zoomToSeparate(members) {
      if (members.length < 2) return null;
      let minDist = Infinity;
      for (let i = 0; i < members.length; i++) {
        const pi = map.project([members[i].location.lon, members[i].location.lat]);
        for (let j = i + 1; j < members.length; j++) {
          const pj = map.project([members[j].location.lon, members[j].location.lat]);
          minDist = Math.min(minDist, Math.hypot(pi.x - pj.x, pi.y - pj.y));
        }
      }
      if (minDist <= 0) return null; // exactly coincident — zooming can never help
      // Bubbles only regroup at whole zoom levels, so round up to one, and
      // always go at least one level deeper than now — otherwise a small
      // fractional zoom leaves the bubble exactly as it was.
      const current = map.getZoom();
      let target = Math.ceil(current + Math.log2(SEPARATION_MARGIN_PX / minDist));
      target = Math.max(target, Math.floor(current) + 1);
      return target <= map.getMaxZoom() ? target : null;
    }

    // Tap a cluster -> ONE zoom move that separates its members, or none at
    // all — never a "tap again to zoom further" sequence, which is
    // disorienting for anyone not used to map apps. If no single zoom would
    // separate them (including entries at the exact same coordinate), skip
    // the zoom entirely and go straight to a pick-one list.
    map.on("click", "clusters", (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
      if (!features.length) return;
      const coords = features[0].geometry.coordinates;
      const members = membersNear(coords);
      const targetZoom = zoomToSeparate(members);

      if (targetZoom !== null) {
        map.easeTo({ center: coords, zoom: targetZoom });
      } else {
        openPicker(members);
      }
    });

    // Tap a flag -> open its detail panel.
    map.on("click", "unclustered-point", (e) => {
      const id = e.features[0].properties.id;
      const ministry = ministriesById.get(id);
      if (ministry) openDetail(ministry);
    });

    for (const layer of ["clusters", "unclustered-point"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }

    loadingEl.classList.add("hidden");

    // Pick up edits to the data folder automatically — this is a kiosk with
    // no one to hit refresh, so without this, someone editing a profile.json
    // (or adding/removing an entry) would never show up until the page
    // happened to reload on its own.
    async function refreshMinistries() {
      try {
        const fresh = await loadMinistries();
        ministriesById.clear();
        const freshGeojson = toGeoJSON(fresh);

        // Register a flag icon for any new color that showed up since load.
        for (const color of new Set(freshGeojson.features.map((f) => f.properties.color))) {
          if (!map.hasImage(`flag-${color}`)) {
            map.addImage(`flag-${color}`, flagIconCanvas(color), { pixelRatio: 2 });
          }
        }

        map.getSource("ministries").setData(freshGeojson);
      } catch (err) {
        // A transient read error (e.g. a file mid-save) shouldn't crash the
        // kiosk — just try again on the next tick.
        console.error("Failed to refresh ministries:", err);
      }
    }
    setInterval(refreshMinistries, 15000);
  });
}

main().catch((err) => {
  console.error(err);
  loadingEl.textContent = "Failed to load map: " + err.message;
});
