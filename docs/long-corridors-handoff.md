# Long corridors: continuation notes (handoff, 2026-11-16)

Branch `side-agent/long-corridors` (worktree-0002), merged with main 2decf53 (model 22); this branch is
cost model 23 (the local grade solve). Background: research/39 (sections, ends, starters, whole corridors,
"Local edits"), docs/evaluate-performance.md (top two sections), PLAN.md "Local edits".

## What exists

- Středočeská D3 as five section missions `d3-0301` … `d3-0305`, the whole D3 `d3-full` (56 km) and the whole
  D35 `d35-full` (33 km); old D3 / D35 presets retired (Continue only). Ends: declared junctions (D0/II-101,
  I/18, the open D3, I/35); every mission end that meets an interchange or a road has a marker sign and a card
  ("Interchange with road I/18 — its ramps are not part of this job …", `ScenarioParams.ends`, `core/terms.ts`
  `endCard`, Sel kind `end`).
- Windowed drag previews in their own worker (`core/preview-window.ts`); the project total follows a drag live
  (≈, the last full total with the dragged road's preview bill).
- Model 22, the local grade solve (`core/autoprofile.ts` `profileBlocks` / `blockwise` / `knotCount`,
  `core/evaluate.ts`): blocks between long straights, boundary windows, block-wise mass balance, inputs placed
  from the block ends; separation / strict retries and support lifts per stretch. `scripts/locality.ts`
  measures it (far grade change, far bill, far violations after bend moves).
- Start view frames A and B clear of the panels (`View.resetCamera`, `View.frameSafe`); a long north–south
  route is looked at across.
- Tools: `scripts/scenarios/check.ts --seed` (no seeded bend within 750 m of B), `repair-starter.ts`,
  `screenshots.mjs`, `start-check.mjs`, `scripts/repair-designs.ts` (published designs after a model change),
  `scripts/drag-perf.mjs --scenario <id> --preset <id>-motorway`.

## Open (playtest-qa-2)

- P0 1(a) infeasible remedies and P1 7 track conflicts after drags: the crossing remedy choice is
  crossing-links' (valid-reroutes branch); here only the grade avoids them (separation retry, per stretch).
- P2 13 star-shaped ramp earthworks: drawn for an infeasible bridge over our road (crossing rendering).
- P2 11 / 14 (discarding old saves, undo across reload): global, reported to the parent.
- Residual non-locality: support-lift targets come from the station-based engineering; a bend move that
  moves a block boundary re-solves both neighbouring blocks.

## Next (parent, 2026-11-16 09:15) — before QA / merge

1. **Demo design +10.5 % under blocks** (scripts/demo-design.json, 4.67 → 5.16 bn vs main 2decf53): find which
   block boundaries cost it. Tools: per-km bill (sum `r.parts` per km) under blocks vs a whole-route solve —
   a temporary switch in `autoProfile` (`if (anchored && nb > 1)` → skip `blockwise()`) gives the global DP on
   the same anchored inputs (scratch helpers in /tmp/lc-tmp-scripts: one-eval-tmp.ts, parts-tmp.ts,
   dpcmp-tmp.ts). Try wider boundary windows (`BLOCK_WINDOW`, `BLOCK_REACH`, `BLOCK_WINDOW_MAX` in
   autoprofile.ts) and boundary placement (`profileBlocks`, `BLOCK_SPACING`, `MIN_BLOCK`); check locality with
   `SCENARIO=d3-full MOVES=20,60 npx tsx scripts/locality.ts scripts/scenarios/d3-full/d3-full-motorway.json`
   (now: 0/16 far-violation changes, worst 3.9 m) and d35-full. Report per-design before/after (D11 five,
   railway, sections, whole D3/D35). Any change of the model → recapture: `repair-designs.ts --write`,
   `eval-regression.ts --capture=current --reviewed-model-change`, starters via `scripts/scenarios/repair-starter.ts`
   + `/tmp/lc-tmp-scripts/apply.py` (replaces moved bends in scenario.ts and fixtures), sweep
   `/tmp/lc-tmp-scripts/sweep.sh` (all saved designs and starters). Accept the remainder as a documented
   trade-off (research/39 "Local edits").
   Known facts: the D35 regression came from a coarse-grid gradient loss (fixed by `knotCount`), not from v;
   bills of individual designs swing ±10 % with small grade changes (lifts / crossing remedies), so compare
   several designs, not one.
2. d11-railway invalid on main and the D35 km 6.98 track: forwarded to crossing-economy (remedy choice).
3. **Interface for core-play-polish** (urban / demolition cost signals in the height search, on top of the
   block solver): costs enter `autoProfile` only as per-metre cost functions of grade-minus-ground `h`
   (`costPerM` / `BalanceSearch.costFor(v)`) evaluated at cost samples; a sample carries chainage, ground,
   weight and an offset into the LUT table (block × cost class × structure kind). New location-dependent
   costs should be a cost class (station array `costClass` + `classAt(s)` for the anchored samples) or a
   point class (`points`, exact chainage) — never per-station arrays read by station index in the DP (they
   would move with the stations and break locality). Document this in the autoprofile header when touching it.
4. playtest-qa-2 re-tests this tree next.

State at handoff: all committed (HEAD 967d9b1), main 2decf53 merged, cost model 23, gates green (see the
parent summary in the session). Untracked scratch only in /tmp/lc-tmp-scripts.

## Session 2026-11-16 ≈ 10:00 (uncommitted work committed at handoff; drag-perf NOT yet re-run)

Done (task 1, 3 of the 09:15 list), all in model 23 (unmerged, version unchanged, fixtures recaptured):
- **Demo +10.5 % root cause = gradient-reserve bug, not blocks.** `solve()` kept `u/corrSpan` of grade in reserve
  on every interval; anchored `corrSpan` = last block only, and `knotCount` picks spacings where gmax·d/u is just
  above an integer, so the reserve cost a whole grid step everywhere (6 % → 5.6 %): a tunnel at demo km 8.
  Now the reserve applies only from `corrFrom` (the last block) and `knotCount(…, last)` accounts for it.
  Demo 5.16 → 4.90 (blocks) vs 4.79 whole-route solve on the same anchored inputs; the remaining demo block
  cost is mid-block (per-block material values 261/−196 vs one 114), not boundaries.
- **Window 1.5 → 5 km** (`BLOCK_WINDOW = 5000`, REACH/WINDOW_MAX removed): sum of the 13 valid designs equals
  the whole-route solve (112.2 vs 112.3 bn; 1.5 km: 114.7). Spacing 3000 tried: worse/mixed.
- **Three DP non-localities found and fixed (evaluate.ts):** (a) the strict-retry pass started from the lifted
  line but lost its lift targets when a failed lift elsewhere triggered a DP retry → `finish(…, from: LiftState)`
  carries targets + retried targets; every lift DP retry asks for all retried targets; (b) `keepsNarrow` rejected
  every lift on the route if the DP line already missed one narrowing → judged against the line being lifted;
  (c) rail/river raster clearances and motorway crossings were put on 1–3 stations depending on the station grid
  (penalty per station → clear-vs-pay flipped 22 km away) → `clearRuns`: one run per crossing, its highest
  requirement at max(2, round(len/10)+1) points along it, each on a free station (`freeStation`); the lift DP
  retry uses free stations too. Engineering keeps the station-based `clearance`.
- Interface note for core-play-polish written in the autoprofile.ts header (task 3).
- Repairs: whole D3 bend 26 12 m; whole D35 bend 17 −90 m (stream 170 m before B, geometrically unclearable);
  D3 earlier-map road starter bend 1 25 m (motorway starter keeps it). scenario.ts comments updated.
- Bills (main 2decf53 / HEAD 376c9ed / now): best 4.13/4.19/4.18; demo 4.67/5.16/5.03; direct-80 4.82/5.05/4.95;
  direct-90 5.49/5.64/5.47; town-centre 11.39/11.16/11.16; railway 25.36/26.92/27.78 (invalid ×2 everywhere);
  D3 earlier-map 18.34/18.03/17.22; D35 first section 19.32/21.32/20.34; Nová Paka 2.69/2.73/2.75;
  0301–0305 now 4.78/7.58/10.06/9.30/9.81; whole D3 41.17, whole D35 33.69 (repaired fixtures).
  Demo is +2.5 % from the river-run requirement (stricter, correct) → a support lift at km 7.
- Locality on the repaired fixtures (HEAD code → now): whole D3 1/16 (4.9 m) → 4/16 (7.7 m); whole D35 6/10
  (6.9 m) → 1/10 (4.9 m). The DP is now local; every remaining far change traced is **station-based
  engineering on the shifted station grid** (ds = L/⌈L/10⌉ moves every station when the length changes): bridge
  support layout (km 12.1 lift), overbridge ramp check (km 39.4 → separation retry), track reroute (km 49.4),
  culvert (km 28.3). Next lever: anchor the station grid (big change: uniform-ds assumption everywhere).
- Gates green: tsc, vitest 634, build, bench 5/5, eval-regression 11/11 (recaptured), smoke, playtest 52,
  start-check, outcome audit vs main (violations 144 → 128, footprint 110 → 97, bills −0.06 %).
  **Not yet run: drag-perf --gpu --check** (D11 all, d3-full/d35-full/d3-0305 all, 0301–0304 bend). research/39
  "Local edits", AGENTS.md open items and PLAN.md not yet updated with the above.
- Scratch: /tmp/lc-tmp-scripts (runall.sh = all designs in parallel; mkdbg.py = LC_DBG diagnostics patch for
  evaluate.ts; locdiff/movedump/gradedump helpers were in scripts/, deleted — recreate from this note), /tmp/lc-base
  = main 2decf53 worktree (remove with `git worktree remove --force /tmp/lc-base` when done).

## Session 2026-11-16 ≈ 10:30 (main a8d8de5 merged: the local grade solve is now model 24)

- **Merge** of main a8d8de5 (motorway-rail, its railway model 23): `startGrade` / `endGrade` (+ slack) replace
  `endpointGrades`; railway grids (0.5 m) also in blocks and `knotCount`; railway tie-in / retired track in the
  block-placed raster samples (window-shifted tie-in for previews); `fixedProfile` stretches solve without
  blocks; lift loop keeps main's `liftStop` / `keepsExterior`. A lift DP retry is now kept only if it meets a
  stretch the lifts could not (it broke main's railway tie-in test: a target 10 m from A, unreachable, swapped
  the line for one paying the penalty). UI: live total + corridor groups, run-batched grade strokes skipping
  stretches where the directions run apart. Fixtures recaptured as model 24. All saved designs and starters
  VALID (sweep), the Královec railway starter VALID 10.23 bn (main 10.43).
- **P1 straight start**: not blocks. A drag on the straight puts in a bend and turns the whole line about B;
  main gives the same swings (research/39 "Second pass"). Grid boundaries on long straights (lines across
  the A–B axis every 3 / 4 km) tried and dropped: no locality gain, single designs ±10 %. Scratch:
  /tmp/lc-tmp-scripts/autoprofile.grid.ts, evaluate.grid.ts, evaluate.gridexp.ts. A real fix is an editing
  one (a drag on a long straight could keep the rest of the line in place) — interface work.
- **P0 residue (km 6.98 track, whole D35)**: not reproduced (all 18 bends ±20/60 m and new bends at 11.7 / 25.4);
  6/72 far changes are one class I road at km 32.0 from the 9.7 km last block (a chain of slightly shorter
  straights leaves no boundary; `profileBlocks`).
- **D35 first section viaduct**: a near-tie of the coarse 2 m corridor pass, not blocks (whole-route on the
  same inputs 20.71; main's line 19.28 under this model, DP objective −1.3 %).
- **P2**: photo note hidden with the photo (`hideToast(text)`); the planned-line tag no longer covers B
  (`Declutter` measures a marker's absolutely placed parts). Whole-D3 last preview −1.8 bn vs settled: within the
  documented windowed-preview accuracy (−8 … +10 %), not changed.
- Timing: 5 km windows cost ≈ +15–20 ms per full D11 evaluation against 1.5 km (see abw.txt in scratch); best-design
  also pays a strict retry main does not (its line buries a road first).
