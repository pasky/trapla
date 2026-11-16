# Playtest findings 2 (second independent UX QA)

Played like a first-time player in headless Chromium with real mouse / keyboard (driver `qa2/drive.mjs`, a copy of
`qa/drive.mjs` from the first QA that can also serve a second app root for save migration). The page API is used
only to frame a camera on A / B and to read state for exact repros. Screenshots under `/tmp/trapla-qa2/` (not
committed). Newest session on top. Severity: **P0** broken / untruthful, **P1** confusing, **P2** polish.

## Session 3 — main @ 217cfa4, first-time player (2026-11-16)

Fresh localStorage, D11 road preset, SwiftShader. Chunk `s3a` at 1440×900, chunk `s3b` at 1280×720, then the
same page resized to 1024×700. Areas: intro / help, noise view, house cards with buy out / keep, structure choice
per piece, profile pins, By hand points, Start over, best Load, small windows. Screenshots under
`/tmp/trapla-qa2/s3a/` and `s3b/`.

What worked:
- The intro is three short steps; Help is one screen of plain lines (`s3a/002`).
- The noise legend says what it shows ("Night noise at the top floors · houses in their own colour"); a kept
  house gets a notch in the limit line and its own KEEP tag (`s3a/010`).
- The bought-out house card explains itself ("Loudest from km 15.41: through the gap in the wall where the side
  road joins. A wall cannot close it.") and has a cross-section. Keep → "House 8.0 dB too loud · Buy out, or cross
  the side road without a junction"; Auto adds 3 m walls on both sides (`s3a/009`, `010`).
- Pins: drag the road line in the profile → "Pinned height 517.1 m · road now 516.6 m", with Set / Unpin
  (`s3a/019`).
- Start over shows "Back to the starting road. Undo" (`s3a/021`); Load says "Loaded your best design. Undo"
  (`s3b/012`).
- At 1280×720 every card fits.

### P1 — confusing

1. **Switching Road height to By hand changes the bill.** README: "By hand starts from the current heights".
   - D11 straight start with one pin: 10.96 → 10.81 bn (−143 M) on the switch alone (`s3a/020`).
   - Fresh D11 at 1024 px: 10.01 → 9.98 bn (−29 M), which becomes "★ your best" (`s3b/007`).
   - Switching back to Auto gives 10.01 bn, "+1.0 M" against the previous Auto state (`s3b/011`).
   - Expected: no change on the switch. If By hand points are cheaper, Auto is leaving money on the table and the
     player is rewarded for a mode toggle.
2. **By hand gives ~70 points, too dense to use.** They overlap, especially at 1024 px (`s3b/007`).
   - Dragging point 53 by 16 px produces "Two roundings of the road height overlap · Move height point 51 … from
     height point 52" — about points the player never touched (`s3b/010`).
   - The card calls the point "Dip 53"; the problem text calls the points "height point 51/52". Two names for one
     thing.
   - The Auto pin from before ("pinned 517.1 m") is still drawn in By hand mode, where pins do nothing
     (`s3a/020`).
3. **Auto rejects a cheaper bridge because of its own pier placement.**
   - D11 straight, embankment km 5.09–5.50 (Poříčí halls), card: "Auto: cheaper here than a bridge".
   - Choosing Bridge makes the project **107 M cheaper** (9.90 bn; presumably fewer halls demolished under a bridge) but NOT VALID: 9 × "A
     bridge pier stands on a service road / class I road · Move the route … or make our bridge longer"
     (`s3a/014`). The bridge card repeats "A bridge pier stands on a service road" twice.
   - Expected: Auto moves the piers (span lengths) off the roads, which is what designers do, and then picks the
     cheaper bridge. The "cheaper here" reason is per piece, not for the project.
   - Embankment card: "up to 10 m high"; bridge card for the same stretch: "up to 36 m high".
4. **1024 px wide window: the Build button covers the Contours button** (`s3b/003`); the profile legend drops
   embankment / cut / bridge / tunnel (only "ground, road height" left); the A label sits under the map legend.
   At 1024×700 the noise legend plus the map legend cover the lower-left third of a 400 px map; a bought-out house at
   km 15.5 is half under them (`s3b/006`).
5. **Selecting from "Where the money goes" never moves the map** (S2 #7 still open): at 1280×720 the selected
   embankment stays a yellow blob at the overview (`s3b/002`).

### P2 — polish

6. Profile pins: 1 px of drag is about 1.5 m at the default profile scale. A 30 px drag pinned the road 44 m higher
   and added 946 M (a 2 km bridge) (`s3a/019`). No live height readout while dragging the line; the label
   "pinned 517.1 m" overlaps the line.
7. Noise view tooltip on a bought-out house says only "House 1 floor · bought out" (no level, no limit), and is
   ~330 px wide for that text (`s3a/008`).
8. House plan strip: the house square is drawn on the road band although the house is 18 m from the road
   (`s3a/010`).
9. House card "Wall left · Auto" does not say what Auto chose (piece cards say "Auto: 3 m").
10. The "cross the side road without a junction" fix is text only; no button takes the player to that side road's
    card.
11. The noise band is still a stepped box with straight limit lines at km 5.5 and km 3 (S2 #11) (`s3a/004`,
    `006`); the demolished Poříčí halls are flat red footprints with black squares (S2 #1).
12. 1280×720: the map is 420 px tall and the profile 300 px, so the A marker of D11 sits under the legend
    (`s3b/001`).
13. Help places the Relief 1× / 1.5× / 2× / 3× buttons at the end of the Help text (`s3a/002`).

## Re-test 2 — motorway-rail @ 0464fb1 (2026-11-16)

Detached snapshot of `side-agent/motorway-rail` 0464fb1 (newer than the asked 931c5dc) with that worktree's
packs; SwiftShader 1440×900, fresh localStorage, two ≤ 20 min chunks (`m1`, `m2`). No timings quoted.

| item | verdict | evidence |
|---|---|---|
| S1 #3 choosing a direction changes nothing | **PASS** | D3 motorway: *Towards Václavice*, *Towards Jílové*: 15.31 bn, VALID, Undo stays "Nothing to undo" (`m1/002`, `003`). |
| #3 a drag splits only a stretch | **PASS** | Towards Jílové, drag the road at km ~5 outward: the two carriageways part over km 4.1–6.3 only, VALID, +457 M (`m1/011`); the card lists "The directions run apart km 4.1–6.3 · Join". |
| #3 Join restores the exact paired price | **PASS** | Join → 15.31 bn, VALID, −457 M (`m1/012`). |
| #11 one direction discoverable from the motorway's own card | **PASS** | "Edit: Both directions · Towards … · Towards …" on the no-selection card, on every piece card and in the Motorway section; hover says "drag to bend towards Jílové only" (`m1/001`, `006`, `017`). |
| mirrored profile for the direction towards A | **PASS** | Towards Jílové: profile reads from Václavice, bends renumbered from that end, piece kilometres in the cards remapped (`m1/003`). |
| 150 km/h pilot | **PASS** (P2 below) | D35 motorway (130): Motorway section → Speed limit 130 / 150 (pilot), plain explanation; 150 → +40 M CZK, cars 7.6 → 6.6 min; Undo back. D3 at 120: not offered (`m1/020`, `021`). |
| #10 railway mission ends on the network, "our railway" | **PASS** | "Railway: Trutnov → Královec" starts in Trutnov hl. n. track field and joins the old line at Královec (`m1/022`–`024`); crossing cards read "our railway 4 m above it" (`m2/000`). |
| #14 railway pick offset | **PASS** | D3 km 4.6 oblique: drawn Posázavský pacifik at y 280–284 px, clickable over 278–288 px (pixel check of `m2/004`). |
| #4 railway rebuild by drag | **PASS with P1s** | click the railway, then drag: the 676 m between its junctions becomes "Posázavský pacifik" single-track 120 km/h, priced on its own (`m2/008`, `010`); see P1 2–3. |
| Build → Motorway / Railway | **works, P1/P2s** | both build and price "this … only"; see P1 4, P2 9–10. |

### P1 — confusing

1. **A small drag changes heights and crossings far from it (same pattern as Re-test 1 P0 1, also in this
   branch).** Railway mission, drag the line between bends 2 and 3 (km 7.3) 20 px: +1.90 bn, most of the climb
   becomes one 5 km tunnel, the first tunnel's grade changes from 12.0 to 8.0 ‰ and "Our earthworks cover 18 m of a
   track" appears at km 2.07, before bend 2, outside the changed stretch (`m2/021`). Both track conflicts are
   ordinary ones Auto should resolve. Area: auto-profile / crossing-links.
2. **An unselected railway cannot be dragged.** Pressing on the drawn railway (on its click band) and dragging
   pans the map (`m2/005`; camera moved 35 m in a second try). No hover hint either; "drag to change" appears only
   after a click selects it (`m2/008`). Roads are dragged directly, so the player who reads "drag it like a road"
   thinks railways cannot be changed.
3. **The first rebuild of the railway starts with a U-turn.** Select the Posázavský pacifik at D3 km 4.6, drag the
   middle of the highlighted stretch ~40 px: "Bend 1 turns back almost on itself (172°)" at km 0.05 and "A long
   bridge span is too low … raise the bridge at km 0.11 by at least 12.4 m" (`m2/010`); the start label and bend 1
   sit on top of each other. Expected: the rebuilt stretch keeps the old line's direction at its ends and Auto
   heights its bridge.
4. **Build → Motorway / Railway: no line from the start to the cursor**, and a motorway built across the valley
   under our D3 viaduct is "Roads cross here · Move one road so they do not cross" ×4 although the viaduct spans
   130 m above it; its carriageways run through the viaduct piers (`m2/017`, `018`). The project shows "2 road
   changes not priced yet" after one build and the total is replaced by "THIS MOTORWAY ONLY 49 M CZK" (S1 #8 still
   open).
5. **The railway mission's Auto design demolishes a street in Trutnov.** Out of Trutnov hl. n. the line runs
   0.4 km in an open cut through the town before its first tunnel; about 25 buildings are demolished, drawn as
   floating black squares (`m1/023`). A real design would start the tunnel at the station (cut and cover). Also two
   streets near A are each rerouted to the next crossing, which is itself cut (km 0.04 → 0.14 → 0.28), as in S1 #13.

### P2 — polish

6. Violation list location column wraps as "Motorway / towards / Václavice / km 6.17" in four lines (`m1/009`).
7. Overlap after dragging one direction across the other: "The two directions overlap · Move the directions at
   least 14 m further apart" also reports a 0.1 m bridge clearance shortfall ("Raise the bridge … by at least
   0.1 m") that Auto could add itself (`m1/009`).
8. 150 km/h pilot: the goal (≤ 8.3 min) is already met at 130, so the pilot only costs money; nothing in the game
   rewards it. Travel time assumes 150 km/h everywhere, though the card says only "when it is dry, clear and not
   busy".
9. Build → Railway card: "A click on a road joins it there" (should be a railway); railway violations still say
   "road": "Lower the road here", "Auto found no legal road height", "Embankment never reaches the ground … now up
   to 0.0 m above the ground" (`m2/020`).
10. The "Edit" direction selector appears twice when a piece is selected and the Motorway section is open
    (`m1/021`).
11. The profile of the direction towards A has no end labels; with A / B on the map unchanged, which end is which
    has to be inferred from bend 1.

## Re-test 1 — long-corridors @ f058dc7 (2026-11-16)

Detached snapshot of `side-agent/long-corridors` f058dc7 with that worktree's packs (d3-0301…0305, d3-full,
d35-full). 1440×900. Chunks `c1`, `c2`, `c3` = SwiftShader (untimed; host load 12–25, so SwiftShader timings are
meaningless and are not quoted); `g1` = hardware GPU under the exclusive lock, load ≈ 3 (all timings below are from
`g1`). Old saves were made on main 217cfa4 (D3 road, D3 motorway, D35 two-lane road, one drag each) and their
localStorage copied to the snapshot's origin, as happens when the user's tab picks up the merge.

### Verdicts on the assignment

| item | verdict | evidence |
|---|---|---|
| Picker: Středočeská D3 group (whole first, then 0301…0305/I), D35 group (whole, first section) | **PASS** | `c1/000`, `002`, `004`. Section titles carry the real names, each card says what it follows / continues as. |
| P2 #18 cards missing class / speed | **PASS (one left)** | every D3 / D35 / Nová Paka card shows "Motorway · 120 km/h" etc.; the D11 card still reads only "Class I road" (no speed) (`c1/000`). |
| 0301 A "starts in the D0 interchange" | **FAIL (visual)** | see P1 2 (`c1/013`, `014`). |
| Voračice / I-18 interchange (0304 B, 0305 A) | **FAIL (visual)** | see P1 2 (`c1/033`, `039`). |
| 0305/I B merges onto the open D3 | **PASS** | our carriageways run into the mapped motorway at Nová Hospoda (`c1/040`, `041`). |
| "on to 03xx" section ends | **PASS with caveats** | B labels name the next section, the planned line runs on past B (0301 `c1/017`, 0303 `c1/027`, 0304 `c1/032`); exceptions in P1 3 / P2 4. |
| Owner: "D3 starts and ends in the middle of fields"; P1 #9 motorway ends in fields | **Partly fixed** | 0305/I B is real; section ends are explained; 0301 A and both Voračice ends still read as a motorway stopping dead at a minor road. |
| Whole D3: startup | **PASS (GPU)**, wording P2 | 5.0 s from navigation to ✓ VALID 40.74 bn (2.9 s of "—", 1 s of "≈ 40.74"). |
| Whole D3 / D35: framing | **FAIL** | see P1 4. |
| Whole D3: drag feel | **PASS** frames, **P1** bill | drag 16.7 ms p50 / 16.8 p95 / 33 ms max frames; but the price does not move during the drag (P1 5); settles 2.5–2.8 s after release. |
| Whole D3 / D35: edits | **FAIL** | see P0 1: a local edit breaks crossings 9–24 km away. |
| Retired old Jílové → Václavice presets, Continue for old saves | **PASS** | without saves the picker hides them (`c1/002`); with main's saves three Continue cards appear ("…(earlier map)", "Opatovec → Staré Město (two-lane road)") (`c2/006`) and each restores the exact bill and violations of main (5.41 / 15.29 / 6.28 bn, 5 / 4 / 1 violations) (`c2/008`–`010`). |
| Undo / reload | **PASS** | Undo returns the whole-D3 bill exactly (40.74 bn) in 2.5 s; a 0302 edit survives reload and the picker then offers Continue (`c2/027`). |
| P2 #24 Nová Paka route tiny at start | **PASS** | route fills the middle of the map (`c2/021`). |
| Crossings spot check (0303 class II road km 3.06) | **PASS** | overbridge with ramps, card readable (`c2/023`, `025`). |

### P0 — broken / untruthful

1. **A local edit on a whole corridor breaks crossings 9–24 km away.** Every repro survives a reload (it is the
   settled evaluation, not a preview artefact).
   - Whole D3, start view, drag the road just before bend 14 (km 24.5) 20 px sideways: 6 violations, all at
     km 33.05–34.85 ("Ramps up to the bridge over our road would be more than 10 m high", "… longer than 250 m",
     "Our earthworks cover 49 m / 88 m of a class III road"). Nothing near the edit (`c3/001`, pink marks in the
     profile at 33 and 35 km).
   - Whole D3, drag the road between bends 16 and 17 (km 29.5) 60 px east: besides the local S-bend violation,
     4 violations at km 45.15–45.17 (`g1/003`, `g1/008`). The crossing card there says Auto chose "Carried over
     our road on a 67 m bridge … our road 4 m **above** it", then "⚠ Ramps … more than 10 m high". So Auto
     picks a remedy that cannot work, at a crossing the player never touched.
   - Whole D35, drag the road at km 8.2 15 px: violation at **km 32.31** near Mohelnice, "Our earthworks cover
     46 m of a class I road" (`c3/004`, `c3/005`).
   - Every one of these designs was ✓ VALID before the edit, and the far stretch's ground plan did not change (km
     only shifts). Expected: an edit changes heights and crossings only around the edit (or Auto re-resolves the far
     crossings so they stay valid). The bill moves too (e.g. −1.39 bn for a 20 px nudge), so part of the bill
     changes far from the edit. Likely the auto profile re-solving the whole route differently. Area:
     long-corridors / auto-profile / crossing-links.

### P1 — confusing

2. **"Interchange" ends are drawn as a motorway stopping dead at a minor road.**
   - 0301 A (D0): the 4-lane cut ends flush against road II/101; the D0 runs ~150 m away and does not connect to
     anything; no ramps; the label "D0 Praha" sits on the II/101 (`c1/012` top, `c1/013`, `c1/014`). Clicking A
     selects the 5.3 km "Cut" piece; no card mentions the interchange (the disclosure is only on the picker card).
   - 0304 B and 0305/I A (Voračice, I/18): the motorway T-ends into the I/18 at grade (`c1/033`, `c1/039`).
     Clicking the I/18 next to B selects nothing (`c1/036`).
   - Expected: at least a drawn junction (ramp stubs / a marker with a card "Interchange with I/18 — ramps not in
     this job"), and for the section boundary the motorway continuing over the I/18 rather than ending on it.
3. **0303 B ends 60–80 m short of a road, as if it should join it.** B "Václavice (on to 0304)" stops in the
   field right before the II/112 link road, which crosses the planned line just beyond (`c1/027`, `c1/028`).
   The interchange "MÚK Václavice" is not visible on either side. Same for 0301 B (MÚK Jílové with II/104 at
   km ~8.4, nothing drawn) and 0302 B (MÚK Hostěradice). Fine as a section boundary, but the player sees
   a motorway that ignores the road it is obviously meant to serve.
4. **Whole corridors are not framed.** Whole D3 opens on km ≈ 8–35: neither A (Praha) nor B (Nová Hospoda) is on
   screen (`c1/043`); whole D35 has A behind the intro card and B off the right edge (`c2/011`). Section starts
   put B under the attribution bar (0301 `c1/006`, 0303 `c1/024`, 0304 `c1/029`) or below the map (0305/I
   `c1/037`). Expected: A and B visible, clear of the intro card and the legend.
5. **Whole D3: the price does not follow the drag.** Drag the road between bends 16 and 17 for 1.9 s: the score
   shows "≈ 40.74 bn" (the pre-drag price) and "⋯ checked when you pause" the whole time; after release it stays
   at ≈ 40.74 for another 1.9 s, then ≈ 40.81, then the result at 2.8 s (`g1/001`, `g1/002`). Map and bends
   follow the mouse smoothly. The player cannot see what the drag costs until it is over.
6. **A small first drag on 0302 runs into the starter's bend sitting on B.** The starter has bend 2 about 30 m
   before B (`c1/023`). Drag the road at km 3 by 40 px: −819 M CZK but "Bend 3 is too close to B · Move bend 3 at
   least 117 m further from B" (`c2/026`). The player did not place that bend and it cannot move "further from B"
   without leaving the planned line. Also the B marker in the overview is half hidden by that bend's circle
   (`c1/019`).
7. **Ordinary track / road conflicts left to the player after a drag on whole D3.** km 19.97 "Our earthworks
   cover 44 m of a track" (`g1/004`); km 25.25 "A tunnel entrance stands on a track" (`c1/050`). Same class as the
   first QA's S2 #2; owner rule: Auto resolves ordinary conflicts.

### P2 — polish

8. Startup / undo wording: while a whole corridor loads, or after Undo, the chip says "⋯ checked when you pause"
   although the player is not dragging; the cost is "—" for 2.9 s with an empty outlined box where the card goes
   and an empty profile (`c1/044`). During Undo the change line keeps the old "+3.27 bn" next to the new
   ≈ 40.74 for ~1.6 s.
9. Planned line beyond the ends has gaps: 0302 B — nothing drawn for ~500 m past B, then a stub (`c1/022`);
   0302 A — the 0301 planned line stops ~100 m before A (`c1/021`).
10. Picker: Nová Paka sits under the "D35" heading (no heading of its own) (`c1/004`); D11 card has no speed;
    "Built as D 27.5; the planned road is D 26.0" is category code jargon; whole D3 says 120 km/h while 0304
    and 0305/I say 130 km/h.
11. Retired cards only offer Continue; a player cannot discard an old save from the picker.
12. Crossing card line "our road 1 m below it" (0303 km 3.06, `c2/023`) is ambiguous: below the crossed road's
    old level or below its new bridge? Below an overbridge it reads like a clearance of 1 m.
13. The fan-shaped ramp earthworks at the km 45.17 crossing look like a green star around the crossing point
    (`g1/008`).
14. Undo history is lost on reload (after a reload of an edited whole D3, Undo is greyed out; *best → Load* is
    the only way back).
