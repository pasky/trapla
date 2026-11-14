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
- **Traffic Y:** selects the minimum road category. The thresholds are placeholders, not norm values
  (UNVERIFIED: ČSN 73 6101 selects the category from design traffic, not a daily-volume cutoff; research/08).
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
  violation; the auto-profile respects it); streams are assumed culverted (in the norm). Since cost model 3
  motorways / expressways are treated the same way (see "Crossing existing roads"). Bridges are only
  considered ≥ 4 m above ground and bored tunnels with ≥ 14 m of cover; minimum bridge 30 m, tunnel 150 m;
  earthwork gaps shorter than 60 m (bridges) / 150 m (tunnels) are merged. Road base price is charged on at-grade
  length only. Slopes that do not reach the ground within 150 m and footprints leaving the terrain data are
  violations.

### Travel-time target X and traffic Y

- Y = 9,000 vehicles/day → minimum S 9.5 by the placeholder thresholds (S 7.5 < 5,000 ≤ S 9.5 < 12,000 ≤ S 11.5;
  no source supports these cutoffs — research/08 keeps S 9.5 as a scenario assumption).
- **X = 14.5 min.** At 90 km/h this allows 21.75 km = 1.17 × the straight line (the official line's 21 km fits);
  at 80 km/h 19.33 km = 1.04 × the straight line (only a nearly straight route); 70 km/h would need ≤ 16.9 km
  < 18.59 km, i.e. impossible.
- Cost model 6 repricing of saved local-search designs (2,500 seeded + 3,500 fresh trials per strategy under
  model 4, whole-metre PIs): official-corridor bypass at 90 km/h → **3.038 bn CZK**, 21.03 km, 14.02 min;
  direct eastern fringe at 80 → **3.470 bn**, 19.08 km, 14.31 min; direct fringe at 90 → **3.626 bn**, 19.59 km, 13.06 min. The slower
  direct route uses 98.7% of the time allowance; 70 remains impossible. Keep X = 14.5 min: it allows bypass vs
  short/fringe strategies without making the slower road dominant. The 14% / 19% whole-route premiums are
  explained by length/topography and mostly-open fringe routing, not a cheap dense-city corridor; the actual
  centre route is 9.024 bn. Spatial and per-km checks, uncertainty and reproducible seeds are below. These
  are local-search results, not proven minima; re-check as players find better designs.

### Reference design numbers (`scripts/demo-design.json`, S 9.5, 90 km/h, auto profile)

Cost model 6: 20.81 km, 13.87 min, **3.949 bn CZK = 190 M CZK/km**; includes three noise buyouts
(79 M, including plot allowances). This reference is not the cheapest bypass; the saved-design comparison is below.

### PROVISIONAL / placeholder values (all in `src/core/data/`)

- Max gradient 6 % (older ČSN edition, S 9.5/S 11.5 hilly); vertical-curve minima crest 6000/3000/2500 m and
  sag 3400/2100/1500 m for 90/80/70 km/h (older edition; 90 uses the 100 km/h column).
- Side slopes fill 1:2, cut 1:1.75 (pending geology).
- Topsoil depth 0.3 m; topsoil allowance in the norm assumed over crown + 12 m.
- Land outside built-up areas 8 × 40 CZK/m² (research-informed estimate: research/07; Act 416/2009 §3b
  sources the 8× multiplier, farmland trades at 30–55 CZK/m², low confidence locally). Forest at 320 incl.
  timber, plus 50 CZK/m² (removal levy ≈ 20 + clearing ≈ 30), are PROVISIONAL estimates, not sourced local rates.
  Buildings, building land, crossings, noise and excavation classes: see the next section.
- Traffic → category thresholds (UNVERIFIED, research/08).
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

1. Player-marked bridges/tunnels and a max embankment/cut height rule; let the auto-profile price ordinary-road
   crossings, buildings and urban rates (per-station cost terms), beyond its existing clearance requirements.
2. Better mass haul (multiple balance lines, tips and borrow pits by distance).
3. Superelevation and crossfall in sections; transition curves drawn; sight-distance checks.
4. Land cost by BPEJ / cadastre, protection areas, real geology ground classes and hazards (replacing the
   depth rule), a real noise calculation, junction layout instead of lump sums.
5. Official-line comparison (digitise its profile), motorway category row, scenarios #2 and #3.
6. LOD terrain mesh (5 m near the camera); pitched roofs; demolished buildings shown on the 3D boxes.

## Town cost model and cost breakdown (2026-11-14)

Cost model 6: research-informed prices, raw-crossing clearance, geometric wall/cut diffraction, slant-distance
noise excess and building-only valuations with separate plot allowances for noise buyouts.
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
  owner's "street buried next to a bridged railway" case); ≤ −6 m → an overbridge carrying the crossed road,
  span = cut width there × the SPK CN bridge row of the crossed road's width (+ surcharge); in between → a lump
  sum: junction with a through road, side-road reconnection for streets and local roads, access reconnection
  for service roads, track diversion. Service roads and tracks never force a bridge. Motorways and expressways
  (OSM motorway / trunk; cost model 3) are never crossed at grade: like a railway, the grade must clear them by
  7.5 m (forced bridge; the auto-profile requests this) or pass ≥ 6 m below them (overbridge); anything in
  between is a violation. Hard constraints and auto-profile clearance use **every raw crossing**, sorted
  with river/rail samples before profile sampling. Only an intersection within **1 m along the route of
  A or B** is exempt, a coordinate-tolerance allowance for joining the road the endpoint itself lies on
  (B sits on D11). No 150 m safety exemption, and no exemption for the other carriageway 20 m away.
  The saved designs have no interior motorway/trunk intersections. **Billing only** merges crossings
  within 30 m, or the same OSM way within 150 m, and assigns objects within 150 m of A/B to the tie-in.
  A crossing under a new bridge or above its tunnel is free. Billing representatives are shown in the profile/HUD.
- **Excavation class by depth** (gameplay heuristic standing in for geology; OTSKP classes are defined by
  excavability, not depth, and route-specific class shares are unknown — research/09 §3): each cross-section's cut area is split by depth below
  the original ground: class I to 3 m, class II to 8 m, class III deeper (OTSKP 12273 / 12283 / 12293: 183 /
  391 / 653 CZK/m³). The norm allowance stays valued at the 75/20/5 mix (248 CZK/m³). The bridge/tunnel-vs-
  earthwork choice and the auto-profile use the same class prices.
- **Noise feasibility — PROVISIONAL, not an acoustic study**: the chosen new-main-road limits are 60 dB day /
  50 dB night (NV 272/2011). Their controlling unmitigated contour is represented by
  D = 100 m × (Q / 9,000)^(2/3) × (v / 90)^(5/3): 100 m at 90 km/h, 82 m at 80, 66 m at 70.
  At each nearby station, horizontal receiver position is axis-to-**nearest oriented-rectangle façade**
  distance minus 2 m (clamped to 1 m). Excess E = 15·log₁₀(D/d) dB uses the **slant source–receiver distance**
  d (also clamped to 1 m), not horizontal distance; tall viaducts do not force a horizontal buyout radius.
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
  A positive cut edge uses the **same diffraction formula**, top = daylight elevation relative to grade,
  offset = daylight distance. Take the better of earth edge and wall, never add their attenuation. Upper
  floors seeing over a 4 m cut remain exposed. Only tunnels fully shield; no terrain shield under bridges
  or at embankment toes. Only houses/apartments are receivers.
- **Noise buyouts**: if neither the cut edge nor a 5 m wall can protect a dwelling at any station, acquire
  the whole building at 1.5× its building-only estimate **plus demolition**, as for footprint removals,
  **plus a PROVISIONAL plot**: max(3 × footprint, 400 m²) × building-land price (1,500) × 1.5 CZK.
  This is an additional-land allowance, not a cadastral parcel model; plot overlap/severance is unresolved.
  Footprint buildings do not pay this allowance: corridor land is already billed separately.
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
| Side-road reconnection (street, local road) | 4 M CZK | UNVERIFIED allowance (research/08: no published award) |
| Access reconnection (service road) / track diversion | 1 M / 0.5 M CZK | never grade-separated; UNVERIFIED allowances |
| Crossed-road widths for overbridges | 27.5 / 11.5 / 9.5 / 7.5 / 6.5 / 4 m by class | priced by the SPK CN bridge row of that width |
| Excavation class depth bands | I to 3 m, II to 8 m, III below | gameplay heuristic, not geology: OTSKP classes are by excavability (research/09 §3) |
| Noise distance and scaling | 100 m at 9,000 veh/day and 90 km/h; exponents 2/3 and 5/3 | UNVERIFIED screening heuristic (research/09 §2) |
| Noise wall | 3 / 4 / 5 m, 10,000 CZK/m²; 50 m margins | PROVISIONAL calibrated recommendation (8–14k); only project datapoint assumes 3 m height (research/09 §1). Cut edges use diffraction, not a depth exemption |
| Excess and attenuation | E = 15·log₁₀(D/d), d = slant distance; IL = clamp(10·log₁₀(3 + 40δ/0.68) − 5, 0, 13) | Shadow-zone Maekawa approximation; best of cut edge / wall, not sum; correction/cap PROVISIONAL (research/09 §5) |
| Source / wall position | source +0.5 m high, 1.75 m off axis; wall at crown/2 + 1.5 m | PROVISIONAL equivalent 2D section at road grade, not slope toe |
| Upper-floor receiver | 1.5 + 3 × (levels − 1) m above building ground | PROVISIONAL; geometric sightline and path difference, not a height-only penalty |
| Noise-infeasible dwelling | 1.5× building-only value + demolition + plot max(3 × footprint, 400 m²) at 1,500 × 1.5 | acquisition and additional-plot rule PROVISIONAL; no window-only outdoor compliance |
| Material value for decisions | search in −196 … 536 CZK/m³ from 200; tolerance 1.5 m³/m | bounds = haul to a tip / bought fill less placing |

### Numbers with the new model (S 9.5, auto profile, `npx tsx scripts/bench.ts <design.json>`)

Cost model **6**, with raw-crossing constraints, cut-edge diffraction, slant excess and consistent property
valuation. All five saved alignments stay fixed from model 4 (not reoptimised); all remain valid, no tunnel.
The straight auto-profile start is 6,974 M CZK (18.59 km). Per-cell parts sum to every total.

| M CZK | Reference bypass | Optimised bypass 90 | Direct fringe 80 | Direct fringe 90 | Town centre 90 |
|---|---:|---:|---:|---:|---:|
| design file (`scripts/`) | `demo-design.json` | `best-design.json` | `direct-80-design.json` | `direct-90-design.json` | `town-centre-design.json` |
| length km / min | 20.81 / 13.87 | 21.03 / 14.02 | 19.08 / 14.31 | 19.59 / 13.06 | 18.94 / 12.62 |
| **total** | **3,949** | **3,038** | **3,470** | **3,626** | **9,024** |
| per km | 190 | 144 | 182 | 185 | 477 |
| road base | 864 | 862 | 769 | 782 | 722 |
| earthworks | 1,043 | 700 | 580 | 816 | 1,575 |
| bridges | 278 | 319 | 609 | 614 | 1,160 |
| road crossings | 190 | 91 | 124 | 92 | 76 |
| noise walls | 121 | 73 | 204 | 136 | 298 |
| other objects | 695 | 591 | 663 | 731 | 1,197 |
| land / forest | 270 / 12 | 229 / 8 | 247 / 9 | 235 / 13 | 324 / 15 |
| footprint buildings (count) | 397 (18) | 166 (11) | 253 (35) | 206 (27) | 3,358 (116) |
| noise buyouts incl. plots (count) | 79 (3) | 0 (0) | 13 (1) | 0 (0) | 298 (10) |
| in built-up area km | 1.21 | 0.44 | 1.69 | 1.00 | 2.17 |
| bridges: count / m | 6 / 480 | 7 / 550 | 9 / 1,050 | 9 / 1,060 | 11 / 2,000 |
| noise walls m / m² | 3,409 / 12,115 | 2,439 / 7,318 | 5,288 / 20,372 | 4,218 / 13,574 | 7,939 / 29,835 |
| crossings (paid) | 31 (28) | 28 (24) | 31 (24) | 35 (23) | 40 (24) |
| cut / fill k m³ | 2,079 / 1,763 | 1,542 / 1,310 | 1,302 / 1,106 | 1,705 / 1,452 | 2,727 / 2,440 |

Search provenance: the saved bypass/direct80 are seeded-search outputs, direct90 the fresh-search output
(the cheapest valid result of each strategy under model 4). Bypass searches start in the official corridor
but are not constrained to it. No global-optimality claim. Reproduce those searches with model-4 code
(commit `cecb3e9`); original inputs remain in commit `a6a93b6`. Evaluate the saved outputs with current code
for the model-6 numbers above:

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

**Calibration and spatial check:** direct80 / bypass = **1.142×**, direct90 / bypass = **1.193×**, actual
centre / bypass = **2.970×**. The modest fringe premium warranted inspecting the mask, roads and oriented building
rectangles (`scripts/town-audit.ts design.json map.svg`), not adding a multiplier to force a preferred ratio.
The 80 km/h line skirts eastern Kryblice / garage rows at km 3–4, crosses the narrow developed valley at the
western edge of Poříčí's industrial strip around km 5, and skirts / crosses Voletiny at km 6–7. It does not
cut through central Trutnov's blocks. Some garage yards fall outside the OSM built-up mask, but the long
unmasked gaps here are genuinely open slopes; treating every metre within 300 m as urban construction would
substantially overstate the developed corridor.

| Audit metric | Bypass 90 | Direct fringe 80 | Direct fringe 90 |
|---|---:|---:|---:|
| Within 300 m of any built-up cell: km / M CZK per km | 7.43 / 184 | 13.38 / 211 | 12.27 / 219 |
| Outside 300 m: M CZK per km | 123 | 115 | 129 |
| At grade, ≥ 50% built-up footprint: km / M CZK per km | 0.36 / 646 | 1.26 / 364 | 0.54 / 406 |
| Same urban cells, before explicit property: M CZK per km | 176 | 183 | 201 |
| Rural at grade, outside 300 m: M CZK per km | 120 | 109 | 125 |
| Same rural cells, before explicit property: M CZK per km | 110 | 101 | 115 |

The 300 m audit tests **all 5 m mask-cell centres**, so it includes open land near villages; it is not the
same quantity as built-up footprint share. Property here means land, forest, footprint buildings and noise
buyouts; walls and crossings remain in construction. The direct routes' urban at-grade construction rates
are 1.81× / 1.75× their rural rates before property (research/09's broad 1.2–2.5× planning range), although
terrain is not controlled. For direct80, extra bridges/walls/crossings cost +454 M versus the bypass, while
road base/earthworks save 213 M on a route 1.95 km shorter; the bypass also has its own expensive valley
crossing and acquisitions. These are plausible reasons for a modest whole-route difference, not evidence
that building through dense fabric is cheap. The centre design's km 4–5 alone costs **3,269 M** with 82
footprint removals and 6 additional noise buyouts. No urban multiplier or widened purchase buffer was tuned
to hit a ratio; incomplete yard masks, plot/access severance and acoustic uncertainty remain limitations.

Sensitivity, **saved geometries held fixed, not reoptimised**: changing the provisional reference contour
from 100 m to research/09's 70 / 150 m bounds gives totals (M CZK):

| Reference D | Bypass | Direct80 | Direct90 | Centre |
|---|---:|---:|---:|---:|
| 70 m | 3,011 | 3,403 | 3,579 | 8,902 |
| 100 m | 3,038 | 3,470 | 3,626 | 9,024 |
| 150 m | 3,081 | 3,669 | 3,761 | 9,705 |

The ordering of these geometries stays the same across this contour range; centre
buyouts vary from 7 to 27. These figures demonstrate sensitivity, not validation of the acoustic model.

### Performance

`evaluate()` model 6: 29–39 ms in Node across the five saved designs (five-run bench means).
The entire town step (footprint buildings + crossings + noise) is about 2–3 ms, cost arrays 0.2–0.4 ms.
Noise queries use the building spatial hash, deduplicate candidates per station, and cache actual exposed
pairs; no station × building matrix. Source-to-wall legs are precomputed per evaluation; the required path
difference is calculated once per pair, avoiding three attenuation logarithms. The auto-profile / mass-balance search still dominates.

### Known issues of this model

- The auto-profile receives raw motorway/trunk and river/rail clearance requirements, but its cost objective
  omits buildings, local built-up rates, ordinary-road junction costs and noise: it can put an embankment
  through a street grid. Clearance is a large search penalty, not a guarantee of a compliant result; final
  validation rejects unsafe crossings. Structure choice uses each station's urban rates/land, not buildings.
- The balance search can end 0.1–0.2 M m³ off balance when a bridge/embankment decision flips between its
  estimate and the final bill, and the chosen value can jump between neighbouring designs (≈ 1 % of the bill).
- Crossings: an existing road running along the route and weaving across it pays a lump sum at every crossing
  further than 150 m apart; roads on existing bridges are ignored; no junction geometry, no connection
  requirement (a grade-separated crossing is not connected). Skew is ignored: the overbridge span is the cut
  width square to the new road, and a forced bridge is the 30 m minimum whatever the crossing angle.
- The structure choice compares each option at the rates of its own footprint, but the balance search's
  estimate takes the built-up share at the centreline only.
- Buildings: only OSM ways (no multipolygon buildings); the rectangle over-covers L-shaped footprints; no
  severance cost for plots cut off from their access.
- Noise: D, the 500 Hz equivalent source, traffic correction and practical cap are provisional. Pairwise 2D
  geometry uses radial façade distance as an equivalent cross-section, not true oblique rays; no line-source
  integration, separate day/night traffic or heavy-vehicle spectrum, reflections, intervening buildings, or
  terrain screening beyond the road's own cut (embankment-edge screening remains unmodelled).
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

## Horizontal curve rules and long curves (2026-11-14)

Why: every bend used to need room for two full transitions on each leg, so bends closer than ≈ 2 × 90 m could
never be valid — stricter than the norm, and it made multi-point long curves impossible.

Rules now (`src/core/horizontal.ts`, `HORIZONTAL_NORMS` in `src/core/data/norms.ts`, messages in `checks.ts`):

| rule | source |
|---|---|
| arc with R ≥ L²/(24 · 0.25 m) needs no transition (1,350 / 1,067 / 817 m) | ČSN 73 6101 (VUT "Aplikace ČSN 73 6101") |
| same-direction arcs may meet directly (compound curve) if neighbouring radii differ ≤ 2× and the smallest ≥ R min; no ratio limit between two transition-free arcs | ČSN, the "exceptional" variant without intermediate transitions — used freely here; the 0.25 m rule also covers intermediate transitions |
| opposite curves: transitions may touch; ends without a transition need a 2·vn straight between them | ČSN (the recommended R2/R1 ≤ 2 for reverse curves is not checked) |
| a transition takes ≈ L/2 of the tangent and L/2 of the curve; a compound curve needs them only at its two ends | game simplification (transitions are still not drawn) |
| a large-radius arc facing an opposite curve may carry a transition if long enough (asks 45 m instead of 90 m) | game simplification |
| straight between same-direction arcs: allowed whenever the required transitions fit, no minimum length; otherwise the arcs are joined | game simplification (the norm only discourages short straights) |
| 5 m editor tolerance (`EDIT_TOLERANCE`): arc junctions off the polygon legs; a bend turning against its neighbour where no S-curve fits is dropped from the tangent polygon if within 5 m of the line between its neighbours; arcs moved by joining | game rule, not a norm value |

Compound solve: arc j turns from leg j−1's direction to leg j's, so any radii give a G1 curve; unknowns are the radii
and the start point. The classic solution (arcs meet on the legs, T[k] + T[k+1] = leg) has one degree of freedom,
spent on even radii. Where it breaks R min or the ratio rule (uneven spacing), tangency to the inner legs is relaxed
by least squares only as far as needed, at most 5 m. Next to an opposite curve or A/B the outer tangents are pulled
in (a single arc may first be joined with a close same-direction neighbour). Fallbacks, in order: violation with the
least-bad curve; squeeze into the leg when tangents physically overlap (always G1); dissolve into single arcs.

Known issues: junction offsets and "left out" bends are only explained in the on-map label, not in the HUD; the
solver is a heuristic ladder, not a proven optimum (a valid curve may exist that it does not find); a compound curve
can change shape abruptly when a drag crosses the join / no-join threshold (a few metres); "max" samples the
radius range (12 % steps + the transition-free boundary), so a narrower feasible stretch can be missed.
