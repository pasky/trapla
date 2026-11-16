# Automatic footprint engineering (cost models 16–24)

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
outcome audit; a rough independent screen that skips whole ways once they are regraded or handled by our own
footprint works, so it finds problems rather than proving their absence) reported 72 such overlaps before
and 5 after, each checked by hand: a road joining exactly at our junction, a side road running on into our own
earthworks (left to our road's footprint works), and one pre-existing ramp-too-long violation.

`src/core/crossing-works.ts`, called by the geometry pass for every junction and bridge over us, does what a
designer does:

- **Side roads joining the rebuilt stretch are regraded** ("ties"): from the new level at the junction node
  (≤ 2 m: pack ways are simplified by 1 m and rounded) down along the side road's own line to its ground, no
  steeper than its class allows (`rampLimit`, research/20), at most 250 m (`MAX_RAMP_LENGTH`). Each arm of a
  node is regraded once, and only along that road's own line (no other road near the junction counts as
  resolved). A road that two crossings would both regrade is an engine limit (reported; Auto chooses another
  treatment for one of them). Priced at the side road's SPK new-road rate per metre (`roadPerKm`, urban row when
  the crossing is in town), drawn as a road of its own class with its own slopes, picked with the crossing,
  and owned (its source interval) so our road's footprint check does not rebuild it again. An arm that runs
  into our own earthworks is left to our road's footprint works (moved beside them / its own crossing).
- **A road beside the slope gets a retaining wall** 1.5 m clear of its edge (constrained: 0.1 m, at least
  at the paved edge), the same rules and OTSKP assembly as our own walls (`RETAINING_RULES`,
  `retainingAssembly`, research/18), at most 15 m high. A wall line spans whole sections; where the slope stops
  short of it the face tapers to nothing, exactly as drawn; billed per metre of its mean height. The geometry
  audit (`auditCrossingGeometry`) remeasures ties and walls from the drawn geometry and checks the bill.
- **Motorways and expressways** are protected too (a wall may stand beside them); one is never met at grade.
- **Otherwise the treatment is infeasible** ("The junction's approach runs over another road" /
  "The ramps to the bridge over our road run over another road", game rule): Auto tries an underpass, a
  bridge over us or a reroute instead (for an automatic junction too, only in this case), exactly as for other
  geometry failures; a player's choice stays and shows the violation.
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

### Model 22: buildable automatic reroutes, lowered underpasses

(Developed as "model 20" on its branch; main took 20 for motorway and railway scoring and 21 for finite-segment noise.)

**Problem.** The outcome audit of model 19/20 road designs (`scripts/reroute-audit.ts`, straight + five
published + 24 random designs) found 730 of 871 automatic reroutes silently unbuildable: 658 steeper than
their class allows (22–29 % over 20 m along steep slope toes on published designs), 140 through houses, 35
across railways, 19 through ponds or rivers, and 215 stream crossings without a culvert. Auto chose them
because they were cheap, and nothing checked them.

**Reroutes are engineered** (`src/core/link-route.ts`), automatic or shaped by the player alike:

- Surveyed every 5 m, and more finely wherever the ground departs from a straight line between samples by
  more than 0.2 m (as drawn terrain is refined), so that the profile sees every hump the drawn road follows.
- A profile as close to the ground as the class gradient allows (research/20; `rampGradient`, and the
  justified-case `rampSteepest` where the ordinary value cannot be met), cut or fill at most 10 m
  (`LINK_MAX_SUPPORT`, PROVISIONAL: the same limit as rebuilt roads and bridge-over-us ramps), ending on the
  ground at the roads it joins. Profile samples every 5 m (≤ 450 per line).
- Streams crossed get a culvert sized like ours (`waterSize`, research/17), one per crossing, with its cover
  built up in the profile exactly where it crosses (a stream at a tie-in itself cannot be covered there); a river too big for a culvert is a problem. Houses in its way are bought out and demolished like
  those under our road (`evaluate.ts` books them as buildings); a house the player keeps blocks it. Railways,
  ponds/rivers (raster) and motorways (anywhere under the new road's width) are never crossed on the ground.
- Where the line beside our earthworks cannot be built (or buying houses out is over a quarter of its price),
  `routeAlong` searches a gentler or clearer line beside our road: a dynamic programme over ≤ 60 stations ×
  11 offsets of 10 m, up to 100 m out (`LINK_CORRIDOR`, PROVISIONAL), with a soft penalty of 50 m of road per
  metre of rise beyond the gradient (a search heuristic only: the line found is engineered and checked like
  any other). Not tried past rivers or motorways, or across a railway the straight line between the ends
  also crosses.
- An automatic reroute that still cannot be built is one violation, "No buildable reroute for the …", with
  every reason in plain words and a computed fix (raise our road onto a bridge over it, or lower it so the
  crossed road can bridge over us); the crossing keeps owning its road (no knock-on footprint violations).
  Auto then prefers any buildable treatment; a shaped reroute reports each problem separately.
- The crossing card says what the new road needed (culverts, houses, the steepest grade where the class's
  justified maximum was used).

**Lowered underpass** (research/37). Under an embankment too low for a box (5.5 m for the track box, 5.65 m
for the local-road box: clear height, roof and cover, research/19), the crossed way is lowered into a cut:

- A straight floor through the box, as high as leaves the box its room under our road everywhere under the
  crown band; its fall (at most the class gradient, or the old road's own fall across the box where steeper,
  as for a sloped deck) is chosen for the shortest ramps. Ramps back to the old road at the class gradient
  (`rampLimit`, research/20), at most 250 m each (`MAX_RAMP_LENGTH`).
- Deepest lowering 6 m (`LOWERING_RULES.maxDepth`, PROVISIONAL: no norm gives one; level-crossing
  replacement underpasses drop the road by the whole clearance plus structure, e.g. Studénka ≈ 4.67 m road to
  structure top plus an unreported track build-up, research/37 §7). Rebuilt-railway-bridge lowerings in the sample were only 0.65–1.40 m, but
  they needed only that much.
- Drainage of the low point (TP 83 §6.1: by gravity where the fall allows, else pumped): two street gullies
  (OTSKP 89712) and either a DN 300 concrete pipe (9183A1) at 0.5 % fall (PROVISIONAL: TP 83's ditch minimum)
  from 1 m below the low point (PROVISIONAL: no sourced pipe-cover rule) to ground along the crossed way within
  500 m, with an outlet head (89516); or a concrete wet well (894146), a duplex packaged pump chamber
  (74,355 CZK, equipment only: installation and the power connection are not included, PROVISIONAL, no
  installed price was found) and a rising main to where a ramp ends (DN 300 plastic pipe 9183A3 as a proxy).
  The gravity check is a terrain screen (ground lower than the pipe's invert), not the recipient water level
  and invert check research/37 asks for. Groundwater is not modelled.
- The cut ramps are priced per metre at the crossed road's SPK rate, like bridge-over-us ramps; side roads
  joining them are regraded or walled exactly as for model 19's ramps (`crossing-works.ts`).
- A player may choose an underpass down to 6 m below the box's height; Auto uses it wherever it is cheapest
  (`underpassFits`, `underpassPrice`'s estimate, then the measured geometry).

**Other rules.**

- A bridge over us may slope like the road it carries (class gradient, or the old road's own slope across
  the deck): it clears our road under the whole deck but the ground only at its abutments. A level deck on a
  valley side left one end high in the air and its ramp far too long.
- **A reroute leads to a crossing that carries traffic over or under us** (a bridge, tunnel, junction, box or
  bridge over us) or to a route end, never to another cut road (playtest-qa P1 #13: a track "rerouted to the
  nearest crossing at km 9.47", where the track at 9.47 was itself cut and rerouted on to km 9.83). Main had
  152 such chains on the audit designs (`reroute-audit.ts` now counts them), this model none. Auto
  reconsiders the dearest treatments first, so that a crossing others are then rerouted to keeps carrying
  them, and looks once more at those that found no target while another crossing still led to them. A
  bridge over us or a junction anchors reroutes on its old line beyond its ramps (it could not before when
  the ramps reached the end of their short rebuilt stretch).
- A selected crossing outlines all its works on the map (rebuilt stretch, new roads of a reroute, regraded
  side roads), and its mark stands on our road where the crossed road is cut (it floated at the removed
  road's old level above a cutting).
- Auto prefers a treatment other than a box whose kept way runs straight back under our earthworks within
  100 m beyond its rebuilt stretch (along our slope on one side, not across our road again): that stretch
  would still have to be walled or moved, while a reroute takes it with it. Such a box is kept only when
  nothing else can be built. (Applied to bridges over us too, it rerouted one leg of a class I road that
  winds across ours four times on direct-80, leaving its next crossing a 178 M bridge: boxes only.)
- A first drag of a reroute starts from the automatic path's own bends simplified to within 2 m
  (`SHAPE_TOLERANCE`; median 6 bend points per crossing).
- Auto reroute candidates that cannot be worth it are not built: a reroute never costs less than the
  straight lines between its anchors, and once one side is built its measured price stands in for it.

**Results** (bn CZK, model 21 → 22; all published designs VALID on their own, also the straight start line):

| Design | Model 21 | Model 22 | Main reasons |
|---|---:|---:|---|
| straight | 9.810834 | 9.844321 | +33.5 M. Was VALID only because reroutes were unchecked; km 16.58 local road 2244: a silently unbuildable reroute (a railway between it and the next crossing) becomes a 75 m box with the road lowered 3.3 m (89 m of ramps, gravity drain), 33.6 M. Steep track reroutes become boxes or bridges over us (km 4.55 +11.8 M, km 4.64 +8.0 M, km 6.56 street +9.0 M); lowered boxes save at km 18.24 (−11.2 M) and km 6.32. |
| best | 4.175179 | 4.129413 | −45.8 M: lowered boxes replace bridges over us or reroutes at km 3.69 (track lowered 5.8 m under our road at grade), 6.31, 8.19, 17.64, 18.98 (−29 M); km 9.93 track reroute 13.0 → 0.3 M (its own crossing's neighbour now carries it). |
| demo | 4.712958 | 4.669186 | −43.8 M: km 7.96 service road 41.7 M reroute → box with the road lowered 0.7 m (17.6 M); lowered boxes at km 4.44 and 19.29; a 22.3 M track bridge over us → 12.3 M reroute at km 4.00; chains broken at km 2.60 and 6.89 (+8.1 M). |
| direct-80 | 4.824952 | 4.816992 | −8.0 M: lowered boxes save 35 M (km 1.24, 2.15, 6.73, 15.29); unbuildable steep reroutes become bridges over us or boxes (km 6.55 +16.6 M, 4.62 +14.1 M, 5.68 +11.5 M); km 14.34 street reroute engineered (+8.4 M). |
| direct-90 | 5.446206 | 5.494864 | +48.7 M: track diversions on ground steeper than a track may be become bridges over us or boxes (km 8.26 +27.7 M, 5.71 +10.3 M, 8.93 +6.7 M) or engineered longer lines (km 9.80 +12.9 M); a lowered box saves 17.5 M at km 1.25; km 5.67 −7.7 M. |
| town-centre | 11.296878 | 11.388358 | +91.5 M: km 10.11 track 3637: the 1.5 km reroute (21.5 M) runs on ground far steeper than a track may be; a 148 m bridge over the cutting (89.5 M). Km 15.98 service road 5162: 43.0 M reroute → box with the road lowered 2.9 m (17.0 M). Km 4.90/4.98 street reroutes (one too steep to build, the other 43 M once engineered) → boxes with the streets lowered 1.7 m (+12.1 M). Km 6.29 track no longer chained (+11.5 M). |

Frozen fixtures recaptured (`eval-regression.ts --capture=current --reviewed-model-change`): the six above;
best-drag −67.4 M, best-pin −44.3 M, best-structures −51.2 M and best-manual −45.8 M move with best (the same
lowered boxes; best-manual stays invalid by its manual grade), town-controls +91.5 M with town-centre (stays
invalid by its player overrides). `tests/fixtures/service-loop-design.json` is now VALID: the service road is
lowered 4.4 m under a box and the class III road joining its ramp is regraded (41 m); the model 19 engine
gap (closing a loop chord instead of rerouting it) remains in general. Service-overbridge fixture: the service
road is lowered 3.9 m under a box instead of a bridge over us with 180 m of ramps.

Audits (same 30 designs): `outcome-audit` violations 120 → 144 (invalid designs 21 → 22, all random ones;
the new violations are reported unbuildable reroutes that used to pass silently); `reroute-audit` 730
unbuildable of 871 → 7, all reported, of 511; chained reroutes 152 → 0.

**Performance.** The engineered reroutes and the search cost crossing-step time; offset by: reroute
candidates that cannot be worth it are not built (lower bound: the straight lines between anchors, then the
measured first side), a candidate whose first side cannot be built is not built further, the anchor of a
candidate is not refined or given works, only link ends compute anchors, the crossed road's line in
`crossing-works.ts` is bucketed on a grid (it was scanned per nearby segment), a reroute's survey is shared by
its two gradients, and smoothed lines / engineered reroutes are reused by the strict retry pass where our
footprint within 200 m of them is unchanged (`CrossingCache`). Auto's preference against boxes whose way runs
back under our slope also removes best's new strict retry. A/B interleaved against main 217cfa4 (`scripts/` designs, min of 12, under the exclusive browser lock;
host load ≈ 20): sums over the six saved designs 569 → 568 ms and 582 → 580 ms in two runs. Per design,
demo is ≈ 15 ms faster and best ≈ 4 ms faster (the strict retry pass now reuses reroutes), straight and
direct-90 ≈ 4–7 ms slower (their crossing step does more engineering, ≈ +7 ms). The review fixes below (finer
ground survey of reroutes, reuse tracked per consulted chainage) add ≈ 6 ms over the six designs (548 → 554 ms
against the tree before them, load ≈ 6; ≈ 5 ms of it the finer survey): net ≈ +1 % against main, within
run-to-run noise.

Review fixes (deep review of this model): a reroute reused across passes is now invalidated by any change of
our footprint at the chainages its computation consulted (it compared only a window around its anchors: a
shaped bulge or a hairpin could reuse a stale plan); the ground between survey samples is profiled (a 1 m hump
between samples drew a 40 % piece); culvert cover sits at the stream crossing (not the nearest sample) and a
stream is billed once where two survey pieces meet; motorways met exactly at a piece boundary are caught; the
box decision probes the same points as its final check (a ridge between samples rejected a box a 0.7 m
lowering fits); Studénka's derived depth corrected to 4.67 m plus track build-up (research/37 §7); the
lowered-box card states the steeper ramp allowance; the works outline breaks where it leaves the view.

**Known remaining.** A very skewed crossing gets a box as long as its oblique path under our embankment
(town-centre km 15.98, 57 m); a designer would square it by realigning the crossed road near our road (done in
model 24 below). Groundwater, flood levels and utilities under a lowered road are not modelled; the pump
station is priced as equipment plus catalogue items without installation and power connection; cut ramps and
their slopes are priced per metre of road like bridge-over-us ramps, without their earth volume. A shaped
first drag can still start with a footprint violation when the player's override changes our road's
structure choice (1 of 12 sampled). Reroutes are not checked against buildings' gardens or other roads they
run along.

### Model 24: crossing remedies as designers choose them

**Problem.** With reroutes checked (model 22), Auto sometimes picked remedies no designer would: the D3
motorway starter went from 14.97 to 18.34 bn CZK. Km 14.18: a class III road running along the motorway
(crossing it at 14.18 and back at 14.52, never leaving its earthworks in between) was "carried over our road on
a 704 m bridge" (2.49 bn); km 7.94: a track crossing at 37° got a 117 m box (over the 100 m limit), its
unresolved stretch sent the evaluation into the strict retry, which put 150 m more of the motorway on a bridge
over two field tracks; km 3.63 / 3.71: two neighbouring tracks got a 2 km reroute (28 M) and a 54 M bridge.
Nová Paka km 3.3: 10 of 24 small drags of bend 2 failed (14 of 24 on core-play-polish's count), a dead-end
track stub under our earthworks merged into a street's crossing had "no room for a turning area", and a service
road whose box ramps were too long kept that infeasible box although a track's box stood 60 m away.

**What a designer does, and what Auto now weighs** (`crossing-geometry.ts`, `evaluate.ts`, `road-realignment.ts`):

- **A road that runs along ours is moved beside it.** Crossings of one way that never leave our earthworks
  (and the strip a new road keeps clear of them) between them are one crossing (`evaluate.ts`, like the
  existing 150 m same-way merge). Where the way comes back out on the side it went in, it needs no crossing:
  Auto weighs moving it beside our earthworks (one new piece of road from where it enters to where it leaves,
  engineered and checked like a reroute, no new access) against keeping a crossing for it, the roads led to
  that crossing then led to the nearest other one and priced together. A parallel accompanying road
  (*doprovodná komunikace*) is ordinary practice on Czech motorways (research/45: D35 field roads "zkrácení a
  napojení na východní doprovodnou komunikaci"). Outcome "Moved beside our road (+N m of new road)".
- **A skewed crossing is straightened.** A crossed road meeting ours at less than 70° (`SQUARE_BELOW`: ŘSD R 111
  treats crossings under 70° as non-standard; no Czech norm gives a minimum bridge angle, research/44; the
  angle is that of the line from where the way enters our corridor to where it leaves it) may be laid on a new
  line: a straight run square across our earthworks, joined on each side to the old way by one smooth bend no
  sharper than the class's smallest radius (`minRadius`: track 25 m, service roads and streets 27 m, class I–III
  90 m; research/44), as near our road as that allows, never past another road joining the old way (it would be
  cut off). The bends must stay off our earthworks and are surveyed like a reroute (rivers, railways, motorways,
  ponds, houses, no steeper than the class's justified maximum). The box or bridge over us and its ramps are
  built on the new line; the new road beyond them is billed at the class's SPK rate per metre with its culverts
  (`realignCost`); the old stretch is removed. Auto builds the square variant of a box or a bridge over us only
  where it can pay (the old line's treatment is infeasible or costs more than the square structure's least price
  plus the new road's least length), and not where the old one failed for its height or ramps (the same ground,
  the same height). The player can keep the old line ("Keep its line") or straighten a skewed underpass or bridge
  over us ("Straighten it"); `CrossingOverride.square`. Outcome "…, the track straightened to cross at a right
  angle", with the old angle and the new road's length on the card.
- **Neighbouring minor roads share one crossing** (research/45: no Czech spacing or detour rule; consolidation
  onto service roads and neighbouring crossings is documented practice). After the first look, a consolidation
  pass (up to three rounds) leads a track's or service road's own structure (and the roads already led to it) to
  a neighbour within 750 m that began carrying traffic after it was weighed, and a reroute to a markedly nearer
  crossing (0.8 of the distance), wherever that is cheaper; a reroute whose crossing stopped carrying traffic is
  weighed afresh. A crossing others are led to may itself be led on when nothing else can be built there.
- **A reroute joins its target's road where it comes nearest** (on the ground beyond any ramps), not only beside
  our earthworks at the crossing (a track 12 m from the next track that crosses is joined to it by 12 m of
  track), where that line is markedly shorter (0.8) and buildable; otherwise the line to the crossing.
- **A reroute's earth slopes take ground too**: where its profile leaves the ground the 1:1.5 slopes (as drawn)
  are checked for houses (bought out) and railways, ponds, rivers and kept houses (any-road-editing's review).
- **A dead-end stub our earthworks take (almost) whole is removed** with the land it served: one whose part left
  outside them is shorter than the turning area its cut end would need (`road-realignment.ts`; "removed (a dead
  end under our earthworks)").
- **Our bridge is lengthened over a crossing with nothing buildable** under an embankment high enough for it
  (≥ 6 m): such an automatic crossing's way is retried with ordinary rules, which put our road on a bridge over it.
- "Underpass: no box fits here" replaces "Underpass: 0 m concrete box" (QA-2 re-test 4).

**Results** (bn CZK, main a8d8de5 (model 23) → model 24; all VALID unless noted):

| Design | Model 23 | Model 24 | Main reasons |
|---|---:|---:|---|
| straight (D11) | 9.844321 | 9.838031 | −6.3 M: km 18.24 box straightened (36 → 17 m), shorter reroutes at km 2.14 and 11.92; km 5.41 service road's cut ends already lie on km 5.38's road ("Joined to the crossing at km 5.38 (no new road needed)"). |
| D3 motorway starter | 18.337155 | 14.902841 | −3.43 bn: km 14.18 class III road moved beside the motorway (700 m, 18.6 M) instead of a 704 m bridge (2.49 bn), its second crossing at 14.52 one with it; km 7.94 track straightened through a 50 m box (17.8 M), no strict retry, so km 7.67–7.77 and 7.90–7.95 stay earthworks; km 7.69 track joined to it; km 3.63 track joined to km 3.71's bridge (237 m, 3.3 M; its 2 km reroute was 28.2 M); km 3.84 box straightened 95 → 42 m. |
| best | 4.129413 | 4.100085 | −29.3 M: tracks at km 2.51 and 9.04 joined to the next crossing's road 14 / 12 m away (−17.8 M), km 6.97 service road moved beside us (−3.7 M), km 19.65 bridge over us straightened. |
| demo | 4.669186 | 4.656154 | −13.0 M: km 2.48 track joined 14 m away (−8.5 M), km 8.81 shorter reroute. |
| direct-80 | 4.816992 | 4.774720 | −42.3 M: km 13.50 class I road moved (−7.6 M), km 3.81 / 7.13 tracks joined 11–12 m away, km 5.65 box carries km 5.68's track, km 6.20 bridge straightened, km 12.26 service road rerouted instead of a bridge. |
| direct-90 | 5.494864 | 5.465526 | −29.3 M: km 8.26 bridge over us straightened (83 → 50 m span, −15.8 M), shorter reroutes at km 2.56 / 3.82; km 9.80 a bridge over us (its reroute is now found to bury houses with its slopes, +2.1 M). |
| town-centre | 11.388358 | 11.353089 | −35.3 M: km 10.11 bridge over the 31 m cutting straightened (148 → 125 m, −19.0 M), km 7.82 box straightened (68 → 52 m), km 15.98 service road straightened (57 m box → 25 m, the future improvement of model 22), km 4.90 street rerouted 97 m instead of a lowered box. |
| D11 railway Královec | 14.691344 (1 violation) | 14.516896 (1) | −174 M: boxes straightened at km 10.48 (98 → 58 m), 19.49; km 9.50 track joined 12 m away; km 8.13 service road led to km 8.21's bridge. The violation (a stream at km 18.20) is not a crossing. |
| D3 road (default/reference) | 4.708147 | 4.643470 | −64.7 M (road sections). |
| D35 road / motorway | 5.967781 / 19.322088 | 5.965575 / 19.322088 | −2.2 M / 0. |
| Nová Paka (default/reference) | 2.693238 | 2.502167 | −191 M: the tracks and service road at km 3.4–3.6 share the km 3.41 box; shorter joins at km 1.92, 1.56 (moved). |

Nová Paka bend 2 (km 3.3), 24 seeded drags up to 25 m (`scripts/small-drag-audit.ts`): invalid 10 → 1 (the one
left: 1 m of a service road beside our slope that its relocation cannot clear: footprint walls, core-play-polish).
D11 drags of every bend (2 each): demo 9 → 8, direct-80 15 → 14, direct-90 8 → 8 invalid (all left are footprint
or stream conflicts, and track 4843 at km 9.8, in a shallow cutting 90 m before a viaduct on ground too steep for
a track: no reroute, bridge or box fits; the same track on the d11-railway preset, km 9.44).

Frozen fixtures recaptured (`eval-regression.ts --capture=current --reviewed-model-change`): the six above;
best-drag −32.3 M, best-pin −29.2 M, best-structures −29.1 M and best-manual −29.1 M move with best (the same
joined tracks, the moved service road; best-manual stays invalid by its manual grade), town-controls −34.6 M with
town-centre (stays invalid by its player overrides).

Audits (straight + five published + 24 random designs): `outcome-audit` violations 124 → 112 (invalid designs
22 → 22); `reroute-audit` links 511 → 558, with a problem 7 → 1, railway crossings 2 → 0, steeper than allowed
3 → 1, earthworks over 10 m 3 → 1; chained reroutes 0 → 0; `crossing-audit` 0 geometry errors;
`crossing-footprint-audit` overlaps of crossing works with other roads 238 → 201.

**Performance.** The square variants, the consolidation pass and the joined lines build more candidate reroutes
(best: 6 → ≈ 17 per evaluation on top of the first and final builds). Offsets: a build memo per evaluation
(each way's stretch through our earthworks, its straightened line, the geometry of a crossing built only to
anchor candidates, anchors per line and width), the consolidation pass tries only what the first look could not
see, allocation-free deck and box-floor searches, lazy anchor lines, and slope queries memoised. See the timing
table in `docs/evaluate-performance.md` § Model 24.

**Known remaining.** The straightened line is draped on the ground beyond its ramps (its profile is checked, not
drawn engineered). A bend's radius is that of a cubic curve, at least the class minimum, not a circular arc with
transitions. Squaring keeps the crossing at its station; a designer might also move it along our road to a lower
embankment. A crossed road already meeting ours at 70° or more is not straightened. Merged crossings of different
ways within 30 m keep one remedy for the group; a member's own stretch is rebuilt beside our earthworks, closed or
removed by the footprint pass (model 16), not given a crossing of its own.

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
