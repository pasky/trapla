# 61 — Raising our line for a crossing, and the player's crossing choices (2026-11-17)

Follow-up of research/60 (items found playing the D3 and D11 missions, PLAN.md "Bug-fix sweep"). Measured in
Node (`scripts/choice-audit.ts`: every crossing × underpass / its bridge over us / cut and reroute on the D3
motorway and D11 best, 88 evaluations; `scripts/straighten-audit.ts`; `scripts/exact.ts`).

## What happened before

- A player's underpass or our bridge over a road was a floor of the grade solve at that crossing (`minH` plus a
  hold station). Where Auto's line was far below it — a track in our 8–21 m cutting — the solve raised the
  line over 3–4 km: D3 km 1.76 +1.45 bn, D11 best km 4.90 +1.5 bn (in an intermediate local-lift version), km
  9.93 +0.67 bn with its ramps still too long. Even a choice Auto's line already met added the hold station:
  "Straighten it" at D3 km 2.67 moved the grade up to 2.9 km away (+41 M for a box 1.8 M cheaper).
- Auto never moved its grade to make a box possible: D11 direct-80 km 6.83 kept a street reroute through three
  homes (48.7 M) while a box there needs our road ≈ 1.9 m higher.
- A player's crossing that could not be built left its way's stretch under our embankment as a buried road,
  billed as a relocation attempt (D3 km 3.84 underpass: +288 M of "crossings" for a 25 M box that could not be
  built).
- A player's "Cut and reroute" was led to the nearest crossing, which then could not be moved beside our road:
  D3 km 15.29 → km 14.18, whose road Auto moves beside ours for 18.6 M, kept a 702 m bridge along us (+3.1 bn).

## What a designer does, and the rule

A designer meets a crossing's needs locally where that is in proportion; where it is not, the client is told
what it would take. Implemented (evaluate.ts, "Our line raised for a crossing"):

1. The first grade line is Auto's own; a player's choice adds nothing to the grade solve.
2. Where that line leaves a crossing too little room — the player's box (even with the way lowered by
   LOWERING_RULES.maxDepth, research/37, or on its straightened line), the player's bridge over a road (its
   clearance), or an automatic reroute that takes a home where its class's box would do (research/60: homes
   only where nothing else can be built) — the grade is solved again with that height as a floor and, where
   that does not do, the line is lifted there instead (the support lift, a local repair within its block).
3. The first that meets the need and adds no problem nearby (for Auto's homes: takes fewer homes) is kept, **only while its bill rises by no more than the crossing's own treatment costs** (the reroute it
   replaces, or the player's box / bridge). This is a game rule of proportion, not a sourced number: our road
   is not regraded for kilometres to suit one crossing. Otherwise the crossing's problem says how much our road
   would have to rise ("Embankment too low for an underpass: raise our road here by 8.6 m …").
4. A crossing the player chose owns its way's stretch also where it cannot be built (its own problems say so;
   no second "our earthworks cover …" relocation is billed).
5. A player's plain "Cut and reroute" does not keep a crossing Auto moves beside our road: where no other
   crossing within reach carries traffic, its reroute says so ("No buildable reroute … no crossing within reach
   carries traffic over or under our road").

## Results

- D11 direct-80 (frozen): 4,183 → 4,157 M, VALID: km 6.83 becomes a box under a re-solved line (the floor
  candidate), the three homes kept. Other changes of Auto's results (`scripts/exact.ts`): two random D11
  designs (−92 M, −217 M), the whole D3 S 9.5 straight (+56 M, homes kept); everything else identical.
- Player choices, D3 motorway and D11 best: every underpass / bridge over us within +25 M of our road's own
  works except where the choice itself is a big structure (km 14.18: its 702 m bridge); none moves our grade
  more than 3 km away or clashes (`choice-audit` gate; on main before this: 3 failures, +123 to +666 M).
  D3 km 1.76 underpass: 12.7 M, "Embankment too low … raise our road here by 8.6 m"; D11 direct-80 km 6.83
  underpass: valid (as Auto now). Straighten-audit: 9 done (km 5.26 now done at +28 M), 18 said, none BAD.
- Evaluate time: one more pass (two where the new solve fails) only for a design with such a crossing:
  D11 direct-80 181 → 247 ms (min of 3, loaded host); designs without one unchanged.
- Left: "Our bridge over it" in our cutting (D3 km 8.59: +1.26 bn, valid) is still met at any price: the choice
  paints a bridge, whose support needs lift the line (support-layout, the design-realism agent's area). The
  player's "Cut and reroute" at D3 km 5.26 takes away the crossing the class II road is led to; Auto then bridges
  our road over that road and the local road (a clash, +577 M) — a consequence, said.
