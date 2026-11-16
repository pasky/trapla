# Playtest findings (independent UX QA)

Played like a first-time player in headless Chromium with real mouse / keyboard (driver: `qa/drive.mjs`),
screenshots under `/tmp/trapla-qa/` (not committed). Newest session on top. Severity: **P0** broken /
untruthful, **P1** confusing, **P2** polish.

## Re-test — noise-walls-seams @ a903bda (2026-11-16, SwiftShader 1440×900, D11 straight start)

Tested on a detached snapshot of a903bda (the live worktree hot-reloaded under me while its owner edited
`noise-field.ts`; one camera "reset" seen there was that reload, not a bug). Screenshots `/tmp/trapla-qa/nws/`
(numbering restarts after the snapshot switch; the files named below are from the snapshot run unless noted).

| item | verdict | evidence |
|---|---|---|
| S1 #5 / S2 #1 demolished visuals | **PASS** | km 5.4 Poříčí halls are hatched cleared plots with dashed edges, no roof slabs, no floating squares; the embankment covers its part (first run `000`/`002`). Far zoom: small outlined markers at ground level. |
| "what takes the house" | **PASS** | cards read "Under our embankment, km 5.40" / "In the 3 m working strip beside our embankment, km 5.44". |
| bought-out visibility | **PASS** | km 15.55 house fully magenta with a dashed ring, visible from ~1 km (`001`, `007`); badge reads BOUGHT OUT. |
| house cards, noise per floor | **PASS** | 2-floor house: 49.7 / 49.3 dB per floor, "was 53.8", wall in the section, "69 % … where no wall stands" (`015`); hover tooltip in noise view gives level, limit, wall (`010`, `014`). |
| walls in cuts (S2 #3) | **PASS** | cut km 8.89–9.53 now Auto: none both sides; None changes nothing. |
| wall choice beyond the piece (S2 #4) | **PASS** | Left None on cut km 6.48–7.49 → violation km 6.49–6.61, inside the piece (`004`). |
| kept house + Auto walls | **PASS** | Keep the km 15.55 house: Auto raises the left wall to 5 m over km 14.97–15.68; the remaining 5.1 dB is explained ("87 % … through the gap where the side road joins") with Buy out / Stop keeping, road tinted red there (`008`). |
| noise view | **PASS** (P2 below) | limit line follows the field now, houses in their own colour, kept house orange inside the line (`011`, `013`). |

New / remaining:

- **P1 — removing walls makes the walls dearer.** Cut km 6.48–7.49, Left → None: total +16 M CZK, *Noise walls*
  79 → 95 M CZK (Cost section before/after), while the piece itself gets 5 M cheaper (`004`). The player removes
  walls and pays more for walls somewhere else, without being told where. Either Auto re-walls a neighbour (then
  say so in the card) or it is a seam bug.
- P2 — legend still shows "■ demolished" (a dark square) while the map draws hatched plots.
- P2 — wall heights: house card offers 2 m, the piece card offers 3–6 m only.
- P2 — bought-out house card no longer states the limit ("Too loud even behind a 5 m wall", 57.8 dB, no "limit 50");
  the plan strip at the top of house cards is ~40 px tall, its labels hard to read (`003`).
- P2 — the noise-view hover tooltip covers the noise legend at the bottom left (`010`).
- Not this branch: zoom-in floor ~150 m above the road at Voletiny (wheel-in ignored, wheel-out works); a pan toward a
  point behind the camera can leave the view on empty sky with no way back but reload (`012`).

## Session 2 — 2026-11-16, main @ 217cfa4 (SwiftShader, 1440×900 then 1280×720, fresh localStorage)

Flows: Continue / Start over across D3 road ↔ D3 motorway, Nová Paka (drag, town, houses), D11 houses and walls
(wall None per side, fix buttons, buy out, Keep a demolished building), D35 road and motorway endpoints, 1280×720
pass (picker, intro, piece / crossing / house cards, Your choices, noise view). Screenshots `/tmp/trapla-qa/s2/`.

What worked: presets of one scenario keep separate designs (`trapla.project:<scenario>:<preset>`); Continue
restores each; Start over returns to the preset with an Undo toast (`006`); wall fix buttons and "Buy out N" make
the design valid in two clicks (`025`–`027`); Keep shows "Road through a kept building" with Buy out / Stop keeping;
at 1280×720 every card fits and nothing is cut off (`039`, `041`).

### P0 — broken / untruthful

1. **Demolished buildings — same as S1 #5, also on Nová Paka and D11 at Poříčí.** NP after one drag toward the bypass
   reference, km 2.4: a demolished house is a flat roof slab half under our embankment, two black squares above it
   (`015`, `016`). D11 straight, km 6.6–6.8: industrial halls as flat red slabs with the road running across them
   (`024`).

### P1 — confusing

2. **Bridges over ponds can never be valid.** D3 road preset: drag the road between bends 6 and 7 about 50 px east
   (to bend 7 at Chleby). → 38 violations, 34 of them "A bridge pier stands on a pond or river · Move the route at
   km 13.xx a little so the support misses the water", one per pier of a bridge across a ~500 m fishpond (`004`,
   `005`, a red X on every pier). Moving "a little" cannot help; piers in ponds are normal practice (or a causeway).
   Expected: Auto spans or accepts piers in standing water (priced), at most one violation per bridge. Same drag also
   leaves "Our earthworks cover 30 m of a track" at km 9.97 unresolved — an ordinary conflict Auto should solve.
   Area: bridges / crossing-links.
3. **Auto walls that protect nobody?** D11 straight start, select cut km 8.89–9.53 (profile): card says Auto 3 m
   left and 3 m right. Set Right → None: still VALID, −1.5 M; Left → None too: still VALID, −2.4 M in total, no
   house warning. No wall is drawn in that cut and no houses are near (`044`–`046`). Either Auto builds walls that
   are not needed, or the card reports walls from the neighbouring pieces and *None* removes them unchecked. Area:
   noise-walls-seams.
4. **A wall choice reaches beyond the selected piece.** D11, cut km 6.48–7.49, Left → None: removal and the two
   resulting violations cover km 6.25–7.70 (profile pink stripe, `025`). The card then reads "5 m, none (yours)"
   after the fix. Expected: the choice applies to the selected stretch (or the card says it changes the whole wall
   km 6.25–7.70). Area: noise-walls-seams.
5. **Keep on a demolished building**: the building is drawn standing across our road, and the pink wall-removal dashes
   are painted on its roof (`030`). The choices read Auto / Buy out / Keep where Auto currently means *demolished* —
   "Buy out" for a building in the road's way reads as a different thing than demolition. One word for it.
6. **D35 road and D35 motorway end in fields at B** (Staré Město, nothing connects, `033`, `035`). At A the new road
   starts beside the end of the existing road rather than on it; the motorway's 4 lanes start as a cut-off slab next
   to a 2-lane road (`032`, `034`). Same class as S1 #9. Area: long-corridors.
7. **Selecting something does not bring it into view.** Profile click on a piece that is partly on screen does not
   move the map even when the clicked km is off screen (`022`); *Your choices → Buy out house* at overview leaves the
   map at overview — the house is a dot (`041`). Clicking a 1 km piece from the overview never zooms in. Expected:
   fly so the selection fills a sensible part of the map.
8. **Zoom-in floor is high on Nová Paka**: six wheel steps over a house do nothing at ~200 m; houses cannot be looked
   at closer (`017`, `018`). D11 lets the camera much closer (S1 `014`).

### P2 — polish

9. 1280×720: the map gets 420 px, the profile 300 px; the intro card covers a third of the map (`038`).
10. Profile labels overlap: "5 m / 3 m" wall labels on top of "left: no wall" (`028`); D35 bend markers 6/7 overlap a
    crossing icon (`031`).
11. Noise band is clipped to a stepped box around the road; its limit line runs along the box edges, not the sound
    field (`045`; also S1 `093`).
12. The picker cannot start a preset fresh; only Continue (Start over is inside the game).

Retracted from S1: none. (A suspected road pick offset on Nová Paka was my aim; the road's hit band matches its line.)

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
