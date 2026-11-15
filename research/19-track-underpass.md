# Small track/local-road underpasses under Czech road embankments

**Basis / confidence:** OTSKP rates below are catalogue 2026 CZK, excl. VAT (high confidence as extracted, medium as applied to a real design). Norm values are from published technical presentations reproducing ČSN 73 6201; consult the licensed current standard/project authority before design (medium-high). I did not find publicly indexed awarded cost breakdowns with both an underpass SO price and its dimensions; no award price is fabricated here.

## 1. Clearance and geometry

- **Bridge clearance is not one number for all roads.** Reproduction of ČSN 73 6201 gives basic vertical clearance: **4.80 m** on motorways and class I/II roads; **4.50 m** on class III and local roads category *rychlostní/sběrná* (MK-R/MK-S); **4.20 m** on local roads *obslužná/veřejně přístupná účelová* (MK-O/MK-Ú). The standard accounts for a further 0.15 m operational allowance in some design cases (example project requires 4.20 + 0.15 = 4.35 m), so don’t assume a 4.20 m clear opening satisfies every interpretation/project. **Sources:** ŘSD guidance summarizing ČSN 73 6201 §6.3.2: https://www.rsd.cz/documents/38144/57719/R+111+_Vzory+zna%C4%8Den%C3%AD+_Nízké+a+úzké+podjezdy.pdf/b67631e6-6660-b267-446e-e607a3bd3d45?t=1726659829807 ; CVUT lecture with same table: https://concrete.fsv.cvut.cz/~drahomic/Vyuka/BM01/Prednasky/BM01_Pr02.pdf ; example project: https://zakazky.kr-stredocesky.cz/document_101297/3bb5cc4bba6efc32f201d6d6068bcce7-201_01_technicka_zprava-pdf. **Confidence: medium-high.**
- **Field tracks:** ČSN 73 6109 governs their design, but accessible search results did not expose a verifiable clause prescribing a special under-bridge vertical clearance. For a publicly accessible field/forestry/utility track, ČSN 73 6201’s **4.20 m** public-purpose route value is the defensible baseline; allow 4.35 m where the 0.15 m allowance is applied. A 4.50 m opening is a sensible agricultural-vehicle design target, not a verified universal norm minimum. **Confidence: medium.** ČSN 73 6109 overview/reference: https://konference-projektovani.cz/wp-content/uploads/2022/03/10-vebr.pdf
- **Width:** no separate universal “underpass clear width” minimum was verified in the accessible norm sources. Width follows the road/track cross-section, shoulders and safety envelope. ČSN 73 6109 track roadways commonly range about **3–4 m** (main tracks wider, with passing/turning needs); use **4–6 m clear** as an estimating design range for agri vehicles, and **7–9 m** for a two-way local road, not as a quoted norm minimum. CVUT project/cross-section material: https://storm.fsv.cz/data/files/p%C5%99edm%C4%9Bty/GPU/prednasky%20GPU/GPU2016_polni_cesty_bez_obr.pdf ; ČSN 73 6110 text: https://unmz.gov.cz/files/normalizace/%C4%8CSN%2073%206110/74506.pdf. **Confidence: medium-low** for ranges.
- **Top structure/cover:** no fixed slab thickness/cover minimum can be generalized from the above standards; it depends on span, load, soil and road pavement. For preliminary costing only, assume a **0.45–0.60 m** RC roof slab and **0.50–1.00 m** from slab top to finished road surface for waterproofing, protection/cover and pavement. These are estimating assumptions, not normative minima (**low confidence**). Thus a 4.50 m track clear height implies roughly **5.45–6.10 m** from track pavement to road surface; local-road 4.80 m clearance implies **5.75–6.40 m**. Add any grade/profile constraints.

## 2. 2026 catalogue rates and calculated structural rates

Source: official SFDI OTSKP April 2026 archive https://sfdi.gov.cz/wp-content/uploads/2026/04/otskp-2.zip (Appendix 2 item workbook). Catalogue rates, CZK excluding VAT:

| OTSKP item | Description | Unit | Price |
|---|---|---:|---:|
| 91841–91845 | Prefabricated frame culverts 200/100 through 300/200 | m | 38,191.59–61,052.44 |
| 389325 | Cast-in-place RC bridge frame C30/37 | m³ | 13,886.89 |
| 389385 | RC bridge frame C30/37 **including reinforcement** | m³ | 21,572.46 |
| 389365 | Frame reinforcement, B500B | t | 42,334.95 |
| 333325 | RC bridge abutments and wings C30/37 | m³ | 9,377.28 |
| 711412 / 711442 | Full-area asphalt strip waterproofing / with sealing layer | m² | 678.06 / 806.81 |
| 451315 | Plain concrete bedding/fill C30/37 | m³ | 5,205.89 |
| 457315 | Plain leveling/fall concrete C30/37 | m³ | 5,249.42 |

The 91841–91845 size series stops at a 3.0 × 2.0 m frame; it is **not** a relevant complete frame rate for the 4–8 m openings here (details and scope: [17-culvert-prices.md](17-culvert-prices.md)). Use the bridge-frame concrete items instead. 389385 includes reinforcement; do not also add 389365 unless pricing concrete and rebar separately (389325 + reinforcement). Catalogue line scope is not an all-in project cost.

**Derived frame-only rate (not catalogue rate):** simple closed box geometric concrete quantity per metre, multiplied by 389385, plus deck waterproofing at 711442. Assumed thicknesses: track box 0.50 m walls/roof, 0.45 m invert; local road box 0.60 m walls, 0.65 m roof, 0.50 m invert. No haunches, parapets, transitions, excavation, backfill, traffic management or approaches.

| Design assumption | Concrete volume | Frame + top waterproofing / metre |
|---|---:|---:|
| 5.0 × 4.5 m clear track box | 6.0 × 5.45 − 5.0 × 4.5 = 10.20 m³/m | **~224,900 CZK/m** (10.20 × 21,572.46 + 6.0 m² × 806.81) |
| 8.0 × 4.8 m clear local-road box | 9.2 × 5.95 − 8.0 × 4.8 = 16.34 m³/m | **~359,900 CZK/m** (16.34 × 21,572.46 + 9.2 m² × 806.81) |

*Corrected after review:* the first draft listed 10.96 / 17.12 m³/m and 5.8 / 8.8 m waterproofing widths,
inconsistent with its own thicknesses. The game (`underpassAssembly`, `src/core/data/remedies.ts`)
computes the quantities from the geometry and adds 0.15 m bedding (451315) and the crossed way's own SPK
pavement through the box: **243,551 CZK/m** (track) and **383,468 CZK/m** (local road, using a 4.50 m
clear height — ČSN 73 6201's value for class III / collector local roads — rather than the 4.80 m class
I/II example above).

These rates assume full-area included-rebar frame construction; unit prices vary with formwork/access and design. Add floor/bedding concrete, drainage, headwalls/wings and road/track reinstatement. **Confidence: medium-low** as planning estimates; formulas and catalog rates are high-confidence.

## 3. Project/award evidence and limitations

I could verify project identities and some geometry, but not find a public, project-specific priced BOQ line for the underpass object in accessible indexed sources. Whole-contract prices or engineering estimates cannot be attributed to an individual crossing, so they are not presented as its cost.

- **I/53 Lechovice bypass, SO 204 “Most na polní cestě v km 2,370”:** construction article reports total contract price **270,793,805 CZK excl. VAT**, but not SO 204’s share or its dimensions; this is explicitly *not* used as a unit rate. https://silnice-zeleznice.cz/silnice/vystavba-mostu-na-i-53-lechovice-obchvat-108 (2019). **Confidence: high** for stated total; unusable for individual bridge costing.
- **I/34 Havlíčkův Brod south-west bypass:** project report identifies a three-span “Most na polní cestě přes jihozápadní obchvat”, length **57.35 m**; not a small underpass and no object price given. https://www.muhb.cz/html/soubory/Z-20260413/64/priloha92628_I34_Havlickuv_Brod_JZ_obchvat_zprava_komplet20260224_compressed_7c3ceaaabac246efb050da9c76bf24b4.pdf. **Confidence: medium-high** for dimensions; not comparable.
- **I/12 Běchovice–Úvaly, SO 225 “Přesypaný most na polní cestě P. Újezd n. Lesy–Sibřina”:** project technical guide identifies object, but published guide’s **6,296,459,000 CZK** is the complete project estimate, not the object price; dimensions not verified from this source. https://www.mestouvaly.cz/wp-content/uploads/2019/04/TPS_S12-Bechovice-Uvaly_2016-04-25_web_1461574661593.pdf. **Confidence: high** for project/object identification; not price-comparable.
- **D6 Řevničov field roads:** SPÚ procurement describes SO 201 as a bridge on field road VPC 2, but tender’s **71,803,600 CZK** estimated value covers the field-road package, not that bridge alone. https://zakazky.spucr.cz/vz00045451. **Confidence: high**; not object-price evidence.

SFDI’s SPK CN is a study-stage normative database; public landing page confirms the source but I could not substantiate a matching 2026 small-bridge m² row from accessible material. Do not substitute an unverified per-m² figure. https://sfdi.gov.cz/cenove-databaze/spk-cn/ (**Confidence: high** that it exists, low on any specific rate not extracted.)

## 4. Portal ends and additional items

- Each portal’s wings/headwall need project design. Approximate planning allowance: **200,000–450,000 CZK per end** (two ends **0.4–0.9 million CZK**) for modest RC wings/face, foundations, reinforcement/formwork, waterproofing terminations and protection. The catalogue anchor is 333325 at **9,377.28 CZK/m³**; an assumed 15–30 m³/end gives 141–281k CZK for wing/abutment concrete linework before foundation, excavation, facing/finishing and item-specific scope. **Derived, low confidence**; not a quoted package price. Larger retaining wings, high embankments or poor ground can exceed this substantially.
- Include underpass-floor drainage (longitudinal channel/trench drain, sump and possibly pump if gravity drainage is impossible), outlet and maintenance access; a low point without reliable drainage is a major lifecycle risk. No generic amount asserted (site-dependent).
- Include track pavement through the box (granular base and bound/unbound surface to match track; local-road pavement structure for MK), transitions, edge restraint/kerbs, signs/height gauges where required, lighting only if specified, and approach reinstatement. Separate from frame estimate.

## 5. Recommended simple game-estimating model

**RECOMMENDATION (2026 catalogue basis, CZK excl. VAT):** `cost = L × rate(size) + 2 × head(size)`.

- Track/agricultural: **L × 225,000 CZK/m + 2 × 200,000–450,000 CZK**; use **225k/m and 300k/end** central estimate. Typical clear box **5 × 4.5 m** (practical range width 4–6 m; height 4.2–4.5 m). At 25–60 m long: central total **6.2–14.1m CZK** (range from chosen heads: 6.0–14.4m).
- Local road: **L × 360,000 CZK/m + 2 × 300,000–600,000 CZK**; central **360k/m and 450k/end**. Typical clear box **8 × 4.8 m** (width 7–9 m; vertical clearance should follow road class: 4.20/4.50/4.80 m). At 25–60 m: central total **9.9–22.5m CZK**.
- Rates are structural box + roof waterproofing only, with modelled reinforcement and geometry. Head allowance covers two portals, not all drainage/roadworks; add **10–25%** for floor drainage, track pavement, concrete bedding, ends variability and minor incidentals if a more complete game cost is needed (**low confidence allowance**). Exclude VAT, land, approach-road construction and exceptional foundations/retaining systems. Shorter fill/deck can reduce cover cost; widening, skew, difficult access and higher embankment can increase it.
- Minimum conceptual fill top-to-track grade: **clear height + roof slab + cover/pavement**. Use **~5.5–6.1 m** over track pavement for 4.5 m clearance and **~5.8–6.4 m** for 4.8 m local road clearance (assumptions above; low confidence, project-specific). No norm minimum cover is claimed.

**Overall confidence:** medium for class-based clearance; low-medium for rates/head allowances; low for project analogues because object-level public awards were not verifiable. Treat the model as a transparent early-stage estimate, not a tender forecast.
