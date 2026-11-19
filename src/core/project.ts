// C0 project contract. Persistent data only; no renderer, DOM or mode-default physics.
import type { BuildingOverride } from './build-controls';
import type { CrossingChoice, LinkEnd, LinkVia } from './crossings';
import type { Violation } from './checks';
import type { CategoryId, TerrainClass } from './data/categories';
import type { Design, Result } from './evaluate';
import type { Element, Vec2 } from './horizontal';
import type { TransportRenderInterval, TransportSurfaceQuery } from './project-transport';
import type { Terrain } from './terrain';
import type { BuildingIndex } from './buildings';

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
export type CrossingTarget =
  /** `after`: what is left of an old road after the stretch rebuilt as that route (its way number in the
   * edited network is derived from the route, `roadId` is only the number it had when chosen). */
  | { kind: 'legacy-way'; objectData: string; roadId: number; after?: RouteId; /** a mapped bridge or tunnel: its OSM way id */ structure?: string }
  | { kind: 'source'; interval: SourceInterval }
  | { kind: 'route'; routeId: RouteId; s0: number; s1: number };
export type RouteControls = Omit<Design, 'category' | 'speed' | 'buildingOverrides' | 'objectData' | 'pis'
  | 'profileMode' | 'vpis' | 'gradePins' | 'crossingOverrides'> & {
    crossings?: { target: CrossingTarget; choice: CrossingChoice; via?: LinkVia; to?: number;
      /** `to` is a designed road of the project, or what follows a rebuilt stretch: that route */
      toRef?: { kind: 'route' | 'after'; routeId: RouteId };
      /** an underpass or a bridge over us straightened (true) or kept on its line (false) by the player */
      square?: boolean;
      /** a reroute's new pieces led onto mapped ways of the player's choosing (CrossingOverride.ends) */
      ends?: [LinkEnd | null, LinkEnd | null] }[];
  };
export type DesignedVertical =
  | { kind: 'auto'; pins: NonNullable<Design['gradePins']>; /** Dormant legacy manual controls, not grade authority. */ manualVpis?: Design['vpis'] }
  | { kind: 'manual'; vpis: Design['vpis']; /** Retained but inactive while By hand. */ autoPins?: NonNullable<Design['gradePins']> }
  /** Frozen built geometry; interpolation is linear in horizontal station. */
  | { kind: 'frozen'; points: { s: number; z: number }[] };
export type AlignmentDesign =
  | { kind: 'pi'; pis: Design['pis']; vertical: DesignedVertical; controls: RouteControls }
  | { kind: 'reference'; path: ReferencePoint[]; controls: RouteControls;
      /** reference preserves imported per-point elevation authority. Switching explicitly to auto/manual
       * relinquishes that authority, retaining the original path as evidence, and requires revalidation. */
      vertical: DesignedVertical | { kind: 'reference' };
      provenance: 'imported' | 'built-work' | 'independent-carriageway' }
  /** Exact refers to horizontal geometry only; vertical authority is always explicit. */
  | { kind: 'exact'; path: { elements: Element[]; length: number }; vertical: DesignedVertical; controls: RouteControls }
  | { kind: 'corridor'; corridorId: CorridorId; direction: 'forward' | 'reverse' };
/** Explicit imported geometry: no invisible PI fitting. s is local horizontal chainage. */
export interface ReferencePoint extends Vec2 {
  s: number;
  elevation: { kind: 'ground' } | { kind: 'known'; z: number; evidence: string } | { kind: 'unresolved' };
}
export interface RoadOperations {
  aadt: number; heavyShare: number; speed: number;
  /** Legacy speed edits remain coupled unless separate operating assumptions are explicitly chosen. */
  speedPolicy?: 'design' | 'independent';
  /** Saves from before traffic was pre-filled (census count or class average, core/traffic-census.ts):
   * aadt 0, "not set". Replaced by the class average when such a save is opened (project-persistence.ts);
   * nothing creates it any more. */
  trafficUnknown?: true;
}
export interface RoadSpec {
  kind: 'road';
  legalClass: 'I' | 'II' | 'III' | 'local' | 'service' | 'track' | 'ramp';
  /** Policy ID selects sourced checks/pricing, not a category guessed from width. */
  policy: string;
  crossSection: Exclude<CategoryId, 'D27.5' | 'D27.5-1' | 'R1' | 'R2'> | 'existing';
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
  kind: 'railway'; policy: string; designSpeed: number;
  /** Imported unknowns are preserved; unresolved operating data blocks scoring. */
  gaugeMm: number | null;
  tracks: 1 | 2; electrification: 'unknown' | 'none' | 'AC25kV' | 'DC3kV' | 'other';
  operations: { passengerDay: number; passengerNight: number; freightDay: number; freightNight: number;
    passengerSpeed: number; freightSpeed: number };
  /** Steepest grade allowed where it is steeper than the new-line limit: a rebuilt stretch of a mapped line
   * may be as steep as that line is there (a game rule; absent = the category's limit). */
  maxGradient?: number;
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
/** One direction's own line inside a separate stretch of a paired motorway (core/motorway-stretches.ts):
 * the bends of its centre line (the common spine displaced there; its carriageway is that line's
 * offset) replacing the spine's bends k0…k1−1, and its own height pins / structure and wall choices.
 * Stations are spine chainage. */
export interface SeparateLine {
  pis: Design['pis'];
  pins: NonNullable<Design['gradePins']>;
  structureOverrides?: Design['structureOverrides'];
  wallOverrides?: Design['wallOverrides'];
}
/** Where one or both directions leave the common line: spine bends [k0, k1) replaced by own lines, the
 * lines differ from the spine over spine chainage [a, b]. Outside, both directions are the one paired
 * body; a direction without an own line here follows the spine (its carriageway is the spine's offset). */
export interface SeparateStretch { id: string; k0: number; k1: number; a: number; b: number; forward?: SeparateLine; reverse?: SeparateLine }
export type CorridorDesign = CorridorBase & (
  | { mode: 'paired'; spine: OwnedAlignment; stretches?: SeparateStretch[] }
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
  /** Every station/control location belongs to exactly one route, even for pair conflicts. */
  locations: { routeId: RouteId; s0: number; s1: number; pi?: number; vpi?: number; pin?: number }[];
  /** Legacy station/index/target fields are deliberately excluded. IDs/codes are not player labels. */
  violation: Pick<Violation, 'kind' | 'title' | 'fix' | 'detail' | 'basis' | 'rule'>;
  blocking: 'invalid' | 'incomplete';
  /** 'violation': a checked rule the design breaks (norm, game rule or engine limit of a checked design).
   * 'not-checked': the engine cannot check this yet (e.g. road-road crossings); show separately. */
  check: 'violation' | 'not-checked';
  /** Plan position of a point finding (e.g. where two roads cross), for locating it on the map. */
  at?: { x: number; y: number };
}
export interface TransportSurface {
  routeId: RouteId; revision: number;
  /** Actual built elevations; ground is a separate terrain query. */
  points: (XYZ & { s: number; halfWidth: number; structure: 'ground' | 'bridge' | 'tunnel' })[];
}
/** Mode-neutral, authoritative geometry. Renderer draws these faces without deriving slopes,
 * deck depth, support positions or a median. Local metre XYZ triples, triangle indices. */
export interface EngineeringGeometry {
  meshes: { id: string; role: 'pavement' | 'formation' | 'retaining' | 'deck' | 'pier' | 'abutment'
    | 'tunnel' | 'track' | 'ballast' | 'noise-wall'; positions: Float64Array; triangles: Uint32Array }[];
  terrainMasks: { boundary: XYZ[]; surfaceMeshIds: string[] }[];
  /** BOQ measurements link to the SAME geometry, including common formation and shared structures. */
  measurements: { id: string; meshIds: string[]; quantity: number; unit: 'm' | 'm2' | 'm3' | 'each' }[];
}
export interface WorkProposal {
  id: WorkId; owner: { kind: 'route'; id: RouteId } | { kind: 'corridor'; id: CorridorId }; participants: RouteId[];
  kind: 'formation' | 'structure' | 'connection' | 'property' | 'noise' | 'land';
  surfaces: TransportSurface[];
  geometry: EngineeringGeometry;
  claims: SourceInterval[];
  /** Final priced quantities must use this same geometry. */
  /** Provisional in EngineeringProposal; final only in the ledger after global decisions. */
  cost: number;
  dependencies: ProjectDependency[];
}
export interface SharedWork extends WorkProposal { accepted: boolean;
  /** Player words for the work (e.g. "Old road removed …") and where it is, for its road's card. */
  label?: string; at?: { x: number; y: number; s: number };
  /** buildings it takes (a roundabout's ring), bought out with it */
  removes?: number[] }
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
  /** open-ground (no walls, no cuts) energy 10^(L/10) at `height` (the deciding storey) */
  dayEnergy: number; nightEnergy: number;
  policy: string;
  /** Where the source is assessed (2 m before the façade nearest it; z = ground there) and every storey's
   * energies from this physical source: open ground and as built (walls, cuts, road edges). Energies of
   * several sources at the same house and storey add; walls of one source screen only its own cells. */
  position?: XYZ;
  storeys?: { height: number; rawDay: number; rawNight: number; day: number; night: number }[];
}
export interface ProjectReceiver {
  buildingIndex: number; height: number; contributions: AcousticContribution[];
  dayDb: number; nightDb: number; dayLimit: number; nightLimit: number;
  action: 'retain' | 'demolish' | 'buy';
  /** A house heard by two or more roads, decided once for the project (project-noise.ts): the road whose noise
   * prevails there, what was decided, and the deciding storey (index into each contribution's `storeys`, which
   * are then as built with the project's walls). dayDb / nightDb are the roads' noise added together there. */
  together?: { prevailing: RouteId; decision: 'none' | 'wall' | 'buy'; storey: number;
    wall?: { routeId: RouteId; height: number; length: number; cost: number };
    buyout?: { routeId: RouteId; cost: number };
    /** a house the player keeps that stays over the limit: by how much, dB */
    over?: number };
}
export interface AcousticScreen {
  bounds: Bounds[];
  /** Bound on omitted total linear energy, not an individual-source threshold. */
  omittedDayEnergyUpperBound: number; omittedNightEnergyUpperBound: number;
  complete: boolean;
}
export interface RouteResult {
  routeId: RouteId; revision: number;
  /** Includes dependency/decision changes even when the route design revision is unchanged. */
  engineeringRevision: string;
  surface: TransportSurface | null;
  geometry: EngineeringGeometry | null;
  /** Present only for the road kernel. Other modes never impersonate road Result. */
  legacy?: Result;
  /** A motorway with separate stretches (forward direction only): what is drawn, i.e. the shared body's
   * parts outside the stretches and each direction's own carriageway inside. */
  drawn?: DrawnPart[];
  /** …and the common spine's evaluation, shown while both directions are edited together, with the
   * stretches (its stations) where they run apart. */
  shared?: Result;
  apart?: { s0: number; s1: number }[];
  complete: boolean; valid: boolean; accepted: boolean;
  attributedCost: number | null;
  dependencies: ProjectDependency[]; influence: Bounds[];
}
/** A part of a motorway with separate stretches as drawn: the shared body (paired section) or one direction's
 * own carriageway (`mirrored`: the reverse direction run A→B, its median on its right). */
export interface DrawnPart { id: string; result: Result; section: 'paired' | 'carriageway'; mirrored?: boolean; direction?: 'forward' | 'reverse' }
export interface ProjectCost {
  /** null while reconciliation is incomplete; no partial bill can become a best. */
  total: number | null;
  routes: Record<RouteId, number>; shared: number;
  materialBalance: 'per-route';
  /** Each evaluated road's OWN bill against the unchanged existing network, for display only. Never add
   * these up: only `total` (set when the whole project was priced together) is a project price. */
  alone: Record<RouteId, number>;
  /** Road changes not covered by a project price yet. Non-empty ⇒ total === null, no verdict, no best. */
  unpriced: { routeId: RouteId; reason: string }[];
}
/** What happens to a building. While the project is not priced (`complete` false) the list still holds
 * every road's own physical consequences (houses under its works, its own buy-outs): only decisions
 * between roads (combined noise) are withheld, never what a road does on its own. */
export interface ProjectBuildingOutcome {
  buildingIndex: number; action: 'retain' | 'demolish' | 'buy';
  /** the road whose works remove it, or whose noise decides it */
  routeId?: RouteId;
  /** One physical acquisition owner after the global mitigation/acquisition loop. */
  workId?: WorkId; cost: number;
}
export interface ProjectResult extends ProjectIdentity {
  routes: Record<RouteId, RouteResult>;
  works: SharedWorkLedger; cost: ProjectCost; issues: ProjectIssue[];
  /** Old stretches the project rebuilds: gone from the map, its checks and picking as soon as their new
   * line is engineered without them, whether or not the project can be priced. */
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
  /** Called before acquisitions and again after mitigation changes; streams receivers, no dense matrix. */
  acoustics(proposal: EngineeringProposal, input: AcousticQuery, emit: (c: AcousticContribution) => void): AcousticScreen;
  finalize(proposal: EngineeringProposal, decisions: ProjectDecisions): RouteResult;
}
export interface AcousticQuery {
  receivers: { buildingIndex: number; position: XYZ; height: number }[];
  decisions: ProjectDecisions | null;
  /** Aggregator supplies the bound needed to include individually quiet contributors. */
  omittedEnergyBudget: { day: number; night: number };
}
/** Paired formation is engineered once, not as two independent priced road kernels. */
export interface CorridorKernel {
  kind: 'motorway'; policy: string;
  propose(corridor: CorridorDesign, children: readonly [RouteDesign, RouteDesign], input: RouteKernelInput): {
    routes: EngineeringProposal[]; sharedWorks: WorkProposal[]; issues: ProjectIssue[];
  };
}
export interface RouteKernelInput {
  environment: ProjectEnvironment;
  /** Real immutable terrain stays separate from transport-surface elevation queries. */
  terrain: Terrain;
  buildings?: BuildingIndex;
  transport: TransportSurfaceQuery;
  /** All claims in this jointly dependent candidate group, not just the current route's claims.
   * Authoritative ownership is derived atomically after feasibility, never from evaluation order. */
  candidateExclusions: SourceInterval[];
  /** Bounded spatial query; kernels do not scan the entire designed network per station. */
  nearAcceptedSurfaces(bounds: Bounds, visit: (surface: TransportSurface) => void): void;
  endpointConstraints: EndpointPair;
  /** Resolved owning corridor/group, including spine and both operation specifications. */
  corridor: { design: CorridorDesign; children: readonly [RouteDesign, RouteDesign] } | null;
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
      | { kind: 'pi' | 'vpi' | 'pin'; index: number; /** Required to retain selection across publication; absent clears safely. */ routeRevision?: number } }
  | { kind: 'building'; objectData: string; index: number }
  | { kind: 'source'; interval: SourceInterval }
  | { kind: 'work'; workId: WorkId }
  | null;
