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
- **Traffic** is an explicit card field ("Traffic, vehicles/day"), never copied from the mission. Until it
  is entered, noise is "not checked" for that road and the project stays unpriced, with the field as the fix.
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
