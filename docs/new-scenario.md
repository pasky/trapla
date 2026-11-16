# Adding and rebuilding a Czech scenario

Read `AGENTS.md`, `docs/multi-road-plan.md` (reviewed product choices), and the scenario's source note.
A **pack** identifies terrain and source objects; a **preset** identifies a mission/defaults and its save
slot. Do not reuse a road preset's save slot for a future motorway mission on the same terrain.

## Catalogue and choices

| Pack | Road exercise | Sources |
|---|---|---|
| `d11` | Trutnov → Polish border; original challenge/default/save semantics unchanged | PLAN.md; research/01–20 |
| `d3` | Jílové → Václavice, **including the Sázava crossing in 0302**, plus 0303 | research/25-d3-scenario.md |
| `d35` | Full Opatovec → Mohelnice preferred; explicitly named Opatovec → Staré Město only if measured budgets require it | research/26-d35-scenario.md |
| `i16-nova-paka` | Genuine class-I southeast bypass; reference 8.479 km, S11.5/70 | research/24-nova-paka-scenario.md |

These are road exercises, not claims that a two-lane road meets the actual D3/D35 motorway demand.
`src/core/data/scenario.ts` owns catalogue values, `presetId`, fresh-design `initial` category/speed,
and short picker copy. A default never overwrites a loaded current/best design. Project persistence and
Continue use `src/project-store-contract.ts`; no UI component invents a parallel project storage key.

The root URL opens four cards; `?scenario=d11` bypasses the picker. Missing/incomplete maps show a build
command and **Check again**, rather than a broken terrain view. **Scenarios** returns without clearing saves.
Node scripts select a pack with `SCENARIO=<id>` (or explicit `PACK` where supported).

## 1. Verify the corridor before fetching a raster

1. Visit current ŘSD/project leaflets and inspect the actual map, not just a place name or length.
   Resolve section boundaries, the intended river/ridge crossing, and current OSM construction status.
2. Choose actual map-node anchors or explicitly documented projected points. State any difference
   between the game endpoints, OSM reference and the official project's station limits/length.
3. Transform using `Transformer.from_crs(4326, 5514, always_xy=True)`; source `[lat,lon]` must be passed
   as `(lon,lat)`. Round the EPSG:5514 rectangle to 500 m and leave useful alternative-route margins.
4. Keep 5 m terrain and **at most D11's 15,750,000 cells** unless an explicitly reviewed larger budget
   is configured. Both total cells and the longest texture dimension matter. A long narrow D35 envelope
   can fit the same cell budget; this alone does not prove its longer evaluations/GPU drags fit.
5. Check DMR coverage, endpoint heights, source-road continuity and reference length after building.
   Do not infer local DMR acquisition dates from the original national survey dates. A current service
   can include later updates. Removing OSM pavement cannot undo existing cuts/embankments or aerial imagery.

Run all Python via `uv`; impose a practical process memory limit. Raster/polygon work must be bounded
by the actual rectangle or feature extent, never a mesh/ray or route/building Cartesian product.

## 2. Reproducible config and reference

Configs live in `pipeline/scenarios/<id>.json`. Raw OSM/TIFF/ČGS data stay ignored in `pipeline/cache/`.
Do not commit extracts. New scenario cache names are `osm_<id>_<query>.json`; D11 retains legacy names.
Each Overpass cache is reused only when its `.query.json` binding names the same canonical query (body,
bbox, output mode) and the cached bytes' SHA-256; hits pass the same completeness check as fresh
responses (an element list, no runtime-error `remark`). D11's original caches predate bindings and are
accepted only by the exact byte hashes in `frozenOverpassCaches`; those hashes are checked first, before
any output is touched, and a missing or changed frozen file aborts the build (never refetched, never an
empty legacy fallback). Any other cache is moved aside as `*.unbound~` and fetched again; an
interrupted binding counts as unbound. The hydrology snapshot carries a derivation record bound to the
rectangle and, when derived from `lines`, to its bytes. All writers of one pack directory (full build,
`build_transport.py`, `vectors.py`) hold an exclusive per-pack lock. New packs reject mirror snapshots older than `maxSnapshotAgeDays`
(default 30): one public mirror lagged months behind, mixing June buildings with November roads.
New packs set `coherentTransport`, so roads/rails for network, raster and rendering come from one query.

```json
{
  "id": "example",
  "name": "Start → End",
  "bbox5514": [-746000, -1079000, -733000, -1060000],
  "cell": 5,
  "requireComplete": true,
  "official": {
    "strategy": "strict",
    "query": "way[\"ref\"=\"D3\"];",
    "ref": "D3",
    "highway": "motorway",
    "wayIds": [149101901],
    "wayNodeRanges": {"149101901": [6393863317, 5108369461]},
    "startNode": 6393863317,
    "lengthRangeM": [15300, 15900]
  },
  "A": {"alongOfficial": 0, "note": "Document the actual start"},
  "B": {"latlon": [49.8036931, 14.5813856], "note": "Document the actual end"}
}
```

`official.query` is the Overpass body; the builder supplies its bounding box, output format and `out geom`.
The source manifest explicitly selects way IDs. `wayNodeRanges` selects an interior subsection of a long
OSM way by **node identity**, without retagging or fabricating geometry. The strict extractor:

- accepts `highway`, `construction` and `proposed` road kinds;
- traverses either OSM way orientation and preserves structure segment tags;
- connects shared node IDs, not nearby XY; refuses disconnected leftovers, cycles and ambiguous branches;
- checks endpoint identity/coordinates, selected-way completeness and a reviewed length range;
- rejects out-of-range `alongOfficial` rather than silently extrapolating.

D11 retains its original forward-chain extractor to keep its reference geometry unchanged. A missing
reference is `"official": null` with fixed `A/B.latlon`; output `official.xy/kinds` are empty and length zero.
View/labels must hide it; official-seeded scripts must reject/skip it explicitly. An old town road is not
a substitute for a missing proposed bypass unless the reference is honestly named as the old road.

## 3. Baseline, geology and provenance

For an already-open project, `baselineExcludeWayIds` is a reviewed, explicit ownership manifest. Filtering
happens **before** network, raster and vector construction, so overlapping unrelated infrastructure is
not erased by a pixel mask. Verify the old town road and every continuing branch. Do not remove all ways
with the route's ref. Document preserved junctions/new connectors and residual earthworks/photo effects
in `baselineNote`; provenance URLs go in `sources` and the research note.

Terrain uses ČÚZK DMR5G, land/transport/buildings OSM, ground ČGS GEOCR50 + IG rajons. Pipeline errors in
new packs are fatal, not a silent empty building layer or free geology. ČGS keyset queries have a bounded
object-ID fallback for regional ArcGIS query failures; failed polygons are never silently dropped.

The 25 m ground grid is mapped lithology plus **estimated weathering depths**, not a geotechnical survey.
Inspect unmapped descriptions and playable cell counts. Posázaví granitoids/hornfels/shales and the D35
sedimentary/metamorphic descriptions need broad regional mappings. Their depths are uncalibrated priors.
`groundProfileOverrides` replaces per-region depths/names before IG fallback profiles are copied. New
packs revert the five fitted D11 clastic profiles to their pre-fit priors; do not export D11's fitted
excavation shares as local evidence. Do not fit depths to the norm's 75/20/5 mixture or a desired bill.

Each complete new build emits `manifest.json` with config, raw OSM cache hashes and output hashes.
The builder removes **ready.json before writing any outputs**, and writes it only after every required
file and manifest succeeds. The picker requires this marker for new packs; stale metadata plus a partial
rebuild cannot appear ready. D11 keeps its original format. Equal metadata is not reformatted, because
legacy regression fingerprints include the raw metadata bytes.

### Additive transport graph

`transport.json.gz` is independent of legacy `overlays.net`, with its own identity (`TransportGraphData`,
`src/core/project-transport.ts`). Canonical OSM node/way identities, original source stationing, structure
and layer facts, rail tags and source-to-render feature/chainage correspondence support bounded edits.
Missing gauge/electrification/track-count tags remain unknown, not guessed. Bridges/tunnels are not draped
onto terrain and declared surveyed. A track count tag does not count independently mapped neighbouring ways.

`vectorData` hashes the **decompressed vector binary**, not gzip timestamps. Render correspondence carries
source metres through clipping, corner smoothing and thinning. Nominal display width is not a surveyed
road width; masking must also honor the renderer's casing/minimum-pixel passes and retain other sources.

New packs can declare `meta.transport`; legacy D11 uses a separate `transport-meta.json` sidecar so its
frozen raw metadata, network and scoring identity do not change. `pipeline/build_transport.py <id>` builds
sidecars against an existing pack in a temporary folder and checks identical legacy net/vector content
before publishing. For a complete pack it first verifies one coherent generation (ready marker, manifest
config/files/cache inputs byte-identical), removes the ready marker before writing and rewrites it last;
it never certifies an incomplete or mixed pack. `vectors.py` alone refuses complete packs (rebuild them
whole) and drops a legacy pack's graph sidecars before rewriting its vectors. Clipped render parts keep
source-segment provenance: overlay clipping splits self-crossing ways at the crossing, and each part is
matched to exactly one forward walk along its source, or the build fails. Different cache snapshots can contain conflicting node/way geometry: such source
bindings need explicit unresolved handling, never invented connectivity or snapping the frozen map.

Traffic of the mapped roads: `uv run --with requests python pipeline/fetch_census.py` (ŘSD census sections of every
scenario's area), then `uv run python pipeline/build_traffic.py <id>` writes the pack's `traffic.json`; without it
rebuilt roads start with class averages (research/40, research/41).

### Ends that join a retained road

An end may declare the retained road it joins: `"B": {..., "junction": {"kind": "roundabout-arm" | "merge",
"osmWayIds": [...]}}`. The builder maps the ways to network indices in `meta.B.junction`; the evaluator
treats our earthworks over exactly those ways, within the sourced zone of that end (`ENDPOINT_JUNCTIONS`,
research/28), as the junction's own works priced once by the junction allowance. Everything else stays a
conflict. `scripts/scenarios/check.ts` fails when no declared way comes within the zone. Nová Paka's
bypass joins the I/16 roundabout this way. D11 declares none, so its bills are unchanged and the cost
model version is not bumped.

## 4. Defaults are evidence or explicit game choices

- Category/speed: source a real cross-section/preset, or label it as a road exercise. Nová Paka starts
  S11.5/70; 70 km/h must remain playable. D11's exact defaults remain unchanged.
- Traffic: observed CSD AADT is not a design-year forecast, and adjacent counters are not additive trips.
  Cite the actual sections, year and forecast method, or mark demand as a **GAME PRIOR**.
- Heavy share: TV/AADT is contextual; acoustic NA includes more than census heavy vehicles. Record the
  operational assumption explicitly. The old representative TP188 capacity case is not locally calibrated.
- Time X: a mission choice, not a norm. Explain the route lengths allowed at each speed. Do not tune X or
  prices merely to force alternative designs into a preferred cost ratio.
- Existing nationwide price/noise/gradient simplifications still apply; new regional data are not evidence
  that those old assumptions have become locally surveyed or current-edition certified.

## 5. Build and validation

```sh
npm run data -- <id>
uv run --with numpy --with shapely --with pillow python -m unittest discover -s pipeline -p 'test_*.py'
npx tsc --noEmit
npx vitest run
npm run build
SCENARIO=<id> npx tsx scripts/bench.ts scripts/scenarios/<id>/*.json
npx tsx scripts/bench.ts scripts/*.json
npx tsx scripts/eval-regression.ts
node scripts/smoke.mjs
node scripts/playtest.mjs
for mode in bend road radius pin vpi; do
  node scripts/drag-perf.mjs --gpu --mode "$mode" --check
done
```

New fixtures go under **scripts/scenarios/<id>/**, never the top-level D11 glob. Check a feasible fresh
design and a reference fixture, validity, bill-part sums, actual endpoints, map/noise/photo, terrain range
and catchment truncation. Personally inspect screenshots. The full D35 decision requires measured eval,
load/memory and GPU-drag evidence, not just a successful raster allocation. Ask the parent for the GPU
slot first; close every browser/server. Crossing/footprint changes additionally run the outcome audit
from `AGENTS.md`. Never recapture D11's frozen bills to hide a changed pack or evaluation.

Ignored generated packs do **not** merge with git. After review/approval, copy complete new pack directories
(and D11's additive sidecars only) to the parent checkout. Keep source limitations and exact measured
pack dimensions/fingerprints alongside the validation report; availability of a national service alone
is not evidence that a playable pack exists.
