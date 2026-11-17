# Nová Paka small drags, the Štikov estakáda, tunnel rows and rock cover (cost model 37)

Snapshot 2026-11-17 (design-realism agent, after cost model 36). Four questions: why small drags of the Nová
Paka starter fail, why the real I/16 bridges the "Štikovská rokle", whether SPK puts its "other objects"
surcharge on tunnel rows, and whether a rock-cover factor on mined tunnels is sourced.

## 1. Nová Paka: small drags of the starter

`SCENARIO=i16-nova-paka npx tsx scripts/small-drag-audit.ts scripts/scenarios/i16-nova-paka/default.json --at <m> --n 24 --radius 25`
(24 seeded drags of the nearest bend by ≤ 25 m; `DUMP=dir` now writes each dragged design).

| Bend dragged | Model 36 invalid | Model 37 invalid | What is left |
|---|---:|---:|---|
| 3 (km 1.5) | 16 | 11 | 8 × "Bends 4 and 5 are too close for an S-bend" (5 of them also a stream tip, below); 3 × the street whose junction lies at our toe (below) |
| 6 (km 3.3) | 15 | 15 | all "Bends 4 and 5 / 5 and 6 are too close for an S-bend" |
| 8 (km 5.0) | 9 | 7 | 7 × "Bend 9 is too close to B" |

**What failed on model 36, by mechanism** (dumped designs, `scripts/_xing.ts`, `scripts/_map.ts`):
- *The class III road at km 1.84 (7 drags at all three bends).* Our road is 4.6 m in cut there and the class III
  road crosses over it on a bridge. A drag a kilometre away changes the grade solve, a bridge at km 2.2 needs its
  support lift, and the line comes up 5 m. Our road is then 0.9 m in cut, and the class III road's ramps would bury
  the road beside it ("The ramps … run over another road", "A road joining the ramps … cannot be raised or
  lowered"). A designer keeps our road down at such a crossing. The engine already had that retry (the separation
  retry: the grade asked to clear the road), but only for motorways. **Model 37:** every category gets it. An ordinary
  road meets the roads it crosses in junctions only 1.5 km apart, so a crossing between junctions is an overbridge
  like a motorway's. An overbridge whose ramps would bury a road beside it (WORKS_COVER_ROAD, WORKS_TIE_TOO_LONG)
  now counts among the stuck ones. Drag #0 at bend 3: invalid 1,381 M → VALID 1,305 M (our road 6 m in cut).
- *Dead-end side roads (4 drags).* A residential street, a local road and two tracks end inside our earthworks,
  with their other end at a junction a few metres outside. The engine rebuilds such a dead end with a turning area
  on its surviving part. There was no room for one before the junction, so the turning area went past the junction
  and severed the third road there ("it would cut off a side road"), or was not found at all ("no room for it").
  **Model 37:** a dead end with no room for a turning area before the first road it joins is cut back to that
  junction (its traffic turns there; what it led to lies under our road). A dead end whose *pavement* (not just its
  centreline) reaches into our slope now counts as one. Before, its fixed tie-in inside our slope failed with
  "tie-in inside the footprint". The cut-back is taken only where the whole stretch under our earthworks goes with
  it (review: otherwise pavement past the junction stays under our slope, unreported). That leaves the residential
  street at km 1.5 (3 drags): its junction with a service road lies at our toe, so 2.2 m of it past the junction is
  under the slope. The next step would be to rebuild it beside our slope and re-join the service road where the new
  street crosses it. Today the sever check asks for the old junction point.
- *A stream's head 1 m under our toe (5 drags, all also S-bend failures).* The culvert carries the stream under
  us. The 1 m of its head beyond the culvert's line is a separate hit with no cover and a "buried outlet". Left as
  is (engine limit): a stream that begins at our toe is taken by the toe ditch in reality.
- *Geometry (the rest).* The starter's radii are the mapped bypass's, hand-set (`r` on each bend). Three joints
  have almost no spare length: bends 4→5 2.7 m, 5→6 2.3 m, 9→B 0.9 m (`scripts/_slack.ts`). The real road is at the
  norm's limit there. Any drag that turns those bends a little more needs more length than there is, and a
  hand-set radius is not Auto's to change. The fix offered is concrete ("Set bend 4 back to auto (R 205 m) or to at
  most R 377 m"). Auto radii are the minimum (R 205 m at 70 km/h), so making the starter's radii Auto would lose the
  mapped geometry (1,073 M, 7.84 km). Options for the owner: (a) leave it, the player's drag of a bend with a set
  radius is an override; (b) a "mapped radius" that Auto lowers as little as needed to fit (a third radius state,
  horizontal.ts); (c) the editor lowers a set radius that a drag makes too large, with a note. Not done here.

Outcome audit (24 random D11 designs; random categories, so the separation retry now runs on the S-designs):
84 → 72 problems, 6 → 8 VALID, links > 1 km 17 → 18, ramps > 250 m 5 → 4 (random-3 and random-20 lose their
overbridge ramp and buried-road problems; random-3 (§2) and random-23 become VALID; random-6, VALID, gets a 278 m
junction ramp and a 1.07 km track link on its re-solved line).

## 2. random-3 and random-15 (outcome-audit regressions of model 35)

- **random-3** (S 9.5, `/tmp/random-3.json` from `scripts/_rand.ts`): "A long bridge span is too low … raise
  by 0.1 m" at km 13.43, five lift rounds without success. The lift targets are moved onto the traced line's
  points (blocks, model 25) and rounded 10 cm up. The station needing the height lay 4.8 m downhill of its target
  on a 5 % descent, so every lift met the target and missed the station by ≈ 0.25 m. **Model 37:** a moved target
  is raised by what the current line falls from the target to the station. random-3 is VALID (7,794 M). The
  frozen D11 fixtures move by 0 to +5.5 M (lines a few cm higher at bridges on grades).
- **random-15** (S 7.5): the track at the tunnel portal (km 5.45) is a member of the tunnel crossing of the same
  way (same-way merge). The split retry makes it a crossing of its own. Alone, that crossing has "No buildable
  reroute", no better than before, so the split was dropped. **Model 37:** the split is judged together with the
  separation retry, which lets the grade clear the way it splits off. That is now available to every category
  (§1), where before it ran only on motorways. random-15: the track at 5.45 is resolved and the 540 m tunnel becomes a
  12 m cutting with the track over it (6,701 → 5,137 M). Its only remaining problem is its category ("S 7.5 too
  narrow").

## 3. Why the real I/16 bridges the Štikov valley (SO 206, 423 m)

Research subagent ('smart'), sources read; my spot checks on the starter below.

- **No public document states the bridge-vs-embankment reasoning.** The estakáda is in ŘSD's 01/2009 leaflet
  from the DÚR design (SUDOP, zoning decision 2007; then 496 m). It was cut to 423.2 m in the DSP (2011–17), and
  every later document treats it as given: the EIA notification [HKK854](https://portal.cenia.cz/eiasea/detail/EIA_HKK854)
  (SUDOP, Jan 2017, 193 pp. + annexes) and the KÚ KHK screening decision
  [KUKHK-8687/ZP/2016-Po](https://www.munovapaka.cz/assets/File.ashx?id_org=10512&id_dokumenty=311429)
  (19 Apr 2017). The 1997/2000 EIA and the 2001 MŽP opinion are not online.
- **Ruled out by HKK854:**
  - No watercourse is crossed at km 4.28 (Tab. 8 lists only Studénka, SO 201, and a small stream at km 1.79).
  - No flood zone, no road or railway below.
  - No landslides: "V zájmovém území se nenacházejí sesuvy půdy".
  - No NATURA 2000, CHKO or registered VKP.
  - The landscape character is listed as an *impact* of the estakáda ("zjevné, nikoliv však neakceptovatelné"),
    not a reason for it.
  - Under it lie only farmland with scrub, a new retention pond (SO 313) and relocated utilities (gas DN150, 22 kV,
    O2).
- **A later lock-in.** A *local* biocorridor, LBK 3, crosses at km 4.4, under the bridge. The 2016 migration study
  (Kos) rates the estakáda "optimálním technickým řešením" while finding "Žádný výrazný migrační koridor".
  The screening decision made its bridge designs binding: "Ve studii navržená technická řešení je nezbytné dodržet
  v další fázi přípravy stavby". The ÚSES methodology needs no grade-separated crossing of a local corridor by a
  two-lane road (research/53), so this is a project condition, not a general rule.
- **The likely driver is the grade line** (inference, medium confidence). HKK854: "niveleta … je v místě mostu
  vedena ve výšce cca 28 m nad stávajícím terénem". The road climbs through the valley ("Trasa stoupá cca 5 m
  vysokým náspem … estakáda SO 206 o výšce cca 20 m. Následuje úsek vedený v cca 5 m hlubokém zářezu"). A fill
  25–28 m high and 423 m long is ≈ 0.3–0.4 M m³, while the design's earthworks were already balanced (487,060 m³
  of suitable cut against ≈ 500,071 m³ of fill) and the local soil needed lime treatment.
- **The starter** (spot check): Auto keeps our line at ≈ 460 m through the valley (ground 448 m, a 14 m
  embankment) and climbs at 6 % after it. With the grade pinned at 474 m at km 3.56 (≈ 25 m over the floor, as
  the real road), Auto builds a 180 m bridge 25 m high there itself (1,276 M, VALID, +55 M). So the
  structure choice agrees with the real one at the real height. The difference is the grade line: ours is lower, and
  in our prices filling the valley 14 m beats climbing earlier. **No general mechanism to add.**
- Bridge facts (HKK854, DSP): 8 spans 40 + 6 × 56.8 + 40 m, continuous prestressed box 3.0 m deep, deck 14.0 m,
  bored piles; cast span by span on movable scaffolding in 2024 (forum photo log). Our long-spans style (45–60 m
  equal spans) matches it.

## 4. The D35 tunnel gap: SPK's surcharge on tunnel rows, and rock cover

**(a) Does SPK put the "other objects" (B) surcharge on tunnel rows?** Yes. SPK CN 2026 Příloha 1 (PZ), II.g:
"hlavní stavební objekty … tj. na komunikace, mosty, tunely a mimoúrovňové křižovatky"; II.h: B objects "se
oceňují procentními sazbami z ceny hlavních stavebních objektů". The only exception named is rest areas (A.7),
"jejichž jednotkové ceny již obsahují ostatní objekty typu ‚B'". B.6 (technology, 1.2 % on motorways) says
"Tato kategorie se netýká technologického vybavení tunelů, které je zahrnuto ve standardu Tunely". That defines
what B.6 contains, not its base. The A.3 row also *excludes* exploratory galleries, operations buildings,
monitoring, extensive pre-portal works, ventilation shafts and the 12-month trial run. Those are priced extra,
which argues against a lower tunnel price. **Our surcharge on tunnels follows the method: no change.**

**(b) Rock cover / excavation class.** A research subagent ('smart') reported, with my review:
- SPK A.3: "pro ražené tunely je uvažována třída ražnosti TT4" throughout (PZ, A.3).
- D11 Poříčí / Opevnění (Stavebnictví 2023, research/49): TT 5a below 15 m of cover, TT 4 above 15 m, TT 3 above
  20 m.
- OTSKP 2026 (SFDI `otskp-2.zip`) excavation items, heading, CZK/m³:

  | Class | With explosives | Without explosives |
  |---|---:|---:|
  | TT 3 | 3,043.68 | 2,252.66 |
  | TT 4 | 3,766.00 | 3,067.48 |
  | TT 5A | – | 4,038.05 |

  Excavation alone: TT3 : TT4 = 0.73–0.81, TT5A : TT4 = 1.07–1.32.
- VL 5 (MD 2023) type sheets define each class's primary support.
- Derived by the subagent (assumptions: a 90 m² profile, a 24 m lined arch, girder weights, anchor counts for
  TT3 / TT4), against the whole SPK price, of which excavation and primary support are ≈ 29 %:
  - TT3: × 0.92–0.93 (up to 0.89 without blasting);
  - TT5a: × 1.08–1.12.
- Hessen Mobil Heft 52 (2006):
  - Its 100 % is a deep (> 20 m), good-rock, VKL 3–4 reference tunnel.
  - Abb. 4.1-1 gives 100–144 % for > 20 m of cover and 138–187 % for 10–20 m.
  - Those spreads are wider than the Czech bottom-up (an invert and another profile in poor ground).
- Lochkov's exploratory gallery was 50 % TT3, 30 % TT4, 20 % TT5. With 0.92 / 1.00 / 1.12 that mix averages
  0.98, so "TT4 throughout" is a fair average.

**Proposal (not implemented; a reviewed model change for the owner to decide):** a mined metre's price
× 0.92 under more than 20 m of cover, × 1.00 at 15–20 m, × 1.12 below 15 m (confidence medium-low / low-medium;
PROVISIONAL derivation from sourced unit prices). It needs the cover per station in the bill, the structure
choice and the grade search's tunnel mode (what is weighed is what is billed). On the D35 real-like line, whose
4 km tunnel lies mostly under deep cover, it would remove roughly 0.8–1.0 bn of the 3.3 bn gap (estimate: 2 ×
3.98 km × 1.43 M × 1.31 × ≈ 8 % × ≈ 85 % deep). Auto's own, shallower tunnels would come out dearer at their
portal stretches.

**(c) The research/63 split** stays as recorded there (an ŘSD estimate, our own non-tunnel price, a different
alignment).

## 5. After the owner's decisions (2026-11-17)

- Geometry: option (c), the editor lowers a set radius a drag leaves too large (`core/fit-radii.ts`); side roads:
  a crossed side road within 25 m of its old junction is re-joined there. The 24-drag table, as the editor drags:
  **6 / 0 / 0** invalid (bend 3: 4 × the stream's head under our toe, 2 × the residential street at km 1.5).
- Rock cover (§4b): not implemented. Only one Czech price book (OTSKP) prices excavation by class; the whole-price
  factor rests on assumed support quantities; Hessen's chart is a published cost-by-cover table but against a deep
  VKL 3–4 reference, and its spread (≈ 0.74) disagrees with the Czech derivation (≈ 0.82). Below the bar of two
  independent price points or a class-by-cover cost table on SPK's base.
