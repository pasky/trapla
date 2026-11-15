# Finite-segment road noise, walls from the cross-section (cost model 21)

Research and implementation: 2026-11-15. Extends research/11 (source, ground class, limits — unchanged)
and replaces research/09 §5's PROVISIONAL Maekawa surrogate. A compact planning calculation, **not an
acoustic study**. Code: `src/core/noise-field.ts` (the sum), `src/core/noise.ts` (decisions).

## 1. Sources (inspected)

1. EKOLA, *Výpočet hluku z automobilové dopravy, Manuál 2018, verze 2020* (MD, the edition of research/11),
   [PDF](https://md.gov.cz/getattachment/Dokumenty/Strategie/Hluk/Manual-2018/Zmeny-v-Manualu-2018/Manual_2018_aktual_2020.pdf.aspx):
   - §1.10.1.2 p.52, table 24 and appendix p.64: “Korekce Du … je dána velikostí úhlu α, pod kterým je
     sledovaný úsek komunikace viděn z posuzovaného místa”; Du = 10 log(180°/α) (table: 90° → 3.0 dB,
     10° → 12.6 dB).
   - §1.10.2 p.52–53: for a point outside a segment's band, split into sub-segments “s délkou podúseků
     nejvýše 10 m”, transform the point onto each sub-segment's transverse axis at its true distance from
     the sub-segment centre, “výsledná hodnota … jako energetický součet všech podúseků”.
   - §1.11 p.53, eq. 42–45: obstacle (“umělá překážka nebo přirozená konfigurace terénu”) insertion loss
     DB = 13.41 + 10.47 log(Z + 0.18) − 2.67 log²(Z + 0.18) for 0.1 ≤ Z ≤ 60 m, DB = 24 dB beyond;
     Z = path difference over the obstacle top; 4.1 dB at Z = 0 (the manual's Huygens note).
   - §1.11 p.54 a): for two-lane roads “se uvažuje zdroj hluku v ose komunikace ve výšce 1 m nad povrchem
     vozovky”; c): four-lane roads as two sources; d): “vliv délky překážky … pomocí korekce Du pro konečný
     úsek”; h): “délka protihlukové clony musí být alespoň dvojnásobkem kolmé vzdálenosti chráněného místa
     od protihlukové clony”.
   - §1.18–1.19 p.60, eq. 50: the levels of all road segments are energy-summed.
2. ŘSD, *TP 104 Zařízení pro snižování hluku pozemních komunikací*, 04/2024,
   [PDF](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_104_2024.pdf), §3.4 pp.13–14: walls “co nejblíže ke
   zdroji hluku”, outside the traffic space and the restraint system's working width; “V případě, že se
   vyskytnou překážky neumožňující umístění PHC co nejblíže k průjezdnému profilu, umístí se podle
   konkrétní situace na vrchol svahu nebo blíže k místu, které má odclonit.” Fig. 7b p.23: a wall on
   reinforced-concrete pads *in a cut*, standing on the cut's top with the 1:1.45 slope falling to the
   road. §4.2.2 p.24: on bridges, posts anchored into the cornice (“do říms mostů”).
3. DESÚ/ŘSD notice for a D6 wall replacement (2024), [PDF](https://www.pletenyujezd.cz/file/2706799) p.2:
   “Stěna se nachází na horní hraně zářezu. Výška stěny nad terénem je 2,0 m.” Replacement heights
   2.0–5.5 m. A project example, not a general rule.

## 2. What the game computes

- **Cells:** every station cell (≤ 10 m, §1.10.2) is a finite segment. Its level at a receiver is
  `Y − U(d) − Du(α) − DB`, energy-summed over **the whole road** (§1.19), day and night separately. `U` is
  research/11's calibrated hard-ground Uo with the slant extension, at the **perpendicular** distance d from
  the cell's own line; α is the true angle subtended by the cell. On a straight homogeneous road this is
  exactly the manual's in-band rule (U(d) + Du(α_total)) for any receiver.
- **Both forms of the manual, the larger per cell:** the manual's out-of-band transformation (§1.10.2: U at
  the distance to each sub-segment centre, α of a face-on sub-segment) depends on how the road is split
  into homogeneous segments: applied to every 10 m cell of a straight road it gives 0.4–0.9 dB *less* than
  the manual's own in-band result at 20–150 m (computed). The in-band form alone, on the other hand, is
  far lower for a cell seen end-on (a point just beyond a road end, outside a tight bend: up to 8 dB, found
  in review). So each cell outside its band counts the larger of the two. The transformed form can exceed
  the in-band one by more than 0.005 dB only where the cell's line passes within 12 m + 2·|dz − 0.5 m| of
  the point (scanned over segment lengths 5–320 m, distances, offsets and heights); only there is it computed.
  Tested beyond a road end and outside a 50 m bend.

### Cut-offs and approximations (each bounded or conservative)

| what | value | why it cannot under-state a level |
|---|---|---|
| road summed | all of it | no reach limit: a cut-off would only lose energy |
| screening reach | 3 km | cells beyond count **unscreened** (walls and edges ignored, never credited): over-states only |
| far cells | cells one by one within 160 m; beyond, straight 40 m chunks (4 cells) to 1 km and 320 m groups beyond, each cell keeping its own edge screening along the segment's ray (groups: every 8th cell's) and every walled cell its own wall | measured against the cell-by-cell sum on every storey of 7 saved designs (1,541): within 3 dB of the limit, at most 0.065 dB under and 0.078 dB over; anywhere, up to 0.20 dB either way, only at houses ≥ 6.7 dB under the limit beneath viaducts (no decision depends on them). Adversarial synthetic curve (2 % grade, cut / fill and walls alternating every 200 m): 0.11 dB (test asserts < 0.15) |
| houses assessed | all dwellings within the distance where an open straight road is 1 dB under the limit; beyond, up to R_b, those not excluded by the rigorous segment bound below whose open-road level (no walls, no cuts: an upper bound) comes within 0.5 dB of the limit | **segment bound:** a cell of length l whose centre is r away adds at most l·M/(π (r − l/2)²) of the reference energy, M = max over d and height of d·10^(−U/10) = 11.73 m (its angle α = atan((|a|+l/2)/d) − atan((|a|−l/2)/d) ≤ l·d/(d² + (|a| − l/2)²) ≤ l·d/(r − l/2)²); summed from segment bounding circles, any point of the house. **R_b (an assumption, stated):** along a road that recedes from the house on both sides of its nearest point and sweeps at most 360° around it (serpentines or repeated hairpins around one house would break it; the bound has ≈ 2× slack there: M = 11.73 against d·10^(−U/10) ≈ 5.3 at 400 m), Σ l/r² ≤ (2 + 2π)/R (ds ≤ \|dr\| + r\|dθ\|), so the whole road adds ≤ (2 + 2π)·M/(π R): R_b = (2 + 2π)/π · M · 10^(E/10) (E = the road's controlling excess at the reference distance) = 371 m at 9,000 veh/day and 90 km/h, 340 m at 80, 825 m at 20,000 / 90, 2.4 km at 40,000 / 130 (computed from the model on every evaluation). The open-road check's grouping error is ≤ 0.25 dB (measured, 488 points 100–300 m from five designs), below its 0.5 dB margin. A house nearest to a tunnel is assessed from the nearest portal station, never dropped |
| a house's automatic-wall window | starts ±150 m of route, **doubles while a wider one could change the choice**: a chosen wall reaching the window's edge, or a height that failed although the 5 m wall wherever one may stand beyond the window (what it takes away, F − F₅, bounds any wall there) could still make it suffice | so no reach limit ever decides a wall or a buyout; 150 m only sets where the search starts |
| numbers in U | hard ground below 8 m and beyond 1 km in closed form (8/r, 10^(−Uo(1000)/10)·1000/r: the manual's own continuations) | exact |
| numerical tables | U in 0.5 m steps (linear in energy), barrier loss in √Z steps of 0.005 | < 0.02 / 0.01 dB |

- **Screening per cell and side (§1.11):** the best single obstacle among the wall top, a cut's top edge
  and the crown / deck edge (a lower house beside an embankment or under a viaduct is screened by the
  road's own edge: “konfigurace terénu”). Path difference along the actual ray in the cell's vertical
  plane, source on the axis 1 m up (§1.11 a) for walls and cut edges. **Deviation, conservative:** the
  road's own crown / deck edge at road level is seen from the **near lane** (1.75 m towards the house, 1 m
  up): from the axis it sits near grazing, where the manual's 4.1 dB step at Z = 0 would credit it (review:
  4.3 dB from the axis against 0–5 dB per lane, 1.8 dB lane-averaged, for a house 30 m from an 8 m
  embankment). A receiver seeing over an obstacle gets nothing from it. Multiple-obstacle paths
  (§1.11 last paragraph) are not combined: the best single one counts (conservative). This replaces the
  500 Hz Maekawa expression with its invented −5 dB allowance and 13 dB cap (research/09 §5): finite wall
  ends are now computed rather than allowed for.
- **Receivers:** every storey (1.5 m above each floor) at the point 2 m in front of the façade nearest
  the road; the loudest storey decides.
- **Wall position (TP 104 §3.4, Fig. 7b; D6):** embankment / at grade: crown/2 + 1.5 m at road level
  (PROVISIONAL allowance, unchanged); bridge: the same on the deck's edge beam (cornice); cut: on the top
  edge of the cut (daylight point), never inside the slope; where the cut is shallower than the allowance,
  on the ground just beyond the crown. A wall at the slope foot would need the cut widened (excavation,
  land) — not modelled; the crest is TP 104's stated alternative and, with the source 1 m up on the axis,
  screens a house above the road better than a foot wall of the same height.
- **Automatic decisions:** houses over the limit (with cuts, edges and the player's walls) are handled
  loudest first. A house no 5 m wall can protect (the window widened as far as it could matter) is bought
  out (unchanged rule);
  otherwise, unless walls already built for other houses suffice, each automatic height 2 / 3 / 4 / 5 m
  grows one contiguous wall from its most useful cell until every storey is within the limit, extended to
  ≥ 2 × the house's distance from the wall (§1.11 h; replaces the PROVISIONAL 50 m margins), and the
  height adding the least wall area (measured along the wall line) wins; the minimum length counts only the
  wall actually standing (openings excluded). Walls step between heights along their length (no promotion of
  a whole run). 2 m is in the menu because it is used (D6); 5 m stays the automatic maximum (PROVISIONAL;
  player walls 2–6 m).
- **Bill = drawing:** billed length is the wall line's own length beside the axis (cut-top walls on curves
  and their jogs included), billed height above the wall's foot; the 3D panels, the plan and the section
  use the same per-station line and foot.
- **Sources for several roads:** `AcousticSource` is one physical carriageway (stable id, cells with their
  screening, Y by day and night, per-cell weight, mode road/rail, lane offset and barrier-source height).
  Receivers report day and night energy per storey per source (open ground and as built, with the receiver
  point), so a project sums roads at a house; splitting a route splits its cells and adds nothing (tested).
  A motorway is two directional sources (§1.11 c), a railway a source of its own mode (not yet computed).

## 3. Cost-model 19 → 21 fixture changes (d11 pack, same geometry)

Only `noiseWalls`, `noiseBuyouts` and their sums change; grades, structures, crossings, geometry hashes,
violations and validity are identical for all eleven fixtures (model 19 = main with crossing-links).
Step attribution (wall area m², noise buyouts in brackets), each column adding one change to the one
before, measured with temporary switches on the final code:

| fixture | model 19 | finite segments, cut-top walls, computed extent, no run promotion (Maekawa, 3–5 m, no road edges) | + crown / deck edges | + manual DB, axis source | + 2 m walls = model 21 | total Δ M CZK |
|---|---:|---:|---:|---:|---:|---:|
| straight | 25,955 (3) | 16,522 (3) | 10,624 (3) | 9,388 (1) | 7,888 (1) | −200.3 |
| best | 7,409 (1) | 3,600 (0) | 3,630 (0) | 3,540 (0) | 2,590 (0) | −80.7 |
| best-drag | 8,009 (0) | 4,072 (0) | 4,192 (0) | 3,510 (0) | 2,601 (0) | −54.1 |
| best-pin | 7,409 (1) | 4,110 (0) | 4,260 (0) | 4,020 (0) | 2,890 (0) | −77.7 |
| best-structures | 7,409 (1) | 3,600 (0) | 3,630 (0) | 3,540 (0) | 2,590 (0) | −80.7 |
| best-manual | 7,409 (1) | 3,600 (0) | 3,630 (0) | 3,540 (0) | 2,590 (0) | −80.6 |
| demo | 8,647 (2) | 4,372 (0) | 4,221 (0) | 3,830 (0) | 3,130 (0) | −168.1 |
| direct-80 | 20,215 (0) | 11,092 (1) | 9,623 (1) | 8,260 (1) | 7,345 (1) | −119.9 |
| direct-90 | 14,157 (0) | 6,671 (0) | 4,559 (0) | 4,329 (0) | 3,246 (0) | −109.1 |
| town-centre | 25,200 (0) | 18,311 (3) | 14,998 (2) | 13,177 (0) | 10,666 (0) | −145.3 |
| town-controls | 26,400 (0) | 19,544 (3) | 16,231 (2) | 14,410 (0) | 11,899 (0) | −145.0 |

Why each step lowers walls:
1. **Finite segments** (the largest step, −31…−53 %): the old model treated each station as a full
   infinite line along *its own tangent* and took the maximum. On a bend, distant stations' tangents cut
   through houses on the outside of the curve, so far-away stations demanded walls; and a station's wall
   requirement ignored that its neighbours' walls already screen most of the angle. Each wall then grew
   50 m margins and a whole run took its tallest piece. Now a house's wall reaches as far as its own
   angle of view needs (at least twice its distance). Buyouts move both ways: direct-80 gains one house,
   straight keeps one of three, demo and best lose theirs (their worst station was a tangent artefact or
   needed only a 13 dB-capped wall the manual's DB now credits).
2. **Crown / deck edges** (up to −36 %, most in the valley designs; best gains 1 % from the near-lane
   view): a house well below an embankment or viaduct does not see the traffic; the road's own edge screens
   it (manual §1.11, terrain configuration).
3. **Manual DB with the axis source** (−2…−16 %): the manual's empirical traffic barrier loss is ≈ 2–3 dB
   above the old Maekawa expression after its invented −5 dB allowance (e.g. 3 m wall, receiver 50 m away
   at 4.5 m: 11.9 vs 9.9 dB) and is not capped at 13 dB.
4. **2 m walls** (−10…−27 %): where 2 m suffices it is cheaper; Auto picks the height adding least area.

No route was re-optimised; all published designs stay VALID.

## 4. Limits

- Planning estimate; no reflections (manual DZ), vegetation, meteorology, building screening, multiple
  obstacle paths, or soft ground (hard class as research/11). The far-cell grouping, the near-lane view of
  the road's own edge and the R_b assumption are stated above.
- One receiver point per dwelling (nearest façade); a long block's far end is not assessed separately.
- Walls are one stretch per house decision, grown greedily; not a global optimum over all houses.
- A wall at the foot of a cut (widened cut) and earth bunds (TP 104 §4.1) are not offered.
