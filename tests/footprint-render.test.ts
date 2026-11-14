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
  });

  it('renders only road relocations as continuous terrain roads at their class width', () => {
    const c = conflict(), original = structuredClone(c);
    const surfaces = footprintSurfaces([c, conflict({ action: 'blocked' }), conflict({ feature: 'stream', action: 'culvert' }), conflict({ geometry: undefined })], height);
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

  it('marks removed originals and blocked locations, then disposes their geometry on the next result', () => {
    const c = conflict(), blocked = conflict({ id: 'road:3', action: 'blocked', geometry: { road: path(60), width: 6, schematic: false } });
    const retired: THREE.Material[] = [];
    const mock = { world: new THREE.Group(), crossingSurfaces: footprintSurfaces([c], height),
      local: (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y),
      drape: height, groundHeight: height, requestRender: vi.fn(),
      crossingEarthMaterial: () => new THREE.MeshBasicMaterial(), crossingGroundMaterial: () => new THREE.MeshBasicMaterial(),
      retire: (m: THREE.Material) => retired.push(m),
    };
    const renderer = new CrossingRenderer(mock as unknown as View);
    const result = { crossings: [], grade: Float64Array.of(100), ground: Float64Array.of(100) };
    renderer.setResult({ ...result, footprintConflicts: [c, blocked] });
    const group = mock.world.getObjectByName('crossing-roads')!;
    expect(group.getObjectByName('crossing-earthworks')).toBeDefined();
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
    expect(group.children.filter(c => c.name === 'footprint-removed')).toHaveLength(1);
    const disposeLine = vi.spyOn(removed.geometry, 'dispose'), disposeMarkers = vi.spyOn(markers.geometry, 'dispose'), disposeProposal = vi.spyOn(proposed.geometry, 'dispose');
    mock.crossingSurfaces = [];
    renderer.setResult(result);
    expect(group.children).toHaveLength(0);
    expect(disposeLine).toHaveBeenCalledOnce(); expect(disposeMarkers).toHaveBeenCalledOnce(); expect(disposeProposal).toHaveBeenCalledOnce();
    expect(retired).toContain(removed.material); expect(retired).toContain(markers.material);
    renderer.dispose();
  });
});
