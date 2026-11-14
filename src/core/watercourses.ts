// Independent watercourse geometry: roads/land-cover drawing order cannot erase a stream.
import { STRUCTURE_RULES } from './data/prices';
import type { FootprintCell, Segment2 } from './footprint-geometry';
export interface WaterSegment extends Segment2 { reach: WaterReach; j: number }
import { BOX_SIZES, CULVERT_RULES as R, PIPE_SIZES } from './data/culverts';

export interface WaterReach {
  id: number;
  kind: 'stream' | 'river' | 'ditch' | 'canal';
  width: number | null;
  points: number[][];
  catchmentKm2: number[];
  truncated: boolean[];
}
/** Study-stage full ribbon width where OSM supplies no measured width. */
export function waterWidth(reach: Pick<WaterReach, 'kind' | 'width'>): number {
  return reach.width ?? (reach.kind === 'river' ? 5 : 0.5);
}
export interface WaterData { version: 1; method: string; reaches: WaterReach[] }
export interface WaterCrossing {
  s: number; x: number; y: number; id: number; waterKind: WaterReach['kind'];
  width: number; catchmentKm2: number; truncated: boolean;
  /** Absolute sine of road/channel angle. Length = road footprint / sine. */
  sine: number;
  /** Channel tangent at the intersection; preserves the actual barrel direction through bends. */
  channelTx?: number; channelTy?: number;
}
export interface WaterSize {
  type: 'pipe' | 'box' | 'bridge'; width: number; height: number;
  q100: number; capacity: number; perM: number; head: number; minHeight: number;
  naturalBed: boolean;
}
export interface WaterResult extends WaterCrossing {
  i: number; bed: number; h: number; q100: number; structure: 'pipe' | 'box' | 'bridge' | 'tunnel' | 'blocked';
  opening: string; length: number; cost: number; requiredBridge: boolean;
}

/** No area-only law is a validated Czech Q100 estimator. Keep this explicitly provisional. */
export function estimateQ100(c: Pick<WaterCrossing, 'catchmentKm2' | 'truncated'>): number {
  return R.runoff * Math.max(R.unknownArea, c.catchmentKm2) ** R.areaExponent
    * (c.truncated ? R.truncatedFlowFactor : 1);
}
export function barrelLength(c: Pick<WaterCrossing, 'sine'>, footprint: number): number {
  return footprint / Math.max(0.01, c.sine);
}
/** Oriented barrel corridor, not a circle: a connected dog-leg is not part of a straight
 * priced culvert. Half-station margins are sampling heuristics; real extensions bill the end gap.
 * Legacy raster crossings lack a tangent and assume the same perpendicular crossing as pricing. */
export interface BarrelEnvelope extends FootprintCell { flare: number; raster: boolean }
export function barrelEnvelope(c: WaterCrossing, left: number, right: number, ds: number, routeTx: number, routeTy: number): BarrelEnvelope {
  const cos = Math.sqrt(Math.max(0, 1 - c.sine ** 2));
  const tx = c.channelTx ?? routeTx * cos - routeTy * c.sine;
  const ty = c.channelTy ?? routeTy * cos + routeTx * c.sine;
  const sign = -tx * routeTy + ty * routeTx >= 0 ? 1 : -1;
  const offset = (left - right) / 2 / Math.max(0.01, c.sine) * sign;
  return { x: c.x + tx * offset, y: c.y + ty * offset, s: c.s, i: 0, tx, ty,
    along: (barrelLength(c, left + right) + ds) / 2, left: ds / 2, right: ds / 2,
    // PROVISIONAL chord tolerance for modest OSM channel bends; still rejects side dog-legs.
    flare: Math.tan(20 * Math.PI / 180), raster: c.id < 0 };
}
export function barrelContains(p: { x: number; y: number }, b: BarrelEnvelope, pad = 0): boolean {
  const dx = p.x - b.x, dy = p.y - b.y;
  if (b.raster) return Math.hypot(dx, dy) <= b.along + pad; // no channel tangent in legacy pixels
  const along = Math.abs(dx * b.tx + dy * b.ty), across = Math.abs(-dx * b.ty + dy * b.tx);
  return along <= b.along + pad && across <= b.left + pad + along * b.flare;
}
/** Clip against the two convex halves of the flared corridor. Return separate intervals:
 * taking their hull would silently own a dog-leg crossing the narrow waist. */
export function barrelIntervals(segment: Segment2, b: BarrelEnvelope): [number, number][] {
  const dx = segment.ax - b.x, dy = segment.ay - b.y;
  const u = dx * b.tx + dy * b.ty, v = -dx * b.ty + dy * b.tx;
  const du = (segment.bx - segment.ax) * b.tx + (segment.by - segment.ay) * b.ty;
  const dv = -(segment.bx - segment.ax) * b.ty + (segment.by - segment.ay) * b.tx;
  const out: [number, number][] = [];
  for (const side of [-1, 1]) {
    let lo = 0, hi = 1;
    for (const [value, slope, max] of [[-side * u, -side * du, 0], [side * u, side * du, b.along],
      [v - side * u * b.flare, dv - side * du * b.flare, b.left], [-v - side * u * b.flare, -dv - side * du * b.flare, b.right]]) {
      if (Math.abs(slope) < 1e-10) { if (value > max) { hi = -1; break; } }
      else if (slope > 0) hi = Math.min(hi, (max - value) / slope);
      else lo = Math.max(lo, (max - value) / slope);
    }
    if (hi > lo + 1e-9) out.push([segment.d + lo * segment.length, segment.d + hi * segment.length]);
  }
  return out;
}
/** An assembly includes TWO ends, not an arbitrary "excess" beyond an unmeasured norm allowance. */
export function waterSize(c: WaterCrossing, footprint: number): WaterSize {
  const q100 = estimateQ100(c), length = barrelLength(c, footprint);
  const naturalBed = c.waterKind === 'stream' && (c.catchmentKm2 >= R.naturalBedArea || c.width >= 1.5);
  if (c.waterKind !== 'river' && !naturalBed && length <= R.maxPipeLength) {
    for (const p of PIPE_SIZES) {
      const capacity = Math.PI * p.width ** 2 / 4 * R.pipeFlowShare * R.velocity;
      // DN1000 minimum for long barrels is our conservative class-I game floor.
      if (p.width < c.width || (length > 15 && p.width < 1) || capacity < q100) continue;
      return { type: 'pipe', ...p, height: p.width, capacity, q100, minHeight: p.width + R.cover, naturalBed };
    }
  }
  if (c.waterKind !== 'river' && length <= R.maxBoxLength) {
    for (const p of BOX_SIZES) {
      const bank = naturalBed ? R.dryBank : 0;
      const capacity = (p.width - bank) * p.height * R.boxDepthShare * R.velocity;
      if (p.width < c.width + bank || capacity < q100) continue;
      return { type: 'box', ...p, capacity, q100, minHeight: p.height + R.cover, naturalBed };
    }
  }
  const width = Math.max(c.width + 2 * R.bridgeBanks, q100 / (R.velocity * 2) + 2 * R.bridgeBanks);
  return { type: 'bridge', width, height: 2, q100, capacity: Infinity, perM: 0, head: 0, minHeight: STRUCTURE_RULES.riverClearance, naturalBed };
}
/** Per-crossing sizing cache for a profile search. Width only changes the three length tests;
 * Q100, opening and prices are otherwise constant. Lifetime is one evaluation, not a mutable pack. */
export function waterSizer(c: WaterCrossing): (footprint: number) => WaterSize {
  const sizes: WaterSize[] = [];
  return (footprint) => {
    const length = barrelLength(c, footprint);
    const key = (length > 15 ? 1 : 0) | (length > R.maxPipeLength ? 2 : 0) | (length > R.maxBoxLength ? 4 : 0);
    return sizes[key] ?? (sizes[key] = waterSize(c, footprint));
  };
}
export function culvertCost(c: WaterCrossing, footprint: number): number {
  const size = waterSize(c, footprint);
  return size.type === 'bridge' ? 0 : barrelLength(c, footprint) * size.perM + 2 * size.head;
}
export function waterOpening(size: WaterSize): string {
  return size.type === 'pipe' ? `DN${Math.round(size.width * 1000)}` : `${size.width.toFixed(1)} × ${size.height.toFixed(1)} m`;
}

/** Bounded segment buckets; no road × network Cartesian-product arrays. */
export class WaterNet {
  /** Largest channel half-width for conservative local footprint/support queries. */
  readonly maxHalfWidth: number = 0;
  // Nested numeric keys avoid per-query coordinate strings without packing coordinates into a
  // finite-width key (negative and widely separated synthetic coordinates remain distinct).
  private buckets = new Map<number, Map<number, WaterSegment[]>>();
  private distances = new Map<number, number[]>();
  private components = new Map<number, number>();
  constructor(readonly data: WaterData) {
    if (data.version !== 1) throw new Error('Unsupported watercourse pack');
    // OSM way IDs are editing boundaries, not distinct physical channels. Shared vertices join
    // split ways/confluences, including an endpoint meeting another way's interior vertex.
    const parent = data.reaches.map((_, i) => i), vertices = new Map<string, number>();
    const root = (i: number): number => {
      while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
      return i;
    };
    data.reaches.forEach((w, i) => {
      for (const p of w.points) {
        const key = `${p[0].toFixed(3)},${p[1].toFixed(3)}`, other = vertices.get(key);
        if (other !== undefined) parent[root(i)] = root(other);
        else vertices.set(key, i);
      }
    });
    data.reaches.forEach((w, i) => this.components.set(w.id, root(i)));
    for (const reach of data.reaches) {
      this.maxHalfWidth = Math.max(this.maxHalfWidth, waterWidth(reach) / 2);
      const distances = [0];
      for (let j = 1; j < reach.points.length; j++) distances.push(distances[j - 1] + Math.hypot(reach.points[j][0] - reach.points[j - 1][0], reach.points[j][1] - reach.points[j - 1][1]));
      this.distances.set(reach.id, distances);
    }
    for (const reach of data.reaches) for (let j = 0; j + 1 < reach.points.length; j++) {
      const a = reach.points[j], b = reach.points[j + 1];
      const segment: WaterSegment = { reach, j, ax: a[0], ay: a[1], bx: b[0], by: b[1],
        d: this.distances.get(reach.id)![j], length: Math.hypot(b[0] - a[0], b[1] - a[1]) };
      for (let x = Math.floor(Math.min(a[0], b[0]) / 100); x <= Math.floor(Math.max(a[0], b[0]) / 100); x++)
        for (let y = Math.floor(Math.min(a[1], b[1]) / 100); y <= Math.floor(Math.max(a[1], b[1]) / 100); y++) {
          let column = this.buckets.get(x);
          if (!column) this.buckets.set(x, column = new Map());
          const bucket = column.get(y);
          if (bucket) bucket.push(segment); else column.set(y, [segment]);
        }
    }
  }
  nearSegments(bounds: readonly number[], visit: (segment: WaterSegment) => void): void {
    const [x0, y0, x1, y1] = bounds, seen = new Set<WaterSegment>();
    for (let x = Math.floor(x0 / 100); x <= Math.floor(x1 / 100); x++)
      for (let y = Math.floor(y0 / 100); y <= Math.floor(y1 / 100); y++)
        for (const segment of this.buckets.get(x)?.get(y) ?? []) {
          if (seen.has(segment)) continue;
          seen.add(segment);
          if (Math.max(segment.ax, segment.bx) < x0 || Math.min(segment.ax, segment.bx) > x1
            || Math.max(segment.ay, segment.by) < y0 || Math.min(segment.ay, segment.by) > y1) continue;
          visit(segment);
        }
  }
  reachDistances(id: number): readonly number[] | undefined { return this.distances.get(id); }
  connected(a: number, b: number): boolean {
    return a === b || (this.components.has(a) && this.components.get(a) === this.components.get(b));
  }
  /** Channels intercepted by a station's normal section, including parallel channels that never
   * cross the centreline. Bounded local buckets, not a full route×network product. */
  section(x: number, y: number, tx: number, ty: number, left: number, right: number): { id: number; x: number; y: number }[] {
    const radius = Math.max(left, right), out: { id: number; x: number; y: number }[] = [], seen = new Set<string>();
    for (let cx = Math.floor((x - radius) / 100); cx <= Math.floor((x + radius) / 100); cx++)
      for (let cy = Math.floor((y - radius) / 100); cy <= Math.floor((y + radius) / 100); cy++)
        for (const { reach: w, j } of this.buckets.get(cx)?.get(cy) ?? []) {
          const key = `${w.id}:${j}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const a = w.points[j], b = w.points[j + 1], dx = b[0] - a[0], dy = b[1] - a[1];
          const den = dx * tx + dy * ty;
          if (Math.abs(den) < 1e-9) continue; // channel lies along this normal; a crossing handles it
          const t = -((a[0] - x) * tx + (a[1] - y) * ty) / den;
          if (t < 0 || t > 1) continue;
          const px = a[0] + t * dx, py = a[1] + t * dy;
          const off = -(px - x) * ty + (py - y) * tx;
          if (off <= left && off >= -right) out.push({ id: w.id, x: px, y: py });
        }
    return out;
  }
  intersections(n: number, s: ArrayLike<number>, x: ArrayLike<number>, y: ArrayLike<number>): WaterCrossing[] {
    const out: WaterCrossing[] = [];
    for (let i = 0; i + 1 < n; i++) {
      const dx = x[i + 1] - x[i], dy = y[i + 1] - y[i], seen = new Set<string>();
      for (let cx = Math.floor(Math.min(x[i], x[i + 1]) / 100); cx <= Math.floor(Math.max(x[i], x[i + 1]) / 100); cx++)
        for (let cy = Math.floor(Math.min(y[i], y[i + 1]) / 100); cy <= Math.floor(Math.max(y[i], y[i + 1]) / 100); cy++) {
          for (const { reach: w, j } of this.buckets.get(cx)?.get(cy) ?? []) {
            const key = `${w.id}:${j}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const a = w.points[j], b = w.points[j + 1], wx = b[0] - a[0], wy = b[1] - a[1];
            const den = dx * wy - dy * wx;
            if (Math.abs(den) < 1e-9) continue;
            const ex = a[0] - x[i], ey = a[1] - y[i];
            const t = (ex * wy - ey * wx) / den, u = (ex * dy - ey * dx) / den;
            if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;
            // Neighbour max avoids false precision at a resampled catchment jump.
            out.push({ s: s[i] + t * (s[i + 1] - s[i]), x: x[i] + t * dx, y: y[i] + t * dy,
              id: w.id, waterKind: w.kind, width: waterWidth(w),
              catchmentKm2: Math.max(w.catchmentKm2[j], w.catchmentKm2[j + 1]),
              truncated: w.truncated[j] || w.truncated[j + 1], sine: Math.abs(den) / (Math.hypot(dx, dy) * Math.hypot(wx, wy)),
              channelTx: wx / Math.hypot(wx, wy), channelTy: wy / Math.hypot(wx, wy) });
          }
        }
    }
    out.sort((a, b) => a.s - b.s);
    // Coincident OSM way endpoints share one physical crossing, not two heads/assemblies.
    const unique: WaterCrossing[] = [];
    for (const c of out) {
      const prev = unique[unique.length - 1];
      if (prev && Math.abs(prev.s - c.s) < 0.1) {
        prev.catchmentKm2 = Math.max(prev.catchmentKm2, c.catchmentKm2);
        prev.truncated ||= c.truncated;
        prev.width = Math.max(prev.width, c.width);
        if (c.waterKind === 'river') prev.waterKind = 'river';
      } else unique.push(c);
    }
    return unique;
  }
}
