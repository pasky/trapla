# Trapla — what "real-world" is easily doable (feasibility map)

*Synthesis written 2026-11-13. Czech-first, Europe/global as fallback.*

Detailed per-topic reports from research subagents are in `01`–`06`. This file supersedes them where they
conflict: it adds direct probes and primary-source extractions made afterwards (marked **[probed]**).
Anything not marked that way comes from the sub-reports and was not independently re-checked.
The sub-reports' own "checked on" dates were wrong and have been corrected to 2026-11-13.

## 1. Bottom line

Czechia is close to a best case for this game. Three of the four hard ingredients are open, free and
machine-readable:

| Ingredient | Status | Why |
|---|---|---|
| (a) Terrain | **Easy** | Bare-earth LiDAR DTM (DMR 5G), CC BY 4.0, on-demand 2 m float rasters without login **[probed]** |
| (c) Costs | **Easy** | Official SFDI per-km norms and itemised OTSKP unit prices, free XLSX/XML, 2026 price level **[probed]** |
| (b) Norms | **Medium** | Standards are paywalled, but the key tables are reproduced in public lecture material; the rest is physics |
| Surface constraints (land cover, buildings, protection) | **Easy–medium** | ZABAGED / RÚIAN / cadastre / orthophoto are open (CC BY 4.0); protection and flood layers vary by provider |
| Geology | **Medium** | Queryable 1:50k services exist, hazards are open data; bulk redistribution of the main map is unclear |
| Official route to beat | **Medium–hard** | No open vector data of planned alignments; PDF leaflets + partial OSM → digitise per scenario |
| Demand / benefit scoring | **Medium** | Segment AADT (traffic census) and the official CBA methodology are free; no public OD matrices |

## 2. Terrain

| Source | Type | Resolution | Accuracy | License | Role |
|---|---|---|---|---|---|
| ČÚZK **DMR 5G** | bare-earth DTM (LiDAR 2009–13) | irregular TIN; served as 2 m raster | 0.18 m open / 0.30 m forest (stated) | CC BY 4.0 | **primary** |
| ČÚZK DMR 4G | bare-earth DTM | 5 m grid | 0.3 m open / 1 m forest | CC BY 4.0 (re-check) | lighter alternative |
| ČÚZK DMP 1G | surface model (canopy, roofs) | 1 m | 0.4 m on hard objects | re-check | canopy/building height = DMP − DMR |
| Copernicus GLO-30 | **DSM** | ~30 m | LE90 < 4 m, plus canopy bias | free, attribution | outside CZ, screening only |
| Sonny's Europe DTM | LiDAR-derived DTM compilation | ~20×30 m | varies | CC BY 4.0 | Europe fallback, bare-earth |
| FABDEM | ML bare-earth | ~30 m | better than GLO-30 | **CC BY-NC** | not usable commercially |
| SRTM (the 2019 prototype here) | DSM | ~30 m | ≤ 16 m spec | public | obsolete for this purpose |

**[probed]**
- `https://ags.cuzk.gov.cz/arcgis2/rest/services/dmr5g/ImageServer` — no login.
  - `identify` at 50.896 N, 15.006 E returned 310.425 m.
  - `exportImage?...&format=tiff&pixelType=F32` returned a 1000×1000 px float TIFF for a 2×2 km box (4.1 MB).
    Service limits: 15000×4100 px per request (≈ 30×8 km at 2 m), native pixel size 2 m.
- ATOM feeds `atom.cuzk.gov.cz/{DMR5G,DMR4G,DMP1G}-SJTSK/*.xml` all answer HTTP 200 (≈ 24 MB index each).
- CRS is S-JTSK (EPSG:5514) with Bpv heights (EPSG:8357) — not interchangeable with WGS84/EGM heights.

Sizing (my arithmetic, uncompressed Float32): a 50×50 km scenario is 2.5 GB at 2 m, 0.4 GB at 5 m, 0.1 GB at
10 m. All of Czechia is ≈ 79 GB at 2 m, ≈ 13 GB at 5 m.

Forest vs field: with a DSM (SRTM, Copernicus) forest reads 10–30 m too high, which wrecks cut/fill
volumes. With DMR 5G that problem disappears — the cost is only the slightly worse accuracy under canopy
(0.3 m). Other countries with open ≤ 1–2 m LiDAR DTMs: SK, PL, DE (per state), AT (per state), CH, NL, DK,
England, FR, ES, NO, FI, USA (see `01-terrain.md`; licences there are only partly verified).

## 3. Costs

### 3.1 SFDI "Cenové normativy" (SPK CN) 2026 **[probed]**

Source: `https://sfdi.gov.cz/cenove-databaze/spk-cn/` (ZIP with XLSX/XML; extracted table saved as
`data/spk-cn-2026-oceneni.csv`). Prices are 2026 level, excl. VAT. Columns: technological minimum / defined
standard / technological maximum. Selected rows, "defined standard", CZK million:

| Object | Flat + hilly | Mountainous |
|---|---:|---:|
| Motorway D 27.5, per km | 187.6 | 214.5 |
| Motorway D 25.5, per km | 174.0 | 198.7 |
| Motorway D 33.5 (6-lane), per km | 228.6 | 261.8 |
| Class I road S 11.5, per km | 68.9 | 82.2 |
| Class I road S 9.5, per km | 56.9 | 68.0 |
| Class II road S 7.5, per km | 36.1 | 41.4 |

| Structure | CZK million | Derived |
|---|---:|---|
| Motorway bridge D 27.5, per km | 1,495 | ≈ 54,400 CZK per m² of deck; ≈ 8× the at-grade km |
| Road bridge S 11.5, per km | 692 | ≈ 60,200 CZK per m² |
| Bored 2-lane tunnel tube, rural, > 500 m, per km | 1,550 | motorway needs two tubes → ≈ 3,100; ≈ 16× the at-grade km |
| Cut-and-cover 2-lane tube, rural, > 500 m, per km | 1,666 | covers max. 5 m of overburden |
| Bored 2-lane tube, urban, > 500 m, per km | 2,296 | |
| Wildlife overpass (biomost), per m² | 0.0482 | |
| Grade-separated interchange (class I roads only), each | 76.7 | |

On top of these, "other objects" are added as percentages: **+30.6 %** rural, **+49.3 %** urban
(preparatory works, water structures, utilities, safety measures, technology, landscaping).

What the per-km road norm already contains (from the accompanying report):
- earthworks at a "standard" vertical alignment: **70,000 m³ of cut per km** for divided roads, 40,000 for
  undivided class I, 20,000 for class II, 15,000 for class III; fill assumed at 85 % of cut;
- excavability mix 75 % class I, 20 % class II, 5 % class III;
- 15 % unsuitable material hauled to landfill within 10 km and replaced from a borrow pit within 10 km;
- retaining walls up to 100 m per km and 2 m high; pavement; topsoil handling.

Not contained: foundations in undermined, unstable or landslide ground (priced separately as "expert
adjustment"). Railway objects are priced by a separate SŽ compendium (SPOŽES) — not examined.

This gives a natural cost model: norm price per km, plus or minus the earthwork volume difference against the
included allowance priced at OTSKP rates, plus bridges and tunnels by length.

### 3.2 OTSKP 2026 unit prices **[probed]**

Source: `https://sfdi.gov.cz/cenove-databaze/otskp/` (ZIP; item list XLSX has ≈ 35,900 rows). CZK, excl. VAT.

| Code | Item | Unit | Price |
|---|---|---|---:|
| 12110 | Topsoil stripping, haul ≤ 1 km | m³ | 83 |
| 12273 | General excavation, class I, haul ≤ 1 km | m³ | 183 |
| 12283 | General excavation, class II | m³ | 391 |
| 12293 | General excavation, class III | m³ | 653 |
| 12273B | Haulage of soil | m³·km | 19.64 |
| 122738 | Excavation class I incl. haul ≤ 20 km | m³ | 556 |
| 17110 | Placing fill with compaction (95–100 % PS) | m³ | 90–116 |
| 17180 | Fill from purchased material | m³ | 636 |
| 17120 | Dumping without compaction | m³ | 21 |
| 014101 | Landfill fee | m³ | 0 (project-specific) |
| 18220 | Spreading topsoil on slopes | m³ | 275 |
| 144113 → 144611 | Tunnel excavation, full face, class TT1 (blasting) → TT5B | m³ | 2,265 → 4,973 |
| 42333 | Prestressed concrete box-girder superstructure | m³ | 19,883 |
| 224325 | Reinforced concrete piles C30/37 | m³ | 6,066 |
| 21450 | Remediation layer of aggregate | m³ | 905 |
| 581152 | Concrete pavement, class I, ≤ 250 mm | m² | 1,368 |
| 11201 | Tree felling incl. stump, trunk ≤ 0.5 m | each | 1,589 |

Useful ratios: rock costs 3.6× soil to excavate; hauling 10 km roughly doubles the price of a soil cut;
tunnel excavation alone spans 2.2× between the best and worst rock class.

### 3.3 Real awards and land

- Sub-report `05`: 2024 motorway awards range 212–686 million CZK/km (D35 Janov–Opatovec to D1
  Říkovice–Přerov), excl. VAT. Consistent with the norm above (187.6 + 30.6 % ≈ 245 for at-grade, more with
  bridges).
- ŘSD also publishes bid prices for ≈ 1,460 projects (`rsd.cz/technicke-dokumenty/cenove-databaze`) — not examined.
- Land purchase under Act 416/2009 §3b: **8×** the appraised price for non-building land, **1.5×** for
  building land and buildings (confirmed by several legal summaries in a web search; statute text not read).
- No open parcel-level market price data. Proxies: decree base prices of farmland per cadastral area, BPEJ
  soil class. Fees for removing farmland (BPEJ-based) and forest land exist but rates were not extracted.

## 4. Design norms

Access: ČSN 73 6101 (roads), 73 6360-1 (track geometry) etc. are paid (ČSN Online, 10,000 CZK/year per
sub-report `04`). ČSN 73 6110 (urban roads, 2006) is public. Ministry "TP" documents are free at
`pjpk.rsd.cz`. EU TSI INF is free. The SŽ high-speed-rail manual is readable but marked internal.

### 4.1 Roads — ČSN 73 6101, 2018 revision **[probed]**

Source: M. Radimský (VUT, co-author of the revision), conference slides 2019,
`konference-projektovani.cz/wp-content/uploads/2022/03/9.pdf`.

Design speed by category: D 33.5 / D 27.5 / D+S 26.0 / D+S 25.5 → 130 km/h; S 24.5, D+S 21.5, S 15.25 → 110;
S 20.75, S 13.5, S 11.5, S 9.5, S 7.5, S 6.5 → 90; S 4.0 → 30. May be lowered by 10 or 20 km/h where justified.

Minimum horizontal radius (m) by superelevation:

| vn km/h | 2.5 % | 3 % | 4 % | 5 % | 6 % | No superelevation needed |
|---:|---:|---:|---:|---:|---:|---:|
| 130 | 1,650 | 1,540 | 1,310 | 1,080 | 840 | 2,420 |
| 120 | 1,400 | 1,300 | 1,100 | 900 | 690 | 2,060 |
| 110 | 1,150 | 1,070 | 900 | 730 | 560 | 1,740 |
| 100 | 950 | 890 | 750 | 610 | 470 | 1,440 |
| 90 | 570 | 540 | 480 | 420 | 355 | 1,160 |
| 80 | 450 | 430 | 380 | 330 | 280 | 920 |
| 70 | 350 | 330 | 290 | 250 | 205 | 705 |
| 60 | 250 | 240 | 210 | 185 | 160 | 515 |
| 50 | 175 | 170 | 150 | 130 | 110 | 360 |

Also from the slides: minimum transition-curve length = the larger of vn metres and the superelevation
runoff length; resultant slope between 1 % (exceptionally 0.5 %) and 13 % (10 % in frost-prone areas); radii
must additionally satisfy stopping sight distance.

### 4.2 Roads — older edition values (not confirmed for 2018)

Source: VUT FAST teaching text "Aplikace ČSN 73 6101" (`fce.vutbr.cz/pko/sad/pdf/aplikace.pdf`), which uses
the pre-2004 categories with a 120 km/h maximum; and `dalnice-silnice.cz/parametry.htm` (2005).

| Category | Max gradient: flat | hilly | mountainous |
|---|---:|---:|---:|
| Motorway D | 3 % | 4 % | 4.5 % |
| S 24.5 (4-lane road) | 3.5 % | 4.5 % (6 %) | 6 % |
| S 11.5 / S 9.5 | 4.5 % | 6 % | 7.5 % |
| S 7.5 / S 6.5 | 4.5 % | 7 % | 9 % |

| Vertical curve radius (m) | 120 km/h | 100 | 80 | 70 | 60 |
|---|---:|---:|---:|---:|---:|
| Crest, minimum allowed (stopping) | 11,000 | 6,000 | 3,000 | 2,500 | 1,500 |
| Sag, minimum allowed | 5,000 | 3,400 | 2,100 | 1,500 | 1,000 |

Motorway interchanges at least 5 km apart (may be halved near large agglomerations).

Still missing for roads: 2018 gradient and vertical-curve tables (incl. 130 km/h), cross-section component
widths, standard cut/fill slope ratios, climbing-lane rule.

### 4.3 Railways **[probed]**

Source: VUT FAST railway lecture notes (O. Plášek), `fce.vutbr.cz/zel/plasek.o/studium/` files 2 and 5,
citing ČSN 73 6360-1 and Decree 177/1995.

- Equilibrium cant: D_eq = 11.8 · V² / R (mm; V km/h, R m).
- Cant: limit 150 mm (120 mm on heavily loaded lines), maximum 160 mm for R ≥ 290 m.
- Cant deficiency: standard 80 mm, limit 100 mm, maximum 130 mm (150 mm passenger trains) up to 230 km/h;
  for 250–300 km/h standard 60, limit 80, maximum 130 mm.
- Minimum radius: 500 m for new national-line earthworks (decree); norm limit 300 m, minimum 190 m;
  regional lines down to 150 m.
- Gradient: should not exceed 40 ‰ overall; the ruling gradient is set per line by traffic.
  EU TSI INF allows 35 ‰ on high-speed passenger lines for at most 6 km (sub-report `04`).
- Vertical curve radius: Rv ≥ 0.40 · V² (limit), ≥ 0.25 · V² (minimum), never below 2,000 m for V ≥ 80 km/h.
- Constant-gradient sections at least 4 · V metres long (minimum 200 m).
- Track spacing 4.0 m on open line for V ≤ 160 km/h; single-track formation width 6.0–6.2 m.

Derived by me from the formula and limits above (not table values): R ≈ 11.8 V² / (D + I) with 150 + 100 mm
gives ≈ 1,210 m at 160 km/h and ≈ 1,890 m at 200 km/h; with 150 + 80 mm ≈ 4,620 m at 300 km/h and ≈ 6,290 m
at 350 km/h — in line with SŽ's published "over 7 km" typical radius for high-speed lines.

Still missing for rail: freight-line ruling gradients actually used in Czech practice, transition lengths,
high-speed line track spacing and formation widths, station gradient limits.

## 5. Surface constraints (from sub-report `02`, not re-probed)

| Need | Best Czech source | Fallback |
|---|---|---|
| Forest / field / water / built-up | ZABAGED (CC BY 4.0, vector) | ESA WorldCover 10 m (CC BY 4.0), OSM |
| Buildings to demolish or avoid | RÚIAN, cadastral map (open) | OSM, Overture |
| Parcels, registered land type | Cadastral map open data (VFK/SHP) | — |
| Farmland quality (fee driver) | BPEJ (VÚMOP / SPÚ; licence to confirm), LPIS | — |
| Nature protection, Natura 2000 | AOPK (terms vary by dataset) | EEA Natura 2000 |
| Flood zones, water-source protection | DIBAVOD (WMS confirmed, vector download unclear) | JRC flood maps |
| Existing roads and rail | ZABAGED, OSM | — |
| Imagery for display | ČÚZK orthophoto 0.2 m (open; service terms to confirm) | — |
| Population for noise exposure | Census 1 km grid, GHSL 100 m | RÚIAN address points |
| Underground utilities | not public | — |

## 6. Geology (sub-report `03` + licence check)

- ČGS ArcGIS REST services answer point queries with attributes (sub-report probes): GEOČR50 lithology,
  **engineering-geological zoning 1:50k** (already a reclassification into geotechnically meaningful units),
  borehole records with Quaternary thickness, landslides, undermined areas.
- Licence **[probed]**: `cgs.gov.cz/copyright` states that the downloadable INSPIRE datasets are CC BY 4.0;
  ČGS open-data ZIPs exist for landslides, undermined areas and mine workings (`od.geology.cz`). Viewing and
  querying services is free. Bulk extraction of GEOČR50 or the engineering zoning is governed by a price
  list and licence agreement — whether a game may ship derived rasters is **not settled**; needs asking ČGS.
- No published lookup from map unit to excavation class, cut slope or tunnel class exists. It has to be an
  own heuristic table (≈ 5–8 ground categories), calibrated against the SFDI 75/20/5 mix and OTSKP prices.
- Europe/global fallback is coarse: Macrostrat (CC BY 4.0), GLiM, ELSUS landslide susceptibility 200 m.

## 7. Official routes, scenarios, prior art (sub-report `06` + probe)

- ŘSD: project map and PDF leaflets with plan-view alignment, length, cost, structures. The public ArcGIS
  service exposes the existing network and structures only; no vector data of planned alignments was found.
- OSM in Czechia **[probed]** via Overpass: 2,725 ways `highway=construction`, 2,862 `highway=proposed`
  (470 of the two are motorway-class), 194 `railway=construction`, 1,013 `railway=proposed`. Usable as a
  starting geometry for the official line (ODbL), without vertical profile.
- Variants and their evaluation: EIA documentation (CENIA portal), SŽ feasibility studies for high-speed rail.
- Traffic: ŘSD census 2020 and 2025, segment-level XLSX. No public OD matrices.
- CBA: the Ministry's methodology is free; unit values (time, operating cost, accidents) were not extracted.
- Scenario candidates: D3 through Posázaví, D35 Opatovec–Mohelnice, D11 Trutnov–border, D52 to Mikulov,
  D49, D8 České středohoří (historic, 2013 landslide), D0 511 and 518–520, high-speed rail Praha–Dresden
  (Krušné hory tunnel) and Praha–Brno. Status and cost figures in `06` need refreshing per scenario.
- Prior art: NIMBY Rails (real map, no earthworks), Transport Fever / Cities: Skylines (heightmap import,
  stylised costs), professional tools (Trimble Quantm, OpenRoads ConceptStation, InfraWorks). Nothing public
  combines real terrain, norm-checked geometry and real unit costs as a game.

## 8. What is not easily doable (model it or leave it out)

- True ground conditions (groundwater, weathering depth, actual tunnel class) — only a heuristic from maps.
- Market land prices per parcel; utility relocation; archaeology — flat allowances at best.
- Network-wide traffic reassignment — without OD matrices, score benefit from segment AADT and travel time.
- Authoritative official alignments with vertical profile — hand-digitise per scenario from leaflets/EIA.
- Interchange and junction design, drainage, construction staging — out of scope for a first version.
- Outside Czechia everything except terrain and land cover has to be re-researched per country.

## 9. Open items

1. Current (2018) ČSN 73 6101 tables for gradient, vertical curves, cross-sections, slopes — buy one year of
   ČSN Online, or find further public reproductions.
2. ČGS: permission/terms for shipping derived geology layers.
3. Licence confirmation for BPEJ, AOPK layers, DIBAVOD vectors, orthophoto service.
4. SPOŽES (railway price compendium) and the CBA unit values — not yet opened.
5. Check how politely the DMR 5G ImageServer can be used for bulk pulls vs. processing the LAZ tiles.
