# Earthwork and support footprint conflicts (cost model 14)

`src/core/footprint.ts` supplements centreline road/water crossings. It does not change the
Auto grade or the economic structure selection. Consequently, an old VALID design can now be
invalid: a clear deck is not proof that its foundations or adjacent slopes are clear.

## Geometry, mitigation and pricing

- Each 10 m station cell screens its rotated slope-to-slope rectangle, including cuts. Roads
  include their class half-width (OSM motorway ways use one carriageway, not the whole D27.5
  divided-road width). Segment clipping and union in original-way chainage measure
  affected length without charging the same segment once per station. Queries reuse the road
  and water segment grids; proposed paths query an indexed footprint. No full-map/network scan.
- Ordinary roads use a proposed outer-toe realignment, 3 m provisional setback, real OSM tie-ins,
  and the class's SPK CN 2026 rural/urban row sampled along the new path. The bill uses the
  measured full path including tie-ins, under **Road crossings**, plus other-objects surcharge.
  Ordinary grading is already in that SPK rate; a bounded 6% profile draws supported ramps,
  rejecting support heights above 10 m. Sources and limitations of the rows: `research/08` and
  `research/13`; track uses paved P4, not an invented cheap gravel rate.
- A proposed path which cannot tie to the real way, still enters the footprint, crosses mapped
  rail/water, leaves terrain data or exceeds those engineering limits remains **blocked**, with
  its measured proposal priced and its specific diagnostics visible. It is not drawn as a built
  road. Motorways/trunks and support collisions are blocked without a cheap relocation rate.
- Crossing-owned original-way intervals are subtracted using actual approach/turnaround geometry,
  including confirmed one-sided removed stubs, already-priced invalid choices, and nearby ways
  merged for billing. A provisional half-station tolerance absorbs stepped/continuous sampling
  slivers; it is not a proven geometric bound. Missing-anchor geometries cannot claim an entire
  branch. New tie-ins cannot rebill those intervals or another relocation of the same way. Endpoint exemptions require a real crossing, or a collinear way
  actually within the existing 1 m endpoint tolerance—not any road within 150 m.
- Free bridge spans and tunnel interiors do not displace surface features. Abutment screens are
  6 m along × (crown + 4 m) across; piers 2.4 m along × 0.55 crown; portals use the abutment-sized
  screen. These dimensions are **provisional study assumptions**, not foundation design. Piers
  follow the same equal-span ≤30 m layout as bridge pricing and rendering. Colliding piers are
  no longer silently omitted from the picture. Automatic span redesign is not implemented.
- Short longitudinal channels can use the sourced `watercourses.ts` pipe/frame assemblies:
  measured clipped channel length × per-metre assembly rate + two ends. The check uses actual
  fill cover inside the barrel (excluding its exposed headwall zones), its hydraulic opening/length
  limits, and open outlets; no buried
  headwall at an internal OSM endpoint. Existing centreline barrel neighbourhoods are excluded
  using a channel-aligned corridor offset toward the wider toe of asymmetric fill, not a circle
  that would hide a connected dog-leg. A **provisional 20° flared chord allowance** handles modest
  OSM vertex bends without promoting each bend to a bridge; it is not hydraulic bend design.
  Structure selection and final checking share this corridor and its half-station sampling margins. A
  genuine adjoining compatible barrel extension bills the end-margin gap too and reuses its ends,
  not two more heads. Resizing/merging incompatible assemblies is a violation, not free.
  Legacy raster-stream crossings have no direction and retain the explicitly uncertain circular
  neighbourhood fallback; vector channels never use that fallback. Long/large channels, cuts and missing cover
  or outlets require moving away or a clear bridge. See `research/17-culvert-prices.md` and
  `research/17-stream-crossings.md` for sourced rates and provisional hydraulics.
- The rail/water raster screens only footprint cells, retaining independent crossing bits even
  where a road overwrote the visible land-cover class. Raster overlap is conservative at 5 m
  resolution (half-pixel toe uncertainty). Pond filling and unmodelled water works are blocked;
  there is no invented universal compensation tariff.

Water-policy source checked 2026-11-14: [Water Act 254/2001](https://www.zakonyprolidi.cz/cs/2001-254),
§5(1) water protection, §8 permitted water uses, and §17 consent for works affecting water conditions.
This supports requiring a water-management solution, **not a claim that every pond filling or
river pier is legally prohibited**. The game disallows unmodelled approvals/compensation. §15 in
that consolidated text is repealed and is not used as a source.

## Presentation and boundaries

`Result.footprintConflicts` exposes each affected range, feature, action, original and proposed
geometry, lengths, rate code and pre-surcharge amount. Amounts are already in the per-cell bill.
The HUD expands individual conflicts; profile tooltips match the whole affected range rather than
only its booking station. Built relocations reuse physical crossing surfaces; removed originals
are red dashed annotations, blocked proposals amber dashed, and blocked locations red ×. The
original terrain is not cut out merely to hide a road (that would leave holes).

This is screening and provisional mitigation, not a routing/engineering solver. Realignments do
not traverse arbitrary OSM junctions to invent anchors beyond their source way; a truncated way
inside the footprint is explicitly blocked. Channel reach boundaries without usable outlets are
also unresolved. The culvert head-zone allowance uses the provisional 1:2 fill slope; oblique exits
and gentler slopes can conservatively need a separate hydraulic/earthwork design. Lateral roads' secondary earthworks, utilities, property acquisition and new
intersections are not comprehensively redesigned. Road half-widths/support dimensions and raster
rail/water masks are approximate. These limitations must not be hidden by marking a design VALID.

## Saved designs

Run `npx tsx scripts/footprint-audit.ts scripts/*-design.json`; set `PACK=/path/to/d11` to compare
data snapshots and `DETAIL=1` for individual conflicts. Counts are conflict spans, not distinct
OSM objects; the same object may have separate earthwork and support collisions. Rail/water/raster
stream lengths are affected route lengths, whereas vector channel/road lengths follow the feature.
Blocked road proposals are included in proposed length/cost but are not constructible mitigations.
All amounts below are **M CZK before surcharge**, already in the bill. Every component sum matches.

### Original regression pack

Unchanged pack fingerprint in `tests/fixtures/evaluate-pack.json`, available in the performance
agent's original worktree. The frozen model-13 fixtures are **not recaptured**: regression checks
subtract only explicit model-14 footprint works and their surcharge, preserving all old cost parts,
grade VPIs and material values for the ten saved/edited designs.

| Design | Roads built / blocked | Road affected m | Proposed/built road m | Added road M CZK | Rail spans / m | Water spans / m | Stream spans / m | Footprint violations |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| best | 2 / 9 | 206.5 | 1,239.6 | 26.095 | 4 / 40.0 | 1 / 10.0 | 13 / 280.0 | 27 |
| demo | 6 / 17 | 355.4 | 1,658.3 | 36.414 | 4 / 40.0 | 1 / 10.0 | 16 / 359.9 | 38 |
| direct-80 | 1 / 25 | 403.3 | 1,618.7 | 64.955 | 5 / 70.0 | 4 / 60.0 | 8 / 80.0 | 42 |
| direct-90 | 0 / 33 | 570.7 | 2,379.4 | 74.838 | 5 / 60.0 | 4 / 60.0 | 13 / 369.9 | 55 |
| town-centre | 3 / 29 | 529.4 | 1,685.4 | 56.007 | 9 / 140.0 | 1 / 10.0 | 11 / 409.9 | 50 |

No additional longitudinal culverts qualify in this legacy raster-only pack. All five designs
were VALID under the old centreline checks; all now require footprint/support fixes.

### Updated main pack (independent vector watercourses)

Main's ignored `meta.json` and `watercourses.json.gz` changed after the performance baseline.
This table is a separate evaluation, not a replacement fingerprint/baseline.

| Design | Roads built / blocked | Road affected m | Proposed/built road m | Added road M CZK | Rail spans / m | Water spans / m | Blocked channel spans / m | Footprint violations |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| best | 1 / 13 | 154.4 | 877.2 | 19.939 | 4 / 40.0 | 1 / 10.0 | 5 / 48.6 | 23 |
| demo | 3 / 15 | 368.1 | 1,432.4 | 29.044 | 4 / 40.0 | 1 / 10.0 | 7 / 101.6 | 27 |
| direct-80 | 2 / 22 | 339.7 | 1,478.1 | 57.518 | 5 / 70.0 | 4 / 60.0 | 4 / 83.2 | 35 |
| direct-90 | 1 / 33 | 543.7 | 2,269.0 | 67.543 | 5 / 70.0 | 3 / 50.0 | 13 / 102.4 | 54 |
| town-centre | 3 / 32 | 594.7 | 1,913.3 | 64.097 | 9 / 140.0 | 1 / 10.0 | 4 / 41.2 | 46 |

No additional longitudinal assembly in these five designs clears every cover/outlet/support check;
all five still require footprint fixes. The shared oriented barrel rule also changes Auto structure
choices on this updated vector-water pack. This is an **intentional conservative model change**,
not an optimization-only rebaseline: unlike the old generous circular exclusion, it does not excuse
parallel channel excursions merely because they are close to a centreline crossing. Modest vertex
bends have a 20° allowance; larger deviations need an explicit water-management design.

Whole-route impact versus unchanged `17dac0a`, evaluated on this **same updated pack**:

| Design | Before, bn CZK | Model 14, bn CZK | Increase, M CZK | Additional bridge m |
|---|---:|---:|---:|---:|
| best | 4.172658 | 4.288885 | 116.226 | 220.0 |
| demo | 4.851775 | 4.998425 | 146.651 | 299.9 |
| direct-80 | 4.684462 | 4.763695 | 79.234 | 0 |
| direct-90 | 5.023884 | 5.112855 | 88.971 | 0 |
| town-centre | 11.330497 | 11.479324 | 148.827 | 150.0 |

These increases include surcharges and changed bridge/earthwork decisions, not just the relocation
rows. They must be reviewed as cost-model changes; the original-pack frozen bills remain intact.

## Performance

A quiet warmed validation run on the original pack (15 warmups, 30 evaluations, `17dac0a` versus model 14 in
separate consecutive processes) measured **2.5–2.9 ms** for the isolated footprint phase:

| Design | Baseline ms | Model 14 ms | Footprint phase ms |
|---|---:|---:|---:|
| best | 51 | 53 | 2.7 |
| demo | 43 | 44 | 2.8 |
| direct-80 | 48 | 53 | 2.5 |
| direct-90 | 53 | 53 | 2.9 |
| town-centre | 50 | 49 | 2.6 |

The absolute ≤50 ms target is near, but not consistently reverified: the unchanged baseline also
reached 53 ms. An earlier alternating same-process run during heavy shared-host load put both
versions at 86–109 ms, with 4.6–5.8 ms for the isolated footprint phase. These measurements do not
justify claiming a fresh strict ≤50 ms result. See `docs/evaluate-performance.md` for the earlier
quiet-host 43–49 ms baseline and its CPU/GC controls. `evaluate()` exposes separate `crossings` and
`footprint` cumulative timing marks so the added work is measurable. A later final-code rerun under
variable load measured 51–68 ms on the original pack (footprint 2.5–4.4 ms), and 47–64 ms on the
updated vector pack (footprint 3.3–5.8 ms). Barrel ownership is cached per crossing/reach and road
chainage projection no longer constructs full throwaway paths; no strict ≤50 ms claim is made.
