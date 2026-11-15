import { expect, it } from 'vitest';
import { COST_MODEL_VERSION } from '../src/core/data/prices';
import type { CorridorDesign, ProjectResult, RouteDesign } from '../src/core/project';
import type { Design } from '../src/core/evaluate';
import { legacyDesignForRoute, projectFromLegacyDesign, replaceRouteFromLegacy, type LegacyProjectContext } from '../src/core/project-legacy';
import { assertProjectDesign } from '../src/core/project-validation';
import { loadProjectSave, projectMissionKey } from '../src/project-persistence';
import { openProjectStore, type ProjectStoreOptions } from '../src/project-store';
import { projectStorageKeys, repairProjectEditor } from '../src/project-store-contract';

const original: Design = { category: 'S9.5', speed: 80, pis: [{ x: 500, y: 120, r: null }], profileMode: 'auto',
  vpis: [{ s: 0, z: 100, r: null }, { s: 1000, z: 101, r: null }], gradePins: [{ s: 300, z: 102 }],
  wallOverrides: [{ s0: 100, s1: 150, side: 'L', height: 4 }], buildingOverrides: [{ j: 3, action: 'keep' }],
  crossingOverrides: [{ roadId: 7, type: 'bridge' }], objectData: 'objects-a' };
const context: LegacyProjectContext = { scenarioId: 'test', presetId: 'road', packId: 'test', objectData: 'objects-a', transportData: null,
  endpoints: { a: { position: { x: 0, y: 100, z: 100 }, binding: 'resolved', anchor: { kind: 'mission', portId: 'a' } },
    b: { position: { x: 1000, y: 100, z: 101 }, binding: 'resolved', anchor: { kind: 'mission', portId: 'b' } } },
  mission: { id: 'test-road', revision: 0, ports: [{ id: 'a', name: 'Start', position: { x: 0, y: 100, z: 100 } },
    { id: 'b', name: 'End', position: { x: 1000, y: 100, z: 101 } }],
    connections: [{ from: 'a', to: 'b', direction: 'both', kinds: ['road'], maxTravelMin: 3, demand: { kind: 'road', aadt: 9000 } }] },
  operations: { aadt: 9000, heavyShare: 0.15, speed: 90 } };
function setup() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const options: ProjectStoreOptions = { storage, namespace: { scenarioId: 'test', presetId: 'road' },
    objectData: 'objects-a', transportData: null, pricingData: 'prices', mission: context.mission,
    legacy: { key: 'old', context, compatibleSemantics: true }, initial: () => projectFromLegacyDesign(original, context), epoch: 'load-1' };
  return { data, storage, options, keys: projectStorageKeys(options.namespace) };
}

it('migrates current and compatible best before any legacy write, preserving exact recoverable bytes and controls', () => {
  const { data, options, keys } = setup();
  const raw = JSON.stringify(original, null, 3);
  const best = JSON.stringify({ design: { ...original, speed: 90 }, cost: 123, at: 'then', model: COST_MODEL_VERSION, pricingData: 'prices' });
  data.set('old.design', raw); data.set('old.best', best);
  const read = loadProjectSave(options);
  expect(read.status).toBe('migrated');
  expect(data.size).toBe(2); // Read is pure; no Store constructor has normalised or overwritten anything.
  const { load, store } = openProjectStore(options);
  expect(load.status).toBe('migrated');
  expect(store!.snapshot.design.routes[0].specification.designSpeed).toBe(80);
  expect(legacyDesignForRoute(store!.snapshot.design, 'route:legacy-mission')).toEqual(original);
  expect(store!.best?.design.routes[0].specification.designSpeed).toBe(90);
  expect(JSON.parse(data.get(keys.recovery)!)).toEqual({ design: raw, best });
  expect(data.get('old.design')).toBe(raw); expect(data.get('old.best')).toBe(best);
  expect(openProjectStore({ ...options, epoch: 'reload' }).store!.snapshot.epoch).toBe('reload');
  expect(loadProjectSave({ ...options, pricingData: 'changed' })).toMatchObject({ status: 'loaded', save: { best: null } });
});

it('never overwrites malformed or newer project/legacy saves, including quota failure before recovery', () => {
  const { data, storage, options, keys } = setup();
  for (const raw of ['{ broken', JSON.stringify({ schemaVersion: 999, design: options.initial() })]) {
    data.set(keys.project, raw);
    expect(openProjectStore(options).store).toBeNull();
    expect(data.get(keys.project)).toBe(raw);
  }
  data.delete(keys.project); data.set('old.design', '{ broken legacy');
  expect(openProjectStore(options).store).toBeNull();
  expect(data.has(keys.project)).toBe(false);
  data.set('old.design', JSON.stringify(original));
  const failing = { ...storage, setItem: (key: string, value: string) => {
    if (key === keys.recovery) throw new Error('quota'); storage.setItem(key, value);
  } };
  expect(() => openProjectStore({ ...options, storage: failing })).toThrow('quota');
  expect(data.has(keys.project)).toBe(false);
  expect(JSON.parse(data.get('old.design')!)).toEqual(original);
});

it('keeps source geometry and decisions unresolved on pack changes instead of rebinding indices', () => {
  const { options } = setup();
  const store = openProjectStore(options).store!;
  store.begin(); store.update(d => {
    d.transportData = 'transport-a';
    d.routes[0].source = { binding: 'resolved', transferredWorkIds: [], intervals: [{ transportData: 'transport-a', sourceId: 'way:1', s0: 5, s1: 50 }] };
    d.routes[0].endpoints.a.anchor = { kind: 'source', location: { transportData: 'transport-a', sourceId: 'way:1', s: 5 } };
  }); store.commit();
  const loaded = loadProjectSave({ ...options, objectData: 'objects-b', transportData: 'transport-b' });
  expect(loaded.status).toBe('needs-repair');
  if (loaded.status !== 'needs-repair') throw new Error('expected recovery');
  expect(loaded.save.design.routes[0].source?.binding).toBe('unresolved');
  expect(loaded.save.design.routes[0].endpoints.a.binding).toBe('unresolved');
  expect(loaded.save.design.buildingOverrides).toEqual(original.buildingOverrides);
  expect(loaded.save.design.objectData).toBe('objects-a');
  expect(loaded.save.design.routes[0].alignment).toEqual(store.snapshot.design.routes[0].alignment);
});

it('makes promotion one atomic undo step, cancels drafts, and reloads stable route/source identities', () => {
  const { options, data, keys } = setup();
  const store = openProjectStore(options).store!;
  const initial = data.get(keys.project);
  store.begin();
  const added = structuredClone(store.snapshot.design.routes[0]);
  added.id = 'route:side'; added.role = 'auxiliary'; added.acousticSourceId = 'acoustic:side';
  added.endpoints.a.anchor = added.endpoints.b.anchor = { kind: 'free' };
  store.dispatch({ type: 'promote', routes: [added], connections: [{ id: 'connection:1', revision: 0, kind: 'junction',
    position: { x: 500, y: 100, z: 100 }, ports: [{ kind: 'route', routeId: 'route:side', s: 500 }, { kind: 'route', routeId: 'route:legacy-mission', s: 500 }] }] });
  expect(data.get(keys.project)).toBe(initial);
  expect(store.canUndo()).toBe(false);
  store.cancel(); expect(store.snapshot.design.routes).toHaveLength(1);
  expect(store.snapshot.design.connections).toHaveLength(0);
  store.dispatch({ type: 'promote', routes: [added], connections: [] });
  const committedRevision = store.snapshot.revision;
  expect(store.canUndo()).toBe(true);
  store.undo(); expect(store.snapshot.design.routes).toHaveLength(1);
  expect(store.snapshot.revision).toBeGreaterThan(committedRevision);
  store.begin();
  store.update(d => { d.routes[0].specification.designSpeed = 90; });
  store.update(d => { d.routes[0].specification.designSpeed = 80; });
  store.commit(); // out-and-back drag is not an edit and must not truncate redo.
  expect(store.canUndo()).toBe(false); expect(store.canRedo()).toBe(true);
  store.redo(); expect(store.snapshot.design.routes[1].id).toBe('route:side');
  const reloaded = openProjectStore({ ...options, epoch: 'load-2' }).store!;
  expect(reloaded.snapshot.design).toEqual(store.snapshot.design);
  expect(reloaded.snapshot.epoch).not.toBe(store.snapshot.epoch);
  expect(() => { reloaded.snapshot.design.routes.pop(); }).toThrow();
});

it('rolls back failed commands without half-created routes or undo entries', () => {
  const { options, data, keys } = setup(); const store = openProjectStore(options).store!;
  const before = data.get(keys.project);
  const invalid = structuredClone(store.snapshot.design.routes[0]); invalid.id = 'new';
  (invalid as unknown as { kind: string }).kind = 'railway';
  expect(() => store.dispatch({ type: 'create-route', route: invalid })).toThrow('route');
  expect(store.snapshot.design.routes).toHaveLength(1); expect(store.canUndo()).toBe(false);
  expect(store.inTransaction).toBe(false); expect(data.get(keys.project)).toBe(before);
  store.begin();
  expect(() => store.update(d => { d.routes[0].endpoints.a.position.z = NaN; })).toThrow();
  expect(store.snapshot.design.routes[0].endpoints.a.position.z).toBe(100);
  expect(() => store.update(d => {
    if (d.routes[0].alignment.kind === 'pi') d.routes[0].alignment.pis = new Array(2);
  })).toThrow('sparse');
  expect(data.get(keys.project)).toBe(before);
  store.cancel();
});

it('preserves operating speed and external anchors during legacy editing but rejects foreign object indices', () => {
  const d = setup().options.initial(), route = d.routes[0];
  const other = structuredClone(route); other.id = 'route:other'; other.role = 'auxiliary';
  d.routes.push(other);
  route.endpoints.a.anchor = { kind: 'route', routeId: other.id, s: 20 };
  if (route.kind !== 'road') throw new Error('fixture');
  route.specification.operations.speed = 40;
  const legacy = legacyDesignForRoute(d, route.id);
  const updated = replaceRouteFromLegacy(d, route.id, legacy);
  expect(updated.routes[0].endpoints.a).toEqual(route.endpoints.a);
  expect(updated.routes[0].specification.operations).toEqual(route.specification.operations);
  expect(() => replaceRouteFromLegacy(d, route.id, { ...legacy, objectData: 'foreign',
    buildingOverrides: [{ j: 7, action: 'keep' }] })).toThrow('Foreign object');
  expect(d.buildingOverrides).toEqual(original.buildingOverrides);
});

it('repairs stale per-anchor source fingerprints even when the project fingerprint itself matches', () => {
  const { options, data, keys } = setup();
  const d = options.initial(); d.transportData = 'transport-a';
  d.routes[0].endpoints.a.anchor = { kind: 'source', location: { transportData: 'transport-old', sourceId: 'way:1', s: 0 } };
  data.set(keys.project, JSON.stringify({ schemaVersion: 1, design: d, best: null }));
  const loaded = loadProjectSave({ ...options, transportData: 'transport-a' });
  expect(loaded.status).toBe('needs-repair');
  if (loaded.status !== 'needs-repair') throw new Error('fixture');
  expect(loaded.save.design.routes[0].endpoints.a.binding).toBe('unresolved');
  expect(() => assertProjectDesign(d)).toThrow('source fingerprint');
  data.set(keys.project, JSON.stringify({ schemaVersion: 1, design: d, best: { design: d, cost: 100, at: 'then',
    model: COST_MODEL_VERSION, evaluationVersion: 1, pricingData: 'prices', missionData: projectMissionKey(d) } }));
  expect(openProjectStore({ ...options, transportData: 'transport-a' })).toMatchObject({
    load: { status: 'needs-repair' }, store: { best: null },
  });
});

it('does not reinterpret a selected pin index after undo restores another pin before it', () => {
  const { options } = setup(); const store = openProjectStore(options).store!;
  store.begin(); store.update(d => {
    const a = d.routes[0].alignment;
    if (a.kind === 'pi' && a.vertical.kind === 'auto') a.vertical.pins.unshift({ s: 100, z: 101 });
  }); store.commit();
  const r = store.snapshot.design.routes[0];
  const state = { activeRouteId: r.id, selection: { kind: 'route' as const, routeId: r.id,
    target: { kind: 'pin' as const, index: 0, routeRevision: r.revision } } };
  expect(repairProjectEditor(state, store.snapshot.design).selection).not.toBeNull();
  store.undo(); // index 0 still exists, but now denotes the other pin.
  expect(repairProjectEditor(state, store.snapshot.design).selection).toBeNull();
});

it('accepts best only for the current committed whole-project snapshot and reconciled attribution', () => {
  const { options } = setup(); const store = openProjectStore(options).store!;
  const snapshot = store.snapshot, route = snapshot.design.routes[0];
  const result: ProjectResult = { epoch: snapshot.epoch, revision: snapshot.revision,
    routes: { [route.id]: { routeId: route.id, revision: route.revision, engineeringRevision: 'settled', surface: null, geometry: null,
      complete: true, valid: true, accepted: true, attributedCost: 100, dependencies: [], influence: [] } },
    works: { items: [] }, cost: { total: 100, routes: { [route.id]: 100 }, shared: 0, materialBalance: 'per-route' }, issues: [],
    acceptedReplacements: [], acceptedRenderReplacements: [], buildings: [], receivers: [], complete: true, valid: true,
    acousticScreen: { complete: true, bounds: [], omittedDayEnergyUpperBound: 0, omittedNightEnergyUpperBound: 0 } };
  store.begin(); expect(store.offerBest(result)).toBe(false); store.cancel();
  expect(store.offerBest({ ...result, cost: { ...result.cost, total: 99 } })).toBe(false);
  expect(store.offerBest(result)).toBe(true);
  store.dispatch({ type: 'set-building', index: 4, action: 'keep' });
  expect(store.offerBest({ ...result, cost: { ...result.cost, total: 90, routes: { [route.id]: 90 } } })).toBe(false);
  expect(openProjectStore(options).store!.best?.cost).toBe(100);
});

it('checks corridor endpoint and spine references, including their source repair status', () => {
  const { options, data, keys } = setup(), d = options.initial();
  const spine = structuredClone(d.routes[0].alignment);
  if (spine.kind === 'corridor') throw new Error('fixture');
  const child = (id: string, direction: 'forward' | 'reverse'): RouteDesign => ({ ...structuredClone(d.routes[0]), id, kind: 'motorway',
    alignment: { kind: 'corridor', corridorId: 'corridor', direction },
    specification: { kind: 'motorway', policy: 'foundation', crossSection: 'D27.5', designSpeed: 130, operations: context.operations } });
  d.routes.push(child('forward', 'forward'), child('reverse', 'reverse'));
  const c: CorridorDesign = { id: 'corridor', revision: 0, kind: 'motorway', mode: 'paired', spine,
    endpoints: structuredClone(context.endpoints), children: { forward: 'forward', reverse: 'reverse' }, formationPolicy: 'foundation', correspondence: [] };
  d.corridors.push(c);
  c.endpoints.a.anchor = { kind: 'route', routeId: 'missing', s: 0 };
  expect(() => assertProjectDesign(d)).toThrow('dangling endpoint');
  c.endpoints.a.anchor = { kind: 'free' };
  spine.controls.crossings = [{ choice: 'bridge', target: { kind: 'route', routeId: 'missing', s0: 1, s1: 2 } }];
  expect(() => assertProjectDesign(d)).toThrow('dangling crossing');
  spine.controls.crossings = [];
  d.transportData = 'transport-a';
  c.endpoints.a.anchor = { kind: 'source', location: { transportData: 'old', sourceId: 'way:1', s: 0 } };
  data.set(keys.project, JSON.stringify({ schemaVersion: 1, design: d, best: null }));
  const loaded = loadProjectSave({ ...options, transportData: 'transport-a' });
  expect(loaded.status).toBe('needs-repair');
  if (loaded.status === 'needs-repair') expect(loaded.save.design.corridors[0].endpoints.a.binding).toBe('unresolved');
});

it('rejects orphan paired controls and incompatible corridor children at the persistence boundary', () => {
  const { options } = setup(); const d = options.initial();
  d.routes[0].alignment = { kind: 'corridor', corridorId: 'missing', direction: 'forward' };
  expect(() => assertProjectDesign(d)).toThrow('orphan');
  (d.routes[0].alignment as unknown as { controls: object }).controls = { wallOverrides: [] };
  expect(() => assertProjectDesign(d)).toThrow('route');
});
