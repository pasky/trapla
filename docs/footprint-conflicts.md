# Automatic footprint engineering (cost model 15)

The evaluator now **builds and prices remedies**, rather than simply invalidating every design
whose slopes or foundations touch an existing feature. Straight-line Automatic and all five
published designs pass on the current D11 pack. A clear deck alone still does not excuse a
colliding pier, abutment, portal or embankment.

## Evaluation sequence

1. Compute the alignment and initial Auto profile, retaining the player's pins and structure choices.
2. Compute real sections; compare retaining walls with feasible minor-channel relocations.
   Truncate retained sections before computing earthwork, land, structure choices and buildings.
3. Move automatic bridge/tunnel ends and bridge supports onto clear sites; use longer, priced
   spans where necessary. Check their actual deck depth and clearance.
4. Apply bounded, norm-compliant Auto lifts when required. There are at most three engineering
   refinements and one fixed-material-value DP retry when the existing knots cannot fit a lift.
   This does not repeat the full mass-balance search, building analysis, crossing meshes or noise.
5. Resolve remaining ordinary-road footprints through real network connections, then screen the
   final geometry. Unresolved cases retain explicit violations and measured diagnostics.

Manual grades are not lifted, pins remain constraints, and manual structure ranges are not
silently moved. Retaining walls can protect a manually specified earthwork without changing its
specified grade or structure kind. Infeasible overrides remain visibly invalid.

## Physical and financial rules

### Retaining walls

`src/core/retaining.ts` limits the actual daylight offsets and recomputes the affected cut/fill
areas and excavation bands. It does not merely hide collisions. The resulting quantities feed
structure selection, acquisition, demolition and noise calculations. The renderer ends the slope
at `wallSurfaceL/R`, draws a vertical concrete face to natural ground, and preserves the fine
daylight collar and structure-transition caps.

Walls use a height-dependent RC/foundation/drainage assembly from
[`research/18-footprint-remedies-rates.md`](../research/18-footprint-remedies-rates.md), not an
invented universal CZK/m² tariff. Principal OTSKP 2026 items are 327325 concrete, 327365 reinforcement,
13173 foundation excavation, 17411 backfill, 212625 complete rear drainage and 214613 filtration.
The reported face area is measured; the effective price/m² varies with wall height. Wall
construction is booked at each actual station and its own urban surcharge, independently of
how adjacent faces are grouped for a tooltip. Channel construction/land allocations likewise
retain their distributed stations; land receives no construction surcharge.

The preferred setback is 1.5 m outside the protected feature and the preferred face is at least
0.75 m outside the crown. A constrained vertical face can instead stand at the crown edge,
leaving the complete mapped road ribbon/protected pixel envelope outside it. Its 0.1 m positive
screen margin is **not** a surveyed railway safety distance or a construction working-strip norm.
The footing points into the acquired corridor; an assembly wider than that corridor is rejected.
The 15 m height cap and all footing/stem dimensions are provisional study assumptions.

A wall retaining water beside an open cut uses a larger RC section, provisional cutoff embedment,
and pressure-water membrane/protection (711122 + 711519), not the ordinary drain that would draw
down a pond. This is not a seepage calculation, proof of impermeable geology or construction permit.
Foundation excavation uses the declared 13173 allowance, not a site-specific rock/foundation
estimate. Ground conditions and detailed structural/hydraulic design remain unverified.

### Minor-channel relocation

`src/core/channel-relocation.ts` can move a small stream/ditch outside the full bank footprint,
with real reach tie-ins and compatible bed levels. The bounded concept allows Q100 ≤10 m³/s,
additional bank cut ≤5 m and channel grade ≤3%. Larger rivers and unsupported flow-management
schemes do not receive a cheap generic relocation price.

The BOQ measures trapezoidal excavation, stone lining, filter, bank restoration, old-channel
backfill and land. It uses OTSKP 124731/831/931, 17120, 46451, 28997, 18221 and 18242; excavation
includes haul up to 1 km. Reused backfill is not also charged for stockpiling. The trapezoid area is
`depth × (bottom + sideSlope × depth)`, not the area of its bounding rectangle.

New road/rail/water interceptions reject the proposal unless an existing water tie-in is actually
preserved. Screening covers the full excavated bank (including the wider adjacent section),
protected raster-pixel corners and interior/boundary no-data cells—not just the channel centreline. Continuous old-reach checks prevent backfilling a confluence and stranding a tributary
between samples. Centreline assemblies are not also billed as channel relocations. Accepted source
intervals alone are removed from the final footprint screen. Construction is under **Road crossings**;
land is under **Land**, without construction surcharge.

Channel plans are deliberately conservative about reach boundaries, outlets and confluences;
there is no general watershed-routing solver. The six published examples currently choose walls
and structures rather than channel diversion. Synthetic integration tests exercise a selected,
priced diversion and rejection of lost tributaries/new unpriced confluences.

### Bridges, portals and supports

`src/core/support-layout.ts` searches local clear sites for automatic abutments, portals and piers.
A run containing a manual structure override is not silently redesigned, but its actual spans and
soffit clearances are still validated; painting the same bridge manual cannot erase a violation. The bounded search allows
end movement up to 300 m and clear spans up to 180 m. These are game engineering limits, not norms.

Abutments/portals screen 6 m along × (crown + 4 m) across; piers screen 2.4 m along × 0.55 crown.
Ordinary main-road layouts use equal spans ≤30 m. Modified layouts expose their actual
`Run.pierStations`; billing integrates each actual span and support density through the existing
sourced bridge model. A long span does not impose its rate over the entire viaduct, and obstructed
piers are never omitted for free. Rendered soffits use `max(1.2, span/20)` depth per span; unequal
spans meet supported pier tops. Clearance failures identify the station and required raise.

### Existing roads

`src/core/road-realignment.ts` follows real source-way chainages and connected ways. It first tries
a 25 m collar, then larger footprint-derived collars up to the configured 2 km reach. A short
collar can avoid an unnecessary high supported ramp; a longer one can satisfy the 6% grade limit.
Additional retaining faces and turning aprons are measured and priced. Supported approach height
is bounded to 10 m. The additional retaining assembly is charged in full without an unsupported
credit for possible overlap with the SPK standard-structure quota.

New/regraded pavement and complete turning disks screen existing road ribbons, rail and water.
Motorways/trunks cannot become cheap at-grade anchors. Existing outside junctions must survive;
a failed shortcut can retry at the nearest **actual** clear junction. The 2 m simplified-data
uncertainty guard only prevents losing branches—it does not invent source topology or anchors.

Only exact built/removed source intervals are reserved. There is no blanket half-station pad or
translation of one crossing's ownership onto another nearby road. The old 150 m endpoint billing
margin no longer hides nearby crossings: they enter engineering. A defined boundary connection
owns only its grade-compatible pavement overlap in the actual endpoint crown cell. Failed geometry cannot claim
removed roads. Complete, physically usable crossing approaches can still be used when an unrelated
spacing rule makes the player's choice invalid.

At a common outside junction, companion source roads are independently checked **before** ownership
is committed. Identical accepted connectors share one physical work item. `road-remedy-ledger.ts`
uses the higher tariff at each matching physical segment, one set of support/apron works and unique
ACCESS allowances; it retains every removed original and exact source interval. Later plans must
preserve accepted connector endpoints, not treat them as merely deleted old road branches.

Straight-line Automatic demonstrates this: service ways 5549 and 5548 share a 37.465 m connector
costing **1,733,722.74 CZK**, including one 500,000 CZK ACCESS allowance. Removed ownership is
5549 `[0, 52.1964614090]` and 5548 `[0, 21.8409498829]`; the continuation beyond their real junction
is untouched. There is neither a duplicate connector bill nor free ownership of the continuation.

Road construction uses the appropriate measured-path SPK CN 2026 class and rural/urban rows
([research/08](../research/08-junctions-crossings.md), [research/13](../research/13-crossing-items-tenders.md)). Track uses sourced P4, not a made-up gravel
rate. The 500,000 CZK ACCESS item is the existing **very-low-confidence provisional service-access
estimate**, not a sourced class-I through-junction tariff. Its all-in allowance is included in
crossings but excluded from construction surcharge.

### Final screen and remaining limits

Each station's rotated slope-to-slope footprint includes cuts. Road ribbons include class width
(OSM motorway ways use one carriageway, not a full divided-road width). Local road/water segment
indexes, an indexed footprint and row-wise raster bounds avoid route × whole-network scans.
Protected rail/water bits remain active where road paint overwrites the visible raster class;
5 m raster pixels retain their half-cell screening uncertainty.

Full vector-water ribbons are screened even without redundant raster paint; missing river widths
use the same 5 m study default throughout. Bank-only contact is not fabricated culvert length.
Short longitudinal culverts still require a sourced opening/length assembly, real cover and clear
outlets. Only feasible pipe/box assemblies own barrel intervals—not raw bridge-required crossings.
Ownership is subtracted before water-wall constraint points are chosen, and shortening a barrel
triggers bounded section restoration/rechecking rather than double-applied earthwork or wall costs.
Exact crossing elevations and a shared numerical cover tolerance keep ownership and validation
consistent at the minimum cover, independently of absolute altitude. Compatible adjoining extensions reuse existing heads and charge their actual extra length.
Vector ownership follows the asymmetric, channel-aligned barrel envelope, including its provisional
20° chord flare—not a circle concealing a connected dog-leg. The directionless raster fallback is
explicitly uncertain. See [research/17](../research/17-culvert-prices.md).

This remains study-stage engineering, not survey/geotechnical/hydraulic certification or a global
network optimizer. Auxiliary-road utilities, property effects and secondary grading are not a
complete civil design. An unresolved bounded search is not proof that no engineer could solve the
site. It must not, however, be converted into VALID by suppressing the remaining footprint hit.

Water-policy basis: [Water Act 254/2001](https://www.zakonyprolidi.cz/cs/2001-254), §§5(1), 8 and 17
(water protection, permitted uses and consent). This calls for an engineered/permitted solution;
it does **not** establish a universal legal prohibition on every pond filling or river pier.

## Presentation

`Result.footprintConflicts` exposes action, affected ranges, source/constructed geometry, measured
length, rate code and already-booked amount. The HUD and profile tooltips distinguish retaining,
relocation, culvert and blocked works. Built road connectors use physical crossing surfaces and
full priced turning disks/rim supports. All removed originals of a shared connector receive red
dashed annotations; blocked proposals remain amber. Channel beds are blue annotations at designed
levels, not a claim that a full excavated channel mesh has been rendered. Land and lump allowances
are not added to the bill again by the UI.

## Published designs and review baseline

The four repairs use bounded local PI refinement, preserving category, speed, controls and PI count.
Maximum PI displacement is 15.0 m for demo, 81.4 m for direct-80, 7.6 m for direct-90 and 131.1 m for
town-centre. Best is unchanged horizontally; straight remains **zero PIs, Automatic, zero pins**.
The validity-first runs took 74, 253, 1 and 68 evaluations respectively. `scripts/repair-designs.ts`
never writes an invalid result and requires `--write` to replace a published input.

Current vector-watercourse pack; money below is **M CZK before surcharge**, except whole-route totals:

| Design | Wall length m / face m² | Wall M CZK | Road works: count / m / M CZK | Explicit support layouts / max span m | Total bn CZK | Violations |
|---|---:|---:|---:|---:|---:|---:|
| straight | 1,539.7 / 6,561.2 | 91.244 | 1 / 37.5 / 1.734 | 14 / 142.0 | 10.266047 | 0 |
| best | 1,219.8 / 5,078.1 | 76.704 | 1 / 59.9 / 3.083 | 6 / 61.0 | 4.758320 | 0 |
| demo | 1,179.6 / 4,275.7 | 58.911 | 3 / 223.2 / 5.740 | 8 / 56.6 | 5.375679 | 0 |
| direct-80 | 909.8 / 3,498.4 | 56.895 | 4 / 406.6 / 27.814 | 11 / 92.0 | 5.244108 | 0 |
| direct-90 | 1,069.7 / 4,780.2 | 73.275 | 1 / 94.7 / 13.201 | 12 / 64.0 | 5.726710 | 0 |
| town-centre | 1,170.0 / 5,545.0 | 87.906 | 2 / 112.0 / 3.416 | 11 / 120.0 | 11.690899 | 0 |

No blocked road costs or selected channel relocations are hidden in this table. Support counts
refer to runs with explicit pier stations, not every moved abutment/portal. Component-array sums
match total bills (below the 0.005 CZK regression tolerance).

Same **current pack and same repaired inputs**, main `3dccc23` (model 13) versus model 15:

| Design | Model 13 bn CZK | Model 15 bn CZK | Change M CZK |
|---|---:|---:|---:|
| straight | 8.806911 | 10.266047 | +1,459.135 |
| best | 4.162396 | 4.758320 | +595.923 |
| demo | 4.855298 | 5.375679 | +520.380 |
| direct-80 | 4.787410 | 5.244108 | +456.698 |
| direct-90 | 5.015213 | 5.726710 | +711.497 |
| town-centre | 11.738640 | 11.690899 | −47.741 |

These are intentional engineering changes, not just additive remedy rows: profiles, structures,
earthwork and acquisitions change. For example straight adds 1,245.123 M in bridges before
surcharge; town reduces building acquisition by 781.902 M while adding bridge/tunnel work.
Subtracting the new footprint bill lines cannot reproduce the old designs.

The original ten model-13 bills were first reproduced exactly with unchanged main on their
original fingerprinted pack. `evaluate-costs.json` and `evaluate-pack.json` remain untouched.
Separate model-15 fixtures preserve ten historical-input cases on that pack and eleven current-pack
cases (six published routes plus drag/pin/structure/manual/property-control variants). They check
all bill leaves and per-part sums below half a cent, exact VPIs/material value, validity/violations,
and a canonical hash of the built geometry. Unknown or partial installed packs fail loudly;
only an absent optional pack skips integration tests. Never recapture these to hide an optimization
regression. See `scripts/eval-regression.ts` for explicit reviewed-model-change capture commands.

## Performance

Final reviewed-run measurements at `10393cd`: 15 warmups, 30 evaluations, 2 GB Node heap,
separate consecutive processes, the same updated pack and repaired inputs. The subsequent
cover-tolerance normalization leaves these six route outputs unchanged.

| Design | Main model 13 ms | Model 15 ms | Retaining work ms | Support work ms | Extra profile DP ms | Final footprint screen ms |
|---|---:|---:|---:|---:|---:|---:|
| straight | 62.2 | 100.9 | 20.8 | 5.6 | 0 | 6.1 |
| best | 65.3 | 75.5 | 9.4 | 1.3 | 0 | 3.7 |
| demo | 67.4 | 82.0 | 12.1 | 1.2 | 0 | 4.9 |
| direct-80 | 70.4 | 118.2 | 18.3 | 1.9 | 0 | 7.8 |
| direct-90 | 61.1 | 95.2 | 10.8 | 2.6 | 14.2 | 4.3 |
| town-centre | 71.9 | 75.5 | 8.8 | 2.8 | 0 | 4.4 |

**Neither the ≤3 ms added-work nor the ≤50 ms total target is achieved.** Net before/after
elapsed differences are not isolated overhead: the changed engineering also alters later crossing
work. Retaining and support columns sum all engineering passes. The semantics-preserving cache/
allocation pass reduced engineering work by roughly 2–5 ms before the later correctness repairs;
it did not solve the budget. Raw-section and cover caches remain evaluation-local, preserving
mutable-terrain semantics. Further work needs to target repeated retaining passes and, for direct-90,
the additional DP—not weaken geometry checks or republish old detection-only timing claims.

Unprefixed timing keys are cumulative checkpoints; `sections` is overwritten each refinement.
`work.*` measures elapsed work summed across passes (`work.engineering` includes its substeps),
and `count.*` counts calls. Future performance changes must preserve the frozen bills, geometry
and validity on both recognized packs.

Reproduce audits with:

```sh
PACK=/path/to/current/d11 DETAIL=1 npx tsx scripts/footprint-audit.ts --straight scripts/*-design.json
PACK=/path/to/current/d11 npx tsx scripts/eval-regression.ts
```
