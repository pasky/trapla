# C0 API checkpoint

The API checkpoint was approved at `c554f55`. The following storage/legacy-adapter checkpoint implements
safe migration, atomic project history and explicit endpoint/policy seams. This is **not completion of
C0 or C1**: network accounting and final UI integration remain pending. Additive project worker dispatch
now supports the exact one-road facade and honest incomplete multi-road proposals. Cost model stays 18.

## Modules

- `src/core/project.ts`: persistent `ProjectDesign`, discriminated `RouteDesign` / specifications,
  `MissionRequirements`, explicit XYZ `EndpointPair`, `AlignmentDesign`, `CorridorDesign`, source
  claims, staged `RouteKernel`, engineering/financial/acoustic proposals and `ProjectResult`.
- `src/core/project-transport.ts`: proposed additive `TransportMeta` / `TransportGraphData` pack
  contract. Joint C/S/U/M review still required before pipeline writes it.
- `src/core/project-protocol.ts`: additive `ProjectWorkerIn` / `ProjectWorkerOut`, stale/active-route
  acceptance helper and score gate. `worker.ts` dispatches these alongside unchanged legacy messages.
  Init must provide `projectEnvironment` (object/transport/terrain/pricing/water identities and terrain class).
  `project-eval` includes the last displayed `{epoch, revision}` or null. `project-preview` includes route ID,
  optional material value, and optional `gesture: {id, sequence}`. Full results remain exact-current;
  `acceptsProjectMessage(snapshot, message, activeId, {id, lastDisplayedSequence})` permits monotonically
  newer in-flight previews only inside that active gesture. Clear the window on commit/cancel, undo/redo,
  reload and route switch. Without a window, previews also require exact-current revision.
- `src/project-store-contract.ts`: commands, load outcomes, storage/recovery bytes, `ProjectStoreApi`,
  best/save envelopes and UI-only selection repair. Control selection must carry `routeRevision`; otherwise
  repair clears it rather than interpreting a shifted pin/PI index after undo.
- `src/project-persistence.ts`: `loadProjectSave(options)` reads/migrates before any legacy Store is created;
  returns loaded/migrated/needs-repair/unsupported/empty. Reads are pure. Unknown bytes never fall back.
- `src/project-store.ts`: `openProjectStore(options)` returns `{load, store}` (null store for unsupported).
  `initial()` applies scenario defaults only to empty storage. Frozen snapshots, copy-on-write drafts,
  atomic commands/cancel/undo/redo, bounded 200-entry history, monotone revisions and guarded best scores.
  An out-and-back drag settles without adding history or truncating redo. Sparse/non-JSON control arrays
  are rejected before serialization. Resolved mission anchors must match their actual port XYZ.
  `subscribe` returns unsubscribe. Storage errors propagate; migration recovery must persist first.
- `src/core/project-validation.ts`: runtime schema and corridor/route authority checks before publication.
- `src/core/project-legacy.ts`: `makeLegacyProjectContext(ctx, {presetId, packId, objectData, transportData})`
  constructs the legacy mission/endpoints/operations for bootstrap. `projectFromLegacyDesign`, `legacyDesignForRoute` and
  `replaceRouteFromLegacy` preserve stable identity and separate project building choices. Imported/exact
  paths and foreign crossing bindings are refused by the legacy adapter, never fitted silently.
  Legacy design-speed edits also update operating speed unless `operations.speedPolicy` is explicitly
  `independent`; no-op edits preserve operations. Defaults/preset seed PIs apply only through fresh initial().
- `src/core/project-road.ts`: `evaluateProjectRoad` dispatches before road defaults, returns a route result
  or machine-readable incomplete reason. It is NOT project accounting. Modes/source replacements/tangent
  constraints not supported here cannot get a road bill. Mission goals do not apply to auxiliary routes.
- `evaluate` / `autoProfile` now accept explicit endpoint elevations separately from terrain. Existing
  calls default identically. Operating speed and mission capacity demand are separately optional.
- `src/core/project-evaluate.ts`: `evaluateProject({legacy, environment}, snapshot)` publishes a complete
  single legacy mission with its unchanged bill and absolute day/night receiver levels. Multiple routes,
  mode foundations, source replacements and unsupported interactions have `cost.total = null`, no best,
  and proposed geometry only. `previewProjectRoute` evaluates just the active route; reference road paths
  remain explicit sampled proposals, never fitted to PIs. No route independence/cache claim yet.

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
connecting them to spine A/B. `vertical` separately selects Auto pins, manual VPIs, frozen built
station/elevations, or (reference paths only) original per-point elevation authority. Explicitly switching
the vertical discriminant relinquishes frozen/reference authority and triggers revalidation; ordinary
editing never quietly substitutes an Auto grade. Crossing choices target a pack-bound legacy way, exact
source interval, or designed route interval. Diagnostics carry separately route-qualified locations.
`TransportSurface` carries engineered XYZ/width/structure; it never replaces Terrain.heightAt.

A corridor is discriminated: paired owns `spine`; independent owns `retainedSpine`. Paired children
carry `alignment.kind = 'corridor'`; independent children own materialised `exact` alignment paths/controls.
Stable directional IDs survive both transitions; there is never a competing PI and spine authority.
Split/rejoin commands carry corridor and both children for one atomic edit. The store validates/applies
M's materialisation; it does not generate geometry. Direction-specific controls require an explicit split
first. Paired child-local control fields are rejected. Spine R maps to forward R; spine L maps to reverse R,
not extra median walls. All station/side remapping and frozen child elevations come from mode engineering. Mode owner
may export `modeCapability(kind)` as proposed; the project dispatcher must call it before constructing
legacy road defaults. Unknown policy or incomplete mode physics cannot return a priced valid route.
`CorridorKernel.propose` engineers a common formation with both child specifications; `RouteKernel`
exposes streaming `acoustics` before acquisition and after mitigation. Runtime inputs include real terrain,
building index and bounded transport-surface queries. `EngineeringGeometry` supplies authoritative tagged
triangle surfaces, terrain-mask boundaries and geometry-linked measured quantities; non-road renderers
never reconstruct earthworks, deck thickness or piers from a centreline.

Transport JSON uses `sources`, `nodes`, flat canonical `xy`, cumulative `stations`, string OSM IDs,
raw optional tags (missing = unknown), structure/layer facts, and `render` source-to-feature intervals.
`renderFeatures` resolves stable feature IDs to `VectorPack.lines` layer name and polyline index under an
explicit `vectorData` fingerprint. Each interval maps increasing source chainage to rendered cumulative
metres with piecewise correspondence knots (decreasing render chainage for reversed features).
Ground eligibility is explicit (`elevation: 'terrain'`); bridges/tunnels must be unknown or surveyed.
Surveyed source elevations carry matching z values and evidence. Shared OSM node IDs—not rounded XY—
are topology evidence. Gauge/electrification are never inferred; `tracks` is a raw tag, not way count.
`parallelSourceIds` preserves neighbour identity; own accepted replacement never masks that neighbour.
`vectorData` hashes decompressed vector bytes; nominal display width is not an engineering width.
Conflicting cache snapshots are listed in `unresolvedSources` with visible feature references, without
fabricated nodes/stations/mappings. Promotion must refuse these sources. D11 metadata is an optional
sidecar so frozen legacy `meta.json` and vector/net bytes remain unchanged.

Physical `acousticSourceId` is independent of editor route ID. Contributions are raw day/night energy
at common building/height receivers before acquisitions. Preserve max-over-stations within one physical
source (including editor splits), sum across distinct physical sources. Screening includes individually
quiet contributions and exposes an omitted **aggregate** energy bound. Mixed legal policies need a
policy decision; no addition of limit-relative excess. Finite-segment correction is out of scope.

Save/Continue helpers are `projectStorageKeys({scenarioId, presetId})` and
`hasProjectSave(storage, {scenarioId, presetId})` in `src/project-store-contract.ts`. The stable project
slot is `trapla.project:<encoded scenarioId>:<encoded presetId>`; the distinct role prefix
`trapla.recovery:<encoded scenarioId>:<encoded presetId>` holds recoverable old bytes. `packId` is persistent project data, never the save namespace. Continue includes
unknown/malformed saved bytes so recovery can run instead of silently starting over. Legacy Continue
still needs the bootstrap's existing legacy key until migration is implemented.

Snapshot identity is `{epoch, revision}`; epoch changes on load/context reset, revision increases even
on undo. Route revisions identify geometry; selection is outside undo/persistence. Full result messages
contain a coherent project and changed/removed/dependent route IDs, accepted-only render intervals,
global building outcomes and shared work surfaces. Requests acknowledge the displayed snapshot;
responses provide `baseIdentity` for change lists. If absent/mismatched, renderer compares every route's
`engineeringRevision` (includes dependencies), never change lists against the last evaluated but possibly
rejected snapshot. A later delta optimisation also requires this explicit base identity. Preview acceptance
also checks active route and route revision. Incomplete accounting has `cost.total = null`, never a
best score. Initial material balance remains independent per construction route.

## Next implementation steps

1. Integrate the implemented persistence/adapter API in U bootstrap. Never construct legacy Store first.
   The old Store now additionally preserves `.legacy-original` and refuses writes for unknown/malformed
   saved designs, but new bootstrap should use the separate project namespace and loader.
2. Extract engineering/acquisition/noise decision stages before any global ledger. The current route
   adapter still runs legacy internal decisions; it cannot be summed into a network score.
3. Complete C1 beyond the implemented topology foundation: class-specific reference-path engineering,
   actual branch connectors/relocations, joint footprint/crossing checks, acquisition/noise decisions,
   then final ledger pricing and accepted replacement publication. Do not sum route-kernel bills.
4. Add bounded old+new influence cache invalidation after dependency semantics are implemented. Current
   full project publication recomputes routes; drag preview evaluates only the active route.

Per-scenario `initial` category/speed is only a new-project default. Existing/current/best legacy designs
retain their category/speed; an unknown or malformed newer save is never overwritten with those defaults.

## Project price: own bills, unpriced changes and the independence ledger

`ProjectResult.cost` always carries data for the UI, never guesses:

- `alone[routeId]`: each evaluated road's OWN bill against the unchanged existing network (display only,
  label it as covering only that road). Never add these up yourself.
- `unpriced: {routeId, reason}[]`: road changes not covered by a project price. Non-empty ⇒ `total === null`,
  `complete/valid === false`, no best save (`isScorableProject` also checks it). Show e.g. "N road changes not
  priced yet". Reasons: the route's incomplete code (`source-needs-network`, `unsupported-mode`, …),
  `connection-pending`, `mission-needs-network`, or an interaction (`shared-land`, `shared-road`,
  `shared-building`, `shared-noise`, `too-many-roads`).
- Each evaluated road's own violations stay in `issues` (`blocking: 'invalid'`, route-qualified) even while
  unpriced. Interactions add `blocking: 'incomplete'` issues scoped to both roads (and the house, if any).
- Undo/discard is just a new snapshot: removing the unpriced change restores the scored single-road result.

One road: the exact legacy facade (D11 bit-exact). Several roads with no connections between them:
`screenIndependence` (`src/core/project-ledger.ts`) prices them together (`total` = sum of their own bills,
`cost.routes` the per-road shares) ONLY when a conservative screen proves nothing interacts:
land take, works and removed old roads (plus a 1:2 toe bound on links and a PROVISIONAL 10 m clearance) do
not touch; no existing road is changed by two roads, and no closure's detour can be affected; no building is
demolished/bought/kept-in-the-way by two roads; and every house belongs to at most one road for noise (in
its own noise list, or within 20 + 10·log10(N − 1) dB of the limit by the all-height hard-ground bound).
Further roads are neglected: together ≤ 1 % of one limit (≤ +0.043 dB at a house exactly at the limit,
below reported precision). Nearer roads stay unpriced until joint noise/wall decisions exist (C1);
the neglected energy bound is published in `acousticScreen`. Max 10 roads. Real D11 pack: ≈ 8–10 ms per
multi-road full evaluation (26 567 buildings); single-road and preview paths unchanged. Promoted/source
roads, joined roads, corridors and modes stay unpriced: joint engineering is still a later stage.

## Source proposal foundation

`src/core/project-network.ts` provides `ProjectTransportIndex`, `ProjectSurfaceIndex`,
`EffectiveProjectNetwork` and `projectNetworkViews`. `new ProjectTransportIndex(graph, transportData,
vectorData, terrain)` takes the real `Terrain` (or any `{heightAt, isOob}`); `heightAt` is display-filled
outside data, so ground positions where `isOob` holds are unresolved (null), never a usable road height. The source graph is cloned/frozen, canonical station
bounds are checked, unknown bridge/tunnel elevations stay unknown, render intervals clip through their
explicit correspondence, and candidate exclusions remain separate from the accepted network. Spatial
queries have cell/work budgets, inclusive diagonal-corner coverage and unsafe-coordinate rejection.

`src/core/project-promotion.ts` exports:

- `groundRoadSourceInfo(base, sourceId)`: source name/class, existing study-width prior and numeric tagged
  speed or null. It does not copy mission speed/traffic onto a track or treat missing traffic as silence.
- `promoteGroundRoad(base, {routeId, acousticSourceId, interval, specification, name})`: an atomic
  `promote` command preserving the exact bounded reference path, endpoint source identities and every
  real branch occurrence (including another station on the same source). Caller supplies explicit road
  operation assumptions; unresolved/conflicting sources and unsupported structures are refused.
- `assessReplacementConnections(base, project, proposedSurfaces)`: **topology feasibility only**, not
  engineering acceptance. It checks branches, source continuations, conflicting claims, current proposed
  XYZ, fingerprints, and connected dependency failures. An endpoint anchored to a source point that another
  route replaces fails (`source-endpoint-replaced`): re-anchor it to that route. Two adjacent promotions
  need one explicit connection naming both routes; separate promotions sharing a boundary fail conservatively.
  A stretch sharing a node with a railway (level crossing) is refused for now. Its `feasibleIntervals` MUST NOT directly become
  accepted render/source replacements or a valid score before the remaining engineering stages finish.

The first UI wave may edit, undo and reload these proposals; it remains unscored. Invalid new-road
geometry and its route bill remain visible. `RouteResult.accepted` is not a visibility filter;
only final `acceptedReplacements` may remove base infrastructure. The worker deliberately publishes none
for multi-road/source proposals in this foundation. Tests exercise source promotion/branches,
reconnection to another proposed road's XYZ, separation from stale accepted surfaces, undo/reload,
repeated-node identities and conservative refusal—not completed C1 construction/accounting.

No browser/GPU gates were run for the initial unintegrated types/API checkpoint. Integration/full gates and
screenshots are still required before feature merge. No claim of playable multi-road scoring yet.
