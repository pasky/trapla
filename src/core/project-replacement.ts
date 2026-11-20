// A rebuilt stretch of an existing road (C1 b): what replacing the old stretch adds to the new road's
// own engineering. The new line itself is the road kernel's (engineered against the network without its
// old stretch, project-road.ts); here: removing the old pavement where the new road leaves it, and
// keeping every side road that joined the old stretch connected (never dropped).
import type { Violation } from './checks';
import { ROAD_CLASSES, sideJunctionCost } from './data/urban';
export { sideJunctionCost };
import { CATEGORIES, type CategoryId } from './data/categories';
import type { Result } from './evaluate';
import type { ConnectionDesign, RouteDesign } from './project';
import type { RoadNet } from './roadnet';
import type { OldPiece } from './stretch-chain';

const km = (s: number) => (s / 1000).toFixed(2), cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** OTSKP 2026 rows (research/30 §2), CZK. Layer thicknesses are a PROVISIONAL game assumption for an
 * ordinary asphalt road (no road-specific pavement data): 0.10 m asphalt-bound cover, 0.20 m
 * asphalt-bound base. Removal rows include haul up to 1 km; disposal fees are not itemised. */
export const REMOVAL = {
  /** 113131 Odstranění krytu zpevněných ploch s asfaltovým pojivem, odvoz do 1 km, per m³ */
  coverPerM3: 786.42, coverDepth: 0.10,
  /** 11333 Odstranění podkladu zpevněných ploch s asfaltovým pojivem, per m³ */
  basePerM3: 766.96, baseDepth: 0.20,
  /** 18231 spreading existing topsoil up to 0.10 m on level ground + 18242 seeding, per m² */
  restorePerM2: 28.48 + 29.35,
  source: 'OTSKP 2026 rows 113131, 11333, 18231, 18242; layer thicknesses PROVISIONAL',
} as const;
/** Taking down an old road bridge a rebuilt stretch runs through (core/stretch-chain.ts), per m² of its deck, CZK:
 * PROVISIONAL proxy (research/106): the II/101 Zápy bridge take-off's 0.776 m³ of reinforced concrete per m² of deck ×
 * OTSKP 966168 (demolition of reinforced concrete with haul to 20 km) at 2,600 CZK/m³ in a 2024 priced bill ≈ 2,018,
 * rounded; no published bridge-demolition norm was found (SPOŽES H06 is railway only). Its deck: the way's length ×
 * its class's study width. */
export const BRIDGE_DEMOLITION_PER_M2 = 2000;
/** Taking up a metre of old road this wide (m): its asphalt cover and base removed, its ground restored, CZK. */
export const removalPerMetre = (width: number) => width * (REMOVAL.coverDepth * REMOVAL.coverPerM3 + REMOVAL.baseDepth * REMOVAL.basePerM3 + REMOVAL.restorePerM2);
/** An old-road sample lies under the new road within its land-take half-width plus this, m. */
const UNDER = 1;

export interface ReplacementWork {
  /** `kept`: where the old road stays as it is, what the road's own bill charged there (a credit) */
  kind: 'removal' | 'reconnection' | 'junction' | 'land' | 'noise-wall' | 'buyout' | 'kept' | 'lane';
  /** where along the new road, for display */
  s: number; x: number; y: number;
  /** removed old road length, or link length (0: the side road meets the new road where it is), m */
  length: number;
  cost: number;
  label: string;
  cls?: string;
  /** buildings this work removes (a roundabout's ring) */
  removes?: number[];
  /** what it paints on another road (a slip road's speed-change lane on the motorway: its lines), drawn */
  lines?: { x: number; y: number; z: number; halfWidth?: number }[][];
}
export interface Replacement { works: ReplacementWork[]; violations: Violation[]; total: number;
  /** the old road where it is removed (pieces of its centreline) and its width, m: this road's works too,
   * so no other road may be priced as if that ground were free (project-ledger.ts) */
  removed: { ax: number; ay: number; bx: number; by: number }[]; removedWidth: number }

/** A way of the stretch's class leaving one of its ends within 45° of the old road's heading is
 * that road going on (OSM splits a road into many ways). Game geometry tolerances: the branch within 2 m of
 * the end, headings over 20 m, 45° (PROVISIONAL). */
const CONTINUES_AT = 2, CONTINUES_LOOK = 20, CONTINUES_COS = Math.SQRT1_2; // cos 45°
const nearest = (r: Result, x: number, y: number) => {
  let best = Infinity, i = 0;
  for (let k = 0; k < r.n; k++) { const d = Math.hypot(r.x[k] - x, r.y[k] - y); if (d < best) { best = d; i = k; } }
  return { i, d: best };
};
/** `base` is the network WITH the old stretch (the cut network has lost it); `way` the old stretch's
 * legacy way; `branchWays` the legacy way of every side road at the stretch's branch connections. */
export function replacementWorks(route: RouteDesign, r: Result, base: RoadNet, pieces: readonly OldPiece[],
  connections: readonly ConnectionDesign[], branchWay: (sourceId: string) => number | undefined,
  /** station cells where the old road is kept as it is (project-kept.ts): no works, already credited whole */
  kept?: Uint8Array): Replacement {
  const works: ReplacementWork[] = [], violations: Violation[] = [];
  const a = route.endpoints.a.position, b = route.endpoints.b.position;
  // (its ends: the first piece's way at a, the last's at b; one piece: its way between the route's ends)
  const way = pieces[0].way, wayB = pieces[pieces.length - 1].way;
  const da = base.wayStation(way, a.x, a.y), db = base.wayStation(wayB, b.x, b.y);
  const cls = base.wayClass(way), width = ROAD_CLASSES[cls]?.width ?? 6.5;
  // Old pavement left outside the new road: removed and its ground restored. Where the new road covers
  // the old one, the road authority already owns that land: not bought again (Act 13/1997 §11 road land;
  // research/30 §3). Its cadastral width is unknown, so only the old pavement's width is credited (the
  // least it certainly owns; the class's study width), at the price the new road paid for land there.
  let removed = 0, removedCost = 0, at: { x: number; y: number } | null = null, owned = 0, ownedLength = 0;
  const credited = new Float64Array(r.n), removedLines: Replacement['removed'] = [];
  for (const piece of pieces) {
    const old = pieces.length === 1 ? base.wayPath(way, Math.min(da, db), Math.max(da, db)) : base.wayPath(piece.way, piece.d0, piece.d1);
    const pieceWidth = ROAD_CLASSES[base.wayClass(piece.way)]?.width ?? 6.5;
    // an old bridge in the stretch: kept as it is where the new line stays on it (as the old road is), else taken down
    // whole (a tunnel is never in a stretch: stretch-chain.ts)
    if (piece.structure === 'bridge') {
      const middle = old[Math.floor(old.length / 2)];
      if (kept?.[nearest(r, middle.x, middle.y).i]) continue;
      let length = 0;
      for (let k = 1; k < old.length; k++) {
        length += Math.hypot(old[k].x - old[k - 1].x, old[k].y - old[k - 1].y);
        removedLines.push({ ax: old[k - 1].x, ay: old[k - 1].y, bx: old[k].x, by: old[k].y });
      }
      const mid = old[Math.floor(old.length / 2)], n = nearest(r, mid.x, mid.y);
      if (length > 0.5) works.push({ kind: 'removal', s: r.s[n.i], x: mid.x, y: mid.y, length, cost: length * pieceWidth * BRIDGE_DEMOLITION_PER_M2,
        label: `Old bridge taken down: ${Math.round(length)} m` });
      continue;
    }
    let pieceRemoved = 0;
    for (let k = 1; k < old.length; k++) {
    const p = old[k - 1], q = old[k], len = Math.hypot(q.x - p.x, q.y - p.y), steps = Math.max(1, Math.ceil(len / 5));
    for (let j = 0; j < steps; j++) {
      const t = (j + 0.5) / steps, x = p.x + t * (q.x - p.x), y = p.y + t * (q.y - p.y), n = nearest(r, x, y);
      if (kept?.[n.i]) continue; // the old road stays as it is here
      if (n.d > r.cell.width[n.i] / 2 + UNDER) {
        removed += len / steps; pieceRemoved += len / steps; at ??= { x, y };
        removedLines.push({ ax: p.x + (j / steps) * (q.x - p.x), ay: p.y + (j / steps) * (q.y - p.y), bx: p.x + ((j + 1) / steps) * (q.x - p.x), by: p.y + ((j + 1) / steps) * (q.y - p.y) });
        continue;
      }
      // land credit: this piece of old road inside the new road's land take, at that station's land price
      const area = (len / steps) * Math.min(pieceWidth, r.cell.width[n.i]), rate = r.cell.width[n.i] > 0 ? r.parts.land[n.i] / (r.cell.width[n.i] * r.ds) : 0;
      const credit = Math.min(area * rate, Math.max(0, r.parts.land[n.i] - credited[n.i]));
      credited[n.i] += credit; owned += credit; ownedLength += len / steps;
    }
  }
    removedCost += pieceRemoved * removalPerMetre(pieceWidth);
  }
  if (removed > 0.5) {
    const n = nearest(r, at!.x, at!.y);
    works.push({ kind: 'removal', s: r.s[n.i], x: at!.x, y: at!.y, length: removed, cost: removedCost,
      label: `Old road removed and its ground restored: ${Math.round(removed)} m` });
  }
  const start = pieces.length === 1 ? base.wayPath(way, Math.min(da, db), Math.max(da, db))[0] : { x: a.x, y: a.y };
  if (owned > 0) works.push({ kind: 'land', s: r.s[0], x: start.x, y: start.y, length: ownedLength, cost: -owned,
    label: `No land bought where the new road lies on the old one: ${Math.round(ownedLength)} m` });
  // Every side road that joined the old stretch stays connected.
  const crossed = new Set<number>();
  // (a free at-grade meeting right at the stretch's end is that end's old junction: reconnected below)
  // (one carried past the new road on a bridge, under it or over it has no access to it there: reconnected below)
  for (const c of r.crossings) if (c.roadId !== undefined && (c.cost > 0 || (c.s > 1 && c.s < r.length - 1))
    && !['bridge', 'tunnel', 'overbridge', 'underpass'].includes(c.type)) crossed.add(c.roadId);
  // (a continuation's joint at the stretch end builds no junction: side roads there are reconnected below)
  for (const f of r.footprintConflicts) if (f.roadId !== undefined && f.action !== 'blocked' && !f.continuation) crossed.add(f.roadId);
  // At a stretch end the old road goes on, often as another mapped way of the same class: that is the
  // road itself continuing (the end is its joint), never a junction with "the class I road".
  const heading = (p: { x: number; y: number }, q: { x: number; y: number }) => { const l = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { x: (q.x - p.x) / l, y: (q.y - p.y) / l }; };
  const continues = (side: number, at: { x: number; y: number }) => {
    if (base.wayClass(side) !== cls) return false;
    // (each end on its own piece's way: `other`, that piece's other end)
    const first = pieces[0], last = pieces[pieces.length - 1], one = pieces.length === 1;
    const end = [{ e: a, d: da, way, other: one ? db : first.reversed ? first.d0 : first.d1 }, { e: b, d: db, way: wayB, other: one ? da : last.reversed ? last.d1 : last.d0 }]
      .find(({ e }) => Math.hypot(e.x - at.x, e.y - at.y) <= CONTINUES_AT);
    if (!end) return false;
    const inward = end.d <= end.other ? end.d + CONTINUES_LOOK : end.d - CONTINUES_LOOK;
    const into = base.wayPath(end.way, Math.min(end.d, inward), Math.max(end.d, inward));
    const outward = heading(end.d <= end.other ? into.at(-1)! : into[0], end.e);
    const ds = base.wayStation(side, end.e.x, end.e.y), near = base.wayPath(side, ds - CONTINUES_LOOK, ds + CONTINUES_LOOK);
    if (near.length < 2) return false;
    const far = [near[0], near.at(-1)!].reduce((p, q) => Math.hypot(q.x - end.e.x, q.y - end.e.y) > Math.hypot(p.x - end.e.x, p.y - end.e.y) ? q : p);
    const on = heading(end.e, far);
    return outward.x * on.x + outward.y * on.y >= CONTINUES_COS;
  };
  for (const c of connections) {
    if (!c.id.includes(':branch:') || !c.ports.some(p => p.kind === 'route' && p.routeId === route.id)) continue;
    const port = c.ports.find(p => p.kind === 'source');
    if (!port || port.kind !== 'source') continue;
    const side = branchWay(port.location.sourceId);
    if (side !== undefined && continues(side, c.position)) continue;
    // A side road the new road crosses or rebuilds beside it is the kernel's crossing work already.
    if (side !== undefined && crossed.has(side)) continue;
    const sideCls = side !== undefined ? base.wayClass(side) : 'unclassified', row = ROAD_CLASSES[sideCls] ?? ROAD_CLASSES.unclassified;
    const n = nearest(r, c.position.x, c.position.y), gap = Math.max(0, n.d - r.cell.width[n.i] / 2);
    // where the old road is kept, its junction with this side road stays as it is
    if (kept?.[n.i]) continue;
    const urban = r.cell.urban[n.i] >= 0.5 ? 1 : 0, link = gap * row.roadPerKm[urban] / 1000;
    const what = row.label;
    if (gap > 2000) {
      violations.push({ kind: 'crossing', s0: r.s[n.i], s1: r.s[n.i], basis: 'game', title: `The ${what} is cut off`,
        fix: `Bring the new road within 2 km of where the ${what} joined the old one`,
        rule: 'Game rule: every road that joined the rebuilt stretch stays connected; a link longer than 2 km is not built.' });
      continue;
    }
    works.push({ kind: 'reconnection', s: r.s[n.i], x: c.position.x, y: c.position.y, length: gap, cls: sideCls,
      cost: link + sideJunctionCost(sideCls, route.specification.kind === 'road' ? CATEGORIES[route.specification.crossSection as CategoryId]?.minor : undefined),
      // which one: where along the rebuilt road (the card's line also flies there)
      label: gap > 1 ? `${cap(what)} at km ${km(r.s[n.i])} reconnected: ${Math.round(gap)} m of new road and a junction` : `Junction with the ${what} at km ${km(r.s[n.i])}` });
  }
  return { works, violations, total: works.reduce((t, w) => t + w.cost, 0), removed: removedLines, removedWidth: width };
}
