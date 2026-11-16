// One colour ramp for noise (band on the map, building colours, the building card), and the building card's
// two drawings: the plan (where the house's noise comes from, piece by piece of road, and what stops it) and
// the cross-section at the house (road, cut or embankment, the wall where it stands, every floor's level).
import { NOISE } from '../core/data/urban';
import { dwellingLevels, type NoiseField, type NoiseRay, type NoiseReceiver } from '../core/noise';
import type { Result } from '../core/evaluate';

/** [dB relative to the limit, colour, opacity on the map band] */
export const NOISE_RAMP: [number, string, number][] = [
  [-6, '#fff4c2', 0], [-2, '#fbe27a', 0.32], [0, '#f8c22c', 0.48], [5, '#ee7a1c', 0.56], [10, '#d0281e', 0.62], [15, '#6e0026', 0.7],
];
/** building colour for "quiet" (≥ 3 dB under the limit) */
const QUIET = '#a9c98f';

const hex = (c: string) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
/** opaque colour of a level relative to the limit (buildings, the section's floors) */
export function noiseColor(db: number): string {
  if (db < -3) return QUIET;
  const stops: [number, string][] = [[-3, '#d9e38a'], [0, '#f8c22c'], [5, '#ee7a1c'], [10, '#d0281e'], [15, '#6e0026']];
  if (db >= 15) return stops[stops.length - 1][1];
  let k = 0;
  while (db > stops[k + 1][0]) k++;
  const t = (db - stops[k][0]) / (stops[k + 1][0] - stops[k][0]), a = hex(stops[k][1]), b = hex(stops[k + 1][1]);
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

export interface FloorLevel { floor: number; height: number; before: number; after: number }

/** every floor of a dwelling: dB over the limit on open ground (no walls, no cuts) and with the walls
 * `wallL/R` (as built, or a previewed choice) — the same sum the game decided with */
export function floorLevels(field: NoiseField, rec: NoiseReceiver, wallL: ArrayLike<number>, wallR: ArrayLike<number>): FloorLevel[] {
  return dwellingLevels(field, rec, wallL, wallR).map((l, floor) => ({ floor, height: l.height, before: l.raw, after: l.level }));
}

const f1 = (v: number) => v.toFixed(1);
const m1 = (v: number) => f1(v).replace('.0', '');

/** the house's rectangle as the noise model measures it: centre, half length / width, m; angle, degrees */
export interface HouseRect { x: number; y: number; hl: number; hw: number; angle: number }

export type PlanRoute = Pick<Result, 'n' | 'ds' | 'length' | 's' | 'x' | 'y' | 'tx' | 'ty' | 'crossings' | 'noise'>;

const kmText = (s: number) => (s / 1000).toFixed(2);

/** What a piece of road's noise passes on its way to the house. */
type Path = 'gap' | 'wall' | 'edge' | 'open' | 'far';
function pathOf(p: NoiseRay, side: 'L' | 'R'): Path {
  if (p.side !== side) return 'far';
  if (p.gap) return 'gap';
  if (p.wall > 0) return 'wall';
  return p.screened ? 'edge' : 'open';
}

/** One sentence: where most of the house's noise comes from and what (fails to) stop it. The place is the
 * shortest stretch of road carrying four fifths of that part (not every metre of it, which can be km). */
function planCaption(r: PlanRoute, rays: readonly NoiseRay[], side: 'L' | 'R', level: number): string {
  const share = new Map<Path, { e: number; cells: { s: number; e: number }[] }>();
  let total = 0;
  for (const p of rays) {
    const e = 10 ** (p.level / 10), k = pathOf(p, side), g = share.get(k) ?? { e: 0, cells: [] };
    g.e += e; total += e;
    if (e > 0) g.cells.push({ s: r.s[p.i], e });
    share.set(k, g);
  }
  let top: Path = 'open', best = -1;
  for (const [k, g] of share) if (g.e > best) { best = g.e; top = k; }
  const g = share.get(top)!, pct = Math.round((100 * g.e) / Math.max(1e-30, total));
  const cells = [...g.cells].sort((a, b) => a.s - b.s);
  let s0 = cells[0]?.s ?? 0, s1 = cells[cells.length - 1]?.s ?? 0;
  for (let i = 0, j = 0, sum = 0; j < cells.length; j++) {
    sum += cells[j].e;
    while (sum - cells[i].e >= 0.8 * g.e) sum -= cells[i++].e;
    if (sum >= 0.8 * g.e && cells[j].s - cells[i].s < s1 - s0) { s0 = cells[i].s; s1 = cells[j].s; }
  }
  const where = s1 - s0 < 25 ? `km ${kmText((s0 + s1) / 2)}` : `km ${kmText(s0)}–${kmText(s1)}`;
  const how = top === 'gap' ? 'through the gap in the wall where the side road joins'
    : top === 'wall' ? 'over the wall' : top === 'edge' ? 'over the edge of the cut or the road'
      : top === 'far' ? 'from the far side of the road' : 'where no wall stands';
  return `${level > 1e-6 ? 'Too loud. ' : ''}${pct} % of the noise comes ${how}, ${where}.`;
}

/**
 * The house card's plan: our road (travel left → right, its left side up), walls where they stand, side
 * roads, the house, and a line from every piece of road that adds noise to its loudest floor: red = no
 * wall or cut in the way, grey = a wall or cut takes most of it; the stronger, the bolder.
 * `walls`: wall heights per station on both sides (as built or previewed).
 */
export function noisePlan(r: PlanRoute, rect: HouseRect, rec: NoiseReceiver, rays: readonly NoiseRay[], crownWidth: number,
  level: number, walls: { L: ArrayLike<number>; R: ArrayLike<number> }): { svg: string; caption: string } | null {
  const src = r.noise.source;
  if (!rays.length || !src) return null;
  const W = 316, Hmax = 170, pad = 12;
  // the pieces that matter: the loudest ones making up 97 % of the energy
  const energy = rays.map((p) => 10 ** (p.level / 10)), order = rays.map((_, k) => k).sort((a, b) => energy[b] - energy[a]);
  const total = energy.reduce((a, b) => a + b, 0), shown: number[] = [];
  let acc = 0;
  for (const k of order) { if (acc >= 0.97 * total || shown.length >= 60) break; shown.push(k); acc += energy[k]; }
  let lo = rec.i, hi = rec.i;
  for (const k of shown) { lo = Math.min(lo, rays[k].i); hi = Math.max(hi, rays[k].i); }
  const c = rec.i;
  let i0 = Math.max(0, lo - 2), i1 = Math.min(r.n - 1, hi + 2);
  const ox = r.x[c], oy = r.y[c], tx = r.tx[c], ty = r.ty[c];
  const U = (x: number, y: number) => (x - ox) * tx + (y - oy) * ty, V = (x: number, y: number) => -(x - ox) * ty + (y - oy) * tx;
  const at = (i: number, off: number) => [r.x[i] - r.ty[i] * off, r.y[i] + r.tx[i] * off];
  const wallOff = (s: 'L' | 'R', i: number) => (s === 'L' ? src.L : src.R).wallOff[i] * (s === 'L' ? 1 : -1);
  // house corners
  const a = (rect.angle * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
  const corner = (p: number, q: number) => [rect.x + ux * rect.hl * p - uy * rect.hw * q, rect.y + uy * rect.hl * p + ux * rect.hw * q];
  const corners = [corner(1, 1), corner(-1, 1), corner(-1, -1), corner(1, -1)];
  const side = rec.side === 'L' ? 1 : -1, farOff = -side * (crownWidth / 2 + NOISE.wallEdgeOffset + 2);
  let u0 = Infinity, u1 = -Infinity, v0 = farOff, v1 = v0;
  const grow = (x: number, y: number) => { const u = U(x, y), v = V(x, y); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); };
  for (let i = i0; i <= i1; i++) { grow(r.x[i], r.y[i]); const [wx, wy] = at(i, wallOff(rec.side, i)); grow(wx, wy); }
  for (const [x, y] of corners) grow(x, y);
  v0 -= 2; v1 += 2;
  const band = 14, Hmin = 120;
  let k = Math.min((W - 2 * pad) / Math.max(1, u1 - u0), (Hmax - 2 * pad - band) / Math.max(1, v1 - v0));
  if ((v1 - v0) * k + 2 * pad + band < Hmin) {
    // a long stretch beside a near house: at least Hmin tall, the road cut to what fits around the house (lines
    // from farther pieces come in over the edge)
    k = (Hmin - 2 * pad - band) / Math.max(1, v1 - v0);
    const span = (W - 2 * pad) / k, hu = U(rec.x, rec.y);
    let a = Math.max(u0, hu - span / 2), b = Math.min(u1, a + span);
    a = Math.max(u0, b - span);
    u0 = a; u1 = b;
    while (i0 < c && U(r.x[i0], r.y[i0]) < u0) i0++;
    while (i1 > c && U(r.x[i1], r.y[i1]) > u1) i1--;
  }
  const H = Math.round((v1 - v0) * k + 2 * pad + band), left = (W - (u1 - u0) * k) / 2, top = pad + (side > 0 ? 0 : band);
  const X = (x: number, y: number) => (left + (U(x, y) - u0) * k).toFixed(1), Y = (x: number, y: number) => (top + (v1 - V(x, y)) * k).toFixed(1);
  const pt = ([x, y]: number[]) => `${X(x, y)},${Y(x, y)}`;
  const line = (pts: number[][]) => `M${pts.map(pt).join('L')}`;
  const parts: string[] = [];
  for (const x of r.crossings) {
    const road = x.geometry?.road;
    if (road && road.length > 1) parts.push(`<path d="${line(road.map((p) => [p.x, p.y]))}" fill="none" stroke="#c9c2b2" stroke-width="${Math.max(2, x.geometry!.width * k).toFixed(1)}"/>`);
  }
  const axis: number[][] = [];
  for (let i = i0; i <= i1; i++) axis.push(at(i, 0));
  parts.push(`<path d="${line(axis)}" fill="none" stroke="#6b6b6b" stroke-width="${Math.max(3, crownWidth * k).toFixed(1)}"/>`);
  // walls where they stand (crown edge, deck edge or cut top), labelled where there is room; the far side faint
  for (const s of ['L', 'R'] as const) {
    const h = walls[s], near = s === rec.side;
    for (let i = i0; i <= i1; i++) {
      if (!h[i]) continue;
      let j = i;
      while (j + 1 <= i1 && h[j + 1] === h[i]) j++;
      const pts: number[][] = [];
      for (let q = i; q <= j; q++) pts.push(at(q, wallOff(s, q)));
      if (pts.length === 1) { const p = pts[0], d = [r.tx[i] * r.ds / 2, r.ty[i] * r.ds / 2]; pts.splice(0, 1, [p[0] - d[0], p[1] - d[1]], [p[0] + d[0], p[1] + d[1]]); }
      parts.push(`<path d="${line(pts)}" fill="none" stroke="#18b0b0" stroke-width="${near ? 3 : 2}"${near ? '' : ' opacity=".35"'}/>`);
      // the label on the longer part beside the house, not in front of it
      const mid = rec.i >= i && rec.i <= j ? Math.round(rec.i - i > j - rec.i ? (i + rec.i) / 2 : (rec.i + j) / 2) : Math.round((i + j) / 2);
      const m = at(mid, wallOff(s, mid) + (s === 'L' ? 1 : -1) * 7 / k);
      if (near && (j - i) * r.ds * k > 34) parts.push(`<text x="${X(m[0], m[1])}" y="${(Number(Y(m[0], m[1])) + 4).toFixed(1)}" class="lbl" fill="#0b5e5e" text-anchor="middle">${m1(h[i])} m</text>`);
      i = j;
    }
  }
  // lines from the pieces of road to the house: faint ones first, the loudest last with an arrow
  const strongest = energy[shown[0]] || 1;
  for (const q of [...shown].reverse()) {
    const p = rays[q], src0 = at(p.i, 0), dst = [rec.x, rec.y], rel = energy[q] / strongest;
    const open = pathOf(p, rec.side) === 'open' || p.gap, topRay = q === shown[0];
    parts.push(`<path d="${line([src0, dst])}" stroke="${open ? '#d0281e' : '#8d989c'}" stroke-width="${(0.6 + 1.8 * Math.sqrt(rel)).toFixed(1)}" opacity="${(0.25 + 0.75 * rel).toFixed(2)}"${topRay ? ' marker-end="url(#np-arrow)"' : ''}/>`);
  }
  parts.push(`<path d="${line(corners)}Z" fill="${noiseColor(level)}" stroke="#333" stroke-width="1"/>`);
  const e0 = at(i0, farOff), e1 = at(i1, farOff), dy = side > 0 ? 12 : -5;
  parts.push(`<text x="${X(e0[0], e0[1])}" y="${(Number(Y(e0[0], e0[1])) + dy).toFixed(1)}" class="lbl">km ${kmText(r.s[i0])}</text>`);
  parts.push(`<text x="${X(e1[0], e1[1])}" y="${(Number(Y(e1[0], e1[1])) + dy).toFixed(1)}" class="lbl" text-anchor="end">km ${kmText(r.s[i1])} →</text>`);
  if (H >= 70) {
    const ly = side > 0 ? 14 : H - 18;
    parts.push(`<path d="M6,${ly}h14" stroke="#d0281e" stroke-width="1.5"/><text x="23" y="${ly + 3}" class="lbl">nothing in the way</text>`);
    parts.push(`<path d="M6,${ly + 12}h14" stroke="#8d989c" stroke-width="1.5" opacity=".6"/><text x="23" y="${ly + 15}" class="lbl">wall or cut in the way</text>`);
  }
  return {
    svg: `<svg class="noise-plan" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Plan: our road, walls and the house, lines from where the noise comes"><defs><marker id="np-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L6,3L0,6Z" fill="#d0281e"/></marker></defs>${parts.join('')}</svg>`,
    caption: planCaption(r, rays, rec.side, level),
  };
}

/**
 * The cross-section at the house (its nearest station): the road and its noise source, the ground as built
 * (cut slope up to its top edge, or the embankment), the wall where it stands, the house with every floor
 * coloured by its level (before → after), the sightline from the road over the wall or edge to the loudest
 * floor. `wall`: the height standing there (as built or previewed).
 */
export function noiseSectionSvg(r: Pick<Result, 's' | 'grade' | 'noise'>, rec: NoiseReceiver, floors: FloorLevel[], crownWidth: number,
  limit: number, wall: number, at?: number): string {
  const src = r.noise.source;
  if (!src || !floors.length) return '';
  const i = rec.i, side = rec.side === 'L' ? src.L : src.R;
  const W = 316, H = 150, padL = 8, padR = 106, padT = 10, padB = 16;
  const half = crownWidth / 2, d = rec.d, house = Math.max(8, Math.min(14, d * 0.25));
  const groundB = rec.ground - src.grade[i]; // house ground vs our road
  const levels = floors.length, topY = groundB + levels * NOISE.storeyHeight;
  const edgeOff = side.edgeOff[i], edgeTop = side.edgeTop[i], cut = edgeOff === edgeOff && edgeTop > 0;
  const wOff = side.wallOff[i], wFoot = side.wallFoot[i];
  const xs = [0, d + house], ys = [0, groundB, topY + 1, wall > 0 ? wFoot + wall + 1 : 0, cut ? edgeTop + 1 : 0, -2];
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
  const X = (x: number) => padL + ((x - x0) / (x1 - x0)) * (W - padL - padR);
  const Y = (y: number) => padT + (1 - (y - y0) / (y1 - y0)) * (H - padT - padB);
  const parts: string[] = [];
  // ground as built: crown, the cut slope to its top edge (or the embankment edge), then on to the house
  const g: [number, number][] = [[x0, 0], [half, 0]];
  if (cut) g.push([edgeOff, edgeTop]);
  else if (groundB < -0.5) g.push([Math.min(d - 2, half + 2 * -groundB), groundB]);
  g.push([Math.max(d - 2, (g[g.length - 1][0]) + 0.5), groundB], [x1, groundB]);
  parts.push(`<path d="M${g.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('L')}L${X(x1).toFixed(1)},${H}L${X(x0).toFixed(1)},${H}Z" fill="#e7dcc4" stroke="#8a7148" stroke-width="1"/>`);
  parts.push(`<rect x="${X(x0).toFixed(1)}" y="${(Y(0) - 3).toFixed(1)}" width="${(X(half) - X(x0)).toFixed(1)}" height="3" fill="#333"/>`);
  const sx = X(0), sy = Y(NOISE.barrierSourceHeight);
  parts.push(`<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3.5" fill="#d0281e"/>`);
  // the loudest floor and the line to it over the highest thing in the way
  let loud = floors[0];
  for (const f of floors) if (f.after > loud.after) loud = f;
  const ty = Y(loud.height), tx = X(d);
  const top = wall > 0 ? { x: wOff, y: wFoot + wall } : cut ? { x: edgeOff, y: edgeTop } : null;
  if (top) {
    const wx = X(top.x), wy = Y(top.y), k = (wy - sy) / (wx - sx), far = X(x1);
    parts.push(`<path d="M${wx.toFixed(1)},${wy.toFixed(1)}L${far.toFixed(1)},${(wy + k * (far - wx)).toFixed(1)}L${far.toFixed(1)},${Y(y0).toFixed(1)}L${wx.toFixed(1)},${Y(y0).toFixed(1)}Z" fill="rgba(24,176,176,0.16)"/>`);
    parts.push(`<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${far.toFixed(1)}" y2="${(wy + k * (far - wx)).toFixed(1)}" stroke="#18b0b0" stroke-dasharray="3 2"/>`);
  }
  if (wall > 0) {
    const wx = X(wOff), wy = Y(wFoot + wall), wb = Y(wFoot);
    parts.push(`<rect x="${(wx - 2).toFixed(1)}" y="${wy.toFixed(1)}" width="4" height="${(wb - wy).toFixed(1)}" fill="#18b0b0" stroke="#0b5e5e"/>`);
    // its label clear of the house (≈ 5.4 px per character at 10 px)
    const label = `${m1(wall)} m wall${cut && wOff >= edgeOff - 0.01 ? ' on the cut' : ''}`;
    const lw = label.length * 5.4, house = X(d + NOISE.facadeOffset) - 2;
    // beside it towards the house, else towards the road, else above its top shifted clear of the house
    const [lx, ly] = wx + 4 + lw < house ? [wx + 4, wy + 2] : wx - 4 - lw > 0 ? [wx - 4 - lw, wy + 2] : [Math.max(2, Math.min(wx + 4, house - lw)), wy - 4];
    parts.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" class="lbl" fill="#0b5e5e">${label}</text>`);
  } else if (side.gap[i]) {
    parts.push(`<text x="${(X(wOff) + 4).toFixed(1)}" y="${(Y(0) - 6).toFixed(1)}" class="lbl" fill="#0b5e5e">gap: side road</text>`);
  }
  parts.push(`<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#d0281e" stroke-width="1" opacity=".7"/>`);
  const hx = X(d + NOISE.facadeOffset), hw = Math.max(16, X(d + NOISE.facadeOffset + house) - hx);
  for (const fl of floors) {
    const yb = Y(groundB + fl.floor * NOISE.storeyHeight), yt = Y(groundB + (fl.floor + 1) * NOISE.storeyHeight);
    parts.push(`<rect x="${hx.toFixed(1)}" y="${yt.toFixed(1)}" width="${hw.toFixed(1)}" height="${(yb - yt).toFixed(1)}" fill="${noiseColor(fl.after)}" stroke="#333" stroke-width=".8"/>`);
    const changed = fl.before - fl.after > 0.05;
    parts.push(`<text x="${(hx + hw + 5).toFixed(1)}" y="${((yb + yt) / 2 + 4).toFixed(1)}" class="${fl.after > 1e-6 ? 'bad' : 'ok'}">${f1(limit + fl.after)} dB${changed ? `<tspan class="was"> was ${f1(limit + fl.before)}</tspan>` : ''}</text>`);
  }
  parts.push(`<text x="${X(x0).toFixed(1)}" y="${H - 3}" class="lbl">our road${at === undefined ? '' : `, km ${kmText(at)}`}</text>`);
  parts.push(`<text x="${(hx - 2).toFixed(1)}" y="${H - 3}" class="lbl" text-anchor="end">${Math.round(d)} m</text>`);
  return `<svg class="noise-section" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Cross-section: road, wall, house floors with their noise">${parts.join('')}</svg>`;
}
