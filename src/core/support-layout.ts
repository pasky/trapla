// Local, deterministic study-stage support remedies. No road/water network-wide scans.
import { bridgeLayout, supportBridgeLayout } from './bridge';
import type { Violation } from './checks';
import { STRUCTURE_RULES as R } from './data/prices';
import { CROSSING_RULES, ROAD_CLASSES } from './data/urban';
import { cellBounds, clipFootprint, insideFootprint, type FootprintCell } from './footprint-geometry';
import type { RoadNet } from './roadnet';
import { findRuns, KIND, type Run } from './structures';
import { CLASS_BITS, LC, RAIL_CROSSING_BIT, RIVER_CROSSING_BIT, type Terrain } from './terrain';

/** Provisional automatic-search envelope, not a norm-proven span feasibility limit. Clear
 * spans up to 180 m use the existing bridge model's long-span extrapolation (as overbridges
 * already do), fully priced per span. Larger changes still require a new alignment/profile. */
export const SUPPORT_LIMITS = { extensionM: 300, spanM: 180 } as const;

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

/** Same support envelopes and raster uncertainty as structureFootprints/footprintConflicts.
 * Returns the highest required deck elevation over a protected feature, or -Infinity. */
function obstacleHeight(c: FootprintCell, terrain: Terrain, roads?: RoadNet): number {
  let height = -Infinity;
  roads?.nearSegments(cellBounds(c, 14), segment => {
    const half = ROAD_CLASSES[segment.cls].width / (segment.cls === 'motorway' ? 4 : 2);
    const hit = clipFootprint(segment, c, half);
    if (!hit) return;
    const t = ((hit[0] + hit[1]) / 2 - segment.d) / segment.length;
    height = Math.max(height, terrain.heightAt(segment.ax + t * (segment.bx - segment.ax), segment.ay + t * (segment.by - segment.ay))
      + (ROAD_CLASSES[segment.cls].noAtGrade ? R.railClearance : CROSSING_RULES.overHeight));
  });
  terrain.watercourses?.nearSegments(cellBounds(c, terrain.watercourses.maxHalfWidth), segment => {
    const hit = clipFootprint(segment, c, (segment.reach.width ?? (segment.reach.kind === 'river' ? 5 : 0.5)) / 2);
    if (!hit) return;
    const t = ((hit[0] + hit[1]) / 2 - segment.d) / segment.length;
    height = Math.max(height, terrain.heightAt(segment.ax + t * (segment.bx - segment.ax), segment.ay + t * (segment.by - segment.ay)) + R.riverClearance);
  });
  const [x0, y0, x1, y1] = cellBounds(c), step = terrain.cell;
  const col0 = Math.max(0, Math.floor(x0 / step)), col1 = Math.min(terrain.nx - 1, Math.floor(x1 / step));
  const row0 = Math.max(0, Math.floor((terrain.height - y1) / step)), row1 = Math.min(terrain.ny - 1, Math.floor((terrain.height - y0) / step));
  for (let row = row0; row <= row1; row++) for (let col = col0; col <= col1; col++) {
    const v = terrain.lc[row * terrain.nx + col], cls = v & CLASS_BITS;
    const rail = !!(v & RAIL_CROSSING_BIT) || cls === LC.rail;
    const water = !!(v & RIVER_CROSSING_BIT) || cls === LC.water || (cls === LC.stream && !terrain.watercourses);
    if (!rail && !water) continue;
    const x = (col + 0.5) * step, y = terrain.height - (row + 0.5) * step;
    if (insideFootprint({ x, y }, c, step / 2)) height = Math.max(height, terrain.heightAt(x, y) + (rail ? R.railClearance : R.riverClearance));
  }
  return height;
}

/** Run after chooseStructures and before every geometry/billing consumer. Inputs are not mutated.
 * Overrides are -1 for AUTO, >=0 for explicit structure OR crossing choices. A run containing
 * any explicit station remains intact, including its supports. Remaining collisions are still
 * screened downstream; diagnostics explain a measured extension/elevation rather than hiding it. */
export function remedyBridgeSupports(r: SupportRoute, terrain: Terrain, roads?: RoadNet, overrides?: ArrayLike<number>): {
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
  const blocked = (s: number, pier = false) => obstacleHeight(cellAt(r, s, pier ? 1.2 : 3, pier ? r.crownWidth * 0.55 / 2 : r.crownWidth / 2 + 2), terrain, roads) > -Infinity;
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
        raiseM = Math.max(raiseM, R.bridgeMinHeight - (r.grade[index] - r.ground[index]));
        if (raiseM > 0) reason ??= 'terrain';
        if (!blocked(target)) {
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
    if (run.kind !== KIND.bridge || manual.subarray(run.i0, run.i1 + 1).some(Boolean)) continue;
    const ordinary = bridgeLayout(run.length), spans = Math.max(1, Math.round(run.length / ordinary.span));
    const piers: number[] = [];
    let changed = false;
    for (let k = 1; k < spans; k++) {
      const s = run.s0 + k * ordinary.span;
      if (!blocked(s, true)) { piers.push(s); continue; }
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
    if (!changed) continue;
    const layout = supportBridgeLayout(run.s0, run.s1, piers);
    if (layout.span > SUPPORT_LIMITS.spanM) {
      // Retain the original, fully billed supports; the downstream screen must still flag
      // their collisions. Do not fabricate an arbitrarily long feasible bridge from a price proxy.
      diagnostics.push({ s: (run.s0 + run.s1) / 2, reason: 'span-limit', extensionM: 0, raiseM: 0, requiredSpanM: layout.span });
      continue;
    }
    run.pierStations = piers;
    run.layout = layout;
    // The sourced cost model's span/20 depth proxy is not a feasibility certificate. Check
    // additional depth against actual terrain and protected features under the deck. These
    // are clearance queries, NOT solid-deck footprint conflicts or relocation charges.
    const supports = [run.s0, ...piers, run.s1];
    let raiseM = 0, worstI = run.i0, requiredZ = r.grade[run.i0];
    for (let k = 0; k + 1 < supports.length; k++) {
      const a = supports[k], b = supports[k + 1], span = b - a;
      const extraDepth = Math.max(0, span / 20 - 1.2);
      const i0 = Math.max(run.i0, Math.floor(a / r.ds + 0.5)), i1 = Math.min(run.i1, Math.floor(b / r.ds + 0.5));
      for (let i = i0; i <= i1; i++) {
        const left = Math.max(a, r.s[i] - r.ds / 2), right = Math.min(b, r.s[i] + r.ds / 2);
        if (right <= left) continue;
        const cell = cellAt(r, (left + right) / 2, (right - left) / 2, r.crownWidth / 2);
        const required = Math.max(r.ground[i] + span / 20, obstacleHeight(cell, terrain, roads) + extraDepth);
        const shortfall = required - r.grade[i];
        if (shortfall > 0.01) requiredElevations.set(r.s[i], Math.max(required, requiredElevations.get(r.s[i]) ?? -Infinity));
        if (shortfall > raiseM) { raiseM = shortfall; worstI = i; requiredZ = required; }
      }
    }
    if (raiseM > 0.01) {
      diagnostics.push({ s: r.s[worstI], reason: 'span-depth', extensionM: 0, raiseM, requiredZ });
      violations.push({ kind: 'structure', basis: 'game', s0: run.s0, s1: run.s1,
        title: 'Obstacle-clearing bridge span needs more height',
        fix: `Raise this bridge by at least ${raiseM.toFixed(1)} m, or move the alignment to shorten its ${run.layout.span.toFixed(1)} m clear span`,
        rule: 'Existing crossing clearances plus the bridge model’s span/20 structural-depth allowance',
        detail: 'The obstacle-free support arrangement and each local span’s deck section remain fully priced; no colliding pier is hidden.' });
    }
  }
  return { kind, runs, diagnostics, violations,
    clearanceRequirements: Array.from(requiredElevations, ([s, z]) => ({ s, z })) };
}
