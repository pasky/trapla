// What the route takes stays visible on the buildings themselves: a bought-out house keeps its own colour
// in every view (the noise view's tint goes over it, never instead of it), a demolished one is removed.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Buildings } from '../src/render/buildings';
import type { BuildingData } from '../src/render/vectorPack';

function twoHouses(): BuildingData {
  const square = (x: number) => [x, 0, x + 10, 0, x + 10, 10, x, 10];
  return { count: 2, verts: new Float32Array([...square(0), ...square(50)]), starts: new Uint32Array([0, 4, 8]),
    tris: new Uint16Array([0, 1, 2, 0, 2, 3, 0, 1, 2, 0, 2, 3]), triStarts: new Uint32Array([0, 6, 12]), heights: new Uint8Array([6, 6]), heightScale: 1 };
}
const flat = { top: () => 0, bottom: () => 0 };
/** a tint as stored (linear vertex colours, roof unshaded) */
const stored = (hex: number) => { const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace); return [c.r, c.g, c.b].map(v => Math.round(v * 255)); };
const BOUGHT = stored(0xc43c9b);
const roofOf = (b: Buildings, i: number) => {
  const mesh = b.group.children[0] as unknown as { geometry: { getAttribute(n: string): { array: Uint8Array } } };
  const first = 4 * 3 * i; // each house: 3 rings of 4 vertices, the roof ring first
  return [...mesh.geometry.getAttribute('color').array.slice(3 * first, 3 * first + 3)];
};

describe('building status colours', () => {
  it('a bought-out house keeps its colour with every view tint, and loses it when no longer bought', () => {
    const b = new Buildings(twoHouses(), 1000, flat, 0, 0);
    const own = roofOf(b, 1);
    b.setMarked(new Map([[0, 0xc43c9b]]));
    expect(roofOf(b, 0)).toEqual(BOUGHT);
    b.tint(new Map(), false); // a view without tints (noise view off)
    expect(roofOf(b, 0)).toEqual(BOUGHT);
    b.tint(new Map([[1, 0x18b0b0]]), true); // the noise view tints another house and mutes the rest
    expect(roofOf(b, 0)).toEqual(BOUGHT);
    b.setMarked(new Map());
    b.tint(new Map(), false);
    expect(roofOf(b, 0)).not.toEqual(BOUGHT);
    expect(roofOf(b, 1)).toEqual(own);
  });
});
