# Serpentines, hairpins and local design-speed reductions (2026-11-16)

Owner's question: *"I had trouble making serpentines in hills, the game wouldn't really let me. Is this
realistic? Maybe norms allow trading curvature or steepness for localized speed limits?"*

**Short answer.** Mostly realistic. Under ČSN 73 6101:2018 a new S 7.5 / S 9.5 / S 11.5 road may go down to
**70 km/h at most** (90 − 20), i.e. **R ≥ 205 m** at 6 % banking; a hairpin (R ≈ 15–25 m) is far outside that.
The 2018 norm has no hairpin clause and lowering the design speed does **not** buy a steeper gradient (the
gradient limit depends on category and terrain, not speed). Real Czech hairpins on class I roads exist
(I/44 Červenohorské sedlo, min R = 17.5 m) but were kept as a formally approved **deviation from the norm**
during a reconstruction, not designed to it. A posted speed limit does not legitimise sub-standard geometry;
the norm only lets one *isolated* sub-standard element stay without lowering the design speed, signed.
What the game is missing is (a) the mountainous-terrain gradients the 2018 norm does allow (8–9 %), and
(b) an explicit "deviation" / hairpin override the player can choose and pay for.

Confidence tags: **H** = read in the norm or a verbatim reproduction of its table; **M** = secondary source
quoting the norm (lecture, thesis, MZe guide) or a single source; **L** = indirect / foreign / inferred.

## 1. Design speeds, radii, gradients, vertical curves

### 1.1 ČSN 73 6101:2018 (current, in force 1 Oct 2018)

**Design speed by category (no terrain dependence).** S 11.5, S 9.5, S 7.5, S 6.5 → **90 km/h**; S 4.0 → 30.
"Návrhovou rychlost vn lze v odůvodněných případech snížit o 10 nebo 20 km/h, u kategorijního typu S 6,5
až o 30 km/h." So the floor is **70 km/h for S 7.5 / 9.5 / 11.5**, 60 for S 6.5, and 60 / 50 km/h are not
available to these categories. Radimský 2019 slide 4 (H); same text in the ČVUT lecture 12PPOK c-01 p. 1
(M) and reproduced as Tab. 6.5 + text in MZe *Technická doporučení pro projektování lesní dopravní sítě*
(Zlatuška ed., PDF 2020) pp. 28–29 (M). The 2018 preface lists "zvýšení návrhových rychlostí" and
"zrušení směrodatné rychlosti" as main changes (ČAS preview, nahledy.normy.biz/n.php?i=505692) (H).

**Min. horizontal radius** (2018 Tab., Radimský slide 6; identical scan in Šilhan 2021 Tab. 11 p. 43) (H):

| vn | 2.5 % | 4 % | 6 % | 7 % | 8 % | no banking needed |
|---:|---:|---:|---:|---:|---:|---:|
| 70 | 350 | 290 | **205** | – | – | 705 |
| 60 | 250 | 210 | **160** | 130 | – | 515 |
| 50 | 175 | 150 | **110** | 90 | – | 360 |
| 40 | 110 | 95 | 75 | 65 | 50 | 230 |
| 30 | 64 | 60 | 44 | 34 | **27** | 130 |

(60–30 rows serve S 6.5, S 4.0, ramps and reconstructions; footnote: radii must also give stopping sight.)

**Max. longitudinal gradient, % (2018: by category × terrain, not by speed)** — scan of the norm table in
Šilhan, *Studie obchvatu města Frýdlant*, ČVUT FD diploma thesis 2021, Tab. 8 p. 41, source "[11] ČSN 73
6101, 2018" (H for the values; the norm's own table number is 13 per Běťáková's ČVUT technical report p. 7):

| Category | flat | hilly | mountainous |
|---|---:|---:|---:|
| S 13.5, S 11.5 | 4.5 | 6 | **7.5** |
| S 9.5 | 4.5 | 6 | **8** |
| S 7.5 | 4.5 | 7 | **9** |
| S 6.5 | 7 | 8 | 9 |
| S 4.0 | 10 | 11 | 12 |
| D 27.5 | 3 | 4 | 4.5 (exceeding needs road-authority consent) |

Terrain classes as quoted by Šilhan p. 40: flat = steepest terrain slope ≤ 5 %, hilly ≤ 15 %, mountainous =
ridges/slopes steeper than 15 % (M; the thesis text has a typo "nepřevyšují").

**Resultant slope** (2018 §8.10.1): m = √(s² + p²) **≥ 1.0 % and ≤ 13 % (14 % justified); ≤ 10 % where
icing is frequent**. The old speed/terrain table of maximum resultant slopes was abolished. In curves with
s > 4 % the s/p combination must lie in the "vhodné" zone of Fig. 8, achieved by more banking (up to Tab. 9
maxima) or less gradient. Radimský slides 12–14 (H for text; Fig. 8 and Tab. 9 not public).

**Vertical curves, 2018** (Šilhan Tab. 9–10 pp. 41–42, scans; 90 km/h values independently 5,500 / 2,700 m in
Běťáková p. 4) (H/M):

| vn | 90 | 80 | 70 | 60 | 50 | 40 | 30 |
|---|---:|---:|---:|---:|---:|---:|---:|
| crest, min allowed (stopping) | 5,500 | 3,300 | 2,100 | 1,200 | 650 | 350 | 150 |
| crest, recommended for overtaking | 29,000 | 20,000 | 12,000 | 7,000 | 4,000 | – | – |
| sag, min allowed | 2,700 | 2,100 | 1,500 | 1,000 | 700 | 400 | 200 |
| sag, min recommended | 3,500 | 2,800 | 2,000 | 1,500 | 1,200 | 1,000 | 700 |

(Smaller radii allowed if stopping sight per Tab. 8 / annex A is proven.) **Note for the game:** these differ
from the older-edition values in `SPEED_NORMS` (crest 6,000 / 3,000 / 2,500, sag 3,400 / 2,100 / 1,500).

**Stopping sight Dz** (2018 values reproduced in MZe TD 2020 Tab. 6.7 p. 30; rows run to ±9 % gradient):
90 km/h 110–140 m, 70: 65–85 m, 60: 50–60 m, 50: 40–45 m, 30: 20 m (M).

**Lane widening in curves, 2018**: the norm has a widening table (Tab. 16 per Běťáková p. 7); Šilhan p. 63
applies "200 > R ≥ 170 → +0.30 m per 3.00 m lane" (M, table itself not seen).

### 1.2 Older editions (pre-2018)

**ČSN 73 6101:2004** (in force 1 Nov 2004 – 1 Oct 2018, amendments Z1, Z2; ČAS catalogue no. 69709). Keywords
include *točka*, *křivolakost*, *směrodatná rychlost*, *průměrná cestovní rychlost*; the 2004 preface calls
the introduction of směrodatná rychlost (v85) the "zásadní změna" (ČAS preview 69709) (H). Its Tab. 9 (design
speed and max gradient by category and terrain) is not public; Autodesk Civil 3D Country Kit CZ (2012 doc;
2023 doc pp. 76–77) ships check sets "ČSN 73 6101 – TAB. č. 9" named **S 7.5: 70 flat / 60 hilly
/ 50 mountainous; S 9.5: 80 / 70 / 60; S 11.5: 90 / 80 / 70** (M for the speed mapping; the gradient values
per set are not legible). Rule reported from a JČU thesis snippet: "rozdíl mezi návrhovou a směrodatnou
rychlostí nesmí být větší než 20 km/h" (L, snippet only, theses.cz/id/0fi6st).

**Pre-2004 edition** (VUT FAST *Aplikace ČSN 73 6101*, undated; no směrodatná rychlost, so ≤ 2000 edition) (H
as a reproduction of that edition):
- categories by road class (p. 6): class I S 11.5/80, 70, 60; class II S 9.5/80, 70, 60, exceptionally S
  7.5/70, 60, 50; class III S 9.5/80, 70, 60, S 7.5/70, 60, 50, S 6.5/60, 50.
- speed and max gradient by terrain (p. 10): **S 11.5/10.5/9.5: 80 → 4.5 %, 70 → 6 %, 60 → 7.5 %;
  S 7.5/6.5: 70 → 4.5 %, 60 → 7 %, 50 → 9 %** (flat / hilly / mountainous).
- radii (p. 18): 60 km/h 180 m at 6 % (170 m at 6.5 %); 50 km/h 125 m at 6 %, 110 m at 7 %.
- vertical (pp. 11–12): crest min 60: 1,500, 50: 1,000 m (recommended 2,500 / 1,500); sag min 1,000 / 700 m.
- max resultant slope (p. 14): S 9.5–11.5 7.5 % (flat/hilly), 8.5 % mountainous; S 7.5 / 6.5 8.5 % / 10 %.
- superelevation > 6 % not allowed in frequent-icing areas "s výjimkou toček" (p. 38): the only hairpin
  mention found in a ČSN 73 6101 text.
- widening (p. 9): only for R < 320 m: 0.15 m/lane at 320–250 … 0.40 m at 125–110 m; for smaller radii "v
  týchž hodnotách jako na větvích křižovatek podle ČSN 73 6102" (that table not found publicly).

## 2. Can the design speed vary along a road?

- **2018: yes, in justified cases, by 10 or 20 km/h** (slide 4). The decision "se provádí na základě rozboru
  konkrétních podmínek územních, klimatických, geologických a hydrogeologických, hodnoty a využití
  zemědělské půdy, … hustoty sítě …" (MZe TD 2020 p. 29, quoting the norm) (M). No public text gives a
  minimum length for a reduced-speed section or a maximum step between sections; a 2018-based thesis applies
  "snížena v rastru po 20 km/h" locally at junctions (Šilhan p. 40) (L, practitioner reading).
- **Isolated element:** "Pokud je v navrhovaném úseku silnice ojedinělý návrhový prvek (směrový oblouk,
  výškový oblouk atd.), který nevyhovuje na návrhovou rychlost, přičemž zbytek trasy na návrhovou rychlost
  vyhovuje, hodnota návrhové rychlosti se nesnižuje. Na nevyhovující prvek … se upozorní dopravním
  značením." (slide 4) (H). So one sub-standard curve may stay, signed (curve warning / limit); a *series* of
  them means a lower vn for the section, and only down to 70. How far below the vn minimum the isolated
  element may go is not stated publicly (UNVERIFIED).
- **Homogeneity (older edition):** category changes "pouze v nejnutnějších případech, např. … v horských
  oblastech", always resolved at a junction (VUT p. 6); the transition to minimum element values must be
  gradual ("přechod na minimální hodnotu návrhového prvku byl pozvolný", VUT p. 46) (H for that edition).
  TP 131 (2000) §4.4.2: "Návrhová kategorie komunikace se nemá měnit v průběhu silničního tahu" (H).
- **Consistency of neighbouring radii:** Czech norm text found only the compound-curve rule R2/R1 ≤ 2
  (VUT p. 17; already in the game). Safety research summarised in the CDV *Manuál bezpečnosti dvoupruhových
  silnic v extravilánu* (2012) p. 41: radius ratio < 0.8 of the following curve markedly raises accidents
  (Lippold 1997 "tulip"), straight → curve with R < ≈ 200 m is critical (M, research not a norm). RAL 2012
  §5.2.2 (DE): radius ratios in "good"/"useful" range (Fig. 12), radii reducible by ≤ 15 % only in justified
  exceptions with a good ratio (pp. 30–31) (H, foreign).
- **Posted limits (B 20a) do not legitimise geometry.** The 2018 text keeps vn and only *warns* about an
  isolated element; reduced vn needs a justified analysis, not a sign. RAL 2012 p. 18: "The planning speed is
  not identical to the permissible maximum speed … (speed limit)"; when radius ratios fall outside the useful
  range, warning signs plus a check "whether a restriction of the permissible maximum speed is required"
  (p. 31) — the limit is an accompanying measure, not a licence (H, foreign). Real case: I/44
  Červenohorské sedlo – jih (S 9.5/60, opened 2017) kept "malé poloměry toček a některých směrových oblouků"
  and missing climbing lanes only after "bylo požádáno o souhlas s odchylným řešením od ČSN 73 6101. Tento
  souhlas byl vydán." (TVstav, 16 Oct 2017) (H for the project). 2018 also added a *Rekonstrukce* chapter:
  existing elements may be kept subject to an accident analysis; min resultant slope 0.5 % and stopping sight
  must be met (slide 17) (H).

## 3. Hairpins (točky, vlásenky, serpentiny)

**Czech road norm:** no hairpin section in ČSN 73 6101:2018 (TOC in the ČAS preview: 8.2 návrhová rychlost
… 8.18 prostorové řešení, 9.3 rozšíření; nothing on točky) (M, TOC only). The 2004 edition lists *točka* as a
keyword (content not public, UNVERIFIED); the pre-2004 edition mentions točky only as the exception to the
6 % banking cap (VUT p. 38). TP 131 (2000) Tab. 10 rates existing radii (S 7.5 "IV b" < 70 m, S 9.5 < 80 m)
"vyjma toček v horském území" (p. 22, footnote 17) — hairpins on mountain roads are explicitly left out of
the defect rating (H).

**Forest roads** (MZe TD 2020 §7.7 pp. 82–84, after Makovník 1973) (M): "současná ČSN 73 6108 neobsahuje
o točkách žádné informace"; new forest roads usually avoid them. A correct točka = hairpin arc **R ≥ 15 m**
(ČSN 73 6108) + two neck reverse curves with **R ≥ 2 × hairpin radius** + two intermediate straights
(**≈ 20 m** recommended, may be dropped when cramped); banking toward the centre "obvykle 6 %"; gradient
raised slightly before the hairpin, **reduced to the recommended value inside it**, and a flatter stretch
after it. ČSN 73 6108 final draft: paved forest roads min R 25 m at 30 km/h, 15 m at 20/15 km/h ("pro jízdní
soupravu … 21 m. Nižší hodnotu nelze navrhnout", Tab. 4 §7.5.4) (H for the draft); one-lane widening Tab. 8
(§8.4, R < 160 m): **R 15 → +4.7 m, 20 → 3.3, 30 → 2.0, 40 → 1.4, 50 → 1.0, 60 → 0.8, 80 → 0.5,
100 → 0.3 m** (3.0 m lane, forest design vehicle), run-in 1:10.

**Widening for two-lane roads in tight curves** — VUT/HBH *Metodika pro rozšíření jízdních pruhů ve
směrových obloucích …* (Brno 2015, TA ČR project, ISBN 978-80-214-5308-1) (M; methodology, not the norm):
lane width a_R = a_VK + b_OVK; design vehicle NS (16.5 m articulated) for class I–III; safety margin b_OVK
**0.75 m class I, 0.50 m class II/III** (0.75 at > 1,000 HGV/day; halvable in justified cases), Tab. 2–3
p. 7–9. Swept width a_VK for NS at α = 90° (Tab. 5 p. 11; values saturate by 90° for R ≥ 20 m): **R 15 m →
5.30 m, 20 → 4.70, 25 → 4.30, 30 → 4.00, 40 → 3.60, 50 → 3.40 m** (R in the lane axis). So a class II hairpin
with R_lane = 20 m needs 4.70 + 0.50 = **5.2 m per lane** (+2.2 m over 3.0 m). ČSN 73 6110:2006 Tab. 5 p. 25
(local roads, reconstructions): 3.00 m lane +0.80 m at R 50, +1.05 m at R 30 (H).

**Czech example:** I/44 Červenohorské sedlo – jih (TVstav 2017) (H): category **S 9.5/60**, hairpins **min
R = 17.5 m**, **max banking 7.5 % in the hairpins**, mean gradient > 5 %, max **7.15 %**, widened "v
točkách" mostly into the cut, approved deviation from ČSN 73 6101 (see §2). North part: 8.93 km, "upravily se
směrové oblouky a točky" (OPD project page) (M).

**Foreign references** (all L/M; listed for comparison, not for Czech compliance):
- Switzerland SN 640 198a "Kurven, Kehren" (via Ciampa et al., *Infrastructures* 7(9):112, 2022): hairpins
  dimensioned by swept paths, not dynamics; "lacet" with 2 × 2.85 m lanes, inner radius **6.05 m**, spacing of
  entry/exit lanes D = 5 / 13 / 19 m; hairpins driven at < 20 km/h; transitions (clothoids) not used, banking
  run-off ≥ 15 m.
- France, Cerema *ARP* 2022 ch. 6 pp. 90–92: lane width 3.50 + 25/R (R 50–200 m), **3.50 + 30/R** (R < 50 m,
  inner radius); hairpin inner radius ≥ 6.5 m on an 8 m carriageway if HGVs may use the whole width, 11 m
  (semi-trailer) / 13.5 m (coach) on 6 m; hairpin gradient "si possible < 5 % sur le bord interne, éventuellement
  jusqu'à 8 à 10 % si le trafic lourd est peu important"; new-road max gradient 8 % (snow) / 10 %.
- Germany: RAL 2012 has no hairpin rule; EKL 4 max gradient 8 %, resultant ≤ 10 % when exceeded (Tab. 14
  p. 35). Textbook Wolf, *Straßenplanung* 2005 p. 197 (via de.wikipedia "Serpentine"): R ≈ 12.5 m in the
  hairpin (inner 5.30 m = EU turning ring), **gradient in the hairpin half that between hairpins**, short
  counter-curves at both ends.
- Austria RVS 03.03.23 (2014): paid, no hairpin values found (UNVERIFIED).

## 4. Gradient vs curvature

- 2018: lowering vn does **not** raise the gradient limit (category × terrain table, §1.1). The trade-offs
  in the norm are: s/p compatibility in curves with s > 4 % (Fig. 8; more banking or less gradient), and
  resultant slope ≤ 13 % (14 %), ≤ 10 % with frequent icing (H).
- Absolute maxima for class I/II/III in mountainous terrain, 2018: **S 11.5 7.5 %, S 9.5 8 %, S 7.5 9 %, S 6.5
  9 %, S 4.0 12 %**; only the D rows carry an "exceeding needs road-authority consent" footnote (H). Higher
  values = deviation (odchylné řešení) like I/44.
- In a hairpin the inner edge climbs the same height over a shorter path: s_inner = s_axis · R_axis /
  R_inner (geometry). With R_axis 20 m and a 10.4 m widened carriageway, R_inner ≈ 14.8 m → ×1.35; keeping the
  inner edge at the French 5 % means s_axis ≤ 3.7 %, consistent with Wolf's "half" and the forest guide's
  "reduce in the hairpin" (derived, L).
- Resultant slope in a hairpin: p = 7.5 % (I/44) and s = 9 % → m = 11.7 % (≤ 13 % ok); with the 10 % icing
  cap s ≤ 6.6 % (derived from §8.10.1).

## 5. Travel time on a short low-speed stretch

- TP 188 (2018) evaluates two-lane rural roads by **capacity / level of service only**: sub-sections of
  **≥ 300 m**, climb class 1–5 from the design slow vehicle's speed (> 70 … < 30 km/h, Tab. 4-11) and total
  curviness K [grad/km] = Σγ / L plus a no-overtaking surcharge (Tab. 4-12); width factors S 9.5 0.85,
  S 7.5 0.60 (§4.4.2–4.4.3 pp. 26–28) (H). It gives **no travel speed or time** for two-lane roads. For
  motorways (§4.2.3 p. 22) a B 20a limit below vn is treated as vn = limit (H).
- 2018 **mezní rychlost** (attainable speed) for assessing existing curves: vm = √(127 · R · (f + 0.01 p))
  (slide 5, "podle ČSN 73 6102"); MZe TD 2020 p. 29 uses **f = 0.25** (M). Examples: hairpin R 17.5 m, p 7.5 %
  → 27 km/h; R 15 m, p 6 % → 24 km/h; R 205 m, p 6 % → 90 km/h (so vm is an upper bound, above vn).
- Older ČSN 73 6101 "požadovaná jízdní rychlost" minima as quoted in TP 131 Tab. 4 p. 9: two-lane class I
  50 km/h (40 in extreme conditions incl. mountains), class II 45 (40–30), class III 40 (40–30) (M, old
  edition; a route-average floor, not a per-curve rule).
- No Czech method found that charges per-stretch travel time; the 2004 annex A used "průměrná cestovní
  rychlost" (keyword only, UNVERIFIED).

## 6. Game implications

Today the game offers 90 / 80 / 70 for S rows (correct for 2018) but one 6 % gradient everywhere (older hilly
S 9.5 value) and older vertical radii.

| # | Option / change | Values | Confidence |
|---|---|---|---|
| 1 | Use the 2018 gradient table by category and the scenario's terrain class (already `TerrainClass` for prices) | S 7.5 7 / **9 %**, S 9.5 6 / **8 %**, S 11.5 6 / **7.5 %** (hilly / mountainous) | H (scan of the norm table) |
| 2 | Replace the vertical radii with the 2018 rows | crest 5,500 / 3,300 / 2,100, sag 2,700 / 2,100 / 1,500 at 90 / 80 / 70 | H/M (scan + 2nd source at 90) |
| 3 | Per-stretch design speed: let the player pick 90 / 80 / 70 per stretch instead of per road (reason "justified": terrain) | radii 355 / 280 / 205 m; transition L = vn; change gradual; no public min length → PROVISIONAL ≥ one curve + its transitions | M (rule H, section rules unsourced) |
| 4 | Isolated tighter curve without lowering vn, flagged and signed | one element below vn minimum, warning signs; how far below: UNVERIFIED → violation "isolated curve below design speed" (norm basis), not silent | H text / L extent |
| 5 | No 60 / 50 km/h for S 7.5–11.5 under 2018; offer them only as "older norm / deviation" | pre-2004: 60 → R 180 m (6 %), 50 → R 125 / 110 m (6 / 7 %), crest 1,500 / 1,000, sag 1,000 / 700, max gradient S 9.5 7.5 %, S 7.5 9 % | H (old edition) |
| 6 | **Hairpin (točka) as an explicit deviation** the player places; always shown as a deviation needing approval | R_axis ≥ 17.5 m (I/44 precedent; 15 m forest-road floor), banking 6–7.5 % toward the centre, neck curves R ≥ 2 × R_hairpin, ≈ 20 m straights between, no transitions, gradient in the hairpin ≤ ½ of the approach and resultant ≤ 13 % (≤ 10 % icing) | M (I/44, forest guide), L (½ rule) |
| 7 | Hairpin widening drawn and billed | per lane a_VK(NS) + b_OVK: R 15 → 5.8 m, 20 → 5.2, 25 → 4.8, 30 → 4.5 m (class II, b = 0.50); class I +0.25 m | M (2015 methodology) |
| 8 | Charge travel time per stretch at min(vn of the stretch, vm of each curve) | vm = √(127 R (0.25 + 0.01 p)); hairpin ≈ 25 km/h | M (formula), L (use for time) |
| 9 | Posted limit is never a fix for geometry; it may only accompany an isolated element or a deviation | — | H (2018 text, RAL) |

Not found / UNVERIFIED: the 2018 widening table and Tab. 9 maximum banking; any 2018 rule on length of a
reduced-speed section or step between sections; ČSN 73 6102 widening for R < 110 m; Swiss / Austrian hairpin
gradient limits; the 2004 Tab. 9 gradient values.

## Sources

- Radimský, *Revize ČSN 73 6101*, 28 May 2019, slides 4–6, 12–15, 17:
  https://konference-projektovani.cz/wp-content/uploads/2022/03/9.pdf
- Šilhan, *Studie obchvatu města Frýdlant*, ČVUT FD DP 2021, pp. 40–43 (Tab. 7–11 = ČSN 73 6101:2018 scans):
  https://projects.fd.cvut.cz/k612x1ps/soubory/F6-DP-2021-Silhan-Matej-diplomova-prace.pdf
- Běťáková, technical report I/2 relocation (ČVUT), pp. 4–7: https://dspace.cvut.cz/bitstreams/5e745acf-9c7e-4bdc-ab14-afafdb5c432e/download
- ČVUT K612, 12PPOK cvičení 01, p. 1: https://k612.fd.cvut.cz/predmety/12ppok/cviceni/vyklad/12ppok-c-01.pdf
- ČAS previews: 2018 https://nahledy.normy.biz/n.php?i=505692 ; 2004 http://csnonlinefirmy.agentura-cas.cz/html_nahledy/73/69709/69709_nahled.htm ; catalogue https://seznamcsn.agentura-cas.cz/Detailnormy.aspx?k=69709
- VUT FAST, *Aplikace ČSN 73 6101* (pre-2004 edition), pp. 6–18, 38, 46: https://www.fce.vutbr.cz/pko/sad/pdf/aplikace.pdf
- Autodesk Civil 3D Country Kit CZ documentation (2012, 2023): http://images.autodesk.com/adsk/files/C3D_CONTENT_Czech_DOC.pdf ; https://damassets.autodesk.net/content/dam/autodesk/external-assets/support-articles/civil3d-country-kits/pdfs/country-kit-documentation-2023-cz.pdf
- MZe / ČZU, *Technická doporučení pro projektování lesní dopravní sítě* (Zlatuška ed., 2020), pp. 28–30, 82–84:
  https://mze.gov.cz/public/web/file/658791/Technicka_doporuceni_projektovani_lesni_dopravni_site_A4_WEB.pdf
- ČSN 73 6108 final draft, §7.5, §8.4: https://www.cmadz.cz/aktuality/files/1458303301_CSN_73_6108_-_konecny_navrh_4_s_prijatymi_upravami.pdf
- VUT / HBH, *Metodika pro rozšíření jízdních pruhů ve směrových obloucích …*, 2015, pp. 7–11: https://www.apko.cz/public/downloaditem/Metodika%20pro%20roz%C5%A1%C3%AD%C5%99en%C3%AD%20j%C3%ADzdn%C3%ADch%20pruh%C5%AF%20ve%20sm%C4%9Brov%C3%BDch%20oblouc%C3%ADch%20a%20aplikaci%20vle%C4%8Dn%C3%BDch%20k%C5%99ivek%20vozidel.pdf
- ČSN 73 6110:2006 Tab. 5 p. 25: https://unmz.gov.cz/files/normalizace/%C4%8CSN%2073%206110/74506.pdf
- TP 131 (2000), Tab. 2–4 p. 9, Tab. 10–14 p. 22: https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_131.pdf
- TP 188 (2018), §4.2.3, §4.4: https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_188_2018.pdf
- CDV, *Manuál bezpečnosti dvoupruhových pozemních komunikací v extravilánu* (2012), pp. 38–41: https://www.audit-bezpecnosti.cz/media/file/manual-bezpecnosti-dvoupruhovych-silnic-v-extravilanu-2012.pdf
- TVstav, *Projekt a stavba silnice I/44 Červenohorské sedlo – jih*, 16 Oct 2017: https://tvstav.cz/clanek/4716-silnice-i-44-cervenohorske-sedlo-jih ; OPD project page (north): http://opd1.opd.cz/Modules/OpdProject/Pages/Project.aspx?id=130
- FGSV RAL 2012 (English 2024), pp. 18, 30–31, 35: https://www.fgsv-verlag.de/pub/media/pdf/201_E.v.pdf
- Cerema, *Aménagement des routes principales* (2022), ch. 6 pp. 90–92 (Québec copy): http://www.bv.transports.gouv.qc.ca/mono/1324957.pdf
- Ciampa et al., *Methodological Proposal for Hairpin Bend Design/Retrofitting*, Infrastructures 2022, 7(9), 112: https://www.mdpi.com/2412-3811/7/9/112
- de.wikipedia "Serpentine" (citing Wolf, *Straßenplanung*, 2005, p. 197): https://de.wikipedia.org/wiki/Serpentine
