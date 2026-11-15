// Study-stage network resolution with terrain profiles on the actual OSM alignment.
import { surchargeRate } from './cost';
import { bridgeModel } from './bridge';
import { ACCESS, CROSSING_RULES, JUNCTION, ROAD_CLASSES } from './data/urban';
import { STRUCTURE_RULES } from './data/prices';
import { underpassAssembly, UNDERPASS_RULES } from './data/remedies';
import { underpassFits } from './crossing-geometry';
import { crossingOutcome } from './terms';
import { KIND } from './structures';
import type { Violation } from './checks';
import type { RoadCrossing } from './roadnet';

export const CROSSING_CHOICES = ['junction', 'bridge', 'overbridge', 'reconnection', 'underpass'] as const;
export type CrossingChoice = typeof CROSSING_CHOICES[number];
/** Pack way index, stable within a scenario pack, not a station or merged-list index.
 * One choice applies to every intersection of that way. Omission restores Auto. */
export interface CrossingOverride { roadId: number; type: CrossingChoice;
  /** A reroute the player shaped: bend points of its two new pieces (the [-normal, +normal] sides of our
   * road, like `CrossingGeometry.links`); an empty side keeps its automatic path. Only with 'reconnection'. */
  via?: LinkVia;
  /** The crossing the shaped reroute leads to (its pack way; -1 / -2: the start / end of our road), so a
   * drag reshapes that connection rather than letting it pick another target. */
  to?: number }
export type LinkVia = [{ x: number; y: number }[], { x: number; y: number }[]];
/** At most this many bend points per shaped reroute piece. */
export const MAX_LINK_VIA = 24;
/** Bend points lie on the scenario map (local metres): anything beyond is not a shape. */
export const MAX_LINK_COORD = 1e6;
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
  /** Retaining walls cutting this sample's slopes short, at these offsets from the centreline on
   * the [-normal, +normal] side (normal from the neighbouring samples), m. */
  wall?: [number | undefined, number | undefined];
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
  /** Side roads joining the rebuilt stretch, regraded from its new level down to their own ground. */
  ties?: { cls: string; way: number; path: CrossingPoint[] }[];
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
    code: 'spacing' | 'class' | 'depth' | 'clearance' | 'structure' | 'reach' | 'geometry' | 'underpass' | 'shape';
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
  /** The player's shape of the reroute (see CrossingOverride.via), on the one crossing of that way
   * nearest to it, and the crossing it leads to (CrossingOverride.to). */
  via?: LinkVia;
  viaTo?: number;
  /** Disambiguates independently selected roads at the same station; absent for A/B collectors. */
  targetRoadId?: number;
  span?: number;
  approachLength?: number;
  /** Underpass box length along the crossed way, toe to toe, m (measured from the geometry). */
  underpassLength?: number;
  roadCode?: string;
  roadPerKm?: number;
  /** Side roads regraded to meet the rebuilt stretch, m (measured along them). */
  tieLength?: number;
  /** Retaining walls holding its slopes off roads beside it, m. */
  wallLength?: number;
  /** Pre-surcharge CZK of those ties and walls, included in cost (never a lump sum). */
  worksCost?: number;
}

export function normalizeCrossingOverrides(value: unknown): CrossingOverride[] {
  if (!Array.isArray(value)) return [];
  const byRoad = new Map<number, CrossingOverride>();
  for (const o of value) if (o && Number.isSafeInteger(o.roadId) && o.roadId >= 0
    && CROSSING_CHOICES.includes(o.type)) {
    const via = o.type === 'reconnection' ? normalizeLinkVia(o.via) : undefined;
    const to = via && Number.isSafeInteger(o.to) && o.to >= -2 ? o.to as number : undefined;
    byRoad.set(o.roadId, { roadId: o.roadId, type: o.type, ...(via ? { via } : {}), ...(to !== undefined ? { to } : {}) });
  }
  return [...byRoad.values()].sort((a, b) => a.roadId - b.roadId);
}

export function normalizeLinkVia(value: unknown): LinkVia | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const side = (v: unknown) => Array.isArray(v) && v.length <= MAX_LINK_VIA && v.every(p => p && Math.abs(p.x) <= MAX_LINK_COORD && Math.abs(p.y) <= MAX_LINK_COORD)
    ? v.map(p => ({ x: p.x, y: p.y })) : undefined;
  const a = side(value[0]), b = side(value[1]);
  return a && b && (a.length || b.length) ? [a, b] : undefined;
}
export function crossingVia(roadId: number | undefined, overrides: readonly CrossingOverride[] = []): LinkVia | undefined {
  for (let i = overrides.length - 1; i >= 0; i--) if (overrides[i].roadId === roadId) return overrides[i].type === 'reconnection' ? overrides[i].via : undefined;
  return undefined;
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
  const approachLength = 2 * Math.max(0, CROSSING_RULES.underDepth + c.h) / row.rampGradient;
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
        spacing: 'ČSN 73 6101:2018: junctions at least 1.5 km apart, counting both ends of the route (also in town: a scenario assumption)',
        class: 'ČSN 73 6101: motorways and expressways are crossed only at a different level, with no direct access (research/08)',
        depth: 'Game rule: a bridge over our road needs a cutting at least 6 m deep where the crossed road cannot be raised; a junction cannot lie in such a cutting',
        clearance: 'Game rule: our bridge needs 6 m above ordinary roads and 7.5 m above motorways; a junction cannot lie that high',
        structure: 'Game rule: the crossing choice and what our road does there (bridge, tunnel, earthworks) must agree',
        reach: `Game limit: a reroute reaches at most ${CROSSING_RULES.linkHardReach} m along our road to the next crossing`,
        geometry: 'Game rule: crossed roads keep their real line and meet the ground at both ends',
        underpass: `Game estimate (research/19): an underpass box takes only tracks, service roads and local roads, needs room for its height, roof and earth cover under our road, and is at most ${UNDERPASS_RULES.maxLength} m long`,
        shape: 'Game rule: a reroute the player shaped must be buildable where it is drawn',
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
    delete c.tieLength; delete c.wallLength; delete c.worksCost; delete c.via; delete c.viaTo;
    c.requestedType = crossingChoice(c.roadId, overrides);
  }
  // A shape is absolute: it belongs to the one crossing of its way nearest to its bend points.
  for (const o of overrides) if (o.type === 'reconnection' && o.via) {
    const points = [...o.via[0], ...o.via[1]], x = points.reduce((a, p) => a + p.x, 0) / points.length, y = points.reduce((a, p) => a + p.y, 0) / points.length;
    let owner: CrossingResult | undefined;
    for (const c of crossings) if (c.roadId === o.roadId && (!owner || Math.hypot(c.x - x, c.y - y) < Math.hypot(owner.x - x, owner.y - y))) owner = c;
    if (owner) { owner.via = o.via; if (o.to !== undefined) owner.viaTo = o.to; }
  }
  for (const c of priority) {
    const choice = c.requestedType, row = ROAD_CLASSES[c.cls];
    if (!choice) continue;
    c.type = choice === 'reconnection' && c.cls === 'track' ? 'diversion' : choice;
    if (choice !== 'bridge' && kind[c.i] !== KIND.earth) issue(c, 'structure', 'Your crossing choice clashes with our bridge or tunnel here',
      'Set this crossing back to Automatic, or change our bridge or tunnel here in the profile');
    // row.junction is an Auto candidate heuristic, not a ban on manually connecting local roads.
    if ((choice === 'junction' || choice === 'reconnection') && row.noAtGrade)
      issue(c, 'class', `A ${row.label} cannot meet our road at the same level`, 'Choose "Our bridge over it" with enough height, or "Its bridge over us" over a cutting at least 6 m deep');
    if (choice === 'bridge') {
      const need = row.noAtGrade ? STRUCTURE_RULES.railClearance : CROSSING_RULES.overHeight;
      if (c.h < need - 1e-6) issue(c, 'clearance', 'Our bridge is too low over this road',
        `Raise our road here by ${(need - c.h).toFixed(1)} m, to at least ${need} m above the crossed road`, c.h, need);
      if (kind[c.i] !== KIND.bridge) issue(c, 'structure', 'Our bridge over this road was not built',
        'Paint a bridge over this stretch in the profile, or set the crossing back to Automatic');
    } else if (choice === 'overbridge') {
      Object.assign(c, separated(c));
      // Ordinary roads can be raised on the same priced approaches as Auto. Motorways/trunks
      // retain their fixed level and require our road to provide the full depth.
      if (row.noAtGrade && c.h > -CROSSING_RULES.underDepth + 1e-6) issue(c, 'depth', 'A bridge over our road needs a deeper cutting here',
        `Lower our road here by ${(c.h + CROSSING_RULES.underDepth).toFixed(1)} m, to ${CROSSING_RULES.underDepth} m below the crossed road`, -c.h, CROSSING_RULES.underDepth);
    } else if (choice === 'junction') {
      c.cost = JUNCTION;
      const near = junctions.reduce((a, s) => Math.abs(c.s - s) < Math.abs(c.s - a) ? s : a, junctions[0]);
      const gap = Math.abs(c.s - near);
      if (gap < CROSSING_RULES.junctionSpacing) issue(c, 'spacing', 'Junctions are too close',
        `Keep at least ${CROSSING_RULES.junctionSpacing} m from the junction (or route end) at km ${(near / 1000).toFixed(2)} — now ${gap.toFixed(0)} m — or choose a bridge instead`, gap, CROSSING_RULES.junctionSpacing, near);
      if (c.h <= -CROSSING_RULES.underDepth) issue(c, 'depth', 'Junction would lie deep below the crossed road',
        `Raise our road here by more than ${(-CROSSING_RULES.underDepth - c.h).toFixed(1)} m, out of the ${CROSSING_RULES.underDepth} m deep cutting, or choose "Its bridge over us"`, c.h, -CROSSING_RULES.underDepth);
      if (c.h >= CROSSING_RULES.overHeight) issue(c, 'clearance', 'Junction would lie high above the crossed road',
        `Lower our road here by more than ${(c.h - CROSSING_RULES.overHeight).toFixed(1)} m, below ${CROSSING_RULES.overHeight} m above the crossed road, or choose "Our bridge over it"`, c.h, CROSSING_RULES.overHeight);
      if (!row.noAtGrade) junctions.push(c.s);
    } else if (choice === 'underpass') {
      const box = underpassPrice(c, footprint[c.i], urban[c.i]);
      if (!box) issue(c, 'underpass', `A ${row.label} cannot pass through a small underpass`, 'Choose "Our bridge over it", "Its bridge over us" or "Cut and reroute"');
      else {
        Object.assign(c, priced(box));
        if (c.h < box.minHeight - 1e-6) issue(c, 'underpass', 'Embankment too low for an underpass',
          `Raise our road here by ${(box.minHeight - c.h).toFixed(1)} m, to at least ${box.minHeight.toFixed(2)} m above the crossed road (${box.box.height} m inside the box, plus its roof and earth cover)`, c.h, box.minHeight);
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
  const kept = (c: CrossingResult, a: { s: number; roadId?: number }) => c.viaTo !== undefined
    && (c.viaTo >= 0 ? a.roadId === c.viaTo : a.roadId === undefined && a.s === (c.viaTo === -1 ? 0 : length));
  const nearest = pending.map(c => {
    let target = anchors[0], gap = Infinity, fixed = false;
    for (const a of anchors) if (kept(c, a)) { target = a; gap = Math.abs(c.s - a.s); fixed = true; }
    if (!fixed) for (const a of anchors) if (compatible(c, a.cls)) {
      const d = Math.abs(c.s - a.s);
      if (d < gap || (d === gap && a.s < target.s)) { gap = d; target = a; }
    }
    return { c, target, gap, fixed };
  });
  while (nearest.length) {
    // A shaped reroute waits for the crossing it leads to (unless nothing else is left to resolve).
    const waiting = (p: typeof nearest[number]) => p.c.viaTo !== undefined && !p.fixed;
    let next = 0;
    for (let i = 1; i < nearest.length; i++) {
      const a = nearest[i], b = nearest[next];
      if (waiting(b) !== waiting(a)) { if (waiting(b)) next = i; continue; }
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
      if (c.requestedType && gap > CROSSING_RULES.linkHardReach) issue(c, 'reach', 'Reroute would be too long',
        `Choose "Its bridge over us" or an underpass, or make a crossing it can reach within ${CROSSING_RULES.linkHardReach} m along our road (now ${gap.toFixed(0)} m)`, gap, CROSSING_RULES.linkHardReach, target.s);
    } else if (box && boxTotal < overTotal) {
      c.type = 'underpass'; Object.assign(c, priced(box));
    } else {
      c.type = 'overbridge'; Object.assign(c, over);
    }
    for (const p of nearest) if (!p.fixed && !c.issues?.length && !ROAD_CLASSES[c.cls].noAtGrade && (compatible(p.c, c.cls) || kept(p.c, c))) {
      const d = Math.abs(p.c.s - c.s);
      // a shaped reroute keeps leading where it led when the player shaped it
      if (kept(p.c, c)) { p.gap = d; p.target = c; p.fixed = true; }
      else if (d < p.gap || (d === p.gap && c.s < p.target.s)) { p.gap = d; p.target = c; }
    }
  }
  return issues;
}

/** Through/local roads cannot discharge into a driveway/track; lower classes may share higher ones. */
function compatible(c: CrossingResult, cls?: string): boolean {
  return c.cls === 'track' || c.cls === 'service' || (cls !== 'track' && cls !== 'service');
}

/** Player-facing label with the built quantities (src/core/terms.ts). */
export function crossingLabel(c: CrossingResult): string { return crossingOutcome(c).label; }

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
  /** Urban share per station (≥ 0.5: urban SPK price rows for side-road regrades). */
  urban?: ArrayLike<number>;
  /** What blocks a new road of this half-width from a to b on the ground (a player's reroute shape). */
  obstacle?: (a: { x: number; y: number }, b: { x: number; y: number }, half: number) => 'railway' | 'water' | 'building' | null;
}

export { buildCrossingGeometry, crossingPlanLength, auditCrossingGeometry, underpassFits } from './crossing-geometry';
