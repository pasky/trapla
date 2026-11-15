# Automatic footprint engineering (cost models 16–18)

The evaluator now **builds and prices remedies**, rather than simply invalidating every design
whose slopes or foundations touch an existing feature. Straight-line Automatic and all five
published designs pass on the current D11 pack. A clear deck alone still does not excuse a
colliding pier, abutment, portal or embankment.

## Evaluation sequence

1. Compute the alignment and initial Auto profile, retaining the player's pins and structure choices.
2. Compute real sections; compare retaining walls with feasible minor-channel relocations.
   Truncate retained sections before computing earthwork, land, structure choices and buildings.
3. Move automatic bridge/tunnel ends and bridge supports onto clear sites; use longer, priced
   spans where necessary. Check their actual deck depth and clearance.
4. Apply bounded, norm-compliant Auto lifts when required. There are at most five engineering
   refinements and one fixed-material-value DP retry when the existing knots cannot fit a lift.
   This does not repeat the full mass-balance search, building analysis, crossing meshes or noise.
5. Resolve remaining ordinary-road footprints through real network connections, then screen the
   final geometry. Unresolved cases retain explicit violations and measured diagnostics.
6. Only if a *relaxed* road stretch (below) stays blocked, re-run steps 2–5 once from the repaired
   grade with those ways (and crossing ways within 300 m) treated strictly: ordinary walls, forced
   bridges/tunnels and abutment obstacles. Of the six published routes only town-centre needs it
   (track 3562 meets diverted track 3563 at its old junction below ground level).

### Cheaper remedies first (model 16)

Model 15 forced structures from any wall that could not be built. On best that produced a 140 m
"tunnel" (below the 150 m minimum, 208 M) and three bridges (105 M) for **field tracks** meeting the
route at shallow angles, 24 M of 12 m walls keeping a doomed track stub, and a +7.5 m grade lift over
~1 km for one abutment (194k m³ of bought fill). Model 16 rules:

- A road that crosses the centreline owns its connected stretch inside the footprint; its crossing
  remedy (diversion, reconnection, at-grade, bridge, overbridge) engineers it. That stretch never
  forces a tunnel. Non-separable tracks/service roads (which crossings sever, never bridge for) force
  nothing and get a wall only if it costs ≤ twice their own SPK relocation rate per metre; separable
  roads may still force a bridge over themselves. Severed ways own their whole in-footprint stretch in
  both directions up to the interpolated link-corridor boundary where links tie in
  (`CrossingGeometry.removed`), and their link tie-in may graze the toe within half a
  width + 3 m. The final screen validates the rest. A capped/infeasible optional wall falls back
  to the tightest independent constraint on that side (rail, water, other roads), never erasing it.
- Minor roads under an automatic abutment/portal are relocated by the footprint screen instead of
  lengthening the bridge (deck clearance over it is still demanded); a relocated track/service road
  may meet another track, service road or local street at grade at its own ground level — a short
  contact measured along the new path (≤ 4 × combined half-widths, whatever the OSM way splits),
  one ACCESS allowance per physical junction unless both are tracks.
- `bridgeMinHeight` is an economic threshold, not a physical limit: a clear abutment may be set into
  a cut of up to 5 m, and the bank under an end span is regraded (`Run.regradeM3`, OTSKP class II
  excavation) rather than lifting the grade. Deck/obstacle clearances are still enforced.

### Underpasses (model 17)

A track, service road or local street (`unclassified`/`residential`/`living_street`) may keep its own
level through our embankment in a closed cast-in-place RC box — the realistic alternative to a 1.5–1.8 km
diversion or a bridge on our road ([research/19](../research/19-track-underpass.md)). Clear opening
5 × 4.5 m (track/service) or 8 × 4.5 m (local road); our grade must be ≥ clear height + roof + 0.5 m cover
above the crossed road (5.5 / 5.65 m), measured under the whole crown; box ≤ 100 m. Length is measured
toe to toe along the actual (skewed, bent) way; price = length × (OTSKP 389385 frame concrete incl.
reinforcement + 711442 roof waterproofing + 451315 bedding + the way's own SPK pavement) + two
provisional portal heads (0.3 / 0.45 M). The way's in-box stretch is built, not removed, so the footprint
screen owns it. Auto picks it where it is the cheapest of link/overbridge/underpass (estimate, then the
measured geometry feedback loop); Auto local roads under ≥ 6 m fill are no longer forced onto our bridge —
the structure selector weighs the estimated box against the bridge. Auto never lifts the grade for a box
(a player choice does: like a chosen bridge it sets a minimum height). Rendered as a concrete box with
headwall frames, splayed wings and a dark opening at the slope toes over the terrain-level way.

Published designs (all still VALID): 5 diversions replaced (best 2: 25.8 + 21.4 M → 10.0 + 11.1 M; demo 1:
26.0 → 9.1 M; direct-90 1: 15.3 → 9.3 M; town-centre 1: 19.1 → 17.1 M) and 2 street bridges replaced
(demo km 7.00, direct-80 km 4.00, 10.9 / 11.7 M boxes). Totals bn CZK, model 16 → 17: straight 10.051833 →
10.013398, best 4.325765 → 4.291626, demo 4.986752 → 4.898255, direct-80 5.018385 → 4.978590, direct-90
5.575139 → 5.565410, town-centre 11.447356 → 11.444752. A player-chosen underpass for demo's service road
4742 (Auto keeps its 41.7 M, 1.7 km reconnection because 5.6 m of fill is too little under the crown) lifts
the grade and saves a further 22.6 M. The tables below are model-16 numbers. On the older original pack,
indirect mass-balance shifts move direct-80 (+58 M, 2 more blocked class-I relocations) and town-controls
(one more violation); both inputs were already invalid.

### Model 18: plain words, class-gradient ramps, joining instead of failing

An audit of every crossing/footprint outcome (`scripts/outcome-audit.ts`: five published designs, straight,
104 random-bend Automatic designs) found ramps of 250–1,020 m, Auto keeping a 148 m track bridge over a 31 m
cutting (90.7 M) instead of a 21.5 M reroute 759 m away, and automatic road rebuilds failing as "realignment
needs engineering … intersects an unhandled road" next to a service-road bridge (owner report, km 8.64).

- **Ramps** (overbridges, raised junction roads and rebuilt roads): `ROAD_CLASSES[cls].rampGradient`,
  research/20 — track 10 %, service 9 %, streets 8 %, class III 7 %, I/II 6 % (unchanged). Where the ramp
  runs the same way as the crossed road's own slope, it may be up to half the class gradient steeper than
  that road, never beyond the class's justified-case maximum `rampSteepest` (track 15 %, service and
  streets 12 %, living streets 8 %, class III 9 %, I/II 7 %; PROVISIONAL game rule, `rampLimit`); the audit
  check uses the same limit. A bridge over us whose ramp on either side exceeds 250 m (PROVISIONAL) is
  rejected ("ramps would be longer than 250 m"); Auto then reroutes or builds an underpass. Track ramp at best
  km 3.69: 330 + 51 → 82 + 42 m; direct-80 street km 15.97: 386 + 35 → 144 + 26 m. Random designs: ramps over
  250 m 66 → 6, all of them class I/III junction approaches (not capped: regrading a through road over
  ~300 m at a junction is ordinary).
- **Joining, not failing.** Where a rebuilt road's new line crosses another ordinary road (or its own
  continuation) outside our earthworks, its profile is pinned to that road's ground level there and the
  contact is a junction; its mouth may be regraded by up to 1 m (PROVISIONAL) next to the pin, and a long
  parallel overlap still fails. A turning area touching another road whose ground is within 1 m of the
  disk's is a junction too. Each new junction books the 0.5 M access estimate unless both roads are tracks.
- **Closing a loop stretch.** Only if no rebuild works, a track, service road or street stretch between two
  junctions (≤ 400 m, PROVISIONAL), inside the plan's own ownership bounds and not carrying an accepted
  connector, is **closed** at no cost (`RoadRealignmentPlan.closed`, shown as "Closed") when its ends stay
  connected over at most max(2 × its length, its length + 300 m) of other roads that are at least as wide,
  not motorways, not removed by another remedy, and not under our earthworks except on the kept, rebuilt
  stretch of a feasible bridge over us, underpass or junction (`RoadNet.networkDistance`, including unsplit
  T-junctions). Class I–III roads are never closed. Closing assumes the remaining roads carry the traffic as
  they are (no upgrade is priced). Random designs: blocked rebuilds 191 → 149, "unhandled road" failures
  53 → ≈ 15 (each now with another real problem).
- **Long reroutes vs structures.** A feasible bridge over our road (or underpass) is replaced by a reroute up to
  2 km away only when that measured reroute costs at most half of it; within 750 m the cheaper wins as before.
- **Words.** Outcomes, violations and footprint details are written in `src/core/terms.ts` vocabulary; a
  failed automatic rebuild is an *engine limit* with a computed fix ("Move the route at km 1.27 about 26 m to
  the right (away from the track), or put our road on a bridge from km 1.25 to km 1.31") and a plain reason
  ("there is no room for it beside our earthworks"). Price sources moved to `FootprintConflict.source`
  (pricing tooltip). `tests/player-text.test.ts` generates every violation kind and outcome at run time and
  statically scans every UI string literal and every core `title` / `fix` / `detail` literal and violation
  helper argument.

Totals bn CZK, model 17 → 18 (all still VALID): straight 10.013398 → 10.009893, best 4.291626 → 4.253391, demo
4.898255 → 4.879753, direct-80 4.978590 → 4.941034, direct-90 5.565410 → 5.555314, town-centre 11.444752 →
11.442013. The original-pack fixture (`evaluate-remedies-original.json`) still holds model-17 bills: it can only
be recaptured on that older pack, which is not installed here. Remaining flagged outcomes on published designs are links > 1 km where no structure fits: service
4742 (demo, 5.6 m fill: too little for a box, an 11.6 m climb over us), track 2705 (direct-80/90, 4.3–5.1 m
fill), service 5162 (town-centre); lowering a way into a shallow cut under a box is not modelled. In random
designs the remaining automatic-remedy violations are piers that find no clear spot (railway/street at the
Polish border) and rebuilds with no room or too steep ground; both are tagged *engine limit*.

### Model 19: a crossing's own earthworks leave other roads usable

Owner report (D11 near bend 24): the fill slopes of a junction approach lay over the neighbouring class III
road, with nothing resolving it and no violation. Cause: only *our* road's earthworks were checked against
other roads; the raised or lowered stretch of a crossed road (junction approach, ramps to a bridge over us)
was drawn with 1:1.5 slopes that nobody checked. `scripts/crossing-footprint-audit.ts` (same designs as the
outcome audit) found 72 such overlaps before; the remaining 4–6 hits are explained (a road joining exactly at
our junction, an arm running into our own earthworks, a pre-existing ramp-too-long violation).

`src/core/crossing-works.ts`, called by the geometry pass for every junction and bridge over us, does what a
designer does:

- **Side roads joining the rebuilt stretch are regraded** ("ties"): from the new level at the junction node
  (≤ 2 m: pack ways are simplified by 1 m and rounded) down along the side road's own line to its ground, no
  steeper than its class allows (`rampLimit`, research/20), at most 250 m (`MAX_RAMP_LENGTH`). Each arm of a
  node is regraded once. Priced at the side road's SPK new-road rate per metre (`roadPerKm`, urban row when
  the crossing is in town), drawn as a road of its own class with its own slopes, picked with the crossing,
  and owned (its source interval) so our road's footprint check does not rebuild it again. An arm that runs
  into our own earthworks is left to our road's footprint works (moved beside them / its own crossing).
- **A road beside the slope gets a retaining wall** 1.5 m clear of its edge (constrained: 0.1 m, at least
  at the paved edge), the same rules and OTSKP assembly as our own walls (`RETAINING_RULES`,
  `retainingAssembly`, research/18), at most 15 m high; measured where the slope would still stand above the
  wall line, drawn as a concrete face (the slope stops at its top), billed per metre of its mean height.
- **Otherwise the treatment is infeasible** ("The junction's approach would bury another road" /
  "The ramps to the bridge over our road would bury another road", game rule): Auto tries an underpass, a
  bridge over us or a reroute instead, exactly as for other geometry failures; a player's choice stays and
  shows the violation.
- Earth no thicker than 0.3 m on the other road's edge is not a burial (the engine's existing draped-road
  tolerance, `crossing-geometry.ts`).
- The ties and walls are construction (`CrossingResult.worksCost`, other-objects surcharge), never part of
  the junction lump sum. They are remeasured on every geometry build; the crossing card says what was added.

Totals bn CZK, model 18 → 19 (all published designs still VALID; frozen fixtures recaptured after this
review): straight 10.009893 → 10.011062 (+1.2 M: a 37 m tie of a street joining the class I junction approach
at km 15.40), best 4.253391 → 4.255851 (+2.5 M: ties of 15–55 m on four track/local-road bridges over us),
demo 4.879753 → 4.881066 (+1.3 M: class I junction km 6.73 and track bridge km 17.93), direct-80 4.941034 →
4.945392 (+4.4 M: five bridges over us, one 10 m wall), direct-90 and town-centre unchanged. Fixtures
best-drag/-pin/-structures/-manual move with best (+2.4–2.7 M), town-controls is unchanged.
`tests/fixtures/service-loop-design.json` changes outcome: the service-road bridge over us landed 7 m up on
the junction with class III road 2054, which falls away at 8 % and cannot be regraded within 250 m; Auto
now cuts and reconnects the service road (a 1.4 + 1.4 km reroute, the existing long-reroute limitation) and
rebuilds the loop branch, instead of silently burying that junction. **A designer would not reroute here; this is an engine gap:**
service road 4826 is only a 100 m chord between two nodes that service road 4829 also joins (120 m over 4829,
`RoadNet.networkDistance` avoiding 4826), and 4829 is rebuilt beside our earthworks anyway (3.7 M). The real
answer is to close 4826 at our road (two short dead ends, or remove the chord) at about no cost, not 68.75 M of
new road. Crossings have no such "closed" outcome: the footprint pass can close a loop stretch
(`RoadRealignmentPlan.closed`), but crossings are resolved before it and cannot yet know which neighbouring
ways survive (here 4829 survives only through its own relocation). Fix: let a severed crossed way whose cut
ends stay connected over other surviving roads be closed (with the footprint pass's closure rules), resolving
crossings and relocations together. Random designs (24): violation counts
unchanged, totals −1.3 to +3.8 M (the decrease: a regraded side road replaces a costlier rebuild beside our earthworks).

Not checked yet: buildings, railways and water under a crossing's slopes; second-order effects of a tie's own
slopes; a stub between the crossed road and our earthworks whose arm is left to our footprint works.

Manual grades are not lifted, pins remain constraints, and manual structure ranges are not
silently moved. Retaining walls can protect a manually specified earthwork without changing its
specified grade or structure kind. Infeasible overrides remain visibly invalid.

## Physical and financial rules

### Retaining walls

`src/core/retaining.ts` limits the actual daylight offsets and recomputes the affected cut/fill
areas and excavation bands. It does not merely hide collisions. The resulting quantities feed
structure selection, acquisition, demolition and noise calculations. The renderer ends the slope
at `wallSurfaceL/R`, draws a vertical concrete face to natural ground, and preserves the fine
daylight collar and structure-transition caps.

Walls use a height-dependent RC/foundation/drainage assembly from
[`research/18-footprint-remedies-rates.md`](../research/18-footprint-remedies-rates.md), not an
invented universal CZK/m² tariff. Principal OTSKP 2026 items are 327325 concrete, 327365 reinforcement,
13173 foundation excavation, 17411 backfill, 212625 complete rear drainage and 214613 filtration.
The reported face area is measured; the effective price/m² varies with wall height. Wall
construction is booked at each actual station and its own urban surcharge, independently of
how adjacent faces are grouped for a tooltip. Channel construction/land allocations likewise
retain their distributed stations; land receives no construction surcharge.

The preferred setback is 1.5 m outside the protected feature and the preferred face is at least
0.75 m outside the crown. A constrained vertical face can instead stand at the crown edge,
leaving the complete mapped road ribbon/protected pixel envelope outside it. Its 0.1 m positive
screen margin is **not** a surveyed railway safety distance or a construction working-strip norm.
The footing points into the acquired corridor; an assembly wider than that corridor is rejected.
The 15 m height cap and all footing/stem dimensions are provisional study assumptions.

A wall retaining water beside an open cut uses a larger RC section, provisional cutoff embedment,
and pressure-water membrane/protection (711122 + 711519), not the ordinary drain that would draw
down a pond. This is not a seepage calculation, proof of impermeable geology or construction permit.
Foundation excavation uses the declared 13173 allowance, not a site-specific rock/foundation
estimate. Ground conditions and detailed structural/hydraulic design remain unverified.

### Minor-channel relocation

`src/core/channel-relocation.ts` can move a small stream/ditch outside the full bank footprint,
with real reach tie-ins and compatible bed levels. The bounded concept allows Q100 ≤10 m³/s,
additional bank cut ≤5 m and channel grade ≤3%. Larger rivers and unsupported flow-management
schemes do not receive a cheap generic relocation price.

The BOQ measures trapezoidal excavation, stone lining, filter, bank restoration, old-channel
backfill and land. It uses OTSKP 124731/831/931, 17120, 46451, 28997, 18221 and 18242; excavation
includes haul up to 1 km. Reused backfill is not also charged for stockpiling. The trapezoid area is
`depth × (bottom + sideSlope × depth)`, not the area of its bounding rectangle.

New road/rail/water interceptions reject the proposal unless an existing water tie-in is actually
preserved. Screening covers the full excavated bank (including the wider adjacent section),
protected raster-pixel corners and interior/boundary no-data cells—not just the channel centreline. Continuous old-reach checks prevent backfilling a confluence and stranding a tributary
between samples. Centreline assemblies are not also billed as channel relocations. Accepted source
intervals alone are removed from the final footprint screen. Construction is under **Road crossings**;
land is under **Land**, without construction surcharge.

Channel plans are deliberately conservative about reach boundaries, outlets and confluences;
there is no general watershed-routing solver. The six published examples currently choose walls
and structures rather than channel diversion. Synthetic integration tests exercise a selected,
priced diversion and rejection of lost tributaries/new unpriced confluences.

### Bridges, portals and supports

`src/core/support-layout.ts` searches local clear sites for automatic abutments, portals and piers.
A run containing a manual structure override is not silently redesigned, but its actual spans and
soffit clearances are still validated; painting the same bridge manual cannot erase a violation. The bounded search allows
end movement up to 300 m and clear spans up to 180 m. These are game engineering limits, not norms.

Abutments/portals screen 6 m along × (crown + 4 m) across; piers screen 2.4 m along × 0.55 crown.
Ordinary main-road layouts use equal spans ≤30 m. Modified layouts expose their actual
`Run.pierStations`; billing integrates each actual span and support density through the existing
sourced bridge model. A long span does not impose its rate over the entire viaduct, and obstructed
piers are never omitted for free. Rendered soffits use `max(1.2, span/20)` depth per span; unequal
spans meet supported pier tops. Clearance failures identify the station and required raise.
Minor-road obstacles at automatic abutments/portals and the 5 m cut abutment are described above.

### Existing roads

`src/core/road-realignment.ts` follows real source-way chainages and connected ways. It first tries
a 25 m collar, then larger footprint-derived collars up to the configured 2 km reach. A short
collar can avoid an unnecessary high supported ramp; a longer one can satisfy the 6% grade limit.
Additional retaining faces and turning aprons are measured and priced. Supported approach height
is bounded to 10 m. The additional retaining assembly is charged in full without an unsupported
credit for possible overlap with the SPK standard-structure quota.

New/regraded pavement and complete turning disks screen existing road ribbons, rail and water.
Motorways/trunks cannot become cheap at-grade anchors. Existing outside junctions must survive;
a failed shortcut can retry at the nearest **actual** clear junction. The 2 m simplified-data
uncertainty guard only prevents losing branches—it does not invent source topology or anchors.

Only exact built/removed source intervals are reserved. There is no blanket half-station pad or
translation of one crossing's ownership onto another nearby road. The old 150 m endpoint billing
margin no longer hides nearby crossings: they enter engineering. A defined boundary connection
owns only its grade-compatible pavement overlap in the actual endpoint crown cell. Failed geometry cannot claim
removed roads. Complete, physically usable crossing approaches can still be used when an unrelated
spacing rule makes the player's choice invalid.

At a common outside junction, companion source roads are independently checked **before** ownership
is committed. Identical accepted connectors share one physical work item. `road-remedy-ledger.ts`
uses the higher tariff at each matching physical segment, one set of support/apron works and unique
ACCESS allowances; it retains every removed original and exact source interval. Later plans must
preserve accepted connector endpoints, not treat them as merely deleted old road branches.

Straight-line Automatic demonstrates this: service ways 5549 and 5548 share a 37.465 m connector
costing **1,733,722.74 CZK**, including one 500,000 CZK ACCESS allowance. Removed ownership is
5549 `[0, 52.1964614090]` and 5548 `[0, 21.8409498829]`; the continuation beyond their real junction
is untouched. There is neither a duplicate connector bill nor free ownership of the continuation.

Road construction uses the appropriate measured-path SPK CN 2026 class and rural/urban rows
([research/08](../research/08-junctions-crossings.md), [research/13](../research/13-crossing-items-tenders.md)). Track uses sourced P4, not a made-up gravel
rate. The 500,000 CZK ACCESS item is the existing **very-low-confidence provisional service-access
estimate**, not a sourced class-I through-junction tariff. Its all-in allowance is included in
crossings but excluded from construction surcharge.

### Final screen and remaining limits

Each station's rotated slope-to-slope footprint includes cuts. Road ribbons include class width
(OSM motorway ways use one carriageway, not a full divided-road width). Local road/water segment
indexes, an indexed footprint and row-wise raster bounds avoid route × whole-network scans.
Protected rail/water bits remain active where road paint overwrites the visible raster class;
5 m raster pixels retain their half-cell screening uncertainty.

Full vector-water ribbons are screened even without redundant raster paint; missing river widths
use the same 5 m study default throughout. Bank-only contact is not fabricated culvert length.
Short longitudinal culverts still require a sourced opening/length assembly, real cover and clear
outlets. Only feasible pipe/box assemblies own barrel intervals—not raw bridge-required crossings.
Ownership is subtracted before water-wall constraint points are chosen, and shortening a barrel
triggers bounded section restoration/rechecking rather than double-applied earthwork or wall costs.
Exact crossing elevations and a shared numerical cover tolerance keep ownership and validation
consistent at the minimum cover, independently of absolute altitude. Compatible adjoining extensions reuse existing heads and charge their actual extra length.
Vector ownership follows the asymmetric, channel-aligned barrel envelope, including its provisional
20° chord flare—not a circle concealing a connected dog-leg. The directionless raster fallback is
explicitly uncertain. See [research/17](../research/17-culvert-prices.md).

This remains study-stage engineering, not survey/geotechnical/hydraulic certification or a global
network optimizer. Auxiliary-road utilities, property effects and secondary grading are not a
complete civil design. An unresolved bounded search is not proof that no engineer could solve the
site. It must not, however, be converted into VALID by suppressing the remaining footprint hit.

Water-policy basis: [Water Act 254/2001](https://www.zakonyprolidi.cz/cs/2001-254), §§5(1), 8 and 17
(water protection, permitted uses and consent). This calls for an engineered/permitted solution;
it does **not** establish a universal legal prohibition on every pond filling or river pier.

## Presentation

`Result.footprintConflicts` exposes action, affected ranges, source/constructed geometry, measured
length, rate code and already-booked amount. The HUD and profile tooltips distinguish retaining,
relocation, culvert and blocked works. Built road connectors use physical crossing surfaces and
full priced turning disks/rim supports. All removed originals of a shared connector receive red
dashed annotations; blocked proposals remain amber. Channel beds are blue annotations at designed
levels, not a claim that a full excavated channel mesh has been rendered. Land and lump allowances
are not added to the bill again by the UI.

## Published designs and review baseline

The four repairs use bounded local PI refinement, preserving category, speed, controls and PI count.
Maximum PI displacement is 15.0 m for demo, 81.4 m for direct-80, 7.6 m for direct-90 and 131.1 m for
town-centre. Best is unchanged horizontally; straight remains **zero PIs, Automatic, zero pins**.
The validity-first runs took 74, 253, 1 and 68 evaluations respectively. `scripts/repair-designs.ts`
never writes an invalid result and requires `--write` to replace a published input.

Current vector-watercourse pack; money below is **M CZK before surcharge**, except whole-route totals:

| Design | Wall length m / face m² | Wall M CZK | Road works: count / m / M CZK | Explicit support layouts / max span m | Bridge / tunnel m | Total bn CZK | Violations |
|---|---:|---:|---:|---:|---:|---:|---:|
| straight | 1,489.7 / 6,056.2 | 83.842 | 2 / 77.3 / 3.547 | 13 / 142.8 | 4,339 / 180 | 10.051833 | 0 |
| best | 799.9 / 1,747.7 | 21.621 | 2 / 392.4 / 17.355 | 4 / 58.0 | 1,540 / 0 | 4.325765 | 0 |
| demo | 829.7 / 1,815.0 | 21.742 | 5 / 305.6 / 8.954 | 8 / 46.7 | 1,639 / 0 | 4.986752 | 0 |
| direct-80 | 789.8 / 1,921.0 | 25.734 | 3 / 236.1 / 11.368 | 11 / 87.0 | 1,790 / 0 | 5.018385 | 0 |
| direct-90 | 1,179.7 / 4,425.9 | 63.637 | 0 / 0 / 0 | 11 / 64.0 | 2,059 / 0 | 5.575139 | 0 |
| town-centre | 1,020.0 / 4,441.2 | 71.170 | 4 / 399.5 / 8.748 | 10 / 120.0 | 3,730 / 0 | 11.447356 | 0 |

No blocked road costs or selected channel relocations are hidden in this table. Support counts
refer to runs with explicit pier stations, not every moved abutment/portal. Component-array sums
match total bills (below the 0.005 CZK regression tolerance). The only tunnel (straight) is the
economic one under a 25–43 m ridge, not a forced one; model 15's forced tunnels (best, demo,
straight, town) are gone.

Same **current pack and same repaired inputs**, main `3dccc23` (model 13), model 15 and model 16:

| Design | Model 13 bn CZK | Model 15 bn CZK | Model 16 bn CZK | 16 vs 15 M CZK |
|---|---:|---:|---:|---:|
| straight | 8.806911 | 10.266047 | 10.051833 | −214.2 |
| best | 4.162396 | 4.758320 | 4.325765 | −432.6 |
| demo | 4.855298 | 5.375679 | 4.986752 | −388.9 |
| direct-80 | 4.787410 | 5.244108 | 5.018385 | −225.7 |
| direct-90 | 5.015213 | 5.726710 | 5.575139 | −151.6 |
| town-centre | 11.738640 | 11.690899 | 11.447356 | −243.5 |

Model 13 ignored footprint conflicts entirely (e.g. demo's obstructed watercourse at km 6.64 was
invalid; parallel roads, rivers and rail under slopes were simply buried), so the remaining gap is
mostly real work: bridge ends kept off roads/rivers, span-depth clearances, walls and relocations.
Best (+163 M vs model 13): mainly bridge ends kept clear of a 30 m river, a class III road and a
service road, economic bridge choices where walls would be dearer, relocated tracks and walls.

The original ten model-13 bills were first reproduced exactly with unchanged main on their
original fingerprinted pack. `evaluate-costs.json` and `evaluate-pack.json` remain untouched.
Separate model-16 fixtures preserve ten historical-input cases on that pack and eleven current-pack
cases (six published routes plus drag/pin/structure/manual/property-control variants). They check
all bill leaves and per-part sums below half a cent, exact VPIs/material value, validity/violations,
and a canonical hash of the built geometry. Unknown or partial installed packs fail loudly;
only an absent optional pack skips integration tests. Never recapture these to hide an optimization
regression. See `scripts/eval-regression.ts` for explicit reviewed-model-change capture commands.

## Performance

Warm `BENCH_WARMUP=15 BENCH_N=30 npx tsx scripts/bench.ts`, same machine, pack and inputs, consecutive
processes (±5–10% run-to-run noise). Model 15 = `side-agent/footprint-conflicts`; model 13 = main `3dccc23`.

| Design | Main 13 ms | Main 13 + perf commits ms | Model 15 ms | Model 16 ms |
|---|---:|---:|---:|---:|
| straight | — | — | 101 | 93 |
| best | 75 | 60 | 76 | 77 |
| demo | 72 | 57 | 85 | 85 |
| direct-80 | 80 | 63 | 104 | 92 |
| direct-90 | 62 | 53 | 93 | 90 |
| town-centre | 74 | 65 | 74 | 117 (strict retry) |

Model 16 phases, ms (stations / Auto profile / engineering passes incl. retaining / crossings /
footprint / noise): best 2.1 / 27.3 / 18.0 (2 passes, retaining 11.5) / 18.8 / 5.5 / 4.5;
direct-80 2.3 / 31.4 / 20.7 / 23.8 / 6.5 / 6.0; direct-90 2.0 / 25.3 / 35.8 (3 passes) / 17.3 / 3.7 / 4.5.

**The ≤50–60 ms target is not met** (best 77 ms). Main itself regressed after `8e1d884`
(link smoothing): crossings ≈14 → ≈30 ms. Bit-identical fixes (also cherry-pick cleanly onto main,
whose model-13 fixtures still pass): reused smoothed links across candidate builds, a bucket-grid
route projection with tree fallback, allocation-free one-off margins, stamp-deduplicated watercourse
scans (stations 4.5 → 2.3 ms) and a cost-point-outer DP accumulation (≈10% of the coarse pass).
The Auto profile alone remains 26–32 ms (coarse 2 m pass ≈13 ms of which ≈6 ms LUT fill), crossings
14–21 ms and the two engineering passes ≈16 ms; these are the remaining targets.

Unprefixed timing keys are cumulative checkpoints; `sections` is overwritten each refinement.
`work.*` measures elapsed work summed across passes (`work.engineering` includes its substeps),
and `count.*` counts calls. Future performance changes must preserve the frozen bills, geometry
and validity on both recognized packs.

Reproduce audits with:

```sh
PACK=/path/to/current/d11 DETAIL=1 npx tsx scripts/footprint-audit.ts --straight scripts/*-design.json
PACK=/path/to/current/d11 npx tsx scripts/eval-regression.ts
```
