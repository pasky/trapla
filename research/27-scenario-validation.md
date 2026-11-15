# Scenario build and validation record

Stream S, 2026-11-15; legacy cost model 18. This is an incremental validation record, not a claim
that the remaining integration gates have passed. Corridor sources: research/24–26.

## Missions and priors

D11 parameters/default/fixture bills remain unchanged. D3 and D35 are explicitly two-lane road
exercises in the chosen motorway corridors, not motorway demand forecasts. Their 9,000 vehicles/day,
15% acoustic heavy share and representative class-I TP188 capacity case are **GAME PRIORS**, not local
counts or project forecasts. Their fresh category is S9.5/90. D3's 11.5-minute target permits 17.25 km
at 90 or 15.33 km at 80; D35's 24 minutes permits 36 km at 90 or 32 km at 80. These are mission
length allowances, not norms or tuning to a desired cost ratio.

Nová Paka starts from the actual project's S11.5/70. Demand 10,000/day and 15% acoustic heavy share
are **GAME PRIORS**, not a forecast obtained by summing adjacent CSD counters. Independently inspected
CSD 2025 rows: west access 5-1190 SV/TV=9,644/1,070; new branch 5-1196=6,253/702 and
5-1197=5,528/699. Eight minutes permits 9.33 km at 70; it does not impose D11's impossible-70 rule.
The published project is 8.479 km; the actually mapped new branch between old-road connections is
about 7.4 km, with existing-road works beyond those connections included in the published scope.

All new ground depths are uncalibrated priors. Five D11-fitted clastic rows revert to their earlier
priors (I/II bottoms: sandstone 2/6 m, conglomerate 1.5/4, fine beds 3/9, Carboniferous coarse/fine
2/6 and 2.5/7). Broader source lithologies map to named rock groups, not measured excavability.
The original D11's **1,690** cached GEOCR polygons were checked against the pre-change classifier:
**zero classification changes**. Its profile table remains unchanged.

## Pack measurements

| Pack | EPSG:5514 rectangle | 5 m grid | DMR coverage / elevation range |
|---|---|---|---|
| D3 | −746000,−1079000 → −733000,−1060000 | 2600×3800 = 9.88M cells | 100%; 200.1–516.0 m |
| D35 full | −601500,−1102000 → −567500,−1090500 | 6800×2300 = 15.64M cells | 100%; 251.6–661.1 m |
| Nová Paka | −667500,−1016000 → −652500,−1001000 | 3000×3000 = 9M cells | 100%; 268.9–637.1 m |

The full D35 raster is slightly smaller than D11's 15.75M cells; its longest texture dimension is
larger. The full-versus-first-stage decision still requires its actual GPU/evaluation results, not
just this dimensional comparison. Builds run with a 6 GiB process address-space limit. Observed peak
RSS: rebuilt D11 1.374 GB, full D35 attempt 1.351 GB, Nová Paka 1.244 GB (these are kB×1000 readings
from `/usr/bin/time -v`, not GPU memory). No unbounded Cartesian arrays are used.

D3's completed initial pack is about 13 MB plus a 4 MB additive graph (13.8 MB raw graph): 7,011
transport sources, 53,149 source nodes and 5,400 visible line features. The standalone graph build
regenerated **identical** legacy net and decompressed vector binary before publishing sidecars.
Paka's initial build is 14.0 MB including its graph (4,696 sources, 36,017 nodes, 3,863 line features).
Final manifests/fingerprints are generated per pack; subsequent reviewed metadata/default fixes may
replace these initial builds before acceptance.

D35 exposed an actual mixed-snapshot OSM way: 79521256 is residential in the older `lines` query and
track in the later `roads2` query. The builder fails closed, then uses a dedicated **coherentTransport**
query for this new pack, deriving its road/rail raster/network/rendering from one response. Never
amalgamate those conflicting geometries/classes and call them one authoritative source. D11 cannot
be rewritten: its frozen older snapshots need explicitly unresolved additive binding for conflicts.

## Editable starter, not forced reference

D3 uses a deterministic seven-bend starter near the mapped proposed line. `scripts/scenarios/d3/`
contains the actual default/reference fixtures; category S9.5, speed 90, Auto profile, no pins or forced
structures. The initial reference sampler chooses mapped vertices at roughly 1.5 km intervals. It
had one track footprint conflict near km 13.21. The existing bounded repair tool, **38 evaluations**,
moved zero-based bends 4/5/6 by **7.4411 / 8.5633 / 11.2947 m**. Exact final local coordinates:

```
(3872.4,14182.6), (3608.6,12643.7), (4588.5,9743.4), (4849.5,8185.1),
(5549,6639), (7079,5914), (8520,4281); every radius Auto
```

The starter is **VALID**, length **15,443.5517 m**, time **10.2957 min**, cost
**4,743,443,003.13 CZK**, bill-parts discrepancy **0**. Warm Node medians in consecutive runs were
77.1/79.3 ms (10 measurements each; maxima 127.9/140.8 ms on the shared host). It is not a global
optimum or the official motorway's surveyed profile. The player can delete/move every bend. Start
and Start over must use the same deep-cloned defaults; loaded current/best designs are not reset.

### Raw straight diagnostics are not hidden

Reproduce with `SCENARIO=d3 ... scripts/scenarios/check.ts --straight`. On the initial D3 pack,
S9.5/90 straight Auto: **14,079.0008 m**, **5,196,665,051.79 CZK**, **NOT VALID**, 11 diagnostics:

- No reconnectable street; its end under earthworks; no reconnectable service road.
- The engine cannot trace a class-III road; no reconnectable class-III road.
- Street footprints: 24 m at km 1.77, 26 m at 1.84, 28 m at 6.82, 39 m at 10.99.
- Service-road footprint: 39 m at km 7.15; class-III footprint: 18 m at km 13.84.

The first/fallback crossing messages include game-rule tags; the footprint/untraceable cases are
explicit engine limits. The raw straight run's median was 189.9 ms, maximum 277.1 ms. A feasible
starter avoids these particular conflicts without changing any norm, suppressing any violation,
or claiming that ordinary automatic remedies have all been solved.

Paka initial straight S11.5/70: 6,120.732 m, 2,510,979,627.25 CZK, NOT VALID: street footprint hits
at km 2.04/2.81 and class-I/service footprint contact at the eastern roundabout endpoint. The first
reference seed also had local-road/track/stream conflicts; 400 bounded repair evaluations left a
1 m class-I footprint hit at the last 10 m. Rounding the endpoint to the legacy network's integer
node and trying source-tangent approach bends did **not** remove it. This is reported to core as an
ordinary connected-roundabout endpoint ownership issue, not hidden with a floating field endpoint.

## Baseline and terrain honesty

Paka excludes exactly the 22 new mainline source ways and dedicated connector 698085714 **before**
network/raster/vector generation. The old town road, western approach, I/284 roundabout, eastern
I/16 roundabout/approaches and III/28425 remain. An independent node check confirms III/28425 ways
1131933444→1131933445→1131933446→124487914 remain connected through node 9169734216 without the
160 m new mainline segment. This is a **modern-junction baseline**, not a historical snapshot.

Current terrain really includes bypass work. At 50.49429 N, 15.5433476 E, a 1 km DMR hillshade shows
the curved road cutting; a transverse transect has centre **509.68 m**, north side **517.23 m at
30 m**, south side **516.22 m at 30 m**. The served orthophoto shows construction earthworks, not
finished pavement. TIFF/service metadata do not establish the local acquisition/update date.
Removing OSM pavement leaves this existing-earthwork advantage. The picker and pack note disclose
it; no claim that original national 2009–2013 acquisition dates prove preconstruction pixels.

## Gates so far

- Python pipeline: 28 tests pass with `uv run --with numpy --with shapely --with pillow python -m
  unittest discover -s pipeline -p 'test_*.py'`. Pillow is an actual hydrology dependency missing from
  the earlier abbreviated gate command.
- Typecheck, 356 TS tests and production build pass at the additive graph milestone.
- D11 rebuilt scoring files are byte-identical; metadata JSON is semantically identical and its
  original formatting is preserved. Frozen model-18 bills/geometry pass, no fixture recapture.
- All five top-level D11 designs remain VALID with reconciled parts. Outcome audit runs straight,
  saved designs and 24 random edits; existing long links/random engine limits remain reported.
- D11 GPU **bend/road/radius/pin/vpi** each pass individually, zero long tasks/shader compilation.
  Preview latency p50/p95 ms: 34/68, 32/62, 26/73, 34/76, 14/27 respectively.
- D11 smoke and full persona playtest pass with no browser errors; browsers/servers close after each.
- D3 GPU map/ends/noise/photo captures inspected personally: route crosses the Sázava landscape,
  surfaces/terrain/photo load, VALID displayed. Ends are documented planned-corridor anchors (A is
  in open ground near the future Jílové approach, not falsely advertised as an existing junction).
- Picker component browser checks pass: four cards, Start, canonical project Continue preserving
  unrecognized bytes, return, direct D11, missing marker/retry, and unknown link. The test replaces
  only the entry module to isolate the component; **integrated main bootstrap is owned/tested by U**.

Final new-scenario gates, final fingerprints, integrated picker/default/Start-over checks and D35
full-corridor decision are still required before merge. Screenshots 73–78 are reserved for this stream;
no global README changes are made here.
