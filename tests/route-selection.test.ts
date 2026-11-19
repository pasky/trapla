import { describe, expect, it } from 'vitest';
import { perspectiveFraction, pickRoute, type PickRoute } from '../src/render/route-pick';
import { routeIndicationHeight } from '../src/render/route-indication';
import { KIND } from '../src/core/structures';
import { RouteSelectionState, activeSelection, qualifySelection } from '../src/ui/route-selection';

function route(id: string, y: number, tunnel = false): PickRoute {
  return { id, result: { n: 3, x: Float64Array.of(0, 10, 30), y: Float64Array.of(y, y, y), s: Float64Array.of(0, 10, 30),
    grade: Float64Array.of(5, 5, 5), ground: Float64Array.of(20, 20, 20), kind: Uint8Array.of(...Array(3).fill(tunnel ? KIND.tunnel : KIND.earth)) } };
}
const project = (x: number, y: number, _z: number) => ({ sx: x, sy: y, vis: true });
const drape = () => 25; // deliberately above the tunnel's 20 m natural ground

describe('route-qualified map/profile selection', () => {
  it('picks inactive roads at the correct chainage and changes route and selected piece atomically', () => {
    const hit = pickRoute([route('mission', 0), route('side', 100)], 23, 102, 8, project, drape, 'mission')!;
    expect(hit).toEqual({ routeId: 'side', s: 23, index: 2, distance: 2 });
    const state = new RouteSelectionState(); state.switchRoute('mission');
    state.select(qualifySelection(hit.routeId, { kind: 'pin', s: hit.s }));
    expect(state.activeRouteId).toBe('side'); expect(state.local).toEqual({ kind: 'pin', s: 23 });
    expect(activeSelection('mission', state.selection)).toBeNull();
  });

  it('has deterministic overlap ties, draws tunnels at ground, and never picks hidden/out-of-range segments', () => {
    const a = route('a', 0), b = route('b', 0);
    expect(pickRoute([a, b], 30, 0, 8, project, drape, 'b')?.routeId).toBe('b');
    expect(pickRoute([b, a], 30, 0, 8, project, drape)?.routeId).toBe('a');
    expect(pickRoute([a], 15, 20, 8, project, drape)).toBeNull();
    expect(pickRoute([a], 15, 0, 8, (x, y) => ({ sx: x, sy: y, vis: false }), drape)).toBeNull();
    const byHeight = (x: number, _y: number, z: number) => ({ sx: x, sy: z, vis: true });
    expect(pickRoute([route('tunnel', 0, true)], 15, 27, 2, byHeight, drape)?.s).toBe(15);
    expect(pickRoute([route('tunnel', 0, true)], 15, 20, 2, byHeight, drape)).toBeNull();
  });

  it('switches without transferring local indices, preserves global buildings, and repairs deleted active routes', () => {
    const state = new RouteSelectionState();
    state.select(qualifySelection('a', { kind: 'bend', i: 3 }));
    state.switchRoute('a'); expect(state.local).toEqual({ kind: 'bend', i: 3 });
    state.switchRoute('b'); expect(state.local).toBeNull();
    state.select(qualifySelection('b', { kind: 'building', j: 8 }));
    state.switchRoute('a'); expect(state.local).toEqual({ kind: 'building', j: 8 });
    state.select(qualifySelection('a', { kind: 'stretch', s0: 10, s1: 20 }));
    state.reconcile(['b', 'c']); expect(state.activeRouteId).toBe('b'); expect(state.local).toBeNull();
    state.reconcile([]); expect(state.activeRouteId).toBeNull();
  });
});

describe('route picking passes over stretches far from the pointer', () => {
  // every segment tested, as before the culling boxes
  const brute = (routes: readonly PickRoute[], x: number, y: number, pixels: number, project: (x: number, y: number, z: number) => { sx: number; sy: number; vis: boolean; depth?: number },
    drape: (x: number, y: number) => number, active?: string) => {
    let hit: { routeId: string; s: number; index: number; distance: number } | null = null, best = pixels * pixels;
    for (const { id, result: r } of routes) {
      const at = (i: number) => project(r.x[i], r.y[i], routeIndicationHeight(r, i, drape));
      let prev = at(0);
      for (let i = 1; i < r.n; i++) {
        const p = at(i);
        if (p.vis && prev.vis) {
          const dx = p.sx - prev.sx, dy = p.sy - prev.sy, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((x - prev.sx) * dx + (y - prev.sy) * dy) / l2)) : 0;
          const d2 = (prev.sx + t * dx - x) ** 2 + (prev.sy + t * dy - y) ** 2, tied = hit !== null && Math.abs(d2 - best) < 1e-8;
          const preferred = hit !== null && tied && (id === active && hit.routeId !== active || id !== active && hit.routeId !== active && id < hit.routeId);
          if (d2 < best && !tied || preferred) { const along = perspectiveFraction(t, prev.depth, p.depth); best = d2; hit = { routeId: id, s: r.s[i - 1] + along * (r.s[i] - r.s[i - 1]), index: along < .5 ? i - 1 : i, distance: Math.sqrt(d2) }; }
        }
        prev = p;
      }
    }
    return hit;
  };
  it('finds what testing every segment finds, under a perspective camera that sees part of the routes', () => {
    let seed = 7;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const wiggly = (id: string, y0: number, n: number): PickRoute => {
      const x = new Float64Array(n), y = new Float64Array(n), s = new Float64Array(n), grade = new Float64Array(n), kind = new Uint8Array(n);
      for (let i = 0; i < n; i++) { x[i] = i * 10; y[i] = y0 + 200 * Math.sin(i / 90); s[i] = i * 10; grade[i] = 300 + 40 * Math.sin(i / 37); kind[i] = i % 300 < 20 ? KIND.tunnel : KIND.earth; }
      return { id, result: { n, x, y, s, grade, ground: grade, kind } };
    };
    const routes = [wiggly('a', 0, 2000), wiggly('b', 150, 1500)];
    let hits = 0;
    for (let k = 0; k < 60; k++) {
      // a camera over the routes looking along +x (points behind it are not visible)
      const ex = rand() * 20000, ey = rand() * 400 - 200, ez = 400 + rand() * 600, f = 600;
      const project = (x: number, y: number, z: number) => {
        const depth = x - ex;
        return { sx: 800 + f * (y - ey) / Math.max(depth, 1e-9), sy: 500 - f * (z - ez) / Math.max(depth, 1e-9), vis: depth > 1 && depth < 30000, depth };
      };
      const drape = (x: number, y: number) => 320 + 10 * Math.sin(x / 500 + y / 300);
      for (let j = 0; j < 10; j++) {
        // half near a drawn station (within 20 px), half anywhere
        const r = routes[j % 2].result, i = Math.floor(rand() * r.n), q = project(r.x[i], r.y[i], routeIndicationHeight(r, i, drape));
        const near = j < 5 && q.vis, px = near ? q.sx + (rand() - 0.5) * 40 : rand() * 1600, py = near ? q.sy + (rand() - 0.5) * 40 : rand() * 1000;
        const want = brute(routes, px, py, 12, project, drape, 'a');
        expect(pickRoute(routes, px, py, 12, project, drape, 'a')).toEqual(want);
        if (want) hits++;
      }
    }
    expect(hits).toBeGreaterThan(20);
  });
  it('keeps each route’s boxes apart when two routes share their x array', () => {
    const x = Float64Array.of(0, 20), shared = (id: string, y: number): PickRoute => ({ id, result: { n: 2, x, y: Float64Array.of(y, y),
      s: Float64Array.of(0, 20), grade: Float64Array.of(5, 5), ground: Float64Array.of(5, 5), kind: Uint8Array.of(KIND.earth, KIND.earth) } });
    expect(pickRoute([shared('a', 0)], 10, 0, 4, project, drape)?.routeId).toBe('a');
    expect(pickRoute([shared('b', 100)], 10, 100, 4, project, drape)?.routeId).toBe('b');
  });
});

