// Study-stage network resolution. Connections are geometrical proxies, not an OSM routing solution.
import { surchargeRate } from './cost';
import { ACCESS, CROSSING_RULES, JUNCTION, ROAD_CLASSES } from './data/urban';
import { KIND } from './structures';

export interface CrossingResult {
  /** Actual crossing station (m), nearest cost-cell index, and map position. */
  s: number; i: number; x: number; y: number;
  cls: string;
  /** New grade minus crossed-road ground, m. */
  h: number;
  /** atGrade is reserved for an invalid motorway/trunk crossing; no fake resolution. */
  type: 'bridge' | 'tunnel' | 'overbridge' | 'junction' | 'reconnection' | 'diversion' | 'atGrade';
  /** Crossing-only cost, excluding other-objects surcharge. Main-road bridges/tunnels cost zero here. */
  cost: number;
  /** Total parallel-link length on BOTH sides, m. */
  linkLength?: number;
  /** Target crossing/tie-in station; resolved links always lead to a real crossing, never a cycle. */
  targetS?: number;
  /** Overbridge span and total approach length, m. Approaches use road norms incl. standard earthworks. */
  span?: number;
  approachLength?: number;
  /** Auditable unit-price row and rate used for link / approaches. */
  roadCode?: string;
  roadPerKm?: number;
}

const rank = Object.fromEntries(Object.keys(ROAD_CLASSES).map((key, i) => [key, i]));

/** Mutates results in place, retaining station order for the UI and per-cell billing.
 * A/B consume junction spacing; their allowance is assumed to include a local collector connection,
 * not direct access onto D11. Existing main-road structures win first, then class-priority junctions,
 * then links expanding outwards from already-resolved roads (nearest first within each class tier).
 * The latter restriction avoids two severed roads being 'reconnected' only to each other. */
export function resolveCrossings(crossings: CrossingResult[], length: number, kind: ArrayLike<number>,
  footprint: ArrayLike<number>, urban: ArrayLike<number>, billingUrban: ArrayLike<number> = urban): void {
  const priority = [...crossings].sort((a, b) => rank[a.cls] - rank[b.cls] || a.s - b.s || a.i - b.i);
  const junctions = [0, length];
  const anchors: { s: number; cls?: string }[] = [{ s: 0 }, { s: length }];
  const separated = (c: CrossingResult) => {
    const row = ROAD_CLASSES[c.cls];
    const u = urban[c.i] >= 0.5 ? 1 : 0;
    const approachLength = 2 * Math.max(0, CROSSING_RULES.underDepth + c.h) / CROSSING_RULES.approachGradient;
    const span = footprint[c.i]; // perpendicular crossing; skew and abutment details not modelled
    const roadPerKm = row.roadPerKm[u];
    return { span, approachLength, roadPerKm, roadCode: row.roadCodes[u],
      cost: (span * row.bridgePerKm + approachLength * roadPerKm) / 1000 };
  };
  for (const c of priority) {
    const row = ROAD_CLASSES[c.cls];
    if (kind[c.i] === KIND.bridge) c.type = 'bridge';
    else if (kind[c.i] === KIND.tunnel) c.type = 'tunnel';
    else if (row.noAtGrade && c.h <= -CROSSING_RULES.underDepth) {
      c.type = 'overbridge'; Object.assign(c, separated(c));
    } else continue;
    // A motorway over/underpass is not an access to the motorway.
    if (!row.noAtGrade) anchors.push(c);
  }
  for (const c of priority) {
    if (c.type !== 'atGrade' || !ROAD_CLASSES[c.cls].junction || c.h <= -CROSSING_RULES.underDepth) continue;
    if (junctions.every(s => Math.abs(c.s - s) >= CROSSING_RULES.junctionSpacing)) {
      c.type = 'junction'; c.cost = JUNCTION;
      junctions.push(c.s); anchors.push(c);
    }
  }
  const pending = priority.filter(c => c.type === 'atGrade' && !ROAD_CLASSES[c.cls].noAtGrade);
  const tier = (c: CrossingResult) => ROAD_CLASSES[c.cls].junction ? 0 : c.cls === 'track' ? 3 : c.cls === 'service' ? 2 : 1;
  // Cache nearest anchors and update only for the newly resolved crossing: O(crossings²), not cubic.
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
    const row = ROAD_CLASSES[c.cls];
    const linkLength = 2 * Math.max(CROSSING_RULES.linkMinLength, gap);
    const u = urban[c.i] >= 0.5 ? 1 : 0, roadPerKm = row.roadPerKm[u];
    const access = c.cls === 'service' ? ACCESS : 0;
    const linkCost = linkLength * roadPerKm / 1000;
    const over = separated(c);
    // Compare the actual payable costs (simple sjezd is an all-in allowance without surcharge).
    const surcharge = 1 + surchargeRate(billingUrban[c.i]);
    if (gap <= CROSSING_RULES.linkMaxReach && linkCost * surcharge + access < over.cost * surcharge) {
      c.type = c.cls === 'track' ? 'diversion' : 'reconnection';
      c.linkLength = linkLength; c.targetS = target!.s;
      c.roadPerKm = roadPerKm; c.roadCode = row.roadCodes[u]; c.cost = linkCost + access;
    } else {
      c.type = 'overbridge'; Object.assign(c, over);
    }
    for (const p of nearest) if (compatible(p.c, c.cls)) {
      const d = Math.abs(p.c.s - c.s);
      if (d < p.gap || (d === p.gap && c.s < p.target.s)) { p.gap = d; p.target = c; }
    }
  }
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
    case 'atGrade': return 'at grade — not allowed';
  }
}
