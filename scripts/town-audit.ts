// Spatial calibration audit (not a hot-path component).
// npx tsx scripts/town-audit.ts design.json [map.svg]
// Map shows built-up mask, building kinds, streets, official line, noise buyouts and demolition.
import { readFileSync, writeFileSync } from 'node:fs';
import { cellLength, PART_KEYS } from '../src/core/cost';
import { evaluate } from '../src/core/evaluate';
import { KIND } from '../src/core/structures';
import { BUILTUP_BIT } from '../src/core/terrain';
import { loadPack } from './loadpack';

const { meta, scenario, terrain, buildings, roads, overlays } = loadPack();
const a = { x: meta.A.xy[0], y: meta.A.xy[1] }, b = { x: meta.B.xy[0], y: meta.B.xy[1] };
const r = evaluate({ terrain, buildings, roads, scenario, a, b }, JSON.parse(readFileSync(process.argv[2], 'utf8')).design);
// Exact test against 5 m mask cell centres in a 300 m circle. Streaming, bounded memory.
const nearTown = (x: number, y: number) => {
  const c = terrain.cell;
  for (let yy = Math.ceil((y - 300) / c - 0.5) * c + c / 2; yy <= y + 300; yy += c) {
    const dx = Math.sqrt(Math.max(0, 300 ** 2 - (yy - y) ** 2));
    for (let xx = Math.ceil((x - dx) / c - 0.5) * c + c / 2; xx <= x + dx; xx += c) {
      if (terrain.cover(xx, yy) & BUILTUP_BIT) return true;
    }
  }
  return false;
};
const bins = Object.fromEntries(['within300m', 'outside300m', 'urbanAtGrade', 'ruralAtGrade'].map(k => [k, { length: 0, total: 0, property: 0, walls: 0, crossings: 0 }]));
for (let i = 0; i < r.n; i++) {
  const near = nearTown(r.x[i], r.y[i]);
  const keys = [near ? 'within300m' : 'outside300m'];
  if (r.kind[i] === KIND.earth) {
    if (r.cell.urban[i] >= 0.5) keys.push('urbanAtGrade');
    if (!near && r.cell.urban[i] === 0) keys.push('ruralAtGrade');
  }
  for (const key of keys) {
    const v = bins[key];
    v.length += cellLength(i, r.n, r.ds);
    for (const k of PART_KEYS) v.total += r.parts[k][i];
    for (const k of ['land', 'forest', 'buildings', 'noiseBuyouts'] as const) v.property += r.parts[k][i];
    v.walls += r.parts.noiseWalls[i]; v.crossings += r.parts.crossings[i];
  }
}
console.log(process.argv[2], 'total M', (r.cost.total / 1e6).toFixed(1), r.valid ? 'VALID' : 'INVALID');
for (const [k, v] of Object.entries(bins)) console.log(k, JSON.stringify({ km: +(v.length / 1000).toFixed(3),
  totalMperKm: +(v.total / v.length / 1000).toFixed(1), beforePropertyMperKm: +((v.total - v.property) / v.length / 1000).toFixed(1),
  propertyM: +(v.property / 1e6).toFixed(1), wallsM: +(v.walls / 1e6).toFixed(1), crossingsM: +(v.crossings / 1e6).toFixed(1) }));
for (let s = 0; s < r.length; s += 1000) {
  const i0 = Math.round(s / r.ds), i1 = Math.min(r.n, Math.round((s + 1000) / r.ds));
  let total = 0, urban = 0;
  for (let i = i0; i < i1; i++) { for (const k of PART_KEYS) total += r.parts[k][i]; urban += r.cell.urban[i] * r.ds; }
  const buyouts = r.boughtOut.filter(b => b.i >= i0 && b.i < i1);
  const demolished = r.demolished.filter(b => b.i >= i0 && b.i < i1);
  console.log(`km ${s / 1000}–${s / 1000 + 1}: ${(total / 1e6).toFixed(0)}M, built-up ${urban.toFixed(0)}m, demolition ${demolished.length}, noise buyouts ${buyouts.length}`);
}
if (process.argv[3]) {
  // Fixed Trutnov / Poříčí window; all coordinates local metres. North is up.
  const places = overlays.places ?? [];
  console.log('places', JSON.stringify(places));
  const townStations = Array.from({ length: r.n }, (_, i) => i).filter(i => r.s[i] >= 2000 && r.s[i] <= 10000);
  const x0 = Math.min(...townStations.map(i => r.x[i])) - 800, x1 = Math.max(...townStations.map(i => r.x[i])) + 800;
  const y0 = Math.min(...townStations.map(i => r.y[i])) - 800, y1 = Math.max(...townStations.map(i => r.y[i])) + 800;
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${-y1} ${x1 - x0} ${y1 - y0}" width="1200" height="1400"><rect x="${x0}" y="${-y1}" width="${x1-x0}" height="${y1-y0}" fill="white"/><g transform="scale(1,-1)">`];
  for (let y = y0; y < y1; y += 25) for (let x = x0; x < x1; x += 25) if (terrain.cover(x, y) & BUILTUP_BIT) svg.push(`<rect x="${x}" y="${y}" width="25" height="25" fill="#f4e4b8"/>`);
  for (const way of overlays.net?.ways ?? []) {
    const points = [];
    for (let k = 1; k < way.length; k += 2) points.push(`${way[k]},${way[k+1]}`);
    svg.push(`<polyline points="${points.join(' ')}" fill="none" stroke="#bbb" stroke-width="5"/>`);
  }
  const gone = new Set(r.demolished.map(b => b.j)), bought = new Set(r.boughtOut.map(b => b.j));
  overlays.binfo.forEach((f: number[], j: number) => {
    if (!f || f[3] < x0 || f[3] > x1 || f[4] < y0 || f[4] > y1) return;
    const fill = gone.has(j) ? '#e22' : bought.has(j) ? '#d0c' : ['#555', '#111', '#77a', '#8aa', '#aaa'][f[2]];
    svg.push(`<rect x="${-f[5]}" y="${-f[6]}" width="${2*f[5]}" height="${2*f[6]}" transform="translate(${f[3]},${f[4]}) rotate(${f[7]})" fill="${fill}"/>`);
  });
  const line = (points: number[][], color: string, width: number) => svg.push(`<polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}"/>`);
  line(meta.official.xy, '#b98', 12);
  line(Array.from(r.x, (x, i) => [x, r.y[i]]), '#1688dd', 12);
  for (let i = 0; i < r.n; i += Math.round(1000/r.ds)) svg.push(`<g transform="translate(${r.x[i]},${r.y[i]}) scale(1,-1)"><circle r="22" fill="#1688dd"/><text x="30" y="0" font-size="65" fill="#056">${(r.s[i]/1000).toFixed(0)} km</text></g>`);
  svg.push('</g></svg>'); writeFileSync(process.argv[3], svg.join('\n'));
}
