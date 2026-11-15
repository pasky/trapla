// One colour ramp for noise (band on the map, building colours, the building card), and the building
// card's cross-section: road and its noise source, the wall or cut edge, the house with every floor's
// level before → after, the sightline over the wall and its shadow.
import { NOISE } from '../core/data/urban';
import { edgeAttenuation, noiseBarrier, wallAttenuation, type NoiseRay, type NoiseReceiver } from '../core/noise';
import { noiseExcess, type NoiseModel } from '../core/road-noise';
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

/** every floor of a dwelling at its deciding exposure: dB over the limit without and with the wall / cut edge.
 * `wall` overrides the built height (preview). */
export function floorLevels(rec: NoiseReceiver, levels: number, model: NoiseModel, crownWidth: number, wall = rec.key?.wall ?? 0): FloorLevel[] {
  const key = rec.key;
  if (!key) return [];
  const barrier = noiseBarrier(crownWidth);
  const out: FloorLevel[] = [];
  for (let f = 0; f < levels; f++) {
    const h = key.h - (levels - 1 - f) * NOISE.storeyHeight;
    const direct = Math.hypot(key.d - NOISE.sourceOffset, h - NOISE.sourceHeight);
    const before = noiseExcess(direct, h, model);
    const after = before - Math.max(edgeAttenuation(key.d, h, key.edge), wallAttenuation(key.d, h, wall, barrier));
    out.push({ floor: f, height: h, before, after });
  }
  return out;
}

const f1 = (v: number) => v.toFixed(1);

/** the house's rectangle as the noise model measures it: centre, half length / width, m; angle, degrees */
export interface HouseRect { x: number; y: number; hl: number; hw: number; angle: number }

export type PlanRoute = Pick<Result, 'n' | 'ds' | 'length' | 's' | 'x' | 'y' | 'tx' | 'ty' | 'walls' | 'crossings' | 'noise'>;

const kmText = (s: number) => (s / 1000).toFixed(2);

/** One sentence: where the loudest noise comes from and what (fails to) stop it. */
function planCaption(worst: NoiseRay, s: number, wallNear: boolean, quiet?: { s: number; level: number }): string {
  if (quiet && quiet.level > worst.residual) return `Loudest from km ${kmText(quiet.s)}, within the limit.`;
  const from = `Loudest from km ${kmText(s)}`;
  if (worst.residual <= 1e-6) return `${from}, now within the limit.`;
  if (worst.gap) return `${from}: through the gap in the wall where the side road joins. A wall cannot close it.`;
  if (worst.wall > 0) return `${from}: over the ${f1(worst.wall).replace('.0', '')} m wall, which is too low there.`;
  if (worst.edge && worst.earth > 0) return `${from}: over the edge of the cutting, which is too low there.`;
  return `${from}: ${wallNear ? 'past the end of the wall' : 'no wall there'}.`;
}

/**
 * The house card's plan: our road (travel left → right, its left side up), walls, side roads, the house,
 * and a line from every km where the house's top floor is over the limit before walls: red = still too
 * loud from there, grey = stopped by a wall or a cutting. `preview`: a wall choice being hovered.
 */
export function noisePlan(r: PlanRoute, rect: HouseRect, rays: readonly NoiseRay[], crownWidth: number, level: number,
  preview?: { side: 'L' | 'R'; at: (i: number) => boolean; height: number }, quiet?: { s: number; level: number }): { svg: string; caption: string } | null {
  if (!rays.length) return null;
  const W = 316, Hmax = 170, pad = 12;
  let worst = rays[0], lo = Infinity, hi = -Infinity;
  for (const p of rays) { if (p.residual > worst.residual) worst = p; lo = Math.min(lo, p.i); hi = Math.max(hi, p.i); }
  // the frame: the station nearest the house, its tangent along +X, its left normal up
  let c = worst.i, best = Infinity;
  for (let i = lo; i <= hi; i++) { const q = (r.x[i] - rect.x) ** 2 + (r.y[i] - rect.y) ** 2; if (q < best) { best = q; c = i; } }
  const i0 = Math.max(0, lo - 2), i1 = Math.min(r.n - 1, hi + 2);
  const ox = r.x[c], oy = r.y[c], tx = r.tx[c], ty = r.ty[c];
  const U = (x: number, y: number) => (x - ox) * tx + (y - oy) * ty, V = (x: number, y: number) => -(x - ox) * ty + (y - oy) * tx;
  const at = (i: number, off: number) => [r.x[i] - r.ty[i] * off, r.y[i] + r.tx[i] * off];
  // a point at chainage s (between stations), as the 3D walls are drawn
  const atS = (s: number, off: number) => {
    const i = Math.min(r.n - 2, Math.max(0, Math.floor(s / r.ds))), t = (s - r.s[i]) / r.ds;
    const f = (a: ArrayLike<number>) => a[i] + t * (a[i + 1] - a[i]);
    const tx = f(r.tx), ty = f(r.ty), norm = Math.hypot(tx, ty) || 1;
    return [f(r.x) - (ty / norm) * off, f(r.y) + (tx / norm) * off];
  };
  // house corners and the nearest façade point to a source (BuildingIndex.facadeDistance)
  const a = (rect.angle * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
  const corner = (p: number, q: number) => [rect.x + ux * rect.hl * p - uy * rect.hw * q, rect.y + uy * rect.hl * p + ux * rect.hw * q];
  const corners = [corner(1, 1), corner(-1, 1), corner(-1, -1), corner(1, -1)];
  const facade = (x: number, y: number) => {
    const dx = x - rect.x, dy = y - rect.y;
    const p = Math.max(-rect.hl, Math.min(rect.hl, dx * ux + dy * uy)), q = Math.max(-rect.hw, Math.min(rect.hw, -dx * uy + dy * ux));
    return [rect.x + ux * p - uy * q, rect.y + uy * p + ux * q];
  };
  // walls per station on both sides: as built, or with the previewed choice (never in a junction opening)
  const wallOff = noiseBarrier(crownWidth).wallOffset;
  const wall = { L: new Float64Array(i1 - i0 + 1), R: new Float64Array(i1 - i0 + 1) };
  for (const w of r.walls) for (let i = Math.max(i0, w.i0); i <= Math.min(i1, w.i1); i++) wall[w.side][i - i0] = w.height;
  if (preview) for (let i = i0; i <= i1; i++) if (preview.at(i)) wall[preview.side][i - i0] = r.noise.gaps?.[preview.side][i] ? 0 : preview.height;
  // extent: the road in the window, the house, a strip beyond the far wall
  const side = worst.side === 'L' ? 1 : -1;
  let u0 = Infinity, u1 = -Infinity, v0 = -side * (wallOff + 2), v1 = v0;
  const grow = (x: number, y: number) => { const u = U(x, y), v = V(x, y); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); };
  for (let i = i0; i <= i1; i++) grow(r.x[i], r.y[i]);
  for (const [x, y] of corners) grow(x, y);
  v0 -= 2; v1 += 2;
  // a band on the far side of our road for the km labels
  const band = 14, k = Math.min((W - 2 * pad) / Math.max(1, u1 - u0), (Hmax - 2 * pad - band) / Math.max(1, v1 - v0));
  const H = Math.round((v1 - v0) * k + 2 * pad + band), left = (W - (u1 - u0) * k) / 2, top = pad + (side > 0 ? 0 : band);
  const X = (x: number, y: number) => (left + (U(x, y) - u0) * k).toFixed(1), Y = (x: number, y: number) => (top + (v1 - V(x, y)) * k).toFixed(1);
  const pt = ([x, y]: number[]) => `${X(x, y)},${Y(x, y)}`;
  const line = (pts: number[][]) => `M${pts.map(pt).join('L')}`;
  const parts: string[] = ['<defs><marker id="np-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L6,3L0,6Z" fill="#d0281e"/></marker></defs>'];
  // crossed roads (the side road of a junction among them), then our road
  for (const x of r.crossings) {
    const road = x.geometry?.road;
    if (road && road.length > 1) parts.push(`<path d="${line(road.map((p) => [p.x, p.y]))}" fill="none" stroke="#c9c2b2" stroke-width="${Math.max(2, x.geometry!.width * k).toFixed(1)}"/>`);
  }
  const axis: number[][] = [];
  for (let i = i0; i <= i1; i++) axis.push(at(i, 0));
  parts.push(`<path d="${line(axis)}" fill="none" stroke="#6b6b6b" stroke-width="${Math.max(3, crownWidth * k).toFixed(1)}"/>`);
  // walls, labelled with their height where there is room; the far side's faint (it does not screen this house)
  for (const s of ['L', 'R'] as const) {
    const h = wall[s], off = s === 'L' ? wallOff : -wallOff, near = s === worst.side;
    for (let i = 0; i < h.length; i++) {
      if (!h[i]) continue;
      let j = i;
      while (j + 1 < h.length && h[j + 1] === h[i]) j++;
      // the cells' extent, as built and billed (wallStretches)
      const pts: number[][] = [atS(Math.max(0, (i0 + i - 0.5) * r.ds), off)];
      for (let q = i; q <= j; q++) pts.push(at(i0 + q, off));
      pts.push(atS(Math.min(r.length, (i0 + j + 0.5) * r.ds), off));
      parts.push(`<path d="${line(pts)}" fill="none" stroke="#18b0b0" stroke-width="${near ? 3 : 2}"${near ? '' : ' opacity=".35"'}/>`);
      const m = at(i0 + Math.round((i + j) / 2), off + (s === 'L' ? 1 : -1) * 7 / k);
      if (near && (j - i) * (r.s[1] - r.s[0]) * k > 34) parts.push(`<text x="${X(m[0], m[1])}" y="${(Number(Y(m[0], m[1])) + 4).toFixed(1)}" class="lbl" fill="#0b5e5e" text-anchor="middle">${f1(h[i]).replace('.0', '')} m</text>`);
      i = j;
    }
  }
  // the lines from the road to the house: stopped ones first, the loudest last, with an arrow
  const order = [...rays].sort((p, q) => p.residual - q.residual);
  for (const p of order) {
    const src = at(p.i, (p.side === 'L' ? 1 : -1) * NOISE.sourceOffset), dst = facade(src[0], src[1]), top = p === worst;
    const loud = p.residual > 1e-6;
    parts.push(`<path d="${line([src, dst])}" stroke="${loud ? '#d0281e' : '#8d989c'}" stroke-width="${top ? 2.2 : 1}" opacity="${top ? 1 : loud ? 0.6 : 0.35}"${top ? ' marker-end="url(#np-arrow)"' : ''}/>`);
  }
  parts.push(`<path d="${line(corners)}Z" fill="${noiseColor(level)}" stroke="#333" stroke-width="1"/>`);
  // km at both ends of our road, beyond the far wall line
  const e0 = at(i0, -side * (wallOff + 2)), e1 = at(i1, -side * (wallOff + 2)), dy = side > 0 ? 12 : -5;
  parts.push(`<text x="${X(e0[0], e0[1])}" y="${(Number(Y(e0[0], e0[1])) + dy).toFixed(1)}" class="lbl">km ${kmText(r.s[i0])}</text>`);
  parts.push(`<text x="${X(e1[0], e1[1])}" y="${(Number(Y(e1[0], e1[1])) + dy).toFixed(1)}" class="lbl" text-anchor="end">km ${kmText(r.s[i1])} →</text>`);
  // legend in the house-side corner that the lines leave free
  if (H >= 70) {
    const ly = side > 0 ? 14 : H - 18;
    parts.push(`<path d="M6,${ly}h14" stroke="#d0281e" stroke-width="1.5"/><text x="23" y="${ly + 3}" class="lbl">too loud</text>`);
    parts.push(`<path d="M6,${ly + 12}h14" stroke="#8d989c" stroke-width="1.5" opacity=".6"/><text x="23" y="${ly + 15}" class="lbl">stopped</text>`);
  }
  let wallNear = false;
  for (const v of wall[worst.side]) if (v > 0) wallNear = true;
  return {
    svg: `<svg class="noise-plan" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Plan: our road, walls and the house, lines from where the noise comes">${parts.join('')}</svg>`,
    caption: planCaption(worst, r.s[worst.i], wallNear, quiet),
  };
}

/** the cross-section as SVG (width 316 px); `limit` in dB */
export function noiseSectionSvg(rec: NoiseReceiver, levels: number, model: NoiseModel, crownWidth: number, limit: number, at?: number): string {
  const key = rec.key;
  if (!key) return '';
  const floors = floorLevels(rec, levels, model, crownWidth);
  const barrier = noiseBarrier(crownWidth);
  const W = 316, H = 150, padL = 8, padR = 92, padT = 10, padB = 16;
  const facade = key.d + NOISE.facadeOffset, house = Math.max(8, Math.min(14, key.d * 0.25));
  const groundB = key.h - NOISE.receiverHeight - (levels - 1) * NOISE.storeyHeight; // house ground vs our road
  const top = groundB + levels * NOISE.storeyHeight;
  const xs = [0, facade + house], ys = [0, groundB, top + 1, key.wall + 1, key.edge ? key.edge.height + 1 : 0, -2];
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
  const X = (x: number) => padL + ((x - x0) / (x1 - x0)) * (W - padL - padR);
  const Y = (y: number) => padT + (1 - (y - y0) / (y1 - y0)) * (H - padT - padB);
  const parts: string[] = [];
  const half = crownWidth / 2;
  // ground: road edge → cut edge (if any) → the house
  const g: [number, number][] = [[x0, 0], [half, 0]];
  if (key.edge) g.push([key.edge.offset, key.edge.height]);
  g.push([key.d - 2, groundB], [x1, groundB]);
  parts.push(`<path d="M${g.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('L')}L${X(x1).toFixed(1)},${H}L${X(x0).toFixed(1)},${H}Z" fill="#e7dcc4" stroke="#8a7148" stroke-width="1"/>`);
  // the road and its noise source
  parts.push(`<rect x="${X(x0).toFixed(1)}" y="${(Y(0) - 3).toFixed(1)}" width="${(X(half) - X(x0)).toFixed(1)}" height="3" fill="#333"/>`);
  const sx = X(NOISE.sourceOffset), sy = Y(NOISE.sourceHeight);
  parts.push(`<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3.5" fill="#d0281e"/>`);
  // the top floor's sightline, and the wall's shadow
  const ty = Y(key.h), tx = X(key.d);
  if (key.wall > 0) {
    const wx = X(barrier.wallOffset), wy = Y(key.wall);
    const k = (wy - sy) / (wx - sx), far = X(x1);
    parts.push(`<path d="M${wx.toFixed(1)},${wy.toFixed(1)}L${far.toFixed(1)},${(wy + k * (far - wx)).toFixed(1)}L${far.toFixed(1)},${Y(y0).toFixed(1)}L${wx.toFixed(1)},${Y(y0).toFixed(1)}Z" fill="rgba(24,176,176,0.16)"/>`);
    parts.push(`<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${far.toFixed(1)}" y2="${(wy + k * (far - wx)).toFixed(1)}" stroke="#18b0b0" stroke-dasharray="3 2"/>`);
    parts.push(`<rect x="${(wx - 2).toFixed(1)}" y="${wy.toFixed(1)}" width="4" height="${(Y(0) - wy).toFixed(1)}" fill="#18b0b0" stroke="#0b5e5e"/>`);
    parts.push(`<text x="${(wx + 4).toFixed(1)}" y="${(wy + 2).toFixed(1)}" class="lbl" fill="#0b5e5e">${f1(key.wall).replace('.0', '')} m wall</text>`);
  } else if (key.gap) {
    const wx = X(barrier.wallOffset);
    parts.push(`<text x="${(wx + 4).toFixed(1)}" y="${(Y(0) - 6).toFixed(1)}" class="lbl" fill="#0b5e5e">gap: side road</text>`);
  }
  parts.push(`<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#d0281e" stroke-width="1" opacity=".7"/>`);
  // the house, floor by floor in its own colour, levels on the right
  const hx = X(facade), hw = Math.max(16, X(facade + house) - hx);
  for (const fl of floors) {
    const yb = Y(groundB + fl.floor * NOISE.storeyHeight), yt = Y(groundB + (fl.floor + 1) * NOISE.storeyHeight);
    parts.push(`<rect x="${hx.toFixed(1)}" y="${yt.toFixed(1)}" width="${hw.toFixed(1)}" height="${(yb - yt).toFixed(1)}" fill="${noiseColor(fl.after)}" stroke="#333" stroke-width=".8"/>`);
    const changed = fl.before - fl.after > 0.05;
    parts.push(`<text x="${(hx + hw + 5).toFixed(1)}" y="${((yb + yt) / 2 + 4).toFixed(1)}" class="${fl.after > 1e-6 ? 'bad' : 'ok'}">${f1(limit + fl.after)} dB${changed ? `<tspan class="was"> was ${f1(limit + fl.before)}</tspan>` : ''}</text>`);
  }
  parts.push(`<text x="${X(x0).toFixed(1)}" y="${H - 3}" class="lbl">our road${at === undefined ? '' : `, km ${kmText(at)}`}</text>`);
  parts.push(`<text x="${(hx - 2).toFixed(1)}" y="${H - 3}" class="lbl" text-anchor="end">${Math.round(key.d)} m</text>`);
  return `<svg class="noise-section" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Cross-section: road, wall, house floors with their night noise">${parts.join('')}</svg>`;
}
