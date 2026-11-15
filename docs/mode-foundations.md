# Mode foundation checkpoint (M0)

This is **unscored foundation work, not playable motorway or railway completion**. Legacy D11
physics, prices, enabled categories and renderer are unchanged. No price-model bump. C0 consumers
must dispatch `modeCapability(kind)` **before** resolving road category/speed/traffic defaults.
The road response identifies the legacy kernel; motorway and railway explicitly return `scoring:false`
and missing capability codes. Codes are not player text.

## Exported kernels

- `core/offset-path.ts`: `CurvePath` uses existing exact line/circle `Element`s, not shifted PIs or fake
  `Alignment` metadata. `offsetCurvePath` validates tangent continuity, preserves arc centres/sweeps,
  uses `R_child=R−direction*offset`, rejects collapsed inner curves, and can reverse travel direction.
  `childStationAt` / `spineStationAt` map unequal physical chainages, including descending reverse
  stations. `curvePointAt` evaluates exact geometry by binary search. Offset alone does not certify
  global validity or add transitions absent from its input.
- `core/curve-intersections.ts`: analytic line/arc intersections and overlap endpoints, sweep broad
  phase, bounded candidate/output count. Only actual consecutive shared end/start points are exempt.
  Budget exhaustion returns incomplete, never safe. No dense Cartesian products.
- `core/paired-carriageways.ts`: derives two pavement bands, independent lane-pair axes, actual
  directional endpoint tangents, median gap and common outer formation boundaries. Checks child
  radii, boundary/self-intersections and terminal-cross-section overlap. Terminal cross-sections are
  collision boundaries, **not constructed caps or connections**. `connectionMismatch` compares actual
  XYZ/grade/tangent ports against explicit tolerances; it never snaps a road to an unbuilt connector.
- `core/motorway-commands.ts`: emits C0 atomic split/rejoin commands from snapshot-qualified resolved
  corridor geometry and **actual child profiles**. The caller supplies current project epoch/revision;
  materialization must match it, the corridor revision and both child revisions. C0 requires a new epoch
  on load/environment reset, so dependency/context changes cannot reuse a stale profile. Split freezes exact curves/heights, maps structures
  by true station correspondence while preserving last-paint-wins order, transfers outer walls only
  to the owning child's outside (no extra
  median walls), and retains original spine controls/pins for rejoin. Rejoin requires explicit reset.
  Route and physical acoustic-source IDs survive; stale profiles are rejected and displaced external
  endpoint anchors become unresolved instead of being silently moved. Store still owns undo/reload.
- `core/formation-quantities.ts`: integrates **one** supplied transverse formation including median,
  cut/fill zero crossings and the circular-offset Jacobian `1−κ*u`. Caller supplies actual ground and
  design vertices (including slopes), not two overlapping road volumes. Longitudinal average-end-area
  quadrature is explicit. `formationQuantityRuns` preserves separate one-sided rows at line/arc,
  compound-arc and structure breaks; one shared curvature row would smear quantities.
- `core/data/motorway.ts`: D27.5 physical widths from MD VL1 01/2022 sheet11-02, with lane-pair axis
  distinct from asymmetric pavement midpoint. Category includes soft shoulders; extra guardrail/post
  shoulders need explicit extension. Horizontal evidence at130/120/110 is conditional on6% crossfall
  and sight distance; transition floor is not full runoff design. Current grade/vertical limits are
  deliberately null, not borrowed from90km/h road rows.
- `core/railway-policy.ts`: explicit train-speed cant envelope (fast-train deficiency **and** slow-train
  excess), provisional ordinary old-teaching cant/ramp helpers with scope limits, receiver-specific
  event-SEL →16h/8h exposure integration, and source metadata compatibility. Missing SEL is not silent
  rail; no road emissions or AADT model is used. Relocation legal status remains unresolved unless
  established; new-line ordinary residential limits60/55 are limits, not emissions. Imported gauge,
  track count and electrification ambiguity blocks compatibility; neighbour IDs are preserved.
- `core/rail-trackbed.ts`: SŽ S3X no-cant single-track ballast/formation polygon for an **explicit
  selected upper profile**, actual toe intersections with supplied formation crossfall, shallower-rail
  ballast-depth check and an explicit applicable maintenance-path requirement. A supplied flat top is
  only a gross envelope, not S3 clause45's shaped inter-sleeper surface. Sleeper/rail component dimensions
  are caller inputs (no invented universal sleeper or rail mass). Physical-track chainage and half-open
  ownership preserve procurement count; a separately clipped periodic prismatic sleeper solid preserves
  displaced ballast even across millimetre-long editor splits. This measures the selected section/solid
  model, not every sleeper catalogue's detailed geometry. No rail construction prices are supplied.

All geometry inputs use metres/radians; cant uses millimetres, train speeds km/h. Synthetic component
values in tests exercise mathematics and are **not** adopted construction assumptions.

## C0 integration boundaries

Approved C0 contracts are consumed from `core/project.ts` / `project-transport.ts`, not redefined.
Paired children carry only a corridor-derived alignment reference. Independent children require exact
materialized horizontal paths and explicit resolved vertical authority, preserving directional route
IDs and physical acoustic-source IDs. Frozen profile stations, structure ranges and wall side ownership
must be remapped, never copied as if the two paths had equal lengths. Rejoin explicitly restores the
retained spine, discarding independent edits in one undo transaction. The command helper consumes
resolved geometry, not a substitute vertical solver. This checkpoint emits the complete commands but
does not yet wire their user interaction or actual undo/reload integration into Store/UI.

`CorridorKernel` must engineer shared formation once. D27.5 SPK is a **whole-category** tariff; the source
also says half of a future divided road is60%, not a universal50% split. Four-lane bridge reference
length is average left/right bridge length. Two-lane tunnel tariff is per tube. These aggregate scope
facts do not replace actual shared/per-direction measured structures and their explicit ledger owner.
Do not implement paired pricing by `sum(evaluate(child))` or charge one full D27.5 per direction.

`EngineeringGeometry` is the future common rendering/billing handoff. No renderer should infer a
median, rail formation, deck, pier or tunnel from these plan curves. Endpoint offsets are not connected
until the required actual continuation/interchange/rail works are engineered, drawn and billed.

## Evidence review

Sources: `research/22-motorway-evidence.md`, `research/23-railway-evidence.md`, preceding `research/21`.
Research was delegated only for source retrieval, then key claims were personally checked against:

- MD VL1 sheet11-02 image: component widths sum12m each plus3.5m median; the printed12.50 dimension
  must not be mistaken for that component sum. Source-note arithmetic was corrected before adoption.
- SPK2026 scope report: whole-category norm, earthwork/normal-interchange scope, average paired bridge
  length and tunnel-tube basis. Prices remain the existing frozen road data; rail prices remain unknown.
- VUT2009 cant/ramp table images: merged cells mean standard deficiency80mm through230km/h and
  standard ramp `n=10V` through160km/h. The helper's low-speed445 floor is a conservative policy
  extension from the **limit-column** footnote, not a sourced standard-column requirement.
  Initial extraction errors were corrected. These remain explicit
  **older secondary/provisional** evidence, not claims about current ČSN certification. Figures and
  protected table layouts are not reproduced.
- SŽ S3X clauses11/38/45 and figures3/4/6: concrete-through-track ballast depth350mm, no-cant
  formation6.2m, ballast top3.4m, side slope1:1.25. The400mm path is a constrained-reconstruction
  exception without formation-width change, not a new-line minimum; SŽ S4 applicability stays explicit.
  The shaped upper ballast surface is supplied, not silently replaced by a full-width flat envelope.
- Current NV272/2011 §12 and annex3A:50dB base, +10 after2000 placed/permitted infrastructure,
  railway night−5 in the annex. Older-line/modernisation and relocation classification is not guessed.

Current motorway grade/vertical/sight-distance policy, rail transitions/deficiency rates, operational
ruling grade/vertical curves, clearance/electrification envelopes, priced rail components, rail emissions,
actual mode structures/connections, shared engineering and UI integration remain incomplete. No VALID,
best score, disabled-category flip, road-width impersonation, or rail quietness claim follows from M0.
The finite-segment noise-gap task remains outside this work.

## Checks

Behavioral coverage includes exact offset normals and continuity, compound arcs, reversed station
round-trips, collapsed inner radii, terminal corridor overlap, disconnected endpoint/interior collision,
bounded checks, one-sided curvature quantities, actual port mismatch, mixed train speeds, exposure
integration, ballast-ground contact, split-invariant track quantities and unknown imported metadata.
An independent review of the first geometry commit found three edge cases; all were fixed and covered
before this checkpoint. Full project/browser/GPU integration gates remain necessary once consumers wire
these modules into the app; no browser is needed to test these currently unimported pure kernels.

# M1 plan: playable, scored paired motorway and railway (2026-11-15)

Goal: a motorway and a railway the player can build and that get a real price and verdict, built on the
legacy route kernel through an explicit **mode policy row** (category), never by pretending a mode is a
road width. Increments, each committed green:

1. **Mode policy rows.** `data/categories.ts` rows gain `mode`, per-speed norms (horizontal, vertical,
   max gradient), structure/tunnel rows, noise source and `gradeSeparated`. Road rows and D11 bills stay
   bit-exact. Motorway: D27.5 VL1 section, Radimský radii, vertical/grade per research/33 (current values
   where found, otherwise PROVISIONAL older-edition values flagged like today's road rows). Railway:
   single/double track per research/23, /34; prices per research/32 or explicitly unpriced.
2. **Paired motorway kernel.** One evaluation on the corridor spine (shared formation once, SPK D27.5
   whole-category norm, D27.5 bridge row = average of both decks, two tunnel tubes), no at-grade
   junctions anywhere (every crossed road is bridged, passes over us, goes through an underpass or is
   rerouted to such a crossing; never to our ends), motorway noise (directional traffic, no doubled AADT).
   Ends are scenario ports (the motorway continues beyond the map); anything else is unpriced.
   `modeCapability('motorway')` becomes scoring for the paired corridor policy; COST_MODEL_VERSION 19.
3. **Project wiring.** A motorway is a paired corridor + two directional child routes (C0). The road
   widgets edit the spine through the active-route adapter; `evaluateProject` evaluates a corridor once
   and publishes it under the corridor's children; the bill is the corridor's, never a sum of children.
4. **Scenarios.** Separate `d3-motorway` / `d35-motorway` presets (own save namespaces) next to the
   unchanged road presets; D11 untouched and bit-exact.
5. **Rendering + UI.** Two carriageways with median and markings, twin decks, two tunnel portals; Build
   menu Motorway / Railway; mode-appropriate cards and profile; plain words in `terms.ts`.
6. **Split / rejoin.** Whole-corridor split per C0 (atomic helpers): each direction becomes its own
   editable alignment and profile (offset bends with exact radii, mapped heights); Rejoin is an explicit
   undoable reset. Each direction is engineered as its own carriageway body. Priced only once the union
   of the two bodies (shared median earthworks, combined noise, one building owner) is engineered;
   until then split corridors are shown, checked and listed as unpriced (no VALID, no best).
7. **Railway kernel.** Track policy (cant-derived radii, rail gradient/vertical curves, trackbed and
   formation quantities, rail bridges/tunnels, no level crossings: every road crossing grade-separated),
   rail noise per research/32 or explicitly unpriced; scored only if every needed check and price exists.
8. Gates: full AGENTS.md list, drag-perf all modes plus a motorway design, screenshots (next free numbers).
