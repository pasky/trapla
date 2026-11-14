// Cost model (2026 norms + research-informed estimates at original dates, CZK excl. VAT).
// All numbers and provenance come from data/*.ts.
//
// The bill is built per station cell (cell i = the stretch nearest to station i: ds long, half that
// at the two ends), one array per component, so every koruna is attributable along the route and the
// totals are simply the sums of the arrays (`costParts` → `sumParts`).

import { CATEGORIES, type CategoryId, type TerrainClass } from './data/categories';
import { EXCAVATION_BY_CLASS, LAND, NORM_EARTHWORK_ALLOWANCE, PRICES } from './data/prices';
import { NOISE, URBAN_LAND, URBAN_NORM_PER_KM, URBAN_RATES } from './data/urban';
import { KIND, type Run } from './structures';

/** value of the earthworks already included in the SFDI per-km norm, CZK per km */
export function allowanceValuePerKm(cat: CategoryId): number {
  const c = CATEGORIES[cat];
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

/** bored tunnel tube price per km for a tunnel of the given length; `urban` = built-up share 0…1 */
export function tunnelPerKm(length: number, urban = 0): number {
  const long = length > PRICES.tunnelLongThreshold;
  const rural = long ? PRICES.tunnelLongPerKm : PRICES.tunnelShortPerKm;
  const town = long ? URBAN_RATES.tunnelLongPerKm : URBAN_RATES.tunnelShortPerKm;
  return rural + (town - rural) * urban;
}

/** "other objects" surcharge rate for a built-up share 0…1 */
export function surchargeRate(urban: number): number {
  return PRICES.otherObjectsSurcharge + (URBAN_RATES.otherObjectsSurcharge - PRICES.otherObjectsSurcharge) * urban;
}

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
  'roadBase', 'excavation', 'fillPlacing', 'haul', 'surplusHaul', 'unsuitable', 'borrow', 'topsoil',
  'bridges', 'tunnels', 'crossings', 'noiseWalls', 'surcharge', 'land', 'forest', 'buildings', 'noiseBuyouts',
] as const;
export type PartKey = (typeof PART_KEYS)[number];
/** CZK per station cell, one array per cost component; the bill is their sum */
export type CostParts = Record<PartKey, Float64Array>;

const EARTH_KEYS = ['excavation', 'fillPlacing', 'haul', 'surplusHaul', 'unsuitable', 'borrow', 'topsoil'] as const;

export interface CostBreakdown {
  roadBase: number;
  earthworks: number;
  earthDetail: { excavation: number; fillPlacing: number; haul: number; surplusHaul: number; unsuitable: number; borrow: number; topsoil: number };
  bridges: number;
  tunnels: number;
  /** crossings of existing roads: junction / reconnection lump sums and overbridges */
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
  /** built-up share of each cell, 0…1 (urban norm row, urban surcharge, building-land price) */
  urban?: ArrayLike<number>;
  /** section areas at each station, m² (ignored where the station is a structure) */
  cutI: ArrayLike<number>;
  cutII: ArrayLike<number>;
  cutIII: ArrayLike<number>;
  fill: ArrayLike<number>;
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
  /** purchase + demolition of noise-infeasible dwellings outside the footprint, CZK per cell */
  noiseBuyouts?: ArrayLike<number>;
  /** crossings of existing roads: all-in lump sums, CZK per cell */
  crossingLump?: ArrayLike<number>;
  /** crossings of existing roads: overbridges (get the other-objects surcharge), CZK per cell */
  crossingStructure?: ArrayLike<number>;
  /** noise wall surface in each cell (both sides added), m² */
  wallArea?: ArrayLike<number>;
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
  const runLen = new Float64Array(n);
  for (const r of inp.runs) if (r.kind === KIND.tunnel) for (let i = r.i0; i <= r.i1; i++) runLen[i] = r.length;
  // volumes per cell
  const cutV = new Float64Array(n), fillV = new Float64Array(n);
  let cut = 0, fill = 0;
  for (let i = 0; i < n; i++) {
    if (inp.kind[i] !== KIND.earth) continue;
    const len = cellLength(i, n, ds);
    cutV[i] = (inp.cutI[i] + inp.cutII[i] + inp.cutIII[i]) * len;
    fillV[i] = inp.fill[i] * len;
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
      parts.roadBase[i] = len * (baseRural + (baseUrban - baseRural) * u);
      parts.excavation[i] = len * (inp.cutI[i] * EXCAVATION_BY_CLASS.I + inp.cutII[i] * EXCAVATION_BY_CLASS.II
        + inp.cutIII[i] * EXCAVATION_BY_CLASS.III);
      parts.fillPlacing[i] = fillV[i] * placingPerFill;
      parts.haul[i] = (inp.usable * cutV[i] + fillV[i]) * perMoved;
      parts.surplusHaul[i] = cutV[i] * perCut;
      parts.unsuitable[i] = cutV[i] * unsuitablePerCut;
      parts.borrow[i] = fillV[i] * perFill;
      parts.topsoil[i] = len * inp.width[i] * PRICES.topsoilDepth * PRICES.topsoil;
      parts.forest[i] = len * inp.width[i] * (inp.forest ? inp.forest[i] : 0) * LAND.forestExtraPerM2;
      construction = parts.roadBase[i];
      for (const key of EARTH_KEYS) construction += parts[key][i];
    } else if (k === KIND.bridge) {
      construction = parts.bridges[i] = (len / 1000) * cat.bridgePerKm;
    } else {
      construction = parts.tunnels[i] = cat.tunnelTubes * (len / 1000) * tunnelPerKm(runLen[i], u);
    }
    const structure = inp.crossingStructure ? inp.crossingStructure[i] : 0;
    parts.crossings[i] = structure + (inp.crossingLump ? inp.crossingLump[i] : 0);
    parts.noiseWalls[i] = (inp.wallArea ? inp.wallArea[i] : 0) * NOISE.wallPerM2;
    parts.surcharge[i] = (construction + structure) * surchargeRate(u);
    parts.land[i] = len * inp.width[i] * landPerM2(u);
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
    unsuitable: t.unsuitable, borrow: t.borrow, topsoil: t.topsoil,
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
