// Instant provisional long profile while the worker is still evaluating a drag: the moved
// route's stations and ground, with the previous result's grade line stretched to the new length
// (Automatic) or the player's own height points (By hand). Display only, never billed.
import { buildAlignment, station, type Vec2 } from '../core/horizontal';
import { horizontalRules, speedNorms } from '../core/data/norms';
import { buildProfile, elevations, type VPI } from '../core/vertical';
import { normalizeVpis, type Design } from '../core/evaluate';

export interface ProvisionalProfile { s: Float64Array; ground: Float64Array; grade: Float64Array; ds: number; length: number }

/** `previous`: the last evaluated result (its length and final VPIs). Same 10 m stationing as evaluate. */
export function provisionalProfile(a: Vec2, b: Vec2, d: Design, previous: { length: number; vpis: readonly VPI[] },
  heightAt: (x: number, y: number) => number): ProvisionalProfile {
  const al = buildAlignment(a, b, d.pis, horizontalRules(d.speed)), st = station(al, 10);
  const n = st.n, L = al.length, ground = new Float64Array(n);
  for (let i = 0; i < n; i++) ground[i] = heightAt(st.x[i], st.y[i]);
  const zA = ground[0], zB = ground[n - 1], scale = L / (previous.length || L);
  const vpis = d.profileMode === 'manual' && d.vpis.length >= 2 ? normalizeVpis(d.vpis, L, zA, zB)
    : previous.vpis.map((v, k, all) => k === 0 ? { ...v, s: 0, z: zA } : k === all.length - 1 ? { ...v, s: L, z: zB } : { ...v, s: v.s * scale });
  const norms = speedNorms(d.speed);
  return { s: st.s, ground, grade: elevations(buildProfile(vpis, norms.minCrestRadius, norms.minSagRadius), st.s), ds: st.ds, length: L };
}
