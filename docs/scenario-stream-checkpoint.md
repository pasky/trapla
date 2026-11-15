# Stream S checkpoint for smart-mode continuation

2026-11-15. **Not ready to merge.** Parent requested this clean code checkpoint/mode switch.
Parent base originally a17afcd; current parent has M0 through be80427. S worktree is
`/home/pasky/projects/trapla-agent-worktree-0002`, branch `side-agent/scenario-expansion`.
No browser/server is running; S released its GPU slot. Ask parent again before browsers.
All three nested research agents have merged their notes and been closed.

## First task for the follow-up agent: critical review

The owner explicitly asks the follow-up agent to **critically review the work so far AND the overall
strategy/interpretation of requirements**, not merely continue the implementation. Re-read the original
stream-S assignment, AGENTS.md and reviewed multi-road plan; inspect the diff/commits, actual generated
packs and source evidence independently. Treat this checkpoint's conclusions as claims to verify.
In particular reassess whether the chosen endpoints/reference scopes are sensible, whether the full
D35-versus-stage decision is genuinely budget-driven, whether startup validity is achieved without
hiding missing engineering, whether the Nová Paka modern baseline preserves the promised connections,
and whether additive transport/cache/readiness work is safe and proportionate rather than scope drift.
Check actual renderer/data correspondence, frozen D11 identity and integration ownership. Resolve the
parent's review repros, then identify any additional requirement gaps or flawed assumptions before
spending more time on route tuning or expanding the pipeline. Explicitly report that critical review
and any strategy corrections to the parent.

## Commits / ownership

- ab65033 strict proposed/reversed source references and baseline exclusions.
- 9a9738d initial picker, aa294d8 readiness guard, 853c7ac graph/loader, 5c3d976 catalogue,
  D3 editable starter, scenario configs/docs/check scripts.
- C0 contracts 79c8a05/c554f55 were cherry-picked (local edb982b/006a133); parent now has them too.
- Reviewed research notes 24–26 are merged into S; 27 records actual measurements/limitations.
- U owns main/UI/render integration. New bootstrap checkpoint is **dfe66a3**, not yet consumed
  by S. It requires C c4d607b/06bdc44/021c22c/c116497/8cdc702 and a463c3e/47e164d/47c8a84;
  coordinate cherry-picks/parent rebase rather than editing main.ts. It uses initial category/speed/pis
  for fresh Start and Start over, canonical project Continue + legacy fallback, loader transport/
  transportMeta and baselineNote. U reports typecheck/build +36 focused tests green; actual browser
  integration is UNTESTED. Source Apply/Build placement are not wired; no whole-feature completion.
- C owns endpoint/network fixes. C has published unresolved transport schema in 021c22c and validator
  at `src/core/project-transport-validation.ts`; S implements its shape but has not yet merged that
  complete C commit (our older TS type accepts parsed extra fields at runtime).

## Actual packs (ignored; DO NOT copy to parent until approval)

All directories exist in this worktree's real, isolated `public/scenarios/`; cache is also local.
D11 was copied from parent. Nested agents had shared-cache symlinks but only unique research files
were written there; all needed research caches have been copied here.

- D11: original scoring files/fingerprint preserved exactly; separate graph sidecars currently
  7,622 resolved / 94 unresolved sources, passes C graph validator. Frozen regression still passes.
- D3: 13×19 km, 2600×3800 at 5 m, no nodata. Mapped reference 15,679.587 m, Sázava included.
  Default/reference seven-PI fixture VALID 15,443.5517 m, 4,743,443,003.13 CZK, about 77–79 ms warm.
  New graph 7,011 sources, no unresolved; current sidecars pass C validator. Metadata/manifest updated
  by standalone transport script. Full raw straight diagnostics are retained in research/27.
- D35: full 34×11.5 km, 6800×2300 (15.64M cells < D11), no nodata, roughly 20 MB. One coherent
  `transport_v1` response now avoids conflicting tags from old separate queries. Actual reference
  33,900.262 m; official projects total 34.830 km incl existing-road reconstruction.
  **Not accepted yet:** raw straight 30.581 km / 13.348bn / 16 diagnostics, median 245–289 ms;
  reference candidate 33.695 km / 9.927bn / many endpoint/structure issues, median 223 ms.
  The final ~0.4 km of proposed reference converges on retained existing I/35/D35: do not pretend
  overlap is free reconstruction or keep blindly tuning PIs. `/tmp/s-d35-end-map.png` shows exact
  source geometry (blue proposed reference, orange trunk, red motorway). Need honest endpoint/scope
  handling or explicitly reviewed first stage if measured budget requires it. Full remains preferred
  but no full-versus-stage decision is accepted yet. No new-scenario GPU measurements yet.
  Its graph was built before the last ulp fix; regenerate after fixing review blockers below.
- Nová Paka: 15×15 km, 3000×3000, no nodata, ~14 MB incl graph. Exact 22-way new branch is
  7,402.365 m projected; official 8.479 km includes existing-road works beyond its ends. Parent
  approved this honest anchored branch/scope distinction, not fabricated length. Exclude 22 ways
  + dedicated connector698085714; old town roads, III/28425, both serving roundabouts remain.
  Actual DMR cut + construction photo inspected: centre509.68 m versus sides516–517 m at30 m.
  Picker and pack disclose existing earthwork advantage; local acquisition date remains unknown.
  Graph4,696 sources/no unresolved passes C validator. **Default not valid:** initial70S11.5
  reference has local road/track/stream issues; 400 bounded repairs left1 m class-I footprint
  contact at the final roundabout. Rounding endpoint or source-tangent PIs did not fix it.
  C's nested `paka-endpoint` agent is investigating actual connected-roundabout ownership.
  Do not hide this with a field endpoint, suppressed violation or norm change.

Untracked `scripts/scenarios/d35/` and `scripts/scenarios/i16-nova-paka/` are **diagnostic candidates,
not accepted fixtures**. They are intentionally left available at their original paths for C's repro.
D3 fixtures are committed. No raw extracts are committed. New actual packs are NOT in git.

## Parent review blockers — fix before merge

Review session:
`/home/pasky/.pi/agent/sessions/--home-pasky-projects-trapla--/2026-11-15T16-25-30-555Z_01a1e007-32bb-71e1-bc95-74b0bc5ea6b8.jsonl`

1. **P1 clipping provenance:** `transport.clipped_stations` currently chooses earliest-forward XY.
   Repro source (0,0)→(10,10)→(0,10)→(10,0), clipped final part(5,5)→(10,0): returns7.071→38.284
   but correct interval31.213→38.284. Preserve source-segment provenance for clipped edges, or reject
   ambiguity. Never guess. A separate few-ulp endpoint overflow was fixed in latest code and tested;
   that does NOT solve this self-crossing error.
2. **P1 cached input identity/completeness:** cache hits currently skip checks: cached
   `{elements:[],remark:'runtime error: Query timed out'}` is accepted. Validate hits and fingerprint
   query body+bounds. Legacy D11 needs explicit frozen-cache compatibility, without changing its data.
   Existing new caches are unversioned; plan an honest migration/refetch, not relabeling arbitrary bytes.
3. **P1 standalone publication:** latest build_transport.py can publish ready.json on an incomplete
   existing pack. Require a verified coherent existing generation before touching it; never recertify
   absent terrain or a failed mixed-generation full build. `vectors.py` standalone also changes a
   binary while keeping ready/graph identity: invalidate/rebuild bound metadata or forbid that path.
4. **P2 interior reference loops:** endpoints-only chain checks miss [1,2,3]+[3,4,2,5]. Validate the
   assembled entire node sequence, not only individual ways and endpoint degrees.
5. Unresolved sources must not make neighbouring branch checks assume no branch exists. C/U need
   conservative handling of visible unresolved feature geometry; no fabricated source connectivity.

## Gates / evidence

Latest checkpoint: `npx tsc --noEmit`, `npx vitest run` **356 tests**, `npm run build`, Python
**29 tests** with numpy/shapely/**pillow** pass. These do not cover the review repros above yet.

D11 frozen regression, all five saved design benches (VALID/parts), and outcome audit with straight
+24 random edits ran. D11 smoke and playtest pass. Five GPU modes separately pass, no long tasks or
new shaders; preview p50/p95ms bend34/68, road32/62, radius26/73, pin34/76, vpi14/27.
No timed GPU run overlapped another browser or S heavy data build.

Files/logs:
- `/tmp/trapla-s-{tests,build,regression,bench-d11,outcome,smoke,playtest}.log`
- `/tmp/trapla-s-drag-{bend,road,radius,pin,vpi}.log`
- `/tmp/trapla-s-d3-check-valid.log`, `/tmp/trapla-s-d3-check.log` (raw straight)
- `/tmp/trapla-s-d35-check.log`, `/tmp/trapla-s-paka-check.log`, `/tmp/trapla-s-paka-repair.log`
- `/tmp/trapla-s-d35-final.log`, `/tmp/trapla-s-paka-final.log`
- `/tmp/trapla-s-check-graph.ts` imports C validator and checks actual graph identity; D11/D3/Paka
  pass after last rebuild. Regenerate D35 after provenance fixes.

Screens inspected personally:
- `docs/screenshots/73-scenario-picker.png`: component test, not integrated main; D35 was not ready
  at capture. Refresh final image. Heading focus outline fixed after this draft shot.
- `docs/screenshots/74-d3-posazavi.png`: VALID actual D3; intro visible. Screenshot script now sets
  correct intro.v2 key, so refresh final capture without the overlay.
- `/tmp/trapla-scenarios/d3/{overview,endpoint-A,endpoint-B,noise,photo}.png`
- `/tmp/s-paka-photo.jpg`, `/tmp/s-paka-dmr.png` actual current-service evidence.

Picker component browser script passes four cards, Start, canonical Continue preserving malformed
bytes for recovery, return, direct D11, missing marker/retry and unknown link. Main bootstrap is U's
separate integration responsibility; require actual integrated Start/Continue/Start-over checks.

Next: fix four review repros + publication safety; consume C endpoint fix/U bootstrap; finish feasible
Paka/D35 defaults with disclosed raw diagnostics; measure full D35 GPU/eval/load and report corridor
choice; repeat final gates/screens, review commits, await parent LGTM before copying ignored packs
and merging. Do not claim completed multi-road/motorway/rail scoring.
