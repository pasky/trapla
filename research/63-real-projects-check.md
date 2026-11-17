# 63 — Our bills against two real motorway sections, and the real D35's tunnel in our model (2026-11-17)

A check, not a calibration: nothing here changes a price. ŘSD leaflets, CZK excluding VAT; ours as Auto builds the
scenario starters (cost model 34, then 35 where stated). Our alignments are the starters', not the real ones.

## Per kilometre

| Section | Real (ŘSD leaflet) | Ours |
|---|---|---|
| D35 Opatovec – Staré Město ([leaflet 09/2025](https://apdos.roadmedia.cz/Upload/Stavby/53/infoletak_d35-opatovec-st_mesto.pdf)) | 16.6 km, D26.0/130, **17,693,831,000** incl. the I/35 feeder = **1,066 M/km**; mined twin-tube tunnel Dětřichov 3,983 m; ≈ 700 m of bridges (17 bridges) | stage-1 motorway starter (`scripts/scenarios/d35/d35-stage1-motorway.json`, 16.50 km): model 34 19,497 M = **1,181 M/km (+11 %)**, 1.9 km tunnel, 2.3 km of bridges; model 35 19,390 M = 1,175 M/km |
| D3 0304 Václavice – Voračice ([leaflet 06/2026](https://www.dalniced3.cz/public/files/documents/infoletak-d3-0304-vaclavice-voracice.pdf)) | 15.84 km, D27.5/130, **12,460,746,161** = **787 M/km**; Prostřední vrch tunnel 950 m | d3-0304 starter (15.45 km): model 34 10,152 M = **657 M/km (−17 %)**, 680 m tunnel; model 35 10,174 M = 659 M/km. Interchanges, rest areas and the real alignment's extra objects are part of the gap |

Earlier price history of the D35 section: ŘSD 2019 ≈ 8 bn, 2022 15.85 bn ([zdopravy 03/2022](https://zdopravy.cz/rsd-pokrocilo-s-pripravou-posledniho-useku-d35-v-cechach-cena-vystoupala-za-tri-roky-dvojnasobne-109674/), the mined tunnel then 3,893 m, two two-lane tubes), 2025 17.69 bn.

## The D35 starter: the old line against the new one (model 33 → 34)

The model-33 Auto line of the d35 starter, fixed By hand and evaluated under model 34 (tunnels with realistic
ends), bills 7,297 M (1.75 km tunnel, 843 M viaduct); Auto's model-34 line 6,729 M (1.1 km tunnel, 2 km / 1,819 M of
viaduct). Lines blended between the two bill 7,500 / 7,633 / 6,956 M: the grade search is not missing a better
optimum between them. A player's mined tunnel with 45 m deep approach cuts bills 5,743 M; that is now a violation
("A tunnel entrance stands in a very deep cut", research/49).

## The real designers' choice in our model (model 35)

`scripts/_d35real.ts` (gitignored helper): the stage-1 motorway starter on a By-hand line that stays deep enough for a
4 km tunnel — 458 m at km 0, 468 at km 1, 500 at km 3, 472 at km 7, 410 at km 8.6, 398 at km 9.5, Auto's line beyond
— with a tunnel painted over km 3.0–7.0:

| | Tunnel | Bridges | Bill |
|---|---|---|---|
| Auto (model 35) | 1,899 m, 5,899 M | 2,289 m, 4,361 M | **19,390 M** |
| Real-like line, tunnel painted | 3,998 m, 12,422 M | 680 m, 1,184 M | **23,398 M (+21 %)** |
| Same line, structures Auto's | 4,318 m (Auto chooses the tunnel itself) | 350 m | 24,698 M |

(The real-like design has one problem, earthworks over 18 m of a street at km 2.42, irrelevant to the comparison.)

**Hint, recorded only.** The real choice is 21 % dearer in our model, and our whole real-like design (23.4 bn) is 32 %
over the real section's 17.69 bn. Everything but the tunnel bills 23,398 − 12,422 × 1.306 (other objects 29.4 % +
technology 1.2 %) ≈ 7.2 bn here; were that right, the real 3,983 m twin-tube tunnel costs ≈ 10.5 bn all in, ≈ 8.1 bn
before the surcharges, **≈ 1.0 M CZK per tube-m against our 1.55 M** (SPK A.3.R.2.NE.D, research/51, which the
550 m D35 Homole tender, 1.60 M per tube-m, supports for a short tunnel). The per-metre price of a *long* tunnel is
the suspect: research/51 already has Hessen's specific cost falling with length (≈ 110 % at 200 m … lower beyond
2 km) and D8 Panenská (2 × 2.1 km) at ≲ 1.0 M per tube-m in 2006. Our viaduct prices at 40–60 m height are less
likely the cause: they are SPK-calibrated and the long-span style made them cheaper, not dearer (research/50).
Not changed: one section, an ŘSD estimate (not a tender), and a different alignment. Next step if pursued: a
length factor on the mined tube row from the Hessen curve and the Czech long tunnels (Panenská, Dětřichov once
tendered, Blanka excluded as urban).

## After the long-tunnel length factor (cost model 36, research/64)

| | Model 35 | Model 36 |
|---|---|---|
| Auto, stage-1 motorway | 19,390 M (1,175 M/km, +10 % on the real 1,066) | **18,911 M (1,146 M/km, +7.5 %)** |
| Real-like line, tunnel painted (4.0 km tunnel, 680 m of bridges) | 23,398 M (+21 % on Auto) | **22,204 M (+17 % on Auto)** |
| Same line, structures Auto's (4.3 km tunnel) | 24,698 M | 23,410 M |
| D3 0304 starter | 10,174 M (659 M/km) | 10,118 M (655 M/km, −17 %) |

The real designers' choice still ranks second, 17 % dearer than Auto's 1.9 km tunnel with its 1.8 km viaduct. The
length factor (× 0.924 at 4 km) was all the sources support: research/64 also corrects this note's reading of
Panenská (≲ 1.0 M per tube-m is 2003–06 money, ≈ 1.75–2.08 M today) and finds the implied 1.0 M below SPK's own
minimum for the row. What else could close the gap — the 29.4 % other-objects surcharge on a tunnel row that
already holds its portals and equipment, a rock-cover factor (Hessen: deep rock 100–145 % against 140–190 % under
10–20 m), or this split itself — is recorded there, not changed. Our alignment also differs from the real one (its
valley crossing needs only ≈ 700 m of bridges).


## Correction (research/73, 2026-11-17)

The "real-like" line above (500 m at km 3, 472 m at km 7) is not the real profile. The tunnel's portals are at
514 and 439 m (ITA-AITES 2023). With them, the real layout bills 20,810 M, +10 % on Auto (18,918 M), not +17 %.
Auto's east portal stands inside the nature monument PP Pod skálou, on the steepest part of the escarpment.
The EIA kept the real portal out of the monument and its forest. Our model has no protected areas. Lines whose
portal respects that bill 20.2–20.8 bn; research/73 has the details and the proposals.
