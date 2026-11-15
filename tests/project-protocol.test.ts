import { expect, it } from 'vitest';
import { acceptsProjectMessage, isScorableProject, type ProjectWorkerOut } from '../src/core/project-protocol';
import type { ProjectResult, ProjectSnapshot, RouteDesign, RouteResult } from '../src/core/project';
import { hasProjectSave, projectStorageKeys, repairProjectEditor } from '../src/project-store-contract';

function route(id: string): RouteDesign {
  const end = (x: number) => ({ position: { x, y: 0, z: 100 }, anchor: { kind: 'free' as const }, binding: 'resolved' as const });
  return { id, name: id, role: 'auxiliary', revision: 2, kind: 'road', acousticSourceId: 'physical-road',
    endpoints: { a: end(0), b: end(100) }, alignment: { kind: 'pi', pis: [], vertical: { kind: 'auto', pins: [] }, controls: {} },
    specification: { kind: 'road', legalClass: 'I', policy: 'legacy-road', crossSection: 'S9.5', designSpeed: 90,
      operations: { aadt: 9000, heavyShare: 0.15, speed: 90 } } };
}
function snapshot(): ProjectSnapshot {
  return { epoch: 'load-a', revision: 4, design: { schemaVersion: 1, scenarioId: 'test', presetId: 'road', packId: 'test-pack', objectData: 'objects', transportData: null,
    routes: [route('a'), route('b')], corridors: [], connections: [], buildingOverrides: [],
    mission: { id: 'mission', revision: 0, ports: [], connections: [] } } };
}
function routeResult(id: string): RouteResult {
  return { routeId: id, revision: 2, engineeringRevision: 'geometry-2', surface: null, geometry: null, complete: true, valid: true, accepted: true,
    attributedCost: 100, dependencies: [], influence: [] };
}
function result(): ProjectResult {
  return { epoch: 'load-a', revision: 4, routes: { a: routeResult('a'), b: routeResult('b') }, works: { items: [] },
    cost: { total: 200, routes: { a: 100, b: 100 }, shared: 0, materialBalance: 'per-route' }, issues: [],
    acceptedReplacements: [], acceptedRenderReplacements: [], buildings: [], receivers: [], complete: true, valid: true,
    acousticScreen: { bounds: [], omittedDayEnergyUpperBound: 0, omittedNightEnergyUpperBound: 0, complete: true } };
}

it('rejects delayed results across edits, reload epochs, and active-route switches', () => {
  const current = snapshot();
  const message: ProjectWorkerOut = { type: 'project-preview', id: 9, identity: { epoch: current.epoch, revision: current.revision },
    routeId: 'a', routeRevision: 2, result: routeResult('a') };
  expect(acceptsProjectMessage(current, message, 'a')).toBe(true);
  expect(acceptsProjectMessage(current, message, 'b')).toBe(false);
  expect(acceptsProjectMessage({ ...current, revision: 5 }, message, 'a')).toBe(false);
  expect(acceptsProjectMessage({ ...current, epoch: 'reload' }, message, 'a')).toBe(false);
  expect(acceptsProjectMessage(current, { ...message, routeRevision: 1 }, 'a')).toBe(false);
  expect(acceptsProjectMessage(current, { ...message, result: routeResult('b') }, 'a')).toBe(false);
  const full: ProjectWorkerOut = { type: 'project-result', id: 10, result: result(), baseIdentity: null, changedRouteIds: ['a'], removedRouteIds: [], dependentRouteIds: [] };
  // Complete project publication does not depend on which route happens to be selected.
  expect(acceptsProjectMessage(current, full, 'b')).toBe(true);
  expect(acceptsProjectMessage({ ...current, revision: 5 }, full, 'b')).toBe(false);
});

it('never offers partial accounting, unaccepted proposals or unchecked noise as a score', () => {
  const r = result();
  expect(isScorableProject(r)).toBe(true);
  expect(isScorableProject({ ...r, complete: false })).toBe(false);
  expect(isScorableProject({ ...r, cost: { ...r.cost, total: null } })).toBe(false);
  expect(isScorableProject({ ...r, cost: { ...r.cost, total: NaN } })).toBe(false);
  expect(isScorableProject({ ...r, routes: { ...r.routes, b: { ...r.routes.b, accepted: false } } })).toBe(false);
  expect(isScorableProject({ ...r, acousticScreen: { ...r.acousticScreen, complete: false } })).toBe(false);
});

it('keeps different presets separate and offers recovery for unknown saved bytes', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null };
  const road = { scenarioId: 'd3', presetId: 'road' }, motorway = { scenarioId: 'd3', presetId: 'motorway' };
  values.set(projectStorageKeys(road).project, '{bad or future schema');
  expect(hasProjectSave(storage, road)).toBe(true);
  expect(hasProjectSave(storage, motorway)).toBe(false);
  expect(projectStorageKeys(road).recovery)
    .not.toBe(projectStorageKeys({ ...road, presetId: 'road.legacy-recovery' }).project);
  expect(projectStorageKeys({ scenarioId: 'a.b', presetId: 'c' }).project)
    .not.toBe(projectStorageKeys({ scenarioId: 'a', presetId: 'b.c' }).project);
});

it('repairs selection after deletion without mutating the undoable project', () => {
  const current = snapshot().design;
  const before = JSON.stringify(current);
  const repaired = repairProjectEditor({ activeRouteId: 'deleted', selection: { kind: 'route', routeId: 'deleted',
    target: { kind: 'pi', index: 0 } } }, current);
  expect(repaired).toEqual({ activeRouteId: 'a', selection: null });
  expect(JSON.stringify(current)).toBe(before);
  const kept = repairProjectEditor({ activeRouteId: 'b', selection: { kind: 'building', objectData: 'old-pack', index: 1 } }, current);
  expect(kept).toEqual({ activeRouteId: 'b', selection: null });
  for (const kind of ['pi', 'pin', 'vpi'] as const) {
    expect(repairProjectEditor({ activeRouteId: 'a', selection: { kind: 'route', routeId: 'a', target: { kind, index: 0 } } }, current)
      .selection).toBeNull();
  }
  expect(repairProjectEditor({ activeRouteId: 'a', selection: { kind: 'work', workId: 'removed-work' } }, current, result()).selection).toBeNull();
});
