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
