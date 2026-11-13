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
  { id: 'earthworks', label: 'Earthworks', short: 'earth', color: '#d08a3c', keys: ['excavation', 'fillPlacing', 'haul', 'surplusHaul', 'unsuitable', 'borrow', 'topsoil'], of: (c) => c.earthworks },
  { id: 'bridges', label: 'Bridges', short: 'bridges', color: '#2f7fe6', keys: ['bridges'], of: (c) => c.bridges },
  { id: 'tunnels', label: 'Tunnels', short: 'tunnels', color: '#8a5fd0', keys: ['tunnels'], of: (c) => c.tunnels },
  { id: 'crossings', label: 'Road crossings', short: 'crossings', color: '#e0a800', keys: ['crossings'], of: (c) => c.crossings },
  { id: 'noiseWalls', label: 'Noise walls', short: 'noise', color: '#14a3a3', keys: ['noiseWalls'], of: (c) => c.noiseWalls },
  { id: 'surcharge', label: 'Other objects', short: 'other', color: '#b3bcc8', keys: ['surcharge'], of: (c) => c.surcharge },
  { id: 'land', label: 'Land', short: 'land', color: '#8fbf5a', keys: ['land'], of: (c) => c.landDetail.land },
  { id: 'forest', label: 'Forest', short: 'forest', color: '#3f8f4f', keys: ['forest'], of: (c) => c.landDetail.forest },
  { id: 'buildings', label: 'Buildings', short: 'buildings', color: '#d7301f', keys: ['buildings'], of: (c) => c.landDetail.buildings },
];

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
