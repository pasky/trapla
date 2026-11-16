# ÚSES biocorridors, wildlife corridors and migration objects (TP 180)

Research snapshot 2026-11-16. Purpose: decide whether and how the engine should require a bridge or a large
frame where a new road crosses a mapped watercourse inside a regional/nadregional biocorridor (ÚSES) or a
large-mammal migration corridor. Builds on research/15 §4 (ÚSES screening), 15-followup (KHK endpoint) and 17
§2 (AOPK stream-crossing ecology, current "ecological frame floor"). All documents below were downloaded and
read (pdftotext) unless marked *search-result only*.

**Short version.** No Czech law or norm says "biocorridor → bridge of W × H". TP 180 (2006, still the only
edition) and the AOPK methodology give *recommended* dimension tables per animal category, and the ÚSES
methodology (2017) says dual-carriageway roads should keep biocorridors passable "preferably by bridges",
while two-lane roads need no grade-separated crossing. Real EIA conditions turn these into concrete
objects, e.g. a 3-span 50 m × 5.5 m bridge for a nadregional biocorridor on D3 0310. Regional and
nadregional ÚSES polygons are machine-readable for all four of our kraje, and the AOPK large-mammal corridor
layer is national, CC BY 4.0, and queryable. A sourced game rule is possible (see the end), with medium
confidence for the bridge-over-stream case and low confidence for the large-mammal tier.

## 1. TP 180 "Migrační objekty pro zajištění průchodnosti dálnic a silnic pro volně žijící živočichy"

Source: [TP 180, MD-OPK čj. 413/06-120-RS/2, effective 1 Aug 2006](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_180.pdf)
(EVERNIA 2006). The [ŘSD PJPK TP list](https://pjpk.rsd.cz/technicke-podminky-tp/) (checked 2026-11-16) still lists
only this edition (valid from 1. 8. 2006). **No newer edition exists.** AOPK published the
[draft basis for an update](https://aopk.gov.cz/documents/20121/18952986/3_V6_Podklady_pro_TP180.pdf/63381087-966d-3cb7-64ef-6d4e404a2916?t=1781009831127)
(TAČR CK03000086-V6, Feb 2026). It extends the categories to A–G and adds a "purpose code" and monitoring
preparation. It contains **no new dimension tables**. In its Table 1 (MPEA), "crossing a nadregional or regional
biocorridor" scores 0.8–0.6 for category G (terrestrial invertebrates and communities).

**Status.** TP are technical conditions of the MD, not law. TP 180 states (§4.3, note under Tab. 19):
*"nejsou … uvedené hodnoty dogmatem, ale pouze doporučením. Návrh řešení musí vycházet vždy z konkrétní
místní situace"*. Also §3.1(2): the quantitative limits are only "pomocné ukazatele".

**When objects are needed (which roads).** TP 180 does not list road classes. It decides by traffic (§3.3.1,
three categories):
- < 1 000 veh/day: only partial measures;
- 1 000–10 000: *"Při rekonstrukci nebo výstavbě nových úseků těchto silnic je třeba realizovat veškerá opatření
  pro usnadnění migrace fauny"*;
- > 10 000: *"Při výstavbě … je třeba aplikovat všechna dostupná opatření pro zajištění migrace"*.

Every new motorway and every new class I road with ≥ 1 000 veh/day falls in scope. The process is a
rámcová migrační studie in EIA (§4.3), then a detailed study in DÚR. An ecologist must rate all bridges and
culverts on the route, and suitable objects should have MP > 0.5 (§4.3 C).

**Animal categories** (Tab. 3): A large mammals (red deer, lynx, bear, wolf, wildcat, elk); B medium ungulates
(roe deer, wild boar); C medium carnivores (fox, badger, otter, beaver), *"využití a úprava řady trubních propustků,
kde je třeba zajistit především dostatečný pruh souše (1 m) podél převáděného vodního toku"*; D amphibians;
E whole ecosystems. AOPK 2020 refines these into A1/A2, B, C1–C5, D1–D2, E (fish), F (birds/bats), G.

**Object types** (Tab. 5/20): P1 pipe culvert, P2 frame culvert (*"do max. šířky 2,0 m"*), P3 multi-purpose bridge,
P4 special bridge (migration only), P5 large bridge ≥ 100 m; overpasses N1–N3.

**Dimensions** (§3.3.1 Tab. 4). Length *d* = distance the animal walks (bridge width between cornices / culvert
length). Width *š* = dimension along the road axis (bridge span at ground). Height *v* = clear height.
**Openness index I = š·v/d** (general form P/d).

Underpass recommendations, TP 180 §5.2 Tables 21–23 (MPTA = technical migration potential; geometric mean of the three):

| MPTA | width A / B / C (m) | height A / B / C (m) | index I A / B / C |
|---|---|---|---|
| 1.0 ideal | 60 / 45 / 5 | 20 / 15 / 3 | 40 / 20 / 0.5 |
| 0.8 sufficient | 45 / 30 / 2 | 10 / 7 / 2 | 15 / 7 / 0.2 |
| 0.5 mean | 30 / 20 / 1 | 7 / 5 / 1 | 7 / 3 / 0.05 |
| 0.2 "krajní hodnota" (lower acceptable bound) | 15 / 10 / 0.5 | 5 / 3 / 0.5 | 3 / 1.5 / 0.02 |
| 0.0 functionality limit | 7 / 4 / 0.3 | 3 / 2 / 0.3 | 1 / 0.7 / 0.01 |

Overpass (ecoduct) central width, Tab. 24: A 100/40/25/12/7 m, B 60/30/20/10/5, C 30/15/10/8/5 for MPTA 1.0/0.8/0.5/0.2/0.0.
Index C = b/d (edge width / length), Tab. 25: 2.32 / 1.33 / 0.66 / 0.33 / 0.16.

**Watercourse bridges and dry banks** (TP 180 §5.3–5.6):
- Culverts for water: usable for migration only if *"ponechat jeden nebo dva suché břehy, zajistit dno s přirozeným
  povrchem"*. Pipes for fox/otter Ø > 0.6 m. Otter culverts must be at least partly dry or have a side ledge.
- P3 bridge over a watercourse: *"dodržet pásy souše pro migraci nejlépe na obou, minimálně na jednom břehu vodoteče"*.
  Intended for medium animals, *"prostorový index má být v rozpětí 0,2–1,5"*. Over a small stream, widening the
  bridge *"o cca 2/3"* plus vegetation makes it a passage. *"Na toku nevytvářet stupně vyšší než 10 cm. Pokud jde o větší
  tok, musí být brána v úvahu migrace podél obou břehů."*
- P5 large bridge: *"Při překonávání vodního toku má na každé jeho straně zůstat pás nejméně 10 metrů pro zachování
  břehové vegetace"*. Usual minimum clear height for large bridges: **A ≥ 3 m, B ≥ 2.5 m**. For a vegetated
  underside a 10 m height is cited for roads.

**Spacing** (Tab. 19, maximum distance between migration objects, km; A / B / C): area category I (exceptional)
3–5 / 1.5–2.5 / 1; II 5–8 / 2–4 / 1; III 8–15 / 3–5 / 1; IV N / 5–8 / 1; V N / N / 1–3. Area categories
(Tab. 17) come from the AOPK 2001 *Metodická příručka*. The D11 1108 EIA review quotes that handbook as
**A: index > 10, spacing 8–15 km; B: index > 1.5, spacing 3–5 km; C: dry culverts from Ø 0.3 m, spacing 1 km**
([MZP196 posudek, p. 83](https://portal.cenia.cz/eiasea/download/RUlBX01aUDE5Nl9wb3N1ZGVrRE9DXzEucGRm/MZP196_posudek.pdf)).
TP 180 Tab. 11 gives functional nadregional/regional biocorridors an ecological potential of 1.0–0.8, which marks
them as the most important crossings.

**AOPK methodology** [Hlaváč et al., *Doprava a ochrana fauny v ČR*, AOPK 2020](https://www.ceson.org/document/AOPK_METODIKA_DOF_WEB-1.pdf):
- Index definitions p. ~14 (I = š·v/d; C = š/d). Tab. 10.13 (p. ~189), I for roe deer / red deer: ideal > 30 / > 40;
  practical optimum 7–30 / 8–40; mean 1.5–7 / 3–8; practical minimum 0.5–1.5 / 1–3; non-functional < 0.5 / < 1.
  Examples at d = 30 m: optimum 50×10, minimum 6×5 (roe) / 12×5 (red deer).
- **P3 bridge over a watercourse** (p. 194, Tab. 10.16): (1) 2–6 m span with I < 1.5, often a regulated channel, used by
  category C. **Dry banks on both sides of at least 50–100 cm**, frames/small bridges 50–60 cm. (2) **6–20 m span with
  I > 1.5: used by B, and by A at the upper end (A "za optimálních podmínek při I > 3")**. *"Vodní tok by … měl zůstat bez
  technického opevnění a s přirozenými břehy. Minimální šířka břehů by měla být 3–5 m."* (3) water from abutment to
  abutment: impassable; retrofit ledge 40–50 cm.
- p. 79: *"Mosty přes vodní toky tedy musí vždy obsahovat i suché břehy, pokud možno v přirozeném stavu."*
- **P5 special bridge** (p. 199): *"šířku min. 20 m, výšku min. 5 m a index otevřenosti min. 3"*. **P6 estakáda**
  (p. 201) and **P7 valley bridge** (p. 203): natural surface underneath, stream left natural, at least 50 m kept free for
  migration if ponds or other objects are placed under the bridge.
- **Spacing**, Tab. 6.3 (p. 94): large mammals: **a passage on every mapped migration corridor** of the
  "biotop velkých savců" layer, and every **3–5 km** inside core areas (forests). Roe deer 2–5 km; fox/badger 0.5–1 km.
  Obr. 6.62: *"Průchody pro velké savce jsou v ČR navrhované na základě vrstvy ÚAP »Biotop vybraných zvláště chráněných
  druhů velkých savců«."*
- AOPK SPPK E02 003 (otter, research/17): ledge 40 cm, minimum 25 cm, ~10 cm above ordinary water.

**"Migračně významná území" (MVÚ) and "dálkové migrační koridory" (DMK).** Anděl, Mináriková & Andreas 2010
defined MVÚ and DMK (~500 m wide). [Pešout, Hlaváč, Chobot, *Ochrana přírody* 3/2018](https://www.casopis.ochranaprirody.cz/pravo-v-ochrane-prirody/ochrana-biotopu-ohrozenych-druhu-v-uzemnim-planovani-ii/)
says they were **replaced from 2018** by ÚAP phenomenon **36b "Biotop vybraných zvláště chráněných druhů velkých
savců"**. It has three parts: core areas (≥ 300 km²), migration corridors (recommended width ~500 m) and critical
places (mapped at 1:10 000). In corridors, land uses that limit their function are restricted, *"např. … nezabezpečených,
tedy migračně nepropustných dopravních staveb"* (limit type B). MVÚ/DMK still appear in older EIAs and studies
(see the D35 study, §4).

## 2. ÚSES: what is required where a road crosses a biocorridor

**Law.** [Zákon 114/1992 Sb. §4(1)](https://www.zakonyprolidi.cz/cs/1992-114): ÚSES is delimited by spatial-planning and
nature-protection authorities. *"Ochrana systému ekologické stability je povinností všech vlastníků a uživatelů
pozemků tvořících jeho základ; jeho vytváření je veřejným zájmem."* Watercourses and floodplains are significant
landscape features (VKP, §3(1)b), so a road crossing a stream needs the nature authority's consent (§4(2)). Regional
and nadregional ÚSES are fixed in ZÚR, local ÚSES in ÚP; in planning they are limits on land use. **No statute or
decree prescribes a crossing structure or its dimension.** That is decided case by case in EIA/DÚR conditions.

**[Metodika vymezování ÚSES](https://opzp.cz/files/documents/storage/2024/07/17/1721201950_Metodika%20vymezovani%20USES_2017.pdf)
(MŽP/AOPK 2017), ch. 10.2.3 "Stavby dopravní infrastruktury", pp. 88–89:**
- *Motorways and other multi-lane roads:* *"vždy třeba pečlivě zvažovat nezbytnost mimoúrovňových křížení … ve vazbě na
  jejich efektivitu. V prvé řadě je … vhodné využívat stávajících nebo plánovaných mostů, přičemž nejvhodnější jsou
  dálniční mosty umožňující průchod biokoridoru podmostím bez omezení jeho šířky."* Bridges over the motorway are
  *"zcela nevyužitelné"* for water, floodplain and wetland branches. Without a suitable bridge, the allowed options
  are (a) a suitably placed culvert, which gives a limited link for **local** floodplain/wetland biocorridors, or
  (b) accepting the spatial interruption of the biocorridor by the motorway.
- Footnote 29: special ecoducts (overpasses or underpasses) for biocorridors are *"opodstatnitelné pouze tehdy, slouží-li
  … i pro migraci velkých savců, a to v trasách evidovaných dálkových migračních koridorů, případně pro nadregionální
  biokoridory umístěné v evidovaném migračně významném území"*.
- Nadregional/regional biocentra must not overlap motorways, except floodplain meadow or wetland biocentra *"za
  podmínky existence … dostatečně kapacitního přemostění nivy"*.
- *Two- and one-lane roads:* *"polopropustné bariéry. Pro zachování funkční spojitosti ÚSES tedy nejsou nutná
  mimoúrovňová křížení a jiná speciální nákladná opatření."* Footnote 31: grade separation *"lze doporučit v případě
  biokoridorů nivních a mokřadních větví ÚSES … nejlépe formou dostatečně kapacitních mostů silnice přes vodní tok
  a navazující partie údolního dna"*. Crossings should be as close to perpendicular as possible. Longitudinal splitting
  of a biocorridor by a road is undesirable.
- **No maximum interruption length is given in the 2017 Metodika.** It sets biocorridor min widths (§7.1.2:
  NRBK/RBK forest 40 m, RBK wetland 40 m; local forest 15 m, wetland 20 m; a water NRBK is as wide as the stream) and
  max lengths (§7.1.3: RBK 8 000 m, partial sections forest 700 m / wetland 1 000 m; local 2 000 m).
- **Interruption limits exist only in the older methodology** (Löw et al. 1995, *Rukověť projektanta místního ÚSES*),
  quoted in [Maděra & Zimová (eds.), *Metodické postupy projektování lokálního ÚSES*, MZLU, §10.4.2](http://www.forumochranyprirody.cz/sites/default/files/20.pdf).
  Local biocorridors: forest max 2 000 m with interruption **≤ 15 m**; wetland interruption ≤ 50 m paved / 80 m arable /
  100 m other; meadow ≤ 1 500 m. **Regional:** forest max 700 m with a break in forest cover ≤ 150 m; wetland max 1 000 m with
  interruption **≤ 100 m built-up**, 150 m arable, 200 m other. The same figures appear in current local plans (e.g. Plán
  místního ÚSES ORP Chrudim, *search-result only*) and in ČVUT lecture slides. They limit the **delimitation of the
  corridor**. They are not a rule that a road body must be bridged. A dual carriageway (~30–50 m including slopes)
  would exceed the 15 m local-forest limit but not the 100 m regional-wetland one.
- AOPK 1995 *"Metodika křížení komunikací a vodních toků s funkcí biokoridorů"* exists (listed in the AOPK 2020
  bibliography p. 293). **Not found online; UNVERIFIED content.**
- The related TP 181 *"Hodnocení průchodnosti území pro liniové stavby"* (2006) is listed by PJPK and was not read.

## 3. Data: machine-readable ÚSES and large-mammal corridors

All tested 2026-11-16 with curl, EPSG:5514 envelope queries for the scenario rectangles.

| Dataset | Endpoint | Licence | Test |
|---|---|---|---|
| **KHK ZÚR regional + nadregional ÚSES** (d11, i16) | `https://services6.arcgis.com/ogJAiK65nXL1mXAW/arcgis/rest/services/Nadregion%C3%A1ln%C3%AD_a_region%C3%A1ln%C3%AD_%C3%9ASES_vymezen%C3%BD_v_Z%C3%9AR_KHK/FeatureServer/0/query` | CC0 (15-followup) | i16 bbox → 24 features (RBC/RBK) ✔ |
| **Středočeský ZÚR ÚSES, 3rd update 2023** (d3*) | `https://gis.kr-stredocesky.cz/wagisas01/rest/services/OZP/OZP_OPK_USES/MapServer/{23 NRBC, 24 NRBK, 25 RBC, 26 RBK}/query` | "© AOPK ČR 2023, © OŽP KÚSK 2023", **licence not stated** | d3-full bbox → 2 NRBC, 5 NRBK, 14 RBC, 24 RBK ✔ (fields TYP, OZNACENI, NAZEV, PLATI_OD 2023-11-09) |
| **Pardubický ZÚR ÚSES, 4th update** (d35, d35-full) | `https://services.arcgis.com/S6UQzkU4EoJgYA53/arcgis/rest/services/USES_ZUR_p/FeatureServer/7/query` ([item 13e5d136…](https://data.pardubickykraj.cz/datasets/13e5d13688874e7594c95bd4da80e242_7/explore)) | CC0 (item licenseInfo). The kraj's [SHP page](https://www.pardubickykraj.cz/vrstvy-ve-formatu-shp) also offers a SHP | d35-full bbox → 21 features; `f=geojson&outSR=5514` for d35 → 13 ✔ (same schema as KHK: Typ, Oznaceni, nazev) |
| **Olomoucký ZÚR ÚSES + "Migrační koridory"** (d35-full east end) | `https://gisint.kr-olomoucky.cz/int/rest/services/portal_UP/ZUR_Vykres_USES/MapServer` layers 0 (DRUH_USES NRBC/NRBK/RBC/RBK), 5 (migration corridors) | **not stated** | `/query` → error 400 "not supported" ✘; `/identify` with an envelope and `returnGeometry=true` → 14 ÚSES + 1 corridor (MK1) with geometry ✔ |
| **AOPK biotop velkých savců** (core / corridor / critical place; replaces MVÚ/DMK) | REST `https://gis.nature.cz/arcgis/rest/services/AplikovanaOchrana/MigraceSavci/MapServer/0/query`; SHP `https://data.nature.cz/ds/53/download` (b_zchdvs.zip, 4.8 MB) | **CC BY 4.0**, "(c) AOPK ČR" ([data.nature.cz/ds/53](https://data.nature.cz/ds/53)) | d35 bbox → 3 (critical place "Staré Město", 2 corridors) ✔; TYP_BVS 1 = jádrové území, 2 = migrační koridor, 3 = kritické místo (from service renderer); flags DALNICE/SILNICE/… |
| AOPK national nadregional biocentra (2023) + full ÚSES inside CHKO | `https://gis.nature.cz/arcgis/rest/services/ObecnaOchrana/USES/MapServer/{0..6}` | © AOPK ČR (open data, [sds/20](https://data.nature.cz/sds/20)) | d3-full → 2 NRBC (Cunkovský hřbet, Štěchovice) ✔ |
| AOPK ÚTP ÚSES ČR 1996 (national NR+R polygons / axes; old, superseded by ZÚR) | `https://data.nature.cz/ds/112/download` (uses_1996_pl, 3 986 polygons), `/ds/113/download` (axes) | CC BY 4.0 | intersects every pack (d11 24, d3-full 39, d35-full 11, i16 15). Fallback only |
| AOPK ecoduct database (overpasses only, 36 objects, TP 180 categories, width/length) | `https://gis.nature.cz/arcgis/rest/services/AplikovanaOchrana/Ekodukty/MapServer/0` ([ds/146](https://data.nature.cz/ds/146)) | not stated on the page | full query ✔ |

Not verified: Praha (d3-0301 north end; IPR Praha geoportal ÚSES) and Jihočeský (geoportal.kraj-jihocesky.gov.cz
"Data ze ZÚR", SHP) in case a D3 rectangle crosses those borders.

**Cached KHK file** (`pipeline/cache/uses-khk.geojson`, EPSG:5514, inspected with `uv run python`): 47 Polygons, all
in the d11 rectangle. **Typ: RBC 19, RBK 19, NRBK 9, no NRBC.** Fields: Kraj, Kraj_kod 86, Plati_od 2021-04-16,
RC_ZUR 641, CasH, Typ, Vloz_BC, Oznaceni, Jev A021, Pasport_Id, Zdroj "ÚZ ZÚR po vydání změn č. 1,2,3,4,5",
Dat_Aktual 2021-06-21, Poznamka, OBJECTID. Bbox x −640 582…−611 487, y −1 025 083…−985 299. NRBK axes: K 28 H,
K 28 MB ×5, K 29 H, K 36 MB, K 37 MB. In the 2017 Metodika's typology, MB = mezofilní bučinná; H is probably horská
(**inference**). Biocentra are named (e.g. 1195 Liškárna, H028 Břecštejn).

Overlaying the d11 OSM watercourses (`pipeline/cache/osm_watercourses_v1.json`) puts streams inside **every RBK/NRBK**.
Examples: Úpa in NRBK K 28 MB / K 36 MB / RK 724/2 / RK H007; Ličná in RK 723/1 and RK H010; Dřevíč and Jívka in NRBK
K 37 MB. Many corridors follow valleys, so a "stream inside corridor" test would fire on several crossings per route.

## 4. Czech examples

- **D3 0310 Úsilné–Hodějovice–Třebonín** ([EIA závazné stanovisko 2017](https://portal.cenia.cz/eiasea/download/RUlBX09WMjAwMVhfemF2YXpuZVN0YW5vdmlza29ET0NfNTYzODE0NDg1MTA2NTQ0OTQwOC5wZGY/OV2001X_zavazneStanovisko.pdf)):
  *"migrační objekt SO 208 Dálniční most přes biokoridor v km 143.876. Jde o třípolový most šířky 50 metrů s výškou cca.
  5,5 metru"*. It carries the motorway over **NRBK**, with I ≈ 50·5.5/~30 ≈ 9 (d assumed for D 27.5; **inference**). Also an
  ecoduct (overpass with forest track) for a **local** biocorridor. Conditions: frame culverts (one 2 × 2 m) built "v
  souladu s TP 180, tj. alespoň po jedné straně toku ponechat pás souše"; a pipe culvert at km 132.48 replaced by a frame
  with a bank ledge. The ground under every bridge must be unpaved except the carried roads.
- **D35 Staré Město–Mohelnice** (inside d35-full) ([DÚR 2019 migration-object comparison, VPÚ DECO](https://www.maletin.cz/e_download.php?file=data/editor/132csabove_2.pdf&original=Migra%C4%8Dn%C3%AD%20studie.pdf)).
  Width × mean height × passage length 29.1 m, as given in the document:
  SO 202 over Bílý potok 120 × 10.5–14.4 m (local corridor; EIA asked 100 × 15);
  SO 203/204 Starý Maletín valley 120 × 8.6–17.2 (**DMK**; EIA 160 × 21);
  SO 206/207 "přes přeložku lesní cesty a biokoridor" 60 × 8.7–11.5 (MVÚ; EIA 40 × 13);
  SO 207/208 Skalník 222 × 9.9–35.5 (DMK); SO 210/211 744 × 37 (DMK); SO 208/209 20 × 5 × 44 m long, I ≈ 2.3 (MVÚ);
  Maletín tunnel lengthened 1 100 → 1 413 m (DMK). An earlier list names *"SO 204 Most na D35 v km 3,403 pro migraci velkých
  živočichů"*. Smallest accepted underpasses in MVÚ: 20 × 5 m.
- **D11 1108 Jaroměř–Trutnov** ([EIA posudek 2011](https://portal.cenia.cz/eiasea/download/RUlBX01aUDE5Nl9wb3N1ZGVrRE9DXzEucGRm/MZP196_posudek.pdf)):
  route "z větší části na migračně významném území". 63 migration profiles were rated (49 underpasses, 13 overpasses,
  1 tunnel). Conditions required checking an **ecoduct for RBK 750** (km 121.45) and for **NRBK K37 Les Království**
  (km 126), and "každou terénní depresi propustem osadit".
- **D11 1109 Trutnov–state border** ([MD decision 2022 via obec Královec](https://www.obeckralovec.cz/assets/File.ashx?id_org=276&id_dokumenty=2594)):
  bridges explicitly "přes … biokoridor": SO 203 (26+33+26 = 85 m), SO 205 (232 m), SO 211 (35 m single span, biocorridor
  + local road), SO 214 (190 m, local biocorridor + stream), SO 215 Ličná valley (60+85+4×120+85 = 710 m; rail, river, road,
  biocorridor). These are valley bridges that also pass corridors. They are not built solely for ÚSES.
- **Overpass (ecoduct) database** (AOPK, §3), centre width × length: D1-133A Kamenice 40 × 110 m (A, 2021); D1-209A Říčany
  40 × 100; D1-397 Kletné 40 × 62; D11-055 Žehuň 35 × 68 (A, 2007); D11-078 Voleč 37 × 80; D3-132 Planá n. L. 17 × 52 (A);
  D3-141 Košice 20 × 60; D35-158A Dolní Újezd 47 × 80 (B, 1999); D0-171 Jesenice 32 × 70.

## Unknowns

- The text of the AOPK 1995 *Metodika křížení komunikací a vodních toků s funkcí biokoridorů* (UNVERIFIED).
- Licences for the Středočeský and Olomoucký services are not stated (© only).
- TP 180 values are recommendations; actual objects come from EIA migration studies. Large-mammal objects are sized for
  the specific profile and are often larger than any minimum (D35: 60–744 m).
- No cost premium for "ecological" bridges beyond ordinary bridge rates was found.

## Game implications

**Proposed rule (Auto design, motorways and new dual carriageways; TP 180 > 10 000 veh/day; ÚSES Metodika
"vícepruhové silnice"):**

1. **Our road crosses a mapped watercourse inside a ZÚR RBK/NRBK or RBC/NRBC polygon → bridge, not a culvert or frame.**
   The natural bed stays and dry natural banks remain on both sides.
   - Clear span W ≥ channel width + 2 × 3 m banks, and W ≥ 10 m.
   - Clear height H ≥ 3 m.
   - Openness I = W·H / d ≥ 1.5, with d = deck width between cornices (~30 m for D 27.5 → W·H ≥ 45 m²).
   - Sources: AOPK 2020 P3 variant 2 (span 6–20 m, I > 1.5, natural banks 3–5 m, unregulated channel); TP 180 Tab. 21–23
     category B "krajní hodnota" (10 m / 3 m / I 1.5); TP 180 §5.4 (dry strips on both banks); ÚSES Metodika 2017
     pp. 88–89 (bridges preferred for multi-lane roads). Real objects of this scale: D35 SO 208/209 20 × 5 m;
     D3 SO 208 50 × 5.5 m. **Confidence: medium.** The type (bridge with natural banks) is well supported; the floor
     values are TP 180 / AOPK lower acceptable bounds, not mandated minima. Keep it a design floor that the player can
     override (overriding creates a violation tagged "norm: TP 180 / AOPK recommendation").
2. **The crossing is inside an AOPK "biotop velkých savců" migration corridor or critical place (TYP_BVS 2/3), or an NRBK
   inside one → category-A object.** W ≥ 20 m, H ≥ 5 m, I ≥ 3 (AOPK 2020 P5 minimum, = TP 180 MPTA ≈ 0.5 for B /
   ≈ 0.2 for A). This applies whether or not a stream is present, once per corridor crossing (AOPK Tab. 6.3: a passage
   on every mapped corridor). In a cut, the alternative is an overpass with central width ≥ 12–25 m (TP 180 Tab. 24, A 0.2–0.5).
   **Confidence: low–medium.** Real DMK objects are far larger (D35: 120–744 m valley bridges). Ecoducts are justified
   only for DMK/NRBK-in-MVÚ (Metodika 2017 fn. 29). Implement after tier 1, as a violation with a computed fix (a
   bridge of that size at the station) rather than silently re-grading the line.
3. **Two-lane class I/II roads (i16-nova-paka): no grade-separation mandate** (Metodika 2017: "nejsou nutná
   mimoúrovňová křížení"). Keep the existing ecological frame floor, but require **dry banks on both sides ≥ 0.5 m**
   (AOPK 2020 p. 194 variant 1: 50–100 cm; TP 180 category C: 1 m dry strip) where the stream is inside RBK/NRBK.
   Optional, low confidence: a short bridge for floodplain/wetland branches (fn. 31), but our data has no branch type
   for regional corridors.
4. A biocorridor crossed without a watercourse needs no structure (accepted interruption, Metodika 2017 option (b)),
   except under tier 2. Do not use the 1995 interruption lengths (15 / 100 m) as a road rule: they constrain how the
   corridor is drawn, not the road.

**Getting the data into packs.**
- Generalize `pipeline/fetch_uses.py` to a list of sources per scenario:
  - d11 and i16 → KHK FeatureServer;
  - d3, d3-030x, d3-full → Středočeský MapServer layers 23–26 (plus IPR Praha / Jihočeský if a rectangle crosses the border);
  - d35 → Pardubický FeatureServer 7;
  - d35-full → Pardubický + Olomoucký via `identify` (no query capability).
- Add the national AOPK large-mammal layer (MigraceSavci REST or the ds/53 SHP, CC BY 4.0) for every pack. Keep the AOPK
  1996 ÚTP as a fallback only.
- Normalize to {level: NR/R, kind: biocentrum/biokoridor, id, name, source, valid_from}, clip to the bbox, simplify
  (~5 m) and store as small polygon lists in the pack. KHK d11 was 0.49 MB raw.
- Test only at stream-crossing stations (point-in-polygon at the culvert/bridge site, precomputed per watercourse
  segment). That costs nothing on drags.
- Each crossing card should say why: "Bridge: stream in regional wildlife corridor (RK 723/1)". It must not use
  internal codes; use `terms.ts` vocabulary. The ÚSES layer also needs a COST_MODEL_VERSION bump and eval-regression
  review, because it moves bills on d11 (Úpa, Ličná, Dřevíč crossings).
