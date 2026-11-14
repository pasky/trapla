# Evaluate performance regression

The timings below document the **historical model-13 optimization**, not current model-15
automatic footprint engineering. Current engineering, saved-design validity and performance limits
are in [footprint-conflicts.md](footprint-conflicts.md). Model 15 deliberately changes profiles,
structures and volumes; its performance work uses separate frozen bills and geometry hashes.

Baseline: `2e10999`. Measurements: Node 22.23.4, real D11 pack, `BENCH_WARMUP=15 BENCH_N=30 npx tsx scripts/bench.ts scripts/*design.json`. The baseline runs in a detached worktree with the same pack and dependencies. `bench.ts` now averages phase timings across measured evaluations instead of displaying the last sample alongside a mean total.

## Before / after

Milliseconds per phase (exclusive, **before → after**); total includes final checks. Phase differences are calculated from the benchmark's averaged cumulative timings and rounded to 0.1 ms.

| Design | Stations | Auto-profile | Sections | Structures | Earthworks | Town | Cost | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| best | 1.8 → 1.7 | 74.8 → 29.0 | 5.4 → 1.7 | 1.7 → 1.7 | 0.3 → 0.3 | 29.5 → 13.7 | 0.3 → 0.3 | **114.6 → 49.2** |
| demo | 1.3 → 1.0 | 71.1 → 25.8 | 5.3 → 1.6 | 1.3 → 1.3 | 0.3 → 0.3 | 24.7 → 12.2 | 0.3 → 0.3 | **105.0 → 43.2** |
| direct-80 | 0.9 → 0.9 | 82.0 → 27.7 | 4.6 → 1.4 | 1.5 → 1.1 | 0.2 → 0.1 | 34.6 → 14.9 | 0.3 → 0.3 | **124.7 → 46.9** |
| direct-90 | 1.3 → 1.1 | 86.8 → 29.9 | 5.2 → 1.4 | 1.6 → 1.2 | 0.2 → 0.2 | 29.2 → 13.7 | 0.3 → 0.3 | **125.6 → 48.5** |
| town-centre | 0.9 → 0.8 | 64.5 → 23.9 | 5.1 → 1.8 | 1.6 → 1.3 | 0.2 → 0.2 | 36.9 → 17.6 | 0.3 → 0.2 | **110.1 → 46.4** |

Process CPU ms/evaluation: best **188 → 83**, demo **157 → 65**, direct-80 **192 → 67**, direct-90 **190 → 67**, town-centre **166 → 68**. CPU accounting includes V8 background threads, so it exceeds elapsed time.

These are warmed full evaluations, not a whole-result/design cache. Concurrent SwiftShader jobs caused large timing excursions during development (including 2× slowdowns); the reported runs were taken after those jobs subsided. The first cold evaluation includes JIT startup and is not covered by the warm latency target.

## Hotspots and changes

`node --cpu-prof --import tsx scripts/bench.ts scripts/*design.json` showed auto-profile cost callbacks, garbage collection, DP solving, section helper creation, and crossing geometry/connected-way traversal as the main costs.

- Auto-profile previously priced all 4,001 heights for every geology/water class on every shadow-price iteration and clearance retry. Each solve now fills only its conservative reachable height envelope. Class/kind blocks are allocated only when used. The height grid, interpolation, objective, transition order and search policy remain unchanged.
- Flat earth geometry, geological cut bands, bridge estimates and hydraulic options are reused within an evaluation across mass-balance iterations/retries. Culvert sizing caches the three barrel-length predicates instead of repeatedly recomputing runoff and scanning assemblies. No route-dependent profile data survives an evaluation.
- Cross-sections no longer create integration/template helper closures for every side of every station, including the repeated mass-balance sections.
- Crossing candidate treatments share read-only dense OSM paths within a geometry build. Projection caches use numeric coordinates; tree-walk helpers are reused. Terrain points are materialized only for surviving anchors/visible crossing road samples. RoadNet retains endpoint keys for its immutable segment coordinates.
- Final checks were below approximately 1 ms in low-load runs. The max-radius advice did not warrant a new invalidation-sensitive cache.
- The worker already keeps one pending request and evaluates the latest queued edit after a zero-delay timer. A test verifies a 20-edit burst produces only the latest result, then correctly handles a second burst. Main-thread messages still occur per edit, but queued intermediate designs do not each trigger evaluate. An evaluation already executing synchronously cannot be cancelled.

## Numerical checks

`tests/fixtures/evaluate-costs.json` was captured **before the historical optimization**, then explicitly reviewed for the model-13 measured-path pricing change documented in `earthwork-seams.md`. It and `evaluate-pack.json` are preserved unchanged by model 15. The old bills were reproduced with unchanged main on the identical original pack before reviewing the new engineering deltas.

The active model-15 regression uses `evaluate-remedies-original.json` (the ten historical inputs) or `evaluate-remedies-current.json` (six current routes plus five control/drag variants), selected by a recognized SHA-256 pack fingerprint. It checks every bill leaf and per-part sum below half a cent, exact VPIs/material value, validity/violation ranges, and a canonical hash of retained sections, supports and crossing/remedy geometry. Unknown or incomplete installed packs fail loudly; only an absent optional pack skips. A performance optimization must not recapture these fixtures.

```sh
npx tsx scripts/eval-regression.ts
git worktree add --detach /tmp/trapla-perf-before 2e10999
npx tsx scripts/check-profile-lut.ts /tmp/trapla-perf-before/src/core/autoprofile.ts
```

The differential script compares 400 seeded synthetic profiles with the original solver: steep terrain, pins, multiple cost classes, manual structure kinds, clearance constraints and material-balance iterations. Full results match exactly. Review caught a lower-grid boundary issue: interpolation at clamped height −100 m still reads its zero-weight neighbour. That entry is now always initialized, with a dedicated deep-tunnel regression; reverting the fix fails both the dedicated test and seeded case 91.

Validation: **218 tests**, `npx tsc --noEmit`, `npm run build`, and `PORT=5214 npm run smoke` pass. Build retains the existing large-main-bundle warning. UI/render files are untouched.
