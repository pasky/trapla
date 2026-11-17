// The full recompute path: design → alignment → stations → profile → sections → structures →
// earthworks → buildings, crossings, noise → cost per station cell → checks. Pure (no DOM); runs in
// a Web Worker in the app.

import { autoProfile, BLOCK_GRID, blockEnds, CLEARANCE_MARGIN, CLEARANCE_PENALTY, fillLongBlocks, profileBlocks, type PlanStraight, PROFILE_HEIGHT_MAX, PROFILE_HEIGHT_STEP, PROFILE_KIND, PROFILE_KINDS, type AutoProfileOptions, type SharedCostTable } from './autoprofile';
import { footprintConflicts, type FootprintConflict } from './footprint';
import { planRetainingWalls, retainingConflicts, type CrossingChainages, type RetainingPlan, type RetainingWall, type RetainingFeatureCache } from './retaining';
import { remedyBridgeSupports, SPAN_TOO_LOW, SUPPORT_LIMITS, type BridgePrice } from './support-layout';
import { liftAutoProfile } from './profile-remedies';
import { bridgeModel, bridgeRunCost, equalSpanRunCost } from './bridge';
import { noiseBuyoutCost, BuildingIndex } from './buildings';
import { normalizeBuildingOverrides, normalizeWallOverrides, wallOverrideMasks, type BuildingOverride, type WallOverride } from './build-controls';
import { noiseControlViolations } from './noise-control-violations';
import { categoryViolation, crossingViolation, mergeNearby, oobViolation, profileViolation, ROAD_CHECKS, ROAD_TOO_LOW, slopeViolation, timeViolation, trackEndViolations, type TrackEnd, type Violation } from './checks';
import {
  basePerKm, basePerKmUrban, categoryTunnelPerKm, cellLength, costParts, cutCoverPitHalfWidth, cutCoverPitPerM, tunnelTubeFactor, decisionPrices, dividedRoad, landPerM2, sumParts, surchargeRate,
  type CostBreakdown, type CostParts,
} from './cost';
import { RAMP_TOO_HIGH, RAMP_TOO_LONG } from './crossing-geometry';
import { buildCrossingGeometry, crossingBridgeMask, crossingCache, crossingChoice, normalizeCrossingOverrides, resolveCrossings, underpassFits, underpassPrice, type CrossingOverride, type CrossingResult } from './crossings';
export type { CrossingResult } from './crossings';
import { CATEGORIES, type CategoryId } from './data/categories';
import { bendRules, horizontalRules, speedNorms } from './data/norms';
import { hairpinPavementPerM2, hairpinViolations, hairpinWidening, speedStretches, travelMinutes, verticalLimits } from './design-speed';
import { LAND, MATERIAL_VALUE, NORM_EARTHWORK_ALLOWANCE, PRICES, STRUCTURE_RULES, TUNNEL_RULES } from './data/prices';
import { CATEGORY_RANK, minCategoryForTraffic, type ScenarioParams } from './data/scenario';
import { ACCESS, BUILDING_RULES, CROSSING_RULES, ENDPOINT_JUNCTIONS, minorCrossroads, NOISE, ROAD_CLASSES, type EndpointJunctionKind } from './data/urban';
import { massHaul, volumes } from './earthworks';
import { groundWorksPerM, treatedSubgrade } from './earthengineering';
import { buildAlignment, pointAt, station, type Alignment, type PI, type PointOnAlignment, type Vec2 } from './horizontal';
import {
  crossSectionScreens, noiseOutcome, wallLineLengths,
  type AcousticSource, type NoiseReceiver, type WallStretch,
} from './noise';
import { createNoiseModel } from './road-noise';
import { createRailNoiseModel, type RailTrafficGroup } from './rail-noise';
import { RAIL_TIE_IN_M, RAIL_TURNOUT_M, TRACK_CENTRES_M, TURNOUT_ANGLE_RAD } from './data/railway';
import { d275CrossSection } from './data/motorway';
import { sourceReach, type SourceLane } from './noise-field';
import { crossingWallGaps } from './crossing-walls';
import { protectedRasterCells } from './protected-raster';
import { mergeCrossings, type RoadCrossing, type RoadNet } from './roadnet';
import type { GroundProfile } from './ground';
import { computeSections, flatSection, type SectionCache } from './sections';
import { allCut, chooseStructures, cutCoverMask, KIND, type Run } from './structures';
import { cutMethodMask, overrideMask, styleMask, type StructureOverride } from './overrides';
import { BUILTUP_BIT, CLASS_BITS, LC, OOB_BIT, type Terrain } from './terrain';
import { buildProfile, elevations, type VPI } from './vertical';
import { carryCrossingPrices, rememberFull, stationWindow, windowedPreview } from './preview-window';
import { CULVERT_RULES } from './data/culverts';
import { LOWERING_RULES } from './data/remedies';
import { capsuleTest, type KeepClear } from './keep-clear';
import { barrelLength, culvertEnvelope, barrelContains, culvertCost, waterOpening, waterSize, waterSizer, waterCoverFits, type WaterCrossing, type WaterResult } from './watercourses';

export interface Design {
  category: CategoryId;
  speed: number;
  pis: PI[];
  profileMode: 'auto' | 'manual';
  /** full VPI list incl. endpoints; used in manual mode, refreshed from auto-profile otherwise */
  vpis: VPI[];
  /** Manual construction ranges in absolute chainage; omitted in older saved designs. */
  structureOverrides?: StructureOverride[];
  /** Auto-grade constraints in absolute chainage; retained but inactive in Manual. */
  gradePins?: { s: number; z: number }[];
  /** Per existing-road way (scenario-pack index), not a transient crossing station. */
  crossingOverrides?: CrossingOverride[];
  /** Building indices are stable within the scenario pack. Omission restores Auto. */
  buildingOverrides?: BuildingOverride[];
  /** Side-specific wall paint; height 0 removes Auto's wall, omitted ranges remain automatic. */
  wallOverrides?: WallOverride[];
  /** Scenario object-pack identity for positional building/road IDs; not a scoring version. */
  objectData?: string;
  /** A side road's junction at each end where it joins a road: Auto (a priority T) or a roundabout.
   * Read by the project (core/tie-in.ts), never by this road kernel. */
  junctionForms?: { a?: 'roundabout'; b?: 'roundabout' };
  /** Steepest grade where the line may be steeper than its category's limit (a rebuilt railway stretch:
   * its old line's own grade, RailwaySpec.maxGradient). */
  maxGradient?: number;
}

export interface EvalContext {
  terrain: Terrain;
  scenario: ScenarioParams;
  a: Vec2;
  b: Vec2;
  buildings?: BuildingIndex;
  /** existing road network (crossings) */
  roads?: RoadNet;
  /** Scenario-declared connections of the mission ends to retained roads (pack meta A/B.junction).
   * Applied only to a route end lying exactly at `x, y`. Absent for D11. */
  junctions?: readonly EndpointJunction[];
}

export interface EndpointJunction { x: number; y: number; kind: EndpointJunctionKind; ways: readonly number[] }

export interface Result {
  length: number;
  ds: number;
  n: number;
  s: Float64Array; x: Float64Array; y: Float64Array; tx: Float64Array; ty: Float64Array;
  ground: Float64Array;
  /** Centreline map priors for display / DP; sections sample geology across their entire width. */
  geology: { ids: Uint8Array; profiles: GroundProfile[] };
  grade: Float64Array;
  kind: Uint8Array;
  cut: Float64Array; fill: Float64Array;
  dayL: Float64Array; dayR: Float64Array; zDayL: Float64Array; zDayR: Float64Array;
  /** a hairpin's widened lanes: extra crown width on each side per station, m (absent: none anywhere) */
  widen?: Float32Array;
  oob: Uint8Array;
  runs: Run[];
  vpis: VPI[];
  vcurves: { s: number; z: number; len: number; r: number; type: string }[];
  grades: number[];
  /** per bend; `unit` is shared by the arcs of one (compound) curve, −1 for a bend without an arc (left out, collinear, U-turn) */
  curves: { index: number; x: number; y: number; r: number; rEff: number; delta: number; auto: boolean; sStart: number; sEnd: number; t: number; unit: number }[];
  violations: Violation[];
  geomViolations: number;
  cost: CostBreakdown;
  /** CZK per station cell and component; each array sums to the matching line of `cost` */
  parts: CostParts;
  /** per station cell: land-take width (m), built-up and forest share of it (0…1), noise walls
   * (bit 0 = left of travel, bit 1 = right) */
  /** `wallLength` / `wallArea`: noise walls billed in the cell, along their own lines (m, m²) */
  cell: { width: Float64Array; urban: Float32Array; forest: Float32Array; wall: Uint8Array; wallLength: Float64Array; wallArea: Float64Array };
  crossings: CrossingResult[];
  waterCrossings: WaterResult[];
  /** Footprint conflicts beyond the handled centreline crossings; costs already in the bill. */
  footprintConflicts: FootprintConflict[];
  retainingWalls: RetainingWall[];
  /** Engineering surface at a retained slope edge; NaN means natural daylight. */
  wallSurfaceL: Float64Array; wallSurfaceR: Float64Array;
  walls: WallStretch[];
  /** walls Auto adds for houses beside the player's wall choices (part of `walls`): the card of that choice says so */
  wallsAroundChoices: WallStretch[];
  /** demolished buildings: index into the pack's building list, station cell it is billed to, CZK */
  /** `in`: what of ours takes it (at station i): the bridge deck, the embankment or the cut, or only the
   * construction working strip beside one of them (`strip`) */
  /** `in`: what of ours takes it ('reroute': the new road of a crossed road we cut and reroute) */
  demolished: { j: number; i: number; cost: number; in: 'bridge' | 'embankment' | 'cut' | 'reroute'; strip: boolean;
    /** a small structure standing within this demolished building, which goes with it */
    host?: number }[];
  /** Outside the footprint: noise fallback or explicit player acquisition + demolition, including plot allowance. */
  boughtOut: { j: number; i: number; cost: number; reason?: 'manual' }[];
  /** Kept buildings remain present; hit means footprint/working-strip conflict. */
  kept: { j: number; i: number; hit: boolean }[];
  /** A rebuilt stretch (project-kept.ts): where its line stays on the old road, what the norm would ask of a
   * new road there. Not violations: the old road is kept as it is. */
  inherited?: Violation[];
  /** A rebuilt stretch: houses beside a part kept as the old road (nothing is built or decided there). */
  besideOldRoad?: number[];
  /** A rebuilt stretch: station cells where the old road is kept as it is (1); nothing is built or billed
   * there (`cost` and `parts` cover the new parts only) and the road is drawn on the ground. */
  keptCells?: Uint8Array;
  /** buildings a retaining wall keeps clear of our works (instead of their demolition): where, how high,
   * the walls' estimated price and what demolition would have cost, CZK; `kept`: the player keeps it */
  walledOff: RetainingPlan['walledBuildings'];
  /** noise view: dwellings within the search radius with their status, and the ground-floor map */
  /** `source`: the road as an acoustic line source (cells, wall lines, screening edges, junction openings);
   * `L` / `R`: built wall heights per station (manual included), m — the same the bill and 3D use */
  noise: { receivers: NoiseReceiver[]; source: AcousticSource | null; L: Float64Array; R: Float64Array;
    /** the period that decides (one road: fixed by its traffic) and its limit, dB */
    controlling: 'day' | 'night'; limit: number };
  quantities: {
    cut: number; fill: number; reused: number; surplus: number; deficit: number; avgHaul: number;
    /** cut volume by local geology + estimated weathering class I / II / III, m³ */
    cutByClass: [number, number, number];
    footprint: number; forestArea: number; buildingsHit: number; hitBuildings: number[];
    bridgeLength: number; tunnelLength: number; bridges: number; tunnels: number; massHaul: Float64Array;
    /** at-grade + bridge length inside built-up areas, m */
    urbanLength: number;
    wallLength: number;
    wallArea: number;
    noiseBuyouts: number;
    /** crossings of existing roads that cost something here (overbridges, junctions, reconnections) */
    crossingsPaid: number;
    /** screening distance used by the noise rule, m */
    noiseDistance: number;
    /** value of a m³ of fill material the auto-profile / structure choice settled on, CZK/m³ */
    materialValue: number;
    /** value of a m³ of fill the structure choice settled on along the final grade line (balances
     * the chosen structures' usable cut and fill as far as the price range allows), CZK/m³ */
    structureValue: number;
  };
  travelMin: number;
  minCategory: CategoryId;
  valid: boolean;
  profileFeasible: boolean;
  /** Unprefixed keys are cumulative checkpoints; sections is the last engineering pass.
   * work.* are elapsed milliseconds summed across all passes (engineering includes its substeps).
   * count.* count calls, not milliseconds. Missing work/count keys mean that path did not run. */
  timing: Record<string, number>;
  /** Ways merged into another way's crossing (mergeCrossings: within 30 m of it along our road). */
  mergedWays?: number[];
  /** A fast drag preview (see EvalOptions.preview): approximate, never a score. */
  preview?: boolean;
  /** A trial pass (EvalOptions.trial, inside evaluate only): the same pass with its noise. */
  withNoise?: () => Result;
  /** Full results: what windowed drag previews need to start from this one (core/preview-window.ts). */
  lineage?: { key: string; design: Design };
}

export interface EvalOptions {
  /** Explicit transport heights; never replace the Terrain height query. Omitted preserves legacy. */
  endpointElevations?: { a?: number; b?: number };
  /** Project checks goals on the required connection, not every auxiliary route. */
  goals?: { time: boolean; capacity: boolean };
  /** Operating speed is independent of design speed. Omitted preserves legacy emissions. */
  operatingSpeed?: number;
  /** Required mission demand, separate from this route's acoustic operations. */
  capacityTraffic?: number;
  /** Drag preview: one fixed-price auto-profile solve (no mass-balance search or clearance
   * retries), one engineering pass (no retaining walls or support lifts, no strict retry), no
   * crossing geometry, footprint remedies or noise. Plan, grade line, structures and an approximate bill only;
   * validity is provisional. The full evaluation follows when the drag pauses or ends. */
  preview?: boolean;
  /** Material value to price the preview's single solve at (the last full result's; default the
   * mass-balance search's starting value). */
  materialValue?: number;
  /** Fill value the preview's structure choice is priced at (the last full result's settled value;
   * default the profile's). */
  structureValue?: number;
  /** Stable physical acoustic source id of this carriageway (project `acousticSourceId`). */
  acousticSourceId?: string;
  /** One direction of a split motorway: station ranges where the other direction runs alongside on the
   * left (one common formation). Houses on that side belong to the other direction's noise check and
   * no wall can stand in the median there. */
  leftJoined?: readonly { s0: number; s1: number }[];
  /** One direction of a separate motorway stretch: outside x0…x1 its grade line is the given one (the
   * shared heights where the two directions run side by side); Auto only between, continuing that line's
   * grade at both ends. */
  fixedProfile?: { x0: number; x1: number; vpis: readonly VPI[]; /** largest grade change at x0 / x1 */ slack?: [number, number] };
  /** The side `leftJoined` means (default left): a separate stretch's directions both run A→B, so the
   * reverse carriageway has the forward one on its right. */
  joinedSide?: 'L' | 'R';
  /** Split motorway, crossed roads where the two directions run joined: the owning direction builds one
   * crossing for both (its footprint widened by the other direction's mirror on the left); the other
   * direction reuses that structure (`from`: the owner's crossings), billing and drawing nothing. */
  sharedCrossings?: { own: true } | { own: false; from: readonly CrossingResult[] };
  /** Railway: trains per period by type and speed (noise source); none = a silent, unused line. */
  railTraffic?: readonly RailTrafficGroup[];
  /** Where a higher-ranking designed road's crossing holds this road: Auto keeps the grade between
   * `min` and `max` (absolute) at station `s` (low enough under its bridge, on its deck, at its level
   * in a junction). By-hand heights are the player's. */
  holds?: readonly { s: number; min: number; max: number;
    /** its bridge over the other road: this road is a bridge over that span (project-road.ts) */
    bridge?: [number, number] }[];
  /** A rebuilt stretch: station cells (1) where its line stays on its old road, which is kept as it is
   * there (project-kept.ts). Nothing is built on them, so Auto does not lift the grade there for a new
   * culvert or bridge over a stream (the old one stays), and it ties each new part to the old road's
   * height where it leaves and rejoins it. Whatever the kernel still designs and bills on those cells is
   * dropped and credited by project-kept.ts. One entry per station; otherwise ignored. */
  oldRoad?: Uint8Array;
  /** Drag preview of a long route (core/preview-window.ts): evaluate only the stations within
   * [s0, s1] of the route's own chainage as if they were the whole route, with the grade continuing
   * `grades` at its ends (endpointElevations give the heights). Never used for a scored result. */
  window?: { s0: number; s1: number; grades: { a?: number; b?: number } };
  /** Grade-separated routes: crossed roads whose bridge over us could not be built (ramps too long
   * or too high) at the first Auto grade. Auto then keeps clear of each: our bridge over it, or a
   * cutting deep enough for its bridge at its own level (set by evaluate's retry, not by callers).
   * Present (even empty): unmet clearances cost more than any structure. `above`: our bridge only (its
   * bridge over our cutting, deep enough, could not be built). */
  separate?: readonly { s: number; g: number; above?: boolean }[];
  /** With `separate`: stretches where the first grade passed too low over a river or railway. */
  separateWater?: readonly { s0: number; s1: number }[];
  /** Stretches where our earthworks buried a road: the grade at most (`fill`) or at least `z` there
   * (set by evaluate's retry, not by callers). */
  narrow?: readonly { s0: number; s1: number; fill: boolean; z: number }[];
  /** Heights our grade needs at crossings the player chose a box or our bridge for, or where a box would keep a
   * home a reroute takes, where the first line fell short: met by a local lift (set by evaluate's retries, not
   * by callers). */
  choiceLifts?: readonly { s: number; z: number }[];
  /** …the same heights as floors of a new grade solve at those crossings (the other way evaluate tries). */
  choiceFloors?: readonly { s: number; z: number }[];
  /** A pass of evaluate's retries: its result leaves out the noise until `withNoise` (set by evaluate). */
  trial?: boolean;
  /** What the passes of one design's evaluation (its retries change only the grade) share: Auto's block
   * solves, cross-sections, retaining screens, support obstacles and reroutes, each checked against its
   * own inputs (set by evaluate, not by callers). */
  passCache?: PassCache;
  /** Railway between two points of an existing railway: metres from each end where the mapped railway is
   * the station track it joins; elsewhere, where our axis runs along the mapped track we rebuild it in
   * place (no bridge over it, no conflict with it). Crossing or running beside it stays a conflict. */
  /** railway ends tied into a mapped station: its area's length at each end, the station tracks' axis */
  railTieIn?: { a: number; b: number; ends?: { a?: TrackEnd; b?: TrackEnd } };
  /** Railway rebuilding mapped stretches: their old track (polylines) is taken up, no obstacle. */
  railRetired?: readonly (readonly { x: number; y: number }[])[];
  /** Land and works of other roads of the project that Auto's reroutes keep clear of (the player's road
   * takes over: project-evaluate.ts plans them again where they came too close). */
  keepClear?: KeepClear;
  /** Ways merged into another way's crossing that our earthworks buried: each a crossing of its own here
   * (set by evaluate's retry, not by callers). */
  splitWays?: readonly number[];
}

interface PassCache {
  profile: Map<string, unknown>; support: Map<string, number>; retaining: RetainingFeatureCache;
  reroutes: ReturnType<typeof crossingCache>; sections: SectionCache;
}
/** a cut's [class I, II, III] areas, footprint width and netted rock face in one kind of ground */
interface CutRow { a: [number, number, number]; width: number; rockFace: number }
interface GeometryRow { width: number; area: number; bridge: number; bridgeUrban?: number; cuts: CutRow[] }
interface ProfileTables {
  /** Flat-ground earth geometry and rural bridge estimate by profile height index. */
  geometry: GeometryRow[];
  /** NaN-initialised dry-ground Auto-profile cost table (filled only by the identical cost function). */
  dry: (materialValue: number, groundId: number, kind: number, size: number) => Float64Array;
}
/** Route-independent Auto-profile tables. Keyed by everything the dry cost depends on besides the
 * terrain (category, terrain class, material value, pack ground id, structure kind), so successive
 * drags reuse them bit-identically. Bounded LRU over material values. */
const profileTableCache = new WeakMap<Terrain, Map<string, ProfileTables>>();
/** One evaluation's balance searches visit ≈ 20–30 values (start, the fixed steps from it, then interpolated
 * ones; lifts and retries revisit them): 24 keep most of them, and the fixed steps for the next evaluation
 * (D11: −20–35 % cost-table entries computed on the repeated designs; ≈ 11 tables of 32 kB a value, ≈ 8 MB). */
const PROFILE_TABLE_VALUES = 24;
function profileTablesFor(terrain: Terrain, key: string): ProfileTables {
  let byKey = profileTableCache.get(terrain);
  if (!byKey) profileTableCache.set(terrain, byKey = new Map());
  let tables = byKey.get(key);
  if (!tables) {
    const byValue = new Map<number, Map<number, Float64Array>>();
    tables = { geometry: [], dry: (materialValue, groundId, kind, size) => {
      let values = byValue.get(materialValue);
      if (values) byValue.delete(materialValue); // refresh LRU position
      else {
        values = new Map();
        if (byValue.size >= PROFILE_TABLE_VALUES) byValue.delete(byValue.keys().next().value!);
      }
      byValue.set(materialValue, values);
      const slot = groundId * PROFILE_KINDS + kind + 1;
      let table = values.get(slot);
      if (!table) values.set(slot, table = new Float64Array(size).fill(NaN));
      return table;
    } };
    byKey.set(key, tables);
  }
  return tables;
}

/** Station spacing of every result, m. */
export const STEP = 10;
/** PROVISIONAL, m: how far from the old road's surface Auto may be where a rebuilt stretch's new part
 * leaves or rejoins it (the same slack as a crossing hold, project-evaluate.ts). */
export const OLD_ROAD_TIE = 0.5;
/** PROVISIONAL, m: how far Auto's smooth line may be from the surveyed surface of an old road it keeps
 * (the surface model along a road is rough: verges, ditches, 5 m cells; D11 Jičínská ±1.5 m). */
export const OLD_ROAD_BAND = 1;
/** PROVISIONAL, m: how far from a crossed minor road's ground Auto keeps a local road or track where they meet
 * in a crossroads (the same slack as a crossing hold). */
export const MINOR_CROSSROADS_BAND = 0.5;
/** PROVISIONAL, m: Auto's height points on a rebuilt stretch are this far apart (250 m on a new road): its
 * new parts are a few hundred metres long and must meet the old road's height at both ends. Still at
 * least one vertical curve of the 70 km/h minimum (crest 2 500 m, sag 1 500 m) per point. */
export const OLD_ROAD_KNOTS = 125;
/** PROVISIONAL, m: the same on a local road or track, which meets the roads it crosses at their level
 * (MINOR_CROSSROADS_BAND) and follows the ground closely. Still one vertical curve of its largest minimum
 * radius (crest 1 000 m at 50 km/h, ČSN 73 6110) for a 6 % change of grade per point. */
export const MINOR_KNOTS = 60;
/** the auto-profile's mass-balance search measures candidates on every n-th station's cross-section */
const BALANCE_STRIDE = 2;

/** manual grade line: ends pinned to the tie-ins, interior VPIs sorted, ≥ MIN_VPI_GAP apart and from the ends */
export function normalizeVpis(v: VPI[], L: number, zA: number, zB: number): VPI[] {
  const sorted = v.slice(1, -1).filter((p) => p.s >= MIN_VPI_GAP && p.s <= L - MIN_VPI_GAP).sort((p, q) => p.s - q.s);
  const inner: VPI[] = [];
  for (const p of sorted) if (!inner.length || p.s - inner[inner.length - 1].s >= MIN_VPI_GAP) inner.push({ ...p });
  return [{ s: 0, z: zA, r: null }, ...inner, { s: L, z: zB, r: null }];
}
/** minimum distance between VPIs (and from the ends), m */
export const MIN_VPI_GAP = 20;

export function evaluate(ctx: EvalContext, d: Design, opts: EvalOptions = {}): Result {
  if (opts.preview && !opts.window) {
    const windowed = windowedPreview(ctx, d, opts, evaluateRoute);
    if (windowed) return windowed;
  }
  // Every pass of a full evaluation shares its caches and leaves the noise for the one kept.
  if (!opts.preview && !opts.window && !opts.passCache) {
    opts = { ...opts, trial: true, passCache: { profile: new Map(), support: new Map(), retaining: new Map(), reroutes: crossingCache(), sections: [] } };
  }
  let result = evaluateRoute(ctx, d, opts);
  if (opts.preview && !opts.window) { carryCrossingPrices(ctx, d, opts, result); return result; }
  /** the options the kept result was evaluated with (a separation retry adds its targets) */
  let used: EvalOptions = opts;
  // Our line raised for a crossing, where it leaves too little room: (a) a box or our bridge the player chose
  // (the box under our embankment even with the way lowered as far as it may be, or on its straightened line;
  // our bridge its clearance); (b) an automatic reroute that takes a home where its class's box would do but
  // for our low embankment (homes go only where nothing else can be built, research/60). A designer tries it
  // both ways: solving the grade again with that height and, where that fails, lifting the line there (as for a
  // bridge's supports); the first that meets it and leaves no more problems is kept — only while it costs no more than
  // the crossing's treatment itself (a rule of proportion: our road is not regraded for kilometres to suit one
  // crossing; the problem then says how much our road would have to rise). The first line is Auto's own: a
  // player's choice is no fixed point of the grade solve.
  if (!opts.preview && !opts.window && d.profileMode === 'auto') {
    type Need = { s: number; z: number; roadId: number; asked: boolean };
    const needs: Need[] = result.crossings.flatMap(c => {
      if (c.roadId === undefined || result.kind[c.i] !== KIND.earth && !c.requestedType) return [];
      const asked = (c.requestedType === 'underpass' || c.requestedType === 'bridge') && !!c.issues?.length;
      const home = !c.requestedType && !!c.homes && (c.type === 'reconnection' || c.type === 'diversion');
      if (!asked && !home) return [];
      const g = ctx.terrain.heightAt(c.x, c.y), box = c.requestedType === 'bridge' ? undefined : underpassPrice(c, 0, 0);
      if (c.requestedType !== 'bridge' && !box) return [];
      let z = box ? g + box.minHeight - LOWERING_RULES.maxDepth : g + (ROAD_CLASSES[c.cls].noAtGrade ? STRUCTURE_RULES.railClearance : CROSSING_RULES.overHeight);
      for (const v of c.issues ?? []) if (v.crossing.code === 'square' && v.crossing.actual !== undefined && v.crossing.required !== undefined)
        z = Math.max(z, result.grade[c.i] + v.crossing.actual - v.crossing.required);
      return z > result.grade[c.i] - 0.01 ? [{ s: c.s, z: z + BOX_FLOOR_MARGIN, roadId: c.roadId, asked }] : [];
    });
    if (needs.length) {
      const at = needs.map(q => q.s), near = (c: CrossingResult) => needs.some(q => q.roadId === c.roadId && Math.abs(q.s - c.s) < 1);
      const homes = (r: Result) => r.crossings.reduce((k, c) => k + (at.some(s => Math.abs(c.s - s) <= REGION) ? c.homes ?? 0 : 0), 0);
      // the price of the treatments in question: of the reroutes through homes before, of the player's box or bridge after
      // (our bridge over a road: the bridge's own price, its run in our bill)
      const deck = (r: Result, c: CrossingResult) => { const run = r.runs.find(u => u.kind === KIND.bridge && u.i0 <= c.i && c.i <= u.i1);
        let k = 0; if (run) for (let i = run.i0; i <= run.i1; i++) k += r.parts.bridges[i]; return k; };
      const price = (r: Result, asked: boolean) => r.crossings.reduce((k, c) => k + (near(c) && needs.find(q => q.roadId === c.roadId)!.asked === asked
        ? c.cost + (c.requestedType === 'bridge' ? deck(r, c) : 0) : 0), 0);
      const meets = (r: Result) => (needs.some(q => q.asked) ? regionCount(r, at) < regionCount(result, at) : regionCount(r, at) <= regionCount(result, at))
        && (needs.every(q => q.asked) || homes(r) < homes(result));
      let best: { r: Result; o: EvalOptions } | undefined;
      // (the new solve first: where it works, the lift is not tried — evaluate time)
      for (const [k, o] of [{ ...used, choiceFloors: needs }, { ...used, choiceLifts: needs }].entries()) {
        if (best) break;
        const r = evaluateRoute(ctx, d, o);
        r.timing['count.regradeRetry'] = k + 1;
        if (meets(r) && r.cost.total - result.cost.total <= price(result, false) + price(r, true)) best = { r, o };
      }
      if (best) { result = best.r; used = best.o; }
    }
  }
  // A motorway / railway crosses every road at another level. Where Auto's grade left a road neither
  // room to pass under us nor a buildable bridge over us, a designer moves the grade line: once more
  // with Auto asked to clear those roads (kept only if it resolves more than it breaks). `base`: the
  // options of the kept result, whose own clearances stay.
  const separation = (base: EvalOptions, buriedToo = false) => {
    const sep = (gs: { road?: { s: number; g: number; above?: boolean }; water?: { s0: number; s1: number } }[][]): EvalOptions => ({ ...base,
      separate: [...base.separate ?? [], ...gs.flat().flatMap(t => t.road ? [t.road] : [])],
      separateWater: [...base.separateWater ?? [], ...gs.flat().flatMap(t => t.water ? [t.water] : [])] });
    const stuck = result.crossings.filter(c => c.type === 'overbridge' && !c.requestedType
      && c.geometry?.diagnostics?.some(m => m === RAMP_TOO_LONG || m.startsWith(RAMP_TOO_HIGH)));
    // …and where it paid the clearance penalty over a river, railway or stream instead of clearing it.
    const missed = result.violations.filter(v => v.kind === 'crossing' && (v.clearance === 'above' || v.clearance === 'water'));
    // …and where a way could be led to no other crossing and nothing else was buildable there either: it
    // too is cleared (where our cutting is already deep enough for its bridge, that bridge's ramps could
    // not be built: our bridge over it).
    const unbuilt = result.crossings.filter(c => !c.requestedType && (c.type === 'diversion' || c.type === 'reconnection')
      && c.issues?.some(v => v.crossing.code === 'reroute'));
    // …and, last (`buriedToo`), where our earthworks still bury a road that could be neither rebuilt beside
    // them nor walled off nor kept off by a lower grade (e.g. a junction just beside our axis): a bridge or a
    // cutting at another level clears it.
    const buried = buriedToo ? result.footprintConflicts.filter(f => f.feature === 'road' && f.action === 'blocked' && result.kind[f.i] === KIND.earth && notAsked(result)(f)) : [];
    const items: { at: number; road?: { s: number; g: number; above?: boolean }; water?: { s0: number; s1: number } }[] = [
      ...stuck.map(c => ({ at: c.s, road: { s: c.s, g: ctx.terrain.heightAt(c.x, c.y) } })),
      ...buried.map(f => ({ at: (f.s0 + f.s1) / 2, road: { s: (f.s0 + f.s1) / 2, g: ctx.terrain.heightAt(f.x, f.y) } })),
      ...unbuilt.map(c => ({ at: c.s, road: { s: c.s, g: ctx.terrain.heightAt(c.x, c.y), above: c.h <= -CROSSING_RULES.underDepth } })),
      ...missed.map(v => ({ at: (v.s0 + v.s1) / 2, water: { s0: v.s0, s1: v.s1 } }))];
    if (items.length) {
      // Each stretch is kept where it resolves more than it breaks, judged on its own.
      let groups = clusterBy(items, t => t.at, REGION);
      const run = (gs: typeof groups) => evaluateRoute(ctx, d, sep(gs));
      let retry = run(groups);
      retry.timing['count.separationRetry'] = 1;
      const better = (r: Result, gs: typeof groups) => gs.filter(g => regionCount(r, g.map(t => t.at)) < regionCount(result, g.map(t => t.at)));
      let keep = better(retry, groups);
      // Where a cutting for its bridge did not help either (the road falls away from us, so no ramp within its
      // slope gets back down to it), a designer carries our road over it instead: once more, above only.
      const failed = groups.filter(g => !keep.includes(g) && g.some(t => t.road && !t.road.above));
      if (failed.length) {
        const over = groups.map(g => failed.includes(g) ? g.map(t => t.road ? { ...t, road: { ...t.road, above: true } } : t) : g);
        const again = run(over);
        again.timing['count.separationRetry'] = 3;
        const kept = better(again, over);
        if (kept.length > keep.length) { groups = over; retry = again; keep = kept; }
      }
      if (keep.length === groups.length) { result = retry; used = sep(groups); }
      else if (keep.length) {
        const part = run(keep), count = (r: Result, g: typeof groups[number]) => regionCount(r, g.map(t => t.at));
        part.timing['count.separationRetry'] = 2;
        // (one stretch's clearances move the grade line at the next: where the kept stretches on their own
        // resolve less than with the others, and none of the others is worse for them, all are kept)
        if (keep.some(g => count(part, g) > count(retry, g)) && groups.every(g => count(retry, g) <= count(result, g))) { result = retry; used = sep(groups); }
        else { result = part; used = sep(keep); }
      }
    }
  };
  if (!opts.preview && !opts.window && !opts.separate && CATEGORIES[d.category].gradeSeparated && d.profileMode === 'auto') separation(opts);
  // Where our earthworks bury a road that could neither be rebuilt beside them nor kept behind a wall, a
  // designer lowers the grade there (or raises it out of a cutting) so the slope stays off the road: once
  // more with Auto asked for NARROW_STEP less embankment (cutting) there, kept per stretch where it
  // resolves more than it breaks.
  if (!opts.preview && !opts.window && d.profileMode === 'auto') {
    const r0 = result;
    const buried = r0.footprintConflicts.filter(f => f.feature === 'road' && f.action === 'blocked' && r0.kind[f.i] === KIND.earth && notAsked(r0)(f));
    if (buried.length) {
      const items = buried.map(f => {
        const h = r0.grade[f.i] - r0.ground[f.i];
        return { at: (f.s0 + f.s1) / 2, s0: f.s0 - NARROW_REACH, s1: f.s1 + NARROW_REACH, fill: h >= 0, z: r0.grade[f.i] + (h >= 0 ? -NARROW_STEP : NARROW_STEP) };
      });
      const groups = clusterBy(items, t => t.at, REGION);
      const with_ = (gs: typeof groups): EvalOptions => ({ ...used, narrow: gs.flat().map(({ s0, s1, fill, z }) => ({ s0, s1, fill, z })) });
      const run = (gs: typeof groups) => evaluateRoute(ctx, d, with_(gs));
      const retry = run(groups);
      retry.timing["count.narrowRetry"] = 1;
      const keep = groups.filter(g => regionCount(retry, g.map(t => t.at)) < regionCount(result, g.map(t => t.at)));
      if (keep.length === groups.length) { result = retry; used = with_(groups); }
      else if (keep.length) { result = run(keep); result.timing['count.narrowRetry'] = 2; used = with_(keep); }
    }
  }
  if (result.withNoise) result = result.withNoise();
  // A way merged into another way's crossing that our earthworks still bury (it could not be rebuilt beside
  // them, nor the grade kept off it) is a crossing of its own, treated like any other: once more, kept where it resolves more than it breaks.
  if (!opts.preview && !opts.window && result.mergedWays?.length) {
    const r0 = result, buried = r0.footprintConflicts.filter(f => f.feature === 'road' && f.action === 'blocked' && f.roadId !== undefined && r0.mergedWays!.includes(f.roadId));
    if (buried.length) {
      const split = { ...used, splitWays: [...new Set(buried.map(f => f.roadId!))] };
      let retry = evaluateRoute(ctx, d, split);
      if (retry.withNoise) retry = retry.withNoise();
      retry.timing['count.splitRetry'] = 1;
      if (regionCount(retry, buried.map(f => (f.s0 + f.s1) / 2)) < regionCount(r0, buried.map(f => (f.s0 + f.s1) / 2))) {
        result = retry; used = split;
        // (a way of its own may now be left neither room under us nor a buildable bridge over us)
        if (CATEGORIES[d.category].gradeSeparated && d.profileMode === 'auto') {
          separation(used);
          if (result !== retry && result.withNoise) result = result.withNoise();
        }
      }
    }
  }
  if (!opts.preview && !opts.window && CATEGORIES[d.category].gradeSeparated && d.profileMode === 'auto'
    && result.footprintConflicts.some(f => f.feature === 'road' && f.action === 'blocked' && result.kind[f.i] === KIND.earth && notAsked(result)(f))) {
    const before = result;
    separation(used, true);
    if (result !== before && result.withNoise) result = result.withNoise();
  }
  if (!opts.preview && !opts.window) rememberFull(ctx, d, opts, result);
  return result;
}

type MustBridge = { s: number; g: number; need: number; what: string; below?: number };
type CostClass = { ground: number; water: WaterCrossing[]; elevation: number; urban: number };
type SideHits = ReturnType<ReturnType<typeof routeSetup>['sideHits']>;
/** Stage 1 of evaluateRoute, before any road height is known: the stationed alignment (or the window of
 * it), the ground and its classes under it, what the grade line must clear (rivers, railways, our own
 * track, crossed roads, water crossings and their sizes) and the block layout of the grade solve. */
function routeSetup(ctx: EvalContext, d: Design, opts: EvalOptions) {
  const preview = !!opts.preview || !!opts.window;
  const t0 = performance.now();
  const timing: Record<string, number> = {};
  const lap = (k: string) => { timing[k] = performance.now() - t0; };
  const { terrain, scenario } = ctx;
  const cat = CATEGORIES[d.category];
  const norms = speedNorms(d.speed, d.category);
  const fullAlignment = buildAlignment(ctx.a, ctx.b, d.pis, horizontalRules(d.speed, d.category), bendRules(d.pis, d.speed, d.category));
  const win = opts.window;
  const al = win ? { ...fullAlignment, length: win.s1 - win.s0 } : fullAlignment;
  // A category's own gradient limit (motorway) replaces the scenario's road value; roads unchanged.
  const stFull = station(fullAlignment, STEP), st = win ? stationWindow(stFull, win.s0, win.s1) : stFull;
  // the steepest grade by the ground's terrain class per station (less in hairpins), radii by stretch (M4-2)
  const vlim = verticalLimits(st, fullAlignment, d.pis, d.speed, d.category, terrain,
    d.maxGradient ?? (cat.maxGradient ? undefined : scenario.maxGradient), win?.s0 ?? 0, stFull);
  const maxGradient = vlim.maxGradient;
  const n = st.n, ds = st.ds;
  let manualStructures = overrideMask(st.s, d.structureOverrides);
  const cutMethod = cutMethodMask(st.s, d.structureOverrides), bridgeStyle = styleMask(st.s, d.structureOverrides);
  // On a higher-ranking road's bridge over it (holds' `bridge`): that road's deck, built and billed with
  // that road's crossing; never judged as this road's own bridge (project-road.ts makes it a bridge here).
  const heldBridges = (opts.holds ?? []).flatMap(h => h.bridge ? [{ s0: h.bridge[0], s1: h.bridge[1], kind: KIND.bridge }] : []);
  const heldDeck = heldBridges.length ? Uint8Array.from(overrideMask(st.s, heldBridges), v => v === KIND.bridge ? 1 : 0) : undefined;
  const crossingOverrides = normalizeCrossingOverrides(d.crossingOverrides);
  const ground = new Float64Array(n);
  const groundIds = new Uint8Array(n), groundProfiles: GroundProfile[] = [], groundPackIds: number[] = [];
  const groundClasses = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const id = terrain.groundIdAt(st.x[i], st.y[i]);
    let k = groundClasses.get(id);
    if (k === undefined) {
      k = groundProfiles.length;
      groundClasses.set(id, k);
      groundProfiles.push(terrain.groundAt(st.x[i], st.y[i]));
      groundPackIds.push(id);
    }
    groundIds[i] = k;
  }
  const oobInput = new Uint8Array(n);
  const w = cat.crownWidth / 2;
  for (let i = 0; i < n; i++) {
    ground[i] = terrain.heightAt(st.x[i], st.y[i]);
    const nx = -st.ty[i], ny = st.tx[i];
    oobInput[i] = terrain.isOob(st.x[i], st.y[i]) || terrain.isOob(st.x[i] + nx * w, st.y[i] + ny * w)
      || terrain.isOob(st.x[i] - nx * w, st.y[i] - ny * w) ? 1 : 0;
  }
  // river / water-area / railway crossings: sample between stations too so diagonal crossings of a
  // 5 m raster line are not missed; each crossing is assigned to the nearest station
  // `clearance[i]` = minimum grade-minus-ground at station i that puts the grade `need` metres above
  // the crossing's own ground; the crossing samples themselves are kept for the final check
  const clearance = new Float64Array(n).fill(NaN);
  // (a rebuilt stretch: cells on its old road, where nothing is built; a crossing at s is the old road's
  // own when the cells on both sides of it are)
  const onOld = opts.oldRoad?.length === n ? opts.oldRoad : undefined;
  const oldAt = (s: number) => { if (!onOld) return false; const i = Math.max(0, Math.min(n - 1, Math.floor(s / ds))); return !!onOld[i] && !!onOld[Math.min(n - 1, i + 1)]; };
  // A full evaluation solves the grade in blocks so a local edit re-solves only its own stretch
  // (autoprofile.ts profileBlocks); everything the solve reads is then placed by its exact chainage.
  const blocks = preview || opts.fixedProfile ? undefined
    : fillLongBlocks(profileBlocks(planStraights(fullAlignment, ctx.a, ctx.b)), gridCrossings(fullAlignment, ctx.a, ctx.b, BLOCK_GRID), fullAlignment.length);
  const settleEnds = blocks && blockEnds(blocks, al.length);
  /** chainage at which a station's clearance applies (NaN: the station itself) */
  const clearanceS = new Float64Array(n).fill(NaN);
  const atS = (x: number) => { const p = pointAt(fullAlignment, x); return { x: p.x, y: p.y }; };
  /** Blocks: the station nearest chainage x not `taken` (within 8 stations; −1 if none), to carry a
   * grade-solve clearance placed at x itself (clearanceS). */
  const freeStation = (x: number, taken: (j: number) => boolean) => {
    const j0 = Math.max(0, Math.min(n - 1, Math.round(x / ds)));
    for (let o = 0; o <= 8; o++) for (const j of o ? [j0 - o, j0 + o] : [j0]) if (j >= 0 && j < n && !taken(j)) return j;
    return -1;
  };
  const streamSamples: number[] = [];
  /** `below`: the crossing may instead pass this far below the crossed feature (motorways) */
  const mustBridge: MustBridge[] = [];
  const railTieIn = opts.railTieIn && win ? { ...opts.railTieIn, a: opts.railTieIn.a - win.s0, b: opts.railTieIn.b - (fullAlignment.length - win.s1) } : opts.railTieIn;
  const railOurs = railTrackOurs(st, terrain, al.length, railTieIn);
  const retiredAt = opts.railRetired?.length ? nearLines(opts.railRetired, RETIRED_TRACK_M) : undefined;
  const tieIn = (s: number) => !!railOurs && railOurs[Math.max(0, Math.min(n - 1, Math.round(s / ds)))] === 1;
  /** a railway's own track under it: the station / rebuild-along stretch it joins (railOurs), or the old track
   * a rebuilt stretch takes up (retiredAt): no obstacle for its bridges' supports and clearances */
  const ownTrack = railOurs || retiredAt ? (x: number, y: number, i: number) =>
    (!!railOurs && railOurs[Math.max(0, Math.min(n - 1, i))] === 1) || (!!retiredAt && retiredAt(x, y)) : undefined;
  /** Blocks: the grade solve's clearances, one per crossing (`clearRuns`), not per station: how many
   * stations a crossing's raster samples fall on depends on the station grid, and each unmet one
   * would add a penalty, so a length change elsewhere could tip the choice to clear it. */
  const railHits: { x: number; item: MustBridge }[] = [];
  const clearRuns: { x0: number; x1: number; items: MustBridge[] }[] = [];
  const railOrRiver = (x: number, y: number, at: number, stations: number[]) => {
    const c = terrain.crossing(x, y);
    if (!c) return;
    if (c === 2 && (tieIn(at) || retiredAt?.(x, y))) return; // the existing track this railway joins, rebuilds or takes up
    const need = c === 2 ? STRUCTURE_RULES.railClearance : STRUCTURE_RULES.riverClearance;
    const gc = terrain.heightAt(x, y);
    const item = { s: at, g: gc, need, what: c === 2 ? 'railway' : 'river' };
    mustBridge.push(item);
    if (blocks) railHits.push({ x: at, item });
    for (const j of stations) {
      const req = need + gc - ground[j];
      if (!(clearance[j] >= req)) clearance[j] = req;
    }
  };
  if (blocks) {
    // Raster samples every ≈ quarter station, evenly within each block (not moving with the stations).
    const ends = [0, ...blocks.filter(x => x > 0 && x < al.length), al.length];
    for (let q = 0; q + 1 < ends.length; q++) {
      const m = Math.max(1, Math.round((ends[q + 1] - ends[q]) / (STEP / 4))), w = (ends[q + 1] - ends[q]) / m;
      for (let j = q === 0 ? 0 : 1; j <= m; j++) {
        const x = ends[q] + j * w, p = atS(x), i = Math.min(n - 1, Math.floor(x / ds + 1e-9));
        if (!terrain.watercourses && terrain.landcover(p.x, p.y) === LC.stream) streamSamples.push(x);
        railOrRiver(p.x, p.y, x, i + 1 < n ? [i, i + 1] : [i]);
      }
    }
  } else for (let i = 0; i < n; i++) {
    for (const f of [0, 0.25, 0.5, 0.75]) {
      if (f > 0 && i + 1 >= n) break;
      const x = st.x[i] + (i + 1 < n ? (st.x[i + 1] - st.x[i]) * f : 0);
      const y = st.y[i] + (i + 1 < n ? (st.y[i + 1] - st.y[i]) * f : 0);
      if (!terrain.watercourses && terrain.landcover(x, y) === LC.stream) streamSamples.push(st.s[i] + f * ds);
      railOrRiver(x, y, st.s[i] + f * ds, f === 0 ? [i] : [i, i + 1]);
    }
  }

  // A crossing's adjacent raster samples (≈ 2.5 m apart) form one run.
  for (const h of railHits) {
    const last = clearRuns[clearRuns.length - 1];
    if (last && h.x - last.x1 <= STEP / 2 && last.items[0].what === h.item.what) { last.x1 = h.x; last.items.push(h.item); }
    else clearRuns.push({ x0: h.x, x1: h.x, items: [h.item] });
  }
  // Collapse adjacent raster hits, rather than billing a new culvert for every 5 m stream pixel.
  const streamS: number[] = [];
  for (let k = 0; k < streamSamples.length; k++) {
    const start = k;
    while (k + 1 < streamSamples.length && streamSamples[k + 1] - streamSamples[k] <= CULVERT_RULES.rasterMerge) k++;
    streamS.push((streamSamples[start] + streamSamples[k]) / 2);
  }
  // Blocks: crossings found on a line traced evenly within each block (not moving with the stations).
  const traced = blocks ? (() => {
    const ends = [0, ...blocks.filter(x => x > 0 && x < al.length), al.length], S: number[] = [], X: number[] = [], Y: number[] = [];
    for (let q = 0; q + 1 < ends.length; q++) {
      const m = Math.max(1, Math.round((ends[q + 1] - ends[q]) / STEP)), w = (ends[q + 1] - ends[q]) / m;
      for (let j = q === 0 ? 0 : 1; j <= m; j++) { const x = j === m ? ends[q + 1] : ends[q] + j * w, p = atS(x); S.push(x); X.push(p.x); Y.push(p.y); }
    }
    return { n: S.length, s: S, x: X, y: Y };
  })() : { n, s: st.s, x: st.x, y: st.y };
  const snapTraced = (x: number) => {
    let lo = 0, hi = traced.n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (traced.s[mid] <= x) lo = mid; else hi = mid; }
    return x - traced.s[lo] <= traced.s[hi] - x ? traced.s[lo] : traced.s[hi];
  };
  const water = terrain.watercourses?.intersections(traced.n, traced.s, traced.x, traced.y) ?? streamS.map((s, id): WaterCrossing => {
    const i = Math.min(n - 1, Math.round(s / ds));
    return { s, id: -id - 1, x: st.x[i], y: st.y[i], waterKind: 'stream', width: 0.5,
      catchmentKm2: 0, truncated: true, sine: 1 };
  });
  const waterAt: WaterCrossing[][] = Array.from({ length: n }, () => []);
  const waterMin = new Float64Array(n).fill(NaN), waterBelow = new Float64Array(n).fill(NaN);
  const waterGround = new Map(water.map(c => [c, terrain.heightAt(c.x, c.y)]));
  for (const c of water) {
    const i = Math.min(n - 1, Math.round(c.s / ds));
    waterAt[i].push(c);
    const size = waterSize(c, cat.crownWidth + 12), g = waterGround.get(c)!;
    // Water can stay above a tunnel (put back over a cut-and-cover one); an open cut needs a diversion we do
    // not model.
    const need = size.minHeight;
    // (where a rebuilt stretch keeps its old road, the old road's own culvert stays under it: the grade is
    // not lifted for a new one)
    if (oldAt(c.s)) continue;
    const i0 = Math.min(n - 2, Math.floor(c.s / ds));
    for (const j of [i0, i0 + 1]) {
      waterMin[j] = Math.max(Number.isNaN(waterMin[j]) ? -Infinity : waterMin[j], g + need - ground[j]);
      waterBelow[j] = Math.min(Number.isNaN(waterBelow[j]) ? Infinity : waterBelow[j], g - STRUCTURE_RULES.portalDepth - ground[j]);
      if (blocks) clearanceS[j] = c.s;
    }
    mustBridge.push({ s: c.s, g, need, what: 'watercourse' });
  }
  // Distinct sparse crossing classes retain their actual size, skew and multiplicity in the DP.
  // Ground classes, rural then built-up: on the axis in a built-up area the town rates, surcharge and land
  // (SPK CN urban rows, building land), as the bill charges them there; then the watercourses' own classes.
  const G = groundProfiles.length, builtUp = (x: number, y: number) => terrain.cover(x, y) & BUILTUP_BIT ? 1 : 0;
  const costClasses: CostClass[] = [0, 1].flatMap(urban => groundProfiles.map((_, ground) => ({ ground, water: [] as WaterCrossing[], elevation: 0, urban })));
  const profileCostClass = Uint16Array.from(groundIds, (g, i) => g + G * builtUp(st.x[i], st.y[i]));
  /** Blocks: each crossing priced where it is (its own class at its own chainage and ground). */
  const profilePoints: { s: number; g: number; cls: number }[] = [];
  if (blocks) for (const c of water) {
    const g = waterGround.get(c)!;
    profilePoints.push({ s: c.s, g, cls: costClasses.length });
    costClasses.push({ ground: groundIds[Math.min(n - 1, Math.round(c.s / ds))], water: [c], elevation: g, urban: builtUp(c.x, c.y) });
  } else for (let i = 0; i < n; i++) if (waterAt[i].length) {
    profileCostClass[i] = costClasses.length;
    costClasses.push({ ground: groundIds[i], water: waterAt[i], elevation: ground[i], urban: builtUp(st.x[i], st.y[i]) });
  }
  const crossingCost = (cs: WaterCrossing[], width: number, z: number) => cs.reduce((v, c) => v + (z > waterGround.get(c)! ? culvertCost(c, width, z - waterGround.get(c)!) : 0), 0);
  const forceWater = (mask: Uint8Array, ss: ArrayLike<number>, heights: ArrayLike<number>, widths: ArrayLike<number>, chosen?: ArrayLike<number>) => {
    const step = ss[1] - ss[0];
    for (const c of water) {
      const i = Math.max(0, Math.min(ss.length - 1, Math.round((c.s - ss[0]) / step)));
      const size = waterSize(c, widths[i]);
      const opening = Math.max(c.width + 2 * CULVERT_RULES.bridgeBanks, size.q100 / (CULVERT_RULES.velocity * 2) + 2 * CULVERT_RULES.bridgeBanks);
      const halfSpan = opening / Math.max(0.01, c.sine) / 2;
      // a bridge chosen anywhere over the channel's opening spans it
      const near = (j: number) => Math.abs(ss[j] - c.s) <= halfSpan + step / 2;
      let bridged = size.type === 'bridge';
      for (let j = Math.max(0, Math.floor((c.s - halfSpan) / step) - 1); !bridged && chosen && j < ss.length && ss[j] <= c.s + halfSpan + step; j++)
        if (near(j) && chosen[j] === KIND.bridge) bridged = true;
      if (!bridged) continue;
      for (let j = 0; j < ss.length; j++) if (near(j) && heights[j] > 0) mask[j] = 1;
    }
  };

  const sideHits = (x: number, y: number, tx: number, ty: number) => (terrain.watercourses?.section(x, y, tx, ty, 150, 150) ?? []).map(hit => ({ ...hit,
    offset: -(hit.x - x) * ty + (hit.y - y) * tx, ground: terrain.heightAt(hit.x, hit.y) }));
  const waterSide = Array.from({ length: n }, (_, i) => sideHits(st.x[i], st.y[i], st.tx[i], st.ty[i]));
  type SideHits = ReturnType<typeof sideHits>;
  const stationSides = { ss: st.s, gz: ground, tx: st.tx, ty: st.ty, sides: waterSide, cell: ds };
  /** samples: `ss` chainage, `gz` ground, `tx`/`ty` tangent, `sides` watercourses across */
  const forceParallelWater = (mask: Uint8Array, smp: { ss: ArrayLike<number>; gz: ArrayLike<number>; tx: ArrayLike<number>; ty: ArrayLike<number>; sides: readonly SideHits[]; cell: number },
    z: ArrayLike<number>, left: ArrayLike<number>, right: ArrayLike<number>, diverted?: ReadonlySet<number>,
    waterElevation?: ReadonlyMap<WaterCrossing, number>) => {
    const { ss, gz } = smp;
    const gridDs = ss.length > 1 ? ss[1] - ss[0] : ds;
    const barrels = water.flatMap(c => {
      if (c.s < ss[0] - gridDs || c.s > ss[ss.length - 1] + gridDs) return [];
      const k = Math.max(0, Math.min(ss.length - 1, Math.round((c.s - ss[0]) / gridDs)));
      const j = Math.max(0, Math.min(ss.length - 2, Math.floor((c.s - ss[0]) / gridDs)));
      const t = Math.max(0, Math.min(1, (c.s - ss[j]) / (ss[j + 1] - ss[j])));
      const cover = (waterElevation?.get(c) ?? z[j] * (1 - t) + z[j + 1] * t) - waterGround.get(c)!;
      const envelope = culvertEnvelope(c, left[k], right[k], smp.cell, smp.tx[k], smp.ty[k], cover);
      return envelope ? [{ c, envelope }] : [];
    });
    for (let k = 0; k < ss.length; k++) {
      if (z[k] <= gz[k]) continue;
      if (smp.sides[k].some(hit => !diverted?.has(hit.id) && hit.offset <= left[k] && hit.offset >= -right[k]
        && z[k] - hit.ground >= STRUCTURE_RULES.riverClearance
        && !barrels.some(({ c, envelope }) => terrain.watercourses!.connected(c.id, hit.id)
          && barrelContains(hit, envelope)))) mask[k] = 1;
    }
  };
  const tunnelWater = (ss: ArrayLike<number>, z: ArrayLike<number>) => {
    const mask = new Uint8Array(ss.length);
    const step = ss[1] - ss[0];
    for (const c of water) {
      if (c.s < ss[0] - step / 2 || c.s > ss[ss.length - 1] + step / 2) continue;
      const i = Math.min(ss.length - 1, Math.round((c.s - ss[0]) / step));
      if (z[i] <= waterGround.get(c)! - STRUCTURE_RULES.portalDepth) mask[i] = 1;
    }
    return mask;
  };

  // existing roads crossed by the route (geometry only; resolved once the grade is known)
  const endJunctions = (ctx.junctions ?? []).flatMap(j => {
    const end = Math.hypot(j.x - ctx.a.x, j.y - ctx.a.y) < 1e-6 ? 'a' as const : Math.hypot(j.x - ctx.b.x, j.y - ctx.b.y) < 1e-6 ? 'b' as const : null;
    return end ? [{ end, kind: j.kind, ways: new Set(j.ways), ...ENDPOINT_JUNCTIONS[j.kind] }] : [];
  });
  // The road an end joins, met again inside that junction (an end placed a metre beside the mapped line,
  // leaving it at an angle), is the junction itself, not a crossing to cut and reconnect.
  const rawRoadX = (ctx.roads?.intersections(traced.n, traced.s, traced.x, traced.y) ?? [])
    .filter(c => !endJunctions.some(j => j.ways.has(c.way) && (j.end === 'a' ? c.s : al.length - c.s) <= j.zone));
  // Billing may merge carriageways / omit tie-in-area objects; safety must see every raw crossing.
  // Only actual endpoint connections are outside this project's crossing scope. The old
  // 150 m billing margin is not proof that nearby roads can be buried without engineering.
  // (a designed road of the project keeps its own crossing: it follows that crossing's height, project-evaluate.ts)
  const roadX = mergeCrossings(rawRoadX, al.length, { ...CROSSING_RULES, endMargin: CROSSING_RULES.endpointTolerance + 1e-6 },
    new Set([...crossingOverrides.map((o) => o.roadId), ...ctx.roads?.designedWays ? rawRoadX.filter(c => ctx.roads!.isDesigned(c.way)).map(c => c.way) : []]));
  manualStructures = crossingBridgeMask(st.s, rawRoadX, crossingOverrides, manualStructures);
  const roadG = roadX.map((c) => terrain.heightAt(c.x, c.y));
  // motorways / expressways are never crossed at grade: the grade clears them like a railway (the
  // auto-profile requests an overpass) or pass far enough below for an overbridge
  rawRoadX.forEach((c) => {
    if (!ROAD_CLASSES[c.cls].noAtGrade) return;
    // Only the actual endpoint tie-in is exempt (1 m coordinate tolerance), not the 150 m billing
    // margin or the other carriageway. B lies on D11; A gets the same rule if placed on a motorway.
    if (c.s <= CROSSING_RULES.endpointTolerance || al.length - c.s <= CROSSING_RULES.endpointTolerance) return;
    const need = STRUCTURE_RULES.railClearance, g = terrain.heightAt(c.x, c.y);
    const item = { s: c.s, g, need, what: ROAD_CLASSES[c.cls].label, below: CROSSING_RULES.underDepth };
    mustBridge.push(item);
    // A requested overbridge asks Auto for a cut, not the automatic motorway-overpass option.
    if (crossingChoice(c.way, crossingOverrides) === 'overbridge') return;
    if (blocks) clearRuns.push({ x0: c.s, x1: c.s, items: [item] });
    const i0 = Math.min(n - 1, Math.floor(c.s / ds));
    for (const j of c.s > st.s[i0] && i0 + 1 < n ? [i0, i0 + 1] : [i0]) {
      const req = need + g - ground[j];
      if (!(clearance[j] >= req)) clearance[j] = req;
    }
  });
  // Raster crossings were collected before vector roads; elevations() requires station order.
  mustBridge.sort((a, b) => a.s - b.s);
  lap('stations');
  const widen = hairpinWidening(al, d.pis, d.category, st.s); // a hairpin's widened lanes
  return { preview, timing, lap, terrain, scenario, cat, norms, vlim, widen, fullAlignment, win, al, maxGradient, st, n, ds,
    manualStructures, cutMethod, bridgeStyle, heldDeck, crossingOverrides, ground, groundIds, groundProfiles, groundPackIds,
    groundClasses, oobInput, w, clearance, onOld, blocks, settleEnds, clearanceS, atS, freeStation,
    mustBridge, railOurs, retiredAt, ownTrack, clearRuns, snapTraced, water, waterAt, waterMin, waterBelow,
    waterGround, G, builtUp, costClasses, profileCostClass, profilePoints, crossingCost, forceWater,
    sideHits, stationSides, forceParallelWater, tunnelWater, endJunctions, rawRoadX, roadX, roadG };
}

interface BalanceSamples {
  n: number; w: number; S: Float64Array; X: Float64Array; Y: Float64Array; TX: Float64Array; TY: Float64Array; G: Float64Array;
  urban: Uint8Array; must: Uint8Array; water: WaterCrossing[][]; overrides: Int8Array; cutMethod: Uint8Array; sides: SideHits[];
  roads: { k: number; j: number }[];
}
/** Stage 2: per-metre costs for the auto-profile on flat ground (rural or town rates, incl. the
 * surcharge / markups), the profile's cost tables and the mass-balance sampler (`balanceOf`). */
function routePrices(d: Design, setup: ReturnType<typeof routeSetup>) {
  const { cat, scenario, costClasses, water, waterGround, blocks, ds, terrain, groundPackIds, groundProfiles, al,
    roadX, mustBridge, fullAlignment, sideHits, rawRoadX, crossingOverrides, vlim, crossingCost, forceWater,
    forceParallelWater, roadG, tunnelWater } = setup;
  const mk = cat.markup;
  /** a tunnel's tubes and escape provision for its length (NV 264/2009) */
  const tunnelFactor = (length: number) => tunnelTubeFactor(cat, length, scenario.traffic);
  const divided = dividedRoad(cat);
  const surE = (u: number) => mk ? mk.earth : surchargeRate(u, divided), surB = (u: number) => mk ? mk.bridge : surchargeRate(u, divided);
  const surT = (u: number) => mk ? mk.tunnel : surchargeRate(u, divided);
  const sur = mk ? 1 + mk.earth : 1 + surchargeRate(0, divided), surBridge = mk ? 1 + mk.bridge : sur, surTunnel = mk ? 1 + mk.tunnel : sur;
  // The base rate rides on the earth markup in the cost expressions below: rescale it to its own markup.
  const baseScale = mk ? (1 + mk.base) / (1 + mk.earth) : 1;
  // Items charged on every option alike (railway track and systems, also on structures) cannot change a
  // choice: the decision costs leave them out; the bill (costParts) charges them everywhere.
  const everywhere = cat.everywherePerKm ?? { rural: 0, urban: 0 };
  const baseRural = (basePerKm(d.category, scenario.terrainClass) - everywhere.rural) / 1000 * baseScale;
  const baseUrban = (basePerKmUrban(d.category, scenario.terrainClass) - everywhere.urban) / 1000 * baseScale;
  const tunnelKm = (u = 0, cut = false) => categoryTunnelPerKm(cat, 0, u, cut);
  const tunnelPerM = (cat.tunnelTubes * tunnelKm() / 1000) * surTunnel;
  const bridge = bridgeModel(cat);
  const bridgeRural = (h: number) => bridge.estimatePerM(h) * surBridge + cat.crownWidth * LAND.perM2;
  // in a built-up area: the town surcharge, town land and the town tunnel rate (SPK CN urban rows)
  const landUrban = landPerM2(1);
  const bridgeUrban = (h: number) => bridge.estimatePerM(h) * (1 + surB(1)) + cat.crownWidth * landUrban;
  const tunnelPerMUrban = (cat.tunnelTubes * tunnelKm(1) / 1000) * (1 + surT(1));
  // cut and cover (a tunnel's ends, where the cover is too thin to mine): its pit beyond the SPK row by depth
  const cutCoverPerM = (h: number, town: boolean) => (cat.tunnelTubes * tunnelKm(town ? 1 : 0, true) / 1000 + cutCoverPitPerM(-h, b))
    * (town ? 1 + surT(1) : surTunnel);
  const b = cat.crownWidth;
  const topsoilPerM2 = PRICES.topsoilDepth * PRICES.topsoil;
  // Hydraulics does not depend on the mass-balance shadow price. Cache the sparse height LUT
  // across its iterations instead of resizing every barrel twice per entry on every iteration.
  // costFor is called only by autoProfile's fixed, bounded height grid, never at arbitrary h.
  const heightIndex = (h: number) => Math.round((h + PROFILE_HEIGHT_MAX) / PROFILE_HEIGHT_STEP);
  const dryOption = { cost: 0, bridge: false, tunnel: false };
  const waterPrice = { ...dryOption }; // scratch: consumed immediately by the synchronous cost callback
  const heightCount = Math.round(2 * PROFILE_HEIGHT_MAX / PROFILE_HEIGHT_STEP) + 1;
  const waterLut = costClasses.map(c => c.water.length ? {
    cost: new Float64Array(heightCount).fill(NaN), flags: new Uint8Array(heightCount),
  } : null);
  const waterSizes = new Map(water.map(c => [c, waterSizer(c)]));
  const waterOption = (cls: number, h: number, wd: number) => {
    const entry = costClasses[cls];
    if (!entry.water.length) return dryOption;
    const j = heightIndex(h);
    const lut = waterLut[cls]!;
    if (Number.isNaN(lut.cost[j])) {
      let cost = 0, flags = 0;
      const z = h + entry.elevation;
      for (const c of entry.water) {
        const bed = waterGround.get(c)!;
        if (z > bed) {
          const size = waterSizes.get(c)!(wd, z - bed);
          if (size.type === 'bridge') flags |= 1;
          else cost += barrelLength(c, wd) * size.perM + 2 * size.head;
        }
        if (z <= bed - STRUCTURE_RULES.portalDepth) flags |= 2;
      }
      lut.cost[j] = cost / (blocks ? STEP : ds);
      lut.flags[j] = flags;
    }
    waterPrice.cost = lut.cost[j]; waterPrice.bridge = !!(lut.flags[j] & 1); waterPrice.tunnel = !!(lut.flags[j] & 2);
    return waterPrice;
  };
  // Geometry is independent of the mass-balance price, sparse water class and the route itself.
  // Rows (by category) and dry-ground cost tables (by category, terrain class, material value and
  // pack ground id) are shared across evaluations of the same terrain; see profileTablesFor().
  const tables = profileTablesFor(terrain, `${d.category}|${scenario.terrainClass}`);
  const geometry = tables.geometry;
  const geometryAt = (h: number) => {
    const j = heightIndex(h);
    let row = geometry[j];
    if (!row) {
      const { area, width } = flatSection(h, b);
      row = { area, width, cuts: [], bridge: bridgeRural(h) };
      geometry[j] = row;
    }
    return row;
  };
  const cutsAt = (row: GeometryRow, h: number, ground: number): CutRow => row.cuts[groundPackIds[ground]] ??=
    (({ cuts, width, rockFace }) => ({ a: cuts, width, rockFace }))(flatSection(h, b, groundProfiles[ground]));
  // Water classes depend on this route's crossings: their tables are shared only within this call.
  const wetTables = new Map<string, Float64Array>();
  /** cost per metre against grade-minus-ground h for a given value of a m³ of fill material */
  const costFor = (materialValue: number) => {
    const dp = decisionPrices(materialValue);
    const cost = (h: number, kind = -1, costClass = 0): number => {
      const town = costClasses[costClass].urban;
      const tunnel = town ? tunnelPerMUrban : tunnelPerM;
      if (kind === KIND.tunnel) return tunnel;
      // the grade search's tunnel mode (autoprofile.ts): inside a tunnel wherever deeper than its portal
      // (bored where the cover allows, cut and cover above that), else as an open line
      if (kind === PROFILE_KIND.inTunnel) return -h < STRUCTURE_RULES.portalDepth ? cost(h, PROFILE_KIND.open, costClass)
        : -h >= STRUCTURE_RULES.tunnelMinDepth ? tunnel : cutCoverPerM(h, !!town);
      const geo = geometryAt(h), bridgeCost = town ? geo.bridgeUrban ??= bridgeUrban(h) : geo.bridge;
      if (kind === KIND.bridge) return bridgeCost;
      let earth: number;
      const cutRow = h < 0 ? cutsAt(geo, h, costClasses[costClass].ground) : undefined;
      const wd = cutRow ? cutRow.width : geo.width;
      const waterPrice = waterOption(costClass, h, wd);
      const base = town ? baseUrban : baseRural, mul = town ? 1 + surE(1) : sur, land = town ? landUrban : LAND.perM2;
      if (h >= 0) {
        const subgrade = treatedSubgrade(h, groundProfiles[costClasses[costClass].ground]) ? wd : 0;
        earth = (base + geo.area * dp.fillPerM3 + groundWorksPerM(0, subgrade) + wd * topsoilPerM2
          + waterPrice.cost) * mul + wd * land;
      } else {
        const [a1, a2, a3] = cutRow!.a;
        earth = (base + a1 * dp.cutPerM3.I + a2 * dp.cutPerM3.II + a3 * dp.cutPerM3.III
          + groundWorksPerM(cutRow!.rockFace, 0) + wd * topsoilPerM2 + waterPrice.cost) * mul + wd * land;
      }
      const waterBridge = waterPrice.bridge;
      if (waterBridge) earth = bridgeCost + 1e7; // unavailable earthwork, not a free zero-price culvert
      // under a stream: a tunnel (cut and cover where too shallow to mine, the stream put back over it)
      const underWater = waterPrice.tunnel ? -h >= STRUCTURE_RULES.tunnelMinDepth ? tunnel : cutCoverPerM(h, !!town) : 0;
      if (waterPrice.tunnel) earth = underWater + 1e7;
      if (kind === KIND.earth) return earth;
      // (an open line under a stream that needs a tunnel: the earthwork's price, unavailable)
      if (waterPrice.tunnel && kind !== PROFILE_KIND.open) return underWater;
      if (waterBridge && h >= STRUCTURE_RULES.riverClearance) return bridgeCost;
      let best = earth;
      if (h >= STRUCTURE_RULES.bridgeMinHeight) best = Math.min(best, bridgeCost);
      if (-h >= STRUCTURE_RULES.tunnelMinDepth && kind !== PROFILE_KIND.open) best = Math.min(best, tunnel);
      return best;
    };
    const table: SharedCostTable = (kind, costClass) => {
      const entry = costClasses[costClass];
      if (entry.water.length) {
        const key = `${materialValue}|${costClass}|${kind}`;
        let values = wetTables.get(key);
        if (!values) wetTables.set(key, values = new Float64Array(heightCount).fill(NaN));
        return values;
      }
      return tables.dry(materialValue, groundPackIds[entry.ground] * 2 + entry.urban, kind, heightCount);
    };
    return Object.assign(cost, { table });
  };
  const usable = 1 - NORM_EARTHWORK_ALLOWANCE.unsuitableShare;
  const balanceTolerance = MATERIAL_VALUE.tolerancePerM * al.length;
  const tpl = { crownWidth: b };
  // Mass balance of a candidate grade line over a stretch [r0, r1] (a block of the grade solve, or
  // the whole route): the same steps as the bill below (cross-sections, structure choice incl.
  // forced crossings, volumes), on samples every ≈ BALANCE_STRIDE stations placed evenly within the
  // stretch at their exact place on the line (so a block's samples do not move when the route
  // changes length elsewhere), with the built-up share taken at the centreline only.
  const balanceSamples = new Map<string, BalanceSamples>();
  const roadS = roadX.map((c) => c.s);
  const riversAndRails = mustBridge.filter(c => c.what !== 'watercourse').map(c => c.s);
  const samplesFor = (r0: number, r1: number): BalanceSamples => {
    const key = `${r0}|${r1}`;
    let smp = balanceSamples.get(key);
    if (smp) return smp;
    const m = Math.max(2, Math.round((r1 - r0) / (STEP * BALANCE_STRIDE))), w = (r1 - r0) / m;
    const S = new Float64Array(m), X = new Float64Array(m), Y = new Float64Array(m), TX = new Float64Array(m), TY = new Float64Array(m), G = new Float64Array(m);
    const urban = new Uint8Array(m), must = new Uint8Array(m), sides: SideHits[] = [];

    const p: PointOnAlignment = { x: 0, y: 0, tx: 1, ty: 0, curvature: 0 };
    for (let k = 0; k < m; k++) {
      S[k] = r0 + (k + 0.5) * w;
      pointAt(fullAlignment, S[k], p);
      X[k] = p.x; Y[k] = p.y; TX[k] = p.tx; TY[k] = p.ty; G[k] = terrain.heightAt(p.x, p.y);
      sides.push(sideHits(p.x, p.y, p.tx, p.ty));
      urban[k] = terrain.cover(p.x, p.y) & BUILTUP_BIT ? 1 : 0;
    }
    const slot = (x: number) => Math.floor((x - r0) / w);
    for (const x of riversAndRails) { const k = slot(x); if (k >= 0 && k < m) must[k] = 1; }
    const sw: WaterCrossing[][] = Array.from({ length: m }, () => []);
    for (const c of water) { const k = slot(c.s); if (k >= 0 && k < m) sw[k].push(c); }
    const roads: { k: number; j: number }[] = [];
    roadX.forEach((c, j) => { const k = slot(c.s); if (k >= 0 && k < m) roads.push({ k, j }); });
    smp = { n: m, w, S, X, Y, TX, TY, G, sides, urban, must, water: sw, roads, cutMethod: cutMethodMask(S, d.structureOverrides),
      overrides: crossingBridgeMask(S, rawRoadX, crossingOverrides, overrideMask(S, d.structureOverrides)) };
    balanceSamples.set(key, smp);
    return smp;
  };
  const balanceOf = (v: VPI[], materialValue: number, range: readonly [number, number] = [0, al.length]) => {
    const { n: m, w, S, X, Y, TX, TY, G, sides, urban, must: mustBase, water: sw, roads, overrides, cutMethod } = samplesFor(range[0], range[1]);
    const p = buildProfile(v, vlim.crest, vlim.sag);
    const z = elevations(p, S);
    const sc = computeSections(terrain, m, X, Y, TX, TY, z, tpl);
    const dp = decisionPrices(materialValue);
    const hh = new Float64Array(m), earth = new Float64Array(m), bp = new Float64Array(m), tunnel = new Float64Array(m), cutCover = new Float64Array(m), pit = new Float64Array(m);
    const must = new Uint8Array(m);
    for (let k = 0; k < m; k++) {
      hh[k] = z[k] - G[k];
      const u = urban[k], su = 1 + surE(u), land = landPerM2(u), wd = sc.dayL[k] + sc.dayR[k];
      earth[k] = (baseRural + (baseUrban - baseRural) * u + sc.cutI[k] * dp.cutPerM3.I + sc.cutII[k] * dp.cutPerM3.II
        + sc.cutIII[k] * dp.cutPerM3.III + sc.fill[k] * dp.fillPerM3 + wd * topsoilPerM2
        + groundWorksPerM(sc.rockFace[k], sc.subgrade[k])
        + crossingCost(sw[k], wd, z[k]) / w) * su + wd * land;
      bp[k] = bridge.bestPerM(hh[k]) * (mk ? 1 + surB(u) : su) + b * land;
      tunnel[k] = (cat.tunnelTubes * tunnelKm(u) / 1000) * (mk ? 1 + surT(u) : su);
      cutCover[k] = (cat.tunnelTubes * tunnelKm(u, true) / 1000) * (mk ? 1 + surT(u) : su);
      pit[k] = cutCoverPitPerM(-hh[k], b) * (mk ? 1 + surT(u) : su);
      if (mustBase[k] && hh[k] > 0) must[k] = 1;
    }
    forceWater(must, S, hh, Float64Array.from(sc.dayL, (v, i) => v + sc.dayR[i]));
    forceParallelWater(must, { ss: S, gz: G, tx: TX, ty: TY, sides, cell: STEP }, z, sc.dayL, sc.dayR);
    if (roads.length) {
      const rz = elevations(p, roads.map(r => roadS[r.j]));
      roads.forEach(({ k, j }, q) => {
        const c = roadX[j];
        const choice = crossingChoice(c.way, crossingOverrides);
        if (!((!choice || choice === 'bridge') && ROAD_CLASSES[c.cls].separable && rz[q] - roadG[j] >= CROSSING_RULES.overHeight && hh[k] > 0)) return;
        // Auto local roads may instead pass through the embankment in a priced underpass.
        const wd = sc.dayL[k] + sc.dayR[k], box = !choice && underpassFits({ cls: c.cls, h: rz[q] - roadG[j] }, wd) ? underpassPrice(c, wd, urban[k]) : undefined;
        if (box) earth[k] += box.cost * (1 + surB(urban[k])) / w;
        else must[k] = 1;
      });
    }
    const input = { ds: w, h: hh, earthPerM: earth, bridgePerM: bp, tunnelPerM: tunnel, cutCoverPerM: cutCover, cutCoverExtraPerM: pit, tunnelFactor, cutMethod, forced: must, forcedTunnel: tunnelWater(S, z), overrides,
      bridgeRunCost: equalSpanRunCost(bridgeRunCost(bridge, hh, w, i => surB(urban[i]), i => landPerM2(urban[i]))) };
    const firstChoice = chooseStructures(input);
    forceWater(must, S, hh, Float64Array.from(sc.dayL, (v, i) => v + sc.dayR[i]), firstChoice.kind);
    const { kind } = chooseStructures(input);
    let bal = 0;
    for (let k = 0; k < m; k++) if (kind[k] === KIND.earth) bal += (usable * sc.cut[k] - sc.fill[k]) * w;
    return bal;
  };
  return { surE, surB, surT, baseRural, baseUrban, tunnelKm, tunnelFactor, bridge, b, topsoilPerM2, costFor, usable,
    balanceTolerance, tpl, roadS, balanceOf };
}

/** Stage 3, the vertical alignment: Auto's grade line (the block solve, its material value and pins) or
 * the player's height points. */
function routeGradeLine(ctx: EvalContext, d: Design, opts: EvalOptions, setup: ReturnType<typeof routeSetup>, prices: ReturnType<typeof routePrices>) {
  const { ground, n, blocks, clearance, manualStructures, cutMethod, heldDeck, rawRoadX, crossingOverrides, terrain, ds,
    clearanceS, waterMin, waterBelow, clearRuns, freeStation, cat, onOld, win, maxGradient, vlim,
    profileCostClass, costClasses, profilePoints, atS, groundClasses, G, builtUp, al, st, preview,
    mustBridge, lap, roadX } = setup;
  const { costFor, balanceOf } = prices;
  let vpis: VPI[];
  let profileFeasible = true;
  let autoOptions: AutoProfileOptions | undefined;
  /** a fixed exterior (EvalOptions.fixedProfile): Auto re-solves go through it, repairs keep it */
  let constrainedSolve: ((o: AutoProfileOptions) => ReturnType<typeof autoProfile>) | null = null;
  let keepsExterior = (_v: VPI[]) => true;
  let pinViolations: Violation[] = [];
  let materialValue = MATERIAL_VALUE.start;
  /** block-wise solve: each block's material value, and per station */
  let blockValues: number[] | undefined, materialAt: Float64Array | undefined;
  /** blocks of the Auto grade solve (their ends, 0 … L): support lifts stay within one */
  let liftBlocks: number[] | undefined;
  const decisions = new Map<number, ReturnType<typeof decisionPrices>>();
  const blockDecision = (v: number) => { let p = decisions.get(v); if (!p) decisions.set(v, p = decisionPrices(v)); return p; };
  const zA = opts.endpointElevations?.a ?? ground[0], zB = opts.endpointElevations?.b ?? ground[n - 1];
  if (!Number.isFinite(zA) || !Number.isFinite(zB)) throw new Error('Non-finite endpoint elevation');
  if (d.profileMode === 'auto' || d.vpis.length < 2) {
    /** crossed roads our grade must pass under (a bridge over us asked for): their own height */
    const mustBelow: { s: number; g: number }[] = [];
    const minH = blocks ? new Float64Array(n).fill(NaN) : clearance.slice();
    const maxH = new Float64Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      if (manualStructures[i] === KIND.bridge && !heldDeck?.[i]) minH[i] = Math.max(Number.isNaN(minH[i]) ? -Infinity : minH[i], STRUCTURE_RULES.bridgeMinHeight);
      // a mined tunnel the player chose: under enough cover to mine; cut and cover: as deep as it can be dug
      if (manualStructures[i] === KIND.tunnel) maxH[i] = cutMethod[i] ? -STRUCTURE_RULES.portalDepth : -STRUCTURE_RULES.tunnelMinDepth;
      if (manualStructures[i] === KIND.tunnel && cutMethod[i]) minH[i] = Math.max(Number.isNaN(minH[i]) ? -Infinity : minH[i], -(STRUCTURE_RULES.portalDepth + TUNNEL_RULES.cutCoverMaxCover));
    }
    // (the player's underpass or our bridge over a road are met by a local lift of the line where it falls
    // short, routeEngineer's choiceHeights; a bridge over us over a motorway asks for a cutting here)
    for (const c of rawRoadX) {
      if (crossingChoice(c.way, crossingOverrides) !== 'overbridge' || !ROAD_CLASSES[c.cls].noAtGrade) continue;
      const g = terrain.heightAt(c.x, c.y), i0 = Math.min(n - 1, Math.floor(c.s / ds));
      for (const i of [i0, Math.min(n - 1, i0 + 1)]) {
        if (blocks) clearanceS[i] = c.s;
        maxH[i] = Math.min(Number.isNaN(maxH[i]) ? Infinity : maxH[i], g - CROSSING_RULES.underDepth - ground[i]);
      }
      mustBelow.push({ s: c.s, g });
    }
    for (const f of opts.choiceFloors ?? []) {
      const i0 = Math.min(n - 2, Math.floor(f.s / ds));
      for (const i of [i0, i0 + 1]) {
        if (blocks) clearanceS[i] = f.s;
        minH[i] = Math.max(Number.isNaN(minH[i]) ? -Infinity : minH[i], f.z - ground[i]);
      }
    }
    // Roads to clear (opts.separate): our bridge 6 m above, or a cutting 6 m below for theirs.
    // Only there (and at the rivers / railways it failed to clear) does a missed clearance cost
    // more than any structure: elsewhere the grade line stays as it was.
    const penaltyAt = opts.separate ? new Float64Array(n).fill(CLEARANCE_PENALTY) : undefined;
    if (penaltyAt) for (const r of opts.separateWater ?? []) {
      for (let i = Math.max(0, Math.floor((r.s0 - SEPARATION_REACH) / ds)); i <= Math.min(n - 1, Math.ceil((r.s1 + SEPARATION_REACH) / ds)); i++) penaltyAt[i] = SEPARATION_PENALTY;
    }
    for (const r of opts.narrow ?? []) {
      for (let i = Math.max(0, Math.ceil(r.s0 / ds)); i <= Math.min(n - 1, Math.floor(r.s1 / ds)); i++) {
        if (r.fill) maxH[i] = Math.min(Number.isNaN(maxH[i]) ? Infinity : maxH[i], r.z - ground[i]);
        else minH[i] = Math.max(Number.isNaN(minH[i]) ? -Infinity : minH[i], r.z - ground[i]);
      }
    }
    const separation = (above: Float64Array, below: Float64Array) => {
      for (const c of opts.separate ?? []) {
        const i0 = Math.min(n - 2, Math.floor(c.s / ds));
        for (const i of [i0, i0 + 1]) {
          if (blocks) clearanceS[i] = c.s;
          penaltyAt![i] = SEPARATION_PENALTY;
          above[i] = Math.max(Number.isNaN(above[i]) ? -Infinity : above[i], c.g + CROSSING_RULES.overHeight - ground[i]);
          below[i] = c.above ? -Infinity : Math.min(Number.isNaN(below[i]) ? Infinity : below[i], c.g - CROSSING_RULES.underDepth - ground[i]);
        }
      }
      return { above, below };
    };
    const either = separation(waterMin.slice(), waterBelow.slice());
    // Blocks: each crossing run's clearance (its highest requirement) at points evenly along it, as
    // many as a run of its length covers stations (at least its two ends), so a wide river weighs as
    // before; each carried by a free station near it (a station only carries it: its ground cancels).
    const runSlots = new Map<MustBridge, number[]>();
    if (blocks) {
      const taken = (j: number) => !Number.isNaN(minH[j]) || !Number.isNaN(maxH[j]) || !Number.isNaN(either.above[j]) || !Number.isNaN(either.below[j]);
      for (const r of clearRuns) {
        const z = Math.max(...r.items.map(c => c.g + c.need)), slots: number[] = [];
        const m = Math.max(2, Math.round((r.x1 - r.x0) / STEP) + 1);
        for (const x of Array.from({ length: m }, (_, q) => r.x0 + (r.x1 - r.x0) * q / (m - 1))) {
          const j = freeStation(x, taken);
          if (j < 0) continue;
          minH[j] = z - ground[j]; clearanceS[j] = x; slots.push(j);
        }
        for (const c of r.items) runSlots.set(c, slots);
      }
    }
    // A local road or track meets the minor roads it crosses in a crossroads (resolveCrossings): Auto keeps
    // it at their level there, so that they need no ramps (±MINOR_CROSSROADS_BAND, as a crossing hold).
    if (cat.minor) for (const c of rawRoadX) {
      const choice = crossingChoice(c.way, crossingOverrides);
      if (choice && choice !== 'junction' || minorCrossroads(cat.minor, c.cls) === undefined || ctx.roads?.isDesigned(c.way)) continue;
      const g = terrain.heightAt(c.x, c.y), i0 = Math.max(0, Math.min(n - 2, Math.floor(c.s / ds)));
      for (const i of [i0, i0 + 1]) {
        minH[i] = Math.max(Number.isNaN(minH[i]) ? -Infinity : minH[i], g - MINOR_CROSSROADS_BAND - CLEARANCE_MARGIN - ground[i]);
        maxH[i] = Math.min(Number.isNaN(maxH[i]) ? Infinity : maxH[i], g + MINOR_CROSSROADS_BAND + CLEARANCE_MARGIN - ground[i]);
      }
    }
    // A rebuilt stretch, where it keeps its old road: Auto stays on the old road's surface (within
    // OLD_ROAD_BAND; the line is smooth, the surveyed surface is not), so that it neither digs the kept road
    // out nor heaps the new part's spoil onto it. The last cell on the old road beside each new part is held
    // closer (OLD_ROAD_TIE): the new part starts and ends at the old road's height. Both as a crossing hold,
    // widened by the search's margin.
    if (onOld) for (let i = 0; i < n; i++) if (onOld[i]) {
      const band = (i > 0 && !onOld[i - 1] || i + 1 < n && !onOld[i + 1] ? OLD_ROAD_TIE : OLD_ROAD_BAND) + CLEARANCE_MARGIN;
      minH[i] = Math.max(Number.isNaN(minH[i]) ? -Infinity : minH[i], -band);
      maxH[i] = Math.min(Number.isNaN(maxH[i]) ? Infinity : maxH[i], band);
    }
    for (const hold of opts.holds ?? []) {
      // The search keeps CLEARANCE_MARGIN inside each bound: a two-sided band is widened by it, so a
      // band of ±0.5 m is aimed at its middle rather than infeasible.
      const both = hold.min > -Infinity && hold.max < Infinity ? CLEARANCE_MARGIN : 0;
      const i0 = Math.max(0, Math.min(n - 2, Math.floor(hold.s / ds)));
      for (const i of [i0, i0 + 1]) {
        if (hold.min > -Infinity) minH[i] = Math.max(Number.isNaN(minH[i]) ? -Infinity : minH[i], hold.min - both - ground[i]);
        if (hold.max < Infinity) maxH[i] = Math.min(Number.isNaN(maxH[i]) ? Infinity : maxH[i], hold.max + both - ground[i]);
      }
    }
    const apOpt = {
      endpointElevations: opts.endpointElevations, ...(win ? { startGrade: win.grades.a, endGrade: win.grades.b } : {}),
      maxGradient, minCrest: vlim.crestMin, minSag: vlim.sagMin,
      ...(vlim.gradeAt ? { gradeAt: vlim.gradeAt } : {}),
      ...(typeof vlim.crest === 'number' ? {} : { crestAt: vlim.crest }), ...(typeof vlim.sag === 'number' ? {} : { sagAt: vlim.sag }),
      costPerM: costFor(MATERIAL_VALUE.start), minH, maxH, eitherH: either, structureKind: manualStructures, pins: d.gradePins,
      portalDepth: STRUCTURE_RULES.portalDepth,
      // A motorway or railway structure costs far more than the default penalty (a 70 m motorway bridge):
      // clear rivers, railways and roads rather than pay it.
      ...(penaltyAt ? { clearancePenaltyAt: penaltyAt } : {}),
      costClass: profileCostClass, costClassCount: costClasses.length,
      ...(cat.minor ? { knotSpacing: MINOR_KNOTS } : onOld ? { knotSpacing: OLD_ROAD_KNOTS } : {}),
      ...(blocks ? { blocks, points: profilePoints, pointWeight: STEP, clearanceS,
        groundAt: (x: number) => { const p = atS(x); return terrain.heightAt(p.x, p.y); },
        classAt: (x: number) => { const p = atS(x), g = groundClasses.get(terrain.groundIdAt(p.x, p.y)); return g === undefined ? -1 : g + G * builtUp(p.x, p.y); } } : {}),
      balance: {
        costFor, balanceOf, start: MATERIAL_VALUE.start, lo: MATERIAL_VALUE.lo, hi: MATERIAL_VALUE.hi,
        tolerance: MATERIAL_VALUE.tolerancePerM * al.length,
      },
      ...(blocks && opts.passCache ? { memo: opts.passCache.profile } : {}),
    };
    autoOptions = apOpt;
    // Auto between the ends of a given grade line (one direction of a separate motorway stretch): the
    // search runs on those stations only and its line is spliced into the given one.
    const fp = opts.fixedProfile;
    let solveAuto = (o: AutoProfileOptions) => autoProfile(st.s, ground, o);
    if (fp) {
      const j0 = Math.max(0, Math.ceil(fp.x0 / ds - 1e-9)), j1 = Math.min(n - 1, Math.floor(fp.x1 / ds + 1e-9));
      const fixedProf = buildProfile([...fp.vpis], vlim.crest, vlim.sag);
      const sa = st.s[j0], sb = st.s[j1], [za, za1, zb0, zb] = elevations(fixedProf, [sa, sa + 1, sb - 1, sb]);
      const splice = (v: readonly VPI[]): VPI[] => [...fp.vpis.filter(p => p.s < sa - 1), { s: sa, z: za, r: null },
        ...v.slice(1, -1).map(p => ({ ...p, s: p.s + sa })), { s: sb, z: zb, r: null }, ...fp.vpis.filter(p => p.s > sb + 1)];
      const cut = <T extends ArrayLike<number>>(a: T | undefined) => a && (a as unknown as Float64Array).slice(j0, j1 + 1) as unknown as T;
      const subS = Float64Array.from(st.s.subarray(j0, j1 + 1), v => v - sa), subG = ground.slice(j0, j1 + 1);
      solveAuto = (o) => {
        const r = autoProfile(subS, subG, { ...o, endpointElevations: { a: za, b: zb }, startGrade: za1 - za, endGrade: zb - zb0,
          ...(fp.slack ? { startGradeSlack: fp.slack[0], endGradeSlack: fp.slack[1] } : {}),
          minH: cut(o.minH), maxH: cut(o.maxH), structureKind: cut(o.structureKind), costClass: cut(o.costClass),
          ...(o.eitherH ? { eitherH: { above: cut(o.eitherH.above)!, below: cut(o.eitherH.below)! } } : {}),
          pins: (o.pins ?? []).filter(p => p.s > sa && p.s < sb).map(p => ({ ...p, s: p.s - sa })),
          ...(o.balance ? { balance: { ...o.balance, balanceOf: (v: VPI[], mv: number) => o.balance!.balanceOf(splice(v), mv) } } : {}) });
        return { ...r, vpis: splice(r.vpis), pinViolations: r.pinViolations?.map(v => ({ ...v, s0: v.s0 + sa, s1: v.s1 + sa })) };
      };
      constrainedSolve = solveAuto;
      const outside = Array.from(st.s).filter(x => x < sa - 1e-6 || x > sb + 1e-6), fixedZ = elevations(fixedProf, outside);
      keepsExterior = (v) => { const z = elevations(buildProfile(v, vlim.crest, vlim.sag), outside); return z.every((q, k) => Math.abs(q - fixedZ[k]) < 0.01); };
    }
    // a preview always solves once, at the given (else the starting) material value
    const fixed = preview ? opts.materialValue ?? MATERIAL_VALUE.start : undefined;
    let ap = fixed === undefined ? solveAuto(apOpt)
      : { ...solveAuto({ ...apOpt, costPerM: costFor(fixed), balance: undefined }), materialValue: fixed };
    // vertical curves can shave the clearance the polyline search provided: retry asking for more
    for (let attempt = 0; attempt < 2 && (mustBridge.length || mustBelow.length) && !preview; attempt++) {
      const prof0 = buildProfile(ap.vpis, vlim.crest, vlim.sag);
      const z0 = elevations(prof0, mustBridge.map((c) => c.s));
      let short = 0;
      const minH = apOpt.minH.slice(), waterAbove = apOpt.eitherH.above.slice(), maxH = apOpt.maxH.slice();
      // …and sag curves can fill in the cutting a bridge over us needs
      const zb = elevations(prof0, mustBelow.map(c => c.s));
      mustBelow.forEach((c, k) => {
        const deficit = zb[k] - (c.g - CROSSING_RULES.underDepth);
        if (deficit <= 1e-6) return;
        short = Math.max(short, deficit);
        const i0 = Math.min(n - 2, Math.floor(c.s / ds));
        for (const i of [i0, i0 + 1]) maxH[i] = Math.min(Number.isNaN(maxH[i]) ? Infinity : maxH[i], c.g - CROSSING_RULES.underDepth - ground[i] - deficit - 0.5);
      });
      mustBridge.forEach((c, k) => {
        // A surface stream above a tunnel is already separated. Never let that
        // crossing raise every other clearance by the hill's entire height.
        if (c.what === 'watercourse' && z0[k] <= c.g - STRUCTURE_RULES.portalDepth) return;
        if (c.below !== undefined && z0[k] <= c.g - c.below) {
          // passing under it: kept there by whatever comes next (support lifts and their re-solve)
          const i0 = Math.min(n - 2, Math.floor(c.s / ds));
          for (const i of [i0, i0 + 1]) for (const cap of [maxH, apOpt.maxH]) cap[i] = Math.min(Number.isNaN(cap[i]) ? Infinity : cap[i], c.g - c.below - ground[i]);
          return;
        }
        if (c.below !== undefined && rawRoadX.some((road) => Math.abs(road.s - c.s) < 1e-6 && crossingChoice(road.way, crossingOverrides) === 'overbridge')) return;
        const deficit = c.g + c.need - z0[k];
        if (deficit <= 1e-6) return;
        // (a line that may pass under it instead, and is nearer to that: lowered the rest of the way)
        const under = c.below !== undefined ? z0[k] - (c.g - c.below) : Infinity;
        if (under < deficit) {
          short = Math.max(short, under);
          const i0 = Math.min(n - 2, Math.floor(c.s / ds));
          for (const i of [i0, i0 + 1]) maxH[i] = Math.min(Number.isNaN(maxH[i]) ? Infinity : maxH[i], c.g - c.below! - ground[i] - under - 0.5);
          return;
        }
        short = Math.max(short, deficit);
        const slots = runSlots.get(c);
        if (slots) { for (const j of slots) minH[j] = Math.max(minH[j], c.g + c.need - ground[j] + deficit + 0.5); return; }
        const target = c.what === 'watercourse' ? waterAbove : minH;
        const i0 = Math.min(n - 2, Math.floor(c.s / ds));
        if (blocks) clearanceS[i0] = clearanceS[i0 + 1] = c.s;
        for (const i of [i0, i0 + 1]) target[i] = Math.max(Number.isNaN(target[i]) ? -Infinity : target[i], c.g + c.need - ground[i] + deficit + 0.5);
      });
      if (short <= 1e-6) break;
      apOpt.minH = minH; apOpt.eitherH.above = waterAbove; apOpt.maxH = maxH;
      // same material value: only the clearance changes
      const mv = ap.materialValue ?? MATERIAL_VALUE.start;
      const retry = solveAuto(ap.blockValues ? { ...apOpt, blockValues: ap.blockValues }
        : { ...apOpt, balance: { ...apOpt.balance, start: mv, lo: mv, hi: mv } });
      // A clearance refinement must not replace an already pin-compliant solution by its straight
      // fallback. Keep the useful grade and report its clearance shortfall instead.
      if (d.gradePins?.length && !retry.feasible) break;
      ap = retry;
    }
    vpis = ap.vpis;
    materialValue = ap.materialValue ?? MATERIAL_VALUE.start;
    if (blocks && ap.blockBounds) liftBlocks = ap.blockBounds;
    if (ap.blockValues && ap.blockBounds) {
      blockValues = ap.blockValues;
      materialAt = new Float64Array(n);
      for (let i = 0, j = 0; i < n; i++) {
        while (j < blockValues.length - 1 && st.s[i] > ap.blockBounds[j + 1] + 1e-6) j++;
        materialAt[i] = blockValues[j];
      }
    }
    profileFeasible = ap.feasible;
    pinViolations = ap.pinViolations ?? [];
  } else {
    // manual: keep interior VPIs inside the route, pin the ends to the tie-in elevations
    const L = al.length;
    vpis = normalizeVpis(d.vpis, L, zA, zB);
  }
  lap('profile');
  const autoVpis = vpis;
  // Grade repair reuses alignment, feature queries and the completed DP search. Only engineering
  // quantities are rebuilt; buildings, crossing meshes, noise and billing run once per finish()
  // (twice only when the strict fallback below re-engineers; its lift loop and DP retry repeat).
  // Centreline crossings own their connected stretch inside the footprint (crossing remedy);
  // grade-separated classes cannot be diverted and stay ordinary retaining obstacles.
  // Ways merged into another crossing's billing group have no remedy of their own.
  const crossingWays = new Map<number, number[]>(), remedied = new Set(roadX.map(c => c.way));
  if (ctx.roads) for (const c of rawRoadX) {
    if (!remedied.has(c.way) || ROAD_CLASSES[c.cls].noAtGrade) continue;
    const list = crossingWays.get(c.way) ?? [];
    list.push(ctx.roads.wayStation(c.way, c.x, c.y)); crossingWays.set(c.way, list);
  }
  return { profileFeasible, autoOptions, constrainedSolve, keepsExterior, pinViolations, materialValue, blockValues,
    liftBlocks, blockDecision, autoVpis, crossingWays };
}

/** Stage 4: the memo tables (from `opts.passCache` on a retry) and per-station scratch arrays that the
 * engineering passes share (`engineer`, below). */
function routeCaches(ctx: EvalContext, d: Design, opts: EvalOptions, setup: ReturnType<typeof routeSetup>) {
  const { n, st, ds, timing } = setup;
  const pc = opts.passCache;
  const supportMemo = pc?.support ?? new Map<string, number>(), retainingMemo: RetainingFeatureCache = pc?.retaining ?? new Map();
  /** cells a bridge must span for a stream its end would otherwise bury (set by a retry below) */
  const streamBridge = new Uint8Array(n);
  // Reroutes traced and engineered by the first pass, reused by the strict retry where our footprint is unchanged.
  const reroutes = pc?.reroutes ?? crossingCache();
  const sectionMemo: SectionCache = pc?.sections ?? [];
  // Grade repairs keep the horizontal strips fixed. Earth cover changes only where retaining
  // or daylight changes the two widths; deck/centre cover never changes within this evaluation.
  // These buffers describe the last engineer() call, which is always the accepted engineering;
  // do not reuse them for speculative candidates unless that ownership rule is preserved.
  const coverLeft = new Float64Array(n).fill(NaN), coverRight = new Float64Array(n).fill(NaN);
  const urbanEarth = new Float32Array(n), forestEarth = new Float32Array(n), urbanDeck = new Float32Array(n);
  const urbanCentre = new Uint8Array(n), oobEarth = new Uint8Array(n), oobDeck = new Uint8Array(n);
  /** per cell: buildings under the deck strip / the earthwork (at the widths it was found for) */
  const deckHits: number[][] = [], earthHits: number[][] = Array.from({ length: n }, () => []);
  const earthHitL = new Float64Array(n).fill(NaN), earthHitR = new Float64Array(n).fill(NaN);
  // the same before any retaining wall narrows a section (walls only narrow: the lists after them are subsets)
  const wideHits: number[][] = Array.from({ length: n }, () => []);
  const wideHitL = new Float64Array(n).fill(NaN), wideHitR = new Float64Array(n).fill(NaN);
  /** buildings the slopes (width l left, r right) plus the working strip reach at station i */
  const hitsAt = (i: number, l: number, r: number, from?: readonly number[]) => {
    const bld = ctx.buildings!, x = st.x[i], y = st.y[i], tx = st.tx[i], ty = st.ty[i], list: number[] = [];
    const off = (l - r) / 2, half = (l + r) / 2 + BUILDING_RULES.clearance, cx = x - ty * off, cy = y + tx * off;
    const test = (j: number) => { if (bld.hits(j, cx, cy, tx, ty, ds / 2 + 0.5, half)) list.push(j); };
    if (from) from.forEach(test); else bld.near(x, y, Math.max(l, r) + BUILDING_RULES.clearance + ds, test);
    return list;
  };
  const deckBuildings = new Float64Array(n), earthBuildings = new Float64Array(n);
  const work = (key: string, start: number) => { timing[`work.${key}`] = (timing[`work.${key}`] ?? 0) + performance.now() - start; };
  // Buildings a retaining wall may keep clear of our works (the player's kept ones; Auto's where only the
  // working strip reaches them and the wall is cheaper); bought ones are never walled for.
  const wallable = ctx.buildings ? (() => {
    const o = normalizeBuildingOverrides(d.buildingOverrides, ctx.buildings!.n);
    return { index: ctx.buildings!, keep: new Set(o.filter(b => b.action === 'keep').map(b => b.j)), skip: new Set(o.filter(b => b.action === 'buy').map(b => b.j)) };
  })() : undefined;
  /** the other ways merged into a crossing (mergeCrossings): one our earthworks bury is a crossing of its own
   * (evaluate's split retry, EvalOptions.splitWays) */
  const mergedInto = new WeakMap<CrossingResult, readonly RoadCrossing[]>();
  return { supportMemo, retainingMemo, streamBridge, reroutes, sectionMemo, coverLeft, coverRight, urbanEarth,
    forestEarth, urbanDeck, urbanCentre, oobEarth, oobDeck, deckHits, earthHits, earthHitL,
    earthHitR, wideHits, wideHitL, wideHitR, hitsAt, deckBuildings, earthBuildings, work, wallable, mergedInto };
}

/** Stage 5: `engineer(candidate heights)`, one engineering pass of a grade line: profile → cross-sections →
 * retaining walls → land cover and houses under the works → structure selection (with the mass balance) →
 * bridge supports. Called once per candidate by `finish` (lifts, retries). */
function routeEngineer(ctx: EvalContext, opts: EvalOptions, setup: ReturnType<typeof routeSetup>, prices: ReturnType<typeof routePrices>, caches: ReturnType<typeof routeCaches>, solved: ReturnType<typeof routeGradeLine>) {
  const { timing, st, water, terrain, n, preview, manualStructures, lap, w, ds, ground, waterAt,
    crossingCost, cat, clearance, forceWater, forceParallelWater, stationSides, roadX, roadG,
    crossingOverrides, tunnelWater, settleEnds, heldDeck, al, ownTrack, vlim, widen, cutMethod, bridgeStyle } = setup;
  const { tpl, b, baseRural, baseUrban, topsoilPerM2, surE, bridge, surB, tunnelKm, tunnelFactor, surT, roadS, balanceTolerance,
    usable } = prices;
  const { sectionMemo, work, wideHitL, wideHitR, wideHits, hitsAt, retainingMemo, wallable, coverLeft, coverRight,
    urbanEarth, forestEarth, oobEarth, urbanDeck, oobDeck, urbanCentre, deckHits, deckBuildings, earthHitL,
    earthHitR, earthHits, earthBuildings, streamBridge, supportMemo, mergedInto } = caches;
  const { blockDecision, materialValue } = solved;
  /** the deck-level cover arrays (urbanDeck, oobDeck) are sampled once, by the first engineering pass */
  let deckCoverReady = false;
  const engineer = (candidate: VPI[], crossingWays: CrossingChainages, strict: ReadonlySet<number>) => {
  timing['count.engineer'] = (timing['count.engineer'] ?? 0) + 1;
  const engineeringStart = performance.now();
  const prof = buildProfile(candidate, vlim.crest, vlim.sag);
  const grade = elevations(prof, st.s);
  const waterZ = elevations(prof, water.map(c => c.s));
  const waterElevation = new Map(water.map((c, i) => [c, waterZ[i]]));

  // --- cross-sections ---
  const sectionsStart = performance.now();
  const sec = computeSections(terrain, n, st.x, st.y, st.tx, st.ty, grade, tpl, true, sectionMemo, widen);
  work('sections', sectionsStart);
  if (ctx.buildings) for (let i = 0; i < n; i++) if (wideHitL[i] !== sec.dayL[i] || wideHitR[i] !== sec.dayR[i]) {
    wideHits[i] = hitsAt(i, sec.dayL[i], sec.dayR[i]); wideHitL[i] = sec.dayL[i]; wideHitR[i] = sec.dayR[i];
  }
  const retainingStart = performance.now();
  // A preview keeps natural slopes: no retaining walls, nor the bridges an impossible wall forces.
  const retention: RetainingPlan = preview ? {
    walls: [], perCell: new Float64Array(n), landPerCell: new Float64Array(n), forcedBridge: new Uint8Array(n), forcedTunnel: new Uint8Array(n),
    wallSurfaceL: new Float64Array(n).fill(NaN), wallSurfaceR: new Float64Array(n).fill(NaN), channelRelocations: [], clearanceRequirements: [], walledBuildings: [],
  } : planRetainingWalls({ ...st, ...sec, grade, crownWidth: b }, terrain, ctx.roads, manualStructures, water, retainingMemo, waterElevation, crossingWays, wallable && { ...wallable, hits: wideHits });
  work('retaining', retainingStart);
  lap('sections');

  // --- land cover under each station, for each way of building it: the slope-to-slope footprint of
  // the earthwork, the deck strip of a bridge, the centreline of a tunnel ---
  const coverStart = performance.now();
  const cover = { urban: 0, forest: 0, oob: 0 };
  const sampleCover = (i: number, left: number, right: number) => {
    const nx = -st.ty[i], ny = st.tx[i];
    let u = 0, f = 0, cnt = 0, out = 0;
    for (let o = -right; o <= left + 1e-6; o += 2.5) {
      const v = terrain.cover(st.x[i] + nx * o, st.y[i] + ny * o);
      cnt++;
      if (v & BUILTUP_BIT) u++;
      if ((v & CLASS_BITS) === LC.forest) f++;
      if (v & OOB_BIT) out = 1;
    }
    cover.urban = cnt ? u / cnt : 0; cover.forest = cnt ? f / cnt : 0; cover.oob = out;
  };
  for (let i = 0; i < n; i++) {
    if (coverLeft[i] !== sec.dayL[i] || coverRight[i] !== sec.dayR[i]) {
      sampleCover(i, sec.dayL[i], sec.dayR[i]);
      urbanEarth[i] = cover.urban; forestEarth[i] = cover.forest; oobEarth[i] = cover.oob;
      coverLeft[i] = sec.dayL[i]; coverRight[i] = sec.dayR[i];
    }
    if (!deckCoverReady) {
      sampleCover(i, w, w);
      urbanDeck[i] = cover.urban; oobDeck[i] = cover.oob;
      urbanCentre[i] = terrain.cover(st.x[i], st.y[i]) & BUILTUP_BIT ? 1 : 0;
    }
  }
  deckCoverReady = true;
  // Buildings each option would demolish (its slopes or deck plus the working strip, as billed
  // below), each building's price shared over the cells that reach it. The deck strip never changes
  // within an evaluation; a cell's earthwork hits are redone only where its widths changed.
  if (ctx.buildings) {
    const bld = ctx.buildings;
    const share = (hits: readonly (readonly number[])[], out: Float64Array) => {
      const count = new Map<number, number>();
      for (const list of hits) for (const j of list) count.set(j, (count.get(j) ?? 0) + 1);
      for (let i = 0; i < n; i++) {
        let v = 0;
        for (const j of hits[i]) v += bld.cost[j] / count.get(j)!;
        out[i] = v / cellLength(i, n, ds);
      }
    };
    if (!deckHits.length) { for (let i = 0; i < n; i++) deckHits.push(hitsAt(i, w, w)); share(deckHits, deckBuildings); }
    let changed = false;
    for (let i = 0; i < n; i++) if (earthHitL[i] !== sec.dayL[i] || earthHitR[i] !== sec.dayR[i]) {
      const list = sec.dayL[i] === wideHitL[i] && sec.dayR[i] === wideHitR[i] ? wideHits[i] : hitsAt(i, sec.dayL[i], sec.dayR[i], wideHits[i]);
      if (!changed && (list.length !== earthHits[i].length || list.some((j, k) => j !== earthHits[i][k]))) changed = true;
      earthHits[i] = list; earthHitL[i] = sec.dayL[i]; earthHitR[i] = sec.dayR[i];
    }
    if (changed) share(earthHits, earthBuildings);
  }

  // --- structures: the earthwork option against a bridge / tunnel, each at the rates of its own
  // footprint (as the bill will charge it) ---
  work('cover', coverStart);
  const selectionStart = performance.now();
  const h = new Float64Array(n);
  const geotechnicalPerM = new Float64Array(n), culverts = new Float64Array(n);
  const earthPerM = new Float64Array(n), bridgePerM = new Float64Array(n), tunnelPerMAt = new Float64Array(n), cutCoverPerM = new Float64Array(n), cutCoverExtraPerM = new Float64Array(n);
  const earthBase = new Float64Array(n), earthMul = new Float64Array(n), earthLand = new Float64Array(n), earthBox = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    h[i] = grade[i] - ground[i];
    geotechnicalPerM[i] = groundWorksPerM(sec.rockFace[i], sec.subgrade[i]);
    for (const c of waterAt[i]) culverts[i] += crossingCost([c], sec.dayL[i] + sec.dayR[i], waterElevation.get(c)!);
    const ue = urbanEarth[i], ud = urbanDeck[i], ut = urbanCentre[i], wd = sec.dayL[i] + sec.dayR[i];
    // the earthwork option's rates without its material terms, which depend on the fill price
    earthBase[i] = baseRural + (baseUrban - baseRural) * ue + wd * topsoilPerM2
      + geotechnicalPerM[i] + (culverts[i] + retention.perCell[i]) / cellLength(i, n, ds);
    earthMul[i] = 1 + surE(ue);
    earthLand[i] = wd * (landPerM2(ue) + forestEarth[i] * LAND.forestExtraPerM2) + retention.landPerCell[i] / cellLength(i, n, ds) + earthBuildings[i];
    bridgePerM[i] = bridge.bestPerM(h[i]) * (1 + surB(ud)) + b * landPerM2(ud) + deckBuildings[i];
    tunnelPerMAt[i] = (cat.tunnelTubes * tunnelKm(ut) / 1000) * (1 + surT(ut));
    cutCoverPerM[i] = (cat.tunnelTubes * tunnelKm(ut, true) / 1000) * (1 + surT(ut));
    // its pit, and the buildings over it (those over the cut it replaces: a slightly wider footprint)
    cutCoverExtraPerM[i] = cutCoverPitPerM(-h[i], b) * (1 + surT(ut)) + earthBuildings[i];
  }
  // Rivers / water / railways and watercourses exceeding practical culvert limits need bridges.
  // Inadequate clearance stays a violation, never a fake buried bridge.
  const forced = retention.forcedBridge.slice();
  for (let i = 0; i < n; i++) if (streamBridge[i] && h[i] > 0) forced[i] = 1;
  for (let i = 0; i < n; i++) if (clearance[i] > -Infinity && h[i] > 0) forced[i] = 1;
  // an embankment whose side slope never meets the hillside (sections.ts `open`) cannot be built: a bridge
  for (let i = 0; i < n; i++) if (sec.open[i] && h[i] >= STRUCTURE_RULES.bridgeMinHeight) forced[i] = 1;
  forceWater(forced, st.s, h, Float64Array.from(sec.dayL, (v, i) => v + sec.dayR[i]));
  forceParallelWater(forced, stationSides, grade, sec.dayL, sec.dayR,
    new Set(retention.channelRelocations.map(c => c.id)), waterElevation);
  // an existing road clearly below the grade passes under a (short) bridge instead of being buried
  const roadZ = roadS.length ? elevations(prof, roadS) : new Float64Array(0);
  const crossings: CrossingResult[] = roadX.map((c, k) => ({
    s: c.s, i: Math.min(n - 1, Math.round(c.s / ds)), x: c.x, y: c.y, cls: c.cls, roadId: c.way,
    h: roadZ[k] - roadG[k], type: 'atGrade', cost: 0, ...(ctx.roads?.isDesigned(c.way) ? { designed: true as const } : {}),
  }));
  roadX.forEach((c, k) => { if (c.members?.length) mergedInto.set(crossings[k], c.members); });
  // A way weaving along our road crosses it again without ever leaving our earthworks in between (and
  // the strip a new road keeps clear of them): one crossing, its first, whose treatment takes the
  // whole stretch (a second one would bill the same stretch twice, e.g. a bridge over us along it).
  if (ctx.roads) for (let k = crossings.length - 1; k > 0; k--) {
    const c = crossings[k];
    let j = k - 1;
    while (j >= 0 && crossings[j].roadId !== c.roadId) j--;
    if (j < 0 || ROAD_CLASSES[c.cls].noAtGrade) continue;
    const p = crossings[j], da = ctx.roads.wayStation(c.roadId!, p.x, p.y), db = ctx.roads.wayStation(c.roadId!, c.x, c.y);
    const way = ctx.roads.wayPath(c.roadId!, Math.min(da, db), Math.max(da, db)), pad = ROAD_CLASSES[c.cls].width / 2 + WEAVE_SETBACK;
    if (way.length < 2 || Math.abs(db - da) > CROSSING_RULES.linkHardReach) continue;
    const i0 = Math.max(0, Math.min(p.i, c.i) - 30), i1 = Math.min(n - 1, Math.max(p.i, c.i) + 30);
    let inside = true;
    for (let q = 1; q < way.length && inside; q++) {
      const a = way[q - 1], b = way[q], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5));
      for (let t = 0; t <= steps && inside; t++) {
        const x = a.x + (b.x - a.x) * t / steps, y = a.y + (b.y - a.y) * t / steps;
        let best = Infinity, at = i0;
        for (let i = i0; i <= i1; i++) { const d2 = (x - st.x[i]) ** 2 + (y - st.y[i]) ** 2; if (d2 < best) { best = d2; at = i; } }
        const lateral = -(x - st.x[at]) * st.ty[at] + (y - st.y[at]) * st.tx[at];
        if (Math.abs(lateral) > (lateral >= 0 ? sec.dayL[at] : sec.dayR[at]) + pad) inside = false;
      }
    }
    if (inside) crossings.splice(k, 1);
  }
  // The player's underpass is a box in our embankment: where one fits, our road stays on earth over it
  // (no bridge of ours there), unless the player painted the stretch or a river, railway or stream within a
  // shortest bridge's reach needs our bridge there.
  let selectionOverrides: ArrayLike<number> = manualStructures;
  const reach = Math.max(1, Math.ceil((STRUCTURE_RULES.minBridgeLength / ds - 1) / 2));
  for (const c of crossings) {
    const choice = crossingChoice(c.roadId!, crossingOverrides);
    if (choice === 'underpass' && manualStructures[c.i] < 0 && h[c.i] > 0 && underpassFits(c, sec.dayL[c.i] + sec.dayR[c.i])
      && !forced.subarray(Math.max(0, c.i - reach), c.i + reach + 1).some(Boolean)) {
      if (selectionOverrides === manualStructures) selectionOverrides = Int8Array.from(manualStructures);
      (selectionOverrides as Int8Array)[c.i] = KIND.earth;
    }
    if (!((!choice || choice === 'bridge') && ROAD_CLASSES[c.cls].separable && c.h >= CROSSING_RULES.overHeight && h[c.i] > 0)) continue;
    // An Auto local road may instead keep its level in an underpass: the selector weighs that
    // box (estimated over the footprint width) against our bridge; crossings price the built one.
    const wd = sec.dayL[c.i] + sec.dayR[c.i], box = !choice && underpassFits(c, wd) ? underpassPrice(c, wd, urbanCentre[c.i]) : undefined;
    if (box) earthBox[c.i] += box.cost * (1 + surB(urbanEarth[c.i])) / cellLength(c.i, n, ds);
    else forced[c.i] = 1;
  }
  const forcedTunnel = tunnelWater(st.s, grade);
  for (let i = 0; i < n; i++) if (retention.forcedTunnel[i]) forcedTunnel[i] = 1;
  // a cutting whose side slope never reaches the top of the hillside (sections.ts `open`) cannot be dug: a tunnel
  for (let i = 0; i < n; i++) if (sec.open[i] && -h[i] >= STRUCTURE_RULES.portalDepth) forcedTunnel[i] = 1;
  const priceRun = bridgeRunCost(bridge, h, ds, i => surB(urbanDeck[i]), i => landPerM2(urbanDeck[i]) + deckBuildings[i] / bridge.width), runCost = equalSpanRunCost(priceRun);
  const styles = { asked: bridgeStyle, price: priceRun as BridgePrice };
  const widths = Float64Array.from(sec.dayL, (v, i) => v + sec.dayR[i]);
  // The plan's blocks (those of the Auto grade solve, also By hand) settle their own fill value (as they
  // balance their own earth), so the structures an edit re-prices are those of its own blocks; without
  // blocks (a preview), one value for the route.
  const nbS = settleEnds ? settleEnds.length - 1 : 1, blk = new Int32Array(n);
  if (settleEnds) for (let i = 0, j = 0; i < n; i++) { while (j < nbS - 1 && st.s[i] > settleEnds[j + 1] + 1e-6) j++; blk[i] = j; }
  const tolOf = (j: number) => settleEnds ? MATERIAL_VALUE.tolerancePerM * (settleEnds[j + 1] - settleEnds[j]) : balanceTolerance;
  type Settled = { selection: ReturnType<typeof chooseStructures>; balances: number[]; values: number[]; value: number };
  /** the structure choice at given values of a m³ of fill (one per block), and the usable cut minus fill it
   * leaves in each block */
  const selectAt = (values: readonly number[]): Settled => {
    const dps = values.map(v => blockDecision(v));
    for (let i = 0; i < n; i++) {
      const dp = dps[blk[i]], cutP = dp.cutPerM3;
      earthPerM[i] = (earthBase[i] + sec.cutI[i] * cutP.I + sec.cutII[i] * cutP.II + sec.cutIII[i] * cutP.III
        + sec.fill[i] * dp.fillPerM3) * earthMul[i] + earthLand[i] + earthBox[i];
    }
    const forcedAt = forced.slice();
    const input = { ds, h, earthPerM, bridgePerM: noBridgeAny ? bridgeOpen : bridgePerM, tunnelPerM: tunnelPerMAt, cutCoverPerM, cutCoverExtraPerM, tunnelFactor, cutMethod, forced: forcedAt, forcedTunnel, overrides: selectionOverrides, ...(heldDeck ? { held: heldDeck } : {}),
      bridgeRunCost: noBridgeAny ? (i0: number, i1: number, length: number) => noBridge.subarray(i0, i1 + 1).some(Boolean) && !forcedAt.subarray(i0, i1 + 1).some(Boolean) ? Infinity : runCost(i0, i1, length) : runCost };
    let chosen = chooseStructures(input);
    // An economical bridge still needs its abutments outside the channel/banks, even if a culvert
    // was hydraulically possible. Extend crossing spans, retaining manual overrides and checks;
    // again if the new choice bridges another channel.
    for (let pass = 0; pass < 3; pass++) {
      const before = forcedAt.slice();
      forceWater(forcedAt, st.s, h, widths, chosen.kind);
      if (pass && forcedAt.every((v, i) => v === before[i])) break;
      chosen = chooseStructures(input);
    }
    const balances = new Array<number>(nbS).fill(0);
    for (let i = 0; i < n; i++) if (chosen.kind[i] === KIND.earth) balances[blk[i]] += (usable * sec.cut[i] - sec.fill[i]) * cellLength(i, n, ds);
    let value = 0;
    for (let j = 0; j < nbS; j++) value += values[j] * (settleEnds ? (settleEnds[j + 1] - settleEnds[j]) / al.length : 1);
    return { selection: chosen, balances, values: [...values], value };
  };
  /** cells of automatic bridges whose piers found no place clear of what lies below: not an option */
  const noBridge = new Uint8Array(n), bridgeOpen = bridgePerM.slice();
  let noBridgeAny = false;
  const settle = (): Settled => {
    const first = selectAt(Array(nbS).fill(preview ? opts.structureValue ?? materialValue : MATERIAL_VALUE.start));
    const off = (r: Settled, j: number) => Math.abs(r.balances[j]) > tolOf(j);
    if (preview || !first.balances.some((_, j) => off(first, j))) return first;
    // The grade line is fixed here: find, block by block, the fill value at which the structures chosen
    // along it neither buy fill nor tip a surplus (the profile search's value was set before repairs).
    const tried = [first];
    const best = first.values.map((v, j) => ({ v, b: first.balances[j] }));
    const neg: ({ v: number; b: number } | undefined)[] = [], pos: ({ v: number; b: number } | undefined)[] = [];
    const record = (r: Settled, keep: boolean) => r.values.forEach((v, j) => {
      const b = r.balances[j];
      if (Math.abs(b) < Math.abs(best[j].b)) best[j] = { v, b };
      if (b < 0) { if (!keep || !neg[j]) neg[j] = { v, b }; } else if (!keep || !pos[j]) pos[j] = { v, b };
    });
    record(first, false);
    let last = selectAt(first.values.map((v, j) => !off(first, j) ? v : first.balances[j] < 0 ? MATERIAL_VALUE.hi : MATERIAL_VALUE.lo));
    tried.push(last); record(last, true);
    for (let it = 0; it < SETTLE_EVALS; it++) {
      const next = best.map((x, j) => {
        const n0 = neg[j], p0 = pos[j];
        if (Math.abs(x.b) <= tolOf(j) || !n0 || !p0) return x.v;
        const t = Math.max(0.15, Math.min(0.85, -n0.b / (p0.b - n0.b)));
        return n0.v + (p0.v - n0.v) * t;
      });
      if (next.every((v, j) => v === best[j].v)) break;
      last = selectAt(next); tried.push(last); record(last, false);
    }
    const want = best.map(x => x.v);
    return tried.find(r => r.values.every((v, j) => v === want[j])) ?? selectAt(want);
  };
  let settled = settle(), selection = settled.selection;
  work('selection', selectionStart);
  let supportStart = performance.now();
  let supported = remedyBridgeSupports({ ...st, grade, ground, ...selection, crownWidth: b }, terrain, ctx.roads, manualStructures, supportMemo, strict, heldDeck, ownTrack, styles);
  work('support', supportStart);
  // A bridge Auto chose whose piers cannot all miss the roads, railways and water under it (no span
  // within the limit reaches past them) is no option there: choose again without it.
  for (let pass = 0; pass < 2; pass++) {
    // (cells that must be bridged stay: their bridge is reported if it still cannot stand)
    let more = false;
    for (const f of supported.diagnostics) if (f.reason === 'span-limit' && f.automatic && f.cells)
      for (let i = f.cells[0]; i <= f.cells[1]; i++) if (!forced[i] && !noBridge[i]) { noBridge[i] = 1; bridgeOpen[i] = Infinity; more = true; }
    if (!more) break;
    noBridgeAny = true;
    const again = performance.now();
    settled = settle(); selection = settled.selection;
    work('selection', again);
    supportStart = performance.now();
    supported = remedyBridgeSupports({ ...st, grade, ground, ...selection, crownWidth: b }, terrain, ctx.roads, manualStructures, supportMemo, strict, heldDeck, ownTrack, styles);
    work('support', supportStart);
  }
  const supportHeights = [...supported.clearanceRequirements, ...retention.clearanceRequirements.filter(q =>
    supported.kind[q.i] !== KIND.tunnel && manualStructures[q.i] !== KIND.earth && manualStructures[q.i] !== KIND.tunnel && q.z > grade[q.i] + 0.01)];
  // heights the player's box or bridge needs (evaluate's retry): a local lift where the line falls short
  for (const q of opts.choiceLifts ?? []) if (elevations(prof, [q.s])[0] < q.z - 0.01) supportHeights.push(q);
  for (const issue of supported.diagnostics) if (issue.structure === 'abutment' && issue.reason === 'terrain' && issue.targetS !== undefined && issue.raiseM > 0) {
    const a = Math.max(1, Math.floor(Math.min(issue.s, issue.targetS) / ds)), b = Math.min(n - 2, Math.ceil(Math.max(issue.s, issue.targetS) / ds));
    if (manualStructures.subarray(a, b + 1).some(v => v >= 0)) continue;
    // Deck above ground; the abutment cell itself may stand in a shallow cut (support-layout).
    const abutment = Math.round((issue.targetS + (issue.targetS < issue.s ? ds : -ds) / 2) / ds);
    for (let i = a; i <= b; i++) supportHeights.push({ s: st.s[i], z: ground[i] + 0.15 - (i === abutment ? SUPPORT_LIMITS.abutmentCutM : 0) });
  }
  work('engineering', engineeringStart);
  return { prof, grade, waterZ, sec, retention,
    h, geotechnicalPerM, culverts, crossings, selection, supported, supportHeights, structureValue: settled.value };
  };
  return { engineer };
}

/** Support-lift state of a pass, handed on to a later pass that starts from its lifted line. */
interface LiftState { targets: Map<number, number>; retried: Map<number, number> }
/** The lift tool of the design passes: `liftProfile` raises Auto's line to height targets (a bridge that
 * needs more room under it); `lift.stop` remembers the fixed height (an end or a pin) the last failed lift
 * ran into, for the problem's wording. */
function routeLift(d: Design, setup: ReturnType<typeof routeSetup>, caches: ReturnType<typeof routeCaches>) {
  const { vlim, maxGradient, timing } = setup;
  const { work } = caches;
  /** why the last lift failed: the station whose fixed height (an end or a pin) its steepest grade ran into */
  const lift: { stop: number | null } = { stop: null };
  const liftProfile = (candidate: VPI[], targets: { s: number; z: number }[], range?: readonly [number, number], free?: readonly [number, number]) => {
    const start = performance.now();
    const lifted = liftAutoProfile(candidate, targets, d.speed, vlim.gradeAt ?? maxGradient, d.gradePins, (m) => {
      const k = /fixed km (\d+(?:\.\d+)?)/.exec(m); if (k) lift.stop = Number(k[1]) * 1000;
    }, d.category, range, free, vlim);
    work('lift', start);
    timing['count.lift'] = (timing['count.lift'] ?? 0) + 1;
    return lifted;
  };
  return { lift, liftProfile };
}

/** A design pass, 1: engineer the starting line, then (Auto, full evaluations) lift it where bridge spans,
 * supports and abutments need more height, in up to five rounds; the targets are kept for a later pass. */
function finishLift(d: Design, opts: EvalOptions, relaxed: CrossingChainages, strict: ReadonlySet<number>, start: VPI[], from: LiftState | undefined, setup: ReturnType<typeof routeSetup>, engineerStage: ReturnType<typeof routeEngineer>, solved: ReturnType<typeof routeGradeLine>, lifting: ReturnType<typeof routeLift>, prices: ReturnType<typeof routePrices>, caches: ReturnType<typeof routeCaches>) {
  const { oobInput, preview, blocks, snapTraced, vlim, mustBridge, norms, n, freeStation, ds, ground, st, timing } = setup;
  const { engineer } = engineerStage;
  const { profileFeasible, liftBlocks, keepsExterior, autoOptions, blockValues, materialValue, constrainedSolve } = solved;
  const { liftProfile } = lifting;
  const { costFor } = prices;
  const { work } = caches;
  const oob = oobInput.slice();
  let vpis = start;
  let engineering = engineer(vpis, relaxed, strict);
  // A later pass (the strict retry) keeps the earlier pass's targets: if it has to re-run the DP, its
  // line is lifted to all of them again, so a stretch lifted earlier is not lost far from the change.
  const repairTargets = new Map(from?.targets);
  /** targets the DP was asked to meet (height at each), all of them in every DP retry */
  const retried = new Map(from?.retried);
  // Every attempt lifts the same line (the DP's, or its retry's) to all targets found so far, so a
  // stretch's result does not depend on how many attempts other stretches needed.
  let baseLine = vpis;
  let liftShared = false;
  for (let attempt = 0; attempt < 5 && !preview && profileFeasible && d.profileMode === 'auto' && engineering.supportHeights.length; attempt++) {
    // Blocks: targets on the traced line's points, 10 cm up, so they do not move with the stations.
    for (const q of engineering.supportHeights) {
      const x = blocks ? snapTraced(q.s) : q.s, z = blocks ? Math.ceil(q.z * 10 - 1e-9) / 10 : q.z;
      repairTargets.set(x, Math.max(z, repairTargets.get(x) ?? -Infinity));
    }
    const targets = [...repairTargets].map(([s, z]) => ({ s, z })).sort((a, b) => a.s - b.s);
    // Each stretch of nearby targets is lifted on its own (a failure elsewhere does not undo it), within
    // its block of the grade solve: a lift never reaches past the block, so it does not depend on targets
    // (and an edit) in another one.
    const blockOf = (s: number) => liftBlocks ? Math.max(0, liftBlocks.findIndex((b, j) => j > 0 && s <= b) - 1) : 0;
    const clusters: { s: number; z: number }[][] = [];
    for (const q of targets) {
      const last = clusters[clusters.length - 1];
      if (last && q.s - last[last.length - 1].s <= LIFT_CLUSTER && blockOf(q.s) === blockOf(last[0].s)) last.push(q); else clusters.push([q]);
    }
    // a lift must not undo a narrowing (opts.narrow): there the DP places the knots instead
    const narrowAt = (opts.narrow ?? []).flatMap(r => [r.s0, (r.s0 + r.s1) / 2, r.s1].map(x => ({ x, r })));
    // (judged against the line it lifts: a narrowing the DP line already misses elsewhere does not
    // stop a lift far from it)
    const keepsNarrow = (v: VPI[], before: VPI[]) => {
      if (!narrowAt.length) return true;
      const xs = narrowAt.map(p => p.x);
      const z = elevations(buildProfile(v, vlim.crest, vlim.sag), xs);
      const z0 = elevations(buildProfile(before, vlim.crest, vlim.sag), xs);
      return narrowAt.every(({ r }, k) => r.fill ? z[k] <= Math.max(r.z, z0[k]) + 0.05 : z[k] >= Math.min(r.z, z0[k]) - 0.05);
    };
    // (nor out of the cutting it passes a motorway or railway in)
    const under = mustBridge.filter(c => c.below !== undefined);
    const keepsUnder = (v: VPI[], before: VPI[]) => {
      if (!under.length) return true;
      const xs = under.map(c => c.s);
      const z = elevations(buildProfile(v, norms.minCrestRadius, norms.minSagRadius), xs);
      const z0 = elevations(buildProfile(before, norms.minCrestRadius, norms.minSagRadius), xs);
      return under.every((c, k) => z0[k] > c.g - c.below! + 1e-6 || z[k] <= c.g - c.below! + 1e-6);
    };
    const liftAll = (from: VPI[]) => {
      let out = from;
      const failed: { s: number; z: number }[][] = [];
      for (const c of clusters) {
        const j = blockOf(c[0].s), free = liftBlocks ? [liftBlocks[j], liftBlocks[j + 1]] as const : undefined;
        const range = [Math.max(c[0].s - LIFT_CLUSTER, free?.[0] ?? -Infinity), Math.min(c[c.length - 1].s + LIFT_CLUSTER, free?.[1] ?? Infinity)] as const;
        const reach = [c[0].s - LIFT_CLUSTER, c[c.length - 1].s + LIFT_CLUSTER] as const;
        const z = elevations(buildProfile(out, vlim.crest, vlim.sag), c.map(q => q.s));
        if (c.every((q, i) => z[i] >= q.z - 0.01)) continue;
        // (a stretch at a block's end that cannot be lifted within it may reach a lift's length into the next)
        const wide = free && [free[0] - LIFT_CLUSTER, free[1] + LIFT_CLUSTER] as const;
        const lifted = liftProfile(out, c, range, free) ?? (wide ? liftProfile(out, c, [Math.max(reach[0], wide[0]), Math.min(reach[1], wide[1])], wide) : undefined);
        // the shared heights outside a separate stretch's own part are not ours to lift
        if (lifted && !keepsExterior(lifted)) liftShared = true;
        if (lifted && keepsNarrow(lifted, out) && keepsUnder(lifted, out) && keepsExterior(lifted)) out = lifted; else failed.push(c);
      }
      return { out, failed };
    };
    let { out, failed } = liftAll(baseLine);
    // Where the existing knots cannot accommodate a lift, let the same DP place new knots there
    // (once per target). Material values are already settled: fixed values, no repeat balance search.
    // The retry asks for every target retried so far (this pass's and the earlier pass's), so its
    // line does not depend on which pass or attempt needed it.
    const fresh = failed.filter(c => c.some(q => !retried.has(q.s)));
    if (fresh.length && autoOptions) {
      const minH = autoOptions.minH ? Float64Array.from(autoOptions.minH) : new Float64Array(n).fill(NaN);
      const atS = autoOptions.clearanceS ? Float64Array.from(autoOptions.clearanceS) : undefined;
      for (const c of fresh) for (const q of c) retried.set(q.s, Math.max(q.z, retried.get(q.s) ?? -Infinity));
      // blocks: each target on a station of its own, at its own chainage
      const ao = autoOptions, taken = (j: number) => !Number.isNaN(minH[j]) || !Number.isNaN(ao.maxH?.[j] ?? NaN)
        || !Number.isNaN(ao.eitherH?.above[j] ?? NaN) || !Number.isNaN(ao.eitherH?.below[j] ?? NaN);
      for (const [s, z] of retried) {
        const i = atS ? freeStation(s, taken) : Math.min(n - 1, Math.round(s / ds));
        if (i < 0) continue;
        minH[i] = Math.max(Number.isNaN(minH[i]) ? -Infinity : minH[i], z - ground[i] + 0.25);
        if (atS) atS[i] = s;
      }
      const retryStart = performance.now();
      const retryOptions = blockValues ? { ...autoOptions, minH, blockValues, clearanceS: atS }
        : { ...autoOptions, minH, costPerM: costFor(materialValue), balance: undefined };
      const retry = constrainedSolve ? constrainedSolve(retryOptions) : autoProfile(st.s, ground, retryOptions);
      work('retryDP', retryStart);
      timing['count.retryDP'] = (timing['count.retryDP'] ?? 0) + 1;
      // kept only if it meets a stretch the lifts could not (a target it cannot reach either, e.g. next
      // to a fixed end, would only trade the line for one that pays its clearance penalty)
      if (retry.feasible) {
        const again = liftAll(retry.vpis);
        if (fresh.some(c => !again.failed.includes(c))) { baseLine = retry.vpis; ({ out, failed } = again); }
      }
    }
    if (out === vpis || JSON.stringify(out) === JSON.stringify(vpis)) break;
    vpis = out;
    engineering = engineer(vpis, relaxed, strict);
  }
  return { oob, vpis, engineering, repairTargets, retried, liftShared };
}

/** A design pass, 2: what was built. Structures and their problems, retaining walls and moved channels on
 * earth, width and land cover per station, earthworks (volumes, mass haul, cut classes). */
function finishQuantities(d: Design, lifted: ReturnType<typeof finishLift>, setup: ReturnType<typeof routeSetup>, lifting: ReturnType<typeof routeLift>, caches: ReturnType<typeof routeCaches>, prices: ReturnType<typeof routePrices>) {
  const { engineering, liftShared, oob } = lifted;
  const { preview, cat, maxGradient, ds, al, n, lap, cutMethod } = setup;
  const { lift } = lifting;
  const { urbanEarth, forestEarth, oobEarth, urbanDeck, oobDeck, urbanCentre } = caches;
  const { b, usable } = prices;
  const { prof, grade, waterZ, sec, retention,
    h, geotechnicalPerM, culverts, crossings: engineeredCrossings, selection, supported, structureValue } = engineering;
  const { kind } = supported;
  // a tunnel's method (cut and cover where too shallow to mine, at its portals, or throughout as chosen) and
  // its tubes / escape provision, as billed and as its card tells them
  const cutCover = cutCoverMask(kind, supported.runs, h, ds, cutMethod);
  const runs = supported.runs.map((r): Run => {
    if (r.kind !== KIND.tunnel) return r;
    let cc = 0;
    for (let i = r.i0; i <= r.i1; i++) cc += cutCover[i];
    return { ...r, tubes: prices.tunnelFactor(r.length), cutCoverM: cc * ds, ...(allCut(r.i0, r.i1, cutMethod) ? { method: 'cut' as const } : {}) };
  });
  // Auto support clearances are repaired by the lift loop above, which a preview skips: do not
  // flash them as violations in a drag preview (the full evaluation reports any it cannot fix).
  const structureViolations = [...selection.violations, ...(preview && d.profileMode === 'auto' ? [] : supported.violations)];
  // a clearance Auto could not lift: why, in numbers (P2 7: never a bare "raise it" Auto could have done)
  if (d.profileMode === 'auto' && !preview) for (const v of structureViolations) {
    if (!v.title.startsWith(SPAN_TOO_LOW)) continue;
    const stop = lift.stop, grade = cat.mode === 'railway' ? `${(maxGradient * 1000).toFixed(1)} ‰` : `${(maxGradient * 100).toFixed(1)} %`;
    const at = stop === null ? '' : stop < ds ? 'its start' : stop > al.length - ds ? 'its end' : `the height pinned at km ${(stop / 1000).toFixed(2)}`;
    const why = liftShared ? 'Auto cannot raise it: the heights beyond this stretch are the ones both directions share.'
      : stop !== null ? `Auto cannot raise it: at the steepest grade allowed (${grade}) the raise runs on to ${at}, whose height is fixed.`
        : 'Auto cannot raise it without breaking the grade and rounding limits.';
    v.detail = `${v.detail ? `${v.detail} ` : ''}${why}`;
  }
  const retainingWalls = retention.walls.filter(wall => kind[wall.i] === KIND.earth);
  const channelRelocations = retention.channelRelocations.filter(channel => kind.subarray(channel.i0, channel.i1 + 1).some(k => k === KIND.earth));
  for (let i = 0; i < n; i++) if (kind[i] !== KIND.earth) { retention.wallSurfaceL[i] = NaN; retention.wallSurfaceR[i] = NaN; }
  // what is actually built decides the land take, the rates and whether the terrain data suffice
  const width = new Float64Array(n), urban = new Float32Array(n), forest = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (kind[i] === KIND.earth) {
      width[i] = sec.dayL[i] + sec.dayR[i]; urban[i] = urbanEarth[i]; forest[i] = forestEarth[i];
      if (oobEarth[i]) oob[i] = 1;
    } else if (kind[i] === KIND.bridge) {
      width[i] = b; urban[i] = urbanDeck[i];
      if (oobDeck[i]) oob[i] = 1;
    } else urban[i] = urbanCentre[i];
  }
  lap('structures');

  // --- earthworks ---
  const vol = volumes(ds, sec.cut, sec.fill, kind, usable);
  const mh = massHaul(ds, vol.mass, vol.cut * usable, vol.fill);
  let footprint = 0, forestArea = 0, urbanLength = 0;
  const cutByClass: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const len = cellLength(i, n, ds);
    if (kind[i] !== KIND.tunnel) urbanLength += urban[i] * len;
    if (kind[i] !== KIND.earth) continue;
    footprint += width[i] * len;
    forestArea += forest[i] * width[i] * len;
    cutByClass[0] += sec.cutI[i] * len; cutByClass[1] += sec.cutII[i] * len; cutByClass[2] += sec.cutIII[i] * len;
  }
  lap('earthworks');
  return { prof, grade, waterZ, sec, retention, h, geotechnicalPerM, culverts, engineeredCrossings, structureValue,
    kind, runs, cutCover, structureViolations, retainingWalls, channelRelocations, width, urban, forest, vol, mh,
    footprint, forestArea, urbanLength, cutByClass };
}

/** A design pass, 3: buildings under the works (slope to slope at grade, the deck strip under bridges):
 * demolitions and their cost, the player's Keep and Buy out choices. */
function finishBuildings(ctx: EvalContext, d: Design, setup: ReturnType<typeof routeSetup>, quantities: ReturnType<typeof finishQuantities>) {
  const { n, w, st, ds } = setup;
  const { kind, sec, grade, cutCover, h } = quantities;
  const crown = CATEGORIES[d.category].crownWidth;
  // --- buildings in the footprint (slope to slope at grade, the deck strip under bridges, the pit of a
  // cut-and-cover tunnel), plus a working strip on either side ---
  const buildingCost = new Float64Array(n);
  const demolished: Result['demolished'] = [];
  const bld = ctx.buildings;
  const gone = new Uint8Array(bld ? bld.n : 0);
  const buildingOverrides = normalizeBuildingOverrides(d.buildingOverrides, bld?.n ?? 0);
  const keptIds = new Set(buildingOverrides.filter((o) => o.action === 'keep').map((o) => o.j));
  const kept: Result['kept'] = [], manualBuys: Result['boughtOut'] = [];
  const buildingViolations: Violation[] = [];
  if (bld) {
    const items = bld.items;
    const best = new Map<number, { i: number; along: number; core: boolean }>();
    for (let i = 0; i < n; i++) {
      if (kind[i] === KIND.tunnel && !cutCover[i]) continue;
      const pit = cutCover[i] ? cutCoverPitHalfWidth(-h[i], crown) : 0;
      const left = kind[i] === KIND.earth ? sec.dayL[i] : pit || w, right = kind[i] === KIND.earth ? sec.dayR[i] : pit || w;
      const x = st.x[i], y = st.y[i], tx = st.tx[i], ty = st.ty[i];
      const off = (left - right) / 2, half = (left + right) / 2 + BUILDING_RULES.clearance;
      const cx = x - ty * off, cy = y + tx * off;
      bld.near(x, y, Math.max(left, right) + BUILDING_RULES.clearance + ds, (j) => {
        if (!bld.hits(j, cx, cy, tx, ty, ds / 2 + 0.5, half)) return;
        const along = Math.abs((items[j][0] - x) * tx + (items[j][1] - y) * ty);
        // the slopes / deck themselves, not only the working strip beside them (what the card names)
        const core = bld.hits(j, cx, cy, tx, ty, ds / 2 + 0.5, half - BUILDING_RULES.clearance);
        const p = best.get(j);
        if (!p) best.set(j, { i, along, core }); else if ((core && !p.core) || (core === p.core && along < p.along)) { p.i = i; p.along = along; p.core = core; }
      });
    }
    for (const [j, p] of best) {
      if (keptIds.has(j)) {
        buildingViolations.push({ kind: 'building', basis: 'game', s0: st.s[p.i], s1: st.s[p.i],
          title: 'Road through a kept building',
          fix: 'Buy it out, or move the road',
          detail: `Kept: it cannot be demolished. The road's ${cutCover[p.i] ? 'tunnel pit' : 'slopes'} and its ${BUILDING_RULES.clearance} m working strip touch it.`,
          target: { buildings: [j] },
          rule: 'Game rule: a building you keep must stay clear of our road, its slopes and its working strip.' });
        continue;
      }
      gone[j] = 1;
      buildingCost[p.i] += bld.cost[j];
      // which earthwork: the one on the building's side of the road (a cross slope may cut one side, fill the other)
      const k = p.i, leftSide = (items[j][0] - st.x[k]) * -st.ty[k] + (items[j][1] - st.y[k]) * st.tx[k] >= 0;
      const cutSide = (leftSide ? sec.zDayL[k] : sec.zDayR[k]) > grade[k];
      demolished.push({ j, i: k, cost: bld.cost[j], in: kind[k] === KIND.bridge ? 'bridge' : kind[k] === KIND.tunnel || cutSide ? 'cut' : 'embankment', strip: !p.core });
    }
    // a chimney, silo or tower standing within a demolished building's outline goes with it
    for (const p of demolished.slice()) bld.near(items[p.j][0], items[p.j][1], items[p.j][2], (k) => {
      if (gone[k] || keptIds.has(k) || bld.area[k] > BUILDING_RULES.hostedMaxArea || bld.area[k] > BUILDING_RULES.hostedShare * bld.area[p.j] || !bld.within(k, p.j)) return;
      gone[k] = 1; buildingCost[p.i] += bld.cost[k];
      demolished.push({ ...p, j: k, cost: bld.cost[k], host: p.j });
    });
    for (const o of buildingOverrides) {
      if (gone[o.j]) continue; // footprint acquisition already pays the building once
      const hit = best.get(o.j);
      let i = hit?.i ?? 0;
      if (!hit) {
        const [x, y] = items[o.j]; let distance = Infinity;
        for (let k = 0; k < n; k++) {
          const d2 = (x - st.x[k]) ** 2 + (y - st.y[k]) ** 2;
          if (d2 < distance) { distance = d2; i = k; }
        }
      }
      if (o.action === 'keep') kept.push({ j: o.j, i, hit: !!hit });
      else {
        gone[o.j] = 1;
        manualBuys.push({ j: o.j, i, cost: noiseBuyoutCost(bld.cost[o.j], bld.area[o.j]), reason: 'manual' });
      }
    }
    demolished.sort((p, q) => p.i - q.i);
  }
  return { buildingCost, demolished, bld, gone, keptIds, kept, manualBuys, buildingViolations };
}

/** A design pass, 4: crossings of existing roads (treatment, geometry, price; ways merged into one crossing
 * split again where asked), then the footprint check and what its remedies cost (walls, moved channels,
 * land). */
function finishCrossings(ctx: EvalContext, opts: EvalOptions, strict: ReadonlySet<number>, setup: ReturnType<typeof routeSetup>, quantities: ReturnType<typeof finishQuantities>, prices: ReturnType<typeof routePrices>, caches: ReturnType<typeof routeCaches>, houses: ReturnType<typeof finishBuildings>) {
  const { n, st, ds, terrain, al, crossingOverrides, cat, preview, lap, endJunctions, railOurs, retiredAt, water } = setup;
  const { width, kind, sec, engineeredCrossings, prof, urban, grade, runs, channelRelocations, waterZ,
    retainingWalls, culverts } = quantities;
  const { b } = prices;
  const { mergedInto, urbanCentre, reroutes, retainingMemo } = caches;
  const { bld, keptIds, gone, buildingCost, demolished } = houses;
  // --- crossings of existing roads ---
  const crossingLump = new Float64Array(n), crossingStructure = new Float64Array(n);
  let crossingsPaid = 0;
  // Split motorway: the owning direction spans the other's body too where they run joined (mirror).
  const joinedAt = (i: number) => (opts.leftJoined ?? []).some(r => st.s[i] >= r.s0 && st.s[i] <= r.s1);
  // Union of both bodies, the other mirrored: from our right toe to its right toe (axes one crown apart).
  const joinedRight = opts.joinedSide === 'R';
  const crossWidth = opts.sharedCrossings?.own ? Float64Array.from(width, (v, i) => kind[i] === KIND.earth && joinedAt(i) ? b + 2 * (joinedRight ? sec.dayL[i] : sec.dayR[i]) : v) : width;
  let crossings = engineeredCrossings;
  // Ways merged into one crossing (dual carriageways, a junction lying on our line) share its treatment; one
  // that our earthworks then bury (evaluate's retry) is a crossing of its own here (cut and reconnected,
  // bridged over us or boxed under us).
  // (on copies: an engineering pass may be shared with the evaluation this one retries)
  const split = (opts.splitWays ?? []).length ? crossings.flatMap(c => (mergedInto.get(c) ?? []).flatMap(m => {
    const i = Math.min(n - 1, Math.round(m.s / ds));
    // (the crossing's own way met again within a crossing's merge distance is that same crossing)
    return opts.splitWays!.includes(m.way) && kind[i] === KIND.earth && !ROAD_CLASSES[m.cls].noAtGrade
      && !(m.way === c.roadId && Math.abs(m.s - c.s) <= CROSSING_RULES.mergeDistance)
      ? [{ s: m.s, i, x: m.x, y: m.y, cls: m.cls, roadId: m.way, h: elevations(prof, [m.s])[0] - terrain.heightAt(m.x, m.y), type: 'atGrade' as const, cost: 0 }] : [];
  })) : [];
  if (split.length) crossings = [...crossings.map(c => ({ ...c })), ...split].sort((a, b) => a.s - b.s);
  const crossingIssues = resolveCrossings(crossings, al.length, kind, crossWidth, urbanCentre, urban, crossingOverrides, cat.gradeSeparated ? (cat.mode === 'railway' ? 'railway' : 'motorway') : false,
    ctx.roads?.designedWays ? (way: number) => ctx.roads!.isDesigned(way) : undefined, cat.minor ? 0 : CROSSING_RULES.junctionSpacing, cat.minor);
  // What a player's reroute shape may not cross on the ground (protected raster, buildings not removed,
  // other roads' works it is kept clear of).
  const clearOf = opts.keepClear?.length ? capsuleTest(opts.keepClear) : undefined;
  const linkObstacle = (p: { x: number; y: number }, q: { x: number; y: number }, half: number) => {
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (!(len > 0)) return null;
    const tx = (q.x - p.x) / len, ty = (q.y - p.y) / len, x = (p.x + q.x) / 2, y = (p.y + q.y) / 2;
    let hit: 'railway' | 'water' | 'building' | 'works' | null = null;
    protectedRasterCells(terrain, { i: 0, s: 0, x, y, tx, ty, along: len / 2, left: half, right: half }, f => { if (!hit && f.feature !== 'stream') hit = f.feature; });
    if (!hit && clearOf?.(p, q, half)) hit = 'works';
    // a house you keep is never demolished for a reroute
    if (!hit && bld && keptIds.size) bld.near(x, y, len / 2 + half + 5, (j) => { if (!hit && keptIds.has(j) && bld.hits(j, x, y, tx, ty, len / 2, half)) hit = 'building'; });
    return hit;
  };
  /** Houses still standing under a new road (a reroute): bought out and demolished with it. */
  const linkHouses = (p: { x: number; y: number }, q: { x: number; y: number }, half: number) => {
    const out: number[] = [];
    if (!bld) return out;
    const len = Math.hypot(q.x - p.x, q.y - p.y), tx = len ? (q.x - p.x) / len : 1, ty = len ? (q.y - p.y) / len : 0, x = (p.x + q.x) / 2, y = (p.y + q.y) / 2;
    bld.near(x, y, len / 2 + half + 5, (j) => { if (!gone[j] && !keptIds.has(j) && bld.hits(j, x, y, tx, ty, len / 2, half)) out.push(j); });
    return out;
  };
  if (!preview) crossingIssues.push(...buildCrossingGeometry(crossings, { ...st, grade, width: crossWidth, crownWidth: b, kind, urban: urbanCentre, obstacle: linkObstacle, houses: linkHouses, houseCost: (j: number) => bld?.cost[j] ?? 0, dwelling: (j: number) => !!bld?.dwelling[j],
    streams: (p, q) => terrain.watercourses?.intersections(2, [0, Math.hypot(q.x - p.x, q.y - p.y)], [p.x, q.x], [p.y, q.y]).map(c => ({ x: c.x, y: c.y, crossing: c })) ?? [],
    left: Float64Array.from(kind, (k, i) => (k === KIND.earth ? sec.dayL[i] : width[i] / 2) + (crossWidth === width || joinedRight ? 0 : crossWidth[i] - width[i])),
    right: Float64Array.from(kind, (k, i) => (k === KIND.earth ? sec.dayR[i] : width[i] / 2) + (crossWidth === width || !joinedRight ? 0 : crossWidth[i] - width[i])),
  }, (x, y) => terrain.heightAt(x, y), ctx.roads, reroutes));
  const shared = opts.sharedCrossings;
  if (shared && !shared.own) {
    const SHAREABLE = new Set(['overbridge', 'underpass', 'reconnection', 'diversion']);
    for (const c of crossings) {
      if (!joinedAt(c.i)) continue;
      const owner = shared.from.find(o => o.roadId === c.roadId && SHAREABLE.has(o.type) && Math.hypot(o.x - c.x, o.y - c.y) < 4 * b);
      if (!owner) continue;
      const { s: _s, i: _i, x: _x, y: _y, h: _h, issues: _issues, requestedType: _r, ...built } = owner;
      Object.assign(c, structuredClone(built), { cost: 0, shared: true as const });
      for (let k = crossingIssues.length - 1; k >= 0; k--) if (crossingIssues[k].crossing.roadId === c.roadId) crossingIssues.splice(k, 1);
    }
  }
  for (const c of crossings) {
    // SPK links/approaches/bridges receive other-objects surcharge; all-in junction/access do not.
    // A junction's side-road regrades and walls (worksCost) are SPK/OTSKP construction, not the lump.
    const lump = c.type === 'junction' ? c.cost - (c.worksCost ?? 0) : c.type === 'reconnection' && c.cls === 'service' && c.cost > 0 && !c.moved ? ACCESS : 0;
    crossingLump[c.i] += lump;
    // houses a reroute runs through are bought out like those under our road (buildings, not works)
    // (a crossing built with the other direction is billed there, its houses included)
    const houses = c.shared ? [] : (c.houses ?? []).filter(j => !gone[j]);
    for (const j of houses) { gone[j] = 1; buildingCost[c.i] += bld!.cost[j]; demolished.push({ j, i: c.i, cost: bld!.cost[j], in: 'reroute', strip: false }); }
    crossingStructure[c.i] += c.cost - lump - (c.shared ? 0 : c.houseCost ?? 0);
    if (c.cost > 0) crossingsPaid++;
  }

  demolished.sort((p, q) => p.i - q.i);
  lap('crossings');
  const footprintCheck = preview ? { conflicts: [] as FootprintConflict[], violations: [] as Violation[] } : footprintConflicts({ ...st, kind, grade, ...sec, crownWidth: b, runs, channelRelocations, featureCache: retainingMemo, strictWays: strict,
    ...(endJunctions.length ? { junctions: endJunctions } : {}), ...(railOurs ? { railOurs } : {}), ...(retiredAt ? { railRetired: retiredAt } : {}) }, terrain, ctx.roads?.ground, crossings, water,
    new Map(water.map((c, i) => [c, waterZ[i]])));
  footprintCheck.conflicts.push(...retainingConflicts(retainingWalls), ...channelRelocations.map(c => c.conflict));
  const remedyLand = new Float64Array(n);
  // Grouped wall annotations must not relocate their construction to the first station's
  // surcharge band. Book the actual per-cell engineering, independently of presentation.
  for (const wall of retainingWalls) crossingStructure[wall.i] += wall.cost;
  for (const channel of channelRelocations) {
    const c = channel.conflict, count = channel.i1 - channel.i0 + 1, land = (c.landCost ?? 0) / count;
    c.allocations = [];
    for (let i = channel.i0; i <= channel.i1; i++) {
      crossingStructure[i] += (c.cost - (c.landCost ?? 0)) / count;
      remedyLand[i] += land;
      c.allocations.push({ i, cost: c.cost / count, landCost: land });
    }
  }
  for (const c of footprintCheck.conflicts) {
    if (c.action === 'retaining-wall' || c.action === 'channel-relocation') continue;
    if (c.feature === 'road') crossingStructure[c.i] += c.cost - (c.landCost ?? 0) - (c.lumpCost ?? 0);
    else if (c.action === 'culvert') culverts[c.i] += c.cost;
    remedyLand[c.i] += c.landCost ?? 0;
    crossingLump[c.i] += c.lumpCost ?? 0;
  }
  lap('footprint');
  return { crossingLump, crossingStructure, crossingsPaid, joinedRight, crossings, crossingIssues, footprintCheck,
    remedyLand };
}

/** A design pass, last: noise walls and buy-outs, the bill, every check, the Result. It reads only its
 * pass's own arrays, never the shared engineer() buffers, so it stays valid after a later pass.
 * `withNoise` false (a trial pass of evaluate's retries): no noise walls, buy-outs or noise problems; the
 * result's `withNoise()` adds them. */
function completeDesign(ctx: EvalContext, d: Design, opts: EvalOptions, setup: ReturnType<typeof routeSetup>, crossed: ReturnType<typeof finishCrossings>, houses: ReturnType<typeof finishBuildings>, quantities: ReturnType<typeof finishQuantities>, prices: ReturnType<typeof routePrices>, solved: ReturnType<typeof routeGradeLine>, lifted: ReturnType<typeof finishLift>, withNoise: boolean): Result {
  const { n, cat, scenario, st, preview, terrain, ds, lap, widen, win, al, norms, vlim, maxGradient, water,
    waterGround, mustBridge, ground, groundIds, groundProfiles, roadX, timing } = setup;
  const { crossings, joinedRight, crossingLump, crossingStructure, remedyLand, crossingIssues, footprintCheck,
    crossingsPaid } = crossed;
  const { bld, gone, keptIds, manualBuys, buildingCost, buildingViolations, demolished, kept } = houses;
  const { kind, grade, sec, runs, urban, h, mh, width, forest, geotechnicalPerM, culverts, structureViolations,
    prof, waterZ, retainingWalls, retention, vol, cutByClass, footprint, forestArea, urbanLength,
    structureValue, cutCover } = quantities;
  const { usable } = prices;
  const { pinViolations, profileFeasible, materialValue } = solved;
  const { oob, vpis } = lifted;
  const noiseViolations: Violation[] = [];

  // --- noise walls ---
  const wall = new Uint8Array(n), wallLength = new Float64Array(n), wallArea = new Float64Array(n);
  const noiseBuyouts = new Float64Array(n);
  let walls: WallStretch[] = [], wallsAroundChoices: WallStretch[] = [], boughtOut: Result['boughtOut'] = [];
  let receivers: NoiseReceiver[] = [];
  let acoustic: Result["noise"]["source"] = null, builtL: Float64Array = new Float64Array(0), builtR: Float64Array = new Float64Array(0);
  // Railway: CNOSSOS-EU train source and line propagation (rail-noise.ts) against the new-line limits.
  const noiseModel = cat.mode === 'railway' ? createRailNoiseModel(opts.railTraffic ?? [])
    : createNoiseModel(scenario.traffic, opts.operatingSpeed ?? d.speed, { heavyShare: scenario.heavyShare,
      ...(cat.mode === 'motorway' ? { profile: 'motorway' as const } : {}) });
  const wallOverrides = normalizeWallOverrides(d.wallOverrides);
  const wallMasks = wallOverrideMasks(st.s, wallOverrides);
  const wallGaps = crossingWallGaps(st, crossings, cat.crownWidth);
  // the other carriageway alongside: no wall in the median, houses beyond it are the other's to check
  const joinedSideMask = new Uint8Array(n);
  for (const r of opts.leftJoined ?? []) for (let i = 0; i < n; i++) if (st.s[i] >= r.s0 && st.s[i] <= r.s1) { joinedSideMask[i] = 1; (joinedRight ? wallGaps.R : wallGaps.L)[i] = 1; }
  // Explicit walls are construction even when there are no nearby buildings (or no building layer).
  const noiseBuildings = bld ?? (wallOverrides.length ? new BuildingIndex([]) : undefined);
  if (noiseBuildings && !preview && withNoise) {
    // walls and screening edges where the cross-section puts them (cut top, crown / deck edge)
    const screens = crossSectionScreens(n, kind, grade, cat.crownWidth, sec.dayL, sec.dayR, sec.zDayL, sec.zDayR,
      (i, left, o) => terrain.heightAt(st.x[i] - st.ty[i] * o * (left ? 1 : -1), st.y[i] + st.tx[i] * o * (left ? 1 : -1)), wallGaps);
    // split motorway: where the other direction runs alongside (its median side), that side is its check
    for (let i = 0; i < n; i++) if (joinedSideMask[i]) (joinedRight ? screens.R : screens.L).shield[i] = 1;
    const rail = cat.mode === 'railway';
    // a track's trains run on its axis (double track: one track either side of it, half the trains each)
    const lanes = rail ? (cat.tracks === 2 ? [{ pos: TRACK_CENTRES_M / 2, share: 0.5 }, { pos: -TRACK_CENTRES_M / 2, share: 0.5 }] : null)
      : motorwayLanes(cat, joinedRight);
    acoustic = { id: opts.acousticSourceId ?? (rail ? 'acoustic:rail' : 'acoustic:road'), mode: rail ? 'rail' : 'road',
      laneOffset: lanes ? sourceReach({ laneOffset: 0, lanes }) : rail ? 0 : NOISE.sourceOffset, ...(lanes ? { lanes } : {}),
      sourceHeight: NOISE.barrierSourceHeight, n, x: st.x, y: st.y, tx: st.tx, ty: st.ty, grade,
      len: Float64Array.from({ length: n }, (_, i) => cellLength(i, n, ds)), dayDb: noiseModel.dayDb, nightDb: noiseModel.nightDb,
      ...(noiseModel.limits ? { limits: noiseModel.limits } : {}), ...screens };
    const outcome = noiseOutcome(acoustic, noiseModel, noiseBuildings, gone, (x, y) => terrain.heightAt(x, y), st.s,
      { keptBuildingIds: keptIds, wallL: wallMasks.L, wallR: wallMasks.R });
    boughtOut = [...manualBuys, ...outcome.boughtOut].sort((a, b) => a.i - b.i);
    for (const p of boughtOut) noiseBuyouts[p.i] += p.cost;
    const fl = builtL = outcome.L, fr = builtR = outcome.R;
    // billed as drawn: the wall line's own length beside the axis, the height above its foot
    const lineL = wallLineLengths(n, st.x, st.y, st.tx, st.ty, screens.L.wallOff, true);
    const lineR = wallLineLengths(n, st.x, st.y, st.tx, st.ty, screens.R.wallOff, false);
    for (let i = 0; i < n; i++) {
      wall[i] = (fl[i] ? 1 : 0) | (fr[i] ? 2 : 0);
      wallLength[i] = (fl[i] ? lineL[i] : 0) + (fr[i] ? lineR[i] : 0);
      wallArea[i] = fl[i] * lineL[i] + fr[i] * lineR[i];
    }
    walls = outcome.walls; wallsAroundChoices = outcome.aroundChoices;
    receivers = outcome.receivers;
    noiseViolations.push(...noiseControlViolations(receivers, st.s, crossings.filter(c => c.type === 'junction')));
  }
  lap('town');

  const bridges = runs.filter((r) => r.kind === KIND.bridge).map((r) => r.length);
  const tunnels = runs.filter((r) => r.kind === KIND.tunnel).map((r) => r.length);
  const bridgeLength = bridges.reduce((a, v) => a + v, 0);
  const tunnelLength = tunnels.reduce((a, v) => a + v, 0);
  const parts = costParts({
    category: d.category, terrainClass: scenario.terrainClass, n, ds, kind, urban, h,
    cutI: sec.cutI, cutII: sec.cutII, cutIII: sec.cutIII, fill: sec.fill, usable,
    haul: { moment: mh.moment, reused: mh.reused, surplus: mh.surplus, deficit: mh.deficit },
    width, forest, runs, geotechnicalPerM, culverts, buildings: buildingCost, noiseBuyouts, crossingLump, crossingStructure, wallArea, additionalLand: remedyLand,
    cutCover,
    ...(widen ? { extraRoadPerM: Float64Array.from(widen, v => 2 * v * hairpinPavementPerM2(d.category)) } : {}),
  });
  const cost = sumParts(parts);
  lap('cost');

  // --- checks ---
  const violations: Violation[] = [
    ...structureViolations,
    ...pinViolations,
    ...crossingIssues,
    ...footprintCheck.violations,
    ...buildingViolations,
    // A window (drag preview) is part of a longer plan: preview-window.ts checks the whole plan once.
    ...(win ? [] : ROAD_CHECKS.horizontal(al, norms, { a: ctx.a, b: ctx.b, pis: d.pis, category: d.category })),
    ...(win || !d.pis.some(p => p.hairpin) ? [] : hairpinViolations(al, d.pis, d.speed, d.category, terrain)),
    ...ROAD_CHECKS.vertical(prof, norms, vlim.gradeAt ?? maxGradient, cat.mode === 'railway', vlim.stretch),
    ...(opts.railTieIn?.ends ? trackEndViolations(ctx.a, ctx.b, d.pis, al.length, opts.railTieIn.ends, TURNOUT_ANGLE_RAD, RAIL_TIE_IN_M, norms.minRadius) : []),
  ];
  const waterCrossings: WaterResult[] = water.map((c, k) => {
    const i = Math.min(n - 1, Math.round(c.s / ds));
    const wd = sec.dayL[i] + sec.dayR[i], above = waterZ[k] - terrain.heightAt(c.x, c.y), size = waterSize(c, wd, above);
    const tunnelRun = runs.find(r => r.kind === KIND.tunnel && i >= r.i0 && i <= r.i1);
    const shortTunnel = !!tunnelRun && tunnelRun.length < STRUCTURE_RULES.minTunnelLength;
    // (over cut and cover the channel is put back when the pit is backfilled)
    const isTunnel = kind[i] === KIND.tunnel && above <= -STRUCTURE_RULES.portalDepth && !shortTunnel;
    const run = runs.find(r => r.kind === KIND.bridge && i >= r.i0 && i <= r.i1);
    const bridgeSpan = Math.max(c.width + 2 * CULVERT_RULES.bridgeBanks, size.q100 / (CULVERT_RULES.velocity * 2) + 2 * CULVERT_RULES.bridgeBanks) / Math.max(0.01, c.sine);
    const clearBridge = !!run && c.s - bridgeSpan / 2 >= run.s0 && c.s + bridgeSpan / 2 <= run.s1;
    const need = kind[i] === KIND.bridge ? STRUCTURE_RULES.riverClearance : size.minHeight;
    const ok = isTunnel || (waterCoverFits(above, need) && (kind[i] === KIND.bridge ? clearBridge : kind[i] === KIND.earth && size.type !== 'bridge'));
    if (!ok) violations.push({ kind: 'crossing', s0: c.s, s1: c.s,
      ...(!shortTunnel && kind[i] === KIND.earth && size.type !== 'bridge' ? { clearance: 'water' as const } : {}),
      title: shortTunnel ? 'Tunnel under a stream is too short' : above < 0 ? 'Our cutting runs through a stream' : `Our road blocks a ${c.waterKind === 'river' ? 'river' : 'stream'}`,
      fix: shortTunnel ? `Make the tunnel at least ${STRUCTURE_RULES.minTunnelLength} m long and deep enough, or pass above the stream` : size.type === 'bridge' || kind[i] === KIND.bridge ? `Put our road on a bridge spanning the water and its banks (${bridgeSpan.toFixed(0)} m along our road), at least ${need.toFixed(1)} m above the bed`
        : `Raise our road here to at least ${need.toFixed(1)} m above the stream bed for a ${waterOpening(size)} culvert, or use a bridge`,
      detail: `It may carry about ${size.q100.toFixed(1)} m³/s in a 100-year flood, from ${c.catchmentKm2.toFixed(1)} km² of land draining into it${c.truncated ? ' (a rough estimate: its area runs off the map)' : ''}. The game does not move streams for you; a deep tunnel can pass under it.`,
      basis: 'game', rule: 'Game estimate (research/17): flood size, culvert cover and fish passage are screened, not a hydraulic design',
    });
    let cost = kind[i] === KIND.earth && above > 0 ? culvertCost(c, wd, above) : 0;
    if (run) {
      for (let j = run.i0; j <= run.i1; j++) cost += parts.bridges[j];
      cost /= water.filter(other => other.s >= run.s0 && other.s <= run.s1).length;
    }
    return { ...c, i, bed: waterGround.get(c)!, h: above, q100: size.q100, structure: !ok ? 'blocked' : isTunnel ? 'tunnel' : kind[i] === KIND.bridge ? 'bridge' : size.type,
      opening: kind[i] === KIND.bridge ? `≥${bridgeSpan.toFixed(1)} m clear` : isTunnel ? 'surface channel retained' : waterOpening(size),
      length: run?.length ?? tunnelRun?.length ?? barrelLength(c, wd), cost, requiredBridge: size.type === 'bridge' };
  });
  // Parallel watercourses and support placement are checked by the indexed footprint pass.
  // the whole at-grade footprint must be on terrain data, and every slope must reach the ground
  for (let i = 0; i < n; i++) {
    if (kind[i] !== KIND.earth) continue;
    const nx = -st.ty[i], ny = st.tx[i];
    if (terrain.isOob(st.x[i] + nx * sec.dayL[i], st.y[i] + ny * sec.dayL[i])
      || terrain.isOob(st.x[i] - nx * sec.dayR[i], st.y[i] - ny * sec.dayR[i])) oob[i] = 1;
  }
  const ranges = (flag: (i: number) => boolean, fn: (i0: number, i1: number) => void) => {
    for (let i = 0; i < n; i++) {
      if (!flag(i)) continue;
      let j = i;
      while (j + 1 < n && flag(j + 1)) j++;
      fn(i, j);
      i = j;
    }
  };
  ranges((i) => kind[i] === KIND.earth && sec.open[i] === 1, (i0, i1) => {
    let above = 0, below = 0;
    for (let i = i0; i <= i1; i++) { above = Math.max(above, h[i]); below = Math.max(below, -h[i]); }
    violations.push(slopeViolation(st.s[i0], st.s[i1], above, below, 150));
  });
  if (mustBridge.length) {
    const zc = elevations(prof, mustBridge.map((c) => c.s));
    const last = new Map<string, number>();
    mustBridge.forEach((c, k) => {
      if (c.what === 'watercourse') return; // sized opening / actual structure checked above
      const ic = Math.min(n - 1, Math.round(c.s / ds));
      const above = zc[k] - c.g;
      if (kind[ic] === KIND.tunnel || above >= c.need - 1e-6) return;
      if (c.below !== undefined && above <= -c.below + 1e-6) return;
      if (c.s - (last.get(c.what) ?? -Infinity) < 50) return;
      last.set(c.what, c.s);
      violations.push(crossingViolation(c.s, c.what, above, c.need, c.below));
    });
  }
  for (let i = 0; i < n; i++) {
    if (!oob[i]) continue;
    let j = i;
    while (j + 1 < n && oob[j + 1]) j++;
    violations.push(oobViolation(st.s[i], st.s[j], st.s[j] - st.s[i] + ds));
    i = j;
  }
  if (!profileFeasible && d.profileMode === 'auto' && pinViolations.length === 0) {
    violations.push(profileViolation(al.length, maxGradient, cat.mode === 'railway'));
  }
  violations.splice(0, violations.length, ...mergeNearby(violations));
  // Messages name what is built: a railway is "our railway", not "our road".
  if (cat.mode === 'railway') for (const v of violations) {
    // "Road too low over the river / railway", the side slopes and Auto's heights (checks.ts) name our own
    // line "the road"
    const ours = v.title.startsWith(ROAD_TOO_LOW) || v.kind === 'section' || v.kind === 'profile';
    for (const k of ['title', 'fix', 'detail'] as const) if (v[k]) {
      v[k] = v[k]!.replace(/\bour road\b/g, 'our railway').replace(/\bOur road\b/g, 'Our railway');
      if (ours) v[k] = v[k]!.replace(ROAD_TOO_LOW_START, 'Our railway too low').replace(/\b(the|The) road\b/g, (_m, t: string) => `${t === 'The' ? 'Our' : 'our'} railway`)
        .replace(/\broad heights?\b/g, m => m.replace('road', 'track'));
    }
  }
  const travelMin = travelMinutes(speedStretches(al, d.pis, d.speed, d.category));
  const capacityTraffic = opts.capacityTraffic ?? scenario.traffic;
  const minCategory = minCategoryForTraffic(capacityTraffic);
  if ((opts.goals?.capacity ?? true) && cat.mode !== 'railway' && CATEGORY_RANK[d.category] < CATEGORY_RANK[minCategory]) {
    violations.push(categoryViolation(al.length, d.category, capacityTraffic, minCategory));
  }
  if ((opts.goals?.time ?? true) && travelMin > scenario.maxTravelMin + 1e-9) {
    violations.push(timeViolation(al.length, d.speed, travelMin, scenario.maxTravelMin, al.length / (travelMin * 60) * 3.6));
  }
  violations.push(...noiseViolations); // grouped noise issues never hide geometric/goal constraints
  const geomViolations = violations.filter((v) => !v.goal).length;
  lap('total');

  return {
    length: al.length, ds, n, s: st.s, x: st.x, y: st.y, tx: st.tx, ty: st.ty, ground, grade, kind,
    geology: { ids: groundIds, profiles: groundProfiles },
    cut: sec.cut, fill: sec.fill, dayL: sec.dayL, dayR: sec.dayR, zDayL: sec.zDayL, zDayR: sec.zDayR, oob, runs,
    vpis, vcurves: prof.curves.map((c) => ({ s: c.s, z: c.z, len: c.lenEff, r: c.r, type: c.type })), grades: prof.grades,
    curves: al.curves.map((c) => ({ index: c.index, x: c.x, y: c.y, r: c.r, rEff: c.rEff, delta: c.delta, auto: c.auto, sStart: c.sStart, sEnd: c.sEnd, t: c.t, unit: c.unit })),
    ...(roadX.some(c => c.members?.length) ? { mergedWays: roadX.flatMap(c => (c.members ?? []).map(m => m.way)) } : {}),
    violations, geomViolations, cost, parts, cell: { width, urban, forest, wall, wallLength, wallArea }, crossings, waterCrossings, footprintConflicts: footprintCheck.conflicts, walls, wallsAroundChoices, demolished, boughtOut, kept,
    retainingWalls, walledOff: retention.walledBuildings.flatMap(b => {
      // the walls standing for it (its own cells and the one either side each wall reaches over)
      const own = retainingWalls.filter(w => w.feature === 'building' && w.s1 > b.s0 - ds && w.s0 < b.s1 + ds);
      return !gone[b.j] && own.some(w => st.s[w.i] > b.s0 && st.s[w.i] < b.s1)
        ? [{ ...b, s0: Math.min(...own.map(w => w.s0)), s1: Math.max(...own.map(w => w.s1)), height: Math.max(...own.map(w => w.height)), wall: own.reduce((a, w) => a + w.cost, 0) }] : [];
    }),
    wallSurfaceL: retention.wallSurfaceL, wallSurfaceR: retention.wallSurfaceR, ...(widen ? { widen } : {}),
    noise: { receivers, source: acoustic, L: builtL, R: builtR, controlling: noiseModel.controlling,
      limit: noiseModel.controlling === 'night' ? noiseModel.limits?.nightDb ?? NOISE.limitNightDb : noiseModel.limits?.dayDb ?? NOISE.limitDayDb },
    quantities: {
      cut: vol.cut, fill: vol.fill, reused: mh.reused, surplus: mh.surplus, deficit: mh.deficit, avgHaul: mh.avgHaul,
      cutByClass, footprint, forestArea, buildingsHit: demolished.length, hitBuildings: demolished.map((p) => p.j),
      bridgeLength, tunnelLength, bridges: bridges.length, tunnels: tunnels.length, massHaul: vol.mass,
      urbanLength, wallLength: wallLength.reduce((a, v) => a + v, 0),
      wallArea: wallArea.reduce((a, v) => a + v, 0), noiseBuyouts: boughtOut.length,
      crossingsPaid, noiseDistance: noiseModel.contour, materialValue, structureValue,
    },
    travelMin, minCategory, valid: violations.length === 0, profileFeasible, timing, ...(preview ? { preview: true } : {}),
    ...(withNoise ? {} : { withNoise: () => completeDesign(ctx, d, opts, setup, crossed, houses, quantities, prices, solved, lifted, true) }),
  };
}

/** One design pass, from a grade line through the footprint screen; `complete()` then runs the rest
 * (noise, bill, checks). `relaxed` crossing ways leave their in-footprint stretch to the crossing remedy
 * (see retaining.ts); evaluate() retries strictly where that fails. `from`: the support-lift state of an
 * earlier pass, handed on to a pass that starts from its lifted line. */
function finishDesign(ctx: EvalContext, d: Design, opts: EvalOptions, solved: ReturnType<typeof routeGradeLine>, setup: ReturnType<typeof routeSetup>, engineerStage: ReturnType<typeof routeEngineer>, lifting: ReturnType<typeof routeLift>, prices: ReturnType<typeof routePrices>, caches: ReturnType<typeof routeCaches>, relaxed: CrossingChainages, strict: ReadonlySet<number>, start: VPI[], from?: LiftState): { vpis: VPI[]; kind: Uint8Array; footprintConflicts: FootprintConflict[]; crossings: CrossingResult[]; lift: LiftState; complete: () => Result } {
  const lifted = finishLift(d, opts, relaxed, strict, start, from, setup, engineerStage, solved, lifting, prices, caches);
  const { vpis, repairTargets, retried } = lifted;
  const quantities = finishQuantities(d, lifted, setup, lifting, caches, prices);
  const { kind } = quantities;
  const houses = finishBuildings(ctx, d, setup, quantities);
  const crossed = finishCrossings(ctx, opts, strict, setup, quantities, prices, caches, houses);
  const { crossings, footprintCheck } = crossed;
  const complete = (withNoise: boolean = !opts.trial): Result => completeDesign(ctx, d, opts, setup, crossed, houses, quantities, prices, solved, lifted, withNoise);
  return { vpis, kind, footprintConflicts: footprintCheck.conflicts, crossings, lift: { targets: repairTargets, retried }, complete };
}

/** Stage 6: `finish(relaxed, strict, start heights)`, a whole design from a grade line (finishDesign
 * above: its four steps and completeDesign). */
function routeFinish(ctx: EvalContext, d: Design, opts: EvalOptions, setup: ReturnType<typeof routeSetup>, caches: ReturnType<typeof routeCaches>, solved: ReturnType<typeof routeGradeLine>, engineerStage: ReturnType<typeof routeEngineer>, prices: ReturnType<typeof routePrices>) {
  const { autoVpis } = solved;
  const lifting = routeLift(d, setup, caches);
  const finish = (relaxed: CrossingChainages, strict: ReadonlySet<number> = new Set(), start: VPI[] = autoVpis, from?: LiftState): { vpis: VPI[]; kind: Uint8Array; footprintConflicts: FootprintConflict[]; crossings: CrossingResult[]; lift: LiftState; complete: () => Result } => finishDesign(ctx, d, opts, solved, setup, engineerStage, lifting, prices, caches, relaxed, strict, start, from);
  return { finish };
}

function evaluateRoute(ctx: EvalContext, d: Design, opts: EvalOptions = {}): Result {
  const setup = routeSetup(ctx, d, opts);
  const { preview, timing, n, ds, manualStructures, rawRoadX } = setup;

  // --- per-metre costs for the auto-profile: on flat ground, rural or town rates, incl. the surcharge ---
  // Markups by kind of work: SPK's rural/urban "other objects" surcharge (roads), or a price book's own
  // per-profession markups (railway, data/categories.ts). Road expressions stay bit-identical.
  const prices = routePrices(d, setup);

  // --- vertical alignment ---
  const solved = routeGradeLine(ctx, d, opts, setup, prices);
  const { crossingWays } = solved;
  const caches = routeCaches(ctx, d, opts, setup);
  const { streamBridge } = caches;
  const engineerStage = routeEngineer(ctx, opts, setup, prices, caches, solved);
  const finishStage = routeFinish(ctx, d, opts, setup, caches, solved, engineerStage, prices);
  const { finish } = finishStage;
  let first = finish(crossingWays);
  if (preview) return first.complete();
  // A stream left under the earthwork just beyond a bridge's end with too little cover for a culvert
  // (an oblique channel under the slope): carry the bridge over it and engineer again.
  // Water our earthworks would still cover (no culvert, no wall): a stream just beyond a bridge's end is
  // spanned by it; a pond or river beside us that no wall holds back gets a short bridge of its own.
  // (so is a road our bridge's end would bury where it runs askew under it: the end is set beyond it)
  const asked = notAsked(first);
  const streams = first.footprintConflicts.filter(c => (c.feature === 'stream' || c.feature === 'water' || c.feature === 'road') && c.action === 'blocked' && /:earth(:|$)/.test(c.id) && asked(c));
  let spanned = false;
  for (const c of streams) {
    const i0 = Math.max(1, Math.floor(c.s0 / ds)), i1 = Math.min(n - 2, Math.ceil(c.s1 / ds));
    if (c.feature !== 'water' && !first.kind.subarray(Math.max(0, i0 - 2), Math.min(n, i1 + 3)).some(k => k === KIND.bridge)) continue;
    for (let i = i0; i <= i1; i++) if (manualStructures[i] < 0) { streamBridge[i] = 1; spanned = true; }
  }
  if (spanned) { timing['count.streamRetry'] = 1; first = finish(crossingWays, new Set(), first.vpis); }
  // A relaxed road stretch that no remedy could absorb (a crossing way's residual or a minor road
  // at an abutment whose relocation failed) falls back to walls/structures (strict) nearby.
  const blocked = first.footprintConflicts.filter(c => c.feature === 'road' && c.action === 'blocked' && asked(c));
  // An automatic crossing with nothing buildable (no reroute, box or bridge over us) under an
  // embankment high enough for our bridge: our bridge is lengthened over it, as a designer would
  // (that way is retried with ordinary rules, which put our road on a bridge over it).
  const stuck = first.crossings.filter(c => !c.requestedType && c.issues?.length && c.type !== 'bridge' && c.type !== 'tunnel'
    && c.h >= CROSSING_RULES.overHeight && !ROAD_CLASSES[c.cls].noAtGrade && c.roadId !== undefined);
  if (!blocked.length && !stuck.length) return first.complete();
  const retried: { s0: number; roadId?: number }[] = [...blocked, ...stuck.map(c => ({ s0: c.s, roadId: c.roadId }))];
  const strictFor = (groups: readonly (typeof retried)[]) => {
    const all = groups.flat(), relaxed = new Map(crossingWays), strict = new Set(all.map(b => b.roadId!));
    for (const c of rawRoadX) if (all.some(b => b.roadId === c.way || Math.abs(b.s0 - c.s) <= STRICT_RETRY_REACH)) { relaxed.delete(c.way); strict.add(c.way); }
    return finish(relaxed, strict, first.vpis, first.lift);
  };
  timing['count.strictRetry'] = 1;
  // Continue from the already repaired (lifted) Auto grade: its clearances still apply.
  const groups = clusterBy(retried, b => b.s0, REGION);
  const retry = strictFor(groups).complete();
  // Every blocked road conflict is reported as a footprint violation, so a clean retry wins
  // without completing (noise, bill, checks) the first pass.
  if (!retry.violations.some(v => v.kind !== 'noise')) return retry;
  const result = first.complete();
  // Kept where it resolves more than it breaks, each stretch on its own.
  const keep = groups.filter(g => regionCount(retry, g.map(b => b.s0)) < regionCount(result, g.map(b => b.s0)));
  if (keep.length === groups.length) return retry;
  if (!keep.length) return result;
  return strictFor(keep).complete();
}
/** The straights of a plan (between A, its curves and B), each end's distance along the A–B axis. */
function planStraights(al: Alignment, a: Vec2, b: Vec2): PlanStraight[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, ex = (b.x - a.x) / len, ey = (b.y - a.y) / len;
  const along = (s: number) => { const p = pointAt(al, s); return (p.x - a.x) * ex + (p.y - a.y) * ey; };
  const u = al.units, cuts = [0, ...u.flatMap(x => [x.sStart, x.sEnd]), al.length];
  const out: PlanStraight[] = [];
  for (let q = 0; q + 1 < cuts.length; q += 2) {
    const s0 = cuts[q], s1 = cuts[q + 1];
    out.push({ s0, s1, p0: along(s0), p1: along(s1), end: q === 0 || q + 2 === cuts.length });
  }
  return out;
}
/** Where the route crosses lines across the A–B axis every `spacing` m (from A), ascending chainage. */
function gridCrossings(al: Alignment, a: Vec2, b: Vec2, spacing: number): number[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, ex = (b.x - a.x) / len, ey = (b.y - a.y) / len;
  const along = (s: number) => { const p = pointAt(al, s); return (p.x - a.x) * ex + (p.y - a.y) * ey; };
  const L = al.length, m = Math.max(1, Math.ceil(L / 20)), out: number[] = [];
  let s0 = 0, p0 = along(0);
  for (let j = 1; j <= m; j++) {
    const s1 = L * j / m, p1 = along(s1);
    for (let k = Math.floor(Math.min(p0, p1) / spacing) + 1; k * spacing <= Math.max(p0, p1); k++) {
      if (k <= 0) continue;
      const target = k * spacing;
      let lo = s0, hi = s1, plo = p0;
      for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2, pm = along(mid); if ((pm - target) * (plo - target) <= 0) hi = mid; else { lo = mid; plo = pm; } }
      out.push((lo + hi) / 2);
    }
    s0 = s1; p0 = p1;
  }
  return out.sort((x, y) => x - y);
}
/** Items (sorted by `at`) in groups whose neighbours are at most `gap` apart. */
function clusterBy<T>(items: readonly T[], at: (t: T) => number, gap: number): T[][] {
  const out: T[][] = [];
  for (const t of [...items].sort((a, b) => at(a) - at(b))) {
    const last = out[out.length - 1];
    if (last && at(t) - at(last[last.length - 1]) <= gap) last.push(t); else out.push([t]);
  }
  return out;
}
/** violations of a result within REGION of the given chainages' span */
function regionCount(r: Result, at: readonly number[]): number {
  const s0 = Math.min(...at) - REGION, s1 = Math.max(...at) + REGION;
  // noise problems are not what a retry changes (and a trial pass leaves them out)
  return r.violations.filter(v => v.kind !== 'noise' && (v.s0 + v.s1) / 2 >= s0 && (v.s0 + v.s1) / 2 <= s1).length;
}
/** A retry is judged on the violations this close to what it retried, m: about as far as it can move
 * the grade line (a block and the window of its boundaries, see autoprofile.ts). */
const REGION = 5000;
const ROAD_TOO_LOW_START = new RegExp(`^${ROAD_TOO_LOW}`);
/** CZK per unmet clearance station in the separation retry (the default 1e8 is a 70 m motorway bridge). */
const SEPARATION_PENALTY = 1e11;
/** A narrowing retry asks for this much less embankment (cutting) where our earthworks buried a road, m,
 * this far either side of it */
const NARROW_STEP = 2, NARROW_REACH = 30;
/** A way the player chose a crossing for: where that choice cannot be built its problem says so, and the
 * retries do not move our road over its buried stretch (a request that cannot be met leaves the rest as it was). */
const notAsked = (r: { crossings: readonly CrossingResult[] }) => {
  const asked = new Set(r.crossings.filter(c => c.requestedType).map(c => c.roadId));
  return (f: FootprintConflict) => f.feature !== 'road' || f.roadId === undefined || !asked.has(f.roadId);
};
/** A choice-lift retry raises our grade this much more than a player's box or bridge lacked, m (engine
 * margin: a deeper embankment also widens the box's footprint a little). */
const BOX_FLOOR_MARGIN = 0.25;
/** …and at the clearance stations this close to a river or railway it failed to clear, m */
const SEPARATION_REACH = 50;
/** Support targets this close together are lifted as one stretch; a lift reaches this far, m. */
const LIFT_CLUSTER = 2400;
/** A motorway's noise as its two directional sources, half the corridor's traffic each on its lane-pair axis
 * (D 27.5: ±6.0 m, data/motorway.ts d275CrossSection; screening from the axis, Manuál §1.11 a). One
 * direction on its own (a separate stretch or a split) cannot hear the other yet: the whole corridor's
 * traffic on its own lane-pair axis (its carriageway's axis displaced towards its median), an upper bound
 * (≤ +3 dB where only one direction is near) until a project decides houses heard by two sources. */
function motorwayLanes(cat: (typeof CATEGORIES)[CategoryId], medianRight: boolean): SourceLane[] | null {
  if (cat.mode !== 'motorway') return null;
  const axis = d275CrossSection().left.axis!;
  if (cat.paired) return [{ pos: axis, share: 0.5 }, { pos: -axis, share: 0.5 }];
  return [{ pos: (cat.crownWidth / 2 - axis) * (medianRight ? -1 : 1), share: 1 }];
}

/** Crossing ways this close to a failed relocation are retried with ordinary retaining rules. */
const STRICT_RETRY_REACH = 300;
/** The strip beyond our earthworks a new road keeps clear of them (crossing-geometry.ts SETBACK), m. */
const WEAVE_SETBACK = 3;
/** regula-falsi steps after the bracket when settling the fill value on a fixed grade line */
const SETTLE_EVALS = 4;

/** Stations where the mapped railway under us is the track we join or rebuild (EvalOptions.railTieIn):
 * the station areas at both ends, and stretches where our axis runs along it (three consecutive stations
 * each within 3 m of a mapped railway cell, i.e. parallel to it, not crossing it), widened by
 * RAIL_TURNOUT_M where we join or leave it. Limit: the raster does not tell lines apart, so another line
 * crossing exactly where we rebuild along ours is taken as ours too. */
function railTrackOurs(st: { n: number; ds: number; s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>; tx: ArrayLike<number>; ty: ArrayLike<number> },
  terrain: Terrain, length: number, tieIn: EvalOptions['railTieIn']): Uint8Array | null {
  if (!tieIn) return null;
  const n = st.n, on = new Uint8Array(n), out = new Uint8Array(n), widen = Math.ceil(RAIL_TURNOUT_M / st.ds);
  for (let i = 0; i < n; i++) on[i] = [-3, 0, 3].some(o => terrain.crossing(st.x[i] - st.ty[i] * o, st.y[i] + st.tx[i] * o) === 2) ? 1 : 0;
  for (let i = 0; i < n; i++) {
    if (st.s[i] < tieIn.a || length - st.s[i] < tieIn.b) out[i] = 1;
    if (i > 0 && i + 1 < n && on[i - 1] && on[i] && on[i + 1]) for (let j = Math.max(0, i - 1 - widen); j <= Math.min(n - 1, i + 1 + widen); j++) out[j] = 1;
  }
  return out;
}

/** Half the width of a taken-up track's raster trace (a 5 m cell either side of its line), m. */
const RETIRED_TRACK_M = 6;
/** Whether a point lies within `d` of any of the polylines (bucketed by 50 m cells). */
function nearLines(lines: readonly (readonly { x: number; y: number }[])[], d: number): (x: number, y: number) => boolean {
  const C = 50, buckets = new Map<string, [number, number, number, number][]>();
  for (const line of lines) for (let k = 1; k < line.length; k++) {
    const a = line[k - 1], b = line[k];
    for (let cx = Math.floor((Math.min(a.x, b.x) - d) / C); cx <= Math.floor((Math.max(a.x, b.x) + d) / C); cx++)
      for (let cy = Math.floor((Math.min(a.y, b.y) - d) / C); cy <= Math.floor((Math.max(a.y, b.y) + d) / C); cy++) {
        const key = `${cx},${cy}`; let list = buckets.get(key); if (!list) buckets.set(key, list = []); list.push([a.x, a.y, b.x, b.y]);
      }
  }
  return (x, y) => (buckets.get(`${Math.floor(x / C)},${Math.floor(y / C)}`) ?? []).some(([ax, ay, bx, by]) => {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy) <= d;
  });
}
