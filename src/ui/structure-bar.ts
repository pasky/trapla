// "What to build on this stretch" buttons, shared by the floating bar over a profile selection and the
// HUD's selected-stretch box. data-structure: 0 earthwork, 1 bridge, 2 tunnel, "clear" = automatic.

import type { StructureOverride } from '../core/overrides';
import type { StationRange } from '../state';

export const STRUCTURES = [
  { kind: '1', key: 'B', label: 'Bridge', title: 'Build a bridge along the whole stretch' },
  { kind: '2', key: 'T', label: 'Tunnel', title: 'Build a tunnel along the whole stretch' },
  { kind: '0', key: 'E', label: 'Earthwork', title: 'Only cuts and embankments here, even where a bridge or tunnel would be cheaper' },
  { kind: 'clear', key: 'C', label: 'Automatic', title: 'Let the game choose bridge / tunnel / earthwork here again' },
] as const;

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

export function structureButtons(active: string | null = null): string {
  return STRUCTURES.map((s) => `<button data-structure="${s.kind}" class="st-${s.kind}${active === s.kind ? ' on' : ''}" aria-pressed="${active === s.kind}" title="${s.title} (key ${s.key})">${s.label}<kbd>${s.key}</kbd></button>`).join('');
}
