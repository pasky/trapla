// A scenario's mission as a project: ONE bootstrap for the app (main.ts), the Node scripts and the tests.
// What the mission is (a road, a paired motorway, a railway) decides the starting project and what its
// ends must be joined by; everything else follows from the scenario row (data/scenario.ts).
import type { Design } from './evaluate';
import type { ScenarioParams } from './data/scenario';
import { NOISE } from './data/urban';
import type { ProjectDesign } from './project';
import { projectFromLegacyDesign, type LegacyProjectContext } from './project-legacy';
import { createMotorwayProject, motorwayMission } from './project-motorway';
import { createRailwayProject, railwayMission } from './project-railway';

/** The start: straight A→B with the automatic (norm-abiding) grade line — an honest, if expensive, bill. */
export function startDesign(): Design {
  return { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [], structureOverrides: [] };
}

/** The mission's two ends in pack metres: its own ports (railway stations on a mapped line), else the pack's. */
export function missionEnds(scenario: Pick<ScenarioParams, 'ports'>, meta: { A: { xy: [number, number] }; B: { xy: [number, number] } }) {
  const a = scenario.ports?.a.xy ?? meta.A.xy, b = scenario.ports?.b.xy ?? meta.B.xy;
  return { a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } };
}

export interface MissionProject {
  /** The scenario's starting line as the road widgets see it (deep-cloned: first start AND Start over). */
  initialRoad(): Design;
  /** The whole starting project (existing saves never receive these defaults). */
  initial(): ProjectDesign;
  /** What the project store checks saves against. */
  mission: ProjectDesign['mission'];
}

/** `context`: the legacy (ground-ended road) context of the mission's two ends; a corridor / railway then
 * owns the alignment between the same ports. */
export function missionProject(scenario: ScenarioParams, context: LegacyProjectContext): MissionProject {
  const initialRoad = (): Design => ({ ...startDesign(), ...structuredClone(scenario.initial ?? {}) });
  const roadBase = () => projectFromLegacyDesign({ ...startDesign(), category: 'S9.5', speed: 90 }, context);
  if (scenario.mode === 'motorway') return { initialRoad, mission: motorwayMission(context.mission),
    initial: () => createMotorwayProject(roadBase(), initialRoad(), { aadt: scenario.traffic, heavyShare: scenario.heavyShare ?? NOISE.heavyShare }) };
  if (scenario.mode === 'railway') return { initialRoad, mission: railwayMission(context.mission, scenario.railTraffic),
    initial: () => createRailwayProject(roadBase(), initialRoad(), scenario.railTraffic) };
  return { initialRoad, mission: context.mission, initial: () => projectFromLegacyDesign(initialRoad(), context) };
}
