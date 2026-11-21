// Junction works drawn on the ground. A roundabout's ring where a road of ours ends on another (core/tie-in.ts
// ringMark), drawn over both roads on what is drawn there (render/view.ts drawnSurface): its carriageway with its outer
// edge line (broken where the arms come in), the paved apron round the island and the island's grass (TP 135 (2017)
// tab. 2 at D = 40 m: core/tie-in.ts ROUNDABOUT_RING); and the ground a junction's sight field is dug clear of.
// Display only: their price and land are the junction's works.
import * as THREE from 'three';
import { ROUNDABOUT_RING, type RingMark } from '../core/tie-in';

type RGB = readonly [number, number, number];
// (the colours as the lane marks', render/view.ts setLaneMarks: sRGB hex, linear components)
const rgb = (hex: number): RGB => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const CUT = rgb(0x9e7859), ASPHALT = rgb(0x3b3b42), APRON = rgb(0x8f8a84), GRASS = rgb(0x6f8f4c), WHITE = rgb(0xf2f2ee);
/** the outer edge line: 0.25 m wide, 0.25 m in from the ring's edge (a guide strip), broken this far either side of an
 * arm's line (its carriageway and the flare of its mouth), m */
const EDGE = { width: 0.25, inset: 0.25, mouth: 7 };
const SEGMENTS = 96;

/** Ground dug off a junction's sight field (core/tie-in.ts sightField): each cell a square of `size` m, tinted as a
 * cutting's face, `lift` m over the surface `heightAt` (display: the ground drawn is not lowered by it, a metre at most). */
export function digTriangles(dug: { cells: readonly { x: number; y: number }[]; size: number }, heightAt: (x: number, y: number) => number, lift: number) {
  const pos: number[] = [], col: number[] = [], h = dug.size / 2;
  for (const c of dug.cells) {
    const q = [[c.x - h, c.y - h], [c.x + h, c.y - h], [c.x - h, c.y + h], [c.x + h, c.y + h]].map(([x, y]) => [x, y, heightAt(x, y) + lift]);
    pos.push(...q[0], ...q[1], ...q[2], ...q[1], ...q[3], ...q[2]);
    for (let m = 0; m < 6; m++) col.push(...CUT);
  }
  return { pos, col };
}

/** The ring's triangles (world x, y, z per vertex) and colours, on the surface `heightAt`, `lift` m over it (the
 * line `lift + 0.05`). */
export function ringTriangles(ring: RingMark, heightAt: (x: number, y: number) => number, lift: number) {
  const pos: number[] = [], col: number[] = [];
  const R = ring.r, outer = R, inner = R - ROUNDABOUT_RING.carriageway, island = inner - ROUNDABOUT_RING.apron;
  const p = (a: number, r: number, up: number) => { const x = ring.x + r * Math.cos(a), y = ring.y + r * Math.sin(a); return [x, y, heightAt(x, y) + up]; };
  // (in rings at most 1 m wide: the surface under it is sampled that densely)
  const band = (r0: number, r1: number, colour: RGB, up: number, keep: (a: number) => boolean = () => true) => {
    const rings = Math.max(1, Math.ceil((r1 - r0) / 1));
    for (let k = 0; k < SEGMENTS; k++) {
      const a0 = 2 * Math.PI * k / SEGMENTS, a1 = 2 * Math.PI * (k + 1) / SEGMENTS;
      if (!keep((a0 + a1) / 2)) continue;
      for (let j = 0; j < rings; j++) {
        const ra = r0 + (r1 - r0) * j / rings, rb = r0 + (r1 - r0) * (j + 1) / rings;
        const q = [p(a0, ra, up), p(a0, rb, up), p(a1, ra, up), p(a1, rb, up)];
        pos.push(...q[0], ...q[1], ...q[2], ...q[1], ...q[3], ...q[2]);
        for (let m = 0; m < 6; m++) col.push(...colour);
      }
    }
  };
  // (the island from its centre: a band from a radius of 0)
  band(0, island, GRASS, lift);
  band(island, inner, APRON, lift);
  band(inner, outer, ASPHALT, lift);
  // (the edge line kept clear of each arm's mouth: an arm of half width w and its flare, EDGE.mouth either side of its line)
  const r = outer - EDGE.inset - EDGE.width / 2;
  const clear = (a: number) => ring.arms.every(arm => {
    const cx = Math.cos(a) * r, cy = Math.sin(a) * r, along = cx * arm.x + cy * arm.y;
    return along <= 0 || Math.abs(-cx * arm.y + cy * arm.x) > EDGE.mouth;
  });
  band(outer - EDGE.inset - EDGE.width, outer - EDGE.inset, WHITE, lift + 0.05, clear);
  return { pos, col };
}
