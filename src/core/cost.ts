// Cost model (2026 norms + research-informed estimates at original dates, CZK excl. VAT).
// All numbers and provenance come from data/*.ts.
//
// The bill is built per station cell (cell i = the stretch nearest to station i: ds long, half that
// at the two ends), one array per component, so every koruna is attributable along the route and the
// totals are simply the sums of the arrays (`costParts` → `sumParts`).

import { CATEGORIES, type Category, type CategoryId, type TerrainClass } from './data/categories';
import { EXCAVATION_BY_CLASS, LAND, NORM_EARTHWORK_ALLOWANCE, PRICES, TUNNEL_RULES } from './data/prices';
import { NOISE, URBAN_LAND, URBAN_NORM_PER_KM, URBAN_RATES } from './data/urban';
import { KIND, type Run } from './structures';
import { bridgeModel, bridgeVariableCosts } from './bridge';

/** value of the earthworks already included in the SFDI per-km norm, CZK per km */
export function allowanceValuePerKm(cat: CategoryId): number {
  const c = CATEGORIES[cat];
  // Item price books (railway) price track and systems without any earthworks in them.
  if (c.roadClass === 'rail') return 0;
  if (c.normShareOf) return c.normShareOf.share * allowanceValuePerKm(c.normShareOf.category);
  const cut = NORM_EARTHWORK_ALLOWANCE.cutPerKm[c.roadClass];
  const fill = cut * NORM_EARTHWORK_ALLOWANCE.fillShareOfCut;
  const topsoilArea = 1000 * (c.crownWidth + NORM_EARTHWORK_ALLOWANCE.topsoilExtraWidth);
  // unsuitable share goes to a tip; fill (85 % of cut) then equals the usable cut, so no borrow
  const unsuitable = cut * NORM_EARTHWORK_ALLOWANCE.unsuitableShare;
  return cut * PRICES.excavation + fill * PRICES.fillPlacing
    + unsuitable * PRICES.surplusHaulKm * PRICES.haulPerM3Km
    + topsoilArea * PRICES.topsoilDepth * PRICES.topsoil;
}

/** road base price per km: the norm minus the value of its built-in earthworks allowance */
export function basePerKm(cat: CategoryId, terrain: TerrainClass): number {
  return CATEGORIES[cat].normPerKm[terrain] - allowanceValuePerKm(cat);
}

/** the same inside built-up areas (SPK CN "intravilán" rows) */
export function basePerKmUrban(cat: CategoryId, terrain: TerrainClass): number {
  return URBAN_NORM_PER_KM[cat][terrain] - allowanceValuePerKm(cat);
}

/** tunnel tube price per km for a tunnel of the given length, bored or (`cut`) cut and cover; `urban` =
 * built-up share 0…1. SPK prices urban cut and cover "individuálně": PROVISIONAL, the urban bored row with
 * the rural rows' cut-and-cover premium. */
/** A long mined tube's price per metre against SPK's > 500 m row (TUNNEL_RULES.lengthFactor, research/64). */
export function tunnelLengthFactor(length: number): number {
  const f = TUNNEL_RULES.lengthFactor;
  return length > PRICES.tunnelLongThreshold ? Math.max(f.min, f.a + f.b / length) : 1;
}

export function tunnelPerKm(length: number, urban = 0, cut = false): number {
  const long = length > PRICES.tunnelLongThreshold;
  const bored = long ? PRICES.tunnelLongPerKm : PRICES.tunnelShortPerKm;
  const rural = cut ? long ? PRICES.cutCoverLongPerKm : PRICES.cutCoverShortPerKm : bored * tunnelLengthFactor(length);
  const town = (long ? URBAN_RATES.tunnelLongPerKm : URBAN_RATES.tunnelShortPerKm) * rural / bored;
  return rural + (town - rural) * urban;
}

/** tunnel price per km of tube for a category: its own price book (railway: SPOŽES has one row for both
 * methods) or the SPK road tube rows */
export function categoryTunnelPerKm(cat: Category, length: number, urban = 0, cut = false): number {
  const own = cat.tunnelPerKm;
  return own ? own.rural + (own.urban - own.rural) * urban : tunnelPerKm(length, urban, cut);
}

/** A tunnel's tubes and escape provision against one tube (NV 264/2009, TUNNEL_RULES): a two-lane road's
 * single tube over 500 m gets an escape gallery above 2,000 veh/day/lane and a second tube above 10,000.
 * Motorways already have two tubes (cross-passages between them); a motorway direction's tube has the
 * other direction's beside it; railways follow their own price book. */
export function tunnelTubeFactor(cat: Category, length: number, aadt: number): number {
  const T = TUNNEL_RULES;
  if (cat.tunnelPerKm || cat.tunnelTubes > 1 || cat.carriageway || length <= T.escapeFromLength) return 1;
  const perLane = aadt / 2;
  return perLane > T.twinTubesFromLaneTraffic ? 2 : perLane > T.escapeFromLaneTraffic ? T.escapeGalleryFactor : 1;
}

/** Half the width of a cut-and-cover pit at the surface, m: the structure (crown and walls), its sides at
 * pitSlope up from the grade. `depth` = ground − grade, m. */
export function cutCoverPitHalfWidth(depth: number, crownWidth: number): number {
  return crownWidth / 2 + TUNNEL_RULES.wallThickness + TUNNEL_RULES.pitSlope * Math.max(0, depth);
}

/** Cut-and-cover pit beyond what the SPK row includes (cover over the structure above 5 m), CZK per m of
 * tunnel: excavation (class II) and backfill of the pit's top layer. `depth` = ground − grade, m. */
export function cutCoverPitPerM(depth: number, crownWidth: number): number {
  const T = TUNNEL_RULES, extra = depth - T.structureHeight - T.cutCoverPricedCover;
  if (extra <= 0) return 0;
  // pit bottom: the structure; sides at pitSlope; the extra layer is its top `extra` metres
  const top = 2 * cutCoverPitHalfWidth(depth, crownWidth);
  const area = extra * (top - T.pitSlope * extra);
  return area * (EXCAVATION_BY_CLASS.II + PRICES.pitBackfill);
}

/** "other objects" surcharge rate for a built-up share 0…1; `divided` (a motorway's own objects) adds B.6
 * technology. Works on other roads (crossings, relocations) never carry it. */
export function surchargeRate(urban: number, divided = false): number {
  return PRICES.otherObjectsSurcharge + (URBAN_RATES.otherObjectsSurcharge - PRICES.otherObjectsSurcharge) * urban
    + (divided ? PRICES.technologySurcharge : 0);
}

/** The surcharge on a crossing structure's construction (SPK other objects, a railway's bridge markup):
 * what a line bills on top of a crossing's own price. */
export const structureSurcharge = (cat: Category, urban: number): number => cat.markup ? cat.markup.bridge : surchargeRate(urban);

/** whether a category's own objects carry B.6 technology (motorways) */
export const dividedRoad = (cat: Category) => cat.mode === 'motorway';

/** land price per m² for a built-up share 0…1 (statutory multiples included) */
export function landPerM2(urban: number): number {
  const town = URBAN_LAND.buildingLandPerM2 * URBAN_LAND.multiplier;
  return LAND.perM2 + (town - LAND.perM2) * urban;
}

const SURPLUS_PER_M3 = PRICES.surplusHaulKm * PRICES.haulPerM3Km;

/**
 * Marginal prices used for *decisions* (auto-profile, bridge vs embankment) before the global mass
 * balance is known. One shadow price values a m³ of fill material: a m³ of fill consumes one, a m³
 * of cut yields the usable share of one (and sends the unsuitable share to a tip). Its true value is
 * the price of bought fill less the placing it includes when the route is short of material (every
 * m³ of fill pays placing here) and minus the haul to a tip when it
 * has a surplus; the auto-profile searches for the value in between at which the grade line balances
 * (MATERIAL_VALUE in data/prices.ts). The final bill uses the real mass balance.
 */
export function decisionPrices(materialValue: number) {
  const usable = 1 - NORM_EARTHWORK_ALLOWANCE.unsuitableShare;
  const cut = (excavation: number) => excavation + (1 - usable) * SURPLUS_PER_M3 - usable * materialValue;
  return {
    cutPerM3: { I: cut(EXCAVATION_BY_CLASS.I), II: cut(EXCAVATION_BY_CLASS.II), III: cut(EXCAVATION_BY_CLASS.III) },
    fillPerM3: PRICES.fillPlacing + materialValue,
    topsoilPerM2: PRICES.topsoilDepth * PRICES.topsoil,
  };
}

export const PART_KEYS = [
  'roadBase', 'excavation', 'fillPlacing', 'haul', 'surplusHaul', 'unsuitable', 'borrow', 'topsoil', 'geotechnical', 'culverts',
  'bridges', 'tunnels', 'crossings', 'noiseWalls', 'surcharge', 'land', 'forest', 'buildings', 'noiseBuyouts',
] as const;
export type PartKey = (typeof PART_KEYS)[number];
/** CZK per station cell, one array per cost component; the bill is their sum */
export type CostParts = Record<PartKey, Float64Array>;

const EARTH_KEYS = ['excavation', 'fillPlacing', 'haul', 'surplusHaul', 'unsuitable', 'borrow', 'topsoil', 'geotechnical', 'culverts'] as const;

export interface CostBreakdown {
  roadBase: number;
  earthworks: number;
  earthDetail: { excavation: number; fillPlacing: number; haul: number; surplusHaul: number; unsuitable: number; borrow: number; topsoil: number; geotechnical: number; culverts: number };
  bridges: number;
  tunnels: number;
  /** Existing-road crossings: junctions, geometry-priced parallel links and overbridges/approaches. */
  crossings: number;
  noiseWalls: number;
  /** road base + earthworks + structures + crossings + noise walls */
  construction: number;
  /** "other objects" on road base, earthworks, bridges, tunnels and overbridges */
  surcharge: number;
  /** land + forest + footprint buildings + noise buyouts */
  land: number;
  landDetail: { land: number; forest: number; buildings: number; noiseBuyouts: number };
  total: number;
}

/** length of station cell i, m */
export function cellLength(i: number, n: number, ds: number): number {
  return i === 0 || i === n - 1 ? ds / 2 : ds;
}

export interface StationCostInput {
  category: CategoryId;
  terrainClass: TerrainClass;
  n: number;
  ds: number;
  /** KIND per station */
  kind: ArrayLike<number>;
  /** Grade minus ground, m; required for geometry-based bridge pricing. */
  h: ArrayLike<number>;
  /** built-up share of each cell, 0…1 (urban norm row, urban surcharge, building-land price) */
  urban?: ArrayLike<number>;
  /** section areas at each station, m² (ignored where the station is a structure) */
  cutI: ArrayLike<number>;
  cutII: ArrayLike<number>;
  cutIII: ArrayLike<number>;
  fill: ArrayLike<number>;
  /** High-earthwork engineering reserve, CZK/m before surcharge; earthwork cells only. */
  geotechnicalPerM?: ArrayLike<number>;
  /** Full watercourse culvert assembly (barrel + two ends), CZK/cell before surcharge; earthwork cells only. */
  culverts?: ArrayLike<number>;
  /** usable share of cut (the rest is unsuitable and goes to a tip) */
  usable: number;
  /** global mass balance: haul moment along the route (m³·m), reused cut, usable surplus to a tip,
   * fill that must be bought (m³) */
  haul: { moment: number; reused: number; surplus: number; deficit: number };
  /** land-take width, m: slope to slope at grade, deck width on bridges, 0 in tunnels */
  width: ArrayLike<number>;
  /** forest share of the at-grade footprint, 0…1 */
  forest?: ArrayLike<number>;
  runs: Run[];
  /** purchase + demolition of buildings assigned to each cell, CZK */
  buildings?: ArrayLike<number>;
  /** Acquisition outside the main footprint for priced relocations, not construction surcharge. */
  additionalLand?: ArrayLike<number>;
  /** purchase + demolition of noise-infeasible dwellings outside the footprint, CZK per cell */
  noiseBuyouts?: ArrayLike<number>;
  /** crossings of existing roads: all-in lump sums, CZK per cell */
  crossingLump?: ArrayLike<number>;
  /** SPK crossing works: links, overbridges and approaches (get other-objects surcharge), CZK/cell */
  crossingStructure?: ArrayLike<number>;
  /** noise wall surface in each cell (both sides added), m² */
  wallArea?: ArrayLike<number>;
  /** extra road per metre beyond the norm's crown, CZK/m (a hairpin's widened lanes), earthwork cells */
  extraRoadPerM?: ArrayLike<number>;
  /** 1 = a tunnel cell built cut and cover (structures.ts cutCoverMask) */
  cutCover?: ArrayLike<number>;
  /** The cones of fill in front of the abutments (abutment-cone.ts): their fill, m³, in the earth cell beside each
   * bridge end (it is the end of that embankment), and their paving and toe sill, CZK, in the bridge's end cell
   * (the bridge object, as a bill of quantities has it). */
  coneFill?: ArrayLike<number>;
  conePaving?: ArrayLike<number>;
}

/**
 * The bill, per station cell. Global mass-balance items are spread over the cells that cause them:
 * bought fill over the fill volumes, surplus and unsuitable haul over the cut volumes, haul along the
 * route over all volume moved; the surcharge follows the construction cost of each cell.
 */
export function costParts(inp: StationCostInput): CostParts {
  const { n, ds } = inp;
  const parts = Object.fromEntries(PART_KEYS.map((k) => [k, new Float64Array(n)])) as CostParts;
  const cat = CATEGORIES[inp.category];
  const baseRural = basePerKm(inp.category, inp.terrainClass) / 1000;
  const baseUrban = basePerKmUrban(inp.category, inp.terrainClass) / 1000;
  const runLen = new Float64Array(n), tubes = new Float64Array(n);
  const bridge = bridgeModel(cat), divided = dividedRoad(cat);
  for (const r of inp.runs) {
    if (r.kind === KIND.tunnel) {
      const f = cat.tunnelTubes * (r.tubes ?? 1);
      for (let i = r.i0; i <= r.i1; i++) { runLen[i] = r.length; tubes[i] = f; }
    } else if (r.kind === KIND.bridge) {
      for (const [i, variable] of bridgeVariableCosts(bridge, inp.h, ds, r)) parts.bridges[i] = variable;
      parts.bridges[r.i0] += bridge.abutments / 2;
      parts.bridges[r.i1] += bridge.abutments / 2;
      // Wedge excavation regrading the bank under an end span (support-layout), at the class II rate;
      // the small spoil volume is not carried into the mass haul.
      if (r.regradeM3) { parts.bridges[r.i0] += r.regradeM3[0] * EXCAVATION_BY_CLASS.II; parts.bridges[r.i1] += r.regradeM3[1] * EXCAVATION_BY_CLASS.II; }
    }
  }
  if (inp.conePaving) for (let i = 0; i < n; i++) parts.bridges[i] += inp.conePaving[i];
  // volumes per cell
  const cutV = new Float64Array(n), fillV = new Float64Array(n);
  let cut = 0, fill = 0;
  for (let i = 0; i < n; i++) {
    if (inp.kind[i] !== KIND.earth) continue;
    const len = cellLength(i, n, ds);
    cutV[i] = (inp.cutI[i] + inp.cutII[i] + inp.cutIII[i]) * len;
    fillV[i] = inp.fill[i] * len + (inp.coneFill?.[i] ?? 0);
    cut += cutV[i]; fill += fillV[i];
  }
  const h = inp.haul;
  const haulCost = (Math.max(0, h.moment - h.reused * PRICES.freeHaul) / 1000) * PRICES.haulPerM3Km;
  const moved = inp.usable * cut + fill;
  const perCut = cut > 0 ? (h.surplus * SURPLUS_PER_M3) / cut : 0;
  // bought fill (OTSKP 17180) includes its placing: only fill from the route's own cut pays 17110
  const boughtShare = fill > 0 ? Math.min(1, h.deficit / fill) : 0;
  const perFill = boughtShare * PRICES.borrowFill;
  const placingPerFill = (1 - boughtShare) * PRICES.fillPlacing;
  const perMoved = moved > 0 ? haulCost / moved : 0;
  const unsuitablePerCut = (1 - inp.usable) * SURPLUS_PER_M3;
  for (let i = 0; i < n; i++) {
    const len = cellLength(i, n, ds);
    const u = inp.urban ? inp.urban[i] : 0;
    const k = inp.kind[i];
    let construction = 0;
    if (k === KIND.earth) {
      parts.roadBase[i] = len * (baseRural + (baseUrban - baseRural) * u + (inp.extraRoadPerM?.[i] ?? 0));
      parts.excavation[i] = len * (inp.cutI[i] * EXCAVATION_BY_CLASS.I + inp.cutII[i] * EXCAVATION_BY_CLASS.II
        + inp.cutIII[i] * EXCAVATION_BY_CLASS.III);
      parts.fillPlacing[i] = fillV[i] * placingPerFill;
      parts.haul[i] = (inp.usable * cutV[i] + fillV[i]) * perMoved;
      parts.surplusHaul[i] = cutV[i] * perCut;
      parts.unsuitable[i] = cutV[i] * unsuitablePerCut;
      parts.borrow[i] = fillV[i] * perFill;
      parts.topsoil[i] = len * inp.width[i] * PRICES.topsoilDepth * PRICES.topsoil;
      parts.geotechnical[i] = len * (inp.geotechnicalPerM?.[i] ?? 0);
      parts.culverts[i] = inp.culverts?.[i] ?? 0;
      parts.forest[i] = len * inp.width[i] * (inp.forest ? inp.forest[i] : 0) * LAND.forestExtraPerM2;
      construction = parts.roadBase[i];
      for (const key of EARTH_KEYS) construction += parts[key][i];
    } else if (k === KIND.bridge) {
      construction = parts.bridges[i];
    } else {
      const cut = !!inp.cutCover?.[i];
      parts.tunnels[i] = (tubes[i] || cat.tunnelTubes) * (len / 1000) * categoryTunnelPerKm(cat, runLen[i], u, cut);
      // a cut-and-cover pit deeper than the SPK row covers: its top dug and backfilled (earthworks)
      if (cut) parts.excavation[i] = len * cutCoverPitPerM(-inp.h[i], cat.crownWidth);
      construction = parts.tunnels[i] + parts.excavation[i];
    }
    // Railway track, catenary and systems run over bridges and through tunnels as well.
    const everywhere = cat.everywherePerKm;
    if (everywhere && k !== KIND.earth) { parts.roadBase[i] = len * (everywhere.rural + (everywhere.urban - everywhere.rural) * u) / 1000; construction += parts.roadBase[i]; }
    const structure = inp.crossingStructure ? inp.crossingStructure[i] : 0;
    parts.crossings[i] = structure + (inp.crossingLump ? inp.crossingLump[i] : 0);
    parts.noiseWalls[i] = (inp.wallArea ? inp.wallArea[i] : 0) * NOISE.wallPerM2;
    const mk = cat.markup;
    parts.surcharge[i] = (!mk ? construction * surchargeRate(u, divided)
      : k === KIND.earth ? parts.roadBase[i] * mk.base + (construction - parts.roadBase[i]) * mk.earth
        : parts.roadBase[i] * mk.base + (construction - parts.roadBase[i]) * (k === KIND.bridge ? mk.bridge : mk.tunnel)) + structure * structureSurcharge(cat, u);
    parts.land[i] = len * inp.width[i] * landPerM2(u) + (inp.additionalLand?.[i] ?? 0);
    parts.buildings[i] = inp.buildings ? inp.buildings[i] : 0;
    parts.noiseBuyouts[i] = inp.noiseBuyouts ? inp.noiseBuyouts[i] : 0;
  }
  return parts;
}

/** totals of the cells i0…i1 (default: the whole route) */
export function sumParts(parts: CostParts, i0 = 0, i1 = parts.roadBase.length - 1): CostBreakdown {
  const t = {} as Record<PartKey, number>;
  for (const k of PART_KEYS) {
    const a = parts[k];
    let v = 0;
    for (let i = i0; i <= i1; i++) v += a[i];
    t[k] = v;
  }
  const earthDetail = {
    excavation: t.excavation, fillPlacing: t.fillPlacing, haul: t.haul, surplusHaul: t.surplusHaul,
    unsuitable: t.unsuitable, borrow: t.borrow, topsoil: t.topsoil, geotechnical: t.geotechnical, culverts: t.culverts,
  };
  const earthworks = EARTH_KEYS.reduce((a, k) => a + t[k], 0);
  const construction = t.roadBase + earthworks + t.bridges + t.tunnels + t.crossings + t.noiseWalls;
  const land = t.land + t.forest + t.buildings + t.noiseBuyouts;
  return {
    roadBase: t.roadBase, earthworks, earthDetail, bridges: t.bridges, tunnels: t.tunnels, crossings: t.crossings,
    noiseWalls: t.noiseWalls, construction, surcharge: t.surcharge, land,
    landDetail: { land: t.land, forest: t.forest, buildings: t.buildings, noiseBuyouts: t.noiseBuyouts },
    total: construction + t.surcharge + land,
  };
}
