// Node-side loader for the scenario pack (bench + sanity scripts).
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { BuildingIndex } from '../src/core/buildings';
import { DEFAULT_SCENARIO, scenarioParams } from '../src/core/data/scenario';
import { RoadNet } from '../src/core/roadnet';
import { decodeHeights, Terrain } from '../src/core/terrain';
import { endpointJunctions, packIdentities } from '../src/scenario';
import type { TrafficCensus } from '../src/core/traffic-census';
import type { EvalContext } from '../src/core/evaluate';
import type { ScenarioParams } from '../src/core/data/scenario';
import type { ProjectEvalContext } from '../src/core/project-evaluate';
import { makeLegacyProjectContext } from '../src/core/project-legacy';
import { missionEnds, missionProject } from '../src/core/project-mission';

/** SCENARIO=<id> selects public/scenarios/<id> (default d11); `scenario` = its game parameters */
export function loadPack(dir = `public/scenarios/${process.env.SCENARIO ?? DEFAULT_SCENARIO}`) {
  const meta = JSON.parse(readFileSync(`${dir}/meta.json`, 'utf8'));
  const hb = gunzipSync(readFileSync(`${dir}/${meta.heights.file}`));
  const delta = new Int16Array(hb.buffer, hb.byteOffset, hb.byteLength / 2);
  const q = decodeHeights(delta, meta.nx, meta.ny);
  const lc = new Uint8Array(gunzipSync(readFileSync(`${dir}/${meta.landcover.file}`)));
  const terrain = new Terrain({ nx: meta.nx, ny: meta.ny, cell: meta.cell, base: meta.heights.base, scale: meta.heights.scale, q, lc,
    ground: meta.ground ? { ...meta.ground, ids: new Uint8Array(gunzipSync(readFileSync(`${dir}/${meta.ground.file}`))) } : undefined,
    watercourses: meta.watercourses ? JSON.parse(gunzipSync(readFileSync(`${dir}/${meta.watercourses.file}`)).toString()) : undefined });
  const ov = JSON.parse(readFileSync(`${dir}/overlays.json`, 'utf8'));
  return {
    meta, scenario: scenarioParams(meta.id), terrain, overlays: ov, buildings: new BuildingIndex(ov.buildings, ov.binfo),
    roads: ov.net ? new RoadNet(ov.net) : undefined,
    /** The pack's traffic census (pipeline/build_traffic.py), if it ships one. */
    census: existsSync(`${dir}/traffic.json`) ? JSON.parse(readFileSync(`${dir}/traffic.json`, 'utf8')) as TrafficCensus : null,
    /** Declared end connections (none for D11); spread into every EvalContext built from this pack. */
    junctions: endpointJunctions(meta),
  };
}

export type NodePack = ReturnType<typeof loadPack>;

/** The single-road evaluator's context of a pack, as the app builds it: the mission's ends (a preset's own
 * ports, else the pack's A and B) and the pack's declared end junctions (none at a preset's own ports). */
export function evalContext(pack: NodePack, scenario: ScenarioParams = pack.scenario): EvalContext {
  const { terrain, buildings, roads } = pack;
  return { terrain, scenario, buildings, roads, ...missionEnds(scenario, pack.meta), junctions: scenario.ports ? [] : pack.junctions };
}

/** The project evaluator's context and the mission's starting project for a preset, with the same data
 * identities as src/main.ts (so a Node bill is the browser's). `dir`: the pack's folder (transport-meta.json). */
export function projectContext(pack: NodePack, scenario: ScenarioParams = pack.scenario, dir = `public/scenarios/${pack.meta.id}`) {
  const { meta, overlays } = pack, legacy = evalContext(pack, scenario), presetId = scenario.presetId ?? scenario.id;
  const sidecar = `${dir}/transport-meta.json`;
  const { objectData, transportData, pricingData, waterData, terrainData } = packIdentities(meta, overlays,
    meta.transport ?? (existsSync(sidecar) ? JSON.parse(readFileSync(sidecar, 'utf8')) : null));
  const context = makeLegacyProjectContext(legacy, { presetId, packId: meta.id, objectData, transportData });
  const ctx: ProjectEvalContext = { legacy, environment: { objectData, transportData, pricingData, waterData, terrainData, terrainClass: scenario.terrainClass } };
  return { ctx, context, ...missionProject(scenario, context) };
}
