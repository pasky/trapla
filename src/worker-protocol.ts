// Every message between the main thread and an evaluation worker (src/worker.ts), in one place.
// Two workers run the same code: 'full' evaluates whole projects, 'preview' the dragged route; the full
// worker hands each full result to the preview worker over `port` (the base of its windowed previews).
// Project messages and their acceptance rule: core/project-protocol.ts.
import type { BuildingInfo } from './core/buildings';
import type { ScenarioParams } from './core/data/scenario';
import type { EndpointJunction } from './core/evaluate';
import type { GroundData } from './core/ground';
import type { ProjectEnvironment } from './core/project';
import type { NoiseBandOut, ProjectWorkerIn, ProjectWorkerOut } from './core/project-protocol';
import type { RoadNetData } from './core/roadnet';
import type { WaterData } from './core/watercourses';
import type { ProtectedData } from './core/data/protected';
import type { RailStructureData } from './core/rail-tunnels';

/** The scenario pack and its identities; sent once, before anything else (the height and land-cover grids
 * are transferred, not copied). */
export interface WorkerInit {
  type: 'init'; nx: number; ny: number; cell: number; base: number; scale: number; q: Uint16Array; lc: Uint8Array;
  a: { x: number; y: number }; b: { x: number; y: number }; buildings: [number, number, number][];
  binfo?: (BuildingInfo | null)[]; net?: RoadNetData; ground?: GroundData; scenario: ScenarioParams; watercourses?: WaterData;
  /** nature protection areas (the pack's protected.json) */
  protectedAreas?: ProtectedData;
  /** mapped railway tunnels (the pack's structures.json `rail`; `lc` is already without their underground cells) */
  railTunnels?: RailStructureData;
  projectEnvironment?: ProjectEnvironment; junctions?: EndpointJunction[];
  /** 'full' passes each full result on `port` to the 'preview' worker (base of its windowed previews). */
  role?: 'full' | 'preview'; port?: MessagePort;
}
/** Legacy road-net way of each mapped source (and where each mapped railway runs), whenever the pack's
 * road links are loaded. */
export interface WorkerSourceWays { type: 'source-ways'; ways: [string, number][]; rails?: [string, number[], number[]][] }
export type WorkerIn = WorkerInit | WorkerSourceWays | ProjectWorkerIn;
/** `ready` answers `init`. Evaluations answer the newest request only (older queued ones are dropped). */
export type WorkerOut = { type: 'ready' } | ProjectWorkerOut | NoiseBandOut;
