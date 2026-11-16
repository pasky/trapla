# Tunnel methods: mined (NRTM), cut-and-cover, TBM, galleries — costs, equipment, when each is used

Research snapshot: 2026-11-16. CZK excl. VAT unless stated. **Sourced** = a cited document states the value;
**derived** = arithmetic on sourced values (shown); **PROVISIONAL / UNVERIFIED** = not a norm or tender
observation. Portal geometry, mined-start cover and the cut-and-cover portal zone are in
[research/49](49-tunnel-portals.md); this note does not repeat them. Owner's question: *maybe also choose a tunnel
style / method*.

## Findings at a glance

- **SPK CN 2026 has 16 road-tunnel rows**: 2- or 3-lane tube × mined (ražený, NRTM) or cut-and-cover (hloubený) ×
  rural or urban × ≤ 500 m or > 500 m. Cut-and-cover is **+7.5 %** over mined (rural; 3-lane +12–13 %).
  Urban mined is **× 1.48** rural. Urban cut-and-cover has no price ("individuálně"). The 3-lane tube is only
  +15 % over 2-lane. There is **no TBM row and no gallery row**.
- **What a SPK tunnel row includes:** lining, **portals**, pavement, signs, drainage, lighting and **all tunnel
  equipment**: ventilation, fire detection, traffic control, SOS, CCTV, evacuation PA and a backup power source.
  Cross-passages are included "případně" (where needed). Equipment is costed at **20 % of the total**. Excluded:
  exploratory galleries, operations buildings, ventilation buildings/shafts, monitoring, extensive pre-portal
  works, cut-and-cover earthworks beyond 5 m cover, and the 12-month trial operation.
- **Czech tenders agree with the SPK mined row.** D35 Homole (2024 contract) **1.60 M CZK per tube-m**, vs SPK
  1.55. D8 Prackovice (2007 tender) 1.83 M/m. Klimkovice (2008) ≈ 1.15 M/m. Lochkov (2010) ≈ 1.80 M/m. Urban
  tunnels: Královo Pole 2.77 M/m and Mrázovka ≲ 2.8 M/m (vs SPK urban 2.30). Blanka ≲ 3.6 M/m gross.
- **Equipment share:** SPK assumes 20 %. Hessen Mobil (DE 2006) gives 3–12 % (2–4 k€ per tube-m), at the low end
  below 400 m. The Gotthard 2nd tube is 10 % (208 of 2,023 M CHF). **Safety equipment steps with length and traffic:** TP 98-Z1
  categories TD 100–300 m, TC 300–500 m, TB 500–3,000 m and TA > 3,000 m (or heavy traffic). NV 264/2009 adds
  requirements over 500 m: escape exits ≤ 500 m apart (> 2,000 veh/day/lane), forced ventilation > 1,000 m,
  a control centre > 3,000 m, and **two tubes when the 15-year forecast exceeds 10,000 veh/day/lane**.
- **A single tube with an escape gallery costs ≈ 1.3× a single tube; twin tubes ≈ 1.7–1.8×** (Hessen Fig. 3-6).
  The engine prices 2-lane roads as one tube with no escape gallery at any length.
- **TBM:** no Czech road tunnel has been bored by TBM. Rail Ejpovice (2 × 4.15 km): the TBM alternative bid
  3.97 bn vs the lowest NRTM bid 4.75 bn for the whole contract (−16 %). In the Chotýčany study (4.8 km), two TBM
  tubes came out ≈ 6 % below two NRTM tubes. Rules of thumb put the break-even at 1.5–4.5 km per drive.
- **International (per tube-m, nominal):** Austrian second tubes ≈ 19–43 k€ (2009–2026, including refurbishing
  the first tube). Swiss national-road tunnels 119–272 k CHF (c. 2010). German reference tunnel 14–16 k€ (2006).
  The Czech SPK 2026 rate is ≈ 60 k€/m (at an assumed 25 CZK/€). In 2008 MD reported the German D8/A17 tunnels 27 %
  cheaper than the Czech ones.

## 1. Official study-stage rows

### 1.1 SPK CN 2026, A.3 "Tunely" (per km of tube between portal faces)

Source: SFDI [SPK CN 2026 archive](https://sfdi.gov.cz/wp-content/uploads/2026/04/spk-cn-1.zip), Příloha č.3
(ocenění), extracted in `research/data/spk-cn-2026-oceneni.csv` rows 77–92. Unit "km" = one tube (research/22).

| Code | Scope | Min | **Standard** | Max | vs A.3.R.2.NE.* |
|---|---|---:|---:|---:|---:|
| A.3.R.2.NE.K | 2-lane, mined, rural, ≤ 500 m | 1,119.0 M | **1,487.5 M** | 1,967.0 M | 1.00 |
| A.3.R.2.NE.D | 2-lane, mined, rural, > 500 m | 1,166.0 M | **1,549.9 M** | 2,049.4 M | 1.00 |
| A.3.R.2.NI.K | 2-lane, mined, urban, ≤ 500 m | 1,657.8 M | **2,203.7 M** | 2,913.9 M | 1.48 |
| A.3.R.2.NI.D | 2-lane, mined, urban, > 500 m | 1,727.3 M | **2,296.1 M** | 3,036.1 M | 1.48 |
| A.3.H.2.NE.K | 2-lane, cut-and-cover, rural, ≤ 500 m | 1,191.3 M | **1,599.0 M** | 1,966.0 M | 1.075 |
| A.3.H.2.NE.D | 2-lane, cut-and-cover, rural, > 500 m | 1,241.3 M | **1,666.0 M** | 2,048.4 M | 1.075 |
| A.3.H.2.NI.K / .D | 2-lane, cut-and-cover, urban | "individuálně" | — | — | — |
| A.3.R.3.NE.K | 3-lane, mined, rural, ≤ 500 m | 1,286.8 M | **1,710.6 M** | 2,261.9 M | 1.15 |
| A.3.R.3.NE.D | 3-lane, mined, rural, > 500 m | 1,340.5 M | **1,782.0 M** | 2,356.3 M | 1.15 |
| A.3.R.3.NI.K | 3-lane, mined, urban, ≤ 500 m | 1,828.0 M | **2,429.9 M** | 3,213.1 M | 1.63 |
| A.3.R.3.NI.D | 3-lane, mined, urban, > 500 m | 1,904.8 M | **2,532.1 M** | 3,348.2 M | 1.63 |
| A.3.H.3.NE.K | 3-lane, cut-and-cover, rural, ≤ 500 m | 1,429.8 M | **1,919.0 M** | 2,359.5 M | 1.29 |
| A.3.H.3.NE.D | 3-lane, cut-and-cover, rural, > 500 m | 1,495.0 M | **2,006.5 M** | 2,467.1 M | 1.29 |
| A.3.H.3.NI.K / .D | 3-lane, cut-and-cover, urban | "individuálně" | — | — | — |

Derived ratios: > 500 m / ≤ 500 m = 1.042 for every row. Min / max ≈ −25 % / +32 % around the standard.
Příloha č.6 (provázání databází) shows the base values the rows were built from: "DLE STANDARDU SBORNÍKU DPZ"
823.8 M/km (short) and 792.0 M/km (long) for mined 2-lane rural, i.e. **short dearer than long** in the base data,
plus a separate urban/rural ratio column (1.48). How the 2026 standard came to rank short below long is not
explained (UNVERIFIED; one plausible reason is the NV 264/2009 equipment step at 500 m, §3).

**Methodology text** (Příloha č.1 průvodní zpráva R4, A.3, pp. 9–10, quoted):

- Category widths per ČSN 73 7507: "dvoupruhový tunel třídy T – 9,0; třípruhový tunel třídy T – 11,0" (width
  between kerbs). D11 Poříčí/Opevnění are T 8,0 ([Stavebnictví 2023](https://www.casopisstavebnictvi.cz/clanky-projekt-tunelu-porici-a-opevneni-na-dalnici-d11-v-useku-trutnov-statni-hranice-s-polskem.html)).
- Method: "ražený tunel za použití metody NRTM" or "tunel hloubený s tím, že za hranici oceněného zahloubení se
  považuje nadloží max. do výšky 5,0 m". "Hloubené tunely v intravilánu je nutno ocenit individuálně."
- **Includes:** "výstavbu tunelu vč. primární obezdívky, výztuže, izolace, definitivní obezdívky a případně i
  tunelových propojek; vybudování portálů tunelu; vozovku; dopravní značení; odvodnění; osvětlení; technologické
  vybavení tunelu (vzduchotechnika, měření fyzikálních veličin, požární signalizace, zabezpečovací signalizace,
  řízení silničního provozu, tísňové volání SOS, TV okruh tunelu, evakuační rozhlas, náhradní zdroj energie)".
  Mined tunnels assume excavation class **TT4**; cut-and-cover assumes excavation class I 80 % / II 20 %.
- **Excludes:** "průzkumné štoly; provozní objekty pro řízení provozu v tunelu; náklady na geotechnický monitoring;
  rozsáhlé předportálové úpravy (zdi, galerie, opevnění svahů a pod); objekty souvisící s odvětráním tunelů
  (výdechové objekty apod.); další objekty, souvisící se zajištěním bezpečnosti v tunelech (příjezdové komunikace,
  heliporty apod.); zemní práce a ochranné konstrukce při zahloubení hloubených tunelů větším než 5,0 m nadloží;
  zkušební provoz tunelu v trvání 12 měsíců". These are left to the "expertní úprava základní ceny".
- "… je v jednotkových cenách cenových normativů kalkulováno s náklady na technologii ve výši **20 %** celkových
  nákladů."
- B.6 Technologická zařízení (road telematics, 1.2 %) explicitly does **not** cover tunnel equipment: "Tato
  kategorie se netýká technologického vybavení tunelů, které je zahrnuto ve standardu Tunely."

**SPK markups for tunnels** (Příloha č.4, databáze přirážek), new build: P1 insufficient investigation **10 %**
(roads 8 %, bridges 8 %); P2 environment 5 / 6 / 8 % rural / urban / protected (roads 4 / 6 / 8); P3 works next to
traffic, new build, 4 %. Whether the engine applies P1–P3 to roads at all was not checked here.

**History:** the MD/ČVUT 2008 normatives (built from 215 projects 2004–2006) priced a "ražený tunel" at
**794.4 M CZK/km** ([iDNES 16 Jul 2008](https://www.idnes.cz/ekonomika/domaci/stat-ma-cenik-na-drahe-dalnice-chce-tak-predchazet-kritice.A080716_211836_ekonomika_mia)).
Derived: 2026 / 2008 = 1,549.9 / 794.4 = **1.95×** nominal. Same article: the German tunnels on the Dresden
motorway were "levnější o 27 procent".

### 1.2 SPOŽES 2026 (railway), J and related rows

Source: SFDI [functional SPOŽES 2026 workbook](https://sfdi.gov.cz/wp-content/uploads/2026/04/260429-funkcni-spozes.xlsx),
sheet "Tabulka propočtu" (million CZK per unit, CU 2026). J01–J04 are already in `railway.ts` (research/32).

| Code | Item | Unit | Rate |
|---|---|---|---:|
| J01 | Tunel – novostavba, 1-kolejný v extravilánu | bm | 0.8475 M |
| J02 | Tunel – novostavba, 1-kolejný v intravilánu | bm | 1.1949 M |
| J03 | Tunel – novostavba, 2-kolejný v extravilánu | bm | 1.9209 M |
| J04 | Tunel – novostavba, 2-kolejný v intravilánu | bm | 2.8183 M |
| J05 | Tunel – rekonstrukce bez zásahu do ostění | bm | 0.1545 M |
| J06 | Tunel – rekonstrukce vč. sanace ostění, nová hydroizolace | bm | 0.618 M |
| J07 | Tunel – rekonstrukce vč. rozšíření průjezdného profilu | bm | 1.03 M |
| **B12** | Sdělovací zařízení v tunelu | km tunelu | **71.8868 M** |
| **O03** | Osvětlení a elektroinstalace tunelů | bm tunelu | **0.0717 M** |
| **C08** | Transformovny vn/nn – technologie tunelů | ks | **19.7231 M** |

Markups (sheet "Databaze přirážek", J Železniční tunely): P1 novostavba 13 %, přeložky 8 %, modernizace 3 %;
P2 extravilán 0 %, intravilán 2 %, next to a protected area 4 %, protected area 8 %; P3 5 / 5 / 5 / 0 %.

**Gap in the engine (derived, UNVERIFIED scope):** the workbook prices tunnel communications (B12), lighting
and electrics (O03) and tunnel transformer stations (C08) **in separate rows**. That suggests J01–J04 are the civil
works only. `railway.ts` bills J rows plus the open-line systems and no B12/O03/C08: per km of tunnel
71.9 + 71.7 = 143.6 M CZK, plus ≈ 19.7 M per transformer. That is **≈ 17 % of J01** and could be missing. No
SPOŽES item description text was found to confirm what J01 includes.

Also derived: 2 × J01 = 1.695 M/m < J03 1.921 M/m. SPOŽES prices two single-track tubes **below** one
double-track tube (0.88×). The Chotýčany study found the opposite (two single NRTM tubes ≈ 1.6× one double, §2.3),
so the SPOŽES ratio should not be read as a design rule.

## 2. Czech evidence per tube-metre

Per tube-m = contract or cost ÷ sum of tube lengths (derived). Nominal CZK of the year shown, **not
indexed** (the ČSÚ construction price index PDF did not extract; see the SPK 2008→2026 1.95× above for scale).
Scope differences dominate; treat as order-of-magnitude checks.

### 2.1 Mined (NRTM) road tunnels

| Tunnel | Year / basis | Tubes (m) | Cost | **Per tube-m** | Scope / caveats | Source |
|---|---|---|---|---:|---|---|
| D35 Homole | 2024 contract, excl. VAT, Design & Build | 525 + 569 (mined 345 + 449, c&c 180 + 120) | 1,754 M (estimate 2,456 M; 5 bids, all below) | **1.60 M** (estimate 2.25 M) | Standalone tunnel contract incl. design, portal areas, 1 bridge, 2 retaining structures; mined cover 8.5–24 m; two 17.5 m cross-passages | [zdopravy 2024](https://zdopravy.cz/podepsano-smlouvu-na-dalnicni-tunel-homole-ziskala-eurovia-stavba-zacne-v-kvetnu-201306/), [Stavebnictví (FIDIC)](https://www.casopisstavebnictvi.cz/clanky-prvni-zkusenosti-s-vybranymi-prvky-smaragdove-knihy-fidic-pri-realizac-1c383cd30b-ole-na-d35.html), [Marti](https://www.martias.sk/project/d35-ostrov-vysoke-myto-tunel-homole/) |
| D8 Prackovice (0805 E) | 2007 tender | 270 + 260 | 1,267.1 M incl. 10 % reserve and 19 % VAT → 968 M | **1.83 M** | Standalone object; portal cut into a quarry face (research/49) | [Oživení, cenadalnic část 5](https://oziveni.cz/wp-content/uploads/2010/01/cenadalnic_cast5_d8_d11.pdf) tab. p. 12; [MD leaflet](https://md.gov.cz/getattachment/308ab49f-95c9-49af-aff0-1dd0a852e709/infoletak_d8-lovosice-rehlovice_1470844920027.pdf.aspx) |
| D8 Radejčín (0805 F) | 2007 tender | 620 + 600 | 2,953.2 M incl. reserve and VAT → 2,256 M | **≤ 1.85 M** | Also includes the motorway bridge between the tunnels and 1,080 m of motorway body | same |
| D1 Klimkovice | ≈ 2008, VAT basis unstated | 1,077 + 1,088 (mined 865 + 875) | ≈ 2.5 bn | **≈ 1.15 M** | Total quoted by Wikipedia (Týden) | [Wikipedia](https://cs.wikipedia.org/wiki/Tunel_Klimkovice) |
| D0 514 Lochkov | 2010, estimate | 1,661 + 1,620 (one 3-lane, one 2-lane tube; mined 1,252 / 1,302) | ≈ 5.9 bn | **≈ 1.80 M** | Whole section 514: 7.45 bn excl. VAT | [Wikipedia](https://cs.wikipedia.org/wiki/Lochkovsk%C3%BD_tunel) |
| D8 Panenská | 2006 | ≈ 2 × 2.1 km | 4.2 bn | **≲ 1.0 M** | Includes 800 m of motorway with retaining walls and the Petrovice junction | [Wikipedia](https://cs.wikipedia.org/wiki/Tunel_Panensk%C3%A1) |
| Brno Královo Pole (urban, plastic clay) | 2012, excl. VAT | 1,258 + 1,237 (mined 1,060 / 1,019) | 6.9 bn ("VMO Dobrovského B"); 8.3 bn with junctions | **2.77 M** | Exploratory galleries 831 + 831 + 365 m built 2001–03, separately | [Wikipedia](https://cs.wikipedia.org/wiki/Kr%C3%A1lovopolsk%C3%BD_tunel) |
| Praha Mrázovka (urban, 3-lane, branches) | 2004 | 2 × 1,260 + branches | 7.15 bn incl. Zlíchov tunnel | **≲ 2.8 M** | 70+ buildings underpinned by grouting | [Wikipedia](https://cs.wikipedia.org/wiki/Tunel_Mr%C3%A1zovka) |
| Praha Blanka (urban, ~half mined, half c&c) | 2015 final | 5.5 km route, "12 km tunelů včetně ramp" | ≈ 43 bn | **≲ 3.6 M** | Includes Trojský most, garages, surface roads, utilities | [ČKAIT 30 staveb](https://30let.ckait.cz/stavba-16-tunelovy-komplex-blanka.html), [Wikipedia](https://cs.wikipedia.org/wiki/Tunelov%C3%BD_komplex_Blanka) |

**Not found (UNVERIFIED):** object-level prices for D11 Poříčí (540 / 576 m), Opevnění (2 × 492 m) and Kamenný
vrch (780 / 756 m). Only the section totals are public: D11 1109 Trutnov–hranice 21 km for 11.7 bn
([ČTK 2026](https://www.ceskenoviny.cz/zpravy/2838828)); D11 1108 Jaroměř–Trutnov 19.6 km for 9.08 bn
([ŘSD](https://www.rsd.cz/-/%C5%98editelstv%C3%AD-silnic-a-d%C3%A1lnic-za%C4%8Dalo-stav%C4%9Bt-posledn%C3%AD-chyb%C4%9Bj%C3%ADc%C3%AD-%C3%BAsek-d11)).
Neither was split here. Valík: no cost found.

**SPK-excluded item, priced:** D3 Luka exploratory gallery ("průzkumná štola"), ≈ 1,480 m, **408 M CZK excl. VAT**
(2026) → **≈ 0.28 M CZK/m**, about 18 % of the SPK mined rate ([ŘSD 2026](https://kraje.rsd.cz/stredocesky/blog/2026/07/17/zacala-razba-pruzkumne-stoly-budouciho-tunelu-luka-na-dalnici-d3/),
[dalniced3.cz](https://www.dalniced3.cz/novinky/z-tisku/stredoceska-dalnice-d3-pruzkumne-stoly-pro-budouci-tunely)).
Luka itself is 1,843 m and lies on the game's D3 route.

### 2.2 Cut-and-cover

No Czech object-level cut-and-cover price was found. Dubeč (2 × ≈ 270 m, 3-lane) and Na Vysoké (≈ 391 / 385 m,
4-lane) on D0 511 are inside a 9.76 bn section contract
([ITA 8/2026](https://www.ita-aites.cz/cz/aktuality-z-podzemnich-staveb/aktuality-z-8-2026.html)). The I/33
Kramolna (100 m) is inside the 3.18 bn Náchod bypass. **Use the SPK H rows (+7.5 %)**, with the Hessen
cover-dependence (research/49 §3): at < 5 m crown cover cut-and-cover is 0.6–2.0× the reference (rock > 20 m);
at 5–10 m in soil 1.8–2.5×. Blanka is the large Czech mixed case: ≈ 5.54 km of mined tube vs 6.56 km of
cut-and-cover tube (research/49). Its surface-built parts used open pits, diaphragm walls and the top-down
"modifikovaná milánská metoda" in tight urban space ([ČKAIT](https://30let.ckait.cz/stavba-16-tunelovy-komplex-blanka.html)).

### 2.3 TBM and the method comparisons we have

| Case | Evidence | Derived |
|---|---|---|
| Ejpovice rail tunnels, 2 × 4,150 m single-track, TBM Ø 9.89 m; cross-passages by NRTM | 2012 tender for the whole Rokycany–Plzeň construction: lowest NRTM bid (Skanska) **4.75 bn**; Metrostav/Subterra main bid higher, **TBM alternative 3.97 bn** (allowed by the tender); estimate 7.5 bn. Final cost after variations 5.963 bn ([zdopravy 2020](https://zdopravy.cz/ucet-za-ejpovicke-tunely-presahl-sest-miliard-sprava-zeleznic-chysta-dalsi-upravy-60177/), [Wikipedia](https://cs.wikipedia.org/wiki/Ejpovick%C3%BD_tunel)) | TBM −16 % on the whole contract (≈ 0.78 bn, ≈ 94 k CZK per tube-m). Whole contract ÷ 8,300 tube-m: 0.48 M/m at award, ≤ 0.72 M/m final (includes the open-line works). SPOŽES J01 today: 0.85 M/m |
| Chotýčany rail tunnel study, 4.8 km (D3/4th corridor) | "u konvenčně ražených tunelů je rozdíl v ceně jednoho dvoukolejného tunelu a dvou jednokolejných … cca 60 %"; "Ražba dvou jednokolejných tunelů ražených pomocí TBM představuje … v porovnání s konvenční ražbou dvoukolejného tunelu navýšení … o cca 50 %"; "nelze brát obecně za měřítko" ([Žel. page](https://www.zelpage.cz/clanky/tunel-chotycany---varianty-technickeho-reseni-a-zpusobu-razby?oddil=6)) | Two TBM single tubes ≈ 150 / 160 = **0.94×** two NRTM single tubes. One double-track NRTM tube is the cheapest. TBM segmental lining needs 20–90 % more final-lining concrete than NRTM |
| Praha–Beroun rail (2026 SŽ estimate) | ≈ 25 km, two tubes, 76 bn → "zhruba tři miliardy na kilometr" ([iDNES 2026](https://www.idnes.cz/ekonomika/doprava/stavby-tunel-berounsky-tacholovicky-sprava-zeleznic.A260724_114251_eko-doprava_cfr)) | ≈ 1.5 M CZK per single-track tube-m, whole project. Same article: Wienerwald 1.8 bn CZK/km, Koralm 2.6 bn CZK/km |
| Rules of thumb (non-Czech) | "for excavation lengths longer than 4.5 km a TBM is often recommended, while for lengths not exceeding 1.5 km, the Drill & Blast technique is usually the go-to … between 1.5 km and 4.5 km, costs are comparable" ([Best Support Underground](https://bestsupportunderground.com/tbm-drill-and-blast/?lang=en)); ResearchGate review snippet: TBM above ≈ 3 km, "more economical" above ≈ 6 km ([Macias et al.](https://www.researchgate.net/publication/264942493_DB_versus_TBM_Review_of_the_parameters_for_a_right_choice_of_the_excavation_method), snippet only) | Break-even ≈ 1.5–6 km per drive; low-quality sources, medium confidence on the order of magnitude |

No Czech road tunnel has been bored by TBM (all road tunnels in §2.1 and research/49 are NRTM or c&c). Prague
metro V.A was bored by EPB TBMs; no per-metre price was found (UNVERIFIED).

## 3. Equipment: share, scaling with length, safety categories, escape routes

**Share of cost.**

| Source | Equipment share | Note |
|---|---|---|
| SPK CN 2026 (A.3 text) | **20 %** of total, inside the per-km rate | flat, any length |
| Hessen Mobil 2006, §3.1.5 ([PDF](https://mobil.hessen.de/sites/mobil.hessen.de/files/2022-02/wirtschaftliche_aspekte.pdf)) | **3–12 %** of total; "im Mittel ca. 2.000 bis 4.000 Euro je Meter Tunnelröhre"; "Für Tunnel mit Längen unter 400 m gilt die angegebene Untergrenze" | equipment for a second tube +30–40 % |
| Gotthard 2nd road tube (ASTRA fact sheet, price base 2010, [PDF](https://swissvotes.ch/attachments/f23a9ccb2cbfad7902eef7c97cb8c639c53ddbf8ab4367573bd9ba8803f3caab)) | 208 of 2,023 M CHF = **10.3 %** "Betriebs- und Sicherheitsausrüstung"; 1,249 M civil incl. ventilation and energy centres, cross-connections, lay-bys, portals; 229 M general; 337 M contingency | 16.9 km |
| D8 Panenská + Libouchec mid-life repair, 2025 | 744 M CZK (Spel): technology repair plus civil repairs (walkways, drains, fire doors, escape-route ventilation, signs, EPS, PA, speed and hazmat detection) ([zdopravy 2025](https://zdopravy.cz/nejdelsi-cesky-dalnicni-tunel-ceka-generalni-oprava-za-tri-ctvrte-miliardy-zvysi-v-nem-rychlost-234669/)) | mixed scope; ≈ 5 km of tube |
| ŘSD (Mátl), 2025–26 | operation incl. energy and maintenance ≈ **20 M CZK per motorway tunnel per year**; technology life 15–20 years ([zdopravy](https://zdopravy.cz/prichazi-tunelovy-boom-rsd-predstavilo-plany-na-dalnicni-useky-v-podzemi-271866/), [e15](https://www.e15.cz/byznys/doprava-a-logistika/vytunelovane-cesko-razba-podzemnich-tepen-oziva-levne-ale-skutecne-nejsou-priznava-rsd-1430381)) | Hessen: 100–150 €/m/year |

**Scaling with length (Hessen Fig. 3-2, read off the chart):** specific cost per tube-m ≈ 110 % at 200 m,
100 % at 400 m, ≈ 94.5 % at 1,000 m, ≈ 92.5 % at 2,000 m. Derived fit c(L) = 0.906 c₄₀₀ + 37.5 m · c₄₀₀ / L
matches all four points within 1 %. So **≈ 37.5 m-equivalents of fixed cost per tube** (site set-up, portal
blocks, pre-cuts, operations building), i.e. ≈ 9 % of a 400 m tube. PROVISIONAL (German, 2006). research/49 gets
30–53 m from the text. SPK does the opposite (short 4 % cheaper per km); see §1.1.

**Safety categories (Czech).** TP 98-Z1/2010 as reproduced in [TP 229, Obr. 2](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_229.pdf)
(log–log chart, read off):

| Category | Length | Traffic (veh/day/lane) |
|---|---|---|
| TD | 100–300 m | ≤ 15,000 (above: TD-H) |
| TC | 300–500 m | ≤ 15,000 (above: TC-H) |
| TB | 500–3,000 m | below the line from (500 m, 15,000) to (3,000 m, 1,000) |
| TA | > 3,000 m, or above that line | — |

The 2004 TP 98 text adds: "Pro hloubené tunely do délky 100 m v zásadě platí mostní norma … Tyto tunely nejsou
vybavovány řídicím ani bezpečnostním systémem" ([TP 98](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_98.pdf), §2.1).
Each category has mandatory and recommended equipment (TP 98 tab. 6-1, not extracted). **A new TP 98 is in force
from 1 Nov 2025** ([ČKAIT Profesis](https://profesis.ckait.cz/aktuality/md-nove-schvalene-tp-a-tkp-3/)). Its
category limits were not checked (UNVERIFIED that they are unchanged). The D11 article states the category
decides the equipment and that "v případě tunelů delších než 500 m je již nutné se řídit … NV č. 264/2009".

**NV 264/2009 Sb., Annex 1 (tunnels over 500 m; [text](https://www.zakonyprolidi.cz/cs/2009-264)), quoted values:**

- 1.2: if the 15-year forecast exceeds **10,000 vozidel za den v jednom jízdním pruhu** → a tunnel "s dvěma
  tunelovými troubami pro jednosměrný provoz".
- 2.1: gradient ≤ 5 % in new tunnels; > 3 % needs extra measures.
- 3.6 / 3.8: new tunnels need **emergency exits** when traffic > 2,000 veh/day/lane, **at most 500 m apart**.
  Examples (3.3): direct exits outside, **cross-connections between tubes**, exits to an escape gallery, shelters
  with a separate escape route.
- 4.1: twin tubes: a rescue-vehicle cross-connection at least every **1,500 m**.
- 5.1: bidirectional tunnels > 1,500 m with > 2,000 veh/day/lane: lay-bys every ≤ 1,000 m (if no emergency lane).
- 9.2: **forced ventilation** in tunnels > **1,000 m** with > 2,000 veh/day/lane.
- 10.3: emergency stations ≤ 150 m apart; 12: hydrants ≤ 250 m.
- 13.1: **control centre** for tunnels > **3,000 m** with > 2,000 veh/day/lane; 15.1: closure signals > 1,000 m.

As worded (§1), NV 264/2009 applies to every road tunnel over 500 m. research/49 says the same.

**Escape-route options and their cost (Hessen Fig. 3-6, per m of tunnel structure, read off; 100 % = one tube,
good ground):** single tube 91–105 % (≤ 130 % poor ground); single tube + parallel escape gallery 121–135 %
(≤ 162 %); single tube + drivable escape gallery 130–144 % (≤ 168 %); **twin tube 165–179 %** (≥ 200 % poor).
Cross-passages between twin tubes "die Baukosten eines 300 m langen Tunnelabschnittes um ca. 2 bis 4 % erhöhen".
Breakdown bays (RABT, from 900 m, or 600 m with heavy traffic) cost 100–500 k€ each, ≈ +2–4 % on a 600 m section.
For comparison: Chotýčany (rail) chose escape shafts over a parallel gallery after costing both (§2.3).
Cross-section (Fig. 3-5): RQ 26T (2 lanes + hard shoulder) ≈ 124–138 % of RQ 26t; 3-lane 33t ≈ 158–172 %. SPK
prices 3-lane at only 115 %.

## 4. When each method is chosen

| Method | Typical use (Czech practice and guides) | Cover | Length |
|---|---|---|---|
| **Mined, NRTM** (drill-and-blast or excavator, shotcrete primary lining, cast secondary lining) | Default for every Czech road tunnel through a hill: D1, D5, D8, D11, D35, D0 514/513, Brno, Mrázovka | Mining starts at ≈ 6 m crown cover (5.5–8.5 m) under pipe umbrellas; low-cover zones (< 15 m at D11) in the worst class (research/49). Hessen: ≥ 1.0 B in rock, 1.5–2.0 B in soil | Any; Czech road range 120 m (Vršky) to 3,983 m (Dětřichov, planned) |
| **Cut-and-cover** (open pit, cast frame/vault, backfilled) | Portal zones (12–350 m per portal); shallow terrain (Libeř 1,500 m, Pohůrka 1 km, Dubeč, Na Vysoké, Kramolna, Stránov); cover put back for a road, bio-corridor or EIA demand; urban top-down (Blanka) | SPK prices ≤ 5 m of cover; Hessen: "Bei Firstüberdeckungen von maximal 5 m bis 7 m … vergleichsweise kostengünstig" | Any; ≤ 100 m counts as a bridge/underpass (TKP-D 7, TP 98) |
| **TBM** (shield, segmental ring) | Long rail tunnels (Ejpovice) and metro; no Czech road case | Shield also works at low cover in soft ground (Ejpovice north tube's first 250 m at low cover, research/49) | Economic from ≈ 1.5–4.5 km per drive (§2.3); fixed circular section |
| **Gallery** (galerie, open-sided roof on a hillside) | D8 Libouchec 160 m on one tube (research/49); rockfall / avalanche protection | Side cover insufficient for a tunnel | Short. Hessen Fig. 4.1-4: gallery 123–168 % of the reference (≤ 258 % poor ground); hillside tunnel ("Lehnentunnel") 198–278 %. SPK excludes galleries |

Hessen also gives the economic limit of a cut against a tunnel at "ca. 30 m Tiefe" (§4.1.1). Its Fig. 4.1-1 cost by
cover is tabulated in research/49 §3.

## 5. International unit costs (per tube-metre, nominal, for scale)

| Tunnel | Basis | Derived per tube-m | Source |
|---|---|---:|---|
| Katschberg 2nd tube (A10, 5,898 m) | 112 M€ incl. refurbishing tube 1, 2009 | ≤ 19 k€ | [de.wikipedia](https://de.wikipedia.org/wiki/Katschbergtunnel) |
| Tauern 2nd tube (A10, 6,546 m) | 197 M€ incl. refurbishment, 2011 | ≤ 30 k€ | [de.wikipedia](https://de.wikipedia.org/wiki/Tauerntunnel_(Autobahn)) |
| Pfänder 2nd tube (A14, 6,744 m) | 205 M€ incl. refurbishment, 2012 | ≤ 30 k€ | [de.wikipedia](https://de.wikipedia.org/wiki/Pf%C3%A4ndertunnel) |
| Gleinalm 2nd tube (A9, 8,320 m) | 243 M€ incl. refurbishment, 2013–19 | ≤ 29 k€ | [de.wikipedia](https://de.wikipedia.org/wiki/Gleinalmtunnel) |
| Karawanken east tube (A11, ≈ 7.9 km, AT + SI) | 340 M€, 2018–26 | ≈ 43 k€ | [de.wikipedia](https://de.wikipedia.org/wiki/Karawankentunnel_(Autobahn)) |
| Swiss national roads (ASTRA, c. 2010 prices): Gotthard 2nd 16.9 km 119; Axen 7.8 km 126; Serrières 1.7 km 140; Belchen 3rd 3.2 km 156; Gubrist 3rd 3.3 km 171; Baregg 3rd 1.1 km 272 | M CHF per km, excl. VAT | 119–272 k CHF | ASTRA fact sheet (above) |
| German reference tunnel (1 tube RQ 10.5T, < 400 m, good rock) | civil + equipment, 2006 | 14–16 k€ | Hessen Mobil 2006 |
| Czech SPK CN 2026, 2-lane rural mined > 500 m | 1,549,899 CZK/m | ≈ 62 k€ at an assumed 25 CZK/€ (rate not sourced) | SPK |
| EU rail tunnels (DG REGIO unit-cost study, Annex 13) | "between 25 M€/km and 30 M€/km on average" | 25–30 k€ (per route-km, rail) | [EC PDF](https://ec.europa.eu/regional_policy/sources/studies/assess_unit_cost_rail/annex_13_case_study_tunneling.pdf) (search snippet only) |

The Austrian figures are second tubes next to an existing one: the site, access and some equipment are shared,
and the price levels are older. The Czech rate is clearly at the upper end even so. The 2008 MD comparison of
the Dresden motorway (DE 27 % cheaper) is the only like-for-like Czech/German statement found.

## Game implications (proposal; the main agent decides)

The current engine already has the SPK **mined** rows (per tube; urban blend; one tube for 2-lane roads, two for
motorways; cover ≥ 6 m over the crown). research/49 proposes cut-and-cover portals. A method choice could stay
small: three methods on the tunnel card, Auto picking the cheapest one that is allowed. Shown as "Bored",
"Cut and cover" and "Tunnel boring machine", or in plain-word equivalents from `terms.ts`.

| Method | Allowed where (C = crown cover = ground − grade − 8 m) | Cost per tube-m vs the current SPK mined row | Equipment / fixed | Confidence |
|---|---|---|---|---|
| **Mined (default)** | C ≥ 6 m (unchanged). Optional low-cover factor 1.3–1.4× for 6 ≤ C < 15 m (research/49) | **1.00** (A.3.R rows as now; urban 1.48×; 3-lane 1.15×) | Inside the rate (20 %). No extra fixed cost: SPK already includes portals and ranks short below long | High (SPK + Homole 2024 at 1.03×) |
| **Cut-and-cover** | 0 ≤ C ≤ 5 m priced by the row; 5 < C ≲ 7.5 m adds the pit excavation and backfill as earthworks (SPK excludes > 5 m). Surface is restored (land returns, roads/streams cross on top). ≤ 100 m: price as a covered bridge / ecoduct (48,235 CZK/m², research/49) | **1.075** rural 2-lane (A.3.H rows); 3-lane 1.12× its mined row. **Urban: no SPK price.** Use the urban mined row (PROVISIONAL) or forbid it | Inside the rate. ≤ 100 m: no tunnel equipment (TP 98) | High for rural rows; low for urban |
| **TBM (long tunnels only)** | Length ≥ ≈ 3 km per tube (break-even 1.5–4.5 km); any C ≥ ≈ 1 tube diameter (UNVERIFIED) | **≈ 0.85–0.95×** of the mined row (Ejpovice −16 % whole contract; Chotýčany −6 %), plus a fixed set-up per tube. A fixed cost equal to the saving at 3 km, ≈ 0.10 × 1.55 M × 3,000 m ≈ **0.45 bn CZK per tube**, is a PROVISIONAL calibration to the break-even, not an observation | as mined | Low (no Czech road case, no SPK row). Could be omitted for roads; for rail, SPOŽES has no method split either |
| *(Gallery)* | Hillside with too little side cover | 1.2–1.7× reference (Hessen); no SPK row | — | Low. **Not recommended** for now |

Mechanisms that matter more than the method button (each is missing today):

1. **Escape provision for single-tube tunnels (2-lane roads).** Over 500 m with > 2,000 veh/day/lane, NV 264/2009
   requires exits ≤ 500 m apart. With one tube that means an escape gallery or shafts: **≈ 1.3× the tube cost**
   (Hessen 121–135 %). Above a 15-year forecast of 10,000 veh/day/lane a **second tube** is mandatory (≈ 1.7–1.8×).
   The engine currently bills one tube with no escape route at any length. Confidence: high on the rule, medium on
   the factor. The SPK row includes cross-passages only "případně".
2. **Long-tunnel extras that SPK excludes:** ventilation buildings/shafts (forced ventilation > 1,000 m),
   operations buildings and a control centre (> 3,000 m), exploratory galleries (Luka: ≈ 0.28 M CZK/m, i.e.
   ≈ 18 % of the tube rate per metre of gallery), monitoring and trial operation. No SPK values exist. Leave
   unbilled but name them in the "why", or add an exploratory gallery for tunnels > 1 km at the Luka rate
   (PROVISIONAL).
3. **Railway tunnel equipment:** add SPOŽES B12 (71.9 M/km of tunnel) and O03 (71.7 k/m) and C08 (19.7 M each) if
   J01–J04 exclude them. That is ≈ +17 % on J01 (§1.2). Medium confidence that it is missing; verify against the
   SPOŽES methodology before changing bills (COST_MODEL_VERSION bump).
4. **Do not add a separate fixed portal or equipment cost to mined tunnels.** SPK already contains portals and
   20 % equipment, and prices short tunnels lower per km. The Hessen fixed share (≈ 37.5 m-equivalents per tube)
   would double-count. Keep `minTunnelLength` and the 500 m row split as they are.
