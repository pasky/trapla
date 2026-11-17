// Local, deterministic study-stage support remedies. No road/water network-wide scans.
import { ARCH_DECK_DEPTH, archRib, BRIDGE_STYLE_ORDER, bridgeLayout, longLayouts, supportBridgeLayout, type BridgeArch, type BridgeLayout, type BridgeStyle } from './bridge';
import { BRIDGE_STYLES } from './data/bridges';
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
export const SUPPORT_LIMITS = { extensionM: 300, spanM: BRIDGE_STYLES.long.maxSpan, abutmentCutM: 5 } as const;
/** PROVISIONAL engine spacing, m: the shortest span a moved pier leaves next to the last one (a pier's own
 * footprint and its foundation; not a design rule). */
const MIN_PIER_GAP = 10;
/** a bridge style asked for per station (overrides.ts styleMask): 0 none */
export const STYLE_CODES: readonly (BridgeStyle | undefined)[] = [undefined, 'short', 'long', 'arch'];
/** the styles as the player reads them (terms.ts BRIDGE_STYLE_TEXT has the card's words) */
const STYLE_WORDS: Record<BridgeStyle, string> = { short: 'short spans', long: 'long spans', arch: 'an arch' };
/** The bill of a bridge run with a given layout and style (evaluate: bridgeRunCost with the style). */
export type BridgePrice = (i0: number, i1: number, length: number, layout: BridgeLayout, piers: readonly number[],
  style: { style?: Exclude<BridgeStyle, 'short'>; arch?: BridgeArch }) => number;
/** How the span-depth problem's title starts: evaluate.ts recognises it by this (to say why Auto could not
 * lift it), so the wording and the logic cannot drift apart. */
export const SPAN_TOO_LOW = 'A long bridge span is too low';

export interface SupportRoute {
  n: number; ds: number; s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>;
  tx: ArrayLike<number>; ty: ArrayLike<number>; grade: ArrayLike<number>; ground: ArrayLike<number>;
  kind: ArrayLike<number>; runs: Run[]; crownWidth: number;
}
export interface SupportDiagnostic {
  s: number;
  reason: 'manual' | 'terrain' | 'boundary' | 'tunnel' | 'span-depth' | 'span-limit' | 'limit';
  /** span-limit: the bridge's cells, and whether Auto chose it (no player paint; it may hold forced cells) */
  cells?: [number, number];
  automatic?: boolean;
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
  /** 1 = a higher-ranking road's deck this road rides (built, supported and checked with that road's
   * crossing): a run made only of such cells is left as it is. */
  held?: ArrayLike<number>,
  /** A railway's own track at a raster point near station i (EvalOptions.railTieIn / railRetired). */
  ownTrack?: OwnTrack,
  /** Bridge styles: those the player asked for per station (STYLE_CODES), and the price of a layout. Without a
   * price, the first style that fits (short spans, else long spans, else an arch). */
  styles?: { asked?: ArrayLike<number>; price?: BridgePrice; /** false (a drag preview): an arch only where asked for or
    * nothing else fits, long spans only where they may pay (`mayPay`, bridge.ts longMayPay) or short ones do not fit */
    arch?: boolean; mayPay?: (top: number, length: number, layout: BridgeLayout) => boolean }): {
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
  const heldRun = (run: { i0: number; i1: number }) => {
    if (!held) return false;
    for (let i = run.i0; i <= run.i1; i++) if (!held[i]) return false;
    return true;
  };
  for (const run of r.runs) {
    if (heldRun(run)) continue;
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
          lowerM = Math.max(lowerM, R.portalDepth - (r.ground[index] - r.grade[index]));
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
            if (r.ground[candidate] - r.grade[candidate] < R.portalDepth || blocked(station)) continue;
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
  const gradeAt = (x: number) => {
    const j = Math.max(0, Math.min(r.n - 2, Math.floor(x / r.ds))), t = Math.max(0, Math.min(1, (x - r.s[j]) / r.ds));
    return r.grade[j] * (1 - t) + r.grade[j + 1] * t;
  };
  /** Piers moved off what lies below: each to the nearest free place within `reach` (disjoint
   * neighbourhoods preserve their order); a fully obstructed neighbourhood becomes a priced longer clear span,
   * never a hidden missing pier at the old standard price. `bounds` (long spans): a pier whose neighbourhood
   * is blocked goes on to the nearest free place between the last pier and the next one, so a long span ends
   * at the edges of what it crosses. */
  const placePiers = (base: readonly number[], reach: number, fixed: boolean, bounds?: readonly [number, number]) => {
    const piers: number[] = [];
    let changed = false;
    for (let k = 0; k < base.length; k++) {
      const s = base[k];
      if (fixed || !blocked(s, true)) { piers.push(s); continue; }
      changed = true;
      let found = false;
      for (let shift = 1; shift < reach && !found; shift++) for (const sign of [-1, 1]) {
        const candidate = s + sign * shift;
        if (!blocked(candidate, true)) { piers.push(candidate); found = true; break; }
      }
      if (found || !bounds) continue;
      const lo = (piers.length ? piers[piers.length - 1] : bounds[0]) + MIN_PIER_GAP, hi = (k + 1 < base.length ? base[k + 1] : bounds[1]) - MIN_PIER_GAP;
      for (let shift = Math.max(1, Math.ceil(reach)); !found && (s - shift >= lo || s + shift <= hi); shift++) for (const candidate of [s - shift, s + shift]) {
        if (candidate < lo || candidate > hi || blocked(candidate, true)) continue;
        piers.push(candidate); found = true; break;
      }
    }
    return { piers, changed };
  };
  /** equal spans of `span` at most between a and b (exclusive) */
  const equalPiers = (a: number, b: number, span: number) => {
    const k = Math.max(1, Math.ceil((b - a) / span - 1e-9));
    return Array.from({ length: k - 1 }, (_, j) => a + (b - a) * (j + 1) / k);
  };
  interface Plan {
    style: BridgeStyle; piers: number[]; layout: ReturnType<typeof supportBridgeLayout>; changed: boolean;
    /** the longest span it needs where it is longer than its style allows */
    tooLong?: number; arch?: BridgeArch & { rib: (s: number) => number };
    raiseM: number; worstI: number; requiredZ: number; required: Map<number, number>; regrade: [number, number]; price?: number;
  }
  /** The span-depth check of a plan: the clearance under each span, plus a deck about 1/20 of the span deep;
   * under an arch, its rib's clearance (an arch that would need lifting does not fit). */
  const depthCheck = (run: Run, plan: Plan, isManual: boolean): boolean => {
    const supports = [run.s0, ...plan.piers, run.s1];
    for (let k = 0; k + 1 < supports.length; k++) {
      const a = supports[k], b = supports[k + 1], span = b - a;
      const underArch = plan.arch && a >= plan.arch.s0 - 1e-6 && b <= plan.arch.s1 + 1e-6;
      const extraDepth = Math.max(0, span / 20 - 1.2);
      const i0 = Math.max(run.i0, Math.floor(a / r.ds + 0.5)), i1 = Math.min(run.i1, Math.floor(b / r.ds + 0.5));
      for (let i = i0; i <= i1; i++) {
        const left = Math.max(a, r.s[i] - r.ds / 2), right = Math.min(b, r.s[i] + r.ds / 2);
        if (right <= left) continue;
        const cell = cellAt(r, (left + right) / 2, (right - left) / 2, r.crownWidth / 2);
        if (underArch) {
          // the rib (its soffit) clears the ground and what lies below it as a deck would
          const rib = plan.arch!.rib((left + right) / 2);
          if (rib < r.ground[i] - 0.01 || rib < obstacle(cell) - 1.2 - 0.01) return false;
          continue;
        }
        // In an end cell the bank in front of the abutment is regraded under the first span
        // (priced excavation, ≤ abutmentCutM), instead of lifting the whole grade line.
        const end = !isManual && (i === run.i0 || i === run.i1) && run.i1 > run.i0;
        const terrainDepth = r.ground[i] + span / 20 - r.grade[i];
        if (end && terrainDepth > 0.01 && terrainDepth <= SUPPORT_LIMITS.abutmentCutM)
          plan.regrade[i === run.i0 ? 0 : 1] += terrainDepth / 2 * r.crownWidth * (right - left);
        // Clearance stays demanded over a minor road even where its abutment conflict is relocated:
        // the relocated pavement may still pass under this span (conservative; may cost a lift).
        const required = Math.max(r.ground[i] + span / 20 - (end ? SUPPORT_LIMITS.abutmentCutM : 0), obstacle(cell) + extraDepth);
        const shortfall = required - r.grade[i];
        if (shortfall > 0.01) plan.required.set(r.s[i], Math.max(required, plan.required.get(r.s[i]) ?? -Infinity));
        if (shortfall > plan.raiseM) { plan.raiseM = shortfall; plan.worstI = i; plan.requiredZ = required; }
      }
    }
    return true;
  };
  /** An arch for the bridge (BRIDGE_STYLES.arch): springings on the ground, the arch 1/1.8–1/2.8 of the
   * bridge, its rise 1/10–1/5 of its span, its rib clear of the ground. The longest such arch, then the most
   * even; undefined where none fits. O(cells² · cells) on bridges of 180–700 m only. */
  const archFor = (run: Run): Plan['arch'] => {
    const A = BRIDGE_STYLES.arch, depth = ARCH_DECK_DEPTH;
    const aMin = Math.max(A.minArch, run.length / A.lengthMax), aMax = Math.min(A.maxArch, run.length / A.lengthMin);
    if (aMin > aMax + 1e-9) return undefined;
    let best: Plan['arch'], bestA = 0, bestEven = Infinity, height = -Infinity;
    for (let i = run.i0; i <= run.i1; i++) height = Math.max(height, r.grade[i] - r.ground[i]);
    for (let ia = run.i0 + 1; ia < run.i1; ia++) for (let ib = ia + 1; ib < run.i1; ib++) {
      const sa = r.s[ia], sb = r.s[ib], a = sb - sa;
      if (a < aMin - 1e-9) continue;
      if (a > aMax + 1e-9) break;
      const za = r.ground[ia], zb = r.ground[ib], sm = (sa + sb) / 2, zc = gradeAt(sm) - depth, rise = zc - (za + zb) / 2;
      if (rise < a * A.riseMin || rise > a * A.riseMax) continue;
      const even = Math.abs(za - zb);
      if (a < bestA - 1e-9 || (a < bestA + 1e-9 && even >= bestEven)) continue;
      const rib = archRib(sa, sb, za, zb, zc);
      let clear = true;
      for (let k = ia + 1; k < ib && clear; k++) if (rib(r.s[k]) < r.ground[k] - 0.01) clear = false;
      if (!clear || blocked(sa, true) || blocked(sb, true)) continue;
      best = { s0: sa, s1: sb, height, rib }; bestA = a; bestEven = even;
    }
    return best;
  };
  for (const run of runs) {
    if (run.kind !== KIND.bridge || heldRun(run)) continue;
    const isManual = manual.subarray(run.i0, run.i1 + 1).some(Boolean);
    // The player chooses a bridge, not its piers: only a given support arrangement stays fixed.
    const fixedSupports = isManual && run.pierStations !== undefined;
    let asked: BridgeStyle | undefined;
    if (styles?.asked) for (let i = run.i0; i <= run.i1 && !asked; i++) asked = STYLE_CODES[styles.asked[i]];
    const blank = (style: BridgeStyle, piers: number[], changed: boolean): Plan => ({ style, piers, changed,
      layout: supportBridgeLayout(run.s0, run.s1, piers), raiseM: 0, worstI: run.i0, requiredZ: r.grade[run.i0], required: new Map(), regrade: [0, 0] });
    const ordinary = bridgeLayout(run.length), spans = Math.max(1, Math.round(run.length / ordinary.span));
    const originalPiers = run.pierStations ?? Array.from({ length: spans - 1 }, (_, k) => run.s0 + (k + 1) * ordinary.span);
    const plansOf = (style: BridgeStyle): Plan[] => {
      if (style === 'short') {
        const { piers, changed } = placePiers(originalPiers, ordinary.span / 2, fixedSupports);
        const plan = blank('short', piers, changed);
        if (changed && plan.layout.span > BRIDGE_STYLES.short.maxSpan) plan.tooLong = plan.layout.span;
        return [plan];
      }
      if (style === 'long') {
        // Over what lies below, a span the short-span supports need longer than short spans reach (60 m), with
        // side spans of at least BRIDGE_STYLES.long.sideSpan × it beside it (a cantilevered or launched main
        // span), the short spans beyond kept or (the cheaper) equal spans of at most 60 m; elsewhere, equal spans
        // of 45–60 m throughout.
        const short = placePiers(originalPiers, ordinary.span / 2, fixedSupports).piers;
        const supports = [run.s0, ...short, run.s1], main = (k: number) => supports[k] - supports[k - 1] > BRIDGE_STYLES.short.maxSpan + 1e-6;
        let any = false;
        for (let k = 1; k < supports.length; k++) any ||= main(k);
        if (any) {
          const keep = supports.map(() => true), mains: [number, number][] = [], added: number[] = [];
          for (let k = 1; k < supports.length; k++) if (main(k)) mains.push([supports[k - 1], supports[k]]);
          const isEnd = (x: number) => mains.some(([a, b]) => a === x || b === x);
          for (const [a, b] of mains) {
            const need = BRIDGE_STYLES.long.sideSpan * (b - a);
            for (const dir of [-1, 1]) {
              const at = supports.indexOf(dir < 0 ? a : b);
              let j = at + dir;
              for (; j > 0 && j < supports.length - 1; j += dir) {
                if (Math.abs(supports[j] - supports[at]) >= need - 1e-6 || isEnd(supports[j])) break;
                keep[j] = false;
              }
              // the side span just as long as it needs, where a pier can stand there (the next span not too short)
              const x = supports[at] + dir * need, next = supports[Math.max(0, Math.min(supports.length - 1, j))];
              if (!isEnd(next) && Math.abs(next - supports[at]) > need + MIN_PIER_GAP && !blocked(x, true)) added.push(x);
            }
          }
          const kept = [...supports.filter((_, k) => keep[k]), ...added].sort((p, q) => p - q);
          const plans = [blank('long', kept.slice(1, -1), true)];
          // …or, away from those spans and the spans beside them, equal spans of at most 60 m (a tall viaduct
          // over a road: the cheaper of the two)
          if (styles?.price) {
            const fixed = new Set([0, kept.length - 1]);
            for (let k = 1; k < kept.length; k++) if (mains.some(([a, b]) => a === kept[k - 1] && b === kept[k]))
              for (const j of [k - 2, k - 1, k, k + 1]) if (j >= 0 && j < kept.length) fixed.add(j);
            const ends = [...fixed].sort((a, b) => a - b), piers: number[] = [];
            for (let e = 1; e < ends.length; e++) {
              const a = ends[e - 1], b = ends[e];
              if (a > 0) piers.push(kept[a]);
              piers.push(...(b - a > 1 ? equalPiers(kept[a], kept[b], BRIDGE_STYLES.long.span + 1e-6) : []));
            }
            const placed = placePiers(piers, BRIDGE_STYLES.long.span / 2, false, [run.s0, run.s1]).piers;
            if (placed.join() !== kept.slice(1, -1).join()) plans.push(blank('long', placed, true));
          }
          for (const plan of plans) if (plan.layout.span > BRIDGE_STYLES.long.maxSpan) plan.tooLong = plan.layout.span;
          return plans;
        }
        return (styles?.price ? longLayouts(run.length) : longLayouts(run.length).slice(0, 1)).map(layout => {
          const { piers } = placePiers(equalPiers(run.s0, run.s1, layout.span + 1e-6), layout.span / 2, false, [run.s0, run.s1]);
          const plan = blank('long', piers, true);
          if (plan.layout.span > BRIDGE_STYLES.long.maxSpan) plan.tooLong = plan.layout.span;
          return plan;
        });
      }
      const arch = archFor(run);
      if (!arch) return [];
      const span = BRIDGE_STYLES.arch.columnSpan;
      const left = placePiers(equalPiers(run.s0, arch.s0, span), span / 2, false), right = placePiers(equalPiers(arch.s1, run.s1, span), span / 2, false);
      const plan = blank('arch', [...left.piers, arch.s0, arch.s1, ...right.piers], true);
      plan.arch = arch;
      // (the approach spans as short spans)
      const supports = [run.s0, ...left.piers, arch.s0], after = [arch.s1, ...right.piers, run.s1];
      let approach = 0;
      for (const list of [supports, after]) for (let k = 1; k < list.length; k++) approach = Math.max(approach, list[k] - list[k - 1]);
      if (approach > BRIDGE_STYLES.short.maxSpan) plan.tooLong = approach;
      plan.layout = { span: approach, pierDensity: plan.layout.pierDensity };
      return [plan];
    };
    const priced = (plan: Plan) => {
      if (styles?.price && plan.price === undefined)
        plan.price = styles.price(run.i0, run.i1, run.length, plan.layout, plan.piers,
          plan.style === 'short' ? {} : { style: plan.style, ...(plan.arch ? { arch: { s0: plan.arch.s0, s1: plan.arch.s1, height: plan.arch.height } } : {}) });
      return plan.price ?? 0;
    };
    // every style's plans that can stand (an arch whose rib would need lifting does not)
    const fits: Plan[] = [], unfit: Plan[] = [];
    const consider = (style: BridgeStyle) => {
      for (const plan of plansOf(style)) {
        if (plan.tooLong !== undefined) { unfit.push(plan); continue; }
        if (depthCheck(run, plan, isManual)) fits.push(plan); else unfit.push(plan);
      }
    };
    if (styles?.price) {
      const quick = styles.arch === false && !asked;
      let top = -Infinity;
      if (quick) for (let i = run.i0; i <= run.i1; i++) top = Math.max(top, r.grade[i] - r.ground[i]);
      for (const style of BRIDGE_STYLE_ORDER) {
        if (style === 'arch' && styles.arch === false && asked !== 'arch') continue;
        if (style === 'long' && quick && fits.length && styles.mayPay && !longLayouts(run.length).some(l => styles.mayPay!(top, run.length, l))) continue;
        consider(style);
      }
      if (!fits.length && styles.arch === false && asked !== 'arch') consider('arch');
    }
    else for (const style of asked ? [asked, ...BRIDGE_STYLE_ORDER.filter(x => x !== asked)] : BRIDGE_STYLE_ORDER) { consider(style); if (fits.length) break; }
    // a player's style that does not fit here: said, and the bridge is built as Auto would
    const mine = asked ? fits.filter(p => p.style === asked) : [];
    if (asked && !mine.length) {
      const tooLong = unfit.find(p => p.style === asked)?.tooLong;
      const why = tooLong === undefined ? `An arch of ${BRIDGE_STYLES.arch.minArch}–${BRIDGE_STYLES.arch.maxArch} m does not fit this valley` : `Its spans would have to be ${Math.round(tooLong)} m long`;
      violations.push({ kind: 'structure', basis: 'game', s0: run.s0, s1: run.s1, title: `This bridge cannot be built with ${STYLE_WORDS[asked]}`,
        fix: 'Choose another bridge style, or set it back to Automatic',
        rule: asked === 'arch' && tooLong === undefined ? `An arch springs from the valley sides: the bridge ${BRIDGE_STYLES.arch.lengthMin}–${BRIDGE_STYLES.arch.lengthMax} times as long as the arch, which rises 1/10–1/5 of its span`
          : `Game rule: ${STYLE_WORDS[asked]} reach at most ${asked === 'long' ? BRIDGE_STYLES.long.maxSpan : BRIDGE_STYLES.short.maxSpan} m`,
        detail: `${why}. It is built as Auto would build it.` });
    }
    const pool = mine.length ? mine : fits;
    // Auto: the cheapest that needs no lift, else the least lift
    const rank = (p: Plan) => [p.raiseM > 0.01 ? p.raiseM : 0, priced(p)];
    let chosen: Plan | undefined;
    for (const plan of pool) {
      if (!chosen) { chosen = plan; continue; }
      const [l, c] = rank(plan), [l0, c0] = rank(chosen);
      if (l < l0 - 1e-9 || (Math.abs(l - l0) <= 1e-9 && c < c0 - 1e-6)) chosen = plan;
    }
    if (!chosen) {
      // Retain the original, fully billed supports; the downstream screen must still flag
      // their collisions. Do not fabricate an arbitrarily long feasible bridge from a price proxy.
      const plan = blank('short', [...originalPiers], false);
      diagnostics.push({ s: (run.s0 + run.s1) / 2, reason: 'span-limit', extensionM: 0, raiseM: 0,
        requiredSpanM: Math.min(...unfit.map(p => p.tooLong ?? Infinity)), cells: [run.i0, run.i1], automatic: !isManual });
      depthCheck(run, plan, isManual);
      chosen = plan;
    }
    if (chosen.changed) { run.pierStations = chosen.piers; run.layout = chosen.layout; }
    if (chosen.style !== 'short') run.style = chosen.style;
    if (chosen.arch) run.arch = { s0: chosen.arch.s0, s1: chosen.arch.s1, height: chosen.arch.height };
    if (asked && chosen.style === asked) run.styleChosen = asked;
    if (styles?.price) {
      const prices: Partial<Record<BridgeStyle, number>> = {};
      for (const plan of fits) if (plan.raiseM <= 0.01 || plan === chosen) prices[plan.style] = Math.min(prices[plan.style] ?? Infinity, priced(plan));
      run.styles = prices;
    }
    for (const [s, z] of chosen.required) requiredElevations.set(s, Math.max(z, requiredElevations.get(s) ?? -Infinity));
    if (chosen.regrade[0] + chosen.regrade[1] > 0) run.regradeM3 = chosen.regrade;
    const raiseM = chosen.raiseM, worstI = chosen.worstI;
    if (raiseM > 0.01) {
      diagnostics.push({ s: r.s[worstI], reason: 'span-depth', extensionM: 0, raiseM, requiredZ: chosen.requiredZ });
      violations.push({ kind: 'structure', basis: 'game', s0: r.s[worstI], s1: r.s[worstI],
        title: `${SPAN_TOO_LOW} over what it crosses`,
        fix: `Raise the bridge at km ${(r.s[worstI] / 1000).toFixed(2)} by at least ${(Math.ceil(raiseM * 10 - 1e-9) / 10).toFixed(1)} m, or move the route so the ${chosen.layout.span.toFixed(0)} m span can be shorter`,
        rule: 'Game rule: the clearance under the bridge, plus a deck about 1/20 of the span deep',
        detail: 'To keep its supports off the roads, railways or water below, this bridge has a long span; a long span needs a deeper deck, which eats into the clearance.' });
    }
  }
  return { kind, runs, diagnostics, violations,
    clearanceRequirements: Array.from(requiredElevations, ([s, z]) => ({ s, z })) };
}
