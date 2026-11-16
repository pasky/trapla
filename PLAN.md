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
implementing agent. The owner's principles, quality gates and workflow gotchas are in `AGENTS.md`.

**Player-facing words (rule, 2026-11-15).** Every message the player reads — violation title / fix / detail,
crossing card labels and tooltips, profile and bill tooltips — says in everyday words what is wrong or what
is built, where, one concrete computed fix and why, with a norm / game rule / engine limit tag. The
vocabulary lives in one place, `src/core/terms.ts` (glossary, outcome labels and explanations, banned jargon);
`tests/player-text.test.ts` generates every violation kind and outcome and fails on internal terms (SPK/OTSKP
codes, "tie-in", "realignment", "engineering", "faces", "allowance", "overbridge", "diversion", …) or a missing
title / fix / basis / rule. Price sources may be named only in the `rule` line and pricing tooltips. An earlier
plain-language pass was undone by later features precisely because nothing enforced this.

## First playable prototype (built 2026-11-13)

What exists (details and commands in `README.md`):
- **Data pack** (`pipeline/build_pack.py`, `npm run data`): DMR 5G at 5 m for a 17.5 × 22.5 km EPSG:5514
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
  violation; the auto-profile respects it). Mapped watercourses now pay full catchment-sized pipe/frame
  assemblies (barrel + two heads); large flow/width/length forces a bridge. Cuts through channels are
  invalid; deep bored tunnels retain surface flow. See research/17 for provisional hydraulics. Since cost model 3
  motorways / expressways are treated the same way (see "Crossing existing roads"). Bridges are only
  considered ≥ 4 m above ground and bored tunnels with ≥ 14 m of cover; minimum bridge 30 m, tunnel 150 m;
  earthwork gaps shorter than 60 m (bridges) / 150 m (tunnels) are merged. Road base price is charged on at-grade
  length only. Slopes that do not reach the ground within 150 m and footprints leaving the terrain data are
  violations.

### Watercourse crossings

- Independent OSM stream/river/ditch/canal vectors retain tagged widths and pointwise upstream areas;
  `pipeline/hydrology.py` burns/fills/accumulates a 25 m DMR grid, flags truncated basins, writes
  `watercourses.json.gz` with a scoring fingerprint. Legacy packs retain an explicitly uncertain fallback.
- Full sized culvert assembly enters bill, structure choice and Auto estimate; separate HUD/profile cost
  group and blue-ring map/profile markers. Parallel channels intercepted by fill force bridges where
  clearance permits, otherwise a conflict; no unpriced diversion. Deep-tunnel passage is disjunctive in Auto.
- Sources/assumptions: `research/17-stream-crossings.md`; saved-design results and the ~12.2 km case:
  `research/17-stream-validation.md`, reproducible with `scripts/stream-report.ts`.

### Automatic footprint engineering (cost model 16)

- Indexed slope/support screens now drive priced retaining walls, minor-channel relocation,
  support/end movement, longer spans and bounded norm-compliant Auto profile refinement.
  Retained sections change actual cut/fill, land and building quantities—not just collision masks.
  Height-dependent wall/channel component assemblies are sourced in research/18; geometry limits
  remain provisional. Manual grades, pins and structure ranges remain constraints.
- Ordinary-road remedies retain real source chainages, branches and feasible tie-ins. A 25 m
  collar is tried before larger collars; outside junctions can cap failed shortcuts. Identical
  independently accepted connectors share pavement/support costs and unique ACCESS allowances,
  without claiming unbuilt source intervals or deleting surviving continuations.
- Bridge piers, per-span pricing and per-span rendered soffits use the same actual layout.
  Vertical retaining faces, full turning disks and removed-road/channel annotations show the
  construction; final unresolved constraints remain explicit violations with measured diagnostics.
- Model 16: a crossing way's in-footprint stretch belongs to its crossing remedy and never forces a
  tunnel; tracks/service roads force no structure and get walls only below their relocation cost;
  minor roads under abutments are relocated; abutments may stand in a ≤5 m cut with a priced regrade
  instead of a grade lift. A failed relaxed relocation triggers one strict re-engineering pass.
- Straight-line Automatic and all five refreshed saves are VALID on the current vector-water pack.
  Whole totals in bn CZK: straight 10.051833; best 4.325765; demo 4.986752; direct80 5.018385;
  direct90 5.575139; town 11.447356 (model 15: 10.27 / 4.76 / 5.38 / 5.24 / 5.73 / 11.69).
  Four saves received small bounded PI refinements, not new routes.
  Counts, face areas, lengths, sources, paired cost changes and limits: `docs/footprint-conflicts.md`.
- Model-13 fixtures and their pack fingerprint remain untouched. Separate model-16 fixtures freeze
  bills, validity and built geometry on both known packs; no subtract-new-rows workaround remains.
  Reproduce with `scripts/footprint-audit.ts` and `scripts/eval-regression.ts` (`PACK=` selects data).
- Review regressions cover true endpoint ownership, manual bridge depth validation, full vector
  water ribbons/excavated banks, vertical paid road-support faces and per-cell wall surcharges.
  Only feasible pipe/box assemblies own water intervals; retained barrel changes are rechecked.
- Automatic engineering is not covered by the old detection-only ~3 ms claim. Final reviewed-run
  warmed totals are 75.5–118.2 ms versus 61.1–71.9 ms for unchanged main on identical inputs.
  The ≤3 ms added / ≤50 ms total targets remain unmet despite an exact-output cache/allocation pass.
  Attributable `work.*` timings identify repeated retaining work and the direct-90 DP retry.

### Underpasses and evaluate latency (cost model 17, 2026-11-15)

- Tracks, service roads and local streets may pass through our embankment in a measured RC box
  (5 × 4.5 m / 8 × 4.5 m clear, ≥ 5.5 / 5.65 m of fill, ≤ 100 m): Auto option and an "Underpass" crossing
  choice, OTSKP-assembled price (research/19), drawn as portals in the slope. It replaces 5 long diversions
  and 2 street bridges on the published designs (−2.6 to −88.5 M each; all still VALID). Details:
  `docs/footprint-conflicts.md` § Underpasses.
- `evaluate()` is 70–95 ms steady and 80–108 ms mean during drags (was 81–108 / 88–115): bit-identical
  table sharing, pruning and memoisation (`docs/evaluate-performance.md`). **≤ 60 ms is not met**; the
  profile panel now shows a provisional grade on the moved route while the worker lags behind a drag.
  `scripts/bench-drag.ts` measures drags without repeating identical inputs.

### Crossing outcomes in plain words, sane ramps (cost model 18, 2026-11-15)

- Outcomes are named for what is built ("Rerouted to the nearest crossing at km 2.31 (+412 m of new track)",
  "Carried over our road on a 23 m bridge with 124 m of ramps", "Moved aside", "Closed"), each with a
  one-sentence explanation on the crossing card; footprint/crossing violations were rewritten (see the rule
  under *Working mode*). Failures of the automatic rebuild are tagged *engine limit*.
- Ramps use per-class gradients (research/20: track 10 %, service 9 %, streets 8 %, class III 7 %, I/II 6 %);
  where the crossed road itself slopes the same way, up to half that steeper, capped at the class's
  justified-case maximum (track 15 %, service/streets 12 %, class III 9 %, I/II 7 %); a bridge over us
  with a ramp over 250 m is rejected. Published-design bridge ramps now ≤ 196 m per side (were up to 386 m).
- Automatic road rebuilds join the roads they cross at ground level, and as a fallback close a loop
  stretch whose ends stay connected over other roads; the owner's km 8.64 case ("realignment … intersects an
  unhandled road" beside a service-road bridge) is gone. A reroute beyond 750 m replaces a feasible bridge
  over us when it costs at most half.
- All published designs stay VALID and get 2.7–38.2 M cheaper. Audit: `npx tsx scripts/outcome-audit.ts
  --straight scripts/*-design.json --random 24`; details in `docs/footprint-conflicts.md` § Model 18.

### Crossing works leave other roads usable; click a crossing's works (cost model 19, 2026-11-15)

- A junction approach or a bridge-over-us ramp no longer buries other roads (owner report, D11 bend 24): side
  roads joining the raised/lowered stretch are regraded to meet it (class gradients, ≤ 250 m), roads beside
  it get a retaining wall (same rules and prices as ours), otherwise the treatment is infeasible and Auto
  picks another. Priced as construction, drawn, and named on the crossing card. Published designs +0 to
  +4.4 M, all still VALID. Details: `docs/footprint-conflicts.md` § Model 19; audit
  `npx tsx scripts/crossing-footprint-audit.ts --straight scripts/*-design.json --random 24`.
- Clicking any geometry a crossing owns (rebuilt stretch, reroute links, turning heads, underpass box,
  regraded side roads) opens its card, on the drawn width plus 3 px like mapped roads; elsewhere a mapped road
  keeps its base-road card.
- A reroute can be shaped by dragging its new road (persisted bend points per side, undoable, "Automatic path"
  in the card). The shape keeps leading to the crossing it led to and belongs to the one crossing of that way
  nearest to it; a way crossed more than once is shaped only after "Cut and reroute" is chosen for it. Checked:
  off our earthworks, no steeper than the class's justified maximum over 20 m stretches (PROVISIONAL averaging
  length), not across motorways (at grade), railways, water or buildings, at most 8 km. A first drag starts from
  the automatic path's own bends, so it only changes the road near the pointer. Engine gap: automatic reroutes
  are not checked for steepness (published designs reach 22–29 % over 20 m along steep slope toes) nor against
  railways, water and buildings; a shape may therefore be as steep as the automatic path (+1 point).
- Known gap: a crossed way whose cut ends stay connected over other roads is rerouted instead of closed (crossings
  have no "closed" outcome; footprint rebuilds do). Example: the service-loop fixture's 1.4 + 1.4 km reroute
  of a 100 m loop chord (`docs/footprint-conflicts.md` § Model 19).

### Motorway and railway scoring (cost model 20, 2026-11-15)

- Motorways (paired D 27.5 corridor, split / rejoin per direction) and railways (R1/R2, SPOŽES prices, CNOSSOS
  train noise) are scored; road bills are unchanged (eval-regression identical). Details and sources:
  `docs/mode-foundations.md` § "M1 status", research/32–35.
- Browser pass (screenshots 130–135): twin decks now stand on their own piers; a cut leading into a tunnel
  ends in a portal face up to the natural ground (before, the terrain's cut-off edge showed the sky); by-hand
  height points stay on their ground when a bend moves (before, bending one split direction slid every later
  height point and made both directions clash downstream); motorway bests are kept (the store was keyed by the
  road mission). Drag budget holds on D3 motorway, paired and split (`drag-perf --scenario d3 --preset
  d3-motorway [--split forward]`).
- Railway mission (preset `d11-railway`, screenshots 136–139): the D11 ports joined by an R1/R2 railway, an
  honest exercise (OSM: today's line is tracks=1, electrified=no); trains = the PROVISIONAL prior (128 a day);
  time target 9 min is a mission choice. Straight starter VALID at 27.9 bn CZK; perf design
  `scripts/scenarios/d11/d11-railway.json` 25.4 bn CZK. Drag budget holds in all five modes.
- "By hand" seeds every grade break of the automatic profile; on roads and motorways that is a point every
  ≈ 250 m, each a real break (≥ 0.25 % on D11 best and the D3 motorway), so nothing is thinned.

### Buildable automatic reroutes, lowered underpasses (cost model 22, 2026-11-16)

- Automatic reroutes are engineered and checked like any road: a profile within the class gradient (its
  justified maximum where the ground leaves no choice), earthworks ≤ 10 m, culverts for streams, houses in the
  way bought out, never on the ground across railways, ponds/rivers or motorways; where the line beside our
  earthworks fails, a gentler line is searched within 100 m of our road. One that still cannot be built is a
  violation with its reasons and a computed fix, and Auto picks another treatment. Before: 730 of 871 automatic
  reroutes on the audit designs were silently unbuildable; now 7, all reported.
- Lowered underpass (research/37): under a low embankment the crossed track or road is lowered into a cut (at
  most 6 m, PROVISIONAL) on class-gradient ramps, its low point drained by a gravity pipe or a pumped sump
  (TP 83). The D11 straight start line and town-centre are VALID on their own (local road 2244 lowered 3.3 m,
  service road 5162 lowered 2.9 m). A bridge over us may slope like its road.
- A reroute leads only to a crossing that carries traffic over or under us, never to another cut road
  (playtest-qa P1 #13; 152 such chains on main's audit designs, none now). A selected crossing outlines all
  its works on the map. Auto avoids boxes whose kept road runs straight back under our slope.
- Published designs: straight +33.5 M, best −45.8 M, demo −43.8 M, direct-80 −8.0 M, direct-90 +48.7 M,
  town-centre +91.5 M (cheap unbuildable reroutes replaced by honest ones or structures; lowered boxes save
  elsewhere), all VALID. Full evaluation ≈ +1 % on the saved designs, within noise (sum 569 → 568 ms before the
  review fixes, +6 ms for their finer reroute survey; candidate reroutes that cannot be worth it are not built,
  reroutes reused by the strict retry). Details: `docs/footprint-conflicts.md` § Model 22.
- Not modelled: groundwater and utilities under a lowered road; the pump station's installation and power
  connection (no installed price found).
- Future improvement: a crossed road meeting ours very obliquely gets a box as long as its skewed path under
  our embankment (town-centre km 15.98: a 57 m box sticking out of the slope). A designer would square the
  crossing by realigning the crossed road near it (a shorter box, a short rebuilt stretch each side); the
  engine keeps every crossed road on its own line.
### Map camera and labels (playtest-qa S1 #15, #17, #19, 2026-11-16)

- The orbit target goes back onto the ground under the screen centre after every pan, turn and zoom (the view
  does not move), and stays over the map. A pan used to keep it at one height: over hills it ended under or
  above the ground, so the wheel stopped ≈ 150 m above the road (Voletiny), pans ran kilometres and a turn
  swung the subject off the screen. The wheel zooms about the ground under the cursor; the view looks at most
  ≈ 76° from straight down (was ≈ 85°, skimming the horizon); a click in the profile or a card from a low view
  flies there looking down at 40°. *Whole route* (map button, <kbd>W</kbd>) frames the active road from
  anywhere, e.g. after panning off the map's edge.
- Picking something away from the map (a click in the profile or a list) frames it: `frameSelection(sel)` in
  `src/main.ts` flies to it when it is off the screen, seen from a low view, or too small to make out (a piece
  shorter than a sixth of the view, a single place from further than 6 m per pixel); from the whole-route
  overview a profile click used to select a piece without showing it (QA re-test P1).
- A selected bend's guide is its two straights, solid, up to 600 m out from the bend; the dashed guide along the
  whole road read as the dashed official line. The legend's official-line symbol is drawn as on the map.
- Labels never print over each other nor under the map's buttons, bars and legends: A, B and the official
  line's label keep their room, place names follow
  by rank (towns first); names further than 6 camera distances are left out (none pile up on the horizon). Noise
  walls of one height on both sides of a stretch get one label ("3 m both sides").
- `node scripts/camera-check.mjs` plays these with real mouse input (screenshots 157–159).

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

### Historical reference numbers (model 10, S 9.5, 90 km/h, auto profile)

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
  not find. An early D11 measurement was ≈32 ms (Node), ≈24 ms of it Auto profile; it predates
  footprint engineering. Current timings and unmet targets are in `docs/footprint-conflicts.md`.
- Auto-profile cost uses a flat-ground section estimate at rural rates, without buildings, local land-use
  costs, ordinary-road junction costs or noise. It does receive raw motorway/trunk clearance requirements
  (as well as river/rail crossings); final validation rejects missed clearances. The bill uses real sections.
- Cross-sections ignore crossfall/superelevation and curvature correction; transition curves are not drawn.
- The general render mesh is 20 m; relief shading, contours and map layers use the 5 m grid and vectors.
  Cut/fill daylight edges share 2.5 m samples with local ground collars; the terrain discard boundary lies
  inside those collars, not on the cut face. Crossing collars share a ground-height blend field so their
  overlaps do not bury adjoining roads. Distant terrain silhouettes still show the coarse mesh. Buildings are flat-roofed boxes and stretch with the vertical
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
6. LOD terrain mesh (5 m near the camera); pitched roofs.
7. Full-evaluation latency after a drag (≈ 90–150 ms) and the 3D road body following the drag live; open
   crossing cases (long reroutes where nothing fits, border pier placement, junction approach ramps) — see
   `AGENTS.md` "Open items".

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
- **Noise calculation — compact, not an acoustic study** (source, traffic, ground class and limits below are
  current; the per-station 2D section, Maekawa barrier, wall position and 50 m margins described here are
  **superseded by cost model 21**, see "Noise: finite segments" at the end and research/36):
  `core/road-noise.ts` uses Czech **Manuál 2018,
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
| Classification of `building=yes` (46 % of buildings) | < 50 m² minor; by land-use zone, address; ≥ 300 m² outside any zone = industrial | `pipeline/build_pack.py` `building_info` |
| Working strip for demolitions | 3 m beyond the footprint / deck edge | |
| Building land | 1,500 CZK/m² × 1.5 | research/07 (range 600–3,500); other land 8 × 40 |
| Grade separation thresholds | ≥ 6 m above (4.8 m clearance + deck) / ≤ −6 m below | heuristic: 4.8 m clearance is ČSN 73 6201, the deck depth unverified (research/08) |
| Watercourse flood proxy | Q100 = 3 × max(0.1, A km²)^0.75; ×2 for incomplete catchments | PROVISIONAL, not a ČHMÚ regional formula or uncertainty bound; 25 m burned D8 on DMR with boundary/nodata flags (research/17) |
| Culvert capacity / limits | velocity 2 m/s; pipe 70% area, box 75% height; pipe ≤80 m, frame ≤100 m, ≤5×3 m | PROVISIONAL screen; beyond → bridge, width+2 m banks each side / flood opening; not a hydraulic design |
| Ecological frame floor | natural stream ≥1 km² or tagged width ≥1.5 m → natural bed +0.5 m bank | PROVISIONAL habitat proxy, not surveyed fish/ÚSES; AOPK ledge recommendation 0.4 m, justified minimum 0.25 m |
| Watercourse assembly price | OTSKP Apr2026 DN800–>1600 / frames 2×2–3×2 + two heads | Larger frames and bedding/encasement quantities provisional; replaces excess-length term, ordinary road drainage remains in base norm |
| Junction with a through road (class I–III) | 25 M CZK | PROVISIONAL research-informed estimate from roundabout awards 19.8–37.5 M; no isolated T/X-junction contract found (research/08) |
| Motorway / expressway | no at-grade crossing | bridge ≥ 7.5 m above or overbridge ≥ 6 m below (research/08) |
| Junction spacing incl. A/B | 1.5 km | rural ČSN 73 6101:2018 via research/12 §2, medium-high confidence; same urban rule is a scenario assumption |
| Parallel links, both sides | 2 × max(25 m, station gap), reach ≤ 750 m per side | heuristics; beyond reach choose overbridge, never truncate cost |
| Local/service reconnection | 24.133 / 32.930 M CZK/km rural / urban | SPK A.1.M.7,5.NER / M.11,5.NIR; mask at crossing, flat+hilly rows |
| Service sjezd / track diversion | +0.5 M per service reconnection / 13.986 M/km | research/13 sjezd very low confidence; SPK A.1.P4.NE paved field road, not gravel |
| Raised overbridge approaches | total 2 × max(0, 6 + h) / 6% metres × SPK road row | heuristic gradient; includes standard earthworks, no separate fill lump sum |
| Crossed-road widths for overbridges | 27.5 / 11.5 / 9.5 / 7.5 / 6.5 / 4 m by class | SPK-normalized geometry model: one clear span across footprint, bank-top abutments, no piers on our road (research/16) |
| Bridge height calibration | SPK free height 8 m standard; +30% at 35 m | **SOURCED** SPK CN 2026 appendices 1/5; linear interpolation recommended; not an empirical award fit |
| Bridge span / supports | equal mainline spans ≤30 m; reference 120 m / 3 piers; surface-to-soffit depth span/20 | **PROVISIONAL layout**; local-height integration and above-35 m extrapolation differ from SPK whole-object maximum; below 8 m retains standard |
| Bridge foundations / abutments | S9.5: 6 Ø0.8 m ×15 m piles/support; 2 abutments ≈7.009 M before surcharge | OTSKP unit prices **sourced**, quantities **PROVISIONAL**; standard pile length, not inferred from surface geology; fixed cost once per run |
| Bridge deck span term | equivalent concrete 0.45 m³/m² ≤20 m; linear increase through ordinary/long spans | **PROVISIONAL** quantity proxy; not a certified span/design choice; calibrated residual prevents double-counting SPK work |
| Excavation weathering profiles | ČGS lithology + estimated local I/II bottom depths, III below; unknown = 75/20/5 | `pipeline/ground_profiles.json`; local D11 aggregate fit, not measured strata (research/10 §6) |
| Noise source / traffic | Czech 2018/2020 OA/NA equations; 15% acoustic heavy share, heavy speed ≤80 | Emissions and TP219 time distribution sourced; heavy share/design-speed proxy are assumptions; hard ground is the conservative categorical EIA fit (research/11) |
| Noise wall | Auto 2 / 3 / 4 / 5 m (cheapest area per house), 10,000 CZK/m²; ≥ 2 × the house's distance long | price PROVISIONAL calibrated recommendation (8–14k, research/09 §1); 2 m used on a D6 cut top; minimum length Manual 2018 §1.11 h; 5 m top PROVISIONAL (research/36) |
| Level and screening | Σ cells (≤ 10 m) of Y − U(d) − 10 log(180°/α) − DB, day and night; DB = 13.41 + 10.47 log(Z+0.18) − 2.67 log²(Z+0.18) | Manual 2018 §1.10–1.11, §1.19; hard Uo calibrated (research/11); in-band form for every cell, far cells grouped, best single obstacle (research/36) |
| Source / wall position | propagation: near lane 1.75 m, 0.5 m up; barriers: axis, 1 m up; wall at crown/2 + 1.5 m on embankments and bridges, on the top edge of a cut | Manual §1.11 a; TP 104/2024 §3.4 and Fig. 7b; the 1.5 m crown allowance PROVISIONAL |
| Receivers | every storey, 1.5 + 3 × k m above building ground, 2 m before the façade nearest the road | PROVISIONAL storey height; the loudest storey decides |
| Noise-infeasible dwelling | 1.5× building-only value + demolition + plot max(3 × footprint, 400 m²) at 1,500 × 1.5 | acquisition and additional-plot rule PROVISIONAL; no window-only outdoor compliance |
| Material value for decisions | search in −196 … 536 CZK/m³ from 200; tolerance 1.5 m³/m | bounds = haul to a tip / bought fill less placing |

### Historical model-10 comparison (S 9.5, auto profile)

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
(commit `cecb3e9`); original inputs remain in commit `a6a93b6`. The table above requires its historical
model-10 code/data/inputs; current code and refreshed saves produce the model-16 report in
`docs/footprint-conflicts.md`. Original search commands:

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

**Historical model-10 calibration and spatial check:** direct80 / bypass = **1.111×**, direct90 / bypass = **1.165×**,
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
  by 6 + h; lowering the crossed road into a deeper underpass is not an option (model 17 underpasses keep its
  level and need ≥ 5.5 / 5.65 m of fill).
- The structure choice compares each option at the rates of its own footprint, but the balance search's
  estimate takes the built-up share at the centreline only.
- Buildings: only OSM ways (no multipolygon buildings); the rectangle over-covers L-shaped footprints; no
  severance cost for plots cut off from their access.
- Noise: category emissions and day/night traffic are explicit, but 15% heavy share and the terrain
  extension remain assumptions. Hard ground is a conservative categorical fit to two EIA cases, not
  independent validation; residuals −0.42…+2.57 dB and missing inputs prevent a universal accuracy claim.
  Model 21 (research/36): finite 10 m cells with the manual's angle and barrier terms; the in-band form is
  used for every cell (≥ the §1.10.2 transformation), far cells are grouped, the best single obstacle per
  cell counts (no multi-edge path), no reflections, vegetation, building screening or terrain beyond the
  road's own cut / crown / deck edge. One receiver point per dwelling (façade nearest the road), every
  storey. Auto walls are grown per house, loudest first (the search window widens while a wider one could change the choice): greedy, not a global optimum;
  no foot-of-cut walls (widened cut) or earth bunds. Civic buildings with protected uses are not classified.
  Buyout is the only fallback; covered roads, property reuse, parcel geometry and relocation are not
  optimised. **Fallback-only buyout is discontinuous**: moving closer to a cheap house can replace an
  expensive long wall with cheaper acquisition. This is a gameplay incentive, not a summation error;
  elective buyout versus shared-wall mitigation is not solved. SPK CN's urban surcharge
  contains 10 % "protective measures", so explicit walls partly overlap that allowance.
- Motorway / expressway crossings: the auto-profile requests a bridge clearance rather than optimising
  the cut-and-overbridge alternative (which manual profiles can choose); the forced bridge is the 30 m minimum whatever
  the motorway's width and the crossing angle.
- (Fixed in cost model 21: walls in cuts now stand on the cut's top edge, or none where the cut screens.)
- (Fixed in cost model 21: the pale seams beside slopes and abutments, screenshots 128 / 129; see the noise
  section's render bullet.)

## Bridges vs high fills, player overrides (cost model 11)

- Benched fill/cut geometry now contributes real volume and footprint; high earthworks pay a separate
  **provisional** stability/ground-treatment reserve even with free surplus soil. Stream crossings pay
  excess culvert length beyond norm drainage (superseded by full watercourse assemblies, research/17). Bill, structure selector, balance estimate and DP share these
  terms, including the merged ČGS geology categories. Sources, uncertainties and formulas: research/15.
- Flat rural S9.5 bridge break-even at material value λ=200: **26.85 → 16.62 m**; at λ=0:
  **47.03 → 18.62 m**; at λ=−196.4: no old economic crossing → **21.03 m**. Reproduce with
  `npx tsx scripts/bridge-break-even.ts`. This is mostly the provisional engineering reserve, not a newly
  discovered ČSN limit. No hard height cap was introduced. **Model 12 below supersedes the flat bridge rate** after recovering the SPK height attributes.
- Profile range **B/T/E/C** paints bridge/tunnel/earthwork/automatic; persisted, undoable, partial repaint/
  erase, visible on map/profile, and respected by Auto. Invalid height/cover, short runs and forced crossings
  produce explicit game-rule violations. Ranges retain absolute chainage when the plan changes.
- **Auto grade pins** constrain the finished parabolic line to ±0.5 m at absolute stations, inside DP
  transitions rather than by post-editing VPIs. Alt+click profile → Build tools → Pin height; clear, undo,
  persistence, map/profile marks. Fixed tie-ins and hard gradient/curve checks remain; failures show
  gradient-only bounds or the displayed fallback height, explicitly not a feasibility proof. Pins are
  inactive in Manual or beyond a shortened route. No-pin search/pricing is unchanged (model stays 11).
- **Crossing choices** persist by existing-way pack ID: junction / our bridge / its overbridge /
  close-and-reconnect / Auto, with all raw intersections retained for chosen ways. Shared prices and
  explicit clearance, depth, spacing, structure and reachable-link checks; invalid choices cannot serve
  as resolved link anchors. Auto receives requested bridge clearance / motorway-overbridge cut bounds;
  ordinary overbridges use the same priced raised approaches as Auto. The HUD lists all affected
  intersections and can clear inactive saved road choices. Shift+map-click places a bend instead of
  selecting a building/crossing; existing numbered PI markers retain their drag controls. Map shows
  junction rings, continuous crossed roads/decks and schematic two-sided links; pricing remains the
  documented station-gap proxy (not a surveyed diversion). Default scoring is unchanged.
- **Building choices** persist by pack building index: explicit buyout/demolition anywhere, keep, or
  Auto. Keep blocks footprint/working-strip demolition and noise acquisition; retained collisions and
  actual residual noise produce blocking violations. Off-corridor manual buys share the noise-buyout
  plot allowance; footprint buys pay once under the original corridor-land rule. Map labels, profile
  markers, contextual HUD, undo and clear are shared with the other tools. No default bill changes.
- **Noise wall paint** shares the profile range selection: left/right, actual height 2–6 m (including
  fractional heights), explicit no-wall, or clear to Auto. Actual heights drive bill, receiver checks and
  noise map; manual cells do not seed automatic margins or join height-promotion runs. A manual wall
  decision at any exposed pair prevents implicit acquisition of that whole dwelling; residual excess is
  a blocking violation with a computed wall/extent suggestion or explicit-buyout fix. Nearby failures
  are grouped by side/stretch and listed after geometric and goal constraints. Keep also blocks
  fallback. Unrelated automatic buyouts retain the original policy. Player walls have exact extents,
  tunnels suppress them, and map/profile marks include removals. No default score/version change.
- **Grade line: Auto | Manual** replaces the ambiguous button. Auto seeks a low-cost legal vertical line;
  Manual freezes it for vertical-point edits. Auto replaces manual vertical edits but keeps structure paint.
- Manual-tool verification: 178 tests, typecheck/build, original mouse smoke and
  `scripts/build-tools.mjs` (real controls, map building pick, Shift+click, clear/undo/reload); both the
  script and its screenshots were later replaced by the persona playtest (see "Interface rethink").
  All five saved designs retain **exactly** their baseline bills and VALID state, including per-cell
  sums. Shared-host five-run means: **43–62 ms**, versus **41–64 ms** before the tools; a demo pin takes
  ~64 ms after warm-up. Pin search can take longer on a tight constrained grid; drag computation stays
  in the latest-request worker. Town-wide wall removal groups 301 retained receivers into 17 issues,
  with zero implicit buyouts. Pack fingerprints guard stored object IDs after a data rebuild.
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

## Geometry-priced bridges (cost model 12)

Source correction: SPK CN 2026 appendix 1 §A.2 defines **maximum free height ≤8 m**; appendix 5
`A.2.S.9,5.N` D5:E6 gives **+30% at 35 m** and the methodology recommends linear interpolation.
The original research/15 claim that no quantitative bridge-height dependence was found was incomplete.
Research/16 documents exact sources, 11 Czech project geometry records, the failed search for eight
scope/year-comparable bridge-only awards, OTSKP quantities, normative fit and residuals. No invented
empirical tender regression: the reference bridge matches both official height anchors exactly.

Shared `bridgeModel()` prices span/deck, local height-sensitive internal supports and standard pile
foundations. Two fixed abutments are charged once/run, split into endpoint cells. Final selection,
coarse balance and bill share run geometry; DP uses the same formula with 120 m reference amortization
because it has no run state. Painted remnants reprice their own abutments; forced bridges stay forced.
Crossed-road overbridges use one clear span with no fictitious piers in our road. Per-cell sums remain exact.

Flat rural S9.5 break-even, **same engineered fill**, model 11 → model 12 (120 m uniform run):
λ=−196.4 **21.03→21.89 m**, λ=0 **18.62→19.33 m**, λ=200 **16.62→17.19 m**.
At λ=200: 30 m run **17.61 m**, 300 m run **17.10 m**. No legal fill-height limit is implied.
Reproduce with `npx tsx scripts/bridge-break-even.ts` and `scripts/bridge-calibration.ts`.

| Unchanged saved plan | Model 11 total, M | Model 12 total, M | Bridges count / m | 50-trial candidate total, M |
|---|---:|---:|---|---:|
| demo | 4,099 | **4,233** | 8 / 1,040 | 4,172 |
| best bypass | 3,738 | **3,912** | 7 / 900 | 3,881 |
| direct80 | 4,062 | **4,350** | 13 / 1,390 | 4,324 |
| direct90 | 4,382 | **4,618** | 10 / 1,400 | 4,581 |
| town-centre reference | 10,580 | **11,038** | 15 / 2,720 | 7,729 |

All VALID; town-centre also has one 160 m tunnel. Candidate runs use seed1612, 50 trials and the saved
speed (90 except direct80). Saved JSON geometry/metadata is deliberately unchanged for clean model
comparison. The town candidate leaves the centre and must not replace that reference. Other quantities,
source-data limitations and full component numbers are in research/16. Prior model tables above are historical.

Review limitations: local heights give a +15% reference premium for an 8→35→8 m triangular valley,
versus +30% from SPK's maximum-height rule. The 120 m reference is near the non-town baseline mean
125.5 m, **not** an SPK length assumption; 30 m bridges pay a **15.1% short-run premium**. Fixed
abutments do not capture tall short-bridge abutments. Full-cut single-span overbridges are conservative:
100 m S9.5 **97.68 M** versus **58.32 M** for reference-height multiple spans. These need future
layout/quantity refinement; the normative two-anchor fit is not empirical validation.

Validation: **182 tests**, typecheck/build; added bridge calibration/height/span/foundation, exact
selector-vs-cell-bill, fixed-abutment rejection/forced/manual/split-remnant tests (existing summation and
crossing tests updated, not duplicated). Warm 20+20-evaluation bench on a loaded shared host:
baseline wall **56/72/77/70/62 ms**, first model12 **81/60/72/65/82 ms** (demo/best/80/90/town).
After review's below-8-m clamp, a more-loaded run measured **104/88/107/95/71 ms** (CPU
**148/108/132/121/84 ms**, including V8 background work). Last-evaluation wall timings were
**118/109/136/76/80 ms**. Do not interpret non-contemporaneous loaded runs as precise overhead.
Bridge work remains linear; warmed structure+bill stages are roughly 1–3 ms combined. **40–60 ms
wall time is not established for every design under concurrent Chromium/hydrology load**. No UI changes.

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

## Interface rethink (2026-11-15)

Owner, after playing: the interface was overcomplicated (finding a stretch again in the profile, single clicks
adding bends, junk text, a noise band that contradicted the building colours). Playtested as three personas,
then rebuilt: map-first editing (drag the road to bend it, click anything to inspect it, empty clicks harmless),
one inspector card for every kind of thing with fixes as buttons, map ↔ profile selection always in sync, a
"where the money goes" list, progressive disclosure (*More*), a ruthless copy cut, and a noise view that shows the
deciding top-floor height with houses in their own level and a per-floor cross-section. Record, decisions and
the before / after copy table: `docs/interface-rethink.md`; gallery 60–71; `scripts/playtest.mjs` replays the
personas. Violations now carry a structured `target` (buildings, a sufficient wall) so the UI can select the
thing and offer the fix; bills are unchanged.

## Noise: finite segments, walls from the cross-section (cost model 21, 2026-11-15)

Three known problems were fixed together: walls standing inside cut slopes, max-over-stations infinite
lines overstating gaps (a 10 m opening seen from 76 m now adds ≈ 1 dB instead of making the house hear the
open road), and pale render seams (below). Sources, formulas, deviations and the per-fixture attribution of
the bill change: **research/36**.

- **One calculator** (`core/noise-field.ts`): every station cell (≤ 10 m, Manuál 2018 §1.10.2) is a finite
  segment, `Y − U(d) − Du(α) − DB`, energy-summed over the road (§1.19), day and night separately.
  Du = 10 log(180°/α) with the true angle of view; U is research/11's calibrated hard Uo at the perpendicular
  distance from the cell's line (a straight road gives exactly the manual's in-band result), or the §1.10.2
  transformation where that is larger (end-on cells). Screening per cell and side by the manual's DB (§1.11)
  over the best of the wall top, a cut's top edge and the crown / deck edge, along the actual ray, source on
  the axis 1 m up (the road's own edge from the near lane). The whole road is summed; every cut-off is a
  stated bound (research/36 §2). Every storey of every dwelling near the road.
- **Walls where the cross-section puts them** (TP 104/2024 §3.4, Fig. 7b): crown / deck edge + 1.5 m on
  embankments and bridges, on the cut's top edge in a cut (never inside the slope); none where the cut
  already screens. The same per-station line and foot feed the acoustics, the bill (length along the drawn
  line, height above the foot), the 3D wall, the house card's plan and section.
- **Auto, cheapest legal option**: houses loudest first (by their window's own level); each of 2 / 3 / 4 / 5 m grows one wall from its most
  useful cell until every storey meets the limit, at least twice the house's distance long (§1.11 h); the
  height adding the least area wins; walls built for other houses count. Buyout when 5 m over the whole
  reach cannot do it (the window widens as far as it could matter), as before. Junction openings and
  tunnels carry no wall.
- **Noise view**: the band is the same sum at the deciding height, computed by the worker only when the
  view is on (`noise-band` message), so the full evaluation does not pay for it. House cards show every
  floor's level (open ground → as built), a plan with a line from every piece of road weighted by what it
  adds, and one sentence on where most of it comes from ("62 % of the noise comes through the gap in the
  wall where the side road joins, km 6.43").
- **Pale seams closed** (verified in the browser, screenshots 128 / 129): two causes, both where the terrain was
  cut away with nothing drawn over it. Beside a slope's toe the replacement ground was discarded by the
  coarse rasterised footprint mask (it now discards only texels the exact footprint covers fully); in front
  of an embankment's end face at a bridge the terrain mask's raster bleed (≈ a 2.5 m texel) opened sky-coloured
  wedges — the mask now stops 3 m short of an end face on the fill side (the kept ground lies inside the
  embankment; in a cut it still reaches the face). No depth offsets.
- **What the route takes, drawn truthfully** (owner report 2026-11-16): a demolished building leaves the
  base map's footprint layer and its plot is drawn on the ground in its own shape (pale cleared ground,
  dark hatch, dashed edge); a bought-out house stays standing in its noise-view colour in every view with a
  dashed ring on the ground around it. Both are staged with the deferred 3D body (only the changed chunks'
  footprints are rebuilt and only that area of the map redrawn). Point markers remain only where a
  footprint is smaller than a pixel or two (far zoom), at the building's ground, outlined to read on roofs.
- **Sources for projects** (any-road-editing C1, motorway-rail): `AcousticSource` = one physical carriageway
  or track (stable `acousticSourceId`, cells, per-side screening, Y by day / night, per-cell weight, mode
  road / rail, lane offset, barrier-source height). Each `NoiseReceiver` carries its point (x, y, ground),
  storeys and `energy` {sourceId, rawDay, rawNight, day, night per storey} (open ground and as built);
  `ProjectReceiver.contributions[]` publish the same per storey with `position`. Energies of several sources
  at the same house and storey add; splitting a route splits its cells, it never adds +3 dB (tested). A
  motorway is two directional sources on their lane axes (laneOffset 0), a railway its own mode
  (emission / propagation of that mode not implemented here). Joint wall decisions across roads remain C1.
- **Staged decisions**: the grouped far sums (segment tree, two samples per far segment) are within
  `FAR_ERROR` of the cell-by-cell ones; every decision checks that margin and, where it could flip, sums that
  house more finely, then cell by cell. Walls, buyouts and violations are those of the cell-by-cell sum
  (tested against an all-cells run on every fixture); shown levels are cell by cell where a house was refined.
  Houses are handled loudest first by their window's own level. Bills moved by ≤ 0.2 M CZK (research/36 §3).
- Performance (open): the noise step is +2–3 ms on best / demo, +4–6 ms on direct-80/90 and ≈ +12 ms on
  town-centre against a903bda (27.5 against 15.0 ms, main 7.1; 48 of its 367 houses cell by cell); drags are
  unaffected (they skip the noise step). Numbers and what is left: docs/evaluate-performance.md.

## Local edits: the grade line in blocks (cost model 23, 2026-11-16)

Playtest (whole D3 / D35): a small nudge redesigned the grade and broke crossings 9–24 km away. Same design,
same bill stays the rule (no edit history), so the solve itself became local (research/39 "Local edits"):
blocks between long straights (from the plan only), each boundary's heights from the 1.5 km around it, each
block with its own mass balance, every input placed from the block ends rather than the stations; the
separation and strict retries and the support lifts act and are judged per stretch. Whole D3, 16 bend moves:
far grade change 14.8 → 2.4 m, far violations changed 2 → 0. Price: the line is no longer the whole-route
optimum (bills ±5 %, the whole D35 +10 %); five designs and starters needed 8–60 m bend repairs.
Known issues: support-lift targets still come from the station-based engineering; a bend move that shifts a
block boundary re-solves both neighbouring blocks (up to ≈ 8 km); interchange ramps are not modelled (the
ends say so on their card).
