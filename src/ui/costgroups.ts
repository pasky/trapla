// Cost components as shown to the player: the per-station arrays of the bill grouped into a few
// coloured classes shared by the HUD breakdown, the cost strip under the profile and its tooltip.

import type { CostBreakdown, PartKey } from '../core/cost';

export interface CostGroup {
  id: string;
  label: string;
  /** one word for legends */
  short: string;
  color: string;
  keys: PartKey[];
  /** value of the group in a breakdown */
  of: (c: CostBreakdown) => number;
}

/** stacking order of the cost strip, bottom first */
export const COST_GROUPS: CostGroup[] = [
  { id: 'roadBase', label: 'Road (base)', short: 'road', color: '#7b8494', keys: ['roadBase'], of: (c) => c.roadBase },
  { id: 'earthworks', label: 'Earthworks', short: 'earth', color: '#d08a3c', keys: ['excavation', 'fillPlacing', 'haul', 'surplusHaul', 'unsuitable', 'borrow', 'topsoil', 'geotechnical'], of: (c) => c.earthworks - c.earthDetail.culverts },
  { id: 'culverts', label: 'Watercourse culverts', short: 'culverts', color: '#167d9a', keys: ['culverts'], of: (c) => c.earthDetail.culverts },
  { id: 'bridges', label: 'Bridges', short: 'bridges', color: '#2f8fff', keys: ['bridges'], of: (c) => c.bridges },
  { id: 'tunnels', label: 'Tunnels', short: 'tunnels', color: '#a070ff', keys: ['tunnels'], of: (c) => c.tunnels },
  { id: 'crossings', label: 'Road crossings', short: 'crossings', color: '#e0a800', keys: ['crossings'], of: (c) => c.crossings },
  { id: 'noiseWalls', label: 'Noise walls', short: 'noise', color: '#18b0b0', keys: ['noiseWalls'], of: (c) => c.noiseWalls },
  { id: 'surcharge', label: 'Other objects', short: 'other', color: '#b3bcc8', keys: ['surcharge'], of: (c) => c.surcharge },
  { id: 'land', label: 'Land', short: 'land', color: '#8fbf5a', keys: ['land'], of: (c) => c.landDetail.land },
  { id: 'forest', label: 'Forest', short: 'forest', color: '#3f8f4f', keys: ['forest'], of: (c) => c.landDetail.forest },
  { id: 'buildings', label: 'Demolished buildings', short: 'demolished', color: '#4a4f57', keys: ['buildings'], of: (c) => c.landDetail.buildings },
  { id: 'noiseBuyouts', label: 'Bought-out buildings', short: 'bought out', color: '#c43c9b', keys: ['noiseBuyouts'], of: (c) => c.landDetail.noiseBuyouts },
];

/** a railway's bill lines in its own words: its base is track and systems, its markups a price book's */
const RAIL_WORDS: Record<string, { label: string; short: string }> = {
  roadBase: { label: 'Track and systems', short: 'track' },
  surcharge: { label: 'Price-book markups', short: 'markups' },
};
export const groupLabel = (g: CostGroup, line = 'road') => (line === 'railway' ? RAIL_WORDS[g.id]?.label : undefined) ?? g.label;
export const groupShort = (g: CostGroup, line = 'road') => (line === 'railway' ? RAIL_WORDS[g.id]?.short : undefined) ?? g.short;

export function czk(v: number): string {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)} bn CZK`;
  if (a >= 1e7) return `${(v / 1e6).toFixed(0)} M CZK`;
  return `${(v / 1e6).toFixed(1)} M CZK`;
}

/** CZK per metre, compact: 1.2 M, 340k, 900 */
export function perM(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)} M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return v.toFixed(0);
}
