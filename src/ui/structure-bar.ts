// Which structure choice covers a stretch (the inspector highlights it). data-structure: 0 earthwork,
// 1 bridge, 2 tunnel, "clear" = Auto.

import type { StructureOverride } from '../core/overrides';
import type { StationRange } from '../state';

/** which button matches the stretch: one player choice covering all of it, or 'clear' with none at all */
export function activeStructure(range: StationRange, overrides: readonly StructureOverride[] = []): string | null {
  const touching = overrides.filter((o) => o.s1 > range.s0 + 0.5 && o.s0 < range.s1 - 0.5);
  if (!touching.length) return 'clear';
  const kinds = new Set(touching.map((o) => o.kind));
  if (kinds.size !== 1) return null;
  // contiguous cover of the whole stretch by the same kind
  let at = range.s0;
  for (const o of [...touching].sort((a, b) => a.s0 - b.s0)) { if (o.s0 > at + 0.5) return null; at = Math.max(at, o.s1); }
  return at >= range.s1 - 0.5 ? String(touching[0].kind) : null;
}
