// One screen for every earthwork body the project builds (owner, recurring: "we have embankment interfering with another
// road if we drag the crossing road"). Whatever produced it — our road's own body, Auto's crossing works (ramps,
// junction approaches, side roads regraded to meet them, reroutes, turning areas, roads moved aside), a road of the
// project (one the player built, a rebuilt stretch, a slid crossing's road, a slip road) — what is DRAWN must stand on
// no house left standing (nor within its working strip, where a crossing's works reach), no mapped railway, no
// other mapped road it does not rebuild, none of our piers and not in our own body, unless a billed remedy (a wall,
// a regrade, a road moved aside, a house bought out) or a stated problem says so. The engine's remedies are planned
// where each body is built (footprint.ts, retaining.ts, crossing-works.ts); this is the check they all answer to:
// scripts/works-clash-audit.ts runs it on every starter and on random player edits (a full gate), and the project's
// full evaluation reports what it still finds as a problem (project-evaluate.ts), never silently.
// What is screened is what the renderer draws (render/crossing-surface.ts crossingSurfaces: the 1:1.5 slopes, cut short
// by priced walls; a road's own body between its daylight points, as render/earthwork-surface.ts draws it).
import type { EvalContext, Result } from './evaluate';
import { KIND } from './structures';
import { bridgeLayout, frameColumns } from './bridge';
import { protectedRasterCells } from './protected-raster';
import { BUILDING_RULES, ROAD_CLASSES } from './data/urban';
import type { RoadNet } from './roadnet';
import { clearedHit } from './mapped-structures';
import { junctionRegrade, junctionRejoin } from './footprint';
import { SIDE_ROAD_SLOPE as SLOPE } from './data/remedies';
import { coneCovers, coneSurface } from './abutment-cone';
import { roadRealignmentCrossingIntervals, severedCrossingIntervals } from './road-realignment';
import { crossingBaseHeight, crossingSurfaces, footprintSurfaces, groundSegment, turnaroundSurfaces } from '../render/crossing-surface';

/** The network each full result was engineered against (a road of the project: the network as the player edited it,
 * project-roadnet.ts editedNetwork) and its crown width. Kept beside the result, never posted with it; keyed by its line
 * (the project's passes copy a result's arrays), the last NOTED results only. */
const NOTED = 64;
const evaluatedOn = new Map<string, { roads?: RoadNet; crown: number }>();
const lineKey = (r: Pick<Result, 'x' | 'y'>) => { const n = r.x.length; return `${n}:${r.x[0]}:${r.y[0]}:${r.x[n >> 1]}:${r.y[n >> 1]}:${r.x[n - 1]}:${r.y[n - 1]}`; };
export const noteNetwork = (r: Pick<Result, 'x' | 'y'>, roads: RoadNet | undefined, crown: number) => {
  const key = lineKey(r);
  evaluatedOn.delete(key); evaluatedOn.set(key, { roads, crown });
  if (evaluatedOn.size > NOTED) evaluatedOn.delete(evaluatedOn.keys().next().value!);
};
const noted = (r: Pick<Result, 'x' | 'y'>) => evaluatedOn.get(lineKey(r));
export const networkOf = (r: Pick<Result, 'x' | 'y'>): RoadNet | undefined => noted(r)?.roads;
/** the crown width the result was engineered for, m (undefined: not a full result of this process) */
export const crownOf = (r: Pick<Result, 'x' | 'y'>): number | undefined => noted(r)?.crown;

export interface WorksClash { path: string; i: number; s: number; roadId?: number; cls: string; type: string; what: 'house' | 'railway' | 'pier' | 'deck' | 'ours' | 'road';
  /** the other mapped way buried (what 'road') and its class */ way?: number; wayCls?: string; x: number; y: number; j?: number;
  /** how deep its first buried point lies under (or over) the works, m */ depth?: number }

/** Earth this thin is the drape tolerance, not a slope (crossing-works.ts DRAPED). */
export const DRAPED = 0.3;
/** The screen samples the drawn sections (render/crossing-surface.ts refines them), the engine its own points: the same
 * slope read at a slightly different spot differs by centimetres; a road's edge is buried where both agree, m. */
const SAMPLING = 0.05;

export function worksClashes(r: Result, ctx: Pick<EvalContext, 'terrain' | 'buildings' | 'roads'>, crownWidth = crownOf(r) ?? 9.5): WorksClash[] {
  const roads = noted(r) ? networkOf(r) : ctx.roads;
  const natural = (x: number, y: number) => ctx.terrain.heightAt(x, y), base = crossingBaseHeight(r, crownWidth, natural);
  const gone = new Set<number>([...r.demolished.map(d => d.j), ...r.boughtOut.map(d => d.j)]);
  const out: WorksClash[] = [], seen = new Set<string>(), strip = BUILDING_RULES.clearance;
  // our own body (its own checks own what lies under it): lateral reach per station
  /** Where (x, y) lies in our own earth body: in its formation, or on a cut / fill slope (else null). */
  const bodyAt = (x: number, y: number, inset = 0): 'formation' | 'cut' | 'fill' | null => {
    for (let i = 0; i + 1 < r.n; i++) {
      const dx = r.x[i + 1] - r.x[i], dy = r.y[i + 1] - r.y[i], len2 = dx * dx + dy * dy;
      if (Math.abs(x - r.x[i]) > 400 || Math.abs(y - r.y[i]) > 400) continue;
      const t = ((x - r.x[i]) * dx + (y - r.y[i]) * dy) / (len2 || 1);
      if (t < 0 || t > 1) continue;
      const lat = ((y - r.y[i]) * dx - (x - r.x[i]) * dy) / Math.sqrt(len2 || 1);
      const k = t < 0.5 ? i : i + 1;
      // (over a tunnel or under a bridge is no clash with our body: piers are checked on their own)
      if (r.kind[k] !== KIND.earth || r.keptCells?.[k]) continue;
      // (the daylight line between two stations, as render/earthwork-surface.ts draws it and crossing-geometry.ts's
      // margin reads it)
      const day = lat >= 0 ? r.dayL : r.dayR, reach = r.kind[i] === r.kind[i + 1] ? day[i] + (day[i + 1] - day[i]) * t : day[k];
      if (Math.abs(lat) > reach - inset) continue;
      if (Math.abs(lat) <= crownWidth / 2 + 1) return 'formation';
      // (dug away where the natural ground stands above our grade there)
      return ctx.terrain.heightAt(x, y) > r.grade[i] + (r.grade[i + 1] - r.grade[i]) * t ? 'cut' : 'fill';
    }
    return null;
  };
  const ours = (x: number, y: number, inset = 0) => bodyAt(x, y, inset) !== null;
  // our bridge piers and deck: per bridge station, the deck underside
  const piers: { x: number; y: number }[] = [];
  for (const run of r.runs) if (run.kind === KIND.bridge) {
    const length = run.s1 - run.s0, spans = Math.max(1, Math.round(length / bridgeLayout(length).span));
    const stations = run.pierStations ?? Array.from({ length: spans - 1 }, (_, k) => run.s0 + length * (k + 1) / spans);
    // (a frame pier: its two columns, as footprint.ts structureFootprints places them)
    const frame = frameColumns(crownWidth);
    for (const s of stations) {
      const i = Math.min(r.n - 2, Math.floor(s / r.ds)), t = s / r.ds - i, x = r.x[i] + (r.x[i + 1] - r.x[i]) * t, y = r.y[i] + (r.y[i + 1] - r.y[i]) * t;
      if (run.framePiers?.includes(s)) for (const o of [-frame.offset, frame.offset]) piers.push({ x: x - r.ty[i] * o, y: y + r.tx[i] * o });
      else piers.push({ x, y });
    }
  }
  // (and a raised junction's ties at our ends: the roads meeting there regraded down from it, junction-raise.ts)
  const surfaces = [...crossingSurfaces(r.crossings, natural, base), ...footprintSurfaces(r.footprintConflicts.filter(f => f.action === 'junction'), natural)];
  // the paved turning disks at the ends of closed public roads: no house left standing on one
  if (ctx.buildings) for (const t of turnaroundSurfaces(surfaces, natural)) {
    const c = t.crossing, bld = ctx.buildings, inside = (x: number, y: number) => Math.hypot(x - t.center.x, y - t.center.y) < t.radius + strip;
    bld.near(t.center.x, t.center.y, t.radius + strip + 5, j => {
      const key = `${c.s}:${c.roadId}:turn:${j}`;
      if (!gone.has(j) && !seen.has(key) && bld.anyPoint(j, 1, inside)) {
        seen.add(key); out.push({ path: 'turn', i: 0, s: c.s, roadId: c.roadId, cls: c.cls, type: c.type, what: 'house', x: (bld as any).ox[j], y: (bld as any).oy[j], j });
      }
    });
  }
  // roads moved aside (footprint relocations): their new pavement and turning areas keep off houses left standing
  if (ctx.buildings) for (const f of r.footprintConflicts) if (f.feature === 'road' && f.action === 'relocation' && f.geometry) {
    const g = f.geometry, bld = ctx.buildings, old = f.original ?? [];
    const onOld = (p: { x: number; y: number }) => old.some((a, k) => k > 0 && (() => {
      const b = old[k - 1], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < 1; })());
    const check = (p: { x: number; y: number }, q: { x: number; y: number }, half: number, path: string) => {
      const len = Math.hypot(q.x - p.x, q.y - p.y), tx = len ? (q.x - p.x) / len : 1, ty = len ? (q.y - p.y) / len : 0, x = (p.x + q.x) / 2, y = (p.y + q.y) / 2;
      bld.near(x, y, len / 2 + half + strip + 5, j => {
        const key = `${f.s0}:${f.roadId}:moved:${j}`;
        if (!gone.has(j) && !seen.has(key) && (bld.hits(j, x, y, tx, ty, len / 2, half + strip) || [p, q].some(e => bld.facadeDistanceSq(j, e.x, e.y) < (half + strip) ** 2))) {
          seen.add(key); out.push({ path, i: 0, s: f.s0, roadId: f.roadId, cls: f.cls ?? 'road', type: 'moved aside', what: 'house', x: (bld as any).ox[j], y: (bld as any).oy[j], j });
        }
      });
    };
    for (const path of [g.road ?? [], ...(g.links ?? [])]) for (let k = 1; k < path.length; k++) if (!onOld(path[k - 1]) || !onOld(path[k])) check(path[k - 1], path[k], g.width / 2, 'moved');
    const R = g.turnaroundRadius ?? 0;
    if (R > 0) for (const p of g.turnarounds ?? []) bld.near(p.x, p.y, R + strip + 5, j => {
      const key = `${f.s0}:${f.roadId}:moved:${j}`;
      if (!gone.has(j) && !seen.has(key) && bld.facadeDistanceSq(j, p.x, p.y) < (R + strip) ** 2) {
        seen.add(key); out.push({ path: 'turn', i: 0, s: f.s0, roadId: f.roadId, cls: f.cls ?? 'road', type: 'moved aside', what: 'house', x: (bld as any).ox[j], y: (bld as any).oy[j], j });
      }
    });
  }
  for (const surface of surfaces) {
    const c = surface.crossing, pathKind = surface.tie ? 'tie' : surface.link ? 'link' : 'road';
    let at = 0;
    const add = (what: WorksClash['what'], x: number, y: number, j?: number) => {
      const key = `${c.s}:${c.roadId}:${what}:${j ?? `${Math.round(x / 5)},${Math.round(y / 5)}`}`;
      if (!seen.has(key)) { seen.add(key); out.push({ path: pathKind, i: at, s: c.s, roadId: c.roadId, cls: c.cls, type: c.type, what, x, y, j }); }
    };
    const sec = surface.sections;
    /** a junction mouth's reach round a node on the path (crossing-works.ts: the toes within 30 m of it) */
    const mouthOf = (p: { x: number; y: number }) => {
      let m = 0;
      for (const q of sec) if (Math.hypot(q.p.x - p.x, q.p.y - p.y) < 30) for (const k of [0, 1] as const) m = Math.max(m, Math.hypot(q.toe[k].x - q.p.x, q.toe[k].y - q.p.y));
      return m;
    };
    for (let i = 0; i + 1 < sec.length; i++) {
      if (!groundSegment(surface, i)) continue;
      const a = sec[i], b = sec[i + 1];
      at = i;
      const raised = (q: typeof a) => Math.abs(q.edge[0].z - natural(q.edge[0].x, q.edge[0].y)) > DRAPED || Math.abs(q.edge[1].z - natural(q.edge[1].x, q.edge[1].y)) > DRAPED;
      // (a new road's pavement on the ground keeps the working strip from houses too: only it is screened there)
      const level = !raised(a) && !raised(b);
      if (level && (!surface.link || surface.keptEnd)) continue;
      const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const tx = dx / len, ty = dy / len, x = (a.p.x + b.p.x) / 2, y = (a.p.y + b.p.y) / 2;
      // half-widths of the drawn body (toe to toe) on either side; the screen is the smaller of the two
      // sections' reach, so a slope only partly over a house still counts where both ends reach it
      const reach = (q: typeof a, k: 0 | 1) => Math.hypot(q.toe[k].x - q.p.x, q.toe[k].y - q.p.y);
      const left = Math.min(reach(a, 1), reach(b, 1)), right = Math.min(reach(a, 0), reach(b, 0));
      const half = Math.max(left, right);
      // (the strip beyond a side's toe where that side has earthworks, a slope or a wall at its edge, or the new road's
      // edge: the old road's edge beside a house is as it was)
      const edgeOf = (q: typeof a, k: 0 | 1) => Math.hypot(q.edge[k].x - q.p.x, q.edge[k].y - q.p.y);
      const off = (q: typeof a, k: 0 | 1) => Math.abs(q.edge[k].z - natural(q.edge[k].x, q.edge[k].y)) > DRAPED;
      const sloped = (k: 0 | 1) => Math.max(reach(a, k) - edgeOf(a, k), reach(b, k) - edgeOf(b, k)) > DRAPED * 1.5 || off(a, k) || off(b, k);
      const anew = surface.link && !surface.keptEnd;
      const houseL = left + (anew || sloped(1) ? strip : 0), houseR = right + (anew || sloped(0) ? strip : 0);
      if (ctx.buildings) ctx.buildings.near(x, y, len / 2 + half + strip + 5, j => {
        if (gone.has(j)) return;
        // (rectangle centred between the sections, off-centre by the side difference)
        const shift = (houseL - houseR) / 2, cx = x - ty * shift, cy = y + tx * shift;
        // (a new road's pavement: round its points too, so a bend's outer corner counts)
        const round = anew && [a, b].some(q => ctx.buildings!.facadeDistanceSq(j, q.p.x, q.p.y) < (Math.max(edgeOf(q, 0), edgeOf(q, 1)) + strip) ** 2);
        if ((round || ctx.buildings!.hits(j, cx, cy, tx, ty, len / 2, (houseL + houseR) / 2)) && !ours((ctx.buildings as any).ox[j], (ctx.buildings as any).oy[j])) add('house', (ctx.buildings as any).ox[j], (ctx.buildings as any).oy[j], j);
      });
      if (level) continue;
      // (a quarter metre's tolerance: the walls stand at the raster cell's edge)
      protectedRasterCells(ctx.terrain, { i: 0, s: 0, x, y, tx, ty, along: len / 2, left: left - 0.25, right: right - 0.25 }, f => {
        if (f.feature === 'railway' && !ours(f.x, f.y)) add('railway', f.x, f.y);
      });
      // our own body (formation, slopes): a bridge over us and a reroute keep their slopes out of it (a junction
      // meets our road, a box's way passes through our embankment, by design)
      if (c.type === 'overbridge' || surface.link) {
        // (the slope's own height there beyond the drape tolerance: a toe grazing our slope's edge is not a body in it)
        for (const q of [a, b]) for (const k of [0, 1] as const) for (const t of [0.25, 0.5, 0.75]) {
          if (Math.abs(q.edge[k].z - natural(q.edge[k].x, q.edge[k].y)) * (1 - t) < DRAPED) continue;
          const x = q.edge[k].x + (q.toe[k].x - q.edge[k].x) * t, y = q.edge[k].y + (q.toe[k].y - q.edge[k].y) * t;
          if (Math.hypot(q.toe[k].x - q.edge[k].x, q.toe[k].y - q.edge[k].y) <= 1) continue;
          // (a fill beside our fill merges with it: one body; anything in our formation or our cut, or a cut into
          // our embankment, is not buildable as drawn)
          const body = bodyAt(x, y, 1), fill = q.edge[k].z > natural(q.edge[k].x, q.edge[k].y);
          if (body === 'formation' || body === 'cut' || (body === 'fill' && !fill)) add('ours', x, y);
        }
      }
      for (const p of piers) {
        const u = (p.x - a.p.x) * tx + (p.y - a.p.y) * ty, v = -(p.x - a.p.x) * ty + (p.y - a.p.y) * tx;
        if (u >= 0 && u <= len && (v >= 0 ? v <= left : -v <= right)) add('pier', p.x, p.y);
      }
      // other mapped roads under its slopes (crossing-works.ts besideRoads: a side road joining it is regraded to meet
      // it, one beside it walled off; neither: Auto takes another treatment): none of them buried as drawn
      if (roads) {
        // (the crossing's own paths: the crossed road raised, its links, the side roads it regrades)
        const g = c.geometry, paths = [g?.road ?? [], ...(g?.links ?? []), ...(g?.ties ?? []).map(t => t.path)];
        const own = new Set<number>([c.roadId, c.targetRoadId, ...(c.geometry?.ties ?? []).map(t => t.way)].filter((w): w is number => w !== undefined));
        roads.nearSegments([x - len / 2 - half - 2, y - len / 2 - half - 2, x + len / 2 + half + 2, y + len / 2 + half + 2], s => {
          if (own.has(s.way) || roads.isDesigned(s.way) || roads.structure(s.way) || s.length <= 0) return;
          // (the crossed road itself where it runs on along the path: another way of its line)
          if (paths.some(path => onPath(path, s.ax, s.ay) && onPath(path, s.bx, s.by))) return;
          const half = ROAD_CLASSES[s.cls]?.width / 2 || 0, count = Math.min(400, Math.max(1, Math.ceil(s.length)));
          // (a side road joining one of its paths: its mouth, within the slopes' reach of the node, is the junction's;
          // crossing-works.ts besideRoads)
          const nodes = [{ x: s.ax, y: s.ay }, { x: s.bx, y: s.by }].filter(p => paths.some(path => onPath(path, p.x, p.y, 2)));
          for (let k = 0; k <= count; k++) {
            const px = s.ax + (s.bx - s.ax) * k / count, py = s.ay + (s.by - s.ay) * k / count;
            const u = ((px - a.p.x) * tx + (py - a.p.y) * ty) / len;
            // (on the path itself: another way of its line, raised with it)
            if (u < 0 || u > 1 || paths.some(path => onPath(path, px, py, 1))) continue;
            if (nodes.some(p => Math.hypot(px - p.x, py - p.y) <= mouthOf(p) + half)) continue;
            const v = -(px - a.p.x) * ty + (py - a.p.y) * tx, side: 0 | 1 = v >= 0 ? 1 : 0;
            // (a way joining it that runs on under its pavement is paved with it: crossing-works.ts besideRoads)
            if (nodes.length && Math.abs(v) <= edgeOf(a, side) + (edgeOf(b, side) - edgeOf(a, side)) * u) continue;
            // (its near edge, not its centreline: half its width nearer us)
            const at = Math.max(0, Math.abs(v) - half), toe = reach(a, side) + (reach(b, side) - reach(a, side)) * u;
            if (at >= toe - 0.25) continue;
            const edge = edgeOf(a, side) + (edgeOf(b, side) - edgeOf(a, side)) * u;
            const ze = a.edge[side].z + (b.edge[side].z - a.edge[side].z) * u;
            const qx = a.p.x + (b.p.x - a.p.x) * u - ty * (v >= 0 ? at : -at), qy = a.p.y + (b.p.y - a.p.y) * u + tx * (v >= 0 ? at : -at), g = natural(qx, qy);
            // (the slope at 1:1.5 from the paved edge, as crossing-works.ts besideRoads measures the earth on it: the
            // drawn slope runs straight to the toe over ground that is not)
            const ex = a.edge[side].x + (b.edge[side].x - a.edge[side].x) * u, ey = a.edge[side].y + (b.edge[side].y - a.edge[side].y) * u, fill = ze >= natural(ex, ey);
            const z = at <= edge ? ze : fill ? ze - (at - edge) / SLOPE : ze + (at - edge) / SLOPE, depth = fill ? z - g : g - z;
            if (depth > DRAPED + SAMPLING && !ours(px, py)) { addRoad(s.way, s.cls, px, py, depth); break; }
          }
        });
        function addRoad(way: number, cls: string, px: number, py: number, depth: number) {
          const key = `${c.s}:${c.roadId}:road:${way}`;
          if (!seen.has(key)) { seen.add(key); out.push({ path: pathKind, i: at, s: c.s, roadId: c.roadId, cls: c.cls, type: c.type, what: 'road', x: px, y: py, way, wayCls: cls, depth }); }
        }
      }
    }
  }
  // the cone of fill round an end raised with its junction (evaluate.ts): no house under it, no road but those meeting
  // there (on their ties over it)
  for (const c of r.cones ?? []) if (c.end) {
    const covers = coneCovers(c, c.length, 0, natural), i = c.i, joined = new Set(r.footprintConflicts.filter(f => f.action === 'junction' && f.i === i).flatMap(f => f.junction?.ways ?? []));
    const reach = c.length + c.side + strip;
    if (ctx.buildings) ctx.buildings.near(c.x, c.y, reach, j => {
      const b = ctx.buildings!, x = (b as any).ox[j], y = (b as any).oy[j];
      if (!gone.has(j) && !seen.has(`cone:${i}:${j}`) && b.anyPoint(j, 1, coneCovers(c, c.length, strip, natural))) {
        seen.add(`cone:${i}:${j}`); out.push({ path: 'cone', i, s: r.s[i], cls: 'house', type: 'end', what: 'house', x, y, j });
      }
    });
    if (roads) roads.nearSegments([c.x - reach, c.y - reach, c.x + reach, c.y + reach], q => {
      if (joined.has(q.way) || roads.isDesigned(q.way) || q.length <= 0 || seen.has(`cone:${i}:r${q.way}`)) return;
      const count = Math.min(400, Math.max(1, Math.ceil(q.length)));
      for (let k = 0; k <= count; k++) {
        const x = q.ax + (q.bx - q.ax) * k / count, y = q.ay + (q.by - q.ay) * k / count;
        if (!covers(x, y) || ours(x, y)) continue;
        const u = (x - c.x) * c.tx + (y - c.y) * c.ty, v = -(x - c.x) * c.ty + (y - c.y) * c.tx, depth = coneSurface(c, Math.max(0, u), v) - natural(x, y);
        if (depth <= DRAPED + SAMPLING) continue;
        seen.add(`cone:${i}:r${q.way}`);
        out.push({ path: 'cone', i, s: r.s[i], roadId: q.way, cls: q.cls, type: 'end', what: 'road', x, y, way: q.way, wayCls: q.cls, depth });
        return;
      }
    });
  }
  if (roads) out.push(...bodyClashes(r, crownWidth, ctx.terrain, roads, ctx.buildings, gone));
  return out;
}
const onPath = (path: readonly { x: number; y: number }[], x: number, y: number, tolerance = 0.5) => {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(x - a.x - t * dx, y - a.y - t * dy) < tolerance) return true;
  }
  return false;
};

/** Along our road either side of a crossing, what the crossing's treatment rebuilds of its way (and of the side roads it
 * regrades) is its own: the exact intervals cover the rest, m. */
const CROSSING_REACH = 30;

/** A road's own earth body (between its daylight points, as walls cut them short; render/earthwork-surface.ts) over other
 * mapped roads it does not rebuild and over houses it does not take: each way's first buried point. Rebuilt, as the
 * engine owns them: a way its crossings carry, cut or regrade (their exact intervals, footprint.ts), one its footprint
 * moves aside, takes up or reports blocked (a problem already), a junction's way where our body is no deeper than the
 * junction rebuilds its pavement (footprint.ts JUNCTION_DRAPE), a mapped bridge with room over us, another road of the
 * project (the project ledger weighs two roads' works). */
export function bodyClashes(r: Result, crownWidth: number, terrain: EvalContext['terrain'], roads: RoadNet, buildings: EvalContext['buildings'], gone: ReadonlySet<number>): WorksClash[] {
  const out: WorksClash[] = [], w = crownWidth / 2;
  const owned = new Map<number, [number, number][]>();
  const own = (way: number, a: number, b: number) => (owned.get(way) ?? owned.set(way, []).get(way)!).push([Math.min(a, b), Math.max(a, b)]);
  for (const iv of roadRealignmentCrossingIntervals(r.crossings, roads)) own(iv.way, iv.a, iv.b);
  for (const iv of severedCrossingIntervals(r.crossings, roads)) {
    const tieIn = (ROAD_CLASSES[roads.wayClass(iv.way)]?.width ?? 0) / 2 + 3;
    own(iv.way, iv.a - tieIn, iv.b + tieIn);
  }
  /** the junctions at our ends (footprint.ts): each joined way's pavement inside the zone is rebuilt at the junction's level
   * as far as a junction can regrade it (junctionRegrade) */
  const junctions = r.footprintConflicts.filter(f => f.feature === 'road' && f.action === 'junction' && f.junction)
    .map(f => ({ ways: f.junction!.ways, x: r.x[f.i], y: r.y[f.i], zone: f.junction!.zone, ties: f.geometry?.ties ?? [] }));
  /** the height a raised junction's tie rebuilds a way's pavement at (x, y) at (footprint.ts tieZ; undefined: none) */
  const tieZ = (way: number, x: number, y: number) => {
    let z: number | undefined, gap = Infinity;
    for (const j of junctions) if (j.ways.includes(way)) for (const tie of j.ties) for (let k = 1; k < tie.path.length; k++) {
      const a = tie.path[k - 1], b = tie.path[k], dx = b.x - a.x, dy = b.y - a.y;
      const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1))), d = Math.hypot(x - a.x - u * dx, y - a.y - u * dy);
      if (d < gap && d <= (ROAD_CLASSES[tie.cls]?.width ?? 0) / 2 + 1) { gap = d; z = a.z + (b.z - a.z) * u; }
    }
    return z;
  };
  const tolerance = (way: number, x: number, y: number) => Math.max(DRAPED,
    ...junctions.filter(j => j.ways.includes(way)).map(j => junctionRegrade(j.zone, Math.hypot(x - j.x, y - j.y))));
  /** stations of our road where a conflict already settles (or reports) that way */
  const settled = new Map<number, [number, number][]>();
  for (const f of r.footprintConflicts) if (f.feature === 'road' && f.roadId !== undefined && f.action !== 'junction') {
    (settled.get(f.roadId) ?? settled.set(f.roadId, []).get(f.roadId)!).push([f.s0 - r.ds, f.s1 + r.ds]);
    for (const iv of f.sourceIntervals ?? []) own(iv.way, iv.a, iv.b);
    for (const iv of f.takenUp?.intervals ?? []) own(iv.way, iv.a, iv.b);
  }
  // (a crossing's way within its own works: the crossing's treatment owns it there)
  for (const c of r.crossings) if (c.roadId !== undefined) for (const way of [c.roadId, c.targetRoadId, ...(c.geometry?.ties ?? []).map(t => t.way)])
    if (way !== undefined) (settled.get(way) ?? settled.set(way, []).get(way)!).push([c.s - CROSSING_REACH, c.s + CROSSING_REACH]);
  // (a way's end under our body rejoined to the road our junction rebuilds there: footprint.ts junctionRejoin)
  const rejoins = junctionRejoin(r.crossings, roads), wayEnd = new Map<number, number>();
  const rejoined = (way: number, d: number) => {
    let end = wayEnd.get(way);
    if (end === undefined) wayEnd.set(way, end = roads.wayPath(way, 0, Infinity).at(-1)?.d ?? 0);
    return [0, end].some(e => rejoins(way, Math.min(d, e), Math.max(d, e)));
  };
  const seen = new Set<string>(), ends = new Map<number, Set<number>>();
  const endWays = (i: number) => {
    let set = ends.get(i);
    if (!set) {
      ends.set(i, set = new Set());
      roads.nearSegments([r.x[i] - 2, r.y[i] - 2, r.x[i] + 2, r.y[i] + 2], q => {
        const dx = q.bx - q.ax, dy = q.by - q.ay, t = Math.max(0, Math.min(1, ((r.x[i] - q.ax) * dx + (r.y[i] - q.ay) * dy) / (dx * dx + dy * dy || 1)));
        if (Math.hypot(r.x[i] - q.ax - t * dx, r.y[i] - q.ay - t * dy) <= 2) set!.add(q.way);
      });
    }
    return set;
  };
  for (let i = 0; i < r.n; i++) {
    // (a stretch kept as the old road builds no body: project-kept.ts applyKept, drawn on the ground)
    if (r.kind[i] !== KIND.earth || r.keptCells?.[i]) continue;
    const shift = i === 0 ? r.ds / 4 : i === r.n - 1 ? -r.ds / 4 : 0, along = shift ? r.ds / 4 : r.ds / 2;
    const cx = r.x[i] + r.tx[i] * shift, cy = r.y[i] + r.ty[i] * shift, reach = Math.max(r.dayL[i], r.dayR[i]) + along;
    const surfaceAt = (v: number) => {
      const at = Math.abs(v), day = v >= 0 ? r.dayL[i] : r.dayR[i], zDay = v >= 0 ? r.zDayL[i] : r.zDayR[i];
      return at <= w || day <= w ? r.grade[i] : r.grade[i] + (zDay - r.grade[i]) * Math.min(1, (at - w) / (day - w));
    };
    const inside = (x: number, y: number) => {
      const u = (x - cx) * r.tx[i] + (y - cy) * r.ty[i], v = -(x - cx) * r.ty[i] + (y - cy) * r.tx[i];
      return Math.abs(u) <= along && (v >= 0 ? v <= r.dayL[i] - 0.25 : -v <= r.dayR[i] - 0.25) ? v : null;
    };
    roads.nearSegments([cx - reach, cy - reach, cx + reach, cy + reach], s => {
      if (s.length <= 0 || roads.isDesigned(s.way) || seen.has(`r${s.way}`)) return;
      // (an end's own cell on a way meeting there: the junction's pavement itself, footprint.ts's endpoint crown cell)
      if ((i === 0 || i === r.n - 1) && endWays(i).has(s.way)) return;
      if (settled.get(s.way)?.some(([a, b]) => r.s[i] >= a && r.s[i] <= b)) return;
      const half = (ROAD_CLASSES[s.cls]?.width ?? 0) / 2, count = Math.min(400, Math.max(1, Math.ceil(s.length)));
      for (let k = 0; k <= count; k++) {
        const d = s.d + s.length * k / count, px = s.ax + (s.bx - s.ax) * k / count, py = s.ay + (s.by - s.ay) * k / count;
        if (owned.get(s.way)?.some(([a, b]) => d >= a - 0.5 && d <= b + 0.5)) continue;
        const v = inside(px, py);
        if (v === null || rejoined(s.way, d)) continue;
        // (its near edge: half its width nearer our centreline)
        const at = Math.sign(v || 1) * Math.max(0, Math.abs(v) - half), qx = cx - r.ty[i] * at, qy = cy + r.tx[i] * at;
        // (on a raised junction's tie: our slope below its pavement is the tie's own embankment)
        const tz = tieZ(s.way, px, py);
        if ((tz === undefined ? Math.abs(surfaceAt(at) - terrain.heightAt(qx, qy)) : Math.max(0, surfaceAt(at) - tz)) <= tolerance(s.way, px, py)) continue;
        if (roads.structure(s.way) && clearedHit(roads, s, [d, d], r.grade[i], terrain)) continue;
        seen.add(`r${s.way}`);
        out.push({ path: 'body', i, s: r.s[i], roadId: s.way, cls: s.cls, type: 'body', what: 'road', x: px, y: py, way: s.way, wayCls: s.cls });
        return;
      }
    });
    if (buildings) buildings.near(cx, cy, reach, j => {
      if (gone.has(j) || seen.has(`h${j}`)) return;
      const x = (buildings as any).ox[j], y = (buildings as any).oy[j], v = inside(x, y);
      if (v === null || Math.abs(surfaceAt(v) - terrain.heightAt(x, y)) <= DRAPED) return;
      seen.add(`h${j}`);
      out.push({ path: 'body', i, s: r.s[i], cls: 'house', type: 'body', what: 'house', x, y, j });
    });
  }
  return out;
}

