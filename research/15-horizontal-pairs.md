# Consecutive horizontal curves: source and solver audit (2026-11-14)

## Sources and limits of verification

1. [Radimský, 2019, revision of ČSN 73 6101](https://konference-projektovani.cz/wp-content/uploads/2022/03/9.pdf), public presentation of the **2018** edition. Slide 6 reproduces radius/superelevation tables; slide 15 gives the transition minimum. This is not the full standard.
2. [VUT FAST, Aplikace ČSN 73 6101](https://www.fce.vutbr.cz/pko/sad/pdf/aplikace.pdf), chapters *Směrové oblouky* (printed p. 16), *Přechodnice* (pp. 20–21), *Protisměrné oblouky* (p. 33). This is **older-edition teaching material**, not evidence that every clause is unchanged in 2018. No exact 2018 clause for same-direction spacing or transition omission was available to inspect.

Relevant text was checked directly against the extracted PDFs; the source distinction matters:

- 2018 slide 15: “Minimální délka přechodnice je rovna větší z hodnot: vn metrů … délka vzestupnice (viz 8.12.1).” Thus `L ≥ max(vn, runoff length)`. The game uses 90/80/70 m and does not model runoff. These are already the speed-based minima; shortening 90 m just to remove an 8 m conflict is not supported. The older VUT table of radius-dependent lengths (e.g. 160 m at R = 1,000 m) is **recommended for aesthetics**, not the value used by the game.
- 2018 slide 6: R = 1,160 / 920 / 705 m at 90/80/70 km/h is the **no-superelevation** threshold, not the transition-omission threshold. R = 1,115 m is not “almost transition-free” on this evidence.
- VUT p. 16 allows omitting a terminal **or intermediate** transition when shift ΔR ≤ 0.25 m, unless an obvious aesthetic defect makes a transition preferable. The approximation is ΔR ≈ L²/(24R).
- **Important correction to the old PLAN claim:** VUT pp. 20–21 explicitly says to substitute **1.5vn** when determining the minimum transition-free radius, regardless of the pavement rotation method, giving `R ≥ 0.375vn²`, at least 800 m. The game instead substitutes the actual model transition L = vn, giving 1,350 / 1,067 / 817 m. Keep that labelled as a game concession; the public 2018 revision slides do not establish that the omission clause changed. Do not label either 1,160 or the game's 1,350 m as a verified 2018 transition-free limit.
- VUT p. 16 compound curves: preferred construction alternates circular arcs and terminal/intermediate transitions. **Exceptionally**, circular pieces of differing radii may meet directly if the smallest radius satisfies the speed/cant requirement and adjacent larger/smaller radius ≤ 2. The game uses this exception freely. A ratio failure excludes that variant, not every norm-compliant compound with intermediate clothoids.
- VUT p. 20 gives intermediate transition length `Lm = L(R2 − R1)/R2`, with R1 the smaller radius and L its terminal transition length. Such intermediate clothoids are not implemented; applying that length without changing the actual geometry would not be a valid fix.
- VUT pp. 16, 33 requires a **2vn intermediate straight for opposite-direction transition-free arcs**, not same-direction arcs. With transitions, p. 33 prefers an intermediate **straight** longer than 15 m, but explicitly permits a reverse transition without a straight when that is not possible. The 15 m is not a minimum transition length.
- No numerical minimum for a same-direction intermediate straight was verified in these accessible passages. Do not convert an aesthetic preference into an absolute minimum or import the opposite-direction 2vn rule. The game accepts any nonnegative residual after transition footprints, including zero, and also tries direct compounds.

## Norm, game and engine in the report

Reconstructing the owner's rounded tangent lengths gives turns `2 atan(68/355) = 21.687236°` and `2 atan(302/1115) = 30.310131°`, separated by 452 m, with roomy 1,500 m exterior legs:

| Setup | Before | After |
|---|---|---|
| R1 auto, R2 = 1,115 m | valid compound, R1 ≈ 783.088 m | valid, same radii; exact zero-offset solve |
| R1 = 355 m, R2 = 1,115 m, both manual | rejected join, 460.238 m required on 452 m leg | remains rejected, with explicit numeric diagnostics |
| 5° + 47°, 452 m, R1 auto, R2 = 1,115 m | join failed, unadapted R1 = 1,035 m | valid compound, R1 = 557.5 m, junction offset 4.623 m |
| 21° + 3°, 452 m, R1 auto, R2 = 1,115 m | manual arc too short; joining never tried because the leg had room | valid compound, manual radius preserved, auto neighbour adapted |

The report's wording “radius set on bend 22 **and** bend 23” therefore matches **both manual**, not one manual. Without the saved full design, exterior constraints cannot be excluded; the isolated reconstruction establishes the distinction, not the player's actual input history.

For both fixed radii, the direct compound's junction would be 19.408 m from the leg, outside the **game's 5 m editor tolerance**. Its radius ratio is also 3.141 > 2, excluding the older norm's exceptional no-intermediate-transition variant. In the separated-curve model, the tangent footprints plus transitions need 8.238 m more leg. This is not proof of a universal ČSN impossibility: true shifted terminal/intermediate clothoid geometry and runoff are not solved here.

## Changes and remaining limits

- Fixed/auto pairs with free outer tangents now intersect an exact one-dimensional feasible interval: minimum radius, ratio or transition-free exception, closure, junction tolerance, and tangent bounds. Pick the radius with the smallest junction offset, keeping the player's radius exactly. The previous evenness ladder could jump from a negative exact-on-leg radius to a positive radius already outside tolerance.
- Joining is also considered when a manual arc cannot carry its isolated terminal transitions, even if there is enough leg room. Accept only a valid compound that does not worsen the outer legs. Do not silently change manual radii.
- Checks expose which radii are manual, required/available leg length, extra spacing **at unchanged angles and radii**, the rejected join's reason and offset when known, and a fixed-radius ratio conflict. A search failure is explicitly not a norm impossibility.
- Radius advice reuses the editor's Max search on demand (not per drag). Its result is a tested valid editable radius, not a mathematical proof of the global maximum: existing 12% sampling can miss a narrower feasible island.
- General chains, pinned-end solves and intermediate clothoids are not exhaustively solved. Transitions remain represented by tangent-series footprints and circular turning budgets, not drawn clothoids. No source-supported stricter-than-norm spacing rule was found that could safely be removed by simply subtracting metres; the fixes remove demonstrated **solver** restrictions rather than weakening minima.

Regression tests cover the reported auto/manual distinction, the missed ratio-boundary solution in both traversal/turn senses, a nearby truly out-of-tolerance case, short-arc joining and refusal to trade it for a route-end overlap, plus valid numeric maximum advice.
