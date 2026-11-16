# Less-mandatory earthworks: slopes, benches, walls, 2018 grades

Research snapshot: 2026-11-16. CZK excl. VAT. OTSKP = SFDI April 2026 item list (official
[archive](https://sfdi.gov.cz/wp-content/uploads/2026/04/otskp-2.zip), workbook
`Příloha č.2 OTSKP 2026 - soubor položek_20260410.R1.Shared.xlsx`, read with openpyxl read-only; same file
as research/18). SPOŽES = SFDI [2026 functional workbook](https://sfdi.gov.cz/wp-content/uploads/2026/04/260429-funkcni-spozes.xlsx),
sheet `Tabulka propočtu`, column "Přepočet sazby v CU2026". **Sourced** = a cited document states it;
**derived** = shown arithmetic; **PROVISIONAL / UNVERIFIED** = game assumption or not found. ČSN texts are
paywalled; the slope rules below come from the Ministry of Transport's *Vzorové listy* (official standard
details that "rozpracovávají ustanovení technických norem") and teaching reproductions.

Supersedes an earlier untracked draft of this file (which found no slope tables, no 2018 grade table and no
wall rates; all three are now found).

## Findings at a glance

- **Fill slopes have an official broken profile (VL 1, 01/2022, sheet 32-01):** measured up from the toe,
  0–3 m at **1:2.5**, 3–6 m at **1:1.75** (fills > 6 m; for fills ≤ 6 m the part above 3 m is **1:1.5**),
  above 6 m at **1:1.5**. Rock-fill (kamenitá sypanina) may be **1:1.5 throughout above 3 m**. **No fill
  benches** in the 2022 sheet. The engine's uniform 1:2 + 2 m bench every 6 m is close for fills ≤ 6 m but
  **≈ 30 % (10 m) to ≈ 46 % (20 m) too much side-slope area** on high fills.
- **Cut slopes:** soil ≤ 2 m not steeper than **1:2**, 2–6 m **1:1.75**, deeper by geotechnical assessment
  (VŠB teaching page, stavskola Kaun–Lehovec summary, VL 2 1995 sheet 301.04). **Rock cuts are designed
  "ns:1" (steeper than vertical-ish 1:1) with ≥ 1.0 m benches** (VL 1 2022 sheet 31-04; VL 2 1995 sheet
  301.07 example: benches at 3 m then every 5 m). Real cases: II/157 Srubec (2025 permit decision) **4:1 with 1.0 m
  benches**; D8 km 90.3–90.7 **15 m at ≈ 75°** with nets. The engine's 1:1.75 in class III rock overprices
  a 15 m rock cut by ≈ 166 m³ per metre per side (derived below).
- **2018 ČSN 73 6101 values found** (ČVUT FD course 12SDK, Jan 2023, reproducing the 2018 tables): crest
  Rv min (stopping) **90: 5,500 / 80: 3,300 / 70: 2,100 / 60: 1,200 / 50: 650 m**; sag Ru min allowed
  **90: 2,700 / 80: 2,100 / 70: 1,500 / 60: 1,000 / 50: 700 m**; max grade **S 9.5: 4.5 / 6 / 8 %**
  (flat / hilly / mountainous), **S 7.5: 4.5 / 7 / 9 %**, S 6.5: 7 / 8 / 9 %, D 27.5: 3 / 4 / 4.5 %.
  A footnote explicitly allows steeper grades on multi-lane roads (up to 6 % hilly) where flatter would
  "excessively increase earthworks / take of quality farmland". Engine currently: crest 6000/3000/2500, sag
  3400/2100/1500 (older edition, 90 = old 100 column).
- **Wall rates:** SPOŽES 2026 (rail, all-in study norm) **opěrné a zárubní zdi ≤ 5 m: 39,100 CZK/m²;
  > 5 m: 44,600 CZK/m²**; rock-cut remediation **4,300 CZK/m²**. OTSKP gives components: gabion walls
  3,711.55–4,616.71 CZK/m³, soil nails **875.14 CZK/m**, shotcrete 9,956.55 CZK/m³, rock nets by climbers
  **2,513.47 CZK/m²**, reinforced-soil fill 334.16 (own) / 1,138.24 (bought) CZK/m³, geogrid 108.37 CZK/m²,
  prestressed anchor ≤ 10 m 24,815.69 CZK/each. Derived road-wall face rates: RC cantilever **≈ 7–15 k
  CZK/m²** (2–8 m), gabion **≈ 4–7 k**, reinforced soil **≈ 2.4–7.5 k**, soil nails **≈ 6–11 k**, anchored
  pile wall **≈ 25 k** (6 m).
- **SPK CN road norm already contains retaining walls "up to 100 m per km and 2 m high"** (research/00):
  ≈ 200 m² of wall face per km is free in the norm price.

## 1. Slopes and benches (ČSN 73 6133 / ČSN 73 6101 as detailed by the Vzorové listy)

### 1.1 Fills — VL 1 (MD ČR, 01/2022), sheet 32-01 "Základní tvary násypových těles"

Source: [VL 1 Vozovky a krajnice, 2022](https://upload.wikimedia.org/wikipedia/commons/5/59/VL_1_2022_Vozovky_a_krajnice.pdf)
(MD-approved standard details; the 2022 edition now contains the road-body sheets 31-xx/32-xx). Page 67
rendered and read. Drawing "Sklony svahů násypu do výšky 6 m": toe band 0.0–3.0 m **1:2.5**, above 3.0 m
**1:1.5**. Drawing "… vyššího než 6 m": 0–3 m **1:2.5**, 3–6 m **1:1.75**, above 6 m **1:1.5**. Notes
(verbatim abridged):
1. high fills need bearing capacity/settlement of subsoil, slope-stability calculation, material
   suitability, "popřípadě navrhnout úpravy podloží"; minimum safety factors per ČSN 73 6133;
2. "Násypy z kamenité sypaniny mohou mít v pásmu nad 3,0 m jednotný sklon 1 : 1,5 bez ohledu na výšku";
4. "V případě násypu s výztužnými vložkami se svah navrhuje individuálně";
5. slopes 1:1.75 and steeper: check stability of the topsoil cover;
6. "Výška násypu je dle ČSN 73 6133 počítána od průniku svahu … se stávajícím terénem" — i.e. bands are
   measured **from the toe up**.

The same three-band rule appears as text in the VŠB teaching page [Zemní těleso](https://hgf10.vsb.cz/546/VHZ1/vyuka/doprava/teleso.html)
("v pásmu do 3,0 m – 1:2,5, od 3,0 do 6,0 m – 1:1,75, od 6,0 m výše – 1:1,5") and in the stavskola
summary of Kaun & Lehovec, *Pozemní komunikace* 1998 ([PDF](https://www.stavskola.cz/userfiles/file/stavskola/materialy-ke-studiu/inzenyrske-stavby/mercl/Zemni_prace_1.pdf)),
which adds "Při návrhu zemního tělesa do výšky 6 m lze aplikovat vzorová řešení" (above 6 m: design by
calculation). Real project: II/157 Srubec (permit decision 2025) "základní sklon svahů násypů … 1:2,5"
([KÚ JčK decision](https://www.starehodejovice.cz/wrs_frontend/download.php?file=2023-6381604212525.pdf&param=94390)).

**Fill benches.** VL 1 2022 shows none. The 1995 edition ([VL 2, sheet 302.01](https://pjpk.rsd.cz/data/USR_001_2_10_VL/VL2_Silnicni_teleso__199505_.pdf),
page 26 rendered) shows an *optional* "jednotný sklon se zatěžovací lavicí", berm **min. 2.5 m** wide at
8–10 % crossfall, which may be built from material unsuitable for the fill body — a counterweight, not a
mandatory step. The R49 Fryšták–Lípa feasibility study (flysch, landslide-prone) plans "přitěžovací lavice"
for fills over 6 m in two stretches only ([R49 study 2006, §2.2.1.14](http://www.r49.cz/studie-proveditelnosti-R49-2006/2-Technicke-reseni-na-uzemi-CR/2.2.1-Stavba-4902-Frystak-Lipa-textova-cast.pdf)).
OTSKP 17110 (placing fill) explicitly includes "zřízení lavic na svazích", so a berm costs only its extra
volume and land.

**Fill on sloping ground** (VL 1 32-02, page 68 rendered): on terrain steeper than **10 %** the ground is
benched in steps **2.50–3.50 m** wide with **5:1** risers and 3–5 % outfall. Priced by OTSKP 12673
"Zřízení stupňů v podloží násypů tř. I" **225.20 CZK/m³** (class II/III variants exist; a 2020 III/218 BOQ
uses 12693, class III, for this).

Derived comparison, side-slope wedge area of both sides (excluding the crown core):

| Fill height | VL 1 2022 | Engine 1:2 + 2 m bench / 6 m | Engine excess |
|---:|---:|---:|---:|
| 4 m | 33.0 m² | 32 m² | −3 % |
| 10 m | 165.8 m² | 216 m² | +30 % |
| 20 m | 615.8 m² | 896 m² | +46 % |

Footprint width per side at 20 m: VL 1 33.75 m vs engine 46 m.

### 1.2 Cuts in soil

- VŠB page and stavskola summary: depth ≤ 2 m **not steeper than 1:2**; 2–6 m **1:1.75**; deeper "podle
  vlastností zeminy zjištěných geologickým průzkumem".
- VL 2 1995 sheet 301.04 (page 19 rendered): cut 2–6 m "MAX 1:1,75"; note 2: slopes in **semi-rock and fast-
  weathering rock are designed like soil slopes** after a stability assessment. Sheet 301.02: deeper cuts
  "stupňovitý sklon s lavičkami", "stabilitu svahu zářezu je třeba prokázat výpočtem".
- VL 1 2022 sheet 31-01: "SKLON DLE POSOUZENÍ STABILITY SVAHU 1 : n" — no fixed value; cut slopes 1:2 and
  steeper need a topsoil-stability check; 31-02: a catch ditch above the cut where terrain over it slopes
  > 5 %.
- Projects: II/157 shallow cuts 1:2.0, deep cuts 1:1.75; I/27 Klatovy (EIA 2016) "u zářezů hlubších než
  6 m je navržena lavička šířky 1 m" ([CENIA](https://portal.cenia.cz/eiasea/download/RUlBX1BMSzE4MTNfb3puYW1lbmlET0NfNzY4MTcwMDkwMTc3NjIyNjc4Ni5wZGY/PLK1813_oznameni.pdf));
  R49 in claystone/siltstone flysch with landslide risk **1:2.5** plus stabilising toe fills.
- Field roads only (JČU thesis 2011, citing its ref. [14], apparently ČSN 73 6109, [PDF](https://dspace.jcu.cz/bitstreams/38a57fa8-b908-4d8b-8cc6-261df7c64db0/download)):
  stable soils 1:1–1:1.5, **weathered rock 2:1**, rock-fill fills 1:1, rock-pitched 1.25:1. Secondary,
  field-road context; shows that steep cuts are normal where ground allows.

### 1.3 Cuts in rock

- VL 1 2022 sheet 31-04 "Tvary zářezových svahů ve skalních horninách" (page 64 rendered): soil cover HZ at
  1:n, rock HS at **ns:1**, benches **min. 1.00 m** at 10 % crossfall, "Sklon svahu (ns), výšky H1–H3 a
  umístění laviček dle geologického průzkumu".
- VL 2 1995 sheet 301.07 (page 22 rendered): example rock cut with H1 = **3.00 m**, H2 = **5.00 m** between
  ≥ 1.0 m benches. Sheet 301.06: a foot bench ≥ 1.0 m is used **instead of** slope benches where nets /
  barriers protect against falling rock; above 60 km/h a guardrail at the start of a rock cut.
- **II/157 Srubec (class II, S 7.5/80):** "v hlubokém skalním zářezu navrženy svahy ve sklonu **4:1** s
  lavičkami 1,0 m včetně ochrany svahu" (KÚ JčK decision above).
- **D8 km 90.340–90.740:** "Výška zářezu dosahuje až cca 15 m, sklon je do cca 75°", currently double-twist
  mesh on 1.4 m bolts, being re-secured by gabion mattresses, block removal, re-anchoring and concrete
  plugs ([tender](https://portaldodavatele.cz/verejne-zakazky/d8-oprava-svahu-zajisteni-svahu-vpravo-d8-km-90-340-az-km-90-740);
  price not public). Lesson: steep rock faces carry a maintenance/protection cost.
- I/44 Červenohorské sedlo: ≈ 500 m rock cut in crystalline rock with rockfall, remediated
  ([ASB 2014](https://www.asb-portal.cz/stavebnictvi/inzenyrske-stavby/geotechnika/hodnoceni-skalniho-riceni-a-jeho-sanace-na-silnici-i-44-cervenohorske-sedlo),
  search lead, not opened).

**Rock costs.** Excavation class III OTSKP 12293 **653.27 CZK/m³** (scope includes "ztížení … v okolí
výbušnin", "rozpojování jednotlivých balvanů"; ÚRS notes blasting may need individual pricing, research/10).
Face protection: OTSKP 289941 "zpevnění skalních ploch z ocelových sítí horolezeckým způsobem"
**2,513.47 CZK/m²**; SPOŽES 2026 F16 "Sanace skalního zářezu" **4,300 CZK/m²** (all-in, rail). Bolts:
OTSKP 285361 rebar anchor ≤ 3 m **5,507.99**/each, excludes drilling (261314 class III ⌀ ≤ 35 mm
1,467.62 CZK/m) → ≈ 9,900 per 3 m bolt (derived).

Derived example, 15 m cut, per metre of road per side: soil 1:1.75 + 1 m benches at 6/12 m = 208.9 m³;
rock 4:1 + 1 m benches at 5/10 m = 43.1 m³. Saving **165.8 m³ × 653 ≈ 108 k CZK**; face ≈ 15.5 m² × 2,513
(mesh) – 4,300 (SPOŽES) = **39–67 k CZK** back; footprint **22.5 m narrower**. Net ≈ 40–70 k CZK/m/side
cheaper and much less land: the current uniform 1:1.75 makes rock cuts look far worse than they are.

### 1.4 Geology class → slope (what the sources support)

No source gives a lithology → slope table; VL 1 always says "dle geologického průzkumu". What the sources
do support is a **composite section**: soil cover at a soil slope, rock below at a steep rock slope with
narrow benches (VL 1 31-04), and "semi-rock / fast-weathering rock = treat like soil" (VL 2 301.04 note 2).
That maps naturally onto the engine's per-strip I/II/III depth profile (research/10).

## 2. Retaining structures

### 2.1 Unit rates

| Item | Unit | CZK | Source |
|---|---:|---:|---|
| Retaining & cut walls ≤ 5 m high (H19), all-in study norm, rail | m² face | **39,100** | SPOŽES 2026 (2024: 36,800) |
| Retaining & cut walls > 5 m (H20) | m² | **44,600** | SPOŽES 2026 (2024: 42,000) |
| Facing walls (obkladní zdi, H23) | m² | 33,200 | SPOŽES 2026 |
| Rock-cut remediation (F16) | m² | 4,300 | SPOŽES 2026 |
| RC wall concrete C30/37 (327325) / rebar (327365) | m³ / t | 9,343.92 / 41,635.80 | OTSKP (research/18) |
| Gabion wall poured / hand-laid, 2.2 mm Zn+Al (3272B1 / 3272A1) | m³ | 3,711.55 / 4,616.71 | OTSKP |
| Reinforced-soil fill, own / bought (17910 / 17980); with binders 17913 | m³ | 334.16 / 1,138.24; 611.54 | OTSKP |
| Geogrid reinforcement (289972); geotextile (28997) | m² | 108.37; 87.44 | OTSKP |
| Anchoring mesh for gabions & reinforced soil (28995) | m² | 440.02 | OTSKP |
| Soil nails, supply & install (28991) | m | 875.14 | OTSKP |
| Drilling for anchors/nails, class I+II, ⌀ ≤ 100 / 150 mm (26172 / 26173) | m | 1,682.30 / 2,134.26 | OTSKP |
| Shotcrete ≤ C12/15 (28931) | m³ | 9,956.55 | OTSKP |
| Prestressed anchor ≤ 10 m (285378), each +1 m (285379); excl. drilling | each / m | 24,815.69 / 2,482.43 | OTSKP |
| Pile bore ⌀ ≤ 800, class I+II (264730); RC pile C30/37 (224325); pile rebar (224365) | m / m³ / t | 2,423.45 / 6,065.94 / 48,858.84 | OTSKP |
| Rock mesh by climbing technique (289941) | m² | 2,513.47 | OTSKP |

SPOŽES is a rail study norm (structure averaged over real rail projects, includes everything incl.
foundations, drainage, railings, site works); it is the only official **per-m² wall** figure found and is a
ceiling/cross-check for roads, not a road tender rate. SPK CN (road norm) has no wall row; its per-km road
price already includes walls "up to 100 m per km and 2 m high" (research/00 §3.1).

**Real contract evidence (gabions).** D5 Rokycany connection, SO 203 retaining wall, 120 m long, **1–3.5 m
high**: change order 046 (2024) deletes the gravity gabion wall — 431.5 m³ OTSKP 3272A9 + 426.8 m²
geotextile — for **−2,450,544 CZK** and replaces it with geogrid-reinforced soil faced with 0.5 m gabions
for **+3,109,071 CZK** (incl. drainage aggregate, 300 h pumping)
([smlouvy.gov.cz](https://smlouvy.gov.cz/smlouva/soubor/38848576/ZL046-SO203-Gabion_redigov%C3%A1no.pdf)).
Derived: ≤ 5,680 CZK/m³ gabion; **≈ 20,400 CZK per running m** of a 1–3.5 m gabion wall; 3.6 m³ of gabion
per running m. Unpriced III/218 BOQ (KSÚS KK 2020) shows gabion sections of 1.75–3.7 m³/m
([BOQ](https://ezak.kr-karlovarsky.cz/document_audit_75667/aktualizovany_soupis_praci_1-pdf)).

### 2.2 Derived face rates for roads (component method, PROVISIONAL geometry)

- **RC cantilever (úhlová zeď).** Proportions: base width 0.4–0.7 H, base thickness 0.07–0.1 H
  ([SkyCiv design process](https://skyciv.com/docs/skyciv-retaining-wall/articles/retaining-wall-design-process/));
  cantilevers economical to ≈ 7 m, counterforts above (lecture notes, [GEC Gudlavalleru](https://civil.gecgudlavalleru.ac.in/images/admin/pdf/1594705634_ACS.pdf), search snippet).
  Assumed: base 0.6 H × max(0.4, 0.1 H), stem 0.3 m top → 0.1 H bottom, 120 kg rebar/m³ (research/18) →
  14,340 CZK/m³. Concrete 0.49 / 0.59 / 0.81 / 1.03 m³ per m² face at H = 2 / 4 / 6 / 8 m →
  **7.0 / 8.5 / 11.6 / 14.8 k CZK/m²**, plus excavation/backfill/drain ≈ 0.8–1.5 k (research/18).
- **Gabion gravity wall.** 1.0–1.6 m³ per m² face at 1–3.5 m (D5, III/218 above) × 3,712–5,680 →
  **≈ 4–7 k CZK/m²**. Typical upper height not verified (D5 3.5 m, III/218 ≈ 3.7 m sections).
- **Reinforced soil / steep reinforced slope (VL 1 sheet 32-03 "Vyztužené násypy", per TKP 30 and TP 97,
  designed by a geotechnician).** Reinforcement length ≥ 0.7 H, ≥ 8 ft ≈ 2.4 m
  ([FHWA-NHI-10-024](https://www.fhwa.dot.gov/engineering/geotech/pubs/nhi10024/nhi10024.pdf)); assumed
  0.5 m layer spacing. Per m² face at H = 6 m: geogrid 910 + fill premium over ordinary fill 1,027 (own) or
  4,781 (bought fill) + facing (0.5 m gabion 1,856 or mesh-wrapped 440) → **2.4 k (wrapped, own soil) –
  7.5 k (gabion face, bought fill)**; at 10 m 3.7–11.3 k. Cheapest wall type wherever there is room for the
  reinforced block (fills, side-hill fills).
- **Soil-nail wall (cuts, top-down).** Nails 1.5 × 1.5 m, length 0.6–1.0 H (VDOT ch. 18; FHWA GEC 7 typical
  1.5 m spacing — search snippets, not opened); assumed 0.7 H, drilled ⌀ ≤ 100 + nail 2,557 CZK/m, 0.2 m
  shotcrete, 15 kg mesh/m² → **5.8 / 7.4 / 10.6 k CZK/m²** at H = 4 / 6 / 10 m. Needs a sloped or vertical
  face in soil above groundwater; I/33 Náchod thesis lists it as suited "kde lze zachovat skloněný líc".
- **Anchored pile wall (deep cut next to something that must stay).** I/33 Náchod bypass: a 1:2 slope would
  hit a building → piles ⌀ 630 at 630 mm, one anchor row, strand anchors 5 m free + 6.5 m root
  ([VUT thesis](https://www.vut.cz/www_base/zav_prace_soubor_verejne.php?file_id=299062)). Assumed
  1.25 piles/m, length 1.5 H, anchors every 2.5 m per 3 m height, 12 m long → piles 14.8 k + anchors 7.4 k +
  facing ≈ 2–3 k → **≈ 25 k CZK/m² at H = 6 m**. LOW confidence; SPOŽES 44.6 k as ceiling.

### 2.3 When designers use walls instead of slopes

Sourced cases: I/33 Náchod (cut slope would reach a building → pile wall); II/157 tunnel portal (zárubní
zdi both sides of the approach cut); D5 SO 203 (wall to keep earthworks away from an existing bridge
footing, then switched to reinforced soil); VL 1 32-03 reinforced embankments as a standard detail. VL 2
1995 notes that on high-grade farmland slopes are made **steeper** and the cut edge less rounded to limit
land take (sheet 301.03 note 1). No source gives a quantitative rule "wall when cross-slope > x"; the
choice is cost of slope (volume + land + what it hits) vs cost of wall — exactly what Auto can compute.

## 3. ČSN 73 6101:2018 grades and vertical curves

Source: ČVUT FD, course 12SDK, *Stanovení kategorie silnice* exercise notes, PDF dated 2023-01-17
([PDF](https://k612.fd.cvut.cz/predmety/12SDK/cviceni/vyklad/12sdk-c-01.pdf), pages 10–11 rendered). The
tables use 2018 nomenclature (S 9.5 at 90 km/h "pro všechny 2-pruhové silnice", S 20.75, S 15.25, D 21.5,
S 6.5, S 4.0 — matching Radimský's 2019 revision slides), so they are the 2018 edition reproduced
secondarily. **Confidence: medium-high.**

Crest (vypuklý) Rv, m — "nejmenší dovolený pro zastavení" (smaller allowed if stopping sight distance is
proved in the profile); "doporučený pro předjíždění":

| v (km/h) | 130 | 120 | 110 | 100 | 90 | 80 | 70 | 60 | 50 | 40 | 30 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| min. allowed (stopping) | 17,000 | 11,500 | 8,300 | 7,900 | **5,500** | **3,300** | **2,100** | 1,200 | 650 | 350 | 150 |
| recommended (overtaking) | – | – | – | – | 29,000 | 20,000 | 12,000 | 7,000 | 4,000 | – | – |

Sag (vydutý) Ru, m (recommended values are the minimum on international roads and motorways):

| v (km/h) | 130 | 120 | 110 | 100 | 90 | 80 | 70 | 60 | 50 | 40 | 30 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| min. recommended | 7,000 | 6,000 | 5,000 | 4,200 | 3,500 | 2,800 | 2,000 | 1,500 | 1,200 | 1,000 | 700 |
| min. allowed | 6,000 | 5,000 | 4,000 | 3,400 | **2,700** | **2,100** | **1,500** | 1,000 | 700 | 400 | 200 |

Maximum longitudinal grade, % (flat / hilly / mountainous):

| Category | Flat | Hilly | Mountainous |
|---|---:|---:|---:|
| D 33.5; D 27.5 | 3 | 4 ᵇ | 4.5 ᵃ |
| D 26.0; D 25.5 | 3.5 | 4.5 | 5 ᵃ |
| D 21.5 | 3.5 | 4.5 (to 6 ᵇ) | 6 |
| S 26.0; S 25.5; S 24.5 | 3.5 | 4.5 (to 6 ᵇ) | 6 |
| S 21.5; S 20.75; S 15.25 | 4 | 4.5 (to 6 ᵇ) | 6 |
| S 13.5; S 11.5 | 4.5 | 6 | 7.5 |
| **S 9.5** | 4.5 | **6** | **8** |
| **S 7.5** | 4.5 | **7** | **9** |
| S 6.5 | 7 | 8 | 9 |
| S 4.0 | 10 | 11 | 12 |

ᵃ exceeding needs the road authority's consent. ᵇ "Vyšších hodnot lze použít v případech, kdy zvýšení
objemu zemních prací nadměrně zvýší ekonomickou náročnost řešení nebo by se nadměrně zvětšilo trvalé
odnětí kvalitní nebo chráněné zemědělské půdy", with fuel-consumption and safety assessed. Resultant grade
(longitudinal + cross) ≤ 13 % (14 % justified, 10 % with frequent icing), ≥ 1.0 % (0.5 % justified).
Radimský 2019 slide: the old "tabulka nejvyšších výsledných sklonů podle návrhové rychlosti a druhu území"
was abolished ([PDF](https://konference-projektovani.cz/wp-content/uploads/2022/03/9.pdf), search snippet).

Corroborating projects: II/157 Srubec S 7.5/80, grades **1.0–7.9 %**, vertical radii 2,100 and 3,300 m
(within S 7.5 mountainous 9 %); I/27 Klatovy built as **S 9.5/70 "v rámci úspor"** (lower design speed
chosen to save cost); Selibov class-I report 6.00 % max (research/12).

Changes vs the engine (norms.ts): road crest 90/80/70 **6000→5500, 3000→3300, 2500→2100**; sag
**3400→2700**, 2100 and 1500 unchanged; motorway crest 130/120/110 15,000/12,000/10,000 →
**17,000/11,500/8,300**, sag 5,000 → **6,000/5,000/4,000**; S 9.5 mountainous 7.5 → **8 %**; D 27.5 hilly
4 % (+ footnote b). Research/12's "not found" for these is superseded.

## 4. Side-hill sections and cutting earthworks on hilly routes

Sourced levers designers use:
1. **Steeper grade within the norm** — 2018 footnote ᵇ explicitly ties higher grades to excessive
   earthworks/farmland take; S 7.5 allows 7 % hilly / 9 % mountainous.
2. **Lower design speed** — I/27 Klatovy S 9.5/70 "v rámci úspor"; R49 drops to 80 km/h (R 500 m) at a
   landslide area; smaller radii and crest/sag curves follow the 70/80 columns.
3. **Composite and steep cut slopes in rock** (§1.3), steeper slopes on high-grade farmland (VL 2).
4. **Walls / reinforced soil** (§2): pile wall where a slope hits a building (I/33), reinforced embankment
   (VL 1 32-03), reinforced soil next to a bridge footing (D5).
5. **Side-hill fills** need benching of the ground on slopes > 10 % (VL 1 32-02), priced 225 CZK/m³.
6. Viaducts / half-bridges / galleries on Czech class I–III roads: **no quantitative public source found**
   (UNVERIFIED); bridges are already priced (research/16).

Earthwork intensity, m³ per km of route (cut / fill):

| Project | Terrain, category | Cut | Fill | Source |
|---|---|---:|---:|---|
| SPK CN 2026 norm allowance | class I / II / III / divided | 40 k / 20 k / 15 k / 70 k | 85 % of cut | research/00 |
| II/244 Přezletice–Mratín, 7.061 km | flat, S 9.5/80, max grade 2.73 % | **14.9 k** | 12.2 k | [CENIA EIA](https://portal.cenia.cz/eiasea/download/RUlBX1NUQzEwNTZfb3puYW1lbmlET0NfMS5wZGY/STC1056_oznameni.pdf) (105,046 / 86,151 m³) |
| R49 4902 Fryšták–Lípa, 15.2 km mainline (+3.4 km feeder) | hilly flysch, R 25.5/120, cuts ≤ 8–9 m, fills ≤ 9–10 m | **138 k** (113 k incl. feeder) | 125 k (102 k) | R49 study (2.1 M / 1.9 M m³; 40 % of cut unsuitable) |
| D11 Jaroměř–Trutnov, 19.63 km | foothills motorway | – | **115 k** | research/15 (2.26 M m³ fill) |
| I/27 Klatovy, 7.6 km | rolling, S 9.5/70 | – | deficit 68,863 m³ | I/27 EIA |

So: flat class II ≈ 15 k m³/km, hilly 4-lane ≈ 110–140 k m³/km. No hilly 2-lane class I total was found
(I/11, I/35, I/16: not found); the SPK class I allowance of 40 k sits between.

## 5. Stability measures on high fills / deep cuts — real prices

What the sources say is done: subsoil bearing/settlement check and "úpravy podloží" (VL 1 32-01); fills
> 3 m on soft ground get consolidation drains (D11 1107, R49), fills > 6 m in landslide ground counterweight
berms (R49), binder-treated fill in clayey material (D11 1107, R49: 40 % of cut unsuitable); cuts in weak
ground flattened to 1:2.5 with stabilising toe fill (R49); rock faces meshed/anchored (D8).

| Measure | OTSKP 2026 | CZK |
|---|---|---:|
| Fill placed from binder-treated soil vs plain (17113 vs 17110) | per m³ | 364.27 vs 89.60 (**+274.67**) |
| Subgrade treated with hydraulic binders, ≤ 0.5 m, 1–2 % (215661–3) | per m² | 190.67–261.89 |
| Crushed-stone columns (22452), excl. boring | per m³ | 1,566.55 |
| Benching the ground under fills, class I (12673) | per m³ | 225.20 |
| Rock mesh (289941) / SPOŽES rock-cut remediation | per m² | 2,513.47 / 4,300 |
| Vertical (wick) drains, settlement monitoring (02971 is "KPL" 0) | – | **not priced; UNVERIFIED** |

None of these scales with fill height as such: they scale with **subsoil and material** (soft/clayey
ground, landslide ground, unsuitable cut) and with **side slope**. The current 35 / 20 CZK per m³ per metre
above 6 m has no source and charges a 20 m fill on rock as if it were on loess.

## Game implications

| Mechanism | Proposal | Confidence |
|---|---|---|
| Fill slope | VL 1 2022 broken profile from the toe: 0–3 m 1:2.5; H ≤ 6: rest 1:1.5; H > 6: 3–6 m 1:1.75, above 1:1.5. Rock-fill (cut from class III used as fill) 1:1.5 above 3 m. | **High** (official MD detail + 2 teaching sources + project) |
| Fill benches | Drop the 2 m bench every 6 m. Optional counterweight berm (≥ 2.5 m, unsuitable material) only on mapped weak/landslide ground (D/Dk slope deposits, Fn floodplain, research/10). | High for "no default bench"; medium for berm trigger |
| Fill on cross-slope > 10 % | Step excavation 2.5–3.5 m steps, 5:1 risers, at 12673 225.20 CZK/m³ (class II/III variants by ground). | Medium-high |
| Soil cut slope (class I) | ≤ 2 m 1:2, 2–6 m 1:1.75, > 6 m 1:1.75 + 1 m bench at 6 m and every 6 m (I/27 precedent; interval PROVISIONAL). Weak ground (Sj claystone, Sf flysch, Dk): 1:2.5 (R49). | Medium (bands high; > 6 m rule provisional) |
| Weathered rock (class II) | Treat like soil but not flatter than needed: **1:1.5** PROVISIONAL (VL 2: "like soils after assessment"; field-road source allows 2:1). | Low-medium |
| Sound rock (class III) | Composite section: soil/weathered part as above, rock at **4:1** with **1.0 m benches every 5 m** (II/157, VL 2 301.07), face protection **2,513 CZK/m²** (OTSKP mesh) – 4,300 (SPOŽES, if anchors/plugs). | Medium |
| Retaining wall menu (Auto picks cheapest valid per stretch) | RC cantilever 2–8 m: face rate ≈ 7.0 / 8.5 / 11.6 / 14.8 k at 2/4/6/8 m (+1 k drain/excavation). Gabion ≤ 4 m: ≈ 4–7 k (D5 contract ≈ 20 k per m at 1–3.5 m). Reinforced soil (fills) 3–12 m: 2.4–7.5 k at 6 m. Soil nails (cuts, no groundwater) 4–10 m: 5.8–10.6 k. Anchored pile wall (cut next to a kept object, any height to ≈ 10 m): ≈ 25 k. All-in ceiling SPOŽES 39.1 k (≤ 5 m) / 44.6 k (> 5 m). | Component rates high; geometry PROVISIONAL → **low-medium** |
| Norm wall credit | First 200 m² of wall face per km is in the SPK road norm (100 m × 2 m) — do not bill it twice. | Medium (research/00 report text) |
| Vertical curves | Road crest 90/80/70 → 5,500 / 3,300 / 2,100; sag 2,700 / 2,100 / 1,500. Motorway crest 130/120/110 → 17,000 / 11,500 / 8,300; sag 6,000 / 5,000 / 4,000. Label "ČSN 73 6101:2018 (via ČVUT FD 12SDK 2023)". | Medium-high |
| Max grade | S 9.5: hilly 6 %, mountainous 8 %; S 7.5: 7 / 9 %; D 27.5: 4 / 4.5 %; multi-lane hilly up to 6 % via footnote ᵇ (a player override with a "more fuel / safety" note, not a violation). | Medium-high |
| Lower design speed | Offer 80/70 km/h with the 2018 radii (I/27 precedent "v rámci úspor"). | Medium |
| High-fill / deep-cut reserve | Replace 35/20 CZK/m³/m with mechanisms: binder-treated fill +274.67 CZK/m³ for cut that is unsuitable; subgrade treatment 190–262 CZK/m² under fills on Fn/Dk/peat/loess; rock face protection per m² in class III cuts. Keep a residual high-fill reserve only as a clearly-labelled PROVISIONAL item if at all. | Medium for items; low for any residual reserve |

## Open / unverified

- Exact ČSN 73 6133 bench and slope clauses (only the MD standard details and teaching reproductions seen).
- Typical maximum heights of gabion / reinforced-soil walls on Czech roads; Armovia (3,104 m² face) and
  D47 Ostrava reinforced-soil walls are leads only.
- Wick-drain and monitoring costs; galleries / half-bridges; hilly 2-lane class I earthwork totals.
- Geometry assumptions behind every derived wall face rate (base width, spacing, lengths).
