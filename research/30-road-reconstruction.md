# Rebuilding a stretch of an existing road

Research snapshot: 2026-11-15. Prices are CZK excluding VAT. **UNVERIFIED** means the primary text/data was not obtained or does not support a definitive value; **PROVISIONAL** marks a game choice, not a measured average. Law and standards are distinguished below. This note complements, rather than repeats, [09-noise-earthworks-urban.md](09-noise-earthworks-urban.md), [11-noise-calculation.md](11-noise-calculation.md), [13-crossing-items-tenders.md](13-crossing-items-tenders.md), [18-footprint-remedies-rates.md](18-footprint-remedies-rates.md), and [20-minor-road-gradients.md](20-minor-road-gradients.md).

## Recommendations at a glance

| Game treatment | Recommended value / rule | Confidence |
|---|---|---|
| Rebuild in place, retain existing alignment | Preserve current plan geometry by default; require current design rules where the works constitute a new/reconstructed road or change its earth body; allow constrained legacy geometry with explicit rationale. | Medium-high on distinction; low on exact legal trigger by project. |
| Change alignment | Treat as new construction on the new alignment for geometry, land, and noise; do not inherit the old road's acoustic status. | Medium-high. |
| Mill and overlay | **~325 CZK/m² direct OTSKP components** for 40 mm ACO 11 + milling 40 mm, before unpriced/uncertain interfaces; **450 CZK/m² PROVISIONAL** all-in game allowance. | High for component prices; low for allowance. |
| Full-depth rebuild | No universal OTSKP “reconstruction per m²” tariff. Build by measured layers. **1,800 CZK/m² PROVISIONAL** only as a simplified game allowance; highly structure-dependent. | Low. |
| Remove asphalt + asphalt-bound base | OTSKP 2026: **11313 786.43 CZK/m³** asphalt-bound cover; **11333 766.96 CZK/m³** asphalt-bound base, both m³ and haul up to 1 km in base row. | High for catalogue values. |
| Restore abandoned road footprint | OTSKP 2026 **18231 28.48 CZK/m²** spread existing topsoil up to 0.10 m on level ground; add seed as separate item. | High for item, medium for complete restoration scope. |
| Noise on existing pre-2001 alignment | Current Annex 3 col. 3 is +18 dB = nominal 68/58 dB; old pre-2023 rule commonly described as 70/60 is superseded except transition cases. | High on current text; limited KHS interpretation evidence. |
| CSD2020 | Free web map and XLSX national result table; RPDI by vehicle category; no verified official shapefile download located. | High on XLSX/map, low on GIS download. |

## 1. What counts as repair, reconstruction, realignment?

### Statutes and norm scope

The terms should not be collapsed into one game action. Under [Decree 104/1997 Sb. §9](https://www.zakonyprolidi.cz/cs/1997-104), paragraph 1 defines **maintenance** as work which “zpomaluje fyzické opotřebení ... předchází jeho následkům a odstraňuje drobné závady”; paragraph 2's **repair** is a change to a completed structure “při které se zachovává vnější ohraničení stavby a při které se zlepšují její parametry a zvyšuje bezpečnost ... při zachování jejího původního půdorysného a výškového vedení.” Paragraph 3 defines **modernisation** as work on completed construction “kterou se při zachování půdorysného a výškového vedení ... zvyšuje její vybavenost nebo použitelnost.” (The live consolidation should be checked at decision date.) The key delimiter is thus not simply the colloquial label: repair is bounded by original horizontal/vertical alignment; modernisation also keeps alignment but improves equipment/use; relocation changes alignment and is a new/altered-build question.

[Act 13/1997 Sb. §12](https://www.zakonyprolidi.cz/cs/1997-13) defines road components and §11 the road land; it does not provide a general engineering-standard grandfathering exemption for every project called “oprava.” Construction authorisation and application of current requirements also depend on the scope and classification of the work under the Building Act. The 2024 Building Act 283/2021 Sb. uses the concept **change to a completed construction**; changes include extension, superstructure, and construction alterations, rather than giving a blanket right to retain unsafe/non-compliant design parameters. **UNVERIFIED:** exact procedural categorisation varies with permitting route and was not fully resolved here; the label used in a budget does not itself settle compliance.

The directly opened public preview at [ČSN 73 6101 catalogue preview](https://csnonlinefirmy.agentura-cas.cz/html_nahledy/73/69709/69709_nahled.htm) is explicitly the **October 2004 edition**, not the current 2018 edition. Its §1 says it applies in open country to “novostavby, přeložky a rekonstrukce spojené s přestavbou zemního tělesa” and defines earth-body reconstruction as widening the crown, raising/lowering profile, or moving the axis within the crown so the original slope(s) cannot remain. This wording is strong historical evidence but **not verified directly in the 2018 text**. Search-indexed previews/catalogue descriptions for the 2018 edition repeat essentially this scope; the full current text is paywalled, so current-edition wording is **UNVERIFIED directly / medium confidence**. In either case, resurfacing/maintenance is not equivalent to earth-body reconstruction. For local roads see [ČSN 73 6110:2006, §1 and §8](https://unmz.gov.cz/files/normalizace/%C4%8CSN%2073%206110/74506.pdf) (public direct norm): local-road design rules expressly address reconstructions, while adaptation to constrained existing built-up conditions is part of design judgement. The accessible edition is 2006; verify amendments/current status before design.

The SFDI/ŘSD [TP 87](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_87.pdf), *Navrhování údržby a oprav netuhých vozovek*, is a road-pavement maintenance/repair method, not an alignment geometry standard. It distinguishes normal maintenance, repair technologies, and “rekonstrukce vozovky” among possible treatments; its chapter 5 calls for diagnostics and evaluating structural layers, and chapter 6 selects a remedy that removes the actual failure mechanism. TP 87 supports treating a pavement-only repair separately from earth-body/route reconstruction, but does not authorize ignoring the road-design standard whenever the road is named “oprava.”

For field tracks, [ČSN 73 6109:2013](https://konference-projektovani.cz/wp-content/uploads/2022/03/10-vebr.pdf) is discussed in the secondary revision presentation cited in [20-minor-road-gradients.md](20-minor-road-gradients.md); the exact current norm scope/repair trigger was not directly verified. Forest road ČSN 73 6108 current full text was not inspected. **UNVERIFIED:** do not infer that specialist standards automatically grandfather every existing track.

### Does every parameter have to be brought up to current values?

**No simple universal “all existing values grandfathered” or “all rebuilt roads upgraded” rule was verified.** A like-for-like pavement renewal that does not change alignment/earth body can keep the existing geometry in practice; a changed alignment, major widening, or earth-body reconstruction is a materially new design scope and should use current applicable criteria unless a documented constrained solution/approved deviation applies. This operational distinction is stronger than any claim that the title “oprava” alone decides it.

The [Decree 104/1997 §36a](https://www.zakonyprolidi.cz/cs/1997-104) specifically says an exception (“výjimku”) may be granted from technical requirements in the identified provisions (§11(1), §12(2), §13(1), §26(1)) through the Building Act procedure. This does not establish that every ČSN value may be waived that way: identify whether the requirement is legally binding or a recommended standard and use the relevant permitting mechanism. Designers also make justified constrained solutions (“odchylné řešení”), but **no defensible national frequency or rate for exceptions on reconstruction was located**. Do not present exceptions as routine or automatic.

**Game rule (PROVISIONAL):** resurfacing only → preserve alignment and profile; full rebuild with earth-body reconstruction → evaluate current standard, report constraints as violations/accepted deviation rather than silently keep every deficiency; realignment → current standard; exception/derogation is a deliberate approval action, not a free geometry toggle. Keep road class/function and design speed explicit.

## 2. OTSKP construction/removal prices

The [SFDI OTSKP page](https://sfdi.gov.cz/cenove-databaze/otskp/) says the system is intended for “výstavby, rekonstrukcí, oprav a údržby” and publishes the **April 2026** catalogue, approved 24 April 2026. The item-list PDF/XLSX is linked there. The prices below are catalogue expert unit rates, not tender awards. Values are excluding VAT. They are measured at the stated item unit; a conversion to m² requires an assumed thickness.

### Pavement surface renewal

| Operation | OTSKP 2026 code | Description | Unit | Rate |
|---|---:|---|---:|---:|
| Mill asphalt paving | 11372 | Frézování zpevněných ploch asfaltových | m³ | 1,366.83 CZK/m³ |
| Remove asphalt cover, transport to 1 km | 113131 | Odstranění krytu zpevněných ploch s asfaltovým pojivem, odvoz do 1 km | m³ | 786.42 CZK/m³ |
| Asphalt concrete wearing layer | 574A33 | ACO 11, thickness 40 mm | m² | 268.89 CZK/m² |
| Asphalt concrete wearing layer | 574A43 | ACO 11, thickness 50 mm | m² | 336.69 CZK/m² |

For 40 mm milling, 1,366.83 × 0.04 = **54.67 CZK/m²**; add ACO 11 40 mm 268.89 = **323.56 CZK/m²**. This does **not** include tack coat, joints, raising covers, traffic management, or any quantities that the item specification allocates separately; avoid also charging 113131 for the same milling operation. Thus **450 CZK/m² PROVISIONAL game allowance** is a rounded planning value, not a sourced national “milling and overlay” unit price. For a 50 mm overlay the two listed components are ~405 CZK/m² before omitted items.

### Full-depth reconstruction and demolition

There is no single universal OTSKP price named “full-depth pavement reconstruction per m²”: layer structure depends on traffic, subgrade, frost, and diagnosis. TP 87 requires selecting repair/reconstruction technology based on pavement investigation, not a fixed rate. Price by quantity and items. Useful 2026 removal rows:

| Code | Item description | Unit | OTSKP 2026 price | Notes |
|---:|---|---:|---:|---|
| 11313 | Odstranění krytu zpevněných ploch s asfaltovým pojivem | m³ | 786.43 CZK | Generic base item; variants specify haul distance. |
| 113131 | Same, haul up to 1 km | m³ | 786.42 CZK | To 1 km. |
| 11313A | Same, without transport | m³ | 712.46 CZK | Transport separate. |
| 11313B | Same, transport | tkm | 17.30 CZK | Pair with no-transport item; do not double count haul. |
| 11333 | Odstranění podkladu zpevněných ploch s asfalt pojivem | m³ | 766.96 CZK | Asphalt-bound base, not all granular subbase. |
| 11333A | Same, without transport | m³ | 664.32 CZK | Transport separate. |
| 11333B | Same, transport | tkm | 17.30 CZK | Pair with no-transport option. |
| 11331 | Removal of stabilized-soil pavement base | m³ | 339.66 CZK | Separate material class. |
| 11372 | Asphalt pavement milling | m³ | 1,366.83 CZK | Milling vs removal scope; use the selected method/item, not both for identical material. |

At assumed cover depth 0.10 m, 113131 equates to 78.64 CZK/m²; at 0.15 m, 117.96 CZK/m². At 0.10 m asphalt-bound base, 11333 is 76.70 CZK/m², before subbase removal. These are arithmetic conversions, not standalone m² prices. Disposal fees and waste classification can be additional and are not represented as free by a catalogue zero/placeholder item.

**Full-depth game proxy (PROVISIONAL, low confidence): 1,800 CZK/m²** for removal and replacement of a typical small-road pavement, excluding utilities, drainage, earthworks, land, and structures. This is a simplified gameplay allowance, not directly observed or an OTSKP composite. Prefer calculating it from chosen thicknesses: demolition items above + excavation/disposal + granular base supply/placement + separate asphalt base/binder/wearing layers. Rebuilding only pavement structure on an existing formation should cost less than reconstructing/raising/widening the road body. Do not charge full base removal if a TP 87 overlay/recycling treatment retains serviceable layers.

### Restoration after road abandonment

| Code | OTSKP 2026 item | Unit | Price |
|---:|---|---:|---:|
| 18231 | Spread topsoil on level ground, layer up to 0.10 m | m² | 28.48 CZK |
| 18221 | Spread topsoil on slope, up to 0.10 m | m² | 39.19 CZK |
| 18231A | Spread purchased topsoil on level ground, up to 0.10 m | m² | 129.43 CZK |
| 18242 | Hydroseed on topsoil | m² | 29.35 CZK |
| 18243 | Hydroseed on subsoil | m² | 32.73 CZK |

18231A/18231/18221/18242/18243 were verified in the official list. Restore existing topsoil and hydroseed on level land = **57.83 CZK/m²** catalogue sum, excluding removal/haul/disposal of pavement, topsoil supply if needed, decompaction, shaping, drainage, and ecological/land-use requirements. Treat restoration as an explicit area item: old road alignment might remain surfaced/accessed rather than automatically become field/woodland.

## 3. Road land and land acquisition

[Act 13/1997 §11](https://www.zakonyprolidi.cz/cs/1997-13) defines “silniční pozemek” as land on which the road body is located **plus auxiliary road land** (“silniční pomocný pozemek”). Thus legal road land is commonly wider than the paved carriageway: it can encompass shoulders, cut/fill slopes, drainage ditches, and other road-related land depending on actual cadastral boundary. The statutory definition is not a standardized fixed-width parcel. Road-body edge is defined by cross-section/terrain and legal boundary; the boundaries can differ from ownership parcels.

**Typical widths by road class: UNVERIFIED.** No universal statutory parcel width per class was found; total varies with standard category, terrain, ditch/cut/fill and land history. The game should use mapped/cadastral road land where available rather than assign a fictitious fixed width based only on class. For local/field/forest roads land may be held under distinct ownership and not neatly represented as national road right-of-way.

Acquisition of additional land is not limited to a particular “extra beyond existing road parcel” formula. If the approved project requires land outside the existing road land, the promoter generally secures it by agreement/purchase or applicable statutory expropriation/land-acquisition procedure; whether compensation and process apply depends on owner and project/public-interest authorisation. **No verified source for a standard purchase price or a standard land-width allowance was located**; see land-cost uncertainty in [18-footprint-remedies-rates.md](18-footprint-remedies-rates.md) and [13-crossing-items-tenders.md](13-crossing-items-tenders.md). Game should charge only incremental footprint outside existing land and mark unit value scenario-specific, not charge acquisition for already-owned road land.

## 4. Noise status of resurfaced, reconstructed, and relocated roads

The operative source opened was the consolidated [NV 272/2011 Sb.](https://www.zakonyprolidi.cz/cs/2011-272), including amendment 433/2022. Under §12(3), ordinary protected outdoor residential space starts at 50 dB plus Annex 3 corrections. Annex 3 A, rule 2: correction +10 dB applies to road/rail traffic noise from infrastructure placed/permitted after 31 Dec 2000. With night correction −10 dB, ordinary limits become **60 dB day / 50 dB night**.

For older roads, Annex 3 A, rule 3 applies column 3 (+18 dB in the current consolidated text) to roads placed/permitted before 1 Jan 2001. That gives nominal **68/58 dB** for ordinary protected outdoor building space (50 +18 by day; minus 10 at night). The often-quoted **70/60 dB** is associated with the earlier +20 dB correction; it is not the current generic value after NV 433/2022. Annex corrections do not stack: “Korekce uvedené v tabulce se nesčítají.” The railway-specific rule differs.

Critical §2(q) definition (current text): maintenance/reconstruction/modernisation/capacity increase of a road means work “související s položením nového povrchu vozovky nebo rozšířením vozovky při zachování směrového nebo výškového vedení pozemní komunikace nebo jiná související úprava.” Annex rule 3 expressly extends old-road treatment to activity under §2(q) on pre-2001 roads after 1 Jan 2001. Therefore **new pavement on the same alignment or widening while retaining horizontal/vertical route can retain the old-road correction under the text**, subject to the qualifying historic permit and the exact project classification. This is not blanket old-load status for any road branded “reconstruction.”

**Relocation:** moving a road onto a new alignment does not satisfy the quoted §2(q) “zachování směrového nebo výškového vedení” condition. The new alignment should be treated as a new road for noise limit status (60/50 at ordinary receptors), unless a competent authority determines the facts are otherwise or another specific legal basis applies. A hybrid job should assess retained and new segments separately. I found no MZd/KHS methodology that authoritatively declares every relocated road “inherits” the former road's old-load correction; **UNVERIFIED practice**. The legal text points against inheritance for a true relocation.

[Act 258/2000 §30](https://www.zakonyprolidi.cz/cs/2000-258) establishes duties concerning noise sources and their operators; the old/new infrastructure corrections and qualifying “stará hluková zátěž” treatment are set by NV 272/2011 and its Annex 3, not a free-standing road-name exemption. For older legal history/interpretations consult [11-noise-calculation.md](11-noise-calculation.md); that note covers current 60/50 calculation for new roads. MZd's [2023 amendment explanation](https://mzd.gov.cz/novela-narizeni-vlady-o-ochrane-zdravi-pred-nepriznivymi-ucinky-hluku-a-vibraci/) and the official consolidated text should be read together: transitional Article II preserves specified already-open proceedings/permitted/acoustic measures, not a universal grandfathering of future projects. **Confidence: high for quoted current regulation; medium for applying it to borderline staged projects.**

## 5. CSD2020 traffic data availability

The official ŘSD [CSD2020 application](https://scitani.rsd.cz/csd_2020/pages/map/default.aspx) and its [detailed outputs page](https://scitani.rsd.cz/csd_2020/pages/shop/default.aspx) are openly accessible. The latter says detailed outputs include “RPDI ... všech sledovaných a vypočítaných kategorií vozidel,” direction ratio, and variation coefficients. Categories include O, LN, SN/SNP, TN/TNP, NSN, buses, tractors, two-wheel vehicles, totals SV/TNV, and model-converted acoustic categories. It warns that noise/emissions category tables were converted with TP 219 valid when the results were published; for current work use current TP 219.

The data are freely downloadable as the national **XLSX “Výsledná sestava V2”** (reported by ŘSD page; direct link not exposed in the extracted page content), and the web map is a public browser interface. The map/app link above is the verified URL. Public pages describe outputs per counted road section; RPDI and vehicle-category fields, not simply one undifferentiated AADT. The app was counted over selected periods in 2020 and spring 2021, with values annualized to RPDI. CDV states CSD2020 covered 6,465 sections: [CDV summary](https://cdv.gov.cz/aktuality/novinky/vysledky-celostatniho-scitani-dopravy-2020-csd2020/).

**GIS:** a freely downloadable shapefile or authoritative open API URL was not verified. An ArcGIS item for “Intenzita silniční dopravy (2020)” exists ([ArcGIS item](https://www.arcgis.com/home/item.html?id=42a4242cf141469692fff75a8291e51c)), but this alone does not prove a downloadable official feature service/shapefile. Do not promise a shapefile export in-game workflow without checking the service metadata. Published application/map and XLSX are sufficient manual data sources.

## 6. Source register and caveats

- Primary regulation: [NV 272/2011 consolidated](https://www.zakonyprolidi.cz/cs/2011-272), §2(q), §12, Annex 3 A; [Act 13/1997](https://www.zakonyprolidi.cz/cs/1997-13), §11; [Decree 104/1997](https://www.zakonyprolidi.cz/cs/1997-104), §9, §36a. These legal pages were opened.
- Primary OTSKP catalogue: [SFDI OTSKP page](https://sfdi.gov.cz/cenove-databaze/otskp/) opened; its April 2026 item workbook/PDF was directly inspected for the cited codes and rates. Prices are expert catalogue rates, not awards.
- Road-pavement methods: [TP 87 PDF](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_87.pdf) opened. It specifically focuses on net pavement maintenance/repair and diagnostics, not a one-size geometry reconstruction cost.
- Norm access: [ČSN 73 6101 public preview](https://csnonlinefirmy.agentura-cas.cz/html_nahledy/73/69709/69709_nahled.htm) opened and confirmed as the **2004 edition**, not current 2018; [ČSN 73 6110:2006 public norm PDF](https://unmz.gov.cz/files/normalizace/%C4%8CSN%2073%206110/74506.pdf) is also older. Current licensed standards should be checked for actual project design.
- Traffic data: ŘSD [CSD2020 map](https://scitani.rsd.cz/csd_2020/pages/map/default.aspx), [shop/output page](https://scitani.rsd.cz/csd_2020/pages/shop/default.aspx), and [application information](https://scitani.rsd.cz/csd_2020/pages/informations/default.aspx) opened.
- No tender-award sample with comparable geometry and isolated resurfacing/full-depth costs was assembled. Hence exact “all-in” game rates remain explicitly provisional; retain item-level pricing where possible.
