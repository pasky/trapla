# 73 — Why the real D35 has a 4 km tunnel, and what a long tunnel really costs (2026-11-17)

Research only, nothing changed in the engine. Question (research/63, /64, /65): in our model the real D35 Opatovec –
Staré Město layout (twin-tube Dětřichov tunnel 3,983 m, ≈ 700 m of bridges; ŘSD estimate 17.69 bn) billed 22.2 bn,
17 % more than Auto's 1.9 km tunnel with 2.3 km of viaducts (18.9 bn). Which real constraint or price do we miss?
Running costs: research/74.

Research subagents (research mode) did the searches; every number used below I opened myself unless marked.
CZK excl. VAT unless stated. **Derived** = my arithmetic.

## Findings at a glance

1. **The real designers had a protected site on the escarpment.** The 2009/2010 EIA (CENIA MZP136) puts the
   nature monument PP Pod skálou (Natura 2000 site EVL Hřebečovský hřbet) on "the steepest part of the slope". It
   calls tunnelling under it "optimal". The EIA's condition: the east portal stays where it is, and its works must
   not touch the forest that forms the monument's protection zone. **Our model has no protected areas.**
   Auto's tunnel ends *inside* the monument: 29 m of earthworks in it, 79 m in its protection zone (AOPK polygons,
   checked below).
2. **Our "real-like" line in research/63 was not the real profile.** The real tunnel falls from 514 to 439 m
   (ITA-AITES 2023). research/63 drew it from 500 to 472 m. With the real portal heights our bill for the real layout is
   **20.8 bn, +10 %** on Auto, not +17 %. Lines that keep their east portal out of the protected forest bill
   **20.2–20.8 bn**. The real choice is about 3 % above the cheapest such line. That cheapest line has a 3.9 % grade in the
   tunnel, which the tunnel safety rules discourage (§3).
3. **Long rural twin tubes cost less per metre than our price.** Built Slovak twin-tube tunnels cost
   0.75–1.13 M CZK per tube-m in 2026 money (Slovak Ministry of Finance value-for-money unit, ÚHP, per tube-km from
   contract data; whether technology is included is not stated). The D35 estimate implies ≈ 1.09–1.14. Ours is
   1.43–1.46. Two sourced mechanisms could close most
   of the gap; both are proposals with medium-low confidence (§4):
   - the SPK row is a T-9.0 tube, while Czech motorway tubes are T-8.0;
   - deep rock is cheaper (research/65).
4. **Running costs do not explain the choice.** Per route-metre, a twin tunnel costs ≈ 2–4 × as much to run as a
   viaduct or an open road (research/74). Over 30 years at the CBA's 3 %, the real layout's running costs are
   ≈ 0.5–1.3 bn above Auto's (central 0.9). Auto's summit is 50 m higher, which costs road users fuel worth
   ≈ 0.3–0.5 bn over the same period (low confidence). Neither explains the long tunnel. The protected forest rules
   out Auto's portal and plausibly explains the length; no published document says so in as many words.

## 1. Why the long tunnel: what the documents say

| What | Quote / fact | Source | Opened |
|---|---|---|---|
| Terrain | "přes lesní komplex s výrazným terénním zlomem mezi obcemi Dětřichov a Nová Ves … Převýšení terénu tam dosahuje přibližně 200 metrů." "Terénní zlom u Dětřichova je navrženo podejít dlouhým tunelem délky 3983 metrů. Jedná se o čtyřpruhový tunel … Jsou navrženy dva dvoupruhové tubusy." | [ŘSD leaflet 09/2025](https://apdos.roadmedia.cz/Upload/Stavby/53/infoletak_d35-opatovec-st_mesto.pdf) | y |
| EIA scope | One base route with two subvariants (Sedliště, Janov), both far west of Dětřichov. **No tunnel-vs-viaduct variant at the ridge was assessed.** | [EIA MZP136 documentation ZIP](https://portal.cenia.cz/eiasea/download/RUlBX01aUDEzNl9kb2t1bWVudGFjZURPQ18xLnppcA/MZP136_dokumentace.zip), "Dokumentace EIA verze 2" (2010), route description | y |
| EIA profile (then 3,700 m) | "V km 77,940 – 81,640 (délka 3 700 m) je navržen tunel pod Hřebečovským vrchem v hloubce až 180 m pod vrcholem Mladějovského vrchu. Tunel je navržen ve směru staničení v poměrně značném klesání o hodnotě 2,64 %." | same, p. 14–15 | y |
| Protected site | "Mladějovský vrch – je součástí EVL Hřebečovský hřbet (CZ0530020), v prostoru vrchu se nachází patrně nejcennější botanická lokalita PP Pod skálou (tis červený …). Trasa R35 jej podchází dlouhým tunelem." "Tato PP se nachází v nejprudší části svahu" (yew, 150–200 trees; a spring used for drinking water) | same, nature chapter, item I/26 (km 80.0–81.6) | y |
| EIA condition | "Trasa rychlostní silnice je v místě rezervace vedena tunelem. Toto řešení je optimální, je třeba dodržet umístění východního portálu tunelu. Při stavbě portálu tunelu nesmí být žádným způsobem dotčen lesní porost, který tvoří ochranné pásmo přírodní památky." Ventilation shafts and their access roads must also keep out of the EVL. | same, "Ochrana přírody" assessment | y |
| Law | Zákon 114/1992 §36(2): "Změna nebo poškozování přírodní památky … jsou zakázány." §37: in a protection zone, works need the nature authority's prior consent; an undeclared zone is the land within 50 m. | [zakonyprolidi.cz](https://www.zakonyprolidi.cz/cs/1992-114) | y |
| Real profile (DSP stage) | "Tunel … klesá z 514 m n. m. směrem na východ do 439 m n. m. s nejvyšší výškou nadloží 173 m"; 3,987.5 m; two tubes "každou o šířce vozovky 8 m"; cut-and-cover parts 162.5 + 87.5 m; difficult ground (faults, coal seams, weak rock; 13 quasi-homogeneous units) | [ITA-AITES Tunel 4/2023, pp. 22–32](https://www.ita-aites.cz/files/tunel/2023/4/tunel_2023-4_022-032.pdf) | y |
| Geology risk (press) | Groundwater, instability and old adits, raised as construction risks only. The active Hřebeč landslide is on the existing I/35, not on the new line. | [Svitavský deník 2023](https://svitavsky.denik.cz/zpravy-region/stare-stoly-mohou-ztizit-stavbu-tunelu-detrichov-na-d35-u-hrebce-hrozi-sesuv-202/) | y |
| 2026 PPP | The winning bid (ViAlliance35, 71.32 bn NPV of availability payments for 35.4 km incl. 22 years of O&M) cut cost by "zkrácení mostních konstrukcí" and "optimalizace portálových úseků" of Dětřichov; no details published. | [Ekonomický deník 12 Nov 2026](https://ekonomickydenik.cz/d35-ppp-cenovy-rozdil-nabidky/) | y |
| Not found | Any cost comparison of tunnel lengths; the DÚR variant report; the PPP's public-sector comparator. | many searches (subagent logs) | — |

**Reading (inference).** The EIA assessed an already chosen tunnel, not competing lengths. What it fixes is that the
protected yew forest covers the escarpment's steepest part and that the east portal stays below it. From there a tunnel at a gentle grade (2.6 % in the EIA, ≈ 1.9 % on average
in the 2023 design) needs about 4 km to reach the plateau. Nothing published says it was cheaper.

**D3 0302 Luka (+645 m in 2019):** documented and different. Jílové asked for a lower line farther from homes; it was
lowered by up to 10 m and 645 m of surface road became tunnel, "pozitivní dopad na snížení hlukové a emisní zátěže"
([zdopravy 10 Dec 2019](https://zdopravy.cz/rsd-meni-podobu-dalnice-d3-pres-posazavi-a-miri-znovu-do-procesu-eia-38662/),
opened). That was a noise and town-planning choice, not a cost one.

## 2. The D35 layouts in our model (cost model 38 code, stage-1 motorway starter)

Protected areas: AOPK open data, layers 2 (MZCHÚ), 3 (protection zones), 6 (EVL)
(`https://gis.nature.cz/arcgis/rest/services/Aplikace/Opendata/MapServer`). Inside the pack's extent there are:
- PP Pod skálou and its zone;
- PP Rychnovský vrch;
- EVL Hřebečovský hřbet and EVL Rychnovský vrch.

The mapped D35 line crosses 455 m of the EVL, 323 m of the zone and 206 m of the monument (shapely, derived).
Bills come from `scripts/_d35real.ts` (gitignored helper, research/63): a By-hand grade through the listed points,
Auto's beyond km 9.5, and a tunnel painted where stated.

| Line | Grade points (km → m) | Tunnel | Bridges | Bill | vs Auto |
|---|---|---|---|---:|---:|
| Auto | summit 564 m at km 4.5; −3.8 % from km 4.8 to km 9.0 | km 5.09–6.99, 1,899 m | 2,289 m | **18,918 M** | — |
| research/63 "real-like" | 458 / 468 @1 / 500 @3 / 472 @7 / 410 @8.6 | 3.00–7.00 | 680 m | 22,204 M | +17.4 % |
| **Real portal heights** (ITA 2023) | 458 / 468 @1 / **514 @3.3 / 439 @7.25** / 410 @8.6 | 3.30–7.25, 3,948 m | 440 m | **20,810 M** | **+10.0 %** |
| Portal out of the forest, 3.0 % in the tunnel | … 530 @4.3 / 441 @7.25 | 3.48–7.24 | 550 m | 20,825 M | +10.1 % |
| Portal out of the forest, 3.9 % in the tunnel | … 545 @4.6 / 441 @7.25 | 3.60–7.24 | 510 m | 20,182 M | +6.7 % |

The By-hand lines carry small local problems that the comparison can ignore:
- the last 10–20 m before the east portal have too little cover;
- one bridge span near km 2.5 is 1–8 m too low;
- earthworks cover 6–18 m of a street at km 2.42.

Auto's east portal (km 6.99) lies inside PP Pod skálou. Any portal below the protected forest is at ≈ km 7.2 or
later, where the ground is ≈ 450 m. A line that has to reach that portal cannot keep Auto's 564 m summit within
4.5 %, so it ends in a 3.6–4.0 km tunnel. **Missing mechanism: protected areas** (the most likely one; the
documents do not rank reasons).

## 3. The tunnel grade rule

- EU Directive 2004/54/EC Annex I §2.2, transposed in **NV 264/2009 Sb. annex 2.2**: "V nových tunelech nesmí být
  podélný sklon větší než 5 %, kromě případů, kde prostorové podmínky neumožňují jiné řešení." "V tunelech o sklonu
  větším než 3 % se na základě analýzy rizik musí přijmout dodatečná nebo zesílená opatření ke zvýšení bezpečnosti."
  ([zakonyprolidi.cz](https://www.zakonyprolidi.cz/cs/2009-264), opened by the subagent; the same text is quoted by
  Hessen below.)
- Hessen Mobil Heft 52 (2006) §3.1.6 / 3.2.1: "das Längsgefälle sollte 3 % nicht überschreiten"; the measures above 3 %
  "können die Kosten für Rohbau und technische Ausstattung … deutlich erhöhen" (no figure).
  [PDF](https://mobil.hessen.de/sites/mobil.hessen.de/files/2022-02/wirtschaftliche_aspekte.pdf), opened.
- ČSN 73 7507's own limit was not found (paid standard).
- Auto's D35 tunnel runs at 3.76 %, the real one at ≈ 1.9 %. The engine allows a tunnel at any grade the road allows.

## 4. What a long mined tube costs (per tube-m, 2026 CZK)

Conversion used for the Slovak figures: ÚHP's 2024 price level × ČNB 2024 mean of **25.119 CZK/€**
([ČNB](https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/prumerne_mena.txt?mena=EUR),
opened) × **1.07** for 2024 → 2026. That 1.07 is PROVISIONAL: ČSÚ construction-work prices rose ≈ 3–4 % a year
(Q2–Q3 2026 +4.1–4.2 % y/y, search snippets); the exact CZ-CC 2142 or ŠÚ SR class-21 values were not retrievable.

| Tunnel | Tubes × length, width | Basis | Per tube-m (source money) | ≈ 2026 CZK / tube-m | Source |
|---|---|---|---|---:|---|
| Prešov (D1 SK) | 2 × 2.24 km, T-7.5 | ÚHP, from NDS contract data (signed 2017), CÚ 2024; scope not stated (ÚHP's Branisko row in the same table, 168 M€, is civil only) | 42 M€/tube-km | **1.13 M** | [ÚHP D1 Beharovce–Branisko 2025](https://www.mfsr.sk/files/sk/financie/hodnota-za-peniaze/hodnotenia/informatizacia/hodnotenie_d1_beharovce-branisko.pdf), Tab. 5 "Náklady na km tunelovej rúry" (opened) |
| Bikoš (R4 SK) | 2 × 1.15 km, T-7.5, flysch | same (signed 2019) | 31 | **0.83 M** | same |
| Okruhliak (R4 SK) | 2 × 1.9 km, T-7.5 | same (signed 2023) | 28 | **0.75 M** | same |
| Branisko 2nd tube (D1 SK), estimate | 1 × 5.2 km, T-8.0, beside an existing tube | ÚHP Tab. 4, V5: tunnel 167.5 + technology 19.4 M€, CÚ 2Q 2024 | 35.9 (derived) | **0.97 M** | same, Tab. 4 (opened) |
| Korbeľka / Havran (D1 SK), DÚR estimates | 2 × 5.8 / 2 × 2.7 km, T-8.0 | ÚHP Tab. 5; ÚHP itself calls them ≈ 2 × too high (possible double counting, maximal water-proofing) | 61 / 63 | 1.64 / 1.69 M | same; [ÚHP Turany–Hubová 2024](https://www.mfsr.sk/files/sk/financie/hodnota-za-peniaze/hodnotenia-investicnych-projektov/doprava/hodnotenie_d1_turany_hubova.pdf) (opened) |
| Homole (D35 CZ) | 525 + 569 m, 27 % cut and cover, under road I/17 | 2024 D&B contract 1,754 M incl. 1 bridge, 2 walls, design | 1.60 M CZK | **1.72 M** | research/51, /64 |
| D35 Dětřichov, implied | 2 × 3.95 km, T-8.0 | ŘSD 17,694 M minus our non-tunnel bill on the real-portal line (20,810 − 11,380 × 1.306 = 5,948 M), ÷ 1.306 surcharges | — | **≈ 1.09–1.14 M** (derived; 1.09 if the I/35 feeder in the ŘSD figure is ≈ 0.5 bn) | §2 |
| SPK CN 2026 A.3.R.2.NE.D | T-9.0 | min / standard / max | 1.166 / 1.550 / 2.049 M | — | research/51 |
| **Ours on D35** | | SPK × length factor 0.924–0.935, incl. cut-and-cover ends | — | **1.44 (real) / 1.46 (Auto)** | §2 bills |

- **The SPK unit is per tube.** The Czech text says "dvoupruhový tunel třídy T – 9,0", per km of tunnel length. ŘSD
  calls Dětřichov "čtyřpruhový tunel" made of "dva dvoupruhové tubusy" (leaflet). ÚHP's 2025 table converts SFDI
  to 46–81 M€ per tube-km, which is SPK min–max per tube. Its 2024 note had applied it once per twin tunnel
  (Korbeľka 268 M€ / 5.83 km = SPK min per *alignment* km at ≈ 25.4 CZK/€, derived). We keep the per-tube reading
  (research/22).
- **Width.** Czech motorway tubes are T-8.0 (Dětřichov: ITA 2023; D11 Poříčí / Opevnění: research/51). The SPK row
  is T-9.0. SPK prices other road and bridge widths "z poměru navržené a základní kategorijní šířky" (Příloha 1,
  roads and bridges; the tunnel standard says nothing). By analogy that is 8.0 / 9.0 = **0.89**. ÚHP puts 0.5 m of
  width (7.5 → 8.0) at ≈ 14 % of cost.
- **Slovak tubes corrected to T-8.0** (+14 %, ÚHP): **0.86–1.29 M**.
- **Length trend.** None among the three built Slovak tunnels: the longest (Prešov, 2.24 km) is the dearest, the
  shortest (Bikoš) in the middle; scope and contract year differ. If their figures leave out technology, they rise by
  ≈ 10–20 % (Branisko 10 %, SPK 20 %). No Czech or Slovak series confirms or refutes research/64's length factor.
- **TBM:** in the Branisko study a TBM came out −7 % (5.3 km) to −26 % (5.0–7.0 km, own route) against cyclic
  excavation on the same line (ÚHP Tab. 4, opened). That is one estimate, not a tender.
- **Technology share:** Branisko 19.4 / 186.9 = 10 % (estimate); SPK assumes 20 %; Hessen 3–12 %.

## 5. Recommendations (not implemented; for the owner)

| # | Change | Basis | Confidence | D35 effect (derived, rough) |
|---|---|---|---|---|
| 1 | **Protected areas** in every pack (AOPK open data: MZCHÚ, their protection zones, EVL/Natura as information). Auto keeps cuts, fills, portals and pits, piers and abutments out of an MZCHÚ (§36(2)-type bans) and out of its protection zone (consent needed; the Dětřichov EIA made it binding). Under it, a tunnel is fine. A player's works there are a violation with basis "law". | Zákon 114/1992; EIA MZP136 condition; the real line | **high** that it is the missing mechanism here; medium on the exact rule (protection zone as hard or as a cost) | Auto's east portal must leave the monument, so Auto's best becomes ≈ 20.2–20.8 bn, a 3.6–4.0 km tunnel (§2); real layout within ≈ 3 % |
| 2 | **Tunnel grade.** Auto keeps tunnels ≤ 3 %. Above 3 % the player gets a note ("needs extra safety measures after a risk study"); above 5 % it is a violation unless geography forces it. | NV 264/2009 annex 2.2; Hessen 2006 | **medium-high** on the rule; no cost figure (rule, not price) | Rules out the 20.2 bn line; best ≈ 20.8 bn, the real one |
| 3 | **Tube width.** Motorway (direction-split) tubes priced as T-8.0: × 8.0 / 9.0 = 0.89 on the SPK mined and cut-and-cover rows. | ITA 2023, D11 cross-sections; SPK's width rule for roads and bridges, by analogy | **medium-low**: an analogy, not a sourced tunnel rule. ÚHP only says 0.5 m of width "may explain" ≈ 14 % | Tunnel −11 %: Auto −0.8 bn, real −1.6 bn |
| 4 | **Rock cover** (research/65 §4b): × 0.92 under > 20 m, × 1.12 under < 15 m. | OTSKP excavation classes; D11 class-by-cover rule | **medium-low** (unchanged). Dětřichov's own ground is poor (faults, coal seams), so the "deep rock = good rock" premise fails for this very tunnel. | ≈ −8 % on deep tunnels |
| 5 | Keep research/64's length factor and SPK's 20 % technology share. No new Czech evidence. | — | — | — |
| 6 | **Running costs** as a separate, optional line (research/74), not added to the construction bill by default. | Czech CBA method; ABBV; ŘSD; ASTRA | medium | real layout +0.5–1.3 bn over 30 years (present value; central 0.9) |
| 7 | **Road users' costs** of grades: not now. They need an HDM-4-like speed and fuel model; the Czech CBA's flat rates ignore grade. | Rezortní metodika 2023 §8.1.10 | low | Auto's +50 m summit ≈ 0.3–0.5 bn (fuel only) |

**With #1–#3 together** the three factors stay separate and sourced; none is fitted to D35. Our long-tube price would
be ≈ 1.28 M per tube-m with #3, ≈ 1.18 with #3 + #4, against 1.09–1.14 implied by D35 and 0.86–1.29 for Slovak tubes
at T-8.0. At a uniform 0.75 × our present tube price (≈ 1.08 M) the real-portal line and Auto's present line tie
(derived from §2: (11,380 − 5,532) × 1.306 × (1 − k) = 1,892 M gives k = 0.75).

## Caveats

- Our alignment is the mapped one, but our grade and structures are ours. The real layout also has ≈ 700 m of
  bridges further west (the Třebovka valley) and the I/35 feeder.
- The Slovak per-tube figures are ÚHP's indexing of contract prices, not final accounts. Okruhliak's contract (2023)
  is being repriced.
- The 1.07 index for 2024 → 2026 is approximate (±0.03).
- Nothing published compares Dětřichov tunnel lengths or prices. "The protected slope drove the length" is my
  reading of the EIA, consistent with the EIA's own wording and with the bills in §2.

## 6. After protected areas and the 3 % tunnel rule (cost model 42)

Recommendations #1 and #2 implemented (research/75; #3, #4 and running costs not taken).

| | Tunnel | Bridges | Bill |
|---|---|---|---|
| Auto, model 41 | 1.9 km at 3.8 %, its east end in PP Pod skálou | 2.3 km | 19,050 M |
| **Auto, model 42** | **3,159 m (km 3.94–7.10) at 2.6–3.0 %, out of the protected forest** | 740 m | **20,029 M** |
| Real-portal line (514 → 439 m), tunnel painted | 3,948 m | 550 m | 21,155 M (+5.6 %) |
| Real D35 (ŘSD estimate, incl. the I/35 feeder) | 3,983 m | ≈ 700 m | 17,694 M |

Auto now chooses the layout the real designers chose: a long tunnel at a gentle grade, exiting below the protected
escarpment, and a short valley crossing. What remains between Auto and the real line is the summit height on the
west approach (ours ≈ 546 m at km 4.0 against the real 514 m portal) and the price per tube-metre (§4).
