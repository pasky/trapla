import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { FootprintConflict } from '../src/core/footprint';
import type { View } from '../src/render/view';
import { footprintSurfaces, groundSegment } from '../src/render/crossing-surface';
import { CrossingRenderer } from '../src/render/crossings';
import { footprintConflictsInRange, footprintConflictText } from '../src/ui/footprint';

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
    expect(footprintConflictText(c)).toContain('III/123: relocation, 40 m');
    expect(footprintConflictText(c)).toContain('included in road crossings, before surcharge');
    expect(footprintConflictText(c)).toContain(c.detail);
    expect(footprintConflictText(conflict({ feature: 'stream', action: 'culvert' }))).toContain('included in culverts');
    expect(footprintConflictText(conflict({ feature: 'railway', action: 'blocked', cost: 0 }))).not.toContain('included in');
    for (const action of ['retaining-wall','channel-relocation'] as const) {
      const text = footprintConflictText(conflict({ feature: 'stream', action }));
      expect(text).toContain(action.replace('-', ' '));
      if (action === 'retaining-wall') expect(text).toContain('included in footprint works under crossings');
      else {
        expect(text).toContain('total includes land and construction before surcharge');
        expect(text).toContain('construction under Road crossings, land under Land without surcharge');
        expect(text).not.toContain('included in footprint works under crossings');
      }
    }
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

  it('marks removed originals and blocked locations, then disposes their geometry on the next result', () => {
    const c = conflict({ geometry: { links: [path(30),path(50)], turnarounds: [], width: 6, schematic: false } });
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
    expect(group.children.filter(c => c.name === 'footprint-removed')).toHaveLength(2);
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
    expect(retired).toContain(removed.material); expect(retired).toContain(markers.material); expect(retired).toContain(water.material);
    renderer.dispose();
  });
});
