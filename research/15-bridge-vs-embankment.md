# High embankments vs bridges: Czech evidence for Trapla

Research snapshot: 2026-11-14. Costs are CZK excluding VAT unless noted. Evidence and implemented study-stage calibration; not a geotechnical design check. **Sourced** means the cited public source states the fact; **derived** marks arithmetic; **unknown/provisional** flags limits. No general legal maximum embankment height was found or inferred.

**Follow-up evidence:** [`15-followup.md`](15-followup.md) extracts the actual April 2026 OTSKP culvert rows, a project-specific cut bench, and a public KHK ÚSES feature service. It supersedes the initial price/data gaps below. The implementation author independently checked the SFDI publication page, workbook rows 9183E2/899524, and the D11 1107 ground-treatment article.

## Implemented calibration

- **Benches:** 2 m-wide fill benches / 1 m-wide cut benches every 6 m of vertical rise/drop. The 1 m cut bench above 6 m has a project precedent in I/27 Klatovy; repeated intervals and fill dimensions are **PROVISIONAL**, not a ČSN rule. Actual sampled sections integrate their extra material and footprint. Flat DP sections use the same geometry and depth-class volumes. For height `h`, each bench at `k×6 < h` adds `2×width×(h−k×6)` m² to the prism and `2×width` metres to land take. The map ribbon still simplifies each side to its crown/daylight surface.
- **Engineering reserve:** fill volume × `35×max(0,h−6)` CZK/m³ and cut volume × `20×max(0,depth−6)` CZK/m³, before the normal surcharge. These are **PROVISIONAL sensitivity coefficients, not sourced tender rates**. They represent reinforcement, drainage, foundation treatment and stability measures missing from simple placement/excavation. At 10/20/30 m fill the reserve is 140/490/840 CZK/m³. D11 demonstrates the work exists, but does not price this formula. It stays payable even when mass balance values extra fill material negatively. It is shown separately in Earthworks and applies identically to bill, structure selector, balance estimate and DP.
- **Small streams:** one crossing per contiguous raster cluster (30 m merge, provisional); excess barrel length beyond crown + 12 m is charged, since ordinary drainage is already in the SPK norm. Per extra metre: OTSKP 9183E2 DN800 pipe 9,450.93 + 0.6 m³ of 899524 encasement at 4,366.36 + provisional 3,000 for bedding/excavation/drainage = **15,070.75 CZK/m**, before surcharge. The assumed assembly/diameter and norm-included width are not hydraulic design. A 70 m footprint on S9.5 therefore adds 48.5 m × 15,070.75 = **0.731m CZK**, or **0.955m incl. rural surcharge**, beyond ordinary drainage. Length uses cross-sectional footprint (no surveyed channel/skew correction); raster streams hidden by another landcover class can be missed. Large rivers/railways retain forced bridges, not these pipes.
- **No invented legal cap / height-discounted bridge rate:** sources do not support a universal maximum fill height or a quantitative bridge-height price curve. SPK bridge averages are retained; unusual viaduct foundations remain an uncertainty. A high-fill engineering reserve is a price, not a declaration that the earthwork is actually buildable. Overrides let players choose a bridge for unmodelled environmental/geotechnical reasons.
- **ÚSES:** `uv run pipeline/fetch_uses.py` caches 47 regional/nadregional polygons intersecting the play rectangle in `pipeline/cache/uses-khk.geojson` (~0.49 MB, EPSG:5514). Service metadata is CC0; inspected features cite ZÚR changes 1–5 / 2021, so this is not proof of current plan status or complete local ÚSES coverage. No forced-bridge raster is derived: corridor presence alone does not prescribe a bridge, nor its span. Flood-zone hydraulics, wildlife passage dimensions and ecological review are unresolved.

### Flat-ground bridge break-even

Reproduce with `npx tsx scripts/bridge-break-even.ts`. S9.5, hilly rural road base, 1:2 fill, 320 CZK/m² land, 30.6% surcharge; bridge = **760,404 CZK/m** including deck-width land. This is a local uniform cross-section comparison, not the final run-level decision (30 m minimum and merging) or an environmental rule.

| Material shadow value λ, CZK/m³ | Previous fill (no reserve/benches) | New fill | New, one stream per 30 m |
|---:|---:|---:|---:|
| −196.4 (surplus-disposal saving) | no crossing below 100 m | 21.03 m | 20.55 m |
| 0 (free material) | 47.03 m | 18.62 m | 18.19 m |
| 100 | 33.14 m | 17.58 m | 17.19 m |
| 200 (manual default) | 26.85 m | 16.62 m | 16.25 m |
| 536 (borrow replacement) | 17.96 m | 14.04 m | 13.75 m |

The original owner's 25–28 m estimate describes λ≈200. At true free-material λ=0 the old threshold was ~47 m, and at negative λ it could fail to bridge altogether. The new reserve removes that pathological dependence while keeping the calibration explicitly provisional. Run boundaries, cross-slope, land cover and short isolated cells still produce different route-specific maxima.

## Findings in brief

- **ČSN 73 6133 does not supply a simple universal maximum fill/cut height.** It governs design/construction of earthworks and requires geotechnical assessment appropriate to conditions. Public secondary/reproduced material associates the first geotechnical category with simple road earthworks up to 3 m; that is a category applicability threshold, not an allowable-height ceiling. A ŘSD technical condition calls a layered embankment “nenáročná” below 6 m. Neither makes 3 m or 6 m a legal maximum.
- High fills are ordinary, but their footprint, subsoil, settlement and crossing requirements dominate. ŘSD reports 2.26 million m³ of fill for the 19.63 km D11 Jaroměř–Trutnov; one D35 design report gives a variable fill 0.5–6.1 m. D11/D35 project evidence documents accelerated consolidation lasting months and slow settlement delaying a road opening, but publicly recovered project totals do not isolate the stabilization/consolidation bill.
- A long culvert is not equivalent to a bridge over a stream. OTSKP’s measured unit “m” for pipe culverts pays for pipe supply/laying only; bedding and concrete encasement are separate. The 2025 tender schedule shows 10.5 m DN400 reinforced-concrete and 12 m DN800 reinforced-concrete culverts; a separate 20 m DN600 plastic line is documented, but prices are redacted/not extracted. A current official OTSKP database is available (April 2026); current unit prices were not recovered in this pass.
- A bridge’s height influences foundations, piers, construction method and access, but the public SPK CN figures are not a height-specific price curve. Its 2026 study norm provides a useful deck-area proxy; large D11 structures demonstrate the qualitative step-change at valley crossings. No isolated height-versus-cost series or complete award price for the cited D11 major bridge was found.
- Floodway and ecological-network constraints are not solved by selecting an embankment/culvert: active flood zones restrict construction and flow-obstructing terrain works; EIA/ecological review and appropriate wildlife crossings can change the solution. Public national flood-zone data are downloadable. KHK’s DataKHK portal is primarily dashboards; no directly reusable KHK ÚSES layer/download was confirmed here.

## 1. Geometry, ČSN 73 6133 and geotechnical categories

### What can be said from public sources

| Evidence | Sourced finding | Limits |
|---|---|---|
| [ČSN 73 6133 preview (ČSN Online)](http://csnonlinefirmy.agentura-cas.cz/html_nahledy/73/52174/52174_nahled.htm) and [norm overview](https://nahledy.normy.biz/n.php?i=84654) | Scope is design and construction of road earthworks: embankments, cuts and excavations; it covers natural soils/rock and other fill materials. | Full standard is not freely exposed in the preview; do not quote unavailable detailed clauses as verified. |
| [Public reproduction of ČSN 73 6133 tables, geotechnical category 1](https://is.vstecb.cz/th/myhh5/Priloha_12_13_CSN_73_6133_Tabulka_10b___11.pdf) | Excerpt refers to embankments of geotechnical category 1, low traffic classes, parking/lay-by and temporary/non-motorized roads. | Does not establish a universal height rule; exact surrounding provisions and applicability need the complete norm. |
| [Public geotechnical-category explainer](https://www.chcistatika.cz/geotechnicke-kategorie-pri-navrhu-zakladovych-konstrukci/) | Summarizes category 1 as including simple road embankments/cuts up to 3.0 m. | Secondary summary; 3 m is a boundary for “simple/low-risk” category, **not a permissible maximum**. |
| ŘSD [TP 170, Vrstevnaté násypy pozemních komunikací](https://pjpk.rsd.cz/viewFile.asp?file=5524) | The text calls a layered embankment “nenáročná” when its height is under 6 m and addresses design/safe execution of layered “sandwich” fills using less-suitable soils. | Technical condition applies to its subject and method; 6 m is not a statutory ceiling for all road fills. |
| [ČSN 73 6133 preview from Normservis](https://www.normservis.cz/download/view/csn/73/52174/52174_nahled.pdf) | Public preview confirms scope and standard identity. | No reliable publicly inspected extract in this pass established exact numerical berm/lavička dimensions, spacing or slope ratios. |

### Berms (“lavičky”), slopes and categories — explicit gaps

The research found public norm previews and the ŘSD layered-fill technical condition, but **did not verify from an authoritative, fully readable clause** a rule such as “berm every X metres”, minimum berm width, required fill/cut slope, or a slope-ratio table keyed to height. Those values should not be fabricated from generic textbook practice. A cross-section should be driven by geotechnical design, material, groundwater, foundation conditions, drainage and stability, rather than one game-wide slope or berm interval. A clear technical-calculation route is to use a terrain/earthworks geometry proxy and separately represent land take, retaining works, ground improvement, settlement delay and crossings.

**Useful project-specific geometry (not a norm):** the inspected D11 1107 construction article (below) says consolidation measures were applied beneath embankments higher than **3 m**, with vertical drains 3–8.5 m long in a triangular 0.78–1.28 m grid. At SO 204, benches cut into steep slopes to support a 60 t machine were **5.5–8 m wide**; the same object had up to 8 m of cover and nearly 100,000 m³ of fill. This is evidence that real construction may use wide working/stability benches, not a normative minimum width or universal bench interval.

**Not found:** a legal or national technical “maximum road embankment height.” The cited category thresholds describe complexity/applicability; high fills can be designed with site-specific investigation and measures. Treat any fixed game cap as a game rule only, never as a Czech legal limit.

## 2. Actual high fills, stability, consolidation and cost evidence

| Project/source | Verified project fact | Cost evidence / caveat |
|---|---|---|
| D11 Jaroměř–Trutnov, [ŘSD construction announcement](https://www.rsd.cz/-/%C5%98editelstv%C3%AD-silnic-a-d%C3%A1lnic-za%C4%8Dalo-stav%C4%9Bt-posledn%C3%AD-chyb%C4%9Bj%C3%ADc%C3%AD-%C3%BAsek-d11) | 19,630 m mainline; **2.26 million m³ of embankment** stated. | Award announcement gives whole-job contract ~9.087bn CZK excl. VAT; it does not isolate fill placement, stabilization or settlement costs. Dividing total price by fill is invalid. |
| D35 Vysoké Mýto–Džbánov, [available design document record](https://bpapi.datlab.eu/document/1b470723c5561f57504f60e67ce00c5f65a16f07387631e59b063f8ca592b881) | Reported N4 fill varies approx. **0.5–6.1 m**, with highest sections at bridge objects; the document says the embankment was geotechnically assessed by calculation. | Document is design evidence, not a tendered unit-rate observation. |
| D11 Smiřice–Jaroměř, [Časopis Stavebnictví project account](https://www.casopisstavebnictvi.cz/clanky-dalnice-d11-usek-smirice-jaromer.html) | Route profile includes low fill up to about 1.5 m before a deep cut. For D11 1107, the article reports ~700,000 m³ excavation and ~900,000 m³ fills; cohesive loess/clay fills required hydraulic binders and tightly controlled moisture. Vertical drains plus crushed-stone working/improvement layers were used beneath fills over 3 m and at bridge approaches. | No priced stabilization/consolidation line item. The article gives specific field dimensions: drains 3–8.5 m long, 0.78–1.28 m triangular grid; at SO 204 machine-support benches 5.5–8 m wide, fill cover up to 8 m and almost 100,000 m³ of backfill. These do not establish norm dimensions or costs. |
| D35 Opatovice–Časy, [Silnice Železnice account (search-indexed)](https://silnice-zeleznice.cz/silnice/realizace-useku-dalnice-d35-opatovice-casy-v-plnem-proudu-342) | Article snippet reports consolidation near bridge abutments to accelerate subsoil settlement took **3–7 months**, with settlement monitoring. | Page URL returned 404 on visit; this detail is search-result evidence only. No treatment cost extracted. |
| D11 Jaroměř–Trutnov construction progress, [Trutnovinky (2026)](https://www.trutnovinky.cz/foto-jak-se-za-dva-roky-zmenila-stavba-d11-porovnali-jsme-stejna-mista/) | Report says slow settlement of high embankments shifted opening timing. | News report; no height or cost allocation stated. |
| D11 bridge ground conditions, [Valbek: how D11 bridges were built](https://www.valbekstory.com/blog/detail/r/jak-se-stavely-mosty-na-d11) | Article describes fine-grained clayey soils to roughly 6–8 m that consolidate under fills; bridge approaches required attention to differential settlement. | This concerns project-specific ground, not a general Czech depth profile or price. |
| [SFDI OTSKP price data](https://sfdi.gov.cz/cenove-databaze/otskp/) and [SPK CN](https://sfdi.gov.cz/cenove-databaze/spk-cn/) | Official item prices and study-level standard cost norms are published for investment preparation; OTSKP page lists April 2026 as current edition. | Can price measured earthwork items, but geotechnical improvement/monitoring and settlement delay need the actual project BOQ and scope. No verified comparable line-item sample was extracted. |

**Interpretation supported by these examples:** at-grade fill may be materially cheaper than an elevated bridge where the ground and land allow it, but high fill is not “free”: the road prism expands with height, may consume large land area, blocks local access/ecological and hydrological connections, and may require ground treatment and waiting/monitoring. An overpass over a valley or road/rail corridor can replace that broad embankment with a structure, but requires foundations/piers/approaches. The sources do not prove a universal break-even height or cost ratio.

## 3. Stream crossing: culvert costs and the 70 m footprint question

### What the paid OTSKP lines mean

An inspected 2025 OTSKP-format BOQ for II/280, [amendment / schedule](https://zakazky.cenakhk.cz/document_audit_323813/liban-1_rs-pdf), states:

- Item **9183B2**: DN400 reinforced-concrete pipe culverts, unit **m**, quantity 10.5 m. Its scope says supply and laying of the specified pipe; it **excludes bedding layers and concrete encasement**.
- Item **9183E2**: DN800 reinforced-concrete pipe culverts, unit **m**, quantity 12 m; same exclusion of bedding/encasement.
- Separate item **899524**, concrete encasement, is separately measured in m³ (the schedule lists quantities including 2.016 m³).
- An OTSKP-2024/2025 change schedule for Libáň [shows a 20 m DN600 plastic culvert line](https://zakazky.cenakhk.cz/document_audit_323813/liban-1_rs-pdf), but its prices are not publicly visible in the extracted text.

A second source is the [SFDI OTSKP official database](https://sfdi.gov.cz/cenove-databaze/otskp/), which identifies OTSKP as the official price system for transport-infrastructure construction and publishes the April 2026 database. Although current unit prices are accessible in its download, **we did not independently extract price rows for the pipe-culvert codes in this research pass**. Thus this document does not assert a price-per-metre for current OTSKP pipe culverts.

The 2025 UÚR [Average prices of municipal transport/technical infrastructure](https://www.uur.cz/media/y4ain34y/ceny-ti-2025-celek.pdf) gives a broad comparator for drainage piping, not a road-crossing culvert: in an unpaved area, DN1000 reinforced-concrete sewer pipe is **35,367 CZK/m** (2025, with its stated sewer/trench assumptions); the same nominal DN in asphalt is 51,892 CZK/m. These include different pipe/trench/sewer assumptions, and are **not** an OTSKP culvert rate or valid direct estimate for a stream-crossing installation.

### 70 m footprint

A 70 m roadway footprint crossing a stream means roughly 70 m of culvert barrel only if the channel lies beneath the entire footprint and the hydraulic solution permits that geometry; actual inlet/outlet transitions and skew can change length. The examples above show OTSKP measures culverts by installed pipe length, but do not supply priced 70 m installations. A 70 m pipe crossing must not be treated as a basic drainage pipe without checking hydraulic capacity, debris/sediment, scour, headwalls/inlets/outlets, structural loading and ecological continuity. A multi-cell/large box culvert or bridge may be required; no threshold was established here. Price line-items for pipe, bedding, concrete, headwalls, excavation, dewatering, erosion/scour protection and stream restoration separately when the BOQ allows. **70 × a guessed single unit price is not evidence.**

## 4. Ecological corridors, ÚSES and floodplains

### Rules and datasets

- MŽP’s [flood-zone guidance](https://mzp.gov.cz/cz/agenda/voda/ochrana-pred-povodnemi/systematicka-prevence/zaplavova-uzemi) states that flood zones are designated by water authorities; in an **active flood zone** construction is prohibited except statutory exceptions under Water Act §67, and terrain works that worsen surface-water flow are prohibited. Conditions may also be imposed outside the active zone. The source identifies 100-year flood hydraulics as the basis for flood-zone delineation.
- The same MŽP page says national flood-zone/active-zone data are presented in the public [POVIS system](https://www.dppcr.cz/html_pub/index.html?a_titulni_list.htm) and downloadable from [VÚV HEIS flood-zone data](https://heis.vuv.cz/data/webmap/datovesady/isvs/zaplavuzemi/HTML_ISVS$zaplavuzemi$stazeni.asp?doc=full), with annual download updates (POVIS display updates 3–4 times per year). This is a concrete candidate to cache, subject to checking license/format and layer currency.
- AOPK’s national [Fauna and transport methodology](https://www.ceson.org/document/AOPK_METODIKA_DOF_WEB-1.pdf) addresses transport impacts and wildlife passages. Its scope supports screening ecological corridors and crossing permeability; it does not establish that every mapped corridor entails one fixed structure or cost.
- EIA documentation for D11 identifies an existing motorway intersection with a migration corridor and describes ecological core areas, corridors and critical locations: [CENIA EIA document](https://portal.cenia.cz/eiasea/download/RUlBX01aWDUxMl9wcmlsbGhaRG9rdW1lbnRhdG9jXzc3NDM0MzY0MTk2NTU4MjcyMDQucGRm/MZP512_prilohaDokumentaceDOC_13.pdf). This is an example of project-specific EIA consideration, not a general legal rule that all corridors require an ecoduct.
- **KHK data availability:** the regional [DataKHK portal](https://www.datakhk.cz/pages/dashboardy) exposes dashboards for environment, regional roads/bridges and other statistics; page description does not establish a downloadable GIS layer for ÚSES. KHK’s adopted [spatial planning principles (ZÚR) / map documents](https://www.kr-kralovehradecky.cz/) are likely useful for plan-level constraints but a geospatial service/download suitable for cache was not verified. National and regional territorial-system data are likely available via AOPK / map services; no KHK-specific RÚSES endpoint or license was verified in this pass. Mark KHK ÚSES cacheability **unknown**, rather than claiming the dashboard is a data API.

**Important distinction:** a culvert may pass water and still fail ecological function; an ecoduct/wildlife overpass, a dry ledge in a box or a bridge leaving a riparian strip has different dimensions and costs. Conversely, a fill across an active flood zone may be constrained even with a culvert if it impairs flow. These are screening issues, not enough information to prescribe a specific crossing.

## 5. Bridge cost evidence and height sensitivity

### Study-norm and project evidence

| Evidence | What it supports | What it does not support |
|---|---|---|
| SFDI [SPK CN 2026](https://sfdi.gov.cz/cenove-databaze/spk-cn/) figures reproduced in `research/00-feasibility-map.md` | Standard road-bridge norm: S 11.5 about **692m CZK per km of bridge**; width-normalized proxy about **60,200 CZK/m²** deck. Motorway D 27.5 about **1,495m CZK/km**, roughly **54,400 CZK/m²** by standard deck-width arithmetic. | The report’s per-km values are study-stage object norms, not bid prices; area division is an approximation. The published figure does not isolate bridge height or foundation class. |
| D11 SO 209 Poříčí, [Ebeton / Valbek technical article](https://www.ebeton.cz/clanky/2026_1_70_most-so-209-pres-porici-na-dalnici-d11/) | Design of a 723.2 m bridge (699 m superstructure), six spans up to 151 m, two separate carriageway decks, major river/road/rail crossings. Deep bored piles at some supports, micropiles at an abutment, shallow foundations at other supports; main support height / superstructure geometry varies. | No object contract price is disclosed in the article. Not a priced “per metre at height H” observation. |
| D11 1106 bridge-objects, [Ebeton technical article](https://www.ebeton.cz/clanky/2022_3_04_mostni-objekty-na-dalnicnim-useku-d11-1106/) | Project-specific bridge design and high embankments near MÚK Plotiště in flat terrain; illustrates that bridge/approach and fill are planned together. | Not an isolated bridge award or height-cost curve. |
| Official [ŘSD project cost database](https://www.rsd.cz/technicke-dokumenty/cenove-databaze) | ŘSD says its data include about 1,460 projects / 6,682 construction objects. Potential route to object-level evidence if bridge SO prices and geometry are extracted. | No specific bridge-SO sample was extracted in this research pass. |

Height raises structural demands through longer/taller piers, greater lateral effects and potentially more difficult foundations and construction access; deep valleys may instead make an embankment impractical or ecologically/hydrologically harmful. However **no public source inspected provided matched bridge awards across heights with comparable spans, deck area, geology and scope**. Bridge cost should therefore not be stated as a verified multiplier “per metre of height.” The SPK CN norm can support a standard bridge baseline; project-specific foundation, span, approach and ground factors remain unquantified here.

## Unknowns and provisional statements

- Exact ČSN 73 6133 clause-level berm/lavička frequency and width, slope limits by material/height, and current interpretation of geotechnical-category thresholds: **not verified** from a complete authoritative standard.
- Maximum built embankment height on Czech roads: **no universal legal maximum identified**; do not invent one.
- Current April 2026 prices for OTSKP 9183B2/9183E2/9183D3 etc., plus priced full culvert assembly and 70 m tender examples: **not extracted**. Current official source is linked above.
- Cost breakdowns for high-fill stabilization/consolidation, monitoring and delay on D11/D35: **not found**.
- Price-versus-height bridge sample and attributable SO cost for D11 SO 209: **not found**.
- Machine-cacheable KHK RÚSES/ÚSES GIS layer, access endpoint, update cadence and reuse terms: **not confirmed**. Flood data is the better verified download candidate.
- Whether a 70 m stream crossing can be culverted is project/hydraulic/ecological-specific; length alone is not enough to choose structure type.

## Sources visited and search-result leads

Directly opened and read with the visit tool: [SFDI OTSKP](https://sfdi.gov.cz/cenove-databaze/otskp/), [KHK II/280 BOQ](https://zakazky.cenakhk.cz/document_audit_323813/liban-1_rs-pdf), [UÚR 2025 prices](https://www.uur.cz/media/y4ain34y/ceny-ti-2025-celek.pdf), [MŽP flood-zone guidance](https://mzp.gov.cz/cz/agenda/voda/ochrana-pred-povodnemi/systematicka-prevence/zaplavova-uzemi), [DataKHK](https://www.datakhk.cz/pages/dashboardy), [D11 SO 209 article](https://www.ebeton.cz/clanky/2026_1_70_most-so-209-pres-porici-na-dalnici-d11/), [D11 1106 bridge article](https://www.ebeton.cz/clanky/2022_3_04_mostni-objekty-na-dalnicnim-useku-d11-1106/), [D11 Smiřice–Jaroměř article](https://www.casopisstavebnictvi.cz/clanky-dalnice-d11-usek-smirice-jaromer.html). Other references below were discovered through web search and were not all independently opened; the D35 Opatovice–Časy article URL returned 404 when visited. Search-derived details are identified as such in the text.

1. [ČSN 73 6133 ČSN Online preview](http://csnonlinefirmy.agentura-cas.cz/html_nahledy/73/52174/52174_nahled.htm)
2. [ČSN 73 6133 overview](https://nahledy.normy.biz/n.php?i=84654)
3. [ČSN 73 6133 excerpt: category table](https://is.vstecb.cz/th/myhh5/Priloha_12_13_CSN_73_6133_Tabulka_10b___11.pdf)
4. [Geotechnical categories, secondary explainer](https://www.chcistatika.cz/geotechnicke-kategorie-pri-navrhu-zakladovych-konstrukci/)
5. [ŘSD TP: Vrstevnaté násypy pozemních komunikací](https://pjpk.rsd.cz/viewFile.asp?file=5524)
6. [Normservis ČSN 73 6133 preview](https://www.normservis.cz/download/view/csn/73/52174/52174_nahled.pdf)
7. [ŘSD D11 Jaroměř–Trutnov announcement](https://www.rsd.cz/-/%C5%98editelstv%C3%AD-silnic-a-d%C3%A1lnic-za%C4%8Dalo-stav%C4%9Bt-posledn%C3%AD-chyb%C4%9Bj%C3%ADc%C3%AD-%C3%BAsek-d11)
8. [D35 Vysoké Mýto–Džbánov design document record](https://bpapi.datlab.eu/document/1b470723c5561f57504f60e67ce00c5f65a16f07387631e59b063f8ca592b881)
9. [D11 Smiřice–Jaroměř project article](https://www.casopisstavebnictvi.cz/clanky-dalnice-d11-usek-smirice-jaromer.html)
10. [D35 Opatovice–Časy consolidation report, original URL](https://silnice-zeleznice.cz/silnice/realizace-useku-dalnice-d35-opatovice-casy-v-plnem-proudu-342) (**search-result only**; visited page returned 404)
11. [D11 Jaroměř–Trutnov progress report](https://www.trutnovinky.cz/foto-jak-se-za-dva-roky-zmenila-stavba-d11-porovnali-jsme-stejna-mista/) (**search-result only**)
12. [Valbek, D11 bridges and ground conditions](https://www.valbekstory.com/blog/detail/r/jak-se-stavely-mosty-na-d11)
13. [SFDI OTSKP, current database](https://sfdi.gov.cz/cenove-databaze/otskp/)
14. [OTSKP II/280 schedule, KHK tender documents](https://zakazky.cenakhk.cz/document_audit_323813/liban-1_rs-pdf)
15. [UÚR Average prices 2025](https://www.uur.cz/media/y4ain34y/ceny-ti-2025-celek.pdf)
16. [MŽP flood-zone guidance and data links](https://mzp.gov.cz/cz/agenda/voda/ochrana-pred-povodnemi/systematicka-prevence/zaplavova-uzemi)
17. [POVIS](https://www.dppcr.cz/html_pub/index.html?a_titulni_list.htm)
18. [VÚV HEIS flood-zone download](https://heis.vuv.cz/data/webmap/datovesady/isvs/zaplavuzemi/HTML_ISVS$zaplavuzemi$stazeni.asp?doc=full)
19. [AOPK fauna and transport methodology](https://www.ceson.org/document/AOPK_METODIKA_DOF_WEB-1.pdf)
20. [CENIA D11 EIA documentation](https://portal.cenia.cz/eiasea/download/RUlBX01aWDUxMl9wcmlsbGhaRG9rdW1lbnRhdG9jXzc3NDM0MzY0MTk2NTU4MjcyMDQucGRm/MZP512_prilohaDokumentaceDOC_13.pdf)
21. [DataKHK dashboards](https://www.datakhk.cz/pages/dashboardy)
22. [SFDI SPK CN](https://sfdi.gov.cz/cenove-databaze/spk-cn/)
23. [Ebeton/Valbek: D11 SO 209 Poříčí bridge](https://www.ebeton.cz/clanky/2026_1_70_most-so-209-pres-porici-na-dalnici-d11/)
24. [Ebeton: D11 1106 bridge objects](https://www.ebeton.cz/clanky/2022_3_04_mostni-objekty-na-dalnicnim-useku-d11-1106/)
25. [ŘSD cost databases](https://www.rsd.cz/technicke-dokumenty/cenove-databaze)
26. [KHK official site, ZÚR entry point](https://www.kr-kralovehradecky.cz/)

Related prior research: [`research/09-noise-earthworks-urban.md`](09-noise-earthworks-urban.md), [`research/00-feasibility-map.md`](00-feasibility-map.md), [`research/13-crossing-items-tenders.md`](13-crossing-items-tenders.md).
