import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { FootprintConflict } from '../src/core/footprint';
import type { View } from '../src/render/view';
import { footprintSurfaces, turnaroundMaskRing, turnaroundSurfaces } from '../src/render/crossing-surface';
import { CrossingRenderer } from '../src/render/crossings';
import { collarPoint, COLLAR_OVERLAP, GROUND_COLLAR } from '../src/render/earthwork-surface';

const natural = (x: number, y: number) => 100+x*.03+y*.1;
const center = { x: 0, y: 0, z: 98, ground: 100, surface: 'ramp' as const };
const road = [center,{ ...center, x: 30 }];
const conflict = (): FootprintConflict => ({ id: 'road:1', feature: 'road', action: 'relocation', cls: 'track',
  i: 0, s0: 0, s1: 30, x: 0, y: 0, length: 30, cost: 1, detail: '',
  geometry: { road, links: [road,road], width: 6, turnarounds: [center,center], turnaroundRadius: 9, schematic: false },
});

describe('explicit turning disks', () => {
  it('shares the full priced radius, natural collar and inset terrain mask once per geometry', () => {
    const heads = turnaroundSurfaces(footprintSurfaces([conflict()],natural),natural);
    expect(heads).toHaveLength(1);
    const head = heads[0], ring = turnaroundMaskRing(head);
    for (let j = 0; j < head.sections.length; j++) {
      const s = head.sections[j];
      expect(Math.hypot(s.edge.x,s.edge.y)).toBeCloseTo(9);
      expect(s.edge.z).toBe(98);
      expect(s.day.z).toBe(natural(s.day.x,s.day.y));
      expect(collarPoint(s,0,natural,natural)).toEqual(s.day);
      expect(Math.hypot(ring[j].x,ring[j].y)).toBeCloseTo(9+GROUND_COLLAR-COLLAR_OVERLAP);
      expect(Math.hypot(s.outer.x,s.outer.y)-Math.hypot(ring[j].x,ring[j].y)).toBeCloseTo(COLLAR_OVERLAP);
    }
  });

  it('renders the whole disk on a track road endpoint, with support rims and no duplicate heads', () => {
    const c = conflict(), surfaces = footprintSurfaces([c],natural);
    const mock = { world: new THREE.Group(), crossingSurfaces: surfaces,
      local: (x: number, y: number, z: number) => new THREE.Vector3(x,z,-y),
      drape: natural, groundHeight: natural, replacementHeight: natural, requestRender: vi.fn(),
      crossingEarthMaterial: () => new THREE.MeshBasicMaterial(), crossingGroundMaterial: () => new THREE.MeshBasicMaterial(),
      retire: (m: THREE.Material) => m.dispose(),
    };
    const renderer = new CrossingRenderer(mock as unknown as View);
    renderer.setResult({ crossings: [], grade: Float64Array.of(98), ground: Float64Array.of(100), footprintConflicts: [c] });
    let diskArea = 0, rimTriangles = 0;
    mock.world.traverse(object => {
      const mesh = object as THREE.Mesh<THREE.BufferGeometry>;
      if (!mesh.geometry?.index) return;
      const p = mesh.geometry.getAttribute('position'), index = mesh.geometry.index.array;
      for (let i = 0; i < index.length; i += 3) {
        const ids = Array.from(index.slice(i,i+3));
        const radial = (j: number) => Math.hypot(p.getX(j),p.getZ(j));
        if (mesh.name === 'crossing-earthworks' && ids.every(j => Math.abs(p.getY(j)-98.12)<1e-4)
          && ids.filter(j => Math.abs(radial(j)-9)<1e-4).length === 2 && ids.some(j => radial(j)<1e-4)) {
          const [a,b,c] = ids;
          diskArea += Math.abs((p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a))-(p.getX(c)-p.getX(a))*(p.getZ(b)-p.getZ(a)))/2;
        }
        if (mesh.name === 'crossing-decks' && ids.every(j => Math.abs(radial(j)-9)<1e-4)) {
          rimTriangles++;
          expect(ids.some(j => Math.abs(p.getY(j)-98.12)<1e-4)).toBe(true);
          expect(ids.some(j => Math.abs(p.getY(j)-(natural(p.getX(j),-p.getZ(j))+.015))<1e-4)).toBe(true);
        }
        // Other road collars cannot sit over the excavated disk, including on its cut side.
        if (mesh.name === 'crossing-terrain') for (const j of ids) expect(radial(j)).toBeGreaterThanOrEqual(9-1e-4);
      }
    });
    const sectors = turnaroundSurfaces(surfaces,natural)[0].sections.length;
    expect(diskArea).toBeCloseTo(sectors*9*9*Math.sin(2*Math.PI/sectors)/2,3);
    expect(diskArea).toBeGreaterThan(Math.PI*9*9*.99);
    expect(rimTriangles).toBe(sectors*2);
    renderer.dispose();
  });
});
