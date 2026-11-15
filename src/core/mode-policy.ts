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
  /** Paired D 27.5 corridor: one spine evaluation with motorway norms/junction rules/noise (M1). */
  | { kind: 'motorway'; kernel: 'paired-corridor'; scoring: true; missing: readonly [] }
  /** New conventional electrified line: track rules, SPOŽES prices, CNOSSOS-EU train noise (M1). */
  | { kind: 'railway'; kernel: 'conventional-rail'; scoring: true; missing: readonly [] };

/**
 * Foundation availability is deliberately not scored-mode availability. Pure plan geometry,
 * quantity integration or sourced limits do not establish a buildable connected project.
 * Missing capabilities are machine codes; UI wording belongs in terms.ts.
 */
export function modeCapability(kind: TransportMode): ModeCapability {
  switch (kind) {
    case 'road': return { kind, kernel: 'legacy-road', scoring: true, missing: [] };
    // Vertical radii/grade are PROVISIONAL older-edition rows (data/norms.ts), as for roads; ends are
    // scenario ports (no interchange modelled), so other connections stay unpriced (project-motorway.ts).
    case 'motorway': return { kind, kernel: 'paired-corridor', scoring: true, missing: [] };
    case 'railway': return { kind, kernel: 'conventional-rail', scoring: true, missing: [] };
    default: throw new Error(`Unknown transport mode: ${String(kind)}`);
  }
}
