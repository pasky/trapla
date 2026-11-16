// The full recompute path: design → alignment → stations → profile → sections → structures →
// earthworks → buildings, crossings, noise → cost per station cell → checks. Pure (no DOM); runs in
// a Web Worker in the app.

import { autoProfile, PROFILE_HEIGHT_MAX, PROFILE_HEIGHT_STEP, type AutoProfileOptions, type SharedCostTable } from './autoprofile';
import { footprintConflicts, type FootprintConflict } from './footprint';
import { planRetainingWalls, retainingConflicts, type CrossingChainages, type RetainingPlan, type RetainingWall, type RetainingFeatureCache } from './retaining';
import { remedyBridgeSupports, SUPPORT_LIMITS } from './support-layout';
import { liftAutoProfile } from './profile-remedies';
import { bridgeModel, bridgeRunCost } from './bridge';
import { noiseBuyoutCost, BuildingIndex } from './buildings';
import { normalizeBuildingOverrides, normalizeWallOverrides, wallOverrideMasks, type BuildingOverride, type WallOverride } from './build-controls';
import { noiseControlViolations } from './noise-control-violations';
import { categoryViolation, crossingViolation, mergeNearby, oobViolation, profileViolation, ROAD_CHECKS, slopeViolation, timeViolation, type Violation } from './checks';
import {
  basePerKm, basePerKmUrban, categoryTunnelPerKm, cellLength, costParts, decisionPrices, landPerM2, sumParts, surchargeRate,
  type CostBreakdown, type CostParts,
} from './cost';
import { buildCrossingGeometry, crossingBridgeMask, crossingCache, crossingChoice, normalizeCrossingOverrides, resolveCrossings, underpassFits, underpassPrice, type CrossingOverride, type CrossingResult } from './crossings';
export type { CrossingResult } from './crossings';
import { CATEGORIES, type CategoryId } from './data/categories';
import { horizontalRules, speedNorms } from './data/norms';
import { LAND, MATERIAL_VALUE, NORM_EARTHWORK_ALLOWANCE, PRICES, STRUCTURE_RULES } from './data/prices';
import { CATEGORY_RANK, minCategoryForTraffic, type ScenarioParams } from './data/scenario';
import { ACCESS, BUILDING_RULES, CROSSING_RULES, ENDPOINT_JUNCTIONS, NOISE, ROAD_CLASSES, type EndpointJunctionKind } from './data/urban';
import { massHaul, volumes } from './earthworks';
import { earthEngineeringPerM, flatEarthGeometry } from './earthengineering';
import { buildAlignment, station, type PI, type Vec2 } from './horizontal';
import {
  crossSectionScreens, noiseOutcome, wallLineLengths,
  type AcousticSource, type NoiseReceiver, type WallStretch,
} from './noise';
import { createNoiseModel } from './road-noise';
import { createRailNoiseModel, type RailTrafficGroup } from './rail-noise';
import { crossingWallGaps } from './crossing-walls';
import { protectedRasterCells } from './protected-raster';
import { mergeCrossings, type RoadNet } from './roadnet';
import type { GroundProfile } from './ground';
import { computeSections, DEFAULT_SLOPES, flatCutBands, type SectionCache } from './sections';
import { chooseStructures, KIND, type Run } from './structures';
import { overrideMask, type StructureOverride } from './overrides';
import { BUILTUP_BIT, CLASS_BITS, LC, OOB_BIT, type Terrain } from './terrain';
import { buildProfile, elevations, type VPI } from './vertical';
import { CULVERT_RULES } from './data/culverts';
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
  demolished: { j: number; i: number; cost: number; in: 'bridge' | 'embankment' | 'cut' | 'reroute'; strip: boolean }[];
  /** Outside the footprint: noise fallback or explicit player acquisition + demolition, including plot allowance. */
  boughtOut: { j: number; i: number; cost: number; reason?: 'manual' }[];
  /** Kept buildings remain present; hit means footprint/working-strip conflict. */
  kept: { j: number; i: number; hit: boolean }[];
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
  };
  travelMin: number;
  minCategory: CategoryId;
  valid: boolean;
  profileFeasible: boolean;
  /** Unprefixed keys are cumulative checkpoints; sections is the last engineering pass.
   * work.* are elapsed milliseconds summed across all passes (engineering includes its substeps).
   * count.* count calls, not milliseconds. Missing work/count keys mean that path did not run. */
  timing: Record<string, number>;
  /** A fast drag preview (see EvalOptions.preview): approximate, never a score. */
  preview?: boolean;
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
  /** Stable physical acoustic source id of this carriageway (project `acousticSourceId`). */
  acousticSourceId?: string;
  /** One direction of a split motorway: station ranges where the other direction runs alongside on the
   * left (one common formation). Houses on that side belong to the other direction's noise check and
   * no wall can stand in the median there. */
  leftJoined?: readonly { s0: number; s1: number }[];
  /** Split motorway, crossed roads where the two directions run joined: the owning direction builds one
   * crossing for both (its footprint widened by the other direction's mirror on the left); the other
   * direction reuses that structure (`from`: the owner's crossings), billing and drawing nothing. */
  sharedCrossings?: { own: true } | { own: false; from: readonly CrossingResult[] };
  /** Railway: trains per period by type and speed (noise source); none = a silent, unused line. */
  railTraffic?: readonly RailTrafficGroup[];
}

interface GeometryRow { width: number; area: number; bridge: number; engineering: number; cuts: [number, number, number][] }
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
const PROFILE_TABLE_VALUES = 8;
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
      const slot = groundId * 4 + kind + 1;
      let table = values.get(slot);
      if (!table) values.set(slot, table = new Float64Array(size).fill(NaN));
      return table;
    } };
    byKey.set(key, tables);
  }
  return tables;
}

const STEP = 10;
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
  const preview = !!opts.preview;
  const t0 = performance.now();
  const timing: Record<string, number> = {};
  const lap = (k: string) => { timing[k] = performance.now() - t0; };
  const { terrain, scenario } = ctx;
  const cat = CATEGORIES[d.category];
  const norms = speedNorms(d.speed, d.category);
  const al = buildAlignment(ctx.a, ctx.b, d.pis, horizontalRules(d.speed, d.category));
  // A category's own gradient limit (motorway) replaces the scenario's road value; roads unchanged.
  const maxGradient = cat.maxGradient?.[scenario.terrainClass] ?? scenario.maxGradient;
  const st = station(al, STEP);
  const n = st.n, ds = st.ds;
  let manualStructures = overrideMask(st.s, d.structureOverrides);
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
  const streamSamples: number[] = [];
  /** `below`: the crossing may instead pass this far below the crossed feature (motorways) */
  const mustBridge: { s: number; g: number; need: number; what: string; below?: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (const f of [0, 0.25, 0.5, 0.75]) {
      if (f > 0 && i + 1 >= n) break;
      const x = st.x[i] + (i + 1 < n ? (st.x[i + 1] - st.x[i]) * f : 0);
      const y = st.y[i] + (i + 1 < n ? (st.y[i + 1] - st.y[i]) * f : 0);
      if (!terrain.watercourses && terrain.landcover(x, y) === LC.stream) streamSamples.push(st.s[i] + f * ds);
      const c = terrain.crossing(x, y);
      if (!c) continue;
      const need = c === 2 ? STRUCTURE_RULES.railClearance : STRUCTURE_RULES.riverClearance;
      const gc = terrain.heightAt(x, y);
      mustBridge.push({ s: st.s[i] + f * ds, g: gc, need, what: c === 2 ? 'railway' : 'river' });
      for (const j of f === 0 ? [i] : [i, i + 1]) {
        const req = need + gc - ground[j];
        if (!(clearance[j] >= req)) clearance[j] = req;
      }
    }
  }

  // Collapse adjacent raster hits, rather than billing a new culvert for every 5 m stream pixel.
  const streamS: number[] = [];
  for (let k = 0; k < streamSamples.length; k++) {
    const start = k;
    while (k + 1 < streamSamples.length && streamSamples[k + 1] - streamSamples[k] <= CULVERT_RULES.rasterMerge) k++;
    streamS.push((streamSamples[start] + streamSamples[k]) / 2);
  }
  const water = terrain.watercourses?.intersections(n, st.s, st.x, st.y) ?? streamS.map((s, id): WaterCrossing => {
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
    // Water can stay above a deep bored tunnel; an open cut needs a diversion we do not model.
    const need = size.minHeight;
    const i0 = Math.min(n - 2, Math.floor(c.s / ds));
    for (const j of [i0, i0 + 1]) {
      waterMin[j] = Math.max(Number.isNaN(waterMin[j]) ? -Infinity : waterMin[j], g + need - ground[j]);
      waterBelow[j] = Math.min(Number.isNaN(waterBelow[j]) ? Infinity : waterBelow[j], g - STRUCTURE_RULES.tunnelMinDepth - ground[j]);
    }
    mustBridge.push({ s: c.s, g, need, what: 'watercourse' });
  }
  // Distinct sparse crossing classes retain their actual size, skew and multiplicity in the DP.
  const costClasses = groundProfiles.map((_, ground) => ({ ground, water: [] as WaterCrossing[], elevation: 0 }));
  const profileCostClass = Uint16Array.from(groundIds);
  for (let i = 0; i < n; i++) if (waterAt[i].length) {
    profileCostClass[i] = costClasses.length;
    costClasses.push({ ground: groundIds[i], water: waterAt[i], elevation: ground[i] });
  }
  const crossingCost = (cs: WaterCrossing[], width: number, z: number) => cs.reduce((v, c) => v + (z > waterGround.get(c)! ? culvertCost(c, width) : 0), 0);
  const forceWater = (mask: Uint8Array, ss: ArrayLike<number>, heights: ArrayLike<number>, widths: ArrayLike<number>, chosen?: ArrayLike<number>) => {
    for (const c of water) {
      const i = Math.min(ss.length - 1, Math.round(c.s / (ss[1] - ss[0])));
      const size = waterSize(c, widths[i]);
      if (size.type !== 'bridge' && chosen?.[i] !== KIND.bridge) continue;
      const opening = Math.max(c.width + 2 * CULVERT_RULES.bridgeBanks, size.q100 / (CULVERT_RULES.velocity * 2) + 2 * CULVERT_RULES.bridgeBanks);
      const halfSpan = opening / Math.max(0.01, c.sine) / 2;
      for (let j = 0; j < ss.length; j++) if (Math.abs(ss[j] - c.s) <= halfSpan + (ss[1] - ss[0]) / 2 && heights[j] > 0) mask[j] = 1;
    }
  };

  const waterSide = Array.from({ length: n }, (_, i) => (terrain.watercourses?.section(st.x[i], st.y[i], st.tx[i], st.ty[i], 150, 150) ?? []).map(hit => ({ ...hit,
    offset: -(hit.x - st.x[i]) * st.ty[i] + (hit.y - st.y[i]) * st.tx[i], ground: terrain.heightAt(hit.x, hit.y) })));
  const forceParallelWater = (mask: Uint8Array, indices: ArrayLike<number>, z: ArrayLike<number>, left: ArrayLike<number>, right: ArrayLike<number>, diverted?: ReadonlySet<number>,
    waterElevation?: ReadonlyMap<WaterCrossing, number>) => {
    const gridDs = indices.length > 1 ? st.s[indices[1]] - st.s[indices[0]] : ds;
    const barrels = water.flatMap(c => {
      const k = Math.min(indices.length - 1, Math.round(c.s / gridDs)), i = indices[k];
      const j = Math.max(0, Math.min(indices.length - 2, Math.floor(c.s / gridDs)));
      const t = Math.max(0, Math.min(1, (c.s - st.s[indices[j]]) / (st.s[indices[j + 1]] - st.s[indices[j]])));
      const cover = (waterElevation?.get(c) ?? z[j] * (1 - t) + z[j + 1] * t) - waterGround.get(c)!;
      const envelope = culvertEnvelope(c, left[k], right[k], ds, st.tx[i], st.ty[i], cover);
      return envelope ? [{ c, envelope }] : [];
    });
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      if (z[k] <= ground[i]) continue;
      if (waterSide[i].some(hit => !diverted?.has(hit.id) && hit.offset <= left[k] && hit.offset >= -right[k]
        && z[k] - hit.ground >= STRUCTURE_RULES.riverClearance
        && !barrels.some(({ c, envelope }) => terrain.watercourses!.connected(c.id, hit.id)
          && barrelContains(hit, envelope)))) mask[k] = 1;
    }
  };
  const tunnelWater = (ss: ArrayLike<number>, z: ArrayLike<number>) => {
    const mask = new Uint8Array(ss.length);
    for (const c of water) {
      const i = Math.min(ss.length - 1, Math.round(c.s / (ss[1] - ss[0])));
      if (z[i] <= waterGround.get(c)! - STRUCTURE_RULES.tunnelMinDepth) mask[i] = 1;
    }
    return mask;
  };

  // existing roads crossed by the route (geometry only; resolved once the grade is known)
  const rawRoadX = ctx.roads?.intersections(n, st.s, st.x, st.y) ?? [];
  // Billing may merge carriageways / omit tie-in-area objects; safety must see every raw crossing.
  // Only actual endpoint connections are outside this project's crossing scope. The old
  // 150 m billing margin is not proof that nearby roads can be buried without engineering.
  const roadX = mergeCrossings(rawRoadX, al.length, { ...CROSSING_RULES, endMargin: CROSSING_RULES.endpointTolerance + 1e-6 }, new Set(crossingOverrides.map((o) => o.roadId)));
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
    mustBridge.push({ s: c.s, g, need, what: ROAD_CLASSES[c.cls].label, below: CROSSING_RULES.underDepth });
    // A requested overbridge asks Auto for a cut, not the automatic motorway-overpass option.
    if (crossingChoice(c.way, crossingOverrides) === 'overbridge') return;
    const i0 = Math.min(n - 1, Math.floor(c.s / ds));
    for (const j of c.s > st.s[i0] && i0 + 1 < n ? [i0, i0 + 1] : [i0]) {
      const req = need + g - ground[j];
      if (!(clearance[j] >= req)) clearance[j] = req;
    }
  });
  // Raster crossings were collected before vector roads; elevations() requires station order.
  mustBridge.sort((a, b) => a.s - b.s);
  lap('stations');

  // --- per-metre costs for the auto-profile: rural rates on flat ground, incl. the surcharge ---
  // Markups by kind of work: SPK's rural/urban "other objects" surcharge (roads), or a price book's own
  // per-profession markups (railway, data/categories.ts). Road expressions stay bit-identical.
  const mk = cat.markup;
  const surE = (u: number) => mk ? mk.earth : surchargeRate(u), surB = (u: number) => mk ? mk.bridge : surchargeRate(u);
  const surT = (u: number) => mk ? mk.tunnel : surchargeRate(u);
  const sur = mk ? 1 + mk.earth : 1 + PRICES.otherObjectsSurcharge, surBridge = mk ? 1 + mk.bridge : sur, surTunnel = mk ? 1 + mk.tunnel : sur;
  // The base rate rides on the earth markup in the cost expressions below: rescale it to its own markup.
  const baseScale = mk ? (1 + mk.base) / (1 + mk.earth) : 1;
  // Items charged on every option alike (railway track and systems, also on structures) cannot change a
  // choice: the decision costs leave them out; the bill (costParts) charges them everywhere.
  const everywhere = cat.everywherePerKm ?? { rural: 0, urban: 0 };
  const baseRural = (basePerKm(d.category, scenario.terrainClass) - everywhere.rural) / 1000 * baseScale;
  const baseUrban = (basePerKmUrban(d.category, scenario.terrainClass) - everywhere.urban) / 1000 * baseScale;
  const tunnelKm = (u = 0) => categoryTunnelPerKm(cat, 0, u);
  const tunnelPerM = (cat.tunnelTubes * tunnelKm() / 1000) * surTunnel;
  const bridge = bridgeModel(cat);
  const bridgeRural = (h: number) => bridge.estimatePerM(h) * surBridge + cat.crownWidth * LAND.perM2;
  const { fillSlope, cutSlope } = DEFAULT_SLOPES;
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
          const size = waterSizes.get(c)!(wd);
          if (size.type === 'bridge') flags |= 1;
          else cost += barrelLength(c, wd) * size.perM + 2 * size.head;
        }
        if (z <= bed - STRUCTURE_RULES.tunnelMinDepth) flags |= 2;
      }
      lut.cost[j] = cost / ds;
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
      const { area, width } = flatEarthGeometry(Math.abs(h), b, h >= 0 ? fillSlope : cutSlope, h >= 0);
      row = { area, width, cuts: [], bridge: bridgeRural(h), engineering: earthEngineeringPerM(h, 0, area) };
      geometry[j] = row;
    }
    return row;
  };
  const cutsAt = (row: GeometryRow, h: number, ground: number) =>
    row.cuts[groundPackIds[ground]] ??= flatCutBands(-h, b, cutSlope, groundProfiles[ground]);
  // Water classes depend on this route's crossings: their tables are shared only within this call.
  const wetTables = new Map<string, Float64Array>();
  /** cost per metre against grade-minus-ground h for a given value of a m³ of fill material */
  const costFor = (materialValue: number) => {
    const dp = decisionPrices(materialValue);
    const cost = (h: number, kind = -1, costClass = 0) => {
      if (kind === KIND.tunnel) return tunnelPerM;
      const geo = geometryAt(h);
      if (kind === KIND.bridge) return geo.bridge;
      let earth: number;
      const wd = geo.width;
      const waterPrice = waterOption(costClass, h, wd);
      if (h >= 0) {
        earth = (baseRural + geo.area * dp.fillPerM3 + geo.engineering + wd * topsoilPerM2
          + waterPrice.cost) * sur + wd * LAND.perM2;
      } else {
        const [a1, a2, a3] = cutsAt(geo, h, costClasses[costClass].ground);
        earth = (baseRural + a1 * dp.cutPerM3.I + a2 * dp.cutPerM3.II + a3 * dp.cutPerM3.III
          + earthEngineeringPerM(h, a1 + a2 + a3, 0) + wd * topsoilPerM2 + waterPrice.cost) * sur + wd * LAND.perM2;
      }
      const waterBridge = waterPrice.bridge;
      if (waterBridge) earth = geo.bridge + 1e7; // unavailable earthwork, not a free zero-price culvert
      if (waterPrice.tunnel) earth = tunnelPerM + 1e7;
      if (kind === KIND.earth) return earth;
      if (waterPrice.tunnel) return tunnelPerM;
      if (waterBridge && h >= STRUCTURE_RULES.riverClearance) return geo.bridge;
      let best = earth;
      if (h >= STRUCTURE_RULES.bridgeMinHeight) best = Math.min(best, geo.bridge);
      if (-h >= STRUCTURE_RULES.tunnelMinDepth) best = Math.min(best, tunnelPerM);
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
      return tables.dry(materialValue, groundPackIds[entry.ground], kind, heightCount);
    };
    return Object.assign(cost, { table });
  };
  const usable = 1 - NORM_EARTHWORK_ALLOWANCE.unsuitableShare;
  const tpl = { crownWidth: b, fillSlope, cutSlope };
  // Mass balance of a candidate grade line: the same steps as the bill below (cross-sections,
  // structure choice incl. forced crossings, volumes), on every BALANCE_STRIDE-th station (and B) and
  // with the built-up share taken at the centreline only.
  const subI: number[] = [];
  for (let i = 0; i < n; i += BALANCE_STRIDE) subI.push(i);
  if (subI[subI.length - 1] !== n - 1) subI.push(n - 1);
  const sub = subI.length, subDs = ds * BALANCE_STRIDE;
  const subS = new Float64Array(sub), subX = new Float64Array(sub), subY = new Float64Array(sub);
  const subTx = new Float64Array(sub), subTy = new Float64Array(sub), subW = new Float64Array(sub);
  const subMust = new Uint8Array(sub), subUrban = new Uint8Array(sub);
  for (let k = 0; k < sub; k++) {
    const i = subI[k];
    subS[k] = st.s[i]; subX[k] = st.x[i]; subY[k] = st.y[i]; subTx[k] = st.tx[i]; subTy[k] = st.ty[i];
    subUrban[k] = terrain.cover(st.x[i], st.y[i]) & BUILTUP_BIT ? 1 : 0;
    // length represented by the sample (trapezoid rule)
    subW[k] = (st.s[subI[Math.min(sub - 1, k + 1)]] - st.s[subI[Math.max(0, k - 1)]]) / 2;
    for (let j = i; j < (k + 1 < sub ? subI[k + 1] : n); j++) if (clearance[j] > -Infinity) subMust[k] = 1;
  }
  const subWater: WaterCrossing[][] = Array.from({ length: sub }, () => []);
  for (const c of water) subWater[Math.min(sub - 1, Math.round(c.s / subDs))].push(c);
  const subOverrides = crossingBridgeMask(subS, rawRoadX, crossingOverrides, overrideMask(subS, d.structureOverrides));
  const roadS = roadX.map((c) => c.s);
  const balanceOf = (v: VPI[], materialValue: number) => {
    const p = buildProfile(v, norms.minCrestRadius, norms.minSagRadius);
    const z = elevations(p, subS);
    const sc = computeSections(terrain, sub, subX, subY, subTx, subTy, z, tpl);
    const dp = decisionPrices(materialValue);
    const hh = new Float64Array(sub), earth = new Float64Array(sub), bp = new Float64Array(sub), tunnel = new Float64Array(sub);
    const must = new Uint8Array(sub);
    for (let k = 0; k < sub; k++) {
      hh[k] = z[k] - ground[subI[k]];
      const u = subUrban[k], su = 1 + surE(u), land = landPerM2(u), wd = sc.dayL[k] + sc.dayR[k];
      earth[k] = (baseRural + (baseUrban - baseRural) * u + sc.cutI[k] * dp.cutPerM3.I + sc.cutII[k] * dp.cutPerM3.II
        + sc.cutIII[k] * dp.cutPerM3.III + sc.fill[k] * dp.fillPerM3 + wd * topsoilPerM2
        + earthEngineeringPerM(hh[k], sc.cut[k], sc.fill[k])
        + crossingCost(subWater[k], wd, z[k]) / subW[k]) * su + wd * land;
      bp[k] = bridge.perM(hh[k]) * (mk ? 1 + surB(u) : su) + b * land;
      tunnel[k] = (cat.tunnelTubes * tunnelKm(u) / 1000) * (mk ? 1 + surT(u) : su);
      if (subMust[k] && hh[k] > 0) must[k] = 1;
    }
    forceWater(must, subS, hh, Float64Array.from(sc.dayL, (v, i) => v + sc.dayR[i]));
    forceParallelWater(must, subI, z, sc.dayL, sc.dayR);
    if (roadS.length) {
      const rz = elevations(p, roadS);
      roadX.forEach((c, j) => {
        const k = Math.min(sub - 1, Math.round(c.s / subDs));
        const choice = crossingChoice(c.way, crossingOverrides);
        if (!((!choice || choice === 'bridge') && ROAD_CLASSES[c.cls].separable && rz[j] - roadG[j] >= CROSSING_RULES.overHeight && hh[k] > 0)) return;
        // Auto local roads may instead pass through the embankment in a priced underpass.
        const wd = sc.dayL[k] + sc.dayR[k], box = !choice && underpassFits({ cls: c.cls, h: rz[j] - roadG[j] }, wd) ? underpassPrice(c, wd, subUrban[k]) : undefined;
        if (box) earth[k] += box.cost * (1 + surB(subUrban[k])) / subW[k];
        else must[k] = 1;
      });
    }
    const input = { ds: subDs, h: hh, earthPerM: earth, bridgePerM: bp, tunnelPerM: tunnel, forced: must, forcedTunnel: tunnelWater(subS, z), overrides: subOverrides,
      bridgeRunCost: bridgeRunCost(bridge, hh, subDs, i => surB(subUrban[i]), i => landPerM2(subUrban[i])) };
    const firstChoice = chooseStructures(input);
    forceWater(must, subS, hh, Float64Array.from(sc.dayL, (v, i) => v + sc.dayR[i]), firstChoice.kind);
    const { kind } = chooseStructures(input);
    let bal = 0;
    for (let k = 0; k < sub; k++) if (kind[k] === KIND.earth) bal += (usable * sc.cut[k] - sc.fill[k]) * subW[k];
    return bal;
  };

  // --- vertical alignment ---
  let vpis: VPI[];
  let profileFeasible = true;
  let autoOptions: AutoProfileOptions | undefined;
  let pinViolations: Violation[] = [];
  let materialValue = MATERIAL_VALUE.start;
  const zA = opts.endpointElevations?.a ?? ground[0], zB = opts.endpointElevations?.b ?? ground[n - 1];
  if (!Number.isFinite(zA) || !Number.isFinite(zB)) throw new Error('Non-finite endpoint elevation');
  if (d.profileMode === 'auto' || d.vpis.length < 2) {
    const minH = clearance.slice();
    const maxH = new Float64Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      if (manualStructures[i] === KIND.bridge) minH[i] = Math.max(Number.isNaN(minH[i]) ? -Infinity : minH[i], STRUCTURE_RULES.bridgeMinHeight);
      if (manualStructures[i] === KIND.tunnel) maxH[i] = -STRUCTURE_RULES.tunnelMinDepth;
    }
    for (const c of rawRoadX) {
      const choice = crossingChoice(c.way, crossingOverrides);
      if (choice !== 'bridge' && choice !== 'overbridge' && choice !== 'underpass') continue;
      const g = terrain.heightAt(c.x, c.y), i0 = Math.min(n - 1, Math.floor(c.s / ds));
      const box = choice === 'underpass' ? underpassPrice(c, 0, 0) : undefined;
      if (choice === 'underpass' && !box) continue;
      for (const i of [i0, Math.min(n - 1, i0 + 1)]) {
        if (box) minH[i] = Math.max(Number.isNaN(minH[i]) ? -Infinity : minH[i], g + box.minHeight - ground[i]);
        else if (choice === 'bridge') {
          const need = ROAD_CLASSES[c.cls].noAtGrade ? STRUCTURE_RULES.railClearance : CROSSING_RULES.overHeight;
          minH[i] = Math.max(Number.isNaN(minH[i]) ? -Infinity : minH[i], g + need - ground[i]);
        } else if (ROAD_CLASSES[c.cls].noAtGrade) maxH[i] = Math.min(Number.isNaN(maxH[i]) ? Infinity : maxH[i], g - CROSSING_RULES.underDepth - ground[i]);
      }
    }
    const apOpt = {
      endpointElevations: opts.endpointElevations,
      maxGradient, minCrest: norms.minCrestRadius, minSag: norms.minSagRadius,
      costPerM: costFor(MATERIAL_VALUE.start), minH, maxH, eitherH: { above: waterMin.slice(), below: waterBelow }, structureKind: manualStructures, pins: d.gradePins,
      costClass: profileCostClass, costClassCount: costClasses.length,
      balance: {
        costFor, balanceOf, start: MATERIAL_VALUE.start, lo: MATERIAL_VALUE.lo, hi: MATERIAL_VALUE.hi,
        tolerance: MATERIAL_VALUE.tolerancePerM * al.length,
      },
    };
    autoOptions = apOpt;
    // a preview always solves once, at the given (else the starting) material value
    const fixed = preview ? opts.materialValue ?? MATERIAL_VALUE.start : undefined;
    let ap = fixed === undefined ? autoProfile(st.s, ground, apOpt)
      : { ...autoProfile(st.s, ground, { ...apOpt, costPerM: costFor(fixed), balance: undefined }), materialValue: fixed };
    // vertical curves can shave the clearance the polyline search provided: retry asking for more
    for (let attempt = 0; attempt < 2 && mustBridge.length && !preview; attempt++) {
      const prof0 = buildProfile(ap.vpis, norms.minCrestRadius, norms.minSagRadius);
      const z0 = elevations(prof0, mustBridge.map((c) => c.s));
      let short = 0;
      const minH = apOpt.minH.slice(), waterAbove = apOpt.eitherH.above.slice();
      mustBridge.forEach((c, k) => {
        // A surface stream above a deep bored tunnel is already separated. Never let that
        // crossing raise every other clearance by the hill's entire height.
        if (c.what === 'watercourse' && z0[k] <= c.g - STRUCTURE_RULES.tunnelMinDepth) return;
        if (c.below !== undefined && (z0[k] <= c.g - c.below || rawRoadX.some((road) => Math.abs(road.s - c.s) < 1e-6 && crossingChoice(road.way, crossingOverrides) === 'overbridge'))) return;
        const deficit = c.g + c.need - z0[k];
        if (deficit <= 1e-6) return;
        short = Math.max(short, deficit);
        const target = c.what === 'watercourse' ? waterAbove : minH;
        const i0 = Math.min(n - 2, Math.floor(c.s / ds));
        for (const i of [i0, i0 + 1]) target[i] = Math.max(Number.isNaN(target[i]) ? -Infinity : target[i], c.g + c.need - ground[i] + deficit + 0.5);
      });
      if (short <= 1e-6) break;
      apOpt.minH = minH; apOpt.eitherH.above = waterAbove;
      // same material value: only the clearance changes
      const mv = ap.materialValue ?? MATERIAL_VALUE.start;
      const retry = autoProfile(st.s, ground, { ...apOpt, balance: { ...apOpt.balance, start: mv, lo: mv, hi: mv } });
      // A clearance refinement must not replace an already pin-compliant solution by its straight
      // fallback. Keep the useful grade and report its clearance shortfall instead.
      if (d.gradePins?.length && !retry.feasible) break;
      ap = retry;
    }
    vpis = ap.vpis;
    materialValue = ap.materialValue ?? MATERIAL_VALUE.start;
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
  const supportMemo = new Map<string, number>(), retainingMemo: RetainingFeatureCache = new Map();
  // Reroutes traced and engineered by the first pass, reused by the strict retry where our footprint is unchanged.
  const reroutes = crossingCache();
  const sectionMemo: SectionCache = [];
  // Grade repairs keep the horizontal strips fixed. Earth cover changes only where retaining
  // or daylight changes the two widths; deck/centre cover never changes within this evaluation.
  // These buffers describe the last engineer() call, which is always the accepted engineering;
  // do not reuse them for speculative candidates unless that ownership rule is preserved.
  const coverLeft = new Float64Array(n).fill(NaN), coverRight = new Float64Array(n).fill(NaN);
  const urbanEarth = new Float32Array(n), forestEarth = new Float32Array(n), urbanDeck = new Float32Array(n);
  const urbanCentre = new Uint8Array(n), oobEarth = new Uint8Array(n), oobDeck = new Uint8Array(n);
  let deckCoverReady = false;
  const work = (key: string, start: number) => { timing[`work.${key}`] = (timing[`work.${key}`] ?? 0) + performance.now() - start; };
  const engineer = (candidate: VPI[], crossingWays: CrossingChainages, strict: ReadonlySet<number>) => {
  timing['count.engineer'] = (timing['count.engineer'] ?? 0) + 1;
  const engineeringStart = performance.now();
  const prof = buildProfile(candidate, norms.minCrestRadius, norms.minSagRadius);
  const grade = elevations(prof, st.s);
  const waterZ = elevations(prof, water.map(c => c.s));
  const waterElevation = new Map(water.map((c, i) => [c, waterZ[i]]));

  // --- cross-sections ---
  const sectionsStart = performance.now();
  const sec = computeSections(terrain, n, st.x, st.y, st.tx, st.ty, grade, tpl, true, sectionMemo);
  work('sections', sectionsStart);
  const retainingStart = performance.now();
  // A preview keeps natural slopes: no retaining walls, nor the bridges an impossible wall forces.
  const retention: RetainingPlan = preview ? {
    walls: [], perCell: new Float64Array(n), landPerCell: new Float64Array(n), forcedBridge: new Uint8Array(n), forcedTunnel: new Uint8Array(n),
    wallSurfaceL: new Float64Array(n).fill(NaN), wallSurfaceR: new Float64Array(n).fill(NaN), channelRelocations: [], clearanceRequirements: [],
  } : planRetainingWalls({ ...st, ...sec, grade, crownWidth: b }, terrain, ctx.roads, manualStructures, water, retainingMemo, waterElevation, crossingWays);
  work('retaining', retainingStart);
  const dec = decisionPrices(materialValue);
  const cutP = dec.cutPerM3, fillP = dec.fillPerM3;
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

  // --- structures: the earthwork option against a bridge / tunnel, each at the rates of its own
  // footprint (as the bill will charge it) ---
  work('cover', coverStart);
  const selectionStart = performance.now();
  const h = new Float64Array(n);
  const geotechnicalPerM = new Float64Array(n), culverts = new Float64Array(n);
  const earthPerM = new Float64Array(n), bridgePerM = new Float64Array(n), tunnelPerMAt = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    h[i] = grade[i] - ground[i];
    geotechnicalPerM[i] = earthEngineeringPerM(h[i], sec.cut[i], sec.fill[i]);
    for (const c of waterAt[i]) culverts[i] += crossingCost([c], sec.dayL[i] + sec.dayR[i], waterElevation.get(c)!);
    const ue = urbanEarth[i], ud = urbanDeck[i], ut = urbanCentre[i], wd = sec.dayL[i] + sec.dayR[i];
    earthPerM[i] = (baseRural + (baseUrban - baseRural) * ue + sec.cutI[i] * cutP.I + sec.cutII[i] * cutP.II
      + sec.cutIII[i] * cutP.III + sec.fill[i] * fillP + wd * topsoilPerM2
      + geotechnicalPerM[i] + (culverts[i] + retention.perCell[i]) / cellLength(i, n, ds)) * (1 + surE(ue))
      + wd * (landPerM2(ue) + forestEarth[i] * LAND.forestExtraPerM2) + retention.landPerCell[i] / cellLength(i, n, ds);
    bridgePerM[i] = bridge.perM(h[i]) * (1 + surB(ud)) + b * landPerM2(ud);
    tunnelPerMAt[i] = (cat.tunnelTubes * tunnelKm(ut) / 1000) * (1 + surT(ut));
  }
  // Rivers / water / railways and watercourses exceeding practical culvert limits need bridges.
  // Inadequate clearance stays a violation, never a fake buried bridge.
  const forced = retention.forcedBridge.slice();
  for (let i = 0; i < n; i++) if (clearance[i] > -Infinity && h[i] > 0) forced[i] = 1;
  forceWater(forced, st.s, h, Float64Array.from(sec.dayL, (v, i) => v + sec.dayR[i]));
  forceParallelWater(forced, Array.from({ length: n }, (_, i) => i), grade, sec.dayL, sec.dayR,
    new Set(retention.channelRelocations.map(c => c.id)), waterElevation);
  // an existing road clearly below the grade passes under a (short) bridge instead of being buried
  const roadZ = roadS.length ? elevations(prof, roadS) : new Float64Array(0);
  const crossings: CrossingResult[] = roadX.map((c, k) => ({
    s: c.s, i: Math.min(n - 1, Math.round(c.s / ds)), x: c.x, y: c.y, cls: c.cls, roadId: c.way,
    h: roadZ[k] - roadG[k], type: 'atGrade', cost: 0,
  }));
  for (const c of crossings) {
    const choice = crossingChoice(c.roadId!, crossingOverrides);
    if (!((!choice || choice === 'bridge') && ROAD_CLASSES[c.cls].separable && c.h >= CROSSING_RULES.overHeight && h[c.i] > 0)) continue;
    // An Auto local road may instead keep its level in an underpass: the selector weighs that
    // box (estimated over the footprint width) against our bridge; crossings price the built one.
    const wd = sec.dayL[c.i] + sec.dayR[c.i], box = !choice && underpassFits(c, wd) ? underpassPrice(c, wd, urbanCentre[c.i]) : undefined;
    if (box) earthPerM[c.i] += box.cost * (1 + surB(urbanEarth[c.i])) / cellLength(c.i, n, ds);
    else forced[c.i] = 1;
  }
  const forcedTunnel = tunnelWater(st.s, grade);
  for (let i = 0; i < n; i++) if (retention.forcedTunnel[i]) forcedTunnel[i] = 1;
  const structureInput = { ds, h, earthPerM, bridgePerM, tunnelPerM: tunnelPerMAt, forced, forcedTunnel, overrides: manualStructures,
    bridgeRunCost: bridgeRunCost(bridge, h, ds, i => surB(urbanDeck[i]), i => landPerM2(urbanDeck[i])) };
  let selection = chooseStructures(structureInput);
  // An economical bridge still needs its abutments outside the channel/banks, even if a culvert
  // was hydraulically possible. Extend crossing spans, retaining manual overrides and checks.
  forceWater(forced, st.s, h, Float64Array.from(sec.dayL, (v, i) => v + sec.dayR[i]), selection.kind);
  selection = chooseStructures(structureInput);
  work('selection', selectionStart);
  const supportStart = performance.now();
  const supported = remedyBridgeSupports({ ...st, grade, ground, ...selection, crownWidth: b }, terrain, ctx.roads, manualStructures, supportMemo, strict);
  work('support', supportStart);
  const supportHeights = [...supported.clearanceRequirements, ...retention.clearanceRequirements.filter(q =>
    supported.kind[q.i] !== KIND.tunnel && manualStructures[q.i] !== KIND.earth && manualStructures[q.i] !== KIND.tunnel && q.z > grade[q.i] + 0.01)];
  for (const issue of supported.diagnostics) if (issue.structure === 'abutment' && issue.reason === 'terrain' && issue.targetS !== undefined && issue.raiseM > 0) {
    const a = Math.max(1, Math.floor(Math.min(issue.s, issue.targetS) / ds)), b = Math.min(n - 2, Math.ceil(Math.max(issue.s, issue.targetS) / ds));
    if (manualStructures.subarray(a, b + 1).some(v => v >= 0)) continue;
    // Deck above ground; the abutment cell itself may stand in a shallow cut (support-layout).
    const abutment = Math.round((issue.targetS + (issue.targetS < issue.s ? ds : -ds) / 2) / ds);
    for (let i = a; i <= b; i++) supportHeights.push({ s: st.s[i], z: ground[i] + 0.15 - (i === abutment ? SUPPORT_LIMITS.abutmentCutM : 0) });
  }
  work('engineering', engineeringStart);
  return { prof, grade, waterZ, sec, retention,
    h, geotechnicalPerM, culverts, crossings, selection, supported, supportHeights };
  };
  const liftProfile = (candidate: VPI[], targets: { s: number; z: number }[]) => {
    const start = performance.now();
    const lifted = liftAutoProfile(candidate, targets, d.speed, maxGradient, d.gradePins, undefined, d.category);
    work('lift', start);
    timing['count.lift'] = (timing['count.lift'] ?? 0) + 1;
    return lifted;
  };
  /** Engineering through final checks. `relaxed` crossing ways leave their in-footprint stretch
   * to the crossing remedy (see retaining.ts); evaluate() retries strictly where that fails. */
  /** Stage A (engineering through the footprint screen) runs immediately; `complete()` runs the
   * rest (noise, bill, checks). It reads only this pass's own arrays, never the shared
   * engineer() buffers, so it stays valid after a later pass. */
  const finish = (relaxed: CrossingChainages, strict: ReadonlySet<number> = new Set(), start = autoVpis): { vpis: VPI[]; footprintConflicts: FootprintConflict[]; complete: () => Result } => {
  const oob = oobInput.slice();
  let vpis = start;
  let engineering = engineer(vpis, relaxed, strict);
  const repairTargets = new Map<number, number>();
  let usedProfileRetry = false;
  for (let attempt = 0; attempt < 5 && !preview && profileFeasible && d.profileMode === 'auto' && engineering.supportHeights.length; attempt++) {
    for (const q of engineering.supportHeights) repairTargets.set(q.s, Math.max(q.z, repairTargets.get(q.s) ?? -Infinity));
    const targets = [...repairTargets].map(([s, z]) => ({ s, z })).sort((a, b) => a.s - b.s);
    let lifted = liftProfile(vpis, targets);
    if (!lifted && autoOptions && !usedProfileRetry) {
      // If the existing knots cannot accommodate the lift, let the same DP place new knots.
      // Material value is already settled: one fixed-price solve, no repeat mass-balance search.
      const minH = autoOptions.minH ? Float64Array.from(autoOptions.minH) : new Float64Array(n).fill(NaN);
      for (const q of targets) {
        const i = Math.min(n - 1, Math.round(q.s / ds));
        minH[i] = Math.max(Number.isNaN(minH[i]) ? -Infinity : minH[i], q.z - ground[i] + 0.25);
      }
      const retryStart = performance.now();
      const retry = autoProfile(st.s, ground, { ...autoOptions, minH, costPerM: costFor(materialValue), balance: undefined });
      work('retryDP', retryStart);
      timing['count.retryDP'] = (timing['count.retryDP'] ?? 0) + 1;
      usedProfileRetry = true;
      if (retry.feasible) {
        const profile = buildProfile(retry.vpis, norms.minCrestRadius, norms.minSagRadius), z = elevations(profile, targets.map(q => q.s));
        lifted = targets.every((q, i) => z[i] >= q.z - 0.01) ? retry.vpis : liftProfile(retry.vpis, targets);
      }
    }
    if (!lifted) break;
    vpis = lifted;
    engineering = engineer(vpis, relaxed, strict);
  }
  const { prof, grade, waterZ, sec, retention,
    h, geotechnicalPerM, culverts, crossings, selection, supported } = engineering;
  const { kind, runs } = supported;
  // Auto support clearances are repaired by the lift loop above, which a preview skips: do not
  // flash them as violations in a drag preview (the full evaluation reports any it cannot fix).
  const structureViolations = [...selection.violations, ...(preview && d.profileMode === 'auto' ? [] : supported.violations)];
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

  // --- buildings in the footprint (slope to slope at grade, the deck strip under bridges), plus a
  // working strip on either side ---
  const buildingCost = new Float64Array(n);
  const demolished: Result['demolished'] = [];
  const bld = ctx.buildings;
  const gone = new Uint8Array(bld ? bld.n : 0);
  const buildingOverrides = normalizeBuildingOverrides(d.buildingOverrides, bld?.n ?? 0);
  const keptIds = new Set(buildingOverrides.filter((o) => o.action === 'keep').map((o) => o.j));
  const kept: Result['kept'] = [], manualBuys: Result['boughtOut'] = [];
  const buildingViolations: Violation[] = [], noiseViolations: Violation[] = [];
  if (bld) {
    const items = bld.items;
    const best = new Map<number, { i: number; along: number; core: boolean }>();
    for (let i = 0; i < n; i++) {
      if (kind[i] === KIND.tunnel) continue;
      const left = kind[i] === KIND.earth ? sec.dayL[i] : w, right = kind[i] === KIND.earth ? sec.dayR[i] : w;
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
          detail: `Kept: it cannot be demolished. The road's slopes and its ${BUILDING_RULES.clearance} m working strip touch it.`,
          target: { buildings: [j] },
          rule: 'Game rule: a building you keep must stay clear of our road, its slopes and its working strip.' });
        continue;
      }
      gone[j] = 1;
      buildingCost[p.i] += bld.cost[j];
      // which earthwork: the one on the building's side of the road (a cross slope may cut one side, fill the other)
      const k = p.i, leftSide = (items[j][0] - st.x[k]) * -st.ty[k] + (items[j][1] - st.y[k]) * st.tx[k] >= 0;
      const cutSide = (leftSide ? sec.zDayL[k] : sec.zDayR[k]) > grade[k];
      demolished.push({ j, i: k, cost: bld.cost[j], in: kind[k] === KIND.bridge ? 'bridge' : cutSide ? 'cut' : 'embankment', strip: !p.core });
    }
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

  // --- crossings of existing roads ---
  const crossingLump = new Float64Array(n), crossingStructure = new Float64Array(n);
  let crossingsPaid = 0;
  // Split motorway: the owning direction spans the other's body too where they run joined (mirror).
  const joinedAt = (i: number) => (opts.leftJoined ?? []).some(r => st.s[i] >= r.s0 && st.s[i] <= r.s1);
  // Union of both bodies, the other mirrored: from our right toe to its right toe (axes one crown apart).
  const crossWidth = opts.sharedCrossings?.own ? Float64Array.from(width, (v, i) => kind[i] === KIND.earth && joinedAt(i) ? b + 2 * sec.dayR[i] : v) : width;
  const crossingIssues = resolveCrossings(crossings, al.length, kind, crossWidth, urbanCentre, urban, crossingOverrides, cat.gradeSeparated ? (cat.mode === 'railway' ? 'railway' : 'motorway') : false);
  // What a player's reroute shape may not cross on the ground (protected raster, buildings not removed).
  const linkObstacle = (p: { x: number; y: number }, q: { x: number; y: number }, half: number) => {
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (!(len > 0)) return null;
    const tx = (q.x - p.x) / len, ty = (q.y - p.y) / len, x = (p.x + q.x) / 2, y = (p.y + q.y) / 2;
    let hit: 'railway' | 'water' | 'building' | null = null;
    protectedRasterCells(terrain, { i: 0, s: 0, x, y, tx, ty, along: len / 2, left: half, right: half }, f => { if (!hit && f.feature !== 'stream') hit = f.feature; });
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
  if (!preview) crossingIssues.push(...buildCrossingGeometry(crossings, { ...st, grade, width: crossWidth, crownWidth: b, kind, urban: urbanCentre, obstacle: linkObstacle, houses: linkHouses, houseCost: (j: number) => bld?.cost[j] ?? 0,
    streams: (p, q) => terrain.watercourses?.intersections(2, [0, Math.hypot(q.x - p.x, q.y - p.y)], [p.x, q.x], [p.y, q.y]).map(c => ({ x: c.x, y: c.y, crossing: c })) ?? [],
    left: Float64Array.from(kind, (k, i) => (k === KIND.earth ? sec.dayL[i] : width[i] / 2) + (crossWidth === width ? 0 : crossWidth[i] - width[i])),
    right: Float64Array.from(kind, (k, i) => k === KIND.earth ? sec.dayR[i] : width[i] / 2),
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
    const lump = c.type === 'junction' ? c.cost - (c.worksCost ?? 0) : c.type === 'reconnection' && c.cls === 'service' && c.cost > 0 ? ACCESS : 0;
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
  const endJunctions = (ctx.junctions ?? []).flatMap(j => {
    const end = Math.hypot(j.x - ctx.a.x, j.y - ctx.a.y) < 1e-6 ? 'a' as const : Math.hypot(j.x - ctx.b.x, j.y - ctx.b.y) < 1e-6 ? 'b' as const : null;
    return end ? [{ end, kind: j.kind, ways: new Set(j.ways), ...ENDPOINT_JUNCTIONS[j.kind] }] : [];
  });
  const footprintCheck = preview ? { conflicts: [] as FootprintConflict[], violations: [] as Violation[] } : footprintConflicts({ ...st, kind, grade, ...sec, crownWidth: b, runs, channelRelocations, featureCache: retainingMemo, strictWays: strict,
    ...(endJunctions.length ? { junctions: endJunctions } : {}) }, terrain, ctx.roads, crossings, water,
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
  const complete = (): Result => {

  // --- noise walls ---
  const wall = new Uint8Array(n), wallLength = new Float64Array(n), wallArea = new Float64Array(n);
  const noiseBuyouts = new Float64Array(n);
  let walls: WallStretch[] = [], wallsAroundChoices: WallStretch[] = [], boughtOut: Result['boughtOut'] = [];
  let receivers: NoiseReceiver[] = [];
  let acoustic: Result["noise"]["source"] = null, builtL: Float64Array = new Float64Array(0), builtR: Float64Array = new Float64Array(0);
  // Railway: CNOSSOS-EU train source and line propagation (rail-noise.ts) against the new-line limits.
  const noiseModel = cat.mode === 'railway' ? createRailNoiseModel(opts.railTraffic ?? [])
    : createNoiseModel(scenario.traffic, opts.operatingSpeed ?? d.speed, { heavyShare: scenario.heavyShare, ...(cat.mode === 'motorway' ? { profile: 'motorway' as const } : {}) });
  const wallOverrides = normalizeWallOverrides(d.wallOverrides);
  const wallMasks = wallOverrideMasks(st.s, wallOverrides);
  const wallGaps = crossingWallGaps(st, crossings, cat.crownWidth);
  const joinedLeft = new Uint8Array(n);
  for (const r of opts.leftJoined ?? []) for (let i = 0; i < n; i++) if (st.s[i] >= r.s0 && st.s[i] <= r.s1) { joinedLeft[i] = 1; wallGaps.L[i] = 1; }
  // Explicit walls are construction even when there are no nearby buildings (or no building layer).
  const noiseBuildings = bld ?? (wallOverrides.length ? new BuildingIndex([]) : undefined);
  if (noiseBuildings && !preview) {
    // walls and screening edges where the cross-section puts them (cut top, crown / deck edge)
    const screens = crossSectionScreens(n, kind, grade, cat.crownWidth, sec.dayL, sec.dayR, sec.zDayL, sec.zDayR,
      (i, left, o) => terrain.heightAt(st.x[i] - st.ty[i] * o * (left ? 1 : -1), st.y[i] + st.tx[i] * o * (left ? 1 : -1)), wallGaps);
    // split motorway: where the other direction runs alongside on the left, that side is its check
    for (let i = 0; i < n; i++) if (joinedLeft[i]) screens.L.shield[i] = 1;
    const rail = cat.mode === 'railway';
    acoustic = { id: opts.acousticSourceId ?? (rail ? 'acoustic:rail' : 'acoustic:road'), mode: rail ? 'rail' : 'road', laneOffset: NOISE.sourceOffset,
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
    noiseViolations.push(...noiseControlViolations(receivers, st.s));
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
    ...ROAD_CHECKS.horizontal(al, norms, { a: ctx.a, b: ctx.b, pis: d.pis, category: d.category }),
    ...ROAD_CHECKS.vertical(prof, norms, maxGradient, cat.mode === 'railway'),
  ];
  const waterCrossings: WaterResult[] = water.map((c, k) => {
    const i = Math.min(n - 1, Math.round(c.s / ds));
    const wd = sec.dayL[i] + sec.dayR[i], size = waterSize(c, wd);
    const above = waterZ[k] - terrain.heightAt(c.x, c.y);
    const tunnelRun = runs.find(r => r.kind === KIND.tunnel && i >= r.i0 && i <= r.i1);
    const shortTunnel = !!tunnelRun && tunnelRun.length < STRUCTURE_RULES.minTunnelLength;
    const isTunnel = kind[i] === KIND.tunnel && above <= -STRUCTURE_RULES.tunnelMinDepth && !shortTunnel;
    const run = runs.find(r => r.kind === KIND.bridge && i >= r.i0 && i <= r.i1);
    const bridgeSpan = Math.max(c.width + 2 * CULVERT_RULES.bridgeBanks, size.q100 / (CULVERT_RULES.velocity * 2) + 2 * CULVERT_RULES.bridgeBanks) / Math.max(0.01, c.sine);
    const clearBridge = !!run && c.s - bridgeSpan / 2 >= run.s0 && c.s + bridgeSpan / 2 <= run.s1;
    const need = kind[i] === KIND.bridge ? STRUCTURE_RULES.riverClearance : size.minHeight;
    const ok = isTunnel || (waterCoverFits(above, need) && (kind[i] === KIND.bridge ? clearBridge : kind[i] === KIND.earth && size.type !== 'bridge'));
    if (!ok) violations.push({ kind: 'crossing', s0: c.s, s1: c.s,
      title: shortTunnel ? 'Tunnel under a stream is too short' : above < 0 ? 'Our cutting runs through a stream' : `Our road blocks a ${c.waterKind === 'river' ? 'river' : 'stream'}`,
      fix: shortTunnel ? `Make the tunnel at least ${STRUCTURE_RULES.minTunnelLength} m long and deep enough, or pass above the stream` : size.type === 'bridge' || kind[i] === KIND.bridge ? `Put our road on a bridge spanning the water and its banks (${bridgeSpan.toFixed(0)} m along our road), at least ${need.toFixed(1)} m above the bed`
        : `Raise our road here to at least ${need.toFixed(1)} m above the stream bed for a ${waterOpening(size)} culvert, or use a bridge`,
      detail: `It may carry about ${size.q100.toFixed(1)} m³/s in a 100-year flood, from ${c.catchmentKm2.toFixed(1)} km² of land draining into it${c.truncated ? ' (a rough estimate: its area runs off the map)' : ''}. The game does not move streams for you; a deep tunnel can pass under it.`,
      basis: 'game', rule: 'Game estimate (research/17): flood size, culvert cover and fish passage are screened, not a hydraulic design',
    });
    let cost = kind[i] === KIND.earth && above > 0 ? culvertCost(c, wd) : 0;
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
    violations.push(profileViolation(al.length, maxGradient));
  }
  violations.splice(0, violations.length, ...mergeNearby(violations));
  // Messages name what is built: a railway is "our railway", not "our road".
  if (cat.mode === 'railway') for (const v of violations) for (const k of ['title', 'fix', 'detail'] as const)
    if (v[k]) v[k] = v[k]!.replace(/\bour road\b/g, 'our railway').replace(/\bOur road\b/g, 'Our railway');
  const travelMin = al.length / (d.speed / 3.6) / 60;
  const capacityTraffic = opts.capacityTraffic ?? scenario.traffic;
  const minCategory = minCategoryForTraffic(capacityTraffic);
  if ((opts.goals?.capacity ?? true) && cat.mode !== 'railway' && CATEGORY_RANK[d.category] < CATEGORY_RANK[minCategory]) {
    violations.push(categoryViolation(al.length, d.category, capacityTraffic, minCategory));
  }
  if ((opts.goals?.time ?? true) && travelMin > scenario.maxTravelMin + 1e-9) {
    violations.push(timeViolation(al.length, d.speed, travelMin, scenario.maxTravelMin));
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
    violations, geomViolations, cost, parts, cell: { width, urban, forest, wall, wallLength, wallArea }, crossings, waterCrossings, footprintConflicts: footprintCheck.conflicts, walls, wallsAroundChoices, demolished, boughtOut, kept,
    retainingWalls, wallSurfaceL: retention.wallSurfaceL, wallSurfaceR: retention.wallSurfaceR,
    noise: { receivers, source: acoustic, L: builtL, R: builtR, controlling: noiseModel.controlling,
      limit: noiseModel.controlling === 'night' ? noiseModel.limits?.nightDb ?? NOISE.limitNightDb : noiseModel.limits?.dayDb ?? NOISE.limitDayDb },
    quantities: {
      cut: vol.cut, fill: vol.fill, reused: mh.reused, surplus: mh.surplus, deficit: mh.deficit, avgHaul: mh.avgHaul,
      cutByClass, footprint, forestArea, buildingsHit: demolished.length, hitBuildings: demolished.map((p) => p.j),
      bridgeLength, tunnelLength, bridges: bridges.length, tunnels: tunnels.length, massHaul: vol.mass,
      urbanLength, wallLength: wallLength.reduce((a, v) => a + v, 0),
      wallArea: wallArea.reduce((a, v) => a + v, 0), noiseBuyouts: boughtOut.length,
      crossingsPaid, noiseDistance: noiseModel.contour, materialValue,
    },
    travelMin, minCategory, valid: violations.length === 0, profileFeasible, timing, ...(preview ? { preview: true } : {}),
  };
  };
  return { vpis, footprintConflicts: footprintCheck.conflicts, complete };
  };
  const first = finish(crossingWays);
  if (preview) return first.complete();
  // A relaxed road stretch that no remedy could absorb (a crossing way's residual or a minor road
  // at an abutment whose relocation failed) falls back to walls/structures (strict) nearby.
  const blocked = first.footprintConflicts.filter(c => c.feature === 'road' && c.action === 'blocked');
  if (!blocked.length) return first.complete();
  const relaxed = new Map(crossingWays), strict = new Set(blocked.map(b => b.roadId!));
  for (const c of rawRoadX) if (blocked.some(b => b.roadId === c.way || Math.abs(b.s0 - c.s) <= STRICT_RETRY_REACH)) { relaxed.delete(c.way); strict.add(c.way); }
  timing['count.strictRetry'] = 1;
  // Continue from the already repaired (lifted) Auto grade: its clearances still apply.
  const retry = finish(relaxed, strict, first.vpis).complete();
  // Every blocked road conflict is reported as a footprint violation, so a clean retry wins
  // without completing (noise, bill, checks) the first pass.
  if (!retry.violations.length) return retry;
  const result = first.complete();
  return retry.violations.length < result.violations.length ? retry : result;
}
/** Crossing ways this close to a failed relocation are retried with ordinary retaining rules. */
const STRICT_RETRY_REACH = 300;
