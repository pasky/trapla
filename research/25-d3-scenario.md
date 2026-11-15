# D3 Posázaví scenario reference check

Research note, 2026-11-15. This verifies a plausible bounded scenario reference, not a product/default decision or engineering design. OSM is a mutable proposed alignment and the coordinates below are map anchors, not surveyed design coordinates.

## Official project evidence and scope

ŘSD's official [0302 Jílové–Hostěradice page](https://www.stredoceskad3.cz/usek-0302-jilove-hosteradice/) and [leaflet, status 09/2025](https://apdos.roadmedia.cz/Upload/Stavby/44/infoletak_d3-0302-jilove-hosteradice.pdf) identify a route from MÚK Jílové (II/104, project km 9.512) to beyond MÚK Hostěradice (II/106, km 13.900), length 4,486 m, category D 27.5/120. The leaflet explicitly describes the Sázava valley crossing at km 12.5 by the 787 m Sázava bridge; it also identifies the Luka tunnel (1,843 m). Therefore 0302 is indispensable to a D3 corridor challenge that is meant to include the Sázava crossing.

The adjacent official [0303 Hostěradice–Václavice page](https://www.stredoceskad3.cz/usek-0303-hosteradice-vaclavice/) and [leaflet, status 09/2025](https://apdos.roadmedia.cz/Upload/Stavby/43/infoletak_d3-0303-hosteradice-vaclavice.pdf) give km 13.900 through km 25.198 (11,292 m), also D 27.5/120. Leaflet names Hostěradice, Vršky and Krňany tunnels, among many bridges. Together the two named sections are about 15.778 km by project chainage (km 9.512–25.198); their endpoint MÚKs are connected. The map/leaflet authorship and service are ŘSD ČR. This is project reference length, not a measured length from OSM nor a promise that a playable road will exactly follow it.

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

The two lines overlap spatially and provide continuous north–south corridor coverage across this window, including the Sázava crossing area, in their source geometry. OSM way direction is not necessarily project chainage: way 143823366 runs south→north, while 149101901 provides the natural north→south orientation for an A=Jílové / B=Václavice route. The numbered anchors are explicit node IDs, not a claim that the exact nodes coincide with the leaflet's MÚK station limits. These OSM ways extend well beyond the query's bbox; `out geom` returned the full ways, but any scenario subsection is clipped by the identified nodes. As proposed data can move/change, preserve the query, retrieval timestamp and exact way/node IDs in any eventual build manifest.

### Candidate endpoints and raster envelope

A tighter candidate matching the named project-section span uses way **149101901**, north→south: A near the Jílové-side MÚK, node **6393863317**, **49.9082757, 14.4710541**; B near the Václavice-side MÚK, node **5108369461**, **49.8036931, 14.5813856**. The OSM geometry distance between them is about **15.63 km**, close to (but not identical to) the 15.778 km project chainage for 0302+0303. This is the preferable candidate, subject to checking both map anchors against the 09/2025 leaflet maps: endpoint proximity is not proof either node is exactly on the MÚK station limit. It includes the Sázava crossing shown in 0302 and is not equivalent to selecting 0303 alone.

Transforming the tighter candidate nodes and intervening geometry to EPSG:5514 gives approximate extents x = −742,391…−735,692, y = −1,075,838…−1,063,242 m. A rounded 500 m candidate bounds with ≥2.5 km margins is `[-746000, -1079000, -733000, -1060000]` (13 × 19 km, 2,600 × 3,800 cells at 5 m = 9.88 million cells / ~39.5 MB float32 height, before other arrays). This is below the new-scenario guidance of roughly 25 × 25 km and D11's 15.75 million cells. Confirm the official geometry and DMR coverage at actual ends before freezing; this is a planning rectangle, not fetched terrain validation.

## Traffic / defaults: evidence boundary

The leaflets give strategic rationale (D3 provides an alternative Prague–Benešov connection, relieves D1 and regional roads, and carries substantial south–north traffic) but no numerical AADT or heavy-vehicle share was found in their inspected text. `research/14-category-capacity.md` links the ŘSD CSD workbook, but no local count station, count value or design-year forecast was extracted in this task. Hence **no sourced D3 traffic default can be stated here**. Any initial scenario traffic and heavy share must remain explicit PROVISIONAL game priors pending matching CSD sections and an explicit design-year uplift; do not inherit D11's 9,000/day or 15% as regional evidence. Also keep a road-exercise class-I/S-road preset distinct from the actual planned D 27.5/120 motorway mission: the real section category is project evidence, not a two-lane capacity justification.

## Geology / regional warnings

The area is in the rugged Posázaví landscape and the official project leaflet itself documents deep valley/major structures, including the Sázava bridge and Luka tunnel; that is direct evidence of substantial relief and an unusually consequential river-valley crossing, not a quantified excavation mix. No local ČGS GEOCR50/IG raster was fetched or intersected in this research pass, and no lithology proportions or excavability values are asserted. Expect scenario-specific classification checks rather than reuse of D11's calibrated Permian/Cretaceous profiles: inspect ČGS GEOCR50 lithology and IG rajons for the selected 15 × 25 km envelope, with particular attention to crystalline/Barrandian bedrock versus Quaternary valley/alluvial deposits, and log unmapped descriptions. That lithology contrast is a **regional screening hypothesis, not verified cell data**. Official source entry points: [ČGS geological maps](https://mapy.geology.cz/geology_geoscience/) and [ČGS map applications](https://mapy.geology.cz/).

## Limitations / ambiguity

The official site organizes 0303 as a separate section beginning at Hostěradice, but its length and stationing show that using only 0303 omits the Sázava crossing, which belongs to 0302. The OSM query confirms proposed ways and their continuity in the candidate window, not legal approval status, current detailed route design, terrain/buildability, exact MÚK ends, or completion state. The 22.02 km OSM anchor-to-anchor span is longer than the 15.778 km 0302+0303 project chainage because those OSM anchors are deliberately approximate and include extra approaches; reconcile this discrepancy by snapping endpoints to the actual project MÚKs or document a wider game tie-in. Do not report 22.02 km as the official project length.
