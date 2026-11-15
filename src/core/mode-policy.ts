import type { RouteKind } from './project';
/** Dispatch before resolving road category, speed, AADT, pavement or road-noise defaults. */
export type TransportMode = RouteKind;
export type MissingModeCapability =
  | 'paired-formation' | 'directional-structures' | 'motorway-connections'
  | 'motorway-vertical-and-sight-checks' | 'motorway-operations'
  | 'track-formation-and-clearance' | 'rail-structures-and-connections'
  | 'rail-construction-prices' | 'train-operations-and-noise';
export type ModeCapability =
  | { kind: 'road'; kernel: 'legacy-road'; scoring: true; missing: readonly [] }
  | { kind: 'motorway' | 'railway'; kernel: 'foundation'; scoring: false; missing: readonly MissingModeCapability[] };

/**
 * Foundation availability is deliberately not scored-mode availability. Pure plan geometry,
 * quantity integration or sourced limits do not establish a buildable connected project.
 * Missing capabilities are machine codes; UI wording belongs in terms.ts.
 */
export function modeCapability(kind: TransportMode): ModeCapability {
  switch (kind) {
    case 'road': return { kind, kernel: 'legacy-road', scoring: true, missing: [] };
    case 'motorway': return { kind, kernel: 'foundation', scoring: false, missing: [
      'paired-formation', 'directional-structures', 'motorway-connections',
      'motorway-vertical-and-sight-checks', 'motorway-operations',
    ] };
    case 'railway': return { kind, kernel: 'foundation', scoring: false, missing: [
      'track-formation-and-clearance', 'rail-structures-and-connections',
      'rail-construction-prices', 'train-operations-and-noise',
    ] };
    default: throw new Error(`Unknown transport mode: ${String(kind)}`);
  }
}
