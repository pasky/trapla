# Multi-road UI integration checkpoints

## U0 — render ownership and selection

This is a tested integration foundation, **not yet the editable-network player feature**. At the U0
checkpoint the running app still used its legacy single-route store; U1 wiring below replaces that.

- `render/route-scene.ts` consumes ephemeral `{id, result, crownWidth}` adapters. It builds actual route
  ribbons, slopes, structures, collars and crossing meshes from authoritative `Result` geometry.
- `RouteGroups` owns meshes and disposal per stable route ID. A cancelled build never changes the scene;
  a superseded staged snapshot cannot commit. A whole generation swaps synchronously, then draws one
  union terrain/footprint/crossing mask. Unchanged distant results retain their existing meshes.
- Crossing/collar builders receive an immutable per-generation surface context. They no longer modify
  `View` staging state while yielding. Neighbour changes invalidate overlapping collars, including a
  neighbour moving away. Shared ground collars are clipped out of every settled road footprint.
- `View.setDesign` accepts explicit endpoints, including an optional authoritative elevation and label;
  endpoints/marker crowding no longer read scenario A/B during editing. Empty official references hide.
- Route picking returns a stable route ID and interpolated chainage. `RouteSelectionState` keeps local
  bend/pin/piece/crossing targets qualified by route, keeps buildings global, and repairs selection after
  deletion without touching design history.

The legacy `main.ts` path uses the same body builder and passes its staged context explicitly to the
crossing builder. No evaluator, quantities, validity rule, price or saved design changes here.

Tests exercise two actual road meshes (not decorative centrelines), independent preview, retained far
geometry, cancellation/removal, shared-material lifetime, ground-mask union, tunnel picking, deterministic
screen-overlap ties, route switching and deleted-active-route repair. Existing bridge/retaining rendering
tests share a bounded WebGL-free fixture; their geometric assertions remain unchanged.

### U1 dependencies and unfinished behaviour

Core supplies project schema/store/worker snapshots, persistent imported paths, accepted source intervals,
source topology/picking correspondence, authoritative mode geometry, shared work ownership and combined
noise/property decisions. U1 must wire these into the main application, project score, active profile,
base-road Change road handles, Build tool and global house card. The renderer does not decide whether
route crossings/reconnections are feasible; a rendered collection is not proof of network validity.
Source pavement removal, promoted remedy ownership and motorway/rail mode rendering must follow those
core contracts. The current transient adapter consumes legacy road results only and does not fabricate
PI curves from imported map or remedy paths.

## U1 — smart-mode continuation checkpoint, 2026-11-15

**First task for the successor, explicitly requested by the user: critically review both the work so far
and the overall strategy/interpretation of requirements.** Do not merely resume the implementation list.
Compare against `docs/multi-road-plan.md`, the original user request and current C/S/M contracts. In
particular, a tested scene/store foundation is not completion of editable ANY roads, valid project-wide
accounting, branch-preserving acceptance, paired/independent motorways or railway construction.

### Current wiring

- `main.ts` now uses `pickScenario`, `openProjectStore`, `makeLegacyProjectContext` and `ActiveRouteStore`.
  No legacy Store is constructed. Unsupported bytes get a non-destructive download/return screen.
  Continue checks canonical project storage plus legacy bytes. One cloned scenario `initial` factory,
  including optional PIs, serves first start and Start over. `baselineNote` is in attribution details.
- Project worker requests carry snapshot identity and an explicitly bounded preview gesture. Full
  responses must match the current snapshot; intermediate previews must belong to the same active
  gesture/route and advance sequence. History and route switching clear the window. `drag-perf.mjs`
  recognizes project messages and counts only previews the application actually handled.
- One project score/issue list replaces active-route totals in the sticky HUD. Best offers use the core
  coherent snapshot, after the scene swap. Incomplete multi-road snapshots have no total/green verdict.
  Active-only noise bands and house safety claims are suppressed for an unchecked network.
- Constructed legacy-road results feed `RouteScene`; all bodies and inactive-road wall overlays remain
  visible. Selection/picking and the route selector switch active endpoints, controls and profile without
  design history. Global building choices use project transactions. History clears local index selections.
- Debug adapters retain `setDesign/result/project(x,y,z)`; new hooks are `getProject`, `setProject`,
  `projectSnapshot`, `projectResult`, `activeRoute`, `setActiveRoute`, `projectSelection`, `renderRoutes`,
  `routeEndpoints`, `routeScreen`, `groundHeight`, `handledRequest`.
- Accepted-only vector removal is staged with the scene. It clips the correct source feature/interval
  before all fill/casing/dash passes, with shader-expanded cap clipping and preservation of coincident
  other sources. Raw imported paths are never coerced into PI arcs.

### Implemented but not wired / blockers

- `SourcePicker` picks actual vector features and maps perspective-correct rendered chainage back to
  canonical source intervals. It respects accepted cuts and preserves a coincident branch.
- `SourceEditor` supplies the single base-road card, Change road, visible Start/End handles, explicit
  missing traffic inputs, Apply/Cancel and the core `promoteGroundRoad` command. It is **not yet wired
  into main map events/inspector restoration**. Do that next, not another abstract framework.
- The Build button's Road/Motorway/Railway menu exists in `RouteBar` but remains hidden until its real
  endpoint-placement handler is supplied. There is no Build creation flow yet.
- Imported/reference routes do not yet have their dedicated geometry editor/profile. The current main
  adapter refuses PI conversion and clears unsupported active widgets; it does not display core reference
  proposal surfaces yet. Preserve endpoint/branch positions and vertical authority when adding editing.
- C's published evaluator checks/scores only the exact one-road legacy facade. Multiple roads/source
  proposals are intentionally incomplete. C1 physical acceptance/shared billing/combined noise are still
  core blockers, not something the renderer should invent. M's kernels also remain unavailable; consume
  its authoritative geometry when published, not road defaults or shifted PIs.

### Validation and next gates

U0 commits `066170e`, `2c960c5`, `129bc4d` passed independent reviews after fixes: turning-head self-collar
clipping, asymmetric footprint blending, geometric (not result-version) neighbour cache keys, reverted
preview restoration and shared tunnel indication height. Source removal commits `1ab710b`, `cb568b3`
address the additional review finding that expanded cap disks protruded across accepted cut boundaries.
The **new U1 main wiring has not yet had an independent review or browser run**.

Earlier U0 smoke/playtest and all five GPU drag gates passed: frame p95 17 ms, preview p50 16–42 ms,
no long tasks/compiles. Eleven frozen D11 evaluations passed, five saved bills were VALID with matching
sums, and the 24-random outcome audit ran without model changes. The later source shader and U1 wiring
still need those browser gates again. Latest checkpoint: typecheck/build and 36 focused tests across
active-route adapter, selection, scene ownership, source rendering/picking, project protocol/worker,
picker, crossing reuse and turning heads pass. Full suite must be rerun after integration.

Legacy screenshots personally inspected: `/tmp/trapla-u0-playtest/09-crossing.png`, `11-overview.png`,
`05-noise-fix.png`. These prove only baseline visuals. `scripts/multi-road-scene.mjs` is prepared but
**not run**: real-mouse two-engineered-road fixture, selection/drag/profile, undo/reload and honest
network score/noise; its `--docs` capture reserves `79-two-engineered-roads.png`. Inspect that actual
render before merge, then add the requested non-crossing BASE-road edit/branch/reload mouse coverage.
Slots 79–86 are U-owned. S owns the browser/GPU slot at this checkpoint; ask parent before launching.

Consumed core checkpoints through `8cdc702`, worker `a463c3e`/`47e164d`, promotion `47c8a84`; scenario
checkpoints `9a9738d`, `ab65033`, `aa294d8`, `853c7ac`, `5c3d976`. Newer core fixes and parent `be80427`
(mode foundations) need deliberate integration after the clean checkpoint. No merge to parent yet.
Only the original D11 pack is copied into this worktree so far; copy S's reviewed transport sidecars/new
packs before source/scenario browser tests. Never modify the other worktree's ignored data in place.

## U1 critical review (successor, 2026-11-15)

Scope: `dfe66a3` main wiring plus the strategy in `multi-road-plan.md` / `multi-road-c0-api.md`. Field names
used by `main.ts`/HUD/SourceEditor were checked against `core/project.ts`: `acousticScreen.complete`,
`buildings[].action/buildingIndex`, `routes[id].legacy/routeId`, `acceptedRenderReplacements`,
`issues[].scope.buildingIndex`, `RoadSpec.designSpeed/existingWidth`, `operations.speedPolicy` all exist.
Incomplete multi-road results still carry `legacy` per evaluable route (`project-evaluate.ts`). The
intro key `trapla.intro.v2` is current (older scripts set a stale v1 key). Fixture shape is valid.

**Implementation defects (fixed in this checkpoint unless marked open)**

1. *Legacy D11 HUD regression.* `Hud.setResult` returned early whenever a project existed, so the exact
   single-road facade lost the live `≈` total during drags (it showed the stale project total), the ✓/✗
   travel-time chip, goal tags and kept-open "why?". A single legacy-readable mission road with no
   corridors/connections now uses the unchanged legacy HUD; only real multi-road projects use the
   project score (no total, NOT CHECKED).
2. *Violation clicks matched project issues to kernel violations by title/kind* — the first of two
   identical "too steep" titles always won. Facade: index is 1:1 (core maps violations in order).
   Project mode: core now lists each road's own kernel violations as route-qualified issues; a click
   maps the issue's ordinal among that road's `invalid` issues to the kernel violation (cross-checked),
   else to its `locations` (pi/vpi/range). No title matching.
3. *Start over replaced only the active route* — with a side road active it would overwrite that road
   with the mission's starting design (or silently do nothing for a non-PI road). It now restores the
   whole initial project atomically (one undo entry).
4. *`trapla.setDesign` forced operating speed* even under `speedPolicy: 'independent'`; now guarded.
5. *Promoted/reference routes were invisible and unpickable*: rendering, picking and the inspector used
   only `legacy` results, so an applied Change road would vanish from the map. Unaccepted proposals are
   now drawn from their reference surface as a distinct dashed line over the still-visible old road, and
   are pickable; their card says they are not checked. No earthwork/body is fabricated.
6. *SourceEditor handle search was global* along the source: on a hairpin/loop the handle could jump
   to the far leg. It now tracks continuously from its previous station. The initial ±100 m stretch is
   an arbitrary visible start (kept, documented); handles cannot extend into a stretch already claimed
   by another project route, and clicking a claimed stretch selects that route instead of offering a
   second overlapping Change road.

**Strategy / requirement interpretation risks (open, not UI-fixable)**

- "Any road is editable" is **not** met: Change road only promotes the existing ground road as an
  exact reference proposal. There is no reference-path editor (bend/profile) and core returns
  `source-needs-network` for it, so it is never scored or accepted. Shipping this as "editing any road"
  would overclaim; the card must keep saying it is not checked. Needs C1 acceptance + a reference editor.
- Costs are project-wide only for the single-road facade; any second route yields no total. That is
  honest but means multi-road play has no score at all until C1's ledger. Do not "fix" with sums.
- Build (Road/Motorway/Railway with endpoints) is absent; motorway pairing and railway are M
  foundations only (no kernel). Owner requirements 3–4 remain unmet; the Build button stays hidden.
- The two-road scene test builds its side road through `setProject`, i.e. it proves rendering/selection/
  undo, not a player creation flow. Real-mouse base-road coverage is added below; Build coverage awaits Build.
- `RouteExtras` noise/wall overlays for inactive routes and the active-only noise band are legacy
  single-source views; they are suppressed/marked unfinished for networks, never combined in the UI.

### U1 continuation: base-road Change road wired (unscored)

- Any mapped base road (vector feature with a transport-graph mapping) is clickable when nothing designed
  is hit: one inspector card (name, width basis, **Change road**). Change road shows Start/End handles
  that follow the road; explicit speed/traffic/heavy inputs; **Apply** dispatches core's single atomic
  `promote` command (branches become explicit connections), **Cancel**/✕/Esc changes nothing. Showing
  the card or switching roads creates no undo entry. A stretch already claimed by a project road selects
  that road. Accepted render intervals feed the picker cuts with the scene swap.
- The promoted road is a reference proposal: core returns `source-needs-network`, so it has no bill,
  no body and no profile. It is drawn as an orange dashed line over the still-visible old road, is
  pickable and selectable from the route list, and its card says "Proposed change · not checked yet"
  with an undoable **Remove change**.
- Project score (core `cost.alone` / `cost.unpriced`, merged d9a8c92): a project total and verdict show
  only when core priced the whole project (single road, or separate roads its independence screen
  passes). Otherwise no total/VALID/best: the kicker reads "This road only" with the active road's own
  bill (live ≈ during its drag), or "Our road only" when the active road has none, plus "N road changes
  not priced yet". The UI never adds `alone` bills. Noise band and house cards are available exactly when
  core's acoustic screen is complete; a house card switches to the road whose noise reaches it most.
- Photo view: the roads/tracks/railways the game knows are drawn over the orthophoto, thin and
  semi-transparent in the map palette (rail dashed), only for transport-mapped features (what is
  clickable), through the same accepted source cuts as the map. Built once on first photo use.
- Screenshots (U slots): 79 two separate roads priced together, 80 Change road handles, 81 unpriced
  proposal over the old road, 82 interacting roads not priced, 83 photo with mapped roads.
- Requires a pack with `transport-meta.json`; D11 currently has none (S is regenerating it), so the
  real-mouse base-road test runs on D3. No D11 behaviour changes without the sidecar.
- Open: reference-path editing (bend/profile of a promoted road), C1 acceptance/pricing, Build tool.
  A Change road stretch is limited to one mapped way (core promotes one source interval); a player's
  "road" spanning several ways needs multi-interval promotion.
