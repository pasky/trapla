# Motorway geometry, noise inputs and SPK CN 2026 evidence

Research note, checked 2026-11-15. Scope: public evidence for motorway mode, with particular attention to current ČSN 73 6101 (2018) values. This is not a substitute for the paid standard. Values below are labelled by edition and source type; project-specific values are not treated as general limits. The preceding evidence note is [research/22](22-motorway-evidence.md). Exact public URLs and page references are in §5.

## 1. Current ČSN 73 6101 geometry: evidence and gaps

### What the public current-edition reproduction verifies

Michal Radimský's revision presentation (28 May 2019), explicitly describing the revision that entered into force in October 2018, gives the design speeds and several method changes. On slide 4 it lists `D 33,5; D 27,5; D a S 26,0; D a S 25,5` at `130 km/h`, and says the design speed may in justified cases be reduced by 10 or 20 km/h. Thus 130/120/110 are supported as base/reduced design speeds for the game category, but this slide does **not** say that each speed has its own table row for every requested geometry parameter.

The same presentation's slide 15 states: “Minimální délka přechodnice je rovna větší z hodnot: vn metrů … délka vzestupnice.” In other words, the minimum transition-curve length is the greater of the design speed in km/h expressed in metres and the superelevation-transition length. This is a current-revision rule reproduced in a secondary presentation, not the full clause. Slide 9 says stopping sight distance `Dz` is checked on horizontal curves against design speed `vn` or limiting speed `vm`; the slide refers to table 10, but does not reproduce the numeric table. Slide 12's minimum/maximum **resultant** slope figures must not be mistaken for maximum longitudinal grade.

### Numeric values requested but not verified

No accessible 2018+ source located in this search reproduced the ČSN motorway table of minimum crest (`vypuklý`) and sag (`vydutý`) vertical-curve radii, nor the maximum **longitudinal** grade for D27.5/D25.5/D33.5 in flat, hilly and mountainous terrain. No distinct “minimum” versus “recommended / stopping sight” radius variants for motorway speeds were found in an accessible current source. The revision deck includes a section titled “Lomy podélného sklonu” but gives no values there. Do not fill the gap from the historical table below, or infer values from project profiles.

| Design speed | Minimum crest radius (2018+) | Minimum sag radius (2018+) | Max. longitudinal grade, D27.5 / D25.5 / D33.5 (terrain-dependent) |
|---:|---|---|---|
| 130 km/h | Not found in a public current-edition reproduction | Not found | Not verified |
| 120 km/h | Not found in a public current-edition reproduction | Not found | Not verified |
| 110 km/h | Not found in a public current-edition reproduction | Not found | Not verified |

**Stopping sight distance:** current 2018 method is documented qualitatively in the same presentation (slide 9), but numerical `Dz` values for 130/120/110 were not reproduced there and were not verified from another public 2018+ source. The revision presentation says it is checked in horizontal curves at `vn` or `vm`; do not substitute values from the 2004 edition or from a project-specific design.

**Older-edition comparator only:** the VUT FAST teaching document *Aplikace ČSN 73 6101*, printed p. 10, gives D26.5/D27.5 maximum longitudinal grades of 3% flat, 4% hilly, 4.5% mountainous in its old 120/100/80 km/h framework. Printed p. 11 gives older minima permitted for stopping: crest 11,000 m at 120 and 6,000 m at 100; sag 5,000 m at 120 and 3,400 m at 100. It has no 130/110 columns. The catalogue record for ČSN 73 6101:2004 states its validity ended 1 October 2018. These old values are **not** current 2018 values.

A separately found 2024 I/20 Selibov technical report (p. 21) states for `vn=90 km/h` `Rvmin,zast=5500 m, Rudop=3500 m, Rumin=2700 m`. This is a project report's 90 km/h statement, not motorway evidence and not a way to extrapolate motorway radii.

## 2. Road-noise method and TP 219 motorway data

The Ministry of Transport's official *Aktualizace Manuál 2018* page describes the 2018 road-traffic noise calculation manual, updated as *Manuál 2018, verze 2020* (November 2020). A public ŘSD-commissioned methodology report, *20-20 Dopravně inženýrské podklady pro výpočetní metodiku CNOSSOS* (December 2021), identifies that Manual 2018 version 2020 as an input reference and states that TP 219 supplies vehicle groups and night-period shares by road category. TP 219 itself explicitly has separate categories `Dálnice I. třídy` and `Dálnice II. třídy`; thus this road-noise traffic-input procedure applies to motorways, rather than treating them as ordinary E-roads. “E” is a distinction for first-class roads in TP 219, not the motorway classification.

### TP 219 (February 2019), observed/estimated 24-hour flow allocation

TP 219 §3.2.2, printed pp. 20–21, uses night share `Pnoc = Nz + (NQ + kPNA × PNA)`, where `PNA` is the heavy-vehicle share. In its table 3-2 (p. 21), coefficients for **first-class motorway** are:

| Vehicle group | Nz (%) | NQ | kPNA |
|---|---:|---:|---:|
| Passenger cars | 9.3 | −4.5 | 0.2 |
| Trucks, excluding truck combinations | 19.0 | −10.9 | 0.5 |
| Truck combinations | 21.1 | −8.3 | 0.3 |
| Trucks total | 20.5 | −9.3 | 0.4 |

The shares are not a single fixed day/night split: they vary with heavy share. For all motorways TP 219 separates class I/II, so use the appropriate row and vehicle mix, not one universal nighttime percentage. If a day/evening/night split is required, TP 219 table 3-3 gives first-class motorway evening (18:00–22:00) shares: 16.5% passenger cars, 12.7% trucks, 13.0% truck combinations, 12.8% trucks total. The day fraction is the remainder after the computed night and evening fractions for each group.

TP 219 table 4-2, p. 31, gives average first-class motorway composition: passenger cars 72%, light goods vehicles 8%, medium/heavy goods vehicles and combinations 19%, buses 1%. Table 4-3 offers finer category composition (including 13.0% truck combinations in its tabulation). These are nationwide default compositions, not a forecast for a particular D3/D35 segment. TP 219 is traffic-engineering data for environmental impact quantification, not a noise propagation model itself.

### Project traffic forecasts

No sufficiently exact, page-verifiable forecast AADT/RPDI figure for the named D3 Posázaví/Mezno–Václavice or D35 Opatovec–Staré Město/Mohelnice segments was established in this search. Public EIA and project-document search results did surface D35's EIA assessment and D3 project leaflets, but not a verifiable table value with forecast year and road segment in inspected text. **Not found here; do not assign a typical AADT or use current census counts as a forecast.** Project-specific forecast flows need to be extracted from the relevant EIA traffic study or the latest ŘSD technical report, with forecast year, scenario, MÚK pair/section and vehicle class recorded.

## 3. SPK CN 2026: prices, tunnels, bridges and interchanges

The SFDI SPK CN 2026 archive's *Příloha č. 3 – ocenění*, PDF pp. 1–2, displays columns for technological minimum, defined standard and technological maximum. The following existing D27.5 repository values match the **defined standard** column exactly (CZK, VAT treatment as in SPK):

| Repo field / SPK code | Unit | Defined-standard rate | Match? |
|---|---:|---:|---|
| `normPerKm.hilly` — `A.1.D.27,5.NER`, extravilan, new, flat/hilly | km | 187,632,000 Kč/km | Yes |
| `normPerKm.mountainous` — `A.1.D.27,5.NEH`, extravilan, new, mountainous | km | 214,512,000 Kč/km | Yes |
| `bridgePerKm` — `A.2.D.27,5.N`, motorway D27.5, new bridge | km | 1,495,178,000 Kč/km | Yes |

The same bridge row shows technological minimum 1,442,847,000 and maximum 2,100,725,000 Kč/km. These are defined-standard aggregate norms, not tender prices. SPK 2026 report (p. 7) says road length excludes bridge and tunnel lengths; for divided roads from S20.75 up, earth-built MÚK branches are included in the road standard assuming one interchange per 7 km (bridge ramps and crossing structures are not included there). For four-lane bridges, the bridge-length basis is the average of the two parallel bridge lengths (report, A.2, p. 9).

### Tunnel tube rows

SPK's A.3 tunnel standard is separate from A.1 road rates. The appraisal table (PDF p. 3) has the following representative **two-lane** tube rows, each in km; “defined standard” values shown:

| Code | SPK description | Defined-standard rate |
|---|---|---:|
| `A.3.R.2.NE.K` | two-lane, bored, rural, short (≤500 m) | 1,487,547,000 Kč/km |
| `A.3.R.2.NE.D` | two-lane, bored, rural, long (>500 m) | 1,549,899,000 Kč/km |
| `A.3.H.2.NE.K` | two-lane, cut-and-cover, rural, short (≤500 m) | 1,598,997,000 Kč/km |
| `A.3.H.2.NE.D` | two-lane, cut-and-cover, rural, long (>500 m) | 1,666,020,000 Kč/km |

The letters distinguish construction (`R` bored / `H` cut-and-cover), number of lanes (2), setting (`E` extravilan / `I` intravilan), and length (`K` short / `D` long). A motorway pair of separate two-lane tubes is not one two-lane bidirectional tube: each physical tube is priced on its own length/rate in the aggregate model. The report's A.3 (pp. 10–11) sets tube width classes and tunnel scope; portals, tunnel roadway, drainage, lighting and technology are among included elements, while various exceptional works are excluded. Exact classifications and project-specific adjustments still matter.

### MÚK treatment

There is **no separate SPK A.4 MÚK rate for motorways**. The report says A.4 is “pouze pro silnice I. třídy nižší kategorie než S 20,75”; for divided roads from S20.75 upward MÚKs are included in A.1 communication standards. The A.1 allowance is earth-built branch roads (not bridge ramps), assuming one MÚK per 7 km. A.4's sole schedule row, code `A.4.N`, unit `kus`, defined-standard price 76,700,900 Kč, is explicitly for lower-category first-class roads, not motorway. The crossing road and bridge object are not included in A.4. Therefore do not add the A.4.N amount to a D27.5 estimate or call it the SPK motorway interchange cost.

## 4. Findings at a glance

- **Verified, current-revision secondary evidence:** D27.5 base design speed 130; justified −10/−20 km/h options; minimum transition length is max(`vn` metres, superelevation transition length).
- **Not verified for current ČSN:** motorway 130/120/110 minimum crest/sag radii, maximum longitudinal grade by terrain, and numeric stopping-sight distances. Resultant slope is not longitudinal grade.
- **Historical only:** VUT older-edition 120/100/80 grade and vertical-radius figures listed above; they do not fill current gaps.
- **Noise inputs:** TP 219 explicitly separates motorway classes; first-class composition 72% passenger / 8% light goods / 19% medium-heavy and combinations / 1% bus; nighttime fraction depends on vehicle class and heavy share, with coefficients quoted above.
- **Project flows:** a dated, segment-specific forecast AADT for the requested D3/D35 segments was not verified.
- **SPK:** all three D27.5 repository rates match defined-standard 2026 prices. Representative two-lane tunnel-tube rows and values are above. Motorway MÚK allowance is embedded in A.1; A.4 is not a motorway norm.

## 5. Sources

1. Michal Radimský, *Revize ČSN 73 6101 – Projektování silnic a dálnic*, presentation dated **28 May 2019**, [PDF](https://konference-projektovani.cz/wp-content/uploads/2022/03/9.pdf), slides 2, 4, 9, 12, 15. Short quotes: slide 2: “Vstoupila v platnost v říjnu 2018”; slide 4 lists D27.5 at “130”; slide 15: “Minimální délka přechodnice je rovna větší z hodnot.” Secondary reproduction; it does not provide numeric vertical curve or stopping sight distance tables.
2. FAST VUT, *Aplikace ČSN 73 6101*, [PDF](https://www.fce.vutbr.cz/pko/sad/pdf/aplikace.pdf), printed pp. 10–11. Historical table only. ČSN online catalogue record for the 2004 edition: [record](http://csnonline.agentura-cas.cz/Detailnormy.aspx?k=69709), published 01.10.2004, validity ended 01.10.2018.
3. Selibov / I/20, *B. Souhrnná technická zpráva*, **2024**, [PDF](https://www.selibov.cz/wp-content/uploads/2024/03/B.-Souhrnn%C3%A1-technick%C3%A1-zpr%C3%A1va.pdf), p. 21. Project-specific `vn=90 km/h` radius quote only.
4. Ministry of Transport, [Aktualizace Manuál 2018 – Strategie](https://md.gov.cz/Dokumenty/Strategie/Hluk/Aktualizace-Manual-2018), official page (page metadata dated 18 May 2026; describes the publication and update). The 2020 version is identified in the report below as November 2020.
5. Ministry of Transport, *TP 219 – Dopravně inženýrská data pro kvantifikaci vlivů dopravy na životní prostředí*, **February 2019**, [PDF](https://www.pjpk.cz/data/USR_001_2_8_TP/TP_219_2019.pdf), §3.2.2, printed pp. 20–21, tables 3-2 and 3-3; table 4-2, printed p. 31. Verbatim formula: `Pnoc = Nz + (NQ + kPNA · PNA)`. Explicitly identifies “dálnice I. třídy” and “dálnice II. třídy.”
6. ŘSD / EDIP, *20-20 Dopravně inženýrské podklady pro výpočetní metodiku CNOSSOS*, **December 2021**, [PDF](https://www.rsd.cz/documents/38144/80830/20-20-dip-pro-cnossos-zprava.pdf/302a84d6-f76b-d7b1-cbb1-adb6497c798c?t=1685943204173), pp. 1, 12–13, 22. It calls the input manual “Manuál 2018, verze 2020” and explains motorway categorization and TP 219 night allocation.
7. SFDI, *Cenové normativy staveb pozemních komunikací 2026 – průvodní zpráva*, [official 2026 archive](https://sfdi.gov.cz/wp-content/uploads/2026/04/spk-cn-1.zip), PDF pp. 7, 9–11 (A.1–A.4 scope). Short MÚK quote, p. 10: “U směrově rozdělených komunikací (od kategorie S 20,75 výše) se tento standard nepoužije, neboť MÚK jsou součástí standardu těchto komunikací.”
8. SFDI, *Příloha č. 3 – SPK CN 2026 – ocenění*, same [official archive](https://sfdi.gov.cz/wp-content/uploads/2026/04/spk-cn-1.zip), PDF pp. 1–3. Primary schedule for A.1, A.2, A.3, A.4 codes and rates; values compared above are from its defined-standard column.

## 6. Focused follow-up: motorway vertical geometry sources

Follow-up checked 2026-11-15. Search focused on VUT/ČVUT/VŠB public repositories, technical-project reproductions, the 2004 edition, and `Dz` tables. The key result is an **older-edition** lead: the 2004 norm did have a 130 km/h column in the crest-radius material, contrary to what one might infer from the older VUT FAST *Aplikace* handout (which only prints 120/100/80). This does not resolve current 2018 values.

### Hits and their limits

1. **Jan Mahdal, VUT FAST, *Optimalizace návrhových parametrů výškového řešení*, bachelor's thesis, Brno 2012** ([VUT repository PDF](https://www.vut.cz/www_base/zav_prace_soubor_verejne.php?file_id=56202); the thesis itself says BRNO 2012 and is signed 25 May 2012). Printed p. 8 reproduces a chart captioned “Porovnání výsledků s normovými hodnotami”; the normative row is labelled `Rv zast. Dovolené` and shows 130/120/110 values **15,000/12,000/10,000 m**. The adjacent text explicitly describes “hodnoty ve sloupcích pro návrhovou rychlost 130, 120 a 110 km/h” and compares them with the norm. This is a secondary reproduction attributed to ČSN 73 6101:2004 in the thesis bibliography; it is an **older 2004 edition**, not 2018, and the thesis raises methodology concerns. Treat the values only as the old edition's minimum crest radii associated with stopping, not as current minima or “recommended” radii. It supplies no corresponding 2018 values.

   The same thesis, printed p. 19 (Tab. 2.10; thesis page 20 in PDF), reproduces the **2004** stopping-distance table and says: “Tabulka pro délky rozhledu pro zastavení z ČSN 73 6101 [3] z roku 2004”. At level grade (0%), `Dz` is 240 m at 130, 200 m at 120 and 170 m at 110. Those are historical comparison values only; they are not the requested 2018 Table 10 values. The table also varies with longitudinal slope, so these level-grade values are not a universal single `Dz` for each speed.

   The thesis discusses sag radii in historical tables from ČSN 73 6110 (local-road standard), not a reproduced 2004 ČSN 73 6101 motorway sag table. No 2004 motorway sag value at 130/120/110 was verified from this source. Nor did this pass find a 2004 motorway maximum longitudinal-grade table with a 130 column. Do not infer either from the crest or stopping-distance tables.

2. **Jan Mahdal, *Optimalizace návrhových parametrů výškových oblouků*, VUT FAST Studentská vědecká a odborná činnost, academic year 2011/2012** ([PDF](https://portal.fsv.cvut.cz/svoc/2012/vysledky/d1.pdf)), pp. 8–9. This is a related conference/student-work reproduction; printed p. 8 displays the same old normative crest row (`Rv zast. Dovolené`: 15,000 / 12,000 / 10,000 m at 130/120/110). It explicitly identifies the compared road-standard research as including ČSN 73 6101:2004 (printed p. 4). It does not establish 2018 data or sag/grade values.

3. **Ministry of Transport, draft traffic-order document concerning D1, dated 19 November 2025**, [PDF](https://md.gov.cz/getattachment/66b39568-2b37-498b-841c-d1f6874168ad/md_52274_2025_940_8.pdf.aspx), printed pp. 2–3. It says, p. 2, “V tabulce B.1 ČSN 73 6101 odpovídá rychlosti 130 km/h hodnota mezního poloměru 485 m” (this is a **horizontal** curve, not a vertical radius). It also refers to stopping visibility `Dz` as “stanovená v tabulce 8 ČSN 73 6101” (p. 1–2). The document provides no numerical vertical-curve radius, no numeric `Dz` value, and no maximum longitudinal-grade value. It does not identify the edition in the quoted text, so it cannot be used as a direct 2018 reproduction for the requested quantities.

4. **D35 Staré Město–Mohelnice DÚR, IČ vč. zaměření**, public municipal-hosted document dated 30 April 2020 ([PDF](https://www.maletin.cz/modules/file_storage/download.php?file=766f6831%7C1242)). Search indexing surfaced a project-specific vertical profile statement (“výškově v údolnicovém oblouku, podélný sklon … 1,60% ~ 2,00%”), but that is a local profile, not the maximum grade or a quoted norm minimum. It gives no evidence for the requested threshold values. Other project-document search hits similarly gave project-specific alignments, not a direct norm table; they were excluded as non-generalizable.

### 2004 edition conclusion and remaining gap

**Verified from a public 2012 secondary reproduction:** ČSN 73 6101:2004 crest-radius data included speeds 130, 120 and 110, with the minimum/allowed-for-stopping figures 15,000, 12,000 and 10,000 m respectively. The 2004 stopping-distance table included those speeds, with level-grade `Dz` 240, 200 and 170 m. The older VUT FAST application table previously cited in §1 is narrower (120/100/80 columns) and does not disprove the existence of a 130 column elsewhere in the edition.

**Still not found/verified:** any public 2018+ numerical source for minimum motorway crest or sag radii at 130/120/110, terrain-specific maximum motorway longitudinal grade, or the current 2018 stopping-distance `Dz` table 10 values. No current-edition source found in the searched VUT/ČVUT/VŠB theses or recent D35/D1/project reports quoted the requested numbers as requirements “dle ČSN 73 6101:2018.” The 2025 Ministry document's tabular reference does not itself give those values. Therefore the central gap remains open; no old value or project profile should be copied into the current-mode data as a substitute.
