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
  tunnels, cost roll-up, HUD with VALID state, best design, undo/redo, persistence, naive start.
- **Rules added during the build** (game rules, not norm values): river / water-area / railway crossings are
  always bridged (≥ 30 m), streams are assumed culverted (in the norm). Bridges are only considered ≥ 4 m above
  ground and bored tunnels with ≥ 14 m of cover; minimum bridge 30 m, tunnel 150 m; earthwork gaps shorter than
  60 m (bridges) / 150 m (tunnels) are merged. Road base price is charged on at-grade length only.

### Travel-time target X and traffic Y

- Y = 9,000 vehicles/day → minimum S 9.5 by the placeholder thresholds (S 7.5 < 5,000 ≤ S 9.5 < 12,000 ≤ S 11.5).
- **X = 14.5 min.** At 90 km/h this allows 21.75 km = 1.17 × the straight line (the official line's 21 km fits);
  at 80 km/h 19.33 km = 1.04 × the straight line (only a nearly straight route); 70 km/h would need ≤ 16.9 km
  < 18.59 km, i.e. impossible.
- Calibration runs (`scripts/optimize.ts`, crude local search): 90 km/h starting from the official corridor →
  2.60 bn CZK, 20.8 km, 13.9 min; 80 km/h from the straight line → 2.73 bn CZK, 18.8 km, 14.1 min; 90 km/h from
  the straight line → 2.91 bn CZK. So the slower, smaller-radius road is only reachable on a very direct line and
  came out more expensive than the best 90 km/h design found — the intended tension — but the margin is thin and
  the local search is weak; re-check once players find better designs.

### Reference design numbers (`scripts/demo-design.json`, S 9.5, 90 km/h, auto profile)

20.77 km, 13.85 min, **2.61 bn CZK = 125 M CZK/km** (road base 885 M, earthworks 671 M, bridges 122 M, other
objects 513 M, land 415 M). Cut 1.81 M m³ / fill 1.81 M m³ (87 m³ per m; the norm assumes 40), balanced, avg
haul 0.6 km; 4 bridges / 210 m (river and rail crossings), no tunnels; 7 buildings demolished; 21 ha of forest.
Bridging the Úpa valley at Poříčí straight across (manual profile, 730 m viaduct up to 42 m high) costs 3.61 bn.

### PROVISIONAL / placeholder values (all in `src/core/data/`)

- Max gradient 6 % (older ČSN edition, S 9.5/S 11.5 hilly); vertical-curve minima crest 6000/3000/2500 m and
  sag 3400/2100/1500 m for 90/80/70 km/h (older edition; 90 uses the 100 km/h column).
- Side slopes fill 1:2, cut 1:1.75 (pending geology).
- Topsoil depth 0.3 m; topsoil allowance in the norm assumed over crown + 12 m.
- Land 8 × 50 CZK/m²; forest surcharge 250 CZK/m²; 15 M CZK per demolished building.
- Traffic → category thresholds.
- Decision prices for the auto-profile and structure choice (cut = excavation + ½ surplus haul, fill = placing +
  0.3 × bought fill), tuned so auto-profiles come out roughly balanced.
- Purchased fill is charged 636 CZK/m³ on top of 100 CZK/m³ placing (OTSKP 17180 may already include placing).

### Known limitations

- Mass haul uses a single balance line: cut may be hauled the whole route length if that is still cheaper than
  tip + borrow; no intermediate tips/borrow pits.
- Auto-profile cost uses a flat-ground section estimate; the bill uses the real cross-sections.
- Cross-sections ignore crossfall/superelevation and curvature correction; transition curves are not drawn.
- Building hits use OSM centroids; crossing existing roads is free (no junctions or overpasses yet).
- Drape texture is 5 m/px, so close-ups look blocky; the render mesh is 20 m (ribbon kept visible by a
  footprint mask that cuts the terrain).

### Next steps

1. Player-marked bridges/tunnels and a max embankment/cut height rule; overpasses for crossed roads.
2. Better mass haul (multiple balance lines, tips and borrow pits by distance).
3. Superelevation and crossfall in sections; transition curves drawn; sight-distance checks.
4. Land cost by land type (BPEJ / cadastre), protection areas, geology ground classes and hazards.
5. Official-line comparison (digitise its profile), motorway category row, scenarios #2 and #3.
6. Sharper drape near the route (2 m texture / orthophoto), LOD terrain mesh.
