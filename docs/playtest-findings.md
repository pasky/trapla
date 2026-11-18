# Playtest findings (independent UX QA)

Played like a first-time player in headless Chromium with real mouse / keyboard (driver: `qa/drive.mjs`),
screenshots under `/tmp/trapla-qa/` (not committed). Newest session on top. Severity: **P0** broken /
untruthful, **P1** confusing, **P2** polish.

## P2 fixes re-check — main 5331cc1 (cost model 49; 2026-11-18, two browser chunks of 14 and 7 min + Node repros)

The P2s from the second re-check (PLAN.md "Portals, cones over houses, side roads of a rebuilt road" and "A drag past
the next bend; an unreachable pin"), played with real mouse in SwiftShader 1440×900 (`qa3/drive.mjs`). Screenshots
470–477 (`docs/screenshots/47x-qa-p2-*.png`), the rest under `/tmp/trapla-qa-p2/`. Bills on main: D35 first section
19.65 bn (was 19.22 at 1258a07), Královec starter 10.69 bn, D11 straight 8.79 bn, D3 0304 10.09 bn, all VALID.

| # | item | verdict | evidence |
|---|---|---|---|
| 1 | D35 drag along the road past the next bend | **FIXED** | Whole route (camera 13.8 km), click km 12 (the cut), drag 40 px right: the new bend passes bend 7 and swaps with it (bends at km 12.60 / 12.78), no U-turn; the only problem is "Bends 7 and 8 are too close for an S-bend · move them at least 393 m further apart", 19.13 bn (470). Other along-the-road drags VALID: D35 km 8.2 +50 px (19.40 bn), km 4.2 −50 px (18.88 bn, −778 M), km 13.8 +80 px (19.74 bn); D11 km 9 +40 px (9.05 bn), km 5 −60 px (8.48 bn). P2 below: a dragged bend can land on a straight and turn 0°. |
| 2 | Královec pin 8 px up at km 2.03 | **FIXED** (new P1 next to it) | "Pinned height out of reach: too steep · Set it to 439.5 m, or unpin", the card "Auto cannot reach it, so the track stays where it was", bill **10.69 bn**, no other problem (472). Typing 439.5 + Set: the pin is met (track 439.0 m, "Auto passes within 0.5 m of it"), but Auto leaves a stream in its open cut (P1 #1 below) (473). |
| 3 | D3 0304: the hill above the tunnel portal | **FIXED** | the far portal (km 1.59) from the hill at 45 and 120 m: the approach cut ends in the portal box, nothing pokes out of the hill (474). |
| 4 | D11 III/3012 dragged 23 m at km 2.4 | **FIXED** (new P1 next to it) | `qa3/designs/d11-iii3012-dragged-23m.json`: III/3012 10.4 M VALID, the track a junction ("track:junction"), no "covers a track", the old road removed (475). A UI drag of the road 30 px off its corner (new bend 3 at its km 0.31): track:junction too; NOT VALID only by "Bends 2 and 3 merge into one curve that is too sharp · move them about 20 m further apart" (honest). P2: two small white shards at the track's access by the cut edge (close-up `/tmp/trapla-qa-p2/c2/007`). |
| 5 | houses under bridge-end cones; turning areas | **FIXED** | D11 km 4.07: the civic building is drawn demolished beside the cone, card "Demolished · 18 M CZK · Under the fill in front of our bridge's end, km 4.07" (477). `scripts/bridge-ends-audit.ts --only d11`: 222 ends, 59 closed, no house under a cone (Královec starter: 13 cones, 0 walls). `scripts/works-clash-audit.ts --all`: no house clash; 12 "ours" track-diversion clashes on D3 / D35 starters (exit 0, as before). |

### New

- **P1 #1 — a met height pin leaves a stream in Auto's open cut, and the bill drops for it.** Královec starter, profile
  zoomed to km 1.7–2.4, drag the line at km 2.03 8 px up, then type 439.5 in the pin's Height and Set: the pin holds
  (439.0 m), but the cut-and-cover tunnel that started at km 2.0 now starts at km 2.15, and the 8–9 m deep open cut
  between runs through the stream at km 2.087 (1.6 km² catchment): "Our earthworks block a stream · put our railway on
  a bridge from km 2.05 to km 2.11" and "Our cutting runs through a stream · raise our railway … at least 2.8 m above
  the stream bed for a 2.0 × 2.0 m culvert, or use a bridge": neither is buildable 8 m under the ground with the pin
  1 m away, and Auto's own answer without the pin (cover it, the tunnel from km 2.0) is not offered. Bill 10.69 →
  **10.49 bn** (−198 M), NOT VALID: a player sees a cheaper invalid design one metre higher. Auto should engineer the
  stream for the pinned line (keep the cover over it) and price it (473).
- **P1 #2 — III/3012's corner dragged but "kept on the old road": our road's bridge shrinks for a road not built.**
  D11 straight, select III/3012 (click it south of our bridge), drag its north leg (its km ≈ 0.12 from the corner,
  camera after `lookAt(7660, 5430, 150, 250, 45)`) 25 px: the mapped corner PI moves 22 m (7652, 5362) → (7631, 5367),
  but the card says "Rebuilt stretch, up to 0 m from the old road … 566 m stay on the old road: kept as it is", the
  road bills 0 CZK and its drawn line is ≤ 0.6 m from the old road. Our road meanwhile bills **−143 M** (8.787 →
  8.644 bn): its bridge over III/3012 goes from km 2.185–2.424 to km 2.205–2.365, the crossing moved from (7658, 5483)
  on the old road to (7645, 5444), which lies on the straight from the start to the moved PI, i.e. our road crosses a
  line that is neither drawn nor built. The map also draws the moved handles away from the road (476). Repro:
  `SCENARIO=d11 npx tsx qa3/kept-corner.ts qa3/designs/d11-iii3012-corner-kept-on-old-road.json` (with the rebuilt
  road 8,643.8 M, bridge 2205–2365; mission only 8,787.0 M, bridge 2185–2424).
- **P2 — the computed fix of an unreachable pin is not a button.** "Set it to 439.5 m, or unpin" is plain text; the
  player has to type the number into Height. The other cards offer their fixes as buttons.
- **P2 — a dragged bend can land on the straight and stay as a 0° bend.** D35 km 4.2, drag 50 px back along the road:
  the dragged bend passes bend 2 and ends 137 m before it; old bend 2 is now "Bend 3 · turns 0° · no curve (straight)"
  with "Tightest the rules allow", Tightest / Widest and a design speed choice for a bend that does not bend; its
  number sits on top of bend 2's on the map (471). Same on D11 km 9: "Bend 1 · turns 0° · R 1,350 m · 4 m of curve".
- Not a bug, for the owner: a 40 px drag "along" D11's straight at km 9 still puts the bend 14 m off the line (the
  perspective), +264 M; known ("the price of a different road").

## Sweep 3 — second re-check — main 1258a07 (cost model 48; 2026-11-18, one 12 min chunk + Node repros)

The owner's shots (`/tmp/owner-shots/`) re-checked on the Královec starter (now 10.69 bn VALID), then a short sweep of
the railway, D11 and D35. Screenshots 420–429 (`docs/screenshots/42x-qa3re2-*.png`), the rest under `/tmp/trapla-qa3/s2/`.

### The owner's spots

| shot | spot on the starter | verdict |
|---|---|---|
| bridge-end-vertical-wall, rail-4 | km 10.27 (bend 3) | **FIXED**: one viaduct km 10.09–10.46, a cone at its high end, no wall (420). `SCENARIO=d11 npx tsx qa3/bridge-ends.ts rail`: no closed end on the line (was 3 walls of 16–28 m). |
| rail-2 fill under the viaduct | km 5.61–5.70 | **FIXED**: the walled 80 m fill is gone, one viaduct km 5.45–6.54 with cones (421). |
| rail-5 cone and walls | km 8.7–9.6 | **FIXED**: fills between the bridges end in paved cones; only the seam where a fill's side slope meets its cone reads as a line (422). |
| rail-7 overbridge fill into our cut | km 1.81, by the tunnel portal | **FIXED**: the street crosses on a deck from cut edge to cut edge, nothing spills into our cut (423). |
| rail-3 houses in the ramp | km 12.98, road II over our line and the station tracks | **looks FIXED**: ramps and the regraded side road pass beside the houses (nearest house centroids 12.7–16.6 m from the ramp axis), VALID; tight, worth an engineer's eye (424). |
| rail-1 a road cut and closed | not on the starter as drawn; km 12.05 is the same kind | **shown**: "Closed here · The track is cut by our railway. Both parts still reach other roads, so each just ends at our earthworks", with the crossing choices offered (425). |
| rail-6 two roundings overlap | km 2.03 | not re-tested in By hand (the fixer's shots 400–402 cover it); two Auto pins 15 m apart at km 2.03 / 2.045 give no overlap, the card reads "Pinned height · Auto passes within 0.5 m of it". |

### Sweep

- **Select before drag: PASS.** Railway, D35, D11 mapped road: a drag on a road that is not selected moves the map
  (camera 1.4 km, design unchanged) and the hover says "click to select"; a click selects (card: "Drag it to change
  its line. The highlighted 574 m … would be rebuilt"), then a drag bends / rebuilds it (426). A first-time player's
  drag on D11 with the intro up bends our road at once.
- Score change line: **FIXED** (Build → Road, Remove, drag III/3012, two undos: every headline matches its step, no
  stray per-road line). Lone hairpin: **FIXED** ("Hairpin at bend 2 has no room for its curve · move the bends next to
  it about 90 m further", 428); three hairpins still R 30 m and VALID but the end's sight line. Undo labels say what
  ("Undo: the motorway", "Undo: changing Road III/3012").
- **P2 — a drag along the road past the next bend makes a U-turn.** D35 first section, Whole route view (camera
  16.7 km), click the motorway at km 12 (selects the cut), drag 40 px right (along the road): the new bend lands at
  (14876, 3860), beyond bend 7 (14565, 3795) — "Bend 7 turns back almost on itself (178°)", "Bend 8 is too close to
  the U-turn", NOT VALID (427). One drag still can crowd a bend when it runs along the line.
- **P2 — one unreachable pin moves the railway 4–7 km away.** Railway starter, profile zoomed to km 1.7–2.4, drag the
  line at km 2.03 8 px up (pin 441.9 m, 10 m over the portal grade): "Pinned height out of reach" (honest) but the bill
  goes 10.69 → 12.06 bn and six problems appear at km 6.3–9.1 (a track covered, a stream blocked, two spans too low,
  overbridge ramps over 250 m / 10 m high) (429). The climb at its limit carries the lift (PLAN.md's known physics),
  but Auto then leaves its own new line invalid far from the pin.
- Still open from the first re-check: lines poking out of the hill above the 0304 portal; III/3012's drag covers 13 m
  of a track (PLAN.md "left").
- Bills on main: Královec starter 10.69 bn, D11 straight 8.79 bn (one 50 px drag at km 9: 6.97 bn VALID), D35 first
  section 19.22 bn.

## Sweep 3 re-check — main 81cd806 (cost model 41; 2026-11-17, one 9 min chunk + Node repros)

Same steps and `qa3/` repros as Sweep 3 below; screenshots 282–289 (`docs/screenshots/28x-qa3re-*.png`), the rest
under `/tmp/trapla-qa3/r1/`.

| sweep-3 item | verdict | evidence |
|---|---|---|
| P1 #1 design speed the wrong way | **FIXED** | `qa3/speed-monotone.ts`: 90 / 80 / 70 all 9.583 bn; `qa3/speed-per-bend.ts` on best: 0 of 36 slow-downs dearer (to −66 M); in the game the 70 click keeps 9.577 bn and the card says "Its stretch is the whole road. Auto rounds its hilltops and dips as for 90 km/h" (282). Railway bend card offers 120 · 100 · 80 · 60 only ("Its stretch: km 2.80–7.24; no faster than the whole line"); `qa3/rail-speed.ts`: a saved 160 / 140 bills as 120. |
| P1 #2 credit larger than the bridge | **FIXED** | D11 km 12.5 project: "Our road pays for its bridge over our road and the ramps up to it −48.3 M" (our overbridge bills 37 M + surcharge); project priced 9.12 bn, NOT VALID by its free ends only (285). |
| P1 #3 large earthworks on 0302 | **FIXED** | deepest cut 29 m, highest fill 21 m; one 1,678 m, 146 m high bridge (5.16 bn); starter 4.94 → 7.05 bn VALID (real section 10.54). D35's tunnel card: "a cut here would be up to 124 m deep; designers tunnel where a cut would be deeper than 30 m", Earthwork −2.09 bn. |
| P1 #4 vertical fill ends at bridges | **PARTLY FIXED** | 0302 ends on 7 / 19 m fills sloping on under the deck as cones with paving; the card lists them (287, 288). P2: at the 19 m end the fill's flank still ends in a steep edge beside the cone. **Still a wall** on the Královec starter (owner's shot): see New, first item. |
| P1 #5 new railway across ours | **FIXED** | `rail-new-railway-across.json`: on its bridge over our railway ("Our railway pays for its bridge over our railway −37.9 M"), 11.15 bn, only the two free ends (286). |
| P1 #6 mapped radius kept as yours | **FIXED** | III/3012 40 px drag: no radius problem (Bend 2 R 211 m, Auto). Left (PLAN.md): "earthworks cover 13 m of a track" at its km 0.14. |
| P2 hairpin card / tunnel card / arch reason / undo labels / tooltip | **FIXED** | tunnel card "Auto’s tunnel, built by cut and cover as you chose", no noise walls; greyed Arch says why ("too long for one arch: at most 3.3 times its arch"); Undo "Undo: changing Road III/3012". "Make it a hairpin" not re-tested (my bends reached only 168°). |
| P2 lines above the 0304 portal | **still open** | same view as 278 (289). |
| culverts in 3D (new) | **PASS** | D11 km 6.29 box: opening with headwall at our toe, the stream running in (`/tmp/trapla-qa3/r1/013`, `014`). |

### New

- **P1 — Královec starter: closed abutments up to 28 m high (the owner's "vertical grey wall").** km 10.27, start of
  the bridge km 10.26–10.46 at bend 3: grade 506 m over ground 478 m, the end closed, a 28.4 m wall and no cone; also
  km 5.61 (24.9 m) and km 5.70 (16.1 m), an 80 m fill walled at both ends. Cause: `support-layout.ts`'s final
  `closedEnds` check, `coneBuries(run.s0, 1, reach[0])` with defaults, counts the cone's flanks and any way, a
  relocatable field track included (23–31 m from each abutment), and never looks at `CONE.closedMax` (10 m); the
  extension search before it, for fills over 10 m, looks only along the axis and only at `strictWays`, so the bridge
  is not lengthened and the end is closed at full height (not priced apart from the bridge). Repro:
  `SCENARIO=d11 npx tsx qa3/bridge-ends.ts rail` (each bridge end: fill height, cone, or why none). Handed to the
  abutment-ends agent.
- **P1 — the score's per-road line belongs to another step.** D11 road: Build → Road (any), *Remove road*, then drag
  III/3012 40 px: the headline says −227 M (our road −234 M, III/3012 +6.5 M) but the line under it reads "Our road −234 M
  · New road −229 M · Road III/3012 +6.5 M", the removed road's −229 M added in. Ctrl+Z: headline +227 M, line unchanged
  with minus signs; Ctrl+Z again (bringing the road back, +229 M): the line flips to "+234 · +229 · −6.5". Loading a
  saved project lists "Road III/3012 −6.5 M · Road III/3012 +5.8 M" (one road twice).
- **P2 — a lone hairpin squeezed to R 13 m without a word.** The sweep-3 serpentine with only the middle bend a hairpin
  (PIs (12750, 16900), (12850, 16400) hairpin, (12950, 16900)): "Hairpin 2 · R 13 m · 36 m of curve" and the approval
  note, below the 30 m a hairpin needs; only the neighbours' S-bend problems say there is no room (284). All three
  hairpins: R 30 m each, VALID but the end's sight line, as before (283).
- Bills grew with the model: D11 straight 8.22 → 8.85 bn (the 7° bend at km 11.7 now +729 M, was +557 M), Královec
  starter 9.11 → 10.60 bn, 0302 4.94 → 7.05 bn — sourced mechanisms (PLAN.md model 41), noted for the owner.

## Sweep 3 — main 30d0ad8 (cost model 38; 2026-11-17, three chunks of 15, 11 and 10 min)

Fresh localStorage, real mouse, SwiftShader 1440×900 (toolbar also 1024–1920). Driver `qa3/drive.mjs` (+ `qa3/helpers.js`,
`qa3/q.sh`, `qa3/chunk.sh`); Node repros in `qa3/*.ts`, saved designs in `qa3/designs/`. Screenshots 260–281
(`docs/screenshots/2xx-qa3-*.png`), the rest under `/tmp/trapla-qa3/c{1,2,3}/`.

### Per-area verdicts

| area | verdict | notes |
|---|---|---|
| (a) hairpins / serpentine | **PASS** (P2s) | Build → Road on the Rýchory slope (x 12650–13050, y 16400–16900): three hairpins (R 30 m, 89 m of curve, ≈ 30 km/h), legs on embankments, the last leg into a 390 m tunnel with a cut-and-cover portal; no hairpin problem, only "Road ends nowhere" and the end's sight line (260). The card says it needs the road authority's approval (261). |
| (a) design speed per bend | **FAIL** (P1 #1) | the choice works (90 / 80 / 70, radius and time follow), but its price moves the wrong way. |
| (b) large earthworks | **still forced** (P1 #3, #4) | D3 0302: a 62 m deep, 1.56 km open cut (2.39 bn) and 41 / 47 m high fills at both ends of the Sázava bridge. |
| (b) tunnel portals | **PASS** | D35 and 0304 twin portals stand at the end of a ≈ 9 m approach cut, boxes in the slope (266, 277); the serpentine's portal the same. P2: lines poke out of the hill above the 0304 portal (278). |
| (c) bridge styles | **PASS** (P2) | D35 viaduct: Long spans (Auto, longest span 69 m) ↔ Short spans +99 M (53 m), the piers visibly denser (267); Undo / Redo step through the choice. Arch fitted none of the four bridges I tried. |
| (c) tunnel method | **PASS** (P2) | Cut and cover on D35 (124 m deep) and 0304 (40 m): "Too deep to dig from above · raise the road to at most 22 m below ground", +12.9 bn / +692 M shown; Undo restores (265). |
| (c) piers | **PASS** | D11 km 7.50–8.39 (along the valley road and railway) and the Královec viaduct: no pier on a road, track or stream in the views I checked. |
| (d) non-motorway cost | **not too expensive** | Nová Paka 165 M/km (real ≈ 200–230); D11 straight 443 M/km (1.39 bn of it demolitions through Trutnov), the best fixture 194 M/km; a rebuilt 105 m of III/3012 6 M; new class II roads on hillsides 180–260 M/km (cut / fill). |
| (e) editing any road | **PASS** with P1 #6 | III/3012 drag at km 2.4 → its own mapped radius makes it invalid until "Tightest"; then VALID, and moving it 23 m saves our road a 100 m bridge (−162 M). |
| (e) multi-road projects | **FAIL** (P1 #2, #5) | new road over our road: credit larger than the bridge that carries it; new railway over our railway: not on its bridge. |
| (e) undo / redo | **PASS** | across roads (a new road removed and restored), bridge style and tunnel method, Ctrl+Z during a held drag takes the drag back (bill unchanged after release). Labels are all "Undo edit" (P2). |
| (e) map ↔ profile | **PASS** | a click on the profile at km 2.85 selects the Sázava bridge, the map flies to it, both highlighted (281). |
| (e) toolbar | **PASS** | no overlap at 1024, 1280, 1366, 1920 px; at 1024 the view buttons wrap under Undo / Redo (280). |
| Whole D3 | **PASS** | loads in 12.5 s; a 60 px drag at km 40: live ≈ 31.93 bn equals the settled 31.931 bn, VALID (279). On SwiftShader each mouse move took ≈ 0.9 s to process (untimed run, not a budget verdict). |
| Královec railway | **PASS** | the final sweep's 50 px drag at km 6 is VALID (8.95 bn, −157 M). |

### P0

None confirmed. (#2 below becomes one as soon as such a road is priced.)

### P1

1. **A design speed changes the bill the wrong way.** The grade search is not monotone in the speed, so the new choice
   can't be trusted for money:
   - D11 road, fresh start: drag the road at km 11.7 160 px right (one bend, 7°), open Bend 1, *Design speed here* 70:
     **+284 M** (8.78 → 9.07 bn; an 800 m bridge at km 8.84–9.64 where 90 km/h has 280 m) although every vertical and
     horizontal minimum is smaller at 70. With one bend "this bend's stretch" is the whole road, so it is also "Too
     slow: 15.96 min" — the card does not say which kilometres the stretch covers (262).
     `npx tsx qa3/speed-monotone.ts`: 90 → 8.782, 80 → 8.783, 70 → 9.067 bn.
   - Královec railway after the km 6 drag (`qa3/designs/rail-kralovec-drag-km6.json`), bend 3 at **160 km/h: −312 M
     and 0.36 min faster** (8.948 → 8.636 bn), at 140 +22 M, at 100 +47 M (`SCENARIO=d11 npx tsx qa3/rail-speed.ts`) (263).
   - Best D11 design, each bend alone at 80 or 70 (`npx tsx qa3/speed-per-bend.ts scripts/best-design.json`):
     −35 … +45 M, 14 of 36 slow-downs dearer. A player who slows a bend to save money gets noise.
   Also: the railway bend card offers 160 and 140 km/h on the 120 km/h single-track mission, after the owner had the
   150 / 160 km/h pilot removed — owner's call whether a bend may go faster than the line.
2. **A road carried over ours is credited more than the bridge that carries it.** D11 road: Build → Road across our
   road at km 12.5 (from ≈ 700 m west to ≈ 700 m east, a 2 km top-down view; `qa3/designs/d11-new-road-across-km12.5.json`).
   The new road's card: "Its 593 m on the bridge over our road are built with that bridge, not twice **−238.3 M CZK**".
   Our road bills that overbridge at **37.4 M** (31 m span, 562 m of approaches as earth ramps), but inside the 593 m
   the new road draws its own viaduct over a dip (km 0.32–0.59, 185 M), so ≈ 160 m of drawn viaduct is billed by
   neither road (`npx tsx qa3/held-credit.ts …`; `heldChecks` in `core/project-evaluate.ts` credits every part of the
   held road within ±(span + approaches)/2) (274). Unpriced here only because both ends are free ("Road ends nowhere").
   On D3 0302 the same credit (Build → Road across the motorway at km 3.9: "335 m … −54.0 M") is close to what the
   motorway's bill rose (+59 M): the excess comes where the held road has its own structures inside the window.
3. **Large earthworks are still Auto's answer on D3 0302.** Start 0302: "Cut km 0.73–2.29 · 1,558 m · up to 62 m deep
   · 2.39 bn · Auto: at this depth cheaper than a tunnel" (268, 269) where the real section has the 1,843 m Luka tunnel
   (research/25, /49); the player's Tunnel on it costs +4.8 bn and "too little cover" at both ends. Either side of
   the Sázava bridge the motorway runs on 40–41 m (km 2.60) and 47 m (km 3.05) high fills: per station a 40 m
   fill bills 6.8 M against 26.5 M for the bridge beside it. If 40–60 m earthworks are what the model's prices say,
   the owner should see that decision explicitly; I found no rule capping cut depth or fill height.
4. **High fills end at a bridge in a vertical face.** D3 0302 km 2.63 and 3.05: the 41 / 47 m fill stops in a flat
   vertical wall under the deck (green rectangle from the side, a 40 m grey slab from the valley; clicking it selects
   nothing, no retaining wall is billed) (270, 271). Same on the Královec railway's bridge km 9.33–9.56 after the km 6 drag
   (grey triangles at both ends, 272). Real abutments sit in a spill-through cone or behind wing walls; what is drawn here
   is neither, and is not on the bill.
5. **A new railway across our railway is not put on its bridge.** Railway mission (starter), Build → Railway from
   (10950, 18484) to (12350, 18884) across our line in its cutting (`qa3/designs/rail-new-railway-across.json`):
   "Not on its bridge over our railway · Lower this railway here by 7.7 m" at km 0.73, while the card credits "Its 31 m
   on the bridge over our railway … −5.5 M" and our railway rose 9.10 → 9.37 bn for it (275). A 12.5 ‰ line cannot
   lose 7.7 m locally; the crossing engine should hold the new line at the deck (final-sweep P1 #3 still open for
   railway × railway).
6. **Dragging a mapped road keeps its mapped radius as "Your radius".** D11 straight start, select road III/3012
   (beside our road at km 2.4), drag it 40 px off: Bend 1 "R 120 m · Your radius" → "Bend 1 is too sharp for 70 km/h"
   + "radii too different" + "too close to its end", NOT VALID (276). The player never set a radius; "Tightest"
   makes it VALID (and the problem has no fix button). Since model 38 a drag lowers a set radius to fit; a mapped
   radius below the norm on a rebuilt stretch should be raised the same way, or start Auto.

### P2

- Hairpins: the Hairpin choice appears only once a bend turns ≥ 150°; "Bend 2 turns back almost on itself" (170°)
  offers no "Make it a hairpin" fix. Its bend marker sits where the tangents meet, ≈ 340 m from the hairpin itself.
  Shaping a serpentine with the mouse is fiddly: a drag on a long curve moves that curve's bend (by design), and a
  double-click near the road added nothing. A straight 270 m climb (21.8 %) bills its last 0 m "Embankment km
  1.47–1.47" at 1.13 bn (the track tie-in at the end, Auto found no legal height).
- Arch fitted none of D11 km 7.50–8.39, the D35 viaduct, the Sázava bridge (113 m deep V-valley, the classic arch
  site, 273) or 0302 after a far edit; the greyed button says only "Does not fit this bridge" — not why.
- Bridge style row on the Sázava bridge: Short spans greyed ("does not fit") until an unrelated new road 0.9 km
  away re-solved the grade (429 m bridge, then "Short spans +165 M").
- Tunnel card: after choosing Cut and cover the status still reads "Auto: at this depth cheaper than a cut" with
  Auto highlighted; D35's tunnel card offers noise walls (Left / Right 2–6 m) for a tunnel.
- 0302's 62 m rock cut is drawn as smooth dark-brown faces, no benches or netting visible (269).
- The score header "OUR MOTORWAY ONLY 4.99 bn ✗ NOT VALID" when only the new road is invalid.
- Profile tooltip "river: bridge +1".
- Undo / Redo labels are always "Undo edit" / "Redo edit".
- Auto extends a bridge 100 m (+162 M, D11 km 2.18–2.38) over road III/3012 running beside our road, where moving
  that road 23 m costs 6 M (the player's drag does it, P1 #6 aside) — Auto's "move a road running along ours" did
  not catch it.

## Final sweep — main e24df59 (2026-11-16, three chunks of 7, 9 and 7 min)

Fresh localStorage, real mouse, SwiftShader 1440×900. Screenshots `/tmp/trapla-qa/fin/` (numbering restarts per chunk).

### Per-area verdicts

| area | verdict | notes |
|---|---|---|
| Picker | **PASS** | groups Trutnov · Středočeská D3 (whole + 0301–0305/I) · D35 (whole + first section) · I/16; each card with speed, goal, sourced note. Retired presets only by old URL. |
| D11 road | **PASS** | intro clear; a 60 px drag at km 9 is live (≈ price while dragging) and lands VALID −1.05 bn; shaped reroute km 4.10 drags, length updates (424 → 461 m), VALID; noise view + wall labels; Whole route. |
| Owner's D3 III/1057 steps | **PASS** | cold page: hover shows grab, drag 1057 → rebuilt under the motorway bridge, **VALID and priced** (14.20 bn, −17 M) (`010`). P2: the bend label says "up to 4.3 m off the dashed polygon" (jargon) and is clipped at the map bottom; the −17 M is not explained on any card. |
| Phantom 2.5 bn side-road bridge (earlier P0) | **FIXED** | D3 motorway 18.49 → 14.22 bn; whole D3 has no crossing > 300 M. |
| D3 section (interchange ends) | **PASS** | 0301: A "D0 Praha", B "Jílové (on to 0302)" with interchange marks (`012`, `013`). |
| Whole D3 | **PASS** (P2) | loads in 17 s; drag shows ≈ prices live; the full result arrives ~20 s after release on SwiftShader. The live estimate overshot (≈ 38.2 bn → 37.37 bn). |
| Motorway one-direction edit | **PASS** | 0302 "Towards Hostěradice", 40 px drag: VALID −46 M; the card lists "Changed stretches · km 1.1–4.5 · Both follow this bend · Reset". I found no "Join" button; Reset plays that role. P2: "Drag this direction (Hostěradice (on to 0303))." double brackets. |
| Railway mission | **PASS** start, **P1** drag | Trutnov hl.n. → Královec, single-track 120 km/h, VALID 10.55 bn, ends at stations (no 150/160 km/h option on the start screen). |
| Build → Road / Motorway / Railway | **PASS** placing, **P1** crossings | rubber band + length; Motorway honestly "shown, not priced" (no interchanges). |
| Edit a street / a track on D11 | **PASS** street, **FAIL** reroute track | street: VALID, traffic 300 a day / 3 % "a guess for a quiet street"; track: 10 a day / 5 %. |
| Nová Paka | **PASS** | VALID 2.23 bn; the Session 3 km 3.3 drag is now VALID (+121 M) — the street conflict is resolved by Auto. |

### Owner complaints

| complaint | status |
|---|---|
| camera under the terrain | **fixed**: lowest pitch + 8 wheel steps into a hillside stops at 80 m, camera 28 m above ground (`004`, chunk 3). |
| walls teal / ugly | **better**: close up they are slim grey walls; teal only as map symbols / labels. |
| dashed line meaning | **fixed**: only the official / planned line is dashed, labelled on the map and in the legend. |
| black demolition cubes | **fixed**: hatched cleared plots, also while unpriced. |
| purple barely visible | tunnels read as purple dashed lines on map and profile; OK at all zooms tried. |
| clicking service roads / reroutes | **fixed**: every mapped road and reroute is clickable and draggable on the first try (cold). |
| junction earthworks over other roads | not reproduced this sweep. |
| D3 ends in fields | **fixed** for sections (ends at labelled section joins / D0); whole D3 ends at the open D3. |
| railway on highway ends | **fixed**: station to station. |
| 150 km/h | gone from the start screen (only an old saved-URL preset still has 160 km/h double track). |
| houses on the carriageway (unpriced) | **fixed**: unpriced D11 shows hatched plots at km 5.4, nothing standing on the road (`002`, chunk 3). |
| hidden traffic field | **fixed**: pre-filled (census / class / street / track guess), always visible. |
| "A" labels | fine: A/B with place names, section joins named. |

### New / remaining P0 – P1

- No P0 found.
- **P1 — a track that an automatic reroute also uses still can't be edited with a total.** D11 km 4.1 track: "Two roads change
  the same old road" + "earthworks closer than 10 m" → NOT PRICED (unchanged since 80168c3).
- **P1 — a 50 px drag of the Královec railway breaks streams far from the drag.** Drag at km 6: 5 violations — two
  "earthworks block a stream" / "cutting runs through a stream" at km 2.07 and 2.36, and "No buildable reroute for the
  track · lower our railway by 0.1 m" at km 6.29 (`006`, chunk 2). The track-height tweak by 0.1 m is a fix Auto
  should apply itself. Huge flat green fill blocks are drawn around the high embankments there.
- **P1 — new routes crossing our route are not resolved.** Build → Road across the railway mission: "The game cannot
  trace where this class II road goes · set this crossing to Our bridge over it" + "Too high under our road's bridge ·
  lower by 42.1 m"; Build → Motorway / Railway: "Roads cross here · move one road" (NOT CHECKED); new railway also
  "Embankment never reaches the ground" (`007`–`009`, chunk 2).
- **P1 — whole D3 drag leaves a track under the embankment**: "Our earthworks cover 41 m of a track · put our motorway on
  a bridge km 29.59–29.65" after a 60 px drag at km 30.

P2 summary: jargon "dashed polygon" in the bend label; Photo still has no in-game construction note on Nová Paka;
whole-D3 settle ~20 s and the live estimate can be ~0.9 bn off; double brackets in the direction card; the −17 M
motorway change on rebuilding 1057 is unexplained; the dropdown can list two routes both named "Motorway".

## Verification — main f9f5d9d (2026-11-16, two chunks of 15 and 4 min)

Detached snapshot of f9f5d9d with main's packs (traffic.json for every scenario). Screenshots `/tmp/trapla-qa/f9/`
(numbering restarts in chunk 2).

### Any-road Re-test 2 items

| item | verdict | evidence |
|---|---|---|
| cold start: first click / drag on a mapped road | **PASS** | fresh D3 motorway load, first hover over 1057 shows the grab cursor, the first drag edits it (camera unmoved) (`000`); D11 I/37 the same (`003`). |
| dragging the crossed road next to its crossing | **PASS** | a click right beside the motorway bridge still opens "Passes under our bridge", but a drag from the same spot edits 1057 (camera unmoved) (`002`). |
| rebuilt Nový Rokytník street on its bridge deck | **PASS** | dragged 40 px: VALID, "Its 100 m on the bridge over our road are built with that bridge, not twice −24.6 M CZK" (`004`). |
| D11 km 4.1 track used by an automatic reroute | **FAIL** | still NOT PRICED: "Two roads change the same old road · Keep the two changes of that road apart, or change it with one road only" + "earthworks closer than 10 m" (`005`). |
| 1057 rebuild: motorway price change explained | **not testable** | the owner's drag now ends NOT PRICED: "Two roads' earthworks are closer than 10 m · move one of them about 12 m away" at 1057 km 0.20, beside the motorway embankment (`000`); a second drag adds an S-bend violation (`002`). At 80168c3 the same steps were VALID and priced → **P1 regression** of the owner's D3 steps. |
| I/37 45 px drag keeps a total | **PASS** | TOTAL 10.20 bn (NOT VALID only for the drag's own S-bend / bend-near-end), with "Noise wall 2 m, 101 m long, for noise from both roads · 1.8 M CZK" on the I/37 card (`003`). |
| streets / tracks traffic prior | **FAIL (wording better)** | still 736 a day, 6.4 % heavy for a street and for a field track; the card now says "Not counted: a guess (the average class III road). Change it to what you expect." |
| dropdown framing | **PASS / P2** | Motorway → whole route; the rebuilt track is framed with its Start and bends 1–2 cut off at the top edge (`006`). |
| kept house heard by two roads | **PASS** | house next to I/37: "49.7 dB … both roads together (limit 50): our road 39.4 dB, Road I/37 49.3 dB". Keep + Wall left None → "Stays · behind Auto's 4 m wall beside your choice · You keep it", "none (yours) · Auto: 4 m beside it", "Auto adds 50 m of 4 m wall at km … · Show"; still kept (not bought) (`009`). P2: its cross-section still labels I/37 "our road, km 0.33". |

### Fresh first-time sweep

- **Picker** (all groups): Trutnov (road, railway) · "Středočeská D3" whole + 0301–0305/I · "D35" whole + first section ·
  "I/16" Nová Paka. Clear, each with speed, a one-line goal and a sourced note (`010`–`012`). P2: the Trutnov group has no
  heading while the others do.
- **D3 section 0302** loads in 8 s, ends marked "Jílové (from 0301)" / "Hostěradice (on to 0303)" (`013`). Choosing
  "Towards Hostěradice" changes nothing (7.59 bn → 7.59 bn, S1 #3 fixed). **P1:** dragging that one direction 40 px gives
  2× "The two directions overlap · move them 14 m apart or carry one over the other" at km 1.16 and 4.40 — exactly where
  the split starts and ends, +749 M (`014`). The split transition is left to the player.
- **Whole D3** (56.4 km, 40.87 bn) loads in 27 s.
  **P0 (still on main):** km 20.89, a class III road running alongside the motorway is "Carried over our motorway on a
  698 m bridge with 297 m of ramps · 2.48 bn CZK" (crosses at km 20.89 and 21.21); no such bridge is drawn, the works
  outline lies along the motorway (`001`). Same on the old D3 motorway preset (km 14.18, 2.51 bn).
- **Railway mission** now runs Trutnov hl.n. → Královec station, single track 120 km/h, VALID 10.63 bn (`002`–`004`):
  S1 #10 fixed.
- **Build menu**: Road / Motorway / Railway, each with a rubber band and length ("1.89 km · open ground (joins no road)")
  (`016`). A built motorway is "shown, not priced" (no interchanges) — honest. **P1:** both the new motorway and the new
  railway cross the Hostěradice railway with "earthworks cover a railway" + "too low over the railway · raise by
  9.3 m" instead of Auto bridging it; the new railway also gets "Auto found no legal track height" at its start
  (`017`, `019`). P2: the dropdown then lists two roads both called "Motorway".
- **D11** quick drag at km 9.0 (60 px at ~1 km view): −1.25 bn, the km 7.49–8.40 bridge becomes earthwork and
  **"Our earthworks cover a pond or river at km 8.55 · put our road on a bridge km 8.53–8.61"** — Auto leaves a stream
  under the embankment (`006`). P1, same family as the Nová Paka street (Session 3 #1).

## Verification — core-play-polish merged, main 27aeda6 (2026-11-16, one 10 min chunk)

Screenshots `/tmp/trapla-qa/cpp/`.

| item | verdict | evidence |
|---|---|---|
| Nová Paka km 1.91 hall kept behind a retaining wall | **PASS** | "Industrial / commercial · 3 floors · Stays · a wall keeps our works clear · Auto: a 0.6 m retaining wall along our road, km 1.89–1.92, keeps the works clear of it for 0.3 M CZK; demolishing it would cost 322 M CZK." The hall stands beside the cut (`001`). |
| kept house + Wall right None → house card names Auto's wall, with Show | **PARTLY** | D11 km 5.12 two-floor house, Keep then None: "none (yours) · Auto: 5 m beside it · km 4.96–5.27", plus "⚠ House 5.6 dB too loud · 2 m wall right km 5.05–5.18 · Buy out · Stop keeping" (`003`). The wall is named, but there is **no Show button** on the house card. |
| piece card: repeated problems once with a count | **PASS** | D3 road pond bridge km 13.30–13.85: "⚠ A bridge pier stands on a pond or river (15 places) · Bridge it" (`007`). The Violations panel still lists all 18 one by one, and "Bridge it" on a piece that already *is* a bridge reads oddly. S2 #2 itself (piers in a fishpond can't be valid) is unchanged. |
| By hand switch identical | **PASS** | D3 road 4.70 bn → By hand → 4.70 bn, VALID, ◆ points appear (`011`). |
| pin / height-point drag readout | **PASS** | dragging a ◆ shows "373.1 m · raised 12.0 m" by the cursor and "≈ 4.57 bn · checked when you pause" (`014`). P2: the Height point card still says 370.1 m during the drag. |
| small windows | **not tested** | ran out of the 15 min budget. |

## Re-test 2 — any-road-editing @ 80168c3 (2026-11-16, two chunks of 13 and 5 min)

Detached snapshot with the worktree's packs (traffic.json present for d11 and d3). Screenshots `/tmp/trapla-qa/ar2/`
(numbering restarts in chunk 2). A third chunk for dropdown framing and kept houses next to two roads did not get the
lock within an hour of timed runs, so those two were not tested.

| item | verdict | evidence |
|---|---|---|
| combined noise: project gets a total | **PASS** | D3 motorway + rebuilt III/1057: TOTAL 18.46 bn ✓ VALID (was "2 houses hear both roads — no total") (`010`). |
| owner's D3 III/1057 steps end to end | **PASS** (P1 below) | profile km 11.78 now flies there; click 1057 → card; drag ~45 px → rebuilt under the motorway bridge, 0 violations, priced. |
| #12 Build → Road onto the motorway with another road rebuilt | **PASS** | "A motorway can only be joined at an interchange…" (`011`). |
| drawn ≠ billed on a small drag (I/37 Novorokytnická) | **PASS** | a 45 px drag moves it up to 37 m and bills it (193 M, houses, junction 7 M) (chunk 2 `003`). |
| junction with its own class I road | **PASS** | only "Junction with the street at km 0.33". |
| streets / tracks editable | **PASS** | Nový Rokytník street → "rebuilt as a local road (M 7.5)", 30 km/h; a track → "one-lane track (P 4.0)", 20 km/h (chunk 2 `004`, `006`). |
| drags on a mapped road never pan | **PASS after the first click, FAIL cold** | once a road has been clicked, drags edit it (camera unmoved). On a fresh load the first click on a mapped road can do nothing and the first drag pans the map ~20–60 m (D3 1057 `008`; D11 I/37 chunk 2 `001`); mapped roads also show no hover cursor until then. Likely the lazy transport load (`ensureTransport`). |
| card titles | **PASS** | "Road I/37", "Street", "Track", "Road III/1057" once each. |
| bend label clipping | **PASS** | the "R 90 m · wanted 205 m — no room ⚠ …" label stays inside the map (wraps over the End marker). |
| pick offset | **P2 still** | D3 1057: pointer from ~5 px above the drawn band. |
| dropdown framing; kept houses / walls on the right road | **not tested** | lock contention, see above. |

New:

- **P0 — Auto builds a 704 m bridge for a class III road that runs beside the motorway.** D3 motorway start state:
  "Cut km 13.98–14.77 · 3.49 bn CZK"; the crossing card at km 14.18: "Carried over our road on a 704 m bridge with
  252 m of ramps · 2.51 bn CZK … crosses our road 2 times (km 14.18, 14.52)". The class III road runs alongside our road
  between the two crossings and nothing like a 704 m bridge is drawn; the total went from 15.31 bn (9f1191f) to
  18.49 bn. Possibly from main's merged crossing model (model 22) — check main. Area: crossing-links.
- **P1 — rebuilding 1057 makes the motorway 38 M cheaper.** Same D3 steps: the total moves −31 M CZK. Per-route bills:
  motorway 18 495 → 18 457 M, 1057 6 M. Nothing in the cards says why the motorway got cheaper (shared walls or
  buyouts now billed to whom?).
- **P1 — the drag can't start on the road next to its crossing.** Near the motorway bridge a click on 1057 opens the
  crossing card ("Passes under our bridge") and a drag from there pans the map (`006`, `007`).
- **P1 — rebuilt street not on its own bridge.** Nový Rokytník street dragged 40 px: "Not on its bridge over our road ·
  Lower this road here by 2.5 m"; its Auto height ignores the deck it must meet (chunk 2 `004`). Auto should resolve it.
- **P1 — editing a track that a reroute already uses loses the total.** D11 km 4.1 track north of our road: "Two roads
  change the same old road · Change it with one of them only" + "earthworks closer than 10 m", NOT PRICED (chunk 2
  `006`). The player can't tell which "other road" is meant: the automatic reroute isn't a road they edited.
- **P1 — a small drag of I/37 still loses the total:** 5× "Two roads take the same house" NOT CHECKED YET, plus S-bend /
  bend-near-end violations from one 45 px pull (chunk 2 `003`).
- P2 — a street and a track get "Not counted in the traffic census: the average class III road is assumed" (736/day).

### Re-test 2, addendum — the two untested items (80168c3, one 5 min chunk, `/tmp/trapla-qa/ar3/`)

| item | verdict | evidence |
|---|---|---|
| dropdown framing | **PASS** | from a view at km 1, choosing "Road III/1057" frames the whole rebuilt road (900 m view, Start/End/bends in sight, `001`); choosing "Motorway" frames the whole motorway (6 km view, `000`, `002`). |
| kept house / walls on the right road (two roads) | **PASS** (P1 below) | the only house heard by both roads after the owner's 1057 drag (night 59 dB from the motorway, 22 dB from 1057): card "Stays · behind a 2 m wall · 49.9 dB (limit 50)", the wall is on "our road, km 11.47" (the motorway), nothing billed to 1057. Keep → "You keep it", still VALID, not bought. |

- **P1 — after "Wall right: None" the house card still says "behind a 2 m wall".** Same kept house: None is shown selected,
  the total goes +3.6 M CZK and the card reads "Stays · behind a 2 m wall", the plan shows 2 m walls, the wall span changes
  to km 11.31–11.73 (`005`). Auto evidently re-walls the neighbouring stretch, but unlike the piece card ("Auto adds … instead
  · Show") the house card does not say so; to the player the choice looks ignored and dearer.
- (Tooling note: my wait-for-exclusive check matched other agents' shell lines containing the text "flock -x" and idled an
  hour; fixed to `pgrep -f "^flock -x"`.)

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
