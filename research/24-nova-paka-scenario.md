# Nová Paka I/16 bypass scenario: source verification (partial)

Research pass: 2026-11-15. This note separates directly verified project facts from mapping work that could not be completed. It is not a product verdict or a frozen route/config. The pipeline/cache files are ignored raw evidence.

## Verified project identity

ŘSD's regional project page, [I/16 Nová Paka – obchvat](https://kraje.rsd.cz/kralovehradecky/stavba-i-16-nova-paka-obchvat/), says total length 8,480 m, 13 bridges on the road, 3 over it, two roundabouts, and 22 noise walls totalling 4,180 m. It calls out the deficiency of the old through-town I/16. Its 2022 statement is preconstruction context, not a final as-built specification.

The official [OPD project record](https://opd3.opd.cz/projekt/Silnice-I-16-Nova-Paka-obchvat) explicitly identifies a **southeast bypass**, **class-I I/16**, **8.479 km**, **S 11.5/70**. It describes the previous I/16 as running through the built-up town close to homes and causing noise, emissions, congestion and safety problems. This independently verifies the basis in `docs/multi-road-plan.md` and `research/21-network-scenarios-modes.md`. OPD's project period is 26 Sep 2022–26 Jan 2026; it is not evidence that terrain data were updated in 2026.

The municipality's [November 2017 information leaflet](https://www.munovapaka.cz/assets/File.ashx?id_org=10512&id_dokumenty=312225), page 3, shows the alignment and states the published construction scope chainage: start at the reconstructed Babák–Kumburský Újezd section end (km 0.000); existing I/16 junction at km 0.660; existing-I/16 junction with petrol-station connection at km 8.080; III/28421/local-road junction at km 8.260; end on existing I/16 at Vidochov, km 8.480. Its S 11.5/80 is an older 2017 design, superseded by OPD's current S 11.5/70. Thus the **8.480 km published project scope** includes roughly 0.660 km west and 0.400 km east of the new bypass branch; the new branch between the two I/16 junctions is about 7.420 km.

## Bounding box / endpoint state

Nominatim's OSM result for Nová Paka town relation 440014 gives town center 50.4947616, 15.5149801. EPSG:5514 transform (pyproj, `always_xy=True`) is x=-659677.956, y=-1008150.005 m. A centered, 15 km square rounded outward to 500 m is **[-667500, -1016000, -652500, -1001000]** (xmin,ymin,xmax,ymax). It contains the two anchored new-branch endpoints and is the proposed starter envelope; the separately published construction tie-ins are baseline roads, not additional playable-branch endpoints.

The current OSM **new-branch exercise anchors** are node **6939405849**, lat/lon **50.4695643, 15.5015253**, to node **6556049779**, lat/lon **50.5129921, 15.5544880**. All 22 ordered `ref=16` ways on this new branch carry `opening_date=2025`; their connected route measures **7,402.267 m** geodesically, close to the leaflet's 7.420 km between project km 0.660 and 8.080. Use these nodes as the anchored game alignment. This is deliberately the **new bypass branch**, not a claim that its nodes are the endpoints of the full 8.480 km construction scope. Preserve the western and eastern existing-I/16 connections and roundabouts in baseline; don't add their approach lengths to the editable branch.

## OSM state and reproducible query

Twelve bounded OSM API `.json` map tiles were fetched, each 0.03° × 0.03° except the north-edge row (0.03° × 0.01°), to cover exactly 15.46–15.58° E, 50.47–50.54° N. Every tile returned below the API's 50,000-node ceiling. These are full map extracts, with overlap; way identities were deduplicated and connected by exact shared node IDs. Raw ignored cache paths:

- `pipeline/cache/np-osm-map-15.46_50.47_15.49_50.50.json`
- `pipeline/cache/np-osm-map-15.46_50.50_15.49_50.53.json`
- `pipeline/cache/np-osm-map-15.46_50.53_15.49_50.54.json`
- `pipeline/cache/np-osm-map-15.49_50.47_15.52_50.50.json`
- `pipeline/cache/np-osm-map-15.49_50.50_15.52_50.53.json`
- `pipeline/cache/np-osm-map-15.49_50.53_15.52_50.54.json`
- `pipeline/cache/np-osm-map-15.52_50.47_15.55_50.50.json`
- `pipeline/cache/np-osm-map-15.52_50.50_15.55_50.53.json`
- `pipeline/cache/np-osm-map-15.52_50.53_15.55_50.54.json`
- `pipeline/cache/np-osm-map-15.55_50.47_15.58_50.50.json`
- `pipeline/cache/np-osm-map-15.55_50.50_15.58_50.53.json`
- `pipeline/cache/np-osm-map-15.55_50.53_15.58_50.54.json`

The derived ignored cache `pipeline/cache/np-i16-osm-candidate-chain.json` records the **full ordered 22-way / 176-node candidate chain**, node coordinates, per-way OSM tags and measured lengths, each raw tile path, and other current `ref=16` ways to retain/review. OSM data © OpenStreetMap contributors, ODbL. Candidate ordered way IDs, west-to-east (way node orders are oriented as needed):

`1078890633, 741260109, 1078890627, 1078890626, 1078890628, 1078890623, 1131933470, 992470366, 1131933448, 1131933447, 1131933440, 33853225, 992470367, 992470368, 992470369, 992470370, 992470371, 992470372, 992470374, 992470377, 992470380, 992470381`.

Current `ref=16` ways not in that chain (do **not** bulk-exclude these; they include the existing continuation, branches and endpoint roundabout pieces) are `9521223, 37618494, 37618495, 165420111, 165434718, 206830821, 206830823, 206833815, 236165648, 236165656, 236165657, 698086270, 698086272, 698086273, 832612488, 832612490, 992470382, 992470383, 1396541589, 1396541595, 1396541596, 1396541597, 1575740599`. Other untagged old-town/branch roads remain in the raw map tiles too.

For the pipeline strict reference query, use explicit way IDs, not a broad `ref=16` bbox query that also selects the old route:

```overpass
[out:json][timeout:60];
way(id:1078890633,741260109,1078890627,1078890626,1078890628,1078890623,1131933470,992470366,1131933448,1131933447,1131933440,33853225,992470367,992470368,992470369,992470370,992470371,992470372,992470374,992470377,992470380,992470381);
out geom;
```

Set strict reference `startNode=6939405849` and use the ordered 22-way mainline list above; the measured branch is 7,402.267 m. The base exclusion is **only those 22 mainline ways**. If removing the sole `highway=primary_link` bypass connector, exclude way `698085714` as a separate item; retain the `I/284` roundabout `86312392` and its existing-road branches. Retain the west-road connection at node `6939405849` (way `1078890631`) and the eastern I/16 roundabout at node `6556049779` (arcs `698086273, 1396541595, 1396541596, 1396541597`) plus outbound roads. The western retained approach joins current mapped old-ref-I/16 / local segments `1078890638, 1418615951, 1418615948, 1418615949, 9584010` and `33853222`. East of the retained roundabout, the existing-I/16 continuation is mapped through `698086272` (154.85 m), `992470382` (31.87 m), and `992470383` (208.01 m) to node `2168796997`, joining existing way `206833815`; from roundabout exit node `6556049781` this approach totals 394.73 m, consistent with the leaflet's approximate 0.400 km beyond the km 8.080 junction. Keep these approach roads in the baseline; do not extend the editable 7.402 km branch onto them. Do not erase any roundabout or old-town/branch roads as part of the mainline mask.

### Branch connectivity after 22-way + ramp exclusion

Topology audit of all current OSM highway ways in the 12 cached map tiles, deleting just the 22-way new-branch set and `698085714`:

- **III/28425 remains continuous; it does not rely on the short new mainline segment.** OSM way `1131933445` (ref `28425`) itself passes through node `9169734216` and continues to node `10554317336`; it joins `1131933446` there and connects back through `1131933444`/`124487914` toward the existing road network. The other side of this through road remains represented in OSM. The 160.15 m bypass segment `1131933440` connects mainline nodes `9169734216` and `9169734217`; after its removal, node `9169734216` stays in the I/28425 road and node `9169734217` has no remaining highway incidence. No historical road geometry or retained bypass apron is needed to keep I/28425 branch-to-branch connectivity in this **modern OSM baseline**.
- The western attached road `1078890631` remains and joins existing local/old-ref-16 roads (including `1078890638`, `1418615951`, `1418615948`, `1418615949`, and `9584010`). The mainline removal therefore does not delete that road branch. The eastern roundabout remains connected to its outbound branches and existing I/16 ways.
- Construction-tagged way `1078890625` also shares a mainline node; it is left intact in this proposed exclusion set. Its `highway=construction` / `opening_date=2025` tags are OSM's current mapping; its role is not established here, so do not silently classify it as mainline or remove it.
- `698085714` is the only directly attached `primary_link` candidate; removing it disconnects the new bypass from roundabout `86312392`, while the roundabout and its I/284/local-road approaches remain in the OSM graph.

This is an OSM **modern-junction baseline**, not a historical reconstruction of the pre-bypass network. The node-graph audit confirms retained-road connectivity in the current map; it does not independently establish historical grade, ownership, design, or construction date. The earlier single-way cache `pipeline/cache/np-osm-way-342016060-full.osm` lies outside these tiles and is not part of this chain.

## Traffic evidence: local CSD 2025

The official ŘSD [CSD 2025 workbook](https://www.rsd.cz/documents/38144/3734982/V2_CSD_2025_20260826.xlsx/5a2163ce-1bcc-6264-8251-98e4dd34a9ec?t=1788264442427), also linked from [ŘSD traffic census](https://www.rsd.cz/silnice-a-dalnice/scitani-dopravy), was downloaded and inspected. Sheet `V2_CSD2025`; `SV` is the total motor-vehicle AADT, and `TV` is heavy traffic. These local counts include roads opened/reclassified around the bypass, so the bypass sections are observed present-day diversion counts, not the pre-project town-road demand or a design-year forecast.

| CSD section | Directional endpoints per workbook | AADT `SV` | Heavy `TV` | TV/SV |
|---|---|---:|---:|---:|
| 5-1190 | Úlibice, I/35 → new I/16 bypass connection; counted at road to diving center/lake | 9,644 | 1,070 | 11.1% |
| 5-1196 | existing I/16 at Kumburský Újezd → I/284, Štikov | 6,253 | 702 | 11.2% |
| 5-1197 | I/284, Štikov → existing I/16, Vidochov | 5,528 | 699 | 12.6% |
| 5-1195 | bypass connection → Nová Paka railway station | 4,516 | 311 | 6.9% |
| 5-1201 | Nová Paka railway station → I/284 junction (urban historic I/16) | 8,598 | 515 | 6.0% |
| 5-1202 | I/284 junction → I/284 junction in town (historic I/16) | 9,253 | 490 | 5.3% |
| 5-1203 | I/284 junction → Nová Paka edge | 3,813 | 233 | 6.1% |
| 5-1206 | Nová Paka edge → bypass junction | 2,648 | 256 | 9.7% |
| 5-1208 | bypass junction → Jičín/Semily district boundary | 7,287 | 951 | 13.1% |

The first three bypass-related through counts (9,644 west access / 6,253 and 5,528 on existing I/16 to the east) are useful observed local context, not additive demand: traffic must not be summed across adjacent links as unique trips. Old urban links carry roughly 3,800–9,300 daily vehicles in this 2025 table; exact route totals and counter representativeness need corridor interpretation. These are **observed AADT, not design-year forecasts**. A scenario's forecast uplift, design year, heavy-share choice, and mission goal must be marked as game policy unless sourced to a local project forecast. Do not silently copy D11's 9,000 and 15% as Nová Paka facts.

## Terrain / aerial evidence and residual earthworks

ČÚZK [DMR 5G product metadata](https://geoportal.cuzk.cz/Default.aspx?lng=EN&mode=TextMeta&side=vyskopis&metadataID=CZ-CUZK-DMR5G-V) describes the national bare-earth terrain model and its original classified airborne LiDAR acquisition (2009–2013; national completion 2016; see also `research/01-terrain.md`). That national original-acquisition metadata does not determine the vintage of the current local service pixels.

**Direct current-service evidence reported by stream S (2026-11-15):** at 50.49429 N, 15.5433476 E (EPSG:5514 x=-657686.367, y=-1008446.935), a north-to-south DMR 5G transect at offsets `[-60,-50,-40,-30,-20,-10,0,10,20,30,40,50,60]` m returned elevations `[517.54,517.60,517.57,517.23,513.77,509.90,509.68,510.39,515.54,516.22,515.85,515.30,514.69]` m. S reports the hillshade at `/tmp/s-paka-dmr.png` clearly shows the new curved-road cut. This is direct evidence that **current DMR 5G at least at this sampled location contains bypass cutting**; removing OSM mainline geometry does not restore preconstruction ground. Therefore the current pack would retain a built-terrain advantage unless the terrain surface is historically restored or the limitation is disclosed. The TIFF reportedly has no `DateTime` or `ImageDescription` metadata; exact local acquisition/update year remains unknown. I did not independently inspect S's image or TIFF.

S also reports `/tmp/s-paka-photo.jpg` shows construction earthworks but not completed pavement in the current orthophoto. This is a reported image inspection, not mine. The official [ORTOFOTO MapServer metadata](https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO/MapServer?f=pjson) does not establish the local imagery acquisition date. Distinguish the observed earthworks image from the DMR ground-cut evidence; no tile-specific year was established.

## Geology confidence

Regional geology should be inspected from ČGS GEOCR50 lithology and IG rajon data within the final game envelope. This pass did **not** fetch or count locally dominant mapped units, so no regional excavation calibration is justified. A central/northeastern Bohemian regional map suggests varied Cretaceous sedimentary rocks and Quaternary cover are plausible in the area, but this is only a broad geological expectation, **not** evidence for the exact alignment or excavatability. Keep current game ground profiles as explicit priors until local ČGS intersection/profile counts and any project GTP/borehole evidence are reviewed; do not reuse D11 calibration as Nová Paka data.

## Sources and outstanding work

- OPD project record: https://opd3.opd.cz/projekt/Silnice-I-16-Nova-Paka-obchvat
- ŘSD project page (project map app linked there): https://kraje.rsd.cz/kralovehradecky/stavba-i-16-nova-paka-obchvat/
- Municipality Nová Paka, **I/16 Nová Paka bypass information leaflet, 11/2017**, page 3 map and chainage text: https://www.munovapaka.cz/assets/File.ashx?id_org=10512&id_dokumenty=312225 (downloaded `/tmp/np-leaflet-2017.pdf`; text `/tmp/s-paka-leaflet.txt`; page 3 rendered `/tmp/np-leaflet-page-3.png`).
- OSM Nominatim town anchor (not project endpoint): https://nominatim.openstreetmap.org/search?q=Nov%C3%A1%20Paka&format=jsonv2&limit=1
- OSM current way response: `pipeline/cache/np-osm-way-342016060-full.osm`
- CSD 2025 workbook URL above; local scratch download `/tmp/csd2025.xlsx` (not committed/cache).
- DMR 5G product and ImageServer metadata URLs above; local tile provenance/profile not obtained.
- Orthophoto REST metadata: https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO/MapServer?f=pjson; no image inspection performed.

The playable new-branch anchors are the OSM nodes and 22-way chain above; the full 8.480 km leaflet scope is distinct and includes existing-I/16 approaches. The current OSM baseline preserves the west tie-in, I/284 junction/roundabout, III/28425 continuity, and east I/16 roundabout/branches after the proposed mainline+ramp exclusions. It is modern topology, not a historical snapshot. Current DMR evidence shows a bypass cutting at the sampled point, so OSM removal alone does not restore pre-bypass ground; exact raster vintage remains unknown. Local ČGS predominant lithologies and project geotechnical evidence remain unresearched.
