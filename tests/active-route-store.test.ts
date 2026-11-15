import { describe, expect, it } from 'vitest';
import { ActiveRouteStore } from '../src/ui/active-route-store';
import { openProjectStore } from '../src/project-store';
import { projectFromLegacyDesign, type LegacyProjectContext } from '../src/core/project-legacy';
import type { Design } from '../src/core/evaluate';

function setup() {
  const seed: Design = { category: 'S9.5', speed: 80, pis: [{ x: 50, y: 5, r: null }], profileMode: 'auto', vpis: [] };
  const context: LegacyProjectContext = { scenarioId: 'fixture', presetId: 'road', packId: 'fixture', objectData: 'objects', transportData: null,
    endpoints: { a: { position: { x: 0, y: 0, z: 100 }, binding: 'resolved', anchor: { kind: 'free' } },
      b: { position: { x: 100, y: 0, z: 100 }, binding: 'resolved', anchor: { kind: 'free' } } },
    operations: { aadt: 9000, heavyShare: .15, speed: 80 }, mission: { id: 'fixture', revision: 0, ports: [], connections: [] } };
  const design = projectFromLegacyDesign(seed, context);
  const second = structuredClone(design.routes[0]); second.id = 'other'; second.acousticSourceId = 'other'; second.role = 'auxiliary'; second.name = 'Other road';
  second.endpoints.a.position.y = 100; second.endpoints.b.position.y = 100;
  if (second.alignment.kind === 'pi') second.alignment.pis[0].y = 105;
  design.routes.push(second);
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  const { store: project } = openProjectStore({ storage, namespace: context, objectData: 'objects', transportData: null,
    pricingData: 'fixture', mission: context.mission, initial: () => design, epoch: 'fixture' });
  const fresh = projectFromLegacyDesign(seed, context);
  const adapter = new ActiveRouteStore(project!, () => fresh);
  return { project: project!, adapter, seed, data, fresh };
}

describe('active road widgets on project history', () => {
  it('switches without writes/undo and edits only the active route with one settled notification', () => {
    const { project, adapter, data } = setup(), before = [...data], snapshot = project.snapshot;
    expect(adapter.switchRoute('other')).toBe(true);
    expect(project.snapshot).toBe(snapshot); expect([...data]).toEqual(before); expect(project.canUndo()).toBe(false);
    expect(adapter.route?.endpoints.a.position.y).toBe(100);
    expect(adapter.design).toBe(adapter.design); // one adapter copy, not one clone per widget read
    const events: boolean[] = []; adapter.on((_d, committed) => events.push(committed));
    adapter.update(d => { d.pis[0].y += 10; });
    expect(events).toEqual([true]);
    const first = project.snapshot.design.routes[0];
    expect(first.alignment.kind === 'pi' && first.alignment.pis[0].y).toBe(5);
    expect(adapter.design.pis[0].y).toBe(115);
    adapter.switchRoute(first.id); adapter.undo();
    expect(adapter.activeRouteId).toBe(first.id); adapter.switchRoute('other'); expect(adapter.design.pis[0].y).toBe(105);
  });

  it('keeps drags atomic and refuses switching halfway through a transaction', () => {
    const { adapter, project } = setup(); const events: boolean[] = [];
    adapter.on((_d, committed) => events.push(committed));
    adapter.update(d => { d.pis[0].x = 60; }, false);
    adapter.update(d => { d.pis[0].x = 70; }, false);
    expect(adapter.switchRoute('other')).toBe(false);
    expect(project.canUndo()).toBe(false);
    adapter.commit(); expect(events).toEqual([false, false, true]);
    adapter.undo(); expect(adapter.design.pis[0].x).toBe(50); expect(project.canUndo()).toBe(false);
  });

  it('Start over restores the whole initial project in one undo step, even with a side road active', () => {
    const { adapter, project, seed } = setup();
    adapter.update(d => { d.pis[0].x = 70; d.gradePins = [{ s: 30, z: 102 }]; d.buildingOverrides = [{ j: 3, action: 'keep' }]; });
    adapter.switchRoute('other');
    adapter.reset();
    expect(project.snapshot.design.routes.map(r => r.id)).toEqual(['route:legacy-mission']);
    expect(adapter.activeRouteId).toBe('route:legacy-mission');
    expect(adapter.design.pis).toEqual(seed.pis); expect(adapter.design.gradePins ?? []).toEqual([]);
    expect(project.snapshot.design.buildingOverrides).toEqual([]);
    adapter.undo();
    expect(project.snapshot.design.routes.length).toBe(2); expect(project.snapshot.design.buildingOverrides).toEqual([{ j: 3, action: 'keep' }]);
  });

  it('refuses to turn an imported reference into PI controls', () => {
    const { adapter, project } = setup(), route = structuredClone(project.snapshot.design.routes[1]);
    route.alignment = { kind: 'reference', path: [{ x: 0, y: 100, s: 0, elevation: { kind: 'ground' } },
      { x: 100, y: 100, s: 100, elevation: { kind: 'ground' } }], controls: {}, vertical: { kind: 'reference' }, provenance: 'imported' };
    project.dispatch({ type: 'replace-route', route }); adapter.switchRoute('other');
    const before = project.snapshot;
    expect(adapter.read()).toBeNull(); adapter.update(d => { d.pis.push({ x: 50, y: 110, r: null }); });
    expect(project.snapshot).toBe(before);
  });
});
