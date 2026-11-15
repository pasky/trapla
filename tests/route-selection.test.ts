import { describe, expect, it } from 'vitest';
import { pickRoute, type PickRoute } from '../src/render/route-pick';
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
