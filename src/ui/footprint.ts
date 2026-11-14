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
  const bucket = c.action === 'culvert' ? 'culverts' : c.action === 'relocation' ? 'road crossings' : 'footprint works under crossings';
  const costNote = c.action === 'channel-relocation'
    ? 'total includes land and construction before surcharge; construction under Road crossings, land under Land without surcharge'
    : `included in ${bucket}, before surcharge`;
  const cost = c.cost > 0 ? ` — ${czk(c.cost)} (${costNote})` : '';
  const action = c.action === 'retaining-wall' ? 'retaining wall' : c.action === 'channel-relocation' ? 'channel relocation' : c.action;
  return `Footprint ${feature}: ${action}, ${c.length.toFixed(0)} m${cost}${c.detail ? ` — ${c.detail}` : ''}`;
}
