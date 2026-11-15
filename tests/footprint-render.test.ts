import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { FootprintConflict } from '../src/core/footprint';
import type { View } from '../src/render/view';
import { crossingSurfaces, footprintSurfaces, groundSegment } from '../src/render/crossing-surface';
import { CrossingRenderer } from '../src/render/crossings';
import { footprintConflictsInRange, footprintConflictText } from '../src/ui/footprint';
import { COLLAR_OVERLAP, GROUND_COLLAR } from '../src/render/earthwork-surface';
import { EW_KIND } from '../src/render/terrainMaterial';

const height = (x: number, y: number) => 100 + x * .02 + y * .1;
const path = (y: number) => [0, 20, 40].map(x => ({ x, y, z: height(x, y), ground: height(x, y), surface: 'terrain' as const }));
const conflict = (extra: Partial<FootprintConflict> = {}): FootprintConflict => ({
  id: 'road:2', feature: 'road', action: 'relocation', i: 1, s0: 20, s1: 180,
  x: 20, y: 10, length: 40, cost: 1000000, detail: 'Road within fill toe', cls: 'tertiary', roadId: 2,
  geometry: { road: path(30), width: 6, schematic: false }, original: path(10), ...extra,
});

describe('footprint conflict presentation', () => {
  it('matches the complete affected range rather than the cost booking station', () => {
    const c = conflict();
    expect(footprintConflictsInRange([c], 100, 120)).toEqual([c]);
    expect(footprintConflictsInRange([c], 180, 200)).toEqual([c]);
    expect(footprintConflictsInRange([c], 181, 200)).toEqual([]);
    expect(footprintConflictsInRange([c], 0, 19)).toEqual([]);
    expect(footprintConflictsInRange([], 0, 200)).toEqual([]);
  });

  it('explains the mitigation and existing billing bucket without billing blocked work', () => {
    const c = conflict({ roadCode: 'III/123' });
    expect(footprintConflictText(c)).toContain('Moved aside: class III road: 40 m under our earthworks');
    expect(footprintConflictText(c)).toContain('(in Road crossings, before the other-objects surcharge)');
    expect(footprintConflictText(c)).toContain(c.detail);
    expect(footprintConflictText(conflict({ feature: 'stream', action: 'culvert' }))).toContain('in Watercourse culverts');
    expect(footprintConflictText(conflict({ feature: 'railway', action: 'blocked', cost: 0 }))).not.toContain('(in ');
    expect(footprintConflictText(conflict({ feature: 'stream', action: 'retaining-wall' }))).toContain('Retaining wall');
    expect(footprintConflictText(conflict({ feature: 'stream', action: 'channel-relocation' }))).toContain('its land under Land');
    expect(footprintConflictText(conflict({ action: 'relocation', closed: { length: 60, detour: 140 }, cost: 0 }))).toContain('Closed');
  });

  it('renders only road relocations as continuous terrain roads at their class width', () => {
    const c = conflict(), original = structuredClone(c);
    const surfaces = footprintSurfaces([c, conflict({ action: 'blocked' }), conflict({ feature: 'stream', action: 'culvert' }),
      conflict({ feature: 'stream', action: 'channel-relocation' }), conflict({ action: 'retaining-wall' }), conflict({ geometry: undefined })], height);
    expect(surfaces).toHaveLength(1);
    const s = surfaces[0];
    expect(s.link).toBe(false); expect(s.deck).toBeUndefined();
    expect(s.path[0].y).toBe(30);
    for (const section of s.sections) {
      expect(Math.hypot(section.edge[0].x - section.edge[1].x, section.edge[0].y - section.edge[1].y)).toBeCloseTo(6);
      for (const e of section.edge) expect(e.z).toBeCloseTo(height(e.x, e.y));
    }
    expect(s.sections.slice(1).every((_, i) => groundSegment(s, i))).toBe(true);
    expect(c).toEqual(original);
  });

  it('renders usable link-only relocations, retaining explicit turnaround metadata', () => {
    const links: [ReturnType<typeof path>, ReturnType<typeof path>] = [path(30),path(50)];
    const c = conflict({ geometry: { links, turnarounds: [links[0][0]], width: 6, schematic: false } });
    const surfaces = footprintSurfaces([c, conflict({ geometry: { links: [[],path(70).slice(0,1)], width: 6, schematic: false } })],height);
    expect(surfaces).toHaveLength(2);
    expect(surfaces.every(s => s.link)).toBe(true);
    expect(surfaces.map(s => s.path[0].y)).toEqual([30,50]);
    expect(surfaces.every(s => s.crossing.geometry?.turnarounds === c.geometry!.turnarounds)).toBe(true);
  });

  it.each([
    { link: false, z: 105 }, { link: true, z: 105 }, { link: false, z: 95 }, { link: true, z: 95 },
  ])('keeps a paid retaining connector at its checked 4 m width ($link link, $z elevation)', ({ link, z }) => {
    const natural = () => 100, coarse = () => 103;
    const road = [0,20].map(x => ({ x, y: 0, z, ground: 100, surface: 'ramp' as const, support: 'retaining' as const }));
    const c = conflict({ geometry: { ...(link ? { links: [road,[]] as [typeof road,typeof road] } : { road }),
      width: 4, turnarounds: [], schematic: false } });
    const [surface] = footprintSurfaces([c],natural);
    expect(surface.sections.length).toBeGreaterThan(road.length); // Exercise inserted samples, not just the original metadata.
    for (const section of surface.sections) {
      expect(section.p.support).toBe('retaining');
      for (const k of [0,1]) {
        const edge = section.edge[k], toe = section.toe[k], outer = section.outer[k];
        expect(Math.abs(edge.y)).toBe(2); expect(edge.z).toBe(z);
        expect(toe.x).toBe(edge.x); expect(toe.y).toBe(edge.y); expect(toe.z).toBe(100);
        expect(Math.abs(outer.y)).toBe(2+GROUND_COLLAR);
        // The terrain-mask inset remains wholly within the natural replacement collar.
        expect(Math.abs(outer.y)-COLLAR_OVERLAP).toBeGreaterThan(Math.abs(toe.y));
      }
    }
    const mock = { world: new THREE.Group(), crossingSurfaces: [surface],
      local: (x: number, y: number, z: number) => new THREE.Vector3(x,z,-y),
      drape: natural, groundHeight: natural, replacementHeight: coarse, requestRender: vi.fn(),
      crossingEarthMaterial: () => new THREE.MeshBasicMaterial(), crossingGroundMaterial: () => new THREE.MeshBasicMaterial(),
      retire: (m: THREE.Material) => m.dispose(),
    };
    const renderer = new CrossingRenderer(mock as unknown as View);
    renderer.setResult({ crossings: [], grade: Float64Array.of(z), ground: Float64Array.of(100), footprintConflicts: [c] });
    let faces = 0, innerCollar = 0, outerCollar = 0, pavement = 0;
    mock.world.traverse(object => {
      const mesh = object as THREE.Mesh<THREE.BufferGeometry>;
      if (!mesh.geometry?.index) return;
      const p = mesh.geometry.getAttribute('position'), kinds = mesh.geometry.getAttribute('ewKind'), ink = mesh.geometry.getAttribute('ink');
      for (let j = 0; j < p.count; j++) {
        const offset = Math.abs(p.getZ(j));
        if (mesh.name === 'crossing-earthworks') {
          pavement++;
          expect(offset).toBeLessThanOrEqual(2); expect(p.getY(j)).toBeCloseTo(z+.1,1);
          expect(ink.getX(j)).toBe(0); // No fill/cut slopes anywhere outside the checked ribbon.
        }
        if (mesh.name === 'crossing-terrain' && p.getX(j) > 0 && p.getX(j) < 20) {
          expect(offset).toBeGreaterThanOrEqual(2); expect(offset).toBeLessThanOrEqual(2+GROUND_COLLAR);
          // collarPoint keeps the first 10 m beyond the 2 m paved edge at natural ground.
          if (offset <= 12) { innerCollar++; expect(p.getY(j)).toBeCloseTo(100.015,4); }
          if (offset === 2+GROUND_COLLAR) { outerCollar++; expect(p.getY(j)).toBeCloseTo(103.015,4); }
        }
      }
      if (mesh.name !== 'crossing-decks') return;
      const indices = mesh.geometry.index.array;
      for (let j = 0; j < indices.length; j += 3) {
        const ids = [indices[j],indices[j+1],indices[j+2]];
        faces++;
        expect(new Set(ids.map(i => p.getZ(i))).size).toBe(1); // Vertical face, never a concrete-coloured slope.
        for (const i of ids) {
          expect(Math.abs(p.getZ(i))).toBe(2); expect(kinds.getX(i)).toBe(EW_KIND.structure); expect(ink.getX(i)).toBe(0);
        }
        expect(ids.some(i => Math.abs(p.getY(i)-(z+.1))<1e-4)).toBe(true);
        expect(ids.some(i => Math.abs(p.getY(i)-100.015)<1e-4)).toBe(true);
      }
    });
    expect(faces).toBe(4*(surface.sections.length-1));
    expect(pavement).toBeGreaterThan(0); expect(innerCollar).toBeGreaterThan(0); expect(outerCollar).toBeGreaterThan(0);
    renderer.dispose();
  });

  it('renders ordinary cut approaches as earth slopes, not unpriced concrete faces', () => {
    const natural = () => 100;
    const surfaces = crossingSurfaces([{ s: 0, i: 0, x: 0, y: 0, h: 0, cost: 0, cls: 'tertiary', type: 'overbridge',
      geometry: { width: 6, schematic: false, road: [0,20].map(x => ({
        x, y: 0, z: 97, ground: 100, surface: 'ramp', support: 'retaining',
      })) },
    }],natural);
    const mock = { world: new THREE.Group(), crossingSurfaces: surfaces,
      local: (x: number, y: number, z: number) => new THREE.Vector3(x,z,-y),
      groundHeight: natural, replacementHeight: natural, requestRender: vi.fn(),
      crossingEarthMaterial: () => new THREE.MeshBasicMaterial(), crossingGroundMaterial: () => new THREE.MeshBasicMaterial(),
      retire: (m: THREE.Material) => m.dispose(),
    };
    const renderer = new CrossingRenderer(mock as unknown as View);
    renderer.setResult({ crossings: [], grade: Float64Array.of(97), ground: Float64Array.of(100) });
    expect(mock.world.getObjectByName('crossing-decks')).toBeUndefined();
    const mesh = mock.world.getObjectByName('crossing-earthworks') as THREE.Mesh<THREE.BufferGeometry>;
    const p = mesh.geometry.getAttribute('position'), kinds = mesh.geometry.getAttribute('ewKind');
    let daylight = 0;
    for (let i = 0; i < p.count; i++) if (Math.abs(p.getZ(i)) > 3) {
      daylight++;
      expect(kinds.getX(i)).toBe(EW_KIND.cut);
      expect(p.getY(i)).toBeCloseTo(100.08,4);
    }
    expect(daylight).toBeGreaterThan(0);
    renderer.dispose();
  });

  it('continues retaining support through refined samples to the natural-ground tie-in', () => {
    const c = conflict({ geometry: { width: 4, schematic: false, road: [
      { x: 0, y: 0, z: 105, ground: 100, surface: 'ramp', support: 'retaining' },
      { x: 20, y: 0, z: 100, ground: 100, surface: 'terrain' },
    ] } });
    const [surface] = footprintSurfaces([c],() => 100);
    for (const section of surface.sections) for (const k of [0,1]) {
      expect(section.toe[k].x).toBe(section.edge[k].x);
      expect(section.toe[k].y).toBe(section.edge[k].y);
      expect(section.toe[k].z).toBe(100);
    }
  });

  it.each([false,true])('marks removed originals and disposes annotations (shared originals: %s)', shared => {
    const c = conflict({ geometry: { links: [path(30),path(50)], turnarounds: [], width: 6, schematic: false },
      originals: shared ? [path(10),path(20)] : undefined });
    const blocked = conflict({ id: 'road:3', action: 'blocked', geometry: { road: path(60), width: 6, schematic: false } });
    const channel = conflict({ id: 'stream:1', feature: 'stream', action: 'channel-relocation',
      geometry: { road: path(90).map(p => ({ ...p, z: p.z-2 })), width: 3, schematic: false } });
    const retired: THREE.Material[] = [];
    const mock = { world: new THREE.Group(), crossingSurfaces: footprintSurfaces([c], height),
      local: (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y),
      drape: height, groundHeight: height, replacementHeight: height, requestRender: vi.fn(),
      crossingEarthMaterial: () => new THREE.MeshBasicMaterial(), crossingGroundMaterial: () => new THREE.MeshBasicMaterial(),
      retire: (m: THREE.Material) => retired.push(m),
    };
    const renderer = new CrossingRenderer(mock as unknown as View);
    const result = { crossings: [], grade: Float64Array.of(100), ground: Float64Array.of(100) };
    renderer.setResult({ ...result, footprintConflicts: [c, blocked, channel] });
    const group = mock.world.getObjectByName('crossing-roads')!;
    const earth = group.getObjectByName('crossing-earthworks') as THREE.Mesh<THREE.BufferGeometry>;
    expect(earth).toBeDefined();
    // Explicitly empty turnarounds must not invent circular heads beyond these link starts.
    const positions = earth.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) expect(positions.getX(i)).toBeGreaterThanOrEqual(0);
    const removed = group.getObjectByName('footprint-removed') as THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
    expect(removed.userData.conflictId).toBe(c.id);
    expect(removed.geometry.getAttribute('position').count).toBe(c.original!.length);
    expect(removed.geometry.getAttribute('position').getZ(0)).toBe(-10);
    expect(removed.material.depthTest).toBe(false);
    const markers = group.getObjectByName('footprint-blocked') as THREE.Points;
    expect(markers.geometry.getAttribute('position').count).toBe(1);
    const proposed = group.getObjectByName('footprint-proposed') as THREE.Line;
    expect(proposed.userData.conflictId).toBe(blocked.id);
    expect(proposed.geometry.getAttribute('position').getZ(0)).toBe(-60);
    expect(group.children.filter(c => c.name === 'footprint-removed')).toHaveLength(shared ? 3 : 2);
    const removedRoads = group.children.filter(o => o.name === 'footprint-removed' && o.userData.conflictId === c.id) as THREE.Line[];
    expect(removedRoads.map(line => line.geometry.getAttribute('position').getZ(0))).toEqual(shared ? [-10,-20] : [-10]);
    const disposeRoads = removedRoads.map(line => vi.spyOn(line.geometry,'dispose'));
    const water = group.getObjectByName('footprint-channel') as THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    expect(water.userData.conflictId).toBe(channel.id);
    expect(water.geometry.getAttribute('position').getZ(0)).toBe(-90);
    expect(water.geometry.getAttribute('position').getY(0)).toBeCloseTo(height(0,90)-2+.3);
    expect(water.material.depthTest).toBe(false); // bed path remains visible; no physical excavation mesh
    expect(water.material.color.b).toBeGreaterThan(water.material.color.r);
    expect(water.material.type).toBe('LineBasicMaterial');
    const removedChannel = group.children.find(c => c.name === 'footprint-removed' && c.userData.conflictId === channel.id) as THREE.Line;
    expect(removedChannel.geometry.getAttribute('position').getZ(0)).toBe(-10);
    const disposeWater = vi.spyOn(water.geometry, 'dispose'), disposeOldWater = vi.spyOn(removedChannel.geometry, 'dispose');
    const disposeLine = vi.spyOn(removed.geometry, 'dispose'), disposeMarkers = vi.spyOn(markers.geometry, 'dispose'), disposeProposal = vi.spyOn(proposed.geometry, 'dispose');
    mock.crossingSurfaces = [];
    renderer.setResult(result);
    expect(group.children).toHaveLength(0);
    expect(disposeLine).toHaveBeenCalledOnce(); expect(disposeMarkers).toHaveBeenCalledOnce(); expect(disposeProposal).toHaveBeenCalledOnce();
    expect(disposeWater).toHaveBeenCalledOnce(); expect(disposeOldWater).toHaveBeenCalledOnce();
    for (const dispose of disposeRoads) expect(dispose).toHaveBeenCalledOnce();
    expect(retired).toContain(removed.material); expect(retired).toContain(markers.material); expect(retired).toContain(water.material);
    renderer.dispose();
  });
});
