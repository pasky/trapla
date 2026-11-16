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
