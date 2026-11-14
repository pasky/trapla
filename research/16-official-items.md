# Official Czech bridge pricing: OTSKP and SPK CN 2026

Research snapshot: 2026-11-14. CZK excluding VAT. **These are schedule prices and study norms, not awarded bridge prices.** CSV: [`data/bridge-otskp-2026.csv`](data/bridge-otskp-2026.csv).

## Official packages inspected

- [SFDI OTSKP](https://sfdi.gov.cz/cenove-databaze/otskp/), [April 2026 ZIP](https://sfdi.gov.cz/wp-content/uploads/2026/04/otskp-2.zip): `Příloha č.2 OTSKP 2026 - soubor položek_20260410.R1.Shared.xlsx`, and `Příloha č.1 OTSKP 2026 popisovník a metodický pokyn.R4.Shared.docx`.
- [SFDI SPK CN](https://sfdi.gov.cz/cenove-databaze/spk-cn/), [April 2026 ZIP](https://sfdi.gov.cz/wp-content/uploads/2026/04/spk-cn-1.zip): appendices 1 (průvodní zpráva), 3 (ocenění) and **5 (atributy)**. The archive files carry August publication timestamps; release edition is April 2026.
- [SPK DPS](https://sfdi.gov.cz/cenove-databaze/spk-dur-dsp/) is the separate detailed-design database, not interchangeable with CN. This implementation uses the actual CN standard/attributes plus OTSKP quantities, not an unverified DPS rule.

The implementation author independently downloaded the official archives, read the open-format workbooks with `openpyxl` and extracted the DOCX paragraphs. This corrected a significant initial research omission: **SPK does quantify bridge height** in its attributes workbook.

## Height and width — direct SPK evidence

Appendix 1, §A.2, says:

> Standard je uvažován s volnou výškou pod mostem do 8 m (volná výška mezi terénem a nosnou konstrukcí v nejvyšším místě).

Thus **standard = maximum free height below the superstructure ≤8 m**, not 8 m road-surface elevation and not an average pier height. §A.2 excludes the increase in substructure cost above 8 m from the unadjusted standard. It also excludes special construction technology (e.g. arches), restricted access, noise barriers, special railway protection/possessions and several equipment items. Standard includes setting out, foundations, substructure, superstructure, waterproofing/pavement, restraint systems, drainage, bearings/joints, testing and erection works. Do not add these again to an unstripped norm.

Appendix 5, sheet **`A.2.S.9,5.N`**:

| Cells | Attribute | Standard | Upper value / incremental price |
|---|---|---:|---:|
| B5,D5:E6 | výška spodní stavby | 8 m; index 1 | 35 m; **+0.30** |
| B8,C8:E9 | šířka NK | standard width; index 1 | −1 m: **−0.094**; +3 m: **+0.282** |

E6 is a **difference from standard**, not a multiplier of 0.3: row-4 heading explicitly says “CENOVÝ ROZDÍL OPROTI STANDARDU.” At fixed width, 35 m therefore prices at **1.30×** the base. The other new road/motorway bridge sheets carry the same height endpoints and +30% (checked all `A.2.*` sheets). The sum of width and height maxima explains the S9.5 table’s maximum: `579.911 × (1 + .30 + .282) ≈ 917.419 M/km`; minimum `579.911 × (1 − .094) ≈ 525.399 M/km`.

Appendix 1, attributes methodology, explicitly recommends **linear interpolation, or extrapolation**, for values within/outside the range and requires the expert adjustment to be justified/documented. This supports the slope `0.30 / (35−8) = 1/90` of the standard object price per metre of free height **within 8–35 m**. It does not prescribe our 30 m spans, 120 m reference length, pier count, pile dimensions, or below-8-m discount. Nor does it justify using local height rather than the standard’s maximum over the whole object without identifying that approximation.

SPK length is the line joining the ends of the bridge wings measured along the axis (ČSN 73 6201 convention), **not deck bearing-to-bearing length**. Four-lane length is the mean of left/right bridge lengths. Width follows the road category and bridge spatial requirements; dividing by road crown width is an *effective carried-width area*, not a surveyed gross deck area. Our station-run lengths and widths are explicit approximations to those measures.

## Exact OTSKP rates

| Code | Item (abridged) | CZK / unit |
|---|---|---:|
| 334325 | RC piers/bents C30/37 | 12,934.89 / m³ |
| 333325 | RC abutments/wing walls C30/37 | 9,377.28 / m³ |
| 334365 / 333365 | pier / abutment reinforcing steel B500B | 40,874.37 / t |
| 421335 | prestressed deck slab C30/37 | 16,295.90 / m³ |
| 422335 | prestressed beam superstructure C30/37 | 17,952.09 / m³ |
| 421365 | deck-slab reinforcing steel | 42,334.95 / t |
| 421373 / 422373 | internal strand prestressing | 129,728.57 / t |
| 22432 | RC pile concrete | 5,534.64 / m³ |
| 224365 | pile reinforcing steel | 48,858.84 / t |
| 264130 | pile bore, ground I, diameter ≤800 mm | 2,364.57 / m |
| 42861 | elastomeric bearing ≤1 MN | 19,260.88 / each |
| 42851 | pot bearing ≤1 MN | 99,333.71 / each |
| 93151 | surface expansion joint, movement ≤60 mm | 31,699.79 / m |
| 711412 | full-area asphalt-sheet waterproofing | 678.06 / m² |
| 9112A1 / 9112B1 | horizontal-rail / vertical-infill railing, supply+installation | 4,413.54 / 5,992.83 per m |

**Scope checked in appendix 1:** general concrete technological/material conditions include formwork, falsework/scaffolding and associated operations; steel reinforcement and prestressing are separate. §224 includes pile-head trimming/removal of damaged concrete. §264 includes bore excavation/transport, water pumping, temporary casing wear or slurry management, working platforms and drilling equipment; **tip placement/fees are excluded**. Do not add a second generic formwork/casing/pile-head-trimming charge. A bearing ≤1 MN and a ≤60-mm joint are representative unit allowances, not checks that these sizes suit every modeled bridge. Larger load/movement classes and actual geotechnical designs need different quantities/rows.
