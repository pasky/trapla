# Follow-up: berms, OTSKP 2026 culverts, KHK ÚSES

Research snapshot: 2026-11-14. Prices are CZK excluding VAT. This note fills evidence gaps in [`15-bridge-vs-embankment.md`](15-bridge-vs-embankment.md); it reports sourced facts and limits, not recommendations.

## Earthwork benches (“lavičky”)

- **Publicly inspectable project evidence:** the EIA notice for [I/27 Klatovy, section 1 (CENIA, 2016)](https://portal.cenia.cz/eiasea/download/RUlBX1BMSzE4MTNfb3puYW1lbmlET0NfNzY4MTcwMDkwMTc3NjIyNjc4Ni5wZGY/PLK1813_oznameni.pdf) states that a **1 m-wide bench is proposed in cuttings deeper than 6 m** (“u zářezů hlubších než 6 m je navržena lavička šířky 1 m”). The same EIA describes a **6.3 m-high road embankment** at a utility crossing, and elsewhere a **10 m embankment** crossing a drainage line; it does not state a general berm width or interval for those fills.
- The CENIA notice is project-specific design evidence, not a universal ČSN clause. Public searches surfaced many project documents but no freely readable authoritative clause establishing a general vertical interval/width for benches on high road fills and cuts. `research/15-bridge-vs-embankment.md` remains right to flag the general rule as unverified.
- The official 1995 [VL 2 – Silniční těleso](https://pjpk.rsd.cz/data/USR_001_2_10_VL/VL2_Silnicni_teleso__199505_.pdf) was opened; the accessible material is an old set of standard details and does not establish a current universal ČSN 73 6101 bench-spacing rule. ČSN 73 6101 is the relevant road-design standard to investigate for road geometry/earthwork cross-sections, but its full text was not publicly available for clause verification in this pass. Do not conflate this project bench with the `ČSN 73 6133` geotechnical-category height thresholds.

## OTSKP April 2026: published culvert item prices

SFDI’s [official OTSKP page](https://sfdi.gov.cz/cenove-databaze/otskp/) says OTSKP is a price system for road/rail construction, reconstruction, repair and maintenance, and identifies the current edition as **April 2026**, approved by the MD Central Commission on 24 April 2026. Its [official archive](https://sfdi.gov.cz/wp-content/uploads/2026/04/otskp-2.zip) contains `OTSKP/otevřený_formát/Příloha č.2 OTSKP 2026 - soubor položek_20260410.R1.Shared.xlsx`. The workbook was downloaded and inspected with `openpyxl` in read-only mode. These are the **published OTSKP schedule prices**, not measured 2026 tender awards or guaranteed transaction prices.

| OTSKP code | Published item | Unit price |
|---|---|---:|
| 9183B2 | DN 400 reinforced-concrete pipe culvert | 3,617.50 CZK/m |
| 9183B3 | DN 400 plastic pipe culvert | 2,372.72 CZK/m |
| 9183C2 | DN 500 reinforced-concrete pipe culvert | 4,485.18 CZK/m |
| 9183C3 | DN 500 plastic pipe culvert | 3,360.29 CZK/m |
| 9183D2 | DN 600 reinforced-concrete pipe culvert | 5,820.07 CZK/m |
| 9183D3 | DN 600 plastic pipe culvert | 3,924.62 CZK/m |
| 9183E2 | DN 800 reinforced-concrete pipe culvert | 9,450.93 CZK/m |
| 9183E3 | DN 800 plastic pipe culvert | 6,630.83 CZK/m |
| 899524 | Concrete encasement, plain concrete up to C25/30 | 4,366.36 CZK/m³ |

The matching item specification in the workbook says pipe items include **supply and laying** of the specified pipe and any necessary adjustment (cutting/oblique end); they **exclude bedding layers and concrete encasement**. The schedule therefore supports pipe-line price extraction but is not an all-in installed crossing price: bedding/encasement and other project items must be counted separately where specified. The source workbook is directly downloadable inside the linked official ZIP; Excel sheet row codes are searchable in the open-format `.xlsx`.

## KHK ÚSES GIS endpoint

The [ArcGIS Online item “Nadregionální a regionální ÚSES vymezený v ZÚR”](https://www.arcgis.com/home/item.html?id=89646c784a05469eb7afda20b42c44d3) identifies a public, single-layer polygon Feature Service, sourced from the KHK planning authority’s ZÚR/DMG ÚAP data, in S-JTSK. Its metadata gives **CC0** reuse, layer coverage in Královéhradecký kraj, and the live [FeatureServer endpoint](https://services6.arcgis.com/ogJAiK65nXL1mXAW/arcgis/rest/services/Nadregion%C3%A1ln%C3%AD_a_region%C3%A1ln%C3%AD_%C3%9ASES_vymezen%C3%BD_v_Z%C3%9AR_KHK/FeatureServer). The layer supports query/export (including GeoJSON); a count query returned **526 features**. Thus there is a machine-accessible regional/nadregional ÚSES source, unlike the dashboard-only evidence noted earlier. A full GeoJSON query was about 6.1 MB. The implementation subsequently exported the play rectangle only: 47 intersecting polygons, ~0.49 MB, via `pipeline/fetch_uses.py`; see the main note for its limits.
