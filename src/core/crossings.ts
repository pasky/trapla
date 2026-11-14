// Study-stage network resolution. Connections are geometrical proxies, not an OSM routing solution.
import { surchargeRate } from './cost';
import { ACCESS, CROSSING_RULES, JUNCTION, ROAD_CLASSES } from './data/urban';
import { STRUCTURE_RULES } from './data/prices';
import { KIND } from './structures';
import type { Violation } from './checks';
import type { RoadCrossing, RoadNet } from './roadnet';

export type CrossingChoice = 'junction' | 'bridge' | 'overbridge' | 'reconnection';
/** Pack way index, stable within a scenario pack, not a station or merged-list index.
 * One choice applies to every intersection of that way. Omission restores Auto. */
export interface CrossingOverride { roadId: number; type: CrossingChoice }
export interface CrossingPoint { x: number; y: number; z: number }
export interface CrossingGeometry {
  /** Existing road, continuous under our bridge or over our cut. */
  road?: CrossingPoint[];
  /** Two side links, ending on existing roads / A/B collector anchors, never on our axis. */
  links?: [CrossingPoint[], CrossingPoint[]];
  width: number;
  /** Display geometry is a proxy; billed linkLength remains the documented station-gap quantity. */
  schematic: true;
}
export interface CrossingIssue extends Violation {
  crossing: { roadId?: number; requested: CrossingChoice;
    code: 'spacing' | 'class' | 'depth' | 'clearance' | 'structure' | 'reach';
    actual?: number; required?: number; targetS?: number };
}
export interface CrossingResult {
  s: number; i: number; x: number; y: number;
  cls: string;
  /** Pack way index; optional only for legacy/synthetic callers. */
  roadId?: number;
  requestedType?: CrossingChoice;
  issues?: CrossingIssue[];
  geometry?: CrossingGeometry;
  /** New grade minus crossed-road ground, m. */
  h: number;
  type: 'bridge' | 'tunnel' | 'overbridge' | 'junction' | 'reconnection' | 'diversion' | 'atGrade';
  /** Crossing-only cost excluding surcharge. Main-road structures are billed in their own runs. */
  cost: number;
  /** Both sides together, using the study-stage station-gap proxy, m. */
  linkLength?: number;
  targetS?: number;
  /** Disambiguates independently selected roads at the same station; absent for A/B collectors. */
  targetRoadId?: number;
  span?: number;
  approachLength?: number;
  roadCode?: string;
  roadPerKm?: number;
}

export function normalizeCrossingOverrides(value: unknown): CrossingOverride[] {
  if (!Array.isArray(value)) return [];
  const byRoad = new Map<number, CrossingOverride>();
  for (const o of value) if (o && Number.isSafeInteger(o.roadId) && o.roadId >= 0
    && ['junction', 'bridge', 'overbridge', 'reconnection'].includes(o.type)) byRoad.set(o.roadId, { roadId: o.roadId, type: o.type });
  return [...byRoad.values()].sort((a, b) => a.roadId - b.roadId);
}

export function crossingChoice(roadId: number | undefined, overrides: readonly CrossingOverride[] = []): CrossingChoice | undefined {
  for (let i = overrides.length - 1; i >= 0; i--) if (overrides[i].roadId === roadId) return overrides[i].type;
  return undefined;
}

/** Compose requested bridge cells with the existing manual mask (−1 elsewhere!). Pass this to
 * chooseStructures.overrides, never replace its economic/river/rail forced mask. Invalid bridges
 * stay built and billed; chooseStructures reports low/short runs. Crossing choices win overlapping
 * structure paint locally; unrelated paint remains untouched. Call at BOTH full and balance grids. */
export function crossingBridgeMask(s: ArrayLike<number>, raw: readonly RoadCrossing[],
  overrides: readonly CrossingOverride[] = [], base?: ArrayLike<number>): Int8Array {
  const mask = base ? Int8Array.from(base) : new Int8Array(s.length).fill(-1);
  if (s.length < 2) return mask;
  const ds = s[1] - s[0];
  const pad = Math.max(1, Math.ceil((STRUCTURE_RULES.minBridgeLength / ds - 1) / 2));
  for (const c of raw) if (crossingChoice(c.way, overrides) === 'bridge') {
    const i = Math.max(0, Math.min(s.length - 1, Math.round(c.s / ds)));
    for (let j = Math.max(0, i - pad); j <= Math.min(s.length - 1, i + pad); j++) mask[j] = KIND.bridge;
  }
  return mask;
}

/** Shared automatic/manual pricing; excludes main-road bridge/tunnel costs and surcharge. */
export function overbridgePrice(c: CrossingResult, footprint: number, urban: number) {
  const row = ROAD_CLASSES[c.cls], u = urban >= 0.5 ? 1 : 0;
  const approachLength = 2 * Math.max(0, CROSSING_RULES.underDepth + c.h) / CROSSING_RULES.approachGradient;
  const span = footprint, roadPerKm = row.roadPerKm[u];
  return { span, approachLength, roadPerKm, roadCode: row.roadCodes[u], cost: (span * row.bridgePerKm + approachLength * roadPerKm) / 1000 };
}
export function reconnectionPrice(c: CrossingResult, gap: number, urban: number) {
  const row = ROAD_CLASSES[c.cls], u = urban >= 0.5 ? 1 : 0;
  const linkLength = 2 * Math.max(CROSSING_RULES.linkMinLength, gap), roadPerKm = row.roadPerKm[u];
  return { linkLength, roadPerKm, roadCode: row.roadCodes[u],
    cost: linkLength * roadPerKm / 1000 + (c.cls === 'service' ? ACCESS : 0) };
}

const rank = Object.fromEntries(Object.keys(ROAD_CLASSES).map((key, i) => [key, i]));

/** Mutates results, retaining station order. A/B consume junction spacing and include a collector,
 * NOT motorway access. Manual choices precede class-priority Auto junctions. Links expand from
 * already-resolved compatible roads, never cyclic pairs of severed roads. Invalid choices are
 * visible and priced, but cannot become anchors for another road. */
export function resolveCrossings(crossings: CrossingResult[], length: number, kind: ArrayLike<number>,
  footprint: ArrayLike<number>, urban: ArrayLike<number>, billingUrban: ArrayLike<number> = urban,
  overrides: readonly CrossingOverride[] = []): CrossingIssue[] {
  const issues: CrossingIssue[] = [];
  const issue = (c: CrossingResult, code: CrossingIssue['crossing']['code'], title: string, fix: string,
    actual?: number, required?: number, targetS?: number) => {
    const v: CrossingIssue = { kind: 'crossing', s0: c.s, s1: c.s, title, fix, basis: 'game',
      rule: 'Crossing feasibility model; junction spacing 1.5 km including A/B (ČSN 73 6101:2018, scenario assumption in town)',
      detail: 'The requested choice remains visible and priced. Clear it to restore automatic resolution.',
      crossing: { roadId: c.roadId, requested: c.requestedType!, code, actual, required, targetS } };
    issues.push(v); (c.issues ??= []).push(v);
  };
  const priority = [...crossings].sort((a, b) => rank[a.cls] - rank[b.cls] || a.s - b.s || a.i - b.i);
  const junctions = [0, length];
  const anchors: { s: number; cls?: string; roadId?: number }[] = [{ s: 0 }, { s: length }];
  const separated = (c: CrossingResult) => overbridgePrice(c, footprint[c.i], urban[c.i]);
  for (const c of crossings) {
    c.type = 'atGrade'; c.cost = 0;
    delete c.linkLength; delete c.targetS; delete c.targetRoadId; delete c.span; delete c.approachLength;
    delete c.roadCode; delete c.roadPerKm; delete c.issues; delete c.geometry;
    c.requestedType = crossingChoice(c.roadId, overrides);
  }
  for (const c of priority) {
    const choice = c.requestedType, row = ROAD_CLASSES[c.cls];
    if (!choice) continue;
    c.type = choice === 'reconnection' && c.cls === 'track' ? 'diversion' : choice;
    if (choice !== 'bridge' && kind[c.i] !== KIND.earth) issue(c, 'structure', 'Crossing conflicts with the main-road structure',
      'Clear this crossing choice or move/clear the bridge or tunnel here');
    if ((choice === 'junction' && !row.junction) || (choice === 'reconnection' && row.noAtGrade))
      issue(c, 'class', `${row.label} cannot have this connection`, 'Choose a bridge with sufficient clearance or an overbridge in a deep cut');
    if (choice === 'bridge') {
      const need = row.noAtGrade ? STRUCTURE_RULES.railClearance : CROSSING_RULES.overHeight;
      if (c.h < need - 1e-6) issue(c, 'clearance', 'Bridge has insufficient road clearance',
        `Raise the new road by ${(need - c.h).toFixed(1)} m to at least ${need} m above the crossed road`, c.h, need);
      if (kind[c.i] !== KIND.bridge) issue(c, 'structure', 'Requested main-road bridge is not built',
        'Apply the crossing bridge mask before structure selection and billing');
    } else if (choice === 'overbridge') {
      Object.assign(c, separated(c));
      // Explicit overbridge = our road below the existing one. Auto may buy raised approaches.
      // Retain those approach costs even for an invalid manual request: no fictitious flat deck.
      if (c.h > -CROSSING_RULES.underDepth + 1e-6) issue(c, 'depth', 'Overbridge needs a deeper cut',
        `Lower the new road by ${(c.h + CROSSING_RULES.underDepth).toFixed(1)} m to ${CROSSING_RULES.underDepth} m below the crossed road`, -c.h, CROSSING_RULES.underDepth);
    } else if (choice === 'junction') {
      c.cost = JUNCTION;
      const near = junctions.reduce((a, s) => Math.abs(c.s - s) < Math.abs(c.s - a) ? s : a, junctions[0]);
      const gap = Math.abs(c.s - near);
      if (gap < CROSSING_RULES.junctionSpacing) issue(c, 'spacing', 'Junctions are too close',
        `Keep at least ${CROSSING_RULES.junctionSpacing} m from the junction/tie-in at km ${(near / 1000).toFixed(2)} (now ${gap.toFixed(0)} m), or choose grade separation`, gap, CROSSING_RULES.junctionSpacing, near);
      if (c.h <= -CROSSING_RULES.underDepth) issue(c, 'depth', 'Junction lies below the existing road',
        `Raise the new road by more than ${(-CROSSING_RULES.underDepth - c.h).toFixed(1)} m out of the ${CROSSING_RULES.underDepth} m deep-cut range, or choose an overbridge`, c.h, -CROSSING_RULES.underDepth);
      if (c.h >= CROSSING_RULES.overHeight) issue(c, 'clearance', 'Junction lies above the existing road',
        `Lower the new road by more than ${(c.h - CROSSING_RULES.overHeight).toFixed(1)} m out of the ${CROSSING_RULES.overHeight} m bridge range, or choose a bridge`, c.h, CROSSING_RULES.overHeight);
      junctions.push(c.s);
    }
    if (choice !== 'reconnection' && !row.noAtGrade && !c.issues?.length) anchors.push(c);
  }
  for (const c of priority) {
    const row = ROAD_CLASSES[c.cls];
    if (c.requestedType) continue;
    if (kind[c.i] === KIND.bridge) c.type = 'bridge';
    else if (kind[c.i] === KIND.tunnel) c.type = 'tunnel';
    else if (row.noAtGrade && c.h <= -CROSSING_RULES.underDepth) {
      c.type = 'overbridge'; Object.assign(c, separated(c));
    } else continue;
    if (!row.noAtGrade) anchors.push(c);
  }
  for (const c of priority) {
    if (c.requestedType || c.type !== 'atGrade' || !ROAD_CLASSES[c.cls].junction || c.h <= -CROSSING_RULES.underDepth) continue;
    if (junctions.every(s => Math.abs(c.s - s) >= CROSSING_RULES.junctionSpacing)) {
      c.type = 'junction'; c.cost = JUNCTION;
      junctions.push(c.s); anchors.push(c);
    }
  }
  const pending = priority.filter(c => c.requestedType === 'reconnection' || (c.type === 'atGrade' && !ROAD_CLASSES[c.cls].noAtGrade));
  const tier = (c: CrossingResult) => ROAD_CLASSES[c.cls].junction ? 0 : c.cls === 'track' ? 3 : c.cls === 'service' ? 2 : 1;
  const nearest = pending.map(c => {
    let target = anchors[0], gap = Infinity;
    for (const a of anchors) if (compatible(c, a.cls)) {
      const d = Math.abs(c.s - a.s);
      if (d < gap || (d === gap && a.s < target.s)) { gap = d; target = a; }
    }
    return { c, target, gap };
  });
  while (nearest.length) {
    let next = 0;
    for (let i = 1; i < nearest.length; i++) {
      const a = nearest[i], b = nearest[next];
      if (tier(a.c) < tier(b.c) || (tier(a.c) === tier(b.c) && (a.gap < b.gap || (a.gap === b.gap && a.c.s < b.c.s)))) next = i;
    }
    const { c, target, gap } = nearest.splice(next, 1)[0];
    const link = reconnectionPrice(c, gap, urban[c.i]);
    const access = c.cls === 'service' ? ACCESS : 0;
    const linkCost = link.cost - access;
    const over = separated(c);
    const surcharge = 1 + surchargeRate(billingUrban[c.i]);
    if (c.requestedType === 'reconnection' || (gap <= CROSSING_RULES.linkMaxReach && linkCost * surcharge + access < over.cost * surcharge)) {
      c.type = c.cls === 'track' ? 'diversion' : 'reconnection';
      Object.assign(c, link); c.targetS = target.s; c.targetRoadId = target.roadId;
      if (c.requestedType && gap > CROSSING_RULES.linkMaxReach) issue(c, 'reach', 'Reconnection is too far from a usable crossing',
        `Choose an overbridge or provide a compatible crossing within ${CROSSING_RULES.linkMaxReach} m (now ${gap.toFixed(0)} m)`, gap, CROSSING_RULES.linkMaxReach, target.s);
    } else {
      c.type = 'overbridge'; Object.assign(c, over);
    }
    for (const p of nearest) if (!c.issues?.length && !ROAD_CLASSES[c.cls].noAtGrade && compatible(p.c, c.cls)) {
      const d = Math.abs(p.c.s - c.s);
      if (d < p.gap || (d === p.gap && c.s < p.target.s)) { p.gap = d; p.target = c; }
    }
  }
  return issues;
}

function compatible(c: CrossingResult, cls?: string): boolean {
  return c.cls === 'track' || c.cls === 'service' || (cls !== 'track' && cls !== 'service');
}

export function crossingLabel(c: CrossingResult): string {
  switch (c.type) {
    case 'bridge': return 'passes under the new bridge';
    case 'tunnel': return 'the new road is in a tunnel below';
    case 'overbridge': return `overbridge ${Math.round(c.span!)} m${c.approachLength ? ` + approaches ${Math.round(c.approachLength)} m` : ''}`;
    case 'junction': return 'junction';
    case 'reconnection': case 'diversion': return `${c.type} ${Math.round(c.linkLength!)} m (both sides, to km ${(c.targetS! / 1000).toFixed(2)})`;
    case 'atGrade': return 'at grade — not allowed';
  }
}

/** Geometry inputs deliberately do not import evaluate.ts; safe in the worker and synthetic tests. */
export interface CrossingRoute {
  s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>;
  tx: ArrayLike<number>; ty: ArrayLike<number>; grade: ArrayLike<number>;
  /** Actual built footprint, not the earthwork option under a bridge. */
  width: ArrayLike<number>;
}

/** Attach bounded, terrain-draped schematic geometry without changing any price or resolution.
 * Real crossed-way vertices are retained. Links follow opposite sides of the route to the actual
 * resolved crossing (or the assumed A/B collector); no fabricated third crossing is introduced. */
export function buildCrossingGeometry(crossings: CrossingResult[], route: CrossingRoute,
  heightAt: (x: number, y: number) => number, roads?: RoadNet): void {
  const n = route.s.length;
  if (n < 2) return;
  const at = (s: number) => {
    let lo = 0, hi = n - 1;
    while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (route.s[m] <= s) lo = m; else hi = m; }
    const t = Math.max(0, Math.min(1, (s - route.s[lo]) / (route.s[hi] - route.s[lo] || 1)));
    const lerp = (v: ArrayLike<number>) => v[lo] + (v[hi] - v[lo]) * t;
    const tx = lerp(route.tx), ty = lerp(route.ty), norm = Math.hypot(tx, ty) || 1;
    return { x: lerp(route.x), y: lerp(route.y), tx: tx / norm, ty: ty / norm, z: lerp(route.grade), width: lerp(route.width) };
  };
  const sidePoint = (s: number, side: number, extra = 5): CrossingPoint => {
    const p = at(s), off = p.width / 2 + extra;
    const x = p.x - p.ty * off * side, y = p.y + p.tx * off * side;
    return { x, y, z: heightAt(x, y) };
  };
  const anchor = new Map<CrossingResult, [CrossingPoint, CrossingPoint]>();
  for (const c of crossings) {
    const p = at(c.s), half = Math.max(15, p.width / 2 + 8), reach = half + (c.approachLength ?? 0) / 2 + 25;
    let path = c.roadId === undefined ? [] : roads?.crossingPath(c.roadId, c.x, c.y, reach) ?? [];
    if (path.length < 2) path = [-reach, 0, reach].map(d => ({ x: c.x - p.ty * d, y: c.y + p.tx * d, d }));
    // Add regular samples so a two-vertex way drapes over terrain / approaches instead of spanning it.
    const dense: typeof path = [];
    for (let j = 0; j + 1 < path.length; j++) {
      const a = path[j], b = path[j + 1], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10));
      for (let k = 0; k < steps; k++) { const t = k / steps; dense.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), d: a.d + t * (b.d - a.d) }); }
    }
    dense.push(path[path.length - 1]);
    const ground = heightAt(c.x, c.y), deck = Math.max(ground, ground + c.h + CROSSING_RULES.underDepth);
    const road = dense.map(q => {
      const lateral = Math.abs((q.x - c.x) * -p.ty + (q.y - c.y) * p.tx);
      const z = heightAt(q.x, q.y);
      return { x: q.x, y: q.y, z: c.type === 'overbridge' ? Math.max(z, deck - Math.max(0, lateral - p.width / 2) * CROSSING_RULES.approachGradient) : z };
    });
    // Intersect each side's offset with the real road polyline; never attach the side link to our axis.
    const ends = [-1, 1].map(side => {
      const off = (p.width / 2 + 5) * side;
      for (let j = 0; j + 1 < road.length; j++) {
        const a = road[j], b = road[j + 1];
        const da = (a.x - c.x) * -p.ty + (a.y - c.y) * p.tx, db = (b.x - c.x) * -p.ty + (b.y - c.y) * p.tx;
        if ((da <= off && db >= off) || (db <= off && da >= off)) {
          const t = (off - da) / (db - da || 1);
          return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), z: a.z + t * (b.z - a.z) };
        }
      }
      return sidePoint(c.s, side);
    }) as [CrossingPoint, CrossingPoint];
    anchor.set(c, ends);
    c.geometry = { width: c.cls === 'track' ? 4 : c.cls === 'motorway' || c.cls === 'trunk' ? 11.5 : 7.5, schematic: true };
    if (['bridge', 'overbridge', 'tunnel', 'junction'].includes(c.type)) c.geometry.road = road;
  }
  for (const c of crossings) if (c.targetS !== undefined && (c.type === 'reconnection' || c.type === 'diversion')) {
    const target = crossings.find(t => t !== c && t.s === c.targetS && t.roadId === c.targetRoadId
      && !t.issues?.length && !ROAD_CLASSES[t.cls].noAtGrade);
    const stations = Array.from(route.s).filter(s => s > Math.min(c.s, c.targetS!) && s < Math.max(c.s, c.targetS!));
    if (c.targetS < c.s) stations.reverse();
    c.geometry!.links = [-1, 1].map((side, k) => [anchor.get(c)![k], ...stations.map(s => sidePoint(s, side)),
      target ? anchor.get(target)![k] : sidePoint(c.targetS!, side)]) as [CrossingPoint[], CrossingPoint[]];
  }
}
