# Long corridors: continuation notes (handoff, 2026-11-16)

Branch `side-agent/long-corridors` (worktree-0002), merged with main 93f849d (model 21); this branch is
cost model 22 (the local grade solve). Background: research/39 (sections, ends, starters, whole corridors,
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
