// Local, deterministic study-stage support remedies. No road/water network-wide scans.
import { bridgeLayout, supportBridgeLayout } from './bridge';
import type { Violation } from './checks';
import { STRUCTURE_RULES as R } from './data/prices';
import { CROSSING_RULES, ROAD_CLASSES } from './data/urban';
import { cellBounds, clipFootprint, type FootprintCell } from './footprint-geometry';
import type { RoadNet } from './roadnet';
import { findRuns, KIND, type Run } from './structures';
import type { Terrain } from './terrain';
import { protectedRasterCells } from './protected-raster';
import { waterWidth } from './watercourses';

/** Provisional automatic-search envelope, not a norm-proven span feasibility limit. Clear
 * spans up to 180 m use the existing bridge model's long-span extrapolation (as overbridges
 * already do), fully priced per span. Larger changes still require a new alignment/profile. */
export const SUPPORT_LIMITS = { extensionM: 300, spanM: 180, abutmentCutM: 5 } as const;

export interface SupportRoute {
  n: number; ds: number; s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>;
  tx: ArrayLike<number>; ty: ArrayLike<number>; grade: ArrayLike<number>; ground: ArrayLike<number>;
  kind: ArrayLike<number>; runs: Run[]; crownWidth: number;
}
export interface SupportDiagnostic {
  s: number;
  reason: 'manual' | 'terrain' | 'boundary' | 'tunnel' | 'span-depth' | 'span-limit' | 'limit';
  /** Proposed clear abutment station, if one exists within the route. */
  targetS?: number;
  /** Required extension if targetS exists; otherwise the searched distance (a lower bound). */
  extensionM: number;
  raiseM: number;
  requiredSpanM?: number;
  /** Required deck elevation at s for a span-depth failure; s is the worst failing station. */
  requiredZ?: number;
  lowerM?: number;
  structure?: 'abutment' | 'portal';
}

function cellAt(r: SupportRoute, s: number, along: number, width: number): FootprintCell {
  const j = Math.max(0, Math.min(r.n - 2, Math.floor(s / r.ds)));
  const t = Math.max(0, Math.min(1, (s - r.s[j]) / r.ds));
  const tx = r.tx[j] * (1 - t) + r.tx[j + 1] * t, ty = r.ty[j] * (1 - t) + r.ty[j + 1] * t;
  const len = Math.hypot(tx, ty) || 1;
  return { s, i: Math.min(r.n - 1, Math.round(s / r.ds)),
    x: r.x[j] * (1 - t) + r.x[j + 1] * t, y: r.y[j] * (1 - t) + r.y[j + 1] * t,
    tx: tx / len, ty: ty / len, along, left: width, right: width };
}

export type OwnTrack = (x: number, y: number, i: number) => boolean;
/** Same support envelopes and raster uncertainty as structureFootprints/footprintConflicts.
 * Returns the highest required deck elevation over a protected feature, or -Infinity. */
function obstacleHeight(c: FootprintCell, terrain: Terrain, roads?: RoadNet, relocatable?: ReadonlySet<number>, ownTrack?: OwnTrack): number {
  let height = -Infinity;
  roads?.nearSegments(cellBounds(c, 14), segment => {
    if (relocatable && !ROAD_CLASSES[segment.cls].separable && !relocatable.has(segment.way)) return;
    const half = ROAD_CLASSES[segment.cls].width / (segment.cls === 'motorway' ? 4 : 2);
    const hit = clipFootprint(segment, c, half);
    if (!hit) return;
    const t = ((hit[0] + hit[1]) / 2 - segment.d) / segment.length;
    height = Math.max(height, terrain.heightAt(segment.ax + t * (segment.bx - segment.ax), segment.ay + t * (segment.by - segment.ay))
      + (ROAD_CLASSES[segment.cls].noAtGrade ? R.railClearance : CROSSING_RULES.overHeight));
  });
  terrain.watercourses?.nearSegments(cellBounds(c, terrain.watercourses.maxHalfWidth), segment => {
    const hit = clipFootprint(segment, c, waterWidth(segment.reach) / 2);
    if (!hit) return;
    const t = ((hit[0] + hit[1]) / 2 - segment.d) / segment.length;
    height = Math.max(height, terrain.heightAt(segment.ax + t * (segment.bx - segment.ax), segment.ay + t * (segment.by - segment.ay)) + R.riverClearance);
  });
  protectedRasterCells(terrain, c, ({ x, y, feature }) => {
    // a railway's own track (the station we join, a stretch we rebuild along or take up) is no obstacle
    if (feature === 'railway' && ownTrack?.(x, y, c.i)) return;
    height = Math.max(height, terrain.heightAt(x, y) + (feature === 'railway' ? R.railClearance : R.riverClearance));
  });
  return height;
}

/** Run after chooseStructures and before every geometry/billing consumer. Inputs are not mutated.
 * Overrides are -1 for AUTO, >=0 for explicit structure OR crossing choices. A run containing
 * any explicit station remains intact, including its supports. Remaining collisions are still
 * screened downstream; diagnostics explain a measured extension/elevation rather than hiding it. */
export function remedyBridgeSupports(r: SupportRoute, terrain: Terrain, roads?: RoadNet, overrides?: ArrayLike<number>, memo?: Map<string, number>,
  /** Minor (non-separable) roads under an automatic abutment/portal are relocated by the
   * footprint screen instead of lengthening the structure, except `strictWays` (a failed
   * relocation retried strictly) and every road when this is undefined. */
  strictWays?: ReadonlySet<number>,
  /** A railway's own track at a raster point near station i (EvalOptions.railTieIn / railRetired). */
  ownTrack?: OwnTrack): {
  kind: Uint8Array; runs: Run[]; diagnostics: SupportDiagnostic[]; violations: Violation[];
  /** Only failing cells, deduplicated at shared spans. Caller may lift AUTO profiles; this
   * routine never changes grade, profile controls, or any explicitly requested structure. */
  clearanceRequirements: { s: number; z: number }[];
} {
  const kind = Uint8Array.from(r.kind), diagnostics: SupportDiagnostic[] = [], violations: Violation[] = [];
  const requiredElevations = new Map<number, number>();
  if (r.n < 2) return { kind, runs: r.runs.map(run => ({ ...run })), diagnostics, violations, clearanceRequirements: [] };
  const manual = new Uint8Array(r.n);
  for (let i = 0; i < r.n; i++) manual[i] = overrides && overrides[i] >= 0 ? 1 : 0;
  const manualRuns = new Set<Run>();
  for (const run of r.runs) {
    for (let i = run.i0; i <= run.i1; i++) if (manual[i]) { manualRuns.add(run); break; }
    if (manualRuns.has(run)) manual.fill(1, run.i0, run.i1 + 1);
  }
  // A profile-only retry has identical horizontal geometry and protected features.
  // Memo keys stay valid across strict retries: `relocatable` rows are keyed by the strict set.
  const strictKey = strictWays ? [...strictWays].join() : 'all';
  const obstacle = (cell: FootprintCell, relocatable?: ReadonlySet<number>) => {
    if (!memo) return obstacleHeight(cell, terrain, roads, relocatable, ownTrack);
    const key = `${cell.s.toFixed(3)}/${cell.along.toFixed(3)}/${cell.left}/${relocatable ? strictKey : ''}`;
    let height = memo.get(key);
    if (height === undefined) { height = obstacleHeight(cell, terrain, roads, relocatable, ownTrack); memo.set(key, height); }
    return height;
  };
  const blocked = (s: number, pier = false) => obstacle(cellAt(r, s, pier ? 1.2 : 3, pier ? r.crownWidth * 0.55 / 2 : r.crownWidth / 2 + 2), pier ? undefined : strictWays) > -Infinity;
  for (const run of r.runs) {
    if (run.kind === KIND.tunnel) {
      let i0 = run.i0, i1 = run.i1;
      for (const direction of [-1, 1]) {
        const start = direction < 0 ? run.s0 : run.s1;
        if (!blocked(start)) continue;
        let index = direction < 0 ? i0 : i1, target = start, lowerM = 0;
        let reason: SupportDiagnostic['reason'] | undefined = manualRuns.has(run) ? 'manual' : undefined;
        let clear = false;
        while (true) {
          if (Math.abs(target - start) + r.ds > SUPPORT_LIMITS.extensionM) { reason ??= 'limit'; break; }
          index += direction;
          if (index <= 0 || index >= r.n - 1) { reason ??= 'boundary'; break; }
          target = r.s[index] + direction * r.ds / 2;
          if (manual[index]) reason ??= 'manual';
          if (kind[index] !== KIND.earth) { reason ??= 'boundary'; break; }
          lowerM = Math.max(lowerM, R.tunnelMinDepth - (r.ground[index] - r.grade[index]));
          if (lowerM > 0) reason ??= 'terrain';
          if (!blocked(target)) {
            if (manual[index + direction] && kind[index + direction] === KIND.tunnel) reason ??= 'manual';
            clear = true; break;
          }
        }
        if (!reason && clear) {
          if (direction < 0) i0 = index; else i1 = index;
          kind.fill(KIND.tunnel, i0, i1 + 1);
          continue;
        }
        // A non-forced automatic portal can also retreat into sound cover. Removed tunnel
        // cells become fully billed/screened open cut; downstream crossings must engineer any
        // road over that cut. Never shorten a river-locked or manually requested tunnel.
        let shortened = false;
        if (!manualRuns.has(run) && !run.forced) {
          let candidate = direction < 0 ? i0 : i1;
          while ((i1 - i0 + 1 - Math.abs(candidate - (direction < 0 ? i0 : i1)) - 1) * r.ds >= R.minTunnelLength) {
            candidate -= direction;
            const station = r.s[candidate] + direction * r.ds / 2;
            if (Math.abs(station - start) > SUPPORT_LIMITS.extensionM) break;
            if (r.ground[candidate] - r.grade[candidate] < R.tunnelMinDepth || blocked(station)) continue;
            if (direction < 0) { kind.fill(KIND.earth, i0, candidate); i0 = candidate; }
            else { kind.fill(KIND.earth, candidate + 1, i1 + 1); i1 = candidate; }
            shortened = true; break;
          }
        }
        if (!shortened) diagnostics.push({ s: start, structure: 'portal', reason: reason ?? 'boundary',
          targetS: clear ? target : undefined, extensionM: Math.abs(target - start), raiseM: 0, lowerM });
      }
      continue;
    }
    for (const direction of [-1, 1]) {
      const start = direction < 0 ? run.s0 : run.s1;
      if (!blocked(start)) continue;
      let index = direction < 0 ? run.i0 : run.i1, target = start, raiseM = 0;
      let reason: SupportDiagnostic['reason'] | undefined = manualRuns.has(run) ? 'manual' : undefined;
      let clear = false;
      // Search in cell-sized increments, even after a constraint stops automatic extension:
      // the first clear endpoint supplies an actionable extension/elevation diagnostic.
      while (true) {
        if (Math.abs(target - start) + r.ds > SUPPORT_LIMITS.extensionM) { reason ??= 'limit'; break; }
        index += direction;
        if (index <= 0 || index >= r.n - 1) { reason ??= 'boundary'; break; }
        target = r.s[index] + direction * r.ds / 2;
        if (manual[index]) reason ??= 'manual';
        if (kind[index] === KIND.tunnel) reason ??= 'tunnel';
        // bridgeMinHeight is an economic selection threshold, not a physical limit: the deck may
        // continue low over dry ground, priced at the model's minimum height. A clear abutment
        // may also be set into the start of a cut (provisional ≤5 m retained cut), rather than
        // lifting the whole grade. Only a deck below ground or a deeper cut requires a raise.
        const h = r.grade[index] - r.ground[index], free = !blocked(target);
        const shortfall = free ? -SUPPORT_LIMITS.abutmentCutM - h : -h;
        if (shortfall > 0) { raiseM = Math.max(raiseM, shortfall); reason ??= 'terrain'; }
        if (free) {
          // Filling the last earth cell would merge adjacent runs and erase the requested
          // run's endpoint/abutment, even though no painted cell itself changed kind.
          if (manual[index + direction] && kind[index + direction] === KIND.bridge) reason ??= 'manual';
          clear = true; break;
        }
      }
      if (!reason && clear) {
        const a = Math.min(index, run.i0), b = Math.max(index, run.i1);
        kind.fill(KIND.bridge, a, b + 1);
      } else diagnostics.push({ s: start, structure: 'abutment', reason: reason ?? 'boundary', targetS: clear ? target : undefined,
        extensionM: Math.abs(target - start), raiseM: Math.max(0, raiseM) });
    }
  }
  const runs: Run[] = findRuns(kind).map(part => {
    const original = r.runs.find(run => run.i0 === part.i0 && run.i1 === part.i1 && run.kind === part.kind);
    if (original) return { ...original };
    const s0 = Math.max(0, r.s[part.i0] - r.ds / 2), s1 = Math.min(r.s[r.n - 1], r.s[part.i1] + r.ds / 2);
    return { ...part, kind: part.kind as 1 | 2, s0, s1, length: s1 - s0,
      forced: r.runs.some(run => run.forced && run.i0 <= part.i1 && run.i1 >= part.i0) };
  });
  for (const run of runs) {
    if (run.kind !== KIND.bridge) continue;
    const isManual = manual.subarray(run.i0, run.i1 + 1).some(Boolean);
    const ordinary = bridgeLayout(run.length), spans = Math.max(1, Math.round(run.length / ordinary.span));
    const originalPiers = run.pierStations ?? Array.from({ length: spans - 1 }, (_, k) => run.s0 + (k + 1) * ordinary.span);
    let piers: number[] = [];
    let changed = false;
    for (const s of originalPiers) {
      if (isManual || !blocked(s, true)) { piers.push(s); continue; }
      changed = true;
      // Seek the nearest free support in this pier's own half-span neighbourhood. Disjoint
      // neighbourhoods preserve ordering. A fully obstructed neighbourhood becomes a priced
      // longer clear span, never a hidden missing pier at the old standard price.
      let found = false;
      for (let shift = 1; shift < ordinary.span / 2 && !found; shift++) for (const sign of [-1, 1]) {
        const candidate = s + sign * shift;
        if (!blocked(candidate, true)) { piers.push(candidate); found = true; break; }
      }
    }
    // Manual choices freeze support geometry, not clearance validation. Even an unchanged
    // support pattern can exceed the nominal 1.2 m structural-depth allowance.
    let layout = supportBridgeLayout(run.s0, run.s1, piers);
    if (changed && layout.span > SUPPORT_LIMITS.spanM) {
      // Retain the original, fully billed supports; the downstream screen must still flag
      // their collisions. Do not fabricate an arbitrarily long feasible bridge from a price proxy.
      diagnostics.push({ s: (run.s0 + run.s1) / 2, reason: 'span-limit', extensionM: 0, raiseM: 0, requiredSpanM: layout.span });
      piers = [...originalPiers];
      layout = supportBridgeLayout(run.s0, run.s1, piers);
      changed = false;
    }
    if (changed) { run.pierStations = piers; run.layout = layout; }
    // The sourced cost model's span/20 depth proxy is not a feasibility certificate. Check
    // additional depth against actual terrain and protected features under the deck. These
    // are clearance queries, NOT solid-deck footprint conflicts or relocation charges.
    const supports = [run.s0, ...piers, run.s1];
    let raiseM = 0, worstI = run.i0, requiredZ = r.grade[run.i0];
    const regrade = [0, 0];
    for (let k = 0; k + 1 < supports.length; k++) {
      const a = supports[k], b = supports[k + 1], span = b - a;
      const extraDepth = Math.max(0, span / 20 - 1.2);
      const i0 = Math.max(run.i0, Math.floor(a / r.ds + 0.5)), i1 = Math.min(run.i1, Math.floor(b / r.ds + 0.5));
      for (let i = i0; i <= i1; i++) {
        const left = Math.max(a, r.s[i] - r.ds / 2), right = Math.min(b, r.s[i] + r.ds / 2);
        if (right <= left) continue;
        const cell = cellAt(r, (left + right) / 2, (right - left) / 2, r.crownWidth / 2);
        // In an end cell the bank in front of the abutment is regraded under the first span
        // (priced excavation, ≤ abutmentCutM), instead of lifting the whole grade line.
        const end = !isManual && (i === run.i0 || i === run.i1) && run.i1 > run.i0;
        const terrainDepth = r.ground[i] + span / 20 - r.grade[i];
        if (end && terrainDepth > 0.01 && terrainDepth <= SUPPORT_LIMITS.abutmentCutM)
          regrade[i === run.i0 ? 0 : 1] += terrainDepth / 2 * r.crownWidth * (right - left);
        // Clearance stays demanded over a minor road even where its abutment conflict is relocated:
        // the relocated pavement may still pass under this span (conservative; may cost a lift).
        const required = Math.max(r.ground[i] + span / 20 - (end ? SUPPORT_LIMITS.abutmentCutM : 0), obstacle(cell) + extraDepth);
        const shortfall = required - r.grade[i];
        if (shortfall > 0.01) requiredElevations.set(r.s[i], Math.max(required, requiredElevations.get(r.s[i]) ?? -Infinity));
        if (shortfall > raiseM) { raiseM = shortfall; worstI = i; requiredZ = required; }
      }
    }
    if (regrade[0] + regrade[1] > 0) run.regradeM3 = regrade as [number, number];
    if (raiseM > 0.01) {
      diagnostics.push({ s: r.s[worstI], reason: 'span-depth', extensionM: 0, raiseM, requiredZ });
      violations.push({ kind: 'structure', basis: 'game', s0: r.s[worstI], s1: r.s[worstI],
        title: 'A long bridge span is too low over what it crosses',
        fix: `Raise the bridge at km ${(r.s[worstI] / 1000).toFixed(2)} by at least ${(Math.ceil(raiseM * 10 - 1e-9) / 10).toFixed(1)} m, or move the route so the ${layout.span.toFixed(0)} m span can be shorter`,
        rule: 'Game rule: the clearance under the bridge, plus a deck about 1/20 of the span deep',
        detail: 'To keep its supports off the roads, railways or water below, this bridge has a long span; a long span needs a deeper deck, which eats into the clearance.' });
    }
  }
  return { kind, runs, diagnostics, violations,
    clearanceRequirements: Array.from(requiredElevations, ([s, z]) => ({ s, z })) };
}
