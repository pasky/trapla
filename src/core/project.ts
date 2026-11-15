// C0 project contract. Persistent data only; no renderer, DOM or mode-default physics.
import type { BuildingOverride } from './build-controls';
import type { Violation } from './checks';
import type { CategoryId, TerrainClass } from './data/categories';
import type { Design, Result } from './evaluate';
import type { Element, Vec2 } from './horizontal';
import type { TransportRenderInterval } from './project-transport';

export const PROJECT_SCHEMA_VERSION = 1 as const;
/** Independent from schema and price-table versions: changes when project accounting changes. */
export const PROJECT_EVALUATION_VERSION = 1 as const;
export type RouteId = string;
export type CorridorId = string;
export type SourceId = string;
export type WorkId = string;
export type AcousticSourceId = string;
export type ConnectionId = string;
export type RouteKind = 'road' | 'motorway' | 'railway';
export interface XYZ extends Vec2 { z: number }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
export interface SourceLocation { transportData: string; sourceId: SourceId; s: number }
/** Canonical source chainage, always increasing; reversal belongs to traversal, not ownership. */
export interface SourceInterval { transportData: string; sourceId: SourceId; s0: number; s1: number }
export type Anchor =
  | { kind: 'free' }
  | { kind: 'source'; location: SourceLocation; nodeId?: string }
  | { kind: 'route'; routeId: RouteId; s: number }
  | { kind: 'mission'; portId: string };
export interface EndpointConstraint {
  position: XYZ;
  anchor: Anchor;
  /** Unit travel-direction tangent, when constrained; never inferred from ground height. */
  tangent?: XYZ;
  binding: 'resolved' | 'unresolved';
}
export interface EndpointPair { a: EndpointConstraint; b: EndpointConstraint }
export type RouteControls = Omit<Design, 'category' | 'speed' | 'buildingOverrides' | 'objectData' | 'pis'>;
export type AlignmentDesign =
  | { kind: 'pi'; pis: Design['pis']; controls: RouteControls }
  | { kind: 'reference'; path: ReferencePoint[]; controls: RouteControls;
      provenance: 'imported' | 'built-work' | 'independent-carriageway' }
  | { kind: 'exact'; path: { elements: Element[]; length: number }; controls: RouteControls }
  | { kind: 'corridor'; corridorId: CorridorId; direction: 'forward' | 'reverse' };
/** Explicit imported geometry: no invisible PI fitting. s is local horizontal chainage. */
export interface ReferencePoint extends Vec2 {
  s: number;
  elevation: { kind: 'ground' } | { kind: 'known'; z: number; evidence: string } | { kind: 'unresolved' };
}
export interface RoadOperations { aadt: number; heavyShare: number; speed: number }
export interface RoadSpec {
  kind: 'road';
  legalClass: 'I' | 'II' | 'III' | 'local' | 'service' | 'track';
  /** Policy ID selects sourced checks/pricing, not a category guessed from width. */
  policy: string;
  crossSection: Exclude<CategoryId, 'D27.5'> | 'existing';
  existingWidth?: number;
  designSpeed: number;
  operations: RoadOperations;
}
export interface MotorwaySpec {
  kind: 'motorway'; policy: string; crossSection: string; designSpeed: number;
  /** Per carriageway demand. Corridor demand is not copied in full to each child. */
  operations: RoadOperations;
}
export interface RailwaySpec {
  kind: 'railway'; policy: string; designSpeed: number; gaugeMm: number;
  tracks: 1 | 2; electrification: 'none' | 'AC25kV' | 'DC3kV' | 'other';
  operations: { passengerDay: number; passengerNight: number; freightDay: number; freightNight: number;
    passengerSpeed: number; freightSpeed: number };
}
export type RouteSpecification = RoadSpec | MotorwaySpec | RailwaySpec;
export interface SourceReplacement {
  intervals: SourceInterval[];
  binding: 'resolved' | 'unresolved';
  /** Promotion of derived work transfers this identity, never charges a second copy. */
  transferredWorkIds: WorkId[];
}
interface RouteBase {
  id: RouteId; name: string; role: 'mission' | 'auxiliary'; revision: number;
  endpoints: EndpointPair; source?: SourceReplacement; alignment: AlignmentDesign;
  /** Physical source survives an editor split. Distinct carriageways have distinct IDs. */
  acousticSourceId: AcousticSourceId;
}
export type RouteDesign = RouteBase & (
  | { kind: 'road'; specification: RoadSpec }
  | { kind: 'motorway'; specification: MotorwaySpec }
  | { kind: 'railway'; specification: RailwaySpec }
);
export type OwnedAlignment = Exclude<AlignmentDesign, { kind: 'corridor' }>;
interface CorridorBase {
  id: CorridorId; revision: number; kind: 'motorway';
  endpoints: EndpointPair;
  /** Paired children reference the spine; independent children own materialised exact paths. */
  children: { forward: RouteId; reverse: RouteId };
  formationPolicy: string;
  correspondence: { spineS: number; forwardS: number; reverseS: number }[];
}
export type CorridorDesign = CorridorBase & (
  | { mode: 'paired'; spine: OwnedAlignment }
  | { mode: 'independent'; retainedSpine: OwnedAlignment }
);
export type ConnectionPort = { kind: 'route'; routeId: RouteId; s: number } | { kind: 'source'; location: SourceLocation };
export interface ConnectionDesign {
  id: ConnectionId; revision: number; kind: 'continuation' | 'junction' | 'interchange';
  ports: ConnectionPort[];
  /** Explicit intent; geometric contact alone never establishes graph connectivity. */
  position: XYZ;
}
export interface MissionRequirements {
  id: string; revision: number;
  ports: { id: string; name: string; position: XYZ }[];
  connections: { from: string; to: string; direction: 'both' | 'forward'; kinds: RouteKind[];
    maxTravelMin?: number; demand?: { kind: 'road'; aadt: number } | { kind: 'railway'; trainsPerDay: number } }[];
}
export interface ProjectDesign {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  scenarioId: string;
  /** Mission/preset namespace is distinct from place and pack (road/motorway saves coexist). */
  presetId: string;
  packId: string;
  /** Existing building/legacy-road identity: unchanged for D11 compatibility. */
  objectData: string;
  /** Separate additive topology identity. null on legacy packs without transport metadata. */
  transportData: string | null;
  routes: RouteDesign[]; corridors: CorridorDesign[]; connections: ConnectionDesign[];
  buildingOverrides: BuildingOverride[];
  mission: MissionRequirements;
}
export interface ProjectIdentity {
  /** New on load/reset/context replacement. Undo increments revision; it never rewinds it. */
  epoch: string;
  revision: number;
}
export interface ProjectSnapshot extends ProjectIdentity { design: ProjectDesign }
export interface ProjectEnvironment {
  objectData: string; transportData: string | null; terrainData: string; pricingData: string; waterData: string;
  terrainClass: TerrainClass;
}
export interface ProjectIssue {
  code: string;
  scope: { routeIds: RouteId[]; workId?: WorkId; connectionId?: ConnectionId; buildingIndex?: number };
  /** Existing plain-word violation payload; IDs/codes are not player labels. */
  violation: Violation;
  blocking: 'invalid' | 'incomplete';
}
export interface TransportSurface {
  routeId: RouteId; revision: number;
  /** Actual built elevations; ground is a separate terrain query. */
  points: (XYZ & { s: number; halfWidth: number; structure: 'ground' | 'bridge' | 'tunnel' })[];
}
export interface WorkProposal {
  id: WorkId; owner: RouteId | CorridorId; participants: RouteId[];
  kind: 'formation' | 'structure' | 'connection' | 'property' | 'noise' | 'land';
  surfaces: TransportSurface[];
  claims: SourceInterval[];
  /** Final priced quantities must use this same geometry. */
  cost: number;
  dependencies: ProjectDependency[];
}
export interface SharedWork extends WorkProposal { accepted: boolean }
export interface SharedWorkLedger { items: SharedWork[] }
export interface ProjectDependency {
  kind: 'route' | 'source' | 'work' | 'building' | 'corridor'; id: string; revision: string;
}
export interface EngineeringProposal {
  routeId: RouteId; revision: number; surface: TransportSurface;
  candidateExclusions: SourceInterval[];
  works: WorkProposal[]; issues: ProjectIssue[]; influence: Bounds[];
  dependencies: ProjectDependency[];
  /** Proposals are not final bills: project acquisition/noise/remedies still need reconciliation. */
  phase: 'engineering';
}
/** Linear energy at one common receiver height, BEFORE project acquisitions. Contributions include
 * individually quiet sources. Max across route fragments sharing sourceId, sum across physical sources;
 * never sum dB/excess or use the editor route ID as a physical source. No finite-segment correction here. */
export interface AcousticContribution {
  sourceId: AcousticSourceId; routeId: RouteId; buildingIndex: number; height: number;
  dayEnergy: number; nightEnergy: number;
  policy: string;
}
export interface ProjectReceiver {
  buildingIndex: number; height: number; contributions: AcousticContribution[];
  dayDb: number; nightDb: number; dayLimit: number; nightLimit: number;
  action: 'retain' | 'demolish' | 'buy';
}
export interface AcousticScreen {
  bounds: Bounds[];
  /** Bound on omitted total linear energy, not an individual-source threshold. */
  omittedDayEnergyUpperBound: number; omittedNightEnergyUpperBound: number;
  complete: boolean;
}
export interface RouteResult {
  routeId: RouteId; revision: number; surface: TransportSurface | null;
  /** Present only for the road kernel. Other modes never impersonate road Result. */
  legacy?: Result;
  complete: boolean; valid: boolean; accepted: boolean;
  attributedCost: number | null;
  dependencies: ProjectDependency[]; influence: Bounds[];
}
export interface ProjectCost {
  /** null while reconciliation is incomplete; no partial bill can become a best. */
  total: number | null;
  routes: Record<RouteId, number>; shared: number;
  materialBalance: 'per-route';
}
export interface ProjectBuildingOutcome {
  buildingIndex: number; action: 'retain' | 'demolish' | 'buy';
  /** One physical acquisition owner after the global mitigation/acquisition loop. */
  workId?: WorkId; cost: number;
}
export interface ProjectResult extends ProjectIdentity {
  routes: Record<RouteId, RouteResult>;
  works: SharedWorkLedger; cost: ProjectCost; issues: ProjectIssue[];
  acceptedReplacements: SourceInterval[];
  acceptedRenderReplacements: TransportRenderInterval[];
  buildings: ProjectBuildingOutcome[];
  receivers: ProjectReceiver[];
  acousticScreen: AcousticScreen;
  complete: boolean; valid: boolean;
}
/** Runtime mode seam: no default road policy for unknown kinds. The orchestrator owns the bounded
 * engineering → reconcile → finalize loop, not the renderer or a sum of completed single-road bills. */
export interface RouteKernel {
  kind: RouteKind; policy: string;
  propose(route: RouteDesign, input: RouteKernelInput): EngineeringProposal;
  finalize(proposal: EngineeringProposal, decisions: ProjectDecisions): RouteResult;
}
export interface RouteKernelInput {
  environment: ProjectEnvironment;
  /** All claims in this jointly dependent candidate group, not just the current route's claims.
   * Authoritative ownership is derived atomically after feasibility, never from evaluation order. */
  candidateExclusions: SourceInterval[];
  acceptedSurfaces: TransportSurface[];
  endpointConstraints: EndpointPair;
  /** Bound imposed by the orchestrator; kernels cannot recursively evaluate neighbours. */
  pass: number;
}
/** Final quantities/ledger are committed only after the bounded global acquisition/mitigation loop. */
export interface ProjectDecisions {
  acceptedReplacements: SourceInterval[]; works: SharedWorkLedger;
  buildingActions: BuildingOverride[]; receivers: ProjectReceiver[];
}
/** UI selection lives outside saved/undoable ProjectDesign. */
export type ProjectSelection =
  | { kind: 'route'; routeId: RouteId; target: { kind: 'range'; s0: number; s1: number }
      | { kind: 'pi' | 'vpi' | 'pin'; index: number } }
  | { kind: 'building'; objectData: string; index: number }
  | { kind: 'source'; interval: SourceInterval }
  | { kind: 'work'; workId: WorkId }
  | null;
