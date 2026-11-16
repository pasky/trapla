// Small shared UI types. The project store (project-store.ts) owns the design, its history and its saves;
// the old single-road Store that lived here is gone (old saves are migrated by project-persistence.ts).
import type { Design } from './core/evaluate';

export { startDesign } from './core/project-mission';

/** Score compatibility includes both code rules and the ground pack used to price the design. */
export interface Best { cost: number; design: Design; at: string; model?: number; pricingData?: string }

/** a stretch of the route picked for the cost breakdown (stations in metres), or null = whole route */
export interface StationRange { s0: number; s1: number }
