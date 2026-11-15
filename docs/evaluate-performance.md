# Evaluate performance regression

## Interactive dragging (2026-11-15)

The owner reported waypoint drags taking hundreds of milliseconds up to a second per step. The
worker was not the main cause: a real mouse drag profiled in Chromium showed each worker result
costing **≈ 1.9–3.4 s of main-thread JavaScript** (`HandlePostMessage` ≈ 90 % of the main thread in a
Chromium trace; result deserialisation, GC, layout and GPU were minor):

- `CrossingRenderer.setResult` ≈ 85 %: every crossing-collar vertex asked `groundBlend()`, whose 100 m
  grid cells held up to 355 corridors (2.5 m crossing-road segments, string keys, `Math.hypot` each);
  ≈ 10⁶ unshared crossing vertices per result (a `new THREE.Color`, a geology lookup and spread
  copies per vertex, every collar point computed twice); new materials per result.
- `View.setResult` ≈ 170 ms (crossing surfaces, daylight collars, a new terrain material per 32 stations).
- Profile panel: several synchronous redraws per result; HUD: a number formatter built per call.

### What changed

- **Two tiers.** Uncommitted store updates (bend, radius-grip, pin and height-point drags) request a
  *preview* (`evaluate(ctx, d, { preview: true, materialValue })`): one auto-profile solve at the last
  full result's material value (no mass-balance search or clearance retries), one engineering pass
  without retaining walls or support lifts, no strict retry, crossing geometry, footprint remedies or
  noise. The **full** evaluation follows 150 ms after the last move, or at release (not repeated for an
  identical design). A preview updates only the centreline, the long profile, the curve grips and the
  HUD total, shown as `≈ … · ≈ PREVIEW` with violations "checked when you pause" and the best chip
  dimmed; it is never offered as a best score. A full result that the drag has already moved past is
  shown as provisional too. Full evaluations are unchanged (`scripts/eval-regression.ts` passes).
- **Sliced 3D rebuild.** Only the newest full result rebuilds the earthwork ribbon, collars and
  crossings: generators (`View.buildResult`, `CrossingRenderer.build`) run cooperatively in ≈ 8 ms
  time-budgeted tasks (`src/render/slices.ts`; input and rendering get their turn between tasks as
  the browser schedules them), staged until both are complete and then swapped in together; any newer
  request cancels the rebuild and disposes what it built.
- **Hot spots.** Fine numeric-key blend grid with a squared-distance reject; `collarPoint` skips
  zero-weight lookups; crossing surfaces keep their meshes while a 1 mm input hash is unchanged (it
  covers every surface whose blend corridor — toe width + 12.5 m — reaches this one's collars, and
  the turning heads; `tests/crossing-reuse.test.ts`); terrain collars share vertices and carry positions only (the
  terrain material reads nothing else); strip/collar rows computed once; persistent shared materials.
- **No shader recompiles.** A retired material that is the last user of the program it was last
  drawn with is kept (one per program; reset when the WebGL context is restored) instead of disposed: results without blocked markers / walls / buyouts no longer delete
  those programs for the next result to recompile (≈ 10 ms GPU, ≈ 1 s SwiftShader).
- The profile panel's redraw requests are coalesced into one paint per animation frame (readers of
  its scales — hit tests, `toClient`, the selection bar — flush a pending paint).

### Measured

`node scripts/drag-perf.mjs --gpu [--mode bend|road|radius|pin|vpi] [--root DIR] [--check]`: a real
mouse drag of bend 10 (index 9) of `best-design` for 2 s (60 Hz pointer timeline) after a short warm-up
drag; frame intervals, main-thread time per worker result, worker time, latency from posting the
evaluation (in the pointer-move handler) to its handled result, the longest gap between displayed
results, long tasks during the drag and after release, shader programs compiled. Integrated AMD
Radeon (RADV GFX1150, Vulkan); every row on the same host.

Quiet host (load average ≈ 5 on 24 threads), one run each:

| Bend drag, GPU | fps | p95 frame | main thread / result | worker | latency p50 / p95 | release → settled |
|---|---:|---:|---:|---:|---:|---:|
| `dd31e08` (before the feature burst) | 60 | 17 ms | 11 ms | 26 ms | 45 / 70 ms | 23 ms |
| `17dac0a` (perf merge) | 23 | 150 ms | 131 ms | 53 ms | 259 / 383 ms | 300 ms |
| `4061314` (before this fix) | 5 | 1.8 s | 1.76 s | 104 ms | 3.8 / 3.8 s | 3.3 s |
| this fix | **60** | **17 ms** | **5 ms** (p95 7) | 19 ms (previews) | **25 / 34 ms** | 0.32 s |

Heavily loaded host (load average 25–34: other agents' SwiftShader browsers; worker times ≈ 2×),
two runs each, ranges:

| Bend drag, GPU | fps | p95 frame | main thread / result | worker | latency p50 | release → settled |
|---|---:|---:|---:|---:|---:|---:|
| `dd31e08` | 57–60 | 17–33 ms | 16–22 ms | 41–60 ms | 67–96 ms | 65 ms |
| `17dac0a` | 20–23 | 150–183 ms | 130–174 ms | 57–101 ms | 278–356 ms | 230–390 ms |
| `4061314` | 2.3–2.6 | 2.7–3.1 s | 2.7–3.1 s | 78–102 ms | 5.4–6.2 s | 2.6 s |
| this fix | 58–60 | 17 ms | 9 ms (p95 15) | 40–41 ms | 65 ms (p95 92–102) | 0.64–0.74 s |

No long tasks (≥ 50 ms) during the drag or after release with the fix. Release → settled is the
full evaluation plus the sliced rebuild (quiet: ≈ 200 ms busy in ≈ 23 slices of ≤ 12–32 ms, commit
≈ 10–20 ms): no frame drops, but it takes longer to complete than before the crossing/collar 3D
detail existed. Other drag kinds (`--mode`, quiet host): radius grip, pin and height point all run at
60 fps, p95 frame 17 ms, main thread 5–9 ms per preview, latency p50 29–39 ms / p95 51–66 ms,
longest gap between displayed results 63–79 ms; their full rebuilds are smaller (148–264 ms busy)
because most crossing surfaces are reused.

Worker per drag step (`STEPS=16 [PREVIEW=1] npx tsx scripts/bench-drag.ts`, quiet host): full
104–148 ms median, **preview 21–27 ms median** (the single auto-profile solve is most of it). Under the
heavy load above: full 124–245 ms, preview 27–51 ms.

Preview accuracy (10 bend steps per design): the bill is −8 to −18 % against the full one (no
retaining walls, footprint remedies, noise walls or measured crossing geometry; town-centre up to
+9 %), the grade line within ≈ 1.5 m; structure runs can differ until the pause. Its step-to-step
cost changes do not track the full bill's (which move with remedies and strict retries), so the HUD
shows it as an approximation only.

SwiftShader (no GPU): frames are ≈ 0.4–0.6 s whatever the app does (CPU rasterisation of the scene),
so `--check` there budgets the main thread only (preview handler p95 ≤ 50 ms, latency p50 ≤ 150 ms,
no long tasks, no shader compiles). GPU budgets: p95 frame ≤ 34 ms, preview latency p50 ≤ 60 ms /
p95 ≤ 120 ms, main thread per preview p95 ≤ 25 ms, longest gap between displayed results ≤ 250 ms,
no long tasks during the drag or after release, no compiles. All four modes pass on the quiet host;
under the heavy load above the bend drag's median latency (65 ms) exceeds the 60 ms budget, so a
`--check` on a busy machine can fail on latency alone. Budgets can be overridden (`DRAG_FRAME_P95`,
`DRAG_LATENCY_P50`, …).

Not done: building the crossing / collar geometry in a worker (would remove the remaining
≈ 0.2–0.45 s of sliced main-thread rebuild after release; needs the geometry code split from three.js objects),
and a second worker so that a preview never waits behind a full evaluation started by a pause.

## Model 16 → 17 pass (2026-11-15)

Same machine/pack, median of 30 warm runs per design (`ROOT=… N=30` paired script, model-16 HEAD `f7fe117`
versus this branch), plus the new **drag** benchmark `npx tsx scripts/bench-drag.ts` (24 consecutive
evaluations with one bend moved 1.5 m/0.9 m per step; nothing is ever repeated, so caches of identical
inputs cannot flatter it). Exclusive ms per phase; `sections` = all engineering passes (incl. a strict
retry's first pass). Shared host, ±5–10 % noise.

| Steady, ms | Profile | Engineering | Crossings | Footprint | Town | Total |
|---|---:|---:|---:|---:|---:|---:|
| best | 26.5 → 22.8 | 16.0 → 15.6 | 17.3 → 14.1 | 5.9 → 5.7 | 5.2 → 4.4 | **80.9 → 69.7** |
| demo | 26.9 → 23.7 | 23.1 → 43.9¹ | 14.5 → 12.1 | 5.9 → 5.4 | 5.2 → 5.0 | **81.1 → 94.7¹** |
| direct-80 | 27.8 → 24.7 | 16.9 → 17.9 | 20.6 → 19.0 | 6.2 → 5.9 | 4.7 → 4.8 | **82.6 → 78.7** |
| direct-90 | 22.7 → 20.0 | 31.3 → 30.9 | 14.9 → 13.5 | 3.1 → 3.3 | 4.4 → 4.3 | **81.9 → 76.8** |
| town-centre | 27.7 → 22.7 | 49.6 → 38.7 | 13.0 → 11.4 | 5.2 → 5.6 | 6.3 → 6.1 | **107.6 → 88.0** |

| Drag mean (median), ms | best | demo | direct-80 | direct-90 | town-centre |
|---|---:|---:|---:|---:|---:|
| model 16 | 99.8 (108) | 88.5 (80) | 108.2 (91) | 114.7 (110) | 112.9 (111) |
| this branch | 87.2 (88) | 80.1 (69) | 100.4 (85) | 107.8 (100) | 98.6 (102) |

¹ Model 17 behaviour, not a slowdown: demo's new street underpass (km 7.00) widens the embankment over a
service road whose relocation then needs the strict re-engineering pass. On model-16 inputs the perf
commit alone gives demo 81.1 → 77.5 ms.

**The ≤ 60 ms target is still not met** (steady 70–95 ms, drags 80–108 ms mean). The UI therefore no
longer waits on it: while the worker lags behind a drag (an older request still running), the profile
panel immediately shows the moved route's ground with the previous heights stretched to its length
(Automatic) or the player's own height points (By hand), washed over the last result and labelled
provisional (`src/ui/provisional.ts`, ≈ 0.3 ms on the main thread). The plan line already moves live.

Bit-identical changes (frozen model-16 bills/geometry passed on both recognized packs before the model
change; model-17 fixtures re-verified after every later step):

- Auto-profile: dry-ground height-cost tables and flat geometry rows are route independent, so they are
  shared across evaluations per terrain (key: category, terrain class, material value, pack ground id,
  kind; LRU of 8 material values). Water classes share tables only within an evaluation (clearance
  retries, retry DP). The DP accumulates segment costs only for grades some reachable state can use.
- Crossings: route projection uses typed per-segment terms, a previous-query segment hint and per-cell
  distance pruning (exact minimum and tie-break preserved); link-smoothing probes reuse one scratch point;
  station windows use binary search; distance-sorted way paths are cached.
- Retaining: each station's screening outcome is recorded and replayed when everything it read is
  unchanged (same candidate set, section widths, grade, connected barrels and crossing-way membership),
  across engineering passes, barrel re-screens and the strict retry; allocation-free loops in `select`.
- Strict retry: the first pass stops after the footprint screen; it is completed (noise, bill, checks)
  only if the retry still has violations, since every blocked road is itself a violation.

Not done, and why: caching crossing links or cost tables by route *position* across drag evaluations
cannot be bit-identical — `station()` spreads `L/ceil(L/10)` evenly, so any length change moves every
station (and every crossing intersection) by a few ulps or metres. Remaining time: the DP inner loop
(≈ 2 M interpolations, ~10 ms), first-pass retaining feature queries (≈ 3.6 ms), two full crossing
builds (≈ 4.6 ms each) and strict retries (≈ 30 ms when triggered, 0–50 % of drag steps).

---

The timings below document the **historical model-13 optimization**, not current model-16
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

`tests/fixtures/evaluate-costs.json` was captured **before the historical optimization**, then explicitly reviewed for the model-13 measured-path pricing change documented in `earthwork-seams.md`. It and `evaluate-pack.json` are preserved unchanged by models 15–16. The old bills were reproduced with unchanged main on the identical original pack before reviewing the new engineering deltas.

The active model-16 regression uses `evaluate-remedies-original.json` (the ten historical inputs) or `evaluate-remedies-current.json` (six current routes plus five control/drag variants), selected by a recognized SHA-256 pack fingerprint. It checks every bill leaf and per-part sum below half a cent, exact VPIs/material value, validity/violation ranges, and a canonical hash of retained sections, supports and crossing/remedy geometry. Unknown or incomplete installed packs fail loudly; only an absent optional pack skips. A performance optimization must not recapture these fixtures.

```sh
npx tsx scripts/eval-regression.ts
git worktree add --detach /tmp/trapla-perf-before 2e10999
npx tsx scripts/check-profile-lut.ts /tmp/trapla-perf-before/src/core/autoprofile.ts
```

The differential script compares 400 seeded synthetic profiles with the original solver: steep terrain, pins, multiple cost classes, manual structure kinds, clearance constraints and material-balance iterations. Full results match exactly. Review caught a lower-grid boundary issue: interpolation at clamped height −100 m still reads its zero-weight neighbour. That entry is now always initialized, with a dedicated deep-tunnel regression; reverting the fix fails both the dedicated test and seeded case 91.

Validation: **218 tests**, `npx tsc --noEmit`, `npm run build`, and `PORT=5214 npm run smoke` pass. Build retains the existing large-main-bundle warning. UI/render files are untouched.

### After the interface rethink

Every drag goes through the preview path: a bend, the road itself (`--mode road`: dragging the road inserts a
bend that follows the pointer), a radius grip, a pin (made by dragging the profile's road line, `--mode pin`),
a height point By hand (`--mode vpi` switches to By hand first; in Auto the line drag pins instead). The full
result's main-thread work stays small: the inspector does not search for the largest radius that fits on
every result (that 40 ms geometry search runs only when *Widest* is clicked). Three rounds of all five modes
with `--check` on the GPU pass; full-result handler ≈ 5 ms (profile 2.5, HUD 1.5, curve grips 1.4, inspector
0.3, choices list 0.3).
