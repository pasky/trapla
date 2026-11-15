# D3 Posázaví scenario reference check

Research note, 2026-11-15. This verifies a plausible bounded scenario reference, not a product/default decision or engineering design. OSM is a mutable proposed alignment and the coordinates below are map anchors, not surveyed design coordinates.

## Official project evidence and scope

ŘSD's official [0302 Jílové–Hostěradice page](https://www.stredoceskad3.cz/usek-0302-jilove-hosteradice/) and [leaflet, status 09/2025](https://apdos.roadmedia.cz/Upload/Stavby/44/infoletak_d3-0302-jilove-hosteradice.pdf) identify a route from MÚK Jílové (II/104, project km 9.512) to beyond MÚK Hostěradice (II/106, km 13.900), length 4,486 m, category D 27.5/120. The leaflet explicitly describes the Sázava valley crossing at km 12.5 by the 787 m Sázava bridge; it also identifies the Luka tunnel (1,843 m). Therefore 0302 is indispensable to a D3 corridor challenge that is meant to include the Sázava crossing.

The adjacent official [0303 Hostěradice–Václavice page](https://www.stredoceskad3.cz/usek-0303-hosteradice-vaclavice/) and [leaflet, status 09/2025](https://apdos.roadmedia.cz/Upload/Stavby/43/infoletak_d3-0303-hosteradice-vaclavice.pdf) give km 13.900 through km 25.198 (11,292 m), also D 27.5/120. Leaflet names Hostěradice, Vršky and Krňany tunnels, among many bridges. The section lengths sum to 15.778 km (4.486 + 11.292), while the stated stationing difference is 25.198 − 9.512 = **15.686 km**. These differ by 92 m; preserve the discrepancy rather than treating their sum as an identity. Their endpoint MÚKs are connected. The map/leaflet authorship and service are ŘSD ČR. This is project reference length, not a measured length from OSM nor a promise that a playable road will exactly follow it.

## Bounded OSM check (reproducible)

A small Overpass extract was retrieved at `pipeline/cache/d3-posazavi-overpass.json` (ignored cache; actual absolute path `/home/pasky/projects/trapla/pipeline/cache/d3-posazavi-overpass.json`, because `pipeline/cache` is a symlink in this worktree). Query, with explicit bounds and geometry:

```overpass
[out:json][timeout:45][bbox:49.76,14.45,49.91,14.67];
(
  way["ref"="D3"];
  way["construction"="motorway"];
  way["proposed"="motorway"];
);
out geom;
```

Fetched 2026-11-15 15:13 UTC from `https://overpass-api.de/api/interpreter`; timestamp in response is 2026-11-15T15:13:21Z. Two full-length `proposed=motorway` ways returned, both tagged `highway=proposed`, `proposed=motorway`, `ref=D3`, `source=cz:rsd`, `oneway=yes`:

- way **143823366**, 132 nodes, geometry south→north, first node 7056954346 and last node 1573856945. The northern-to-southern stretch used for the proposed scenario anchors runs node **6393869609** (49.9108732, 14.4681048) to node **6393869057** (49.7576360, 14.5929599), about **22.02 km** along this way's sampled geometry (haversine segment sum).
- way **149101901**, 130 nodes, opposite orientation (north→south), first node 8227650623, last node 7056954345; same corridor but offset opposite-direction carriageway. The nearest analogous bounds anchors are node 6393863317 (49.9082757, 14.4710541) and node 5108369454 (49.7577312, 14.5926571), about 21.63 km. Do not splice these into one centerline; they are separate proposed carriageways.

The two lines overlap spatially and provide continuous north–south corridor coverage across this window, including the Sázava crossing area, in their source geometry. OSM way direction is not necessarily project chainage: way 143823366 runs south→north, while 149101901 provides the natural north→south orientation for an A=Jílové / B=Václavice route. The numbered anchors are explicit node IDs; they need not coincide with the leaflet's MÚK station limits. The proposed nodes below were checked visually against the leaflet maps. These OSM ways extend well beyond the query's bbox; `out geom` returned the full ways. As proposed data can move/change, preserve the query, retrieval timestamp and exact way/node IDs in any eventual build manifest.

### Candidate endpoints and raster envelope

The requested candidate uses way **149101901**, north→south, clipped with strict node range **6393863317 → 5108369461** (index 26→58 on the fetched way). A is node 6393863317, **49.9082757, 14.4710541**; B is node 5108369461, **49.8036931, 14.5813856**. Visual check against the 09/2025 leaflet page-3 maps: on 0302, A lies on the D3 approach from the north, before the map's MÚK Jílové/II/104; it is not the exact MÚK endpoint and includes a northern approach beyond that junction. On 0303, B lies on the D3 approach just north/west of the MÚK Václavice/II/112, near the map's Dunávice/Václavice interchange area; it is an approach anchor, not a confirmed station-limit point. Together these anchors span the river crossing and most of both named sections, but are not precisely the project chainage limits. Projecting the 33 OSM geometry points between those nodes to EPSG:5514 and summing segment lengths gives **15,679.6 m (≈15.680 km)**. This is about 6 m below the 15.686 km stated stationing difference and 98 m below the 15.778 km sum of the named section lengths. The projected OSM measurement is reproducible geometry arithmetic, not either official measure.

Transforming the clipped 26→58 geometry to EPSG:5514 gives approximate extents x = −742,391…−735,692, y = −1,075,838…−1,063,242 m. A rounded 500 m candidate bounds with ≥2.5 km margins is `[-746000, -1079000, -733000, -1060000]` (13 × 19 km, 2,600 × 3,800 cells at 5 m = 9.88 million cells / ~39.5 MB float32 height, before other arrays). This is below the new-scenario guidance of roughly 25 × 25 km and D11's 15.75 million cells. Confirm the official geometry and DMR coverage at actual ends before freezing; this is a planning rectangle, not fetched terrain validation.

## Traffic / defaults: evidence boundary

The leaflets give strategic rationale (D3 provides an alternative Prague–Benešov connection, relieves D1 and regional roads, and carries substantial south–north traffic) but no numerical AADT or heavy-vehicle share was found in their inspected text. `research/14-category-capacity.md` links the ŘSD CSD workbook, but no local count station, count value or design-year forecast was extracted in this task. Hence **no sourced D3 traffic default can be stated here**. Any initial scenario traffic and heavy share must remain explicit PROVISIONAL game priors pending matching CSD sections and an explicit design-year uplift; do not inherit D11's 9,000/day or 15% as regional evidence. Also keep a road-exercise class-I/S-road preset distinct from the actual planned D 27.5/120 motorway mission: the real section category is project evidence, not a two-lane capacity justification.

## Geology / regional warnings

The area is in the rugged Posázaví landscape and the official project leaflet itself documents deep valley/major structures, including the Sázava bridge and Luka tunnel; that is direct evidence of substantial relief and an unusually consequential river-valley crossing, not a quantified excavation mix. No local ČGS GEOCR50/IG raster was fetched or intersected in this research pass, and no lithology proportions or excavability values are asserted. Expect scenario-specific classification checks rather than reuse of D11's calibrated Permian/Cretaceous profiles: inspect ČGS GEOCR50 lithology and IG rajons for the candidate 13 × 19 km envelope, with particular attention to crystalline/Barrandian bedrock versus Quaternary valley/alluvial deposits, and log unmapped descriptions. That lithology contrast is a **regional screening hypothesis, not verified cell data**. Official source entry points: [ČGS geological maps](https://mapy.geology.cz/geology_geoscience/) and [ČGS map applications](https://mapy.geology.cz/).

## Limitations / ambiguity

The OSM way geometry for the candidate range passes within about 10 m of a separately fetched named Sázava `waterway=river` geometry near **49.86796, 14.47921**; this is a rounded representative crossing coordinate, not survey accuracy. This matches the 0302 page-3 map: the marked Sázava bridge crosses the river west of Hostěradice and south of Luka pod Medníkem. The official site organizes 0303 as a separate section beginning at Hostěradice, but using only 0303 omits the Sázava crossing, which belongs to 0302. The OSM query confirms proposed-way continuity and visually plausible approach anchors, not legal approval status, terrain/buildability or exact station limits. The projected candidate OSM span is about 15.680 km, distinct from the 15.686 km stationing difference and 15.778 km summed section lengths. Preserve the latter 92 m discrepancy and do not report OSM length as the official project length.
