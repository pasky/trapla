# Trapla — decisions and v1 scope

Background and all data sources: `research/00-feasibility-map.md`.

## Decisions (pasky, 2026-11-13)

1. **Region:** Czechia only for v1.
2. **Infrastructure type:** plain roads in v1. The engine must be ready for motorways and railways
   (and in theory subways) without a rewrite. Tunnels are not required in v1.
3. **Scenarios:** #1 D11 Trutnov – Polish border, #2 D3 through Posázaví, #3 D35 Opatovec – Mohelnice.
4. **Geology:** both a simple ground-category heuristic and the hazard layers (landslides, undermining).

## Game framing (pasky, 2026-11-13)

"Build the cheapest norm-abiding road from A to B, so that travel time is at most X and it handles
traffic Y." The three defaults below (category as data row, simple tunnels, browser platform) are accepted.
Comparison against the official line's price is not a priority for now; the official line is context only.

How the prototype interprets it:
- **Score:** total construction cost. Lower is better.
- **Hard constraints:** every geometric norm check passes; travel time ≤ X; the category fits traffic Y.
- **Travel time:** route length divided by the design speed the player picks for the road (90, 80 or
  70 km/h). A lower design speed permits tighter curves, so it is cheaper to build but slower.
- **Traffic Y:** selects the minimum road category. Thresholds are the highest design-year AADT at which the
  category still meets the class I level of service under TP 188 for a representative hilly section
  (research/14; ČSN 73 6101 has no daily-volume table).
- **Structures:** bridges and simple tunnels appear where they are cheaper than the embankment or cut.

## Scenario #1 as OpenStreetMap has it today

Overpass query on 2026-11-13, box 50.47–50.72 N, 15.80–16.12 E; raw result in
`research/data/d11-osm-extract.json` (© OpenStreetMap contributors, ODbL).

- D11 tagged `highway=construction`: 63.1 km of carriageway ways, i.e. roughly 31 km of route. This covers
  both Jaroměř – Trutnov and Trutnov – border; the latter is 21.2 km per ŘSD.
- A further 6.2 km of D11 carriageway next to the border is already tagged as a finished motorway, joining
  the Polish S3.
- Bridges: 6.8 km of carriageway ways, concentrated north of Trutnov.
- **Tunnels on the official line:** Poříčí (about 600 m) and Opevnění (about 525 m) on the Trutnov – border
  part, Kamenný vrch (about 725 m) further south. Each is two tubes.
- OSM carries no vertical profile; the official elevations have to be reconstructed or digitised.
- A play area of about 20 × 15 km covers Trutnov – border: 48 MB of terrain at 5 m, 300 MB at 2 m
  (uncompressed Float32).

## Two tensions in the decisions, with proposed resolutions

**D11 is a motorway, v1 is plain roads.** Proposal: the road category is a data row (width, design speed,
minimum radius, maximum gradient, norm prices). v1 is built and tuned for single-carriageway categories
(S 9.5, S 11.5), and the player's task in scenario #1 is a new road Trutnov → border. The official D11 is
shown as a reference line with its own computed cost. The motorway row can be switched on at almost no
cost, since only interchanges and twin tunnel tubes are motorway-specific; the head-to-head comparison
becomes meaningful once it is.

**The official line uses tunnels, v1 need not.** Proposal: include tunnels only as the simplest possible
structure — a player-marked stretch of the vertical profile priced by length from the SFDI norm, with no
portal or rock-class modelling. Without that, the official line cannot even be priced for comparison.

## Proposed v1 scope

In:
- Real terrain from DMR 5G for the scenario area.
- Alignment editor: horizontal (tangents, circular arcs, transition curves) and vertical (gradients,
  vertical curves), checked live against the category's limits.
- Earthworks from a standard cross-section: cut and fill volumes, mass balance, haul.
- Bridges and simple tunnels as player-marked stretches.
- Cost: SFDI norm per km, corrected for earthworks beyond the norm's built-in allowance at OTSKP prices,
  plus structures, plus land.
- Surface constraints: buildings, forest, water, protected areas; land cost by land type.
- Geology: ground category per cell (drives excavation class mix, cut slope, fill reuse) and hazard
  polygons as cost and risk penalties.
- Comparison against the official line: length, cost, earthworks, structures, land take.

Out of v1:
- Interchanges and junction design, drainage, staging.
- Traffic and benefit scoring (segment counts only shown as context, if at all).
- Railways, motorway-specific rules, other countries.

Kept ready by design: category table also holds rail and motorway rows; geometry checks are per-category
functions (road radius from speed and superelevation, rail radius from cant); costs are table lookups.

## Proposed build order

1. Scenario data pack for D11: terrain, land cover, buildings, protection, geology, official line.
2. Terrain view and horizontal + vertical alignment editor with norm checks.
3. Earthworks, structures and cost.
4. Constraints, land and geology effects.
5. Official-line comparison and score.

## Open choices (defaults in brackets)

- Platform (browser, continuing the three.js prototype; offline Python pipeline bakes scenario packs).
- Working resolution (5 m everywhere, 2 m within the edited corridor).
- Whether to buy ČSN Online for the missing 2018 tables (start with the older-edition values, flagged).
- Ask the Czech Geological Survey about shipping derived layers (yes, before anything is published).

## Working mode

Implementation and iterations run in `smart` mode; reviews are done in `deep` mode, called by the
implementing agent.

## First playable prototype (built 2026-11-13)

What exists (details and commands in `README.md`):
- **Data pack** (`pipeline/build_d11.py`, `npm run data`): DMR 5G at 5 m for a 17.5 × 22.5 km EPSG:5514
  rectangle (13 % of it is Poland = no data = out of bounds), OSM land cover / buildings / water / roads /
  places, official D11 line; since the renderer rewrite also vector map layers and building footprints
  (`vector.bin.gz`) instead of the baked drape texture. ≈ 17 MB.
- **Endpoints**: B = northern end of D11 where OSM switches ref D11 → S3 at the border (50.6887 N, 15.9774 E,
  first node of southbound carriageway way 896584498). The southbound carriageway is chained from B through
  connecting D11 ways; A = the point 21.0 km along it (50.5253 N, 15.9222 E, just south of Trutnov near the
  Trutnov-jih junction). Straight-line A–B distance 18.59 km.
- **Game** (Vite + TypeScript + three.js; pure core in `src/core/`, recompute in a Web Worker): 3D terrain,
  PI editor with radii, auto/manual profile, live checks, cross-section earthworks, automatic bridges and
  tunnels, cost roll-up, HUD with VALID state, best design, undo/redo, persistence. The game starts from the
  straight line with the automatic (legal) grade line; the cost of a design that is not valid is struck through.
- **Rules added during the build** (game rules, not norm values): river / water-area / railway crossings are
  always bridged (≥ 30 m) and need the grade ≥ 3 m above a river and ≥ 7.5 m above a railway (otherwise a
  violation; the auto-profile respects it); ordinary stream drainage is in the norm, with excess culvert
  barrel length priced explicitly since model 11. Since cost model 3
  motorways / expressways are treated the same way (see "Crossing existing roads"). Bridges are only
  considered ≥ 4 m above ground and bored tunnels with ≥ 14 m of cover; minimum bridge 30 m, tunnel 150 m;
  earthwork gaps shorter than 60 m (bridges) / 150 m (tunnels) are merged. Road base price is charged on at-grade
  length only. Slopes that do not reach the ground within 150 m and footprints leaving the terrain data are
  violations.

### Travel-time target X and traffic Y

- Y = 9,000 vehicles/day is the design-year (20th year) AADT. It requires **S 9.5** as the minimum category.
  Since research/14 the thresholds come from TP 188 (2018): the highest AADT at which a rural two-lane
  section still meets **LOS C**, which applies to class I roads. ČSN 73 6101 says “C to D”; the official TP
  188 class I example uses C.
  - Design hour: AADT × 0.103, the 50th-highest hour (TP 189 tab. 6).
  - Representative hilly case: climb class 2, curviness 75–150 grad/km, 15 % heavy vehicles.
  - LOS C volume: 1,200 veh/h for S 11.5, times 0.85 for S 9.5 and 0.60 for S 7.5.
  - Maximum AADT: S 7.5 ≤ 6,990, S 9.5 ≤ 9,902, S 11.5 ≤ 11,650. Above that, no playable two-lane
    category reaches LOS C, and D 27.5 stands in.
  - Y needs no change: S 7.5 falls 29 % short, while S 9.5 leaves 9 % headroom. Very winding designs with
    long steep climbs would need S 11.5 under a full assessment, and the game does not run that per design.
    Under LOS D, S 7.5 would carry 9,582.
- **X = 14.5 min.** At 90 km/h this allows 21.75 km = 1.17 × the straight line (the official line's 21 km fits);
  at 80 km/h 19.33 km = 1.04 × the straight line (only a nearly straight route); 70 km/h would need ≤ 16.9 km
  < 18.59 km, i.e. impossible.
- Cost model 10 repricing of saved local-search designs (2,500 seeded + 3,500 fresh trials per strategy under
  model 4, whole-metre PIs): official-corridor bypass at 90 km/h → **3.325 bn CZK**, 21.03 km, 14.02 min;
  direct eastern fringe at 80 → **3.694 bn**, 19.08 km, 14.31 min; direct fringe at 90 → **3.873 bn**, 19.59 km, 13.06 min. The slower
  direct route uses 98.7% of the time allowance; 70 remains impossible. Keep X = 14.5 min: it allows bypass vs
  short/fringe strategies without making the slower road dominant. The 11% / 16% whole-route premiums are
  explained by length/topography and mostly-open fringe routing, not a cheap dense-city corridor; the actual
  centre route is 9.035 bn. Spatial and per-km checks, uncertainty and reproducible seeds are below. These
  are local-search results, not proven minima; re-check as players find better designs.

### Reference design numbers (`scripts/demo-design.json`, S 9.5, 90 km/h, auto profile)

Cost model 10: 20.81 km, 13.87 min, **4.144 bn CZK = 199 M CZK/km**; includes one noise buyout
(29 M, including plot allowance). This reference is not the cheapest bypass; the saved-design comparison is below.

### PROVISIONAL / placeholder values (all in `src/core/data/`)

- Max gradient 6 % (older ČSN edition, S 9.5/S 11.5 hilly); vertical-curve minima crest 6000/3000/2500 m and
  sag 3400/2100/1500 m for 90/80/70 km/h (older edition; 90 uses the 100 km/h column).
- Side slopes fill 1:2, cut 1:1.75 (mapped lithology alone does not establish stable slopes).
- ČGS 25 m ground grid: local loose/weathered depths remain estimated, with Permian/Carboniferous
  profiles fitted to D11 1109 reported class shares; unknown cells use norm 75/20/5 (research/10 §6).
- Topsoil depth 0.3 m; topsoil allowance in the norm assumed over crown + 12 m.
- Land outside built-up areas 8 × 40 CZK/m² (research-informed estimate: research/07; Act 416/2009 §3b
  sources the 8× multiplier, farmland trades at 30–55 CZK/m², low confidence locally). Forest at 320 incl.
  timber, plus 50 CZK/m² (removal levy ≈ 20 + clearing ≈ 30), are PROVISIONAL estimates, not sourced local rates.
  Buildings, building land, crossings, noise and excavation classes: see the next section.
- Traffic → category thresholds: derived from TP 188 / TP 189 (research/14). The calculation itself is
  sourced. Still PROVISIONAL: LOS C rather than D for class I, and the representative climb class 2,
  curviness 75–150 grad/km and 15 % heavy vehicles. These are not assessed on the player's design.
- Decision prices for the auto-profile and structure choice: a m³ of fill material is worth a value between
  −196 (haul to a tip) and 536 CZK (bought fill less placing) that the auto-profile searches for (start 200);
  see "Mass balance" in the next section.
- Purchased fill: OTSKP 17180 (636 CZK/m³) is a composite item that includes placing; 17110 placing (100) is
  charged only on fill from the route's own cut (research/09 §3; exact current spec text unverified).
- 15 % of all cut is unsuitable (hauled 10 km, replaced by bought fill) — the norm's own assumption, applied
  identically to the allowance and to the design; the first 1 km of haul is free (included in excavation).
- Crossing clearances 3 m (river) / 7.5 m (railway).

### Known limitations

- Free haul (1 km) is credited on the pooled haul moment, not per movement.
- Mass haul uses a single balance line: cut may be hauled the whole route length if that is still cheaper than
  tip + borrow; no intermediate tips/borrow pits.
- Auto-profile is a grid search (2 m grid over the whole band, then 1 m within ± 6 m of that line; knots every
  ~250 m): its result is checked, and a failed search is reported, but a compliant line may exist that it did
  not find. The D11 reference design recomputes in ≈ 32 ms (Node), ≈ 24 ms of it the auto-profile.
- Auto-profile cost uses a flat-ground section estimate at rural rates, without buildings, local land-use
  costs, ordinary-road junction costs or noise. It does receive raw motorway/trunk clearance requirements
  (as well as river/rail crossings); final validation rejects missed clearances. The bill uses real sections.
- Cross-sections ignore crossfall/superelevation and curvature correction; transition curves are not drawn.
- The render mesh is 20 m (ribbon kept visible by a footprint mask that cuts the terrain); relief shading,
  contours and the map layers are drawn per pixel from the 5 m grid and from vectors, so only silhouettes and
  the edges of cuts show the coarse mesh. Buildings are flat-roofed boxes and stretch with the vertical
  exaggeration. The aerial photo is streamed from ČÚZK's view service (needs a connection; see README).

### Next steps

1. Auto-profile: price ordinary-road crossings, buildings and urban rates beyond clearance requirements.
   Player-marked structures and high-earthwork reserves are implemented (research/15); replace provisional
   stabilization allowances with site-specific geotechnical/hydraulic evidence, not an invented height cap.
2. Better mass haul (multiple balance lines, tips and borrow pits by distance).
3. Superelevation and crossfall in sections; transition curves drawn; sight-distance checks.
4. Land cost by BPEJ / cadastre, protection areas, geology hazards (active landslides / undermining),
   detailed borehole/weathering and fill suitability, finite-segment/terrain noise propagation, junction layouts.
5. Official-line comparison (digitise its profile), motorway category row, scenarios #2 and #3.
6. LOD terrain mesh (5 m near the camera); pitched roofs; demolished buildings shown on the 3D boxes.

## Town cost model and cost breakdown (2026-11-14)

Cost model 9 adds Czech vehicle-category emissions and day/night propagation with calibrated hard ground to model 7's
spaced junctions and geometry-priced crossing links/approaches. Geometric wall/cut diffraction and
building-only valuations with plot allowances remain. Noise sources and validation caveats: research/11.
The model distinguishes a dense urban cut-through from a shorter route skirting the eastern settlement edge;
whole-route ratios alone do not measure the cost of building through town.

### Start and validity

- The game starts from the straight line with the **auto profile**.
- A saved "best valid design" carries the cost-model version (`COST_MODEL_VERSION`); bests from an older model
  are dropped, since their scores are not comparable.
- The total of a design that is NOT VALID is struck through, greyed and labelled "invalid — fix the violations;
  this cost does not count".

### Cost breakdown of a stretch

- The bill is built **per station cell** (cell i = the 10 m nearest to station i, half that at the ends), one
  array per component (`Result.parts`: road base, excavation, fill placing, haul, surplus haul, unsuitable haul,
  bought fill, topsoil, bridges, tunnels, crossings, noise walls, other-objects surcharge, land, forest,
  footprint buildings, noise buyouts). The totals are the sums of these arrays (`core/cost.ts` `costParts` → `sumParts`), tested.
- Global mass-balance items are spread over the cells that cause them: bought fill over the fill volumes,
  surplus and unsuitable haul over the cut volumes, haul along the route over all volume moved; the surcharge
  follows each cell's construction cost (at that cell's rural/urban rate). A building is billed to the station
  nearest to it, a crossing to its station. A noise buyout is billed once, at its worst unscreened receiver
  station; it never also pays as a footprint demolition or generates a wall after acquisition.
- UI: an alignment band (tangents / curves with radius) and a stacked **cost-per-metre strip** under the
  longitudinal profile on the same horizontal scale (square-root height scale so a demolished block does not
  flatten everything else; never averaged over less than 50 m). **Hover** the profile → tooltip with the key
  facts (cut/fill height, structure, land use, crossing, noise wall, buildings) and the CZK/m split. **Drag** in
  the strip (or Shift+drag anywhere), or **click** a tangent/curve in the band → the HUD breakdown switches to
  that range (length, cost, cost per km, share of the route, quantities) with a "Whole route" reset (also Esc);
  the range is highlighted on the map. Markers in the profile: crossed roads (at the crossed road's level),
  variable-height noise walls, red footprint-demolition squares and magenta noise-buyout diamonds.
- State for the renderer: `state.ts` `RangeSelection` (selected station range) and `Result.walls` /
  `Result.crossings` / `Result.demolished` / `Result.boughtOut`; walls drawn by `src/render/extras.ts`, which only uses `View.world`,
  `View.local()` and `View.requestRender()`.

### Town cost model (all numbers in `src/core/data/urban.ts` and `prices.ts`)

- **Buildings by size**: the pipeline exports per building the footprint area, `building:levels`, a kind (house,
  apartments, civic, industrial/commercial, minor) and an oriented bounding rectangle. Cost = floor area
  (footprint × levels) × (building-only replacement estimate × 1.5 + demolition), both per kind. This is a
  PROVISIONAL appraisal proxy; Act 416/2009 §3b supplies the multiple, not the replacement-cost method.
  Land is billed separately by corridor area. Hit test: the rectangle against the
  footprint strip (slope edge to slope edge at grade, the deck under bridges) widened by a working strip; none
  in tunnels.
- **Land by land use**: a built-up mask (OSM landuse residential / commercial / industrial / retail; bit 3 of
  the land-cover byte, 30.8 km² = 7.8 % of the play area) prices land as building land.
- **Urban construction rates**: at-grade length inside the mask uses the SPK CN "intravilán" rows (S 9.5:
  67.852 instead of 56.912 M/km; S 11.5: 82.035; S 7.5: 42.883), tunnels the urban tunnel rows, and
  construction there gets the urban other-objects surcharge +49.3 % instead of +30.6 % (by the built-up share
  of each cell's footprint).
- **Crossing existing roads**: the pipeline exports the OSM road network (motorway … residential, service,
  track; bridges/tunnels left out). Each crossing is resolved by the grade's height above the crossed road's
  ground: ≥ 6 m above → a forced short bridge on the new road (the same mechanism as rivers/railways; the
  owner's "street buried next to a bridged railway" case); ≤ −6 m → candidate overbridge carrying the
  crossed road, span = cut width × its SPK bridge-width row (+ surcharge), or a cheaper parallel link. Otherwise,
  class I–III roads are junction candidates: deterministic greedy class I before II before III, then station
  order, **≥ 1.5 km from other junctions including A/B tie-ins** (already paid in BILL). Research/12 §2
  supports ČSN 73 6101:2018 at medium-high confidence; the same spacing in built-up areas is our conservative
  scenario assumption, not a sourced ČSN 73 6110 value. A retained junction stays 25 M (low-confidence
  roundabout-based allowance, research/13); streets, accesses and tracks never become direct junctions.
  Rejected through roads and local/service roads get the cheaper of a parallel reconnection or overbridge;
  tracks get a diversion or shared overbridge. Existing main-road bridges/tunnels are retained first.
  Resolve remaining crossings in tiers (through roads, local roads, services, tracks), nearest to an
  **already resolved** compatible road first, with station order breaking ties. Link to that road or A/B.
  This creates acyclic connections, not two severed roads pretending to connect only to each other; close
  tracks share a crossing via a chain. Expanding outward avoids station-order overlapping links.
  Through/local roads cannot discharge into tracks or service roads;
  motorway/trunk crossings are never link targets. A/B allowances are assumed to include local collector
  connections, **not direct accesses onto D11**. This is a local greedy, not optimal network routing.
  Link quantity = **2 × max(25 m, actual station gap)** (one link on each side); maximum reach 750 m per
  side. Beyond that, build an overbridge rather than cap an unreachable link's price. Bounds are heuristics.
  SPK CN 2026 standard flat+hilly road rows price the total length: class I/II/III by corresponding width;
  local/service links M7.5 rural 24.133 M/km or M11.5 urban 32.930 M/km, selected by the crossing's built-up
  mask (not a survey of the link). Tracks use **paved P4 13.986 M/km**, conservative for unpaved tracks but
  traceable, unlike the unsupported 1.5 M/km gravel allowance. Service links add 0.5 M for one simple sjezd
  onto the local network (very low confidence), not onto our road. Overbridge = footprint-width span × SPK
  bridge-width row + **2 × max(0, 6 + h) / 0.06 m** of approaches × crossed-road row, h = new grade minus
  crossed-road ground. The 6% ramp is a heuristic; road norms include standard approach earthworks, not a
  separate invented embankment lump sum. SPK works get the cell's other-objects surcharge; junction/sjezd
  all-in allowances do not. Service roads and tracks never force a bridge on our road. Motorways and expressways
  (OSM motorway / trunk; cost model 3) are never crossed at grade: like a railway, the grade must clear them by
  7.5 m (forced bridge; the auto-profile requests this) or pass ≥ 6 m below them (overbridge); anything in
  between is a violation. Hard constraints and auto-profile clearance use **every raw crossing**, sorted
  together with river/rail samples in station order before profile sampling. Only an intersection within
  **1 m along the route of A or B** is exempt, a coordinate-tolerance allowance for joining the road the
  endpoint itself lies on (B is on D11, ≈ 0.31 m from its mapped centreline). This narrow tolerance can
  flag shallow-angle approaches; it is not an exemption for arbitrary crossings of the endpoint's way.
  No 150 m safety exemption, and none for another carriageway 20 m away. The saved designs approach B
  without intersecting either motorway centreline. **Billing only** merges crossings within 30 m, or
  the same OSM way within 150 m. Ordinary-road objects within 150 m of A/B belong to the tie-in allowance;
  motorway/trunk overbridges still pay there, except at the actual endpoint intersection.
  A crossing under a new bridge or above its tunnel is free. Profile tooltips show junction / overbridge
  (span and approaches) / reconnection or diversion (total metres and target station); HUD totals count
  each resolution and sum link lengths. All crossing works are attributed to the source crossing cell.
- **Excavation by mapped geology** (model 10, research/10): cached ČGS GEOCR50 (1,690 polygons) + IG
  rajons (1,230), 25 m cell-centre raster. Each transverse cut strip samples estimated local loose /
  weathered / competent layers; auto-profile uses centreline-local cost LUTs and real sections for balance.
  Permian sandstone uses 3.5/5.9 m, conglomerate 2.6/3.9 m, fine beds 5.2/8.9 m; not measured depths or
  ČSN thresholds. A 2026 ŘSD report gives D11 1109 SO101 **42.43/18.19/39.38%** I/II/III, versus planned
  **55.90/23.97/20.13%**. A two-parameter clastic-bedrock fit reproduces **42.56/18.05/39.39%** on the
  official-ish S9.5 surrogate; its width/grade/structures differ from actual D11, so this is calibration,
  not independent validation. ČGS borehole cover-depth median 3.1 m supports thicker cover but does not
  measure excavability. Full table, source quantities, fitting command and uncertainty: research/10 §6.
  Prices stay 183/391/653 CZK/m³; norm allowance and unmapped cells (1.11% of playable centres) use
  75/20/5. Tooltip names ground/depth estimates; pack fingerprint invalidates incomparable best scores.
- **Noise calculation — compact, not an acoustic study**: `core/road-noise.ts` uses Czech **Manuál 2018,
  verze 2020** category speed/emission equations (OA 74.1 / NA 81.1 dB reference constants), standard
  ACO11/SMA11 and TP219 class-I non-E day/night allocation. Acoustic heavy share **15% is a scenario prior**;
  heavy speed is capped at 80 km/h. At 9,000/day, 9.2% of OA and 15.4% of NA traffic falls at night.
  NV272/2011 §12 + annex3 A gives **60/50 dB** for this new road: 50 base +10 road correction, −10 at night;
  55/45 is not the new-class-I rule (legal text in research/11). Compute 16h day and 8h night LAeq separately;
  E = max(Lday−60, Lnight−50). **Ground class is fitted hard (Uo)**: across eight day/night/height
  observations in two studies, RMSE falls **2.823→1.372 dB**, mean residual **−2.720→+0.720 dB**.
  The manual specifies discrete ground classes, not a continuous G or source-side split; hard is the
  least-squares class with conservative mean bias. No emission correction. Residuals remain −0.42…+2.57 dB;
  incomplete site inputs and use as calibration data preclude an independent accuracy claim (research/11 §4).
  Optional mixed Uo/Up remains for sensitivity. The **explicit terrain approximation** substitutes slant range
  for flat-ground distance (mixed mode also uses effective ray height); no porous credit in the hard default.
  At 80/90 km/h the night contour is **90.0/97.0 m** for a 1.5 m receiver, **89.9/96.9 m** at 4.5 m,
  **89.4/96.5 m** at 10.5 m (axis-to-receiver, add 2 m for façade). No guessed D scaling remains.
  Queries use the all-height hard-ground bound, including when mixed is selected.
  Horizontal receiver position is axis-to-**nearest oriented-rectangle façade** distance minus 2 m
  (clamped to 1 m). Source/propagation terms are tabulated once per design.
  The highest occupied receiver is 1.5 + 3 × (storeys − 1) m above building ground, using tagged levels or
  kind defaults. Each pair uses an equivalent 2D section: source at 1.75 m from the axis towards the receiver,
  0.5 m above road grade; wall at crown/2 + 1.5 m, based at road grade (shoulder-side allowance, **not the
  embankment toe**, same on bridges). The protected-façade distance supplies the horizontal receiver position.
  For each 3 / 4 / 5 m wall, test source-to-receiver line of sight at the wall; if the receiver sees over it,
  benefit is zero. Otherwise δ = source→top + top→receiver − direct, N = 2δ/0.68, and
  IL = clamp(10·log₁₀(3 + 20N) − 5, 0, 13) dB. This simplified Maekawa expression at 500 Hz is corrected by
  a **provisional 5 dB allowance**, not a standard traffic correction, for distributed/broadband noise and
  omitted ground/end effects. The 13 dB cap is conservative between FHWA's 10 dB “attainable” and 15 dB “very
  difficult”; sources and caveats in research/09 §5. A distant fourth-floor receiver can lie well inside the
  barrier's shadow; height above the wall alone does not imply failure. Contiguous walls take the worst
  protected dwelling's required height, with 50 m end margins; billed surface is length × height.
  Margins can extend into cuts even where the local earth edge suffices (only tunnels break a wall).
  A positive cut edge uses the **same diffraction formula**, top = daylight elevation relative to grade,
  offset = daylight distance. Take the better of earth edge and wall, never add their attenuation. Upper
  floors seeing over a 4 m cut remain exposed. Only tunnels fully shield; no terrain shield under bridges
  or at embankment toes. Only houses/apartments are receivers.
- **Noise buyouts**: if neither the cut edge nor a 5 m wall can protect a dwelling at any station, acquire
  the whole building at 1.5× its building-only estimate **plus demolition**, as for footprint removals,
  **plus a PROVISIONAL plot**: max(3 × footprint, 400 m²) × building-land price (1,500) × 1.5 CZK.
  This is an additional-land allowance, not a cadastral parcel model; plot overlap/severance is unresolved.
  Footprint buildings do not pay this allowance: only corridor land is billed separately, not whole plots.
  Working-strip removals / partial footprint takes therefore remain approximate and may underprice acquisition.
  Demolition prevents continued residential exposure; retaining it for another use is not modelled.
  `Result.boughtOut`, `parts.noiseBuyouts` and the HUD/profile distinguish these from footprint demolitions.
  Windows are not a substitute: they address indoor noise, not the protected outdoor façade receiver.
  No blanket 50 m protection-zone purchase rule is added (research/07); the noise rule already removes close
  homes when geometric mitigation fails. Parcel severance remains unmodelled.
- **Mass balance** (found while re-running the comparisons): with depth-dependent excavation the old fixed
  decision prices left the reference design buying 1.15 M m³ of fill (+0.9 bn). The bill is very sensitive to
  how the auto-profile values cut against fill (± 5 % for ± 15 % of that value), so the auto-profile now
  **searches** for it: decisions value a m³ of fill material at λ (fill costs placing + λ, cut earns 0.85 λ);
  one coarse DP pass fixes the corridor, then the fine pass is repeated for up to four λ (bracketing +
  interpolation) until the grade line's balance — measured with real cross-sections on every second station and
  the real structure choice — is within 1.5 m³ per metre of route. Typical result: λ ≈ 165–215 CZK/m³, bought
  fill or surplus below 0.2 M m³. The single-balance-line haul optimiser minimises the same bill as
  `costParts`: max(0, moment − reused × freeHaul), surplus haul, and bought fill net of avoided own-fill placing.

### Values and PROVISIONAL assumptions

Research-informed since model 3 (research/07–09); sourced numbers and PROVISIONAL estimates are distinguished below.
SPK CN / OTSKP norms are at 2026 level; market/contract examples retain their original dates, **not escalated to 2026**.
Act 416/2009 §3b: the 8× (non-building land) and 1.5× (building land, buildings) multiples apply to the price set
by an expert appraisal, which is the usual (market) price — the assessed "official" price only where a usual
price cannot be determined (research/07 §1).

| Value | Number | Note |
|---|---|---|
| Building-only price, houses / apartments / civic | 50,000 / 55,000 / 55,000 CZK/m² floor area | × 1.5; house = researched replacement recommendation (40–55k new construction, excl. plot); apartments/civic = PROVISIONAL replacement proxies, not local building-only appraisals (research/07) |
| Price, industrial / commercial / barns | 20,000 CZK/m² | × 1.5; hall replacement ≈ 15,000 (research/07) + business relocation (unverified) |
| Building-only price, garages / sheds / anything < 30 m² | 15,000 CZK/m² | × 1.5; PROVISIONAL simple unheated-structure replacement estimate, not the researched 650k garage sale including land |
| Demolition, house / apartments / civic / industrial / minor | 3,000 / 4,000 / 4,000 / 1,500 / 1,500 CZK/m² floor | ≈ 1,000 CZK/m³ built volume for a house; ranges 2–5k / 3–8k / 1–4k (research/07 §5) |
| Default storeys when untagged | house 2, apartments 4, civic 2, industrial 1, minor 1 | tagged levels capped at 12 / 12 / 6 / 3 / 2 |
| Classification of `building=yes` (46 % of buildings) | < 50 m² minor; by land-use zone, address; ≥ 300 m² outside any zone = industrial | `pipeline/build_d11.py` `building_info` |
| Working strip for demolitions | 3 m beyond the footprint / deck edge | |
| Building land | 1,500 CZK/m² × 1.5 | research/07 (range 600–3,500); other land 8 × 40 |
| Grade separation thresholds | ≥ 6 m above (4.8 m clearance + deck) / ≤ −6 m below | heuristic: 4.8 m clearance is ČSN 73 6201, the deck depth unverified (research/08) |
| Junction with a through road (class I–III) | 25 M CZK | PROVISIONAL research-informed estimate from roundabout awards 19.8–37.5 M; no isolated T/X-junction contract found (research/08) |
| Motorway / expressway | no at-grade crossing | bridge ≥ 7.5 m above or overbridge ≥ 6 m below (research/08) |
| Junction spacing incl. A/B | 1.5 km | rural ČSN 73 6101:2018 via research/12 §2, medium-high confidence; same urban rule is a scenario assumption |
| Parallel links, both sides | 2 × max(25 m, station gap), reach ≤ 750 m per side | heuristics; beyond reach choose overbridge, never truncate cost |
| Local/service reconnection | 24.133 / 32.930 M CZK/km rural / urban | SPK A.1.M.7,5.NER / M.11,5.NIR; mask at crossing, flat+hilly rows |
| Service sjezd / track diversion | +0.5 M per service reconnection / 13.986 M/km | research/13 sjezd very low confidence; SPK A.1.P4.NE paved field road, not gravel |
| Raised overbridge approaches | total 2 × max(0, 6 + h) / 6% metres × SPK road row | heuristic gradient; includes standard earthworks, no separate fill lump sum |
| Crossed-road widths for overbridges | 27.5 / 11.5 / 9.5 / 7.5 / 6.5 / 4 m by class | priced by the SPK CN bridge row of that width |
| Excavation weathering profiles | ČGS lithology + estimated local I/II bottom depths, III below; unknown = 75/20/5 | `pipeline/ground_profiles.json`; local D11 aggregate fit, not measured strata (research/10 §6) |
| Noise source / traffic | Czech 2018/2020 OA/NA equations; 15% acoustic heavy share, heavy speed ≤80 | Emissions and TP219 time distribution sourced; heavy share/design-speed proxy are assumptions; hard ground is the conservative categorical EIA fit (research/11) |
| Noise wall | 3 / 4 / 5 m, 10,000 CZK/m²; 50 m margins | PROVISIONAL calibrated recommendation (8–14k); only project datapoint assumes 3 m height (research/09 §1). Cut edges use diffraction, not a depth exemption |
| Excess and attenuation | E = max(Lday−60, Lnight−50); IL = clamp(10·log₁₀(3 + 40δ/0.68) − 5, 0, 13) | Czech Uo for calibrated hard ground (mixed Uo/Up optional), approximate slant geometry; Maekawa best of cut edge / wall, correction/cap still PROVISIONAL (research/09 §5, research/11) |
| Source / wall position | source +0.5 m high, 1.75 m off axis; wall at crown/2 + 1.5 m | PROVISIONAL equivalent 2D section at road grade, not slope toe |
| Upper-floor receiver | 1.5 + 3 × (levels − 1) m above building ground | PROVISIONAL; geometric sightline and path difference, not a height-only penalty |
| Noise-infeasible dwelling | 1.5× building-only value + demolition + plot max(3 × footprint, 400 m²) at 1,500 × 1.5 | acquisition and additional-plot rule PROVISIONAL; no window-only outdoor compliance |
| Material value for decisions | search in −196 … 536 CZK/m³ from 200; tolerance 1.5 m³/m | bounds = haul to a tip / bought fill less placing |

### Numbers with the new model (S 9.5, auto profile, `npx tsx scripts/bench.ts <design.json>`)

Cost model **10**, adding mapped/calibrated geology to model 9's Czech day/night noise and geometric crossing costs.
All five saved alignments stay fixed from model 4; all remain valid, no tunnel. Per-cell parts sum to
every total. Historical short reoptimisation results are recorded separately below; not global optima.

| M CZK | Reference bypass | Optimised bypass 90 | Direct fringe 80 | Direct fringe 90 | Town centre 90 |
|---|---:|---:|---:|---:|---:|
| design file (`scripts/`) | `demo-design.json` | `best-design.json` | `direct-80-design.json` | `direct-90-design.json` | `town-centre-design.json` |
| length km / min | 20.81 / 13.87 | 21.03 / 14.02 | 19.08 / 14.31 | 19.59 / 13.06 | 18.94 / 12.62 |
| model 6 total (same geometry) | 3,949 | 3,038 | 3,470 | 3,626 | 9,024 |
| model 7 total (same geometry, old noise) | 4,158 | 3,305 | 3,690 | 3,807 | 9,182 |
| model 8 total (mixed ground) | 4,078 | 3,276 | 3,617 | 3,774 | 8,930 |
| model 9 total (before geology) | 4,105 | 3,303 | 3,661 | 3,799 | 8,957 |
| **total** | **4,144** | **3,325** | **3,694** | **3,873** | **9,035** |
| per km | 199 | 158 | 194 | 198 | 477 |
| road base | 864 | 862 | 769 | 782 | 719 |
| earthworks | 1,073 | 718 | 586 | 843 | 1,604 |
| bridges | 278 | 319 | 614 | 614 | 1,194 |
| road crossings | 328 | 289 | 271 | 225 | 179 |
| noise walls | 117 | 71 | 184 | 129 | 288 |
| other objects | 776 | 665 | 741 | 787 | 1,270 |
| land / forest | 270 / 12 | 229 / 8 | 247 / 9 | 236 / 13 | 323 / 15 |
| footprint buildings (count) | 397 (18) | 166 (11) | 273 (36) | 244 (29) | 3,358 (116) |
| noise buyouts incl. plots (count) | 29 (1) | 0 (0) | 0 (0) | 0 (0) | 83 (2) |
| in built-up area km | 1.20 | 0.44 | 1.70 | 0.99 | 2.17 |
| bridges: count / m | 6 / 480 | 7 / 550 | 9 / 1,060 | 9 / 1,060 | 12 / 2,060 |
| noise walls m / m² | 3,568 / 11,745 | 2,359 / 7,078 | 5,518 / 18,363 | 4,098 / 12,895 | 7,739 / 28,796 |
| crossings (paid) | 31 (28) | 28 (24) | 31 (24) | 35 (23) | 40 (24) |
| junction / overbridge / reconnection / diversion | 4 / 9 / 3 / 12 | 3 / 12 / 2 / 7 | 2 / 13 / 4 / 5 | 3 / 6 / 2 / 12 | 0 / 6 / 10 / 8 |
| cut / fill k m³ | 2,043 / 1,795 | 1,517 / 1,327 | 1,293 / 1,105 | 1,684 / 1,473 | 2,685 / 2,392 |
| cut I / II / III % | 47 / 18 / 35 | 57 / 19 / 23 | 59 / 19 / 22 | 51 / 20 / 29 | 35 / 16 / 49 |

Search provenance: the saved bypass/direct80 are seeded-search outputs, direct90 the fresh-search output
(the cheapest valid result of each strategy under model 4). Bypass searches start in the official corridor
but are not constrained to it. No global-optimality claim. Reproduce those searches with model-4 code
(commit `cecb3e9`); original inputs remain in commit `a6a93b6`. Evaluate the saved outputs with current code
for the fixed-geometry numbers above:

```sh
git show a6a93b6:scripts/best-design.json > /tmp/start-bypass.json
git show a6a93b6:scripts/direct-80-design.json > /tmp/start-direct.json
npx tsx scripts/optimize.ts 90 2500 /tmp/start-bypass.json /tmp/bypass-seeded.json 20261114
npx tsx scripts/optimize.ts 80 2500 /tmp/start-direct.json /tmp/direct80-seeded.json 20261115
npx tsx scripts/optimize.ts 90 2500 /tmp/start-direct.json /tmp/direct90-seeded.json 20261116
npx tsx scripts/optimize.ts 90 3500 official /tmp/bypass-fresh.json 20261117
npx tsx scripts/optimize.ts 80 3500 - /tmp/direct80-fresh.json 20261118
npx tsx scripts/optimize.ts 90 3500 - /tmp/direct90-fresh.json 20261119
```

Historical model-7 continuation searches: 500 iterations each from the saved bypass/direct80/direct90,
seeds 20261121 / 20261122 / 20261123, yield **3,226 / 3,653 / 3,796 M**, all VALID (21.07 / 19.12 /
19.61 km, 14.05 / 14.34 / 13.07 min). Kept as experiments, not substituted into the five saved comparison
geometries during concurrent geology/noise calibration. Reproduce with model-7 code and
`npx tsx scripts/optimize.ts <90|80|90> 500 scripts/<design>.json /tmp/candidate.json <seed>`.

**Calibration and spatial check:** current direct80 / bypass = **1.111×**, direct90 / bypass = **1.165×**,
centre / bypass = **2.717×**. The modest fringe premium warranted inspecting the mask, roads and oriented building
rectangles (`scripts/town-audit.ts design.json map.svg`), not adding a multiplier to force a preferred ratio.
The 80 km/h line skirts eastern Kryblice / garage rows at km 3–4, crosses the narrow developed valley at the
western edge of Poříčí's industrial strip around km 5, and skirts / crosses Voletiny at km 6–7. It does not
cut through central Trutnov's blocks. Some garage yards fall outside the OSM built-up mask, but the long
unmasked gaps here are genuinely open slopes; treating every metre within 300 m as urban construction would
substantially overstate the developed corridor.

| Audit metric | Bypass 90 | Direct fringe 80 | Direct fringe 90 |
|---|---:|---:|---:|
| Within 300 m of any built-up cell: km / M CZK per km | 7.43 / 193 | 13.38 / 221 | 12.27 / 231 |
| Outside 300 m: M CZK per km | 138 | 124 | 133 |
| At grade, ≥ 50% built-up footprint: km / M CZK per km | 0.36 / 721 | 1.26 / 397 | 0.54 / 413 |
| Same urban cells, before explicit property: M CZK per km | 251 | 227 | 208 |
| Rural at grade, outside 300 m: M CZK per km | 134 | 118 | 128 |
| Same rural cells, before explicit property: M CZK per km | 124 | 110 | 119 |

The 300 m audit tests **all 5 m mask-cell centres**, so it includes open land near villages; it is not the
same quantity as built-up footprint share. Property here means land, forest, footprint buildings and noise
buyouts; walls and crossings remain in construction. The direct routes' urban at-grade construction rates
are 2.06× / 1.75× their rural rates before property (research/09's broad 1.2–2.5× planning range), although
terrain is not controlled. For direct80, extra bridges/walls/crossings cost +386 M versus the bypass, while
road base/earthworks save 213 M on a route 1.95 km shorter; the bypass also has its own expensive valley
crossing and acquisitions. These are plausible reasons for a modest whole-route difference, not evidence
that building through dense fabric is cheap. The centre design's km 4–5 alone costs **3,163 M** with 82
footprint removals and 1 additional noise buyout. No urban multiplier or widened purchase buffer was tuned
to hit a ratio; incomplete yard masks, plot/access severance and acoustic uncertainty remain limitations.

The former 70/100/150 m contour sensitivity is superseded: D is now an output, not a tunable input.
Research/11 records the five-design before/after and the conservative hard-ground EIA fit.
Heavy share, ground and operating speed remain uncertain; a smaller low-floor contour is not evidence
that upper floors or reflective urban streets are safe. No route was reoptimised for the new noise model.

### Performance

`evaluate()` model 10: 24–42 ms in Node across the five saved designs (five-run bench means on a shared host).
Geology uses compact categorical height-cost LUTs and direct grid lookup, no runtime polygon queries.
The entire town step (footprint buildings + crossings + noise) is about 2–3.5 ms, cost arrays 0.2–0.4 ms.
Noise queries use the building spatial hash, deduplicate candidates per station, and cache actual exposed
pairs; no station × building matrix. Source emissions and a bounded 0.5 m range/height propagation table,
plus source-to-wall legs, are precomputed per evaluation; the required path
difference is calculated once per pair, avoiding three attenuation logarithms. The auto-profile / mass-balance search still dominates.

### Known issues of this model

- The auto-profile receives raw motorway/trunk and river/rail clearance requirements, but its cost objective
  omits buildings, local built-up rates, ordinary-road junction costs and noise: it can put an embankment
  through a street grid. Clearance is a large search penalty, not a guarantee of a compliant result; final
  validation rejects unsafe crossings. Structure choice uses each station's urban rates/land, not buildings.
- The balance search can end 0.1–0.2 M m³ off balance when a bridge/embankment decision flips between its
  estimate and the final bill, and the chosen value can jump between neighbouring designs (≈ 1 % of the bill).
- Crossings: local greedy connections are not surveyed OSM routing; parallel links have no terrain, parcel,
  utility, land or building-footprint model, and reuse of a chain is not globally optimised. Approaches use
  standard flat+hilly road norms, not detailed ramp earthwork volumes/vertical curves. Existing bridges are
  ignored. No junction geometry or main-road connection requirement (an overbridge is not an interchange).
  Mandatory eligible 25 M junctions may cost more than a nearby separation; crossing just inside the spacing
  boundary can therefore save money. This discontinuity is not a network-connectivity optimisation.
  Skew is ignored: span is the footprint width square to the new road; a forced bridge is the 30 m minimum.
  For 0 < h < 6, the conservative overbridge spans the whole embankment footprint and raises the crossed road
  by 6 + h; lowering it into an underpass / inserting our own bridge is not an additional cost option.
- The structure choice compares each option at the rates of its own footprint, but the balance search's
  estimate takes the built-up share at the centreline only.
- Buildings: only OSM ways (no multipolygon buildings); the rectangle over-covers L-shaped footprints; no
  severance cost for plots cut off from their access.
- Noise: category emissions and day/night traffic are explicit, but 15% heavy share and the terrain
  extension remain assumptions. Hard ground is a conservative categorical fit to two EIA cases, not
  independent validation; residuals −0.42…+2.57 dB and missing inputs prevent a universal accuracy claim. The 500 Hz barrier source,
  traffic allowance and practical cap remain provisional. Pairwise 2D geometry uses radial façade distance,
  not true oblique rays or finite-line integration; no heavy-vehicle spectrum, reflections, intervening
  buildings, or terrain screening beyond the road's own cut (embankment edges remain unmodelled).
  Cut edges now assess upper-floor diffraction. Receivers use 10 m source stations and
  rectangle façades. Civic buildings with protected uses are not classified. Buyout is the only fallback;
  covered roads, property reuse, parcel geometry and relocation are not optimised. **Fallback-only buyout is
  discontinuous**: moving closer to a cheap house can replace an expensive long wall with cheaper acquisition.
  This is a gameplay incentive, not a summation error; elective buyout versus shared-wall mitigation is not
  solved. SPK CN's urban surcharge
  contains 10 % "protective measures", so explicit walls partly overlap that allowance.
- Motorway / expressway crossings: the auto-profile requests a bridge clearance rather than optimising
  the cut-and-overbridge alternative (which manual profiles can choose); the forced bridge is the 30 m minimum whatever
  the motorway's width and the crossing angle.

## Bridges vs high fills, player overrides (cost model 11)

- Benched fill/cut geometry now contributes real volume and footprint; high earthworks pay a separate
  **provisional** stability/ground-treatment reserve even with free surplus soil. Stream crossings pay
  excess culvert length beyond norm drainage. Bill, structure selector, balance estimate and DP share these
  terms, including the merged ČGS geology categories. Sources, uncertainties and formulas: research/15.
- Flat rural S9.5 bridge break-even at material value λ=200: **26.85 → 16.62 m**; at λ=0:
  **47.03 → 18.62 m**; at λ=−196.4: no old economic crossing → **21.03 m**. Reproduce with
  `npx tsx scripts/bridge-break-even.ts`. This is mostly the provisional engineering reserve, not a newly
  discovered ČSN limit. No unsupported hard height cap or bridge-height price curve was introduced.
- Profile range **B/T/E/C** paints bridge/tunnel/earthwork/automatic; persisted, undoable, partial repaint/
  erase, visible on map/profile, and respected by Auto. Invalid height/cover, short runs and forced crossings
  produce explicit game-rule violations. Ranges retain absolute chainage when the plan changes.
- **Auto grade pins** constrain the finished parabolic line to ±0.5 m at absolute stations, inside DP
  transitions rather than by post-editing VPIs. Alt+click profile → Build tools → Pin height; clear, undo,
  persistence, map/profile marks. Fixed tie-ins and hard gradient/curve checks remain; failures show
  gradient-only bounds or the displayed fallback height, explicitly not a feasibility proof. Pins are
  inactive in Manual or beyond a shortened route. No-pin search/pricing is unchanged (model stays 11).
- **Grade line: Auto | Manual** replaces the ambiguous button. Auto seeks a low-cost legal vertical line;
  Manual freezes it for vertical-point edits. Auto replaces manual vertical edits but keeps structure paint.
- KHK regional/nadregional ÚSES is available and cached (47 polygons, ~0.49 MB) by
  `uv run pipeline/fetch_uses.py`. No automatic ecological bridge mandates: current plan status, local
  corridors, flood hydraulics and suitable passage dimensions need further work.

Five-design comparison, **M CZK**, all VALID and per-cell parts sum correctly:

| Design | Task-start model 6 | Upstream model 10, same plan | Model 11, same plan | Refreshed saved design, model 11 |
|---|---:|---:|---:|---:|
| best bypass | 3,038 | 3,325 | 3,871 | **3,738** |
| demo | 3,949 | 4,144 | 5,077 | **4,099** |
| direct 80 | 3,470 | 3,694 | 4,150 | **4,062** |
| direct 90 | 3,626 | 3,873 | 4,588 | **4,382** |
| town-centre reference | 9,024 | 9,035 | 10,580 | **10,580** |

Original plans are recoverable at `a86f39c:scripts/*-design.json`; model-10 baseline is `15c4f92`.
Four candidates got 100 seeded continuation trials (1510) and 50 more after geology integration (1511).
Town-centre geometry is intentionally held fixed as a reference, not optimised out of the town; all five
JSONs now record model 11. Final lengths/times: best 21.08 km/14.05 min, demo 21.11/14.07,
80 19.10/14.33, 90 19.33/12.89, town 18.94/12.62. These short local searches are not global optima.

On the original best plan, maximum fill **27.1 → 19.5 m**, bridges **550 → 940 m**. Comparable captures:
[owner-valley before](docs/screenshots/valley-owner-before.png) /
[after](docs/screenshots/valley-owner-after.png), plus [km 14–16 before](docs/screenshots/valley-before.png) /
[after](docs/screenshots/valley-after.png). Captures keep the original horizontal plan, not the refreshed
optimised route; owner-view centre is km 17.5 (near old PI 15). `CHAINAGE=17500 node scripts/valley.mjs`
reproduces that framing. The map ribbon still simplifies benches to the crown/daylight surface.

## Horizontal curve rules and long curves (2026-11-14)

Why: every bend used to need room for two full transitions on each leg, so bends closer than ≈ 2 × 90 m could
never be valid — stricter than the norm, and it made multi-point long curves impossible.

Rules now (`src/core/horizontal.ts`, `HORIZONTAL_NORMS` in `src/core/data/norms.ts`, messages in `checks.ts`):

| rule | source |
|---|---|
| transition length L = vn metres (90 / 80 / 70 m) | 2018 speed-based minimum: actually max(vn, superelevation runoff length), Radimský 2019 slide 15. Game does not model runoff; already uses the smallest permitted speed-based length, not a recommendation that can simply be shortened. |
| arc with R ≥ L²/(24 · 0.25 m) needs no transition (1,350 / 1,067 / 817 m) | **game assumption**, using actual model L = vn. VUT "Aplikace ČSN 73 6101", pp. 20–21, gives the 0.25 m shift criterion but specifies **L = 1.5vn** for the omission threshold (and R ≥ 800 m). That older-edition threshold is stricter; the 2018 omission clause is unverified. The 1,160 / 920 / 705 m values concern **superelevation**, not transition omission. |
| same-direction arcs may meet directly (compound curve) if neighbouring radii differ ≤ 2× and the smallest ≥ R min; no ratio limit between two transition-free arcs | older ČSN via VUT, "Směrové oblouky", p. 16: **exceptional** variant without intermediate transitions, used freely as a game concession. The text also permits omission of intermediate transitions by the shift criterion; the game's two-plain-arcs exemption is a sufficient model condition, not the full intermediate-clothoid solver. Not independently verified against 2018. |
| opposite curves: transitions may touch; ends without a transition need a 2·vn straight between them | older ČSN via VUT pp. 16, 33. With transitions, >15 m intermediate straight is preferred, but a reverse transition with **zero straight** is explicitly possible. Recommended R2/R1 ≤ 2 and parameter ratio ≤1.5 are not checked. |
| a transition uses the clothoid-series tangent offset k + p·tan(Δ/2), approximately L/2; each terminal transition consumes L/2 of the circular turning budget | geometry approximation, **not an extra norm minimum straight**. Transitions remain undrawn; compounds only reserve terminal transitions. No blanket 90 m straight is required for same-direction arcs. |
| a large-radius arc facing an opposite curve may carry a transition if long enough (asks ≈45 m instead of 90 m) | game layout choice based on the same transition geometry; not a norm mandate |
| straight between same-direction arcs: any nonnegative residual after transition footprints, including zero; otherwise try a compound | game choice. No same-direction numerical intermediate-straight minimum was verified in the accessible sources; do not transfer the **opposite-direction** 2vn rule or claim a verified 2018 broken-back prohibition. |
| 5 m editor tolerance (`EDIT_TOLERANCE`): arc junctions off the polygon legs; a bend turning against its neighbour where no S-curve fits is dropped from the tangent polygon if within 5 m of the line between its neighbours; arcs moved by joining | game rule, not a norm value |

Compound solve: arc j turns from leg j−1's direction to leg j's, so any radii give a G1 curve; unknowns are the radii
and the start point. The classic solution (arcs meet on the legs, T[k] + T[k+1] = leg) has one degree of freedom,
spent on even radii. Where it breaks R min or the ratio rule (uneven spacing), tangency to the inner legs is relaxed
by least squares only as far as needed, at most 5 m. For a two-bend pair with one manual radius, the remaining
radius interval is now solved directly: intersect R min, ratio (or plain-arc exception), closure, offsets, tangent
bounds and the terminal-transition turning budget; choose the smallest junction offset while preserving the manual radius exactly. This avoids the ladder
skipping a feasible interval when the exact-on-leg radius is negative. Joining is also tried for a manual arc too
short for isolated transitions even if the shared leg has room, provided all ratios hold, it does not worsen either
outer leg, and neither original arc moves more than 5 m (junction offset alone is insufficient).
Next to an opposite curve or A/B the outer tangents are pulled
in (a single arc may first be joined with a close same-direction neighbour). Fallbacks, in order: violation with the
least-bad curve; squeeze into the leg when tangents physically overlap (always G1); dissolve into single arcs.

Known issues: junction offsets and "left out" bends are only explained in the on-map label, not in the HUD; the
general multi-bend solver is still a heuristic ladder, not a proven optimum (a valid curve may exist that it does not find);
the one-manual two-bend free-end case uses an exact feasible interval. Intermediate clothoids, full runoff and shifted
clothoid/circle geometry remain unimplemented, so a failed model join is **not proof of a norm violation**. A compound curve
can change shape abruptly when a drag crosses the join / no-join threshold (a few metres); "max" samples the
radius range (12 % steps + the transition-free boundary), so a narrower feasible stretch can be missed.

**Owner case audit:** matching 68 + 302 m tangents on a 452 m leg with R23 = 1,115 m and R22 automatic
already joined before this fix (R22 ≈ 783.088 m). Setting R22 = 355 m manually reproduces the report naming
**both** manual bends: transition footprints need 460.238 m (8.238 m extra), while the fixed-radii compound
would miss the leg by 19.408 m > the game's 5 m tolerance and has ratio 3.141 > 2 for the exceptional
no-intermediate-transition variant. Do not describe this as a universal norm impossibility. Diagnostics now expose
manual indices/radii, required/available length, extra spacing at unchanged angles, join-failure reason, required
offset and ratio. Structured fix/why messages use these diagnostics; same-direction model-join failures are labelled
**game**, not norm or unproven engine impossibility. The worker resolves a tested valid maximum with the **same**
`checks.ts` search as the radius editor's Max button, cached per bend and bounded to four searches per evaluation
(the plain-violations integration). Source audit and new regressions: research/15-horizontal-pairs.md.
