// A rebuilt stretch of an existing road (C1 b): what replacing the old stretch adds to the new road's
// own engineering. The new line itself is the road kernel's (engineered against the network without its
// old stretch, project-road.ts); here: removing the old pavement where the new road leaves it, and
// keeping every side road that joined the old stretch connected (never dropped).
import type { Violation } from './checks';
import { ACCESS, ENDPOINT_JUNCTIONS, JUNCTION, ROAD_CLASSES } from './data/urban';
import type { Result } from './evaluate';
import type { ConnectionDesign, RouteDesign } from './project';
import type { RoadNet } from './roadnet';

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
  source: 'OTSKP 2026 rows 113131, 11333, 18231, 18242 (research/30); layer thicknesses PROVISIONAL',
} as const;
/** An old-road sample lies under the new road within its land-take half-width plus this, m. */
const UNDER = 1;

export interface ReplacementWork {
  /** `kept`: where the old road stays as it is, what the road's own bill charged there (a credit) */
  kind: 'removal' | 'reconnection' | 'junction' | 'land' | 'noise-wall' | 'buyout' | 'kept';
  /** where along the new road, for display */
  s: number; x: number; y: number;
  /** removed old road length, or link length (0: the side road meets the new road where it is), m */
  length: number;
  cost: number;
  label: string;
  cls?: string;
}
export interface Replacement { works: ReplacementWork[]; violations: Violation[]; total: number }

const nearest = (r: Result, x: number, y: number) => {
  let best = Infinity, i = 0;
  for (let k = 0; k < r.n; k++) { const d = Math.hypot(r.x[k] - x, r.y[k] - y); if (d < best) { best = d; i = k; } }
  return { i, d: best };
};
/** Junction of a side road onto the rebuilt road: an access for tracks and service roads (research/13),
 * a simple T for minor roads, the all-in junction for class I/II roads (research/08, /29; PROVISIONAL). */
export function sideJunctionCost(cls: string): number {
  return cls === 'track' || cls === 'service' ? ACCESS : cls === 'primary' || cls === 'secondary' ? JUNCTION : ENDPOINT_JUNCTIONS['tie-in-minor'].cost;
}

/** `base` is the network WITH the old stretch (the cut network has lost it); `way` the old stretch's
 * legacy way; `branchWays` the legacy way of every side road at the stretch's branch connections. */
export function replacementWorks(route: RouteDesign, r: Result, base: RoadNet, way: number,
  connections: readonly ConnectionDesign[], branchWay: (sourceId: string) => number | undefined,
  /** station cells where the old road is kept as it is (project-kept.ts): no works, already credited whole */
  kept?: Uint8Array): Replacement {
  const works: ReplacementWork[] = [], violations: Violation[] = [];
  const a = route.endpoints.a.position, b = route.endpoints.b.position;
  const da = base.wayStation(way, a.x, a.y), db = base.wayStation(way, b.x, b.y);
  const old = base.wayPath(way, Math.min(da, db), Math.max(da, db));
  const cls = base.wayClass(way), width = ROAD_CLASSES[cls]?.width ?? 6.5;
  // Old pavement left outside the new road: removed and its ground restored. Where the new road covers
  // the old one, the road authority already owns that land: not bought again (Act 13/1997 §11 road land;
  // research/30 §3). Its cadastral width is unknown, so only the old pavement's width is credited (the
  // least it certainly owns; the class's study width), at the price the new road paid for land there.
  let removed = 0, at: { x: number; y: number } | null = null, owned = 0, ownedLength = 0;
  const credited = new Float64Array(r.n);
  for (let k = 1; k < old.length; k++) {
    const p = old[k - 1], q = old[k], len = Math.hypot(q.x - p.x, q.y - p.y), steps = Math.max(1, Math.ceil(len / 5));
    for (let j = 0; j < steps; j++) {
      const t = (j + 0.5) / steps, x = p.x + t * (q.x - p.x), y = p.y + t * (q.y - p.y), n = nearest(r, x, y);
      if (kept?.[n.i]) continue; // the old road stays as it is here
      if (n.d > r.cell.width[n.i] / 2 + UNDER) { removed += len / steps; at ??= { x, y }; continue; }
      // land credit: this piece of old road inside the new road's land take, at that station's land price
      const area = (len / steps) * Math.min(width, r.cell.width[n.i]), rate = r.cell.width[n.i] > 0 ? r.parts.land[n.i] / (r.cell.width[n.i] * r.ds) : 0;
      const credit = Math.min(area * rate, Math.max(0, r.parts.land[n.i] - credited[n.i]));
      credited[n.i] += credit; owned += credit; ownedLength += len / steps;
    }
  }
  if (removed > 0.5) {
    const perM = width * (REMOVAL.coverDepth * REMOVAL.coverPerM3 + REMOVAL.baseDepth * REMOVAL.basePerM3 + REMOVAL.restorePerM2);
    const n = nearest(r, at!.x, at!.y);
    works.push({ kind: 'removal', s: r.s[n.i], x: at!.x, y: at!.y, length: removed, cost: removed * perM,
      label: `Old road removed and its ground restored: ${Math.round(removed)} m` });
  }
  if (owned > 0) works.push({ kind: 'land', s: r.s[0], x: old[0].x, y: old[0].y, length: ownedLength, cost: -owned,
    label: `Land under the old road, already the road's: not bought again (${Math.round(ownedLength)} m)` });
  // Every side road that joined the old stretch stays connected.
  const crossed = new Set<number>();
  // (a free at-grade meeting right at the stretch's end is that end's old junction: reconnected below)
  for (const c of r.crossings) if (c.roadId !== undefined && (c.cost > 0 || (c.s > 1 && c.s < r.length - 1))) crossed.add(c.roadId);
  // (a continuation's joint at the stretch end builds no junction: side roads there are reconnected below)
  for (const f of r.footprintConflicts) if (f.roadId !== undefined && f.action !== 'blocked' && !f.continuation) crossed.add(f.roadId);
  for (const c of connections) {
    if (!c.id.includes(':branch:') || !c.ports.some(p => p.kind === 'route' && p.routeId === route.id)) continue;
    const port = c.ports.find(p => p.kind === 'source');
    if (!port || port.kind !== 'source') continue;
    const side = branchWay(port.location.sourceId);
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
      cost: link + sideJunctionCost(sideCls),
      label: gap > 1 ? `The ${what} reconnected: ${Math.round(gap)} m of new road and its junction` : `The ${what} joins the new road` });
  }
  return { works, violations, total: works.reduce((t, w) => t + w.cost, 0) };
}
