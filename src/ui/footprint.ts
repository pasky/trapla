// Shared plain-text facts for the profile and bill. Callers escape before inserting HTML.
import type { FootprintConflict } from '../core/footprint';
import { footprintOutcome } from '../core/terms';
import { czk } from './costgroups';

/** Match the affected span, not just the station where the one-off cost is booked. */
export function footprintConflictsInRange(conflicts: readonly FootprintConflict[], s0: number, s1: number): FootprintConflict[] {
  return conflicts.filter(c => c.s0 <= s1 && c.s1 >= s0);
}

export function footprintConflictText(c: FootprintConflict): string {
  const outcome = footprintOutcome(c);
  const bucket = c.action === 'culvert' ? 'Watercourse culverts' : 'Road crossings';
  const cost = c.cost > 0 ? ` — ${czk(c.cost)} (in ${c.action === 'channel-relocation' ? 'Road crossings, its land under Land' : bucket}, before the other-objects surcharge)` : '';
  return `${cap(outcome.tag)}: ${outcome.label}${cost}. ${c.detail || outcome.explain}`;
}

/** Hover text: what is built and where its price comes from. */
export function footprintConflictTitle(c: FootprintConflict): string {
  return `${footprintOutcome(c).explain}${c.source ? ` Priced from: ${c.source}.` : ''}`;
}
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
