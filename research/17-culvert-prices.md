# April 2026 OTSKP culvert and endwork prices

Extracted from the official [SFDI April 2026 OTSKP archive](https://sfdi.gov.cz/wp-content/uploads/2026/04/otskp-2.zip), specifically `Příloha č.2 OTSKP 2026 - soubor položek_20260410.R1.Shared.xlsx`. Workbook was read-only/streamed with `openpyxl`; catalogue prices in CZK, as listed, excluding VAT. Rates are catalogue line-item prices, not complete crossing costs.

## Pipe culverts: DN1000–2000

| Code | Catalogue description | Unit | Rate (CZK) |
|---|---|---:|---:|
| 918371 | Pipe culvert DN 1000 (material unspecified in generic item) | m | 13,124.66 |
| 9183F2 | DN 1000 reinforced-concrete pipe | m | 12,641.30 |
| 9183F3 | DN 1000 plastic pipe | m | 8,580.31 |
| 9183F5 | DN 1000 corrugated steel pipe | m | 7,862.97 |
| 918372 | Pipe culvert DN 1200 (generic) | m | 17,292.18 |
| 9183G2 | DN 1200 reinforced-concrete pipe | m | 18,688.24 |
| 9183G3 | DN 1200 plastic pipe | m | 14,236.37 |
| 9183G5 | DN 1200 corrugated steel pipe | m | 12,944.64 |
| 918383 | Pipe culvert DN up to 1400 (generic) | m | 22,304.99 |
| 9183H2 | DN 1400 reinforced-concrete pipe | m | 23,093.38 |
| 9183H5 | DN 1400 corrugated steel pipe | m | 18,797.04 |
| 918384 | Pipe culvert DN up to 1600 (generic) | m | 28,150.52 |
| 9183I2 | DN 1600 reinforced-concrete pipe | m | 27,765.44 |
| 9183I5 | DN 1600 corrugated steel pipe | m | 25,729.31 |
| 91839 | Pipe culvert DN over 1600 (generic) | m | 35,861.60 |
| 9183J2 | Reinforced-concrete pipe culvert over DN1600 | m | 44,317.95 |
| 9183J5 | Corrugated steel pipe culvert over DN1600 | m | 30,528.54 |

The schedule has no exact DN1800 or DN2000 entries: the last size band is **over 1600 mm**, so those rates do not establish a specific 1800/2000-mm pipe price. Specific material-coded rows are not present for every diameter/material combination (e.g. no DN1400 plastic row). The general `91837x`/`91838x` items are stated by diameter, while the `9183xN` variants specify material; they are separate catalogue items, not rates to combine. All pipe-item descriptions specify delivery and laying, including any required pipe cutting/beveling; they **exclude bedding layers and concrete encasement**.

## Prefabricated frame/box culverts

| Code | Catalogue description | Unit | Rate (CZK) |
|---|---|---:|---:|
| 91841 | Frame culvert 200/100 | m | 38,191.59 |
| 91842 | Frame culvert 200/150 | m | 43,758.74 |
| 91843 | Frame culvert 200/200 | m | 48,259.84 |
| 91844 | Frame culvert 250/200 | m | 52,997.84 |
| 91845 | Frame culvert 300/200 | m | 61,052.44 |

Dimensions are reproduced as catalogue designations (interpreted conventionally as cm, i.e. 2.0×1.0 through 3.0×2.0 m; verify against project specification). Scope includes delivery and laying of prefabricated frames of the specified design dimensions, and frame adjustments. It excludes bedding, leveling/fall concrete inside and on top of the frames, and waterproofing. These are not an all-in installed-crossing rate.

## Headwalls and related endwork

| Code | Catalogue description | Unit | Rate (CZK) |
|---|---|---:|---:|
| 9181F | Concrete headwall for pipe up to DN1000 | item | 73,383.97 |
| 9181G | Concrete headwall for pipe up to DN1200 | item | 93,823.61 |
| 9181H | Concrete headwall for pipe up to DN1400 | item | 113,553.52 |
| 9181I | Concrete headwall for pipe up to DN1600 | item | 133,851.20 |
| 9181J | Concrete headwall for pipe over DN1600 | item | 160,252.41 |
| 9185F2 | Stone headwall for pipe up to DN1000 | item | 49,282.30 |
| 9185G2 | Stone headwall for pipe up to DN1200 | item | 72,481.69 |
| 9185H2 | Stone headwall for pipe up to DN1400 | item | 78,773.07 |
| 9185I2 | Stone headwall for pipe up to DN1600 | item | 111,671.64 |
| 9185J2 | Stone headwall for pipe over DN1600 | item | 118,094.09 |
| 918512 | Culvert headwall in stone masonry on mortar | m³ | 4,325.32 |
| 918513 | Stone facing for culvert headwall | m³ | 8,485.56 |
| 899524 | Plain-concrete pipe encasement, concrete up to C25/30 | m³ | 4,366.36 |
| 89957 | Reinforced-concrete pipe encasement, including reinforcement | m³ | 5,801.73 |

For codes `9181F`–`9181J`, the specification says the item is a complete concrete headwall (foundation, stem and coping), including concrete, reinforcement, formwork, joints and associated listed work. Strength-specific variants exist (e.g. `9181F3` C16/20: 70,403.20 CZK/item; `9181F4` C25/30: 73,383.97; `9181F5` C30/37: 75,796.97; analogous 3/4/5 and A variants for other sizes). The `9181` size bands are “up to” and “over” DN thresholds, not distinct exact-size designs. The stone-headwall items are separate alternatives, not additive to the concrete-headwall rows.

## Otter-standard dimensions

The [AOPK SPPK E 02 003 otter standard PDF](https://aopk.gov.cz/documents/20121/4254509/E02003-Standard_vydra_Itechnicka_uprava_podpis.pdf/a5a045b5-7930-c89c-a156-f6d58d10336d?t=1690191452001) yields zero `pdftotext` lines (scanned PDF). **Follow-up:** the implementation author OCRed and visually inspected pages 9–10; verified dry-tunnel 40×40 cm minimum and ledge/berm 40 cm recommended width (25 cm justified minimum), ideally 10 cm above ordinary water. See [17-stream-crossings.md §2](17-stream-crossings.md) for scope: the dry tunnel is not the hydraulic barrel.

### Source and extraction notes

Official archive URL above; item codes, names, units, prices and scope taken from the April 10, 2026 item-list workbook within it. OTSKP uses Czech catalogue terminology: `M` = metre, `KUS` = item/piece, `M3` = cubic metre. Rates are reported at listed precision. No recommendations or extrapolated rates are included.
