// Study-stage network resolution with terrain profiles on the actual OSM alignment.
import { surchargeRate } from './cost';
import { bridgeModel } from './bridge';
import { ACCESS, CROSSING_RULES, JUNCTION, ROAD_CLASSES } from './data/urban';
import { STRUCTURE_RULES } from './data/prices';
import { underpassAssembly, UNDERPASS_RULES } from './data/remedies';
import { underpassFits } from './crossing-geometry';
import { KIND } from './structures';
import type { Violation } from './checks';
import type { RoadCrossing } from './roadnet';

export const CROSSING_CHOICES = ['junction', 'bridge', 'overbridge', 'reconnection', 'underpass'] as const;
export type CrossingChoice = typeof CROSSING_CHOICES[number];
/** Pack way index, stable within a scenario pack, not a station or merged-list index.
 * One choice applies to every intersection of that way. Omission restores Auto. */
export interface CrossingOverride { roadId: number; type: CrossingChoice }
export interface CrossingPoint {
  x: number; y: number; z: number;
  ground: number;
  surface: 'terrain' | 'ramp' | 'deck';
  /** Ramps are engineered surfaces, not unsupported ribbons. Cuts use retaining faces. */
  support?: 'embankment' | 'retaining';
  /** Signed chainage along the existing crossed way (road samples only). */
  d?: number;
  /** A terminating T-junction meets the constructed main road, not the removed old ground. */
  connection?: 'main-road';
}
export interface CrossingGeometry {
  /** Existing road, continuous under our bridge or over our cut. */
  road?: CrossingPoint[];
  /** Two side links, ending on existing roads / A/B collector anchors, never on our axis. */
  links?: [CrossingPoint[], CrossingPoint[]];
  width: number;
  /** Inclusive indices in road; deck top clears our crown by 4.8 m plus this depth. */
  deck?: { start: number; end: number; depth: number };
  /** Inclusive road-index ranges from each terrain tie-in to the adjusted footprint. */
  approaches?: [{ start: number; end: number }, { start: number; end: number }];
  /** Underpass: inclusive road indices of the two portals (the way's footprint toe crossings);
   * the way keeps its terrain level through a closed RC box of this clear opening. */
  underpass?: { start: number; end: number; width: number; height: number; roof: number; wall: number };
  /** Reconnection/diversion: signed way chainages where the severed way leaves the footprint. */
  removed?: [number, number];
  /** Severed existing-road ends at the sources of the two links. */
  turnarounds?: CrossingPoint[];
  /** Explicit priced turning disk, distinct from legacy small severed-end heads. */
  turnaroundRadius?: number;
  schematic: false;
  /** Incomplete source topology / bounded geometry, never silently invented extensions. */
  clipped?: boolean;
  diagnostics?: string[];
}
export interface CrossingIssue extends Violation {
  crossing: { roadId?: number; requested: CrossingChoice;
    code: 'spacing' | 'class' | 'depth' | 'clearance' | 'structure' | 'reach' | 'geometry' | 'underpass';
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
  type: 'bridge' | 'tunnel' | 'overbridge' | 'junction' | 'reconnection' | 'diversion' | 'underpass' | 'atGrade';
  /** Crossing-only cost excluding surcharge. Main-road structures are billed in their own runs. */
  cost: number;
  /** Both sides together, measured in plan from the built link geometry, m. */
  linkLength?: number;
  targetS?: number;
  /** Disambiguates independently selected roads at the same station; absent for A/B collectors. */
  targetRoadId?: number;
  span?: number;
  approachLength?: number;
  /** Underpass box length along the crossed way, toe to toe, m (measured from the geometry). */
  underpassLength?: number;
  roadCode?: string;
  roadPerKm?: number;
}

export function normalizeCrossingOverrides(value: unknown): CrossingOverride[] {
  if (!Array.isArray(value)) return [];
  const byRoad = new Map<number, CrossingOverride>();
  for (const o of value) if (o && Number.isSafeInteger(o.roadId) && o.roadId >= 0
    && CROSSING_CHOICES.includes(o.type)) byRoad.set(o.roadId, { roadId: o.roadId, type: o.type });
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
    // Tie-ins remain at grade. An endpoint request is still diagnosed by resolveCrossings rather
    // than drawing a bridge into A/B; a clipped short run remains a structure violation.
    for (let j = Math.max(1, i - pad); j <= Math.min(s.length - 2, i + pad); j++) mask[j] = KIND.bridge;
  }
  return mask;
}

/** Shared automatic/manual pricing; excludes main-road bridge/tunnel costs and surcharge. */
export function overbridgePrice(c: CrossingResult, footprint: number, urban: number) {
  const row = ROAD_CLASSES[c.cls], u = urban >= 0.5 ? 1 : 0;
  const approachLength = 2 * Math.max(0, CROSSING_RULES.underDepth + c.h) / CROSSING_RULES.approachGradient;
  const span = footprint, roadPerKm = row.roadPerKm[u];
  // The cut/road corridor stays unobstructed: one clear span, bank-top abutments, no fictitious
  // piers on the main road. Depth below the banks is not a pier height. Raised approaches stay separate.
  const deck = bridgeModel(row).total(span, 0, { span, pierDensity: 0 });
  return { span, approachLength, roadPerKm, roadCode: row.roadCodes[u], cost: deck + approachLength * roadPerKm / 1000 };
}
export function reconnectionPrice(c: CrossingResult, gap: number, urban: number) {
  const row = ROAD_CLASSES[c.cls], u = urban >= 0.5 ? 1 : 0;
  const linkLength = 2 * Math.max(CROSSING_RULES.linkMinLength, gap), roadPerKm = row.roadPerKm[u];
  const linkCost = linkLength * roadPerKm / 1000;
  return { linkLength, roadPerKm, roadCode: row.roadCodes[u], linkCost,
    cost: linkCost + (c.cls === 'service' ? ACCESS : 0) };
}

/** Small RC box carrying the crossed way through our embankment, or undefined when its class
 * has no underpass size. `length` is the box length along the crossed way. */
export function underpassPrice(c: Pick<CrossingResult, 'cls'>, length: number, urban: number) {
  const row = ROAD_CLASSES[c.cls], u = urban >= 0.5 ? 1 : 0;
  if (!row.underpass) return undefined;
  const box = underpassAssembly(row.underpass, row.roadPerKm[u] / 1000);
  return { underpassLength: length, roadCode: row.roadCodes[u], roadPerKm: row.roadPerKm[u], cost: length * box.perM + 2 * box.head,
    minHeight: box.minHeight, box };
}
const priced = (p: NonNullable<ReturnType<typeof underpassPrice>>) => ({ underpassLength: p.underpassLength, roadCode: p.roadCode, roadPerKm: p.roadPerKm, cost: p.cost });

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
      rule: {
        spacing: 'Junctions need 1.5 km spacing including A/B (ČSN 73 6101:2018, scenario assumption in town)',
        class: 'Motorways and expressways must remain grade-separated, with no direct access (game crossing rule)',
        depth: 'Chosen overbridges require a 6 m cut; junctions cannot lie in the deep-cut range (game crossing rule)',
        clearance: 'Our bridge needs 6 m above ordinary roads, 7.5 m above motorways; a junction cannot lie in the bridge range (game crossing rule)',
        structure: 'The crossing choice and the built main-road structure must agree (game crossing rule)',
        reach: `Reconnections reach at most ${CROSSING_RULES.linkHardReach} m along the route to their target (shared manual/Auto study-stage limit)`,
        geometry: 'Crossing geometry must tie to real roads at terrain level',
        underpass: `A small underpass carries only tracks, service and local roads, needs the grade at least clear height + roof + cover above them and is at most ${UNDERPASS_RULES.maxLength} m long (research/19, provisional)`,
      }[code],
      detail: 'Your choice stays as you made it and is priced. Set it back to Automatic to let the game decide.',
      crossing: { roadId: c.roadId, requested: c.requestedType!, code, actual, required, targetS } };
    issues.push(v); (c.issues ??= []).push(v);
  };
  const priority = [...crossings].sort((a, b) => rank[a.cls] - rank[b.cls] || a.s - b.s || a.i - b.i);
  const junctions = [0, length];
  const anchors: { s: number; cls?: string; roadId?: number }[] = [{ s: 0 }, { s: length }];
  const separated = (c: CrossingResult) => overbridgePrice(c, footprint[c.i], urban[c.i]);
  for (const c of crossings) {
    c.type = 'atGrade'; c.cost = 0;
    delete c.linkLength; delete c.targetS; delete c.targetRoadId; delete c.span; delete c.approachLength; delete c.underpassLength;
    delete c.roadCode; delete c.roadPerKm; delete c.issues; delete c.geometry;
    c.requestedType = crossingChoice(c.roadId, overrides);
  }
  for (const c of priority) {
    const choice = c.requestedType, row = ROAD_CLASSES[c.cls];
    if (!choice) continue;
    c.type = choice === 'reconnection' && c.cls === 'track' ? 'diversion' : choice;
    if (choice !== 'bridge' && kind[c.i] !== KIND.earth) issue(c, 'structure', 'Crossing conflicts with the main-road structure',
      'Clear this crossing choice or move/clear the bridge or tunnel here');
    // row.junction is an Auto candidate heuristic, not a ban on manually connecting local roads.
    if ((choice === 'junction' || choice === 'reconnection') && row.noAtGrade)
      issue(c, 'class', `${row.label} cannot have this connection`, 'Choose a bridge with sufficient clearance or an overbridge in a deep cut');
    if (choice === 'bridge') {
      const need = row.noAtGrade ? STRUCTURE_RULES.railClearance : CROSSING_RULES.overHeight;
      if (c.h < need - 1e-6) issue(c, 'clearance', 'Bridge has insufficient road clearance',
        `Raise the new road by ${(need - c.h).toFixed(1)} m to at least ${need} m above the crossed road`, c.h, need);
      if (kind[c.i] !== KIND.bridge) issue(c, 'structure', 'Requested main-road bridge is not built',
        'Apply the crossing bridge mask before structure selection and billing');
    } else if (choice === 'overbridge') {
      Object.assign(c, separated(c));
      // Ordinary roads can be raised on the same priced approaches as Auto. Motorways/trunks
      // retain their fixed level and require our road to provide the full depth.
      if (row.noAtGrade && c.h > -CROSSING_RULES.underDepth + 1e-6) issue(c, 'depth', 'Overbridge needs a deeper cut',
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
      if (!row.noAtGrade) junctions.push(c.s);
    } else if (choice === 'underpass') {
      const box = underpassPrice(c, footprint[c.i], urban[c.i]);
      if (!box) issue(c, 'underpass', `A ${row.label} cannot pass in a small underpass`, 'Choose a bridge, an overbridge or a reconnection');
      else {
        Object.assign(c, priced(box));
        if (c.h < box.minHeight - 1e-6) issue(c, 'underpass', 'Underpass needs a higher embankment',
          `Raise the new road by ${(box.minHeight - c.h).toFixed(1)} m to at least ${box.minHeight.toFixed(2)} m above the crossed road (${box.box.height} m clear + roof + cover)`, c.h, box.minHeight);
      }
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
    const linkCost = link.linkCost;
    const over = separated(c);
    const surcharge = 1 + surchargeRate(billingUrban[c.i]);
    // Footprint width is the box-length estimate; the geometry pass measures it along the way.
    const box = kind[c.i] === KIND.earth && underpassFits(c, footprint[c.i]) ? underpassPrice(c, footprint[c.i], urban[c.i]) : undefined;
    const linkTotal = gap <= CROSSING_RULES.linkMaxReach ? linkCost * surcharge + access : Infinity;
    const overTotal = over.cost * surcharge, boxTotal = box ? box.cost * surcharge : Infinity;
    if (c.requestedType === 'reconnection' || (linkTotal < overTotal && linkTotal <= boxTotal)) {
      c.type = c.cls === 'track' ? 'diversion' : 'reconnection';
      const { linkCost: _linkCost, ...priced } = link;
      Object.assign(c, priced); c.targetS = target.s; c.targetRoadId = target.roadId;
      if (c.requestedType && gap > CROSSING_RULES.linkHardReach) issue(c, 'reach', 'Reconnection is too far from a usable crossing',
        `Choose an overbridge or provide a compatible crossing within ${CROSSING_RULES.linkHardReach} m (now ${gap.toFixed(0)} m)`, gap, CROSSING_RULES.linkHardReach, target.s);
    } else if (box && boxTotal < overTotal) {
      c.type = 'underpass'; Object.assign(c, priced(box));
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

/** Through/local roads cannot discharge into a driveway/track; lower classes may share higher ones. */
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
    case 'underpass': {
      const size = ROAD_CLASSES[c.cls].underpass;
      const box = size ? underpassAssembly(size, 0) : undefined;
      return `underpass ${Math.round(c.underpassLength ?? 0)} m${box ? ` (${box.width} × ${box.height} m clear box)` : ''}`;
    }
    case 'atGrade': return 'at grade — not allowed';
  }
}

/** Geometry inputs deliberately do not import evaluate.ts; safe in the worker and synthetic tests. */
export interface CrossingRoute {
  s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>;
  tx: ArrayLike<number>; ty: ArrayLike<number>; grade: ArrayLike<number>;
  /** Actual built footprint, not the earthwork option under a bridge. */
  width: ArrayLike<number>;
  /** Optional asymmetric built footprint distances, positive to either side. */
  left?: ArrayLike<number>; right?: ArrayLike<number>;
  crownWidth?: number;
  /** Built structure kind per station; Auto considers an underpass only under earthwork. */
  kind?: ArrayLike<number>;
}

export { buildCrossingGeometry, crossingPlanLength, auditCrossingGeometry, underpassFits } from './crossing-geometry';
