// Twists: the challenges a player picks per mission (which a mission offers and their numbers: data/twists.ts).
// A twist never changes the bill or validity: VALID stays the norm check, a twist is the player's own challenge.
// Checked on the main thread after each full evaluation (never in a drag preview) and by scripts/twists-check.ts on
// the reference designs that show each offered twist can be met.
import type { Result } from './evaluate';
import type { ProjectResult, RouteId } from './project';
import { KIND } from './structures';
import { STRUCTURE_RULES } from './data/prices';
import { bridgeLayout } from './bridge';
import { TWIST_NAMES, TWIST_ORDER, type Landmark, type TwistId, type TwistTerms } from './twist-words';
export * from './twist-words';

/** A place on the map: a circle, a polygon or several (`rings`, filled even-odd: a heritage area in parts), pack metres. */
export type Shape = { kind: 'circle'; x: number; y: number; r: number } | { kind: 'polygon'; pts: readonly (readonly [number, number])[] }
  | { kind: 'rings'; rings: readonly (readonly (readonly [number, number])[])[] };
/** What our line does at a station: cuts, fills, bridges, tunnels deep (mined) or near the surface (`cover`: a tunnel dug
 * from the surface and covered again); `pier`: a pier of our bridge stands there (a deck may pass over a place its piers
 * keep out of). */
export type Use = 'cut' | 'fill' | 'bridge' | 'tunnel' | 'cover' | 'pier';
export const ALL_USES: readonly Use[] = ['cut', 'fill', 'bridge', 'tunnel', 'cover'];
/** "Hands off the castle": nothing of ours on the ground or over it; a mined tunnel deep under a monument's setting is
 * fine (as the curveballs' keep-out, data/curveballs.ts KEEP_OUT) */
export const LANDMARK_USES: readonly Use[] = ['cut', 'fill', 'bridge', 'cover'];

/** Where our line breaks a place's rule: a run of stations. */
export interface ZoneRun { routeId: RouteId; s0: number; s1: number; use: Use; x: number; y: number }

const MINED = STRUCTURE_RULES.tunnelMinDepth;
/** What our line does at station i. A tunnel with less ground over it than a mined one needs is dug from the
 * surface (cut and cover): it digs the place up, though it is no open cut. */
export function useAt(r: Result, i: number): Use {
  const k = r.kind[i];
  if (k === KIND.bridge) return 'bridge';
  if (k === KIND.tunnel) return r.ground[i] - r.grade[i] >= MINED ? 'tunnel' : 'cover';
  return r.grade[i] >= r.ground[i] ? 'fill' : 'cut';
}

/** a polygon shape's outlines */
export const shapeRings = (shape: Exclude<Shape, { kind: 'circle' }>) => shape.kind === 'rings' ? shape.rings : [shape.pts];
function bbox(shape: Shape): [number, number, number, number] {
  if (shape.kind === 'circle') return [shape.x - shape.r, shape.y - shape.r, shape.x + shape.r, shape.y + shape.r];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of shapeRings(shape)) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}
export function inside(shape: Shape, x: number, y: number): boolean {
  if (shape.kind === 'circle') return Math.hypot(x - shape.x, y - shape.y) <= shape.r;
  let c = false;
  for (const p of shapeRings(shape)) for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
}
function segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
/** Does the segment a–b touch the shape? */
export function segmentTouches(shape: Shape, ax: number, ay: number, bx: number, by: number): boolean {
  if (shape.kind === 'circle') {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((shape.x - ax) * dx + (shape.y - ay) * dy) / l2)) : 0;
    return Math.hypot(ax + t * dx - shape.x, ay + t * dy - shape.y) <= shape.r;
  }
  if (inside(shape, ax, ay) || inside(shape, bx, by)) return true;
  for (const p of shapeRings(shape)) for (let i = 0, j = p.length - 1; i < p.length; j = i++) if (segmentsCross(ax, ay, bx, by, p[j][0], p[j][1], p[i][0], p[i][1])) return true;
  return false;
}

/** The stretches where our line (its body across to where its slopes meet the ground) does one of `forbid` in the
 * place. Cheap: a box test per station, the shape test only near it. */
export function zoneRuns(r: Result, routeId: RouteId, shape: Shape, forbid: readonly Use[], deckHalf = 7): ZoneRun[] {
  const [x0, y0, x1, y1] = bbox(shape), reach = 200, out: ZoneRun[] = [];
  let open: ZoneRun | null = null;
  for (let i = 0; i < r.n; i++) {
    const x = r.x[i], y = r.y[i];
    let hit = false, use: Use = 'fill';
    if (x > x0 - reach && x < x1 + reach && y > y0 - reach && y < y1 + reach) {
      use = useAt(r, i);
      if (forbid.includes(use)) {
        // across the body: left of travel is (−ty, tx)
        // (a bridge's deck, not the ground's slopes under it)
        const nx = -r.ty[i], ny = r.tx[i], deck = use === 'bridge' || use === 'tunnel' || use === 'cover', l = deck ? deckHalf : r.dayL[i] || 0, rr = deck ? deckHalf : r.dayR[i] || 0;
        hit = segmentTouches(shape, x + nx * l, y + ny * l, x - nx * rr, y - ny * rr);
      }
    }
    if (hit) {
      if (open && open.use === use) open.s1 = r.s[i];
      else { if (open) out.push(open); open = { routeId, s0: r.s[i], s1: r.s[i], use, x, y }; }
    } else if (open) { out.push(open); open = null; }
  }
  if (open) out.push(open);
  // the piers, where they stand (as drawn: at their stations, else evenly spaced), and the abutments at the deck's ends;
  // each a slab across the deck, a few metres thick along it
  if (forbid.includes('pier')) for (const run of r.runs) {
    if (run.kind !== KIND.bridge) continue;
    const length = run.s1 - run.s0, spans = Math.max(1, Math.round(length / bridgeLayout(length).span));
    const supports = [run.s0, ...(run.pierStations ?? Array.from({ length: spans - 1 }, (_, k) => run.s0 + length * (k + 1) / spans)), run.s1];
    for (const s of supports) for (const ds of [-2, 0, 2]) {
      const at = Math.max(0, Math.min(r.s[r.n - 1], s + ds)), i = Math.max(0, Math.min(r.n - 2, Math.floor(at / r.ds))), t = at / r.ds - i;
      const x = r.x[i] + (r.x[i + 1] - r.x[i]) * t, y = r.y[i] + (r.y[i + 1] - r.y[i]) * t, nx = -r.ty[i], ny = r.tx[i];
      if (segmentTouches(shape, x + nx * deckHalf, y + ny * deckHalf, x - nx * deckHalf, y - ny * deckHalf)) { out.push({ routeId, s0: s, s1: s, use: 'pier', x, y }); break; }
    }
  }
  return out;
}

/** Our line's results (a motorway: both directions), from the project result. */
export function ourResults(project: ProjectResult, ours: readonly RouteId[]): { id: RouteId; r: Result }[] {
  // (a paired motorway's two directions share one result: counted once)
  const seen = new Set<Result>();
  return ours.flatMap(id => { const r = project.routes[id]?.legacy; if (!r || seen.has(r)) return []; seen.add(r); return [{ id, r }]; });
}

/** What the twists read from a full project result. */
export interface TwistFacts {
  valid: boolean;
  cost: number | null;
  travelMin: number;
  cut: number; fill: number; surplus: number; deficit: number;
  forestM2: number;
  tunnels: { routeId: RouteId; s0: number; s1: number; x: number; y: number }[];
  bridges: { routeId: RouteId; s0: number; s1: number; x: number; y: number }[];
  /** homes the project takes (under its works or bought out) */
  homes: { j: number; x: number; y: number }[];
  results: { id: RouteId; r: Result }[];
}

/** `home(j)`: building j is lived in; `at(j)`: where it stands. A paired motorway's shared body is counted once. */
export function twistFacts(project: ProjectResult, ours: readonly RouteId[], home: (j: number) => boolean, at: (j: number) => { x: number; y: number }): TwistFacts {
  const results = ourResults(project, ours);
  const f: TwistFacts = { valid: project.valid, cost: project.cost.total, travelMin: 0, cut: 0, fill: 0, surplus: 0, deficit: 0, forestM2: 0,
    tunnels: [], bridges: [], homes: [], results };
  for (const { id, r } of results) {
    f.travelMin = Math.max(f.travelMin, r.travelMin);
    const q = r.quantities;
    f.cut += q.cut; f.fill += q.fill; f.surplus += q.surplus; f.deficit += q.deficit; f.forestM2 += q.forestArea;
    for (const run of r.runs) {
      const list = run.kind === KIND.tunnel ? f.tunnels : f.bridges;
      const i = Math.min(r.n - 1, Math.max(0, Math.round((run.i0 + run.i1) / 2)));
      list.push({ routeId: id, s0: run.s0, s1: run.s1, x: r.x[i], y: r.y[i] });
    }
  }
  for (const b of project.buildings) if (b.action !== 'retain' && home(b.buildingIndex)) f.homes.push({ j: b.buildingIndex, ...at(b.buildingIndex) });
  return f;
}

// ---- the checks ---------------------------------------------------------------------------------

/** One thing that breaks a twist, where it is (the card flies there); `fix`: the stretch a bridge or a tunnel would clear it. */
export interface TwistIssue { text: string; x: number; y: number; routeId?: RouteId; s0?: number; s1?: number; fix?: { kind: 'bridge' | 'tunnel'; routeId: RouteId; s0: number; s1: number; style?: 'long' };
  /** what it is about: `landmark:<index in terms.landmarks>`, `curveball:<id>` */
  ref?: string }
export interface TwistCheck { id: TwistId; met: boolean; name: string; status: string; issues: TwistIssue[] }
/** A curveball as the checks see it: its place in pack metres. */
export interface CurveballCheck { id: string; headline: string; ask: string; zone?: { label: string; shape: Shape; forbid: readonly Use[] }; budget?: number }

const num = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const kmText = (s: number) => `km ${num(s / 1000, 2)}`;
const money = (v: number) => v >= 1e9 ? `${num(v / 1e9, 2)} bn` : `${num(v / 1e6)} M`;
const USE_WORDS: Record<Use, string> = { cut: 'our cutting', fill: 'our embankment', bridge: 'our bridge', tunnel: 'our tunnel', cover: 'our tunnel dug from the surface', pier: 'a pier of our bridge' };
/** a landmark's name as the map shows it: a monument's register name and place, a zone's name */
export const landmarkName = (l: Pick<Landmark, 'name'>): string => l.name;
/** the shape a landmark keeps clear: a zone itself, a ring round a monument */
export const landmarkShape = (l: Landmark & { ring: number }): Shape => l.rings ? { kind: 'rings', rings: l.rings } : { kind: 'circle', x: l.x, y: l.y, r: l.ring };

/** Where the twists stand. `manual`: every road of ours has its heights by hand; `scratch`: this design began from the
 * straight line; `curveballs`: the news that has arrived; `startBill`: the mission's starting bill (a budget's base). */
export function checkTwists(on: readonly TwistId[], f: TwistFacts, t: TwistTerms,
  extra: { manual: boolean; scratch: boolean; curveballs: readonly CurveballCheck[]; startBill: number; deckHalf?: number }): TwistCheck[] {
  const out: TwistCheck[] = [];
  const at = (run: { routeId: RouteId; s0: number; s1: number; x: number; y: number }) => ({ x: run.x, y: run.y, routeId: run.routeId, s0: run.s0, s1: run.s1 });
  for (const id of TWIST_ORDER) {
    if (!on.includes(id)) continue;
    const name = TWIST_NAMES[id];
    const push = (met: boolean, status: string, issues: TwistIssue[] = []) => out.push({ id, met, name, status, issues });
    switch (id) {
      case 'earth': {
        // fill brought in, as a share of the fill; dug earth trucked away, as a share of what is dug
        const limit = t.earthShare ?? 0.1, share = earthShare(f), max = `at most ${Math.round(limit * 100)} %`;
        // (a share just over the limit says so: 10.4 %, not 10 %)
        const pct = `${Math.round(share * 100) === Math.round(limit * 100) && share !== limit ? (share * 100).toFixed(1) : Math.round(share * 100)} %`;
        const what = f.deficit / Math.max(1, f.fill) >= f.surplus / Math.max(1, f.cut) ? 'of the fill brought in' : 'of the dug earth trucked away';
        push(share <= limit, share <= limit ? `Balanced: ${pct} (${max})` : `${pct} ${what} (${max})`,
          share <= limit ? [] : [{ text: /brought/.test(what) ? 'Lower the road where it runs high, or bridge the biggest embankments' : 'Raise the road where it cuts deep, or tunnel', x: NaN, y: NaN }]);
        break;
      }
      case 'landmarks': {
        const issues: TwistIssue[] = [];
        for (const [k, l] of t.landmarks.entries()) for (const { id: rid, r } of f.results) {
          const runs = zoneRuns(r, rid, landmarkShape(l), LANDMARK_USES, extra.deckHalf);
          if (!runs.length) continue;
          const run = runs[0];
          issues.push({ text: l.rings ? `${cap(USE_WORDS[run.use])} in the ${landmarkName(l)}` : `${cap(USE_WORDS[run.use])} within ${num(l.ring)} m of ${landmarkName(l)}`, ...at(run), ref: `landmark:${k}` });
          break;
        }
        push(!issues.length, issues.length ? `${issues.length} too close` : `${t.landmarks.length} kept clear`, issues);
        break;
      }
      case 'curveballs': {
        const issues: TwistIssue[] = [], broken = new Set<string>();
        for (const c of extra.curveballs) {
          const before = issues.length;
          if (c.budget !== undefined && (f.cost === null || f.cost > c.budget * extra.startBill))
            issues.push({ text: `${c.ask}: ${f.cost === null ? 'the bill is not known yet' : `${money(f.cost)} is over ${money(c.budget * extra.startBill)}`}`, x: NaN, y: NaN, ref: `curveball:${c.id}` });
          if (c.zone) for (const { id: rid, r } of f.results) for (const run of zoneRuns(r, rid, c.zone.shape, c.zone.forbid, extra.deckHalf)) {
            // the structure that clears it: a bridge where neither deck nor piers are kept out (over earthworks), else a tunnel
            const fix = run.use === 'tunnel' || run.use === 'cover' ? undefined : !c.zone.forbid.includes('bridge') && !c.zone.forbid.includes('pier') && run.use !== 'bridge' ? 'bridge' as const
              : !c.zone.forbid.includes('tunnel') && !c.zone.forbid.includes('cover') && run.use === 'cut' ? 'tunnel' as const : undefined;
            // piers kept out, the deck allowed: our bridge over it on long spans, from where the bridge next to it starts
            const near = c.zone.forbid.includes('pier') && !c.zone.forbid.includes('bridge') && run.use !== 'tunnel' && run.use !== 'cover'
              ? r.runs.find(u => u.kind === KIND.bridge && u.s0 < run.s1 + 60 && u.s1 > run.s0 - 60) : undefined;
            issues.push({ text: `${c.ask}: ${USE_WORDS[run.use]} at ${kmText(run.s0)}`, ...at(run), ref: `curveball:${c.id}`,
              ...(fix ? { fix: { kind: fix, routeId: rid, s0: Math.max(0, run.s0 - 20), s1: run.s1 + 20 } }
                // (earthworks at its end: the deck on over them; a pier in it: the end moved on, so the spans fall anew)
                : near ? { fix: { kind: 'bridge' as const, style: 'long' as const, routeId: rid, s0: Math.min(near.s0, run.s0 - 10),
                  s1: run.use === 'pier' ? near.s1 + 15 : Math.max(near.s1, run.s1 + 10) } } : {}) });
          }
          if (issues.length > before) broken.add(c.id);
        }
        push(!issues.length, extra.curveballs.length ? `${extra.curveballs.length - broken.size} of ${extra.curveballs.length} news met` : 'No news yet', issues);
        break;
      }
      case 'homes': push(!f.homes.length, f.homes.length ? `${f.homes.length} home${f.homes.length === 1 ? '' : 's'} bought out` : 'Nobody moves',
        f.homes.slice(0, 20).map(h => ({ text: 'A home bought out', x: h.x, y: h.y }))); break;
      case 'forest': {
        const ha = f.forestM2 / 1e4, max = t.forestHa ?? 0;
        push(ha <= max, `${num(ha, 1)} ha of forest (at most ${num(max, 1)})`); break;
      }
      case 'bridges': {
        const m = f.bridges.reduce((a, b) => a + b.s1 - b.s0, 0), max = t.bridgeM ?? 0;
        push(m <= max, `${num(m)} m of bridges (at most ${num(max)})`, m <= max ? [] : f.bridges.map(b => ({ text: `A ${num(b.s1 - b.s0)} m bridge at ${kmText(b.s0)}`, ...at(b) })));
        break;
      }
      case 'tunnels': push(!f.tunnels.length, f.tunnels.length ? `${f.tunnels.length} tunnel${f.tunnels.length === 1 ? '' : 's'}` : 'None',
        f.tunnels.map(b => ({ text: `A ${num(b.s1 - b.s0)} m tunnel at ${kmText(b.s0)}`, ...at(b) }))); break;
      case 'faster': {
        const max = t.maxTravelMin * 0.9;
        push(f.travelMin <= max, `${num(f.travelMin, 2)} min (at most ${num(max, 2)})`); break;
      }
      case 'budget': push(f.cost !== null && f.cost <= (t.budget ?? 0), `${f.cost === null ? '—' : money(f.cost)} (at most ${money(t.budget ?? 0)})`); break;
      case 'scratch': push(extra.scratch, extra.scratch ? 'Started from the straight line' : 'This design began from the starting line'); break;
      case 'byHand': push(extra.manual, extra.manual ? 'Heights by hand' : 'Auto sets the heights'); break;
    }
  }
  return out;
}

/** Earth balance: the larger of the fill brought in (a share of the fill) and the dug earth trucked away (a share of the cut). */
export const earthShare = (f: Pick<TwistFacts, 'cut' | 'fill' | 'surplus' | 'deficit'>) => Math.max(f.deficit / Math.max(1, f.fill), f.surplus / Math.max(1, f.cut));

/** A shape in EPSG:5514 in a pack's own metres (its origin: meta.origin). */
export function packShape(shape: { kind: 'circle'; x: number; y: number; r: number } | { kind: 'polygon'; pts: readonly (readonly [number, number])[] }, origin: readonly [number, number]): Shape {
  return shape.kind === 'circle' ? { ...shape, x: shape.x - origin[0], y: shape.y - origin[1] }
    : { kind: 'polygon', pts: shape.pts.map(([x, y]) => [x - origin[0], y - origin[1]] as const) };
}
