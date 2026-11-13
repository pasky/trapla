# Geometric design standards: Czechia and comparison set

*Feasibility map, checked 2026-11-13. Many tables marked UNVERIFIED below were later filled from public sources — see `00-feasibility-map.md` section 4. “Verified” means the cited source directly supports the figure; otherwise explicitly marked UNVERIFIED. Norms are engineering minima/maxima, not universal design targets. This is not a reproduction of paid standards.*

## 1. Czech source landscape and access

| Source | Scope / access finding |
|---|---|
| **ČSN 73 6101**, *Projektování silnic a dálnic* | Governs rural roads/motorways. Major replacement took effect **1 Oct 2018** (the 2004 edition ended that day); the 2018 revision changed design-speed concepts and values. Current catalog entry: [ČAS record](https://csnonline.agentura-cas.cz/Detailnormy.aspx?k=505692); older edition record [here](http://csnonline.agentura-cas.cz/Detailnormy.aspx?k=69709). Full current text is paid. Revision background: [ČKAIT](https://www.ckait.cz/content/revize-csn-73-6101-projektovani-silnic-dalniic). Current amendments/status beyond the catalog listing: **UNVERIFIED**. |
| **ČSN 73 6102** intersections; **73 6110** urban roads; **73 6201** bridges; **73 7507** road tunnels; **73 6133** earthworks | Design standards; normally paid through ČSN Online or purchase. Exception: MMR hosts a complete publicly viewable **73 6110** (2006) [PDF](https://unmz.gov.cz/files/normalizace/%C4%8CSN%2073%206110/74506.pdf). 6102/6201/7507/6133 current publication and amendments were not independently verified. |
| **ČSN 73 6360-1** track geometry; **73 6301 / 73 6320** railway projects / clearances | Standards generally paid; current edition/amendment state and exact individual scope not verified here. |
| Správa železnic **S3**, railway superstructure | Public SŽ-hosted PDF [S3 Part I (2022)](https://www.spravazeleznic.cz/documents/50004227/139626480/SZDC_S3_Dil_01_sezm1az4_a_sopr1_20220101.pdf/08f34fa0-aabe-465a-8292-5c05e9a24cea?version=4.0). Some SŽ operating/technical documents are public, but “internal use” labels/terms matter; do not assume unrestricted reuse. |
| **Manual pro projektování VRT ve stupni DÚR** | Publicly reachable [SŽ PDF](https://www.spravazeleznic.cz/documents/50004227/50156832/01126+-+p%C5%99%C3%ADloha.pdf/fe8be9ec-3d37-4ded-8cf4-597cf6c5a53c). Its front matter labels it confidential/internal; it specifically says SNCF rights are limited to SŽ use and warns against unauthorized use. Treat figures as research leads, not free-to-reuse game data without permission. |
| Ministry/Roads Directorate **TP** and related guidance | Generally free downloads through [PJPK TP index](https://pjpk.rsd.cz/technicke-podminky-tp/) (e.g. [TP 170 2024](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_170_2024.pdf), its [2025 amendment](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_170_Zmena_c.1_unor_2025.pdf), and consolidated version). Index includes version dates, so avoid stale editions. Many are materials, pavement, traffic or implementation conditions, not substitutes for geometric ČSN. |
| **ČSN Online price** | ČAS currently lists **10,000 CZK/12 months** for the institutional subscription [pricing page](https://agenturacas.gov.cz/produkty-a-sluzby/csn-online/). Older MPO pages give 3,500/1,000 CZK individual tariffs; do not treat them as current. Sponsor access via a participating library may be available. |

**Reuse note (not legal advice):** bare engineering facts, measurements, equations and numeric limits are generally distinguishable from a standard’s protected wording, selection/arrangement, diagrams and tables. Independently derive/express parameters, cite sources, avoid copying table layouts or substantial extracts, and obtain counsel for commercial use—particularly the VRT manual’s express restricted-rights notice. Paying for access is not a blanket republication licence.

## 2. Czech roads: key figures and confidence

The numbers below are a usable scoping map, **not a verified extraction from the paid 2018 ČSN 73 6101**. Only items identified as verified have direct source support; do not hard-code UNVERIFIED values as normative truth.

| Parameter | Reported design values | Status / source |
|---|---|---|
| Category notation | D 27.5/130, D 25.5/130; S 11.5/90, S 9.5/90, S 7.5/70; category number is nominal formation/cross-section width (m), suffix design speed (km/h) | Category families are publicly shown in Czech teaching materials; exact current validity/details **UNVERIFIED**. [ČVUT category lecture](https://k612.fd.cvut.cz/predmety/12SDK/cviceni/vyklad/12sdk-c-01.pdf). |
| Cross-section composition | Common motorway 3.75 m lanes; 3.0–3.5 m paved outer shoulder; median/inner shoulder varies; S roads often 3.5 m lanes, narrower shoulder | All dimensions **UNVERIFIED** against current norm. Category total includes more than lanes; do not equate D 27.5 with two 13.75 m carriageways without checking median details. |
| Two-plus-one | Typical 2+1 cross-section/category and passing-lane lengths | **UNVERIFIED** (requires current ČSN/TP source). |
| Design speed / curve radius and superelevation | 130 km/h motorway design category exists; actual minimum radii by speed, e, friction | **UNVERIFIED** for Czech table. |
| Maximum longitudinal grade | By category, terrain, speed | **UNVERIFIED**. |
| Crest/sag vertical curve radii; clothoid minimum/parameter; max superelevation | Current Czech numeric tables | **UNVERIFIED**. |
| Stopping sight distance | Must control alignment; values by speed/current 2018 method | Czech 2018 revision background says radii must ensure stopping sight distance, but values **UNVERIFIED**. [VUT conference presentation](https://konference-projektovani.cz/wp-content/uploads/2022/03/9.pdf). |
| Interchange spacing, climbing lane trigger, cut/fill slopes, bridge-vs-fill height, tunnel-vs-cut depth | Project criteria and thresholds | **UNVERIFIED**; these are often conditional/economic choices rather than a single mandatory threshold. |

The free urban-road standard includes searchable tables, including curve/sight parameters, but is a 2006 document and should not be silently treated as current. For a simulation, preserve versioned parameter sets and category context.

## 3. Czech rail and EU interoperability

| Topic | Verified facts / limits |
|---|---|
| Czech high-speed design | SŽ VRT manual covers **V ≤ 350 km/h**, with conventional lines at **≤200 km/h**; it distinguishes recommended, limit and exceptional values. Its intended VRT scope is principally passenger-only; mixed traffic has separate chapter. Front matter explicitly says it is an investor requirement and values may be stricter than TSI. SŽ public description states design speed up to 350 and usual curve radius **over 7 km** ([VRT technology](https://vrtky.cz/technologie)); **“over 7 km” is a published typical value, not asserted as universal minimum**. SŽ manual access/reuse caveat above. |
| Curves, cant, cant deficiency, transitions, vertical radii; conventional/regional maximum gradients; track centre spacing and formation width; station gradients | Exact Czech numeric tables **UNVERIFIED** in this research pass. Do not infer 12.5/25/35‰ as universal Czech limits. These depend on line class, traffic, traction, station/yard, and current SŽ rules. |
| EU TSI INF | Free [consolidated TSI, as amended to 28 Sep 2023](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02014R1299-20230928), regulation [1299/2014](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32014R1299). TSI permits **35‰** gradients on main tracks subject to conditions, including continuous 35‰ length **≤6 km**; it is not a general recommendation for freight/mixed lines. For radii **150–250 m**, special straight transition sections are specified. Exact general new-line minimum radius/cant limits are application- and category-dependent; not stated here without table extraction. |
| Railway equations | For standard gauge, equilibrium cant is approximately **Dₑ(mm)=11.8 V²/R**, V km/h, R m (convention-dependent); cant deficiency adds lateral acceleration allowance. Formula provides physics, not a standard limit. |

## 4. Free/generalizable international references

| Jurisdiction/source | Availability / useful scope |
|---|---|
| UK **DMRB CD 109** | Free [official DfT publication](https://www.gov.uk/government/publications/design-manual-for-roads-and-bridges-cd-109-highway-link-design); highway link geometry tables (design speed, radii, sight and vertical curves). Exact 130-km/h equivalent radius/grade **UNVERIFIED** here. |
| UNECE **TEM / AGR** | Public [TEM standards and recommended practice](https://unece.org/transport/terrestrial-transport/trans-european-north-south-motorway-project-tem); [AGR European Agreement](https://unece.org/transport/agreements/agr). International corridor-level standards, not a full national geometric design manual. |
| Germany **RAA / RAL / EKA** | FGSV manuals are generally sold, not fully free. Publisher previews: [RAA](https://www.fgsv-verlag.de/pub/media/pdf/202_E_PDF.v.pdf), [RAL](https://www.fgsv-verlag.de/pub/media/pdf/201_E.v.pdf). RAA names long-distance motorway class EKA 1A with 130 km/h design basis; exact radius/gradient **UNVERIFIED** here. |
| US **AASHTO Green Book** | Commercial/paywalled (AASHTO); not a cheap openly reusable data source. Highway geometry values vary with design speed, terrain, e and design vehicle; numeric figures **UNVERIFIED**. |
| Australia **Austroads** | Some guides/technical papers publicly accessible, core guides commonly paid/member access. Numeric table **UNVERIFIED**. |
| Slovakia **STN 73 6101**, Poland, Austria **RVS** | Slovak STN and Austrian RVS typically paid; Poland’s public regulation on technical conditions for public roads is free law ([Dz.U. 1999 No. 43 item 430](https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU19990430430)). Comparable 130-km/h values **UNVERIFIED**. |

**130 km/h comparison (minimum radius / maximum grade):** Czech ČSN, UK CD 109, Germany RAA, US AASHTO, Poland and Austria: **UNVERIFIED** in this pass. Publishing a seemingly precise cross-country table from unsourced memory would mislead; design speed, superelevation/friction assumptions, motorway class and terrain must be normalized first.

## 5. Physics simplifications (not a replacement for standards)

* Road curve: **R = V²/[127(e+f)]**, with V km/h, R m, superelevation e and lateral-friction factor f as decimals. More conservative comfort/safety envelopes impose speed-specific e/f limits; these are precisely the jurisdiction-specific inputs still needing extraction.
* Rail equilibrium cant: **Dₑ ≈ 11.8V²/R mm** (standard gauge; V km/h, R m). Actual cant is capped; deficiency/excess, transition rate and vehicle/track interaction govern feasibility.
* Stopping sight on level road: **SSD ≈ 0.278Vt + V²/[254(f±G)]** metres (V km/h; perception-reaction time t seconds; longitudinal friction f; grade G decimal, sign by direction). Vertical-curve design then checks available sight length against SSD and algebraic grade difference; curve-radius/length relations vary by crest vs sag geometry and headlight/comfort criterion. Use the standard’s specified t, friction and grade assumptions, not arbitrary defaults.

### Source gaps / decision-useful caveats

Most precise Czech road geometry lives in paid ČSN 73 6101 (2018), and most rail alignment limits in ČSN/SŽ technical rules; no complete, directly attributable parameter tables were verified here. The accessible VRT manual is public to read but marked internal/restricted rights. Free TP/PJPK materials offer excellent construction-cost and pavement-system detail, but are not a free stand-in for the geometry standards. For reliable game values, acquire legitimate current standards or use the public 73 6110, EU TSI and national public law/manuals, keeping unverified engineering heuristics visibly separate.
