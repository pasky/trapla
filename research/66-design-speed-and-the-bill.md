# A slowed stretch and the bill; which speeds a bend may have (playtest sweep 3, P1 #1)

Snapshot 2026-11-17 (qa3-realism-fixes agent, main 30d0ad8, cost model 38). Repros: `npx tsx qa3/speed-monotone.ts`,
`npx tsx qa3/speed-per-bend.ts scripts/best-design.json`, `SCENARIO=d11 npx tsx qa3/rail-speed.ts`.

## 1. Why slowing one bend made D11 284 M dearer

D11, fresh start, one 7° bend at km 11.7 (`qa3/designs/d11-one-bend-70.json`). With one bend its stretch is the whole
road, so 70 km/h relaxes every vertical curve (crest 5,500 → 2,100 m, sag 2,700 → 1,500 m) and the bend's radius
(Auto: the tightest allowed, 770 → 600 m). Bills (model 38): 90 → 8,782 M, 80 → 8,783 M, 70 → 9,067 M.

**Search defect or a real trade-off? Neither: the grade search is monotone in its own objective.** Its five blocks
(4 km each) all find a cheaper line at 70 by the search's own estimate: 823 → 745, 1,401 → 1,368, 1,093 → 1,044,
702 → 676, 380 → 337 M (sum 4,398 → 4,171 M). The bill, block by block, agrees on four of them (−74, −34, 0, +33 M)
and disagrees on km 8–12: the search expected −48 M, the bill is **+360 M** (bridges +469, crossed roads −60,
earthworks −85).

The mechanism there: the 70 km/h line runs ≈ 10 m higher over km 8.8–9.8. A field track crosses at km 9.08; at
90 km/h our road is 8.8 m above it and the track is diverted (60 M); at 70 km/h it is 17 m above it, no box fits under
the fill, so the structure choice bridges the track (structures.ts "forced"), and that bridge joins the stream bridge
at km 9.38: one 800 m bridge instead of 280 m. **The grade search does not price ordinary-road crossings** (PLAN.md
"Known limitations": its cost is a flat-ground section estimate with rivers, railways and the clearances it is given,
not the crossed roads). Looser rules let it chase an estimated saving into a crossing the bill has to bridge.
With the 90 km/h line kept on the 70 km/h plan (By hand), the bill is 8,732 M: the cheaper road existed.

Over the best design (18 Auto bends, each alone at 80 or 70): −35 … +45 M, 14 of 36 slow-downs dearer (the same gap,
smaller; the bend's tighter Auto radius also moves the line a little).

## 2. The fix: faster elements where they fit; the slower ones weighed in one pass

**First attempt (reviewed, replaced).** Every line built for a faster speed meets a slower stretch's rules, so Auto
evaluated the design once more per faster geometry (every mix of each slowed bend's speeds) and kept the cheapest.
Monotone, but 2–9 full evaluations per design: D11 one bend at 70 km/h 1.2 s against 0.3 s, too slow (owner).
Cheaper rankings tried on the best design's 36 single-bend slow-downs (each against the road-speed line):
- **a preview** (one solve, one engineering pass, no retaining walls, no crossing geometry): its differences
  missed the full ones by up to ±25 M (e.g. bend 6 at 80: full −18.6 M, preview −0.1 M; bend 8 at 80: full +8.1 M,
  preview −16.8 M): useless for a ranking at this scale;
- **the first pass** of a full evaluation (before the retries): within 0.5 M of the full difference on all 36.

**The mechanism now** (`plan-speeds.ts`, `design-speed.ts searchSpeeds`, `evaluate.ts`):
1. *Plan.* A designer uses a slower stretch's smaller elements where the faster ones do not fit ("přechod na
   minimální hodnotu návrhového prvku byl pozvolný", the transition to minimum elements gradual: VUT, research/47
   §2). A slowed bend whose radius is Auto's keeps the curve of the fastest speed up to the road's that has no
   horizontal problem its own speed's curve does not have; elsewhere its own tightest (three bends 330 m apart all at
   70 km/h: 90 km/h S-bends do not fit, the middle bend takes its 70 km/h curve). "Tightest" on a slowed bend is the
   player's choice (its own speed's tightest, set as the player's radius).
2. *Heights.* The grade search rounds a slowed stretch's hilltops and dips as for the road's speed. Its own
   smaller curves are weighed in one more pass of the same evaluation (its caches: the plan is the same), compared
   before the retries as the first passes are (above), and kept where that line is cheaper with no more problems
   (or has fewer).

| repro | QA (model 38) | now |
|---|---:|---:|
| D11 one bend 90 / 80 / 70 | 8,782 / 8,783 / 9,067 M | 8,782 / 8,783 / 8,782 M |
| best design, 36 single-bend slow-downs | 14 dearer (to +45 M) | none dearer; savings to −44 M (bend 13 at 70) |
| Královec railway, bend 3 at 100 | +47 M | 0 |

Not a proof: the weighing is before the retries, so a near tie may end about 1 M either way (D11 one bend at 80:
+1.1 M); the 284 M kind of error is caught.

The bend card says which kilometres the stretch covers ("Its stretch is the whole road" for one bend; else "Its
stretch: km a–b", halfway along the straights to its neighbours), "Auto keeps the 90 km/h curve here: it fits." and
"Auto rounds its hilltops and dips as for 90 km/h." where it does.

**Time.** One more pass for a design with slowed bends: D11 one bend at 70 0.45 s (0.27 s at 90); the best design
with a bend at 70 0.23 s (0.16 s). Drags (`drag-perf --gpu --check`, all six modes, the best design with bends 4 at
80 and 10 at 70): all within budget, settle after release 472 ms (the same design unslowed: 464 ms). The lasting fix
is the grade search pricing the crossed roads (PLAN.md "Next steps" 1).

## 3. Which speeds a bend may have

The railway mission is 120 km/h single track; its bend card offered 160 and 140. **A stretch is now designed
slower than its road, never faster** (`design-speed.ts bendSpeed`, `bendSpeedChoices`): ČSN 73 6101:2018 lowers the
design speed of a stretch "in justified cases by 10 or 20 km/h" (research/47 §2) — a lowering, not a raising; and a
railway's line speed is its mission's (Trutnov–Královec: single track, 120 km/h, research/38): its trains run no
faster on one curve built for more. (The owner removed the motorway's 150 km/h option as traffic policy, PLAN.md
"Motorway and railway scoring"; a faster railway is a mission choice, not a bend's.) A player who wants a wider curve sets its radius ("Widest").
Saved designs with a faster bend are evaluated at the road's speed there. The card says "no faster than the whole
line, 120 km/h" where the category has faster speeds.

**Recorded, not fixed.** On the Královec railway after the km 6 drag, bend 3 at 160 km/h billed 8,636 M against
8,948 M at 120: the 160 km/h line meets the 120 km/h rules too, so Auto's line at 120 is ≈ 312 M off a line it could
have built. It is the same estimate gap (§1) in the other direction; catching it would need the stricter
candidates on every design (twice the evaluation time everywhere). The crossing-aware grade search is the lever.
