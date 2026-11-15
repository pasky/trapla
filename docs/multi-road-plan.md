# Multiple routes, new scenarios, motorways and railways

Status: challenged and revised implementation plan, 2026-11-15. Baseline `cb71b2c`, cost model 18. Supersedes PLAN's
single-road/v1 exclusions, not its realism and performance rules. Source reconnaissance:
[research/21](../research/21-network-scenarios-modes.md). All stages below are part of the requested
direction; a foundation or disabled mode is not completion of the player feature.

## 1. Product decisions

The player edits a **project**, not a privileged orange road. A project contains new routes and changed
stretches of existing roads/railways; untouched infrastructure stays immutable scenario data and costs
nothing to retain. One route is active for editing and the profile; all constructed routes stay visible.
Click any road to inspect it, then **Change road** to choose the stretch to rebuild. Drag an already
editable route to bend it. Switching roads never changes the design or adds an undo entry.

- Scenario #1 keeps its existing road challenge and saves. Do not silently turn old D11 designs into
  motorways. Scenarios #2/#3 use the previously chosen D3/D35 corridors; #4 is a class-I road bypass.
- **Class I road** (silnice I. třídy), **Motorway** (dálnice), **Railway** are infrastructure kinds, not
  merely widths. Legal road class, cross-section, speed and traffic are separate inputs.
- A motorway is a paired corridor: **Both directions** by default; **This direction** edits one
  carriageway. Joining the pair again is an explicit, undoable reset of independent edits, never a
  silent overwrite. Railway can be chosen when building in a road scenario, notably for a relocation.
- Selection always identifies its route. Buildings are project objects; a crossing relates two
  routes or one route and a source-network interval. No bare station/index may switch meaning when
  the active route changes.
- The sticky score is the complete project bill. The inspector/profile show the active route's share.
  Travel goals concern the scenario's required connection(s), not every minor road. Keeping the
  required connection and existing branches usable is a constraint, not optional map decoration.
- Unchecked interactions or unsupported mode physics must never yield a green VALID/best score.
  Temporary implementation gates are not the intended UX; implement ordinary remedies, rather than
  shipping engine-limit cards as the normal way to play.

## 2. Current coupling (read before changing it)

| Area | Current single-route assumption | Migration seam |
|---|---|---|
| `core/evaluate.ts` | `Design` holds one PI/VPI set, category/speed and all object choices; A/B live in `EvalContext`. `Result` is station arrays plus geometry, noise, bill and validity. | Preserve this route kernel and legacy API first; add a project orchestrator around it. Extract policies only when required by a real mode. |
| `core/data/scenario.ts` | one AADT, time goal, max grade, class-I TP188 capacity prior | scenario mission + initial route specification; per-route operating/design assumptions; no goal for every auxiliary link |
| `state.ts` | JSON-cloned `Design` history, best, pack-index cleanup | versioned project saves, project-wide atomic undo, explicit legacy migration; active-route UI state separate |
| `worker.ts`, `main.ts` | one latest pending design/result; main keeps one last/full result and one material value | project generation + route revisions; dirty-route cache; active preview; immutable completed project snapshot |
| `main.ts`, `ui/inspector.ts` | `Sel` has bend/VPI/building/crossing indices and route-relative stations | route-qualified selection wrapper; one active-route adapter for existing widgets |
| `render/view.ts` | endpoints read directly from `pack.meta.A/B`; one route ribbon/mask, `setDesign`/`buildResult` | explicit endpoints and independently owned route render groups; project-level terrain mask |
| crossings / `RoadNet` | immutable road ways with pack-local indices, no designed elevations; automatic repairs are owned by one evaluated road | immutable base network + exact replacement intervals + designed 3D route surfaces + one shared-work owner |
| pipeline | roads exclude existing bridges/tunnels; rails are raster/render vectors, not an editable topology; no stable OSM IDs in `net` | additive editable-transport metadata, provenance and exact source references; keep legacy pack compatibility |
| scenario loading | `?scenario=id` and `SCENARIO=id` already work, only D11 registered; required official line chains forward OSM ways only | catalogue/picker, robust references/proposed ways, per-scenario defaults and reproducible build manifest |

Current full eval is about 90–150 ms; a preview about 20–30 ms. `docs/evaluate-performance.md` is
more authoritative than stale README timing paragraphs. Crossing geometry and terrain collars are
already cooperatively staged. Do not lose that pipeline while generalising the renderer.

## 3. Model and agreed boundaries

Names below define responsibilities; core publishes exact exported TypeScript signatures before UX
integration. Preserve `Design`/`evaluate(ctx, design)` as the legacy single-route kernel, and introduce
`ProjectDesign`/`evaluateProject` in new modules. Avoid a repository-wide rename as the first change.

```ts
// Shape sketch, not a second implementation of the interfaces.
type RouteId = string;
type RouteKind = 'road' | 'motorway' | 'railway';
interface ProjectDesign {
  schemaVersion: number;
  scenarioId: string;
  objectData: string;                 // identity of source objects/topology
  routes: RouteDesign[];              // only constructed/changed routes
  buildingOverrides: BuildingOverride[]; // one project-wide owner
  connections: ConnectionDesign[];    // actual endpoint/branch relationships
  corridors: CorridorDesign[];        // paired-mode spine + stable child route IDs
  mission: MissionRequirements;       // required ports, directions, kinds, time/capacity
}
interface RouteDesign {
  id: RouteId;
  name: string;
  kind: RouteKind;
  role: 'mission' | 'auxiliary';
  endpoints: EndpointPair;            // fixed world positions; anchors carry source/route refs
  source?: SourceReplacement;         // pack fingerprint + way IDs + exact station intervals
  alignment: AlignmentDesign;         // PI/VPI/pins/structures/walls, no global building decisions
  specification: RoadSpec | MotorwaySpec | RailwaySpec;
}
interface ProjectResult {
  routes: Record<RouteId, RouteResult>;
  works: SharedWorkLedger;
  cost: ProjectCost;
  violations: ProjectViolation[];     // route-qualified targets, including pair conflicts
  complete: boolean;
  valid: boolean;
  revision: number;
}
```

### Identity and migration

- Stable route IDs are allocated on creation, never array positions; undo restores the same IDs.
  Source references include the pack fingerprint. Existing numerical way IDs remain valid *within*
  that pack; additive OSM IDs/names/class/layer/bridge/tunnel/rail metadata aid provenance and future
  remapping, but do not justify blindly rebinding an old save after a pack change.
- Read legacy bytes **before constructing today's Store**, which writes immediately. Use a separate
  versioned project key and a recoverable original. Migration returns loaded / migrated / needs-repair /
  unsupported; unknown schemas never fall back destructively. Commands include begin/update/commit/cancel,
  create/promote/delete/connect and split/rejoin; failed promotion rolls back atomically. After undo or
  deletion, repair active UI selection without modifying the project.
- Migrate a legacy save into one `mission` road with its original category, speed, A/B, controls and
  **unchanged bill**. Lift building choices to the project. Keep a recoverable old save and do not
  overwrite malformed/unknown newer schemas with defaults. Migrate current and best consistently;
  old bests survive only when model, pack, mission and evaluation semantics really match.
- Source-dependent rebuilds cannot be silently dropped when a pack changes: keep the user's geometry
  and mark the anchor/source binding unresolved until repaired. Invalidate the score. Station-based
  edits remain attached to their route. Schema version is separate from `COST_MODEL_VERSION`.
- Group a creation, endpoint adjustment, source replacement or paired-carriageway edit into one undo
  transaction. Committed snapshots contain the entire project, not whichever road is active.

### Existing roads and rails

Promote a **bounded stretch**, not an entire arbitrarily split OSM way, into a route with surveyed-map
geometry as its starting reference. Two visible handles choose its ends; connected continuations and
branches must survive. Do not force a new 90 km/h S9.5 onto a track or treat all existing curves as legal
new construction. Supply road-class-specific policies and preserve untouched sections without charging
their reconstruction. Existing grade is terrain-derived only where the data actually describes a ground
road; bridge/tunnel elevations need explicit evidence or an unresolved-data state, not a draped bridge.

Publish an additive transport graph with source/node identities, canonical source chainages, explicit
connectivity/layer/structure/elevation status and source-to-render correspondence. Rounded XY contact is
not proof of a connection across layers. Keep legacy `net` unchanged for D11 compatibility. S/C/U jointly
review this schema before pipeline edits; M declares rail/carriageway needs too. Retained-source queries
or regenerated masks must preserve another road/rail crossing the same pixels.

Candidate evaluation provisionally excludes its own claimed source intervals to avoid self-collision.
Accepted ownership is separate: replacement intervals are committed only for a feasible built connection.
On failure the old usable network remains authoritative, with the proposed geometry shown as unaccepted;
conflicting claims and lost branches block acceptance. The effective network is the
base minus accepted source intervals plus designed geometry. Roads removed from rendering must also be
removed from crossings/footprints and vice versa. Raster rail protection must be replaced only inside
owned rail intervals, never erased globally or under unrelated tracks. The vector base-map renderer must
mask old pavement/track in the same owned interval, including its display width.

Imported map polylines and built 3D remedy paths are not generally representable unchanged as today's
PI/arcs + terrain-ended VPI design. C0 must choose a persistent reference/imported-path representation,
or a bounded fitting operation with visible changes and revalidation. Branched remedies can promote into
multiple linked routes/shared works, with stable work identity and atomic source/bill transfer.

Automatic crossing remedies remain derived work unless the player chooses **Change road** on them.
Promotion freezes the actual built geometry/anchors and transfers ownership, replacing—not adding to—the
automatic work. Aborting or undoing returns to Auto without two competing roads or two bills.

### Project evaluation and financial ownership

The legacy facade needs **internal staged seams**, not post-processing of completed route bills:
geometry/engineering proposals → project decisions → final quantities/checks. Current evaluate acquires
buildings, chooses walls, terrain-pins endpoints and prices repairs internally. Extract those policies
while preserving defaults exactly. Expose transport-surface height separately from terrain, endpoint
XYZ/tangent constraints, per-route operations and explicit mission checks. Never override Terrain.heightAt
to fake another road: excavation still needs the real ground. Initially material balance remains per
construction route; cross-route spoil exchange is out of scope and stated, not a hidden 'optimal' claim.

1. Resolve immutable project inputs and exact source bindings. Build a spatial index of edited routes
   and their influence envelopes (earthworks, supports, connection reach, noise).
2. Run route geometry/profile/sections against the effective network. Designed roads expose actual
   elevations, width and structures; inserting their xy into today's ground-only `RoadNet` is insufficient.
3. Resolve pair crossings, branches, overlapping footprints and shared structures with deterministic
   ownership. Re-run affected routes in a bounded stable order when a remedy changes their constraints.
   Detect nonconvergence and report it; never accept a cache-dependent or route-order-dependent score.
4. Reconcile shared land, property, connectors and structures into a ledger. Charge every physical work
   once; attribute its cost to a route or explicit shared item. Per-route attribution plus shared rows
   must equal the total. Do not merge unrelated objects solely because their geometry hashes match.
5. Apply building decisions once, then check combined exposure. Road-source energies add across routes
   for a given day/night receiver; do not add dB, take a network maximum, or bill several acquisitions
   of one house. This needs raw day/night contributions at common receiver heights before acquisition,
   a bounded aggregate screening distance including individually quiet sources, and a project mitigation
   recheck. Current maximum-excess/rays results are insufficient. Physical acoustic source IDs are
   independent of editor route IDs: splitting one road cannot manufacture a +3 dB source. Unchanged
   background traffic is initially excluded (as today); relocation replaces its source rather than
   adding a duplicate. Mixed road/rail assessment needs explicit legal/policy treatment, never addition
   of excess values relative to different limits. Preserve today's max-over-stations approximation
   within a physical source; finite-segment correction remains separate. Project house/noise views show
   the combined deciding exposure, not contradictory safe-looking independent bands.
6. Validate mission connectivity/time/capacity, all modified routes and final geometry. Untouched base
   roads do not acquire arbitrary new-build violations. Publish only a coherent project revision.

An initial foundation may expose unsupported interactions as incomplete (not scored), but the playable
multi-road milestone requires ordinary route-route crossings and existing-road reconnections to work.
Do not call a `sum(evaluate(route).cost)` implementation network evaluation. For independent disjoint
roads, route reuse is safe only after the influence/dependency screen proves independence.

## 4. UX and rendering

- Start screen: four scenario cards, each place, road kind and a one-sentence goal; **Start / Continue**.
  A direct `?scenario=d11` link bypasses the picker for reproducible scripts. Root opens the picker;
  existing smoke/playtest URLs must explicitly choose D11. A **Scenarios** button returns to it without
  discarding saved work. Missing/unbuilt packs get an actionable message, never a broken terrain view.
- Top-left compact route control: active name plus **Build**; list contains project routes, not thousands
  of base OSM ways. Any base road is selectable on the map, even if it does not cross the mission road.
- Base-road card: name/class, **Change road**, then visible start/end handles and **Apply / Cancel**.
  User can choose a wider stretch without modifier keys. Railways use the same verbs.
- Project road click activates and selects its piece in one action. Draw handles only for the active
  route; other constructed routes remain solid, visible and pickable, not ghost sketches. Profile,
  bend controls, choices and per-road bill all switch together. Global building card offers relevant
  contributing routes without forgetting the project-level Keep/Buy out decision.
- **Build** offers Road / Motorway / Railway and visible endpoint selection, with click-to-place enabled
  only within that explicit tool. Outside it, empty single clicks remain harmless.
- Motorway control: **Both directions / Towards <end A> / Towards <end B>**. Direction labels and left/right
  walls follow travel orientation, not arbitrary world coordinates. Show both routes in the map even
  when editing one; profile follows the selected direction. A shared spine edit moves the pair together.
- Route groups own their meshes, labels and disposal. Shared terrain masks/collars cannot be replaced by
  whichever route finishes last. Rebuild only dirty geometry and its overlapping collars; stage the
  visible project swap so old/new road generations are never mixed into an apparently settled view.
- Keep `window.trapla.setDesign/result` legacy adapters for D11 scripts; add explicit project and
  active-route hooks. Test real mouse selection of a non-crossing road, edit, switch, undo, reload.

## 5. Motorway and railway engineering

Mode work starts in independent pure policy/geometry modules, then plugs into core/UX after the
project contract lands. Evidence and gaps are in research/21; add focused research notes as gaps close.

### Motorway

A motorway `CorridorDesign` owns the common alignment and stable child carriageway IDs; `MotorwaySpec`
defines cross-section/operations, not another competing alignment. Paired children derive their geometry;
independent children own their alignments. Splitting/rejoining defines transfer/reset of pins, walls,
structures, station correspondence and endpoint ports in one transaction. Paired
mode derives proper offset curves and a common formation, **not shifted PI coordinates**. Offset radii,
inside-curve degeneracy, median clearance, self-intersections, unequal station lengths and endpoint
connections need checks. Separate mode materialises two alignments with stable directional IDs; a
correspondence to the original spine remains for paired edits/return. Store explicit edit state, never
rederive independent tweaks from a transient render mesh.

One authoritative formation/structure proposal feeds both the bill and renderer. Unioning land after
two independently computed carriageway earthworks cannot repair double volumes or incompatible supports.
Measure the union formation/median earthworks and property once. Split decks/tunnel tubes only where
actually built. The D27.5 norm is already a complete divided-road rate: do not charge it per carriageway
or halve every component indiscriminately. Shared works and separate structures need component ownership.
Use actual carriageway noise sources and directional traffic totals without doubling AADT. No at-grade
crossroads or direct field accesses; endpoint connections and any required interchanges must be drawn,
validated and billed. A grade-separated crossing alone is not an interchange.

2018 public evidence supports design speeds 130/120/110 and minimum radii 840/690/560 m at 6% crossfall
(Radimský slide 6); it does not establish a complete D27.5 cross-section or current vertical-curve table.
Research those rather than inheriting the 90 km/h road rows. Source-dependent limits may remain expressly
provisional as in today's game, but cannot be made up to pass a chosen route. Mode rollout must document
what VALID means and must not claim detailed engineering certification.

### Conventional rail

First operating case: conventional standard-gauge single track, with explicit speed, passenger/freight
mix, electrification and train counts. Scope is building/rerouting a through line, not stations/signals
or a train timetable simulator. Preserve connections to the unchanged railway at both ends. Double track
can use the same grouped-corridor machinery later, with sourced spacing and swept-envelope checks.
Selecting existing double-track/electrified rail must preserve its neighbour and operation assumptions;
capability checks must not silently convert the whole corridor to the single-track prototype.

Use rail-specific horizontal/cant/transition, vertical, clearance and formation policies; track/ballast/
subgrade, structures, electrification, demolition and reconnection prices are separate measured items.
No road AADT capacity thresholds, 6% road gradients, paved-road SPK base prices, road noise emissions or
automatic road-junction choices on rail. SŽ S3 points to ČSN 73 6360-1/-2 and SŽ S11/ČSN 73 6320. Retrieve
applicable public SŽ/TSI/teaching/project sources and record every adopted numeric rule and confidence.
A non-scored editor can land before complete acoustics/costs, but an enabled scored railway requires an
honest operational/noise policy and explicit game assumptions. Never silently pronounce it quiet.

## 6. Scenario decisions

| # / id | Place and goal | Pack / gameplay decisions |
|---|---|---|
| 1 `d11` | Trutnov → Polish border; existing cheapest-road mission | preserve the exact legacy pack and default, model-18 fixtures and saves |
| 2 `d3` | Posázaví, Jílové/Hostěradice → Václavice; cross the Sázava landscape while choosing valleys, bridges and tunnels | retain PLAN's D3 choice; include the river crossing (do not pick a section south of it by accident). Inspect 0302+0303 reference and choose A/B within a roughly 20–25 km-wide playable envelope. Clearly state the actual endpoint names/subsection. |
| 3 `d35` | Opatovec → Mohelnice corridor; negotiate the ridge and settlements | full corridor is about 35 km. Prefer the full named connection if measured memory/eval budgets permit; otherwise explicitly name the first playable stage Opatovec → Staré Město (16.6 km, Dětřichov tunnel reference), with Mohelnice as a later extension—not a falsely labelled endpoint. Report this decision before merge. |
| 4 `i16-nova-paka` | I/16 Nová Paka; take through traffic around the town without excessive earthworks | real class-I southeast bypass, 8.479 km reference, S11.5/70. Short introductory/urban exercise; roughly 15 km square initial envelope. The actual new bypass is already present in current OSM: exclude its owned reference corridor from the baseline or explicitly use a sourced historical snapshot, so the player is not building a duplicate alongside a free completed bypass. Preserve the old town road. |

For Nová Paka, removing a completed OSM bypass does not restore pre-build ground: inspect DMR/orthophoto
dates and disclose any residual built-earthwork advantage, or use sourced historical terrain. Exclusions
must agree in topology, relevant raster layers and rendering, preserving the old road and its branches.
Reference extraction must detect disconnected/ambiguous branches; an optional reference must also work
through View/labels/scripts, not just the pipeline.

Bounds are planning envelopes, **not fetched/verified coordinates**. Scenario work must verify endpoints,
continuous references, current OSM coverage, geology classification and raster dimensions before freezing
configs. ČÚZK/OSM availability is national service coverage, not proof a pack has been built. Use isolated
cache keys. Official/proposed lines are contextual, not a forced player route; support absence honestly
rather than fabricating an 'official' polyline. Raw extracts remain ignored; commit reproducible fetch
queries/manifest and source notes instead.

Ship the scenario data independently of mode rollout. Initial D3/D35 road challenges may be explicitly
labelled road exercises in those corridors, as D11 is today; final motorway missions are separate explicit
presets once the motorway kernel is ready. Do not market a two-lane road as a completed motorway scenario.
Traffic and heavy share need local counts/project forecasts, or marked game priors; target time X is a
mission choice, not a norm. No value is selected to force a desired cost ratio. Nová Paka should permit a
70 km/h class-I route: do not copy D11's '70 must be impossible' tuning heuristic. Record default kind,
category/speed and goal per scenario. Existing D11 geology calibration must not silently become locally
calibrated evidence elsewhere. Keep priors explicit and inspect predominant new lithologies.

## 7. Workstreams and dependency graph

```
Plan + interface agreement
  ├─ S: scenario pipeline/configs/picker/defaults ───────────────────────┐
  ├─ C0: project schema/migration/route policy seam                     │
  │    └─ C1: effective network + ledger + incremental evaluator ──┐   │
  ├─ U0: multi-route UX components/picking/render ownership         │   │
  │    └─ U1: store/worker/UI integration (after C0/C1) ◄────────────┘   │
  └─ M0: sourced motorway/rail policies + paired geometry               │
       └─ M1: mode kernels and mode UI integration (after C/U) ────────┤
                   integrated scenario/multi-route/mode gates ◄───────┘
```

- **S, scenarios + picker:** owns `pipeline/*`, new scenario research/configs, `core/data/scenario.ts`,
  scenario catalogue/picker module and `src/scenario.ts` metadata. Main bootstrap is a small coordinated
  hunk only; no edits to route store/worker/evaluator. Publish additive transport metadata schema before
  changing it. Can delegate per-scenario builds, but one owner merges shared pipeline changes. Copy new
  ignored packs back to the parent after review; a code merge does not transfer them.
- **C, core project/network (deep):** owns new `core/project*` / network modules, core policy seams,
  `state.ts` compatibility/migration and project-store module, worker project protocol, core tests.
  Defines mission/spec interfaces in its own module; S owns catalogue values in scenario.ts. Publish C0 exact interface
  early and yield for integration; keep old evaluator API/fixtures green. Own shared ownership, cache
  invalidation and route-route physical interactions. Do not edit main/UI/render or scenario catalogue.
- **U, UX (deep):** owns `main.ts`, `ui/*` except picker, `render/*`, `style.css`, integration scripts.
  Start route-aware components and rendering/picking design now; consume C's exported contract rather
  than inventing a competing store. Own all final UI wiring, active-route adapters and real-mouse tests.
  Additive scenario bootstrap changes coordinated with S. Do not fork the physics in the renderer.
- **M, modes (deep):** owns new mode policy/geometry/data modules and research notes/tests. Source gaps
  first, then pure paired-carriageway geometry and rail-specific inputs; coordinate core policy hooks
  with C. Request evaluator integration changes from C rather than parallel edits to 1100-line evaluate.
  Do not flip `D27.5.enabled` merely because a table or preview mesh exists. Can delegate pure research
  in research mode, then critically review its conclusions.

C0 freezes persistent schema, commands/migration, source/surface/endpoint contracts, engineering proposals,
and published snapshot/protocol (project epoch/revision, changed/removed route IDs, accepted replacements,
shared ledger and project receivers). C1 is one end-to-end vertical slice: promote a ground road with a
branch, reconnect to another designed road, bill once, undo/reload. C2 broadens interactions/global
mitigation and proves incremental cache correctness. Types must allow C2; C0 need not pretend to solve it.
C0 acceptance: exact legacy D11 bill/geometry, transaction cancel/undo/reload identities, stale response
rejection, explicit endpoint render adapters. U can build against fixtures before C1, not fake network scores.

Each stream returns committed, independently testable milestones and an explicit list of missing user
behaviour. Parent reviews C0 before allowing U/M integration, and all merges serially. Rebase/merge parent
updates deliberately (`GIT_EDITOR=true`); never use shared `git stash`.

## 8. Performance and acceptance

Worker cache keys include route design revision, endpoints, specification/traffic, terrain/object/water
fingerprints, global building decisions and every dependent route/source interval/shared-work revision.
Invalidation uses both old and new influence bounds. A move out of another route's old corridor must
invalidate it too. Connection dependencies can propagate beyond the visible crossing. Bounded indexed
queries, no route×building or triangle Cartesian products. Cache memory must be bounded; no whole-project
history of typed-array results.

During drag, preview only the active route (both carriageways in paired mode). Other routes stay at their
last settled geometry, clearly pending if dependent. The project score is approximate until all dirty
routes and reconciliation finish; never offer an intermediate best. Worker responses carry project
revision and route identity; switching routes cannot paint an old response onto the new active route.
Use dirty-result messages/reuse rather than cloning every unchanged result per pointer move. Maintain
cooperative geometry rebuilds and shared materials; no heavy work in animation frames.

Keep existing GPU drag budgets unchanged in **bend, road, radius, pin, vpi** modes: frame p95 ≤34 ms,
preview latency p50 ≤60/p95 ≤120 ms, handler p95 ≤25 ms, no ≥50 ms long tasks or new shader compilation.
Compare full eval on the identical D11 pack and inputs; add two/three-route tests proving unchanged far
routes are reused. Serialize hardware-GPU measurements across agents; concurrent Chromium invalidates
comparisons. Close every browser/server in `finally`.

Before every merge (run on integrated parent again when shared wiring changes):

```
npx tsc --noEmit
npx vitest run
npm run build
node scripts/smoke.mjs
node scripts/playtest.mjs
for mode in bend road radius pin vpi; do
  node scripts/drag-perf.mjs --gpu --mode "$mode" --check
done
npx tsx scripts/bench.ts scripts/*.json
npx tsx scripts/eval-regression.ts
# For crossing/footprint changes:
npx tsx scripts/outcome-audit.ts --straight scripts/*-design.json --random 24
# Pipeline changes:
uv run --with numpy --with shapely python -m unittest discover -s pipeline -p 'test_*.py'
```

All saved designs valid and every parts sum reconciled. Keep new scenario fixtures under scenario-specific
subdirectories so the existing D11 `scripts/*.json` invocation cannot apply them to the wrong terrain.
Schema/wrapping alone does not bump the cost model. Reviewed changes to prices, validity rules, combined
noise or shared-cost accounting do; core owns the bump, delta report and reviewed fixture capture. Never
recapture frozen bills to make an unexplained regression green.

Inspect screenshots personally: four starts/endpoints, selecting a non-mission road away from crossings,
two built roads together, a branch-preserving relocation, undo/reload, motorway median/ends/independent
direction/bridges/tunnels, rail track and ground connections. Add real-mouse playtests for these; inspect
existing tests before adding new ones, never tests that merely restate a table. All player words go through
`terms.ts` conventions and `player-text.test.ts`: one card, few plain words, no IDs/codes/internal jargon;
source citations belong in rule/detail/pricing text. New numbered screenshots continue after 72; reserve
ranges per stream before writing the gallery to avoid collisions.

Worktrees must copy `/home/pasky/projects/trapla/public/scenarios/` and `pipeline/cache/` (ignored) before
running. Use `uv` for Python. Bound memory and dimensions for raster/mesh scripts. Commit tested code in
the worktree, report gates/screenshots/limitations, await parent review; merge only after approval, then
parent closes the agent with a separate `/quit`.

## Separate candidate, not this change

The house-card session found that max-over-stations treats each station as a full infinite noise line.
A ~15 m wall opening seen from ~76 m should have a much smaller angular contribution (about −12 dB in
the simple straight-line example). Sourced finite-segment/angle-of-view aggregation is a candidate next
engine task, with a cost-model bump and acoustic validation. Do not fold it into this already large
migration or silently change the one-route model while adding network ownership.
