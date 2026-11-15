# Czech road traffic census: ŘSD CSD 2025/2020

Research snapshot: 2026-11-15. **Verified direct source:** ŘSD Geoportal ArcGIS REST service queried successfully; raw ArcGIS JSON is retained under `pipeline/cache/csd/` (gitignored). The map page remains useful for manual inspection, but the service exposes a reproducible GIS endpoint.

## What the census measures

ŘSD's Celostátní sčítání dopravy (CSD) reports RPDI, *roční průměr denních intenzit* (annual average daily traffic), for road sections. The 2025 dataset is now present as an official ŘSD Geoportal layer named “Sčítání dopravy - data z r. 2025”; this improves on the previously verified CSD2020-only evidence in [30-road-reconstruction.md](30-road-reconstruction.md). The service layer and its records are verifiable here: [MapServer directory](https://geoportal.rsd.cz/arcgis/rest/services/ScitaniDopravy/MapServer), [2025 section layer metadata](https://geoportal.rsd.cz/arcgis/rest/services/ScitaniDopravy/MapServer/3?f=pjson), and [section query endpoint](https://geoportal.rsd.cz/arcgis/rest/services/ScitaniDopravy/MapServer/3/query).

ŘSD's [CSD2020 information](https://scitani.rsd.cz/csd_2020/pages/informations/default.aspx), [methodology](https://scitani.rsd.cz/csd_2020/pages/methodics/default.aspx), and [detailed results](https://scitani.rsd.cz/csd_2020/pages/shop/default.aspx) describe the earlier census, its RPDI outputs and category definitions. A 2025 service layer is published, but a full 2025 methodology note/count-period documentation was not located in this research. Do not assume the detailed collection period/method is identical to 2020 without obtaining the 2025 methodology. The 2020 reference app is [here](https://scitani.rsd.cz/csd_2020/pages/map/default.aspx); its detailed outputs page describes RPDI by vehicle category. CSD2020 methodology is not a substitute for the 2025 method.

## Verified downloads and fields

- ArcGIS REST endpoint: `https://geoportal.rsd.cz/arcgis/rest/services/ScitaniDopravy/MapServer/3/query` (Feature Layer, polyline, `JSON, geoJSON, PBF`; query accepts bbox/intersects and returns attributes plus geometry). Service root: [MapServer](https://geoportal.rsd.cz/arcgis/rest/services/ScitaniDopravy/MapServer?f=pjson).
- Query used: `where=1=1`, `geometry=<xmin,ymin,xmax,ymax>`, `geometryType=esriGeometryEnvelope`, `inSR=5514`, `spatialRel=esriSpatialRelIntersects`, `outFields=*`, `returnGeometry=true`, `outSR=5514`, `f=json`. Raw responses saved as `pipeline/cache/csd/raw-<area>.json`.
- ArcGIS layer's source and output CRS are WKID 102067 / latest WKID 5514 = S-JTSK / Krovak East North; coordinates are metres and are already in the requested negative x,y coordinate convention. No reprojection needed.
- Attributes verified in layer metadata and returned features: `CIS_SU` (Číslo sčítacího úseku; section id), `PSILNICE` (Označení komunikace; road label), `SV` (Všechna motorová vozidla celkem; RPDI total), `TV` (Těžká vozidla celkem), `TNV` (Těžká nákladní vozidla), vehicle classes `O`, `DOD`, `LN`, `SN`, `SNP`, `TN`, `TNP`, `NSN`, `A`, `Z`, `M`, start/end text `ZU`/`KU`, and `BOD1_X/Y`, `BOD2_X/Y`. Geometry is supplied as paths. The API uses integer values; `TV` is heavy motor vehicles/day, not percentage. Derive share as `TV/SV` only where `SV>0`; do not confuse it with `TNV` (heavy goods vehicles). Fields/aliases are directly listed at the [layer metadata endpoint](https://geoportal.rsd.cz/arcgis/rest/services/ScitaniDopravy/MapServer/3?f=pjson).
- No standalone XLSX “Výsledná sestava” link was verified for 2025. CSD2020 page still documents downloadable detailed outputs and vehicle categories; the new REST layer is a more direct source for spatial matching.

## Coverage and limitations

The layer returns the national-scale road census network in its full extent (about x -901135..-432226, y -1219950..-936467); the service title is “Sčítání dopravy - data z r. 2025”. Census records include motorways and roads of classes I, II and III represented in the dataset. It is not a complete census of local streets or every OSM road. A queried record with `SV=0` is an explicit zero/uncounted or no-value segment, not a realistic zero-flow road; investigate before using it. `PSILNICE` may include suffix text (for example `43 H`); the fetch script trims whitespace but retains meaningful suffixes to avoid merging distinct labels. Matching should normalize `I/14` to `14`, then use geometric proximity and verify route/section context—road-number duplicates and parallel carriageways exist.

CSD values are integer rounded RPDI; the service metadata declares integer field types. For CSD2020, CDV reports 6,465 counted sections ([CDV summary](https://cdv.gov.cz/aktuality/novinky/vysledky-celostatniho-scitani-dopravy-2020-csd2020/)). COVID impact on 2020 flows is **not established here from a primary ŘSD note**, so treat CSD2020 as pandemic-era historical data, not current normal traffic; 2025 is preferable where the project decision uses it. The 2025 count period/method details and quantified COVID effect are not verified.

## Trapla fetch and use

Run `uv run --with requests python pipeline/fetch_census.py`. It queries each supplied EPSG:5514 area with a 1 km margin, saves verbatim REST response JSON and normalized lists at `pipeline/cache/csd/sections-<area>.json`. Schema is `{id, road, rpdi, heavy, year, line}`; `heavy` is TV vehicles/day and `line` is `[[x,y], ...]` in EPSG:5514. The script is stdlib plus `requests`, and is reproducible against the public endpoint.

For OSM prefill, use CSD2025 in preference to CSD2020; match same normalized `ref` and nearest line (point-to-line distance), then check section endpoints and road class. Retain source year and section id in game data. Set traffic to `rpdi`; derive a heavy share as `heavy/rpdi` when positive, but label the basis explicitly as TV, not TNV. Avoid assigning one section's value indiscriminately across an entire named road: adjacent sections can differ substantially. Keep unmatched local roads unset or use a separately labelled estimate rather than pretending they were counted.

## Sample coverage by area

Counts below are all service sections intersecting the expanded query bbox, not only main roads; values are `section id: RPDI` grouped by `PSILNICE`. Records and exact geometries are in the output JSON files. Duplicate RPDI across IDs is possible because adjacent directional/connected sections can carry the same census value. Min–max gives a compact sanity range per road.

### D11 — 53 sections; file `pipeline/cache/csd/sections-d11.json`

| Road label | Sections (id: RPDI) | RPDI range (vehicles/day) |
|---|---|---:|
| `1412` | 5-6240: 1316 | 1316–1316 |
| `14` | 5-0870: 5835, 5-0871: 5835, 5-0872: 5771, 5-0890: 5027, 5-0891: 5027, 5-0893: 7716, 5-0894: 7716, 5-0895: 6799, 5-0901: 10028, 5-1280: 11712, 5-1290: 11959, 5-1302: 12998, 5-1303: 17522, 5-3430: 3731 | 3731–17522 |
| `16` | 5-0902: 17998, 5-0910: 4399, 5-0911: 4399, 5-0912: 12655, 5-0913: 15592, 5-0920: 4722, 5-1180: 3205, 5-3470: 4283, 5-3471: 4887 | 3205–17998 |
| `252` | 5-3440: 980 | 980–980 |
| `296` | 5-1260: 4598, 5-1270: 7574, 5-4460: 2485 | 2485–7574 |
| `2962` | 5-6730: 0 | 0–0 |
| `297` | 5-4786: 2132 | 2132–2132 |
| `29932` | 5-6250: 366 | 366–366 |
| `300` | 5-3450: 2600, 5-3451: 2600, 5-3460: 2600 | 2600–2600 |
| `30015` | 5-6420: 1512, 5-6440: 1984 | 1512–1984 |
| `30018` | 5-6260: 514 | 514–514 |
| `301` | 5-3540: 2232 | 2232–2232 |
| `3011` | 5-6460: 2897 | 2897–2897 |
| `30110` | 5-3550: 1807, 5-3558: 1134, 5-3559: 1134 | 1134–1807 |
| `3012` | 5-3480: 3371, 5-3481: 3371, 5-3482: 3371 | 3371–3371 |
| `3013` | 5-6210: 2412 | 2412–2412 |
| `304` | 5-0892: 3656, 5-4910: 1555, 5-4911: 3656 | 1555–3656 |
| `37` | 5-1300: 12476, 5-1301: 15443, 5-1310: 12476 | 12476–15443 |
| `567` | 5-5331: 1931 | 1931–1931 |

### D3 — 34 sections; file `pipeline/cache/csd/sections-d3.json`

| Road label | Sections (id: RPDI) | RPDI range (vehicles/day) |
|---|---|---:|
| `315` | 1-2250: 3796, 1-4768: 2328, 1-4769: 2328 | 2328–3796 |
| `1027` | 1-6120: 1476 | 1476–1476 |
| `104` | 1-2630: 2439, 1-2636: 2503 | 2439–2503 |
| `1042` | 1-6080: 1460 | 1460–1460 |
| `105` | 1-1130: 7320, 1-1140: 5070, 1-1146: 8910, 1-1150: 5070, 1-1166: 0, 1-1169: 1925, 1-1170: 2141, 1-1178: 1925 | 0–8910 |
| `105 H` | 1-1147: 2895 | 2895–2895 |
| `1059` | 1-5060: 0 | 0–0 |
| `106` | 1-2590: 6535, 1-2600: 7657, 1-2627: 1748, 1-2628: 1748, 1-2629: 1748, 1-3948: 1987, 1-3949: 2744 | 1748–7657 |
| `1069` | 1-5010: 0 | 0–0 |
| `107` | 1-3588: 5541, 1-3589: 3026, 1-4750: 8955 | 3026–8955 |
| `114` | 1-2640: 1508 | 1508–1508 |
| `603` | 1-0035: 10901, 1-0039: 10901, 1-0040: 10789, 1-0057: 10789, 1-0058: 5141 | 5141–10901 |

### D35 — 24 sections; file `pipeline/cache/csd/sections-d35.json`

| Road label | Sections (id: RPDI) | RPDI range (vehicles/day) |
|---|---|---:|
| `34` | 5-0592: 16201, 5-0593: 13284, 5-0600: 5672, 5-1591: 7219, 5-1600: 7219 | 5672–16201 |
| `35` | 5-0580: 14649, 5-0616: 13212, 5-0617: 16467, 5-0630: 14349, 5-0676: 15660 | 13212–16467 |
| `366` | 5-0590: 3170, 5-0591: 3170 | 3170–3170 |
| `368` | 5-4330: 4783, 5-4331: 4783, 5-4348: 1012, 5-4349: 1012 | 1012–4783 |
| `36810` | 5-6200: 1879 | 1879–1879 |
| `43` | 5-0680: 8790, 5-0688: 8695, 5-0690: 9428 | 8695–9428 |
| `43 H` | 5-0641: 4418, 5-0642: 3478 | 3478–4418 |
| `D35` | 5-8580: 0, 5-8590: 0 | 0–0 |

### Nová Paka — 38 sections; file `pipeline/cache/csd/sections-nova-paka.json`

| Road label | Sections (id: RPDI) | RPDI range (vehicles/day) |
|---|---|---:|
| `16` | 5-0350: 20652, 5-1190: 9644, 5-1196: 6253, 5-1197: 5528, 5-1207: 7287, 5-1208: 7287, 5-1218: 3060 | 3060–20652 |
| `16 L` | 5-1195: 4516, 5-1201: 8598, 5-1202: 9253, 5-1203: 3813, 5-1206: 2648 | 2648–9253 |
| `283` | 5-2418: 534, 5-2419: 534 | 534–534 |
| `284` | 5-1093: 1755, 5-2420: 2308, 5-2421: 2308, 5-2422: 2328, 5-2423: 2328, 5-2430: 1995, 5-2436: 1597, 5-2458: 1755, 5-2459: 1755, 5-4610: 4184 | 1597–4184 |
| `28411` | 5-6560: 0 | 0–0 |
| `28443` | 5-5990: 247 | 247–247 |
| `286` | 5-1100: 4105, 5-2390: 2300 | 2300–4105 |
| `2861` | 5-6350: 848 | 848–848 |
| `2864` | 5-7030: 953 | 953–953 |
| `293` | 5-1040: 3815, 5-4750: 6296 | 3815–6296 |
| `295` | 5-1038: 4840 | 4840–4840 |
| `32842` | 5-2650: 506 | 506–506 |
| `35` | 5-0360: 11899 | 11899–11899 |
| `501` | 5-2440: 1637, 5-6340: 3230, 5-6346: 3230 | 1637–3230 |

## Sources

- [ŘSD Geoportal CSD MapServer root](https://geoportal.rsd.cz/arcgis/rest/services/ScitaniDopravy/MapServer?f=pjson), [2025 feature layer metadata](https://geoportal.rsd.cz/arcgis/rest/services/ScitaniDopravy/MapServer/3?f=pjson), and [query API](https://geoportal.rsd.cz/arcgis/rest/services/ScitaniDopravy/MapServer/3/query) — queried directly; supports geometry and attributes.
- [ŘSD CSD2020 map](https://scitani.rsd.cz/csd_2020/pages/map/default.aspx), [detailed results](https://scitani.rsd.cz/csd_2020/pages/shop/default.aspx), [information](https://scitani.rsd.cz/csd_2020/pages/informations/default.aspx), and [methodology](https://scitani.rsd.cz/csd_2020/pages/methodics/default.aspx) — background/2020 methodology, not assumed to document 2025.
- [CDV CSD2020 summary](https://cdv.gov.cz/aktuality/novinky/vysledky-celostatniho-scitani-dopravy-2020-csd2020/).
