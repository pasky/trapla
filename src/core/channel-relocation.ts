// Minor open-channel realignment outside the construction footprint. Sourced components form a
// measured BOQ; endpoints stay on the real reach, and incompatible levels/topology reject the option.
import { channelAssembly, CHANNEL_RULES as R, REMEDY_RATES } from './data/remedies';
import { ROAD_CLASSES } from './data/urban';
import { PRICES } from './data/prices';
import { landPerM2 } from './cost';
import { NORM_CAP_I, NORM_CAP_II } from './ground';
import { cellBounds, clipFootprint, FootprintGrid, insideFootprint, touchesFootprint, type FootprintCell } from './footprint-geometry';
import type { FootprintConflict } from './footprint';
import type { CrossingPoint } from './crossings';
import { estimateQ100, waterWidth, type WaterCrossing, type WaterReach } from './watercourses';
import { protectedRasterCells } from './protected-raster';
import { BUILTUP_BIT, OOB_BIT, type Terrain } from './terrain';
import type { RoadNet } from './roadnet';

export interface ChannelRoute {
  n: number; ds: number; s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>;
  tx: ArrayLike<number>; ty: ArrayLike<number>; dayL: ArrayLike<number>; dayR: ArrayLike<number>;
}
export interface ChannelHit { reach: WaterReach; a: number; b: number; i0: number; i1: number }
export interface ChannelRelocation {
  id: number; a: number; b: number; i0: number; i1: number;
  conflict: FootprintConflict;
}

/** Check all excavation corners and any no-data pixels touched by the bank. Chords are
 * short and bank cuts bounded; stream local pixels rather than allocating a raster product. */
function bankIsOob(terrain: Terrain, cell: FootprintCell): boolean {
  for (const along of [-cell.along, cell.along]) for (const across of [-cell.right, cell.left]) {
    if (terrain.isOob(cell.x + cell.tx * along - cell.ty * across, cell.y + cell.ty * along + cell.tx * across)) return true;
  }
  const step = terrain.cell, pad = step / Math.SQRT2;
  const [x0, y0, x1, y1] = cellBounds(cell, pad);
  const r0 = Math.max(0, Math.floor((terrain.height - y1) / step)), r1 = Math.min(terrain.ny - 1, Math.floor((terrain.height - y0) / step));
  const c0 = Math.max(0, Math.floor(x0 / step)), c1 = Math.min(terrain.nx - 1, Math.floor(x1 / step));
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
    if ((terrain.lc[row * terrain.nx + col] & OOB_BIT)
      && insideFootprint({ x: (col + 0.5) * step, y: terrain.height - (row + 0.5) * step }, cell, pad)) return true;
  }
  return false;
}

export function planChannelRelocations(r: ChannelRoute, terrain: Terrain, roads: RoadNet | undefined,
  hits: readonly ChannelHit[], water: readonly WaterCrossing[]): ChannelRelocation[] {
  const candidates = hits.filter(h => h.reach.kind !== 'river' && waterWidth(h.reach) <= 5
    && !water.some(c => c.id === h.reach.id)); // keep centreline barrels intact; no overlapping channel/crossing assembly
  if (!candidates.length) return [];
  const cells: FootprintCell[] = Array.from({ length: r.n }, (_, i) => ({ i, s: r.s[i], x: r.x[i], y: r.y[i], tx: r.tx[i], ty: r.ty[i],
    along: r.ds / 2, left: r.dayL[i], right: r.dayR[i] }));
  const grid = new FootprintGrid(cells), out: ChannelRelocation[] = [];
  for (const hit of candidates) {
    const reach = hit.reach, distances = terrain.watercourses?.reachDistances(reach.id);
    if (!distances || distances.length < 2) continue;
    const area = Math.max(...reach.catchmentKm2), q100 = estimateQ100({ catchmentKm2: area, truncated: reach.truncated.some(Boolean) });
    if (q100 > 10) continue; // larger water works need a separately designed flood/ecological solution
    const assembly = channelAssembly(waterWidth(reach), q100);
    // Reserve the whole excavated bank, not just the wet channel. Five metres is the bounded
    // additional bank cut considered here; actual quantities use the measured ground difference.
    const pad = assembly.topWidth / 2 + R.sideSlope * R.maxAdditionalCut + R.setback;
    const reachLength = 200 + 2 * Math.max(r.dayL[hit.i0], r.dayR[hit.i0], r.dayL[hit.i1], r.dayR[hit.i1]) + 2 * pad;
    let start = Math.max(0, hit.a - reachLength), end = Math.min(distances[distances.length - 1], hit.b + reachLength);
    const at = (d: number) => {
      let lo = 0, hi = distances.length - 1;
      while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (distances[m] <= d) lo = m; else hi = m; }
      const t = (d - distances[lo]) / (distances[hi] - distances[lo] || 1), a = reach.points[lo], b = reach.points[hi];
      return { x: a[0] + t * (b[0] - a[0]), y: a[1] + t * (b[1] - a[1]) };
    };
    const bankPad = assembly.topWidth / 2 + R.setback;
    for (let attempt = 0; attempt < 4 && grid.hits(at(start), bankPad) && start > 0; attempt++) start = Math.max(0, start - 200);
    for (let attempt = 0; attempt < 4 && grid.hits(at(end), bankPad) && end < distances[distances.length - 1]; attempt++) end = Math.min(distances[distances.length - 1], end + 200);
    // Reject incomplete source topology before allocating/draping hundreds of trial samples.
    if (grid.hits(at(start), bankPad) || grid.hits(at(end), bankPad)) continue;
    const original: CrossingPoint[] = [], path: CrossingPoint[] = [];
    for (let j = 1; j < reach.points.length; j++) {
      const a = Math.max(start, distances[j - 1]), b = Math.min(end, distances[j]);
      if (b <= a) continue;
      const p = reach.points[j - 1], q = reach.points[j], length = distances[j] - distances[j - 1];
      const count = Math.max(2, Math.ceil((b - a) / 5));
      for (let k = original.length ? 1 : 0; k <= count; k++) {
        const d = a + (b - a) * k / count, t = (d - distances[j - 1]) / length;
        const x = p[0] + t * (q[0] - p[0]), y = p[1] + t * (q[1] - p[1]), ground = terrain.heightAt(x, y);
        original.push({ x, y, ground, z: ground - assembly.depth, d, surface: 'terrain' });
        const shifted = { x, y };
        for (let attempt = 0; attempt < 12; attempt++) {
          const c = grid.near(shifted).find(c => insideFootprint(shifted, c, pad));
          if (!c) break;
          const off = -(shifted.x - c.x) * c.ty + (shifted.y - c.y) * c.tx;
          const target = off >= 0 ? c.left + pad + 0.25 : -c.right - pad - 0.25;
          shifted.x -= c.ty * (target - off); shifted.y += c.tx * (target - off);
        }
        const g = terrain.heightAt(shifted.x, shifted.y);
        path.push({ ...shifted, ground: g, z: g - assembly.depth, surface: 'terrain' });
      }
    }
    if (path.length < 3 || path.length > 2000 || grid.interior(original[0]) || grid.interior(original[original.length - 1])) continue;
    const moved = path.map((p, i) => Math.hypot(p.x - original[i].x, p.y - original[i].y) > 0.25);
    const first = moved.indexOf(true), last = moved.lastIndexOf(true);
    if (first < 0) continue;
    const lo = Math.max(0, first - 1), hi = Math.min(path.length - 1, last + 1);
    path.splice(hi + 1); original.splice(hi + 1); path.splice(0, lo); original.splice(0, lo);
    if (grid.interior(original[0]) || grid.interior(original[original.length - 1])) continue;
    path[0] = { ...original[0] }; path[path.length - 1] = { ...original[original.length - 1] };
    const lengths = [0];
    for (let j = 1; j < path.length; j++) lengths.push(lengths[j - 1] + Math.hypot(path[j].x - path[j - 1].x, path[j].y - path[j - 1].y));
    const length = lengths[lengths.length - 1], drop = path[path.length - 1].z - path[0].z;
    if (!length || Math.abs(drop) / length > 0.03) continue; // provisional lined-channel grade limit; no unpriced drop structures
    let invalid = false, cost = 0, excavation = 0, landCost = 0;
    let previousHalf = assembly.topWidth / 2, maxWidth = assembly.topWidth;
    for (let j = 0; j < path.length; j++) {
      const p = path[j]; p.z = path[0].z + drop * lengths[j] / length;
      const additional = p.ground - p.z - assembly.depth;
      if (additional < -0.3 || additional > R.maxAdditionalCut) invalid = true; // no invented raised aqueduct/levee
      if (invalid) break; // a rejected candidate cannot become feasible later in the path
      const currentHalf = assembly.topWidth / 2 + R.sideSlope * Math.max(0, additional);
      // A descending cut must not use only the narrower downstream bank for the whole chord.
      const bankHalf = Math.max(previousHalf, currentHalf);
      previousHalf = currentHalf; maxWidth = Math.max(maxWidth, 2 * bankHalf);
      if (!j) continue;
      const a = path[j - 1], len = lengths[j] - lengths[j - 1], x = (a.x + p.x) / 2, y = (a.y + p.y) / 2;
      if (len < 1e-6) continue;
      const g = terrain.groundAt(x, y), depth = assembly.depth + Math.max(0, additional);
      const mix = g.normMix ? [NORM_CAP_I, NORM_CAP_II - NORM_CAP_I, 1 - NORM_CAP_II] :
        [Math.min(depth, g.classIto) / depth, Math.max(0, Math.min(depth, g.classIIto) - g.classIto) / depth, Math.max(0, depth - g.classIIto) / depth];
      const price = channelAssembly(waterWidth(reach), q100, mix, Math.max(0, additional));
      cost += len * price.perM; excavation += len * price.excavation;
      landCost += len * (price.topWidth + R.bankRestorationWidth) * landPerM2(terrain.cover(x, y) & BUILTUP_BIT ? 1 : 0);
      const cell: FootprintCell = { x, y, i: hit.i0, s: r.s[hit.i0], tx: (p.x - a.x) / len, ty: (p.y - a.y) / len,
        along: len / 2, left: bankHalf, right: bankHalf };
      if (bankIsOob(terrain, cell)) invalid = true;
      // The row helper already pads half a pixel. Complete that to the half-diagonal so
      // rotated banks cannot miss a protected pixel corner between centreline samples.
      const extra = terrain.cell * (Math.SQRT2 - 1) / 2;
      protectedRasterCells(terrain, { ...cell, along: cell.along + extra, left: bankHalf + extra, right: bankHalf + extra }, () => { invalid = true; });
      for (let k = 0, count = Math.max(1, Math.ceil(len / 2.5)); k <= count; k++) {
        const t = k / count, q = { x: a.x + t * (p.x - a.x), y: a.y + t * (p.y - a.y) };
        if (grid.hits(q, bankHalf + R.setback)) invalid = true;
      }
      // A new channel cannot cut an existing road without another bridge/culvert. Real tie-in
      // tails are unchanged and keep their existing crossings, so query only displaced chords.
      if (Math.hypot(p.x - original[j].x, p.y - original[j].y) > 0.25 || Math.hypot(a.x - original[j - 1].x, a.y - original[j - 1].y) > 0.25) {
        roads?.nearSegments(cellBounds(cell, 14), road => {
          const half = ROAD_CLASSES[road.cls].width / (road.cls === 'motorway' ? 4 : 2);
          if (touchesFootprint(road, cell, half)) invalid = true;
        });
        terrain.watercourses?.nearSegments(cellBounds(cell, terrain.watercourses.maxHalfWidth), other => {
          if (other.reach.id === reach.id || other.length <= 0) return;
          const otherHalf = waterWidth(other.reach) / 2, overlap = clipFootprint(other, cell, otherHalf);
          if (!overlap) return;
          const dx = other.bx - other.ax, dy = other.by - other.ay;
          const endpoints = overlap.map(d => ({ x: other.ax + (d - other.d) / other.length * dx, y: other.ay + (d - other.d) / other.length * dy }));
          const radius = bankHalf + otherHalf + 0.05;
          const existingTie = [original[0], original[original.length - 1]].some(tie => {
            const t = Math.max(0, Math.min(1, ((tie.x - other.ax) * dx + (tie.y - other.ay) * dy) / (other.length ** 2)));
            return Math.hypot(tie.x - other.ax - t * dx, tie.y - other.ay - t * dy) < 0.05
              && endpoints.every(p => Math.hypot(p.x - tie.x, p.y - tie.y) <= radius);
          });
          if (!existingTie) invalid = true; // no unpriced new confluence/crossing
        });
      }
      if (invalid) break;
    }
    if (invalid) continue;
    const removedStart = original[0].d!, removedEnd = original[original.length - 1].d!;
    // Do not strand a tributary on a backfilled old reach. A confluence relocation needs its
    // own connected-channel design; the caller retains the wall/bridge alternative instead.
    for (let j = 1; j < original.length; j++) {
      const a = original[j - 1], b = original[j], lo = Math.max(a.d!, removedStart + 0.1), hi = Math.min(b.d!, removedEnd - 0.1);
      if (hi <= lo) continue;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), t = ((lo + hi) / 2 - a.d!) / (b.d! - a.d!);
      if (len < 1e-6) continue;
      const cell: FootprintCell = { x: a.x + t * dx, y: a.y + t * dy, tx: dx / len, ty: dy / len,
        along: (hi - lo) / 2, left: 0.05, right: 0.05, i: hit.i0, s: r.s[hit.i0] };
      terrain.watercourses?.nearSegments(cellBounds(cell), other => {
        if (other.reach.id !== reach.id && other.length > 0 && touchesFootprint(other, cell)) invalid = true;
      });
      if (invalid) break;
    }
    if (invalid) continue;
    const filled = Math.min(excavation, (removedEnd - removedStart) * assembly.area);
    cost += filled * PRICES.fillPlacing; // reuse excavated soil to close the old channel, not free earth placement
    cost -= filled * REMEDY_RATES.loosePlacement; // reused soil is not also put in a stockpile
    cost += landCost;
    const i = hit.i0, conflict: FootprintConflict = { id: `channel:${reach.id}:${hit.a.toFixed(1)}`, feature: 'stream', action: 'channel-relocation', i,
      s0: Math.max(0, r.s[hit.i0] - r.ds / 2), s1: Math.min(r.s[r.n - 1], r.s[hit.i1] + r.ds / 2), x: path[Math.floor(path.length / 2)].x, y: path[Math.floor(path.length / 2)].y,
      length, affectedLength: hit.b - hit.a, cost, landCost, geometry: { road: path, width: maxWidth, schematic: false },
      original,
      detail: `The stream gets ${length.toFixed(0)} m of new stone-lined bed outside our earthworks (${assembly.bottom.toFixed(1)} m wide at the bottom, ${assembly.depth.toFixed(1)} m deep, sized for a 100-year flood of ${q100.toFixed(1)} m³/s); the old bed is filled in.`,
      source: 'Excavation and haul up to 1 km, stone lining, filter, bank restoration, old-bed backfill and land (OTSKP 124731/831/931, 46451, 28997, 18221, 18242, 17120)' };
    out.push({ id: reach.id, a: removedStart, b: removedEnd, i0: hit.i0, i1: hit.i1, conflict });
  }
  return out;
}
