# Adding a new Czech scenario

A practical checklist for a second scenario next to `d11` (Trutnov → Polish border). The pipeline and the
game are generic enough to build and play another Czech area; what is **not** generic is mostly calibration
data (geology profiles, traffic, X) and some D11-only tooling. Read this together with `PLAN.md` (decisions),
`research/10-geology-excavation.md` (geology), `research/11-noise-calculation.md` (noise) and
`research/14-category-capacity.md` (traffic → category).

Naming: a scenario has an **id** (lower-case, e.g. `d35`) used for
`pipeline/scenarios/<id>.json` (pack build config), `public/scenarios/<id>/` (the pack),
`SCENARIOS[<id>]` in `src/core/data/scenario.ts` (game parameters) and the browser storage key `trapla.<id>`.
The app loads `?scenario=<id>` (default `d11`); the Node scripts take `SCENARIO=<id>`.

## 0. Prerequisites

- `npm install`, `uv` (Python deps are pulled per run by `npm run data`), network access for the first build.
- The area must lie in **Czechia**: DMR 5G (ČÚZK), ČGS geology and the ČÚZK orthophoto cover only CZ. Cells
  without DMR 5G become out-of-bounds (not buildable, shaded from a diffusion fill); ČGS gaps fall back to
  the norm 75/20/5 excavation mix. A border scenario (like D11) is fine, the far side is just unplayable.
- Size: D11 is 17.5 × 22.5 km at 5 m = 3500 × 4500 cells, ≈ 17.5 MB pack, ≈ 5 min build from cache. The
  renderer halves the height texture on GPUs limited to 4096 px, and evaluation time scales with route
  length, not area — but keep new areas of the same order (≤ ~25 × 25 km) unless you also check memory and
  load time (`node scripts/perf.mjs`).
- A planned/official line in OSM for the reference (see §2.3). It is currently **required** by the pack and
  the map (`meta.official`).
- Disk: `pipeline/cache/` grows by ≈ 200 MB per D11-sized area (DMR 5G tiles dominate).

## 1. Choose the area and the endpoints

1. Pick A and B where a real decision exists (valley vs ridge, town bypass vs direct, river crossing). The
   straight A–B line should be ~15–25 km for a playable session and fast recomputes (bench ≈ 30–40 ms on D11).
2. Choose the play rectangle in **EPSG:5514** (S-JTSK / Křovák East North; x and y are negative), axis aligned,
   with ≥ 2–3 km margin around any plausible route (bypasses swing wide). Convert lat/lon with pyproj
   (`Transformer.from_crs(4326, 5514, always_xy=True)`). Round to 500 m so cache file names stay readable.
3. Endpoints: either a distance along the official line (`{"alongOfficial": metres}` from the chain start,
   as D11 does) or a fixed point (`{"latlon": [lat, lon]}`). They must be inside the rectangle, on terrain
   with DMR data, and preferably on an existing road (the tie-in). An endpoint exactly on a motorway end is
   exempt from the motorway-crossing clearance (`CROSSING_RULES.endpointTolerance`, `src/core/data/urban.ts`).

## 2. Build the pack

### 2.1 Scenario config

Copy `pipeline/scenarios/d11.json` to `pipeline/scenarios/<id>.json` and edit:

| key | meaning |
|---|---|
| `id`, `name` | pack id (output dir) and display name (`meta.json`) |
| `bbox5514` | `[xmin, ymin, xmax, ymax]`, EPSG:5514 metres |
| `cell` | grid cell, m (keep 5: DMR 5G resolution, the engine assumes metre-scale cells) |
| `osmCache` | **omit** for new scenarios (default `osm_{id}_{name}.json`). D11 keeps the legacy unprefixed `osm_{name}.json`; the Overpass cache is keyed by query name only, so two scenarios must never share a pattern |
| `official` | `extract` (OSM JSON file), `ref` (OSM `ref` tag), `highway` (matches `highway=` or `construction=`), `startNear` (lat, lon of the chain start) |
| `A`, `B` | endpoint (see §1) and a `note` written to `meta.json` |
| `uses` | optional: the regional ÚSES ArcGIS layer for `pipeline/fetch_uses.py` (research only, not in the pack) |

### 2.2 Fetch and build

```sh
npm run data -- <id>            # = uv run … python pipeline/build_pack.py <id>; writes public/scenarios/<id>/
uv run pipeline/fetch_uses.py <id>   # optional, research only
```

What it fetches (all cached in `pipeline/cache/`, reruns are offline):

- **DMR 5G** heights (ČÚZK ImageServer `exportImage`, 900-row strips, bbox-keyed `dmr5g_*.tif`).
- **OSM** via Overpass (two mirrors with back-off): land cover, water/roads/rail, buildings, places, minor
  roads, render-only cover (`osm_<id>_{cover,lines,buildings,places,roads2,cover2}.json`). The query bbox is
  the lat/lon hull of the rectangle. Delete a cache file to refresh it.
- **ČGS geology**: GEOCR50 lithology + IG rajons 1:50 000, keyset-paginated, envelope-keyed `cgs_*`.
- Orthophoto is not fetched: the browser streams it from ČÚZK at play time (national service, no config).

Check the build log for: `nodata %` (DMR coverage), `ČGS unmapped lithologies: [...]` (must be handled, §3),
`ČGS ground cells (playable centres)` (which profiles actually matter), `official line chain: N ways, L m`
(must cover A–B), the A/B coordinates, and building/place counts (an empty OSM result means a failed fetch).

### 2.3 Official-line reference

The pack's `official` line is the dashed reference on the map and the seed of `optimize.ts official`,
`bench.ts` and `calibrate-ground.ts`. It comes from a committed OSM extract, not from the live Overpass
fetch, so it is reproducible. Create it once, e.g. for a planned D35 section:

```
[out:json][timeout:120][bbox:S,W,N,E];
way["ref"="D35"]["highway"~"^(motorway|construction)$"];
out geom;
```

Save as `research/data/<id>-osm-extract.json` (ODbL attribution is already in the pack). `build_pack.py
official_line()` keeps ways with that `ref` whose `highway` or `construction` equals `official.highway`,
starts at the way whose **first node** is nearest `startNear` and chains ways whose first node is within 5 m of
the previous end, preferring the straightest continuation. On a dual carriageway pick the carriageway whose
way direction runs from `startNear` towards the other endpoint (D11: the southbound one from the border).
Planned-but-unbuilt sections are often `highway=construction` or `proposed`; if the line is not in OSM at
all, digitise the ZÚR corridor into the same JSON shape. Where there is no planned road, an existing road
being replaced (e.g. `ref=16`, `highway=primary`) is a reasonable reference.

## 3. Geology (scenario-specific)

The ground grid maps each 25 m cell to an excavation profile: depth `classIto` of class-I material and
`classIIto` of class II, class III below (`pipeline/ground_profiles.json`; research/10 §3). Mapping is in
`pipeline/geology.py`:

1. `classify()` turns GEOCR50 attributes (`hor_karto`, `hor_typ`, `utvar`, `geneze`) into a profile key.
   Its rules were written for the lithologies **in the D11 envelope**: Quaternary deposits, Permian /
   Carboniferous clastics, Cretaceous/Triassic sandstone and marlstone, crystalline and volcanic rocks.
   Anything else becomes `unknown` → the norm 75/20/5 mix at any depth (no rock is invented). The build log
   lists the unmapped `hor_karto` strings. For each frequent one, add a rule (and a test in
   `pipeline/test_geology.py`) — e.g. consolidated Neogene/Paleogene rocks (Mostecko, Moravian flysch),
   Proterozoic/Palaeozoic shales and greywackes (Barrandien), granites (the `igneous` group only matches
   rocks starting with andez/bazalt/trach/ryolit/alkalický/amfibolit/zelená, *not* `granit` or
   `granodiorit`). Note what is classified only coarsely: all unconsolidated deposits without a matching
   genesis (loess, Neogene sands and clays mapped as unconsolidated) fall to `loam`; Cretaceous rocks are
   `cret_sand` or `marl` by the first words of the description only.
2. `IG_PROFILES` maps IG rajon codes to profiles for GEOCR50 gaps. Codes not in the dict are left at 0
   (norm mix). Extend it for codes present in the new area.
3. **Priors**: every new profile key needs `classIto` / `classIIto` and a one-line rationale in research/10
   §3 (or a new research note). Order them qualitatively (loose deposits deeper than weathered sound rock);
   the metres are estimates. Priority = the `playableCellCounts` printed by the build, weighted by where
   routes actually cut (deep cuts on ridges matter more than floodplains).
4. **Calibration against local excavation data**, if any exists: look for ŘSD/contractor reports with
   class I/II/III excavation volumes for a nearby section (D11 used ŘSD's 2026 seminar slide for 1109 SO 101:
   planned vs actual; research/10 §6), tender bills (OTSKP items 12273/12283/12293 are classes I/II/III), or
   GTP reports. `scripts/calibrate-ground.ts` fits two shared multipliers to selected profile rows so an
   official-corridor S 9.5 surrogate reproduces the reported class shares. It is **D11-specific** today:
   target volumes (`calibrate-ground.ts:26`), the fitted set (`:29`) and the surrogate design (`:24`,
   official points every 1.5 km between A and B) must be made arguments. Only fit the rows that dominate the
   reported section, and only if the section actually lies between A and B. Without local data, keep priors,
   say so in PLAN.md, and do not fit to 75/20/5.
5. Optional sanity check: ČGS boreholes (`Vrtna_prozkoumanost` layer 1, same envelope/keyset fetch — no
   script in the repo; research/10 §6 describes the query) give Quaternary cover depths per first bedrock
   material. They bound `classIto` loosely; they do not measure excavability.
6. Rebuild the pack: the ground fingerprint changes, which (by design) invalidates saved best scores.

## 4. Scenario parameters (game)

Add an entry to `SCENARIOS` in `src/core/data/scenario.ts`:

```ts
export const D35_SCENARIO: ScenarioParams = {
  id: 'd35', title: 'Úlibice → Ostrov', traffic: …, maxTravelMin: …, terrainClass: 'hilly',
  maxGradient: 0.06, heavyShare: …,
  labels: { a: '…', b: '…', official: 'official D35', brief: '<b>A</b> (…) to <b>B</b> (…)' },
};
```

- **Traffic Y** (design-year AADT, veh/day): from the ŘSD traffic census (CSD 2025 XLSX, rsd.cz → Sčítání
  dopravy; research/14 has the file link). Take the sections of the road(s) the new link would relieve, add
  the expected transit/induced growth to the 20th year, and justify it in PLAN.md as research/14 does for
  9,000. `minCategoryForTraffic()` maps Y to the minimum category by TP 188 LOS C (S 7.5 ≤ 6,990,
  S 9.5 ≤ 9,902, S 11.5 ≤ 11,650; D 27.5 stands in above). Choose Y deliberately on one side of a threshold.
- **heavyShare** (acoustic NA share for the noise model): CSD `TV / AADT` on the same sections, plus the
  transit uplift (research/11 §3: acoustic NA also includes buses and 35 % of light goods). Default 15 %.
  The night fractions follow from TP 219 automatically; limits 60/50 dB are national (NV 272/2011).
- **terrainClass**: `hilly` (SPK CN …NER rows, flat + hilly) or `mountainous` (…NEH). Only these two exist.
- **maxGradient**: ČSN 73 6101 per category and terrain (6 % for S 9.5 hilly; research/12).
- **Travel-time target X** (minutes; `travelMin = length / design speed`). Start from the official line:
  `X ≈ official length A–B / 90 km/h × ~1.03`, then check what each speed allows (`X × speed / 60` km vs the
  straight line), as PLAN.md "Travel-time target X" does: 90 should permit a bypass, 80 only a near-direct
  route, 70 should be impossible (or argue otherwise). Then calibrate with local search:

  ```sh
  SCENARIO=<id> npx tsx scripts/optimize.ts 90 2500 official /tmp/<id>-off90.json 1
  SCENARIO=<id> npx tsx scripts/optimize.ts 90 3500 - /tmp/<id>-direct90.json 2
  SCENARIO=<id> npx tsx scripts/optimize.ts 80 3500 - /tmp/<id>-direct80.json 3
  ```

  X is good when the cheapest valid designs of different strategies are within ~10–20 % of each other and none
  uses less than ~90 % of the time allowance trivially; if one strategy dominates by far, move X (or the
  endpoints). Record seeds and results in PLAN.md; save the best as `scripts/<id>-*.json` (D11's are
  `scripts/best-design.json`, `direct-80/90-design.json`, `town-centre-design.json`, `demo-design.json`).

## 5. Validation runs

```sh
npx tsc --noEmit && npx vitest run && npm run build
uv run --with numpy --with shapely python -m unittest discover -s pipeline -p 'test_*.py'
SCENARIO=<id> npm run bench                                  # straight / official-like designs, timing, parts sum
SCENARIO=<id> npm run bench -- scripts/<id>-best.json        # your saved designs; all VALID, no "parts sum" errors
SCENARIO=<id> npx tsx scripts/town-audit.ts scripts/<id>-best.json /tmp/<id>.svg   # urban/rural cost per km + map
npm run dev   # → http://localhost:5173/?scenario=<id>: endpoints, official line, buildings, photo, noise view (N)
```

Look at: cost per km against D11 (≈ 160–200 M CZK/km rural S 9.5 at 90 km/h) and against any published cost
of the real project; share of excavation classes (bench prints them); noise walls/buyouts in towns; crossing
counts; that A/B tie in where intended. For screenshots, `node scripts/views.mjs design.json '[[x,y,dist,
bearing,elev,"name",{}]]' outdir` renders arbitrary cameras — but it, like all headless scripts, opens `/`
(the default scenario) today; see the list below.

## 6. Hard-coded D11 assumptions

Generalised in the commit that added this file (D11 pack rebuilt byte-identically):
`pipeline/build_d11.py` → `pipeline/build_pack.py <id>` with `pipeline/scenarios/<id>.json` (rectangle, cell,
endpoints, official-line ref/extract/start, names, OSM cache pattern); `fetch_uses.py` reads the rectangle and
ÚSES service from the same file; `SCENARIOS` / `scenarioParams()` / `?scenario=` / `SCENARIO=` select the game
parameters and pack in the app, the worker (parameters now sent in the init message) and the Node scripts;
browser storage `trapla.<id>`; map/HUD labels (`labels`); optional per-scenario `heavyShare`.

Still D11-specific (file:line as of that commit):

| where | what | how to generalise |
|---|---|---|
| `src/main.ts:29-30` / `src/core/data/scenario.ts:65` | no scenario picker; `?scenario=` only | a start-screen list of `SCENARIOS` |
| `src/core/data/scenario.ts:5-25` | TP 188 thresholds for the representative D11 case: climb class 2 (hilly), curviness 75–150, 15 % slow vehicles | per-scenario `losVolume` / class, or a per-design TP 188 assessment |
| `src/core/data/urban.ts:68` | serviced building land 1,500 CZK/m² "around Trutnov" | per-scenario land price (research/07 method) |
| `src/core/data/prices.ts:77` | farmland/forest land 40 CZK/m² (national range, low local confidence) | per-scenario if the area is notably different (Prague fringe) |
| `src/core/data/urban.ts:195` | default heavy share 15 % (I/16 + transit) | set `heavyShare` per scenario (done for the field; value needs research) |
| `src/core/data/categories.ts:8` | only `hilly` / `mountainous` SPK rows | enough for CZ; flat areas use `hilly` (NER rows cover flat + hilly) |
| `pipeline/geology.py:61-107` | `classify()` rules cover the D11 envelope's lithologies only | add rules per area (§3.1) |
| `pipeline/geology.py:110-112` | `IG_PROFILES` lists only the D11 rajon codes | extend per area (§3.2) |
| `pipeline/ground_profiles.json` | clastic rows calibrated to D11 1109 SO 101 | separate priors per region or per-scenario overrides |
| `scripts/calibrate-ground.ts:24-29` | target class volumes, fitted rows and surrogate design for D11 | CLI arguments / a per-scenario calibration JSON |
| `pipeline/build_pack.py:659-667` | orthophoto service and attribution strings | national, fine for CZ; would need config outside CZ |
| `pipeline/scenarios/d11.json` `osmCache` | legacy unprefixed Overpass cache names | rename the cache files and drop the key (changes nothing in the pack) |
| `src/scenario.ts:25` (`PackMeta.official`), `src/render/view.ts:397-398` | an official line is required | make it optional (skip the label/legend, `official` seeds) |
| `scripts/*.mjs` (`screenshots`, `noise-view`, `build-tools`, `views`, `smoke`, `valley`, …) | open `/` (D11) and use D11 designs / camera positions | pass `?scenario=` from an env var; per-scenario design files |
| `scripts/town-audit.ts:54-59` | map window = stations 2–10 km (Trutnov / Poříčí) | window from the route's built-up stretches |
| `scripts/screenshots.mjs:102`, `scripts/*-design.json` | D11 camera notes and designs | per-scenario files |
| `tests/render.test.ts:86` | pack-vs-grid test runs on `public/scenarios/d11` only | loop over present packs |
| `README.md`, `PLAN.md` | D11 numbers (calibration, bench, X) | a section per scenario |
