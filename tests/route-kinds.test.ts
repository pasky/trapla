import { expect, it } from 'vitest';
import type { ProjectDesign } from '../src/core/project';
import { assertProjectDesign } from '../src/core/project-validation';
import { buildInProject, ROAD_BUILD, type BuildKind } from '../src/ui/route-kinds';

const project: ProjectDesign = { schemaVersion: 1, scenarioId: 't', presetId: 't', packId: 't', objectData: 'o', transportData: null,
  routes: [], corridors: [], connections: [], buildingOverrides: [], mission: { id: 't', revision: 0, ports: [], connections: [] } };
const end = (x: number) => ({ position: { x, y: 0, z: 100 }, anchor: { kind: 'free' as const } });
let n = 0;
const newId = (prefix: string) => `${prefix}:${++n}`;

it('Build: a one-route kind is one new route; a kind building several routes edits the project once', () => {
  const road = buildInProject(ROAD_BUILD, project, end(0), end(500), newId);
  assertProjectDesign(road.project);
  expect(road.project.routes.map(r => r.id)).toEqual([road.activeRouteId]);
  expect(project.routes).toEqual([]); // the input is not modified
  const pair: BuildKind = { ...ROAD_BUILD, kind: 'motorway', label: 'Motorway', create: undefined,
    createInProject: (p, a, b, id) => {
      const one = ROAD_BUILD.create!(p, a, b, { routeId: id('route'), acousticSourceId: id('acoustic') });
      const two = { ...ROAD_BUILD.create!(p, b, a, { routeId: id('route'), acousticSourceId: id('acoustic') }), name: 'Other direction' };
      return { project: { ...p, routes: [...p.routes, one, two] }, activeRouteId: one.id };
    } };
  const both = buildInProject(pair, project, end(0), end(500), newId);
  expect(both.project.routes).toHaveLength(2);
  expect(both.activeRouteId).toBe(both.project.routes[0].id);
});
