# 60 — Reroutes through houses, and the player's straightening (2026-11-17)

Two findings of the architecture review (docs/architecture-review.md, "Seen while repairing them"), measured
in Node on the game's own starters (`scripts/straighten-audit.ts`, scratch survey scripts).

## 1. A reroute takes a home only where nothing else can be built

D3 km 3.63 (motorway starter): a 236 m field-track diversion (4.8 M) "buys out three houses". What it buys
are three garages / sheds of 17–25 m² (0.4–0.6 M each, `BUILDING_KINDS` "garage / shed") standing 1–5 m
from the new track, which climbs at its class's steepest 15 % there. What is drawn is what is billed: the
three are in the reroute's `houses`, demolished `in: 'reroute'` and priced in the crossing (1.5 M). Buying
out outbuildings for a field track is ordinary; the card's words were not ("3 houses"): it now says
"3 buildings stand in its way and are bought out", "a house" only for a home (`CrossingResult.homes`).

The survey of every road / motorway starter and the saved D11 designs found reroutes that demolish *homes*
where another treatment was buildable:

| design | crossing | before | now |
|---|---|---|---|
| D3 class I road start | km 0.65 field track | 11.0 M diversion through a house (8.3 M) | 25.3 M diversion round it (two sheds) |
| whole D3, S 9.5 straight | 6 homes in 5 reroutes | 16.373 bn | 16.494 bn, 2 homes (no other buildable treatment there) |
| D11 direct-80 | km 6.83 street, 3 homes | 48.7 M reconnection | unchanged: nothing else is buildable at Auto's grade |

Basis. Czech expropriation law (zákon č. 184/2006 Sb., o vyvlastnění, § 3 odst. 1,
https://www.zakonyprolidi.cz/cs/2006-184): "Vyvlastnění je přípustné jen … jestliže veřejný zájem na
dosažení tohoto účelu převažuje nad zachováním dosavadních práv vyvlastňovaného. Vyvlastnění není přípustné,
je-li možno práva … získat dohodou nebo jiným způsobem." Taking someone's home is the last resort; a
designer who can keep a field track's or a street's traffic with a box or a bridge does not take a house for
its new piece of road. Game rule (no number is tuned): Auto's reroute that would buy out a home is kept only
where no other treatment of that crossing can be built (`crossing-geometry.ts` `takesHome`: not `ok`, a
fallback); the consolidation passes never trade a working treatment for one that takes a home. Sheds,
garages, barns and workshops are bought out at their price as before. The player's own reroute shape may
still run through houses (an override). Our road's own demolitions are not affected.

Left as it is: D11 direct-80 km 6.83: Auto's grade leaves no room for a box (our road 1.9 m in a cutting);
the player's underpass there raises the grade and gives a valid design 26 M cheaper. Auto does not move its
grade to make a box possible (only the motorway separation retry does that, for bridges).

## 2. The player's "Straighten it"

On the D3 motorway starter it failed on its four most skewed ways, twice with "Your crossing choice clashes
with our bridge or tunnel here" for a box that would have been shorter. Three mechanisms (no price effect):

- The player's underpass held the grade at the box's full height (no lowering), while `resolveCrossings` and
  Auto let the way be lowered up to `LOWERING_RULES.maxDepth` (6 m, research/37). The grade rose ≈ 6 m at
  km 5.26 and the structure selection, which never knew of the requested box, bridged it. Now the floor
  allows the lowering, and where a box fits our road stays on earth over the player's underpass.
- A straightened line that cannot be built (ground too steep for its draped new pieces, no room for its bends,
  a junction or a building on it, a box too low on the new line) left the crossing infeasible; its old way
  under our embankment then counted as buried and the stream / strict retries bridged over it (km 7.94,
  +143 M). Now the way is built on its own line, the problem says why ("The track cannot be straightened
  here … It stays on its own line meanwhile") and nothing else changes. Where the only problem is a box too
  low on the new line, the grade is raised by what is missing (a retry kept where it resolves more than it
  breaks).
- A choice is per way: way 1314 crosses again under our bridge 80 m on (km 13.22) and took the choice there
  too. The crossing under our bridge is now simply passed where the choice is met at another crossing of
  the way.

- The straightened line's new pieces lay draped on the ground and failed where it was steeper than the class's
  steepest grade over 20 m (9 of the 22 refusals below), while every reroute is engineered within its
  gradient with earthworks up to 10 m (`LINK_MAX_SUPPORT`, research/20) — the rule text already said "built
  like any new road". They are now profiled like a reroute (`profileLink`, the class gradient, its steepest
  where the ground leaves no choice) and drawn as built (raised or cut where the profile leaves the ground).
  Auto straightens two more D11 tracks for it (direct-90 km 8.26, town-centre km 10.05: −11.6 / −10.2 M).

`scripts/straighten-audit.ts` (a gate) flips Auto's choice on all 27 skewed boxes / bridges over us of the D3
motorway, D11 straight, best and town-centre: 9 done, 18 said, none with any other new problem or a grade
change beyond 3 km (before: 0 done on the D3 motorway's four most skewed, two clashes). Why the 18 cannot be
straightened: 6 no room for the bends beside our earthworks, 4 the ground too steep even with 10 m of
earthworks, 3 another road joining the given-up stretch, 2 a house on the new line, 2 its ramps over another
road, 1 a box too low on the new line (D3 km 5.26: raised, its ramps then meet the class II road's reroute).
