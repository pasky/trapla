# OTSKP 2026 rates for footprint remedies: walls and channel relocation

Research snapshot: 2026-11-14. Prices are official OTSKP 2026 catalogue rates in CZK, excluding VAT. These are not awarded-project prices. No implementation recommendation is made here.

## Source and verification

Primary source: [SFDI OTSKP database page](https://sfdi.gov.cz/cenove-databaze/otskp/) and the actual [April 2026 OTSKP archive](https://sfdi.gov.cz/wp-content/uploads/2026/04/otskp-2.zip). Downloaded as `/tmp/otskp-2026.zip`; inspected workbook at `/tmp/otskp-xlsx/OTSKP/otevřený_formát/Příloha č.2 OTSKP 2026 - soubor položek_20260410.R1.Shared.xlsx` (archive member path: `OTSKP/otevřený_formát/Příloha č.2 OTSKP 2026 - soubor položek_20260410.R1.Shared.xlsx`). Workbook was read with `openpyxl` `read_only=True`, `data_only=True` under a 1.5 GB virtual-memory limit. Codes, descriptions, units, rates, and the cited scope were checked in the workbook's item rows/specification text. The official item list itself is the cited source for all rates below.

Existing relevant research read first: [16-official-items.md](16-official-items.md), [17-culvert-prices.md](17-culvert-prices.md), [17-stream-crossings.md](17-stream-crossings.md), [17-stream-validation.md](17-stream-validation.md), plus the bridge component CSVs under [`data/`](data/). The previous research confirms that culvert barrels are separate from bedding/encasement and that creek/river diversions have not previously been priced.

## Retaining / opěrné / zárubní walls

The catalogue has no universal wall rate in CZK/m² of exposed face; relevant concrete and reinforcement are priced by volume and mass. These direct rows are suitable source anchors, not complete retaining-wall assemblies:

| Code | Official item (abridged) | Unit | CZK/unit | Scope note |
|---|---|---:|---:|---|
| 327325 | Opěrné, zárubní, nábřežní walls, reinforced concrete C30/37 | m³ | 9,343.92 | Concrete placement and specified formwork/falsework, joints, surface preparation; **explicitly excludes reinforcement**. In-ground portions include the listed moisture-isolation treatment. |
| 327365 | Reinforcement of opěrné/zárubní/nábřežní walls, steel 10505 | t | 41,635.80 | Supply, fabrication, transport, fixing and protective treatment of reinforcement. Separate from 327325. |
| 327211 | Opěrné/zárubní/nábřežní walls of dry-laid quarry stone | m³ | 3,381.62 | Stone supply, selection/adjustment, bonding material and laying; distinct alternative to RC. |
| 3272A1 | Hand-faced gabion retaining/abutment/bank walls, Zn+Al coated 2.2-mm wire | m³ | 4,616.71 | Supply and setting of baskets filled with quarry stone. **Gabion mattresses are excluded** and priced separately under 2722**. |
| 3272B1 | Filled gabion walls, Zn+Al coated 2.2-mm wire | m³ | 3,711.55 | Same stated basket/stone scope; gabion mattresses excluded. |
| 2722B1 | Filled gabion foundations/mattresses, Zn+Al 2.2-mm wire | m³ | 3,711.55 | Separate mattress item, described as mattresses up to 300 mm thick. Not additive to a full wall-volume quantity unless a separate mattress is actually specified. |

### Behind-wall drainage and filter rows

| Code | Official item (abridged) | Unit | CZK/unit | Scope / coordination |
|---|---|---:|---:|---|
| 212625 | Complete plastic drain (`trativod`) up to DN100, trench class I | m | 368.45 | Complete trench construction: excavation in specified class, bed, drain pipe, specified fill/surround and backfill, handling/placement of surplus, connection into a pipe/watercourse or terminal chamber per standard detail, materials and transport. **Excludes geotextile/foil wrapping.** This is a direct small-drain per-metre row; the listed class-specific alternatives include 212626 (class II, 562.72/m) and 212627 (class III, 1,150.90/m). Do not add standalone trench excavation, pipe, or the same trench aggregate again. |
| 21262 | Complete plastic drain up to DN100, no trench-class suffix | m | 387.18 | Same complete-construction scope; use only where its generic specification is appropriate, not together with 212625. |
| 21150 / 21152 | Drainage ribs of aggregate / crushed aggregate | m³ | 1,089.09 / 1,157.95 | Supply and placement of specified aggregate (normally purchased unless the contract says otherwise). Quantity is specified rib/filter volume; separate excavation and geotextile are not stated as included. |
| 21151 | Drainage ribs of quarry stone | m³ | 1,374.98 | Supply and placement of specified stone; alternative aggregate material, not additive to 21150/21152 for the same volume. |
| 214613 | Separation geotextile S1, significant filtration function | m² | 77.11 | Supply, substrate preparation, fastening/weighting, seams/edges, drainage adaptations, required overlaps and transport; overlaps are not measured. |
| 21361 | Drainage layer made of geotextile | m² | 76.43 | Supply and forming of the prescribed drainage geotextile layer including necessary overlaps and transport. Alternative specification to 214613, not automatically additive. |
| 21364 | Drainage composite | m² | 182.78 | Supply and installation of prescribed composite, substrate prep, fastening, joints/edges, drainage adaptations, overlaps and transport. Alternative to a geotextile drainage layer where specified. |

For a transparent 1 m-high, 1 m-long wall sketch, one 212625 drain metre corresponds to 368.45 CZK per running wall metre. If a separate vertical filter blanket is specified, its measured area is wall height × length (1 m² in that sketch), at 214613's 77.11 CZK/m²; add filter aggregate only for a separate layer/rib not already included as the 212625 trench filling. The illustrative wall subtotal plus one drain metre and one square metre of filter blanket is therefore **9,794.61 CZK per m² face** for this 1 m-high sketch (unrounded sum 9,794.607); this is still not a designed/scalable tariff. OTSKP 212625 already includes the pipe and its granular bed/fill/surround, so the pipe/trench and those same materials must not be double-counted with 211* rows. Whether a separate filter blanket is needed, how it terminates/outlets, and whether the drainage detail is suitable are project-specific.

### Transparent provisional RC face-area conversion

One illustrative, **not designed or catalogue-tariff** conversion: 1.0 m exposed wall height × 1.0 m wall length (thus 1 m² exposed face), cantilever section with 0.25 m stem and a 1.50 m-wide × 0.25 m-thick base. Concrete volume is 0.25 + (1.50 × 0.25) = **0.625 m³ per m² face**. Assume 0.12 t reinforcing steel per m³ concrete (= **0.075 t/m² face**); this is a provisional quantity, not a sourced reinforcement ratio. Assume a 1.50 m × 0.60 m trench (=0.90 m³/m) and return 0.525 m³/m soil around the base as compacted backfill.

| Component | Quantity per m² wall face | OTSKP row/rate | Extended CZK/m² |
|---|---:|---:|---:|
| C30/37 wall concrete incl. formwork scope | 0.625 m³ | 327325, 9,343.92/m³ | 5,839.95 |
| Reinforcement | 0.075 t | 327365, 41,635.80/t | 3,122.69 |
| Class-I excavation allowance | 0.90 m³ | 13173, 315.27/m³ | 283.74 |
| Compacted soil backfill | 0.525 m³ | 17411, 195.56/m³ | 102.67 |
| **Illustrative structural subtotal (drainage excluded)** | | | **9,349.05 CZK/m² face** |

The trench is dimensioned per running metre of wall and is numerically equal to per-m² face only because the assumed wall height is 1 m. This subtotal is sensitive to wall height and structure geometry; it is not a height-independent unit rate. Excludes design/foundation verification, ground improvement, piles/anchors, drainage and filter media, coping/railings, excavation/disposal beyond the stated row scope, water management, utility conflicts, construction staging, surcharge, and any premium for constrained access. For an actual design, quantify these separately. Code 13173 excavation includes excavation operations and dewatering but **excludes placing soil in embankment/stockpile and landfill fees**; 17411 is separately priced backfill. Do not add another formwork allowance to 327325.

The direct catalogue unit rates (9,343.92 CZK/m³ concrete and 41,635.80 CZK/t reinforcement) are more defensible than this illustrative conversion when no project geometry is known. A gabion wall face-area conversion also needs declared basket thickness and whether the separate mattress/foundation row is required; no such area tariff is implied here.

## Stream-channel relocation: measured BOQ, not a per-metre tariff

No all-in “přeložka koryta” price per metre was located in the official list. Instead, the listed rows below support a measured, geometry-specific bill. All quantities per metre must follow the approved cross-section and destination/lining details.

| Code | Item (abridged) | Unit | CZK/unit | Scope / exclusion relevant to assembly |
|---|---|---:|---:|---|
| 124731 / 124831 / 124931 | Excavation for watercourse channels, ground class I / II / III, haul up to 1 km | m³ | 190.36 / 394.42 / 946.92 | Includes excavation and transport/manipulation up to 1 km, water pumping and diversion at excavation as specified. **Excludes earth placement and landfill fees**, separately under 0141**. Not additive to the corresponding no-haul plus transport variants. |
| 12473A / 12483A / 12493A | Same channel excavation classes, without transport | m³ | 173.74 / 350.88 / 894.04 | Use with corresponding class transport code 12473B / 12483B / 12493B (CZK/m³·km); do not also use the “haul up to” item. |
| 12473B / 12483B / 12493B | Transport for channel excavation, class I / II / III | m³·km | 19.64 / 28.26 / 28.26 | Pair with no-haul alternatives only. |
| 17120 | Place excavated material in embankment/stockpile without compaction | m³ | 21.17 | Not disposal/tipping; applicable only where destination and specification fit. |
| 014111 / 014112 | Landfill fee, inert waste | m³ / t | 0 / 0 | Workbook rate is zero/placeholder; actual fee is not priced by this row snapshot. Other waste classes likewise have zero listed fees. Do not infer disposal is free. |
| 46451 | Quarry-stone cover/stone pitching at bed and banks (`pohoz`) | m³ | 1,579.21 | Supply, delivery and placement of specified stone. |
| 46321 | Quarry-stone hand-laid revetment (`rovnanina`) | m³ | 2,340.20 | Supply/delivery and arranging stone to prescribed form. |
| 46251 | Quarry-stone riprap (`zához`) | m³ | 1,574.65 | Supply/delivery and placing specified stone. |
| 465511 / 465512 | Dry / mortar-laid quarry-stone paving | m³ | 4,236.15 / 7,252.50 | Paving includes necessary shaping/planum and laying/jointing as specified, but **excludes subbase** (separate section 45 item). |
| 28997 | Geotextile/geogrid facing or reinforcement | m² | 87.44 | Includes supply, substrate prep, fastening, joints/edge work and drainage adaptation; overlaps/underlay should be specified and measured, not assumed. |
| 18221 | Spread topsoil on slopes, up to 0.10 m | m² | 39.19 | Rate for spreading existing/available soil; purchased topsoil has a separate higher row. |
| 18242 / 18243 | Hydroseed on topsoil / on subsoil | m² | 29.35 / 32.73 | Alternative surface restoration rows, not both on the same area. |
| 18245 | Turf establishment using erosion-control textile | m² | 157.46 | Alternative to bare hydroseeding for a specified textile treatment. |

Rows 1141* are removal of existing watercourse paving/construction, not new-channel construction; only include them if existing lining is actually demolished. Similarly, 12960 (3326.50 CZK/m³) is channel/silt cleaning, not channel excavation for relocation. OTSKP rows 4672*/4673*/46751 for channel steps and sills are separate structures, not a mandatory per-metre allowance.

### Geometry illustration for quantity transparency (not a tariff)

For comparison only, assume a trapezoidal channel with 2.0 m bottom width, 1.0 m flow/design depth and 2H:1V banks. Top width is `2 + 2×2 = 6 m`; cross-sectional excavation area is `depth × (bottom + top width)/2 = 1 × (2 + 6)/2 = 4 m²` (the two bank triangles total 2 m²). Wetted perimeter is `2 + 2×sqrt(1²+2²) = 6.472 m`. Suppose the wetted bed/banks receive 0.30 m-thick quarry-stone pohoz (code 46451), with geotextile beneath it (28997); outside the lined strip, restore 2.0 m horizontal width at each bank using up to 0.10 m topsoil (18221) and hydroseed (18242). Assume excavated class-I soil is hauled up to 1 km (124731) and handled/placed on site (17120); this is explicitly **not** off-site disposal.

| BOQ quantity basis | Quantity per channel m | Row and extended CZK/m |
|---|---:|---:|
| Channel excavation (class I, haul ≤1 km) | 4.000 m³ | 124731: **761.44** |
| On-site loose placement of excavated material, if approved | 4.000 m³ | 17120: **84.68** |
| Stone lining, thickness 0.30 m over 6.472 m wetted perimeter | 1.942 m³ | 46451: **3,066.19** |
| Geotextile under lining (same developed wetted surface) | 6.472 m² | 28997: **565.91** |
| Topsoil + hydroseed on 4 m² restored banks | 4.000 m² | 18221 + 18242: **274.16** |
| **Illustrative measured subtotal** | | **4,752.39 CZK/channel m** |

This is only arithmetic over the stated rows and geometry, **not a recommended channel design or a universal relocation rate**. The subtotal uses unrounded extensions (rounding each displayed line to cents yields 4,752.38 CZK/m, one cent below the rounded full-precision total). It omits off-site disposal or haul if on-site placement is unavailable (the listed disposal fee is a zero placeholder); temporary flow diversion/cofferdams and construction sequencing beyond scope embedded in excavation; fish/ecology timing, hydraulic/scour design, transitions and tie-ins, bed substrate/vegetation requirements, special energy dissipation, land acquisition, and any separate structures. Permits and professional design are not priced as extra items here; per the project costing convention, they remain within the existing other-objects surcharge, with no new separate allowance invented. Ground class alone changes excavation materially. If the channel is naturally unlined, a gravel/soil bed restoration rather than stone is a different quantity/specification and is not priced by this example. Avoid adding old-channel demolition, both alternatives of a lining, or duplicated excavation/transport rows unless the BOQ separately calls for them.

## Interpretation

These rows provide precise 2026 catalogue anchors and a reproducible way to form geometry-sized quantities. They do **not** establish a single Czech retaining-wall price per m² or a single channel-relocation price per metre. For the wall, face area is only a normalization of an assumed structural cross-section; for the channel, a per-metre subtotal varies with section, ground class, lining, reuse/disposal, and restoration. All reported numbers exclude VAT and are not construction tenders or current project-specific quotations.
