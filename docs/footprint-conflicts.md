# Earthwork and support footprint conflicts (cost model 14)

`src/core/footprint.ts` supplements centreline road/water crossings. It does not change the
Auto grade or the economic structure selection. Consequently, an old VALID design can now be
invalid: a clear deck is not proof that its foundations or adjacent slopes are clear.

## Geometry, mitigation and pricing

- Each 10 m station cell screens its rotated slope-to-slope rectangle, including cuts. Roads
  include their class half-width. Segment clipping and union in original-way chainage measure
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
  including nearby ways merged for billing. New tie-ins cannot rebill those intervals or another
  relocation of the same way. Endpoint exemptions require a real crossing, or a collinear way
  actually within the existing 1 m endpoint tolerance—not any road within 150 m.
- Free bridge spans and tunnel interiors do not displace surface features. Abutment screens are
  6 m along × (crown + 4 m) across; piers 2.4 m along × 0.55 crown; portals use the abutment-sized
  screen. These dimensions are **provisional study assumptions**, not foundation design. Piers
  follow the same equal-span ≤30 m layout as bridge pricing and rendering. Colliding piers are
  no longer silently omitted from the picture. Automatic span redesign is not implemented.
- Short longitudinal channels can use the sourced `watercourses.ts` pipe/frame assemblies:
  measured clipped channel length × per-metre assembly rate + two ends. The check uses actual
  fill cover at the channel, its hydraulic opening/length limits, and open outlets; no buried
  headwall at an internal OSM endpoint. Existing centreline barrel neighbourhoods are excluded
  (half a station resolution allowance); an adjoining compatible barrel extension reuses its
  ends, not two more heads. Resizing/merging incompatible assemblies is a violation, not free.
  Legacy raster-stream crossings are excluded too. Long/large channels, cuts and missing cover
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
also unresolved. Lateral roads' secondary earthworks, utilities, property acquisition and new
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
| best | 3 / 13 | 411.8 | 1,819.1 | 39.268 | 4 / 40.0 | 1 / 10.0 | 11 / 270.0 | 29 |
| demo | 6 / 19 | 386.0 | 1,917.9 | 41.587 | 4 / 40.0 | 1 / 10.0 | 15 / 379.9 | 39 |
| direct-80 | 1 / 29 | 469.8 | 1,819.1 | 70.145 | 5 / 70.0 | 4 / 60.0 | 7 / 70.0 | 45 |
| direct-90 | 0 / 37 | 578.1 | 2,657.6 | 78.732 | 5 / 60.0 | 4 / 60.0 | 14 / 399.9 | 60 |
| town-centre | 3 / 34 | 714.4 | 2,237.8 | 70.166 | 9 / 140.0 | 1 / 10.0 | 12 / 419.9 | 56 |

No additional longitudinal culverts qualify in this legacy raster-only pack. All five designs
were VALID under the old centreline checks; all now require footprint/support fixes.

### Updated main pack (independent vector watercourses)

Main's ignored `meta.json` and `watercourses.json.gz` changed after the performance baseline.
This table is a separate evaluation, not a replacement fingerprint/baseline.

| Design | Roads built / blocked | Road affected m | Proposed/built road m | Added road M CZK | Rail spans / m | Water spans / m | Blocked channel spans / m | Footprint violations |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| best | 2 / 15 | 370.9 | 1,697.6 | 33.997 | 4 / 40.0 | 1 / 10.0 | 10 / 167.2 | 30 |
| demo | 4 / 17 | 379.7 | 1,628.7 | 32.148 | 4 / 40.0 | 1 / 10.0 | 10 / 152.6 | 32 |
| direct-80 | 2 / 26 | 406.1 | 1,667.4 | 62.355 | 5 / 70.0 | 4 / 60.0 | 5 / 83.3 | 40 |
| direct-90 | 1 / 37 | 548.9 | 2,561.1 | 71.633 | 5 / 70.0 | 3 / 50.0 | 16 / 105.1 | 61 |
| town-centre | 3 / 38 | 817.6 | 2,546.0 | 80.315 | 9 / 140.0 | 1 / 10.0 | 8 / 94.9 | 56 |

Demo additionally prices **one 9.57 m compatible longitudinal barrel extension, 0.196 M CZK**,
reusing the existing assembly's ends. All five still require footprint fixes.

## Performance

A warmed initial five-design run measured **3.0–4.0 ms** for the isolated footprint phase on the
original pack. A later alternating same-process comparison against `17dac0a` (25 warmups, 30 samples,
median, original pack) during substantially higher shared-host load measured:

| Design | Baseline ms | Model 14 ms | Footprint phase ms |
|---|---:|---:|---:|
| best | 99.1 | 103.9 | 4.6 |
| demo | 86.3 | 91.9 | 5.8 |
| direct-80 | 101.1 | 108.7 | 5.2 |
| direct-90 | 96.3 | 99.0 | 5.3 |
| town-centre | 93.9 | 103.2 | 5.1 |

The absolute ≤50 ms target could not be reverified under this contention: even the unchanged
optimized baseline was 86–101 ms. The phase remains bounded/local; these measurements do not
justify claiming a fresh ≤50 ms result. See `docs/evaluate-performance.md` for the earlier quiet-host
43–49 ms baseline and its CPU/GC controls. `evaluate()` exposes separate `crossings` and `footprint`
cumulative timing marks so the added work is measurable.
