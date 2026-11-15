# D35 Opatovec–Mohelnice scenario reconnaissance

Research-only map/source check, 2026-11-15. This note verifies the corridor and reference data; it does **not** decide the full-corridor-vs-stage gameplay choice or establish performance feasibility. Parent evaluation must measure pack build, memory and evaluation budgets before that choice. The preferred candidate is the full named Opatovec–Mohelnice link; the explicitly honest fallback is Opatovec–Staré Město (not a full-corridor label).

## Official project leaflets (personally fetched and text-checked)

- ŘSD, **D35 Opatovec–Staré Město**, leaflet marked *stav k 09/2025*: [official PDF](https://apdos.roadmedia.cz/Upload/Stavby/53/infoletak_d35-opatovec-st_mesto.pdf). It states route length **16,600 m**, category S 11.5/90, and a bored Dětřichov tunnel of **3,983 m** (four-lane R 25.5 in the leaflet's design description). It reports 700 m total bridge length. The current edition supersedes the older 2019 leaflet described in research/21.
- ŘSD, **D35 Staré Město–Mohelnice**, leaflet marked *stav k 02/2020*: [PDF at dalnice-d35.cz](http://www.dalnice-d35.cz/public/files/documents/infoletak-d35-stare-mesto-mohelnice.pdf). It states **18,230 m**, D 26/130, including 1,330 m reconstruction of existing D35 alignment. It describes the Maletín tunnel and 3,542 m total bridge length. This is an older edition and hosted on the project domain, not a current dated ŘSD APDOS leaflet; verify the current project edition before freezing configuration. The document remains useful evidence for the route and planning length, not current construction status.

The two published section lengths sum to **34.830 km**. This is a strong source for “about 35 km”; do not replace it with the shorter OSM captured length or treat the project-line ways as surveyed/as-built centerline. The full corridor runs across highly varying terrain and both leaflets describe major structures. The explicit shorter fallback remains the first 16.6 km with Dětřichov tunnel reference.

## Endpoints and map anchors

The bounded OSM reference extract (method below) returns these termini on the tagged proposed D35 geometry:

| Role | OSM node | Latitude, longitude (WGS84) | EPSG:5514 (m, rounded) | Interpretation |
|---|---:|---|---|---|
| West / Opatovec side | 9338690977 | 49.8001788, 16.5102302 | (−597,926, −1,093,092) | western end of the proposed corridor captured here; use as a map/reference anchor, but confirm against the current leaflet/MÚK tie-in before adopting as the actual game endpoint |
| Stage join / Staré Město side | 938396920 | 49.8020063, 16.7566456 | (−580,268, −1,094,791) | proposed approach at the boundary to the Staré Město–Mohelnice section; suitable explicitly named extension/stage anchor, not necessarily the exact design interface |
| East / Mohelnice side | 25996008 | 49.7673123, 16.9177858 | (−569,130, −1,099,840) | endpoint of one direction's proposed reference line at the Mohelnice-side end |

These are actual OSM node coordinates, not city-centre points. Start/end identifications are based on geographic order and the leaflets' named sections; the OSM extract contains dual-carriageway ways and the endpoint-to-project-interface correspondence needs a visual leaflet/OSM overlay at configuration time. In particular, node 938396920 sits in the paired line/tunnel-transition area; do not assume the two directions share one exact endpoint node.

### Candidate EPSG:5514 envelopes and grid implications

The extracted D35 ways span approximately x=−599,106…−569,130 and y=−1,099,840…−1,092,476 m. The endpoint table above verifies the extremes, and the middle tunnel approaches give y≈−1,092,476 m. A rounded, padded full-corridor rectangle is therefore:

- **Full:** `[-601500, -1102000, -567500, -1090500]` (xmin,ymin,xmax,ymax), 34.0 × 11.5 km = 391 km²; at 5 m this is 6,800 × 2,300 = **15.64 million cells**. This is just under the D11 reference of 3,500 × 4,500 = 15.75M cells, with about 2 km padding around the OSM line extremes. It is a long, narrow rectangular envelope; validate all terrain/object source extents before fixing it.
- **Stage:** covering the west endpoint through the section boundary with about 2 km margins, a plausible rounded rectangle is `[-600000, -1098000, -578000, -1090500]`, 22 × 7.5 km = 165 km²; at 5 m, 4,400 × 1,500 = **6.60M cells**. This is a planning envelope, not an already built pack/config.

Both use EPSG:5514 S-JTSK / Křovák East North and are rounded in 500 m increments as requested by `docs/new-scenario.md`. The full envelope satisfies the D11 cell-count target on dimensions alone, but terrain raster cache/build cost, input service coverage, OSM hull, and narrow margins need an actual bounded pack build; the parent must measure those budgets. D11's cell count is not itself proof of equal memory/performance.

## OSM reference data, continuity limits, reproducibility

Retrieved a small Overpass JSON extract on 2026-11-15 (49 ways, 66,841 bytes, SHA-256 `78ec6bbfa749814944c601801fccd5e0b06deb32bd6320c6837ab41500de14b2`). Raw ignored file is at **`/home/pasky/projects/trapla-agent-worktree-0005/pipeline/cache/d35-reference-overpass.json`**; copy it into the parent worktree if needed. It is not committed. The query file is **`/home/pasky/projects/trapla-agent-worktree-0005/pipeline/cache/d35-overpass-query.txt`**. Reproducible query:

```overpass
[out:json][timeout:25][bbox:49.50,16.35,49.82,16.90];
way["ref"="D35"];
out geom;
```

It returned 49 `ref=D35` ways with geometry, including the proposed motorway and nearby already-open D35 links. The extracted proposed ways use `highway=proposed`, `proposed=motorway`, `ref=D35`; the returned reference set also includes paired carriageways and proposed tunnel segments. Key joined-way/node anchors from the proposed line include:

- West approach and route start: way **911292616**, node chain starts at **938396910** (49.8074335,16.5340299) and runs west to **9338690977** (49.8001788,16.5102302); opposing side way **911292617** connects via **9338690976** and **938384705**.
- Dětřichov tunnel pair: ways **80415867** (nodes 938396824 → 938396910) and **80415874** (938384705 → 938384595). Their projected positions are around 49.807, 16.59.
- Central / Staré Město-side tunnel approach: ways **1156589474** (10755873246 → 938396920) and **1156589475** (938384607 → 10755873245), with the tunnel pair **80415866** (938396920 → 938396940) and **80415898** (938384578 → 938384607). This supports the approximate stage boundary anchor; verify exact project section limits.
- East continuation: ways **1012218272** (938396940 → 938396843), **80415880** (938396843 → 938396824), and **22768453** (25996008 → 10755873247); opposing directions include **1012218273**, **80415876**, and **80415873**. Short connector ways **1156589472/3** and **1012218276–79** complete the route through the tagged junction geometry.

The way/node topology is a continuous **paired** proposed corridor through each segment; each carriageway is a separate connected line and tunnel segments have their own ways. The extract is geographically bounded and should be used as reference provenance, not as a forced player's route. Existing motorway ways in the extract are distinct (for example 911292614/615); do not include completed links as proposed construction or indiscriminately chain all `ref=D35` ways. The Overpass query is reproducible but live data changes: preserve the ignored JSON used for any build, record retrieval date/hash, and commit the extract as project source only if the repository's data policy explicitly calls for it. The leaflets' 34.830 km remains the official length; precise length of the design/reference polyline should be recomputed from a selected, explicitly ordered single carriageway after endpoint tie-ins are confirmed.

## Traffic evidence and scenario-default boundary

No corridor-specific 2025 census count or heavy share was extracted in this research pass. Use [ŘSD traffic census portal](https://www.rsd.cz/silnice-a-dalnice/scitani-dopravy) and the workbook documented in [research/14-category-capacity.md](14-category-capacity.md) to select relevant D35/I/35 sections and forecast 20th-year traffic. The design-year uplift, diverted/induced traffic, and acoustic heavy share must be calculated and cited there; do not transplant D11's 9,000 veh/day or 15% heavy-share assumption as local facts. For initial scenario wiring, any such values are **GAME PRIOR / UNVERIFIED**, not measured. Travel-time X is a mission/game goal, not a traffic or norm datum, and must be independently set after the gameplay route/budget check. If the scenario is initially a two-lane road exercise in the D35 corridor, label it honestly; it does not represent a completed motorway mission.

## Geology / engineering risk flags (not local calibrated inputs)

This corridor crosses the transition from the Svitavy / Moravian-Třebová area toward the Zábřeh–Mohelnice basin and the Maletín high ground. Treat likely Cretaceous sedimentary units, local clastic rocks and Quaternary valley deposits as **regional screening hypotheses**, not cell-level mapped fact. The D11 geology classification/calibration is not transferable. Before pack freeze, inspect ČGS GEOCR50 and IG mapping across the actual chosen envelope; list returned `hor_karto` and rajon values, prioritize profiles by playable cells and route cuts, add explicit mappings/priors with reasons, and record unknown lithologies. In particular, tunnel and ridge cuts near Dětřichov/Maletín raise uncertainty about bedrock, weathering and groundwater; no borehole/GTP or excavation-class calibration was fetched here. Mark class-I/II/III excavation depths as **PROVISIONAL regional game priors** unless a local geotechnical report, tender quantity, or nearby OTSKP volume supports them. The 3,983 m tunnel length and structure cost are not evidence of a corresponding surface-road geology price.

## Sources / follow-up

- Official leaflets above; local PDFs fetched to `/tmp/d35-opatovec-staremesto.pdf` and `/tmp/d35-staremesto-mohelnice.pdf` in this worktree session.
- Project overview / independent cross-check: [Ministry of Transport, D35 PPP covers both sections, 35 km](https://md.gov.cz/Media/Media-a-tiskove-zpravy/Nejvetsi-silnicni-zakazka-v-historii-miri-do-final); [February 2025 contract news, reported 16.6 + 18.2 km](https://zdopravy.cz/35-kilometru-nove-dalnice-a-25-let-provoz-52-km-nejvetsi-silnicni-zakazka-odstartovala-236982/).
- Existing methodology and source caution: [docs/new-scenario.md](../docs/new-scenario.md), [docs/multi-road-plan.md](../docs/multi-road-plan.md), [research/21-network-scenarios-modes.md](21-network-scenarios-modes.md), [research/14-category-capacity.md](14-category-capacity.md).
