// Shared plain-text facts for the profile and bill. Callers escape before inserting HTML.
import type { FootprintConflict } from '../core/footprint';
import { ROAD_CLASSES } from '../core/data/urban';
import { czk } from './costgroups';

/** Match the affected span, not just the station where the one-off cost is booked. */
export function footprintConflictsInRange(conflicts: readonly FootprintConflict[], s0: number, s1: number): FootprintConflict[] {
  return conflicts.filter(c => c.s0 <= s1 && c.s1 >= s0);
}

export function footprintConflictText(c: FootprintConflict): string {
  const feature = c.feature === 'road' ? `${c.cls ? ROAD_CLASSES[c.cls]?.label ?? c.cls : 'road'}${c.roadCode ? ` ${c.roadCode}` : ''}` : c.feature;
  const cost = c.cost > 0 ? ` — ${czk(c.cost)} (included in ${c.action === 'culvert' ? 'culverts' : 'road crossings'}, before surcharge)` : '';
  return `Footprint ${feature}: ${c.action}, ${c.length.toFixed(0)} m${cost}${c.detail ? ` — ${c.detail}` : ''}`;
}
