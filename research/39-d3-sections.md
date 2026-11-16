# Středočeská D3 as its construction sections

2026-11-16. Sources for the five section scenarios `d3-0301` … `d3-0305` (ŘSD leaflets, mapped OSM line)
and for where their ends are placed. Raw extracts are not committed (pipeline caches + `/tmp`).

## Official sections (ŘSD leaflets, all “stav k 09/2025”)

| Section | Leaflet | Length | Category | Chainage, ends (leaflet wording) |
|---|---|---:|---|---|
| 0301 Praha–Jílové | [Stavby/45](https://apdos.roadmedia.cz/Upload/Stavby/45/infoletak_d3-0301-praha-jilove.pdf) | 9,514 m | D 27,5/120 | “začíná v km 0,000 v rozštěpné MÚK D3 x D0 (Pražský okruh) a končí v km 9,514 za MÚK Jílové se silnicí II/104” |
| 0302 Jílové–Hostěradice | [Stavby/44](https://apdos.roadmedia.cz/Upload/Stavby/44/infoletak_d3-0302-jilove-hosteradice.pdf) | 4,486 m | D 27,5/120 | from MÚK Jílové (km 9.512) to “km 13,900 za MÚK Hostěradice se silnicí II/106” |
| 0303 Hostěradice–Václavice | [Stavby/43](https://apdos.roadmedia.cz/Upload/Stavby/43/infoletak_d3-0303-hosteradice-vaclavice.pdf) | 11,292 m | D 27,5/120 | km 13.900 to “km 25,198 za MÚK Václavice s Václavickou spojkou silnice II/112” (later “km 25,200”) |
| 0304 Václavice–Voračice | [Stavby/42](https://apdos.roadmedia.cz/Upload/Stavby/42/infoletak_d3-0304-vaclavice-voracice.pdf) | 15,840 m | D 27,5/130 | “navazuje za MÚK Václavice v km 29,200 … a končí v km 45,040 za MÚK Voračice se silnicí I/18” |
| 0305/I Voračice–Nová Hospoda | [Stavby/41](https://apdos.roadmedia.cz/Upload/Stavby/41/infoletak_d3-0305-I-voracice-nova%20hospoda.pdf) | 17,360 m | D 27,5/130 | km 45.040 to “km 62,400 za MÚK Nová Hospoda se silnicí I/3, kde navazuje na provozovaný úsek” |

The five lengths sum to 58,492 m; the Ministry of Transport gives the whole as 58.5 km
([MD](https://md.gov.cz/Media/Media-a-tiskove-zpravy/Aktualni-stav-pripravy-stredoceske-D3): “Kompletní
délka středočeské části dálnice D3 je tedy 58,5 km”). The chainage jumps by 4 km between 0303 (ends
25.200) and 0304 (starts 29.200): a stationing equation, not a gap. 0305/I's leaflet also says it joins
the operating 0305/II “v km 58,900”, a third stationing; its end junction is called MÚK Mezno in the body
text. These printed values are kept as they are.

## Mapped line and where the section boundaries go

Overpass, 2026-11-15T23:03Z, `[bbox:49.50,14.35,50.05,14.85]; way["ref"="D3"]`. The southbound proposed
carriageway is one continuous chain: way **149101901** (first node 8227650623 at the D0 interchange, by
road II/101 about 185 m south of the D0 carriageways) → **755488913** → **755488916** (last node
7554677122 on road I/3, ≈ 250 m north of node 248183130 where the operating D3, mapped as motorway,
ends and I/3 continues north). Projected to EPSG:5514 the chain is **57,427 m**, 1.8 % shorter than the
leaflets' 58.49 km (it starts outside the interchange's km 0 and is not the design geometry).

Leaflet chainages of features that the mapped line also crosses give a nearly constant offset
δ = official (continuous) km − mapped metres:

| Feature (leaflet) | Official km | Mapped crossing | δ |
|---|---:|---:|---:|
| Sázava bridge “v km 12,5” | 12.5 | 11,579 m (river way 23013721) | 0.92 |
| overbridge of the existing II/106 “v km 13,1” | 13.1 | 12,427 m | 0.67 |
| III/1057 “v km 23,1” | 23.1 | 22,489 m | 0.61 |
| bridge over III/11434 “v km 31,880” | 27.88 | 27,177 m | 0.70 |
| III/11444 “v km 40,187” | 36.187 | 35,449 m | 0.74 |
| III/11445 “v km 42,493” | 38.493 | 37,777 m | 0.72 |
| railway Sedlčany–Olbramovice “v 44,459” | 40.459 | 39,831 m | 0.63 |

(0304 values are minus the 4 km stationing jump.) Section boundaries are placed at the leaflet chainage
minus the δ of the nearest anchors, then checked against the leaflet text (“beyond MÚK …”):

| Boundary | Official | Mapped | Check |
|---|---:|---:|---|
| 0301 / 0302 | 9.514 | 8,710 m | II/104 crossed at 8,385 m; leaflet MÚK Jílové “v km 9,2” |
| 0302 / 0303 | 13.900 | 13,230 m | δ 0.67 of the II/106 overbridge just before it |
| 0303 / 0304 | 25.200 | 24,590 m | MÚK Václavice “v km 24,9”, δ 0.61 of III/1057 |
| 0304 / 0305/I | 45.040 (41.040) | **40,406.8 m** | I/18 (way 9525057) crossed exactly here; the leaflet ends 0304 480 m after the Nový potok bridge (km 44.560), and I/18 is crossed 480 m after the mapped bridge |

The 0304/0305 boundary is therefore the Voračice interchange with I/18 itself: both sections end there with a
declared `interchange` junction on way 9525057 (a first placement at 40,410 m, 3 m off the road, left the
end on the road: “earthworks cover 39 m of a class I road” at km 0 of 0305/I).

Mapped section lengths: 0301 8.70 km (from its declared start, below), 0302 4.52, 0303 11.36,
0304 15.82, 0305/I 17.02 km + the ≈ 250 m to the operating motorway.

## Ends

- **0301 A, D0 interchange.** The route starts where the mapped mainline begins inside the planned
  D0 × D3 interchange (49.9625454 N, 14.4967020 E; 13.7 m south of node 8227650623 along the first
  segment), under an existing bridge of road II/101 (way 171863668, `bridge=yes`, not part of the ground
  network: our road passes beneath it). Declared endpoint junction of kind `interchange` with the bridge's
  two approaches, ways 312960727 and 171863669 (21 m from A). Price: no sourced figure for a system interchange exists. The SFDI SPK 2026 report
  says interchange branches built on earth are part of the motorway's per-km standard (“větve MÚK budované
  na zemním tělese … za předpokladu 1 MÚK/7 km trasy”; bridges and crossed roads priced by their own
  norms), the 0301 leaflet gives only the whole section (12.9 bn CZK excl. VAT, incl. D0 widening over
  909/1107 m) and the SPK A.4.N interchange (76.7 M CZK) is restricted to class I roads below S 20.75.
  The kind therefore reuses the PROVISIONAL junction allowance (25 M CZK) and 90 m zone of the merge
  (research/28) for the roads it rebuilds at our end; the D0 widening and the ramp bridges are not in the
  game's bill. Engine limit, disclosed in the picker notes of 0301 and the whole D3 (“its ramps are not part of
  the job”).
- **0305/I B, operating D3.** B is node 248183130 (49.54341 N, 14.6652862 E), where the motorway ways of
  the operating D3 end and I/3 continues; the mapped new line meets I/3 ≈ 250 m north of it. Declared
  `merge` (research/28) onto the motorway ways 807875702 / 807875701 and the I/3 ways 1545424303 /
  115670156. The leaflet's MÚK Mezno / Nová Hospoda (figure-eight, 1,381 m of branches, I/3 relocated
  over 1,268 m) lies on our route before B; like every interchange inside a section it is covered by
  the SPK per-km norm (earth-built branches) and the I/3 crossings are priced as crossings.
- **0304 B / 0305/I A, Voračice.** `interchange` on I/18 (above).
- **All other ends** are section boundaries in open land just beyond an interchange. The picker says
  “Continues as section 03xx” / “Follows section 03xx”; they are mission ports (the motorway continues).

## The earlier `d3` pack

Its ends are mapped nodes 6393863317 (6,922 m) and 5108369461 (22,602 m): from 1.8 km before the
0301/0302 boundary (before MÚK Jílové) to 2.0 km before the end of 0303 (before MÚK Václavice) — most of
sections 0302 and 0303, not their exact scope. Its presets `d3-road` / `d3-motorway` are retired from the
picker (cards only to Continue an existing save, direct links keep working); saves stay untouched.

## Packs

5 m cells, rectangles = section line + 2.5 km margin, 500 m rounding (EPSG:5514):

| Pack | Rectangle | Cells |
|---|---|---:|
| d3-0301 | −745000, −1068000 → −736500, −1054500 | 1700 × 2700 = 4.59 M |
| d3-0302 | −745000, −1072500 → −738500, −1062000 | 1300 × 2100 = 2.73 M |
| d3-0303 | −744000, −1080000 → −732000, −1066500 | 2400 × 2700 = 6.48 M |
| d3-0304 | −743000, −1094500 → −732000, −1074500 | 2200 × 4000 = 8.80 M |
| d3-0305 | −743500, −1108000 → −731000, −1088000 | 2500 × 4000 = 10.0 M |

All below D11's 15.75 M cells. Geology: the southern sections reach the Moldanubian paragneiss and
migmatite; new map descriptions (pararula, migmatit, porfyr, žilný křemen, pyroxenit, leptynit, vápenec,
Variscan granite dated Carboniferous) map to the existing broad groups, uncalibrated priors. They only
replace former “unknown” results: every earlier pack's polygons classify exactly as before.

## Starters (motorway missions, D 27.5, Auto profile)

Mapped-line bends every ≈ 1.5 km (`scripts/scenarios/check.ts --seed`), then the smallest bounded move
that makes the design valid; no norm changes, no suppressed violations, no structure or crossing overrides,
not cost-optimised. Every bend is editable.

| Section | Repair | Length | Cost | Full evaluation (Node, median) |
|---|---|---:|---:|---:|
| 0301 | none | 8,449 m | 5.498 bn CZK | 60–67 ms |
| 0302 | none | 4,494 m | 7.792 bn CZK | 25–33 ms |
| 0303 | bend 3 by 45 m (track at km 6.95) | 11,093 m | 6.582 bn CZK | 150 ms |
| 0304 | none | 15,471 m | 9.258 bn CZK | 64–74 ms |
| 0305/I | bend 3 by 12 m (class II road at km 7.56) | 17,044 m | 9.708 bn CZK | 260 ms |

0305/I needed an engine change first: Auto left three crossed roads (km 5.03, 7.56, 16.83) where neither
our bridge nor theirs fit (“ramps longer than 250 m / higher than 10 m”). A grade-separated route now
retries once with Auto asked to clear such roads (our bridge 6 m above, or a 6 m cutting for theirs) at a
penalty above any structure, and keeps the retry if it has fewer violations (`evaluate.ts`,
`opts.separate`). That cleared two of the three; the 12 m bend move the third (an oblique crossing whose
road runs along our cutting).

## The whole corridor in one mission (`d3-full`)

One pack over all five sections: EPSG:5514 −744000, −1107000 → −732000, −1055500 (12 × 51.5 km, the
mapped line + 1.5 km), 5 m cells, 2400 × 10300 = **24.7 M cells**, above the 15.75 M reviewed default
(`maxRasterCells` raised for this pack only). Why not coarser: the hydrology grid (25 m) must be a whole
multiple of the cell, so the only alternatives are 12.5 or 25 m, too coarse for a 27.5 m formation and
inconsistent with the section packs. Measured: build peak RSS 1.6 GB, pack 40.5 MB (D11 ≈ 22 MB); the
GPU height texture is 2400 × 10300 (below the 16384 limit); startup (`startup-perf.mjs --gpu`, median of 3):
ready 1.70 s (D11 1.40, whole D35 1.17), first settled scene 4.7 s (D11 2.3), JS heap 471 MB (D11 221, D35 275),
longest startup task 0.98 s (D11 0.72); drag runs at 60 fps with the camera framed as
for D11 (framing the whole 57 km at once costs the integrated GPU more than a frame, so long missions keep
D11's distance; shorter ones come closer).

Ends: A and B of 0301 and 0305/I (D0 interchange, operating D3). Design speed 120 (0301–0303; 0304 and
0305/I are designed for 130). Starter: the five section starters' bends in sequence (31 bends), bend 4 moved
12 m (a class III road at km 8.78 where 0301 meets 0302): **VALID, 56,424 m, 40.74 bn CZK**. Full
evaluation ≈ 1.6 s in Node on a loaded host.

## Section ends drawn as continuing

Playtest (P1): a motorway that stops dead in a meadow reads as unfinished. Each section pack now draws the
mapped proposed line across its whole map, beyond both ends (“planned D3”, dashed), so an end at a section
boundary visibly continues as the next section, and the end labels say so (“Hostěradice (on to 0303)”).
Ends at the D0, at I/18 and on the operating D3 are declared junctions with the real roads.

## D35 Opatovec → Mohelnice (`d35-full`)

Pack as research/27 (−601500, −1102000 → −567500, −1090500, 15.64 M cells), motorway mission D 27.5/130,
A at the western end of the mapped proposed D35 (the opened Janov–Opatovec section's continuation), B on the
mapped line where it starts to merge with I/35, declared `merge` (research/28). B is at **33,350 m** along
the mapped line (research/27 used 33,300 m for the two-lane exercise): at 33.30 km a stream 140 m before B
cannot be crossed by a motorway, whose 15,000 m crest radius leaves no room to rise over a culvert and come
back down to I/35 level; 50 m further on it can (45 m from the I/35 ways). Starter: mapped-line bends every
≈ 1.5 km, the last one (400 m before B) dropped, bends 0/10/11/17 moved 25/12/100/15 m by a bounded
greedy search (`scripts/scenarios/repair-starter.ts`: first violation, two or three nearest bends, ±12–100 m
along the normal). The old first-stage presets stay: the motorway one as “Opatovec → Staré Město (first
section)”, the two-lane road exercise retired (Continue only).

## Local edits (playtest-qa-2 P0 1b)

Playtest: a 20–60 px nudge on the whole D3 or D35 redesigned the grade and broke crossings 9–24 km away;
the bill moved by up to 1.6 bn. The owner's rule is unchanged: the same design always gives the same bill
(no edit history). Measured with `scripts/locality.ts` (move a bend 20 / 60 m sideways; change of the
grade beyond ±5 km of the bend, far bill, far violations; downstream compared at the same ground):

| | whole D3, 16 moves | whole D35, 10 moves |
|---|---|---|
| before (899e6bb) | far grade up to 14.8 m; far violations changed in 2 (0 → 4, 0 → 8); far bill up to −1.5 bn | far grade up to 40.8 m (19 km away); far violations changed in 1 |
| after (local grade solve, first pass, on main 2decf53) | far grade up to 3.9 m (6–7 km away), ≤ 0.2 m beyond 8 km except one 0.7 m spot; far violations changed in 0; far bill ≤ 0.53 bn | far violations changed in 3, all the same track at km 6.98 10–17 km from the edit with the grade there unchanged: the viaduct's station-based end moves a station and the track falls off it onto a reroute that cannot be built (crossing remedy choice); far grade up to 7.8 m (one valley 6.6 km away) |

Causes found (each measured on its own; a fixed material value and an unchanged route length gave a
bit-identical line far away, so the solver itself is not chaotic):

1. **The separation retry** (above) asked every clearance on the route to cost more than any structure
   and was kept or dropped by the *total* violation count: its 2 m of jitter became 10–15 m, and an
   edit at one end decided whether the other end's crossings were separated.
2. **One material value for the whole route** (the mass-balance shadow price) moved with every edit
   (166–252 CZK/m³ for 20–60 m moves), re-pricing every cut and fill.
3. **Re-gridding when the length changes**: stations (`ds = L/⌈L/10⌉`) and knots (`L/nK`) shift
   everywhere downstream by up to the length change: ±1–2.5 m of grade with a fixed value.
4. **The whole-route optimum itself**: with identical inputs up to a block boundary, a different best
   state at that boundary re-routes the line 20 km upstream (shifting a long grade 2 m is cheaper than
   a grade change; long climbs at the limit chain heights) — so even exact inputs do not make a global
   optimum local.
5. All-or-nothing repairs: support lifts (one failure undid all), the strict retry kept by total count.

What changed (`core/autoprofile.ts` `profileBlocks`/`blockwise`, `core/evaluate.ts`):

- **Blocks from the plan alone.** A boundary in the middle of each straight that is the longest within
  2 km either side (blocks of 2–6 km on these routes). Moving a bend moves only the boundaries next to it.
- **Each boundary's heights from its own surroundings**: the grade line within 5 km of it (first 1.5 km,
  see "Second pass" below), at the starting material value;
  its height and the knots either side are pinned. Each block is then solved between its pins with
  **its own mass balance** (the block-wise balance the handoff recommended). Where two boundaries
  cannot be joined (they saw different ways through a valley) the block runs on to the next boundary.
- **Nothing the solve reads moves with the stations**: knots evenly within each block (their number
  chosen so the coarse and fine grids keep the maximum gradient — a block losing a grid step lost up to
  0.8 % of grade and chose tunnels and viaducts on long climbs), cost samples evenly between knots at
  their exact place (ground and geology there), each stream crossing at its own chainage, crossings and
  river/railway samples traced on a line placed from the block ends, clearances at the crossing's own
  chainage, mass balance measured on samples placed from the block ends.
- **Retries and repairs judged where they act**: the separation retry raises the penalty only at the
  roads, rivers and railways it retries, and each group of them (within 5 km) is kept only if it has
  fewer violations within 5 km; the strict retry likewise per group; support lifts per stretch of
  targets, each attempt lifting the same line (so one stretch's result does not depend on how many
  attempts another needed), support targets on the traced line rounded up to 10 cm.

Determinism: every step is a function of the design (plan → boundaries → windows → blocks); there is no
state carried between evaluations. Previews are unchanged in kind (one fixed-value solve of the window).

Cost of locality: a block is solved without seeing beyond its boundaries' windows and balances its own
earth, so the line is no longer the whole-route optimum. Bills against model 22 (main 2decf53): D11
designs best +1.6 %, demo +10.5 % (after an 8 m repair), direct-80 +4.9 %, direct-90 +2.7 %, town-centre
−2.0 %, the railway +6 %; outcome audit (D11, 30 designs) better than main: violations of the random
designs 144 → 128, footprint flags 110 → 95, bills −0.9 %. Where the earthworks still bury a road nothing
else could keep, a narrowing retry asks Auto for 2 m less embankment (cutting) there (lifts keep it), kept
per stretch like the separation retry. Starter repairs under the local grade solve: whole D35 bends 16/17/2 (60/12/12 m),
the D35 first section bend 2 (25 m), the earlier D3 map's last bends. Residual non-locality: support targets still come from the
station-based engineering (a ±0.7–2 m lift difference at one or two spots), and a bend move that moves a
block boundary re-solves the blocks on both sides of it (up to ≈ 8 km).

### Second pass (model 24 after merging main's railway model 23, 2026-11-16)

- **The demo design's +10.5 % was a gradient-reserve bug, not the blocks.** The DP kept `u / span` of grade
  in reserve on every interval for B's off-grid height; with blocks the span was the last block only, and
  the knot spacings that hold the gradient sit just above a whole number of grid steps, so the reserve cost
  a whole step everywhere (6 % → 5.6 %): a tunnel at demo km 8. Now only the last block keeps it. Demo
  5.16 → 4.90 bn against 4.79 for a whole-route solve on the same inputs; what remains is mid-block (each
  block's own material value, 261 / −196 CZK/m³ against one 114), not the boundaries.
- **Window 1.5 → 5 km.** The sum of the 13 valid saved designs and starters equals a whole-route solve
  (112.2 against 112.3 bn; 1.5 km windows: 114.7). Boundaries chosen within 3 km instead of 2: worse or
  mixed. Far violations still do not change more often.
- **Three non-localities of the DP inputs** found with the 5 km windows: the strict retry lost the lift
  targets of the pass before it; a narrowing check rejected every lift on the route once the line missed one
  narrowing; and a crossing's clearance was put on as many stations as its raster samples fell on (1–3,
  depending on the station grid), each unmet one adding a penalty, so a length change upstream could tip
  a river 22 km away from paid to cleared. Now each crossing is one run whose highest requirement sits at
  points spread along it, each on a free station near its own chainage. A support-lift DP retry is kept
  only if it meets a stretch the lifts could not (a target nothing can reach, e.g. next to a fixed end,
  only swapped the line for one that pays its clearance penalty).
- **Locality on the repaired starters** (`scripts/locality.ts`, bend moves of 20 / 60 m, 5 km): whole D3 far
  violations changed in 4 of 16 moves (worst far grade 7.7 m), whole D35 in 1 of 10 (4.9 m); every bend of the
  whole D35 at ±20 / ±60 m: 6 of 72. The DP is local now; each far change traced comes from the
  station-based engineering on a shifted station grid (`ds = L / ⌈L / 10⌉` moves every station when the length
  changes): a bridge's support layout (a lift target 12 km away), an overbridge's ramp check (separation
  retry), a track reroute, a culvert. The next lever is a station grid anchored like the knots.
- **The km 6.98 track on the whole D35** (playtest: drags at km 11.7 / 25.4 broke it 5–18 km away) did not
  recur in those 72 moves nor in new bends put in at km 11.7 / 25.4. The 6 far changes are one class I road
  at km 32.0 (ramps over 10 m high) after moves at km 22.5–26.3: the last block runs 23.5 km → B (9.7 km)
  because the straights there are each a little shorter than the one before, so none is the longest within
  2 km; the remedy for that road belongs to the crossing choice.
- **A drag on the D11 straight start is not a block effect.** It puts a bend on a straight from A to B, so
  the whole line from the bend to B turns about B: 20 m at km 3 is 15 m at km 7. The price change is that of
  another road (at km 3, −150 … +150 m: main a8d8de5, one whole-route solve, −1.95 … +0.52 bn, 3 of 6
  invalid; this model −1.91 … +0.33 bn, 3 of 6 invalid, much the same conflicts). Boundaries on long straights at fixed lines across
  the A–B axis were tried (every 3 / 4 km): the sum of all designs equal within 0.4 %, single designs ±10 %,
  locality no better (the moved geometry dominates), so not kept.
- **The D35 first section's 2.8 km viaduct** (20.34 bn, main 19.32): not the blocks; a whole-route solve on
  the same inputs gives 20.71. Main's line costs 19.28 bn under this model and a lower DP objective (−1.3 %)
  than the line the DP finds: the 2 m corridor pass (grade steps of 0.8 % per 250 m knot) starts the 6 m
  fine pass in the viaduct corridor, main's knots started it in the tunnel one. A boundary's pins taken
  from a refined window instead: 20.63 bn. The coarse-to-fine search is a heuristic; on single designs it
  lands on either side of such near-ties (D3 earlier map −6 %, the D35 section +5 % against main).

