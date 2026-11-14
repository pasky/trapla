# Crossing-related construction costs: Czech tender and norm evidence

Research note for `src/core/data/urban.ts` (values CZK excluding VAT). Prices are nominal at the tender/estimate year unless stated; do not silently treat old awards as 2026 prices. The target is marginal construction cost for a game-scale crossing intervention, not total bypass cost.

## Findings / recommendations

| Item | Recommended game value (range) | Confidence and interpretation |
|---|---:|---|
| New at-grade T/X junction, class I with class II/III, turning lanes | **25m** (15–35m) | Low. No sufficiently documented isolated tendered T/X cost was located. This remains a design-stage allowance, not an observed mean. Use roundabout awards only as an upper-neighbourhood cross-check. |
| Reconnect severed local street / local road (short realignment + tie-in) | **4m** (2–8m) | Very low. No isolated construction-SO price with a traceable quantity was found. Broadly plausible allowance, not a measured unit rate. |
| Reconnect one property access / driveway | **0.5m** (0.2–1.5m) | Very low. There is no isolated measured-price set. The 1m placeholder is conservative for a simple driveway; retain 1m where access requires a substantial culvert, retaining work, or a longer service-road link. |
| Divert a field/forest track | **1.5m/km** for simple unpaved/gravel track; game event **0.5m** for a short diversion (0.2–1.5m) | Low for a paved high-spec field-road benchmark, very low for an unpaved track. Real SPÚ projects range from about 3.5m/km (2014, economical track) to 7.3m/km (2024, paved/high-spec work). The 0.5m fixed amount is credible only for a short/low-standard diversion. |
| Small field-track/local-road overbridge | **5m/piece** (3–10m), or **66,500 CZK/m² deck** (about 48,000–95,000) | Medium for SPK study-stage norm proxy, low for actual individual tender costs. Keep bridge approaches/earthworks separate if the simulation can do so. |

## Data points

All prices below exclude VAT. A dash means that the public source did not provide an isolated cost/quantity; no price has been inferred from a whole-project award and presented as if it were an SO price.

### (a) At-grade junctions and nearby cross-checks

| Project / object | Quantity | Price | Year | Source and relevance |
|---|---:|---:|---:|---|
| I/15 Lovosice, new roundabout (not T/X) | 1 | 31m | 2026 announced | [ŘSD announcement](https://kraje.rsd.cz/ustecky/v-lovosicich-vznikne-nova-okruzni-krizovatka-na-i-15/). Useful upper-side comparator only; different geometry/scope. |
| I/30 Chlumec, conversion to roundabout (not T/X) | 1 | 31.779m | 2026 announced | [ŘSD announcement](https://kraje.rsd.cz/ustecky/na-jare-zacne-prestavba-krizovatky-i-30-u-chlumce-na-okruzni/). Includes site-specific tie-ins; not a unit-rate analogue. |
| I/49 Slušovice roundabout (not T/X) | 1 | 36m | 2024 | [ŘSD announcement](https://kraje.rsd.cz/zlinsky/na-jare-zacneme-budovat-okruzni-krizovatku-na-i-49-u-odbocky-na-slusovice/). Upper comparator. |
| I/38 × II/408 Kasárna roundabout (not T/X) | 1 | 37.5m | 2025 | [ŘSD announcement](https://kraje.rsd.cz/jihomoravsky/nova-okruzni-krizovatka-u-obce-kasarna-zacne-ridicum-slouzit-od-28-rijna/). Upper comparator. |
| Veselí nad Moravou roundabout (not T/X) | 1 | 19.76m | 2024 | [ŘSD announcement](https://kraje.rsd.cz/jihomoravsky/nova-okruzni-krizovatka-ve-veseli-nad-moravou-zacne-ridicum-slouzit-o-prazdninach/). Lower comparator. |

These 19.76–37.5m awards make 25m for a simpler at-grade T/X plausible, but do not validate it; the estimated T/X price is deliberately kept at low confidence. Turning lanes, drainage, utility relocations, signals, and extent of reconstruction can move the total substantially.

### (b) Severed local road / street realignment

| Project / object | Quantity | Price | Year | Source and relevance |
|---|---:|---:|---:|---|
| D11 Jaroměř–Trutnov design services, SO 132 “Přeložka místní komunikace v km 2.235” | Not reported as a priced construction quantity | — | 2025 document | [Contract attachment / scope list](https://smlouvy.gov.cz/smlouva/soubor/40190288/7657%20D2%2010PT-000821%20dod.2%20definitivn%C3%AD%202025_03_26%20pv%20vs-anonym.pdf?backlink=6g1jj). Confirms an applicable object type, but it is a design-services contract and supplies no construction SO price. |
| D11 Jaroměř–Trutnov, SO 131 “Přeložka silnice III/284 26” (multiple subobjects) | Not reported | — | 2025 document | Same source. Road-class III realignment is named, but the document prices design work, not construction. |
| D11 Jaroměř–Trutnov construction award | 19.6 km whole highway | 9.08bn | 2025 | [ŘSD announcement](https://www.rsd.cz/-/%C5%98editelstv%C3%AD-silnic-a-d%C3%A1lnic-za%C4%8Dalo-stav%C4%9Bt-posledn%C3%AD-chyb%C4%9Bj%C3%ADc%C3%AD-%C3%BAsek-d11). Not suitable for allocating a side-road object price; reported only to identify the relevant project, not used in the estimate. |

No observed unit rate or adequate 3–5 point cost sample found for a short local-road reconnection. The 4m recommendation is a game allowance. Tender announcements and project descriptions often enumerate SOs without publishing the winning construction bill of quantities; project-level highway totals cannot be allocated credibly to an individual relocation.

### (c) Property-access reconnection / service road

| Project / object | Quantity | Price | Year | Source and relevance |
|---|---:|---:|---:|---|
| I/9, I/16 Mělník, SO 120 “Obslužná komunikace podél silnice I/9, I/16” | Length/area not legible in public price extract | — | 2024 | [ŘSD contract, price schedules](https://smlouvy.gov.cz/smlouva/soubor/36258140/Smlouva%20%2004PU-000661%20%C4%8D%C3%A1st%203.pdf). Project identifies separate service-road object and SO 122–125 individual sjezdy; public extracted summary gives project total 63.5m but not usable separate SO prices/quantities. |
| Same project, SO 122, 123, 124, 125 (sjezdy/accesses) | 6 access locations across four SOs, per object schedule | — | 2024 | Same source. The PDF object list names access points at km 0.014, 0.063, 0.615, 0.643 and two rail-property accesses; no separate comparable price/quantity found. |

There is no defensible price-per-metre for a parallel service road in this evidence. Its cost depends on pavement, length, drainage, retaining works, and parcel/access layout; do not use the 1m driveway allowance for a long service road. Price a driveway as a one-off minor work; model a parallel road by length using the ordinary local-road construction rate if possible.

### (d) Field / forest track

| Project / object | Quantity | Price (ex VAT) | Derived rate | Year | Source |
|---|---:|---:|---:|---:|---|
| Polní cesta PC7, Brzice, SO 101.1 “Polní cesta” | Whole project road length 2,218.93m; SO 101.1 is the principal field-road object | 14,160,110 CZK | **6.38m/km** (SO price / whole stated route length; approximate because exact SO length may differ) | 2024 | [SPÚ tender price schedule](https://zakazky.spucr.cz/document_audit_879292/a-smlouva-priloha-c-2-rozpocet-stavby-brzice-pdf); [SPÚ project summary with length](https://spu.gov.cz/frontend/webroot/uploads/files/2025/05/polni_cesta_pc7_v_k25207.u25207._brzice25207.pdf). SO 101.1 price excludes SO 101.2 in built-up section, planting and VRN. Overall construction subtotal 16,178,167 CZK. Paved, drainage-inclusive road, not a basic track. |
| Polní cesta PC7, Brzice, total project | 2,218.93m | 16,178,167 CZK | **7.29m/km** | 2024 | Same sources. Includes SO 101.2 built-up road, planting and ancillary costs; useful high-spec all-in benchmark, not a plain track rate. |
| SPÚ “kolejové polní cesty na Nymbursku” | approx. 0.78km | 2,764,000 CZK | **3.54m/km** | 2014 | [SPÚ project report](https://spu.gov.cz/tiskovy-servis/aktuality/archiv/stredocesky/vystavba-kolejovych-polnich-cest-na-nymbursku.html). Includes greenery; much older and a lower-standard track. |
| VC8, k.ú. (SPÚ procurement estimate) | 0.30419km | 1,320,208 CZK | **4.34m/km** | procurement page; estimate year not clearly stated in indexed source | [SPÚ procurement record](https://zakazky.eagri.cz/contract_display_2091.html). This is a *predicted* value, not verified awarded/paid cost; treat as weak support only. |

A “field road” in SPÚ sources is often a fully designed, paved, drained common facility, not an unpaved farm track. The 3.5–7.3m/km observations therefore bound the paved-road case; a short gravel diversion can be far cheaper. The proposed game rate 1.5m/km and 0.5m short-event default are engineering allowances, not direct empirical estimates. No reliable forest-road construction contract unit-rate sample was found in this pass.

### (e) Small overbridge

No 2020–2026 publicly extractable winning SO price with both bridge-deck area and individual bridge price was found. The best reproducible quantity-normalized evidence is SFDI SPK CN (study-level standardized cost database), not a tender award.

| SFDI SPK CN 2026 code / carried-road width | Catalog cost / km | Implied standard deck cost | Year | Source |
|---|---:|---:|---:|---|
| A.2.S.4,0.N | 309.613m/km | **77,403 CZK/m²** | 2026 | [SFDI SPK CN](https://sfdi.gov.cz/cenove-databaze/spk-cn/); width-normalized proxy (309.613m ÷ 1,000 ÷ 4.0m). |
| A.2.S.6,5.N | 432.476m/km | **66,535 CZK/m²** | 2026 | Same source; 432.476m ÷ 1,000 ÷ 6.5m. Most applicable nominal width for a local-road crossing. |
| A.2.S.7,5.N | 481.621m/km | **64,216 CZK/m²** | 2026 | Same source; 481.621m ÷ 1,000 ÷ 7.5m. |
| A.2.S.9,5.N | 579.911m/km | **61,043 CZK/m²** | 2026 | Same source; 579.911m ÷ 1,000 ÷ 9.5m. |

These are width-normalized costs of standardized bridge objects, not a pure superstructure price per measured deck square metre; catalog assumptions, approaches, foundations and object limits matter. SFDI minimum/standard/maximum scenarios for the 6.5m row are 375.389/432.476/619.306m per km, or **57,752/66,535/95,278 CZK/m²** by the same calculation. A 10–20m span × 4–6.5m deck gives a rough standard proxy of 2.7–8.6m; thus 5m/piece is a reasonable short-span game default, excluding difficult foundations and long approaches.

## Data quality / use

- ŘSD tender documentation often lists objects but the accessible document may be a design contract, while the construction price schedule is not public or not indexed. A total highway award is not a defensible proxy for a single access or local-road relocation.
- For stronger calibration, retrieve winning construction “Rekapitulace objektů”/soupis prací from ŘSD Ceny staveb, Tenderarena or regional KSÚS profiles. Filter specifically for SO 1xx road/access objects and capture each object's actual geometry and amount, excluding VAT.
- Keep `JUNCTION` at 25m only as an explicit low-confidence allowance. For access, distinguish a single driveway from a parallel service road (cost per length). For tracks, distinguish unpaved diversion from paved SPÚ-standard road. For bridges, use deck area × SPK proxy and add site-specific approaches separately.
