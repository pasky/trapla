# Geometry-based bridge cost (model 12)

2026-11-14. CZK excluding VAT unless explicitly marked historical Kčs. Implementation: `src/core/bridge.ts`, quantities/rates: `src/core/data/bridges.ts`. **This replaces the flat bridge metre price, not the SPK price basis.**

## Main finding: SPK already has a height attribute

The earlier statement in research/15 that no quantitative height dependence was found was an incomplete search. Independent inspection of the **actual official SPK CN 2026 ZIP**, not just the price table, found:

- Appendix 1 §A.2: standard bridge has **maximum free height below the superstructure ≤8 m**. Increased substructure costs above 8 m are excluded from the unadjusted norm.
- Appendix 5, sheet `A.2.S.9,5.N`, D5:E6: standard **8 m**, upper attribute **35 m**, **+30%** price difference. All road/motorway bridge sheets inspected use the same height endpoints. At fixed width the upper-height price is **1.3×**, not the table’s combined height-and-width maximum.
- Appendix 1’s attribute methodology recommends **linear interpolation/extrapolation**, documented by the estimator. It does not supply span arrangement, pile length or an empirical sample of priced bridges.
- The S9.5 width attribute is −9.4% for −1 m and +28.2% for +3 m. With height, `579.911 × 1.582 ≈ 917.419 M/km`, explaining the published maximum. Standard is **579.911 M/km**.

[Official SPK ZIP](https://sfdi.gov.cz/wp-content/uploads/2026/04/spk-cn-1.zip), [publication page](https://sfdi.gov.cz/cenove-databaze/spk-cn/). Exact workbook cells, quotations, scope and independently checked OTSKP items: [16-official-items.md](16-official-items.md). The first research pass missed the attributes workbook; its “unknown height assumptions” conclusion was rejected and corrected before implementation.

## Czech observations and limits of a tender fit

The collection contains **11 distinct Czech projects**, with deck-level rows retained in [CSV](data/bridge-observations.csv). Eight distinct geometry comparators are summarized here; these are **not eight independently priced, comparable 2026 bridge awards**. Height datums and gross/clear deck widths differ. The exact-source notes are in [16-czech-observations.md](16-czech-observations.md) and [16-extra-observations.md](16-extra-observations.md).

| Bridge | Nominal / reported deck area, m² | Reported height, m | Cost evidence and fit eligibility |
|---|---:|---:|---|
| D8 Opárno, twin decks | 2 × 3,903.9 | 50 | 578 M CZK historical bridge amount; date/VAT unclear, arch technology; excluded from fit |
| D8 Prackovice | 6,801.3 + 8,226.9 | up to 26.2 | no isolated price found |
| D8 border bridge | 13,201 combined | 56 above terrain | 687 M CZK **Czech share**, not entire international crossing; excluded |
| D1 Vysočina | 10,625 combined | 70 (other reports 77.5) | modernized width, no isolated comparable new-build price |
| D0 Lochkov | 14,290–15,066 | 65 over valley | designer geometry; no isolated price extracted |
| II/268 268-007, Jizera | **3,639.68 stated in PDPS** | max. **8.85**, min. 3.57 | 143.633 M CZK ex VAT award; **includes demolition, traffic measures and approach repairs**, not clean bridge-only scope |
| Nuselský, Prague | 12,852.5 upper deck | 42.5 reported bridge height | 152.7 M **Kčs**, original 1973 road+metro build; excluded |
| Žďákovský, I/19 | **7,050 stated** (gross product 7,316.2) | approx. 50 above reservoir | 71 M **Kčs**, completed 1967; excluded |

Additional observations: D3 seven-span bridge 6,774.6 m² clear-width footprint, height 12–17 m (legacy article now unavailable; search-index evidence); D35 Labe 30,274.1 m², 17.335 m above riverbed; D35 Janov 12,873.8 m², 13.83 m over the stream. **The last two heights are local crossing separations, not verified whole-bridge maxima.** Original ŘSD Janov page was independently checked: each deck width is 14.75 m, not half the D26 road category. Trojský’s 34 m structural/arch height was explicitly excluded as a false deck-height lead. D11 SO209’s 3.5/7.5 m structural depths likewise are not terrain heights.

**Unmet empirical-data requirement:** public evidence gathered does not yield ≥8 bridges with matched *isolated price, common price year/scope, surveyed deck area and verified maximum height*. Some of the eight geometry comparators above do not define the maximum/datum rigorously. No fabricated prices, duplicated parallel decks as independent priced samples, or motorway-section total allocations are used. A regression and award residuals on such a dataset would be spurious. The implementable fit below is instead to **official normative height anchors**, with OTSKP component decomposition. SO-level accounts and comparable geometry remain needed for empirical validation.

## Model and sourced versus assumed parameters

For carried width `W`, run length `L`, local road-surface height `hᵢ`:

```
spans N = ceil(L / 30 m), actual equal span s = L / N
internal pier density d = (N−1) / L
priced free height Hᵢ = max(8, hᵢ − s/20) (no below-standard discount)
C = Σ Δxᵢ [ W × (R + v(s) × Udeck) + d × (F + Bearings + Q × Upier × Hᵢ) ] + 2 Abutment
```

`Δx` is the actual station-cell length, including endpoint half-cells. `F` is one standard support’s bored-pile/cap allowance. `R` is the fitted **remaining ordinary bridge-work rate**, not a second complete SPK norm. It includes unitemized equipment, erection, waterproofing, surfacing and ordinary access. Two abutments are charged **once per contiguous run**, half on each end cell; a one-cell run receives both halves.

| Term | Basis / assumption |
|---|---|
| Pier concrete / reinforcement | OTSKP 334325 **12,934.89 CZK/m³** + 334365 **40,874.37 CZK/t**; assumed 0.15 t/m³ → `Upier = 19,066.0455 CZK/m³` |
| Effective support area `Q` | **Fitted from SPK height slope**, includes height-sensitive construction/access, not a structurally designed cross-section; S9.5 **13.518 m²** |
| Deck volume `v(s)` | **Provisional** m³/m²: 0.45 up to 20 m; `0.45+.02(s−20)` at 20–40 m; `0.85+.025(s−40)` above 40 m; continuous slab/beam/long-span proxy, not a span-feasibility rule |
| Deck unit `Udeck` | OTSKP beam concrete 17,952.09 + 0.16 t/m³ × deck rebar 42,334.95 + 0.035 t/m³ × prestressing 129,728.57 ≈ **29,266 CZK/m³**; steel quantities provisional |
| Structural depth `s/20` | **Provisional** depth proxy for converting surface elevation to free height; distinct from equivalent concrete volume |
| Foundation per support | **Provisional** 6 bored Ø0.8 m piles ×15 m at W=9.5, scaled with width; drilling 2,364.57/m + pile concrete 5,534.64/m³ + 0.15 t/m³ rebar 48,858.84/t; cap 3 m³ per metre width at abutment concrete+rebar rate |
| Abutment | **Provisional** 12 m³ per metre width incl. wings, foundation, two equivalent bearings at W9.5 and one width-length joint; concrete 9,377.28/m³, rebar 40,874.37/t, bearing 99,333.71/each, joint 31,699.79/m |
| Main-road layout/reference | **Provisional** equal spans ≤30 m, reference **120 m / four 30 m spans / three internal piers**, free height 8 m (road surface 9.5 m). Only the 8 m height is SPK-sourced |

OTSKP concrete includes formwork/falsework; drilling includes temporary casing wear/slurry and working platforms. **Do not double-charge them.** Reinforcement is separate. General equipment is already covered by the calibrated residual, not added again from the illustrative waterproofing/railing rows. Bearing load/joint movement classes are equivalent allowances, not actual support design.

Optional pile-length sensitivity is available in `model.total(..., pileLength)` and `perM(..., pileLength)`, including **both abutment foundations** in the total. The live route uses the explicit standard 15 m assumption: surface ČGS excavation classes cannot establish competent founding depth, scour, groundwater or pile capacity. No unsupported automatic geology-to-foundation multiplier is introduced.

A 30 m single-span bridge has no internal piers: height does not change its price with bank-top abutments. **This is a substantive model limitation, not just an exceptional case:** automatic main-road bridges start at ≥4 m surface height and therefore need raised approaches/abutment support rather than literal natural bank tops. Adjacent earthwork is billed, but a short elevated bridge’s tall abutments are not designed or height-priced by this fixed-abutment approximation. Conversely, making many short bridges is not free: each pays two abutments. Main-road support count is actual `N−1`, not one fictional pier for every short span.

## Fit and residuals

Set reference length `L₀=120`, span 30, pier density `d₀=3/120`. For each width/category with SPK price `p₀` CZK/m:

```
Q = [p₀ × .30 / (35−8)] / (d₀ × Upier)
R = [p₀ − 2Abutment/L₀ − d₀(F+Bearings+Q×Upier×8)] / W − v(30)×Udeck
```

This is a **two-anchor linear normative fit**, not a least-squares fit to awards. Both supplied anchors are reproduced exactly; residual zero is calibration identity, **not predictive validation or R² evidence**. The 20 m target below is interpolated, not a third independent observation.

| S9.5 reference free height | SPK target for 120 m, M CZK | Model, M CZK | Residual |
|---:|---:|---:|---:|
| 8 m (standard anchor) | 69.589320 | 69.589320 | <1 CZK |
| 20 m (linear interpolation) | 78.867896 | 78.867896 | <1 CZK |
| 35 m (+30% anchor) | 90.466116 | 90.466116 | <1 CZK |

S9.5: residual `R=26,668.55 CZK/m²`; ordinary 30 m deck term `R+vU≈45,692 CZK/m²`; **two abutments 7.009 M CZK**; fitted reference whole-object slope **6,443.46 CZK/(route m × height m)**. S7.5/S11.5/D27.5 also match both anchors, using their own SPK row. Reproduce all values with `npx tsx scripts/bridge-calibration.ts`.

| Uniform S9.5 run | 6 m surface height | 10 m | 20 m | 40 m | 60 m |
|---|---:|---:|---:|---:|---:|
| 30 m, one span | 667.7 | 667.7 | 667.7 | 667.7 | 667.7 |
| 120 m, four spans | 579.9 | 583.1 | 647.6 | 776.4 | 905.3 |
| 300 m, ten spans | 562.4 | 566.2 | 643.5 | 798.2 | 952.8 |

Units: **thousand CZK per metre before surcharge/land**. Short spans carry more fixed cost per metre. Longer high viaducts have more internal supports per metre. Height beyond 35 m, variable-height integration instead of whole-object maximum, and support-count changes are explicitly **model extrapolations**. Following review, free heights below 8 m keep the 8 m standard allowance; no below-standard height discount is applied.

**Local height versus SPK maximum:** the requested per-station quantity integration is **not** a direct implementation of SPK’s maximum-height attribute for a variable-height object. A triangular valley profile with free height 8 m at both ends and 35 m at the middle has mean height 21.5 m: the reference-layout model charges **+15%**, whereas applying SPK to its maximum gives **+30%**. This is a material downward difference in the *height premium*, not a validated improvement to the official tariff. Exact pier positions/sections and a representative valley-shape calibration remain unknown; we retain the explicit local-height model rather than silently doubling the fitted slope or replacing station height with the maximum.

**Reference length:** 120 m is four ordinary assumed spans, close to the **125.5 m mean** of the four non-town saved designs’ baseline bridges (5,020 m / 40 runs). It is a scenario calibration choice, not a recovered SPK standard length. Two abutments make a 30 m S9.5 bridge **667.7k/m, +15.1%** versus the flat 579.9k/m row. This short-bridge premium contributes to the design-total increase separately from height. Exceptional arches, cantilever spans and inaccessible valleys need project-specific estimates.

International evidence supports the decomposition, not our coefficients: TU Dresden’s 42 awarded Autobahn bridges use deck-area curves and separate cost groups/special foundations; German B27 planning estimates distinguish small bridges (€4,500/m²) from valley bridges (€2,750/m²), but this is **not a controlled span/height comparison**. FHWA 2024 replacement averages ($429/ft² NHS, $382 non-NHS) are whole replacement costs, not Czech new-build unit rates. [16-international.md](16-international.md) records sources, ranges and exclusions; no foreign FX-converted coefficient enters the code.

## Consistent decisions and billing

- Auto-profile’s local DP has no bridge-run state. It uses the same height formula with **reference-layout abutment amortization over 120 m**. This remains an estimate, not an exact globally optimized bridge layout.
- Initial station choices use variable height costs; the actual merged run is then checked by `bridgeRunCost()` including its true span count, two abutments, local surcharge and deck-strip land. Painted automatic remnants are repriced too; forced/manual bridges are retained and billed even when uneconomic.
- The coarse balance estimate and final selector share that callback. Coarse-grid/end-cell approximations already present in balance estimation remain; the final full-resolution bill uses actual cell lengths.
- `costParts()` prices the identical run geometry/height, distributes abutments on endpoints, and applies each cell’s surcharge once. Existing range/component summation checks remain; new tests check direct selector-vs-bill equality with varying height/urban rates, endpoint half-cells, a one-cell bridge and split runs.
- Crossed-road overbridges use **one unobstructed clear span equal to the cut/footprint width**, bank-top abutments and no piers in the new road. The deck span term replaces the flat width-row price; existing approach length/road price remains. Deep cut is not a **pier** height when no piers are provided, though it **is** free height under SPK’s definition; omitting the height attribute in this single-span case is another component-model departure from that tariff. **Conservative layout limitation:** real overbridges can put piers on cut slopes or in a median. Requiring one clear span over the entire footprint is pessimistic: a 100 m S9.5 crossing costs **97.68 M** versus **58.32 M** for a 100 m equal-span bridge at reference height, before approaches/surcharge. No evidence establishes that the single-span option is required; a future corridor-clearance/side-span layout should replace this proxy. Very large clear spans are priced proxies, not certified structures.
- Runtime work is O(stations), no bridge mesh, optimization search or additional terrain sampling. Existing `forced` stream/rail/road masks remain unchanged. Model version **11→12**.

## Break-even, same earthwork model

`npx tsx scripts/bridge-break-even.ts`; rural S9.5, 1:2 fill, land 320 CZK/m², surcharge 30.6%. Uniform runs include fixed abutments. These are economic sensitivities, not legal embankment limits. “Old” is model 11 with benches/reserve already enabled; research/15 preserves the earlier unengineered-fill comparison.

| Material shadow value λ, CZK/m³ | Model 11 flat bridge | Model 12, L30 | L120 | L300 | L120 + old stream/30m proxy |
|---:|---:|---:|---:|---:|---:|
| −196.4 | 21.03 | 21.98 | 21.89 | 21.88 | 21.40 |
| 0 | 18.62 | 19.59 | 19.33 | 19.27 | 18.88 |
| 100 | 17.58 | 18.55 | 18.21 | 18.14 | 17.82 |
| 200 | 16.62 | 17.61 | 17.19 | 17.10 | 16.80 |
| 536 | 14.04 | 14.99 | 14.39 | 14.25 | 14.07 |

Heights in metres, **road surface above ground**. Old stream column retains the pre-catchment culvert model only to isolate this bridge change; concurrent watercourse work will supersede it.

## Saved designs and short optimization

All five **unchanged saved horizontal plans**, Auto profile, VALID, per-cell sum discrepancy <1 CZK. Main-road bridge cost below excludes surcharge. No candidate overwrites the reference geometry, particularly the deliberately town-centred comparison.

| Design | Model 11 total | Model 12 total | Bridges M CZK / count / length m | Crossings M CZK | 50-trial candidate total |
|---|---:|---:|---|---:|---:|
| demo | 4,099 | **4,233** | 660 / 8 / 1,040 | 294 | 4,172 |
| best bypass | 3,738 | **3,912** | 554 / 7 / 900 | 292 | 3,881 |
| direct80 | 4,062 | **4,350** | 975 / 13 / 1,390 | 280 | 4,324 |
| direct90 | 4,382 | **4,618** | 929 / 10 / 1,400 | 228 | 4,581 |
| town-centre | 10,580 | **11,038** | 1,866 / 15 / 2,720 | 172 | 7,729 |

All totals M CZK. Town-centre now also contains one 160 m tunnel, 238 M before surcharge. Changes include reoptimized vertical lines, mass-balance decisions, changed crossings and buildings—not just a bridge-price delta. The town search leaves the town-centre alignment and is **not** a replacement for that control design. All candidates VALID. Reproduce: `npx tsx scripts/optimize.ts <speed> 50 scripts/<name>-design.json /tmp/bridge16-<name>-candidate.json 1612` (90 except direct80). Baseline code: `1550438`.

Validation/performance measurements are recorded in PLAN.md. Shared-host load rose sharply during research (two Chromium processes consumed ~17 cores plus hydrology jobs); raw five-run wall times from different moments are not comparable. Warmed before/after runs use identical `BENCH_WARMUP=20 BENCH_N=20` settings and report wall and process CPU time; do not claim a 40–60 ms target from loaded-host numbers alone.
