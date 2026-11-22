// Junction works drawn on the ground. A roundabout's ring where a road of ours ends on another (core/tie-in.ts
// ringMark), over both roads on its graded platform (`ringPlatform`: through the arms' roads as drawn there,
// render/view.ts drawnSurface, with its cut and fill faces out to what is drawn round it): its carriageway with its outer
// edge line (broken where the arms come in), the paved apron round the island and the island's grass (TP 135 (2017)
// tab. 2 at D = 40 m: core/tie-in.ts ROUNDABOUT_RING), and in each two-way arm a kerbed splitter island with the
// carriageway widened round it (core/tie-in.ts SPLITTER_ISLAND); and the ground a junction's sight field is dug clear of.
// Display only: their price and land are the junction's works.
import * as THREE from 'three';
import { ROUNDABOUT_RING, SPLITTER_ISLAND, type RingArm, type RingMark } from '../core/tie-in';

type RGB = readonly [number, number, number];
// (the colours as the lane marks', render/view.ts setLaneMarks: sRGB hex, linear components)
const rgb = (hex: number): RGB => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const CUT = rgb(0x9e7859), FILL = rgb(0x8aa95a), ASPHALT = rgb(0x3b3b42), APRON = rgb(0x8f8a84), GRASS = rgb(0x6f8f4c), WHITE = rgb(0xf2f2ee),
  KERB = rgb(0xc9c6bf), PAVING = rgb(0xa29d95);
/** the outer edge line: 0.25 m wide, 0.25 m in from the ring's edge (a guide strip), broken this far either side of an
 * arm's line (its carriageway and the flare of its mouth), m */
const EDGE = { width: 0.25, inset: 0.25, mouth: 7 };
const SEGMENTS = 96;

/** Ground dug off a junction's sight field (core/tie-in.ts sightField): each cell a square of `size` m, tinted as a
 * cutting's face, `lift` m over the surface `heightAt` (display: the ground drawn is not lowered by it, a metre at most). */
export function digTriangles(dug: { cells: readonly { x: number; y: number }[]; size: number }, heightAt: (x: number, y: number) => number, lift: number) {
  const pos: number[] = [], col: number[] = [], h = dug.size / 2;
  for (const c of dug.cells) {
    const q = [[c.x - h, c.y - h], [c.x + h, c.y - h], [c.x - h, c.y + h], [c.x + h, c.y + h]].map(([x, y]) => [x, y, heightAt(x, y) + lift]);
    pos.push(...q[0], ...q[1], ...q[2], ...q[1], ...q[3], ...q[2]);
    for (let m = 0; m < 6; m++) col.push(...CUT);
  }
  return { pos, col };
}

/** the faces round a ring's platform: 1:1.5 (the drawn slopes' ratio, crossing-works.ts) out to what is drawn, at most this
 * far, m; none lower than `FACE.min` m (the platform on what is drawn there) */
const FACE = { slope: 1.5, reach: 12, min: 0.15 };
/** the most a ring is drawn towards the eye, m */
const PULL_MAX = 8;
/** how far out along an arm its road's height is read for the platform's edge, m past the ring's outer edge */
const MOUTH = 2;

/** The point `s` m from the ring's centre along an arm's line (along its direction past where its path goes). */
function armPoint(ring: RingMark, arm: RingArm, s: number) {
  const path = arm.path;
  if (path && path.length >= 2) {
    let run = 0;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k], L = Math.hypot(b.x - a.x, b.y - a.y);
      if (run + L >= s && L > 0) { const t = (s - run) / L; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
      run += L;
    }
  }
  return { x: ring.x + arm.x * s, y: ring.y + arm.y * s };
}

/** A roundabout's platform as graded (its grading is in the roundabout's lump sum: research/08): its outer edge at each
 * arm's mouth at that arm's road as drawn there, round the ring between two arms in proportion to the angle, falling or
 * rising evenly to the island's centre at the mouths' mean; beyond its outer edge a face 1:1.5 to what is drawn (a cut
 * where that is higher, a fill where lower). `height` inside the outer edge, `drawn` beyond it. */
export function ringPlatform(ring: RingMark, drawn: (x: number, y: number) => number) {
  const R = ring.r, TAU = 2 * Math.PI;
  const mouths = ring.arms.map(arm => { const p = armPoint(ring, arm, R + MOUTH); return { a: (Math.atan2(arm.y, arm.x) + TAU) % TAU, z: drawn(p.x, p.y) }; })
    .filter(m => Number.isFinite(m.z)).sort((p, q) => p.a - q.a);
  const centre = mouths.length ? mouths.reduce((t, m) => t + m.z, 0) / mouths.length : drawn(ring.x, ring.y);
  /** the outer edge's height at angle `a` */
  const edge = (a: number) => {
    if (mouths.length < 2) return centre;
    a = ((a % TAU) + TAU) % TAU;
    let k = mouths.findIndex(m => m.a > a);
    if (k < 0) k = 0;
    const next = mouths[k], prev = mouths[(k + mouths.length - 1) % mouths.length];
    const span = ((next.a - prev.a) % TAU + TAU) % TAU || TAU, t = (((a - prev.a) % TAU) + TAU) % TAU / span;
    return prev.z + (next.z - prev.z) * t;
  };
  const height = (x: number, y: number) => {
    const dx = x - ring.x, dy = y - ring.y, r = Math.hypot(dx, dy);
    if (r >= R) return edge(Math.atan2(dy, dx));
    return centre + (edge(Math.atan2(dy, dx)) - centre) * r / R;
  };
  /** the face at angle `a`: how far out it reaches past the outer edge and the height it meets there (null: none) */
  const face = (a: number) => {
    const z0 = edge(a), c = Math.cos(a), s = Math.sin(a);
    let w = 0, z = z0;
    for (let it = 0; it < 6; it++) {
      z = drawn(ring.x + (R + w) * c, ring.y + (R + w) * s);
      const next = Math.min(FACE.reach, FACE.slope * Math.abs(z - z0));
      if (Math.abs(next - w) < 0.05) { w = next; break; }
      w = next;
    }
    z = drawn(ring.x + (R + w) * c, ring.y + (R + w) * s);
    return Math.abs(z - z0) < FACE.min ? null : { w, z, cut: z > z0 };
  };
  return { height, edge, face, centre };
}

/** The ring's triangles (world x, y, z per vertex) and colours, on its platform (`ringPlatform`) over what is drawn
 * (`drawn`), `lift` m over it (the line `lift + 0.05`), the splitter islands on their arms as drawn, the platform's fill
 * faces; `pull`: how far towards the eye the ring and its islands (the first `pulled` vertices) are drawn, m (as far as
 * what is drawn inside it stands over it: the ground and the arms' bodies the platform's grading takes off). */
export function ringTriangles(ring: RingMark, drawn: (x: number, y: number) => number, lift: number) {
  const pos: number[] = [], col: number[] = [];
  const R = ring.r, outer = R, inner = R - ROUNDABOUT_RING.carriageway, island = inner - ROUNDABOUT_RING.apron;
  const platform = ringPlatform(ring, drawn);
  const surface = (x: number, y: number) => Math.hypot(x - ring.x, y - ring.y) <= R + 1e-6 ? platform.height(x, y) : drawn(x, y);
  const p = (a: number, r: number, up: number) => { const x = ring.x + r * Math.cos(a), y = ring.y + r * Math.sin(a); return [x, y, platform.height(x, y) + up]; };
  const p3 = (x: number, y: number, up: number) => [x, y, surface(x, y) + up];
  // (in rings at most 1 m wide)
  const band = (r0: number, r1: number, colour: RGB, up: number, keep: (a: number) => boolean = () => true) => {
    const rings = Math.max(1, Math.ceil((r1 - r0) / 1));
    for (let k = 0; k < SEGMENTS; k++) {
      const a0 = 2 * Math.PI * k / SEGMENTS, a1 = 2 * Math.PI * (k + 1) / SEGMENTS;
      if (!keep((a0 + a1) / 2)) continue;
      for (let j = 0; j < rings; j++) {
        const ra = r0 + (r1 - r0) * j / rings, rb = r0 + (r1 - r0) * (j + 1) / rings;
        const q = [p(a0, ra, up), p(a0, rb, up), p(a1, ra, up), p(a1, rb, up)];
        pos.push(...q[0], ...q[1], ...q[2], ...q[1], ...q[3], ...q[2]);
        for (let m = 0; m < 6; m++) col.push(...colour);
      }
    }
  };
  // (the island from its centre: a band from a radius of 0)
  band(0, island, GRASS, lift);
  band(island, inner, APRON, lift);
  band(inner, outer, ASPHALT, lift);
  // (the edge line kept clear of each arm's mouth: an arm of half width w and its flare, EDGE.mouth either side of its line)
  const r = outer - EDGE.inset - EDGE.width / 2;
  const clear = (a: number) => ring.arms.every(arm => {
    const cx = Math.cos(a) * r, cy = Math.sin(a) * r, along = cx * arm.x + cy * arm.y;
    return along <= 0 || Math.abs(-cx * arm.y + cy * arm.x) > EDGE.mouth;
  });
  band(outer - EDGE.inset - EDGE.width, outer - EDGE.inset, WHITE, lift + 0.05, clear);
  for (const arm of ring.arms) if (arm.island) islandTriangles(ring, arm, p3, pos, col, lift);
  // (what is drawn over the platform: the most it stands over it, sampled every metre; the ring drawn that much towards the
  // eye, the platform's grading cutting it off)
  let over = 0;
  for (let dx = -R; dx <= R; dx += 1) for (let dy = -R; dy <= R; dy += 1) {
    const x = ring.x + dx, y = ring.y + dy;
    if (Math.hypot(dx, dy) <= R) over = Math.max(over, drawn(x, y) - platform.height(x, y));
  }
  const pulled = pos.length / 3;
  // the fill faces round the platform where what is drawn is lower (a cut's face is under the ground drawn over it), clear
  // of the arms' roads (their mouths and splitter islands: EDGE.mouth + 2 m either side)
  const offRoads = (a: number) => ring.arms.every(arm => {
    const cx = Math.cos(a), cy = Math.sin(a);
    return cx * arm.x + cy * arm.y <= 0 || Math.abs(-cx * arm.y + cy * arm.x) * (R + 4) > EDGE.mouth + 2;
  });
  const fill = (a: number) => { const f = platform.face(a); return f && !f.cut ? f : null; };
  const faces = Array.from({ length: SEGMENTS + 1 }, (_, k) => fill(2 * Math.PI * k / SEGMENTS));
  for (let k = 0; k < SEGMENTS; k++) {
    const a0 = 2 * Math.PI * k / SEGMENTS, a1 = 2 * Math.PI * (k + 1) / SEGMENTS, f0 = faces[k], f1 = faces[k + 1];
    if (!f0 && !f1 || !offRoads((a0 + a1) / 2)) continue;
    const at = (a: number, f: typeof f0) => f ?? { w: 0, z: platform.edge(a) };
    const g0 = at(a0, f0), g1 = at(a1, f1);
    // (in strips at most 1 m wide, the face a plane from the edge out)
    const m = Math.max(1, Math.ceil(Math.max(g0.w, g1.w)));
    for (let j = 0; j < m; j++) {
      const v = (a: number, g: typeof g0, t: number) => {
        const rr = R + g.w * t, z0 = platform.edge(a);
        return [ring.x + rr * Math.cos(a), ring.y + rr * Math.sin(a), z0 + (g.z - z0) * t + lift];
      };
      const q = [v(a0, g0, j / m), v(a0, g0, (j + 1) / m), v(a1, g1, j / m), v(a1, g1, (j + 1) / m)];
      pos.push(...q[0], ...q[1], ...q[2], ...q[1], ...q[3], ...q[2]);
      for (let c = 0; c < 6; c++) col.push(...FILL);
    }
  }
  return { pos, col, pull: Math.min(PULL_MAX, over + 0.3), pulled };
}

/** The point at `s` m from the ring's centre along an arm's line and the line's unit direction there; null where the
 * arm's road ends before its splitter island would (nothing drawn past where the road goes). */
function armLine(ring: RingMark, arm: RingArm) {
  const path = arm.path;
  if (!path || path.length < 2) return null;
  const cum = [0];
  for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y));
  if (!(cum[cum.length - 1] >= ring.r + SPLITTER_ISLAND.length)) return null;
  return (s: number) => {
    let k = 1;
    while (k < path.length - 1 && cum[k] < s) k++;
    const a = path[k - 1], b = path[k], L = cum[k] - cum[k - 1] || 1, t = (s - cum[k - 1]) / L;
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ux, uy };
  };
}

/** A two-way arm's splitter island (core/tie-in.ts SPLITTER_ISLAND): from the ring's outer edge out along the arm's line,
 * as wide at the ring as its lanes' deflection opens it, narrowing to its nose; its kerb round it; the arm's mouth paved
 * as the ring, widened by as much on each side (the lanes pushed out round it). Strips at most 1 m long and wide, on the
 * surface. */
function islandTriangles(ring: RingMark, arm: RingArm, p: (x: number, y: number, up: number) => number[], pos: number[], col: number[], lift: number) {
  const line = armLine(ring, arm);
  if (!line) return;
  const I = SPLITTER_ISLAND, R = ring.r, L = I.length, tan = Math.tan(I.deflection), half = arm.half ?? 3.25;
  /** the island's half width at `s` m from the centre */
  const w = (s: number) => Math.max(I.nose / 2, (R + L - s) * tan);
  // (a strip between offsets o0(s) and o1(s) to the left of the line, s from s0 to s1)
  const strip = (s0: number, s1: number, o0: (s: number) => number, o1: (s: number) => number, colour: RGB, up: number) => {
    const n = Math.max(1, Math.ceil(s1 - s0));
    for (let k = 0; k < n; k++) {
      const sa = s0 + (s1 - s0) * k / n, sb = s0 + (s1 - s0) * (k + 1) / n, a = line(sa), b = line(sb);
      const m = Math.max(1, Math.ceil(Math.max(Math.abs(o1(sa) - o0(sa)), Math.abs(o1(sb) - o0(sb)))));
      for (let j = 0; j < m; j++) {
        const at = (q: typeof a, s: number, f: number) => { const o = o0(s) + (o1(s) - o0(s)) * f; return p(q.x - q.uy * o, q.y + q.ux * o, up); };
        const q = [at(a, sa, j / m), at(a, sa, (j + 1) / m), at(b, sb, j / m), at(b, sb, (j + 1) / m)];
        pos.push(...q[0], ...q[1], ...q[2], ...q[1], ...q[3], ...q[2]);
        for (let c = 0; c < 6; c++) col.push(...colour);
      }
    }
  };
  // the arm's mouth paved as the ring is, widened beside the island: each side out by the island's half width, back to
  // the arm's own width at its nose; the island raised a little over it, its kerb round its paving (side by side, none
  // under another: on a slope one strip's long triangles would hide the next)
  const lane = (s: number) => (R + L - s) * tan, k = I.kerb;
  // (from 1 m inside the ring's edge: its corners there reach past the circle)
  strip(R - 1, R + L, (s) => w(s), (s) => half + lane(s), ASPHALT, lift);
  strip(R - 1, R + L, (s) => -half - lane(s), (s) => -w(s), ASPHALT, lift);
  strip(R, R + L - k, (s) => w(s) - k, (s) => w(s), KERB, lift + 0.1);
  strip(R, R + L - k, (s) => -w(s), (s) => -w(s) + k, KERB, lift + 0.1);
  strip(R + L - k, R + L, (s) => -w(s), (s) => w(s), KERB, lift + 0.1);
  strip(R, R + L - k, (s) => -w(s) + k, (s) => w(s) - k, PAVING, lift + 0.1);
}
