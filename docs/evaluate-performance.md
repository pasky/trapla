# Evaluate performance regression

## Protected areas and the 3 % tunnel rule, cost model 44 (2026-11-17)

What runs more on every route: a scan of the protected areas per station in the setup (crown and a dug tunnel end's
reach, ≈ 0.7 ms per 2,000 stations; a 160 m block bitmap rejects most stations at once), the footprint's check of our
works in areas (0.2–0.6 ms on D11, 0.9 ms on the whole D3), and the same cells in the retaining and support screens
(memoised with their candidates). On D11 (no area near the saved designs, no tunnel) the interleaved timing against
main 62ab65c, 12 rounds at host load 17–24: sum of minima B/A 1.030, medians 1.015, CPU 1.041 (an earlier run at load
84: minima 0.955, medians 1.125, CPU 1.061) — within the noise of a loaded host; drag-perf `--gpu --check` passes in
all six modes. Where a tunnel line exists, the grade search now also tries the wide band (only where the line runs
at the band's floor) and the fine grid near the line (its coarse grade steps miss 3 % by a step), and in a window or
block holding a protected area it skips the narrow corridor: the d35 stage-1 motorway, whose 3.2 km tunnel is now the
one under the escarpment, evaluates in ≈ 0.6–0.7 s against ≈ 0.3–0.4 s (profile ≈ 0.26 s against 0.15–0.18 s); the
d35 road 0.3–0.5 s against 0.14–0.2 s. Load was 17–84 throughout: these D35 figures are single runs, not interleaved.

## The engineering passes replay what did not change (bit-exact, 2026-11-17)

Finding 23 of docs/architecture-review.md, its engineering part: `engineer()` (sections → retaining walls →
cover → structure selection → bridge supports) runs once per lift round and per retry of every pass, 18 times
on the whole D3, and each call screened the whole route again. Timed per call on the whole D3 (a scratch
instrumented checkout, minima over 8 evaluations, host load 3; 5,644 stations):

| per evaluation, ms | main `6017767` | now |
|---|---|---|
| all 18 `engineer()` calls | 528 | 298 |
| retaining walls (`planRetainingWalls`) | 264 | 142 |
| structure selection (`settle`) | 154 | 54 |
| bridge supports / sections / cover | 29 / 24 / 22 | 29 / 23 / 21 |
| a call whose grade line is the last call's (4 of the 18) | ≈ 27 | ≈ 10 |
| the first call (every station new) | 61 | 47 |

**What was wrong, and what is done** (each a memo keyed by everything the step reads, or a plain loop; no
result can move):

- *The retaining screen asked every station again.* A plan screens the route twice (the walls of the first
  pass shorten some culvert barrels, the second pass screens with those), and a station kept one outcome: the
  two passes overwrote each other's at every station near water (≈ 470 stations of the whole D3 screened anew
  in every pass of every call), and every other station still asked its candidates, built its barrel key and
  compared its crossing ways. Now a station keeps its last four outcomes (`STATION_MEMOS`), and a pass keeps
  a record (`PassRecord`, per pass of a plan and set of crossing ways): a later pass replays a station from
  it when its grade, two widths and barrel key are the record's, without asking the candidates (the key of
  the barrels is found once per set of reaches and pass). A record's station is dropped when its candidates
  are asked again.
- *A crossing way's own stretch* (screened after the stations, against the stretches its crossings own) is
  screened once per cell and set of owned stretches; *a wall's place and the section it leaves*
  (`slopeSurfaceFn`, `sideSection`: a walk down the slope each) once per grade, limit, room on the other side
  and wet / dry (`WallMemo`).
- *The channel screen built a footprint grid of all cells in every pass*, also when no channel got as far as
  asking it: now on demand, and the last one serves again while the widths are the same
  (`channel-relocation.ts`).
- *`forceWater` marked a bridged watercourse's cells by testing every station of the route* (per crossing,
  13 times per `engineer()` call and in every balance sample of the grade search): it tests the samples
  around the crossing (they are evenly spaced; the same test decides).
- *`chooseStructures` asked "any override?" and "any cut-and-cover station?" through
  `Array.from(…).some` and `Array.prototype.some.call` on a typed array*, 12 times per `engineer()` call
  (1.8 % of a whole-D3 evaluation): plain loops.

**Proof.** `scripts/exact.ts`: 177 / 177 whole results identical to main `6017767`. Every retaining plan made
also by main's `retaining.ts` / `channel-relocation.ts` on its own cache and its own copy of the sections (a
scratch harness): 589 plans of `exact.ts`, 361 of `outcome-audit.ts --straight scripts/*-design.json --random
24`, 1,767 of `local-retry-report.ts`, none different (plan, sections, side sections). The corpus does not
exercise every key (a record that ignored the barrels, or a crossing stretch that ignored its owned stretches,
was not caught by any of the 589 plans), so `tests/retaining.test.ts` plans thirteen variants of one scene (a
lift, a crossing way gone or elsewhere, another barrel, narrowed sections, the grade alone) with a shared
cache and with a fresh one; ten mutants of the keys die on it. Four survive: a record that ignores the left
width alone (the right width and the grade change with it), one not dropped when candidates are asked again
(the wider candidates give the same events in the scene), a wall memo that ignores the room on the other side,
and one that ignores wet / dry (no scene built for these two: a watertight wall over 9 m that does not fit).

**Timing**, interleaved against main `6017767` (`scripts/dev/interleave.ts`; host load 2–4; two runs each):

| design | main, ms (min) | this, ms (min) | min ratio | median ratio | CPU ratio |
|---|---|---|---|---|---|
| whole D3 starter (12 rounds) | 1988, 2025 | 1712, 1650 | 0.86, 0.82 | 0.86, 0.88 | 0.91, 0.90 |
| five D11 designs, sum (30 rounds) | 795, 793 | 749, 757 | 0.94, 0.95 | 0.96, 0.95 | 1.01, 0.98 |
| town-centre | 221, 222 | 198, 201 | 0.90, 0.90 | | |
| direct-80 | 211, 210 | 199, 200 | 0.94, 0.95 | | |
| direct-90 | 138, 139 | 132, 133 | 0.96, 0.96 | | |
| demo, best | | | 0.96–1.01, noise | | |

Under a host load of 20–30 (other agents' gates) the whole D3 gave min 0.88–0.90, CPU 0.91–0.92. The gain
is larger than the main thread's profile says (`engineer()` 18.7 % → ≈ 14 % of the samples): the CPU time of
an evaluation is ≈ 2.5 × its wall time (the collector's threads), so what allocates less gains more.

**Left in `engineer()`** (whole D3, ≈ 300 ms of ≈ 1.7 s): the first call's screening of every station
(47 ms), the re-screening of the stations a lift or retry moved (inherent: the widths change with the
grade), the selection's twelve `chooseStructures` runs per call (the fill value is settled over all blocks at
once), ≈ 4–5 ms of retaining per call that changes nothing (a whole-plan memo for the 4–6 such calls of 18
would save ≈ 1 %: not built).

## A retry builds only the crossings near what it changed (no model version, 2026-11-17)

Finding 23 of docs/architecture-review.md ("a retry pass engineers the whole route again"), its first part.
Code: `src/core/crossings-kept.ts`, called from `finishCrossings` (evaluate.ts); reference and checks:
`scripts/local-retry-report.ts` (a full gate), `scripts/dev/local-retry-check.ts`, `tests/crossings-kept.test.ts`.

**What repeats is a finish, not a pass.** A pass finishes its design up to three times (first, the stream
retry, the strict retry), and each finish builds every crossing of the route. The 177 cases of `exact.ts` hold
72 full evaluations with 313 finishes, 241 of them after the first of their evaluation; the whole D3 starter
is 10 finishes in 4 passes (and 18 `engineer()` calls). On the whole D3 one finish spends ≈ 55 ms building
crossings and ≈ 20–60 ms in the footprint screen; one `engineer()` ≈ 40–50 ms (retaining 25, selection 14).

**Where a later finish differs from an earlier one** (scratch study on main `1ba513d`: each later finish
against the earlier one with the fewest changed input stations): of 5267 differing crossings, footprint
conflicts and crossing issues, 161 lie away from a changed input station, 132 of them within 2 km, none of the
rest beyond 620 m but for one finish (D11 random-1-10's regrade retry). That one is the crossing engine's
rollback: when a crossing that could be built at first cannot after the others were reconsidered,
`buildCrossingGeometry` puts every crossing of the route back to its first treatment (3 of 313 builds). Stations
within 2 km of a change are 33 % of the route on average (500 m: 15 %).

**What is done.** Each finish keeps what the crossing build read of our road per station (grade, kind, width,
left, right, urban), the houses our road had demolished, each crossing as `resolveCrossings` left it, and each
crossing as built. A later finish of the same evaluation takes the kept finish that differs from it at the
fewest stations (a resolved crossing that differs, is new or is gone counts at its station; a house at the
station that took it). **Built again** are the crossings within `LOCAL_CORE` = 2 km (`linkHardReach`: how far a
reroute is led and a crossed way traced) of a changed station, measured in plan so that the other leg of a
hairpin counts; every reroute the player shaped (it may run 8 km); and a kept crossing any point of whose built
geometry lies within `LOCAL_BESIDE` = 100 m (the corridor a reroute's line is sought in) of our earthworks at a
changed station, wherever along the road its crossing is. **Built with them, results not taken**: the crossings
up to `LOCAL_CONTEXT` = 2 km further out (from the change, and along the road from each crossing built again),
and whatever any of these is led to or led from, in the kept build and as resolved now, so that none misses its
carrier or its followers. Every other crossing is taken as the kept finish built it (copies, on this finish's
own objects). `resolveCrossings` stays whole-route (0.4 ms). The whole route is built instead when

- the kept finish's build rolled back, or the local one does (`CrossingCache.rolledBack`);
- the crossings to build are over 90 % of all (`LOCAL_MAX_SHARE`);
- a context crossing within reach (2 km along the road) of one built again came out other than it was kept:
  the rebuilt ones were then led and weighed among neighbours the whole route would not have given them
  (once in the 2,083 local builds below; a context crossing further out may differ, its carriers can lie outside);
- a kept crossing is led to one built again that changed.

The grade line, the engineering passes, quantities, buildings and the footprint screen of a retry are whole-route
as before. **This is not the plan's "evaluate the window as its own route and splice"**: the grade solve of a
retry was already block-local, and a window evaluation would have spliced per-station arrays, structure runs and
walls at its ends; this splices only crossings, which are separate objects, on the retry's own whole-route
arrays. A variant that kept the context crossings fixed at their final treatments (not reconsidered) was tried
and is less faithful: the engine is greedy and order-dependent, a crossing that sees its neighbours' final
treatments decides otherwise than one that sees them mid-pass (7 of 241 finishes differed).

**What it changes: nothing found.** `LOCAL_RETRY.local = false` is the reference (every finish whole);
`LOCAL_RETRY.check` builds both ways in each later finish on the same inputs and reports the differences.
On the merged tree (main `30d0ad8`, cost model 38, plus this):

| inputs | local builds | differ from the whole route's | results |
|---|---|---|---|
| `exact.ts`, 177 cases (every pack's straight, saved designs, starters, 12 random D11) | 232 of 258 later finishes (23 whole for the share, 3 for the rollback) | 0 | 177 / 177 identical to main `30d0ad8` |
| `local-retry-report.ts --only d11 --random 100 --seed 5` | 566 of 605 (23 share, 15 rollback, 1 context) | 0 | 221 / 221 identical |
| `outcome-audit.ts --straight scripts/*-design.json --random 24` | 146 of 155 | 0 | output identical to main's but for the times (32 bills, all 77 flags) |
| `edit-locality.ts` (random edits: D11, D3 sections, whole D3 / D35, the railway) | 317 of 349 | 0 | exit 0 |
| `choice-audit.ts`, `straighten-audit.ts`, `bench.ts scripts/*.json`, `eval-regression.ts` | 85, 51, 12, 14 | 0 | exit 0 |
| `scenarios/check.ts`, ten packs | 660 | 0 | exit 0 |

No bill, validity or other field of any result moved, so it carries no cost model version (cost model 38
stays). It is still not a refactor: nothing proves that a crossing 2 km from every change cannot come out
differently (see the seams), so the report stays a gate.

(Before the merge, against main `1ba513d`, the same checks: 2,068 local builds, none different, 177 / 177.)

**Timing**, interleaved against main `30d0ad8` (`scripts/dev/interleave.ts`, host load 3–7; minima of two runs
each; six earlier runs against `1ba513d`, before the merge and the review fixes, gave the same picture: whole D3
0.82–0.85):

| design | main, ms | this, ms | ratio | CPU ratio |
|---|---|---|---|---|
| whole D3 starter | 2297, 2421 | 1975, 1980 | 0.86, 0.82 | 0.86, 0.88 |
| direct-80 (one regrade retry, 66 % of its crossings built again) | 214, 219 | 210, 205 | 0.98, 0.93 | |
| best, demo, direct-90, town-centre (no retry pass) | | | 0.96–1.05, noise | D11 sum 0.98, 0.99 |

The whole D3 gains ≈ 320–440 ms (−14 … −18 %; the estimate from the share of crossings built was ≈ −250 ms).
direct-80's gain is small and near the noise (−2 … −7 %). The plan's −30 % counted the engineering passes too,
which this leaves alone.

**The seams, reviewed.**

- *What the build reads.* The six arrays, the houses and the resolved crossings are compared exactly; everything
  else the build reads is the same in every pass of an evaluation (stationing, terrain, road network, the
  player's choices, kept buildings, other roads' works). A per-pass input added to `CrossingRoute` must be added
  to `CrossingInputs` (noted there); the gate sees an omission only where a case exercises it.
- *Reach.* 2 km in plan covers a reroute's target, the crossed way's traced line (2 km from the crossing) and
  ramps and ties, also across a hairpin; a shaped reroute is always built again; a kept crossing's works that
  lie beside a change are found from its geometry. What is left unproven: a remedy the kept build weighed and
  rejected whose line would pass a change more than 2 km in plan from its crossing (an Auto reroute's line runs
  between its crossing and a target ≤ 2 km along the road, within 100 m of our earthworks). The study found no
  difference beyond 620 m. (The first version measured along the road only and checked only the target a rebuilt
  crossing was led to; an independent review named the hairpin and a context crossing losing a follower outside
  the subset, hence the plan distance, the geometry test, the links' closure and the rule on every context
  crossing in reach.)
- *Order.* The engine reconsiders the dearest crossings first, among the crossings it is given. The subset keeps
  that order; what a context crossing would have become on the whole route may differ at the subset's outer
  edge, which is why context results are not taken and those in reach of a rebuilt crossing must equal the kept.
- *A strict retry or a split triggered elsewhere* changes the engineering or the resolved crossings there: those
  stations count as changed. *A remedy weighed against a crossing outside the subset* cannot happen: targets
  are within 2 km along the road of a crossing built again, and all of those are in the subset.
- *Structure runs, walls, `regionCount`*: nothing but crossings is spliced; the footprint screen and every check
  run on the complete crossing list of the finish.
- *Later writes.* A result's crossings are written to after the build (`raised`, a split motorway's shared
  crossings, an issue's text): kept crossings and their issues are copies, taken right after the build.
- *Issue order.* The build's issues are listed in crossing order, a failed straightening's last, as a rebuilt
  whole route lists them; a whole-route build that reconsidered nothing lists a failed straightening with its
  crossing. Same issues, another order, only with a player's straightening that failed.

**Left of finding 23** (whole D3 profile with this, ≈ % of an evaluation, read off `profile.mjs --tree 2`): the
crossing build 15 (the first finish's whole build 6), the footprint screen 11 (`planRoadRealignment` most of
it), `engineer()` 19, the grade solve 14, noise 19, GC 11. The memo of the engineering passes is done (the section above). The footprint screen is studied, not
built (differences reach 195 m from a changed input; a bit-exact memo of `planRoadRealignment` is the
recommended form, ≈ −10 % of the whole D3: docs/architecture-review.md "Planned next performance lever"). A tighter core than 2 km needs the engine to say what each
crossing's build read of our road (the reroute cache records it for reroutes: `spatial.reads`).

## Side roads, lifts on grades, cost model 37 (2026-11-17)

What runs more: the separation retry now runs for every category, but only where an overbridge, reroute or
clearance is stuck (a problem design; the frozen fixtures are VALID and never take it); the split retry runs it
too; each support-lift round computes the line's fall at its moved targets (two heights per target). Interleaved
against main 1ba513d (16 rounds, host load 7–9), min / median ms: best 118.7 / 135.0 → 119.0 / 134.1, demo
112.3 / 131.2 → 115.5 / 129.2, direct-80 218.0 / 263.5 → 219.3 / 285.1, direct-90 141.0 / 163.0 → 141.1 / 158.3,
town-centre 231.7 / 275.1 → 229.5 / 299.1; sum B/A min 1.003, median 1.039 (cpu 1.021; an earlier run at load 18:
min 1.039, median 0.993) — no creep. Drag-perf `--gpu --check`, all six modes, pass. Nová Paka small drags evaluate
in 85–184 ms (mean over 24; three audits at a time on a loaded host), against 138–281 ms on model 36 measured
the same way: fewer strict and narrow retries now that the side roads resolve.

## Bridge styles, cost model 35 (2026-11-17)

Each bridge run now gets a plan per style in support-layout (short spans; long spans: up to three equal layouts, or
the anchored long span with its side spans and two fillings; an arch: an O(cells³) scan on 180–700 m bridges), each
placed, span-checked and priced. The structure choice prices a run as the cheaper of short and long equal spans.
Two costs found and paid back with CPU profiles (`_prof1.ts` + `profinc.py`, 33 evaluations):
- the structure choice went +25–40 ms an evaluation: a closure per station in the new "cut and cover too deep"
  check for Auto's tunnels (esbuild's `__name` on each) and 4× the run pricing. Now the check runs only where some
  method is chosen, long layouts are priced only where they may pay (short spans no dearer at the bridge's top →
  no dearer anywhere: their extra piers make their price rise faster with height), and a run's price is memoised
  per engineering pass (the fill-value settle asks for the same runs again and again): chooseStructures 255 →
  232 ms on town-centre, 178 → 199 ms on direct-80 (33 evaluations);
- support-layout: work.support 4.8 → 9.7 ms on town-centre (five passes × its 300–1,149 m bridges' plans), +1 ms on
  direct-80. A drag preview weighs an arch only where asked or nothing else fits, and long spans only where they
  may pay (its card is not shown).

Interleaved against main 5ea8d7e (16 rounds, host load 5–8), min / median ms:

| design | main | now |
|---|---:|---:|
| best | 118.8 / 162.4 | 116.3 / 158.7 |
| demo | 110.9 / 137.1 | 112.2 / 131.2 |
| direct-80 | 226.6 / 292.0 | 213.5 / 314.5 |
| direct-90 | 141.5 / 169.7 | 143.2 / 169.9 |
| town-centre | 225.0 / 283.4 | 237.1 / 279.8 |

Sum of minima −0.1 %, of medians +0.9 %, CPU per round +0.9 %; phase timings on town-centre (`_tim.ts`, min of 8):
total 239.8 → 239.4 ms.

## Tunnels as built, cost model 34 (2026-11-17)

The grade search's tunnel mode (autoprofile.ts) costs nothing where the line takes no tunnel: the plain search
runs first and its line is kept when no sample on it takes a tunnel (checked only where deeper than a portal);
only then a second search with two layers of states (≈ 2× the DP). On the D11 designs that is 1 solve in 32 on
demo, none on the others (town-centre's profile phase 106 ms when the mode ran on every solve → 65 ms). The
auto-profile cost tables now keep 24 material values instead of 8: one evaluation's balance searches visit 20–30
(start, the fixed steps from it, interpolated ones; lifts and retries revisit them), so 20–35 % fewer table
entries are computed on a repeated design (≈ 8 MB more heap).

Interleaved against main 099a471 (`scripts/dev/interleave.ts`, 16 rounds, host load 3–8), min / median ms:

| design | main | now |
|---|---:|---:|
| best | 113.1 / 153.2 | 112.1 / 134.9 |
| demo | 110.7 / 123.8 | 107.0 / 124.7 |
| direct-80 | 232.5 / 260.4 | 215.7 / 292.2 |
| direct-90 | 139.0 / 162.0 | 143.0 / 177.6 |
| town-centre | 225.6 / 303.3 | 230.5 / 281.6 |

CPU per round −2 %, sum of minima −1.5 %, of medians +1 % (against d88a0db at load 13–18: CPU −7 %; phase
timings, min of 8: profile 49–52 ms on both, demo +4 ms for its one tunnel-mode solve). Drag budgets pass in all six modes (road
failed once at 61 ms median under load 24, passed at 45 ms).

## Our line raised for a crossing, cost model 33 (2026-11-17)

research/61: where Auto's first line leaves a crossing too little room (a reroute through homes where a box
would do, a player's box or bridge that does not fit), evaluate solves the grade again with that height (and,
where that does not do, lifts the line locally): one more full pass, two where the new solve fails, only for a
design with such a crossing. Of the five saved D11 designs only direct-80 has one (km 6.83).

Interleaved against main 3ee2fd9 (`scripts/dev/interleave.ts`, 12 rounds, host load ≈ 8), min / median ms:

| design | main | now |
|---|---:|---:|
| best | 117.8 / 161.2 | 121.8 / 157.3 |
| demo | 115.0 / 147.0 | 119.0 / 151.3 |
| direct-80 | 147.9 / 189.2 | 233.0 / 273.9 |
| direct-90 | 147.9 / 194.1 | 142.9 / 189.9 |
| town-centre | 248.8 / 303.2 | 237.4 / 310.7 |

direct-80 +85 ms (+58 %), the others within noise; sums of minima +10 %, CPU per round +9 % (all of it direct-80).
The kept pass (the re-solved line) spends ≈ 73 ms in the grade solve, 33 ms in cross-sections, 41 ms in the
crossings, 29 ms in noise and buildings (its own `timing` laps): a whole pass, sharing only the pass cache.

Making it stretch-local was looked at and not done: the grade solve's only way to re-solve a stretch inside a
fixed line (`EvalOptions.fixedProfile`, used for one direction of a separate motorway stretch) turns the block
solve off, so its line would differ from the block solve's everywhere else; the windowed evaluation is
preview-only (its result is not a full bill). A block-local re-solve needs the auto-profile's block API (and
the engineering after it would still run on the whole route). The cost is bounded: the retry runs only where a
reroute takes a home and a box could replace it, or a player's box / bridge does not fit, and is kept only when
it meets the need in proportion (research/61).

## Design realism, cost model 31 (2026-11-16)

Per-bend design speed, VL 1 slopes by ground layer, terrain class and buried-bridge culverts cost time; offsets,
all bit-identical (eval-regression, a 120,000-query check of `slopeSurfaceFn` against `slopeSurfaceAt`): a bend's
rule texts are built only when a violation reads them (they were built for every unit and joint, ~16 ms on each
D11 design), the terrain class runs one sorted sliding window instead of a sort per sample, `waterSizer` keys on
how many pipe / frame cover limits the depth exceeds instead of on every decimetre of depth, and a retaining
wall's search for where it fits reads the slope surface from one walk down the slope (`slopeSurfaceFn`; town-centre
asked `slopeSurfaceAt` 20,000 times per evaluation).

Interleaved against main e25f005 (`scripts/dev/interleave.ts`, 16 rounds, host load 4–11), min / median ms:

| design | main | now |
|---|---:|---:|
| best | 123.5 / 164.8 | 133.9 / 176.9 |
| demo | 109.3 / 136.4 | 122.6 / 172.2 |
| direct-80 | 133.4 / 199.9 | 154.1 / 234.0 |
| direct-90 | 178.2 / 238.5 | 174.8 / 233.8 |
| town-centre | 214.2 / 314.5 | 275.1 / 349.1 |

CPU per round +5 %; sums of minima +13 %, of medians +11 % (an earlier round at load 2: +12 % / +2 %). Most of it is
the different engineering the new grade line asks for: town-centre's tunnel became a long cut with walls (two more
support lifts, a stream retry), demo plans one more overbridge and reconnection (link routing ≈ +10 ms). The
auto-profile DP carries ≈ 12 % more height states on demo (its corridor of reachable heights is wider). Drag budgets pass in all six modes.


## Where the time is on cost model 31, and four small bit-exact savings (2026-11-17)

`node scripts/dev/profile.mjs` (new: it bundles the engine so that node's profiler can tell functions and
lines apart, then prints own time, time with callees, a function's subtree or lines, or sampled allocation)
on main `06dc5d3`:

| | the five saved D11 designs | the whole D3 (56 km, one evaluation ≈ 2.5 s) |
|---|---|---|
| grade search (`autoprofile.ts`: `solve` and its cost tables) | 27 % | 10 % |
| crossings (`buildCrossingGeometry`; about half of it weighing other remedies in `reconsider`) | 23 % | 24 % |
| garbage collection | 10–12 % | 12 % |
| retaining walls (`planRetainingWalls`) | 9 % | 10 % |
| noise (`noiseOutcome`) | 8 % | 16 % |
| footprint screen (`footprintConflicts`, mostly `planRoadRealignment`) | 4 % | 15 % |
| allocated per evaluation | ≈ 280 MB | ≈ 5 GB |

There is no single hot spot left outside the grade search: the profile is flat (the next own-time entries
are 2–3 % each), and the crossing, noise and retaining code is already written around scratch arrays and
memos. What the whole D3 pays for is passes: `evaluate` runs the whole route three times (the first pass 29 %,
the separation retry 28 %, a further retry 13 %) before the noise (16 %). **The lever that would win back the
+11 % of model 31 is there and in the grade search** (a retry that re-engineers only the stretch it changes;
fewer height states), i.e. in `evaluate.ts` and `autoprofile.ts`, which this pass did not touch (open work
on both).

Done, each bit-identical (`scripts/exact.ts`: 177 / 177 whole results; `tests/footprint-geometry.test.ts`
holds the rewritten primitives to their earlier forms on 20,000 random cases each):

- `road-realignment.ts` `chordHits` tested the whole chord against the footprint cells near *each* 5 m
  sample of it; consecutive samples in one 100 m bucket repeated the same tests (≈ 5 % of the whole D3).
  It tests a bucket once.
- Screens that only ask *whether* a segment touches a cell (`chordHits`, the water / rail checks of a
  rebuilt road and of a moved channel) use `touchesFootprint`, which makes no interval.
- `FootprintGrid.hits` made a closure and, off the footprint, an empty array per query.
- `watercourses.ts` `barrelIntervals` built ten small arrays per call (4 % of all allocation on D11).

Interleaved against main `06dc5d3` (`scripts/dev/interleave.ts`, which now takes a pack and designs; host load
8–16, so read the minima), now / main:

| | rounds × runs | min | median | CPU |
|---|---|---:|---:|---:|
| five D11 designs | 30 × 4 | 0.97–0.99 | 0.97–1.03 | 0.98–1.03 |
| D3 motorway starter (15 km) | 16 × 1 | 0.97 | 0.93 | 0.93 |
| whole D3 (56 km) | 10 × 4 | 0.94–0.99 | 0.87–0.98 | 0.89–1.05 |
| whole D35 | 10 × 1 | 0.94 | 0.93 | 0.99 |
| Nová Paka | 16 × 1 | 0.99 | 1.07 | 1.05 |

So ≈ 1–3 % on D11 and ≈ 3–6 % on the long routes: real, small, and not the +11 %.

Again after merging main `684e77e` (cost model 34; 177 / 177 results identical to main's, host load 2–4): five
D11 designs 30 × 3: min 0.97–0.98, median 0.96–1.04, CPU 0.98–1.01; whole D3 10 × 2: min 0.90–0.96, median
0.97–1.03; whole D35 10 × 1: min 1.00, median 0.90. The same picture: 2–3 % at the minima on D11, more on the
whole D3, medians within the noise.

### What a retry pass costs (model 34, 2026-11-17)

Measured with each `evaluateRoute` call timed (a scratch wrapper; min of 8 evaluations, D3 of 3):

| design | passes of one evaluation, ms |
|---|---|
| best, demo, direct-90, town-centre | first 121 / 117 / 147 / 209, no retry |
| direct-80 | first 134, the regrade retry (model 33) 85 |
| whole D3 | first 800, separation 566, separation + narrowing 397, separation (buried roads) 310; noise ≈ 470 |

- **The grade solve of a retry is already block-local**: with the pass cache `autoProfile` re-solves only the
  boundary windows and blocks whose inputs changed (`rangeKey`). direct-80's retry spends 21 ms there (43 ms in
  the first pass: a floor at km 6.83 reaches the 5 km windows of most of a 19 km route), the D3's 63 / 71 /
  24 ms against 156 ms. A separate block entry point would re-solve the same blocks.
- **The rest of a retry is what a pass costs when nothing changes.** The same pass run twice (same options, same
  pass cache: every block solve, section, retaining screen, support and reroute a cache hit) still takes
  47–72 ms on the D11 designs (town-centre 136 ms) and 531 ms on the whole D3, i.e. 40–65 % of a first pass.
  Where (D11): crossing geometry 41 % (the first build of every crossing 18 %, weighing other remedies 19 %),
  the engineering passes 38 % (replaying the retaining screen station by station 21 %, structure selection 5 %),
  the footprint screen 8 %, setup 5 %. On the whole D3 a retry is ≈ 45 % crossings and footprint, ≈ 15 % its
  own strict retry (crossings again), ≈ 25 % engineering, ≈ 11 % grade solve.
- **Why that part is not stretch-local today, bit for bit.** Each of those steps is a loop over the whole route
  whose result somewhere may depend on something far away: reroutes and the weighing of remedies reach
  `linkHardReach` = 2 km along the road and are taken in order of cost over all crossings (the whole D3 has a
  crossing every ≈ 190 m, so no two stretches of it are independent by distance); structures and walls
  are chosen in runs that may run on past a stretch's ends, with a fill value settled per block on the result. A result spliced from "the stretch re-engineered, the
  rest copied" would equal today's on most designs but not provably on all, so it is a model change to be
  reviewed (like the windowed preview, whose bill is −8 … +10 % off the full one), not a refactor. What can be done
  bit for bit is more of what the pass cache does: a memo per step keyed by everything the step read
  (the reroute cache's footprint signature is the pattern). Candidates, by what a retry would save: one
  crossing's candidate builds (≈ 18 % of a pass that changes nothing), the setup shared by all passes (≈ 5 %).

Done of those (2026-11-17, bit-exact: 177 / 177): **the setup is shared** (`passSetup`: a retry pass takes the
first pass's stationed line, ground and clearances from the pass cache, with its own timing and its own copy of
`clearanceS`, the one array a pass writes to; `tests/pass-setup.test.ts` hashes the shared setup when made and
after every pass). Interleaved against main `5ea8d7e` (load 4–5): direct-80 min 220.1 → 214.8 and 215.5 →
212.4 ms (the 3–5 ms of one setup), the other D11 designs and the whole D3 (min ratio 0.99 / 1.00) within the
noise: it is ≈ 1 % and mostly groundwork for a pass that starts from another pass's state.

Not done: **a memo of one crossing's candidate builds.** A candidate (a box or a bridge over us weighed against
the present remedy) reads our road through more than the tracked `spatial` queries: `route.grade`, `width`,
`left`, `right`, `kind` by index at 19 places in the 840-line `buildCrossingGeometryOnce`, and the houses still
standing through a closure over the pass's demolitions. A key that misses one of them is a wrong result that no
frozen bill need show. Its place is after that function is in stages (done since: docs/architecture-review.md
§ Core) and the loop body of `crossingStructures` is a function of one crossing that is handed what it reads of
our road, so that the key can be read off its signature. Expected then: ≤ 18 % of a retry pass where the footprint near the crossing is unchanged (on a 19 km route a regrade
changes about half of it), i.e. ≈ 5 ms on direct-80 and ≈ 2–3 % of the whole D3.

The groundwork is done (2026-11-17, bit-exact): `crossingStructure(c, ours, …)` builds one crossing and reads
our road through `ours` only (`route` is not in its scope; the list of what a key must cover is written at
`ours` in `crossingTools`). Measured on the five D11 designs: `crossingStructures` is 36 % of the crossing
geometry's time (19 % in the builds of all crossings, 16 % under the weighing of other remedies), i.e.
≈ 9 % of an evaluation over all its passes, and a memo across passes can only save it in a retry pass, for the
crossings whose stretch of our road did not change. **The memo itself is not built, and should not be before
the stretch-local retry** (docs/architecture-review.md "Planned next performance lever"): that keeps the
crossings outside a retry's window from the kept pass without building them at all, which is this memo's
whole gain and more. What a memo would still need beyond the key: the build's writes are spread over the
crossing (`cost`, `span`, `lowered` … set and deleted), its geometry object (which stages 3 and 4 go on to
change, so a kept copy has to be a deep one, made before them and again at every reuse) and five maps of the
build (`cuts`, `squares`, `rawPaths`, `survivingSides`, `squaredPaths`), and the houses standing along a
straightened crossing's new road (`linkEnv.houses`) change with the pass's demolitions.

The large lever (a retry that re-engineers only its stretch, ≈ −0.8 s of the whole D3's 2.5 s) is a model
change: docs/architecture-review.md "Planned next performance lever".


## Crossing remedies, cost model 28 (2026-11-16)

Straightened crossings, the consolidation pass, moving roads beside ours and reroutes joining their target's
road where it comes nearest build more candidate geometry (best: ≈ 17 candidate reroute sides per evaluation
against main's 6). Offsets, all bit-identical: a build memo per `buildCrossingGeometry` call (each way's stretch
through our earthworks, its straightened line, the geometry of a crossing built only to anchor candidates,
anchors per line and width); the consolidation pass tries only what the first look could not see (a crossing
that began to carry traffic after the other was weighed, a reroute never retried against the same target);
square variants only where they can pay (the old line's treatment costs more than the square structure's
least price plus the new line's least length) and not where the old one failed for its height or ramps;
allocation-free deck and box-floor searches; anchor lines built lazily; a reroute's slope queries memoised.

Interleaved in one process (both evaluate bundles loaded, alternating, warm, 20 rounds for the five saved D11
designs and 10 for the D3 motorway starter and Nová Paka; host load ≈ 3–7), min / median ms, main 3d01d57
(model 25) → this branch:

| design | main | now |
|---|---:|---:|
| best | 112.4 / 151.8 | 107.2 / 138.5 |
| demo | 98.1 / 157.2 | 102.5 / 167.6 |
| direct-80 | 118.8 / 152.2 | 129.2 / 155.3 |
| direct-90 | 118.8 / 140.3 | 126.7 / 147.4 |
| town-centre | 147.5 / 160.7 | 149.9 / 178.3 |
| D3 motorway starter | 149.4 / 197.9 | 144.5 / 187.4 |
| Nová Paka | 73.1 / 102.8 | 77.3 / 89.4 |

Sums: min 818 → 837 ms (+2 %), median 1063 → 1063 ms. The crossing step itself is ≈ 4–15 ms dearer on
direct-80 / direct-90 (their squared and joined candidates); designs whose absurd remedies are gone (a 704 m
bridge along the D3 motorway, the strict retry it triggered) got faster.

## Local grade solve (cost model 25, 2026-11-16)

The Auto grade line is now solved in blocks (research/39 "Local edits"): one corridor pass per boundary
window (5 km either side, coarse grid only; the timings in this paragraph were measured with 1.5 km windows,
see "Reviewed trade-off" below) on top of the blocks' own corridor and mass-balance passes, which together
cover the route once as before. Inputs are placed from the block ends (≈ 1 even cost sample per 20 m with
its ground and geology looked up at its own place, a traced line every ≈ 10 m for crossings, raster
samples every 2.5 m). Interleaved A/B against main 93f849d (Node, warm, 10 evaluations, two rounds, host
load ≈ 8–9), min / median ms: D11 best 91 / 112 and 86 / 97 → 92 / 109 and 89 / 104; town-centre 142 / 178
and 119 / 150 → 134 / 152 and 130 / 151 (within noise). D3 0303 11 km motorway 97–105 / 101–133. A design
whose separation retry splits into kept and dropped stretches pays a third evaluation of the route
(rare: none of the starters).

### Reviewed trade-off: 5 km boundary windows (2026-11-16)

Locality and the bill want each boundary's heights from 5 km either side (1.5 km windows cost ≈ 2 % on the
sum of all designs and miss valleys); that window pass is the solve's extra work: +15–25 ms per D11 full
evaluation at first. Offsetting savings, each checked bit for bit against the evaluation without it
(bills, grade lines, problems and crossings identical) unless marked:
- **One evaluation, one set of caches.** The passes of a design's evaluation (the separation and narrowing
  retries, the clearance, support-lift and strict retries) share Auto's window and block solves (keyed by
  every input they read: an unchanged block is not solved again, so a retry re-solves only the blocks
  its constraints reach), cross-sections, retaining screens, support obstacles and reroutes.
- **Noise once.** Retry passes leave out the noise (walls, buy-outs, noise problems; not what a retry
  changes, so retries are now judged without noise problems: a reviewed model change) and only the kept
  pass is completed with it.
- **Cheaper windows.** A boundary's window searches ±15 m around the ground envelope (not ±25; the full
  band where that finds nothing; not railways) and prices every other 20 m cost sample (the corridor only:
  sum of all saved designs and starters within 0.1 %).
- Typed cost samples and one multiply-add per height-table position in the DP's inner loop (same bills).

Interleaved A/B against main a8d8de5 (Node, warm, 10 evaluations, two rounds, exclusive lock), min ms:
best 88–109 → 116–118, demo 105–111 → 95, direct-80 102–104 → 120–121, direct-90 105 → 125–127,
town-centre 127–132 → 158–170, D35 first section 87–109 → 85–88: on average ≈ +15 ms per D11 design.
What is left is design-specific: best's line buries a road that the strict pass must keep (main's line
did not; demo is the reverse), town-centre's repaired line takes five engineering passes of support lifts.
The whole D3 settles in 1.4–1.5 s (was 4.2–4.3 s: four full passes, now one with noise and three
re-solving only their blocks).

## Long routes: windowed previews, a preview worker (2026-11-16)

Goal: complete corridors (Středočeská D3 58.5 km, D35 Opatovec → Mohelnice 34 km) with unchanged drag
budgets. Everything in `evaluate()` is linear in route length (the auto-profile DP is knots × heights ×
grades; sections, structures, crossings, noise per station), so a long route is not a complexity problem
but a constant-factor one: at ≈ 2 ms/km for a road preview and ≈ 11 ms/km for a full motorway evaluation,
60 km means ≈ 120–140 ms per preview and ≈ 0.65–1 s per full evaluation. Two things break the budget:

1. **Preview cost grows with the route, not with the edit.** Measured (Node, this host, median of 12 drag
   steps, `PREVIEW=1 scripts/bench-drag.ts`): D3 15.7 km motorway 33 ms, D3 road 30–35 ms, D11 18–20 km
   24–37 ms; full motorway evaluation of a 11–17 km D3 section 150–260 ms (phases: engineering passes incl.
   retaining 65 ms, crossings 21, profile 19, noise 7, footprint 6 for 11 km).
2. **A preview waits behind a full evaluation.** One worker ran both; a pause in a drag starts a full
   evaluation that cannot be interrupted, so every later preview waits up to its whole duration (the D35
   34 km pin-mode failure, p50 69 ms > 60).

What changed (full evaluations and bills are untouched: `eval-regression` passes both paths):

- **Windowed preview** (`core/preview-window.ts`). Each full result is remembered per lineage (same ends,
  category, speed, profile mode, overrides). A preview finds where the new design differs from it: the plan
  (stations compared with the full result's at the same chainage upstream and at chainage − ΔL
  downstream; 0.2 m tolerance) and the grade inputs (pins in Auto, height points By hand). It evaluates only
  that stretch ± 1.5 km as its own route (`EvalOptions.window`: the whole route's stationing sliced, heights
  and grades of the full line at both window ends; the auto-profile DP continues those grades within one
  vertical curve, `endpointGrades`), and stitches: grade line = full VPIs before + window VPIs + full VPIs
  after (shifted by ΔL); per-station arrays and per-cell costs from the window inside, from the full result
  (mapped by chainage) outside. A window over more than 60 % of the route, a changed override or no full
  result yet falls back to the whole-route preview. The preview is shown as before (`≈`, provisional).
- **Preview worker.** Previews run in a second worker; the full worker posts each full result to it over a
  `MessageChannel` (structured clone in the workers, not on the main thread) as the base of its windows.
  A preview never waits for a full evaluation any more.

Measured, Node, previews of bend drags (`STEPS=12 PREVIEW=1 [WINDOW=0] scripts/bench-drag.ts`), whole-route
→ windowed, median ms: D11 best 30 → 17, demo 24 → 9, direct-80 34 → 10, direct-90 37 → 13, town-centre
26 → 33 (window over 60 %: whole-route); D3 15.7 km motorway 33 → 17, road 30 → 21. Windows are
6.3–7.6 km here, so the gain grows with route length.

Accuracy against the full evaluation of the same design (6 bend moves of 20 / 80 m on two D3 designs): bill
−8.0 … +10.0 % windowed vs −12.2 … −3.9 % whole-route; grade line within 2–9 m of the full one in both
(the full Auto line itself jumps by metres between neighbouring designs). The window carries the full
result's retaining walls, remedies and noise outside the edit, so it is usually closer; it misses changes
the edit causes far away (a mass-balance material value, a strict retry).

Also for long motorways: where Auto's grade leaves a crossed road with neither our bridge nor a buildable
bridge over us (ramps > 250 m or > 10 m), or pays the clearance penalty over a river or railway instead of
bridging it, a grade-separated route retries once with Auto asked to clear those (research/39). That is a
second full evaluation only on such (otherwise invalid) designs; valid motorway/railway bills are unchanged.

### Main thread on long routes

Once the worker was fast, the GPU drag runs on the 56 km D3 showed the main thread as the limit (profiled
with `drag-perf.mjs --profile`):

- **Preview messages.** A stitched preview first carried the full result's crossing geometry (hundreds of
  crossings): deserialising it cost most of the handler. Previews now carry crossings without geometry, like
  whole-route previews; the full worker sends the preview worker a slim base (`previewBase`). A 56 km
  preview is ≈ 1.7 MB (19 per-cell cost arrays are half of it): its own typed arrays are transferred to the
  main thread, not copied (main-thread time per preview on the whole D3: p95 25–28 → 15 ms).
- **Profile painting** drew one fill and one stroke per station (5,600 on the whole D3): now one area per run
  of embankment / cutting, one stroke per run of the grade line, and at most ≈ 2 points per pixel.
- **Long tasks after release.** The 3D rebuild's indivisible steps grew with the route: the shared mask and
  ground blend computed at the swap (≈ 40 ms), crossing reuse keys hashed for all surfaces in one step
  (≈ 35 ms), whole-route passes of the earthwork ribbon. The mask and blend are now prepared in slices before
  the swap (`View.prepareRouteScene`), keys a few surfaces per slice, the ribbon passes yield, and the swap
  runs as its own task. Longest slice on the 56 km D3: 52–110 → 16–23 ms; swap 38–50 → 11–14 ms.
- **Start view.** Framing a whole 57 km route at once costs the integrated GPU 50–130 ms frames; long
  missions keep D11's camera distance, shorter ones (Nová Paka, D3 0302) come closer.

`node scripts/drag-perf.mjs --gpu --check [--scenario <id> --preset <id>-motorway] --mode <m>`, AMD RADV
GFX1150, host load 4–7, unchanged budgets, all pass. Preview latency p50 / p95 (worker p50 / p95), ms:

| Route | bend | road | radius | pin | vpi |
|---|---|---|---|---|---|
| D11 18.9 km road | 17 / 29 (9 / 21) | 15 / 25 | 16 / 33 | 11 / 15 | 13 / 16 |
| D3 0305/I 17 km motorway | 17 / 25 | 17 / 48 | 16 / 36 | 15 / 25 | 21 / 42 |
| D35 Opatovec → Mohelnice 33 km | 22 / 54 | 18 / 24 | 17 / 32 | 15 / 20 | 16 / 27 |
| Whole D3 56 km motorway | 27 / 74 (11 / 38) | 23 / 47 | 26 / 37 | 21 / 33 | 24 / 33 |

(D11 before this work, same host: bend 34 / 68, pin 34 / 76.) Bend drags on D3 0301–0304 pass too
(p50 14–19 ms). Release → settled: D11 0.2–0.4 s, D3 sections 0.2–0.6 s, D35 0.5–0.7 s, whole D3 0.7–1.8 s
(a full motorway evaluation is ≈ 11 ms per km; linear, in its own worker).

The first preview of a drag can still be a whole-route one (no full result of that lineage yet in the preview
worker, e.g. just after loading): 300–450 ms on the whole D3, once.

## Staged noise decisions (2026-11-16)

The grouped far sums are within `FAR_ERROR` (0.3 of their own value; 0.07 for the finer grouping) of the
cell-by-cell sums. Every decision that compares a level with a threshold now checks that margin and, where it
could flip, sums that house more finely and then cell by cell (research/36 §2). Walls, buyouts and violations
are those of the cell-by-cell sum on every fixture (tested against an all-cells run). In town-centre 108 of
367 houses are summed finely and 48 cell by cell (a wall's growth stops just under the limit, so many houses
end near it). A house's exact decision windows are derived from the narrower one (the cells the wider
window takes in are subtracted) and kept per house and stage; a refined house redoes only the step it was
in. Interleaved A/B (warm, 16 rounds, host load ≈ 6–10), min / median ms:

| design | noise main | noise a903bda | noise now | whole evaluate main | a903bda | now |
|---|---:|---:|---:|---:|---:|---:|
| best | 4.9 / 6.6 | 4.1 / 5.1 | 6.5–7.0 / 7.7–10.2 | 70.9 / 92.9 | 69.4 / 84.0 | 72.8–79.6 / 88.1–92.4 |
| demo | 5.3 / 6.6 | 4.7 / 5.4 | 7.4–7.8 / 8.4–10.3 | 106.4 / 117.0 | 98.1 / 112.5 | 101.2–103.9 / 116.1–125.7 |
| direct-80 | 5.3 / 6.3 | 8.4 / 10.2 | 14.3–15.4 / 15.9–20.7 | 83.0 / 99.3 | 83.7 / 94.4 | 89.6–94.1 / 98.6–117.5 |
| direct-90 | 4.8 / 6.0 | 5.8 / 7.3 | 9.4–9.8 / 11.1–11.8 | 78.4 / 88.6 | 77.8 / 83.8 | 80.3–82.0 / 87.7–93.1 |
| town-centre | 7.1 / 8.6 | 15.0 / 15.7 | 27.5–31.2 / 28.9–33.0 | 87.4 / 99.2 | 96.0 / 105.8 | 108.1–113.8 / 116.5–123.2 |

("now" ranges over the two runs.) `noiseOutcome` alone, town-centre, 30 calls: 14.6–16.1 → 27.6–28.6 ms.
The cell-by-cell sums of those 48 houses are most of the increase (≈ 1,900 cells each): ≈ +12 ms on town-centre's full
evaluation, a reviewed trade-off (2026-11-16) for decisions identical to the cell-by-cell sums. `node
scripts/drag-perf.mjs --gpu --check`: every mode OK (drags evaluate without the noise step until they settle).

## Finite-segment noise, cost model 21 (2026-11-16)

The finite-segment noise sum (research/36) replaced the per-station maximum. Its first version made the
noise step of a full evaluation 6 / 7 / 13 / 10 / 27 ms (best / demo / direct-80 / direct-90 / town-centre)
against 5 / 5 / 5 / 5 / 7 ms on main. The performance pass:

- **Segment tree** instead of fixed 4-cell chunks and 32-cell groups: segments of 4·2^k cells, each taken
  whole once its bounding circle's diameter is ≤ 0.32 × its distance (the old group ratio), unscreened
  ones beyond 3 km once their diameter ≤ their distance. ≈ 30 far segments per house instead of ≈ 100.
- **Two screening samples per far segment** (edges and walls; walls per block and height, not per cell).
- **Rigorous open-road bound from each segment's own line distance** (d·10^(−U/10) bounded over the
  interval of distances its cells' lines can have, instead of its maximum M everywhere): it rules out
  houses 120–370 m away by itself (780 → 80 open-road sums in town-centre); checked at the receiver
  point.
- **Typed scratch kernels**: geometry, energies and screening per storey through module Float64Arrays,
  the hot path of U small enough to inline — doubles crossing a non-inlined call are boxed (28 → 11 MB
  allocated per town-centre noise step).
- **Candidates**: stamped scratch grids reused across calls, the nearest station by descent from the
  house's projection onto the tangent (squared façade distances), one visited-set per building index.
- Accuracy against the cell-by-cell sum on every storey of 7 saved designs: within 3 dB of the limit
  ≤ 0.100 dB over, 0.082 under (since the staged decisions above: no decision depends on that error; the
  loudest floor as shown, within 3 dB of the limit, +0.099 / −0.067 dB) (was 0.078; far walls now take a share of what passes the edges, never more,
  and segments must be straight); bills moved by ≤ 0.5 M CZK (demo, direct-80, town fixtures; research/36 §3).

Interleaved A/B in one process (both evaluate bundles loaded, alternating, warm, 20 rounds, host load
≈ 6), min / median ms:

| design | noise main | noise now | whole evaluate main | whole evaluate now |
|---|---:|---:|---:|---:|
| best | 4.7 / 6.4 | 3.8 / 5.5 | 72.2 / 87.5 | 70.3 / 93.9 |
| demo | 5.3 / 6.8 | 4.4 / 6.4 | 106.5 / 123.4 | 105.3 / 129.9 |
| direct-80 | 5.3 / 6.8 | 7.8 / 10.5 | 84.6 / 94.4 | 90.1 / 99.1 |
| direct-90 | 4.8 / 6.2 | 5.9 / 8.3 | 83.4 / 90.8 | 80.7 / 91.6 |
| town-centre | 7.7 / 9.6 | 15.7 / 19.3 | 99.9 / 119.7 | 106.8 / 131.3 |

`scripts/bench-drag.ts` (24 steps, nothing repeated), town phase means: town-centre 15.8–17.6 ms against
10.0 on main, direct-80 15.1 against 10.9–13.1; best, demo and direct-90 equal or faster. The noise step
alone (`noiseOutcome`, town-centre, warm p10): 22 → 12.5 ms.

Reviewed trade-off (owner's lead, 2026-11-16: keep the accuracy): town-centre (367 dwellings at the road,
221 over the limit) remains ≈ 7 ms slower at the minimum in the whole evaluation (the evaluate-performance
rework of long corridors may recover it); the rest is arithmetic every house needs (≈ 30 far segments with their screening, the
±150 m decision window cell by cell, four wall heights for every house over the limit, the far walls'
effect on every house). Not done: caching per-house sums across evaluations (any length change moves
every station, so nothing would be reused during a drag), and coarser far grouping (θ = 0.4 with two
samples saves ≈ 1 ms at 0.10 dB near the limit).

## New scenarios: route length sets the cost (2026-11-15)

Evaluation time grows with route length. Node, warm, median of 10 full evaluations on the same host:
D3 starter 15.4 km **73–81 ms**; Nová Paka starter 6.6 km **29 ms**; D35 first stage 16.5 km
**55–62 ms**. The full D35 corridor (Opatovec → Mohelnice, 30.6–33.7 km) took **209–300 ms** per full
evaluation (straight 245–300, reference 209–223, junction starter 156–169), about two to three times
D11's 90–150 ms. On the GPU drag gate it passed bend/road/radius/vpi, but **pin** missed the median
preview latency budget in 2 of 3 runs (69 / 59 / 75 ms > 60). Per the agreed rule the scenario ships as
the first stage, which passes all five modes with margin (preview p50/p95 ms: bend 20/43, road 21/60,
radius 19/50, pin 28/61, vpi 12/22). `node scripts/drag-perf.mjs --gpu --scenario <id> --mode <m> --check`
measures any pack with unchanged budgets. Mohelnice needed a cheaper long-route preview first: done by the
windowed previews and the preview worker above; the whole D35 now passes all five modes.

D11 startup no longer waits for the 18 MB transport graph (lazy: bytes fetched when idle after the
first settled scene, parsed on first need). `scripts/startup-perf.mjs --gpu`, median of 5: ready
1577 → 1151 ms, first settled scene 2367 → 2000 ms, longest long task 952 → 622 ms, JS heap
425 → 336 MB.

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
