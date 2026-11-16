# Playtest findings (independent UX QA)

Played like a first-time player in headless Chromium with real mouse / keyboard (driver: `qa/drive.mjs`),
screenshots under `/tmp/trapla-qa/` (not committed). Newest session on top. Severity: **P0** broken /
untruthful, **P1** confusing, **P2** polish.

## Session 1 — 2026-11-16, main @ 217cfa4 (SwiftShader, 1440×900, fresh localStorage)

Flows played: picker → D11 road (drag, crossings, houses, buy-out, noise view, photo, camera), D3 motorway (A/B,
rebuild class III road 1057, unpriced state, split one direction, railway), railway mission, Build → Road, D3 road,
D35 motorway, Nová Paka (load + overview only). Screenshots `/tmp/trapla-qa/NNN-*.png`.

### P0 — broken / untruthful

1. **Unpriced project: buildings the motorway demolishes stand on the carriageway again** (owner's report, confirmed).
   D3 motorway preset → zoom to km 11.8 → click class III road 1057 north of the motorway bridge → drag it ~40 m
   east → "2 road changes not priced yet". Fly to km 0.7 (profile click), tilt to top view: houses stand on the
   motorway at km 0.5–1.0 (`045-tilt-out.png`). Undo ×2 (priced again): the same spot shows the demolition
   squares and bought-out marks (`047-undo2-priced-same-view.png`). Expected: demolished / bought-out state is a
   property of our road and stays drawn whatever else is unpriced. Cause: `main.ts` passes
   `buildingMarkers: result.complete` → `view.ts:987` drops demolitions and buyouts. Area: any-road-editing.
2. **A rebuilt road crossing our motorway is never resolved.** Same repro: the rebuilt class III road now crosses
   the motorway at grade beside the old bridge (`034-pan.png`); violations list "NOT CHECKED YET · Roads cross here
   … Engine limit: crossings between new roads cannot be checked yet" (`036`). The project stays "not priced"
   indefinitely (waited 15 s; no action offered), the motorway bill is unchanged (still pays the overbridge for
   the old alignment). Expected: auto resolves it (bridge / underpass) like any mapped crossing, or Auto refuses
   the drag. Area: any-road-editing + crossing-links.
3. **Choosing which motorway direction to edit silently changes the design.** D3 motorway → Motorway section →
   Edit → *Towards Václavice*: cost +503 M CZK with no edit made, road height flips to *By hand* with ~60 ◆
   points, bought-out houses at km 0.7 become demolished (`050-edit-towards-vaclavice.png`). The card claims
   "Where they run side by side at the same height they share one embankment and are priced as one" — yet +0.5 bn.
   Then drag that direction between bends 3–4 by ~50 m: the frozen By-hand heights force a 1.2 km tunnel, +2.58 bn
   (`057`). Switch that direction's height to Auto: **41 violations** — 30× "Slopes of the two directions clash",
   9× "Noise beside the two directions is not checked here · Give both directions the same height here"
   (`060-split-auto2.png`), along the whole route, not just where they separate. Engine limits pushed onto the
   player. Expected: selecting a direction is a view choice; splitting happens on the first edit of one direction,
   keeps Auto heights, and the unchanged stretch stays one shared body. Area: motorway-rail.
4. **Railways cannot be changed** (owner ask c: "reroute a railway when building a highway"). D3 motorway, km 4.6
   (Sázava bridge): click the Posázavský pacifik line → card "Railways cannot be changed yet." (`076`). Area:
   motorway-rail.
5. **Demolished buildings: footprint left on the ground + floating black square** (owner complaint, unfixed).
   D11 straight start, km 5.4 (Poříčí industrial): a 199 M CZK demolished hall is a flat roof-coloured polygon on the
   ground with a tiny black square; our embankment runs through it (`006`, `008`). D11 after bending at km 2.1:
   a demolished house is a flat red footprint with a black square (`100-demolished-house-3d.png`). The square is a
   screen-space point 6 m above terrain with `depthTest: false` (`view.ts:997`), so it shows through bridges and
   hills. README says "demolished ones are gone". Expected: building removed, bare ground/earthworks there,
   at most a small ground marker. Area: rendering (whoever owns footprint visuals).

### P1 — confusing

6. **Rebuilt side road starts with violations** (owner complaints, unfixed). D3 motorway, drag class III road 1057
   once: "Bend 1 is too close to its start" (km 0.00, a bend copied from the old curve), "Bends 2 and 3 are too
   close for an S-bend", "Traffic not set" (`029`, `030`). The mapped road has traffic in reality; the player is
   asked to type it. Area: any-road-editing.
7. **"Traffic not set" → the field is hidden.** Click that violation: the panel scrolls so *Traffic* is under the
   sticky score box, only *Heavy vehicles* shows, nothing is focused (`038`). While a bend of that road is selected
   the traffic fields are not reachable at all (bend card replaces the road card). Typing 2500 does clear it
   (`039`). Area: any-road-editing.
8. **"2 road changes not priced yet" after one change**, and no way to get priced. D3 motorway + one class III
   drag. `project-issues.ts unpricedText` excludes only the mission route, so the motorway's other direction
   counts as a change. Header switches to "OUR ROAD ONLY 15.31 bn" / "THIS ROAD ONLY 27 M" — the project total
   is shown nowhere (`040`). Area: any-road-editing.
9. **D3 motorway A and B end in fields.** A: the 4-lane road stops dead in a meadow (`017-d3m-A.png`); B: it runs
   ~130 m past an overbridge and stops in a field (`021`, `022`). Area: long-corridors.
10. **Railway mission sits on the D11 road endpoints**: A in fields south of Trutnov at the road's start, B at the
    road border crossing, "official D11" line drawn as the reference (`062`, `063`). Crossing cards say "our road"
    (`065`). Area: motorway-rail.
11. **Splitting directions is hidden**: only in the folded *Motorway* section → *Edit* (`049`), though the scenario
    card promises "split them where the hills ask for it". Not reachable from the motorway's own card. Area:
    motorway-rail.
12. **Build → Road onto our motorway says "This road is not checked yet, so nothing can join it."** (`082`) — the
    motorway is priced and VALID. `route-kinds.ts:105` rejects every `route.kind !== 'road'` with that text; the
    mapped-road path has the right one ("A motorway can only be joined at an interchange…"). Placing also gives no
    hover marker / rubber-band line; "Put the end at least 100 m from the start" with no scale on the map (`083`).
    Area: any-road-editing.
13. **Chained track reroutes, invisible works.** D11 (bent once at Bohuslavice), profile → crossing km 9.38: "Rerouted
    to the nearest crossing at km 9.47 (+145 m)"; *›* km 9.47: "Rerouted to the nearest crossing at km 9.83
    (+787 m)" — the first points at a crossing that is itself cut. With either selected the new track is not
    highlighted and I could not find it on the map; the selection ring floats mid-cut at the old track level
    (`088`–`091`). Area: crossing-links.
14. **Railway click target is offset from the drawn line** by ~8–10 px at an oblique view (D3, km 4.6, `075`: cursor
    stays default on the line, turns to pointer 9 px below). Area: rendering/picking.
15. **Camera at low pitch**: wheel zoom does nothing (`103` = `104`), a 300 px left-drag pans kilometres and loses the
    road (`105`); a profile click "flies" but keeps the low pitch so the target lands on the horizon (`069`); a
    right-drag rotate swings the subject off-screen (`068`). No map button to get back to the whole route (only
    reload). Did not get under the terrain this session.
16. **Demolition reason not concrete**: D11 km 2.1 house "Demolished · 16 M CZK · In the road's way" sits ~60 m from
    our bridge, beside a railway (`096`, `100`). Say what is in its way (a link? working strip?).
17. **Our road reads as the "official" line**: overview after dragging with a bend selected, our road is a
    yellow/black dashed line — the legend's dashed symbol is the official D11; the official line itself is a white
    band (`010`–`013`).

### P2 — polish

18. Picker: two cards lack class/speed ("Road through Posázaví", "Road across the hills"); only one D3 section
    (owner asked for D3 sections) (`000`–`002`).
19. Label clutter: wall labels "3 3 m" overlap (`093`), "Týnec nad Sázavou" overprinted (`016`), horizon labels
    pile up at low pitch (`103`).
20. Bought-out badge reads "BUY" (`099`); the legend says "bought out". One vocabulary.
21. Rebuilt-road card wording: "Land under the old road, already the road's: not bought again", "The track joins the
    new road" (which track?), header "Class III road 1057 · Class III road" (`037`).
22. While unpriced the old road stays fully drawn beside the rebuilt one — two parallel roads on the map (`034`).
23. Traffic / heavy-vehicle inputs have no accessible labels.
24. Nová Paka opens with the route tiny in the middle of the view (`109`).

What worked: picker + Continue, drag-to-bend live and cheaper, profile click flies, card/profile sync, crossing
cards readable, house cross-section, buy-out, noise view, photo view, undo/redo, reload persistence.

## Test plan

Per session, fresh localStorage, 1440×900 (one pass also at 1280×720), no console tricks for the player
steps — the page API is used only to read state for precise repros.

1. **Scenario picker** — find it without the README; every entry: D11, D3 sections, D35, Nová Paka, motorway
   presets, railway mission. Does each load, is A/B sensible (not mid-field), is the goal readable, does the
   camera frame the route, does switching keep / lose work as the player expects?
2. **Core on D11** — intro; drag the road; add / move / delete bends; tightest / widest; radius; profile:
   click, stretch, pin height by dragging, By hand; crossings: click a crossed road, every choice, click its
   works, shape a reroute; houses: buy out / keep, demolished and bought-out visuals; noise view + walls;
   undo / redo across all of these; reload → continue; Start over; photo view; camera limits (under terrain).
3. **Any road (b)** — click mapped roads of several classes (track, class III, street, motorway); drag to
   rebuild; its card (traffic field visibility, bend cards, violations wording); Build → Road (free end,
   joining our road, junction / roundabout); pricing in the bill; a rebuilt road crossing our road
   (resolved? bridge pier on the old alignment?).
4. **Motorway / rail (c)** — motorway preset: both directions, split, tweak one direction; railway mission:
   endpoints, reroute a railway when the highway crosses it.
5. **D3 / D35 / Nová Paka** — endpoints, overview, quick drag, crossings and houses spot checks.
6. **Owner's known complaints** — re-verify each after the relevant merges.
