# Nová Paka I/16 bypass scenario: source verification (partial)

Research pass: 2026-11-15. This note separates directly verified project facts from mapping work that could not be completed. It is not a product verdict or a frozen route/config. The pipeline/cache files are ignored raw evidence.

## Verified project identity

ŘSD's regional project page, [I/16 Nová Paka – obchvat](https://kraje.rsd.cz/kralovehradecky/stavba-i-16-nova-paka-obchvat/), says total length 8,480 m, 13 bridges on the road, 3 over it, two roundabouts, and 22 noise walls totalling 4,180 m. It calls out the deficiency of the old through-town I/16. Its 2022 statement is preconstruction context, not a final as-built specification.

The official [OPD project record](https://opd3.opd.cz/projekt/Silnice-I-16-Nova-Paka-obchvat) explicitly identifies a **southeast bypass**, **class-I I/16**, **8.479 km**, **S 11.5/70**. It describes the previous I/16 as running through the built-up town close to homes and causing noise, emissions, congestion and safety problems. This independently verifies the basis in `docs/multi-road-plan.md` and `research/21-network-scenarios-modes.md`. OPD's project period is 26 Sep 2022–26 Jan 2026; it is not evidence that terrain data were updated in 2026.

## Bounding box / endpoint state

Nominatim's OSM result for Nová Paka town relation 440014 gives town center 50.4947616, 15.5149801. EPSG:5514 transform (pyproj, `always_xy=True`) is x=-659677.956, y=-1008150.005 m. A centered, 15 km square rounded outward to 500 m is **[-667500, -1016000, -652500, -1001000]** (xmin,ymin,xmax,ymax). This is a useful initial envelope, not a verified endpoint-derived envelope; its margins need checking against the full alignment and tie-ins before being called final.

**Exact A/B lat/lon are not verified in this pass.** The official sources retrieved state project length and orientation but the accessible text does not publish chainage endpoints as coordinates. I did not infer endpoints from town centroid, map thumbnails, or census section endpoints. CSD 2025 describes the tie-in sections as Úlibice / existing I/16 at the west and an existing-I/16 connection by Vidochov to the east, but those census descriptions are not surveyed point coordinates. Do not freeze `A`, `B`, `startNode`, or claim the bbox completely contains the full route until coordinates are checked against official project map geometry or a complete OSM chain.

## OSM state and reproducible query

OpenStreetMap current-state `map` API requests confirm at least one candidate current `highway=primary, ref=16` way in the southwest area: **way 342016060**, 11 ordered nodes, version 5, timestamp 2026-08-15T09:27:52Z. Its fetched way geometry starts at node 387834632 (50.4584269, 15.4857480) and ends at 74228403 (50.4646491, 15.4932583). This individual segment is **not established as the complete bypass**, so do not use this as the official reference chain or as a sufficient exclusion list. Cached exact response: `pipeline/cache/np-osm-way-342016060-full.osm` (OSM API `/api/0.6/way/342016060/full`, retrieved 2026-11-15). OSM data © OpenStreetMap contributors, ODbL.

The requested bounded Overpass query for reference ways was attempted against `overpass-api.de` and `overpass.kumi.systems`; the first returned HTTP 406 and the other timed out in this environment. Thus no bounded Overpass result, complete ordered way/node chain, or verified per-way topology was obtained. Do not mistake the cached single-way OSM API response for a successful Overpass extraction.

Reproducible Overpass QL to retrieve the bounded reference and adjacent primary roads after endpoint coordinates/query service are available (bbox values are south,west,north,east; proposed alternative included for continuity checks):

```overpass
[out:json][timeout:90][bbox:50.44,15.43,50.56,15.61];
(
  way["highway"]["ref"~"(^|;)(I/16|16)(;|$)"];
  way["highway"="proposed"]["proposed"="primary"];
  way["highway"="construction"]["construction"="primary"];
);
out body geom;
>;
out skel qt;
```

For the actual bypass chain, constrain the query to the precisely verified official route identity and then supply its way IDs/start node to the pipeline's strict official-line mode. The query above is reconnaissance only and may include both historic town I/16 ways and the bypass. Preserve all old-road ways and connected branches; exclude only the built bypass's confirmed mainline ownership plus its actual bypass ramps/roundabout connectors as a separately justified set. The full ordered chain and disjoint exclusion IDs remain **UNVERIFIED / not delivered** in this research pass. Keep old-town I/16 and its branch links in the baseline; indiscriminately excluding every `ref=16` way would erase the challenge and surrounding access.

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

ČÚZK [DMR 5G product metadata](https://geoportal.cuzk.cz/Default.aspx?lng=EN&mode=TextMeta&side=vyskopis&metadataID=CZ-CUZK-DMR5G-V) describes the national bare-earth terrain model derived from classified airborne LiDAR acquired 2009–2013 (national completion 2016; see also `research/01-terrain.md`). The DMR 5G ImageServer metadata endpoint is [here](https://ags.cuzk.gov.cz/arcgis2/rest/services/dmr5g/ImageServer?f=pjson); it reports coverage/technical service metadata, not a tile-specific acquisition date. Therefore this input predates the 2022–25 bypass construction and does **not** encode its new embankments/cuts as the terrain baseline. It is the best existing evidence found for preconstruction ground elevations in the bypass corridor, though it is not a bespoke historical survey and may contain other intervening change outside the project area.

ČÚZK [ORTOFOTO MapServer metadata](https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO/MapServer?f=pjson) identifies a current national viewing service but has no imagery acquisition date in layer metadata. The current official service is a mosaic with no historical layer exposed in the inspected REST metadata; the aerial source year for the Nová Paka tiles was **not verified**. The orthophoto is for visual inspection/rendering, not ground elevation. Because the bypass is open and present in current imagery, masking its OSM pavement alone will still leave the newly built road visible in an orthophoto base layer. Conversely the older DMR is pre-road and does not gift the bypass earthworks to the player. If using current orthophoto in-game, remove/mask the road corridor in the imagery or state that the photo is contextual and displays the real completed project; do not suggest it is a pristine pre-build view. No postconstruction surface raster was found or used.

## Geology confidence

Regional geology should be inspected from ČGS GEOCR50 lithology and IG rajon data within the final game envelope. This pass did **not** fetch or count locally dominant mapped units, so no regional excavation calibration is justified. A central/northeastern Bohemian regional map suggests varied Cretaceous sedimentary rocks and Quaternary cover are plausible in the area, but this is only a broad geological expectation, **not** evidence for the exact alignment or excavatability. Keep current game ground profiles as explicit priors until local ČGS intersection/profile counts and any project GTP/borehole evidence are reviewed; do not reuse D11 calibration as Nová Paka data.

## Sources and outstanding work

- OPD project record: https://opd3.opd.cz/projekt/Silnice-I-16-Nova-Paka-obchvat
- ŘSD project page (project map app linked there): https://kraje.rsd.cz/kralovehradecky/stavba-i-16-nova-paka-obchvat/
- OSM Nominatim town anchor (not project endpoint): https://nominatim.openstreetmap.org/search?q=Nov%C3%A1%20Paka&format=jsonv2&limit=1
- OSM current way response: `pipeline/cache/np-osm-way-342016060-full.osm`
- CSD 2025 workbook URL above; local scratch download `/tmp/csd2025.xlsx` (not committed/cache).
- DMR 5G metadata: https://geoportal.cuzk.cz/Default.aspx?lng=EN&mode=TextMeta&side=vyskopis&metadataID=CZ-CUZK-DMR5G-V and ImageServer metadata above.
- Orthophoto REST metadata: https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO/MapServer?f=pjson

**Not yet verified and required before freezing scenario data:** exact endpoints (lat/lon and source node IDs); current complete ordered bypass way/node IDs; strict-mode query and actual fetched Overpass cache; separate exact bypass mainline vs attached ramp/roundabout exclusion IDs; old town road/branch retention via topology check; local orthophoto acquisition year; local ČGS predominant lithologies/project geotechnical evidence. This note intentionally does not guess these.
