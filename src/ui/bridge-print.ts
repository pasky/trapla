// A bridge for your desk (research/101): one landscape A4 to fold once along its middle and stand as a tent. The
// lower face is the bridge in side view over its ground, the upper face (upside down, upright once folded) the bridge
// from above over what passes under it: roads, railways, streams with their names. Both faces at one true scale,
// heights as lengths, so a long viaduct is a long thin strip and a tall one is tall. Only what the game built and
// billed is drawn: the deck, its supports (core/structures.ts pierStations), the mapped ground and ways.
import type { Result } from '../core/evaluate';
import type { Run } from '../core/structures';
import { bridgeDeckSpans } from '../render/bridge-surface';

type XY = { x: number; y: number };
export interface BridgeSheet {
  title: string;
  /** the bridge's own words: "Your bridge · km 2.23–3.72 · 1,488 m · up to 146 m high" */
  sub: string;
  r: Result; run: Run;
  /** every deck of the project over the plan's frame (both directions of a motorway): its line and half width */
  decks: { r: Result; run: Run; half: number }[];
  roads: { xy: readonly number[]; width: number; name?: string }[];
  /** `tunnel`: under ground here (drawn dashed, as from above it is not seen) */
  railways: { xy: readonly number[]; name?: string; tunnel?: boolean }[];
  water: { points: readonly (readonly number[])[]; width: number; name?: string }[];
  credit: string;
}

const W = 297, H = 210, M = 15, f = (v: number) => +v.toFixed(2);
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const poly = (pts: readonly XY[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join('');

/** The sheet as SVG in millimetres (297 × 210). */
export function bridgeSheetSvg(b: BridgeSheet): string {
  const { r, run } = b, L = run.s1 - run.s0, pad = Math.max(25, 0.06 * L);
  const sa = Math.max(0, run.s0 - pad), sb = Math.min(r.length, run.s1 + pad);
  const i0 = Math.max(0, Math.floor(sa / r.ds)), i1 = Math.min(r.n - 1, Math.ceil(sb / r.ds));
  let zmin = Infinity, zmax = -Infinity;
  for (let i = i0; i <= i1; i++) { zmin = Math.min(zmin, r.ground[i], r.grade[i]); zmax = Math.max(zmax, r.ground[i], r.grade[i]); }
  zmin -= 4;
  // one scale for both faces: the side view's length and height both fit (heights to the same scale as lengths)
  const sideH = 58, k = Math.min((W - 2 * M) / (sb - sa), sideH / (zmax - zmin + 4));
  const x0 = (W - (sb - sa) * k) / 2, base = 190;
  const X = (s: number) => x0 + (s - sa) * k, Y = (z: number) => base - (z - zmin) * k;
  // ---- the side face (lower half, upright) ----
  const ground: XY[] = [{ x: X(r.s[i0]), y: base }];
  for (let i = i0; i <= i1; i++) ground.push({ x: X(r.s[i]), y: Y(r.ground[i]) });
  ground.push({ x: X(r.s[i1]), y: base });
  const line = (a: number, c: number) => { const p: XY[] = []; for (let i = a; i <= c; i++) p.push({ x: X(r.s[i]), y: Y(r.grade[i]) }); return p; };
  const at = (s: number, arr: ArrayLike<number>) => { const u = Math.max(0, Math.min(r.n - 1, s / r.ds)), i = Math.min(r.n - 2, Math.floor(u)); return arr[i] + (u - i) * (arr[i + 1] - arr[i]); };
  // the deck as the 3D view draws it (render/bridge-surface.ts: each span's depth), the piers as the footprint places
  // them (2.4 m along the line, core/footprint.ts), its ends on the abutments
  const spans = bridgeDeckSpans(run.s0, run.s1, [...(run.pierStations ?? [])]);
  const deckTop: XY[] = [], deckBottom: XY[] = [];
  for (const sp of spans) {
    const ss = [sp.s0, ...Array.from(r.s).filter((q) => q > sp.s0 && q < sp.s1), sp.s1];
    for (const q of ss) { deckTop.push({ x: X(q), y: Y(at(q, r.grade)) }); deckBottom.unshift({ x: X(q), y: Y(at(q, r.grade) - sp.depth) }); }
  }
  const pierW = Math.max(0.3, 2.4 * k), depthAt = (q: number) => spans.find((sp) => q >= sp.s0 && q <= sp.s1)?.depth ?? 1.2;
  const piers = (run.pierStations ?? []).map((q) => { const top = Y(at(q, r.grade) - depthAt(q)), bottom = Y(at(q, r.ground));
    return `<rect x="${f(X(q) - pierW / 2)}" y="${f(top)}" width="${f(pierW)}" height="${f(Math.max(0, bottom - top))}" fill="#4d5a55"/>`; }).join('');
  const abut = (q: number, dir: 1 | -1) => { const xg = X(q), yt = Y(at(q, r.grade)), yb = Math.max(yt + 1.2, Y(at(q, r.ground)) + 0.4), w = Math.max(0.8, 3 * k);
    return `<path d="M${f(xg)} ${f(yt)}L${f(xg + dir * w)} ${f(yt)}L${f(xg + dir * w)} ${f(yb)}L${f(xg)} ${f(yb)}Z" fill="#4d5a55"/>`; };
  const side = `<path d="${poly(ground)}Z" fill="#e4e0d2" stroke="#b8b09a" stroke-width="0.3"/>
    <path d="${poly(line(i0, run.i0))}" fill="none" stroke="#8c8f88" stroke-width="0.5"/><path d="${poly(line(run.i1, i1))}" fill="none" stroke="#8c8f88" stroke-width="0.5"/>
    ${piers}${abut(run.s0, -1)}${abut(run.s1, 1)}<path d="${poly([...deckTop, ...deckBottom])}Z" fill="#1f2d29" stroke="#1f2d29" stroke-width="0.25" stroke-linejoin="round"/>`;
  // a scale bar: a round length near a fifth of the drawing
  const bar = [10, 20, 50, 100, 200, 500, 1000].reduce((p, q) => (q * k <= 0.25 * (W - 2 * M) ? q : p), 10);
  const scale = `<g transform="translate(${f(W - M - bar * k)} 201)"><path d="M0 0h${f(bar * k)}" stroke="#1f2d29" stroke-width="0.6"/><path d="M0 -1v2M${f(bar * k)} -1v2" stroke="#1f2d29" stroke-width="0.4"/>
    <text x="${f(bar * k / 2)}" y="-1.6" font-size="2.6" text-anchor="middle">${bar} m</text></g>`;
  // ---- the plan face (upper half, turned upside down for the fold) ----
  const A = { x: r.x[run.i0], y: r.y[run.i0] }, B = { x: r.x[run.i1], y: r.y[run.i1] }, chord = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  const ux = (B.x - A.x) / chord, uy = (B.y - A.y) / chord, cy = 52;
  const P = (x: number, y: number): XY => { const dx = x - A.x, dy = y - A.y; return { x: X(run.s0) + (dx * ux + dy * uy) * k, y: cy - (-dx * uy + dy * ux) * k }; };
  const flat = (xy: readonly number[]) => { const out: XY[] = []; for (let i = 0; i + 1 < xy.length; i += 2) out.push(P(xy[i], xy[i + 1])); return out; };
  const inFrame = (pts: XY[]) => pts.some((p) => p.x > M && p.x < W - M && p.y > 18 && p.y < 88);
  /** where a polyline passes nearest the deck's middle line inside the frame: its label's place */
  const labelAt = (pts: XY[]) => pts.filter((p) => p.x > M + 8 && p.x < W - M - 8 && p.y > 22 && p.y < 84).sort((p, q) => Math.abs(p.y - cy) - Math.abs(q.y - cy))[0];
  const labels: string[] = [], named = new Set<string>(), placed: XY[] = [];
  const label = (pts: XY[], name: string | undefined, color: string) => {
    if (!name || named.has(name)) return; const p = labelAt(pts);
    // named only where it passes under or beside the deck (what the card is about), once, clear of the others
    if (!p || Math.abs(p.y - cy) > Math.max(3, 40 * k)) return;
    const y = p.y < cy ? Math.max(24, p.y - 9) : Math.min(84, p.y + 11);
    if (placed.some((q) => Math.abs(q.y - y) < 3.5 && Math.abs(q.x - p.x) < 30)) return;
    named.add(name); placed.push({ x: p.x, y });
    labels.push(`<text x="${f(p.x + 1.2)}" y="${f(y)}" font-size="2.8" fill="${color}">${esc(name)}</text>`);
  };
  const roads = b.roads.map((w) => { const pts = flat(w.xy); if (!inFrame(pts)) return ''; label(pts, w.name, '#5c625e');
    return `<path d="${poly(pts)}" fill="none" stroke="#a9ada6" stroke-width="${f(Math.max(0.5, w.width * k))}" stroke-linecap="round" stroke-linejoin="round"/>`; }).join('');
  const rails = b.railways.map((w) => { const pts = flat(w.xy); if (!inFrame(pts)) return ''; label(pts, w.name, '#1f2d29');
    return w.tunnel ? `<path d="${poly(pts)}" fill="none" stroke="#6d736f" stroke-width="0.5" stroke-dasharray="1.2 1"/>`
      : `<path d="${poly(pts)}" fill="none" stroke="#1f2d29" stroke-width="0.9"/><path d="${poly(pts)}" fill="none" stroke="#fff" stroke-width="0.45" stroke-dasharray="2 2"/>`; }).join('');
  const water = b.water.map((w) => { const pts = w.points.map((p) => P(p[0], p[1])); if (!inFrame(pts)) return ''; label(pts, w.name, '#2f6f9f');
    return `<path d="${poly(pts)}" fill="none" stroke="#5b9bc8" stroke-width="${f(Math.max(0.5, w.width * k))}" stroke-linecap="round" stroke-linejoin="round"/>`; }).join('');
  const decks = b.decks.map(({ r: q, run: d, half }) => {
    const left: XY[] = [], right: XY[] = [];
    for (let i = d.i0; i <= d.i1; i++) { const nx = -q.ty[i], ny = q.tx[i]; left.push(P(q.x[i] + nx * half, q.y[i] + ny * half)); right.unshift(P(q.x[i] - nx * half, q.y[i] - ny * half)); }
    return `<path d="${poly([...left, ...right])}Z" fill="#1f2d29"/>`;
  }).join('');
  const plan = `<clipPath id="frame"><rect x="${M}" y="18" width="${W - 2 * M}" height="70"/></clipPath>
    <g clip-path="url(#frame)">${water}${roads}${rails}${decks}</g>${labels.join('')}`;
  const text = (x: number, y: number, size: number, t: string, more = '') => `<text x="${x}" y="${y}" font-size="${size}" ${more}>${esc(t)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="system-ui, 'Segoe UI', Roboto, sans-serif" fill="#1f2d29">
  <rect width="${W}" height="${H}" fill="#fff"/>
  <!-- the upper face upside down: upright once the sheet is folded along its middle and stood as a tent -->
  <g transform="rotate(180 ${W / 2} ${H / 4})">
    ${plan}
    ${text(M, 10, 5, b.title)}${text(M, 15, 2.8, 'From above: your deck dark, streams blue, roads grey, railways black and white', 'fill="#5c625e"')}
  </g>
  <path d="M6 105H${W - 6}" stroke="#b8bcb6" stroke-width="0.3" stroke-dasharray="1.5 1.5"/>
  ${text(M, 117, 5, b.title)}${text(M, 122.5, 3, b.sub, 'fill="#3c4a45"')}
  ${side}${scale}
  ${text(M, 197, 2.6, 'Side view · heights to the same scale as lengths', 'fill="#5c625e"')}
  ${text(M, 203, 2.3, b.credit, 'fill="#8a8f89"')}
</svg>`;
}

/** Print the sheet: shown alone for the print, then gone (style.css @media print). */
export function printBridgeSheet(svg: string): void {
  document.getElementById('print-sheet')?.remove();
  const sheet = document.createElement('div'); sheet.id = 'print-sheet'; sheet.innerHTML = svg;
  document.body.append(sheet); document.body.classList.add('printing');
  const done = () => { sheet.remove(); document.body.classList.remove('printing'); removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  print();
}
