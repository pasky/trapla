# 57 — A drag on the Královec railway (QA final sweep P1 2)

QA (final sweep, main e24df59): a 50 px drag at km 6 of the Královec railway mission (single track,
120 km/h) left two streams at km 2.07 / 2.36 in a cutting ("Our earthworks block a stream", "Our cutting
runs through a stream"), 4 km from the drag, and "No buildable reroute for the track · Lower our railway
here by 0.1 m" at km 6.29. The QA's projects are `tests/fixtures/qa-final/rail-kralovec{,-drag}.json`
(the drag put a bend 23 m off the 5.5 km straight km 4.5–10.0); `tests/rail-drag-locality.test.ts`
and the railway suite of `scripts/edit-locality.ts` replay them.

## What happened

| | parent branch (98e6334) | now |
|---|---|---|
| starter | VALID 10.5506 bn | VALID 10.5857 bn (+0.3 %: 1. +45 M, 3. −10 M) |
| after the drag | 9.7914 bn, 5 problems; grade changed from km 1.6 to the end (up to 11.5 m) | VALID 10.8815 bn; grade before km 2.6 unchanged (the plan moved from km 4.4) |
| edit-locality, railway suite (seed 1, 9 edits) | grade reach p90 10.5 km, 1 m changed beyond 10 km (a pin at km 2.7 moved km 12.7); the repro FAILS | reach p90 7.4 km, nothing beyond 10 km; repro and pins PASS |

The railway was already solved in blocks (model 25): the boundaries are 2.8 / 4.4 / 8.5 / 11.2 km on the
starter, 2.8 / 5.2 / 8.1 / 11.2 km after the drag (the 5.5 km straight became two straights). km 2.07 lies
in the first block, whose end height comes from the 5 km window around km 2.8, which reaches the drag.
That is the designed reach; what broke the streams was not.

1. **The search band decided the streams.** The coarse pass searches 25 m around the ground first. A
   railway (12.5 ‰) climbs out of a valley over kilometres, so its line often lies far from the ground (the
   starter runs 113 m below the hill at km 3). With the drag, the window's best line within the band paid
   the clearance penalty at both streams (4 × 1e8 CZK in the search) rather than dipping under them in the
   tunnel; the wide band's line clears them for less (search objective 5.63 against 5.91 bn). A gentle
   (railway) solve now weighs a band line that misses a clearance against the wide band's line
   (`autoprofile.ts coarse`). On the starter a window's band line missed a support-lift target at km 9.1
   and the wide band's line is cheaper in the search; the bill +45 M. Roads keep the band: there the wide band also flips near-ties elsewhere (D35
   stage 1 −1.1 bn, whole D35 +0.4 bn), a search question of its own.
2. **Streams were never retried.** Rivers and railways Auto left too low go through the separation retry
   (their clearances made dearer than any structure, kept per stretch); streams left in a cutting did not.
   They do now (`Violation.clearance: 'water'`). Two of 20 random Královec edits (seed 7) that left a stream
   in a cutting are now valid.
3. **The same design billed differently by evaluation order.** The height table each search reads is
   filled only over the heights it can visit; that envelope left out B's off-grid correction (the last
   block), and an unfilled entry bars every line that reads it, unless an earlier evaluation of another
   design had filled the shared table. A pin at km 2.7 (parent branch): 10.489 bn alone, 10.479 bn after
   another edit had been evaluated, 1 m of grade at km 12.7. The envelope now includes the correction; D11 fixtures and all
   scenario starters bill as before (their lines never touched those entries).
4. **The track at km 6.29 did not miss by 0.1 m.** The fix text floors its number at 0.1 m; our cutting
   was 12.3 m deep, 6.3 m deeper than a bridge over us needs. That bridge's ramps fail: the track falls
   18–32 % along its mapped line (the ground includes a gully), steeper than the track's 15 % justified
   maximum (research/20), and the reroute to the next crossing fails too (railway, river, steep). Auto now
   retries such a crossing like a stuck bridge over us; where our cutting is already deep enough, it asks
   for our bridge over the way only (`EvalOptions.separate[].above`). The drag: our railway on a bridge over
   the track, VALID, +0.75 bn against the invalid line. Where nothing works, the fix text no longer asks for
   a height that is already there ("Move our road a little here, or choose …").
5. **Per-stretch retries are not additive.** A separation retry kept for some stretches is re-run for them
   alone; a stretch's raised clearances move the grade at the next, so that re-run can resolve less than all
   stretches together did. Where it does, and no stretch was worse with all, all are kept.

Rejected: letting ramps follow a crossed road steeper than its class maximum (it made the drag's track
bridge buildable, −2 … −56 M on D11 / D3 designs) — the 15 % cap is a reviewed rule with a test, and
DEM-measured way slopes include gullies a way bridges.

## Left

Random Královec edits (seed 7, 20 edits) still leave some problems in the edited stretch itself: a service
road at km 4.75 whose retry trades its failed reroute for earthworks over it, a track next to Trutnov
station after the first bend moved 150 m, a stream along our earthworks. They are local (nothing beyond
10 km in any edit) and their fixes name the remaining choice.
