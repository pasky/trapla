# Editing any road — plan and state

Owner request (verbatim): "big UX update to allow changing any road on the map, not just the main one —
i think this might require switching to a bit different basic UX as we do not have a single road anymore",
and "selectable during building so i can reroute a railway when building a highway". Bar: a polished,
cohesive experience, usable end-to-end on D11 and the new scenarios; no foundation presented as done.

## 1. UX decision (replaces the Change road / Apply stub)

**Every road on the map behaves like our road.**

- **Hover** a mapped road: the cursor says it can be dragged. **Click** it: it is selected (one card: name,
  class, the stretch that would be rebuilt highlighted, "Drag it to change its line"). Nothing is created.
- **Drag** it: that stretch becomes a project road at once and bends under the pointer, exactly like our
  road (same gestures, no modifier keys, one undo step for the whole first drag). No Apply, no form first.
- **Which stretch.** From the grab point to the nearest junction on either side (a node where another road
  joins), passing junctions closer than 150 m so a grab next to a junction is not a 20 m stub; at most the
  mapped way. Its two ends are drawn as end handles while it is active; drag them along the old road to
  lengthen or shorten the rebuilt stretch afterwards. Ends stay on the old road (position and height).
- **First edit = explicit conversion.** The map line becomes a designed line of bends at that moment; the
  card says so in plain words and shows how far the new line strays from the old road. The old road is
  still drawn until the change is checked and accepted, so nothing disappears silently.
- **Profile and price follow at once**: Auto heights, by-hand heights, the road's own price (≈ during
  the drag). Where the engine cannot check something yet the card and score say so in plain words
  ("Not checked yet: …"); there is never a green verdict or best score for an unchecked project.
- **Rules by class.** A rebuilt class I road uses S 9.5, class II/III S 7.5, at 70/80/90 km/h (card).
  Local roads, service roads and tracks keep the drag and the line, but say "No design rules for this kind
  of road yet" until sourced local/track policies exist (ČSN 73 6110 / 73 6109, research/20).
- **Traffic** is pre-filled, never asked for: a rebuilt stretch starts with the count of its own section in
  the ŘSD traffic census 2025 ("Counted in the 2025 traffic census."), a road the census did not count and a
  road built with Build → Road start with the average road of their class ("Not counted in the traffic census:
  the average class III road is assumed."). The two fields stay editable in the road's card; the player's own
  number carries no label. Never copied from the mission. (§9, research/40, research/41.)
- **Build → Road** (top-left): click where it starts and where it ends. A click on a road joins it there; a
  click on empty ground leaves a free end ("Road ends nowhere / Connect both ends to a road"). The road is
  created straight and bent like any other. Motorway/Railway stay hidden until the mode kernels land.
- **Switching roads**: clicking a road on the map selects it and makes it the one the profile shows. The
  top-left list appears only when the project has two or more roads; with one road there is no dropdown.
- **Missing road links** (a pack without the transport sidecar, D11 today): clicking a mapped road shows
  "This map's roads cannot be changed yet: its road links are missing." Never a silent no-op.

## 2. Pricing (C1, ordered as docs/multi-road-plan.md §9)

1. **(a) Tie-ins.** A road end on an existing ground road is a junction work of the new road: T (Auto) or
   roundabout (choice), priced once (research/08, research/29), using the endpoint-junction zone of
   scenario-declared junctions (S, `ENDPOINT_JUNCTIONS`) so the joined road's rebuilt pavement inside the
   zone is part of the junction, not a conflict. Checks: no at-grade junction on motorways/expressways;
   class-I spacing 1.5 km to existing junctions (research/12), an existing junction rebuilt in place is
   allowed; approach gradient (PROVISIONAL, research/29); sight triangle by host speed (research/29).
   The host's traffic and noise are unchanged and say so. Two roads on the same host stretch interact.
2. **(b) Replacement.** The rebuilt stretch: new-build engineering by the kernel against the network
   WITHOUT its own old stretch (no self-collision); removal of the old pavement where the new line leaves it
   (OTSKP removal + topsoil restoration, research/30); land only beyond the old road; every branch the old
   stretch carried reconnected (link + junction) or reported, never dropped; accepted replacements removed
   from the map, crossings and footprints together. Noise: relocated alignment = new-road limits,
   same-alignment rebuild keeps the existing-road limit (research/30).
3. **(c) Interacting roads.** One owner per shared work, one buy-out per house, combined noise as energy
   sum per receiver height on the noise agent's finite-segment physical sources, limit of the prevailing
   source (research/31), project-level buy-out/wall decision before the ledger. D11 single-road bills
   stay bit-exact (eval-regression through both paths) or come with a reviewed COST_MODEL_VERSION bump.

## 3. Milestones (each committed green; parent merges)

- **E1** Route switching that scales (no dropdown for one road), Build → Road with snapping ends, new
  roads editable and profiled; mapped-road click/drag replaces the Change road stub; missing-links card.
- **E2** Rebuilt stretch evaluated by the kernel without self-collision; end handles along the old road;
  traffic field; local-road/track honesty.
- **E3** C1(a) tie-in pricing → a separate side road joined to the network is priced with our road.
- **E4** C1(b) replacement pricing.
- **E5** C1(c) combined noise / shared works (after the noise agent's source model lands).

Research added for this work: research/29 (tie-in junctions), research/30 (rebuilding a stretch),
research/31 (noise from several roads). Screenshots: next free numbers after the merged galleries.

## 4. State (2026-11-15, branch side-agent/any-road-editing)

Playable now (D11 with its road links sidecar, D3, D35, Nová Paka):

- **Any mapped road**: click selects it (card, highlighted stretch, no edit; Esc closes). A drag on the
  highlighted stretch rebuilds it in one undo step (`ui/mapped-road.ts`, `ui/road-edit.ts`): exact source
  claim and every branch kept as a connection (core promotion), its line converted once into bends that
  follow the old road (`fitBends`: Douglas–Peucker 8 m, bends closer than 80 m merged; the card says how far
  the new line strays), then bent under the pointer. Class I → S 9.5, class II/III → S 7.5, 70 km/h at
  first. Local roads, service roads, tracks, motorways, bridges, tunnels and railways are refused with a
  plain reason. A stretch stops 5 m short of a level crossing or a joining bridge/tunnel. Undo restores the
  untouched project exactly. Its two ends are drag handles along the old road (`ui/stretch-ends.ts`): one
  edit; bends inside are kept, newly included old road gets its bends, pins/structures/walls shift with the
  start, hand heights return to Auto with the pins.
- **Build → Road** (`ui/build-road.ts`): click start and end; a click on a mapped road joins it, on our road
  (or another new road) joins it at that point, on open ground leaves a free end ("Road ends nowhere").
  Refusals in plain words (motorway, bridge, tunnel, railway, off the map, a stretch being rebuilt).
- **Road list** only with two or more roads; a click on a road selects it. A side road's card: what it
  is, its traffic (explicit field; until set: "Traffic not set", unpriced), its works, Remove road / Keep
  the old road. A pack without road links says so in the card.
- **Kind-generic hooks** for motorway/railway (`ui/route-kinds.ts`): `registerMappedLineKind`
  (rebuildable verdict, atomic promote command, moving ends) and `registerBuildKind` (end on a mapped
  source, end on a project route, create). The Build menu lists exactly the registered kinds.

Priced now (core):

- **(a) Ends on existing ground roads** (`core/tie-in.ts`): one junction per end, billed in the road's
  own bill through the endpoint-junction zone (`ENDPOINT_JUNCTIONS` `tie-in` 25 M onto class I/II, `tie-in-
  minor` 7 M PROVISIONAL onto minor roads; 30 m zone, MODELLING ASSUMPTION). Checks: no at-grade end on a
  motorway/expressway; class I spacing 1.5 km to existing junctions and to its own other end (an existing
  junction rebuilt in place is allowed); grade ≤ 6 % in the junction (VL 3 to ČSN 73 6102); sight triangle
  XB/XC by the joined road's legal speed (90/50, Act 361/2000 §18), eye 3.0/2.5 m behind its edge, on our
  designed grade, the seen car on the joined road itself, ground or a house within 0.25 m of the line blocks.
- **(b) A rebuilt stretch** (`core/project-replacement.ts`): engineered by the kernel against the network
  without its old stretch (`RoadNet.without`); old pavement removed where the new road leaves it (OTSKP
  113131 + 11333 + 18231 + 18242, research/30; layer thicknesses PROVISIONAL); every side road that joined
  it stays connected (a crossing/rebuild the kernel already does, else a straight link at its class's SPK
  rate plus its junction/access); ends continue as the old road (no junction). Once the project is priced
  the stretch is accepted: the old road leaves the map, crossings and picking.
- **(c, first part) Ends on another designed road**: the end follows that road's current line; the
  junction is built and billed by the side road, checked for spacing (that road's ends and junctions count),
  grade, bridges/tunnels and sight against the designed road; the side road's first metres inside that
  road's earthworks are credited (not built twice); their meeting is no longer an unchecked crossing and
  the land test ignores the junction area.
- **Old road land** under a rebuilt stretch is not bought again: the road authority owns its road land
  (Act 13/1997 §11, research/30 §3). Cadastral widths are unknown, so only the old pavement's study width is
  credited (the least it surely owns), at the land price the new road paid there.
- **Roundabout** as a junction choice per end (the side road's card: Auto / Roundabout). Auto stays a
  priority T: no norm found that requires a roundabout by class (research/29 §1). 32 M CZK (ŘSD awards,
  research/08), a 40 m ring (middle of the 30–50 m PROVISIONAL envelope) whose land beyond the joined road
  and houses on it are priced with the junction; offered on class I–III/local roads and on our road; no T
  sight triangle at a roundabout (its entries see around the ring, TP 135; not modelled).
- A project of independent roads is priced (`screenIndependence`): our road + a side road / rebuilt
  stretch anywhere their land, roads, houses and noise do not interact.

Not yet (honest in the game):

- **Combined noise** (C1 c), prepared in `core/project-noise.ts` (tested with a synthetic decider): energy sum
  per storey across physical sources, the prevailing road's limit, the cheapest single wall on the prevailing
  road (walls built for earlier houses count) else one buy-out. Wiring once noise-walls-seams merges:
  1. `screenIndependence` keeps land/road/building interactions; its `shared-noise` houses become the
     candidates (plus houses a road removes that another hears: one buy-out, credited to the second road).
  2. `NoiseDecider.sources(j)`: for each road whose bound reaches j, `pointTransfer` over its
     `Result.noise.source` with its built walls `noise.L/R` plus project walls, every storey (receivers
     1.5 m above each floor) → `SourceAtHouse` with 60/50 limits.
  3. `tryWall`: that road's wall heights raised to h over ≥ 2× the house distance around its nearest
     station on the facing side (where `gap`/`shield` allow), area added × `NOISE.wallPerM2`; commit keeps
     the raised arrays for later houses.
  4. Walls → a `noise` work of that road, drawn from its raised arrays; buy-outs → a `property` work of the
     prevailing road; `ProjectReceiver.contributions` per storey; `acousticScreen.complete` with the
     screen's omitted-energy bound.
- **Combined noise**, today: two roads whose noise reaches the same houses stay unpriced ("These roads
  affect each other"). In D11 that is most side roads within ~3.6 km of our road. Waits for the noise
  agent's per-house, per-storey energy per physical road; then energy sum at each receiver, limit of the
  prevailing road (research/31), one buy-out per house, project-level walls.
- Road crossings between designed roads (bridge/underpass), shared works beyond junctions.
- A rebuilt alignment is assessed with new-road noise limits (it is relocated, research/30); traffic for
  mapped roads is the player's (CSD 2020 census per way could prefill it later).
- ČSN 73 6102 turning-lane lengths; local-road/track design rules; a roundabout's own entry visibility.
- Rebuilding across several mapped ways (one way per stretch today).

Gates on 3c749f8 (main 7a7a13f merged, cost model 20): any-road-scene on D11 and D3 PASS (D11: a rebuilt
Jičínská stretch priced, total 10.114 bn CZK with removal 71 m, land credit 1233 m, a track reconnected; D3:
5.032 bn CZK, removal 400 m, a street reconnected by 33 m of new road), smoke (36 PASS), playtest (50 PASS),
GPU drag gates bend/road/radius/pin/vpi/link all `--check` OK (frame p95 17 ms; preview p50 28–35 ms, p95
43–81 ms) on a quiet machine, bench (5 saved designs VALID), outcome-audit run, eval-regression (11 frozen D11
bills bit-identical), vitest 598. Screenshots 100–105 inspected.

## 5. Handoff (2026-11-16, after main 217cfa4)

Branch `side-agent/any-road-editing` = main 217cfa4 (merged by fast-forward; the finish script's rebase
cannot replay this branch's merge commits — when main already is an ancestor, fast-forward main directly).
Packs: copy `public/scenarios/` from the main checkout (D11 has its road-links sidecar). Browser/GPU runs are
serial: ask the parent for the slot; `pgrep` wait loops match their own command line, filter by cwd.

Map of the code: `ui/road-edit.ts` (stretch, `fitBends`, `rebuildCommand`, `newRoad`, `moveStretchEnds`),
`ui/route-kinds.ts` (kind registry, `buildInProject`), `ui/mapped-road.ts`, `ui/build-road.ts`,
`ui/stretch-ends.ts`, `main.ts` (`rebuildByDrag`, `placeAt`, `inspector.routeHead` side-road card,
traffic/junction/works UI); core: `project-road.ts` (cut network, tie-ins, ring works, `unpriced`),
`tie-in.ts`, `project-replacement.ts`, `project-evaluate.ts` (order by hosts, designed junctions, units,
works ledger, combined-noise hook), `project-noise.ts`, `RoadNet.without`. Tests: road-edit, tie-in,
project-noise, route-kinds. Real-mouse: `scripts/any-road-scene.mjs` (D11 default, `SCENARIO=d3`).

Follow-ups requested by the parent (in order, each end-to-end polished):

1. **No inherited violations after the first drag** (screenshot 101: "Bends 3 and 4 too close for an S-bend").
   `rebuildCommand` currently uses S 9.5/S 7.5 at 70 km/h and `fitBends` (DP 8 m, merge < 80 m) with r = null.
   Wanted: category/speed from the road's class and `maxspeed` tag (`groundRoadSourceInfo().taggedSpeed`;
   game rules exist for 70/80/90 only — below 70 needs sourced local-road norms or clamp to 70 and say so),
   then a bounded validity-first repair of the fitted bends (see `scripts/repair-designs.ts` and the
   scenarios' bounded repair, research/27) within a tolerance from the old line; where the old road itself
   cannot meet the norm, report it as inherited in plain words ("the old road is tighter than the norm here"),
   e.g. a separate violation basis/title, not the generic bend violation.
2. **Traffic default**: research the ŘSD national census (CSD 2020/2025; research/30 §5 found a free XLSX of
   RPDI per section and a map, no shapefile; research its section geometry/IDs and how to match a mapped way:
   same road number `ref` + nearest section). Pre-fill `operations` from it per mapped road; else an explicit
   class-based GAME PRIOR (labelled in the card). Remove the red "Traffic not set" (keep the field editable;
   `trafficUnknown` stays for honest unknowns only if no prior applies). New roads: prior by class too.
3. **Rebuilt Jičínská flat in a ~6 m cut for 0.85 km** (screenshot 104, D11, any-road-scene's road): find
   why. Suspects: end heights (`project-road.ts` `explicitZ` compares endpoint z with terrain — source
   positions come from `ProjectTransportIndex.position` = terrain, so should be equal), the cut network
   (`RoadNet.without`) leaving a crossing that forces depth, vertical-curve minima at the chosen speed, a
   grade pin, or the screenshot showing a preview result. Reproduce in Node: build the project like
   `tests/road-edit.test.ts` / earlier `_try-rebuild` scripts on D11 (pack + transport.json.gz +
   `sourceWays` from `legacyNetIndex`), print grade vs ground and crossings. A rebuilt road should hug the
   old road's profile where it can (consider pins seeded from the old road's ground at the fitted bends).
4. **Combined noise** once noise-walls-seams merges: implement `ProjectEvalContext.combinedNoise` with their
   `pointTransfer` on `Result.noise.source` (steps in §4), pass it from `worker.ts`, draw project walls.
   Motorway-rail will hook Build → Motorway/Railway into `createInProject` / `registerMappedLineKind`.

Gates before every merge: tsc, vitest, build, eval-regression (11 D11 bills bit-identical), smoke, playtest,
drag-perf `--gpu --check` for bend/road/radius/pin/vpi/link, bench, any-road-scene on D11 and D3; screenshots
from 106 on (100–105 used; 110–139 belong to other streams), inspect them.

## 6. Edited network (2026-11-16, commit 7ad2c26)

Owner's D3 bug: III/1057 rebuilt away from our bridge, yet our motorway still reported "A bridge pier stands
on a class III road" and an at-grade red ✕ where the new line crossed it. Fixed in the engine:

- **Every road is checked against the map as the player edited it** (`core/project-roadnet.ts`,
  `RoadNet.edited`): every rebuilt stretch is cut out of every road's network (several cuts per way allowed)
  as soon as its new line is engineered — priced or not (`acceptedReplacements` now means "gone from the
  map": render, picking, every road's crossings, piers, footprint). "Unpriced" only withholds the total.
- **Designed roads are crossed by the same crossing engine as mapped roads.** Each designed side road is a
  way of its class at slot `netSize + k` (k = its index among `designedSlots`) in the network of every road
  that outranks it (motorway/railway > mission road > side roads by class I > II > III > earlier in the
  project), except roads joined end to end (their junction handles them). Auto picks bridge / its bridge over
  us / underpass / junction; a designed road is never cut and rerouted (`resolveCrossings` `designed`). The
  owner bills the crossing; the crossed road is evaluated after its owner with a height band at the crossing
  (`EvalOptions.holds`: under our bridge ≤ grade − 6 m, on its deck ±0.5 m with its own bridge over the
  span, level in a junction/underpass), a violation if By-hand heights miss it (PROVISIONAL slack 0.5 m), and
  a credit for its own body on the owner's bridge (deck + ramps are the owner's work). The crossing zone is
  that work's land in the independence screen; the owner's crossing geometry is not drawn or screened for a
  designed road (it draws itself). Crossing choices on a designed road are stored as
  `{ kind: 'route', routeId }` (`crossingOverridesOf` / `crossingTargetsOf`; pack net size registered per
  objectData by the evaluator; a choice on a removed road is dropped). Card: the road's name, no "Cut and reroute".
- A side road's violations say "its start/end", never the mission's A/B (card and map, previews too).
- Tests: `tests/edited-network.test.ts` (cuts/slots, overbridge + deck + credit, stored choice, end words,
  and the exact D3 case on the pack, skipped without it). D11 bills bit-identical.
- Still blocking a priced D3 project with that rebuild: shared noise (combined noise waits for
  noise-walls-seams, §4), a shared-land touch at the stretch's start with the motorway's 127 m wide earthworks,
  and a coarse shared-road screen (both touch way 1489 at different places).

Remaining, in the parent's order (2026-11-16): **B** road-level settings (traffic, junction choice) visible on
the road's card whenever it is selected, not hidden under the bend card; **D** (= follow-up 1) no inherited
violations after the first drag; **E** (= follow-up 2) census traffic: `pipeline/fetch_census.py` +
research/40 (ŘSD Geoportal CSD 2025 layer, EPSG:5514 lines, `CIS_SU`/`PSILNICE`/`SV`/`TV`; note the script keeps
only `paths[0]` of multi-path sections — fix before use); class III roads such as 1057 are often not counted
→ labelled class prior; remove the "Traffic not set" issue entirely; name roads the Czech way ("road III/1057"
or its name); **F** (= follow-up 3) flat 6 m cut. Then the owner's exact D3 steps in a real-mouse scene, a
first-time-player pass, and playtest-qa on the integrated tree before merge.

Review of 7ad2c26 (deep reviewer), fixed in the next commit: crossing choices on designed roads now map in the
editor too (main thread registers the pack's net size), cache key carries route ids, a split motorway's shared
crossing holds nothing new (no 30 m de-duplication of distinct crossings), owner-first ordering falls back to
end-hosts-only order on a cycle, overlapping crossing credits count each cell once, the deck span is not divided
by the skew twice, the census fetch fails on ArcGIS errors and keeps every part of a section (`lines`).
**The rest of that review, fixed 2026-11-16:** (2) the geometry pass never turns a crossing with a designed
road into a reroute (`crossing-geometry.ts`, `c.designed`); (3) every designed road is drawn in other roads'
networks, and held, on the line it is really built on: ends on another designed road resolved from that road's
result (`followEnds`), or from its plan when it is not evaluated yet (`planEnds`, same 10 m station sample); an
owner is evaluated after the roads its crossed roads end on where the order allows; a hold is a point (x, y) placed
on the held road's own line when that road is evaluated; (5) what is left of a cut road after rebuilt stretch q is
way `size + designed slots + q` (`RoadNet.edited` `slot`, `rebuiltSlots`), and a choice on it is stored as
`{ kind: 'legacy-way', after: <that route> }` (a shaped reroute's `to` likewise as `toRef`), so it cannot shift;
saves from before (`size + q`) still map; (10) drag previews follow the roads the dragged road joins and keep the
heights and decks of the crossings built with it (`previewProjectRoute(…, last)`: the crossing is looked for again
on the dragged line within 300 m along the owner, kept while the owner still does the same there); (11) the
crossing picker skips a designed road's hidden `g.road`; (12) an edited network is an overlay on the pack's grid
(`RoadNet` `override`: only the cells its changed ways touch are its own; ≈ 2 ms instead of ≈ 10 ms on D3/D11),
`ground` is the same overlay without the designed lines, and the cache keeps the 12 most recently used.

**Not priced never hides what a road physically does (owner's D3 bug, 2026-11-16).** With road changes not priced
yet, houses under our motorway stayed standing on the carriageway and their card said only "Project noise check
not finished": `ProjectResult.buildings` was filled only for a priced project, and the map hides exactly that
list. Now `evaluateProject` always lists every engineered road's own outcomes (`ownBuildings`: under its works →
demolish, its own buy-outs, the player's Keep; each with `routeId`), priced or not; markers are drawn in every
state; a click on a house a road removes opens that road's card ("Demolished · … · In the motorway's way."); only
a house that still stands gets the visible note "Not checked yet: the noise of the project's other roads here."
while the project's noise is pending. Regression: `tests/edited-network.test.ts` ("a house under a road is
demolished whether or not the project can be priced") and `scripts/any-road-scene.mjs` (houses under our road stay
off the map and say Demolished while the project is unpriced; D3: 23 houses).

## 7. A rebuilt stretch: kept as the old road, or built anew (2026-11-16, follow-up 1 / item D)

Owner's case (D3 III/1057): right after the first drag the card showed "R 69 m: wanted 205 m, no room" and
"Bend 1 is too close to its start" for bends the player never touched. Decided with the parent:

- **Where the new line stays on the old road, the old road is kept as it is** (`core/project-kept.ts`): within
  12 m of the old centreline (`KEPT_TOLERANCE`, PROVISIONAL: the 8 m fit plus bend rounding) over at least 50 m
  (`KEPT_MIN_RUN`, PROVISIONAL). Nothing is built there, so: no norm (ČSN 73 6101 covers new roads, relocations
  and earth-body rebuilds; a repair keeps line and heights, Decree 104/1997 §9; research/30 §1), what the norm
  would ask is a non-blocking note on the road card ("The old road is tighter than the norm at bend 1: kept as
  it is. Move it off the old road and it must meet the norm."), every other finding wholly on a kept part is
  dropped (it is about works that are not built), its crossings, culverts and edge conflicts are the old road's
  (not listed), houses beside it are untouched ("The old road is kept as it is here: nothing changes for this
  house"), walls wholly along it are not built, and **everything the road's own bill charged for those cells is
  credited in one work line** ("975 m stay on the old road: kept as it is, not built anew"). No resurfacing is
  charged: nothing is done there. Removal, the old-road land credit and side-road junctions apply only where the
  road is built anew; kept parts add no land, no works and no noise source to the independence screen.
  `cost.alone` is a road's bill with its own works, so "This road only" shows what is billed.
- **The norm applies exactly where the player builds anew**: a bend (or a pair of bends) with any cell off the
  old road is an ordinary violation.
- **The conversion builds nothing anew** (`ui/road-edit.ts` `fitRoad`): `fitBends`, then a bend whose norm-sized
  curve would leave the old road by more than `REPAIR_TOLERANCE` (= `KEPT_TOLERANCE`; the parent approved 15 m,
  lowered to 12 m so a repair can never create a built-anew part) keeps the old road's own tighter curve (largest
  radius within 8 m), then a bounded validity-first repair (remove a bend of the first problem or slide it along
  a leg; ≤ 8 rounds; fewest problems, then least stray). D3: of 433 rebuildable stretches 158 had problems after
  the plain fit, 85 after the repair (those are kept-as-old-road notes); ≤ 60 ms, mean 5 ms.
- **Speed**: designed for 70 km/h, the lowest ČSN 73 6101:2018 allows for S 7.5 / S 9.5 (nominal 90, lowered by
  up to 20 where justified; research/00 §4.1); the map's `maxspeed` is the signed limit and is used for noise and
  travel time (`operations.speed`, `speedPolicy: 'independent'`). The card says so.
- D3 III/1057 untouched after conversion: valid, one note, 975 m kept, 0 CZK, priced with the motorway. Dragged
  40 m at its middle: 536 m kept, 438 m of old road removed, ≈ 34 M CZK.
- **Known limits**: a house whose loudest exposure is from a kept part is not re-checked against the adjoining
  new part; a dragged bend near the old road's side roads can still raise crossing findings of the player's own
  new line (e.g. "Ramps up to the bridge over our road would be longer than 250 m" for a track it now crosses).
  (§10 replaced the credit line and the Auto profile on kept cells: nothing is billed or drawn off the ground there.)
- Tests: `tests/road-edit.test.ts` "a rebuilt stretch inherits no violations from its old road" (conversion of a
  sharp corner; untouched = valid, note, nothing billed, house stays; moved bend = violation, billed), and the
  pricing test (kept credit equals the kernel's parts on kept cells).

## 8. Handoff (2026-11-16, HEAD after a145b9c)

Committed green (tsc, vitest 611, eval-regression 11 D11 bills bit-identical; D3 any-road-scene PASS after each of
the last two): `8776749` rest of the edited-network review (item 0), `30972c8` a side road's settings above every
card of that road (B), `a17f2fd` not priced never hides demolitions (owner's urgent D3 bug), `a145b9c` kept as the
old road / built anew (D, §7).

**Not verified yet**: drag-perf on item 0 (overlay network, previews with holds); the look of the road card (B),
of the kept note and the house cards (D, urgent fix) in screenshots; D11 any-road-scene after D (its printed
totals change: kept credit); the urgent fix on the D3 MOTORWAY preset in a browser (Node: 44 demolitions listed
while unpriced; the scene ran the D3 road preset: 23 houses stay hidden, card says Demolished).

**Browser protocol** (`/tmp/trapla-browser-protocol.txt`, no more asking the parent): timed runs
`flock -x /tmp/trapla-browser.lock node scripts/drag-perf.mjs --gpu --mode bend --check`; untimed
`flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/any-road-scene.mjs`; check afterwards that no chromium
with this cwd is left (`readlink /proc/$pid/cwd`).

**Next, in the parent's order:**

- **E (urgent) traffic default.** `uv run --with requests python pipeline/fetch_census.py` (rewrites
  `pipeline/cache/csd/sections-*.json` with `lines`), ship a per-pack sidecar through the pipeline (local metres =
  EPSG:5514 − `meta.json` origin; verify on a known road), match a mapped way by `ref` + nearest section, heavy
  share TV/SV; else a class-based GAME PRIOR labelled in the card (also Build → Road). Remove "Traffic not set"
  entirely: `UNPRICED['traffic-unknown']` (`project-evaluate.ts`), the `unpriced` list in `project-road.ts`,
  `unknownTraffic` (`ui/road-edit.ts`), `trafficUnknown` (`project.ts`, `project-validation.ts`; old saves must
  still load), the two fields in `main.ts` `inspector.routeHead`, `scripts/any-road-scene.mjs` (asserts
  `traffic-unknown` twice: after the first drag and after typing traffic; the "unpriced project" house check sits
  right after the first one and needs another way to be unpriced, e.g. the later Build → Road free end),
  `tests/road-edit.test.ts` (two expectations). Names the Czech way: `groundRoadSourceInfo` builds
  `${row.label} ${ref}` ("class III road 1057") → "road III/1057" (I/…, II/…, III/… by class) or its mapped name;
  same in `main.ts` `routeHead` `end()` and `route-kinds.ts` `roadName`.
- **F flat cut**: reproduce the D11 Jičínská stretch in Node (as `scripts/_d3-drag.ts` does for D3) and print
  grade vs ground; with §7 the kept cells are not billed, but the drawn body there is still the kernel's Auto
  profile, so "hug the old road" now mostly means: on kept cells draw/hold the ground (try `EvalOptions.holds`
  bands around the ground on kept runs; vertical-curve minima may make narrow bands infeasible — check
  `profileFeasible`), and find why the built-anew part sat flat in a 6 m cut.
- **G** combined noise: still waits for noise-walls-seams in main.
- Then all gates (§5), the owner's exact D3 steps with a real mouse (rebuild III/1057 near our bridge at km ~11.8;
  traffic is then pre-filled), a first-time-player pass (hidden inputs, internal labels, violations the player
  cannot act on, edits not reflected in checks; include the house cards of the urgent fix), screenshots 106–109,
  and playtest-qa on the integrated tree before merge. Merge main into the branch first, then fast-forward main.

Scratch (untracked, do not commit): `scripts/_d3-1057.ts` (D3 motorway project + context), `_d3-step2/3.ts`,
`_d3-drag.ts` (conversion + a first drag at several places: violations, notes, works, kept metres),
`_d3-houses.ts`, `_d3-fit.ts`, `_fit-time.ts` (all D3 stretches: problems before/after the repair, ms), `_parts.ts`,
`_net-time.ts`, `_syn.ts`, `_fit-prof*.ts`, `_fit-worst.ts`.

## 9. Traffic is pre-filled; roads are named the Czech way (2026-11-16, item E)

Owner: "how would a player invent this?" The "Traffic not set" issue is gone (no `traffic-unknown`, no
`unknownTraffic`); nothing creates `operations.trafficUnknown` any more, and a save that still holds it gets
the class average when it is opened (`project-persistence.ts` `settleTraffic`; the exact old save stays in
recovery).

- **Data**: `pipeline/fetch_census.py` (areas keyed by scenario id; road numbers keep leading zeros: III/00315
  is not II/315; national heavy share by class) → `pipeline/build_traffic.py` → `public/scenarios/<id>/traffic.json`
  (local metres, 18–64 kB; `meta.json` untouched, complete packs re-published like `build_transport.py`). The
  pack is gitignored: **after a merge run both scripts in the main checkout** (or the game falls back to class
  averages everywhere, labelled).
- **Game**: `Pack.loadTraffic()` (with the road links; never fails the load), `ProjectTransportIndex.census` /
  `.traffic(interval, class)`: the nearest section of the same road number within 50 m (`CENSUS_MATCH`,
  PROVISIONAL) of the stretch's middle, heavy share TV/SV; uncounted (`vehicles` 0) or no section → `CLASS_TRAFFIC`
  (I 9 613 / II 3 036 / III 736 vehicles a day, CSD 2025 class averages, Silniční obzor 9/2026; heavy 10.3 /
  7.5 / 6.4 %; GAME PRIOR, research/41). Nothing is stored about where the number came from: the card labels it
  while it still equals what the game would fill in (`isTraffic`); moving a stretch's ends re-fills a
  filled-in number for the new stretch and keeps the player's own.
- **Names**: `mappedRoadName` (core/terms.ts): the mapped name, else "road III/1057" ("road I/14 and I/16" on a
  shared stretch), else the kind of road; used by the rebuilt road's name, the mapped-road card (which no longer
  repeats the class after a numbered name), Build → Road ("joins road II/105") and a new road's ends.
- D3: 170 of 433 rebuildable stretches start with a census count; III/1057 is not counted → 736 / 6.4 %, and
  untouched after conversion the project is priced at once. D11 Jičínská (I/16): 4 399 / 8.4 %, counted.
- Tests: `tests/road-edit.test.ts` (census match, uncounted, moved ends, new road, names),
  `tests/project-store.test.ts` (old save), `scripts/any-road-scene.mjs` (label in the card, priced from the first
  drag unless roads interact, the player's number drops the label; the unpriced-houses check moved to the free end).

## 10. The old road's heights (item F), a drag on a curve, located interactions, QA session 1 (2026-11-16)

**F: rebuilt Jičínská sat flat in a 6 m cut for 0.85 km (screenshot 104).** Cause: the kernel designed the whole
stretch as a new road, kept parts included. Where the old road crosses a stream on its own small culvert, a new
road needs a norm-sized one with cover (`waterSize().minHeight`), so Auto lifted the grade 4–6 m there, and the
mass balance then dug a long cut along the kept road to feed that embankment (or, the other way round, heaped the
new part's spoil onto the kept road: +6.6 m on kept cells in the Node repro). Fixed in three places:

- `evaluateProjectRoad` knows the kept cells before the kernel runs (they depend on the line only) and passes
  them as `EvalOptions.oldRoad`. There Auto (a) does not lift the grade for a new culvert or bridge over a stream,
  (b) stays within `OLD_ROAD_BAND` (1 m, PROVISIONAL) of the surveyed surface, (c) holds the last kept cell beside
  each new part within `OLD_ROAD_TIE` (0.5 m, PROVISIONAL, as a crossing hold): a new part starts and ends at the
  old road's height, and (d) places its height points every `OLD_ROAD_KNOTS` = 125 m instead of 250 m (PROVISIONAL:
  new parts are a few hundred metres long; still one minimum vertical curve of 70 km/h per point). Mission roads
  never pass the option: D11 bills bit-identical.
- `applyKept` lays the kept road on the ground (`layOnGround`: grade = ground, no cut, fill or slopes, as wide as
  the road; the kernel's heights fade out over `TIE_LENGTH` = 50 m beside a new part; the result gets its own
  arrays) and **bills nothing there**: `parts` are zero on kept cells and `cost` is their sum. The "kept" work is
  a line without an amount ("518 m stay on the old road: kept as it is, not built anew"); there is no credit and
  no `keptCredit` any more. So the profile, the 3D body, the cost strip, "Where the money goes", the Cost section
  and "This road only" all show exactly what is built. A kept part is its own piece: clicking it says "Old road ·
  518 m · kept as it is", with nothing to choose.
- D11 Jičínská untouched: on the ground everywhere, 0 CZK. Dragged 25 m and lengthened 120 m (the screenshot's
  case): kept parts on the ground, the new 250 m ties in at both ends and cuts through the bank it was dragged
  onto. D3 III/1057 dragged 40 m at its middle: 36 M CZK (34 M before, with the old free-floating profile).
- Test: `tests/road-edit.test.ts` "is drawn on the ground where the old road is kept…" (rough surface + a mound).
- Known limits: the Quantities section still counts the kernel's volumes on kept cells; grade labels and the
  dashed tangent line in the profile are the kernel's smooth line; a By-hand profile on a kept part has no effect.

**A drag that starts on a bend's curve moves that bend** (`ui/road-edit.ts` `bendAt`, `main.ts` `bendByDrag`;
every road, ours too): a new bend inside an existing curve folded the line back on itself (the curve's corner
point lies outside the curve). The owner's D3 case, grabbed 120 m from our bridge, gave "Bend 1 is too close to
the U-turn at bend 2 · move it 892 m" on a 590 m road; now the old corner moves with the pointer (keeping its
offset from it) and the result is valid. On a straight a drag adds a bend as before.

**Why there is no total, located** (QA #8): an interaction is one line per shared thing with its place and a
number: "Two roads' earthworks are closer than 10 m · Move one of them about 7 m away here" (`touches` reports
the deepest overlap and where), "2 houses hear both roads · Their noise together is not checked yet…" (one line
per pair of roads; waits for G), "Two roads take the same house", "Two roads change the same old road". A click
flies there. The land screen now measures each road's land to its further slope edge (the land take is exactly
dayL + dayR wide) instead of using the whole width as a radius, and a deck's width on bridges instead of the
slopes of earthworks that are not built: about half as much ground counts as shared. The score line says what
holds the total back and keeps what is priced in view: "Road III/1057 not priced yet. Our road alone: 15.31 bn
CZK" (`aloneText`; a motorway's other direction is not a "road change").

**QA session 1** (`worktree-0005/docs/playtest-findings.md`): #7 gone with the issue (the fields are pre-filled,
reachable above every card, labelled for screen readers; the scene checks they are not covered); #8 above; #12
Build → Road on our motorway says "A motorway can only be joined at an interchange…", and placing shows a marker
under the pointer with what a click would join, a dashed line from the start and its length ("389 m · open
ground (joins no road)", "42 m: too short, at least 100 m"); #21 "No land bought where the new road lies on the
old one: 9 m", "Junction with the track at km 0.42" / "Track at km 0.42 reconnected: 33 m of new road and a
junction", header "Road III/1057" without a second class label, lines that round to 0.0 M left off the card, a
shorter intro, traffic on one line; #22 verified: the old stretch is off the map as soon as its new line is
engineered, priced or not (scene asserts `acceptedReplacements`; screenshot 107); #23 `aria-label`s.

`scripts/owner-d3-scene.mjs` plays the owner's exact steps on the D3 motorway preset with a real mouse and
checks all of the above (screenshots 106–109 with `--docs`).

## 11. Handoff (2026-11-16, HEAD after 98d24e4)

Committed green: `001ecb5` E (traffic pre-filled, Czech road names; §9), `a0ee32f` F + drag on a curve + located
interactions + QA session 1 (§10), `98d24e4` screenshots 106–109 and the README section.

**Gates run on a0ee32f/98d24e4**: tsc, vitest 617, build, eval-regression (11 D11 bills bit-identical), smoke,
playtest (`PORT=5246`: 5207 was taken), bench (5 saved designs VALID), outcome-audit (`--straight … --random 24`,
exit 0), any-road-scene D11 and D3 PASS, owner-d3-scene PASS. **drag-perf `--gpu --check` (bend, road, radius,
pin, vpi, link): see `/tmp/gate-perf.log` and `/tmp/gate-perf-<mode>.log`**; the exclusive browser lock was held
by long QA sessions and three other waiters when this was written, so re-check before merging (the changes that
touch a drag: `bendAt` once per drag start; `oldRoad` only for rebuilt stretches; interactions located only when
roads touch).

**For the parent**:
- The pack is gitignored: after the merge run `uv run --with requests python pipeline/fetch_census.py` and
  `uv run python pipeline/build_traffic.py` in the main checkout (or copy `pipeline/cache/csd/` and
  `public/scenarios/*/traffic.json` from this worktree; complete packs also need their rewritten
  `manifest.json`). Without `traffic.json` every rebuilt road starts with the labelled class average.
- `REPAIR_TOLERANCE` = `KEPT_TOLERANCE` = 12 m (15 m was approved; lowered so the conversion never builds anew).
- Kept parts are no longer a credit line: the bill of a rebuilt road is zero on kept cells (§10).
- The land screen is tighter (to the slope edge, not the whole width as a radius; §10): fewer projects are
  held back as "sharing land". Reviewed by the tests in `tests/project-ledger.test.ts`; worth a second look.
- `COST_MODEL_VERSION`: single-road bills are unchanged; a multi-road project's total can change (kept parts,
  knots every 125 m on rebuilt stretches). Assign main's + 1 at merge if bests of multi-road projects matter.
- **G** combined noise still waits for noise-walls-seams (not in main 217cfa4): a house that hears two roads
  keeps the project without a total ("2 houses hear both roads · Their noise together is not checked yet…").
  That is the one thing left between the owner's D3 case and a priced project (plus keeping the new line
  10 m clear of our embankment's foot, which the card now says with a number).
- Screenshot 104 is stale (the flat cut, typed traffic) and no longer referenced by the README; it was not
  regenerated (only 106–109 were allowed).
- Side roads' crossing findings still say "our road" for the road being edited ("Lower our road here…").
- Main 217cfa4 is an ancestor of this branch: `git merge --ff-only side-agent/any-road-editing` works as is.

Scratch (untracked): `_census.ts` (sidecar vs mapped ways), `_census-roads.ts` (what each D3 stretch starts
with), `_d11-jic.ts` / `_d11-jic2.ts` (Jičínská: profile against ground, raw kernel with and without `oldRoad`),
`_d3-mid.ts`, `_d3-land.ts` (land touch with the motorway), `_d3-alone.ts`.

**Review of 001ecb5..e0423ca (deep reviewer), fixed:** (P1) a rebuilt stretch is not kept where another road's
crossing lifts it onto its bridge or lowers it (`project-kept.ts` `releaseHeld`: the deck, the ramp at the
scenario's steepest gradient and `HELD_APPROACH` = 100 m, PROVISIONAL, for the curves): there it is rebuilt as
before F, instead of staying on the ground under its own deck; (P1) the old road where it is removed is this
road's work in the land screen (`Replacement.removed` → `extraLines`), so another road built on that ground is
not priced independently now that the screen is tighter; (P2) no retaining wall or wall surface stays on kept
cells; (P2) the census sidecar is taken only with finite numbers. **Open for the merge:** multi-road bills
changed (kept parts, 125 m knots), so `COST_MODEL_VERSION` must be bumped (main's + 1) or saved bests of
multi-road projects show a cost their design no longer evaluates to. `tests/geometry.test.ts` "the acceptance
case…" takes 4.9 s alone and can exceed its 5 s limit when the host load is above ~15 (not touched here).

## 12. After the parent's answers (2026-11-16, second pass)

- **drag-perf** `--gpu --check` bend, road, radius, pin, vpi, link: all OK on `9f1191f` (04:15, load 2–4;
  `/tmp/gate-perf-<mode>.log`). Nothing after it touches a drag of the mission road.
- **Land screen, how it was verified** (parent: "OK if it's still conservative"): `scripts/land-screen-check.ts`
  on the straight line and the five saved D11 designs and on D3's straight line: the land billed per cell is
  never wider than the two slope edges together (it is exactly `dayL + dayR`), and all 62–152 retaining walls
  per design stand inside the reach (0.000 m beyond). What is not along the line is screened by its own
  geometry (crossing works, relocated roads and channels, links, removed old roads) or as a shared house
  (`shared-building`, unchanged); `tests/project-ledger.test.ts` pins the boundary (10 m clearance between slope
  edges: independent; 3 m closer: shared, with the place and the metres).
- **12 m, not 15 m**: `REPAIR_TOLERANCE` is `KEPT_TOLERANCE` on purpose. The automatic conversion may move the
  line only as far as still counts as "on the old road"; at 15 m a repaired bend could itself become a
  built-anew part with its own bill and norm checks, which the player never asked for.
- **"This road"** (`core/terms.ts` `thisRoadWords`): what the kernel says about a side road (its violations,
  its crossings' findings and its crossing card) reads "this road", "this road’s earthworks", "This road’s
  bridge over it", "Its bridge over this road"; "our road" on a side road's card is the mission road only
  (junction works, held crossings).
- **`fitBends`** no longer puts a merged bend where two almost parallel legs meet far away (D3 III/11431: a
  bend 365 m off the road, a 174° spike, after its End handle was moved): only a real corner of the cluster,
  else its middle point. **Lengthening a stretch** converts the newly included old road like the first drag
  does (`fitRoad`: sharp old corners keep their own curve).
- `tests/geometry.test.ts` acceptance case: 20 s limit (it takes 5 s alone).
- Screenshot 104 regenerated (D11 Jičínská, kept on the ground, VALID) and linked from the README again.
- vitest 621, tsc, eval-regression (11 bit-identical), any-road-scene D11 + D3, owner-d3-scene: PASS.

**Still open**
- **G** (combined noise): wire `ProjectEvalContext.combinedNoise` (`project-evaluate.ts`, `combineNoise`, tested
  with a synthetic decider since d494ea7) to the finite-segment source of noise-walls-seams once it is in main
  (not in 217cfa4). Then the owner's D3 case has a total as soon as the new line keeps 10 m from our
  embankment's foot.
- **Lengthening a stretch into sharp old corners can still build anew**: the old end, now inside the stretch,
  becomes a bend with a norm-sized curve (`moveStretchEnds` `joinHead` / `joinTail`, `r: null`), which leaves the
  old road in a village corner (D3 III/11431 End handle +120 m: "Bends 5 and 6 merge into one curve that is
  too sharp", houses under the new curve). Fix idea: refit the old road between the last bend the player has
  not moved and the new end with `fitRoad`, instead of adding the join point.
- `COST_MODEL_VERSION` + 1 at merge (multi-road totals changed); `traffic.json` in the main checkout (§11).
- Known limits of §10 (Quantities on kept cells, By-hand heights on a kept part).

## 13. Lengthening into a sharp old corner (2026-11-16, third pass)

**Bug** (D3 III/11431, End handle +120 m past a village corner): "Bends 5 and 6 merge into one curve that is
too sharp", houses under the new curve. The old end, now inside the stretch, became a bend with a norm-sized
curve (`r: null`), which left the old road.

**Fix** (`ui/road-edit.ts`):
- `moveStretchEnds` finds the player's own part of the line (`playerPart`: from the bend before the line first
  leaves the old road by more than `KEPT_TOLERANCE` to the bend after it last returns). The newly included old
  road is joined either at the old end (now with the old road's own curve, like every converted bend, via
  `onOldRoad().tighten`), or at a bend outside the player's part with the old road refitted from there (`fitRoad`),
  or, when nothing is off the old road, the whole new stretch is converted afresh. The join that builds least
  anew wins, then the one with fewest problems. The player's own bends and the station-based choices stay.
- `fitRoad` gets a second step: where the line still strays more than `REPAIR_TOLERANCE` (close corners merged
  into one bend by `fitBends`), the old road's corner there (within `FOLLOW_REACH` = 150 m, game choice) becomes a
  bend of its own with its own curve (≤ 8 rounds; each must bring the line closer). `problems` is now computed
  lazily (the radius search never needs it).

**Checked** (`scripts/_lengthen-batch.ts`, untracked: every D3 class I–III stretch, conversion and ±120 m at
either end): conversions that leave the old road anywhere 21 → 6 of 433; lengthening that builds more anew than
the conversion 13 → 1 (+5 m, on a stretch whose conversion already strays 190 m: II/1044, an S of hairpins).
Stretches with norm problems after the conversion unchanged (101; all kept-as-old-road notes). `fitRoad` worst
45 ms (was 27), mean 1.8 ms; `moveStretchEnds` worst 54 ms (on release only). D3 III/11431 lengthened: valid, no
violations, the corner kept; D11 Jičínská dragged 25 m and lengthened 120 m: unchanged (only the drag is new).
Test: `tests/road-edit.test.ts` "lengthening into a sharp old corner keeps it as the old road has it; the
player's own bend stays" (fails on the old code). any-road-scene D11 and D3: PASS.

**A new road placed on a mapped road crossed it a metre on** (found while checking the "this road" wording in a
browser; any-road-scene D11, Build → Road from Jičínská): the end lies up to `JOIN_TOLERANCE` (1.5 m) beside the
mapped line, the line left it at an angle and met it again 1.5 m on, past the kernel's 1 m end tolerance, so the
joined road was also a crossing: "reconnection", the old road drawn removed for 127 m, a turnaround, and an empty
"Class I road · km 0.00" card. `evaluate` now leaves a road an end junction joins out of the crossings inside
that junction's zone (`ENDPOINT_JUNCTIONS[kind].zone`; the junction is billed there). Only side roads' ends carry
such junctions; D11 bills bit-identical, D3 motorway and road presets unchanged. Test:
`tests/endpoint-junction.test.ts` "the joined road met again inside the junction is the junction". any-road-scene
asserts no crossing within 5 m of a side road's start and that a side road's crossing card never says "our road"
(D11: "Track · km 0.31 · Rerouted to the nearest crossing… · this road 0 m below it").

**Gates on `bd299a7`** (2026-11-16 ~05:20): tsc, vitest 623, build, eval-regression (11 D11 bills
bit-identical), smoke, playtest (`PORT=5246`), bench (5 saved designs VALID), outcome-audit (`--straight …
--random 24`, exit 0), land-screen-check (6 OK), any-road-scene D11 and D3, owner-d3-scene: PASS; drag-perf
`--gpu --check` bend, road, radius, pin, vpi, link: all OK (load 7–13; `/tmp/gate-perf-<mode>.log`).
Still waiting: QA's re-test of this tree (item 2) and noise-walls-seams in main (G).

## 14. QA re-test of 9f1191f (2026-11-16): fixes

QA report: `worktree-0005/docs/playtest-findings.md` "Re-test — any-road-editing @ 9f1191f" (screens
`/tmp/trapla-qa/ar/`). PASS: #1 #2 #6 (owner step) #7 #8 #21 #22 #23. Fixed here:

- **#12 Build → Road on our motorway while unpriced** (`7ed5840`): not a stale `projectFull` — the pointer was on the
  motorway's cut slope, more than 10 px from either direction's centreline, so `routeAt` missed it. `placeAt` now
  also asks `footprintHit` (`render/route-pick.ts`): a point inside any road's drawn footprint (carriageway and
  earthworks to the slope edges, `dayL`/`dayR`) is on that road (motorway: the interchange refusal; a road: joins it).
  owner-d3-scene checks both slopes in the unpriced state; `tests/route-pick.test.ts`.
- **Drawn ≠ billed on a small drag** (`5b909a2`): kept cells are drawn on the old road's own line
  (`project-kept.ts` `layOnGround` with `OldRoad`: x, y snapped to the old centreline, ground re-sampled there,
  tangents recomputed; beside a new part the line fades from the kernel's over `TIE_LENGTH` = 50 m like the heights).
  A drag that stays within 12 m of the old road now visibly snaps back onto it (and the card says it is kept);
  beyond 12 m it is built anew and billed. Test "what is kept is drawn on the old road's own line…".
- **"Junction with the class I road" on that class I road** (`7ed5840`): at a stretch end the old road going on as
  another mapped way of the same class within 45° of its heading (`project-replacement.ts` `continues`,
  PROVISIONAL tolerances) is its continuation, not a junction; side roads at that node still get theirs. Test
  "where it is built anew up to its end, the old road going on there is no junction; a track there is".
- **P2** (`4ed4da0`): an unnamed street's card title says "Street" once; a bend's label is clamped into the map; choosing a
  road in the road list flies to it when none of it is on screen; mapped-road pick offset: cherry-picked
  motorway-rail's `b9f61aa` (long segments picked in 20 m pieces on the ground).
- Checked: vitest 626, eval-regression 11 PASS, any-road-scene D11, owner-d3-scene PASS after these.

**Open (next session):** QA #3 (any road: local roads, service roads, tracks rebuildable with sourced rules), G
(combined noise; noise-walls-seams is merged in main 93f849d, COST_MODEL_VERSION 21 → ours 22 or next free), all
gates, merge.

## 15. Any road, combined noise, main 2decf53 (2026-11-16, fourth pass)

**Any road can be rebuilt (QA #3, `c8e20b5`).** Sourced rules in `research/42-local-roads-tracks.md` (notes with
Czech quotes in `research/42-notes/`):
- streets, local roads (`residential`, `unclassified`, `living_street`) → **M 7.5 local road**, ČSN 73 6110 group
  C: 50 / 40 / 30 km/h (starts at 30), radius 85 / 45 / 25 m at 6 % banking, no transition curves, crest
  1,000 / 450 / 200 m, sag 700 / 350 / 180 m, 9 % (12 % mountainous); SPK M 7,5/7,5 rural, M 11,5/7,5 in town
  (its pavements priced, not drawn), S 7.5 deck row for bridges;
- tracks and service roads → **P 4.0 one-lane track**, ČSN 73 6109 (via Vébr 2022): 30 / 20 km/h (starts at 20),
  radius 25 / 12.5 m, plain curves, 15 %, vertical radii PROVISIONAL from the ČSN 73 6108 final draft (200 / 80 m);
  SPK P4 everywhere, P 4 bridge row. A service road is a P 4.0 by ČSN 73 6110 §8.1.4; the player may switch it;
- both in the Type list of every road (`legalClasses` per category; a mission road on them gets "built for local
  traffic only"), their own norm named in every rule and in the norms tooltip; no junction spacing on them;
  earthworks in the norm 6,000 m³/km (SPK report for field tracks; PROVISIONAL for local roads);
- their traffic: the census counts class I–III only, so the average class III road stands in and the card says so;
- **a drag that starts on any mapped road** (selected or not) rebuilds the stretch there, or opens its card that says
  why not ("Railways cannot be changed yet.", "Motorways and expressways…", "Slip roads…", "Bridges and tunnels…");
  it never pans the map. any-road-scene D11 step 7b: a street in Nový Rokytník (M 7.5, 30 km/h) and a track near
  Lampertice (P 4.0, 20 km/h) rebuilt by an unselected drag; a railway drag: no pan, the card says so.
  **Superseded (2026-11-17, owner's review: random presses while panning bent roads):** a drag that starts on any
  road not selected — our road, another project road, a mapped road — moves the map like one on open ground; a
  click selects it first (`ui/map-gestures.ts` hitRoad, `ui/selection.ts` roadSelected).

**Merge of main 2decf53** (`a0ea710`; crossing links model 22, noise-walls-seams model 21, camera): conflicts in
`project-evaluate.ts` (routeOutcome now main's per-storey energies with our per-road building owners),
`project-road.ts`, `main.ts`, `inspector.ts` (main's "crosses our road n times" line inside our side-road card).
eval-regression after it: 11 PASS against main's frozen model-22 bills, bit-identical. motorway-rail `b9f61aa` is not
in main: our cherry-pick `cde1135` stays.

**Combined noise (G, `52f203a`).** `project-noise.ts` `finiteSegmentDecider`: each road's per-storey day / night
energy at a house from its own finite-segment source (its own receiver energies where it assessed the house; else
the same sum at the façade facing it, exact within 150 m, the rest grouped within 0.07 dB); a trial wall is a
uniform wall on the side facing the house, ≥ 2 × its distance long, centred on the nearest station, skipping tunnels
and junction openings. `combineNoise` decides each house heard by two roads once (cheapest wall on the prevailing
road, else one buyout); the walls are billed as that road's works and drawn with its walls (a copy of its result).
Houses a roundabout's ring removes are not decided again. `shared-noise` no longer keeps a project unpriced; D3
owner case (III/1057 dragged 40 m near our bridge at km 11.78): "no total: shared-land" only (owner-d3-scene asserts
no shared-noise). Tests: tie-in "are decided once, from both roads' own finite-segment noise", trial-wall wiring.

**Review fixes (`d845627`, deep review of 13f9af8..70f6a23).** The decider now sums every road cell by cell (Sum 2)
for the as-built level and every trial alike, so a trial's level is the committed level; a rebuilt road's kept
cells carry no energy and no wall; the player's wall choices (any height, 0 = none) are never changed and a house
the player keeps is never bought (left too loud it is a violation "Too loud with both roads together"); trial walls
stand 2, 4 or 8 × the house's distance (an existing wall can be extended), billed by their wall line
(`wallLineLengths`, as the road's own); the road's walls are redrawn from the final heights (`wallStretches`); houses
on a designed road's roundabout ring are not decided again; a project buyout is listed on its owner's houses. A drag
on a mapped road before the road links are loaded holds the map and opens the road's card once they are.
Tests: tie-in "the player's wall choices and Keep stand…".

**Gates on `d845627`** (2026-11-16 08:45–09:30): tsc, vitest 655, build, eval-regression (11 PASS, bit-identical
with main's frozen model-22 bills), bench (5 saved designs VALID), outcome-audit (`--straight … --random 24`, exit 0),
land-screen-check (6 OK), smoke, any-road-scene D11 and D3, owner-d3-scene ("no total: shared-land"): PASS.
playtest (`PORT=5246`): PASS at load 8.6 (Undo clicked 3.95 s after Start over); it had failed twice at load 22–31
when the 6 s toast was gone before the click (main itself took 5.47 s at that load). drag-perf `--gpu --check`:
bend, radius, pin, vpi, link OK at load 7–15; road failed once at load 15 (median preview 67 ms > 60) and passed on
the rerun at load 4–5 (`/tmp/g15-perf-*.log`, `/tmp/g15-perf-road2.log`). `_lengthen-batch` (on 70f6a23; nothing
since touches it): convert 6, tail 1, head 0 of 433, unchanged.

**Open**
- From the review, in main's code (crossing-links): an engineered reroute (`link-route.ts`) checks houses and
  obstacles against its pavement width, not its earthworks' slopes (a 7 m cut 6 m from a motorway's axis passes).
- After a project wall the house card still shows the level from its own road's receiver (the project's combined
  level is in `ProjectResult.receivers`).
- A rebuilt road riding a higher-ranking road's **bridge over it** (`holds` decks: the Nový Rokytník street over our
  D11, also a class III road there) gets "Your bridge is too close to the ground" (the 4 m rule measured to the
  original ground under the owner's cutting) and "Not on its bridge over our road" by ~1 m. Pre-existing for every
  class; the held deck should be the owner's structure, not a "your bridge" override.
- A minor road crossing another minor road inside a rebuilt stretch is resolved as before (reroute), not as a
  crossroads; minor-road traffic is the class III average (no sourced count).

## 16. Held decks, minor crossroads, the house card together (2026-11-16, fifth pass)

**A road on a higher-ranking road's bridge over it (`f903e69`).** The held deck (`holds[].bridge`) is still a bridge
in the held road's structure overrides, but it is the owner's: `evaluate.ts` passes a `heldDeck` mask, so no
4 m rule (`minH`, `flagRanges`), no length check and no support/span checks (`remedyBridgeSupports` skips runs made
only of held cells). The held road is held at the deck's middle and at both deck ends (`holdAt` returns
`deckEnds` from the crossing's own `geometry.road`/`deck`; `heldBands`), and `heldChecks` reports the worst miss
once. D11 Nový Rokytník street (`osm:way:275065891`) rebuilt as M 7.5: valid, rides the deck (≤ 0.4 m off its
middle and ends; it used to be lifted 4 m and then miss the deck). Forced to S 7.5 / III / 70 km/h it still misses
the deck by 2.2 m, for another reason: the kept old street is up to 9.4 % steep, class III allows 6 %, so the
auto-profile's kept-road band is infeasible and the fallback line ignores every band (open below).
Test: edited-network "over our cutting it rides our deck at ground level from end to end…" (fails on the old
code); any-road-scene asserts the credit and no deck violation on the street.

**Minor crossroads (`fc146bd`).** A local road or track (category `minor`) meets the minor roads it crosses
(`unclassified`, `residential`, `living_street`, `service`, `track`) in a junction, never cuts and reroutes them
(`resolveCrossings(…, minor)`, `minorCrossroads`). Price, research/43 (new, research subagent, reviewed; the MMR/ÚÚR
2025 unit prices spot-checked in the PDF): two local roads 1 M CZK (extra paved area and edges, PROVISIONAL, low
confidence), two tracks 0.25 M (KoPÚ budgets, very low), a track with a local road the 0.5 M access (research/13).
A side street's junction on a rebuilt street is the same crossroads (`sideJunctionCost(cls, minor)`; it was 7 M).
Auto holds a minor road at the crossed road's level there (±`MINOR_CROSSROADS_BAND` 0.5 m) with height points
`MINOR_KNOTS` = 60 m apart (125/250 m could not place the band between knots). Crossing card texts for minor roads
(`MINOR_CROSSING_TEXT`: no 1.5 km spacing); the S-bend overlap rule on minor roads names their own norm (game
geometry). D11 town batch (92 street rebuilds with a 30 m bend, `_minor-x2`): violations 95 → 56, no "No place to
reconnect"; 9 "cannot be brought to this road's height for the junction" remain where the crossed way ends a few
metres away or runs along our earthworks. D11 single-road bills bit-exact. any-road-scene: Topolová bent 30 m
across a street → a 1 M crossroads 0.3 m from its level (it was a 30 M reroute and a 13 M bridge).

**The house card, decided together (`6370a82`).** `ProjectReceiver.together` (prevailing road, decision, deciding
storey, the wall or buyout); contributions carry each road's storeys (as built, with the project's walls). The card
(`togetherHouseText`): "41.2 dB at night on the top floor, both roads together (limit 50): our road 41.0 dB, Street
27.6 dB." plus the wall ("A 3 m wall, 120 m long, along …: 4.1 M CZK.") or the buyout. any-road-scene checks a
Nový Rokytník house after the street is rebuilt on the plain D11 project.

**Gates on `6370a82`** (2026-11-16 10:00–10:40): tsc, vitest 658, build, eval-regression (11 PASS, bit-identical),
bench (5 VALID), outcome-audit (exit 0), land-screen-check (6 OK), smoke, any-road-scene D11 and D3, owner-d3-scene,
playtest (`PORT=5246`, load 7.6): PASS. drag-perf deferred to the QA fixes below.

**QA re-test 2 of 80168c3 (playtest-qa, worktree-0005, /tmp/trapla-qa/ar2/), to fix before merge:** cold start
(first click/drag before the road links load; no hover cursor), a drag next to a crossing pans instead of
rebuilding, the street off its deck (fixed above, re-check), a player's edit of a track an automatic reroute uses
("Two roads change the same old road"), rebuilding III/1057 makes the motorway 38 M cheaper unexplained, I/37
45 px drag "Two roads take the same house" ×5 (decide jointly), P2 minor-road traffic prior and a ~5 px pick
offset. main a8d8de5 (motorway-rail, model 23) must be merged first; ours becomes model 24.

**After the QA list (2026-11-16, HEAD after `cadb1fb`):**
- Street off its deck (QA): fixed by `f903e69`; `scripts/_deck-drags.ts` (untracked) bends the street at 5 places
  × 3 offsets: all valid.
- Cold start (`cadb1fb`): the early grab (`grabbedEarly`) tested `legacyRoadAt`, which is false on every pack WITH
  road links, so a drag before the links loaded panned. Now `mappedRoadNear` (pack overlay net), the first hover
  starts `ensureTransport()`, and a mapped road shows the grab cursor before the links arrive. A held early drag
  opens the road's card once the links load (it does not yet rebuild). No browser check of a fresh-load drag yet.
- Still open from QA re-test 2: drag next to a crossing (`hitRoad` returns false there: our road's `roadAt`, then
  `mappedGrab`, `sourceAt`; a crossing card opens on click; reproduce on D3 III/1057 next to the motorway bridge at
  km 11.78); a player's edit of the D11 km 4.1 track an automatic reroute already uses ("Two roads change the same
  old road"); III/1057 rebuilt makes the motorway 38 M cheaper (find what moved; show it or fix double counting);
  I/37 45 px drag: 5× "Two roads take the same house" (decide jointly, one demolition billed once); P2 minor-road
  traffic prior (sourced, or labelled as a guess) and the ~5 px pick offset; S 7.5/III forced on the steep street
  (kept-road band infeasible above the class's max gradient, the fallback ignores every band).
- drag-perf on the final head still to run; then self-review since 80168c3, yield; merge needs main a8d8de5
  (model 23) first, ours 24; afterwards make project-kept.ts kind-generic for railways (docs/mode-foundations.md).

## 17. QA re-test 2 fixed (2026-11-16, sixth pass)

Each QA repro is now an automated scene check (any-road-scene D11, owner-d3-scene), so none needs a human re-test.

- **Cold start (`96ba824`, `5ad9748`).** A press on a mapped road before the road links load is held: the view
  asks `onRoadDrag` again (`'wait'`, `view.resumeRoadDrag()`) until the links are in, then the drag rebuilds
  the road from the pressed ground point (re-projected: a camera flight may have moved on); released early it
  is a click where it was pressed. A rebuildable mapped road shows the grab cursor before and after the links
  load. Scenes: any-road-scene 0b (fresh page: grab cursor, card on the first click, first drag rebuilds, no
  pan); owner-d3-scene 0b (fresh page, crossing card open, a drag on III/1057 25 m from our bridge rebuilds it).
  The "drag next to a crossing pans" QA item was this cold start (with the links loaded every point near the
  bridge already grabbed: `scripts/_probe-cross.mjs`).
- **A track our road covers (`cfcc787`).** D11 km 4.1: our road runs 270 m over a track and reroutes it. The
  derived stretch now stops where another road's earthworks plus the 10 m working strip cover the old road
  (`coveredStretches` in `ui/road-edit.ts`; carried crossings — bridge, overbridge, underpass, junction — are no
  cover); a grab on a covered part: "Our road covers it here: pick it further away." `shared-road` no longer
  counts a rebuilt stretch's whole old way (`extraRoads` removed: every other road's network has the stretch
  cut out) nor a stretch going on into its own old road (`continuation`), and it says where. Tests: road-edit,
  edited-network D11; scene: the track dragged north of us is priced (9.846 bn).
- **III/1057 rebuilt made the motorway cheaper (`5ad9748`).** Our retaining walls ignored designed roads (they
  used `roads.ground`): the abutments no longer kept clear of the rebuilt road (bridge 90 → 70 m, two walls
  gone: −14.7 M on an untouched rebuild, −38 M in QA). `planRetainingWalls` now gets the edited network with
  designed roads; relocation still sees mapped roads only. Untouched rebuild: +0.1 M. A real new line beside
  an abutment may cost the motorway more (owner scene: +17 M, its bridge 10 m longer); the scene asserts the
  bill never falls. Not shown on the rebuilt road's card (open).
- **Houses between two roads (`a623b4a`).** A house one road takes is gone: another road's noise there is no
  interaction (that was every QA "Two roads take the same house"). A house two roads take is taken once, by
  the demolishing (higher-ranking) road, the other credited ("House our road takes as well: billed there
  once"). D11 I/37 batch (`_i37b.ts`, 42 pulls of ±37 m): all priced. Tests: tie-in shed; scene: I/37 45 px.
- **P2 (`6c1f389`).** Street/track traffic labelled "Not counted: a guess (the average class III road)" (no
  sourced lower prior yet); source pick uses the screen scale across the road (it used the scale along it).

Gates during this pass (tiered, per the parent): tsc, vitest 662, eval-regression 11 PASS bit-exact after each
commit; any-road-scene D11 and owner-d3-scene PASS on `6c1f389`.

**Next (handoff):** merge main `27aeda6` (core-play-polish, model 24; 13 conflicting files, 45 hunks — attempted
and aborted to start with fresh context), set `COST_MODEL_VERSION` 25, then all gates incl. any-road-scene
SCENARIO=d3, bench, outcome-audit, land-screen, smoke, playtest, and the six-mode drag-perf once; self-review
since 80168c3; yield. Open: forced S 7.5/III on the steep Nový Rokytník street misses the deck (kept-road band
infeasible above the class's max gradient); the motorway's cost change from a rebuilt road is not on any card;
a sourced traffic prior for local roads/tracks.

**Merged main `27aeda6` (`3974d78`, cost model 25).** 13 files, 45 hunks, both sides kept: the structure choice
settles the fill value with our held decks and a railway's own track at once (`remedyBridgeSupports(…, held,
ownTrack)`); the footprint screen sees mapped roads (`roads.ground`), retaining walls the edited network (main
had moved to `ctx.roads` there too); `routeHead(shown)` — a side road's settings on top of any selection, a
motorway's directions (`data-place="below"`) under a selected stretch; crossing options per line kind with the
local-road options; the unpriced count by corridor (main) plus each road alone (ours); a split motorway's
`alone` includes its own works. Main's direct railway grab is folded into ours (any mapped road or railway
under the press is grabbed; a rebuildable one shows the grab cursor and "drag to change its line"); main's
fitted rebuild bend is kept for a new bend (not one taken over from the old line's curve, which keeps its grab
offset). The road list frames a road (main's `frameRoute`) only when none of it is on screen. Model 25: D11
fixtures identical to model 24 (re-stamped, version only).

Scenes after the merge: any-road-scene asserted "only Road can be built" and "a mapped railway is not rebuilt";
main builds motorways / railways and rebuilds a mapped railway along its line, so the scene now checks that a
road can be built, that a mapped motorway (if any) refuses, and that a mapped railway is rebuilt as a railway
(D11 `osm:way:277838071`). owner-d3-scene's "the motorway's bill never falls" failed at −32.1 M: around the
crossing our bridge is 10 m longer and has one wall more (+24.5 M), but main's settled fill value shortened the
km 4.0 viaduct by one 17 m-high cell (−25.5 M). The scene now judges the works around the crossing
(`trapla.localWorks`: bridge no shorter, walls not fewer, parts within 300 m not cheaper) and prints the whole
bill's change; PLAN.md notes the non-local tip.

Gates on the merge: tsc; vitest 675; build; eval-regression 11 PASS (bit-exact against model 24 before the
re-stamp); bench 5 VALID; outcome-audit exit 0 (violations 118, VALID 8 — as main); land-screen-check 6 OK;
smoke PASS; playtest PASS; any-road-scene D11 and SCENARIO=d3 PASS; owner-d3-scene PASS; drag-perf `--gpu
--check` bend / road / radius / pin / vpi / link all OK (load 10 → 4; max result gap 57–114 ms, no long tasks).

**Merged main `3d01d57` (`fcedaff`, long-corridors: block-wise local grade solve, model 25 → ours 26).** 7 files:
the junction an end joins stays no crossing (on main's block-traced line), our held-deck / minor / old-road knots
beside the block solve, main's live drag total with our "Our railway / motorway" own-price labels, the crossing
card's "level today" wording with this road's options. D11 fixtures identical to model 25 (re-stamped). The
worktree needed main's new scenario packs (d3-0301…0305, d3-full, d35-full) for `edit-locality`.

**Self-review fixes (`3d3057d`).** A separate motorway stretch's memoised spine is keyed by the edited network
too (another road's change re-engineers it); a rebuilt railway is checked against the edited network (only a
rebuilt road needs its own old road cut; `editedNetwork` returned null for a railway owner); another road's
crossing no longer uncovers what a road's earthworks bury (`coveredStretches` per covering road); a drag on
another designed road drawn over a mapped road selects that road, not a rebuild (as a click does); each other
line "alone" is listed once (a motorway's two directions); separate stretches compose and slice `walledOff`;
owner-d3-scene also checks the walls' length beside the crossing. Earlier (`9b96442`): a new or rebuilt
railway's own problems read "this railway", our railway's / motorway's price "Our railway alone".
Not fixed (next, with the kind-generic `project-kept.ts`): a rebuilt railway's ends are not checked for
direction against the track they continue; a press released before the links load is a click at its screen
point, not re-projected after a camera flight.

Gates on `3d3057d`: tsc; vitest 684; eval-regression 11 PASS (bit-exact vs model 25 before the re-stamp);
bench 5 VALID; land-screen-check 6 OK; outcome-audit exit 0 (violations 106, VALID 8); edit-locality exit 0
(d3-full: one edit 0.11 m beyond 10 km, within its rule); smoke, playtest, mode-play, stretch-play PASS;
any-road-scene D11 and D3, owner-d3-scene PASS (around the rebuilt crossing: bridge 230 → 230 m, walls 1 → 1,
+2.3 M); drag-perf `--gpu --check` all six modes OK (max result gap 49–84 ms).

## 18. Railway kept track and QA f9f5d9d (2026-11-16, model 28)

**Railway kept track (`aa343b4`).** `project-kept.ts` accepts several old paths and works for either kind of
line. A rebuilt railway keeps the old track's heights, crossings and neighbours where its line stays on it:
no new works there and a kept credit in the project's works. End straights that leave the continuing track
must meet the turnout-angle rule (J60-1:12-500, a game rule); a wholly kept end straight is exempt. Conversion
compares the old track's bends with a road-style fit and chooses fewer cells built anew, then fewer problems.
D11's fresh rebuild survey: 4111/4448 cells kept; flagged ends fell from 15 to 4 of 59 tracks. The inspector
says “old track”, not “old road”. A waiting press released before road links arrive is a click at its original
ground point, re-projected after any camera movement (any-road-scene 0b).

**QA (1)(2), shared land and old-road ends (`6ca6c2d`).** Crossing zones include the crossed road's width and
clearance divided by the crossing angle, plus the bridge and its abutments. A rebuilt stretch continuing the
old road into another road's reroute gets an end-connection zone. Its own old way is not a shared-road conflict;
a removed road is not extra occupied land. The screen uses each side's actual earthworks width. Tests cover
III/1057 beside the D3 bridge and the D11 km 4.1 track bent at its start.

**QA (3), uncounted traffic (`47780d8`).** Local streets start at 300 vehicles/day, service roads at 50, field
tracks at 10 (heavy shares 3/5/5%). All are explicitly PROVISIONAL, not census counts (research/43). The card
says “Not counted: a guess for …”. The combined-noise browser scene retains its former 736/day, 6.4% demand as
an explicit player choice: the new quiet-street prior need not change any house's noise decision.

**QA (4), crossing a mapped railway (`8565d5d`).** A real railway retry bug: the clearance retry matched
“Road too low”, but railway wording had already changed that title. `Violation.clearance` now carries the
structured diagnostic; the retry no longer reads player text. R1/R2/D27.5 regression cases build over an
unrelated mapped railway's 4 m embankment, clear it and keep both new endpoints on the ground.

The exact D3-0302 QA build is also geometrically constrained, not a missing crossing engine: A
(5817.219, 5844.977, 356.691), B (5747.153, 3959.624, 295.654), length 1886.65 m. The railway would descend
32.4‰ on average (limit 12.5‰). The crossed old track is only about 100 m before B; the motorway cannot gain
9.3 m for the crossing and descend to grounded B at 4%. We do not float free endpoints or silently exceed
the grade limit. Extending that railway farther downhill does not cure its excessive average descent.

**QA (5), inward carriageway drag (`3d147ee`, review fix `75ac9a9`).** D3-0302, Towards Hostěradice, km 3,
40 px east: the forward direction crossed the untouched reverse twice and ran on the wrong side between.
Relaxing the overlap check would hide real wrong-way geometry. Evaluating two Auto-followed half-bodies also
failed: independent heights and structure lifts left incompatible slopes/noise checks.

`autoFollowingCorridor` instead derives ONE paired D27.5 body for an inward-pulled stretch whose peer is still
Auto. The saved spine and own-direction edit stay intact: pulling back outward restores the original peer;
Reset or Undo restores the original line. Both editors read the derived line too. The card says “Both follow
this bend”, with Reset rather than Join. An explicit peer line, shared manual heights, or shared pins/works in
that stretch constrain the peer and are not overwritten. Another separate stretch that cannot be carried
without losing its edits likewise prevents Auto following. The whole affected stretch follows, even if only
part of it would overlap; a radius edit can also require this. An unchanged write or a distant Both-directions
edit keeps the original stretch and Reset. Editing the shared bends nearby, changing the shared speed or
profile mode, or deliberately changing a height/works control on the followed body accepts that local bend
as shared. A peer edit whose new stretch would merge with the followed stretch accepts its shared body first
(this is bend-list adjacency, not a distance cutoff). Directly changing a bend actually moved by the owner
remains an explicit peer choice (even if it conflicts).
Undo restores the earlier Auto-follow state.

Self-review caught that the Auto peer's displayed bends were being saved as player edits by unrelated pins
or distant drags. Those automatic copies are now removed outside the actually edited bends and their
neighbours before writing back. A pin/works choice on the followed body makes its bend shared, rather than
storing the choice on whichever direction caused the follow: if that direction later pulls away, the peer
keeps the chosen bend and control. Tests cover both directions, pulling back out, explicit peer edits,
distant peer/Both pins and drags, unchanged writes, crossing choices, local pins through separation,
nearby shared bend edits with existing controls, and preservation of existing shared controls. The exact browser repro is now in `stretch-play.mjs`: valid, one body evaluated
and drawn, no violations, matching peer widgets, Reset restores the original bill (7.542 bn after the pull).

**QA (6), road list (`9f4d7d3`).** Each motorway has its own name; duplicates are numbered. Choosing an
off-screen road frames that road, not the stale previously selected result (unit and scene checks).

**Main merged (`a203151`, model 28 `f2313eb`).** Main `caa8d40` brings model 27's town rates into the grade
search, bridges over water where walls cannot hold the bank, and bend drags that do not crowd neighbours.
No merge conflicts. All 11 main model-27 D11 fixtures pass bit-exact before and after changing only their
version stamp to 28; no bills recaptured. The mode scene now accepts grouped picker cards' h3 headings.

Gates after this merge: tsc; vitest 83 files / 693 tests; build; eval-regression 11 PASS; bench 5 VALID;
land-screen 6 OK; outcome audit exit 0 (30 designs, 124 violations, 8 VALID); edit-locality exit 0 (same
whole-D3 one edit 0.11 m beyond 10 km, no new far problems); smoke, playtest, mode-play, stretch-play,
any-road-scene D11 and D3, owner-d3-scene PASS. GPU drag checks: bend / road / radius / pin / vpi / link all
OK (max result gaps 58/73/100/64/68/100 ms, no long tasks); whole-D3 forward-direction bend also OK (128 ms,
no long tasks). Crossing scene: III/1057's motorway bridge stays 230 m, its wall stays 10 m, nearby works
+2.28 M; whole bill +2.26 M. Screenshots inspected: crossing, combined-noise card and inward-follow body.
Photo tiles did not arrive from the external service, so the photo-overlay check was skipped by both scenes.

Final review since `f9f5d9d` on `35e2cee`: no P1 findings. Both P2 edit-semantics findings are now addressed:
Both-direction writes translate untouched automatic copies back to the saved spine, and a deliberate local
body control accepts only the followed bend it touches. No identical independently evaluated half-bodies
are created. Shared speed changes intentionally accept the displayed line. Redundant overlap filters after
the shared-control guard were removed; no billed math changed.

Follow-up gates: tsc; 83 test files / 694 tests; build; 11 frozen bills bit-exact; stretch-play PASS (inward
one-body screenshot inspected); edit-locality PASS with the same accepted 0.11 m whole-D3 reach. All six GPU
drag modes PASS. Whole-D3 forward bend PASS (p95 preview latency 81 ms, max result gap 115 ms, no long tasks).
Earlier whole-D3 attempts intermittently failed latency/long-task budgets; a locked comparison of committed
`2436f58` also failed with 3 drag and 1 post-release long tasks (another baseline run passed). One redundant
display derivation introduced by the fix was removed before the final runs. Logs: `/tmp/model28-follow-*`.
The full-range review on `8297580` found one P1 boundary case: a peer edit of bend 1/2/3 after an inward pull
of bend 0 merged the followed stretch and either copied the owner's bend as an explicit peer choice or
restored the original crossing. The follow is now accepted before that merge unless the peer directly edits
a bend actually moved by the owner. Six ±10 m regressions cover all three adjacent bends; they stay valid
and match first choosing the shared bend and then editing the peer. Existing deliberate-conflict tests still
pass. Latest gates: tsc, 83 files / 700 tests, build, 11 frozen bills, stretch-play, whole-D3 forward bend
(p95 preview 115 ms, max result gap 121 ms, no long tasks). Logs: `/tmp/model28-near-*`. The final full-range
review on `3b0a16a` found no blockers. Independent kernel probes also covered reverse ownership, adjacent
insertions/deletions, direct changes to the owner's moved bend/radius, unchanged write-back, and recursion
termination; all behaved as intended.

**Merged main `230c1c2` (crossing-economy model 28).** All 11 main fixtures remain bit-exact after the merge,
so the version stays 28 and no fixtures were recaptured. tsc, 83 test files / 704 tests, build and
any-road-scene D11/D3, owner-d3-scene, mode-play and stretch-play pass (`/tmp/merge28-*.log`). The owner's
III/1057 case is VALID and priced at 14.225 bn; the motorway bridge stays 230 m and its wall 10 m, nearby
works +2.29 M and whole motorway +2.34 M. Its screenshot was inspected. The standard D11 km 4.1 track scene
is priced at 9.863 bn; the separate quarter-stretch / 60 m repro remains to recheck and fix if still blocked.
Auto-follow's exact D3-0302 repro remains valid as one body, with Reset restoring the original price.

Parent's next pass, in order: finish any remaining D11 track takeover / legal railway-crossing / motorway
transition gaps; then a rebuilt railway's own works card and “Keep the old track”; then railway continuation
connections still reported as pending. The exact short QA railway/free-end motorway is geometrically
infeasible (§18 QA 4), not an excuse to leave a feasible railway crossing without Auto engineering.

Still open:
- The latest review's synthetic 40 km / four-stretch probe measured a 27–29 ms editor write; the browser
  timing gates start with at most one stretch. Repeated derivations should be reduced with explicit
  within-operation reuse (draft corridor objects are mutable: do not blindly cache by object identity).
  Accept-and-repeat adds another 1–7 ms in the reviewer's small adjacent-edit probe.
- Minor wording: a followed stretch's Reset still says the directions run together again, and the hover
  label says “only” although Auto may bring the peer alongside. The direction card explains Auto correctly.
- Some fresh railway rebuilds still meet tight old track too sharply (D11 4 of 86 rebuildable lines; e.g.
  osm:way:35609502, 74°): see “Last scoped pass” below. Needs railway curves kept as the old track draws them.
- Stretch controls are still station-based; length changes can shift their physical positions (the general
  station-grid issue). `pairStations` may return NaN on widely divergent paths whose normal meets a segment
  beyond the nearest two; inward detection here sees the sign change near the departure before that gap.
- Review raised broad bridge/continuation screen zones as a follow-up: bridge supports are checked by the
  engineering kernel against the edited network, but the land screen itself does not certify pier clearance.

**Last scoped pass (model 28, fixtures bit-exact).**
- *D11 km 4.1, a quarter along / 60 m (`0499cca`).* Bent 60 m away from our road, the rebuilt track crosses
  another track at a junction. The land screen counted that junction's whole drawn line as works, including
  its terrain tails beyond the ramps' feet, which are the crossed track as it is (crossing-geometry.ts). Those
  tails ran 16 m beside our automatic reroute link. Now only the tails are left out, for junctions and the
  crossed road's bridge over us. Reroute links stay screened in full (they are new track). Bent 60 m towards
  our road, the track runs 7 m from our embankment: a real conflict, “Move one of them about 6 m away here”;
  50 m towards it is priced. The original QA case (bent at its start) passed already. Real-pack test in
  edited-network.test.ts.
- *Railway continuations (`f204461`).* A rebuilt railway's ends continue its old track: the kernel checks
  them (turnout-angle rule, heights tied to the old track), so they are no longer pending junctions. A
  railway branching off keeps its switch where the new line stays on the old track there (kept cells). A
  branch the new line has left still needs new switches and stays “Junctions are not priced yet”. A sharp end
  stays a violation (invalid, not unpriced). Fixture: a spur at the bend (mode-kinds.test.ts).
- *Railway card (`3b54b42`).* A rebuilt or new railway gets its own card: what it is, how far from the old
  track, its works (the kept old track), and “Keep the old track” / “Remove railway” with Undo. It has no
  traffic or junction controls. mode-play checks the card, removal, toast and Undo (screenshot inspected).
- *Tight fresh ends, not fixed.* D11 osm:way:35609502 ends inside a tight old curve (about 255 m radius) at
  80 km/h: railway transition curves at that speed cannot follow it. The old track's raw bends would leave a
  bend too close to the end and a low bridge; the fitted line cuts the loop (74°, “Move bend 2 …”). At
  60 km/h the corner goes, but a stream crossing (two violations, 483 M) appears. Not a sound automatic choice:
  left as an honest violation. The engine needs railway curves kept as the old track draws them.

Gates: tsc; 83 files / 704 tests; build; 11 frozen bills bit-exact; any-road-scene D11 (km 4.1 track
9.863 bn) and D3; owner-d3-scene; mode-play (railway card) PASS.

## 19. A crossing's parts, a dead end cut back (2026-11-20)

A selected crossing's ring rebuilds its crossed mapped road around the crossing and slides it along our road; its works
bend it as a drag on the road selected does (`ui/crossing-drag.ts`). A selected mapped road's open dead end has an End
handle that takes its last piece up (`ProjectDesign.takenUp`, `core/taken-up.ts`). PLAN.md "A selected crossing's parts
drag; a dead end cut back".
