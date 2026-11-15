# Valid automatic reroutes (cost model 20+, WORK IN PROGRESS — fold into footprint-conflicts.md § Model 20 at the end)

Branch `valid-reroutes` (worktree trapla-agent-worktree-0001), from main a2bd5a6. WIP commits 29976d1, 39c3b18.

## Done so far
- `src/core/link-route.ts`: `engineerLink(controls, width, env, grade)` builds a reroute (auto or player-shaped):
  Lipschitz profile within `grade`, cut/fill ≤ `LINK_MAX_SUPPORT` 10 m (PROVISIONAL, same as road-realignment
  MAX_SUPPORT and ramps), ends at ground; streams → culvert (`waterSize`, research/17) with cover lower bound;
  houses → bought out (`houses`, `houseCost`; kept houses = obstacle 'building'); rail/water raster, motorway
  crossings → problems. Obstacles queried per straight piece ≤ 50 m within one leg; profile samples 5 m
  (≤ 450 samples); 10 m "mouth" at each end exempt from the footprint probe.
  `routeAlong(a, b, s0, s1, place, width, env, clearance, grade, houseRate)`: DP over ≤ 60 stations ×
  11 offsets (10 m steps, `LINK_CORRIDOR` 100 m, base = half + setback + 1), soft steepness penalty (STEEP=50 m
  per m of excess rise), house prices as metres of road; memo of node states on a 2 m lattice per evaluation.
- `crossing-geometry.ts` links loop: plan = engineer(ordinary rampGradient) → if 'steep' engineer(rampSteepest)
  → if still problems (not river/motorway/unavoidable rail) or houses > 25 % of pavement price → routeAlong at
  that grade; cheaper/fewer-problems plan wins; cached in `routed` per build call. Auto link problems → ONE
  diagnostic `Reroute cannot be built: <codes>` (issue code 'reroute', not clipped, crossing still owns its
  road); shaped → one 'Shaped link …' per problem (code 'shape'). Player text in diagnosticText (REROUTE_FAILS,
  computed fix: raise our road by overHeight−h, or lower by underDepth+h).
- c.cost includes culvertCost + houseCost; evaluate books houses into buildingCost/demolished (`gone`),
  structure part excludes houseCost. New CrossingResult fields: culverts, culvertCost, houses, houseCost,
  linkGrade (justified grade used); all deleted in every reset/clone/delete list. Card text in terms.ts.
- Overbridge deck may slope (≤ max(class gradient, old road slope across the deck)), clears our road under
  the whole core but the ground only at its two ends (cutting dug away); `foot()` returns the edge when the
  deck already meets the ground there.
- Auto junction is reconsidered when its own works fail (model 19 review fix, already on main).
- simplifyLink: SHAPE_TOLERANCE 2 m (src/ui/link-shape.ts); median 6 bend points per crossing.
- scripts/reroute-audit.ts: independent check of every automatic reroute (grade over 20 m vs class / linkGrade,
  earthworks > 10 m, rail/water raster, streams w/o culvert, houses not demolished, motorways).

## Numbers (outcome-audit --straight scripts/*-design.json --random 24; reroute-audit same set)
- before (main): 730 of 871 auto reroutes silently invalid (658 steeper than class, 140 houses, 35 rail, 19 water,
  215 stream crossings w/o culvert); 120 violations; published designs all VALID.
- now: 1 unreported (a stream touching only the ribbon edge), 24 reported; ≈177 violations; best +5 M,
  demo +71 M, direct-90 +84 M, direct-80 +302 M (km 13.50 class I 2130: 10 M reroute → 178 M 141 m overbridge),
  town-centre INVALID (km 15.98 service 5162), straight INVALID (km 16.58 local 2244: railway between, overbridge
  ramps > 10 m, h = 3.1 m).

## Parent decision (2026-11-15)
1. Implement option 2 in THIS model bump: lower the crossed road into a shallow cut under a box (underpass with
   lowered way): class-gradient ramps down and up, drainage of the low point under the box needs a SOURCED
   solution or price (pump/soakaway/outfall — research it), sourced maximum lowering depth, cut ramps priced.
   Then Auto may use it where h < box minHeight (resolveCrossings `underpassFits`, Auto loop in
   buildCrossingGeometry, underpass branch of buildCrossingGeometryOnce: `lowest < box.minHeight` currently
   diagnoses). The D11 straight start must open VALID for a new player if a designer could make it so; else
   report precisely why.
2. Offset the full-evaluation crossing-step creep (+2..+42 ms): no net full-evaluate creep vs main on the saved
   designs; measure A/B interleaved (host loaded): `npx tsx /tmp/xing-0001/laps2.mts /tmp/xing-0001/mainv $PWD`
   (mainv = git archive a2bd5a6 with symlinked node_modules/public/scenarios; laps2.mts evaluates each saved
   design 6× per root interleaved and prints min total and crossings-lap ms). Ideas: cache link plans across the
   strict retry pass (evaluate.ts runs finish() twice when blocked roads exist), skip routeAlong when the
   justified plan only has houses, cheaper margin (cached project) in routeAlong, fewer Auto candidate builds.
3. Then: fix remaining tests (crossing-sanity published validity, evaluate-costs fixtures), repair town-centre
   with scripts/repair-designs.ts if still invalid, recapture fixtures (`npx tsx scripts/eval-regression.ts
   --capture=current --reviewed-model-change`) with each change explained in docs/footprint-conflicts.md § Model
   20 (+ PLAN.md entry, README controls already mention shaping), bump COST_MODEL_VERSION at merge time (main is
   20; noise takes 21 if it merges first; take the next), outcome-audit + reroute-audit before/after, then ask the
   parent (yield) for the browser slot: smoke, playtest, drag-perf --gpu --check all modes incl. link,
   screenshots (next free numbers ≥ 120; check docs/screenshots), inspect them.

## Known remaining
- service-loop fixture (4826): invalid (crossing works TIE + reroute unbuildable); engine gap = closing a loop chord.
- A shaped first drag can still start with a footprint violation when the player's override changes our road's
  structure choice (demo 4857): 1 of 12 sampled.
- Debug helpers in /tmp/xing-0001 (one.ts, why.ts, dbg.ts, laps2.mts, prof-route.ts).
