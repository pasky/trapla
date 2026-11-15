# D35 Opatovec–Mohelnice scenario reconnaissance

Research-only map/source check, 2026-11-15. This note verifies the corridor and reference data; it does **not** decide the full-corridor-vs-stage gameplay choice or establish performance feasibility. Parent evaluation must measure pack build, memory and evaluation budgets before that choice. The preferred candidate is the full named Opatovec–Mohelnice link; the explicitly honest fallback is Opatovec–Staré Město (not a full-corridor label).

## Official project leaflets (personally fetched and text-checked)

- ŘSD, **D35 Opatovec–Staré Město**, leaflet marked *stav k 09/2025*: [official PDF](https://apdos.roadmedia.cz/Upload/Stavby/53/infoletak_d35-opatovec-st_mesto.pdf). It states a **16,600 m** main route, category **D 26.0/130** under the new ČSN (described as R 25.5/120 under the earlier scheme), and a bored Dětřichov tunnel of **3,983 m**. The same leaflet's **S 11.5/90 is the feeder road to I/35**, not the motorway mainline; its category box confirms D 26.0/130. It reports 700 m total bridge length. The alignment begins 350 m beyond MÚK Opatovec, joining the preceding Janov–Opatovec section (then noted as in construction), and has project chainage km 74.500–91.100. Its west-end design tie is therefore near, but not necessarily exactly coincident with, the first tagged proposed OSM node below.
- ŘSD, **D35 Staré Město–Mohelnice**, current leaflet marked *stav k 09/2025*: [APDOS official PDF](https://apdos.roadmedia.cz/Upload/Stavby/54/infoletak_d35-stare-mesto-mohelnice.pdf?t=2022-07-18%2008:39:28.983). It states **18,230 m**, **D 26/130**, including **1,330 m reconstruction of existing D35**. This supersedes the older 02/2020 leaflet hosted at dalnice-d35.cz. The section begins east of Staré Město at project chainage **km 91.670**, continues through the 1,312.5 m Maletín tunnel, and ends by connection to existing D35 at km 110.000. It reports 3,542 m total bridge length.

The section lengths sum to **34.830 km**. The OSM geometry below measures 33.900 km for one ordered carriageway, about 930 m (2.7%) shorter; these are not interchangeable measures. The second leaflet explicitly includes 1.330 km reconstruction of existing alignment, and both endpoint/tie-in geometries differ from the selected OSM way chain. Do not silently stretch the OSM line to the official length. The corridor traverses major structures and varied terrain. The honest shorter fallback is the named 16.6 km Opatovec–Staré Město project section, not an endpoint at the Maletín tunnel.

## Endpoints and map anchors

The bounded OSM reference extract (method below) returns these termini on the tagged proposed D35 geometry:

| Role | OSM node | Latitude, longitude (WGS84) | EPSG:5514 (m, rounded) | Interpretation |
|---|---:|---|---|---|
| Full route west / Opatovec side | 938396772 | 49.7928053, 16.4949856 | (−599,106, −1,093,788) | western end of selected proposed D35 carriageway chain; leaflet places project start 350 m beyond MÚK Opatovec, joining Janov–Opatovec. The OSM extract maps the prior section as open and shows a service/proposed-motorway connector; confirm its pack topology before freezing endpoint |
| Fallback end / first project section boundary | interpolated on way 80415880 | 49.8013793, 16.7146975 | (−583,278, −1,094,541) | point at 16,600 m chainage from the selected OSM west anchor, near leaflet boundary km 91.100. Not a source node; the next leaflet begins at km 91.670 east of Staré Město. Verify overlay/tie-in rather than using node 938396920 |
| Full route east / Mohelnice side | 25996008 | 49.7673123, 16.9177858 | (−569,130, −1,099,840) | endpoint of the selected carriageway's proposed reference geometry; leaflet says link to existing D35 at project km 110.000, so check reconstruction/tie-in extent |

The west and east positions are actual OSM node coordinates; the fallback position is linearly interpolated along EPSG:5514 geometry at 16,600 m. This point aligns with the first leaflet's 16,600 m and km 74.500–91.100 design interval, and lies about 570 m before the next section's km 91.670 start. The leaflets describe the first endpoint as 490 m before MÚK Staré Město-východ, while the next section provides that junction completion. The stage point is therefore a well-supported chainage-based candidate, though not a surveyed node; confirm the tie-in visually before freezing it. Node 938396920 (49.8020063,16.7566456) lies much farther east along the selected route, at approximately 19.78 km; it is near the Maletín tunnel area in the second section, not the Staré Město stage boundary.

### Candidate EPSG:5514 envelopes and grid implications

The extracted D35 ways span approximately x=−599,106…−569,130 and y=−1,099,840…−1,092,476 m. The endpoint table above verifies the extremes, and the middle tunnel approaches give y≈−1,092,476 m. A rounded, padded full-corridor rectangle is therefore:

- **Full:** `[-601500, -1102000, -567500, -1090500]` (xmin,ymin,xmax,ymax), 34.0 × 11.5 km = 391 km²; at 5 m this is 6,800 × 2,300 = **15.64 million cells**. This is just under the D11 reference of 3,500 × 4,500 = 15.75M cells, with about 2 km padding around the OSM line extremes. It is a long, narrow rectangular envelope; validate all terrain/object source extents before fixing it.
- **Stage:** covering the west endpoint through the section boundary with about 2 km margins, a plausible rounded rectangle is `[-600000, -1098000, -578000, -1090500]`, 22 × 7.5 km = 165 km²; at 5 m, 4,400 × 1,500 = **6.60M cells**. This is a planning envelope, not an already built pack/config.

Both use EPSG:5514 S-JTSK / Křovák East North and are rounded in 500 m increments as requested by `docs/new-scenario.md`. The full envelope satisfies the D11 cell-count target on dimensions alone, but terrain raster cache/build cost, input service coverage, OSM hull, and narrow margins need an actual bounded pack build; the parent must measure those budgets. D11's cell count is not itself proof of equal memory/performance.

## OSM reference data, continuity limits, reproducibility

Retrieved a bounded Overpass JSON extract on 2026-11-15 (49 ways, 66,841 bytes, SHA-256 `78ec6bbfa749814944c601801fccd5e0b06deb32bd6320c6837ab41500de14b2`). Raw ignored file is at **`/home/pasky/projects/trapla-agent-worktree-0005/pipeline/cache/d35-reference-overpass.json`**; copy it into the parent worktree if needed. It is not committed. The query file is **`/home/pasky/projects/trapla-agent-worktree-0005/pipeline/cache/d35-overpass-query.txt`**. Reproducible query:

```overpass
[out:json][timeout:25][bbox:49.50,16.35,49.82,16.90];
way["ref"="D35"];
out geom;
```

It returned 49 `ref=D35` ways with geometry, including the proposed motorway and nearby already-open D35 links. The extracted proposed ways use `highway=proposed`, `proposed=motorway`, `ref=D35`; the returned reference set also includes paired carriageways and proposed tunnel segments. ### Ordered single-carriageway chain and measured length

Following OSM node order from the western proposed endpoint, the selected carriageway is one continuous path; each way below is traversed in reverse OSM way order. Lengths are sums of consecutive geometry vertices projected to EPSG:5514 (Euclidean segment lengths), rounded to 0.01 m. This reproducible route totals **33,900.26 m**. The 16,600 m fallback point falls within way 80415880, at approximately 49.8013793, 16.7146975 (EPSG:5514 −583,278, −1,094,541); it is not a node and must be checked against the leaflet and OSM map before it becomes a fixed endpoint.

| Order | Way ID (traverse reverse) | Directed node anchors | Length (m) |
|---:|---:|---|---:|
| 1 | 1012218276 | 938396772 → 9338690979 | 1,014.53 |
| 2 | 1012218277 | 9338690979 → 9338690977 | 362.02 |
| 3 | 911292616 | 9338690977 → 938396910 | 1,944.19 |
| 4 | 80415867 | 938396910 → 938396824 | 4,027.80 |
| 5 | 80415880 | 938396824 → 938396843 | 9,616.89 |
| 6 | 1012218272 | 938396843 → 938396940 | 1,560.83 |
| 7 | 80415866 | 938396940 → 938396920 | 1,309.29 |
| 8 | 1156589474 | 938396920 → 10755873246 | 8,022.95 |
| 9 | 1156589473 | 10755873246 → 10755873247 | 697.64 |
| 10 | 22768453 | 10755873247 → 25996008 | 5,344.13 |
| | **Total** | **938396772 → 25996008** | **33,900.26** |

The ordered chain includes the two short western proposed ways 1012218276/8277, which were omitted in the initial endpoint interpretation. The matching opposite carriageway is a separate chain and should not be concatenated into the official line length. Additional parallel/tunnel ways include 80415874, 80415876, 80415873, 1012218273, 1156589475 and 80415898. The chain is continuous by shared OSM node IDs. It describes tagged proposed geometry. The first leaflet says the project starts 350 m beyond MÚK Opatovec, joining the preceding Janov–Opatovec section. In the extract, the selected start node 938396772 connects via way 1047432140 (tagged `highway=service`, `proposed:highway=motorway`, `ref=D35`) toward existing motorway way 1047432138; the reciprocal service/connector ways are 1047432141/2142. This is the map evidence for the west tie-in, not an extra length to append to the 16.6 km project. The nearby existing motorway ways carry `opening_date=2025-12-18`, so they are mapped as opened, not construction, in this extract. Check the real status and connectivity before using the pack, and do not charge the preceding Janov–Opatovec project as new work.

The extract is geographically bounded and should be used as reference provenance, not as a forced player's route. Existing motorway ways in the extract are distinct (for example 911292614/615); do not include completed links as proposed construction or indiscriminately chain all `ref=D35` ways. The Overpass query is reproducible but live data changes: preserve the ignored JSON used for any build and record retrieval date/hash. The official leaflets' total is 34.830 km; the selected proposed chain is 33.900 km, a 930 m difference. The second leaflet includes 1.330 km reconstruction of existing D35; exact reconciliation depends on the construction boundary and endpoint tie-ins, not an arbitrary length adjustment.

## Traffic evidence and scenario-default boundary

No corridor-specific 2025 census count or heavy share was extracted in this research pass. Use [ŘSD traffic census portal](https://www.rsd.cz/silnice-a-dalnice/scitani-dopravy) and the workbook documented in [research/14-category-capacity.md](14-category-capacity.md) to select relevant D35/I/35 sections and forecast 20th-year traffic. The design-year uplift, diverted/induced traffic, and acoustic heavy share must be calculated and cited there; do not transplant D11's 9,000 veh/day or 15% heavy-share assumption as local facts. For initial scenario wiring, any such values are **GAME PRIOR / UNVERIFIED**, not measured. Travel-time X is a mission/game goal, not a traffic or norm datum, and must be independently set after the gameplay route/budget check. If the scenario is initially a two-lane road exercise in the D35 corridor, label it honestly; it does not represent a completed motorway mission.

## Geology / engineering risk flags (not local calibrated inputs)

This corridor crosses the transition from the Svitavy / Moravian-Třebová area toward the Zábřeh–Mohelnice basin and the Maletín high ground. Treat likely Cretaceous sedimentary units, local clastic rocks and Quaternary valley deposits as **regional screening hypotheses**, not cell-level mapped fact. The D11 geology classification/calibration is not transferable. Before pack freeze, inspect ČGS GEOCR50 and IG mapping across the actual chosen envelope; list returned `hor_karto` and rajon values, prioritize profiles by playable cells and route cuts, add explicit mappings/priors with reasons, and record unknown lithologies. In particular, tunnel and ridge cuts near Dětřichov/Maletín raise uncertainty about bedrock, weathering and groundwater; no borehole/GTP or excavation-class calibration was fetched here. Mark class-I/II/III excavation depths as **PROVISIONAL regional game priors** unless a local geotechnical report, tender quantity, or nearby OTSKP volume supports them. The 3,983 m tunnel length and structure cost are not evidence of a corresponding surface-road geology price.

## Sources / follow-up

- Official leaflets above; local PDFs fetched to `/tmp/d35-opatovec-staremesto.pdf` and `/tmp/d35-staremesto-mohelnice-apdos.pdf` in this worktree session.
- Project overview / independent cross-check: [Ministry of Transport, D35 PPP covers both sections, 35 km](https://md.gov.cz/Media/Media-a-tiskove-zpravy/Nejvetsi-silnicni-zakazka-v-historii-miri-do-final); [February 2025 contract news, reported 16.6 + 18.2 km](https://zdopravy.cz/35-kilometru-nove-dalnice-a-25-let-provoz-52-km-nejvetsi-silnicni-zakazka-odstartovala-236982/).
- Existing methodology and source caution: [docs/new-scenario.md](../docs/new-scenario.md), [docs/multi-road-plan.md](../docs/multi-road-plan.md), [research/21-network-scenarios-modes.md](21-network-scenarios-modes.md), [research/14-category-capacity.md](14-category-capacity.md).
