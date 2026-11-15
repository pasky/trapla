// One colour ramp for noise (band on the map, building colours, the building card), and the building
// card's cross-section: road and its noise source, the wall or cut edge, the house with every floor's
// level before → after, the sightline over the wall and its shadow.
import { NOISE } from '../core/data/urban';
import { edgeAttenuation, noiseBarrier, wallAttenuation, type NoiseReceiver } from '../core/noise';
import { noiseExcess, type NoiseModel } from '../core/road-noise';

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

/** the cross-section as SVG (width 316 px); `limit` in dB */
export function noiseSectionSvg(rec: NoiseReceiver, levels: number, model: NoiseModel, crownWidth: number, limit: number): string {
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
  parts.push(`<text x="${X(x0).toFixed(1)}" y="${H - 3}" class="lbl">our road</text>`);
  parts.push(`<text x="${(hx - 2).toFixed(1)}" y="${H - 3}" class="lbl" text-anchor="end">${Math.round(key.d)} m</text>`);
  return `<svg class="noise-section" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Cross-section: road, wall, house floors with their night noise">${parts.join('')}</svg>`;
}
