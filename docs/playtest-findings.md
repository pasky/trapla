# Playtest findings (independent UX QA)

Played like a first-time player in headless Chromium with real mouse / keyboard (driver: `qa/drive.mjs`),
screenshots under `/tmp/trapla-qa/` (not committed). Newest session on top. Severity: **P0** broken /
untruthful, **P1** confusing, **P2** polish.

## Session 3 — Nová Paka and D35 motorway, first-time player (main 93f849d, 2026-11-16, one 10 min chunk)

Fresh localStorage, picker → Nová Paka, then D35 motorway. Screenshots `/tmp/trapla-qa/s3/`.
There is only one D35 motorway on main ("Motorway D35: Opatovec → Staré Město" = preset `d35-stage1-motorway`); a
whole-D35 entry is not in the picker, so "whole" was not testable.

### P1 — confusing

1. **Auto leaves a street under our embankment and calls it cheaper.** Nová Paka: one ~45 px drag of the road at km 3.3
   (from the 3.6 km view) → NOT VALID: "Our earthworks cover 33 m of a street — put our road on a bridge km 3.10–3.17",
   and the embankment card says "Auto: cheaper here than a bridge" next to the ⚠ and a *Bridge it* button (`009`, `010`).
   An ordinary conflict the automatic design should resolve itself. Area: crossing-links / any-road.
2. **One drag makes an S-bend violation.** Same drag inserts bend 3 about 30 m from bend 2: "Bends 2 and 3 are too close
   for an S-bend · move them 28 m apart" (`009`). The player only pulled the road once. Area: core play.
3. **The photo view's construction is unexplained in the game.** The picker card says "Ground includes the real
   bypass's cuts. Photo shows construction.", but once playing, Photo (O) shows bare earth works around A and along the
   bypass reference with no note (tooltip: "Aerial photo (O) — © ČÚZK…") (`005`, `020`). A player who skipped the picker
   text sees a building site and our road beside it. Say it once when Photo is turned on.
4. **D35 motorway still ends in fields at B** (S2 #6, unchanged): the 4-lane road stops at "B Staré Město" in a meadow;
   at A it starts on a field track crossing (`012`, `013`). Area: long-corridors.
5. (Re-seen) Profile clicks from the overview select but do not zoom, on both scenarios (`015`: card for Tunnel km
   4.27–7.03 while the camera stays at 23.7 km).

### P2 — polish

6. Nová Paka opens with the route tiny in the middle; the intro says "Drag the orange road" when it is ~3 px wide and
   hidden under labels; labels overprint ("Vidochov Vidochov", "Čistá u Horek / Horka u Staré Paky") (`001`).
   camera-polish (not merged yet) has a Whole route button and label declutter.
7. At B the "drag to bend" tip covers "Vidochov"; the roundabout (road I/16) card reads "Class I road 16 · Too short to
   change here", fine, but our road meets it at its rim without an entry arm (`002`, `003`).
8. Near A at Kumburský Újezd, translucent blue/white shards float in a line across our road (`004`).
9. In the photo view demolished plots are no longer marked: the real factory roofs show where our cut demolishes them
   (`019` vs `020`). The jagged white edge along the cut beside them (`019`) is the sawtooth seen in camera-polish.

### What worked

D35 motorway: a single drag of bend 3 south of the ridge kept it VALID and saved 1.01 bn CZK (tunnel shorter) —
satisfying and live (`018`). Contours with labelled heights read well; the tunnel is drawn as a dashed line over the
hill. Nová Paka: B joins the existing roundabout; starting values VALID, costs plausible, undo restored the best.

## Re-test — crossing-links camera-polish @ 6358d41 (2026-11-16, one 9 min chunk)

Detached snapshot (rebased on main 93f849d). Screenshots `/tmp/trapla-qa/cam/`.

| item | verdict | evidence |
|---|---|---|
| S1 #15 wheel at low pitch | **PASS** | tilt stops short of the horizon (`002`); wheel halves the distance each step down to 80 m (681 → 339 → 162 → 84 → 80), also at Voletiny where it used to stall at ~150 m (`001`). |
| S1 #15 pan at low pitch | **PASS** | a 300 px drag at 80 m moves the view ~25 m, the road stays in view (`004`). |
| S1 #15 profile flight from a low view | **PASS** | flies and looks down at km 6.3 (`005`). |
| S1 #15 rotate keeps the subject | **PASS** | right-drag 300 px: the selected piece stays near the centre (`006`). |
| S1 #15 way back to the whole route | **PASS** | "Whole route W" button frames A–B (`007`). |
| S1 #17 our road vs official line | **PASS** | after a drag our road is drawn in its own colours with a short solid bend guide; the dashed line is only the official D11, as in the legend (`008`). |
| S1 #19 labels | **PASS** (P2) | no horizon pile-up at low pitch (`002`); one label per wall. An "official D11" tag can sit under the top button bar (`004`). |
| S2 #8 Nová Paka zoom floor | **PASS** | 80 m, houses readable (`013`). |

Still open / new (not necessarily this branch):
- **P1 — a profile click from the overview selects but does not zoom.** D11 start view (22.5 km) or Whole route: clicking
  the profile at km 6.3 / 14 / 3 / 11 selects the piece, the camera stays put (it flies only when the place is off-screen
  or the view is low, `main.ts` `off`). The player sees a tiny highlight; S2 #7 remains. Dragging the road from there
  moves it kilometres (my 70 px drag made bend 1 turn 41° and +4 bn).
- **P1 — a tower stands on a demolished plot.** Nová Paka km 1.97: "Industrial / commercial · Demolished · In our cut"
  is a hatched plot, but a tall round chimney/silo with a red top still stands in its middle; it is not clickable (the
  click opens the plot's card) (`013`, `014`, `015`). Area: demolished drawing (noise-walls-seams, merged).
- P2 — the cut slope beside the Nová Paka cut at km ~2.0 has a sawtooth edge at close zoom (`013`).

## Re-test — crossing-links valid-reroutes @ f09ab24 (2026-11-16, two short chunks)

Detached snapshot (does not contain main 93f849d yet). Screenshots `/tmp/trapla-qa/vr/` (numbering restarts in chunk 2).

| item | verdict | evidence |
|---|---|---|
| S1 #13 chained reroutes | **PASS** | D11 straight start: all three cut tracks lead to a real crossing — km 2.14 → bridge km 2.32 (+315 m), km 4.10 → bridge km 4.01 (+421 m), km 9.43 → lowered underpass km 9.10 (+652 m). None points at another cut crossing. |
| works visible when selected | **PASS** | a selected reroute outlines the whole new track in yellow on both sides of our road (`000`, `001`, chunk 1 `017`). |
| crossing picked by its works | **PASS** | clicking the new track (grab cursor) opens that crossing's card (`002`). |
| shaped reroutes | **PASS** (P2 below) | dragging the new track adds bend points: "Path: your shape, 12 bend points · Automatic path", price updates (+16 M), still VALID (`004-reshape-after`). |
| valid automatic reroutes | **PASS** | the three reroutes run along the earthwork toe to the crossing; km 9.43 climbs "up to 15 %, the most its class allows where there is no other way" and switches back once on the hillside: plausible and explained. |
| lowered underpass km 16.58 | **PASS** | "75 m concrete box, the local road lowered by 3.3 m · 34 M CZK", ramps 89 m ≤ 8 %, drainage pipe; the cutting is drawn on both sides (chunk 1 `005`, `008`). |
| lowered underpass town-centre km 15.98 | **PASS** with P2 | "57 m box (5 × 4.5 m), service road lowered 2.9 m"; cuttings drawn. The very skewed box shows as a long grey slab sticking out of the embankment (chunk 1 `012`, `016`); the box length is honest, but real designers would square the crossing. |

New, P2:
- After reshaping, the card still says "+421 m of new track" while the cost tripled (5.9 → 18 M CZK) and the drawn path is
  visibly longer; header gains "crossed 3×" with no explanation (`004`).
- A map hover tip ("3 m wall left · 850 m · protects 11 houses") stays on screen after the camera moves away and even after
  loading another design (chunk 1 `008`–`010`).
- From the overview (≈ 6.8 km), wheel-in over the selected crossing first does nothing, then jumps to 44 m, overshooting
  (camera; camera-polish should fix this).

## Re-test — noise-walls-seams QA fixes @ 8ba793d (2026-11-16, one 3 min chunk)

Screenshots `/tmp/trapla-qa/nws2/`. All six fixes **PASS**:

- Left → None on cut km 6.48–7.49: card "none (yours) / Auto adds 350 m of 5 m wall at km 6.13–6.48 instead · Show"; Show
  selects stretch km 6.13–6.48 with "Auto: 5 m" (`001`, `002`). The total change is now +7.8 M (was +16 M).
- Legend shows "▨ demolished" as a hatched swatch (`001`).
- One wall menu: Auto / None / 2–6 m on both the piece card and the house card (`001`, `004`).
- Bought-out card: "Behind a 5 m wall still 55.1 dB at night (limit 50)" (`004`).
- House plan is 120 px tall and readable (`004`).
- Noise-view hover tip sits beside the house, clear of the legend (`006`).

P2 left: the bought-out card shows 55.1 dB (behind a 5 m wall) in its text and "57.8 dB was 58.0" (as built) in the
cross-section with no label telling which is which; hover tips are ~330 px wide for one line ("House 1 floor · bought
out", "3 m wall right · 110 m") (`005`, `003`).

## Re-test — any-road-editing @ 9f1191f (2026-11-16, SwiftShader 1440×900, two ≤ 20 min chunks)

Detached snapshot of 9f1191f. Screenshots `/tmp/trapla-qa/ar/` (chunk 2 restarted numbering; names differ).

| S1 item | verdict | evidence |
|---|---|---|
| #1 unpriced: houses on the motorway | **PASS** | D3 motorway + rebuilt III/1057 (not priced): km 0.75 shows the demolition marks along the carriageway, no houses on it (`008-m-km075-unpriced`). |
| #2 rebuilt road crossing the motorway | **PASS** (P1 left) | 1057 dragged ~40 m: the motorway bridges over the rebuilt road, its own Auto (`017-1057-crossing-oblique`); no crossing violation. But the project still never gets a total: "2 houses hear both roads — not checked yet, so the project has no total". |
| #6 rebuilt side road starts with violations | **PASS** for the owner's D3 step (0 violations; "old road is tighter than the norm at bend 1: kept as it is"). A second, larger drag of class I Novorokytnická (D11 A) gives "Bend 1 is too close to its start" + S-bend again (`022-cl1-dragged2`). It may be genuine, but it shows up after an ordinary drag. |
| #7 traffic field hidden | **PASS** | traffic pre-filled (1057: 736/6.4 % "average class III assumed"; Novorokytnická 12 476/9.1 % "Counted in the 2025 traffic census"); field stays visible above the bend card. |
| #8 "2 road changes" | **PASS** | "Road III/1057 not priced yet. Our road alone: 15.28 bn CZK". |
| #12 Build → Road onto the motorway | **PASS when priced, FAIL when not** | VALID D3 motorway: "A motorway can only be joined at an interchange…" (`000-valid-build-hover-motorway`). With 1057 rebuilt (unpriced), hovering the carriageway says "open ground (joins no road)" and a click starts a road there (`012-build-start-on-motorway`); a road ended on the motorway's cut slope gets 8.9 % and "Auto found no legal road height" (`011`). Likely `routeAt` reading `projectFull`, which only updates on a full result. Rubber band + length now shown ✓. |
| #21 card wording | **PASS** | "Road III/1057"; rebuild text plain. Minor: "signed 90 / built for 70 km/h (the lowest the norm allows)" is dense. |
| #22 old road drawn beside the rebuilt one | **PASS** | old road gone where removed (`006`). |
| #23 accessible traffic labels | **PASS** | aria "Traffic, vehicles a day" / "Heavy vehicles, percent". |

New:

- **P1 — drawn ≠ billed on a small drag.** D11 A, class I Novorokytnická, drag ~45 px: card "up to 11 m from the old road … 321 m
  stay on the old road: kept as it is" of a 0.32 km stretch, cost 0.0 M CZK/km, total unchanged 10.01 bn, while the map
  draws the road visibly off its old line (`021-cl1-dragged`). Either nothing moved (don't draw it moved) or it moved (bill it).
- **P1 — most mapped roads cannot be edited.** Every road I clicked in D11 villages (Lampertice, Nový Rokytník, "Nad
  Silnicí") is a street / service road / track: "Local roads, service roads and tracks cannot be rebuilt yet". In practice
  "click any road" works only on numbered roads. A drag on them pans the map silently.
- P1 — after the second drag the project loses its total to "84 houses hear both roads" + 3× "Two roads take the same
  house" (NOT CHECKED YET), with the junction itemised as "Junction with the class I road at km 0.00 · 25 M CZK" — the road
  being edited *is* the class I road.
- P2 — pick offset: Lampertice street, pointer cursor ~8 px left of the drawn band (same as S1 #14).
- P2 — card titles repeat: "Street / Street", "Track / Track".
- P2 — the bend label "205 m — no room ⚠ Bend 1 is too close to its start" is cut off at the map's left edge.
- P2 — choosing the road in the route dropdown does not bring it into view (S2 #7).

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
