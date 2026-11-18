# 87 — The real D11 Trutnov → Polish border, and the motorway mission on it (2026-11-18)

Why: the owner ("no Trutnov D11 but just 1st class road"): the D11 mission was a class I road (S 9.5/90) where
the real project is a motorway. This note sources the real project's parameters for the mission
"Motorway D11: Trutnov → Polish border" (`D11_MOTORWAY`, `src/core/data/scenario.ts`) and compares our bill of
the official line with the real contract.

## 1. The real project: D11 stavba 1109 Trutnov – státní hranice ČR/PR

Sources (all checked 2026-11-18):
- [S2] ŘSD leaflet, stage 2 (04/2026): https://apdos-v2.creativesound.cz/media/stavba/747/leaflet/infoletak_d11-trutnov-hranice-2etapa.pdf
- [S1] ŘSD leaflet, stage 1 (05/2026): https://apdos-v2.creativesound.cz/media/stavba/34/leaflet/infoletak_d11-trutnov-hranice-1etapa.pdf
- [OPD] OPD3 project record: https://opd3.opd.cz/projekt/Dalnice-D11-stavba-1109-Trutnov---statni-hranice-CR-PR
- [V] Valbek (the designer): https://www.valbekstory.com/blog/detail/r/d11-1109-trutnov-statni-hranice-cr-pr-nejvetsi-stavba-projektovana-ve-valbeku
- [EIA] CENIA, case MZP197 ("Rychlostní silnice R11, stavba 1109, Trutnov – státní hranice ČR/Polsko"):
  https://portal.cenia.cz/eiasea/detail/EIA_MZP197?lang=cs; assessor's report 16 Dec 2010:
  https://portal.cenia.cz/eiasea/download/RUlBX01aUDE5N19wb3N1ZGVrRE9DXzEucGRm/MZP197_posudek.pdf
- [B17] ŘSD brochure "Dálnice D11", 08/2017: https://rsd.cz/documents/38144/80614/Publikace-D11-08-2017-dvoustrany.pdf

The section number is **1109** (not 0111/0112); the section before it is 1108 Jaroměř – Trutnov (19.6 km, works
started 04/2026 [S2]: "navazuje na stavbu 1108 (realizace stavby zahájena v 04/2026)").

| What | Value | Source, quote |
|---|---|---|
| Length | 21.175 km = stage 2 17.900 + stage 1 3.275 | [OPD] "o celkové délce 21,175 km"; [S2] "délka: 17 900 m"; [S1] "délka: 3275 m" |
| Category, design speed | D 26.0/130 from the start to MÚK Střítež, D 21.5/110 from there to the border | [V] "v úseku ZÚ – MÚK Střítež navržena v návrhové kategorii D 26,0/130, v úseku MÚK Střítež – MÚK Královec v návrhové kategorii D 21,5/110"; [S2] "kategorie: D 26,0/130 a D 21,5/110"; [S1] "kategorie: D 21,5/110" |
| Earlier category | R 25.5/120 and R 21.5/100 (the R-series before 2016) | [B17] |
| Start | the 1108/1109 boundary at D11 km 133.000, north of Střítež, before MÚK Střítež | [S2] "Napojení na stavbu 1108 je severně od obce Střítež před MÚK Střítež" |
| End | km 154.175, joining the Polish S3 | [S1] "končí v km 154,175 napojením na S3" |
| Interchanges | Střítež (trumpet; a 1,357 m S 9.5/70 feeder from Trutnov), Poříčí (trumpet, road I/14), Královec | [S2] "MÚK Střítež … MÚK Poříčí"; [S1] "MÚK Královec (kosodélná)" |
| Tunnels | Poříčí 540 m + 576 m, Opevnění 2 × 492 m (twin tubes) | [S2] "Tunely: Poříčí: 540 m + 576 m Opevnění: 2x 492 m" |
| Bridges | stage 2: 18 on the motorway + 1 over it; longest Poříčí 715 m, Ličná valley 670 m, Lampertice 330 m (up to 42 m high) | [S2] "715 m most Poříčí, 670 m most přes údolí řeky Ličná a 330 m most Lampertice" |
| Contract | CZK 11,710,017,710 ex VAT, both stages, signed 8 Oct 2024 (MI Roads, Doprastav, Metrostav TBR, Subterra, Duna Aszfalt); earlier estimate 13.068 bn | [S2] "Cena celé stavby D11 1109 … dle smlouvy: 11 710 017 710 Kč (bez DPH)" |
| Opening | stage 1 2026, stage 2 2028 (planned) | [S1], [S2] |
| Traffic forecast | **13,000 vehicles / 24 h in 2040**, both directions, Trutnov – Polsko (2016 count 2–3 thousand) | [B17] p. 7, table: "Trutnov – Polsko \| 2 – 3 \| 13", key "intenzita dopravy v tis. vozidel / 24 hod (v obou směrech)", "rok 2040 = prognóza" |
| Traffic (EIA) | "about 10,000 vehicles / 24 h, with a large share of trucks" (no year in that sentence) | [EIA] posudek p. 47: "cca kolem 10 000 vozidel/24 hodin s výrazným zastoupením nákladních vozidel" |
| Heavy share | not published (UNVERIFIED) | — |
| Today | road I/16 at Královec: 3,205 vehicles a day, 493 heavy (ŘSD CSD 2025, census section 5-1180 in the pack's traffic.json) | pack |

Polish side: the S3 is open south to Kamienna Góra / Lubawka since July 2024
(https://www.gov.pl/web/gddkia-wroclaw/ponad-milion-kierowcow-przejechalo-tunelem-na-s3); whether its last
stretch to the border is open is UNVERIFIED. The card therefore says only that the motorway "goes on as the S3 in
Poland".

## 2. The mission (decisions)

- **Category:** D 27.5 at 110 km/h. Neither D 26.0 nor D 21.5 has an SPK 2026 row in our tables; D 27.5 is our only
  motorway row (as for D35, whose real section is D 26.0). 110 km/h is the design speed of all of 1109 but its first
  ≈ 1 km (to MÚK Střítež), and is one of our motorway speeds (130 / 120 / 110). The picker card says so: "Built
  27.5 m wide, our usual motorway; the planned road is 21.5 m wide and contracted for 11.7 bn CZK."
- **Ends:** the pack's A and B. A lies on the mapped D11 21.0 km before the border (≈ the 21.175 km of 1109 from
  the 1108 boundary north of Střítež), B where OSM's ref changes D11 → S3 at the border (PLAN.md "First playable
  prototype"). A "joins the D11 from Jaroměř" (section 1108, being built), B "goes on as the S3 in Poland". The
  interchanges are not built (none are in the game), as for the D3 sections.
- **Traffic:** 13,000 a day ([B17], the 2040 forecast). That is above what a two-lane class I road carries at
  LOS C (11,650, `TRAFFIC_THRESHOLDS`), so the motorway is the category the traffic asks for. Acoustic heavy share:
  22.56 %, the motorway mix of `MOTORWAY_TRAFFIC` (TP 219), since no share is published.
- **Time target:** a mission choice, the mapped line + 10 % at 110 km/h: 23.1 km → 12.6 min.
- **Starter = reference:** bends every ≈ 1.5 km of the mapped line, none within 750 m of B
  (`npx tsx scripts/motorway-starter.ts d11-motorway --mapped=1.5`, SCENARIO=d11), Auto grade: VALID as sampled,
  no moves needed. Coarser samplings of the same line (every 2, 2.5, 3 km) are not valid (bridge piers on streets in
  Poříčí and Bernartice, covered streams and the mapped motorway at the border), every 4 km is VALID but 19.2 bn.
- **The class I road mission stays** beside it in the Trutnov card, as the simpler job ("a two-lane road where the
  D11 motorway is planned"); its bills and saves are unchanged.

## 3. Our bill of the official line against the contract

Cost model 55, D 27.5/110, Auto grade (scripts/scenarios/d11/d11-motorway.json, `SCENARIO=d11 PRESET=d11-motorway
scripts/scenarios/check.ts`): **14.09 bn CZK**, 20.36 km, 692 M/km, 11.1 min.

| | ours | real 1109 |
|---|---:|---:|
| Length | 20.36 km (bends every 1.5 km cut the line's curves) | 21.175 km |
| Width | 27.5 m | 26.0 m (≈ 1 km), 21.5 m (≈ 20 km) |
| Bridges | 11 / 2,199 m (longest 459 m at Poříčí, km 6.83–7.29, and 300 m beside it) | 23 on the motorway; Poříčí 715, Ličná 670, Lampertice 330 m |
| Tunnels | none (cuts, deepest at km 4.6–5.3 and 12.9–13.9) | 2, twin tubes, 1,116 + 984 m of tube |
| Price | 14.09 bn (SPK/OTSKP 2026 price level) | 11.71 bn contract (2024), 13.07 bn estimate |

Ours is **+20 %** on the contract and **+8 %** on ŘSD's own estimate. Where the difference comes from, as far as
it can be told without the real bills of quantities: the width (our formation is 6 m wider over 20 km: road base
2.93 bn and other objects 3.17 bn scale with it), the price level (2026 vs a 2024 award that came in 10 % under the
estimate) and 56 buildings bought out under the line (539 M; our bends are sampled from the mapped line, not its
real curves). Our line has no tunnels where the real one has two: on our sampled line Auto finds those stretches
cheaper as cuts. Why the real design tunnels there (cover, landscape, the EIA's conditions) is not researched here.
