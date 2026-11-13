# Transport construction costs and benefits: Czech sources and benchmarks

**Scope/date caveat.** Prices below are nominal as stated, usually without VAT; a tender award, estimate, final cost and PPP lifecycle payment are not interchangeable. Czech SFDI’s **2025** price databases were approved 25 Feb 2025 and valid 1 Jan–31 Dec 2025. The official pages now also expose newer editions; archive and select the year matching a project. EUR conversions below use a transparent round rate **€1 = CZK 25 (illustrative, not an exchange-rate observation)**.

## 1. Czech price data: best open inputs

| Source | Access and contents | What can be extracted |
|---|---|---|
| [SFDI SPK CN](https://sfdi.gov.cz/cenove-databaze/spk-cn/) | Free ZIP, 2025 package includes XML, spreadsheets, PDFs, description/structure and database appendices. Published as study-stage road-network construction norms, not tendered line-item prices. | Aggregate estimates organized by road/motorway type and project characteristics, with object/structure classifications. Package has calculations and supplementary datasets; use its spreadsheet/XML rather than scrape PDF. A scalar norm table by motorway type/terrain was **not independently extracted here**. |
| [SFDI OTSKP](https://sfdi.gov.cz/cenove-databaze/otskp/) | Free annual ZIP. OTSKP is the official itemized pricing/classification system for road and railway construction, reconstruction, repair and maintenance. Part I describes work and bill-of-quantities rules; Part II item set. Historic releases include xlsx; 2025 archive ZIP contains XML and xlsx open-format materials alongside PDF/DOCX. | Items/units and tender bills allow excavation, haul, fill, pavement, structures, track and equipment to be priced; do not assume each item has a single universal rate: scope, class, conditions and project-specific bid rates matter. |
| [ŘSD price database](https://www.rsd.cz/technicke-dokumenty/cenove-databaze) | Free ZIPs of prices for ~1,460 projects / 6,682 construction objects (as described on agency page). Actual estimate/tender bills are useful calibration evidence. | Best source for extracting real bid-price distributions by item and time. |
| [SŽ databases](https://www.spravazeleznic.cz/stavby-zakazky/modernizace/cenove-databaze) | SŽ confirms databases downloadable free from SFDI. | Rail bill items and project-specific budgets. |

The detailed line-item values requested (topsoil, excavation classes I–III, hauling, fill, landfill, blasting, retaining, pavement, noise wall, drainage, bridges, piles, NRTM, track and catenary) are available in OTSKP files, but **UNVERIFIED in this report**: the release’s actual numeric rows were not reliably extracted and should not be invented. Disposal charges are especially location-specific and may be outside a construction item’s scope. OTSKP 2025 ZIP: [direct package](https://sfdi.gov.cz/wp-content/uploads/2025/03/otskp-3.zip); listed on the [official archive page](https://sfdi.gov.cz/cenove-databaze/otskp/).

## 2. Project costs: observed Czech examples

Per-km calculations below divide published construction price by stated length. They are rough comparison indicators—not a clean unit-cost index—because bridges, interchanges, land, VAT, escalation and scope vary.

| Project / source | Cost and length | Approx. cost/km |
|---|---:|---:|
| D3 Kaplice nádraží–Nažidla (2024 award; [ŘSD](https://www.rsd.cz/-/%C5%98editelstv%C3%AD-silnic-a-d%C3%A1lnic-za%C4%8Dalo-stav%C4%9Bt-%C3%BAsek-d3-z-kaplice-do-na%C5%BEidel), [OPD project](https://opd3.opd.cz/projekt/Dalnice-D3-stavba-0312-I-Kaplice-nadrazi---Nazidla)) | CZK 4.296bn ex VAT; 11.990 km | CZK 358m / €14.3m |
| D11 Trutnov–Polish border (2024 contract; [ŘSD](https://www.rsd.cz/-/%C5%98editelstv%C3%AD-silnic-a-d%C3%A1lnic-za%C4%8Dalo-stav%C4%9Bt-d11-z-trutnova-k-hranic%C3%ADm)) | CZK 11.710bn ex VAT; 21.2 km (agency page) | CZK 552m / €22.1m |
| D1 Říkovice–Přerov (award; [tender report](https://ekonomickydenik.cz/zacal-se-stavet-posledni-usek-d1-dalnice-bude-po-dokonceni-merit-377-kilometru/)) | CZK 6.922bn ex VAT; 10.1 km | CZK 686m / €27.4m |
| D35 Janov–Opatovec ([ŘSD contract](https://www.rsd.cz/-/%C5%98editelstv%C3%AD-silnic-a-d%C3%A1lnic-otev%C5%99elo-%C3%BAsek-d35-z-janova-do-opatovce)) | CZK 2.540bn ex VAT; nearly 12 km | ~CZK 212m / €8.5m |
| D4 PPP, 32 km new motorway + 16 km upgrades ([Transport Ministry](https://md.gov.cz/Media/Media-a-tiskove-zpravy/Dostavba-32-kilometru-pisecke-dalnice-D4-zacina,-o?lang=en-GB), [VINCI](https://www.vinci.com/en/newsroom/press-releases/vinci-opens-traffic-d4-motorway-czech-republic-under-public-private)) | CZK 17.8bn net present value quoted for project; VINCI reports ~€530m investment, lifecycle DBFOM | Not comparable to construction award/km; includes operations/maintenance/finance and existing-road upgrades. |
| D3 Nažidla–border, planned works ([project leaflet](https://www.dalniced3.cz/public/files/documents/infoletak-d3-nazidla-dolni-dvoriste-09-2025_1.pdf)) | Official leaflet provides length and object details; total awarded amount not verified here | UNVERIFIED |
| Ejpovice rail tunnel/modernization ([ČKAIT](https://30let.ckait.cz/stavba-24-ejpovicky-tunel-modernizace-zeleznicni-trati-rokycany-plzen.html), [project cost report](https://zpravy.aktualne.cz/ekonomika/doprava/tunel-ejpovice-otevren/r~d4743844e97a11e8b04aac1f6b220ee8/)) | CZK 6.783bn total modernization costs including land, design, archaeology and variations; two tubes ~4.15 km each | Not a tunnel-only rate; whole rail project scope |

ŘSD publishes project leaflets/cards as PDFs with alignment maps, length, category, cost estimate/contract, structures and sometimes earthwork volumes; find via [ŘSD project pages](https://www.rsd.cz/) and project-specific pages such as [D3 information site](https://www.dalniced3.cz/). Publicity data are revision-dated estimates, not a consistent machine-readable cost database. Further examples requested—D48/D55/D6, Blanka, Homole/Dědek, major bridges, corridor km and VRT km—are **UNVERIFIED here**, not omitted as zero. For tunnel context, Blanka final cost and those project-specific unit rates need scope-controlled primary-source checks.

## 3. Land, environmental and mitigation costs

| Cost item | Czech rule/evidence |
|---|---|
| Land acquisition | [Act 416/2009, §3b](https://www.e-sbirka.cz/sb/2009/416) provides purchase incentive multipliers in qualifying cases; commonly stated multiplier is **8× expert-appraised value for agricultural/forest land**, with **1.5× for building land** under the applicable statutory conditions. Confirm current consolidated law and whether the route qualifies; expropriation uses distinct compensation rules. |
| Agricultural land removal (ZPF) | [Act 334/1992](https://www.e-sbirka.cz/sb/1992/334), schedules and BPEJ soil classification govern levy; amount depends on soil quality, area and ecological factors. Transport exemptions/reductions are condition-specific; **no universal motorway/rail exemption or verified class tariff asserted here**. |
| Forest (PUPFL), demolition, archaeology, utilities | Separate forest-removal levies, replacement/compensation, rescue archaeology obligations and utility-owner relocation agreements can materially change route cost. No nationally fixed verified unit rates identified. Treat as parcel/project-specific; archaeological survey is explicitly included among Ejpovice total project costs. |
| Wildlife crossings / noise barriers | Tendered, design-specific structures; **unit costs UNVERIFIED**. OTSKP and tender object bills are the accessible route to evidence. |

## 4. International comparators and transferable databases

| Source | Use/known result |
|---|---|
| European Court of Auditors, [HSR report 2018](https://www.eca.europa.eu/en/publications?did=46398) | Audited high-speed rail projects; average construction cost reported around **€25m/km** in the examined sample (older nominal scope; tunnels/urban sections drive large spread). |
| EU DG REGIO, [Guide to Cost-Benefit Analysis 2014](https://ec.europa.eu/regional_policy/sources/studies/cba_guide.pdf) and [2021 economic appraisal vademecum](https://ec.europa.eu/regional_policy/sources/guides/vademecum_2127_en.pdf) | Appraisal framework and reference inputs, not a universally current contractor price list. |
| World Bank [ROCKS](https://www.worldbank.org/en/topic/transport/brief/rocks-road-cost-knowledge-system) | Historical road-work cost database, useful for international comparison, but coverage/year and local scope must be filtered. |
| [CE Delft transport infrastructure costs](https://cedelft.eu/wp-content/uploads/sites/2/2021/03/CE_Delft_4K83_Overview_transport_infrastructure_expenditures_costs_Final.pdf) | Europe-wide network/infrastructure expenditure study, not a Czech bill-of-quantities catalog. |
| UK National Highways / HS2; US FHWA; Germany/Austria/Poland | Public project cost and estimating documents exist, but rates are specification-, tax-, land-, date- and geography-dependent. **Comparable verified unit figures not extracted for this memo.** |

A strong caution from the [ECA special report on HSR](https://www.eca.europa.eu/en/publications?did=46398): average €/km hides tunnel/bridge and urban complexity; likewise Czech tender rates vary widely even on nominal motorway mileage. “Typical” tunnel cost per km, bridge deck per m² and countrywide motorways €/km are **UNVERIFIED** here.

## 5. Benefits and appraisal

The [SFDI/Transport Ministry Resortní metodika](https://sfdi.gov.cz/pravidla-a-metodiky/rezortni-metodika-pro-hodnoceni-ekonomicke-efektivnosti-projektu/) is freely downloadable; 2017 methodology updated June 2023, with text and appendices linked on the page. [OPD CBA library](https://opd3.opd.cz/slozka/metodika-cba) has the complete valid methodology. It supports road, rail and other transport economic appraisal and standardizes travel-time savings, vehicle operating costs, accidents, emissions/noise and maintenance, discounting and appraisal periods. **Specific current unit values for value of time, VOC/km, injury/fatality, CO₂, noise, annual maintenance, discount rate and evaluation horizon are UNVERIFIED here**; inspect the relevant appendices/model workbook before implementation rather than copy stale values.

International complements: [HDM-4](https://www.hdmglobal.com/) models road deterioration, maintenance and user costs; EU CBA Guide/Vademecum provide economic appraisal practice; EC [Handbook on External Costs of Transport](https://op.europa.eu/en/publication-detail/-/publication/9781f65f-8448-11ea-bf12-01aa75ed71a1) provides accident, air pollution, climate, noise and congestion externality methods. They estimate societal benefits/costs, not construction bid prices.

## 6. Sanity-check price table (only sourced estimates)

| Item | Indicative CZK | EUR at CZK25/€ | Basis/price year |
|---|---:|---:|---|
| New motorway observed award range in examples | 212–686m/km | €8.5–27.4m/km | Czech awards cited above; nominal 2023–24 award, no VAT; outliers reflect scope |
| Two-lane road, motorway at-grade norm | **UNVERIFIED** | **UNVERIFIED** | Pull from 2025 SPK CN; no fabricated proxy |
| Cut soil / rock, fill per m³ | **UNVERIFIED** | **UNVERIFIED** | OTSKP class/site/haul dependent |
| Bridge per m²; noise barrier per m² | **UNVERIFIED** | **UNVERIFIED** | Extract tender object/OTSKP; design-specific |
| Road/rail tunnel per m | **UNVERIFIED** | **UNVERIFIED** | Ejpovice total project is not a tunnel-only rate |
| Double-track railway / HSR per km | **UNVERIFIED** | **UNVERIFIED** | Use SŽ budgets and SPK CN only where included; scope varies |
| Land per m² | **UNVERIFIED** | **UNVERIFIED** | BPEJ/location and statutory compensation multiplier matter |

**Practical finding:** Czechia is unusually favorable for a tiny team: free, annually maintained itemized and study-stage price datasets, project leaflets, tenders and a free official CBA methodology. But there is no single “price per km” truth. Preserve award year, scope, VAT, price base, land/utility inclusion, terrain and bridge/tunnel share for every calibration example.