# Traffic Y → minimum category: TP 188 capacity derivation

This memo replaces the placeholder thresholds `S 7.5 < 5,000 ≤ S 9.5 < 12,000 ≤ S 11.5` in
`src/core/data/scenario.ts`. Research/12 §1 found that ČSN 73 6101 has no AADT → category table. A category
is adequate if its section meets the required level of service (LOS, Czech *UKD*) under TP 188. This memo
therefore uses that check backwards: for each category, it finds the largest design-year AADT that still
passes. Reproducible arithmetic and transcribed tables:
`research/data/tp188_category_capacity.py` (`uv run research/data/tp188_category_capacity.py`).

## Sources read

| Document | Where | Used for |
|---|---|---|
| **TP 188** (2018) *Posuzování kapacity křižovatek a úseků pozemních komunikací* | [PDF](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_188_2018.pdf) | §3.2.2, §4.1.2, §4.4, tabs. 4-13/14/15, tab. 4-2, examples 1–2 |
| TP 188 amendment no. 1 (June 2024) | [PDF](https://www.edip.cz/files/vyzkum/katurok/tp-188-dodatek-c1-2024.pdf) | checked: changes only roundabouts (turbo), merge lanes and protocols; ch. 4 unchanged |
| **TP 189** (2018) *Stanovení intenzit dopravy na pozemních komunikacích* | [PDF](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_189_2018_final.pdf) | §4.2: design hour definition; tab. 6: AADT → design-hour factor |
| TP 225 (2018) *Prognóza intenzit automobilové dopravy* | [PDF](https://pjpk.rsd.cz/data/USR_001_2_8_TP/TP_225_2018__2_.pdf) | growth coefficients only; has **no** design-hour, directional or heavy-share factors |
| TP 188 presentation (EDIP, 28 May 2019) | [PDF](https://konference-projektovani.cz/wp-content/uploads/2022/03/10.pdf) | slide 5: required LOS per ČSN 73 6101; slides 7–8: design year / design hour |
| ČSN 73 6101 revision presentation (Radimský, 28 May 2019) | [PDF](https://konference-projektovani.cz/wp-content/uploads/2022/03/9.pdf) | slide 11: overtaking provision above 10,000 veh/day |
| ŘSD census CSD 2025, full table | [xlsx](https://www.rsd.cz/documents/38144/3734982/V2_CSD_2025_20260826.xlsx/5a2163ce-1bcc-6264-8251-98e4dd34a9ec?t=1788264442427) (via [rsd.cz](https://www.rsd.cz/silnice-a-dalnice/scitani-dopravy)) | local heavy-vehicle shares and an empirical check of the design-hour factor |

ČSN 73 6101 itself is paid. Its LOS requirement (ch. 6) is taken from the TP 188 presentation and from the TP 188
worked example. TP 188 §3.1 (p. 17) defers to ČSN 73 6101 ch. 6 for section requirements.

## 1. What is checked

- **Criterion for two-lane rural roads** (TP 188 §3.2.2, §4.1.2, pp. 17–20): the section passes if the design
  traffic is no higher than the LOS-volume threshold for the required LOS: *I ≤ C_u*. *I* is in veh/h and is the
  **sum of both directions** (§4.4.1, p. 26). The road is split into subsections of at least 300 m. Every
  subsection must reach at least LOS E. A length-weighted harmonic mean of LOS scores (eq. 4-1, tab. 4-1,
  pp. 20–21) must meet the required LOS. LOS A/B are not evaluated for two-lane roads (§4.4.4, p. 28).
- **Required LOS** (ČSN 73 6101 per the 2019 TP 188 presentation, slide 5): motorway C; **class I road
  “C to D”**; class II D; class III E. The TP 188 two-lane worked example, an I/27 bypass at Třemošná
  (tab. 15-3, p. 95), sets *UKD_lim = C* for “silnice I. třídy”. The motorway example (tab. 15-1, p. 92) uses
  *C*, *a_v,lim = 0.75*. Public sources do not say when D is acceptable for class I. **This memo uses C**, the
  value applied in the official example, and gives LOS D for comparison.
- **Design traffic** (TP 188 §2.2, p. 16; presentation slides 7–8): forecast traffic in the **20th year after
  opening**. For rural roads, the design hour is the **50th-highest hour**. TP 188 sends forecasting to TP 225;
  TP 225 only provides growth coefficients by region and vehicle group. The hour factor is in **TP 189 §4.2.1,
  eq. 16, tab. 6 (p. 22)**: *I₅₀ = AADT × k*. *k* is **0.103** for class I roads (“E, I”) and 0.096 for D-I
  motorways. Two-lane roads need no directional split. In this game, **Y is the design-year AADT**.
- **Cross-section** (TP 188 §4.4.3, p. 28): the tables are valid for **S 11.5**. Multiply by **0.85 for S 9.5**
  and **0.60 for S 7.5**.

## 2. Inputs for “typical hilly terrain”

TP 188 two-lane tables (4-13 LOS C, 4-14 LOS D, 4-15 capacity; pp. 28–30) depend on three inputs:

- **Climb class 1–5** (tab. 4-11, p. 26): mean speed of the design slow vehicle (ČSN 73 6101 annex K, paid).
  Class 1 is > 70 km/h, 2 is 55–70, 3 is 40–55 and 4 is 30–40 km/h. The scenario climbs from Trutnov
  (≈ 400 m a.s.l.) to the border with grades up to 6 %. **Class 2** is used as the route-wide representative:
  most subsections are class 1–2, while a few long climbs are class 3–4. The weighted result is near 2.
- **Total curviness** (eq. 4-2, tab. 4-12, p. 27): angular change per km, in grad/km, plus 5 × the
  no-overtaking share in %, up to 30 %. A new 90 km/h alignment with 355–1,160 m radii and roughly
  10–20 % no-overtaking length gives about 75–150. The TP 188 I/27 example has 29 + 12 % → 89 on its main
  subsection. **75–150** is used.
- **Slow-vehicle share *a_pv*** (eq. 2-2, p. 16): trucks > 3.5 t plus buses. The CSD 2025 table gives these
  heavy-vehicle (TV) shares for the scenario's corridor:

  | Section (CSD 2025) | AADT | TV | share |
  |---|---:|---:|---:|
  | I/16 5-3470 Trutnov k.z. → zaús. 300 | 4,283 | 511 | 11.9 % |
  | I/16 5-1180 zaús. 300 → PL border (Královec) | 3,205 | 493 | 15.4 % |
  | I/14 5-0901 vyús. z 16 → Trutnov k.z. | 10,028 | 1,087 | 10.8 % |
  | I/14 5-0979 okr. hranice → Vrchlabí | 8,454 | 491 | 5.8 % |
  | all 1,218 rural class I census sections (median, p10–p90) | | | 11.3 % (6.8–19.9 %) |

  The new road would carry the transit traffic of the D11/S3 link, so its share should exceed today's
  I/16 share. **15 %** is used, with 10/20 % shown as sensitivity. CSD 2025 defines TV as LN (3.5–7.5 t) + SN + SNP + TN +
  TNP + NSN + buses + special vehicles. This matches TP 188's “slow vehicle” definition, trucks > 3.5 t plus
  buses (§1.8 (23), p. 9). The TP 188 columns are flat in this range: 1,200 → 1,195 from 15 to 20 %.
- **Hour-factor check:** the census table also publishes the 50th-hour volume `I50_SV`. On all rural class I
  sections, I50/AADT has median **0.102** (p10–p90 0.090–0.114), which matches TP 189's 0.103. Motorways have
  median 0.094; TP 189 uses 0.096.

## 3. Result

Representative case: climb class 2, total curviness 75–150 grad/km, slow vehicles 15 %.
TP 188 tab. 4-13 gives **C_u(LOS C) = 1,200 veh/h**, and tab. 4-14 gives C_u(LOS D) = 1,645 veh/h, both for
S 11.5.

**Max AADT = C_u × width coefficient ÷ 0.103**

| Category | LOS C volume [veh/h] | **max AADT, LOS C** (game) | max AADT, LOS D (comparison) |
|---|---:|---:|---:|
| S 7.5 (× 0.60) | 720 | **6,990** | 9,582 |
| S 9.5 (× 0.85) | 1,020 | **9,902** | 13,575 |
| S 11.5 (× 1.00) | 1,200 | **11,650** | 15,970 |

Values are rounded down to whole vehicles, as in the code.

The game rule is that each category is adequate while Y is no higher than its LOS C limit. Above 11,650,
no playable two-lane category reaches LOS C. Real practice would add passing lanes (2+1) or consider a
four-lane road; see §4.

### Sensitivity (LOS C, max AADT for S 7.5 / S 9.5 / S 11.5, *a_pv* = 15 %)

| climb class \ curviness | 0–75 | 75–150 | 150–225 |
|---|---|---|---|
| 1 (flat / rolling) | 8,126 / 11,512 / 13,543 | 7,135 / 10,109 / 11,893 | 6,669 / 9,449 / 11,116 |
| **2 (hilly)** | 7,718 / 10,934 / 12,864 | **6,990 / 9,902 / 11,650** | 6,611 / 9,366 / 11,019 |
| 3 | 7,077 / 10,026 / 11,796 | 6,524 / 9,242 / 10,873 | 6,203 / 8,788 / 10,339 |
| 4 (long steep climbs) | 6,349 / 8,995 / 10,582 | 5,883 / 8,334 / 9,805 | 5,592 / 7,922 / 9,320 |

Changing *a_pv* from 10 % to 20 % moves values by about 1–2 %; the script prints those columns. Climb class
and curviness matter much more.

## 4. Four-lane row (D 27.5, disabled in v1)

TP 188 §4.2 (pp. 21–23) checks each carriageway separately against **degree of saturation ≤ 0.75 for LOS C**
(tab. 15-1, p. 92). TP 188 does not give a directional split. The CSD 2025 `PS` column, the
opposing-direction ratio in the Sunday peak, has a median heavier-direction share of **56 %** on D roads.
Tab. 4-2 (p. 22) gives 3,900 veh/h for 2 lanes, *v_n* = 120 and 15 % slow vehicles on ≤ 2 % grades, and
3,000 veh/h on a 4 % grade over 1,000 m. Max AADT is **0.75 × C ÷ (0.096 × 0.56) ≈ 42,000–54,000**.
Capacity therefore does not decide when D 27.5 is needed. The ČSN 73 6101:2018 rule does: D/R 27.5
“normally” above **19,000** veh/day in the design year (research/12 §1). Between 11,650 and 19,000, practice
uses S 11.5 with LOS D, which is allowed for class I in justified cases, 2+1 passing lanes or a four-lane
S 21.5. None of these is playable, so the code maps AADT > 11,650 to D 27.5 as a stand-in.

## 5. Scenario Y = 9,000 — verdict

- **S 7.5 does not suffice**. Its limit is 6,990, and 9,000 is 29 % above it. The minimum category stays
  **S 9.5**: 9,000 < 9,902, about 9 % headroom. **No change to Y or X is needed.**
- Caveat: the S 9.5 margin is thin. It holds for climb class ≤ 2 at any curviness up to 225 and for class 3
  with curviness ≤ 150. A very winding route with long class 3–4 climbs would need S 11.5 under a full TP 188
  assessment. The game uses the representative row instead of assessing each design. A later, more faithful
  version could run tab. 4-13 per design: the core already has gradients and curvature, but the slow-vehicle
  speed profile from ČSN 73 6101 annex K is paid and unavailable.
- Under the relaxed class I limit, LOS D, S 7.5 would carry 9,582. The C-vs-D choice therefore decides
  whether S 7.5 is legal at Y = 9,000. LOS C follows the official class I example. Its labelling as a class II
  road in `categories.ts` is a cost-norm row and does not reduce the scenario road's required LOS.
- Plausibility of Y: today's I/16 Trutnov–Královec carries 3,200–4,300 veh/day (CSD 2025). A new D11/S3
  continuation would take cross-border transit, so 9,000 in the 20th year is plausible.
- Related ČSN 73 6101:2018 rule (Radimský slide 11): undivided class I/II roads with forecast **≤ 10,000**
  veh/day need an overtaking-sight section every 8 km. Above 10,000, they need added lanes every 12 km.
  Y = 9,000 is in the lighter regime; the game does not check overtaking.

## Confidence

- **High:** the TP 188 tables, width coefficients, criterion and TP 189 factor, all read directly. The census
  numbers are also high-confidence.
- **Medium:** required LOS C for class I. It comes from the official example plus the presentation's
  “C to D”; the paid ČSN text was not inspected.
- **Low–medium:** the representative climb class and curviness. These are engineering judgements for “hilly”,
  not values measured on the player's design.
