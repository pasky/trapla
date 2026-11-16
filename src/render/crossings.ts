// Physical, depth-tested crossing roads. Geometry is built only on a worker result, and only for
// surfaces whose inputs changed (a drag usually moves a few of ~40 crossings; see SurfaceKey).
import * as THREE from 'three';
import type { CrossingPoint } from '../core/crossings';
import type { Result } from '../core/evaluate';
import type { FootprintConflict } from '../core/footprint';
import { endCollars, groundSegment, hasCrossingPath, turnaroundSurfaces, type CrossingSurface } from './crossing-surface';
import { existingRoadColor } from './landcover';
import type { View } from './view';
import { EW_KIND } from './terrainMaterial';
import { collarPoint } from './earthwork-surface';
import { footprintContains } from './ground-footprint';
import { finish, type Staged } from './slices';
import type { RouteSurfaceContext } from './route-surfaces';

/** linear-space colour components per hex (THREE.Color converts sRGB on every construction) */
const colorCache = new Map<number, THREE.Color>();
const linear = (hex: number) => { let c = colorCache.get(hex); if (!c) colorCache.set(hex, c = new THREE.Color(hex)); return c; };

/** 64-bit FNV-style hash of everything a surface's meshes are built from, numbers to 1 mm:
 * an unchanged crossing (to well below a pixel) keeps its meshes across evaluations. */
class SurfaceKey {
  private a = 0x811c9dc5; private b = 0x9747b28c;
  num(v: number | undefined) {
    const q = v === undefined ? 0x7fffffff : Number.isFinite(v) ? Math.round(v * 1000) | 0 : 0x7ffffffe;
    this.a = Math.imul(this.a ^ q, 16777619);
    this.b = Math.imul(this.b ^ q, 0x5bd1e995); this.b ^= this.b >>> 15;
  }
  str(v: string | undefined) { if (v === undefined) this.num(undefined); else { this.num(v.length); for (let i = 0; i < v.length; i++) this.num(v.charCodeAt(i) / 1000); } }
  point(p: CrossingPoint) { this.num(p.x); this.num(p.y); this.num(p.z); this.num(p.ground); this.num(p.d); this.str(p.surface); this.str(p.support); this.str(p.connection); }
  get key() { return (this.a >>> 0).toString(36) + ':' + (this.b >>> 0).toString(36); }
}
function surfaceKey(s: CrossingSurface): string {
  const h = new SurfaceKey(), c = s.crossing, g = c.geometry!;
  h.str(c.type); h.str(c.cls); h.num(g.width); h.num(g.deck?.depth); h.num(g.turnaroundRadius);
  h.num(g.turnarounds?.length); for (const p of g.turnarounds ?? []) h.point(p);
  h.num(s.link ? 1 : 0); h.num(s.retainingSupport ? 1 : 0); h.str(s.tie?.cls); h.num(s.tie?.width); h.num(s.deck?.start); h.num(s.deck?.end);
  h.num(s.path.length); if (s.path.length) h.point(s.path[0]);
  h.num(s.sections.length);
  for (const q of s.sections) {
    h.point(q.p); h.num(q.nx); h.num(q.ny);
    for (const k of [0, 1] as const) { h.point(q.edge[k]); h.point(q.toe[k]); h.point(q.outer[k]); const w = q.wallTop?.[k]; if (w) h.point(w); else h.num(undefined); }
  }
  return h.key;
}

class MeshBuilder {
  pos: number[] = []; col: number[] = []; elev: number[] = []; ink: number[] = []; indices: number[] = [];
  kinds: number[] = []; geo: number[] = [];
  groundHoles: { center: { x: number; y: number }; radius: number }[] = [];
  /** our road's earthworks: its own slopes and collars stand there, a crossed road's ground must not */
  insideEarthworks?: (x: number, y: number) => boolean;
  private scratch = new THREE.Vector3();
  /** vertex of a point object at a lift (positions-only builders share them between quads) */
  private shared = new Map<number, Map<CrossingPoint, number>>();
  /** `positionsOnly`: for the terrain material, which reads nothing but `position` (its shading
   * and normals come from the height texture), so its vertices can be shared between quads */
  constructor(private view: View, readonly positionsOnly = false) {}
  vertex(p: CrossingPoint, color: number, ink = 0, lift = .08,
    kind: number = ink ? (color === 0xe3d27e ? EW_KIND.fill : EW_KIND.cut) : EW_KIND.structure) {
    const v = this.view.local(p.x, p.y, p.z + lift, this.scratch), i = this.pos.length / 3;
    this.pos.push(v.x, v.y, v.z);
    if (this.positionsOnly) return i;
    const c = linear(color);
    this.col.push(c.r, c.g, c.b); this.elev.push(p.z); this.ink.push(ink);
    const geology = this.view.crossingGeology?.(p.x,p.y,p.z);
    this.kinds.push(kind); this.geo.push(geology ? geology[0] : -3, geology ? geology[1] : -3, p.d ?? 0);
    return i;
  }
  quad(a: CrossingPoint, b: CrossingPoint, c: CrossingPoint, d: CrossingPoint, color: number, ink = 0, lift = .08, kind?: number) {
    // Existing replacement collars must not cover a level turning disk in cut. Drop
    // touching cells; the disk's own 20 m natural collar covers the small outside remainder.
    // A crossed road's natural-ground collar running beside our earthworks would cut through our
    // slopes in teeth (cells half over them): drop the cells that reach into them.
    if (this.insideEarthworks && [a, b, c, d].some(p => this.insideEarthworks!(p.x, p.y))) return;
    const polygon = this.groundHoles.length ? [a,b,d,c] : [];
    if (this.groundHoles.length && this.groundHoles.some(({ center: p, radius: r }) => {
      if (p.x+r < Math.min(a.x,b.x,c.x,d.x) || p.x-r > Math.max(a.x,b.x,c.x,d.x) ||
        p.y+r < Math.min(a.y,b.y,c.y,d.y) || p.y-r > Math.max(a.y,b.y,c.y,d.y)) return false;
      let inside = false;
      for (let i = 0, j = 3; i < 4; j = i++) {
        const u = polygon[j], v = polygon[i], dx = v.x-u.x, dy = v.y-u.y;
        const t = Math.max(0,Math.min(1,((p.x-u.x)*dx+(p.y-u.y)*dy)/(dx*dx+dy*dy || 1)));
        if (Math.hypot(p.x-u.x-t*dx,p.y-u.y-t*dy) < r) return true;
        if ((u.y > p.y) !== (v.y > p.y) && p.x < (v.x-u.x)*(p.y-u.y)/(v.y-u.y)+u.x) inside = !inside;
      }
      return inside;
    })) return;
    if (this.positionsOnly) {
      let byPoint = this.shared.get(lift);
      if (!byPoint) this.shared.set(lift, byPoint = new Map());
      const va = this.sharedVertex(byPoint, a, lift), vb = this.sharedVertex(byPoint, b, lift);
      const vc = this.sharedVertex(byPoint, c, lift), vd = this.sharedVertex(byPoint, d, lift);
      this.indices.push(va, vb, vc, vb, vd, vc);
      return;
    }
    const va = this.vertex(a, color, ink, lift, kind), vb = this.vertex(b, color, ink, lift, kind);
    const vc = this.vertex(c, color, ink, lift, kind), vd = this.vertex(d, color, ink, lift, kind);
    this.indices.push(va, vb, vc, vb, vd, vc);
  }
  private sharedVertex(byPoint: Map<CrossingPoint, number>, p: CrossingPoint, lift: number) {
    let k = byPoint.get(p);
    if (k === undefined) byPoint.set(p, k = this.vertex(p, 0, 0, lift));
    return k;
  }
  *geometries() {
    // Spatially consecutive strips: bounded chunks let close views cull distant crossings.
    // A single route-wide ground mesh submitted every fine collar triangle at every zoom.
    const remap = new Int32Array(this.pos.length / 3).fill(-1);
    for (let start = 0; start < this.indices.length; start += 12288) {
      const sources: number[] = [], end = Math.min(this.indices.length, start + 12288), indices = new Uint32Array(end - start);
      for (let j = start; j < end; j++) {
        const old = this.indices[j];
        if (remap[old] < 0) { remap[old] = sources.length; sources.push(old); }
        indices[j - start] = remap[old];
      }
      for (const old of sources) remap[old] = -1;
      const g = new THREE.BufferGeometry();
      const attributes = [['position', this.pos, 3], ['color', this.col, 3], ['elev', this.elev, 1], ['ink', this.ink, 1], ['ewKind', this.kinds, 1], ['ewGeo', this.geo, 3]] as const;
      for (const [name, values, size] of this.positionsOnly ? attributes.slice(0, 1) : attributes) {
        const array = new Float32Array(sources.length*size);
        for (let i = 0; i < sources.length; i++) for (let k = 0, old = sources[i]; k < size; k++) array[i*size+k] = values[old*size+k];
        g.setAttribute(name, new THREE.BufferAttribute(array,size));
      }
      g.setIndex(new THREE.BufferAttribute(sources.length > 65535 ? indices : Uint16Array.from(indices), 1));
      if (!this.positionsOnly) g.computeVertexNormals();
      g.computeBoundingSphere(); yield g;
    }
  }
}
type CrossingInput = Pick<Result, 'crossings' | 'grade' | 'ground'> & { footprintConflicts?: readonly FootprintConflict[] };

export class CrossingRenderer {
  private group = new THREE.Group();
  /** meshes of each crossing surface by its input key (see surfaceKey), reused while unchanged */
  private surfaces = new Map<string, THREE.Object3D[]>();
  /** per-result objects: turning heads, underpass boxes, conflict annotations */
  private misc: THREE.Object3D[] = [];
  /** shared by every crossing mesh for the renderer's life (a new material per result costs a
   * program lookup and, once the last user is disposed, a shader recompile) */
  private materials: { ground: THREE.Material; earth: THREE.Material; structure: THREE.Material } | null = null;
  constructor(private view: View) { this.group.name = 'crossing-roads'; view.world.add(this.group); }
  setResult(r: CrossingInput) { finish(this.build(r)).commit(); }
  /**
   * Builds the crossing meshes for `view.crossingSurfaces` in steps (see View.buildResult)
   * without touching the scene, staged for commit() or dispose(). Surfaces whose key is unchanged
   * keep their meshes. Abandoning the generator disposes what it built.
   */
  *build(r: CrossingInput, context?: RouteSurfaceContext): Generator<void, Staged> {
    const surfaces = context?.surfaces ?? this.view.crossingSurfaces;
    const neighbours = context?.neighbours ?? surfaces;
    const replacement = context?.replacementHeight ?? ((x: number, y: number) => this.view.replacementHeight(x, y));
    const allHeads = turnaroundSurfaces(neighbours,(x,y) => this.view.groundHeight(x,y));
    const insideEarthworks = context?.groundFootprints?.length ? footprintContains(context.groundFootprints) : undefined;
    const ownGeometry = new Set(surfaces.map(s => s.crossing.geometry));
    const heads = allHeads.filter(head => ownGeometry.has(head.crossing.geometry));
    const materials = this.materials ??= { ground: this.view.crossingGroundMaterial(), earth: this.view.crossingEarthMaterial(), structure: this.view.crossingEarthMaterial() };
    const fresh: THREE.Object3D[] = [];
    let handedOver = false, settled = false;
    const dispose = () => { if (!settled) { settled = true; this.dispose3D(fresh, false); } };
    /** meshes of finished builders, one geometry chunk per step */
    const emit = function* (earth: MeshBuilder, terrain: MeshBuilder, structure: MeshBuilder, into: THREE.Object3D[]): Generator<void, void> {
      for (const [builder, material, name] of [[terrain, materials.ground, 'crossing-terrain'],
        [earth, materials.earth, 'crossing-earthworks'], [structure, materials.structure, 'crossing-decks']] as const) {
        if (!builder.indices.length) continue;
        for (const geometry of builder.geometries()) {
          const mesh = new THREE.Mesh(geometry, material); mesh.name = name; into.push(mesh); fresh.push(mesh);
          yield;
        }
      }
    };
    // A surface's meshes depend on its own inputs, on the shared ground blend (View.groundBlend:
    // every ground corridor reaches its toe width + 12.5 m) wherever its collars sample it (its
    // outer collar edge, end collars 18 m beyond) and on the turning heads (cells under a disk are
    // dropped). Its key covers all of these.
    const headKey = new SurfaceKey();
    for (const head of allHeads) { headKey.num(head.center.x); headKey.num(head.center.y); headKey.num(head.radius); }
    // Keys hash every collar point: computed once per surface (neighbours include the own ones) and
    // a few surfaces per slice (a long route has hundreds).
    const keys = new Map<CrossingSurface, string>();
    for (const s of [...surfaces, ...neighbours]) if (!keys.has(s)) { keys.set(s, surfaceKey(s)); if (keys.size % 16 === 0) yield; }
    const own = surfaces.map(s => keys.get(s)!), neighbourKeys = neighbours.map(s => keys.get(s)!);
    const sample = surfaces.map(s => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of s.sections) for (const p of [q.outer[0], q.outer[1], q.toe[0], q.toe[1], q.p]) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      const m = 18 + 1;
      return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
    });
    const reach = neighbours.map(s => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, width = 0;
      for (const q of s.sections) {
        x0 = Math.min(x0, q.p.x); y0 = Math.min(y0, q.p.y); x1 = Math.max(x1, q.p.x); y1 = Math.max(y1, q.p.y);
        for (const t of q.toe) width = Math.max(width, Math.hypot(t.x - q.p.x, t.y - q.p.y));
      }
      const m = width + 12.5 + 1;
      return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
    });
    const next = new Map<string, THREE.Object3D[]>(), misc: THREE.Object3D[] = [];
    try {
      for (let k = 0; k < surfaces.length; k++) {
        const b = sample[k], near: string[] = [];
        reach.forEach((o, j) => { if (neighbours[j] !== surfaces[k] && o.x0 <= b.x1 && o.x1 >= b.x0 && o.y0 <= b.y1 && o.y1 >= b.y0) near.push(neighbourKeys[j]); });
        const ground = context?.groundFootprints?.filter(o => o.x0 <= b.x1 && o.x1 >= b.x0 && o.y0 <= b.y1 && o.y1 >= b.y0)
          .map(o => o.key).sort() ?? [];
        let key = `${own[k]}|${near.sort().join(',')}|${allHeads.length ? headKey.key : ''}|${ground.join(';')}`;
        while (next.has(key)) key += '+';
        const kept = this.surfaces.get(key);
        if (kept) { next.set(key, kept); continue; }
        const earth = new MeshBuilder(this.view), terrain = new MeshBuilder(this.view, true), structure = new MeshBuilder(this.view);
        terrain.groundHoles = allHeads; terrain.insideEarthworks = insideEarthworks;
        yield* this.surface(surfaces[k], earth, terrain, structure, replacement);
        const meshes: THREE.Object3D[] = [];
        yield* emit(earth, terrain, structure, meshes);
        next.set(key, meshes);
      }
      const earth = new MeshBuilder(this.view), terrain = new MeshBuilder(this.view, true), structure = new MeshBuilder(this.view);
      for (const c of r.crossings) if (c.type === 'underpass' && c.geometry?.underpass && c.geometry.road) this.underpass(c.geometry.road, c.geometry.underpass, structure);
      for (const head of heads) {
        terrain.groundHoles = allHeads.filter(other => other !== head);
        const color = existingRoadColor(head.crossing.cls), center = earth.vertex(head.center,color,0,.12,EW_KIND.crown);
        for (let j = 0; j < head.sections.length; j++) {
          const a = head.sections[j], b = head.sections[(j+1)%head.sections.length];
          const roadPoint = (p: typeof a.day): CrossingPoint => ({ ...head.center, ...p });
          earth.indices.push(center,earth.vertex(roadPoint(a.edge),color,0,.12,EW_KIND.crown),earth.vertex(roadPoint(b.edge),color,0,.12,EW_KIND.crown));
          // Paid exposed rim: vertical support from the level disk to true natural ground.
          const rim = (p: typeof a.day, lift: number) => roadPoint({ ...p, z: p.z+lift });
          structure.quad(rim(a.edge,.12),rim(a.day,.015),rim(b.edge,.12),rim(b.day,.015),0xb7b4a9,0,0);
          const collar = (s: typeof a, t: number) => roadPoint(collarPoint(s,t,
            (x,y) => this.view.groundHeight(x,y),replacement));
          for (let k = 0; k < 8; k++) terrain.quad(collar(a,k/8),collar(a,(k+1)/8),collar(b,k/8),collar(b,(k+1)/8),0xffffff,0,.015);
        }
        yield;
      }
      yield* emit(earth, terrain, structure, misc);
      const annotations: THREE.Object3D[] = [];
      this.conflicts(r.footprintConflicts ?? [], annotations);
      fresh.push(...annotations); misc.push(...annotations);
      handedOver = true;
    } finally {
      // abandoned (or failed) before handing the staged result over: nothing was shown
      if (!handedOver) dispose();
    }
    const commit = () => {
      if (settled) return;
      settled = true;
      this.clearMisc();
      for (const [key, meshes] of this.surfaces) if (next.get(key) !== meshes) this.drop(meshes);
      for (const meshes of next.values()) for (const m of meshes) if (m.parent !== this.group) this.group.add(m);
      this.surfaces = next;
      for (const o of misc) this.group.add(o);
      this.misc = misc;
      // no crossing meshes left: release the shared materials too
      if (!this.group.children.some(c => c instanceof THREE.Mesh)) this.releaseMaterials();
      this.view.requestRender();
    };
    return { commit, dispose };
  }
  private conflicts(conflicts: readonly FootprintConflict[], out: THREE.Object3D[]) {
    const blocked: number[] = [];
    for (const c of conflicts) {
      if (c.action === 'blocked') {
        const p = this.view.local(c.x, c.y, this.view.drape(c.x, c.y) + 2);
        blocked.push(p.x, p.y, p.z);
        for (const path of [c.geometry?.road, ...(c.geometry?.links ?? [])]) if (path && path.length >= 2) this.conflictPath(c, path, true, out);
      }
      if (c.feature === 'stream' && c.action === 'channel-relocation' && c.geometry?.road && c.geometry.road.length >= 2) {
        // A visible path annotation at the designed bed, not a modelled excavation.
        // Depth testing stays off because the undisturbed terrain still covers that bed.
        const points = c.geometry.road.map(p => this.view.local(p.x, p.y, p.z + .3));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({
          color: 0x168bdd, depthTest: false, depthWrite: false,
        }));
        line.name = 'footprint-channel'; line.userData.conflictId = c.id; line.renderOrder = 5; out.push(line);
        if (c.original && c.original.length >= 2) this.conflictPath(c, c.original, false, out);
      }
      if (c.action === 'relocation' && hasCrossingPath(c.geometry)) {
        for (const path of c.originals ?? [c.original]) if (path && path.length >= 2) this.conflictPath(c, path, false, out);
      }
    }
    if (!blocked.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(blocked, 3));
    const material = new THREE.PointsMaterial({ color: 0xd7301f, size: 13, sizeAttenuation: false, depthTest: false, depthWrite: false });
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nif (abs(abs(gl_PointCoord.x - .5) - abs(gl_PointCoord.y - .5)) > .13) discard;');
    };
    material.customProgramCacheKey = () => 'footprint-blocked-cross';
    const markers = new THREE.Points(geometry, material);
    markers.name = 'footprint-blocked'; markers.renderOrder = 6; out.push(markers);
  }
  private conflictPath(c: FootprintConflict, path: CrossingPoint[], proposed: boolean, out: THREE.Object3D[]) {
    const points = path.map(p => this.view.local(p.x, p.y, this.view.drape(p.x, p.y) + .3));
    // Annotations, not surviving roads: legible even under fill. Blocked proposals must not
    // carve terrain or mark the original as removed because the mitigation cannot be built.
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({
      color: proposed ? 0xe0a800 : 0xc83d32, dashSize: 12, gapSize: 8, transparent: true, opacity: .8, depthTest: false, depthWrite: false,
    }));
    line.computeLineDistances(); line.name = proposed ? 'footprint-proposed' : 'footprint-removed'; line.userData.conflictId = c.id;
    line.renderOrder = 5; out.push(line);
  }
  /** one crossing surface's quads (yields every 64 sections: long diversions take a while) */
  private *surface(s: CrossingSurface, earth: MeshBuilder, terrain: MeshBuilder, structure: MeshBuilder,
    replacement: (x: number, y: number) => number): Generator<void, void> {
    const g = s.crossing.geometry!, cls = s.tie?.cls ?? s.crossing.cls, width = s.tie?.width ?? g.width;
    const color = existingRoadColor(cls), casing = 0x807468;
    const below = (p: CrossingPoint, dz: number) => ({ ...p, z: p.z - dz });
    const collars = [new Map<object, CrossingPoint[]>(), new Map<object, CrossingPoint[]>()];
    const stripRows = new Map<object, { casing: CrossingPoint[]; crown: CrossingPoint[] }>();
    const natural = (x: number, y: number) => this.view.groundHeight(x,y);
    for (let i = 0; i + 1 < s.sections.length; i++) {
      if (i && i % 64 === 0) yield;
      const a = s.sections[i], b = s.sections[i + 1], ground = groundSegment(s, i), target = ground ? earth : structure;
      // Tracks retain the billed formation width, but only the wheel strips are bare earth.
      // A solid four-metre brown slab made parallel diversions look like footprint outlines.
      if ((s.link || s.tie) && cls === 'track') {
        terrain.quad(a.edge[0], a.edge[1], b.edge[0], b.edge[1], 0xffffff, 0, .08);
        const at = (section: typeof a, off: number) => {
          const t = .5 + off/width, l = section.edge[0], r = section.edge[1];
          return { ...section.p, x: l.x+(r.x-l.x)*t, y: l.y+(r.y-l.y)*t, z: l.z+(r.z-l.z)*t };
        };
        for (const off of [-.85, .85]) target.quad(at(a,off-.3), at(a,off+.3), at(b,off-.3), at(b,off+.3), 0x96856c, 0, .12, EW_KIND.crown);
      } else {
        // The casing and surface occupy the same surveyed alignment, never a parallel schematic line.
        const at = (section: typeof a, t: number): CrossingPoint => {
          const l = section.edge[0], r = section.edge[1], x = l.x+(r.x-l.x)*t, y = l.y+(r.y-l.y)*t;
          // the builders read x, y, z and d only: a light point instead of a spread copy
          return { x, y, z: section.p.surface === 'terrain' && s.crossing.type !== 'junction'
            ? this.view.groundHeight(x,y) : l.z+(r.z-l.z)*t, d: section.p.d } as CrossingPoint;
        };
        // casing / crown points across each section, shared by the strips and segments beside it
        const strips = Math.max(1,Math.ceil(width/1.5));
        const stripRow = (section: typeof a) => {
          let row = stripRows.get(section);
          if (!row) stripRows.set(section, row = {
            casing: Array.from({ length: strips + 1 }, (_, j) => at(section, j/strips)),
            crown: Array.from({ length: strips + 1 }, (_, j) => at(section, .05+.9*(j/strips))),
          });
          return row;
        };
        const ra = stripRow(a), rb = stripRow(b);
        for (let j = 0; j < strips; j++) {
          target.quad(ra.casing[j], ra.casing[j+1], rb.casing[j], rb.casing[j+1], casing);
          target.quad(ra.crown[j], ra.crown[j+1], rb.crown[j], rb.crown[j+1], color, 0, .10, EW_KIND.crown);
        }
      }
      if (ground) for (const k of [0, 1] as const) {
        if (s.retainingSupport && (a.p.support === 'retaining' || b.p.support === 'retaining') &&
          a.p.support !== 'embankment' && b.p.support !== 'embankment') {
          // Close the supported face up to the pavement and down to the natural collar.
          const raised = (p: CrossingPoint, lift: number) => ({ ...p, z: p.z+lift });
          structure.quad(raised(a.edge[k],.10),raised(a.toe[k],.015),
            raised(b.edge[k],.10),raised(b.toe[k],.015),0xb7b4a9,0,0);
        } else if (a.wallTop?.[k] || b.wallTop?.[k]) {
          // The slope runs to the top of a priced retaining wall, whose face stands down to the ground.
          const top = (q: typeof a) => q.wallTop?.[k] ?? q.toe[k];
          earth.quad(a.edge[k], top(a), b.edge[k], top(b), a.p.z >= a.toe[k].z ? 0xe3d27e : 0xbf6a32, 1);
          const raised = (p: CrossingPoint, lift: number) => ({ ...p, z: p.z+lift });
          structure.quad(raised(top(a),.10),raised(a.toe[k],.015),raised(top(b),.10),raised(b.toe[k],.015),0xb7b4a9,0,0);
        } else earth.quad(a.edge[k], a.toe[k], b.edge[k], b.toe[k], a.p.z >= a.toe[k].z ? 0xe3d27e : 0xbf6a32, 1);
        // Natural ground collar replaces the coarse mesh locally. At its outside edge it meets
        // that mesh, while the actual road/earthwork tie-in remains at the real terrain height.
        // Each section's 9 collar points are shared by the segments on both sides of it.
        const collarRow = (section: typeof a): CrossingPoint[] => {
          let row = collars[k].get(section);
          if (!row) collars[k].set(section, row = Array.from({ length: 9 }, (_, j) => {
            const q = collarPoint({ day: section.toe[k], outer: section.outer[k] }, j/8, natural, replacement);
            return { x: q.x, y: q.y, z: q.z, d: section.p.d } as CrossingPoint;
          }));
          return row;
        };
        const ra = collarRow(a), rb = collarRow(b);
        for (let j = 0; j < 8; j++) terrain.quad(ra[j], ra[j+1], rb[j], rb[j+1], 0xffffff, 0, .015);
      } else {
        const depth = g.deck!.depth;
        for (const k of [0, 1] as const) {
          structure.quad(a.edge[k], below(a.edge[k], depth), b.edge[k], below(b.edge[k], depth), k ? 0x8b8982 : 0xc4c2ba);
          // Continuous parapet, plus open upright posts at each profile sample.
          const rail = (p: CrossingPoint, z: number, lateral: number) => ({ ...p, x: p.x + a.nx * lateral, y: p.y + a.ny * lateral, z: p.z + z });
          structure.quad(rail(a.edge[k], .95, 0), rail(a.edge[k], 1.12, 0), rail(b.edge[k], .95, 0), rail(b.edge[k], 1.12, 0), 0x626969);
          this.box(structure, a.edge[k], a.nx, a.ny, .10, .10, a.edge[k].z, a.edge[k].z + 1.12, 0x626969);
        }
        structure.quad(below(a.edge[0], depth), below(a.edge[1], depth), below(b.edge[0], depth), below(b.edge[1], depth), 0x75756f);
      }
    }
    for (const [a, b, c, d] of endCollars(s, (x, y) => this.view.groundHeight(x, y))) {
      const across = Math.max(2, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 4)), along = 5;
      const point = (u: number, v: number) => {
        const x = a.x * (1-u)*(1-v) + b.x*u*(1-v) + c.x*(1-u)*v + d.x*u*v;
        const y = a.y * (1-u)*(1-v) + b.y*u*(1-v) + c.y*(1-u)*v + d.y*u*v;
        const ground = this.view.groundHeight(x, y), blend = Math.max(Math.min(1,v/.65), Math.max(0, Math.abs(u-.5)*4-1));
        return { ...a, x, y, z: ground + (replacement(x, y)-ground)*blend };
      };
      for (let i = 0; i < across; i++) for (let j = 0; j < along; j++) terrain.quad(point(i/across,j/along), point((i+1)/across,j/along), point(i/across,(j+1)/along), point((i+1)/across,(j+1)/along), 0xffffff, 0, .015);
    }
    if (s.deck && g.deck) for (const i of [s.deck.start, s.deck.end]) {
      const a = s.sections[i];
      // Full-width abutments down to natural ground; the clear span has no piers in our traffic lanes.
      const bottom = Math.min(this.view.groundHeight(a.p.x, a.p.y), a.p.z - g.deck.depth - .5);
      this.box(structure, a.p, a.nx, a.ny, g.width / 2 + .3, .65, bottom, a.p.z - g.deck.depth, 0xb7b4a9);
      for (const k of [0, 1] as const) {
        const e = a.edge[k], foot = { ...e, z: this.view.groundHeight(e.x, e.y) };
        // Wing faces close the embankment beside the abutment, rather than revealing a hollow ramp.
        const v = [e, foot, a.toe[k]].map(p => earth.vertex(p, 0xe3d27e, 1));
        earth.indices.push(...v);
      }
    }
    if (g.turnaroundRadius === undefined && s.link && s.crossing.cls !== 'track' && s.path.length &&
      (g.turnarounds === undefined || g.turnarounds.some(p => Math.hypot(p.x-s.path[0].x,p.y-s.path[0].y) < .01))) {
      // Turning heads only at explicit severed ends; absent metadata retains legacy link behavior.
      const p = s.path[0], radius = g.width * .72, sections = 20;
      for (let k = 0; k < sections; k++) {
        const pt = (j: number) => {
          const angle = j / sections * Math.PI * 2, x = p.x + Math.cos(angle) * radius, y = p.y + Math.sin(angle) * radius;
          return { ...p, x, y, z: this.view.groundHeight(x, y) };
        };
        const a = earth.vertex(p, color, 0, .12, EW_KIND.crown), b = earth.vertex(pt(k), color, 0, .12, EW_KIND.crown), c = earth.vertex(pt(k + 1), color, 0, .12, EW_KIND.crown);
        earth.indices.push(a, b, c);
      }
    }
  }
  /** Closed RC box under our embankment: shell along the crossed way between its two portals,
   * headwall frames and splayed wings at the slope toes, and a dark opening. The track keeps its
   * terrain-level surface through it; our embankment mesh hides the buried middle. */
  private underpass(road: CrossingPoint[], box: NonNullable<NonNullable<Result['crossings'][number]['geometry']>['underpass']>, mesh: MeshBuilder) {
    if (box.start < 0 || box.end <= box.start || box.end >= road.length) return;
    const concrete = 0xb7b4a9, shade = 0x8b8982, dark = 0x1f1f1d;
    const inner = box.width / 2, outer = inner + box.wall, top = box.height + box.roof;
    const normal = (i: number) => {
      const a = road[Math.max(box.start, i - 1)], b = road[Math.min(box.end, i + 1)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len, tx: (b.x - a.x) / len, ty: (b.y - a.y) / len };
    };
    const at = (i: number, lateral: number, dz: number): CrossingPoint => {
      const p = road[i], { nx, ny } = normal(i);
      return { ...p, x: p.x + nx * lateral, y: p.y + ny * lateral, z: p.z + dz };
    };
    for (let i = box.start; i < box.end; i++) {
      for (const side of [-1, 1]) {
        mesh.quad(at(i, side * outer, -.3), at(i, side * outer, top), at(i + 1, side * outer, -.3), at(i + 1, side * outer, top), side < 0 ? concrete : shade, 0, 0);
        mesh.quad(at(i, side * inner, 0), at(i, side * inner, box.height), at(i + 1, side * inner, 0), at(i + 1, side * inner, box.height), dark, 0, 0);
      }
      mesh.quad(at(i, -outer, top), at(i, outer, top), at(i + 1, -outer, top), at(i + 1, outer, top), concrete, 0, 0);
      mesh.quad(at(i, -inner, box.height), at(i, inner, box.height), at(i + 1, -inner, box.height), at(i + 1, inner, box.height), dark, 0, 0);
    }
    for (const [i, outward] of [[box.start, -1], [box.end, 1]] as const) {
      // Headwall frame around the opening, then a dark plug just inside it: the slope surface
      // crossing the box interior near the toe must not show through the opening.
      const head = (lateral: number, dz: number, along = 0) => {
        const p = at(i, lateral, dz), { tx, ty } = normal(i);
        return { ...p, x: p.x + tx * outward * along, y: p.y + ty * outward * along };
      };
      const lip = .25, plug = .6;
      for (const side of [-1, 1]) mesh.quad(head(side * inner, -.3, lip), head(side * inner, top + .2, lip), head(side * (outer + .3), -.3, lip), head(side * (outer + .3), top + .2, lip), concrete, 0, 0);
      mesh.quad(head(-inner, box.height, lip), head(inner, box.height, lip), head(-inner, top + .2, lip), head(inner, top + .2, lip), concrete, 0, 0);
      mesh.quad(head(-inner, 0, -plug), head(inner, 0, -plug), head(-inner, box.height, -plug), head(inner, box.height, -plug), dark, 0, 0);
      // Splayed wing walls retaining the slope beside the portal, falling to the toe.
      for (const side of [-1, 1]) {
        const reach = top * .9, base = head(side * (outer + .3), 0, lip);
        const end = head(side * (outer + .3 + reach * .5), 0, lip + reach);
        const ground = this.view.groundHeight(end.x, end.y);
        mesh.quad({ ...base, z: base.z - .3 }, { ...base, z: base.z + top + .2 }, { ...end, z: ground - .3 }, { ...end, z: ground + .6 }, side < 0 ? concrete : shade, 0, 0);
      }
    }
  }
  private box(mesh: MeshBuilder, p: CrossingPoint, nx: number, ny: number, across: number, along: number, low: number, high: number, color: number) {
    if (high <= low) return;
    const corners = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([a, b]) => ({ ...p, x: p.x + nx * across * a + ny * along * b, y: p.y + ny * across * a - nx * along * b, z: low }));
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4]; mesh.quad(a, { ...a, z: high }, b, { ...b, z: high }, color);
    }
    mesh.quad({ ...corners[0], z: high }, { ...corners[1], z: high }, { ...corners[3], z: high }, { ...corners[2], z: high }, color);
  }
  /** remove shown objects; their own (non-shared) materials are retired, shared ones stay */
  private drop(objects: THREE.Object3D[]) { this.dispose3D(objects, true); }
  private dispose3D(objects: THREE.Object3D[], shown: boolean) {
    const shared = new Set(this.materials ? Object.values(this.materials) : []), own = new Set<THREE.Material>();
    for (const child of objects) {
      this.group.remove(child); const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (!shared.has(material)) own.add(material);
    }
    // never drawn: no program shared with a successor yet, dispose at once
    for (const material of own) if (shown) this.view.retire(material); else material.dispose();
  }
  private clearMisc() { this.drop(this.misc); this.misc = []; }
  private releaseMaterials() {
    if (!this.materials) return;
    for (const material of Object.values(this.materials)) this.view.retire(material);
    this.materials = null;
  }
  dispose() {
    this.clearMisc();
    for (const meshes of this.surfaces.values()) this.drop(meshes);
    this.surfaces.clear();
    this.releaseMaterials();
    this.view.world.remove(this.group); this.view.requestRender();
  }
}
