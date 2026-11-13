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
- **Traffic Y:** selects the minimum road category. The thresholds are placeholders, not norm values.
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
  places, drape texture (hillshade × hypsometric tint × overlays), official D11 line. ≈ 14 MB.
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
  violation; the auto-profile respects it); streams are assumed culverted (in the norm). Bridges are only
  considered ≥ 4 m above ground and bored tunnels with ≥ 14 m of cover; minimum bridge 30 m, tunnel 150 m;
  earthwork gaps shorter than 60 m (bridges) / 150 m (tunnels) are merged. Road base price is charged on at-grade
  length only. Slopes that do not reach the ground within 150 m and footprints leaving the terrain data are
  violations.

### Travel-time target X and traffic Y

- Y = 9,000 vehicles/day → minimum S 9.5 by the placeholder thresholds (S 7.5 < 5,000 ≤ S 9.5 < 12,000 ≤ S 11.5).
- **X = 14.5 min.** At 90 km/h this allows 21.75 km = 1.17 × the straight line (the official line's 21 km fits);
  at 80 km/h 19.33 km = 1.04 × the straight line (only a nearly straight route); 70 km/h would need ≤ 16.9 km
  < 18.59 km, i.e. impossible.
- Calibration runs with the town cost model of 2026-11-14 (`scripts/optimize.ts`, crude local search, 800–1200
  iterations, PIs on whole metres; numbers in the table of the next section): 90 km/h around the town in the
  official corridor → **3.09 bn CZK**, 21.1 km, 14.06 min; 80 km/h on the direct line, threaded through the east
  of Trutnov → 3.39 bn, 18.85 km, 14.14 min; 90 km/h on the direct line → 3.63 bn, 18.86 km. So three distinct
  strategies lie within 10–18 % of each other, the detour is the cheapest, and the limit still binds (the best
  bypass uses 14.06 of 14.5 min; a wider detour is not allowed). X = 14.5 min is kept. The slower, smaller-radius
  road is only reachable on a very direct line; its tighter curves and shorter noise distance (82 m) make it
  cheaper than 90 km/h on the same line, but not cheaper than going around. The local search is weak; re-check
  once players find better designs.

### Reference design numbers (`scripts/demo-design.json`, S 9.5, 90 km/h, auto profile)

First cost model (2026-11-13): 20.81 km, 13.87 min, 3.19 bn CZK = 153 M CZK/km. With the town cost model
(next section) the same design costs **3.84 bn CZK = 185 M CZK/km**; details there.

### PROVISIONAL / placeholder values (all in `src/core/data/`)

- Max gradient 6 % (older ČSN edition, S 9.5/S 11.5 hilly); vertical-curve minima crest 6000/3000/2500 m and
  sag 3400/2100/1500 m for 90/80/70 km/h (older edition; 90 uses the 100 km/h column).
- Side slopes fill 1:2, cut 1:1.75 (pending geology).
- Topsoil depth 0.3 m; topsoil allowance in the norm assumed over crown + 12 m.
- Land 8 × 50 CZK/m² outside built-up areas; forest surcharge 250 CZK/m². (Buildings, building land, crossings,
  noise, excavation classes: see the list in the next section.)
- Traffic → category thresholds.
- Decision prices for the auto-profile and structure choice: a m³ of fill material is worth a value between
  −150 and 600 CZK that the auto-profile searches for (start 200); see "Mass balance" in the next section.
- Purchased fill is charged 636 CZK/m³ on top of 100 CZK/m³ placing (OTSKP 17180 may already include placing).
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
- Auto-profile cost uses a flat-ground section estimate at rural rates and knows nothing about buildings, land
  use, road crossings or noise; the bill uses the real cross-sections.
- Cross-sections ignore crossfall/superelevation and curvature correction; transition curves are not drawn.
- Drape texture is 5 m/px, so close-ups look blocky; the render mesh is 20 m (ribbon kept visible by a
  footprint mask that cuts the terrain).

### Next steps

1. Player-marked bridges/tunnels and a max embankment/cut height rule; let the auto-profile see crossings,
   buildings and urban rates (per-station cost terms).
2. Better mass haul (multiple balance lines, tips and borrow pits by distance).
3. Superelevation and crossfall in sections; transition curves drawn; sight-distance checks.
4. Land cost by BPEJ / cadastre, protection areas, real geology ground classes and hazards (replacing the
   depth rule), a real noise calculation, junction layout instead of lump sums.
5. Official-line comparison (digitise its profile), motorway category row, scenarios #2 and #3.
6. Sharper drape near the route (2 m texture / orthophoto), LOD terrain mesh.

## Town cost model and cost breakdown (2026-11-14)

Owner feedback on the first prototype: the start was misleading (an invalid straight line at 3.28 bn looked
cheap), a stretch's cost could not be explained, and the town was far too cheap (a straight line through
Trutnov demolished 81 buildings and still cost 5.5 bn). What changed:

### Start and validity

- The game starts from the straight line with the **auto profile** (valid; 6.86 bn with the model below).
- The total of a design that is NOT VALID is struck through, greyed and labelled "invalid — fix the violations;
  this cost does not count".

### Cost breakdown of a stretch

- The bill is built **per station cell** (cell i = the 10 m nearest to station i, half that at the ends), one
  array per component (`Result.parts`: road base, excavation, fill placing, haul, surplus haul, unsuitable haul,
  bought fill, topsoil, bridges, tunnels, crossings, noise walls, other-objects surcharge, land, forest,
  buildings). The totals are the sums of these arrays (`core/cost.ts` `costParts` → `sumParts`), tested.
- Global mass-balance items are spread over the cells that cause them: bought fill over the fill volumes,
  surplus and unsuitable haul over the cut volumes, haul along the route over all volume moved; the surcharge
  follows each cell's construction cost (at that cell's rural/urban rate). A building is billed to the station
  nearest to it, a crossing to its station.
- UI: an alignment band (tangents / curves with radius) and a stacked **cost-per-metre strip** under the
  longitudinal profile on the same horizontal scale (square-root height scale so a demolished block does not
  flatten everything else; never averaged over less than 50 m). **Hover** the profile → tooltip with the key
  facts (cut/fill height, structure, land use, crossing, noise wall, buildings) and the CZK/m split. **Drag** in
  the strip (or Shift+drag anywhere), or **click** a tangent/curve in the band → the HUD breakdown switches to
  that range (length, cost, cost per km, share of the route, quantities) with a "Whole route" reset (also Esc);
  the range is highlighted on the map. Markers in the profile: crossed roads (at the crossed road's level),
  noise walls, demolished buildings.
- State for the renderer: `state.ts` `RangeSelection` (selected station range) and `Result.walls` /
  `Result.crossings` / `Result.demolished`; drawn by `src/render/extras.ts`, which only uses `View.world`,
  `View.local()` and `View.requestRender()`.

### Town cost model (all numbers in `src/core/data/urban.ts` and `prices.ts`)

- **Buildings by size**: the pipeline exports per building the footprint area, `building:levels`, a kind (house,
  apartments, civic, industrial/commercial, minor) and an oriented bounding rectangle. Cost = floor area
  (footprint × levels) × market price × 1.5 (Act 416/2009 §3b) + demolition. Hit test: the rectangle against the
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
  owner's "street buried next to a bridged railway" case); ≤ −6 m → an overbridge carrying the crossed road,
  span = cut width there × the SPK CN bridge row of the crossed road's width (+ surcharge); in between → a lump
  sum: junction with a through road, side-road reconnection for streets and local roads, access reconnection
  for service roads, track diversion. Service roads and tracks never force a bridge. Crossings within 30 m of
  each other (dual carriageways, slip roads), or of the same OSM way within 150 m, are one crossing; those
  within 150 m of A/B belong to the tie-in. A crossing under one of the new road's bridges or above its tunnel
  is free. Shown as markers in the profile and counted in the HUD.
- **Excavation class by depth** (stand-in for geology): each cross-section's cut area is split by depth below
  the original ground: class I to 3 m, class II to 8 m, class III deeper (OTSKP 12273 / 12283 / 12293: 183 /
  391 / 653 CZK/m³). The norm allowance stays valued at the 75/20/5 mix (248 CZK/m³). The bridge/tunnel-vs-
  earthwork choice and the auto-profile use the same class prices.
- **Noise walls**: screening rule — a dwelling (house / apartments; not sheds, garages, industrial or civic
  buildings; not demolished ones) within D of the centreline exposes the stretch of road within D of it; exposed
  stretches get a 3 m wall on that side, extended by 50 m both ways, except in tunnels and where the cut edge on
  that side is ≥ 4 m above the road. D = 100 m × (Q / 9,000)^(2/3) × (v / 90)^(5/3) (+3 dB per doubling of
  traffic, ≈ 25·log v with speed, −4.5 dB per doubling of distance): 100 m at 90 km/h, 82 m at 80, 66 m at 70.
  Czech limits for main roads (60 dB day / 50 dB night) are context only; this is not a noise calculation.
  Wall stretches (station range + side) are in `Result.walls` and drawn on the map and in the profile.
- **Mass balance** (found while re-running the comparisons): with depth-dependent excavation the old fixed
  decision prices left the reference design buying 1.15 M m³ of fill (+0.9 bn). The bill is very sensitive to
  how the auto-profile values cut against fill (± 5 % for ± 15 % of that value), so the auto-profile now
  **searches** for it: decisions value a m³ of fill material at λ (fill costs placing + λ, cut earns 0.85 λ);
  one coarse DP pass fixes the corridor, then the fine pass is repeated for up to four λ (bracketing +
  interpolation) until the grade line's balance — measured with real cross-sections on every second station and
  the real structure choice — is within 1.5 m³ per metre of route. Typical result: λ ≈ 165–215 CZK/m³, bought
  fill or surplus below 0.2 M m³.

### PROVISIONAL values introduced here

| Value | Number | Note |
|---|---|---|
| Market price, houses / apartments / civic | 45,000 CZK/m² floor area | × 1.5 statutory multiple |
| Market price, industrial / commercial / barns | 20,000 CZK/m² | × 1.5 |
| Market price, garages / sheds / anything < 30 m² | 15,000 CZK/m² | × 1.5; a 20 m² garage ≈ 0.5 M all-in |
| Demolition | 3,000 CZK/m² floor area | ≈ 1,000 CZK/m³ of built volume |
| Default storeys when untagged | house 2, apartments 4, civic 2, industrial 1, minor 1 | tagged levels capped at 12 / 12 / 6 / 3 / 2 |
| Classification of `building=yes` (46 % of buildings) | < 50 m² minor; by land-use zone, address; ≥ 300 m² outside any zone = industrial | `pipeline/build_d11.py` `building_info` |
| Working strip for demolitions | 3 m beyond the footprint / deck edge | |
| Building land | 1,500 CZK/m² × 1.5 | other land stays 8 × 50 |
| Grade separation thresholds | ≥ 6 m above (4.8 m clearance + deck) / ≤ −6 m below | |
| Junction with a through road (class I–III) | 12 M CZK | motorway / expressway: SPK CN interchange 76.7 M (not provisional) |
| Side-road reconnection (street, local road) | 4 M CZK | |
| Access reconnection (service road) / track diversion | 1 M / 0.5 M CZK | never grade-separated |
| Crossed-road widths for overbridges | 27.5 / 11.5 / 9.5 / 7.5 / 6.5 / 4 m by class | priced by the SPK CN bridge row of that width |
| Excavation class depth bands | I to 3 m, II to 8 m, III below | stand-in for geology |
| Noise distance and scaling | 100 m at 9,000 veh/day and 90 km/h; exponents 2/3 and 5/3 | |
| Noise wall | 3 m high, 8,000 CZK/m² all-in; 50 m margins; cut ≥ 4 m screens | OTSKP 34712 panels alone 3,265 CZK/m² |
| Material value for decisions | search in −150 … 600 CZK/m³ from 200; tolerance 1.5 m³/m | |

### Numbers with the new model (S 9.5, auto profile, `npx tsx scripts/bench.ts <design.json>`)

Before → after for the two designs of the first prototype: straight line 5.50 → **6.86 bn**, reference bypass
3.19 → **3.84 bn**.

| M CZK | Straight line (start) | Through the town centre | Reference bypass | Optimiser, bypass 90 km/h | Optimiser, direct 80 km/h |
|---|---:|---:|---:|---:|---:|
| design file (`scripts/`) | — | `town-centre-design.json` | `demo-design.json` | `best-design.json` | `direct-80-design.json` |
| length km / min | 18.59 / 12.39 | 18.94 / 12.62 | 20.81 / 13.87 | 21.09 / 14.06 | 18.85 / 14.14 |
| **total** | **6,861** | **8,285** | **3,841** | **3,090** | **3,393** |
| per km | 369 | 437 | 185 | 147 | 180 |
| road base | 697 | 722 | 864 | 866 | 753 |
| earthworks | 1,213 | 1,587 | 1,055 | 757 | 570 |
| bridges | 1,426 | 1,160 | 278 | 290 | 690 |
| road crossings | 62 | 76 | 112 | 65 | 72 |
| noise walls | 185 | 174 | 91 | 55 | 124 |
| other objects | 1,168 | 1,204 | 699 | 602 | 689 |
| land / forest | 408 / 58 | 385 / 76 | 321 / 60 | 287 / 40 | 289 / 43 |
| buildings (count) | 1,644 (77) | 2,900 (116) | 362 (18) | 129 (20) | 162 (32) |
| in built-up area km | 3.03 | 2.25 | 1.21 | 0.49 | 1.78 |
| bridges | 17 / 2,459 m | 11 / 2,000 m | 6 / 480 m | 7 / 500 m | 10 / 1,190 m |
| noise walls m | 7,688 | 7,269 | 3,778 | 2,309 | 5,169 |
| crossings (paid) | 40 (19) | 40 (24) | 31 (28) | 29 (26) | 32 (23) |
| cut / fill k m³ | 2,087 / 1,905 | 2,727 / 2,440 | 2,058 / 1,781 | 1,644 / 1,396 | 1,293 / 1,099 |
| excavation class I / II / III % | 33 / 33 / 33 | 31 / 33 / 37 | 39 / 34 / 26 | 47 / 36 / 16 | 51 / 37 / 12 |

Reading:
- The line through the actual centre costs **2.2× the reference bypass and 2.7× the best bypass found**. Its
  kilometre through the centre (km 4–5) costs 2.74 bn (82 buildings, 2.13 bn of them; 520 m of bridges over
  streets), against 70–250 M for a rural kilometre — about 20× per km. The whole-route ratio is not higher
  because only 2.3 of its 19 km are built-up; the other 16.7 km cost what any route costs.
- The straight start line does not hit the centre but the industrial zone and Poříčí east of it: its worst
  kilometre (km 4.7–5.7) costs 1.5 bn, 0.96 bn of it 24 buildings — 13 industrial halls for 0.73 bn (the largest
  208 M) and 8 houses for 0.23 bn.
- A direct line can be threaded through the east of Trutnov along garage rows and yards for 3.4–3.6 bn (20–50
  buildings but only 130–160 M of them): the model makes a careful urban route possible but ~10–18 % dearer
  than going around. Such routes hinge on single buildings — moving a PI by a metre can add or remove a
  200 M hall — which is the intended reason to look at the cost strip.
- Sensible rural routes stay plausible: 147–185 M CZK/km (expected very roughly 60–200 for S 9.5).
- Viaduct variant of the reference design (manual profile across the Úpa valley at Poříčí, 880 m): 4.49 bn.

### Performance

`evaluate()` on the reference design: ≈ 32 ms in Node (auto-profile ≈ 24 ms incl. the balance search, sections
4.5 ms, town model 1.5 ms, cost arrays 0.3 ms); 28–38 ms on the other designs above. The coarse-to-fine DP made
room for the balance search (the first prototype needed ≈ 36 ms, 28 ms of it one DP pass).

### Known issues of this model

- The auto-profile does not see buildings, built-up rates, road crossings or noise: it will happily put an
  embankment through a street grid. The structure choice (bridge vs embankment) does use each station's urban
  rates and land price, but not the buildings.
- The balance search can end 0.1–0.2 M m³ off balance when a bridge/embankment decision flips between its
  estimate and the final bill, and the chosen value can jump between neighbouring designs (≈ 1 % of the bill).
- Crossings: an existing road running along the route and weaving across it pays a lump sum at every crossing
  further than 150 m apart; roads on existing bridges are ignored; no junction geometry, no connection
  requirement (a grade-separated crossing is not connected).
- Buildings: only OSM ways (no multipolygon buildings); the rectangle over-covers L-shaped footprints; no
  severance cost for plots cut off from their access.
- Noise: distance is measured to the building's centroid; no screening by terrain other than the road's own
  cut, none by other buildings; a bridge gets the same wall as an embankment. SPK CN's urban surcharge already
  contains 10 % "protective measures", so walls in built-up areas are partly counted twice.
- Motorway / expressway crossings at grade are priced as an interchange instead of being forbidden.
