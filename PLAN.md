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
