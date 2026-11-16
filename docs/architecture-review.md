# Architecture and engineering review (2026-11-16)

Scope: module boundaries, duplication, tests, the worker protocol, data and sourcing layout, the kind
registry and extensibility, script and gate tooling, dead code, type safety. Reviewed at main `8ac09c5`
(cost model 28): `src/` 38.8 k lines in 157 modules, 83 test files (704 tests, 17 s), 68 scripts.

Rule for everything done here: **behaviour-preserving**. Frozen bills unchanged, every result of
`scripts/exact.ts` identical (177 whole results over all 11 packs), no player-visible change, no
`COST_MODEL_VERSION` bump.

## What is healthy (keep doing it)

- **Numbers live in `src/core/data/*`** with their sources: 12 files, 125 `research/` citations, 81
  PROVISIONAL / UNVERIFIED markers. Every cited research note exists.
- **`src/core` is pure** (no DOM), deterministic (`detmath.ts`), and its results are plain data that cross
  the worker boundary. Type safety is good: no `any` to speak of, 20 `as unknown as` casts in all of `src/`.
- **The project layer is cleanly cut**: `project.ts` (types) / `project-store.ts` (copy-on-write
  transactions, history, saves) / `project-protocol.ts` (which worker reply may be shown) /
  `project-evaluate.ts` (orchestration), each with its own tests.
- **Line kinds are data rows** (`data/categories.ts`: `mode`, `gradeSeparated`, `markup`, `tracks` …) plus
  a small UI registry (`ui/route-kinds.ts`, `ui/mode-kinds.ts`) for Build → kind and rebuilding mapped lines.
- **Player text has one vocabulary and a guard** (`terms.ts`, `tests/player-text.test.ts`).
- **Tests run on synthetic terrain** (30 files) and only 5 need the real pack; 17 s for the lot.

## Findings, ranked by value / risk

Value: what it buys the next features. Risk: chance of changing behaviour while fixing it.
Status: **done** (this branch), **next** (planned here, safe), **sequence** (touches a shared core file:
needs the parent to order it against the P1-fixes and design-realism agents), **owner** (a decision).

| # | Finding | Value | Risk | Status |
|---|---|---|---|---|
| 1 | No check that a refactor leaves *whole results* identical: only 11 frozen D11 bills | high | none | done: `scripts/exact.ts` |
| 2 | Gates are a hand-typed list with a lock protocol; `bench` and the outcome audit never fail | high | none | done: `scripts/gates.sh`, `bench --check` |
| 3 | `main.ts`: one 1,760-line closure (`main()`) with ≈ 60 mutable variables | high | medium | done: 1,840 → 325 lines, 22 modules out, the shared state is a `Session`; what is left is construction and wiring (§ main.ts) |
| 4 | `evaluateRoute` is one 1,590-line function of nested closures; `buildCrossingGeometryOnce` 840 lines; `evaluateProject` 443 | high | low with the tool | `evaluateRoute` done: 14 named functions, itself 60 lines (three diffs of +74 −13, +50 −25 and +99 −29); the other two functions next (§ Core) |
| 5 | Engine control flow keyed on player text (violation titles, diagnostic messages) | high | low | titles done (shared constants); crossing diagnostics: sequence (§ Core) |
| 6 | Scripts were not type-checked; three had rotted, one crashed on start | medium | none | done |
| 7 | Worker protocol: types in two files, replies untyped, a dead legacy request | medium | low | done: `src/worker-protocol.ts` |
| 8 | The mission bootstrap, pack identities and a route's crown width each derived in 2–4 places | medium | low | done: `core/project-mission.ts`, `packIdentities()`, `core/route-section.ts` |
| 9 | Dead code: the old single-road `Store`, 7 unreferenced exports | medium | none | done |
| 10 | A new line kind touches ≈ 15 files outside the registries; the designed kernel seam is unused | high | medium | started: `ROUTE_KINDS` in project-evaluate.ts (evaluator, noise method, clearance per kind); rest next (§ Extensibility) |
| 11 | Player words per kind ("road / railway / motorway", "old track", ‰ vs %) re-derived in ≥ 8 places | medium | low | next |
| 12 | Browser gates run against the live working tree (vite); fixed ports collide between worktrees | medium | none | done in part: port per checkout; run gates from a clean checkout (§ Tooling) |
| 13 | 41 browser scripts each copy the server / Chromium / idle boilerplate | medium | low | 23 on `scripts/lib/browser.mjs` (the gates and every script that set the retired intro key); 17 left, when touched |
| 14 | Change lists the worker computes (`changedRouteIds` …) are never read: every full result rebuilds every road's 3D body | medium (many roads) | medium | owner / next |
| 15 | Research note numbers collide (15 ×3, 16 ×5, 17 ×3, 41, 42, 43 ×2): 33 citations in `src/` are ambiguous | medium | none | next: cite the file name |
| 16 | Engineering numbers outside `data/` (clearances, ramp limits, side slopes, a default design speed in `ui/`) | medium | low | sequence (list in § Data) |
| 17 | `View` is a 1,720-line class; `ProfilePanel.paint()` 400 lines; `Inspector` builds every card | medium | medium | next, when touched |
| 18 | Station-index clamp written out 25 times in 15 files | low | none | next: `stationIndex(r, s)` |
| 19 | Test wall time is one 16 s test (`player-text`: every violation kind) | low | none | next |
| 20 | Orphan "foundation" modules only tests import (307 lines), unused contract surface | low | none | owner |
| 21 | `data/scenario.ts` mixes scenario content (presets with their bends) with engine thresholds | low | low | next, when scenarios grow |
| 22 | `Result` is one flat interface of ≈ 100 fields (geometry arrays, bill, UI extras) | medium | high | later, with #4 |

### 1–2, 6, 12–13. Tooling (done unless noted)

- **`npx tsx scripts/exact.ts --out before.json`** on the base commit, **`--compare before.json`** after
  the change. It evaluates, for every installed pack: the straight start, every saved design and its drag
  preview, every preset's starting project through the project evaluator (road, motorway, railway
  missions) and a preview of each of its routes; on D11 also 12 seeded random designs. Each whole result
  (every array, crossing, wall, receiver; wall-clock timings dropped) is hashed; a difference prints the
  case and the bill lines that moved. 177 results, 18 s, one process per pack (capped at 3 GB each, four
  at a time). Deterministic: two runs on one commit are identical.
- **`scripts/gates.sh quick | full`** runs the AGENTS.md gates with the lock protocol (timed runs under
  the exclusive lock and once more when a budget is missed under load; untimed browser runs wait for
  queued timed runs, then share the lock under `nice`), logs per gate, a PASS / FAIL summary, exit 1 on any
  failure. `--no-browser`, `--only`, `--skip`, `--exact before.json`, `list`. Full Node gates: 3.5 min.
- `bench.ts --check` exits 1 on a design that is not VALID or whose parts do not sum to its bill (it
  only printed `!!`). The outcome audit still only prints its flags (116 on the gate's inputs today, from
  the random designs): the runner shows the count; someone should decide which flags are failures.
- `tsconfig.json` includes `scripts/**/*.ts`. Fixed: `bridge-break-even.ts` (imported `culvertExtra`,
  removed in `c6d7232`; PLAN.md and research/15–16 cite the script as the reproduction),
  `rail-rebuild-check.ts`, `rail-starter.ts` (printed fields that no longer exist).
- **A trap worth knowing:** the browser scripts start vite on the working tree. Editing `src/` while smoke
  or playtest runs reloads the page under them (seen here: playtest died with `window.trapla` undefined).
  Run browser gates from a clean checkout of the commit: `git worktree add --detach /tmp/x <commit>`,
  symlink `node_modules`, `public/scenarios` and `pipeline/cache` into it.
- `gates.sh` gives smoke / playtest a port per checkout (they listen on a fixed strict port; two worktrees
  running them under the shared lock collided).
- `scripts/lib/browser.mjs`: `startGame()` gives vite on a free port, Chromium with the GPU or software
  flags, collected errors, `open(query)` (fresh storage, intro dismissed, loaded and idle), `idle()` /
  `frames()` / `still()` that hold on a busy host, `close()`; `dismissIntro(page)` for the scripts that
  time the first load and so navigate once themselves (perf, startup-perf, drag-perf, also with `--root`
  of an older checkout). On it: the gates (smoke, playtest, drag-perf), `layout.mjs`, `camera-check.mjs`,
  `mode-play.mjs` and the 18 scripts that set the retired intro key `trapla.intro.v1` (the game reads
  `trapla.intro.v2`; 15 set only the old one): until a script selected something, **the first-run intro lay over the map's top
  left corner in their screenshots** (the start view, `valley`, `views`, `earthworks`, `photo-pan`,
  `screenshots` 01) and place names stayed clear of its box afterwards. Each was run before and after:
  same transcript, pictures identical but for the intro, the labels it displaced, contour labels now
  laid out (the shot waits for the view) and the score's change chip (a design is set after the start
  line has been shown, as a player's would be). 17 scripts with their own copy (and the right key) are
  left: scene scripts (`any-road-scene`, `owner-d3-scene`, `multi-road-scene`, `p2-scene`,
  `stretch-play`, `lazy-transport-check`), shots (`motorway`, `railway`, `noise`, `road-look`, `seam`,
  `noise-view`), `scenarios/*`, `detmath-browser-check`.
- **Six of those scripts failed on main for reasons of their own; all run again.** What each turned out to be:
  - `curves.mjs` (18 PASS, then dead): **a regression in the game.** Since the project store (`dfe66a3`)
    every undo / redo cleared the selection, so after undoing a radius change the bend's card and grips
    were gone and `+` / Widest had nothing to act on. Fixed: the selection is restored when the step
    left the selected thing in place (`ui/routes.ts`; smoke checks it: 37 PASS). Its last part also found
    the automation hook `trapla.setDesign` leaving a project transaction open when called during a
    pending `+` step or a held drag (fixed in `automation.ts`: the hook only). 38 / 38.
  - `zoom.mjs` (16 of 17): the script. A profile click selects the piece under it and frames that piece
    (its middle) since the interface rethink (`2ec36b6`); the check still expected the clicked station.
  - `crossing-economy-shots`, `crossing-works-shots`, `link-shape-shots`, `lowered-underpass-shots`: they
    named ways by id and asserted what an older cost model built there. They now find their examples by
    what they show (a road moved beside ours, a way Auto straightens, a side road regraded to a junction
    / a ramp, a walled crossing, a reconnection to shape, a way crossed more than once), so a model change
    picks other ways instead of failing; where the model no longer does a thing at all the script says
    SKIPPED. Their pictures in `docs/screenshots` (110–119, 150–156, 170–176) are still the old models'.
  - `violations.mjs` scrolled the HUD while the HUD's own smooth scroll to the selected card was running
    (one run in six framed the list, five the card): it waits for the HUD to rest, then scrolls.
- Seen while repairing them, not changed: on the D3 motorway starter Auto straightens no skewed way any
  more, and the player's *Straighten it* fails on its four most skewed ones, twice with "Your crossing
  choice clashes with our bridge or tunnel here" for a box that would be shorter and cheaper (km 5.26:
  28 m, 17.2 M against 36 m, 18.7 M; km 7.94: 27 m, 13.8 M against 75 m, 20.3 M). An undo while a step is
  open takes back that step and the one before it (`ProjectStore.moveHistory` cancels the open
  transaction, then moves: seen through the automation hook; by the code a Ctrl+Z during a held drag
  does the same). At a 1,400 px window the view bar overlaps the Scenarios button and a bend
  marker can sit on the Redo button (crossing-works / link-shape shots).
- Three kinds of script flake seen on a loaded host, all "measured before it settled": a fixed pause
  instead of waiting for the camera to stop (camera-check), a result read right after mouse-up
  (mode-play), a 6 s toast the script reaches after 4–7 s (playtest: `gates.sh` retries once under load).

### 3. `main.ts`

`main()` wires the whole game in one closure: start-up (picker, pack, store, recovery), lazy road links,
selection, edits, the evaluation loop (two workers, request ids, preview gestures, the sliced 3D
rebuild), route switching, Build, picking, drag gestures, hover, the profile's and HUD's events, keyboard
and the automation API. Anything can read or write any of ≈ 60 `let`s, so nothing can be tested without a
browser and parallel agents edit the same file.

Done, each a verbatim move behind a small interface that names what the module needs of the app (stable
objects passed directly, `main()`'s variables as live getters, commands as functions):

| module | what | lines |
|---|---|---:|
| `src/automation.ts` | `window.trapla` (what scripts drive the game through) | 210 |
| `src/ui/route-cards.ts` | side road / rebuilt stretch / railway head, the motorway's card, proposal and no-links cards | 248 |
| `src/ui/map-picks.ts` | what is under the pointer | 120 |
| `src/ui/map-hover.ts` | hover links map ↔ profile, the cursor | 111 |
| `src/ui/shortcuts.ts`, `src/ui/profile-bar.ts`, `src/ui/bend-stations.ts` | keyboard; the profile's key and zoom buttons | 96 |
| `src/eval-workers.ts` | the two workers and their init message | 26 |
| `src/ui/design-edits.ts` | the edit commands (structures, walls, pins, bends, height points, crossings, reroute shapes) and the inspector's / decision list's events | 100 |
| `src/ui/map-gestures.ts` | click, drag to bend / rebuild a mapped road / shape a reroute, double click; what a gesture grabbed is its own state | 194 |
| `src/ui/profile-events.ts`, `src/ui/hud-events.ts` | what the profile's gestures and the HUD's controls do; where a listed problem leads | 73 / 115 |
| `src/core/project-mission.ts` | scenario → starting project (also used by Node scripts) | 42 |
| `src/eval-client.ts` | what is asked of the workers, which replies count (unit-tested) | 102 |
| `src/session.ts` | what is on screen: the results shown and the selection (was seven `let`s of `main()`) | 26 |
| `src/ui/selection.ts` | `select()`, where a selection is, bringing it into view | 153 |
| `src/ui/road-links.ts` | the lazily loaded transport graph and what it brings (index, picker, mapped-road card, stretch ends) | 99 |
| `src/ui/result-display.ts` | what happens with a preview / a full result: the sliced 3D rebuild, cards, other roads' decorations, settled / idle | 293 |
| `src/ui/routes.ts` | switching to another line, the motorway's directions, Build (where an end may go, making the line), the road list, what follows every change of the design (the store's listener) | 218 |
| `src/ui/active-line.ts`, `src/ui/project-score.ts`, `src/ui/map-window.ts` | the active line's ends as drawn and bringing it into view; the score; the part of the route the map shows, in the profile | 48 / 55 / 30 |

`EvalClient` is the one piece that was not a verbatim move (request ids, the in-flight map, the preview
gesture, "no repeat of a full request for the same design", the full-after-idle timer, which replies
count), so it has unit tests (`tests/eval-client.test.ts`, fake ports and timers) and was measured: six
drag modes at p95 frame 17 ms, handler p50 5 ms, as before.

`main.ts` (325 lines) is the composition root now: start-up (picker, pack, store, recovery: ≈ 60
lines), constructing the view, the panels and the modules above, connecting them, the first evaluation.
It has no mutable state of its own left but two objects made late (`linkEdit`, `works`): the ends of the
line being edited are the Session's `ends` (kept by `ui/routes.ts`), the kind being built is the routes
module's. Still worth doing when someone is there: the start-up as a function of its own (it returns
early for an unreadable save), and the remaining contexts with live getters (`get A()`, `get last()` …)
reading the Session instead.

The context interfaces with live getters were the bridge that made verbatim moves possible. Now that the
state is a `Session`, new modules should take the `Session` (and the stable objects they use) rather than
grow more getters; `ui/selection.ts`, `ui/road-links.ts`, `ui/result-display.ts`, `ui/routes.ts` and the three
small modules beside it already do.

### 4–5, 22. Core engine

- `evaluate.ts` `evaluateRoute` (lines 412–1999) is three nested closures: `engineer(candidate)` (profile →
  sections → retaining → cover → structure selection → supports), `finish(relaxed, strict)` (lift retries,
  quantities, buildings, crossings, footprint) and `complete(withNoise)` (noise, violations, the `Result`).
  They capture ≈ 120 locals of the enclosing function. `crossing-geometry.ts`
  `buildCrossingGeometryOnce` is 840 lines, `project-evaluate.ts` `evaluateProject` 443.
  Why it matters: every engine feature lands in these functions; three agents edit them at once; a stage
  cannot be tested or timed alone.
  **How it is being split:** `scripts/dev/stage.mjs` turns a contiguous run of a function's top-level
  statements into a named module-level function *in the same file*, without touching a statement: the
  stage returns the locals later code reads and the original place becomes
  `const setup = routeSetup(ctx, d, opts); const { st, n, ds, … } = setup;`, so the rest still works on
  plain locals (nothing changes in the hot loops) and statement order is untouched (bit-identical sums).
  It analyses scopes lexically and refuses what a verbatim move would break (a `let` shared between a
  stage's closures and later code, forward references, a top-level `return`). Because the statements stay
  where they are in the file, **the diff is only the wrappers**, so it barely conflicts with open work.
  Done: `routeSetup` (279 lines), `routePrices` (198), `routeGradeLine` (236), `routeCaches` (37) as a diff
  of +74 −13 lines; tsc clean, 177 / 177 results identical, interleaved timing against main unchanged
  within the noise of a loaded host (`scripts/dev/interleave.ts <base checkout> <this checkout>`: six runs,
  median ratio 0.91–1.04, CPU time ratio 0.99–1.01).
  Then `routeEngineer` (254 lines: one engineering pass of a grade line) and `routeFinish` (526: lift
  retries, quantities, buildings, crossings, footprint, `complete()`) the same way (+50 −25; same checks,
  four timing runs at median ratio 0.98–1.01): `evaluateRoute` itself is now the 60 lines of retry logic.
  Then a design pass itself (redone on cost model 31 once the design-realism change had landed):
  `finish()` is `finishDesign` = `finishLift` (111 lines) → `finishQuantities` (56) → `finishBuildings`
  (75) → `finishCrossings` (112), and `complete()` is `completeDesign` (221), with the lift tool as
  `routeLift`; `routeFinish` is 6 lines. Diff +99 −29, by the tool (`extract`, `hoist`: a closure's body
  becomes a function and the closure a one-line call, `prune`), after three hand steps the tool asks for:
  `let liftStop` (set inside the lift helper, read by a later pass) is `lift.stop` on a holder object;
  the defaulted parameters `start` and `withNoise` have their types written out; `let crossings` (the
  pass's crossings, replaced by copies when merged ways are split) is declared where the crossings step
  begins instead of 150 lines earlier. `complete()`'s call of itself is `completeDesign(…same
  arguments…, true)`. 177 / 177 results identical; interleaved timing against main unchanged.
  The former 1,590-line closure is 14 functions, the largest 293 lines (`routeSetup`).
  Next, each again by the tool:
  1. move the stage functions to files (`evaluate-setup.ts` …): a cut and paste with imports, since they
     no longer share a scope;
  2. `buildCrossingGeometryOnce` (840 lines) and `evaluateProject` (443) with the same tool.
- **Engine logic keyed on player text.** `evaluate.ts:1548` (`v.title.startsWith('A long bridge span is too
  low')`, set in `support-layout.ts:283`) and `:1905` (`'Road too low'`, set in `checks.ts:549`) decide
  lifts and railway wording from a *title*; `crossing-geometry.ts` passes diagnostics as message strings
  (`RAMP_TOO_LONG`, `REROUTE_FAILS` …) matched with `===` / `startsWith` at 15 sites, two of them in
  `evaluate.ts:369`. A copy edit (which happens often and is encouraged) can silently change engineering.
  Done for the two titles: `SPAN_TOO_LOW` (support-layout.ts) and `ROAD_TOO_LOW` (checks.ts) are shared
  constants used by both the wording and the logic. Still open: a `code` field on `Violation` and on
  crossing diagnostics, titles derived from the code.
- `Result` (evaluate.ts 94–197) is one interface for geometry arrays, the bill, per-station parts, noise,
  crossings and UI conveniences. Split into `geometry / bill / noise / crossings` views when #4 happens.

### 10–11. Extensibility: what the next features will touch

**A new line kind** (e.g. an expressway, a tram): a `CATEGORIES` row and a UI registry entry are designed
for it, but kind is also branched on in code:

| where | branches | what they decide |
|---|---:|---|
| `main.ts` | 38 → fewer after the moves | words, crown width (now `route-section.ts`), which body to draw, profile labels |
| `core/project-motorway.ts`, `project-railway.ts`, `project-road.ts` | 35 / 15 / 3 | each kind's evaluation: these *are* the kind |
| `core/project-evaluate.ts` | 23 | dispatch `if motorway … else if railway … else road`, issue wording, which ends may hang free |
| `core/evaluate.ts` | 15 | noise model and lanes, ‰ vs %, capacity goal, grade separation |
| `core/checks.ts` | 9 | rule texts for rail |
| `ui/hud.ts`, `ui/road-edit.ts`, `ui/profile.ts`, `ui/inspector.ts`, `render/view.ts` | 8 / 7 / 1 / 1 / 2 | headings, type lists, units, drawn section |

- `project.ts:335` declares the seam (`RouteKernel { propose, acoustics, finalize }`, `CorridorKernel`)
  but nothing implements it: `routeProposal` dispatched by hand. Done as a first step:
  `ROUTE_KINDS: Record<RouteKind, …>` in project-evaluate.ts, one row per kind with its evaluator (road /
  paired corridor / railway), the noise method of its receivers and the clearance another line needs over
  it; the compiler insists on a row for a new kind. Still branching on kind there (each a candidate field
  of the row): who may end on open ground, whose ends follow the road they join, the wording of junction
  issues, `crownOf`, and the capacity / operations of a route.
- **One descriptor for a kind's words** in `terms.ts`: `LINE_WORDS[mode] = { noun: 'railway', old: 'old
  track', height: 'track height', gradeUnit: '‰', … }`, read by hud, profile, checks, route-cards and
  project-evaluate instead of `rail ? … : …` ternaries (≥ 8 places today). Text stays byte-identical;
  `tests/player-text.test.ts` guards it.
- **A noise source per mode** as a field of the category row (`noise: 'road' | 'motorway' | 'rail'` with
  its lane layout function) instead of `cat.mode === 'railway' ? createRailNoiseModel … ` in evaluate.ts.

**Bridge styles** (variants with their own price and look): `KIND = { earth, bridge, tunnel }` is a closed
set stored per station (`Uint8Array`) and read at ≈ 150 sites in 25 files. A style should **not** be a
new KIND: make it an attribute of a `Run` (`runs[k].style`) chosen by the structure selection per run.
Touches: `data/bridges.ts` (a row per style: item quantities, span rule, height surcharge), `bridge.ts`
(`bridgeModel(cat, style)`), `structures.ts` (choice per run, cheapest valid), `overrides.ts`
(`StructureOverride` gains an optional `style`), `render/bridge-surface.ts` and `view.buildResult`
(deck / pier look), the inspector's stretch card (a second row of choices under *Bridge*), `terms.ts`.
Everything that only asks "is this station on a bridge" stays untouched.

**Design speed per stretch**: `Design.speed` is one number; `speedNorms(d.speed, …)` /
`horizontalRules(d.speed, …)` are called at 38 sites in 17 files (12 in project-motorway.ts, the editor,
bend fitting, previews, checks). Path that keeps today's results bit-identical until a design uses it:
1. route every call through one accessor, `designRules(d)` → `{ horizontal(i), norms(s), speedAt(s) }`
   (pure refactor: with one speed it returns today's objects);
2. `Design.speedZones?: { s0, s1, speed }[]` (absent = today); `horizontal(i)` picks the zone of bend `i`,
   vertical-curve minima and max grade per station, travel time and noise emission integrate per station
   (both already loop over stations);
3. UI: a stretch card row "Design speed here"; a violation where a zone boundary sits inside a curve.

### 7, 14. Worker protocol

- Done: `WorkerInit` / `WorkerIn` / `WorkerOut` in `src/worker-protocol.ts`, one typed `post()` in the
  worker (was six casts), `main.ts` handles `MessageEvent<WorkerOut>`. The legacy `{ type: 'eval' }`
  request and its replies are gone (only a test sent them).
- `project-result` carries `baseIdentity`, `changedRouteIds`, `removedRouteIds`, `dependentRouteIds`
  (always `[]`); `main.ts` reads none of them. `RouteScene.build` reuses a road's body only when its
  `Result` is the *same object*, and results arrive structurally cloned, so every full result rebuilds
  every road. With one road that is right; with many (rebuilt mapped roads, Build) it is wasted work on
  every edit. Either keep the previous `Result` object for routes not in `changedRouteIds` (then the reuse
  already written takes effect), or delete the lists. Owner's call; measurable with `rebuildStats()`.
- Each worker holds its own copy of the height and land-cover grids (three copies with the main thread;
  the whole D3 is ≈ 471 MB of heap). Sharing them needs `SharedArrayBuffer`, i.e. COOP / COEP headers on
  the dev server and the build: a deployment decision, noted in AGENTS.md already.

### 8–9, 20. Duplication and dead code

- Done: `missionProject()` / `missionEnds()` (scenario → starting project, was in main.ts, three scripts
  and a test); `packIdentities()` (object / road-link / pricing / water / terrain identities, was in
  main.ts and the Node loader); `routeCategory()` / `routeCrownWidth()`; `scripts/loadpack.ts`
  `evalContext()` / `projectContext()` (21 scripts build an `EvalContext` by hand; new ones should not).
- `project-evaluate.ts:39` `crownOf()` returns 0 for a road kept at its existing width where
  `routeCrownWidth()` returns that width. Left as it is (it would change `roadSurface` half-widths);
  worth a look by whoever owns kept roads.
- Removed: the old `Store` / `RangeSelection` / `describeChange` in `state.ts` (dead since the project
  store; six tests asserted behaviour the game no longer has), the legacy worker request, and
  `BASIS_LABEL`, `groundDescription`, `noiseExcess`, `motorwayCrownWidth`, `mainRoadFootprints`,
  `buildingKind`, `sameProjectIdentity`. (`describeChange` produced "move a bend", "noise wall" … for the
  Undo tooltip; the project store says "Undo edit". If plain-word Undo labels are wanted back, it is in
  git: `770801e^:src/state.ts`.)
- Owner's decision: `core/formation-quantities.ts`, `core/rail-trackbed.ts`, `core/railway-policy.ts`
  (307 lines, sourced, tested, imported by nothing in `src/`: docs/mode-foundations.md) and the unused
  contract surface (`repairProjectEditor`, `RouteSelectionState`, the kernel interfaces,
  `motorwayHorizontalEvidence`, `PROVISIONAL_NORMS`). Wire in or delete; today they read as live code.

### 15–16, 21. Data and sourcing

- **Research numbers collide** because parallel agents take "the next number": 15 (3 files), 16 (5),
  17 (3), 41, 42, 43 (2 each). `research/41` in a source comment may mean the 150 km/h pilot or the
  traffic defaults. Rule: cite the file name (`research/41-traffic-defaults.md`); a new note takes the
  next free number at merge time, like `COST_MODEL_VERSION`. 33 citations to fix (comments only).
- **Engineering numbers outside `data/`** (engine tuning such as step sizes and search budgets is fine
  where it is; these are numbers a designer or a norm sets):
  `crossing-geometry.ts` `CLEARANCE = 4.8`, `MAX_RAMP_LENGTH = 250`, `SQUARE_BELOW = 70`;
  `crossing-works.ts` / `link-route.ts` `SLOPE = 1.5` (twice) and `SLOPE_FLAT`; `link-route.ts`
  `LINK_MAX_SUPPORT = 10` and `road-realignment.ts` `MAX_SUPPORT = 10` (the same limit twice);
  `project-kept.ts` `KEPT_TOLERANCE = 12`, `TIE_LENGTH = 50`, `HELD_APPROACH = 100`;
  `evaluate.ts` `OLD_ROAD_TIE`, `OLD_ROAD_BAND`, `MINOR_CROSSROADS_BAND` (marked PROVISIONAL, good, but
  not in data); `ui/road-edit.ts` `DEFAULT_SPEED = 70`, `MIN_STRETCH = 60` (a design speed default in the
  UI layer); `ui/mode-kinds.ts` `RAIL_CROSSING_CLEAR = 20`. Move to `data/remedies.ts` / `data/urban.ts`
  with their notes when the files are next open (shared with the design-realism agent).
- `data/scenario.ts` (306 lines) holds every preset with its bends next to `TRAFFIC_THRESHOLDS` and
  `CATEGORY_RANK`. When the next scenarios arrive: `data/scenarios/<id>.ts` per place, the registry and
  the engine thresholds stay.

### 17–19. UI classes and tests

- `render/view.ts` `View`: terrain (≈ 100 lines), view options, labels, route meshes (`buildResult`, 320
  lines), camera (≈ 250), pointer (≈ 155). `route-scene.ts`, `route-surfaces.ts`, `extras.ts` show the
  pattern (a class beside View using its public surface). Next candidates, when touched: the camera
  (`resetCamera` … `zoomAt`, `keepCameraAboveGround`) and the pointer gestures.
- `ui/profile.ts` `paint()` is 400 lines; `ui/inspector.ts` holds every card. Split per card when a card
  is next changed (the route cards moved out of main.ts are the example).
- The clamp `Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds)))` appears 25 times in 15 files: one
  `stationIndex(r, s)` in `core/range.ts` (same arithmetic, so bit-identical).
- Test wall time (17 s on 24 threads) is `tests/player-text.test.ts` alone (16 s in one `it`): split it
  per violation family and the suite takes ≈ 10 s. UI modules have no unit tests (no DOM in vitest); the
  modules moved out of main.ts take their dependencies as an interface, so they can be tested with a fake
  context once a DOM (happy-dom) is added.

## How to make a behaviour-preserving change here

1. `npx tsx scripts/exact.ts --out /tmp/before.json` on the base.
2. Change; `scripts/gates.sh quick` while iterating.
3. `scripts/gates.sh full --no-browser --exact /tmp/before.json`.
4. Browser gates from a clean checkout of the commit (`scripts/gates.sh full --only smoke,playtest,drag-bend,…`),
   and the scene script that plays what was touched.
5. A move is a *move*: no rewording, no reordering of floating-point sums, no "while I'm here".
6. tsc proves the identifiers of a mechanical rename, not the strings. After moving UI code, compare the
   string literals of the old and new files (`scripts/dev/strings.mjs`, a sorted `comm -23`), and the
   transcripts of the scene scripts that play the flow against the base checkout. (A rename here turned
   "Undo the last change" into "Undo the session.last change" for two commits; neither tsc nor the unit
   tests could see it, the transcript of `lazy-transport-check.mjs` did.)

## Merge batches

1. Merged (`6fb4a7b`): tooling, typed worker protocol, mission bootstrap, dead code.
2. Merged (`533b887`): `main.ts` leaf modules (cards, automation, picks, hover, gestures, edits, profile /
   HUD events, shortcuts, workers), the two title constants, this document, the stage tool.
3. Merged (`cb63fcf`): the first four stages of `evaluateRoute`.
4. `EvalClient`, the 30 s test timeout, and two check scripts repaired: `scripts/layout.mjs` (it passed
   bends without `r`, edited through a hook that re-fits the profile, and expected a 300 px profile in
   short windows: 23 / 23 now) and `scripts/camera-check.mjs` (it measured after fixed pauses: mid-flight
   and before the wall labels' first frame on a loaded host; it waits for the camera to stop now: 18 / 18).
   The one product fix in this work came out of that: noise-view wall labels were created visible and
   unplaced (all stacked in the map's corner until the next frame); they stay hidden until placed.
5. `routeEngineer` and `routeFinish` (#4).
6. Merged (`e25f005` + the registry): `ROUTE_KINDS` in project-evaluate.ts (#10, first step).
7. A click on the shown road keeps the profile's zoom (the one behaviour change asked for), `mode-play.mjs`
   reads its drag after it has settled; `main.ts`: the `Session`, selection, road links, result display.
8. After the design-realism merge (cost model 31): the steps of a design pass (`finishDesign` =
   `finishLift` → `finishQuantities` → `finishBuildings` → `finishCrossings`, and `completeDesign`),
   redone on the new code by the tool.
9. Browser scripts: the gates and the 18 scripts with the retired intro key on `scripts/lib/browser.mjs`.
10. `main.ts`: routes, the active line, the score, the map window (→ 325 lines).
11. Next: the stage functions into files, the other two long functions.

Noticed, not changed: the playtest's "Start over → Undo" step clicks a toast that lasts 6 s; on a loaded host the script gets
there after 4–7 s (`gates.sh` runs a failed untimed browser gate once more under load).
