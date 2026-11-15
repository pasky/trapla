// Immutable source topology plus separately selected candidate/accepted 3D surfaces.
// No rounded-XY connectivity, terrain substitution, or mutation of legacy RoadNet.
import type { Bounds, ProjectDesign, SourceInterval, SourceLocation, TransportSurface, XYZ } from './project';
import type { TransportGraphData, TransportRenderInterval, TransportSource, TransportSurfaceQuery } from './project-transport';
import { validateTransportGraph } from './project-transport-validation';
import { cloneProjectValue, freezeProjectValue } from './project-value';

export interface SourceSegment {
  sourceId: string; s0: number; s1: number; a: { x: number; y: number }; b: { x: number; y: number };
}
const inBounds = (a: { x: number; y: number }, b: { x: number; y: number }, bounds: Bounds) =>
  Math.max(a.x, b.x) >= bounds.minX && Math.min(a.x, b.x) <= bounds.maxX
  && Math.max(a.y, b.y) >= bounds.minY && Math.min(a.y, b.y) <= bounds.maxY;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Grid stores each segment only in cells it traverses, not its whole diagonal bounding rectangle. */
class SegmentGrid<T extends { a: { x: number; y: number }; b: { x: number; y: number } }> {
  private readonly cells = new Map<string, T[]>();
  private readonly size = 100;
  constructor(segments: Iterable<T>) {
    let entries = 0;
    for (const segment of segments) {
      const { a, b } = segment, dx = b.x - a.x, dy = b.y - a.y;
      let x = Math.floor(a.x / this.size), y = Math.floor(a.y / this.size);
      const endX = Math.floor(b.x / this.size), endY = Math.floor(b.y / this.size), sx = Math.sign(dx), sy = Math.sign(dy);
      if (![x, y, endX, endY].every(Number.isSafeInteger)) throw new Error('Unsafe transport grid coordinates');
      let tx = dx ? ((x + (sx > 0 ? 1 : 0)) * this.size - a.x) / dx : Infinity;
      let ty = dy ? ((y + (sy > 0 ? 1 : 0)) * this.size - a.y) / dy : Infinity;
      const stepX = dx ? this.size / Math.abs(dx) : Infinity, stepY = dy ? this.size / Math.abs(dy) : Infinity;
      const steps = Math.abs(endX - x) + Math.abs(endY - y) + 1;
      if (steps > 100000) throw new Error('Transport segment exceeds spatial-index budget');
      const put = (cx: number, cy: number) => {
        const key = `${cx}:${cy}`;
        let bucket = this.cells.get(key); if (!bucket) this.cells.set(key, bucket = []);
        if (++entries > 2000000) throw new Error('Transport spatial index exceeds memory budget');
        bucket.push(segment);
      };
      for (let i = 0; i < steps; i++) {
        put(x, y);
        if (x === endX && y === endY) break;
        if (Number.isFinite(tx) && Number.isFinite(ty) && Math.abs(tx - ty) <= 1e-12) {
          // Inclusive broad-phase queries must see both side cells touched at a grid corner,
          // especially mixed-sign diagonals whose canonical corner cell is not on the traversal.
          put(x + sx, y); put(x, y + sy);
          x += sx; y += sy; tx += stepX; ty += stepY;
        } else if (tx < ty) { x += sx; tx += stepX; } else { y += sy; ty += stepY; }
      }
    }
  }
  near(bounds: Bounds, visit: (segment: T) => void): void {
    if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)
      || bounds.maxX < bounds.minX || bounds.maxY < bounds.minY) throw new Error('Invalid spatial query');
    const x0 = Math.floor(bounds.minX / this.size), x1 = Math.floor(bounds.maxX / this.size);
    const y0 = Math.floor(bounds.minY / this.size), y1 = Math.floor(bounds.maxY / this.size);
    if (![x0, x1, y0, y1].every(Number.isSafeInteger)) throw new Error('Unsafe transport query coordinates');
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 100000) throw new Error('Transport query exceeds spatial-index budget');
    const seen = new Set<T>();
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (const segment of this.cells.get(`${x}:${y}`) ?? []) {
      if (seen.has(segment)) continue;
      seen.add(segment); if (inBounds(segment.a, segment.b, bounds)) visit(segment);
    }
  }
}

export class ProjectTransportIndex implements TransportSurfaceQuery {
  readonly graph: TransportGraphData;
  private readonly sources = new Map<string, TransportSource>();
  private readonly nodeUses = new Map<string, SourceLocation[]>();
  private readonly grid: SegmentGrid<SourceSegment>;
  constructor(graph: TransportGraphData, readonly transportData: string, vectorData: string,
    private readonly groundHeight: (x: number, y: number) => number) {
    const errors = validateTransportGraph(graph, vectorData);
    if (errors.length) throw new Error(errors.join('\n'));
    this.graph = freezeProjectValue(cloneProjectValue(graph));
    const segments: SourceSegment[] = [];
    for (const source of this.graph.sources) {
      this.sources.set(source.id, source);
      for (let i = 0; i < source.nodes.length; i++) {
        let uses = this.nodeUses.get(source.nodes[i]); if (!uses) this.nodeUses.set(source.nodes[i], uses = []);
        uses.push({ transportData, sourceId: source.id, s: source.stations[i] });
        if (i) segments.push({ sourceId: source.id, s0: source.stations[i - 1], s1: source.stations[i],
          a: { x: source.xy[2 * i - 2], y: source.xy[2 * i - 1] }, b: { x: source.xy[2 * i], y: source.xy[2 * i + 1] } });
      }
    }
    this.grid = new SegmentGrid(segments);
  }
  source(id: string): TransportSource | undefined { return this.sources.get(id); }
  unresolvedReason(id: string): string | null { return this.graph.unresolvedSources?.find(s => s.id === id)?.reason ?? null; }
  permits(id: string, kind: 'road' | 'motorway' | 'railway'): boolean {
    const s = this.sources.get(id);
    return !!s && s.elevation !== 'unknown' && (kind === 'railway' ? s.kind === 'railway'
      : kind === 'motorway' ? s.kind === 'road' && s.tags.highway === 'motorway'
      : s.kind === 'road' && s.tags.highway !== 'motorway' && s.tags.highway !== 'trunk');
  }
  private sample(source: TransportSource, s: number): { i: number; t: number; x: number; y: number } | null {
    const ss = source.stations;
    if (!Number.isFinite(s) || s < 0 || s > ss[ss.length - 1]) return null;
    let lo = 0, hi = ss.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >>> 1; if (ss[mid] <= s) lo = mid; else hi = mid; }
    const t = (s - ss[lo]) / (ss[lo + 1] - ss[lo]);
    return { i: lo, t, x: lerp(source.xy[2 * lo], source.xy[2 * lo + 2], t), y: lerp(source.xy[2 * lo + 1], source.xy[2 * lo + 3], t) };
  }
  position(id: string, s: number): XYZ | null {
    const source = this.sources.get(id); if (!source || source.elevation === 'unknown') return null;
    const p = this.sample(source, s); if (!p) return null;
    const z = source.elevation === 'terrain' ? this.groundHeight(p.x, p.y) : lerp(source.z[p.i], source.z[p.i + 1], p.t);
    return Number.isFinite(z) ? { x: p.x, y: p.y, z } : null;
  }
  checkInterval(interval: SourceInterval): void {
    const s = this.sources.get(interval.sourceId);
    if (interval.transportData !== this.transportData || !s || !Number.isFinite(interval.s0) || !Number.isFinite(interval.s1)
      || interval.s0 < 0 || interval.s1 <= interval.s0 || interval.s1 > s.stations[s.stations.length - 1])
      throw new Error(this.unresolvedReason(interval.sourceId) ?? 'Source interval binding is unresolved');
  }
  path(interval: SourceInterval): (XYZ & { s: number })[] {
    this.checkInterval(interval);
    const source = this.sources.get(interval.sourceId)!;
    const stations = [interval.s0, ...source.stations.filter(s => s > interval.s0 && s < interval.s1), interval.s1];
    return stations.map(s => { const p = this.position(source.id, s); if (!p) throw new Error('Source elevation is unresolved'); return { ...p, s }; });
  }
  /** Exact source-node branches, not incidental XY intersections. Includes interval boundaries. */
  branches(interval: SourceInterval): { nodeId: string; s: number; other: SourceLocation[] }[] {
    this.checkInterval(interval);
    const source = this.sources.get(interval.sourceId)!, out: { nodeId: string; s: number; other: SourceLocation[] }[] = [];
    for (let i = 0; i < source.nodes.length; i++) {
      const s = source.stations[i]; if (s < interval.s0 || s > interval.s1) continue;
      const other = (this.nodeUses.get(source.nodes[i]) ?? []).filter(u => u.sourceId !== source.id || u.s !== s);
      if (other.length) out.push({ nodeId: source.nodes[i], s, other: other.map(u => ({ ...u })) });
    }
    return out;
  }
  near(bounds: Bounds, visit: (segment: SourceSegment) => void): void { this.grid.near(bounds, visit); }
  renderIntervals(interval: SourceInterval): TransportRenderInterval[] {
    this.checkInterval(interval);
    const result: TransportRenderInterval[] = [];
    for (const r of this.sources.get(interval.sourceId)!.render) {
      const s0 = Math.max(interval.s0, r.s0), s1 = Math.min(interval.s1, r.s1); if (s1 <= s0) continue;
      const map = (s: number) => {
        let lo = 0, hi = r.correspondence.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >>> 1; if (r.correspondence[m].sourceS <= s) lo = m; else hi = m; }
        const a = r.correspondence[lo], b = r.correspondence[lo + 1];
        return { sourceS: s, renderS: lerp(a.renderS, b.renderS, (s - a.sourceS) / (b.sourceS - a.sourceS)) };
      };
      result.push({ ...r, s0, s1, correspondence: [map(s0), ...r.correspondence.filter(k => k.sourceS > s0 && k.sourceS < s1), map(s1)] });
    }
    return result;
  }
}

export interface DesignedSegment { routeId: string; s0: number; s1: number; a: XYZ; b: XYZ; halfWidth: number; structure: 'ground' | 'bridge' | 'tunnel' }
export class ProjectSurfaceIndex {
  private readonly grid: SegmentGrid<DesignedSegment>;
  private readonly surfaces = new Map<string, TransportSurface>();
  private maxWidth = 0;
  constructor(surfaces: readonly TransportSurface[]) {
    const segments: DesignedSegment[] = [];
    for (const surface of surfaces) {
      if (this.surfaces.has(surface.routeId)) throw new Error('Duplicate route surface');
      if (surface.points.length < 2) throw new Error('Designed surface needs at least two points');
      const copy = freezeProjectValue(cloneProjectValue(surface)); this.surfaces.set(copy.routeId, copy);
      for (let i = 1; i < copy.points.length; i++) {
        const a = copy.points[i - 1], b = copy.points[i];
        if (![a.s, b.s, a.x, a.y, a.z, b.x, b.y, b.z, a.halfWidth, b.halfWidth].every(Number.isFinite)
          || b.s <= a.s || a.halfWidth <= 0 || b.halfWidth <= 0) throw new Error('Invalid designed surface');
        this.maxWidth = Math.max(this.maxWidth, a.halfWidth, b.halfWidth);
        segments.push({ routeId: copy.routeId, s0: a.s, s1: b.s, a, b, halfWidth: Math.max(a.halfWidth, b.halfWidth), structure: a.structure });
      }
    }
    this.grid = new SegmentGrid(segments);
  }
  position(routeId: string, s: number): XYZ | null {
    const points = this.surfaces.get(routeId)?.points;
    if (!points || points.length < 2 || !Number.isFinite(s) || s < points[0].s || s > points[points.length - 1].s) return null;
    let lo = 0, hi = points.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >>> 1; if (points[m].s <= s) lo = m; else hi = m; }
    const a = points[lo], b = points[lo + 1], t = (s - a.s) / (b.s - a.s);
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
  }
  near(bounds: Bounds, visit: (segment: DesignedSegment) => void): void {
    this.grid.near({ minX: bounds.minX - this.maxWidth, maxX: bounds.maxX + this.maxWidth,
      minY: bounds.minY - this.maxWidth, maxY: bounds.maxY + this.maxWidth }, segment => {
      const w = segment.halfWidth;
      if (inBounds(segment.a, segment.b, { minX: bounds.minX - w, maxX: bounds.maxX + w,
        minY: bounds.minY - w, maxY: bounds.maxY + w })) visit(segment);
    });
  }
}

/** One explicit network view: candidate exclusions never leak into the authoritative accepted view. */
export class EffectiveProjectNetwork {
  readonly surfaces: ProjectSurfaceIndex;
  private readonly exclusions = new Map<string, SourceInterval[]>();
  constructor(readonly base: ProjectTransportIndex, intervals: readonly SourceInterval[], surfaces: readonly TransportSurface[]) {
    this.surfaces = new ProjectSurfaceIndex(surfaces);
    for (const interval of intervals) {
      base.checkInterval(interval);
      let list = this.exclusions.get(interval.sourceId); if (!list) this.exclusions.set(interval.sourceId, list = []);
      list.push({ ...interval });
    }
    for (const list of this.exclusions.values()) list.sort((a, b) => a.s0 - b.s0);
  }
  nearSources(bounds: Bounds, visit: (segment: SourceSegment) => void): void {
    this.base.near(bounds, segment => {
      let start = segment.s0;
      const point = (s: number) => { const t = (s - segment.s0) / (segment.s1 - segment.s0);
        return { x: lerp(segment.a.x, segment.b.x, t), y: lerp(segment.a.y, segment.b.y, t) }; };
      const emit = (s0: number, s1: number) => { if (s1 > s0) { const a = point(s0), b = point(s1); if (inBounds(a, b, bounds)) visit({ ...segment, s0, s1, a, b }); } };
      for (const i of this.exclusions.get(segment.sourceId) ?? []) {
        if (i.s1 <= start) continue; if (i.s0 >= segment.s1) break;
        emit(start, Math.min(segment.s1, i.s0)); start = Math.max(start, i.s1); if (start >= segment.s1) break;
      }
      emit(start, segment.s1);
    });
  }
}
/** Resolve jointly dependent proposed neighbours from this revision, never the previous accepted shape. */
export function projectNetworkViews(base: ProjectTransportIndex, project: ProjectDesign,
  candidateSurfaces: readonly TransportSurface[], acceptedIntervals: readonly SourceInterval[], acceptedSurfaces: readonly TransportSurface[]) {
  const claims = project.routes.flatMap(r => r.source?.binding === 'resolved' ? r.source.intervals : []);
  return { candidate: new EffectiveProjectNetwork(base, claims, candidateSurfaces),
    accepted: new EffectiveProjectNetwork(base, acceptedIntervals, acceptedSurfaces) };
}
