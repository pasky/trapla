// One evaluation result as a few lines of text (bench + optimiser output).
import type { Result } from '../src/core/evaluate';

const M = (v: number) => (v / 1e6).toFixed(0);

export function describe(r: Result): string[] {
  const q = r.quantities, c = r.cost, km = r.length / 1000;
  const xs: Record<string, number> = {};
  for (const x of r.crossings) xs[`${x.type}:${x.cls}`] = (xs[`${x.type}:${x.cls}`] ?? 0) + 1;
  return [
    `total ${M(c.total)} M CZK = ${M(c.total / km)} M/km ${r.valid ? 'VALID' : `NOT VALID (${r.violations.length})`}`,
    `  road base ${M(c.roadBase)} | earthworks ${M(c.earthworks)} | bridges ${M(c.bridges)} | tunnels ${M(c.tunnels)} | crossings ${M(c.crossings)} | noise walls ${M(c.noiseWalls)} | other objects ${M(c.surcharge)} | land ${M(c.landDetail.land)} | forest ${M(c.landDetail.forest)} | buildings ${M(c.landDetail.buildings)} | noise buyouts ${M(c.landDetail.noiseBuyouts)}`,
    `  earth detail: ${Object.entries(c.earthDetail).map(([k, v]) => `${k} ${M(v)}`).join(', ')}`,
    `  cut ${(q.cut / 1e3).toFixed(0)}k m³ (class I/II/III ${q.cutByClass.map((v) => `${((100 * v) / Math.max(1, q.cut)).toFixed(0)} %`).join(' / ')}), fill ${(q.fill / 1e3).toFixed(0)}k m³, ${(q.cut / r.length).toFixed(0)} / ${(q.fill / r.length).toFixed(0)} m³ per m; surplus ${(q.surplus / 1e3).toFixed(0)}k, bought ${(q.deficit / 1e3).toFixed(0)}k, avg haul ${q.avgHaul.toFixed(0)} m; material value ${q.materialValue.toFixed(0)} CZK/m³`,
    `  bridges ${q.bridges} / ${q.bridgeLength.toFixed(0)} m, tunnels ${q.tunnels} / ${q.tunnelLength.toFixed(0)} m; built-up ${(q.urbanLength / 1000).toFixed(2)} km; buildings ${q.buildingsHit}; noise buyouts ${q.noiseBuyouts}; noise walls ${q.wallLength.toFixed(0)} m / ${q.wallArea.toFixed(0)} m² (D = ${q.noiseDistance.toFixed(0)} m); forest ${(q.forestArea / 1e4).toFixed(1)} ha`,
    `  crossings ${r.crossings.length} (${q.crossingsPaid} paid): ${Object.entries(xs).map(([k, v]) => `${k} ${v}`).join(', ')}`,
  ];
}
