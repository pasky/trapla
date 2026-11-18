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
- Railway mission `d11-rail-kralovec` (cost model 21, research/38): Trutnov hl.n. → Královec on the mapped
  line (owner: a railway mission must start and end on the rail network). A game proposal (no announced
  upgrade); trains a labelled prior (an hourly passenger train each way, 36 a day; 2022 ran 4 each way);
  9 min target a mission choice. Starter VALID at 10.4 bn CZK (leaves the station along its tracks, research/38 §5). A railway between two points of an existing
  line joins its track in a 300 m station area and rebuilds it where it runs along it (PROVISIONAL
  RAIL_TIE_IN_M / RAIL_TURNOUT_M); railway grade lines search a 0.5 m grid (12.5 ‰ could not rise over
  crossings on the 2 m / 1 m grids). The `d11-railway` card is retired (saves load).
- The 150 km/h speed-limit pilot option was removed (2026-11-16, owner): a posted limit is traffic policy, not
  design, and it only added cost (no goal rewarded it). A motorway is signed at its design speed; a save that had
  it on loads as 130 (its operating speed is ignored). research/41 stays as background: it could return only as
  a mission design goal (a time target that needs it). The Motorway card has one "Design speed" control with the
  norm line it implies: curves ≥ 840 / 690 / 560 m at 130 / 120 / 110 km/h are the 2018 edition's (research/33
  §7); the 4 % slope and the vertical radii remain the older edition's (the 2018 values are not public).
- Build → Motorway / Railway and drag-to-rebuild of mapped railways (`ui/mode-kinds.ts`). A Build motorway is
  unpriced (no interchanges); a rebuilt railway stretch is unpriced until taking up the old track is priced.
- "By hand" seeds every grade break of the automatic profile; on roads and motorways that is a point every
  ≈ 250 m, each a real break (≥ 0.25 % on D11 best and the D3 motorway), so nothing is thinned.
- Playtest session 1 (motorway-rail findings): choosing one motorway direction no longer changes the design
  (P0 #3). Its first drag makes it run on its own only over a *separate stretch* (`core/motorway-stretches.ts`):
  from a join on a straight of the shared line (clear of arcs and their easing, structures, crossings and
  vertical curves) before the change to one after it. Outside, both directions stay the ONE paired D 27.5
  evaluation (reused while only one direction is edited); inside, each direction is its own D 27.5-1 carriageway,
  keeping the shared heights while the two run within 30 m of each other (PROVISIONAL) and Auto heights between
  (the search starts and ends on the shared line's grade: `autoprofile` start/end grade, `evaluate`
  `fixedProfile`). The bill: the shared body's cost parts outside, both carriageways inside, what they share
  once (`splitLedger`). D3, one direction 50–300 m off between bends 3 and 4: +0.3–1.6 bn CZK, VALID, no
  problems outside the stretch; Join restores the paired price exactly. The Edit switch is on the motorway's
  own card (P1 #11). Mapped lines are picked on the ground under them in 20 m pieces (P1 #14), crossing cards
  name "our railway" / "our motorway" (P1 #10).
- Cost model 22–23 (playtest re-test 2, merged with main's finite-segment noise; D11 bills identical): a
  paired motorway's noise is its two directional sources (half the traffic each on the lane-pair axes ±6.0 m;
  a direction on its own keeps the whole traffic on its own lane axis, an upper bound, until houses heard by
  two sources are decided jointly): D3 motorway noise walls +12.5 M CZK, D35 +2.7 M. Cost model 23 after
  merging main's valid reroutes (Královec starter re-fitted, 10.4 bn). A double track's noise on its two tracks, a single track's on its axis.
  Railway ends on a track leave it at no more than a turnout's angle (4.76°, research/38 §5): the Královec
  starter now leaves Trutnov hl.n. along its tracks (VALID 10.4 bn). Rebuilt railway stretches keep their line's
  speed (OSM maxspeed; 100/80/60 km/h rows, Rmin 190 m) and may be as steep as the old line. A mapped railway is
  dragged without selecting it first; the direction towards A numbers its bends from its own start.

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
  crossing by realigning the crossed road near it (a shorter box, a short rebuilt stretch each side); done in
  model 28.

### Crossing remedies as designers choose them (cost model 28, 2026-11-16)

- A road running along ours (crossing it and back without leaving our earthworks) is one crossing and is moved
  beside our earthworks as an accompanying road where that is cheaper than keeping a crossing for it (D3 motorway
  starter km 14.18: 700 m of class III road for 18.6 M instead of a 704 m bridge for 2.49 bn).
- A crossed road meeting ours at under 70° (research/44: ŘSD R 111's non-standard threshold; no Czech minimum
  bridge angle) may be straightened: a square run across our earthworks joined to the old way by bends no sharper
  than its class allows (track 25 m, streets 27 m, class I–III 90 m), new road billed per metre; Auto keeps the
  cheaper buildable variant, the card offers "Keep its line" / "Straighten it" (town-centre km 15.98: 57 m box →
  25 m; D3 km 7.94: a 117 m box → 50 m, and the strict retry's extra 150 m of motorway bridge is gone).
- Neighbouring minor roads share one crossing (research/45): a consolidation pass leads tracks' and service roads'
  own structures and reroutes to neighbours that carry traffic, wherever cheaper; reroutes join the target's road
  where it comes nearest. A reroute's earth slopes take the houses they reach. A dead-end stub our earthworks take
  (almost) whole is removed. An automatic crossing with nothing buildable under a ≥ 6 m embankment lengthens our
  bridge over it.
- Against model 27 all published designs stay VALID and get cheaper (straight −17 M, best −40 M, demo −37 M,
  direct-80 −81 M, direct-90 −21 M, town-centre −67 M); D3 motorway starter 17.41 → 14.04 bn, whole D3
  40.87 → 37.35 bn (its 698 m bridge along the motorway gone), whole D35 34.22 → 33.74 bn; Nová Paka 2.44 → 2.23 bn,
  its km 3.3 drags 10/24 → 0/24 invalid. Details, audits and timing: `docs/footprint-conflicts.md` § Model 28.
- Known remaining: whole D35 km 22.08, a track crossing at 22° whose reroute meets a river gets a 226 m bridge
  over us (187 M): straightening it would cut off a road joining it just outside our earthworks (reconnecting
  such a side road to the new line is not modelled). Track 4843 (D11 km 9.8, d11-railway km 9.44) in a shallow
  cutting on ground too steep for a track: no reroute, bridge or box fits (reported). D3 motorway km 3.63 / 3.71:
  the browser's motorway preset leads both tracks to the km 2.67 box while a Node evaluation of the same design
  joins km 3.63 to km 3.71's bridge (difference not yet traced). Straightened lines are drawn on the ground beyond
  their ramps (their steepness is checked over 20 m, not engineered), bends are arcs or cubic curves without
  transition curves; merged crossings of different ways within 30 m keep one remedy for the group.

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

### Structure choice at the real prices; By hand keeps the bill (cost model 24, 2026-11-16)

- Playtest S3 #1: switching to By hand changed the bill (D11 straight −29 M, with a pin −143 M) although the
  heights were the same. The bridge / embankment choice priced fill at the value the profile search had found
  before the support lifts, on only four tries; the final designs were far from balanced (town-centre priced
  as surplus while 455k m³ short; By hand fell back to the starting value). Now the choice settles the value on
  the final grade line (regula falsi, ≤ 6 tries of the selection only, the same in both modes): By hand from
  Auto's heights bills identically (checked on every fixture in `tests/evaluate-costs.test.ts`), and Auto no
  longer leaves that money on the table.
- S3 #3: the choice now weighs the buildings each option demolishes (slopes vs deck strip plus the working
  strip, each building's price shared over the cells reaching it). The piers of a bridge the player chooses
  still move off roads, rails and water (the player picks the bridge, not its piers); an automatic bridge whose
  piers cannot all stand clear within the span limit is not chosen there. Poříčí halls (D11 straight km
  4.9–5.9) are now bridged by Auto on its own heights.
- Remaining gap (not fixed here): the auto-profile's per-metre costs are rural (no buildings, no urban land), so
  Auto does not raise the line to bridge a town. On D11 straight, painting a bridge over km 5.09–5.50 makes Auto
  re-plan the heights (cut through the hill at km 4.7 instead of a tunnel, a 33 m viaduct) and the project
  ≈ 80 M cheaper than Auto's own design. The piece card therefore says "Auto: at this height cheaper than a
  bridge", and "Your choice; Auto set the road height for it" when the player's choice re-planned the heights.
- A chimney, silo or shed (≤ 200 m², ≤ 1/4 of the other) wholly within a demolished building's outline goes
  with it (Nová Paka km 1.97); a stream left under the earthwork just beyond a bridge's end with too little
  cover is spanned by one more engineering pass.
- A building no one lives in that only the 3 m working strip beside our slopes reaches (not the slopes or deck
  themselves) stays when a retaining wall ending the slope 3 m short of it costs less than buying and demolishing it
  (the retaining-wall machinery and its research/18 OTSKP assembly; `retaining.ts` `wallBuildings`): Nová Paka km
  1.91, a hall demolished for 322 M CZK, now stays behind a 0.6 m wall for ≈ 0.3 M. Auto keeps no dwelling this way:
  a home metres from our slope's top needs noise walls or a buyout that the noise check decides only later (tried:
  random D11 designs gained +170 M of noise walls for 40 M of houses). A building the player keeps is walled off
  wherever a wall fits between our crown and it, whatever the slopes reach. The card says which wall keeps it and
  what demolition would have cost. Limit: a wall planned at a cell that then becomes a bridge leaves its one-cell
  extension beside the bridge end.
- Fixtures against model 23 (motorway-rail, D11 road bills identical to model 22): straight −33.9, best −23.1,
  best-drag −8.7, best-pin −36.7, best-structures −36.4, best-manual −17.3, demo −90.6, direct-80 −120.3,
  direct-90 −119.3, town-centre / town-controls −421.5 M CZK, validity as before (the merge changes no bill; the
  walls for buildings: demo −43.2, the others within ±0.1). outcome-audit (5 designs + straight + 24 random):
  violations 144 → 118, VALID 8 → 8 (more in two random designs: a road relocation beside a now-unbridged stretch
  fails); the walls for buildings alone: no design dearer by more than 1 M, four random ones 34–59 M cheaper.

### Town rates in the grade search; walls and short bridges by water (cost model 27, 2026-11-16)

- The block-wise grade search now prices a stretch whose axis lies in a built-up area at town rates, as the bill
  does there: SPK CN's urban road row, bridges and tunnels with the urban "other objects" surcharge (49.3 % vs
  30.6 %), the urban tunnel row and building land (1,500 CZK/m² × 1.5) instead of farmland. Each ground class has a
  rural and a town variant (`classAt` returns the town class where the centreline is built-up, chainage-anchored as
  research/39 requires). Poříčí (D11 straight km 4.9–5.9): Auto's own design now bills within 0.5 M CZK of the
  player's raised bridge over km 5.09–5.50 (it was ≈ 80 M dearer under model 23, ≈ 1.5 M under model 25).
- Tried and left out, measured on the 10 Auto fixtures + 24 random D11 designs against main (bill sums): town
  rates alone −1,459 M (16 cheaper, 14 dearer, validity 11 → 11); adding crossed-road remedies as priced points
  (junction / reroute / its bridge over us / underpass by height, our short bridge with its abutments) −931 M and
  +50 % evaluate time; adding buildings each earthwork / deck would take −1,254 M and validity 11 → 8. The full
  evaluation's structure choice does not share those signals (it bridges a crossed road only where it is forced, and
  keeps buildings behind walls the search cannot see), so the search raised the line for savings the bill never
  made (demo km 6.5–7.2: −69 M of buildings for +205 M of bridge). Parked: `/tmp/w7/dp-signals-wip.patch`.
- A retaining wall too high where the protected feature begins (ground falling away beside a bank) now stands
  nearer the road, where it is lower, wherever it fits (`retaining.ts`). A bank over water that no wall can hold
  back is carried past on a short bridge, also where the axis is only just above ground; water still left under
  earthworks gets one more engineering pass with a bridge over it (as a stream beyond a bridge's end did; its
  conflict id check never matched before). QA's D11 drag at km 9.0 (+65 m: "Our earthworks cover a pond or river
  at km 8.55") is VALID; a sweep of 30 single-bend drags at km 9.0 (±40…120 m): VALID 7 → 14.
- Fixtures against model 26 (M CZK): straight −135.5, best +9.2, best-drag +10.6, best-pin +13.1, best-structures
  +10.6, best-manual +9.2 (walls), demo −37.9, direct-80 +26.7, direct-90 −137.4, town-centre / town-controls
  +24.5; validity as before. The small rises are 1–2 m shifts of the grade in blocks that are not built-up, through
  the mass balance; edit-locality (all suites): no change beyond 10 km, no new far problems, QA repros PASS.
  outcome-audit (5 designs + straight + 24 random): −1,578 M in sum, VALID 8 → 8, violations 106 → 124 (random-11,
  an S 7.5 design already invalid: a long town bridge whose piers cannot miss the roads below, an engine limit).
  Evaluate time, sum of per-design minima over 35 designs, interleaved in one process: +1.0 % (noise).
- Known engine limits seen in the km 9.0 drag sweep (not fixed): (1) on D11 drags that move the line left at
  km 9.0, a long bridge at km 15.0–15.6 cannot place its piers clear of the railway running alongside below it
  ("A bridge pier stands on a railway" ×10–15) — the support layout only moves piers along the bridge, it cannot
  span a parallel track; (2) a skewed stream crossing (D11 km 7.84 at +55 m, sine 0.27, 127 m of span along our
  road) misses its required span by ≈ 1 m where the ground rises above the grade at the bridge's end: forced bridge
  cells stop where the grade meets the ground, so Auto would need to raise the line there.

### One drag, no curve-room problem (2026-11-16)

- A drag that starts on the road within an easement's length (the speed's minimum transition, e.g. 90 m at
  90 km/h) of a bend's curve moves that bend (a new bend there would crowd it); elsewhere it adds a bend, which on
  release is moved along the line (≤ 150 m, `core/bend-fit.ts`, as the rebuilding drag's bend already was) to where
  no curve lacks room ("too close for an S-bend", "too close to the end"). Measured on 200 random drags each on the
  best and demo designs (curve-room problems from the drag alone): 41 / 51 → 0 / 1.

### Any mapped road can be rebuilt (cost model 28, 2026-11-16)

- Any mapped road, street or track (and, from model 23, a railway along its own line) is dragged directly to
  rebuild a stretch of it; see `docs/any-road-editing.md`. A rebuilt stretch keeps its old road where its line
  stays on it (nothing built or billed there); every road is checked against the network as the player edited
  it (designed roads crossed by the same crossing engine; the lower-ranking road held on the other's deck and
  credited once); a house two roads take is billed once, houses heard by several roads are decided on their
  combined noise.
- Single-road bills unchanged: the D11 fixtures are identical to model 24 (re-stamped, version only);
  outcome-audit as model 24 (violations 118, VALID 8). Multi-road totals changed, hence the bump.
- Known (main's settled fill value): the structure choice of a whole road shares one fill value, so a change at
  one place can tip a marginal bridge / embankment cell kilometres away. D3: rebuilding III/1057 under our
  bridge at km 11.8 makes that bridge 10 m longer (+24.5 M around it) but shortens the 1.45 km viaduct at km 4.0
  by one 17 m-high cell (−25.5 M): the motorway's whole bill −32 M.


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

### Final-sweep P1s: project roads take over, new lines crossed, merged crossings split (2026-11-16)

QA final sweep (docs/playtest-findings.md, main e24df59), each repro a test (edited-network, new-line-crossings,
merged-crossings; the QA's own projects in tests/fixtures/qa-final/), `scripts/eval-project.ts` evaluates any
saved project in Node as the full worker does.
- **The player's road takes over.** One of our automatic reroutes within the 10 m clearance of another road's
  works (INDEPENDENCE_SCREEN) is planned again clear of them: evaluateProject runs a second pass with that
  road's land and works as obstacles of its reroutes (EvalOptions.keepClear, link problem 'works'). Any road's
  end on an old road another road changes meets it as at a junction (its own way, the way its end is anchored
  on, ways meeting at its end); a junction leaves the way it meets whole (no 'two roads change the same old
  road'). Rebuilt service roads and tracks are drawn in the higher road's network too, a designed road keeps
  its own crossing (never merged), roads one above the other as built are no contact. D11 audit
  (`scripts/reroute-takeover-audit.ts`): unpriced 112 → 13 of 292. A rebuilt stretch's end also meets the
  other road as at a junction where it stopped short of that road's works (its old road beyond the end, or
  what is left of it, a way of its own in the edited networks, is under them); a closure's detour interacts
  only with changes within its own reach (closed length + detour); roads one above the other are compared
  point by point. The 13 left: a player's road bent into our embankment or our reroute (0.2–31 m inside the
  10 m clearance) and two roads changing one way at the same place.
- **New lines across ours.** New or rebuilt railways (ROAD_CLASSES railway / railway2: formation width,
  SPOŽES route-km and H02 bridge prices, 12.5 ‰) and new paired motorways are drawn in the network of the
  line that outranks them (mission first, then motorways and railways, then side roads); their kernels follow
  the owner's crossing (holds). A held road high above the owner's bridge (both crossing a valley) passes over
  it on its own bridge (CrossingResult.above). A designed road raised over us builds its own approaches. An
  embankment whose slope never meets the hillside (sections `open`) is a bridge. Auto keeps a grade that
  passes under a motorway / railway there through support lifts, and lowers the rest of the way where that is
  nearer than bridging.
- **Merged crossings.** A way merged into another way's crossing (within 30 m) that our earthworks still bury
  is a crossing of its own (evaluate's split retry, EvalOptions.splitWays): whole D3 dragged at km 30 VALID.
- Frozen D11 bills unchanged (no model bump needed); the synthetic town's dual carriageway is now cut and
  joined to the junction instead of buried (town.test.ts).
- Known: a closure whose detour runs over a road another road changes still unprices both (no detour routing);
  the owner's crossing of a designed road is chosen from its ground (a held road preferring an embankment
  under our bridge misses its band); piers of one bridge over another are not checked.

### Design realism: slopes, design speed, hairpins (cost model 31, 2026-11-16)

Plan and sources: docs/design-realism-plan.md (M1, M4), research/46–54.
- **Earthworks.** Fills on the MD ČR VL 1 (2022) broken profile (toe 3 m 1:2.5, above 1:1.75 / 1:1.5, higher
  than 10 m soil fills to 1:1.8 above 6 m), no fill benches; cuts by the ground the face stands in (soil 1:2 /
  1:1.75 with 1 m benches every 6 m, sound rock 4:1 with benches every 5 m, its face netted at OTSKP 289941);
  soft cohesive ground under high fills treated (research/52). The unsourced high-earthworks reserve is gone;
  undivided roads carry SPK's 29.4 / 48.1 % surcharge. A culvert deeper than its pipe or precast frame takes is
  billed and drawn as a buried bridge. Underpass boxes end where our slope comes down to their roof, behind a
  headwall; from there the way runs between wing walls (billed as retaining walls).
- **Norms.** ČSN 73 6101:2018 vertical radii and grades by category × terrain class; the terrain class per
  stretch from the DEM (core/terrain-class.ts, median ground slope within 500 m over a 10 km window).
- **Design speed per bend** (90 / 80 / 70 on the bend's card), hairpins (R ≥ 30 m, 8 % banking, widened
  pavement, ≤ grade limit in the hairpin), VALID by game rule where the ground is steep.
- **Bills** (model 30 on main → 31): best 4,122 → 3,617, demo 4,845 → 4,234, direct-80 4,731 → 4,183,
  direct-90 5,280 → 4,687, town-centre 10,958 → 8,879 M CZK, all VALID (straight 9,861 → 8,173; straight and
  town lose their tunnels to cuts). Scenario starters all VALID: d3 3,484, d3-0301 5,139, d3-0302 5,066, d3-0303
  5,440, d3-0304 8,524, d3-0305 9,124, d3-full 32,391, d35 4,755, d35-full 27,332, Nová Paka 2,063 M.
  Outcome audit (24 random D11 lines): 6 VALID (main 4), 86 violations (102), links > 1 km 21 (25), ramps >
  250 m 5 (2).
- **Bridge or fill** (`scripts/bridge-break-even.ts`, S 9.5 on a flat valley floor, material valued at
  λ = 200 CZK/m³; old model in brackets): a 120 m bridge on firm ground is cheaper than a fill above 32.2 m (17.2);
  a 30 m bridge over a stream above 14.0 m (14.1); a 120 m one over a stream from 24.1 m (16.2), where the culvert
  under the fill would pass 100 m and the fill can no longer be built (a limit, not a price). At λ = 0 the firm
  ground heights are 54–65 m (≈ 20), at λ = 536 ≈ 20 m (≈ 15). Steeper, benchless fills and no reserve make
  fills cheaper; over a stream the culvert keeps the price close.
- **Crossings after the new grade line** (no validity regression against main): an infeasible crossing others
  are led to lets those look again first (D3 km 5.43: road 1732 joins 1813's overbridge); a merged crossing
  keeps every hit of its ways (the same way weaving back too) and the split retry skips a way's own crossing
  within the merge distance; a rebuilt road may cross the streams the old one crossed (billed as culverts);
  the stream retry also spans blocked roads beside a bridge end; at the end of evaluation, roads still buried
  on a grade-separated route get the separation retry (bridge over / cut under).
- **Embankments that never meet the hillside** (the final-sweep P1 rule: a bridge): with VL 1 slopes a fill
  meets ground falling up to ≈ 38 % across (the 1:2.5 toe band cannot catch steeper ground); main's slopes
  missed it from 30 % for fills of 20 m and more. The rule stands.
- Evaluate time: bend rule texts made only when read, terrain class in one sliding window, culvert sizes
  cached by cover, a wall's slope surface from one walk down the slope. Interleaved against main (16 rounds,
  loaded host): CPU +5 %, sum of minima +12 %, almost all town-centre (+60 ms: a tunnel became a long cut with
  walls, two more support lifts, a stream retry) and demo (+13 ms: one more overbridge and reconnection planned);
  best / direct-80 / direct-90 within noise.
- **Residuals.** Edit locality, Královec railway "pin −9 m at km 2.7" (an EXPECTED exception in
  scripts/edit-locality.ts, bounded at 3.5 m): the grade changes 2.76 m at km 12.7. The line climbs at its limit
  over km 2.25–8.5, so the pin lowers it ≈ 11 m up to km 10.5 (physics). The support lifts the old line needed at
  km 9.83–10.15 go with it; the boundary at km 11.21 saw them in its 5 km window (with them 514.6 m there, without
  507.6 m; the unpinned line's first pass, before its lifts, also has 507.6), and the block beyond it follows.
  No tie-break helps: the window's inputs really differ, 0.6–1.1 km before the boundary.
  Whole D3 dragged at km 30: the 30 m span at km 16.66 stays 0.1 m short (the changed stretch, end of a 4 %
  climb; tests/merged-crossings notes it).

### Bug-fix sweep: the player's crossing choices, reroutes and homes, undo, the top bars (cost model 32, 2026-11-17)

Four findings of the architecture review, then a play of the D3 and D11 missions (research/60, screenshots 240–246,
`node scripts/bugfix-sweep-shots.mjs`).
- **The player's "Straighten it".** It failed on the D3 motorway's four most skewed ways, twice with "clashes
  with our bridge or tunnel". The player's underpass now lets the way be lowered (as Auto and resolveCrossings
  do) and keeps our road on earth over its box where one fits; a straightening that cannot be built leaves the
  way on its own line with "The … cannot be straightened here" (why, and "Keep its line" on the card) and
  nothing else changes; a box too low on the new line raises our grade by what it lacks (a retry); a way
  crossing us again under our bridge passes there. The straightened line's new pieces are profiled like a
  reroute (earthworks up to 10 m) instead of lying on the ground. `scripts/straighten-audit.ts` (gate): 27
  skewed crossings of four designs, 9 done, 18 said, none with another new problem.
- **A player's choice that cannot be built** (e.g. "Its bridge over us" over our 12 m embankment) no longer
  makes the stream / strict / narrowing / separation retries put our road on a bridge over the way: its
  problems say what cannot be built.
- **Reroutes and houses.** D3 km 3.63 buys three sheds, truthfully drawn and billed; the card said "houses".
  It now says "3 buildings", "a house" only for a home. A reroute takes a home only where nothing else can be
  built (expropriation as the last resort, zákon 184/2006 Sb. § 3): D3 class I road km 0.65 goes round a house
  (11.0 → 25.3 M), the whole D3 straight keeps 4 of 6 homes (+121 M).
- **Undo.** An undo while a step is open (a burst of + steps, the radius slider) takes back that step only;
  Ctrl+Z during a held drag takes the drag back and the rest of the gesture changes nothing.
- **Top bars.** Measured (ui/toolbar-fit.ts): where Undo / Redo / Scenarios and the view buttons would overlap,
  the key hints go, then the view buttons move under Undo / Redo. Disabled Undo / Redo are no longer
  see-through. `scripts/toolbar-layout.mjs` (gate) at 1280–1920 px.
- **Bills** (model 31 → 32): D11 frozen: direct-90 4,687 → 4,676 (km 8.26 straightened), town-centre 8,879 →
  8,869 (km 10.05 straightened), the rest unchanged; D3 class I road 3,484 → 3,504; whole D3 straight +121 M.
- **Seen while playing, then fixed (cost model 33, research/61):** a player's underpass / bridge choice no longer
  forces the grade solve (no fixed point; D3 km 2.67's +41 M gone); where Auto's line leaves a crossing too little
  room — the player's box or bridge, or a reroute through homes where a box would do — the line is lifted locally
  solved again with that height (else lifted locally), only while it costs no more than the crossing's own
  treatment (otherwise the problem says how much to raise our road: D3 km 1.76 +1.45 bn → 12.7 M and said);
  D11 direct-80 km 6.83 is now a box, its three homes kept (4,183 → 4,157 M); a player's unbuildable crossing owns
  its way's stretch (no phantom relocation); "Cut and reroute" no longer pins a road Auto moves beside ours (D3 km
  15.29: +3.1 bn → said). `scripts/choice-audit.ts` (gate).
- **Still open:** the player's "Cut and reroute" at D3 km 5.26 removes the crossing a class II road is led
  to (Auto bridges both, a clash, +577 M). ("Our bridge over it" in our cutting and the garage under a bridge:
  cost model 35, "Bridge styles".)

### Tunnels as they are built: cut-and-cover portals, method, escape provision (cost model 34, 2026-11-17)

Plan and sources: docs/design-realism-plan.md M2, research/49 (portals), /51 (methods). Model 31 ended Auto's
tunnels wherever a tunnel stopped being cheaper per metre than the cut, in open cuts 12–110 m deep (d35's
starter: 60 m, its stage-1 motorway 95 m, random D11 lines 45–60 m).
- **Portals.** Mining starts where the ground is 14 m above the grade (≈ 6 m of cover, unchanged); from there a
  tunnel goes on as cut and cover (built in a pit that is filled in again) out to where the ground is a
  structure height (9 m) above the grade, at least 12 m per portal (two stations). The approach cut ends ≈ 9 m
  deep, at a portal box in the slope (what research/49 found at D11 Poříčí / Opevňení, Radejčín, Mezno).
  Cut and cover is billed at SPK A.3.H (+7.5 %; urban PROVISIONAL: the urban bored row × the same premium),
  railways at their SPOŽES row (no method split); its pit beyond 5 m of cover is excavation + backfill (OTSKP
  17411) under Earthworks. Buildings over the pit are demolished (as over a cut); its land is returned (not
  bought; the temporary occupation is not priced).
- **Auto sees the ends.** The structure choice prices a tunnel run as built (bored, cut and cover, tubes) against
  the earthworks over the same stretch, so a tunnel not worth its ends is an open cut (tests/tunnels.test.ts).
  The grade search has a tunnel mode (autoprofile.ts): where its station-by-station line would take a tunnel, it
  searches again with a second layer of states, a stretch deeper than a portal being all tunnel or all open,
  entered and left at shallow knots. Where the line takes no tunnel (every D11 design), nothing changes.
- **Streams** keep a tunnel a structure height below their bed (was 14 m): cut and cover puts the channel back.
  (Without it the Křálovec railway left two streams in a shallow cut between two tunnels.)
- **Method on the tunnel card**: Mined (Auto) / Cut and cover (the player's, painted over the tunnel, any part of it; at
  most 13 m of ground over it, the Radejčín card's maximum, deeper: "Too deep to dig from above"; buildings over
  its pit are demolished as over a cut). The card says how it is built ("Mined 1,039 m
  · cut and cover 70 m at its ends · with an escape tunnel beside it"). A tunnel the player paints may start in
  a cut up to 30 m deep (the deepest Czech portal pits, PROVISIONAL); deeper is a violation that says where Auto's
  portal would be.
- **Escape provision** (NV 264/2009, tunnels over 500 m): one two-lane tube gets an escape tunnel (× 1.3, Hessen
  Mobil 121–135 %) above 2,000 veh/day/lane, two tubes above 10,000; motorways have two tubes already, a
  motorway direction's tube has the other's beside it, railways follow their own price book.
- **Minimum tunnel** 150 → 100 m (TKP-D 7): the outcome audit and every scenario pack unchanged by it.
- **Bills** (model 33 → 34): every D11 design unchanged (no tunnels). Scenario starters, all VALID: d3-0304
  8,524 → 10,152 (a 680 m twin tunnel instead of 240 m between 21–29 m cuts), d35 4,755 → 6,729 (1.1 km
  instead of 740 m between 58–68 m cuts), d35-full 27,332 → 29,969, d35 stage-1 motorway 17,123 → 19,497 M CZK;
  the others unchanged. Křálovec railway (QA fixture) 8.87 → 9.45 bn VALID (one 3.9 km tunnel where three
  tunnels alternated with 25–53 m cuts). Outcome audit (24 random D11 lines): 6 VALID (6), 86 violations (86),
  links > 1 km 20 (21), ramps > 250 m 5 (5); the lines with tunnels cost 11–28 % more (random-12: 9.51 → 12.13 bn,
  its 960 m tunnel between 55 m cuts is 1.36 km with 8 m approach cuts; random-8 9.45 → 11.27 bn, 6 → 3 problems).
- **A cutting whose slope never reaches the top of the hillside** is a tunnel where deep enough (as such an
  embankment is a bridge): station by station a short tunnel used to cover it; a whole-run tunnel may not pay.
- **Known limits.** The grade search prices the tube per metre; a long one's escape provision is weighed by
  the structure choice only. Portals stand on the 10 m station grid. Pre-portal works (nailed faces, micropile
  umbrellas) are not billed (research/49 §3; small beside a 9 m portal). No TBM (no Czech road case, no SPK row).
  The drag at km 4.4 of the Křálovec railway moves the cut before the tunnel of km 1.98–4.5 (that tunnel's far end
  is in the dragged stretch): tests/rail-drag-locality checks the grade to km 1.75.

### Bridge styles: short spans, long spans, an arch (cost model 35, 2026-11-17)

Plan and sources: docs/design-realism-plan.md M3, research/50 (styles, Czech bridges), /62 (buildings under a
bridge), /63 (real sections). Code: `data/bridges.ts` BRIDGE_STYLES, `bridge.ts` (longLayouts, longPerM, archRib,
equalSpanRunCost), `support-layout.ts` (a plan per style), `overrides.ts` (`style`, `auto`).
- **Three styles, one per bridge.** *Short spans*: ≈ 30 m, one span to 60 m over a road, railway or water (II/268
  Jizera 6 × 30 + 60 + 2 × 30 m on falsework). *Long spans*: equal spans of 45–60 m (Czech tall viaducts 45–58 m), or,
  where something below needs a longer span (to 180 m), that span with side spans at least 0.56 × it beside it
  (Czech cantilevers 0.56–0.71) and short or 45–60 m spans beyond; priced by the model's own span curve, a span over
  60 m on a deck ≥ 40 m high at most 1.2 × the 30 m-span price (PROVISIONAL: Czech long-span valley bridges ≈ 0.8–1.0
  × SPK with its height attribute; no launched or cantilevered box outturn). *Arch*: one arch of 100–250 m, the
  bridge 1.8–2.8 × as long, its rise 1/10–1/5 of the span, its rib clear of the ground and of what lies below,
  springings on free ground; priced as a 30 m-span viaduct as high as the bridge's highest point (Opárno 0.99, Plasy
  0.82 × SPK with height: PROVISIONAL, two bridges). Cable-stayed later.
- **Auto takes the cheapest that fits** (no lift first). The grade search and the structure choice see the cheaper
  of short and long equal spans (long spans with one pier per span, so a tall viaduct is not made cheap by the
  120 m reference's few piers: with the reference density direct-90 went +508 M); support-layout places each
  style's supports, checks spans and clearances and keeps the cheapest; the card shows each style's price against
  this one ("Short spans +19 M · Long spans · Arch +51 M"; a style that does not fit is greyed).
- **The player's style** is only that choice (`StructureOverride.auto`): the bridge stays Auto's (its ends, the grade
  search). Painting a bridge as it stands re-solves the grade around it (D11 direct-90's viaduct: +462 M; d35's
  tunnel painted as it stands: 6,610 → 5,743 M and invalid) — so the tunnel's method on Auto's tunnel is now
  such a choice too; "Too deep to dig from above" is said for it as for the player's own tunnel. A style that does
  not fit is said ("This bridge cannot be built with an arch") and the bridge is built as Auto would.
- **Drawn**: long spans as few tall piers and a deck span/20 deep; an arch as its rib from the springings up under
  the deck, columns on it (screenshots 226–230).
- **Buildings under a deck** (research/62, relayed D3 km 0.5 garage): a house under a deck whose underside is ≥ 15 m
  above it (falsework from the ground is used to 10–15 m, Suchánek) and 3 m over its roof (PROVISIONAL) stays
  unless a pier stands on it (Nuselský most, D1 Vysočina); garages and sheds go (fire, FHWA). The D3 garage stands
  under a 4.5 m deck: still demolished, the card says why.
- **"Our bridge over it"** (relayed, D3 km 8.59 +1.26 bn, valid): no span avoids the lift there (our motorway is 3.4 m
  in cut, the track at the ground). The choice no longer floors the grade search nor lifts our line in the first
  pass; it is met through the same regrade retry as the player's box (research/61) and kept — our road going up over
  the road is what was chosen — with its price on the crossing card ("For it our motorway is built up to 15.4 m
  higher: 1.21 bn CZK more in all", screenshot 231). The player's box keeps the rule of proportion; where it is not
  met, its problem now says what meeting it would cost.
- **Bills** (model 34 → 35; grade lines of the frozen D11 fixtures unchanged, bridges only): straight 8,173 → 8,225
  (+52: spans over 60 m get side spans), best family unchanged, demo 4,234.5 → 4,233.6, direct-80 4,157 → 4,142 (the
  50 m viaduct on 52 m spans), direct-90 4,676 → 4,674, town-centre 8,869 → 8,968 (+99: its 80–120 m spans over
  streets and the railway get side spans). Scenario starters, all VALID: d3 3,504 → 3,364 (the 109 m high bridge at
  km 4.38 on long spans; the grade search re-solves around it), d3-0301 5,139 → 5,102, d3-0302 5,066 → 4,935 (the
  113 m high bridge on 62 m spans), d3-0303 5,440, d3-0304 10,152 → 10,174, d3-0305 9,124, d3-full 32,391 →
  32,187, d35 6,729 → 6,610 (the 60 m high 2 km viaduct on 49 m spans), d35-full 29,969 → 29,825, i16-nova-paka
  2,063; d35 stage-1 motorway 19,497 → 19,390; D3 motorway starter 10,930 → 10,738. Outcome audit (24 random D11
  lines): 6 VALID (6), 84 violations (82), links > 1 km 17 (18), ramps > 250 m 5 (5); the two new: random-3 a 0.1 m
  support lift at km 13.43 Auto cannot make (its lift runs into the pin at km 16.70 with the railway's 13.6 m), and
  random-15's track at the tunnel portal km 5.45 buried again (M2's known case; its split retry no longer triggers).
- **Real projects** (research/63): our D35 stage-1 motorway 1,175 M/km against the real 1,066 (+10 %), D3 0304 659
  against 787 (−16 %). On a line deep enough for the real D35's 4 km tunnel (680 m of bridges) our bill is +21 %
  (23.4 bn): the long tunnel's per-metre price is the suspect (≈ 1.0 M CZK per tube-m implied against SPK's 1.55 M),
  recorded, not changed.
- **Known limits.** The structure choice weighs the buildings under the whole deck strip (cached per evaluation),
  the bill only those that go. Side spans are a minimum, not designed, and an end span next to an abutment is what is
  left there (taken as anchored at the abutment; town-like layouts can leave 30 m beside a 90 m span); a
  cantilever's haunch is drawn as a constant depth; the arch's rib depth (2 m) is drawn and checked, not priced. Long spans over obstacles stay within 180 m
  (the engine's limit, inside CTU's 80–250 m). Evaluate: work.support +5 ms on town-centre (5 passes × the styles'
  plans), the structure choice now memoises run prices (cheaper than before); a drag preview weighs an arch only
  where asked and long spans only where they may pay (docs/evaluate-performance.md).

### A long tunnel's price per metre; the Nová Paka starter (cost model 36, 2026-11-17)

- **Length factor on the mined tube row** (research/64): SPK has no length step beyond 500 m; Hessen Mobil's
  specific-cost curve (2006, Abb. 3-2) and the BASt/Bochum civil-cost model (2019) agree on −4 % at 1 km and −7 % at
  2 km against 500 m. f(L) = 0.913 + 43.7 / L on the > 500 m mined row, held at ≥ 0.92 (no data beyond 2 km;
  ventilation and control-centre steps from 3 km); not on cut and cover nor the railway's own rows. The structure
  choice now weighs the bill's tube rows for the run's length (it took the ≤ 500 m row for every tunnel).
  Escalated with the ČSÚ tunnel index, no Czech long tunnel is clearly cheaper per tube-m than SPK (Panenská's
  "≲ 1.0 M" in research/51 / 63 was 2003–06 money).
- **The real D35 choice** (research/63): Auto 19,390 → 18,911 M (1,146 M/km, +7.5 % on the real section); the
  real-like line with its 4 km tunnel 23,398 → 22,204 M, still 17 % dearer than Auto's: the length factor is
  ≈ a fifth of the gap the section estimate implies. Left as hints: the 29.4 % other-objects surcharge on a tunnel
  row that already holds portals and equipment, a rock-cover factor, and the comparison's own split.
- **Bills** (model 35 → 36): D11 frozen fixtures bit-identical (no tunnels). d3-0304 10,174 → 10,118, d35 6,610 →
  6,481, d35-full 29,825 → 29,362, d35 stage-1 motorway 19,390 → 18,911; others unchanged; outcome audit: same
  validity and problems (6 VALID, 84), the lines with tunnels 0.1–2 % cheaper (random-10 −223 M).
- **Nová Paka starter** (decision 6): along the mapped bypass, its nine curves as bends at their mapped tangent
  points and radii (R 360–1,475 m), bends 0 and 6 moved 4 / 6 m off side roads: VALID 1,221 M, 7.39 km, 165 M/km
  (was a four-bend chord, 2,063 M over 6.6 km, demolishing 480 M of buildings). The real branch ≈ 1.5–1.7 bn
  (research/46 §4): ours is lower because the ground model already holds the real bypass's cuts (its earthworks
  come cheap; the photo note says so) and Auto fills the Štikov ravine 14 m high where the real road has a 423 m
  bridge (1,020 m of bridges in all; ours 190 m). **Known:** small drags along it fail more often than on the old
  chord (24 seeded drags of 25 m, `scripts/small-drag-audit.ts`: invalid 16 / 15 / 9 at km 1.5 / 3.3 / 5.0, the
  old starter 8 / 10 / 0): the real line threads between class III roads and streets it rebuilt, which our
  earthworks then cover (each with its concrete fix); the crossing engine's rebuilding of such roads is the lever.

### Side roads under our earthworks, lifts on grades; the Štikov valley; tunnel rows (cost model 37, 2026-11-17)

Research: research/65.
- **Small drags of the Nová Paka starter** (24 seeded drags of ≤ 25 m, `scripts/small-drag-audit.ts`, `DUMP=dir`
  writes the dragged designs). Invalid 16 / 15 / 9 → **11 / 15 / 7** at km 1.5 / 3.3 / 5.0. Left besides geometry:
  a dead-end street whose junction's mouth lies at our slope's toe (3 drags: its 2 m past the junction stays under
  the slope, so it is not cut back; re-joining its side road where a rebuilt street crosses it is the next step) and
  a stream's head 1 m under our toe (5 drags, all also failing on geometry). The rest is
  geometry: the starter's hand-set mapped radii leave 2.7 / 2.3 / 0.9 m spare at bends 4→5, 5→6 and 9→B (the real
  road is at the norm's limit), so a drag that turns them more breaks the S-bend rule, with a concrete fix. Options
  (owner's call, research/65 §1): leave it as the player's override; a "mapped radius" Auto lowers just enough;
  or the editor lowering a set radius a drag makes too large.
- **An overbridge whose ramps would bury a road beside it** (or whose joining road cannot be regraded) counts as
  stuck. **The separation retry** (the grade asked to clear the road: our cutting 6 m below it or our bridge above)
  **now runs for every category**, not only motorways. An ordinary road's junctions are 1.5 km apart, so it
  crosses the roads between them as a motorway does. Nová Paka km 1.84: a support lift a kilometre away raised our
  line 5 m out of the cutting the class III road crosses over; now it stays in a 6 m cutting.
- **A dead end our earthworks cut**, with no room for a turning area before the first road it joins, **is cut back
  to that junction** (its traffic turns there). Before, the turning area went past the junction and severed the
  third road (only where the whole stretch under our earthworks goes with it). A dead end whose pavement (not only
  its centreline) reaches into our slope counts as one. The separation retry starts from the options of the result
  kept so far (a regrade retry's floors and lifts stay; review).
- **Support lifts on grades**: a lift target moved onto the traced line's point (blocks, model 25) is raised by
  what the line falls from there to the station that needs the height. On a 5 % descent the station 4.8 m off
  missed it by 0.25 m in every round (outcome-audit random-3: VALID now).
- **A split-off way** (a way merged into another crossing of the same way, which our earthworks still bury) is
  judged together with the separation retry, which lets the grade clear it (random-15: the track at the tunnel
  portal resolved, the 540 m tunnel replaced by a 12 m cutting with the track over it, 6,701 → 5,137 M).
- **Bills** (model 36 → 37): D11 frozen fixtures (the lifts) straight 8,224.7 (same), best 3,616.7 → 3,618.5,
  best-pin 3,612.4 → 3,614.2, best-structures 3,724.0 → 3,729.6, direct-80 4,142.4 → 4,144.7, direct-90 4,673.7 →
  4,676.4, town-centre 8,968.3 → 8,972.7, demo / best-drag unchanged. Outcome audit (24 random D11 designs): 84 →
  72 problems, 6 → 8 VALID (random-3, random-23), links > 1 km 17 → 18 and ramps > 250 m 5 → 4 (random-6, VALID,
  on a re-solved line). Starters all VALID: d3-0303 5,440 → 5,442, d3-0305 9,124 → 9,126, d3-full 32,187 → 32,180,
  the rest unchanged (i16-nova-paka 1,221).
- **The Štikov valley** (research/65 §3). No public document gives the reason for the real 423 m estakáda. The 2017
  EIA notification rules out a stream, a flood zone, a road below, landslides, NATURA 2000 and CHKO. A local
  biocorridor (LBK 3) and a binding migration study came after the bridge was designed. The real grade runs ≈ 28 m
  over the valley floor; Auto's runs 14 m over it. With our grade pinned at the real height, Auto bridges the valley
  itself (180 m, 25 m high, +55 M). So the difference is the grade line, not a missing rule.
- **The D35 tunnel gap** (research/65 §4):
  - SPK's method does put the B surcharge on tunnel rows (PZ II.g–h; only rest areas are exempt). No change.
  - Rock cover: SPK prices TT4 throughout. A derived factor of × 0.92 for more than 20 m of cover, 1.0 at 15–20 m
    and 1.12 below 15 m comes from OTSKP 2026's excavation items by class and the D11 Poříčí class-by-cover
    rule (confidence medium-low).
  - That factor is recorded as a proposal and not implemented. It would remove ≈ 0.8–1.0 bn of the 3.3 bn D35
    gap.

### A drag lowers a set radius to fit; side roads re-joined (cost model 38, 2026-11-17)

- **The editor fits hand-set radii during a bend drag** (owner's decision (c), research/65 §1): where the drag
  leaves a set radius too large for the room between its bends, that radius is lowered just enough, live — the
  dragged bend first, then the nearer neighbour, else both in proportion; to the editing step; never below the
  rules' minimum (then the problem and its fix stay) — and goes back up as room returns within the drag. The bend
  card says "Your radius, lowered from 400 m to 340 m to fit between its neighbours." (`core/fit-radii.ts`,
  `ui/radius-notes.ts`; ≈ 0.7 ms a move on Nová Paka; Auto radii take the fast path). `small-drag-audit.ts` drags as
  the editor does (`--raw`: without).
- **A side road re-joined**: a rebuilt stretch beside our earthworks that crosses a side road within 25 m of the
  side road's old junction joins it there (game limit; the stub between goes where no other road joins it), instead
  of failing as "it would cut off a side road".
- **Nová Paka 24 drags: invalid 11 / 15 / 7 → 6 / 0 / 0** (radii lowered by at most 8 / 80 and 45 / 5 m). The 6
  left at bend 3: a stream's head 1 m under our toe (4) and the residential street at km 1.5 where its rebuilt line
  would cross another road on a ramp or misses its east junction (2).
- **Rock-cover factor for tunnels: left proposed.** The owner's bar (≥ 2 independent price points or a published
  class-by-cover cost table) is not met: OTSKP 2026 is one price book (excavation items by class), the whole-price
  factor is a derivation with assumed support quantities, and Hessen's cost-by-cover chart is relative to a deep
  VKL 3–4 reference, not SPK's TT4, and its spread (deep / 10–20 m ≈ 0.74) disagrees with the Czech derivation
  (≈ 0.82).

### Playtest sweep 3: a line over ours billed once, a railway across ours, mapped curves (cost model 39, 2026-11-17)

- **A road carried over ours is let off what our road bills for that bridge, no more** (QA3 P1 #2). The held road
  draws and prices its whole body, the owner's deck and ramps included, and the owner bills the deck and ramps as
  its crossing. It used to be let off everything it built within the ramps' reach: on D11 km 12.5 (`tests/fixtures/
  qa3/d11-new-road-across-km12.5.json`) −238 M against our 37 M overbridge, its own 185 M viaduct over a dip beside
  the ramps billed by neither road. Now the credit is exactly what the owner bills for that crossing (deck and ramps
  with their surcharge; not the side roads it regrades, its walls or the houses it takes, which the owner draws):
  −48 M, "Our road pays for its bridge over our road and the ramps up to it". Invariant (`tests/qa3-sweep.test.ts`
  `billedOnce`): the roads' bills sum to their own bodies and works less exactly what owners bill for the others'.
- **A railway of the project across ours** (QA3 P1 #5, `rail-new-railway-across.json`). Our railway used to clear it
  as a mapped railway at ground level (it cannot move): it dug itself 15 m down there, +265 M, while the new railway
  was held at a deck at ground level it could not reach ("lower this railway by 7.7 m"). A railway of the project
  now follows our crossing's height as a road of the project does: our line stays as it is, the new one goes over
  it where our line is on earth, held at the deck; the crossing bills that deck only (it climbs on its own line,
  which it draws and bills; `heldRailway` in crossing-geometry.ts); a held railway's deck is a bridge. A held line
  that stays high above the deck set for it (a 12.5 ‰ line, a road on its own embankment) passes over on that bridge
  built higher, held at least clear of the owner (as one high above the owner's bridge already was). Our railway
  +38 M (the deck), the new one valid. A new motorway is still cleared as a mapped one: its corridor kernel does not
  take holds yet.
- **A mapped road's own curve** (QA3 P1 #6). Converting a mapped road into bends keeps a sharp old corner's own
  radius (it lies on the old road, which is kept as it is there); it is now marked as the old road's (`PI.mapped`),
  not the player's: while its curve lies wholly on the old road it stands ("The old road's own curve, kept as it
  is."), where a drag builds it anew it is Auto's, as a new road's (`project-kept.ts plannedKept`, road and railway;
  a set radius clears the mark). D11 III/3012 at km 2.3, its R 104 m corner dragged 23 m: no longer "too sharp for
  70 km/h". Every bend problem whose fix is a radius back to Auto has a *Back to Auto* button (`ViolationTarget.auto`).
- **P2**: Undo / Redo say what they take back ("Undo: moving bend 3", "Redo: a bridge or tunnel (Road III/3012)"),
  worked out from the designs either side of the step when the button is pointed at (`core/history-label.ts`); the
  profile's tooltip says "River under our bridge, and 1 more".
- **A road that ends nowhere is priced, not valid** (owner's decision, 2026-11-17): a road or railway the player
  builds with an end on open ground was left unpriced; it is now priced as built (nothing is built at the free
  end) with one "Road ends nowhere · Connect this end to a road" problem at each free end (a click goes there);
  "not priced" stays for engine limits (interchanges, roads designed together). Reaching the screen of several
  roads exposed three of its false alarms, fixed: a railway's land is its formation's (it was unknown and failed
  closed everywhere), a way left as it is under our bridge or over our tunnel is neither our works nor a change of
  that way, and one road on its bridge ≥ 6 m above the other's works there shares no land with it. Two lines that
  both change one old road (QA's railway across ours and the track at km 12.05, the D11 new road and road I/14,
  the final sweep's new road over the railway viaduct) stayed unpriced: an engine limit. Cost model 40: two changes
  of one old road conflict only where they reach each other along it (each change's ramps, box or cut piece; a
  reroute's junction, `ENDPOINT_JUNCTIONS['tie-in'].zone`); further apart each road rebuilds its own piece. Those
  projects are priced now (D11 new road 8.55 bn, QA's railway 9.68 bn, the final sweep's road 11.70 / railway
  18.57 bn, all NOT VALID by their free ends only). Where changes do overlap it stays unpriced: the newer edit
  taking the old road over there (as the player's road does from an automatic reroute) is the next step.
- **One drag of a mapped road** (playtest of these fixes): grabbing III/3012 80 m further on and dragging 40 px took
  its old corner along, which, built anew, merged with the next bend into one curve too sharp. The bend the
  converting drag moves is fitted on release like one it places, and the fit also moves a bend off a too-sharp
  merge (core/bend-fit.ts). Left: that drag still crosses a track at km 0.1 with no place to reconnect it.
- **Review fixes**: a held line is held at least the owner's clearance over it (7.5 m over a railway; the crossing
  engine's deck sat 6 m up); a railway's drag preview follows the crossings others built with it; a rebuilt
  stretch's plan line in other roads' networks yields its old corners to Auto as its kernel does; a held road's own
  bridge puts no pier on the deck band it rides over the owner (support-layout.ts, it used to ignore the owner: a
  pier on our centreline), and the screen keeps a bridge's piers as ground works under a deck it exempts.
- **Bills**: frozen single-road fixtures identical; multi-road projects change (credits, railway crossings, free
  ends priced): model 39.
- Screenshots `docs/screenshots/310…314-qa3fix-*.png`: the new road's card (−48 M), the new railway on its bridge
  over ours, III/3012's old corner built anew (R 176 m, auto), the profile's river tooltip, *Back to Auto*.
- **Known issue (audit)**: a box lowered under our road for a road of the project (our road too low over it) bills
  the lowered approach ramps on our road while the held road stays at the ground through the box: its hold should be
  the box floor, but where the held road ends within the ramps (D11 km 4.03 service road) it cannot reach it, and the
  owner, evaluated first, cannot see that. Left as it was (no QA repro of a priced case).

### A retry builds only the crossings near what it changed (no model version, 2026-11-17)

- **What.** An evaluation finishes its design several times (the stream and strict retries of a pass, then the
  separation, narrowing, regrade and split passes: 10 finishes on the whole D3), and each finish built every
  crossing of the route. Now a later finish compares what the crossing build reads of our road (grade, kind,
  widths, urban, demolished houses, each crossing's resolved treatment) with the earlier finishes', builds again
  the crossings within 2 km in plan (`linkHardReach`) of a changed station (and shaped reroutes, and kept
  crossings whose works lie beside the change) with those 2 km further out and their carriers and followers as
  context, and takes the others as built before (`src/core/crossings-kept.ts`). The whole route is built when
  the engine's rollback fired, when over 90 % would be built anyway, when a context crossing in reach of a
  rebuilt one came out other than kept, or when a kept crossing is led to a rebuilt one that changed. Grade
  line, engineering, quantities, buildings and the footprint screen stay whole-route.
- **Bills** (still model 38): none moved. 177 / 177 whole results of `scripts/exact.ts` identical to main's;
  outcome audit output identical (32 bills, 77 flags); 2,083 local builds checked against a whole-route build on
  the same inputs (the exact cases, 100 more random D11 designs, the outcome audit, edit-locality, choice and
  straighten audits, bench, the ten scenario checks): no crossing differs. No version (owner's decision: no bill or
  validity change, no bump). It is measured, not proven, that a crossing 2 km from every change cannot come out
  differently: the report below stays a gate.
- **Time**: whole D3 ≈ 2.35 → 1.98 s (−14 … −18 %, interleaved minima), direct-80 −2 … −7 % (near the noise),
  designs without a retry unchanged. Numbers, the reach study, the seams and what is left (footprint screen):
  docs/evaluate-performance.md. The engineering passes since replay what did not change (bit-exact memos of the
  retaining screen: whole D3 ≈ 2.0 → 1.68 s, D11 designs −4 … −10 %; same document, top section).
- **Gate**: `npx tsx scripts/local-retry-report.ts` (reference / local / both in each finish on the 177 cases;
  exit 1 on any difference); any script under `--import ./scripts/dev/local-retry-check.ts` checks its own
  evaluations. `LOCAL_RETRY.local = false` is the reference.

### Playtest sweep 3: slowed stretches, deep cuts, cones at bridge ends, arches, hairpins (cost model 41, 2026-11-17)

Findings: docs/playtest-findings.md "Sweep 3 — main 30d0ad8". Research: research/66 (design speed), /67 (deep cuts,
rock slopes), /68 (cones at bridge ends), /69 (P2s). Shots 290–301 (`scripts/qa3-fixes-shots.mjs`).
- **A slowed stretch never makes Auto's road dearer.** The grade search is monotone in its own objective (D11, one
  bend at 70: every block cheaper by its estimate, 4,398 → 4,171 M), but it prices no crossed roads: at 70 it took a
  line 10 m higher at km 9, where a field track 17 m under the fill forced a bridge that joined the stream bridge
  (800 m, +284 M on the bill). Now a slowed bend keeps the road speed's curve where it fits (`plan-speeds.ts`;
  "Tightest" is the player's), and the grade search rounds a slowed stretch's heights as for the road's speed, its
  own smaller curves weighed in one more pass before the retries (the first pass ranks within 0.5 M of the full
  bill; a preview missed by ±25 M). D11 one bend 90 / 80 / 70: 8,782 / 8,783 / 8,782 M (was 9,067 at 70); best
  design, 36 single-bend slow-downs: none dearer (was 14), savings to −44 M. Time: one more pass (D11 one bend at 70
  0.45 s, 0.27 s at 90); drags within budget in all six modes on a slowed design, settle 472 ms (unslowed 464).
  (With the deep-cut rule and the cones below, that design bills 9,641 M at 90, 80 and 70 alike; at 70 it is too slow
  for the mission's time.)
  (A first version evaluated every faster geometry in full: 2–9 evaluations, 1.2 s, replaced.) The bend card says
  which km its stretch covers ("Its stretch is the whole road" with one bend) and what Auto kept.
- **No bend faster than its road.** ČSN 73 6101:2018 lowers a stretch's design speed; a railway's line speed is its
  mission's: the railway mission's bend card offers 120 · 100 · 80 · 60, "no faster than the whole line, 120 km/h".
  A saved faster bend is evaluated at the road's speed. Recorded, not fixed: the Královec bend 3 at 160 billed
  312 M less than at 120 (the same estimate gap; catching it would double every evaluation).
- **Arches** (research/69): rise 1/10–1/3.5 of the span (Bridge Engineering Handbook ch. 17: "most" 1:4.5–1:6,
  Cowlitz River 159 / 45 m), a bridge up to 3.3 × its arch (D3 Sázava 787 / 237 m); the rib's clearance over what
  lies below is part of the search; an arch is Auto's only where it needs no lift (a first-pass arch with a smaller
  lift steered the support lifts: random-2 / random-8 +257 / +569 M). The D11 direct-80 valley takes an arch
  (+106 M); a greyed Arch says why (`Run.archMiss`; the 0302 Sázava bridge, now 1,678 m: too long for one arch).
- **Hairpins and the tunnel card**: a bend turning back on itself offers "Make it a hairpin" (one step, its stretch
  at the lowest speed) where one may stand; the tunnel card says "Auto’s tunnel, built by cut and cover as you
  chose." and offers no noise walls.
- **No cut deeper than 30 m; rock by its kind; presplit** (research/67). Auto builds no road or motorway cut
  deeper than 30 m: a tunnel (sourced game rule: the D3 EIA "zářezy … 20-30 m, zde jsou však navrženy tunely",
  Hessen Mobil's ≈ 30 m economic limit, the deepest Czech motorway cut 38 m; `STRUCTURE_RULES.deepCut`). The player
  may paint a deeper cut; the tunnel card says why and its Earthwork button carries the open cut's price. A cut just
  past 30 m over a ridge narrower than the grade search's samples is lifted, not tunnelled. Steep rock faces are
  presplit (OTSKP 12892, TKP 4 art. 52) as well as netted; fast-weathering rock (Permian claystone, marlstone) is cut
  like soil (VL 2 301.04 note 2), interbeds and phyllite at 5:4, Cretaceous sandstone at 2:1 (Brandecker), the rest
  4:1. D3 0302: no 62 m cut; its line rides higher, at most 27 m in cut at Luka, and crosses the Sázava on one
  1,678 m bridge (4,935 → 7,045 M; the real section 10.54 bn has the Luka tunnel and a lower 787 m bridge: the town's
  covering demand, which the game does not price).
- **Bridge ends in fills stand on cones** (research/68, `core/abutment-cone.ts`): the fill runs on under the end span
  1:1.5 with quarter cones (VL 4 206.02 / 206.03), paved under the deck with a toe sill; billed (fill in the mass
  balance, paving and sill with the bridge), weighed in a run's price, no pier on a cone, the bridge longer where a
  cone would reach past a 60 m end span, a fill between two bridges that costs more than bridging the gap bridged;
  drawn (the abutment wall only down to the cone's top) and clickable (the bridge's card: "Its ends stand on fills 7
  and 20 m high, sloping on under the bridge: 22,392 m³ of fill, 3.9 M CZK of paving").
- **After review** (cones and rock faces): a cone's fill is summed out to where it meets the ground, also down a
  cross slope on its low side (it had stopped at the axis's toe: up to 9 m of unbilled, undrawn edge), and drawn as
  far; two cones under a short bridge count their union once (each where its surface is the higher; no toe sill
  between them); a cone never covers a road, railway or stream under the bridge, on its axis or under the quarter
  cones at its flanks: on a fill of at most 10 m that end is a closed abutment, a wall down to the ground and no cone
  (SETRA: full-height abutments "pour une hauteur limitée à une dizaine de mètres", research/68 §1.4, UNVERIFIED),
  above it Auto's bridge goes on to where its cone's axis is clear (only for what the footprint screen may not move
  aside; else, beside its flanks, and on the player's bridge, a wall: a longer bridge had needed spans no style
  reaches, random-21); the bridge card says "One end is a
  wall down to the ground, so the fill does not cover what lies below." (D11 best km 6.99, shot 301). A closed
  abutment is not priced apart from the bridge (as every abutment before model 41). Piers stay off the cones of
  bridges whose ends the support layout moved; cones follow sliced, stitched and windowed results; the two motorway
  directions' overlapping cones are counted once; a cone's fill is weighed at its block's fill value. Rock faces of
  exactly 2:1 (Cretaceous sandstone) are dug, not presplit or netted, as decided in research/67 (d35-full −177 M).
  Not done: the cones' fill in the structure choice's earth balance (`selectAt`; the bill counts it in the mass
  haul): counting it pins a block that cannot balance at the top fill value, which then prices all of its fill and
  bridges far more than pays (D11 one bend at 90: a 270 m bridge at km 9.2 became 730 m, +306 M); the balance
  search's own limit, to be fixed with it.
- **Bills** (model 38 → 41; models 39 and 40, the projects' sweeps, left single-road bills as they were). Frozen D11 fixtures, validity unchanged (all VALID but best-manual and town-controls,
  whose player's choices leave problems, as before): straight 8,224.7 → 8,847.9, best 3,618.5 → 3,694.6, best-drag
  3,601.1 → 3,681.2, best-pin 3,614.2 → 3,713.2, best-structures 3,729.6 → 3,782.9, best-manual 3,622.2 → 3,689.7, demo
  4,233.6 → 4,248.3, direct-80 4,144.7 → 4,232.2, direct-90 4,676.4 → 5,421.8, town-centre 8,972.7 → 9,384.9,
  town-controls 8,983.8 → 9,393.7 (shares per mechanism: research/67's table, before the reviews' fixes; those moved
  them −35 … +47 M: best's bridge at km 11.30 runs on 20 m past a stream its 21 m fill's cone would cover, its ends at
  km 6.99 and 14.64 are walls). Starters, all VALID: d3 3,364 → 3,927, d3-0301 5,102 → 5,154, d3-0302 4,935 → 7,045,
  d3-0303 5,442 → 5,599, d3-0304 10,118 → 10,133, d3-0305 9,126 → 9,559 (a wall at the km 2.73 bridge's end lets short
  spans replace long ones), d35 6,481 → 6,561, i16-nova-paka 1,221 → 1,223, d3-full 32,180 → 37,865, d35-full 29,362 →
  32,380 (its 2:1 sandstone faces not presplit: −177 M). Outcome audit (24 random D11 lines): 14 → 13 VALID, 72 → 79 problems (random-22's service road at km 11.74
  under our embankment and random-19's street appear with either the slopes or the cones; random-18's stream bank at
  km 14.99 under our slope where a bridge stood; random-13 / 15 / 17 tunnel cuts of 56–67 m, +1.3–2.3 bn each).
- **Where the bills come from** (mechanisms switched on one by one, M CZK): straight +623 = 30 m rule +417 (no tunnel:
  the grade search lifts the line off a 42 m cut at km 4.5–5.0 and a 39 m one at km 10.0–10.5, fills of 23–28 m and
  bridges at km 4.0–5.5, +382 M of bridges) + presplit +119 + cones +93 + bridge ends +29 − rock by kind 35;
  direct-90 +745 = presplit +440 (its own price on the old line ≈ +50; the grade search then takes a line 391 M dearer
  than holding the old one: a miss of the search, not fixed here) + 30 m rule +220 (a 37 m cut at km 10.5–11.0 lifted to
  29 m, fills and bought fill at km 9.5–11.5) + cones +130 − rock 54 + bridge ends 9; town-centre +412 = cones +250 +
  presplit +208 (its own price) − 30 m rule 25 − rock 16 − bridge ends 5; d35-full +3.0 bn = 30 m rule +2.54 bn (a 460 m
  tunnel at km 19.07–19.53 for a 54 m cut in Cretaceous sandstone / marl, lines lifted at km 19.5–20.5) + cones +289 +
  bridge ends +122 + rock +44 + presplit +21; d3-full +5.7 bn = 30 m rule +4.24 bn (an 800 m tunnel at km 9.67–10.47 for
  a 45 m cut, where the real D3 has the Luka tunnel) + cones +1.03 bn + presplit +408. No 31–35 m cut becomes a tunnel
  anywhere checked (fixtures, starters, 24 random lines): the grade search treats a cut past 29 m as a tunnel and lifts
  the line where that is cheaper, and the tunnels it keeps are for cuts of 42–220 m.
- **Owner's review**: a stream's bank brushing our slope beside the culvert that carries the same stream under us is
  held by that culvert's headwall and wing walls (random-18's km 14.99); a way whose end meets a road Auto's junction
  rebuilds, inside what it rebuilds, is rejoined to it there (its last ≤ 30 m under our works, PROVISIONAL; random-22's
  service road at km 11.74): 14 VALID of 24 again, as on model 38. Two roads of a project whose earthworks come
  within the working strip (10 m): the later keeps clear of the other's works behind a retaining wall, again until
  settled (at most 3 times): the QA's new railway across the Královec line is priced (11.15 bn). The wing walls of an
  abutment on a cone follow the cone's surface down to the ground (a straight edge to the embankment's toe left a
  sky-coloured sliver beside the cone). Left: random-12 / random-19 (already invalid) bury a track / street that
  cannot be moved aside on the 30 m rule's new line (steep ground, a side road it would cut off).

### Bridge ends: one rule (cost model 42, 2026-11-17)

Owner's review of the Královec railway (shots /tmp/owner-shots, the QA's repro `qa3/bridge-ends.ts`): some ends stood on
cones, others were closed by vertical walls up to 28 m (km 5.61: 24.9 m, km 5.70: 16.1 m, km 10.27: 28.4 m; an 80 m fill
between km 5.61 and 5.70 boxed in by walls at both ends), unbilled. The end-closing check counted any way under the
cone's flanks, field tracks included, and never looked at `CONE.closedMax`; the search that lengthens Auto's bridge
looked at the cone's axis only and spared minor ways; and a memo shared one key between the screen of every road and
that of the strict ways (an empty strict set), so a check could read the other's answer.

- **One rule** (`support-layout.ts` `coneBuries`, both for Auto's ends and the final check): what the cone would cover
  that nothing moves aside, on the ground it covers (`abutment-cone.ts` `coneGround`: rows of 4 m from the abutment,
  each out to where the cone's surface meets the ground on either side, a cross slope included; the same ground the
  footprint screen sees and the bill's cone fills). A minor way the footprint screen may move aside is not counted: the
  cone's ground is screened as an abutment's (`footprint.ts`), so the way is moved aside by the existing remedy; if that
  fails it is a strict way on the retry and counts (not the stream retry's bridging, which is for what lies under the
  earthworks). A covered end is a closed abutment only on a fill of at most 10 m, read at the abutment itself
  (`bridgeEnd`); above it Auto's bridge goes on to an end that is clear or low enough for a wall (also where the
  abutment itself is blocked: it had stopped at the first free abutment, its cone over the road); where none is within
  reach, and on the player's bridge, the cone stands and what it covers is a footprint problem ("A bridge end stands
  on …").
- **The wall is billed** as what is drawn (the concrete end cap across the fill's end section): `closedEndWall`, a
  cantilever retaining wall at its height across the crest and falling with the side slopes, `retainingAssembly`
  prices (OTSKP, research/18; shape PROVISIONAL, research/68 §4.5); with the bridge (a 10 m wall on a 9.5 m crest
  ≈ 4.2 M CZK). The bridge card: "One end is a wall 7 m high down to the ground, so the fill does not cover what lies
  below: 2.0 M CZK." Drag previews keep the closed ends and walls of bridges outside the edited stretch.
- **A fill between two bridges closed off by a wall** is bridged where its deck costs less than the fill, its walls,
  its cones and the two abutments one bridge saves (`structures.ts` `wallGapsToBridge`, after the support layout, Auto's
  gaps only and none Auto ruled out for its piers; undone if the joined bridge's piers find no place). None tips on the
  packs (decks 1.15–3.4 × the fill); the Královec fills at km 5.61–5.70 and 10.17–10.24 became parts of one bridge each
  because their walls would be over 10 m.
- **Results.** Every bridge end of every pack's straight start, saved designs and presets (1,216 ends): a cone or a
  wall of at most 10 m, and each result's bridges line equals its decks, abutments, regrading, cones' paving and walls
  exactly (`scripts/bridge-ends-audit.ts`, a full gate; `tests/bridge-ends.test.ts` for D11 and Nová Paka; the town
  test takes the bill apart the same way). Before: 254 closed ends, 127 of them on fills over 10 m (up to 28 m), none
  billed; now 236, all ≤ 10 m (the cone's whole ground screened finds more under it than the two rectangles did).
  Validity unchanged everywhere. Frozen D11 (M CZK): straight 8,847.9 → 8,770.3 (walls over 10 m gone, ends moved:
  bridges −128, bought fill −44, crossings +32, excavation +26), best 3,694.6 → 3,721.6 (+25 bridges), best-drag
  3,681.2 → 3,671.3, best-pin 3,713.2 → 3,739.0, best-structures 3,782.9 → 3,807.7, best-manual 3,689.7 → 3,716.8,
  demo 4,248.3 → 4,251.7, direct-80 4,232.2 → 4,281.3, direct-90 5,421.8 → 5,437.9, town-centre 9,384.9 → 9,331.6
  and town-controls 9,393.7 → 9,340.4 (the viaduct at km 3.84–5.05 starts 20 m earlier, its piers stand elsewhere: nine
  houses its piers had stood on stay under the deck, −221 buildings, +230 noise buyouts). Starters (route bills, bn): Královec railway 10.595 → 10.694, d3-full 37.865 →
  38.077, d3-0301 5.154 → 5.163, d3-0302 7.045 → 7.051, d3-0303 5.599 → 5.634, d3-0304 10.133 → 10.195, d3-0305
  9.559 → 9.583, d3 3.927 → 3.973, d3 motorway 14.465 → 14.636, d35-full 32.380 → 32.738, d35 motorway 19.093 →
  19.246, d35 road 6.561 → 6.590, Nová Paka 1.223 (unchanged). Shots 390–393 (`scripts/abutment-ends-shots.mjs`).
- **Open:** the wall's shape is a study allowance (no Czech height rule for closed abutments was found, research/68
  §1.4); the structure choice still weighs a cone at every end (a closed end's wall is known only after the support
  layout); houses under a cone are bought out since cost model 49 ("Portals, cones over houses, side roads of a rebuilt road").

### Protected nature areas; tunnels at most 3 % (cost model 45, 2026-11-17)

Research: research/73 (why the real D35 has a 4 km tunnel), /75 (data and the Act). Code: `pipeline/fetch_protected.py`,
`build_protected.py` (a pack's `protected.json`), `data/protected.ts`, `protected-areas.ts`, `nature-works.ts`,
`ui/nature-notes.ts`, `render/nature.ts`. Shots 340–345.
- **Every pack carries its protected areas** (AOPK open data, CC BY 4.0): small reserves and monuments (NPR, PR, NPP,
  PP) and their protection zones, Natura 2000 sites (EVL) and bird areas (PO), national park zones and protected
  landscape area zones. Drawn as borders on the map (no works: a soft green band with a solid edge; protection zone:
  dashed; works allowed: dotted), legend "protected nature".
- **What the Act forbids** (Act 114/1992, research/75): no works of ours in a reserve or monument (§§29, 34–36), a
  Natura 2000 site (§45c, §§45h–i), a national park outside its villages (§16(2)), zones I–II of a protected landscape
  area (§26(2)–(3)), or anywhere in one for a motorway (§26(1)(f)). Works are earthworks, bridge supports and ends,
  tunnel entrances and a dug tunnel's pit, rebuilt roads and reroutes; a deck over an area and a mined tunnel under it
  take nothing. Such works are a problem with basis **law** (new tag) and a computed fix. A protection zone (§37) or a
  bird area only adds a note on the stretch card ("…need the nature authority's consent"), no problem, no cost
  (owner's decision).
- **Auto keeps out like a designer** (evaluate.ts): where an area lies under our crown the grade search must pass a
  bridge's height over it (only if the area is narrower along the road than the longest span, 180 m) or 14 m under it,
  mined. These are hard clearances (a penalty no structure outweighs); the search does not take the narrow corridor or
  the normal band where they are missed. Beside it, within a dug tunnel end's reach (≈ 30 m), the line is asked to be
  at most a portal's depth in its cut or mined (an ordinary clearance penalty: a wall may do instead). Piers and bridge ends stand clear of areas (support-layout.ts); a wall keeps
  our slope out of one beside us, else a bridge or tunnel (retaining.ts); rebuilt roads and reroutes go round.
- **Tunnels at most 3 %** (NV 264/2009 annex 2.2 for tunnels over 500 m, Hessen Mobil 2006 for any; research/73 §3): in
  the grade search's tunnel mode a line in a tunnel steeper than 3 % pays 1 M CZK per metre for each 0.1 % over
  (PROVISIONAL weight; no price exists), and none wholly in a tunnel is steeper than 5 %. The card of a tunnel over
  500 m says when it is steeper than 3 % ("needs extra safety measures after a risk study"); the player's tunnel over
  500 m steeper than 5 % is a problem (basis law); Auto's only where its search found no other way (the Act's own
  exception), said on its card. The search tries the wide band and the fine grid near a
  tunnel line (its coarse grade steps miss 3 % by a step).
- **A stream under an embankment a bridge's height above it**, with no bridge near, gets a short bridge of its own
  (the D11 starter's tunnel, now 3 %, left a stream at its toe under 13 m of fill).
- **The real D35** (research/73): Auto's stage-1 motorway now builds a 3,209 m tunnel under Pod skálou at ≤ 3 %, out of
  the protected forest, and 880 m of bridges (real: 3,983 m, ≈ 700 m): 20,084 M. The real-portal line bills 21,319 M
  (+6 %).
- **Bills** (model 44 → 45; numbers against model 43): D11 frozen fixtures and the Královec railway unchanged; D11 starter (QA tests) 9,005 →
  9,131 M; d35 stage-1 19,203 → 20,084, d35 road 6,590 → 9,468 (a 3.1 km tunnel and its escape tunnel where its line
  ended in the monument), d35-full 32,738 → 34,414, D3 motorway 14,446 → 15,248 (the Sázava viaduct's piers out of the
  Natura 2000 river), D3 road 3,973 → 3,947, d3-0302 7,051 → 7,032, d3-0304 10,195 → 10,173, d3-full 38,077 → 36,530 (its
  800 m tunnel at km 9.7 was 3.8 % steep; without it the line stays higher on a longer bridge, 1.5 bn cheaper by our
  prices), the rest unchanged. Outcome audit (24 random D11 lines, against model 41): VALID and problem counts
  unchanged, flags 76 → 74, lines with tunnels −1.1 … +0.6 bn.
- **Known limits.** A protection zone is a note only; ventilation shafts, groundwater protection zones and the Act's
  exemptions are not modelled; a national park's villages are the land cover's built-up areas; an area near our road
  but outside the crown holds no grade limit (a wall or a structure keeps the slope out; a cut 9–14 m deep within
  about 30 m of an area is avoided as a possible tunnel end). The tunnel penalty is a weight, not a price. The Auto
  tunnels of steep roads can still exceed 5 % where the structure choice turns a deep cut into a tunnel on a steep
  grade (QA new road across Královec: 6.1 %; said on the card, not a problem).

### Natura 2000 a note; tunnels within the law's 5 % (cost model 47, 2026-11-18)

Research: research/75 "Natura 2000 sites: a note", research/76 (no price for a steep tunnel's safety measures),
research/73 §7 (D35 again). Shots 410–414.
- **A Natura 2000 site (EVL) takes works, with a note.** Act 114/1992 §§45h–i ask for a Natura assessment. A project
  with a significant impact may still go ahead for an overriding public interest, with compensation, and real motorways
  cross such sites (the real D3 bridges the Sázava over EVL Dolní Sázava). Our works there get a note on the stretch
  card ("…need a Natura assessment"), as in a bird area: no problem and no cost, since neither the assessment nor the
  compensation has a source. Reserves, monuments, national parks outside villages and CHKO zones I–II stay no-works
  areas. The QA's new lines across Královec (through EVL Krkonoše) are tested with the pack's areas again.
- **No 3 % preference in tunnels.** The search weight (1 M CZK per metre per 0.1 % over 3 %) was made up and is gone.
  No source prices the extra safety measures NV 264/2009 asks for above 3 %: Hessen Mobil 2006 §3.2.1 says they "können
  die Kosten … deutlich erhöhen", with no figure (research/76). The note on the card of a tunnel over 500 m steeper than
  3 % stays.
- **No tunnel over 500 m steeper than 5 %, to its ends** (NV 264/2009 annex 2.2). Auto's search already took no line
  steeper than 5 % between two knots wholly in a tunnel. A line could still steepen to 5.9 % in the intervals holding a
  portal (the D35 road starter's 1.9 km tunnel). Where the tunnel mode's line has a tunnel over 500 m (deeper than a
  portal at the cost samples) steeper anywhere, the search now runs again with the limit on every interval with any
  of its line in a tunnel. Where the normal band still holds such a line, the wide band's line is taken if it has none.
  Shorter tunnels keep the road's own limit: the Act covers tunnels over 500 m. The model-45 extra passes for the 3 %
  weight are gone.
  - **The structure choice keeps to it too** (cost model 48). In an Auto tunnel over 500 m, a station where the grade
    steepens past 5 % stays an open cut wherever the cut is no deeper than Auto digs (30 m). Such a station is usually
    at an end on a vertical curve the search's straight knots do not see. The portal moves in to where the tunnel is
    within 5 %. Deeper than 30 m it stays a tunnel, the Act's own exception where nothing else can be built; its card
    says so.
    - The QA's new road across the Královec railway had a 760 m tunnel at 6.6 %. It now has 690 m at 4.8 %, its west end
      an open cut (tests/new-line-crossings.test.ts, tests/tunnels.test.ts).
    - Every saved design and starter is unchanged; two D11 random previews differ (exact.ts).
    - Outcome audit (against model 47): validity unchanged, flags 63 → 62. random-15 −731 M, random-16 −64,
      random-18 −65: their steep tunnel ends are open cuts now.
- **A boundary corridor's shared solve is keyed by its boundary.** Two boundaries whose 5 km corridors cover the same
  stretch (a short route, long knots) were handed the first one's heights. No saved design or starter changed
  (exact.ts); tests/regressions.test.ts.
- **A boundary's corridor held by its band.** The 5 km corridor that fixes a block boundary's heights searches only
  15 m round the ground. Where its heights at the boundary lie at that band's edge, the wide band's line is taken if it
  is cheaper. On d3-full the corridor pinned km 11.67 16 m low, which put an 800 m tunnel in at km 9.67 (+1.66 bn
  against holding the bridge line). Only d3-full changed (exact.ts).
- **Faster where a protected area lies under the road** (bit-exact, exact.ts): a coarse pass whose height range and
  grade steps cannot meet the area's clearance is solved only if it is needed as the fallback.
  - Interleaved medians, model 44 (no areas) / model 45 / this change: d35 stage-1 111 / 332 / 289 ms, d35 road
    141 / 243 / 282 ms, d35-full 615 / 1,042 / 835 ms.
  - The rest of the gap to model 44 comes from the harder line, not from the tunnel passes. A 3 km mined tunnel under a
    no-works area takes the wide band in its windows, a DP retry for lifts, a strict retry and two more engineering
    passes. Without the protected areas (`PROTECTED=0`), this change times as model 44 (115 / 112–119 ms on stage 1).
  - The D35 road is slower than model 45: its long tunnel is solved again under the strict limit.
- **D35 against the real layout** (research/73 §7):
  - Auto builds a 2,919 m tunnel at km 4.15–7.07, at most 3.8 % steep, out of the protected forest: 19,617 M.
  - The real-portal line (3,948 m at 1.9 %) bills 20,679 M (+5.4 %; +3.7 % with the 3 % weight).
  - The real designers' gentle grade is unpriced here: the 3–5 % safety measures and road users' grade costs are not
    modelled.
- **Bills** (model 46 → 47, `evaluate()` of the starters): D11 frozen fixtures and the Královec railway unchanged.
  - D35: stage-1 19,938 → 19,617 M; road 9,430 → 6,659 (a 2.0 km tunnel at 4.7 % instead of 3.2 km at 3.0 %); d35-full
    34,151 → 33,944.
  - D3: motorway 15,198 → 14,396 (the Sázava viaduct's piers in the Natura 2000 river again); road 3,882 → 3,904 (a
    near-tie: a 50 m bridge at km 1.40 goes); d3-0302 6,776 → 6,770; d3-0304 10,073 → 10,089; d3-full 36,241 → 36,144.
  - The rest unchanged, all VALID.
  - Outcome audit (the straight line, 5 saved designs and 24 random D11 lines, against model 46): VALID 14 → 15 of 30
    (random 8 → 9 of 24; random-9: a span too low at km 6.30 gone),
    flags 63 → 63, 11 lines −431 … +386 M. random-13 now takes a 500 m tunnel at km 4.52 that the 3 % weight kept off:
    +393 M against holding its old line. Most of that is bought fill (+230 M route-wide): the earth balance of the
    whole route that the search's blocks do not see, the near-tie the weight hid.
- **Not fixed: direct-90's grade-search miss** (AGENTS.md open items). The suspected cause, rock faces priced on flat
  ground in the search, is not it: the search's flat-section rock face is within 4 % of the billed one on both lines.
  - The 422 M (model 45) between Auto's line and holding the pre-presplit line comes from the support lifts after the
    search (`finishLift`).
  - The structures then need heights the search never saw: a road under the bridge at km 5.26 (+10 m), km 6.84
    (+5.4 m), a wall at km 7.07. `liftAutoProfile` meets them with a smooth bump that ignores cost, raising km 5.3–8.2
    by 10–14 m: +0.7 bn on the old line, +1.09 bn on the new one. Before the lifts the two lines are a near-tie by the
    search's prices (2,725.1 / 2,725.0 M).
  - Two fixes were tried, neither merged:
    - DP first, bumps only where it fails: direct-90 −733 M, town-centre −255, but straight +47, best +24, D3
      motorway +390, direct-90 +51 % evaluate time.
    - The DP retry kept stretch by stretch where the search prices it lower: direct-90 −761, town-centre −255, straight
      +30, best +6. One edit-locality failure, +20–25 % evaluate time on designs with many lifts.
  - The DP's per-station price misses whole-bridge costs and crossings, so it cannot judge lifted lines.
  - Third try, judged by the whole bill (2026-11-18, not merged; patch kept outside the repo). After the first pass's
    lifts, each block of the solve that holds a height the DP line needed was searched again between its ends on that
    line, with those heights as floors and at the block's material value. The result was engineered and lifted as a pass
    of its own, and kept where its whole bill (noise included) was lower.
    - Bills: direct-90 5,321.6 → 4,773.1 M, town-centre 9,241.8 → 9,219.5, the other D11 fixtures unchanged.
    - best-structures became invalid at +0.5 M: the comparison weighs only the total.
    - It failed on time: D11 fixtures +45 % (direct-80 +60 %, straight +79 %). Every design with lifts runs a second
      engineering pass, crossings and noise.
    - It failed edit-locality (4 cases: straight pin −9 m at km 3.6, direct-90 pin −5 m at km 5.2, d3-full two
      edits). A far edit changes which pass wins.
    - Open: a cheaper judge than a second whole pass (e.g. the regrade inside the lift loop, priced by the engineering
      pass's own quantities), local by construction.

### Portals, cones over houses, side roads of a rebuilt road (cost model 49, 2026-11-18)

Sweep-3 P2s (docs/playtest-findings.md), shots 450–453 (`scripts/render-cones-shots.mjs`, before | after).
- **Lines above the D3 0304 portal** (km 1.59, seen from the hill). They were the portal boxes' side walls. The boxes
  were centred on the portal face, so half of each lay 1–2 m under the hill. Seen almost edge-on from above, the
  earthworks' depth offset pulled them through the ground. Now the boxes stand in front of the face, out in the
  approach cut. They are a mesh of their own without that offset (`tunnel-portals`) and closed on top. Display only.
- **A rebuilt road's side roads.** A way that joined the old stretch and is crossed by the new line at its level now
  joins the new road there in a junction. A track or service road gets an access (`sideJunctionCost`, 0.5 M; it is an
  existing access, so no spacing applies). Before, it was cut and led to a crossing with nowhere to go.
  - III/3012 dragged 23 m east of its corner (qa3/designs/d11-iii3012-dragged-23m.json) had "covers 16 m of a track"
    and "No place to reconnect the track". It is now VALID, 10.4 M (`EvalOptions.sideWays`,
    project-road.ts; tests/qa3-sweep.test.ts).
  - The side road's piece beyond the new road, which led only to the old road, is taken up (`CrossingResult.oldJunction`).
    On that side the junction's approach ends at our road: it is not regraded or billed. The piece is the crossing's
    `removed` and leaves the map with the rebuilt stretch (the project's accepted replacements). For III/3012 this is
    the track's 10 m to the old corner. Only the crossing nearest the old junction keeps the access.
- **Houses under a cone.** The building screen now reads the billed cone. A house is taken where the cone's surface lies
  over the ground, or within the 3 m working strip round it. This also holds under a deck high enough for a house to
  stay, because the fill buries it. Such a house is bought out and drawn demolished; its card says "Under the fill in
  front of our bridge's end".
  - The one rule decides the end. Houses can be moved aside at a price, so they do not count as covered.
  - On a fill of at most 10 m, the end is closed by its wall where the wall costs less than the houses its cone would
    take. Houses the low deck takes anyway are not counted.
  - A house the player keeps counts as what nothing moves aside. The end is then closed by a wall, or Auto's bridge goes
    on. On D11 straight, keeping the km 4.07 house makes the bridge 240 m longer (+116 M); it stays VALID.
  - Before this, D11's designs had 11 houses standing under cones. `scripts/bridge-ends-audit.ts` now flags any house
    left standing under a cone. Across 1,220 ends it finds none, with 262 closed ends (was 236).
- **Turning areas and roads moved aside** buy out the houses they stand on, drawn demolished; a house the player keeps
  there is a problem. This covers a closed public road's turning disks and a footprint relocation's new pieces off its
  old line, with its turning area.
  - Unbilled before: the demo design's service road at km 6.93 was moved aside through a 550 m² farm building (17.3 M).
    Also two sheds on direct-80 and a 262 m² house on the Nová Paka starter (km 2.60).
  - `scripts/works-clash-audit.ts` now screens both, and tests/works-clash.test.ts runs it on the demo design.
- **Královec km 12.98, the road bridge's ramps by the houses (shot 424).** The clearance is truthful. Against the drawn
  ramp bodies, slopes included and the deck excluded, no house is touched.
  - The nearest are 0.2–0.3 m from a slope's toe (a 1.2 m side-road regrade, a 3.8 m ramp fill). Others are 0.9–1.5 m
    from the retaining walls, which stand at `RETAINING_RULES.clearance` from them.
  - Since cost model 53 other ways' works keep the same strip: those three houses are bought out (PLAN.md "Other ways'
    works keep the working strip; a lifted kept road on its old line").
- **Bills.** D11 frozen (M CZK):
  - straight −0.2: a house under the km 4.07 cone +17.8, three walls instead of cones, and a track rerouted instead of
    carried over now that the house it skirted is gone (−14.5);
  - demo +17.3; direct-80 +19.0; direct-90 +1.4; town-centre / town-controls +0.7; best* unchanged.
  - Starters: Nová Paka 1,185.7 → 1,194.0, D3 motorway +1.2, others unchanged. Validity unchanged everywhere.
- **Open:**
  - Above 10 m, a house under a cone is bought out. Lengthening the bridge instead is not weighed.
  - The structure choice still does not see cones' houses.

### A rebuilt stretch kept on its old road; a side road's stub (cost model 50, 2026-11-18)

P2 re-check findings (docs/playtest-findings.md "P2 fixes re-check — main 5331cc1"), shots 490–491
(`scripts/render-kept-corner-shots.mjs`, before | after).
- **A kept stretch is the old road to other roads (P1 #2).** Where a rebuilt stretch's line stays within KEPT_TOLERANCE
  of its old road, the old road is kept, drawn there and not billed (project-kept.ts). The other roads' networks still
  drew the kernel's line, up to 12 m off it. D11 III/3012's corner dragged 22 m (all of it kept, 0 CZK) moved our
  crossing onto a line neither drawn nor built: our bridge km 2.185–2.424 shrank to 2.205–2.365, −143 M.
  - The network line is now the stretch as drawn (`planLine(…, asDrawn)`, `lineAsDrawn`, the same snap as
    `layOnGround`): our bridge is back to 2.185–2.424, 8,787.0 M, as without the rebuilt road (tests/qa3-sweep.test.ts).
  - Every rebuilt stretch now gets its old line in the project (`oldLineOf`), not only those keeping an old curve.
  - The bend's curve grips sit on the drawn road where it is kept (ui/curve-edit.ts). Its marker stays at the bend's
    corner point, as on any bend.
  - Since cost model 53 where a crossing lifts or lowers the kept road (`releaseHeld`), that piece is rebuilt on the old
    road's line, which the owner crossed (PLAN.md "Other ways' works keep the working strip; a lifted kept road on its old
    line").
- **A side road's stub to the old road (P2).** The track joining III/3012 dragged 23 m keeps its access. Its piece
  towards the old junction is taken up (`oldJunction`). That side ran on from our road's centre across our cut slope
  to the edge of our earthworks: a 4 m stub at our grade between two small retaining walls (the white shards). It now
  ends at our carriageway's edge (crossing-geometry.ts). Display only: the access is a lump sum.
- **Bills.** Frozen fixtures unchanged (none has a rebuilt stretch). A project's bill changes where a rebuilt stretch
  is kept within 12 m of its old road and crossed by another road.

### Other ways' works keep the working strip; a lifted kept road on its old line (cost model 53, 2026-11-18)

The two "Open:" items of the sections above, shots 510–513 (`scripts/render-works-strip-shots.mjs`, before | after).
- **The working strip round other ways' works.** Our road's earthworks keep a 3 m working strip from houses
  (BUILDING_RULES.clearance). The works we build for other ways had none. Now every one keeps it:
  - a crossed road's regrade, its ramps or junction approach, a side road regraded to meet them (crossing-works.ts): a
    house within the slopes or the strip beyond their toe is held off by a wall standing the strip's width from it, or
    bought out where no wall fits there (no wall squeezed in closer, as for our road, retaining.ts); a house the player
    keeps is a problem (Auto takes another treatment). A side without earthworks (the old road's edge on the ground) adds
    no strip: the house beside it was there before;
  - a reroute's new road, its slopes, the turning area at a closed road's end and a road moved aside (its new pieces and
    turning areas): what stands within the strip is bought out with it; a kept house blocks a reroute's line. Each piece
    is screened as a capsule (round at its ends), so a bend's outer corner counts.
  - The width: no Czech norm or law gives one (research/85: road land ends at the toe or cut edge, Act 13/1997 §11; a
    temporary take is set per project, 4–6 m in local works' documents). 3 m stays PROVISIONAL, one value for all works.
  - `scripts/works-clash-audit.ts` screens with the strip (a side has works where its slope reaches out or its edge is
    off the ground, a wall included; a new road's pieces round at their ends): on the starters and saved designs main's
    code has 44 houses within it, now none. Left: the 12 known `ours` toes.
  - A reroute's earthworks keep off our bridge's piers (a new obstacle of `linkObstacle`): direct-80's street at km 6.55
    had been rerouted on a 7 m fill over a pier at km 6.60 once its bridge over us bought houses; it is carried over us.
  - A reroute led to a crossing whose works take a home anyway takes no home more (`ownHomes`: Auto's last resort, and
    the grade retry for reroutes through homes, which now counts each home once). A random D11 line had its street at km
    5.87 led through a 3,176 m² factory (300 M) rather than to the junction whose approach buys those two homes anyway.
  - Card: "Under the earth slopes of the road raised or lowered to cross ours at km …, or within 3 m of them."
- **A lifted kept road on its old line.** Where another road's crossing lifts or lowers a stretch kept on its old road
  (`releaseHeld`), the piece rebuilt for it was built on the kernel's line, up to 12 m off the old road our road
  crossed. Now the kernel builds that stretch on its line as drawn (`heldOnOldLine`, `EvalOptions.line`: its stations,
  traced line, samples and cone ends follow it; its kept cells too, so nothing jumps where a rebuilt piece meets a kept
  one), and the old height `releaseHeld` reads is the drawn line's. III/3012's corner kept, "Its bridge over us" chosen:
  5.74 m → 0.00 m from our crossing point; that road 135.3 → 137.9 M (tests/qa3-sweep.test.ts). A stretch nothing lifts
  is built as before.
- **Bills.** D11 frozen (M CZK): straight +11.3, demo +53.9, direct-80 +46.8, direct-90 +13.7 (each explained at
  COST_MODEL_VERSION 53); best*, town-centre, town-controls unchanged. Validity unchanged everywhere. Starters: D11
  8,787.0 → 8,798.2; Královec railway 10,690.3 → 10,742.0 (km 12.98: three houses 53 M, the ramp's walls 109 → 82 m);
  D3 full 36,143.5 → 36,185.2; D3 road 3,904.2 → 3,914.2; D3 0302 −0.2; D3 0304 10,089.0 → 10,115.5; D11 retired
  railway −2.3 (not valid either way); the rest unchanged.
- **A reroute through homes weighed against our road over it.** D3 0304 km 9.14: the tertiary road's bridge over us cannot
  get back down to it (its ramp, as on main; no house in its way), and no box under us carries a tertiary road. On main
  the stuck bridge sent the separation retry, which put our road over it. With the strip the 2.8 km reroute became
  buildable (main's said "steep": the house-priced line search now finds another one), through 3 homes and 6 other
  buildings (261 M), and only stuck crossings ask that retry. A reroute through homes already asked the grade retry for a
  box under us (model 33, raised only in proportion: kept where the whole bill rises by no more than the reroute's
  price); where the road gets no box, that retry now weighs our road over it on its bridge instead. D3 0304: +94 M on
  the whole bill for 261 M of reroute, so our bridge km 9.09–9.18 over the road again, nothing bought out there
  (10,115.5 M; main 10,089.0). The whole D3 km 33.04, the same village, which main had rerouted through 8 houses
  (259 M): our bridge too. Frozen bills unchanged.
- **Open:**
  - A crossing's own works that buy out a home (a junction approach, a bridge's ramps) do not ask that retry; only
    reroutes through homes, Auto's last resort, do.
  - The strip's width is not differentiated by the size of the works (a track's regrade and a motorway's embankment
    keep the same 3 m); no source tells them apart (research/85).

### Mapped bridges and tunnels are crossings (owner report, cost model 55, 2026-11-18)

Owner, D11 along the official line, grade by hand: a local road crosses ours at km 6.40, no crossing can be selected, its
card says "Bridges and tunnels of existing roads cannot be changed yet", and it is drawn flat across our cut, nothing
built or billed. Cause: `build_pack.py road_network` leaves every way tagged bridge / tunnel / covered out of the crossing
network ("crossing them at ground level is free"). That local road (OSM 1500239979, `highway=unclassified`, `bridge=yes`,
`layer=1`, 60 m) is the real overbridge over the planned D11; the net had the road either side of it and a 60 m gap, so
our road crossed nothing there. Across the packs 1,700 such ways (bridges over streams, railways and roads mostly).
- **Data.** `pipeline/build_structures.py` writes each pack's `structures.json` from its own transport graph (the road
  sources without a net way: bridge, tunnel, covered), in the net's format (simplified 1 m, metres, so they meet the
  ways either side). Additive like protected.json: `overlays.json` and its object-data identity are untouched; the game
  adds them as ways after the net's (`RoadNetData.structures`, `RoadNet.structure(way)`), so saved choices keep their
  ways; designed roads are numbered after them (`registerNet` takes the whole count). An older pack without the file
  plays as before.
- **Level.** OSM gives no height: a bridge's deck (a tunnel's road) runs straight between the ground at its two ends,
  where it meets the road either side (`mapped-structures.ts`; the DMR 5G under a bridge is the valley floor or the
  cutting it spans). Its crossing's `h` is measured from it (card: "our road 11 m below its bridge today"), and the
  crossing geometry reads the crossed road at that level along it (`structureLevels`; the same function, bit for bit,
  where no mapped structure is crossed).
- **Kept or engineered.** A bridge our road passes under with the depth a new bridge over us needs (`underDepth`, 6 m)
  whose ends reach the edges of our earthworks (bank-top abutments, as Auto's own) is kept: "Existing bridge kept",
  nothing billed, its deck drawn at its level end to end (no ramps). A tunnel 6 m or more under our road (`overHeight`,
  as our bridge over a road) likewise ("Existing tunnel kept"; type `underpass`, `kept`). Otherwise it is a crossing like
  any other (bridge over us rebuilt higher on ramps, box, reroute, closure, our bridge over it) and billed; the card adds
  "Its old bridge here is too low or too short for our road and is replaced." A player's "Its bridge over us" on a bridge
  that already clears us is the bridge kept.
- **Elsewhere.** A mapped bridge 4.8 m (`OVERBRIDGE_CLEARANCE`, deck depth unknown) or more above our road, or a tunnel
  6 m under it, is not buried by our earthworks (footprint.ts), e.g. road 101's bridge right at the whole D3's start; a
  road moved aside passes under or over one (road-realignment.ts). Roads run on over their bridges: closures (way-pieces),
  reroute targets and a crossed road's path see them connected.
- **Selecting.** The crossing is a crossing: its marker and its drawn works select its card before the mapped road's (a
  click on the kept deck selects it, screenshot 543). The mapped road's own card away from the crossing still says a
  bridge cannot be rebuilt yet (road-edit.ts), which no longer hides anything.
- **Audit** `scripts/mapped-structures-audit.ts` (every pack: straight, starter, a line along the official one, N random):
  each mapped bridge or tunnel our line meets must be a crossing (or a footprint item), a kept one billed 0 and drawn, none
  left at grade. With 8 random designs per pack: 11 hits in all, no flags. D11 along the official line: km 6.30 the
  local road's bridge, Auto's grade 3.5 m under its deck: rebuilt on ramps (15.6 M); the grade by hand 11 m under it:
  kept (`tests/fixtures/d11-official-line*-design.json`, tests/mapped-structures.test.ts). Nová Paka starter along the
  real bypass: the street's 51 m bridge at km 3.24 kept, two local roads' bridges at km 0.89 / 1.57 replaced (Auto's line
  2–3 m under their decks; a new bridge replaces the whole old one: 38 and 28 m). Shots 540–545
  (`scripts/mapped-bridge-shots.mjs`).
- **Review fixes.** Our bridge clears a mapped bridge or tunnel under it at its level (support lifts, grade retries, a
  motorway's must-clear, minor crossroads); one high over our bridge passes over it (kept). A kept tunnel needs its portals
  beyond our works and the road on its own line; it is not drawn (underground). The crossing geometry keeps the natural
  ground and reads the crossed road's level separately (`CrossingRoute.wayLevel`, one function for the whole network, so
  no pass sees another's levels); a mapped bridge under our bridge is drawn on the ground as the map draws it. Retaining
  walls skip a mapped bridge with room (as footprint.ts). Mapped structures join other ways only at their ends
  (`RoadNet.joinsAt`: no junction with a road under a span); their hits are never merged with roads on the ground. A
  choice on one is saved with its OSM id (`target.structure`); an older save's raw remnant id keeps its meaning. The
  sidecar is used only with the transport graph it was built from.
- **Bills.** D11 frozen: see COST_MODEL_VERSION 55 in prices.ts. Starters (M CZK): D11 8,798.2 → 8,751.2; Nová Paka
  1,194.0 → 1,231.8; D3 full 36,185.2 → 36,170.8; D3 0305 9,454.2 → 9,441.4; the rest unchanged; validity unchanged.
- **Open:**
  - The grade search does not aim for a mapped bridge's clearance (keeping it is not in its objective): Nová Paka's two
    bridges are rebuilt where lowering the line 3 m might have been cheaper.
  - Mapped railway tunnels are still drawn into the railway raster (build_pack.py: every `railway=rail`), so our road
    over one is treated as crossing the railway at the ground (the D3 official line meets the 130 m tunnel OSM 30231638);
    fixing it needs the packs rebuilt.
  - A road moved aside ignores a mapped bridge's level (passes under or over it, unchecked).

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

- Stream culverts and buried bridges ("přesypané mosty", cost model 29) are drawn in 3D as billed (2026-11-17,
  `src/render/culvert-geometry.ts`, `culverts.ts`, screenshots 330–339): the barrel (precast pipe, precast frame, or
  the buried bridge's vault at the billed plan width) from toe to toe along the mapped stream, each end cut along
  our road at the toe with a headwall, splayed wing walls, an apron and the water running out onto the stream; the
  slope comes down to the headwall's top over the barrel's last metres (a few m³ of earth, not billed; the bill's
  barrel runs toe to toe, a real one ends where the slope covers it). An end at a retaining wall stands 0.5 m out
  of its face. The drawn barrel is within ≈ ±10 % of the billed length (the toe where the stream really leaves the
  embankment vs. the station's footprint / sine). A click on an end, its map mark or its profile ring opens the
  culvert card. Not drawn yet: the culverts under our reroutes and the longer culverts where our slope covers a
  stream running beside it (footprint culverts; none on the saved designs).
- Junction approaches on class I–III roads are not length-capped (the 250 m cap is for ramps up to bridges over
  us): since cost model 29 town-centre km 11.65 meets class I road 2136 5.6 m up and regrades it over 271 m.
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

### Other ways' works and cut ways piece by piece (cost model 42, 2026-11-17)

Owner's Královec review (shots: a street closed by two stubs, a forest track cut by our fill beside a viaduct, a
road bridge's ramps over houses and the station tracks, a track's bridge ends sliding into our cut). Diagnosis and
remedies (`scripts/works-clash-audit.ts`: every pack's starters, what is drawn of other ways' works against kept
houses, mapped railways, our piers and our own body, and each cut way's detour over the network):
- **Other ways' slopes.** `crossing-works.ts` screened a crossing's ramps only against other roads. Now a junction
  approach, a bridge over us, a lowered box's ramps, the side roads regraded to them and every reroute keep their
  slopes off houses (a retaining wall where it can stand, else the house is bought out, billed and drawn
  demolished; a house the player keeps makes the treatment infeasible), mapped railways (wall, else infeasible) and
  (bridges over us, reroutes) our own cut, formation and embankment (wing walls; our earth only, not under a bridge
  or over a tunnel). A bridge over us whose ramps would land on the mapped tracks its way crosses at the same level
  beside us spans them too (Královec km 12.98: 49 m, clearing them at the railway clearance). A junction whose
  approach cannot be built that way is cleared by the grade (separation retry).
- **Cut ways piece by piece** (`way-pieces.ts`; owner's rule, research/45). A cut way's pieces are followed over the
  mapped network (within 1.5 km; a way under our earthworks is cut whatever is built for it, so a crossing's
  pieces never depend on another's treatment and the local retry stays exact): a piece that meets a public road
  just ends (a public road's end gets a billed turning area on its old road; a track's or service road's none);
  only a piece cut off is led to a crossing. A public road is closed only where its traffic goes round at most
  500 m further (CLOSURE_ROUND, a game rule: no Czech maximum detour exists); otherwise it is carried or rerouted
  (km 1.81: the street at the tunnel portal now crosses on a 33 m bridge instead of being cut by two 7 m stubs, its
  traffic 6.7 km round). A track or service road cut right beside our bridge may be led under it (UNDER_REACH
  150 m, PROVISIONAL; km 5.69 and 10.22: 181 m and 292 m of new track instead of a closure and a 145 m reroute
  that bought a home). No reroute joins its own way's line (the stubs). Card and summary say what is closed and why.
- Screenshots 360–364. Open: a disconnected piece that serves nothing (no building, no field reachable only
  through it) is still given access rather than closed; the drawn slope of our own embankment beside a bridge end
  can run far down a valley side (Královec km 5.68: 135 m) and looks billed for less (87 m² of section; not traced);
  two projects' crossings changing one junction are reported as such (the QA's new railway across Královec).

### Next steps
- Editing aid (future, not planned now): a drag on a long straight puts in one bend, so the whole line turns
  about its neighbouring bends (on the D11 straight start, about A and B: 10 px ≈ 230 m moves 15 km of road).
  A drag could instead keep the rest of the line in place (two holding bends), so a small drag is a local edit
  and a local price. Accepted for now (research/39 "Second pass").

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

## Local edits: the grade line in blocks (cost model 25, 2026-11-16)

Playtest (whole D3 / D35): a small nudge redesigned the grade and broke crossings 9–24 km away. Same design,
same bill stays the rule (no edit history), so the solve itself became local (research/39 "Local edits"):
blocks between long straights (from the plan only), each boundary's heights from the 5 km around it, each
block with its own mass balance, every input placed from the block ends rather than the stations; the
separation and strict retries and the support lifts act and are judged per stretch. Whole D3, 16 bend moves:
far grade change 14.8 → 2.4 m, far violations changed 2 → 0. Price: each block balances its own earth
(with 5 km boundary windows the sum of all saved designs equals a whole-route solve; single designs ±5–10 %);
five designs and starters needed 8–90 m bend repairs.
Known issues: far changes left (whole D3 4 of 16 moves, whole D35 1 of 10) come from the station-based
engineering on a shifted station grid (support lifts, overbridge ramp checks, reroutes, culverts); a chain of
straights each a little shorter than the last leaves one long block (the whole D35's last 9.7 km), which an edit
anywhere in it re-solves to B; interchange ramps are not modelled (the ends say so on their card).

## A drag on the railway (QA final sweep P1 2, 2026-11-16)

A 50 px drag at km 6 of the Královec railway left two streams 4 km away in a cutting and a track with "lower
our railway by 0.1 m" (research/57). The railway was already solved in blocks; what broke: the 25 m search
band around the ground (a 12.5 ‰ line lies far from it: a band line that misses a clearance is now weighed
against the wide band's, railways only), streams never retried like rivers (now), the height table's envelope
leaving out B's correction (the same design billed differently by evaluation order: fixed), and a track too
steep for a bridge over our cutting (the "0.1 m" was the text's floor; Auto now asks for our bridge over a
way nothing else could carry). The drag: VALID 10.88 bn; the starter 10.55 → 10.59 bn; road bills unchanged.
`scripts/edit-locality.ts` has a railway suite (reach p90 7.4 km, nothing beyond 10 km).
Known issues: some random railway edits still leave a problem in the edited stretch itself (research/57 "Left").

## Auto's own changes of slope never squeezed; grade problems in the player's words (cost model 43, 2026-11-17)

Owner's rail-6 shot: after a drag of the Královec railway, "Two roundings of the road height overlap — move the
height point at km 2.03 at least 32 m further from the height point at km 2.04", on Auto, where no height point is
drawn. Cause: a support lift that cannot be met within its block of the grade solve is retried with the block
widened by `LIFT_CLUSTER`; `liftAutoProfile` puts a vertex at each end of the stretch it may move and judged only
the problems within the lifted cluster's range, so the new turn at the widened end could squeeze the curve of a
point just beyond it (6–44 m apart). Now a lift fails if the line it returns (its free-end vertices that do not
turn removed) has a problem outside the range that the line before it did not; the grade solve's retry places its
points instead. Gate `scripts/vc-overlap-audit.ts` (saved designs, starters, QA repros, seeded drags of every pack
and the railway; five railway repros found on main). Frozen bills unchanged; some drags' bill and validity move.

Texts (`verticalViolations(…, byHand)`): By hand the ◆ points are "your height pins" (the By-hand handle's name
everywhere), a problem names them, the card offers *Move pin to km …* (along the slope behind it), *Delete pin*,
*Smallest radius*, and clicking it zooms the profile until both pins have handles (a By-hand pin is ≥ 20 m from
the next, `MIN_VPI_GAP`). On Auto no message names a point: a too steep stretch says where and how much longer it
must be; an overlap would be an engine limit at a km (never shown: the gate). Railways say "track". "Rounding" and
"height point" are JARGON. Auto's pins are drawn (screenshot 403); Auto's height points are not, by design.

## A drag past the next bend; an unreachable pin (sweep 3 second re-check P2s, no model version, 2026-11-18)

**A drag along the road past the next bend** (D35, a drag at km 12 along the motorway put the new bend beyond
bend 7: "turns back almost on itself (178°)"). Bends are corners in order from A to B; `core/bend-order.ts`
`passBends`: where the dragged bend lies ahead of a neighbour along that neighbour's other leg (a turn of more
than a right angle there) and swapping the two turns the line less, they swap places in that order, live and
reversible (dragged back, they swap back); a hairpin neighbour is left alone. Every road kind; the view follows
the bend's new number, the drag's offset, placed bend (fitted on release), wanted radii and radius notes go
with it. The repro: VALID, 20.57 bn (screenshot 430; tests/bend-order.test.ts).

**An unreachable height pin** (Královec railway, a pin 441.9 m at km 2.03, 4 m over the climb from A at its
12.5 ‰ limit: 10.69 → 12.06 bn, six problems at km 6.3–9.1). Not the climb carrying the lift: `autoProfile`
returned the straight grade from A to B for a pin outside the slopes' reach (and when the pinned search failed),
and evaluate then skipped the clearance retries and every support lift, as for a line with no legal solution.
Now Auto leaves out the pins it cannot meet (the others kept), says so at the pin ("Auto cannot reach it, so
the track stays where it was") and engineers its own line (`AutoProfileResult.lineOk`, `usableLine`): the repro
bills 10.69 bn with only the pin's problem (screenshot 431; a QA case in `scripts/edit-locality.ts`). Frozen
bills unchanged.
The card's suggested height is one Auto meets (`reachableSuggestions`, core/grade-pins.ts): the slopes' bound
(440.44 m here) is only necessary, as the search's 0.5 m grid takes ≤ 3 m per 254 m knot (11.8 ‰, not 12.5 ‰) and
changes of slope need room; so the bound is tried with the route's first solve (the memo re-solves only the
windows around the pin), then halved towards the line's height now on the editor's 0.1 m step, ≤ 6 solves, settled
evaluations only: "Set it to 439.5 m", which then holds (tests/rail-drag-locality.test.ts). A failed search's
suggestion (the height now) is found the same way. A retry no longer trades a line meeting the pins for one
leaving one out.
Left: a reachable pin's envelope also narrows the boundary windows that do not
contain it (the pin −9 m at km 2.7 moves km 12.7, EXPECTED in edit-locality): physics there (a line at its limit),
and leaving those windows unpruned made that pin's line 1.3 bn dearer, so it stays.

## A pin that leaves a crossing; bends left straight (P2 fixes re-check P1/P2s, cost model 51, 2026-11-18)

**A met pin left a stream in the railway's cut** (Královec starter, the suggested 439.5 m at km 2.03: the cut and cover
began at km 2.15 instead of km 2.0, the stream at km 2.087 ran through the 8 m open cut, not valid, 198 M cheaper, both
fixes unbuildable). Where the cover starts is not the question: a tunnel goes on to its portal where the ground is a
structure height (9 m) over the grade (`structures.ts`, the search's tunnel mode), and a stream stays over a tunnel
only 9 m under its bed (`waterBelow`), else it needs our line 2.8 m over its bed for a culvert (`waterMin`), the grade
search's either-or clearance. The pinned line is 8.1 m under the bed there: a box 9 m high would stand 0.9 m above the
stream, and from 439.0 m at km 2.03 (the pin's tolerance) a 12.5 ‰ line with its rounding cannot get 0.3–0.8 m lower
57 m on. So the pin and the stream conflict: the search paid the clearance penalty for the pin (pins are hard), and
the engineering had no remedy. A designer told to hold that height would carry the stream over the cut in a trough
(not modelled: a new structure, its price and drawing) or move the pin.
Now (`autoProfile`, a wrapper round the search): a pin met only by missing a crossing's own clearance (`pinBounds`:
streams, rivers, railways, motorways passed under, protected areas, the player's structures; not a retry's floors,
narrowings or roads to clear) that Auto's own line keeps is left out like a pin out of the slopes' reach, blamed on
the pin nearest the miss, reason `clearance`: "Pinned height out of reach: a stream", the detail says where and why.
Only a clearance the search must keep counts: the law's (`hardClearance`) or one a first pass missed and the
separation retry asks again at any price (`clearancePenaltyAt` > CLEARANCE_PENALTY); a first pass's miss may still be
met by the retries (D3 whole, a pin −9 m at km 9.41: the stream at km 8.13 missed in the first pass, cleared by the
retry, VALID as before). A suggested height must meet every such crossing in its first solve (`pinStrict`): 438.3 m
here, met, VALID. The repro bills 10.69 bn (Auto's own line) with only the pin's problem
(tests/rail-drag-locality.test.ts). A pin left out holds no support lift (they kept the line's height there). Found
on the way: the block memo's key left out pins outside the range, though every pin bounds every knot (the envelope)
and adds a finer pass; a pinned and an unpinned solve now share a memo, so the key holds all pins of a pinned solve.
Edit-locality: Královec pin +5 m at km 4.2 10.49 → 10.69 bn and D11 pin −8 m at km 7.2 3.82 → 3.66 bn ("out of reach:
a stream / a railway" instead of the clearance problems), both not valid either way; nothing else moved.
A stream in our cutting (By hand, a player's structure) no longer offers a bridge: "Lower our road here by 1.3 m to
tunnel under the stream, or raise it by 10.5 m for a 2.0 × 2.0 m culvert" (the nearer first), and the footprint's
"Our earthworks block a stream" says "our cutting runs through it" instead of "−8.0 m of earth".

**The unreachable pin's fix is a button** ("Set it to 438.3 m", on the pin's card and with every problem that has a
suggested pin), like the other cards' fixes (screenshots 480, 481).

**A dragged bend left on the line** (D35 km 4.2 dragged back past bend 2: "Bend 3 · turns 0° · no curve (straight)",
its number over bend 2's; D11 a drag along the straight: "turns 0° · R 1,350 m · 4 m of curve"). On release
(`map-gestures.ts onPiDragEnd`, `core/bend-order.ts dropStraightBends`), the dragged bend and its two neighbours that
turn less than half a degree (the card's whole degrees would say 0°; game rule, no norm) go, hairpins and an old
road's own corners excepted, with their radius notes; the line is the same (D35: 19.06 bn either way). A drag along a
straight road then leaves it as it was. Live drags unchanged (screenshots 484, 485; tests/bend-order.test.ts).
Review: the clearances are judged on the finished (rounded) line at each crossing's own chainage (a snapshot: retries
reuse the stations), 5 cm slack; only pins on the route count; of several pins left out, each is tried back on its own
(the nearest is not always the one in the way); a fixed-profile solve (one direction of a motorway) and stitched
results report a pin in route chainage; a bend that sets its stretch's speed is never dropped; a cut-stream fix that is
deep enough already says "Make it a tunnel here", and no "Bridge it" button is offered in a cutting.
Left: a pin and a stream in conflict could be met by a trough carrying the stream over our cut (a new structure).

## A bend the curve fit leaves out; a pin at Auto's own height (second-round re-check P2s, no model version, 2026-11-18)

**A neighbour the fit leaves out goes on release** (D35 km 4.2 dragged 50 px back: old bend 2's corner turns 2.2°, so
the < 0.5° rule kept it, but no S-curve fits between it and the dragged bend 137 m before it: the fit leaves it out,
4.9 m off the line between its neighbours, and the card said "turns 0° · no curve (straight)" with radius and speed
choices, its number over bend 2's). On release (`dropStraightBends` with the road's speed and category) a neighbour of the
dragged bend that the fit leaves out (`CurveInfo.ignored`) goes too, if its radius is Auto's, it sets no speed and
neither neighbour does (a bend bounds its neighbour's speed stretch), it is no hairpin nor an old road's corner, and the
road without it is the same: built as evaluate builds it (`planPis`: on a slowed stretch the plan may keep a curve the
plain fit leaves out), the same length and curves (the fit leaves bends out one at a time: without one, its neighbour
may get its curve back). The dragged bend itself stays (tests/bend-order.test.ts, with the review's three repros). A
bend left out otherwise (the dragged one, a loaded design) says so on its card: "Bend 3 · turns 2° · no room for its
curve. It turns the other way from the bend next to it, too close for an S-bend, so the road skips it (4.1 m off the
line between its neighbours). Move them apart, or delete it.", no radius choices (a speed it sets stays editable). Played: D35, the new bend held at (5228, 4540.6): old bend 2 goes on release, VALID 18.90 bn (screenshot 492);
old bend 2 dragged 1.3 m towards the line instead: it stays, left out, with that card, 18.88 bn (493).

**The Královec pin set to the suggested 438.3 m bills 10.72 bn, +25 M over no pin, with the track at the pin at the
same 437.9 m: legitimate, a near-tie of the block search.** A pin bounds every knot of every window by its slopes' reach
(autoprofile.ts `solveIn`), also a window 9 km away whose free start lies outside that reach though its boundary does
not: the windows at km 4.44 and 11.21 pick heights 2 m / 1.5 m lower, the line from km 6.6 on moves up to 1.5 m (bridges
+232 M, earthworks −205 M). Bounding a window from a pin outside it only at its boundary knots gives the no-pin bill here,
but the Královec pin −9 m at km 2.7 then bills 11.86 bn instead of 10.58: there the envelope is the true line (at its
12.5 ‰ limit to km 10.5) and the far window needs it. Kept as it is.

## A reroute led where the player drags its end (owner request, cost model 52, 2026-11-18)

Owner (D35 full, the track cut at km 2.51, "Cut and reroute"): its north part is led to the crossing at km 2.70 by
+217 m of new track, and nothing let the player lead it anywhere else. Now **the end of each new piece of a reroute,
where it joins its road, has a square handle** (`src/ui/link-edit.ts`, only on the selected crossing, as the bend
points): dragged onto another mapped road (within 18 px, not the cut way itself, not a motorway or railway; the road
it would join lights up, nothing is evaluated during the drag) and let go, the piece is led there; let go elsewhere it
goes back. One undo step ("where a reroute leads"). Dragging the middle of the new road still bends it.
- **Stored** as the crossing override's `ends` ([-normal, +normal] sides like `via`, each a pack way and the point it
  was dropped on, or null: Auto's target), in the project save too (`RouteControls.crossings[].ends`, validated, only
  with "Cut and reroute"); old saves load as before. Leading a side elsewhere drops that side's bend points.
- **Engine** (`crossing-geometry.ts` `playerEnd`, `crossingReroutes`): the piece joins the chosen way at its point
  nearest the drop (within 300 m along it, every 2 m) on the ground, clear of our earthworks, on its own side of our
  road, off any crossing's ramps or deck; it is then built as Auto builds its own (link-route.ts: profile within the
  class gradient, the justified steepest where the ground needs it, culverts, houses, never on the ground across a
  motorway, railway, pond or river; also straight across the fields where that line is the better one), billed as
  drawn. A road that crosses ours carries it on across (on its bridge, under ours, in a junction): dropped on its part
  beyond our road, its part on this side is joined. The card says "The north part led to the class III road that
  crosses at km 2.29 (+420 m of new track)" and "North part to the class III road at km 2.29 · your choice
  [Lead it where Auto does]". Auto keeps a crossing a player's end is built to carrying traffic (it is not cut or led on itself).
- **A road that cannot take it** leaves Auto's line on that side (or Auto's closure: a part that reaches other roads
  still just ends) and says why (issue code `end`, with *Lead it where Auto does* as its fix): the road is across ours, ours cuts it
  too, it is the cut way itself, a track or private road cannot take a public road's traffic, a motorway takes no
  road at the same level, no road on the ground there, or the new piece cannot reach it (steep, a railway, a river …).
- **A shaped side no longer builds the other side** (fixed on the way, a bill change for designs with shaped
  reroutes, hence the model version): before, any bend point made both sides required, so bending the north part of
  the D35 track also built its south part to km 2.70 (+1.6 M) though that part still reaches other roads. Now a side
  the player shaped or led elsewhere is built as they drew it and the other side is Auto's. A side led on is no longer
  "closed" on the card, and only billed turning areas are drawn as such. No saved fixture has shaped reroutes: every
  frozen bill is unchanged (eval-regression recaptured with the version only).
- A design with player ends builds its crossings on the whole route in the engineering retries (crossings-kept.ts:
  an end may depend on a crossing anywhere along the chosen road); designs without are unchanged.
- Played (`node scripts/reroute-end-shots.mjs`, screenshots 500–509): the north part led to the class III road at km
  2.29 instead, 420 m, 5.88 M against Auto's 217 m to km 2.70 at 5.43 M (that road is straightened to cross ours square:
  the piece joins it where its new line meets the old one, off its ramp); bent in its middle (+bend point, the south part
  still just ends); onto a street wholly south of our road (said, Auto's line stands); *Lead it where Auto does*; onto the track
  north of us that does not cross ours (+818 m, 13.6 M: it runs beside our earthworks, then up beside the track 1505,
  whose own line leads there: a player's choice, built as asked). `tests/link-end.test.ts` (synthetic cases and the
  D35 case).
- **Known limits.** For a way crossing ours more than once, the ends belong to the crossing nearest the drop (as a
  shape belongs to the one nearest its bend points), not to the one whose end was dragged. A new piece led far away
  may run beside an existing road that already leads there (509).
