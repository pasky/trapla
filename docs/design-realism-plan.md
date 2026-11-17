# Design realism: road costs, serpentines, earthworks, tunnel portals, bridge styles — plan

Owner (2026-11-16): "non-highway roads seem sus expensive, and i had trouble e.g. making serpentines in hills it
wouldn't really let me, i'm not sure if this is realistic, maybe norms allow to trade curvature or steepness for
localized speed limits for example? think about how to make huge terrain changes less mandatory (also a bit sus how
much huge terrain changes tunnel entrances usually require, is it 100% realistic?) .. also it'd be nice to be able
to choose a bridge (maybe also tunnel?) style e.g. cantilevered to trade number of pillars for cost".

Research (phase 1): research/46 (road costs, with the engine's own bills in §5), /47 (design speed, hairpins),
/48 (slopes, walls, 2018 grades and vertical curves), /49 (tunnel portals), /50 (bridge styles), /51 (tunnel
methods). Engine numbers: main `8ac09c5`, cost model 28, `scripts/road-cost-audit.ts`.

## Answers in short

1. **Road costs.** Hilly class I (D11, S 9.5) at 196–230 M CZK/km is inside the real range (37 ŘSD bypasses: hilly
   median ≈ 208 M/km at 2026 prices). The Nová Paka starter (337 M/km) is dear because its four-bend line demolishes
   480 M of buildings and pays 255 M of street works; a line along the real bypass bills ≈ 205 M/km, about the real
   project. But one plain km costs 20–26 % more than SPK's own build-up, mostly through an **unsourced
   high-earthworks reserve** (≈ 14 M/km on D11), plus a technology surcharge undivided roads do not get, the
   surcharge on crossing works (which SPK treats as surcharge-free B objects), and class III roads priced at the
   class II row.
2. **Serpentines.** Mostly realistic: ČSN 73 6101:2018 lets S 7.5–11.5 go down to 70 km/h (R ≥ 205 m), and a
   posted limit does not legitimise tighter curves. What the norm does allow and the game lacks: **steeper grades
   in mountainous terrain** (S 9.5 8 %, S 7.5 9 %, S 11.5 7.5 % against our flat 6 %), **smaller 2018 vertical
   curves** at 70/80 km/h, **design speed per stretch** (lowered 10–20 km/h where justified), and an **isolated
   sub-standard curve** kept with signs. Hairpins exist on Czech class I roads only as approved deviations
   (I/44 Červenohorské sedlo: R 17.5 m, S 9.5/60). Minor roads and tracks already allow R 25 / 12.5 m.
3. **Huge earthworks.** Our side slopes are too wide: one 1:2 fill slope with benches (official 2022 detail: 1:2.5
   at the toe, 1:1.5 above, no benches: −30 % slope area at 10 m, −46 % at 20 m) and 1:1.75 cuts even in sound
   rock (real: 4:1 with 1 m benches). Steeper mountain grades, smaller vertical curves, per-stretch speed and
   walls on side slopes let the line follow the ground.
4. **Tunnel entrances.** Not realistic: Auto ends tunnels in open cuts 12–34 m deep. Mining starting at ≈ 6 m of
   cover (our rule) is right, but real tunnels continue as **cut-and-cover** to where the cover is ≈ 0, built in a
   pit that is backfilled; the visible cut at the portal is ≈ one tunnel height (8–10 m).
5. **Bridge styles.** SPK has no span or system attribute; the trade the owner wants exists: at 40–80 m height
   45–60 m spans cost the same or 5–15 % less in our model and are what Czech designers build; long spans also
   clear roads, streams and railways without piers. Arches cost ≈ the same as a viaduct of the same height where
   the valley fits; cable-stayed ≈ 1.75–1.9×. Tunnels: SPK has mined and cut-and-cover rows (cut-and-cover
   +7.5 %); no TBM row (no Czech road case).

## What to implement (phase 2), in merge order

Every number below is in the research notes with its source and confidence; PROVISIONAL items stay labelled.

### M1 — Norms and cost corrections (one `COST_MODEL_VERSION` bump)

| Change | Where | Source / confidence |
|---|---|---|
| 2018 vertical curve minima: road crest 5,500 / 3,300 / 2,100, sag 2,700 / 2,100 / 1,500 m at 90 / 80 / 70; motorway crest 17,000 / 11,500 / 8,300, sag 6,000 / 5,000 / 4,000 | `data/norms.ts` | research/47 §1.1, /48 §3 (two scans of the 2018 table), medium-high |
| 2018 max gradient by category × terrain: S 11.5 6 / 7.5 %, S 9.5 6 / 8 %, S 7.5 7 / 9 % (hilly / mountainous) | `categories.ts` `maxGradient` | research/47 §1.1, high |
| Terrain class **per stretch from the DEM** (mountainous where the ground across the corridor is steeper than 15 %), deciding the gradient limit; price stays the NER row (the NEH +19 % has no stated content and our earthworks are billed explicitly) | new small module, grade solve reads a per-station max gradient | definition research/47 §1.1 (medium); price choice a stated game rule |
| Fill slopes: official broken profile (0–3 m 1:2.5; ≤ 6 m fills 1:1.5 above; higher 3–6 m 1:1.75, above 1:1.5), no fill benches | `sections.ts` | research/48 §1.1, high |
| Cut slopes by ground layer from the existing geology profiles: soil 1:2 (≤ 2 m) / 1:1.75, 1 m bench every 6 m; weathered rock 1:1.5 PROVISIONAL; sound rock 4:1 with 1 m benches every 5 m, rock-face mesh 2,513 CZK/m² | `sections.ts`, geology LUTs | research/48 §1.2–1.4, medium |
| Drop the unsourced high-earthworks reserve (35 / 20 CZK/m³/m) | `STRUCTURE_RULES` | research/48 §5, /46 §5. Re-run `bridge-break-even.ts`: the bridge/fill break-even rises; report it |
| Surcharge 29.4 % (rural) / 48.1 % (urban) for undivided roads; 30.6 / 49.3 % stays for motorways | `cost.ts` `surchargeRate` | SPK PZ p. 15, high |
| No surcharge on crossing works that SPK counts as B.7 (links, reroutes, relocated roads); overbridges keep it (A.2 bridges) | `cost.ts` | SPK PZ III.B, high |
| Legal class III roads at A.1.S3.7,5 rows (30.7 / 41.3 / urban 40.2 M/km) and a 15k m³/km allowance | `categories.ts` (class-dependent norm row) | SPK CSV + PZ p. 7, high |
| Retaining walls: the norm's free 100 m × 2 m per km credited | `cost.ts` | SPK PZ p. 6, medium |

Expected effect: D11 roads ≈ 8–12 % cheaper, tall fills and rock cuts visibly narrower. Touches the grade solve
(per-station gradient and curve limits) and the cross-sections: shared core. I will yield before landing M1's
grade-solve hunk if the P1 agent is mid-change there.

### M2 — Tunnels that start where real ones do, tunnel methods

*Done (cost model 34, 2026-11-17): PLAN.md "Tunnels as they are built". As planned, plus: the grade search's
tunnel mode (a deep stretch all tunnel or all open), streams over cut and cover, and a 30 m limit on the cut in
front of a tunnel the player paints. The player's cut and cover may have up to 13 m of cover (the Radejčín card in
TKP-D 7; 7.5 m was its backfill over the vault).*

- A tunnel run continues as **cut-and-cover** from where mining starts (cover ≥ 6 m) out to where the ground is one
  structure height above the grade (≈ 9 m: cover ≈ 0–1 m), at least 12 m per portal, priced at SPK A.3.H rows
  (+7.5 %), with the pit dug and **backfilled** (ground restored, land returned, drawn as ground over the tube, a
  short portal collar). The visible approach cut then ends ≈ 8–10 m deep. Auto sees the cost of the ends, so where a
  tunnel in a gentle hill is not worth its long ends it builds an open cut instead (honest: economic cut limit
  ≈ 30 m).
- **Tunnel method** on the tunnel card: *Mined* (default) / *Cut and cover* (also where the cover is too thin to
  mine, e.g. under a village or a protected surface: allowed with cover 0–7.5 m, the pit above 5 m billed as
  earthworks). No TBM (no Czech road case, no SPK row).
- **Escape route for one-tube tunnels over 500 m** (NV 264/2009): an escape gallery ≈ 1.3× the tube cost; two tubes
  above 10,000 veh/day/lane. Today a 2 km single tube has no escape provision.
- Minimum tunnel 150 → 100 m (TKP definition), if the outcome audit shows no churn.

### M3 — Bridge style per bridge

One choice on the bridge card, Auto picks the cheapest that fits, the player can override:

| Style (player word) | Spans | Cost | Drawn | Suits |
|---|---|---|---|---|
| **Short spans** (today) | ≤ 30–35 m | today's model | many slender piers, thin deck | low bridges, floodplains |
| **Long spans** | 45–60 m (to 150 m over obstacles) | today's model at that span; above 60 m capped at ≈ 1.0–1.2× the 30 m price when ≥ 40 m high | few tall piers, deeper haunched box | deep valleys; roads, streams, railways below without piers |
| **Arch** | arch 100–250 m + short approach spans | ≈ 1.0 × a viaduct of the same height | arch rib from the valley sides | narrow deep valleys whose width is 1.8–2.8× the arch span |
| *Cable-stayed* (later) | main span 100–150 m | ≈ 1.75–1.9× | one pylon, stays | rivers where no pier may stand (evidence: one bridge) |

Pier placement uses the style's span limit, so a bridge over a road, stream or railway gets a long span instead of
being rejected or crowding piers. Card: "Bridge style: Short spans · Long spans · Arch" with the price difference
of each. Evidence is thin for long spans (no Czech launched/cantilever outturn): the model's own span curve
carries it, labelled.

### M4 — Design speed per stretch, curves the norm tolerates, hairpins

- **Design speed per stretch**: select a stretch (map or profile, as for structure paint) → card "Design speed here:
  90 · 80 · 70". Radii, transitions and vertical curves follow the stretch; a change of at most 20 km/h at a time
  (PROVISIONAL, research/47 §2: no public length rule). **Travel time per stretch** (length / speed of the stretch).
- **One tighter curve kept with signs**: a single bend below the stretch's minimum stays legal as an *isolated
  curve* (2018 text); its speed (vm = √(127·R·(0.25 + p)), research/47 §5) counts in travel time; two such
  curves near each other are a violation asking to lower the stretch's speed. How far below the minimum is not
  public: PROVISIONAL floor (proposal: the next lower speed's radius).
- **Hairpin bend** (a bend's type, mountainous stretches only, at 70 km/h): R 17.5–25 m, neck curves ≥ 2 R, carriageway
  widened per the 2015 methodology (R 20 → 5.2 m per lane), drawn and billed, grade in the hairpin ≤ half the
  approach and the resultant slope ≤ 13 %, ≈ 25 km/h in travel time. On the card: "Hairpin — a departure from the
  road standard; Czech mountain roads have them with the road authority's approval (I/44 Červenohorské sedlo)."

## Decisions for the parent / owner

1. **Hairpins on S 7.5–11.5: valid with a "needs approval" note (game rule, proposed) or a violation?** The
   norm has none; I/44 is an approved deviation. Proposed: valid only on mountainous stretches at 70 km/h.
2. **Terrain class per stretch from the DEM, priced at the hilly row** (proposed), or keep one scenario-wide class?
3. **Drop the high-earthworks reserve outright** (proposed; nothing sources it) — this makes high fills cheaper and
   moves the bridge/embankment break-even up; real treatments (subgrade improvement on weak ground) only where the
   geology map calls for them.
4. **Tunnel ends forced to cut-and-cover to ≈ 0 cover** (proposed) versus only capping the portal face at ≈ 18–20 m.
5. **Bridge styles: Short / Long / Arch now, cable-stayed later?**
6. **Nová Paka starter**: its 2.23 bn is its route (buildings, streets). A starter along the real bypass needs the
   crossing fixes it currently fails (side roads under earthworks, ramps): leave to the scenario / P1 work, or
   should I take it?

Order proposed: M1 (largest bill change, unblocks the rest) → M2 → M3 → M4, each merged on its own with gates,
outcome-audit before/after and screenshots 210–239 (`docs/screenshots/`).

## M4 design (2026-11-16, after the parent's go: M1 → M4 → M2 → M3)

Sources: research/47 (design speed, hairpins), /48 §3 (2018 grades and radii).

**Data.** A bend may carry its own design speed (`PI.speed`, one of the category's speeds; absent: the road's)
and be a hairpin (`PI.hairpin`). A *stretch* is a run of consecutive bends with the same speed; where two
stretches meet, the change lies in the middle of the straight between their bends (PROVISIONAL: no public
rule on where the speed changes or how long a stretch must be; any step between 90, 80 and 70 is ≤ 20 km/h,
the practitioner reading in research/47 §2). Travel time is summed per cell at its stretch's speed.

**Horizontal geometry** (`horizontal.ts`): rules per bend instead of per road — the smallest radius,
transition length (= vn), transition-free radius and reverse straight of that bend's speed; a compound curve
joins only bends of one speed. Checks (`checks.ts`) judge each curve by its own stretch's norms.

**Vertical** (grade-solve hunk, separate commit, after rail-grade-locality): the crest / sag minimum of each
height point is that of its stretch's speed; the steepest grade per station is the category's for that
station's terrain class (mountainous where the ground across the corridor is steeper than 15 %, research/47
§1.1), lower in a hairpin. Until then the road's own speed gives the vertical radii everywhere (stricter,
never invalid).

**Hairpin** (bend type, a "točka"): only where the road turns almost back on itself (≥ 150°: "v točce se směr
trasy obrací téměř o 180°", MZe TD 2020 §7.7); a gentler bend is a case for a lower stretch speed. ČSN 73 6101:2000
§8.5.7 allowed hairpins as an exception on two-lane roads in mountain terrain; its table 12 sets 30 m at 8 %
banking for 30 km/h (research/54 §1; the 2018 edition has none; I/44's 17.5 m was a further approved departure).
Plain arc, no transition. Each lane widened to the swept path of a 16.5 m articulated lorry plus the safety
margin (VUT/HBH 2015: R 30 → 4.0 m + 0.75 m class I, 0.5 m class II/III), tapered 1:10, drawn and billed (extra
pavement, research/46 §3) and in the earthworks. Grade in the hairpin: resultant slope √(s² + p²) ≤ 10 % where
icing is frequent (2018 §8.10.1) with p = 8 % → s ≤ 6 %. Travel time: the table's speed (30 km/h at 30 m).
Validity (game rule, research/54 §5): where the ground around the hairpin is steep (predominant slope within
500 m over 15 %, even if the 10 km section is classed hilly), at the category's lowest speed, it is VALID with the
note "a departure from the road standard: needs the road authority's approval" (I/44 precedent); elsewhere a
violation the player may still choose.

**Terrain class** (research/54): the norm classes the natural ground slope of a region (2000 §8.2.2: hilly ≤ 15 %,
mountainous steeper), and designers class whole sections (D11 1106–1109, D49, I/13). The game: the median ground
slope within 500 m of each point, and a stretch's class from the running median of that over 10 km of the route
(the shortest window that classes every documented section in our packs as it was: all hilly; 5 km would call
4 km of D11 1109 mountainous, which the EIA did not). No pack covers a documented mountain road, so that side is
uncalibrated; the flat class (S 9.5 4.5 %, motorway 3 %) is not modelled. Consequence: in today's packs no
stretch is mountainous, so the 8 % grade never applies (hairpins follow the local-ground game rule above).

**Not in M4:** an isolated curve below 70 km/h radii other than a hairpin (the 2018 text allows one signed
isolated element but gives no lower bound), the 60 / 50 km/h rows of the older editions.

**UI.** The bend card gets "Design speed here: 90 · 80 · 70" (this bend's stretch; the Road card keeps the
whole-road speed) and "Hairpin" as a bend type with its note; the profile's curve band shows the stretch speeds;
the travel time on the card follows the stretches.

**Commits.** M4-1 per-bend rules and per-stretch travel time (horizontal, checks, evaluate, preview);
M4-2 the grade-solve hunk (per-station gradient and vertical radii, terrain class); M4-3 hairpin geometry,
widening, bill and drawing; M4-4 cards and words (terms.ts, player-text test).
