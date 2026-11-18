# Trapla — working notes for agents

Read this first. Longer background: `PLAN.md` (decisions, cost models, known issues), `README.md`
(controls, architecture, contributing), `docs/` (performance, footprint engineering, interface rethink, new
scenarios), `research/` (sources for every number).

## What the owner wants (pasky, 2026-11-13 … 15)

- **Realism, pragmatically.** Every number comes from a source (research/NN-*.md, cited in
  `src/core/data/*`), or is marked PROVISIONAL / UNVERIFIED with the reason. If a value is googleable (ČSN
  tables quoted in theses/lecture notes, TP documents, OTSKP/SPK, ŘSD awards, EIA studies), look it up instead of
  guessing. Never hard-tune a number to hit a desired outcome. If a result looks wrong (e.g. a route through town
  barely dearer than a bypass), find the missing mechanism rather than adding a fudge multiplier.
- **The automatic design must be valid and sensible on its own.** It resolves ordinary conflicts the way real
  designers do (bridges, culverts, underpasses, retaining walls, relocations). Violations are for genuinely
  unsolvable cases and for the player's own overrides. Overrides may create violations; that's allowed.
- **Powerful but simple.** Every realistic decision can be overridden by the player, but the interface stays
  simple: map-first, click anything to inspect it, one card with what it is / what Auto chose and why / cost /
  alternatives as buttons; map and profile selection always in sync; click a road to select it, drag it to
  bend it (a drag on a road not selected moves the map); no hidden gestures or modifier keys. See `docs/interface-rethink.md`.
- **Few, plain words.** Default to deleting text. No internal terms, codes or IDs in player text. One
  vocabulary: `src/core/terms.ts`; guard: `tests/player-text.test.ts`. Each violation: short title, one
  concrete computed fix, optional "why", basis tag (norm / game rule / engine limit). If something is an engine
  limitation, fix the engine rather than burden the player.
- **Visuals must be truthful and look like engineering.** Nothing floats or dangles; crossings, ramps and links
  meet real ground; what's drawn is what's billed; the noise view shows the floor that decides.
- **Drags must feel live.** This is non-negotiable: `node scripts/drag-perf.mjs --gpu --check` (all modes) must
  pass, and the full `evaluate()` time must not creep (see `docs/evaluate-performance.md`). A feature that
  breaks the budget is not done.

## Quality gates before merging anything

`npx tsc --noEmit`, `npx vitest run`, `npm run build`, `node scripts/smoke.mjs`, `node scripts/playtest.mjs`,
`node scripts/drag-perf.mjs --gpu --check` (all modes), `npx tsx scripts/bench.ts scripts/*.json` (all saved
designs VALID, parts sums match), `npx tsx scripts/eval-regression.ts` (bills frozen unless a reviewed model
change: bump `COST_MODEL_VERSION`), `npx tsx scripts/outcome-audit.ts --straight scripts/*-design.json
--random 24` for crossing/footprint changes, `npx tsx scripts/edit-locality.ts` (≈ 1 min: random small edits
on D11, the D3 sections, the whole D3 / D35 and the Královec railway, plus QA's repros; exit 1 if a grade pin or a
repro changes anything beyond 10 km, or a repro marked so is not valid) for anything touching the grade solve, retries or previews,
`npx tsx scripts/local-retry-report.ts` (≈ 1.5 min: a retry's crossings built near its change only must equal
the whole route's on the 177 exact cases) for anything touching the crossing engine or what a pass hands it. Look at the screenshots yourself; reviews of numbers alone missed
broken visuals and jargon before.

One command: `scripts/gates.sh quick` while iterating, `scripts/gates.sh full` once per merge (lock protocol
built in; `list` shows the gates; `--no-browser`, `--only`, `--skip`, `--jobs`). Full runs drag-perf first and alone,
then vitest alone, the other Node gates nproc/2 at a time, then smoke / playtest / toolbar together (all but drag-perf: 13.5 min serial → 10 min with the host at load ≈ 60 from other agents). A change meant to preserve behaviour
(refactor, performance): `npx tsx scripts/exact.ts --out /tmp/before.json` on the base, then
`scripts/gates.sh full --exact /tmp/before.json` (every whole result of every pack identical). Structure,
findings and the refactoring plan: `docs/architecture-review.md`.

## Workflow gotchas

- Work happens in side-agent worktrees. The scenario pack (`public/scenarios/`) and `pipeline/cache/` are
  gitignored: copy them from the main checkout into a new worktree, otherwise results are wrong (older packs
  lack e.g. watercourses).
- Never use `git stash`: it is shared across all worktrees and has swapped work between agents.
- Screenshot galleries in `docs/screenshots/` are numbered; continue after the highest number and update
  README references.
- Browser scripts start vite on the working tree: an edit in `src/` while smoke / playtest runs reloads the
  page under them. Run browser gates from a clean checkout of the commit (`git worktree add --detach`, with
  `node_modules`, `public/scenarios` and `pipeline/cache` symlinked in).
- Close headless Chromium after each scripted run; persistent SwiftShader browsers eat CPU and skew timings.
- Raw data is never committed; this is a localhost game, licences of fetched data are not a concern.

## Open items (2026-11-15)

- Drag previews are windowed (only the edited stretch is re-solved) and run in their own worker; long
  missions (whole D3 56 km, whole D35) pass the drag budgets (docs/evaluate-performance.md). A full motorway
  evaluation is ≈ 11 ms/km (≈ 0.7–1.8 s settle on the whole D3). While it runs the score shows "≈ … · ≈ CHECKING".
  The whole-D3 pack (24.7 M cells) costs ≈ 471 MB of JS heap (D11 221 MB): accepted for now (research/39).
- The Auto grade line is solved in blocks between long straights (model 25, research/39 "Local edits"):
  an edit re-solves the boundaries within 5 km of it and the blocks next to them, never the far end. Its
  price: each block balances its own earth (the sum of all saved designs equals a whole-route solve; single
  designs ±5–10 %, the coarse 2 m corridor pass picks the other side of a near-tie as often as main did).
  Far changes left come from the station-based engineering on a shifted station grid (support lifts,
  overbridge ramp checks, reroutes, culverts; `ds = L/⌈L/10⌉`): anchoring the station grid is the next lever.
  A drag on a straight start puts in a bend that turns the whole line about A and B (10 px ≈ 220–240 m at
  km 3–9): the price of a different road, the same on main; grade edits there are local
  (`scripts/edit-locality.ts`).
- A retry's later finishes build only the crossings within 2 km of what they changed (no model version,
  `src/core/crossings-kept.ts`; no result moved, whole D3 −14 … −18 %; `LOCAL_RETRY.local = false` is the
  whole-route reference). A new per-pass input of the crossing build must go into `CrossingInputs`. The footprint
  screen of a retry is still whole-route (studied, not built: a bit-exact memo of `planRoadRealignment`, ≈ −10 % of the
  whole D3, docs/architecture-review.md "State at the end of the review"). The engineering passes replay what did not change (bit-exact memos in
  `retaining.ts`, keyed by all a step reads; `tests/retaining.test.ts` plans with a shared and a fresh cache: a new
  input of the retaining screen must go into the keys; whole D3 −14 … −18 % more; docs/evaluate-performance.md).
- Full evaluation still takes ≈ 90–150 ms after a drag (auto-profile ≈ 23 ms, retaining-wall engineering,
  crossings built twice, strict re-runs); the 3D road body only catches up when the drag pauses.
- Automatic reroutes are engineered and checked (model 22); skewed crossings are straightened, roads running
  along ours moved beside it, neighbouring minor roads joined to one crossing (model 28); a cut way is judged piece
  by piece (model 42, `way-pieces.ts`): a piece still reaching the road network just ends, a piece cut off is led to
  a crossing (a track beside our bridge under it), a public road is closed only within 500 m of extra detour, and so
  is a track or service road serving buildings (model 54, research/86; else Auto keeps it across, a closure only where
  nothing else can be built: `farClosure`; or its buildings bought out where cheaper, homes only where every way
  across takes as many: `buyout`; the player's cut over the limit is a problem: `cutOff`); the card names what each part still reaches and how far round, the map lights
  each part to that road (`closure.reach`), and a part's end can be dragged onto a road as a reroute's (model 52); other
  ways' slopes keep off houses, railways and our body (`scripts/works-clash-audit.ts`, tests/works-clash.test.ts; every way's works keep our 3 m working
  strip from houses, model 53); a rebuilt road's side road crossed by
  its new line joins it there (an access, model 49);
  merged crossings of different ways
  within 30 m keep one remedy for the group unless that leaves one buried (then it is a crossing of its own,
  a retry). Lowered underpasses ignore groundwater; pier placement near the Polish border can fail (engine limit).
- Project roads (2026-11-16 final-sweep P1s, PLAN.md "Final-sweep P1s"): the player's road takes over from
  our reroutes (they are planned again clear of it); new railways and motorways are crossed by the
  higher-ranking line; `scripts/reroute-takeover-audit.ts` still leaves 13 of 292 D11 bends near our reroutes
  unpriced (mostly the rebuilt road's own body within 10 m of our embankment, a real conflict). A road carried
  over ours is let off exactly what our road bills for that bridge; a railway of the project follows our
  crossing's height (a new motorway is still cleared as a mapped one); a lowered box under a project road bills
  ramps the held road does not build; a road that ends nowhere is priced, not valid (PLAN.md "Playtest sweep 3",
  model 39).
- Playtest sweep 3 realism (cost model 41, PLAN.md "Playtest sweep 3: slowed stretches, deep cuts, cones …"): Auto
  cuts no road or motorway deeper than 30 m (a tunnel), cuts rock by its kind (the Královec railway now tunnels its
  54 m cut in Carboniferous interbeds: 9.1 → 10.6 bn), and stands bridge ends in fills on cones; where a cone would
  cover what nothing moves aside the end is a wall (fill ≤ 10 m, billed: cost model 42, PLAN.md "Bridge ends: one
  rule"; `scripts/bridge-ends-audit.ts` is a gate) or Auto's bridge goes on; a minor way under a cone is moved aside.
  Houses under a cone (and roads moved aside, turning areas) are bought out, a ≤ 10 m end walled where cheaper (model 49,
  PLAN.md "Portals, cones over houses, …"). Open: the cones' fill is not in the structure choice's earth balance (it pins blocks at the top fill value and
  over-bridges); no arch inside a viaduct over 3.3 × its arch; the support lifts after the grade search bump the line
  up without regard to cost (direct-90: Auto 422 M dearer than holding its pre-presplit line, all of it from lifts for
  bridge clearances the search never saw; three fixes tried, none merged, the last judged by the whole bill: +45 % D11
  evaluate time and edit-locality failures; PLAN.md "Natura 2000 a note …"). Two roads of a project whose
  earthworks come within the working strip: the later one keeps clear behind a wall (project-ledger.ts, evaluateProject).
- Junction approaches on class I–III roads are not ramp-capped.
- Vertical radii and grades are ČSN 73 6101:2018 (grades by terrain class from the DEM, per-bend design speed,
  hairpins; cost model 31, PLAN.md "Design realism"); transition curves not drawn; no superelevation /
  sight-distance checks. Tunnels go on as cut and cover out to portals ≈ 9 m deep in their cut, with a method
  on the card and escape provision (cost model 34, PLAN.md "Tunnels as they are built"). Bridges have a style
  (short spans / long spans / arch, Auto the cheapest that fits; cost model 35, PLAN.md "Bridge styles"); a
  style or method chosen on Auto's structure leaves it Auto's (`StructureOverride.auto`); painting a structure
  as it stands still re-solves the grade around it (D11 direct-90's viaduct: +462 M), as before. Cable-stayed
  later. A long mined tube costs less per metre (cost model 36, research/64). Protected nature areas (cost model 45, research/75): no
  works of ours in reserves, monuments, national parks, CHKO zones I–II (protection zones and Natura 2000 sites: a note,
  cost model 47); Auto bridges over them (no supports inside) or mines under them; no tunnel over 500 m steeper than 5 %
  to its ends, 3–5 % a note (no price for the safety measures, research/76). The real D35 layout is Auto's kind (a 2.9 km
  tunnel under Pod skálou at ≤ 3.8 %; the real-portal line +5.4 %, research/73 §7). Not taken: T-8.0 tube width, rock cover,
  running costs (research/73 §5, /74). The Nová Paka
  starter follows the mapped bypass. Since cost model 37, most side roads no longer break its small drags: dead ends
  are cut back to their junction, and the separation retry runs on every category. One street still does, where its
  junction lies at our slope's toe. What mostly breaks them is the hand-set radii at the norm's limit (S-bends 4–6,
  bend 9; PLAN.md, model 37).
- A reroute's new piece can be led to another road by dragging its end (the square handle where it joins its road;
  `CrossingOverride.ends`, cost model 52, PLAN.md "A reroute led where the player drags its end"): built like Auto's
  own, a road that cannot take it leaves Auto's line and says why; a shaped side no longer builds the other side.
- A pin Auto cannot reach is left out and said at the pin (the line stays Auto's own, engineered as such), also one
  met only by leaving a crossing it must clear (a stream in an open cut; model 51); its suggested height is a button; a
  drag past the next bend swaps the two in order, and a bend a drag leaves on the line goes on release
  (`core/bend-order.ts`; PLAN.md "A drag past the next bend; an unreachable pin", "A pin that leaves a crossing; bends
  left straight").
- Edit locality: the Královec railway pin −9 m at km 2.7 moves the grade 2.76 m at km 12.7, an EXPECTED exception
  in scripts/edit-locality.ts (the old line's support lifts at km 9.8–10.2 go with the lowered line, and the
  boundary at km 11.21 sees that in its window; PLAN.md "Design realism").
- A player's crossing choice (cost model 32, PLAN.md "Bug-fix sweep"): one that cannot be built is said and
  leaves our road as Auto had it; our line is raised for a crossing (a player's box or bridge, a reroute through
  homes) only in proportion (model 33, research/61); "Our bridge over it" is met through the same retry
  (no grade floor first) and its crossing card says what raising our road for it cost (D3 km 8.59: 15 m, 1.28 bn).
  `scripts/straighten-audit.ts`, `scripts/choice-audit.ts` and `scripts/toolbar-layout.mjs` are gates.
- See PLAN.md "Next steps" and each section's "Known issues".
