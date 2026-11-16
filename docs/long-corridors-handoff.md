# Long corridors: continuation notes (handoff, 2026-11-16 05:10)

Branch `side-agent/long-corridors` (worktree-0002), all committed (df3813b). Gates green at f058dc7: tsc, 608
vitest, build, eval-regression 11/11 bit-exact, bench 5/5 VALID, outcome audit identical to main, smoke,
playtest, start-check (all 9 new/kept scenarios), drag-perf `--gpu --check` all modes on D11, d3-0305,
d3-full, d35-full + bend on d3-0301…0304. Cost model: bump at merge (separation retry changes bills of
previously-invalid grade-separated designs only).

## What exists (read first)

- research/39-d3-sections.md: sources, section boundaries, ends, starters, whole-corridor packs, D35 full.
- docs/evaluate-performance.md, top section: windowed previews + preview worker + main-thread fixes, numbers.
- Code: `src/core/preview-window.ts` (windowed preview; `rememberFull`/`adoptFull`/`previewBase`),
  `src/core/evaluate.ts` (`opts.window`, `opts.separate` retry, `SEPARATION_PENALTY`), `src/core/autoprofile.ts`
  (`endpointGrades`, `clearancePenalty`), `src/worker.ts` (roles full/preview, MessageChannel bases,
  transferred preview buffers), `src/main.ts` (two workers), `src/render/{slices,view,route-scene,route-surfaces,
  crossings}.ts` (sliced long-route rebuild), `src/ui/profile.ts` (pixel-decimated paint),
  `src/core/data/scenario.ts` (presets, `group`, `retired`), `src/ui/scenario-picker.ts` (`pickerGroups`).
- Packs (ignored): `public/scenarios/{d3-0301..0305,d3-full,d35-full}`; configs `pipeline/scenarios/`.
  Mapped D3 chain analysis: `/tmp/d3full/` (chain.json, ranges.json).
- Tools: `scripts/scenarios/check.ts --seed` (seed + validity), `scripts/scenarios/repair-starter.ts`
  (greedy bounded bend repair), `scripts/scenarios/screenshots.mjs <id> --docs-A|B|overview <name>`,
  `scripts/scenarios/start-check.mjs [ONLY=ids]`, `scripts/bench-drag.ts` (PREVIEW=1, WINDOW=0, BEND=k),
  `scripts/drag-perf.mjs --scenario <id> --preset <id>-motorway` (DRAG_DEBUG=1 prints per-preview timings).
- Browser protocol: /tmp/trapla-browser-protocol.txt (flock -x for timed, -s + nice for untimed).

## Open: playtest-qa-2 findings (/home/pasky/projects/trapla-agent-worktree-0006/docs/playtest-findings-2.md)

**P0 1. Local edits redesign crossings 9–24 km away (whole D3 / D35).**
(a) Auto must never pick an infeasible crossing remedy (e.g. "carried over our road on a 67 m bridge" with
>10 m ramps). crossing-links' branch (worktree-0001, valid-reroutes, lowered underpasses) may already fix this:
coordinate through the parent, do not duplicate. Note our `opts.separate` retry (evaluate.ts) only re-solves the
grade when such a remedy fails; it does not change which remedy Auto picks.
(b) Locality. Measured causes of the non-local response (bend-move experiments on d3-full: moving bend 5 by
60 m changed violations at km 39–56): the auto-profile's **global mass-balance material value** (one scalar
for the whole route, `MATERIAL_VALUE` search in autoprofile.ts `balance`), station resampling (`ds = L/ceil(L/10)`
shifts every downstream station), strict / clearance / separation retries. Recommended (deterministic, no edit
history): **block-wise mass balance** – a material value per haul block (cut and fill are exchanged within an
economic haul distance of a few km, not over 57 km), blocks defined by the design only (e.g. between bends or
fixed-length blocks from A), so an edit only moves its own block's value. Anchoring far stretches to the
previous design was rejected: the bill would depend on edit history. Verify with a locality metric (grade change
beyond ±5 km of a 20–80 m bend move) and keep D11 bit-exact or bump the model with reviewed diffs.

**P1**
2. Interchange ends (0301 A at D0 / II/101, 0304 B / 0305 A at I/18) look like a motorway stopping at a minor
   road: draw ramp stubs or an interchange marker with a card "Interchange with … — ramps not in this job"
   (terms.ts vocabulary; player-text test).
3. Section B's that end just short of the road their MÚK serves (Jílové II/104, Hostěradice II/106, Václavice
   II/112): show the interchange there too.
4. Frame A and B on start (whole corridors and sections), clear of intro / legend / attribution. Note: framing
   the whole 57 km at once cost 50–130 ms GPU frames (research/39); consider a top-down framing or lowering
   terrain detail when far.
5. Whole D3: the price does not follow the drag (pre-drag ≈ value for the whole drag + 2.8 s). Check
   `activePreviewPrice` / `projectScore` in main.ts: with motorway projects the preview price may not reach the
   HUD; show the windowed preview's bill (it is the full base outside + window inside) marked ≈.
6. 0302 starter bend ≈ 30 m before B ("Bend 3 is too close to B" after a drag): the seed sampler places a bend
   near B; drop such bends (check.ts seeding) and re-validate all starters (scenario.ts initial pis).
7. Track conflicts after drags on whole D3 (km 19.97 earthworks over a track; km 25.25 tunnel portal on a track):
   re-check with crossing-links' branch.

**P2**: 8 "checked when you pause" shown when not dragging; "—" for 2.9 s with empty card/profile on load;
stale "+3.27 bn" during Undo. 9 planned-line gaps beyond ends (section packs clip the mapped chain at bbox−300 m;
see ranges in research/39). 10 picker: Nová Paka sits under the D35 heading (it follows the D35 group in PRESETS:
give it its own group or move it before), D11 card lacks speed, "D 27.5 / D 26.0" jargon, whole D3 120 vs
sections 130 km/h (explain on the card: one design speed for the whole route, 0301–0303 are 120). 12 "our road
1 m below it" ambiguous. 13 star-shaped ramp earthworks at km 45.17. 11/14 (discard old saves, undo across
reload) are global: reported to the parent.
