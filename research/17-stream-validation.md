# Stream-crossing validation — cost model 13

2026-11-14; combines stream sizing with bridge-height pricing from main `ad77b6e`. Saved designs are unchanged. Pack watercourse SHA256: `a0d8dc15a6d0505ae6fd593db2c06abd2835db3301e9d47ab6b4b606e7236f26`.

## Checks

- `npm run build`: pass (existing large-bundle advisory only).
- `npx vitest run`: **189 tests /17 files**, including existing sparse culvert/accounting tests and new vector-overlap, hydraulic sizing, two-head cost, cut rejection, inter-station gully billing, parallel-channel and tunnel/Auto-clearance regressions.
- Pipeline: **15 Python tests** pass; generic `pipeline/build_pack.py d11` completes under a 3 GiB process memory limit. Hydrology-only regeneration also succeeds under 1 GiB.
- `npx tsx scripts/bench.ts scripts/*.json`: **all five VALID**, no parts-sum warning. Independent `scripts/stream-report.ts` checks finite totals and a ≤0.01 CZK sum tolerance; observed discrepancies ≤0.000002 CZK.
- Full pack: 1,389 reaches (1,267 stream,46 river,61 ditch/drain,15 canal); 45,607 vertices; compressed water layer 487,384 bytes. **28,747 vertices uncertain, including 20,703 unsampled** (chiefly out-of-domain/Polish portions of OSM ways). Do not interpret a truncated catchment's Q as certified hydrology.

| Saved design | Total bn CZK | VALID | Warm evaluation ms (one loaded-host run) |
|---|---:|---|---:|
| best-design | 4.0443 | yes | 124 |
| demo-design | 4.5988 | yes | 118 |
| direct-80-design | 4.4559 | yes | 114 |
| direct-90-design | 4.9257 | yes | 112 |
| town-centre-design | 11.2434 | yes | 144 |

Timings are not an isolated performance benchmark. Hydraulic size results are cached across Auto's material-price iterations. The water layer remains independent of road/rail raster drawing order. Initial review exposed and fixed a global Auto retry corrupting unrelated crossings under a hill, nearest-station rather than exact-crossing billing, and parallel channels being buried without an intersection. Pipeline review fixed snapping onto unrelated neighbouring reaches and scenario-cache isolation.

## Best bypass: every mapped watercourse crossing

Local x/y metres use the scenario SW origin (EPSG:5514). `*` = incomplete/uncertain basin; proxy Q doubled, **not an uncertainty bound**. Costs exclude surcharge. Bridge cost is the associated run split equally among its watercourse crossings, **not another charge**; one run may serve multiple rows. Opening is required screening clearance, not necessarily the full bridge span.

| km | OSM way / type | local x,y m | catchment km² | est. Q100 m³/s | choice / opening | length m | item M CZK | fill m |
|---:|---|---|---:|---:|---|---:|---:|---:|
| 6.717 | 1273123962 / river | 9875,8444 | 74.866* | 152.71 | bridge / ≥46.3 m clear | 120.0 | 69.577 | 8.8 |
| 7.056 | 82013071 / stream | 9929,8778 | 65.086* | 137.49 | bridge / ≥40.1 m clear | 319.9 | 191.296 | 13.5 |
| 10.940 | 82044198 / stream | 10911,12387 | 0.349 | 1.36 | bridge / ≥5.9 m clear | 50.0 | 33.057 | 19.4 |
| 11.374 | 81870526 / stream | 10860,12818 | 0.894 | 2.76 | bridge / ≥5.2 m clear | 110.0 | 73.296 | 28.3 |
| 12.322 | 82016594 / stream | 10709,13749 | 0.391 | 1.48 | pipe / DN1200 | 76.6 | 2.417 | 14.2 |
| 14.667 | 82024442 / stream | 10039,15763 | 0.041 | 0.53 | bridge / ≥7.6 m clear | 339.9 | 70.437 | 13.4 |
| 14.792 | 1322309172 / stream | 10112,15863 | 25.041* | 67.16 | bridge / ≥21.3 m clear | 339.9 | 70.437 | 27.2 |
| 14.894 | 82019769 / stream | 10188,15932 | 0.042 | 0.53 | bridge / ≥5.9 m clear | 339.9 | 70.437 | 18.0 |
| 15.610 | 82022712 / stream | 10716,16415 | 23.231* | 63.49 | bridge / ≥26.8 m clear | 90.0 | 26.530 | 5.5 |
| 15.638 | 1322309172 / stream | 10737,16434 | 22.927* | 62.87 | bridge / ≥20.3 m clear | 90.0 | 26.530 | 5.9 |
| 15.794 | 1322309172 / stream | 10852,16539 | 22.853* | 62.71 | bridge / ≥29.4 m clear | 200.0 | 56.943 | 7.1 |
| 15.925 | 82013886 / stream | 10949,16628 | 8.634 | 15.11 | bridge / ≥10.5 m clear | 200.0 | 56.943 | 11.0 |
| 17.074 | 82020347 / stream | 11301,17711 | 0.077 | 0.53 | pipe / DN1000 | 74.3 | 1.669 | 13.9 |
| 18.839 | 382540956 / stream | 11653,19439 | 3.951* | 16.82 | box / 5.0 × 3.0 m | 32.2 | 4.933 | 5.1 |

Small-basin streams under tall/wide fills can still receive bridges: structural economics, a long skewed barrel, or sharing a nearby bridge can dominate hydraulic size. Streams with tens of km² are no longer treated as DN800 merely because OSM says `stream` rather than `river`.

## Owner's ~km12.2 /7 m fill case

The closest mapped crossing in the current saved best bypass is **km12.322, OSM 82016594**, local **10709,13749**. It has a **0.391 km² complete-in-domain estimate**, proxy **Q100 1.48 m³/s**, and **DN1200**. The saved best currently has **14.2 m fill at the exact channel**, a **76.6 m skewed barrel**, **2.417 M CZK before surcharge** (two heads included). The adjacent km12.300 station has about 7.8 m fill in the old baseline; looking slightly away from the crossing previously showed no culvert cost. A single assembly is billed at its nearest station, not repeatedly on every filled pixel; the new blue ring and separate cost group expose its location.

For the owner's **7 m fill** geometry at this channel, a flat S9.5 footprint with the shared benches is **41.5 m**, crossing sine **0.85485**, barrel **48.55 m**. The same Q selects **DN1200**, costing **1.600 M CZK before surcharge**, not zero. This is a local geometry estimate, not a claim to reproduce an unavailable screenshot/design file exactly. A synthetic 7 m fill regression additionally checks nonzero, once-only billing even when the stream raster is overwritten by a road.

Reproduce the table with `npx tsx scripts/stream-report.ts scripts/best-design.json`; run all designs by replacing the filename with `scripts/*.json`.

## Remaining limits

Q100 is an explicit uncalibrated game proxy, not a sourced Czech regional formula; the frame/pipe capacities omit backwater, inlet losses, slope, debris and detailed ecological surveys. Real design needs ČHMÚ profile data and hydraulic/ecological assessment. Terrain outside the pack is not reconstructed; the ×2 incomplete-basin factor does not guarantee adequate flood conveyance. Wider upstream DEM coverage / official catchment and N-year flow data is the priority accuracy follow-up. Ordinary-drainage share remaining in the aggregate SPK road norm is not separately quantified, so complete BOQ-level elimination of aggregate overlap is not claimed. The replaced excess-stream term is entirely removed.
