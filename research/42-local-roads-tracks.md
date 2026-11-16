# Local roads, service roads and tracks: design rules and prices (2026-11-16)

What the game uses to rebuild a mapped street, local road, service road or track (`data/categories.ts`
`M7.5` / `P4`, `data/norms.ts` `LOCAL_SPEED_NORMS` / `TRACK_SPEED_NORMS`). Full notes with Czech
quotes: `research/42-notes/` (ČSN 73 6110, ČSN 73 6109 / 6108, SPK rows).

## 1. Local roads — ČSN 73 6110:2006 (public full text, read directly)

Source: <https://unmz.gov.cz/files/normalizace/%C4%8CSN%2073%206110/74506.pdf> (2006 edition as hosted;
amendment status not verified). Printed page numbers.

| Item | Value used | Clause | Confidence |
|---|---|---|---|
| Functional group | C "obslužné" for streets and local roads; public service roads "se navrhují jako místní komunikace obslužné" | §8.1.4 p. 29 | high |
| Design speeds, group C | 50 / 40 / 30 km/h; 30 in difficult conditions | tab. 2 p. 20 | high |
| Smallest radius at 6 % superelevation | 85 / 45 / 25 m at 50 / 40 / 30 (2.5 % row: 100 / 50 / 27) | §9.4.4 tab. 10 p. 51 | high |
| No superelevation needed from | 700 / 450 / 250 m | §9.5.3 tab. 11 p. 52 | high (information only) |
| Transition curves | not required: §9.4.3 restricts plain circular curves to groups A and B only | §9.4.1–9.4.6 pp. 50–51 | high |
| Straight between opposite curves | none required ("Mezi protisměrné oblouky s přechodnicemi není nutné vkládat přímou"); for circular curves only recommended for the change of crossfall | §9.3.1 p. 51 | high |
| Crest / sag radii | 1,000 / 450 / 200 m and 700 / 350 / 180 m at 50 / 40 / 30 | tabs. 13–14 p. 54 | high |
| Max gradient, group C | 9 % ordinary, 12 % justified, 15 % extraordinary ≤ 50 m | §9.6.3 tab. 12 p. 53 | high |
| Lane width | 2.75–3.50 m (2.75 on low-volume C) | §8.2.2 p. 33 | high |
| Junction spacing | none found in the clauses read | — | not checked by the game |

Game choices: the 6 % row (the same banking the ČSN 73 6101 rows use); max gradient 9 % in hilly terrain and
12 % in mountainous terrain (justified case); compound ratio 2 as for roads (PROVISIONAL, no 6110 value); the
2 × 3.0 m lanes with the S 7.5 strips (PROVISIONAL drawing; 7.5 m = the SPK category width). Design speed
starts at 30 km/h, the lowest the norm allows (an existing village street is the "difficult conditions").

## 2. Field tracks — ČSN 73 6109:2013 (via Vébr 2022) and forest roads ČSN 73 6108 (final draft)

Sources: L. Vébr, *Revize ČSN 73 6109*, <https://konference-projektovani.cz/wp-content/uploads/2022/03/10-vebr.pdf>
(slides reproduce the norm tables; secondary); ČSN 73 6108 final draft,
<https://www.cmadz.cz/aktuality/files/1458303301_CSN_73_6108_-_konecny_navrh_4_s_prijatymi_upravami.pdf>.

| Item | Value used | Source | Confidence |
|---|---|---|---|
| Categories | main one-lane P 4,0/30, secondary P 4,0/20 (free width 4.0 m incl. 2 × 0.5 m verges) | 6109 tab. 1, slide 11 | high (categories) |
| Smallest radius, paved | 25 m at 30 km/h, 12.5 m at 20 km/h | 6109 tab. 2, slide 15 | high |
| Transition curves | plain circular curves; transitions only in justified cases on main tracks | slide 16 | high |
| Max gradient, paved | 15 % at 30 km/h (18 % at 20 km/h; resultant 16 / 19 %); unpaved 10 % | 6109 tab. 3, slide 18 | high |
| Crest / sag radii | field-track tab. 4 not legible → PROVISIONAL ČSN 73 6108 draft tab. 7 for sealed forest roads: 200 m at 30, 80 m at 20 (crest and sag) | 6108 draft §7.12.2 p. 19 | high for the draft; the substitution is a game choice |
| Passing places | not recovered for field tracks (forest draft: ≥ 25 m long, 6.5 m wide, no spacing) | — | not modelled |

Game choices: one value per road for the gradient (15 %, valid at both speeds); design speed starts at 20 km/h.
A **service road** (OSM `service`: a farm, works or yard access, mostly one lane) is rebuilt as P 4.0: ČSN 73
6110 §8.1.4 lets public service roads "of the type with verges" be designed under ČSN 73 6108 / 6109. The player
may switch it to M 7.5.

## 3. Prices — SPK CN 2026 (`research/data/spk-cn-2026-oceneni.csv`; report in the SFDI ZIP)

| Row | CZK/km | Used for |
|---|---:|---|
| A.1.M.7,5.NER / NEH (M 7,5/7,5, outside built-up areas) | 24,133,000 / 32,079,000 | M 7.5 rural |
| A.1.M.11,5.NIR / NIH (M 11,5/7,5, 7.5 m traffic space + pavements "oboustranný chodník (š. 2,5 m)") | 32,930,000 / 43,906,000 | M 7.5 in built-up areas (pavements priced, not drawn) |
| A.1.P4.NE (polní cesta P4) | 13,985,684.50 | P 4.0 everywhere (no mountainous or built-up row) |
| A.2.S.7,5.N bridge | 481,621,000 | M 7.5 bridge (no local-road bridge row; same deck width) |
| A.2.P.4.N bridge | 304,735,878.74 | P 4.0 bridge |

Earthworks already in the norm (report pp. 6–7): field tracks **6,000 m³/km** of cut (fill 85 %); local roads
"běžné zemní práce … bez výrazných výkopů či násypů" with no volume → PROVISIONAL the same 6,000 m³/km (the
smallest volume the report gives for any road). Retaining walls ≤ 100 m/km, ≤ 2 m high, are in every row.

## 4. Not sourced, PROVISIONAL

- Traffic of local roads, service roads and tracks: the ŘSD census counts class I–III roads only; the average
  class III road (736 vehicles a day) stands in and the card says so. Real tracks carry far less.
- Junction spacing on local roads and tracks: none applied (ČSN 73 6101's 1.5 km is for class I roads).
- A minor road crossing another minor road inside a rebuilt stretch is resolved as before (reroute / bridge),
  not as a crossroads.
