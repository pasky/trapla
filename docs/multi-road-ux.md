# Multi-road UI integration checkpoints

## U0 — render ownership and selection

This is a tested integration foundation, **not yet the editable-network player feature**. The running
app still uses its legacy single-route store until the reviewed core project contract lands.

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
