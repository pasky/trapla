# C0 API checkpoint

This is an early, unintegrated contract checkpoint, **not completion of C0 or C1**. No legacy
kernel, Store constructor, worker dispatch, scenario values or renderer changes yet. Cost model stays 18.
Parent review is required before UI/mode/pipeline consumers freeze these names.

## Modules

- `src/core/project.ts`: persistent `ProjectDesign`, discriminated `RouteDesign` / specifications,
  `MissionRequirements`, explicit XYZ `EndpointPair`, `AlignmentDesign`, `CorridorDesign`, source
  claims, staged `RouteKernel`, engineering/financial/acoustic proposals and `ProjectResult`.
- `src/core/project-transport.ts`: proposed additive `TransportMeta` / `TransportGraphData` pack
  contract. Joint C/S/U/M review still required before pipeline writes it.
- `src/core/project-protocol.ts`: additive `ProjectWorkerIn` / `ProjectWorkerOut`, stale/active-route
  acceptance helper and score gate. These messages are **not yet dispatched by worker.ts**.
- `src/project-store-contract.ts`: commands, load outcomes, storage/recovery bytes, `ProjectStoreApi`,
  best/save envelopes and UI-only selection repair. Store implementation follows review.

## Important choices

IDs are strings allocated once, never array indices or geometry hashes. `objectData` remains the
legacy object fingerprint; `transportData` independently identifies the additive topology and is null
for old packs. Source intervals carry `transportData`, source ID and increasing canonical chainages.
Candidate exclusions do not imply accepted replacement. Only completed feasible engineering commits
accepted source ownership; failed candidates leave the old network usable.

Endpoints store XYZ, optional tangent and source/route/mission anchor, with unresolved binding explicit.
Imported paths store original xy and per-point ground/known/unresolved elevation, not fitted PIs. An
`exact` alignment carries persistent `path: {elements: Element[], length: number}` plus controls for
materialised motorway offsets. Child endpoints carry their actual offset XYZ/tangent ports, not a cap
connecting them to spine A/B.
`TransportSurface` carries engineered XYZ/width/structure; it never replaces Terrain.heightAt.

A corridor is discriminated: paired owns `spine`; independent owns `retainedSpine`. Paired children
carry `alignment.kind = 'corridor'`; independent children own materialised `exact` alignment paths/controls.
Stable directional IDs survive both transitions; there is never a competing PI and spine authority.
Split/rejoin commands carry corridor and both children for one atomic edit. Mode owner
may export `modeCapability(kind)` as proposed; the project dispatcher must call it before constructing
legacy road defaults. Unknown policy or incomplete mode physics cannot return a priced valid route.

Transport JSON uses `sources`, `nodes`, flat canonical `xy`, cumulative `stations`, string OSM IDs,
raw optional tags (missing = unknown), structure/layer facts, and `render` source-to-feature intervals.
Ground eligibility is explicit (`elevation: 'terrain'`); bridges/tunnels must be unknown or surveyed.
Surveyed source elevations carry matching z values and evidence. Shared OSM node IDs—not rounded XY—
are topology evidence. Gauge/electrification are never inferred; `tracks` is a raw tag, not way count.
`parallelSourceIds` preserves neighbour identity; own accepted replacement never masks that neighbour.

Physical `acousticSourceId` is independent of editor route ID. Contributions are raw day/night energy
at common building/height receivers before acquisitions. Preserve max-over-stations within one physical
source (including editor splits), sum across distinct physical sources. Screening includes individually
quiet contributions and exposes an omitted **aggregate** energy bound. Mixed legal policies need a
policy decision; no addition of limit-relative excess. Finite-segment correction is out of scope.

Save/Continue helpers are `projectStorageKeys({scenarioId, presetId})` and
`hasProjectSave(storage, {scenarioId, presetId})` in `src/project-store-contract.ts`. The stable project
slot is `trapla.project:<encoded scenarioId>:<encoded presetId>`; a sibling `.legacy-recovery` holds
recoverable old bytes. `packId` is persistent project data, never the save namespace. Continue includes
unknown/malformed saved bytes so recovery can run instead of silently starting over. Legacy Continue
still needs the bootstrap's existing legacy key until migration is implemented.

Snapshot identity is `{epoch, revision}`; epoch changes on load/context reset, revision increases even
on undo. Route revisions identify geometry; selection is outside undo/persistence. Full result messages
contain a coherent project and changed/removed/dependent route IDs, accepted-only render intervals,
global building outcomes and shared work surfaces. A later delta optimisation must include an explicit
base snapshot identity; never infer unchanged results from the active route alone. Preview acceptance
also checks active route and route revision. Incomplete accounting has `cost.total = null`, never a
best score. Initial material balance remains independent per construction route.

## Next implementation steps

1. Runtime schema validation and safe read/migrate BEFORE current Store's destructive initial persist;
   separate project key/recovery bytes, current+best compatibility and atomic draft/undo/reload.
2. Legacy facade adapter and explicit endpoint/policy/staging seams; verify frozen D11 bills and geometry.
3. Immutable transport index, bounded promotion preserving branches, candidate/accepted source ownership,
   effective designed 3D network and shared ledger; real ground-road reconnection vertical slice.
4. Worker dispatch/cache with bounded old+new influence invalidation, project acoustic/property decisions.

Per-scenario `initial` category/speed is only a new-project default. Existing/current/best legacy designs
retain their category/speed; an unknown or malformed newer save is never overwritten with those defaults.

No browser/GPU gates requested for this unintegrated types/API checkpoint. Integration/full gates and
screenshots are still required before feature merge. No claim of playable multi-road scoring yet.
