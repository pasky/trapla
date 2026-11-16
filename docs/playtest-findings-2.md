# Playtest findings 2 (second independent UX QA)

Played like a first-time player in headless Chromium with real mouse / keyboard (driver `qa2/drive.mjs`, a copy of
`qa/drive.mjs` from the first QA that can also serve a second app root for save migration). The page API is used
only to frame a camera on A / B and to read state for exact repros. Screenshots under `/tmp/trapla-qa2/` (not
committed). Newest session on top. Severity: **P0** broken / untruthful, **P1** confusing, **P2** polish.

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
