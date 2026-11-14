// Radius editing steps for the on-map curve editor; "largest radius that fits" lives in the core
// (the violation messages use it for their fixes).

import { R_MAX } from '../core/checks';

export { maxRadiusThatFits, R_MAX } from '../core/checks';

export const R_MIN = 20;

/** radii are edited in whole metres, in 5 m steps from 400 m */
export const snapRadius = (r: number) => Math.min(R_MAX, Math.max(R_MIN, r >= 400 ? Math.round(r / 5) * 5 : Math.round(r)));
