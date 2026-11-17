// Owner's Královec review: a high fill beside a valley side drawn as a straight slope from the crown edge to its
// toe 135 m out, billed as the engine's face that follows the falling ground down in its bands (sections.ts):
// drawn 35 % more than billed. The face is now drawn from its samples (SideResult.face, render/view.ts).
import { describe, expect, it } from 'vitest';
import { FACE_AT, faceSamples, sideSection } from '../src/core/sections';

describe('a fill face on ground falling away beside it', () => {
  const z = 477, w = 3, ground = (o: number) => 461 - 0.37 * o;
  const trace: number[] = [];
  const side = sideSection(z, w, { crownWidth: 2 * w } as never, ground, undefined, Infinity, trace);
  // the slope's own part of the bill (beyond the crown edge)
  let crown = 0; for (let o = 0.05; o < w; o += 0.1) crown += 0.1 * (z - ground(o));
  const area = (surface: (o: number) => number) => { let a = 0; for (let o = w + 0.05; o < side.day; o += 0.1) a += 0.1 * Math.max(0, surface(o) - ground(o)); return a; };
  it('is drawn as billed from its samples, not as a straight slope', () => {
    const face = faceSamples(trace, w, z, side.day, side.zDay)!;
    expect(face).toBeDefined();
    const us = [0, ...FACE_AT, 1], zs = [z, ...face, side.zDay], run = side.day - w;
    const drawn = area(o => { const u = (o - w) / run; for (let k = 1; k < us.length; k++) if (us[k] >= u) return zs[k - 1] + (zs[k] - zs[k - 1]) * (u - us[k - 1]) / (us[k] - us[k - 1]); return side.zDay; });
    const straight = area(o => z + (side.zDay - z) * (o - w) / run);
    expect(Math.abs(drawn - (side.fill - crown)) / (side.fill - crown)).toBeLessThan(0.05);
    expect(straight / (side.fill - crown)).toBeGreaterThan(1.15);
  });
});

// (cuts: on the D11 designs the straight slope with its one rock bend drew 6–9 % less than billed; their samples
// within 1 %)
describe('a deep cut face with benches', () => {
  const z = 400, w = 3, ground = (o: number) => 425 + 0.15 * o;
  const trace: number[] = [];
  const side = sideSection(z, w, { crownWidth: 2 * w } as never, ground, undefined, Infinity, trace);
  let crown = 0; for (let o = 0.05; o < w; o += 0.1) crown += 0.1 * (ground(o) - z);
  const area = (surface: (o: number) => number) => { let a = 0; for (let o = w + 0.05; o < side.day; o += 0.1) a += 0.1 * Math.max(0, ground(o) - surface(o)); return a; };
  it('is drawn as billed from its samples, benches and all', () => {
    const face = faceSamples(trace, w, z, side.day, side.zDay)!;
    expect(face).toBeDefined();
    const us = [0, ...FACE_AT, 1], zs = [z, ...face, side.zDay], run = side.day - w, billed = side.cut - crown;
    const drawn = area(o => { const u = (o - w) / run; for (let k = 1; k < us.length; k++) if (us[k] >= u) return zs[k - 1] + (zs[k] - zs[k - 1]) * (u - us[k - 1]) / (us[k] - us[k - 1]); return side.zDay; });
    expect(Math.abs(drawn - billed) / billed).toBeLessThan(0.05);
  });
});
