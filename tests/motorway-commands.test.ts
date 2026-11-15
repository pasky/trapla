import { describe, expect, it } from 'vitest';
import { splitMotorwayCommand, rejoinMotorwayCommand, type MotorwayMaterialization } from '../src/core/motorway-commands';
import { d275CrossSection } from '../src/core/data/motorway';
import { buildAlignment } from '../src/core/horizontal';
import { childStationAt, curvePointAt } from '../src/core/offset-path';
import { pairedCarriageways } from '../src/core/paired-carriageways';
import type { CorridorDesign, EndpointPair, RouteDesign } from '../src/core/project';

function fixture() {
  const path = buildAlignment({ x: 0, y: 0 }, { x: 3000, y: 2000 }, [{ x: 1500, y: 0, r: 1000 }], 840, 0);
  const plan = pairedCarriageways(path, d275CrossSection(), 840);
  const endpoints: EndpointPair = { a: { position: { x: 0, y: 0, z: 100 }, anchor: { kind: 'free' }, binding: 'resolved' },
    b: { position: { x: 3000, y: 2000, z: 110 }, anchor: { kind: 'free' }, binding: 'resolved' } };
  const corridor: Extract<CorridorDesign, { mode: 'paired' }> = { id: 'corridor', revision: 4, kind: 'motorway', mode: 'paired', endpoints,
    children: { forward: 'east', reverse: 'west' }, formationPolicy: 'test', correspondence: [],
    spine: { kind: 'exact', path, vertical: { kind: 'auto', pins: [{ s: 400, z: 105 }] }, controls: {
      structureOverrides: [{ s0: 100, s1: 700, kind: 1 }],
      wallOverrides: [{ s0: 100, s1: 700, side: 'L', height: 3 }, { s0: 200, s1: 800, side: 'R', height: 4 }],
    } } };
  const route = (direction: 'forward' | 'reverse'): RouteDesign => ({ id: corridor.children[direction], name: direction, kind: 'motorway', role: 'auxiliary', revision: 2,
    endpoints, acousticSourceId: `physical-${direction}`, alignment: { kind: 'corridor', corridorId: corridor.id, direction },
    specification: { kind: 'motorway', policy: 'test', crossSection: 'D27.5', designSpeed: 130, operations: { aadt: 10000, heavyShare: 0.15, speed: 130 } } });
  const routes = [route('forward'), route('reverse')];
  const resolved: MotorwayMaterialization = { corridorId: corridor.id, corridorRevision: corridor.revision, plan,
    profiles: { forward: [{ s: 0, z: 100 }, { s: plan.right.axis.path.length, z: 110 }],
      reverse: [{ s: 0, z: 110.2 }, { s: plan.left.axis.path.length, z: 100.2 }] } };
  return { corridor, routes, resolved };
}

describe('C0 motorway split/rejoin commands', () => {
  it('materialises exact paths, distinct grades, controls and actual child endpoints without changing identities or inputs', () => {
    const { corridor, routes, resolved } = fixture();
    const before = JSON.stringify({ corridor, routes, resolved });
    const split = splitMotorwayCommand(corridor, [...routes].reverse(), resolved);
    expect(split.corridor).not.toHaveProperty('spine');
    expect(split.corridor.retainedSpine).toEqual(corridor.spine);
    expect(split.children.map(c => c.id)).toEqual(['east', 'west']);
    expect(split.children.map(c => c.acousticSourceId)).toEqual(routes.map(c => c.acousticSourceId));
    for (const [i, child] of split.children.entries()) {
      expect(child.alignment.kind).toBe('exact');
      if (child.alignment.kind !== 'exact') throw new Error('test fixture');
      const axis = i === 0 ? resolved.plan.right.axis : resolved.plan.left.axis;
      expect(child.alignment.path).toEqual(axis.path);
      expect(child.alignment.vertical).toEqual({ kind: 'frozen', points: i === 0 ? resolved.profiles.forward : resolved.profiles.reverse });
      const first = curvePointAt(axis.path, 0);
      expect(child.endpoints.a.position.x).toBeCloseTo(first.x, 8);
      expect(child.endpoints.a.position.y).toBeCloseTo(first.y, 8);
      expect(child.alignment.controls.wallOverrides).toHaveLength(1); // no manufactured median walls
      expect(child.alignment.controls.wallOverrides![0].side).toBe('R');
      const a = childStationAt(axis, 100), b = childStationAt(axis, 700);
      expect(child.alignment.controls.structureOverrides).toEqual([{ s0: Math.min(a, b), s1: Math.max(a, b), kind: 1 }]);
    }
    expect(split.children[1].endpoints.a.tangent!.z).toBeLessThan(0);
    expect(split.corridor.correspondence[0].reverseS).toBe(resolved.plan.left.axis.path.length);
    expect(JSON.stringify({ corridor, routes, resolved })).toBe(before);
  });

  it('explicitly resets independent geometry while retaining route/source identities for atomic Store undo', () => {
    const { corridor, routes, resolved } = fixture(), split = splitMotorwayCommand(corridor, routes, resolved);
    const independent = structuredClone(split.children);
    if (independent[0].alignment.kind !== 'exact') throw new Error('test fixture');
    independent[0].alignment.controls.wallOverrides = [{ s0: 0, s1: 20, side: 'L', height: 5 }];
    independent[0].name = 'Edited direction';
    const snapshot = structuredClone(independent);
    const rejoin = rejoinMotorwayCommand(split.corridor, independent, { ...resolved, corridorRevision: split.corridor.revision }, true);
    expect(rejoin.corridor).not.toHaveProperty('retainedSpine');
    expect(rejoin.corridor.spine).toEqual(corridor.spine);
    expect(rejoin.children[0].alignment).toEqual({ kind: 'corridor', corridorId: corridor.id, direction: 'forward' });
    expect(rejoin.children[0].name).toBe('Edited direction');
    expect(rejoin.children.map(r => r.acousticSourceId)).toEqual(routes.map(r => r.acousticSourceId));
    expect(independent).toEqual(snapshot); // caller's previous whole-project snapshot remains undoable
    expect(() => rejoinMotorwayCommand(split.corridor, independent, { ...resolved, corridorRevision: split.corridor.revision }, false as true)).toThrow(/explicit reset/);
  });

  it('rejects stale or incomplete materialisation and never moves an external anchor silently', () => {
    const { corridor, routes, resolved } = fixture();
    expect(() => splitMotorwayCommand(corridor, routes, { ...resolved, corridorRevision: 0 })).toThrow(/Stale/);
    expect(() => splitMotorwayCommand(corridor, routes, { ...resolved, profiles: { ...resolved.profiles, reverse: resolved.profiles.forward } })).toThrow(/exact child path/);
    routes[0].endpoints = structuredClone(routes[0].endpoints);
    routes[0].endpoints.a.anchor = { kind: 'mission', portId: 'shared-centre-is-not-child-port' };
    expect(splitMotorwayCommand(corridor, routes, resolved).children[0].endpoints.a.binding).toBe('unresolved');
    routes[1].acousticSourceId = routes[0].acousticSourceId;
    expect(() => splitMotorwayCommand(corridor, routes, resolved)).toThrow(/physical acoustic/);
  });
});
