import { expect, it } from 'vitest';
import { smoothLink } from '../src/core/crossing-link';

it('shortcuts footprint zigzags without crossing the reserved corridor or moving road anchors', () => {
  const points = Array.from({ length: 101 }, (_, i) => ({ x: i*5, y: 20+5*Math.sin(i*.4)**2 }));
  const clearance = (p: { x: number; y: number }) => p.y-17;
  const result = smoothLink(points,clearance,p => p,3-1e-5);
  expect(result[0]).toBe(points[0]); expect(result.at(-1)).toBe(points.at(-1));
  const length = (ps: typeof points) => ps.slice(1).reduce((sum,p,i) => sum+Math.hypot(p.x-ps[i].x,p.y-ps[i].y),0);
  expect(length(result)).toBeLessThan(length(points)*.97);
  for (let i = 1; i < result.length; i++) for (let k = 0; k <= 20; k++) {
    const a = result[i-1], b = result[i], t = k/20;
    expect(clearance({ x: a.x+(b.x-a.x)*t, y: a.y+(b.y-a.y)*t })).toBeGreaterThanOrEqual(3-1e-5);
  }
});

it('rounds a tight setback corner outward instead of keeping a kink or cutting into the footprint', () => {
  const points = [{ x: -40,y: 0 },{ x: -20,y: 0 },{ x: 0,y: 0 },{ x: 0,y: 20 },{ x: 0,y: 40 }];
  const clearance = (p: { x: number; y: number }) => Math.max(p.x,-p.y)+3;
  const result = smoothLink(points,clearance,p => p,3-1e-5);
  expect(result.some(p => p.x > .1 && p.y < -.1)).toBe(true);
  for (const p of result) expect(clearance(p)).toBeGreaterThanOrEqual(3-1e-5);
  expect(result[0]).toBe(points[0]); expect(result.at(-1)).toBe(points.at(-1));
});

it('retains a detour around an obstacle instead of hiding a footprint intrusion', () => {
  const points = Array.from({ length: 81 }, (_, i) => {
    const angle = Math.PI-i/80*Math.PI;
    return { x: Math.cos(angle)*25, y: Math.sin(angle)*25 };
  });
  const clearance = (p: { x: number; y: number }) => Math.hypot(p.x,p.y)-20;
  const result = smoothLink(points,clearance,p => p);
  expect(result.length).toBeGreaterThan(2);
  for (let i = 1; i < result.length; i++) for (let k = 0; k <= 20; k++) {
    const a = result[i-1], b = result[i], t = k/20;
    expect(clearance({ x: a.x+(b.x-a.x)*t, y: a.y+(b.y-a.y)*t })).toBeGreaterThan(.4);
  }
});
