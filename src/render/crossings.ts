// Physical, depth-tested crossing roads. All geometry is rebuilt only on a worker result.
import * as THREE from 'three';
import type { CrossingPoint } from '../core/crossings';
import type { Result } from '../core/evaluate';
import type { FootprintConflict } from '../core/footprint';
import { endCollars, groundSegment, hasCrossingPath, turnaroundSurfaces, type CrossingSurface } from './crossing-surface';
import { existingRoadColor } from './landcover';
import type { View } from './view';
import { EW_KIND } from './terrainMaterial';
import { collarPoint } from './earthwork-surface';

class MeshBuilder {
  pos: number[] = []; col: number[] = []; elev: number[] = []; ink: number[] = []; indices: number[] = [];
  kinds: number[] = []; geo: number[] = [];
  groundHoles: { center: { x: number; y: number }; radius: number }[] = [];
  constructor(private view: View) {}
  vertex(p: CrossingPoint, color: number, ink = 0, lift = .08,
    kind: number = ink ? (color === 0xe3d27e ? EW_KIND.fill : EW_KIND.cut) : EW_KIND.structure) {
    const v = this.view.local(p.x, p.y, p.z + lift), c = new THREE.Color(color), i = this.pos.length / 3;
    this.pos.push(v.x, v.y, v.z); this.col.push(c.r, c.g, c.b); this.elev.push(p.z); this.ink.push(ink);
    this.kinds.push(kind); this.geo.push(...(this.view.crossingGeology?.(p.x,p.y,p.z) ?? [-3,-3]), p.d ?? 0);
    return i;
  }
  quad(a: CrossingPoint, b: CrossingPoint, c: CrossingPoint, d: CrossingPoint, color: number, ink = 0, lift = .08, kind?: number) {
    // Existing replacement collars must not cover a level turning disk in cut. Drop
    // touching cells; the disk's own 20 m natural collar covers the small outside remainder.
    const polygon = [a,b,d,c];
    if (this.groundHoles.some(({ center: p, radius: r }) => {
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
    const v = [a, b, c, d].map(p => this.vertex(p, color, ink, lift, kind));
    this.indices.push(v[0], v[1], v[2], v[1], v[3], v[2]);
  }
  *geometries() {
    // Spatially consecutive strips: bounded chunks let close views cull distant crossings.
    // A single route-wide ground mesh submitted every fine collar triangle at every zoom.
    for (let start = 0; start < this.indices.length; start += 12288) {
      const sources: number[] = [], remap = new Map<number,number>(), indices: number[] = [];
      for (const old of this.indices.slice(start,start+12288)) {
        let index = remap.get(old);
        if (index === undefined) { index = sources.length; sources.push(old); remap.set(old,index); }
        indices.push(index);
      }
      const g = new THREE.BufferGeometry();
      for (const [name, values, size] of [['position', this.pos, 3], ['color', this.col, 3], ['elev', this.elev, 1], ['ink', this.ink, 1], ['ewKind', this.kinds, 1], ['ewGeo', this.geo, 3]] as const) {
        const array = new Float32Array(sources.length*size);
        sources.forEach((old,i) => { for (let k = 0; k < size; k++) array[i*size+k] = values[old*size+k]; });
        g.setAttribute(name, new THREE.BufferAttribute(array,size));
      }
      g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingSphere(); yield g;
    }
  }
}
export class CrossingRenderer {
  private group = new THREE.Group();
  constructor(private view: View) { this.group.name = 'crossing-roads'; view.world.add(this.group); }
  setResult(r: Pick<Result, 'crossings' | 'grade' | 'ground'> & { footprintConflicts?: readonly FootprintConflict[] }) {
    this.clear();
    const earth = new MeshBuilder(this.view), terrain = new MeshBuilder(this.view), structure = new MeshBuilder(this.view);
    const heads = turnaroundSurfaces(this.view.crossingSurfaces,(x,y) => this.view.groundHeight(x,y));
    terrain.groundHoles = heads;
    for (const surface of this.view.crossingSurfaces) this.surface(surface, earth, terrain, structure);
    for (const head of heads) {
      terrain.groundHoles = heads.filter(other => other !== head);
      const color = existingRoadColor(head.crossing.cls), center = earth.vertex(head.center,color,0,.12,EW_KIND.crown);
      for (let j = 0; j < head.sections.length; j++) {
        const a = head.sections[j], b = head.sections[(j+1)%head.sections.length];
        const roadPoint = (p: typeof a.day): CrossingPoint => ({ ...head.center, ...p });
        earth.indices.push(center,earth.vertex(roadPoint(a.edge),color,0,.12,EW_KIND.crown),earth.vertex(roadPoint(b.edge),color,0,.12,EW_KIND.crown));
        // Paid exposed rim: vertical support from the level disk to true natural ground.
        const rim = (p: typeof a.day, lift: number) => roadPoint({ ...p, z: p.z+lift });
        structure.quad(rim(a.edge,.12),rim(a.day,.015),rim(b.edge,.12),rim(b.day,.015),0xb7b4a9,0,0);
        const collar = (s: typeof a, t: number) => roadPoint(collarPoint(s,t,
          (x,y) => this.view.groundHeight(x,y),(x,y) => this.view.replacementHeight(x,y)));
        for (let k = 0; k < 8; k++) terrain.quad(collar(a,k/8),collar(a,(k+1)/8),collar(b,k/8),collar(b,(k+1)/8),0xffffff,0,.015);
      }
    }
    for (const [builder, material, name] of [[terrain, this.view.crossingGroundMaterial(), 'crossing-terrain'],
      [earth, this.view.crossingEarthMaterial(), 'crossing-earthworks'], [structure, this.view.crossingEarthMaterial(), 'crossing-decks']] as const) {
      if (!builder.indices.length) { material.dispose(); continue; }
      for (const geometry of builder.geometries()) {
        const mesh = new THREE.Mesh(geometry, material); mesh.name = name; this.group.add(mesh);
      }
    }
    this.conflicts(r.footprintConflicts ?? []);
    this.view.requestRender();
  }
  private conflicts(conflicts: readonly FootprintConflict[]) {
    const blocked: number[] = [];
    for (const c of conflicts) {
      if (c.action === 'blocked') {
        const p = this.view.local(c.x, c.y, this.view.drape(c.x, c.y) + 2);
        blocked.push(p.x, p.y, p.z);
        for (const path of [c.geometry?.road, ...(c.geometry?.links ?? [])]) if (path && path.length >= 2) this.conflictPath(c, path, true);
      }
      if (c.feature === 'stream' && c.action === 'channel-relocation' && c.geometry?.road && c.geometry.road.length >= 2) {
        // A visible path annotation at the designed bed, not a modelled excavation.
        // Depth testing stays off because the undisturbed terrain still covers that bed.
        const points = c.geometry.road.map(p => this.view.local(p.x, p.y, p.z + .3));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({
          color: 0x168bdd, depthTest: false, depthWrite: false,
        }));
        line.name = 'footprint-channel'; line.userData.conflictId = c.id; line.renderOrder = 5; this.group.add(line);
        if (c.original && c.original.length >= 2) this.conflictPath(c, c.original, false);
      }
      if (c.action === 'relocation' && hasCrossingPath(c.geometry) && c.original && c.original.length >= 2) this.conflictPath(c, c.original, false);
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
    markers.name = 'footprint-blocked'; markers.renderOrder = 6; this.group.add(markers);
  }
  private conflictPath(c: FootprintConflict, path: CrossingPoint[], proposed: boolean) {
    const points = path.map(p => this.view.local(p.x, p.y, this.view.drape(p.x, p.y) + .3));
    // Annotations, not surviving roads: legible even under fill. Blocked proposals must not
    // carve terrain or mark the original as removed because the mitigation cannot be built.
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({
      color: proposed ? 0xe0a800 : 0xc83d32, dashSize: 12, gapSize: 8, transparent: true, opacity: .8, depthTest: false, depthWrite: false,
    }));
    line.computeLineDistances(); line.name = proposed ? 'footprint-proposed' : 'footprint-removed'; line.userData.conflictId = c.id;
    line.renderOrder = 5; this.group.add(line);
  }
  private surface(s: CrossingSurface, earth: MeshBuilder, terrain: MeshBuilder, structure: MeshBuilder) {
    const g = s.crossing.geometry!, color = existingRoadColor(s.crossing.cls), casing = 0x807468;
    const below = (p: CrossingPoint, dz: number) => ({ ...p, z: p.z - dz });
    for (let i = 0; i + 1 < s.sections.length; i++) {
      const a = s.sections[i], b = s.sections[i + 1], ground = groundSegment(s, i), target = ground ? earth : structure;
      // Tracks retain the billed formation width, but only the wheel strips are bare earth.
      // A solid four-metre brown slab made parallel diversions look like footprint outlines.
      if (s.link && s.crossing.cls === 'track') {
        terrain.quad(a.edge[0], a.edge[1], b.edge[0], b.edge[1], 0xffffff, 0, .08);
        const at = (section: typeof a, off: number) => {
          const t = .5 + off/g.width, l = section.edge[0], r = section.edge[1];
          return { ...section.p, x: l.x+(r.x-l.x)*t, y: l.y+(r.y-l.y)*t, z: l.z+(r.z-l.z)*t };
        };
        for (const off of [-.85, .85]) target.quad(at(a,off-.3), at(a,off+.3), at(b,off-.3), at(b,off+.3), 0x96856c, 0, .12, EW_KIND.crown);
      } else {
        // The casing and surface occupy the same surveyed alignment, never a parallel schematic line.
        const at = (section: typeof a, t: number): CrossingPoint => {
          const l = section.edge[0], r = section.edge[1], x = l.x+(r.x-l.x)*t, y = l.y+(r.y-l.y)*t;
          return { ...section.p, x, y, z: section.p.surface === 'terrain' && s.crossing.type !== 'junction'
            ? this.view.groundHeight(x,y) : l.z+(r.z-l.z)*t };
        };
        const strips = Math.max(1,Math.ceil(g.width/1.5));
        for (let j = 0; j < strips; j++) {
          const lo = j/strips, hi = (j+1)/strips;
          target.quad(at(a,lo), at(a,hi), at(b,lo), at(b,hi), casing);
          target.quad(at(a,.05+.9*lo), at(a,.05+.9*hi), at(b,.05+.9*lo), at(b,.05+.9*hi), color, 0, .10, EW_KIND.crown);
        }
      }
      if (ground) for (const k of [0, 1] as const) {
        earth.quad(a.edge[k], a.toe[k], b.edge[k], b.toe[k], a.p.z >= a.toe[k].z ? 0xe3d27e : 0xbf6a32, 1);
        // Natural ground collar replaces the coarse mesh locally. At its outside edge it meets
        // that mesh, while the actual road/earthwork tie-in remains at the real terrain height.
        const collarAt = (section: typeof a, t: number): CrossingPoint => ({ ...section.p,
          ...collarPoint({ day: section.toe[k], outer: section.outer[k] }, t,
            (x,y) => this.view.groundHeight(x,y), (x,y) => this.view.replacementHeight(x,y)) });
        for (let j = 0; j < 8; j++) terrain.quad(collarAt(a,j/8), collarAt(a,(j+1)/8), collarAt(b,j/8), collarAt(b,(j+1)/8), 0xffffff, 0, .015);
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
        return { ...a, x, y, z: ground + (this.view.replacementHeight(x, y)-ground)*blend };
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
  private box(mesh: MeshBuilder, p: CrossingPoint, nx: number, ny: number, across: number, along: number, low: number, high: number, color: number) {
    if (high <= low) return;
    const corners = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([a, b]) => ({ ...p, x: p.x + nx * across * a + ny * along * b, y: p.y + ny * across * a - nx * along * b, z: low }));
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4]; mesh.quad(a, { ...a, z: high }, b, { ...b, z: high }, color);
    }
    mesh.quad({ ...corners[0], z: high }, { ...corners[1], z: high }, { ...corners[3], z: high }, { ...corners[2], z: high }, color);
  }
  private clear() {
    const materials = new Set<THREE.Material>();
    for (const child of [...this.group.children]) {
      this.group.remove(child); const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
    }
    for (const material of materials) this.view.retire(material);
  }
  dispose() { this.clear(); this.view.world.remove(this.group); this.view.requestRender(); }
}
