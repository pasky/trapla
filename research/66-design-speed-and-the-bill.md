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

## 2. The fix: Auto keeps a faster stretch's geometry where the bill finds it cheaper

A designer given a lower design speed for a stretch uses its smaller elements only where they pay. Every line built
for a faster speed meets the slower stretch's rules (larger radii, gentler curves). So Auto now also evaluates the
design with each slowed bend's curves and heights built for the faster speeds — every slowed bend raised the same
number of the category's speed steps, up to the road's speed; hairpins keep theirs — and keeps the cheapest that has
no more problems (`design-speed.ts raisedBendSpeeds`, `evaluate.ts`; `EvalOptions.geometrySpeeds`). Travel time and the
time goal stay at the bends' own speeds. A drag preview builds the geometry the last full result kept.

| repro | before | after |
|---|---:|---:|
| D11 one bend 90 / 80 / 70 | 8,782 / 8,783 / 9,067 M | 8,782 / 8,782 / 8,782 M (70: the 90 km/h geometry kept, 284 M cheaper) |
| best design, 36 single-bend slow-downs | 14 dearer (up to +45 M) | none dearer; every 70 ≤ its 80 |
| Královec railway, bend 3 at 100 | +47 M (QA) | 0 (the 120 km/h geometry kept) |

Guarantee: a slowed design costs no more than with that bend one step faster (its candidates include that design's
geometry), so 70 ≤ 80 ≤ 90 bend by bend. With several bends slowed by different amounts the steps are raised together,
so it holds per step, not for every combination.

The bend card says which kilometres the stretch covers ("Its stretch is the whole road" for one bend; else "Its
stretch: km a–b", halfway along the straights to its neighbours) and, where Auto kept faster geometry, "Auto keeps the 90 km/h curves and heights here:
284 M CZK cheaper."

**Price in time.** A design with a slowed bend is evaluated once per speed step it lies below the road's (D11 one
bend: 300 ms at 90, 740 ms at 80, 1.2 s at 70). Designs without slowed bends are unchanged (all frozen fixtures and
drag-perf cases). The lasting fix is the grade search pricing the crossed roads (PLAN.md "Next steps" 1); then the
candidates would rarely win.

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
