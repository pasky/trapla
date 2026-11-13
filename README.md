# Trapla — road design on real terrain (prototype)

Build the cheapest norm-abiding road from A to B on real Czech terrain, within a travel-time target
and for a given traffic. Scenario #1: Trutnov → Polish border (the D11 corridor).
Background, data sources and decisions: `PLAN.md`, `research/00-feasibility-map.md`.

![design](docs/screenshots/02-design.png)

## Quick start

```sh
npm install
npm run data      # builds public/scenarios/d11/ (≈ 14 MB; needs uv; ~10 min on first run, cached afterwards)
npm run dev       # → http://localhost:5173/
```

Other commands:

| command | what |
|---|---|
| `npm test` | vitest unit tests of the pure maths (geometry, earthworks, cost, auto-profile) |
| `npm run typecheck` / `npm run build` | TypeScript check / production build into `dist/` |
| `npm run bench [design.json]` | recompute timing + realism numbers in Node (default: straight line and an official-line-like design) |
| `npm run shots` | drives the app headlessly (Chromium + SwiftShader) and writes `docs/screenshots/*.png` |
| `npm run smoke` | interaction smoke test with real mouse events (add/drag/delete PI, profile takeover, undo, persistence) |
| `npx tsx scripts/optimize.ts <speed> <iters> [start.json]` | crude local search over PI positions (calibration aid) |

The headless scripts expect Chromium at `/usr/bin/chromium` (override with `CHROME=...`).

## How to play

- **Click** the terrain to add a bend (tangent intersection point, PI) to the nearest leg; **drag** a numbered PI
  to move it; **right-click** it or press <kbd>Del</kbd> to delete. Select a PI to edit its radius (auto = the
  smallest radius that satisfies the norm, incl. room for transition curves).
- Map: left-drag pans, right-drag rotates, wheel zooms.
- The grade line is computed automatically (dynamic programming, see below) whenever the horizontal
  alignment changes. Dragging a VPI in the profile panel takes manual control; **Auto profile** gives it back.
  Profile: double-click adds a VPI, right-click deletes, wheel zooms, drag pans.
- The HUD shows total cost, breakdown, quantities, travel time vs target, all violations (click to fly there),
  VALID / NOT VALID, and the best valid design so far. Undo/redo (Ctrl+Z / Ctrl+Y), reset; the design persists in
  localStorage.
- The game starts from the straight line with the automatic grade line; the cost of a design that is not valid is
  struck through. Hover the profile for the cost split at a station; drag in the cost strip under it (or click a
  curve / tangent in the band above it) to get the breakdown of that stretch, <kbd>Esc</kbd> for the whole route.

## Architecture

```
pipeline/build_d11.py   offline: DMR 5G terrain + OSM overlays + official line → public/scenarios/d11/
src/core/               pure, tested modules (no DOM)
  data/                 categories, norms, prices, scenario — all numbers live here, with source notes
  terrain.ts            5 m height grid (bilinear), land cover, out-of-bounds mask
  horizontal.ts         tangents + circular arcs, transition room, stationing
  vertical.ts           grade line, parabolic vertical curves
  autoprofile.ts        DP grade line (knots every ~250 m; state = elevation × incoming grade)
  sections.ts           cross-sections (crown + cut/fill slopes to daylight) against the terrain
  structures.ts         bridge / tunnel choice per station, gap merging, run-level cost check
  earthworks.ts         average-end-area volumes, mass haul with one balance line
  cost.ts, checks.ts    cost roll-up; norm checks as per-family functions (roads now)
  evaluate.ts           the whole recompute path design → result
src/worker.ts           runs evaluate() off the main thread, latest request only
src/render/view.ts      three.js: draped terrain chunks, route ribbon, markers, picking
src/ui/                 HUD and profile panel
```

Recompute for a ~21 km route takes ≈ 40 ms in Node (≈ 30 ms of it the auto-profile DP); ≈ 100 ms in the
headless SwiftShader browser where the CPU is shared with software WebGL.

## Scenario pack format (`public/scenarios/d11/`, generated, not committed)

| file | content |
|---|---|
| `meta.json` | grid (3500 × 4500 at 5 m, row 0 = north), origin in EPSG:5514, A/B, official line, texture tiles, attribution |
| `height.i16.gz` | gzip of row-wise int16 deltas of uint16 heights; h = base + q · 0.1 m (display-filled where no data) |
| `landcover.u8.gz` | gzip uint8 per cell: bits 0–2 class (0 none, 1 forest, 2 water/river, 3 building, 4 road, 5 urban, 6 rail, 7 stream); bit 3 built-up area; bit 5 river/water crossing, bit 6 railway crossing (must-bridge masks); bit 7 out of bounds |
| `tex_R_C.jpg` | 1024 px drape tiles: multi-directional hillshade × hypsometric tint + OSM overlays; OOB greyed and hatched |
| `overlays.json` | building centroids + radius, `binfo` (area, levels, kind, oriented rectangle per building), place names, main roads, `net` (existing road network for crossings) |

Game coordinates are local metres: `x = X_5514 − origin.x` (east), `y = Y_5514 − origin.y` (north).
The play area is the axis-aligned EPSG:5514 rectangle x ∈ [−637 500, −620 000], y ∈ [−1 011 500, −989 000]
(≈ 50.50–50.70 N, 15.82–16.06 E). Terrain is fetched in five 3500 × 900 px requests from the ČÚZK DMR 5G
ImageServer (raw responses cached in `pipeline/cache/`); OSM via Overpass (cached likewise).

## Data attribution

- Terrain: © ČÚZK, DMR 5G, CC BY 4.0.
- Overlays and the official D11 line: © OpenStreetMap contributors, ODbL.
- Prices: SFDI SPK CN 2026 and OTSKP 2026 (see `research/00-feasibility-map.md` §3).
