// Our works inside nature protection areas (research/75, data/protected.ts): the ground our road takes there —
// its earthworks, its bridge supports, its tunnel entrances and the open pits of a tunnel dug from above. A bridge
// deck passing over an area and a mined tunnel under it take nothing. Shared by the footprint screen (an area
// that takes no works: a problem) and the stretch card (an area whose works need consent: a note).
import { cutCoverPitHalfWidth } from './cost';
import { protectedName, type ProtectedLevel } from './data/protected';
import { structureFootprints, type FootprintRoute } from './footprint';
import { natureCells } from './protected-raster';
import { KIND } from './structures';
import { STRUCTURE_RULES } from './data/prices';
import type { Violation } from './checks';
import type { Terrain } from './terrain';
import type { FootprintCell } from './footprint-geometry';

/** what of ours stands in the area: earthworks, a bridge pier or end, a tunnel entrance, a tunnel's open pit */
export type NatureWork = 'earth' | 'pier' | 'abutment' | 'portal' | 'pit';
export interface NatureHit {
  site: number; level: ProtectedLevel; work: NatureWork;
  /** first and last station index of the works in it, and the stretch, m */
  i0: number; i1: number; s0: number; s1: number;
  /** ground of the area taken, m² (grid cells) */
  area: number;
  /** a point of the works in it */
  x: number; y: number;
}
export type NatureRoute = Pick<FootprintRoute, 'n' | 'ds' | 's' | 'x' | 'y' | 'tx' | 'ty' | 'kind' | 'grade' | 'dayL' | 'dayR' | 'crownWidth' | 'runs'>
  & { /** 1 = a tunnel cell built cut and cover (structures.ts cutCoverMask) */ cutCover?: ArrayLike<number> };

/** Our works in protection areas, grouped by area and kind of works over adjacent stations. */
export function natureHits(r: NatureRoute, terrain: Terrain, motorway: boolean): NatureHit[] {
  if (!terrain.protectedAreas) return [];
  const cells: (FootprintCell & { work: NatureWork })[] = [];
  for (let i = 0; i < r.n; i++) {
    const shift = i === 0 ? r.ds / 4 : i === r.n - 1 ? -r.ds / 4 : 0;
    const base = { i, s: r.s[i], x: r.x[i] + r.tx[i] * shift, y: r.y[i] + r.ty[i] * shift, tx: r.tx[i], ty: r.ty[i], along: shift ? r.ds / 4 : r.ds / 2 };
    if (r.kind[i] === KIND.earth) cells.push({ ...base, left: r.dayL[i], right: r.dayR[i], work: 'earth' });
    else if (r.kind[i] === KIND.tunnel && r.cutCover?.[i]) {
      const half = cutCoverPitHalfWidth(terrain.heightAt(r.x[i], r.y[i]) - r.grade[i], r.crownWidth);
      cells.push({ ...base, left: half, right: half, work: 'pit' });
    }
  }
  for (const c of structureFootprints(r)) cells.push({ ...c, work: c.structure === 'pier' ? 'pier' : c.structure === 'abutment' ? 'abutment' : 'portal' });
  const groups = new Map<string, { site: number; level: ProtectedLevel; work: NatureWork; byStation: Map<number, { x: number; y: number; count: number }> }>();
  const seen = new Set<string>();
  for (const cell of cells) natureCells(terrain, cell, motorway, ({ x, y, index, site, level }) => {
    const key = `${site}:${cell.work}`;
    if (seen.has(`${key}:${index}`)) return;
    seen.add(`${key}:${index}`);
    let g = groups.get(key);
    if (!g) groups.set(key, g = { site, level, work: cell.work, byStation: new Map() });
    const prev = g.byStation.get(cell.i);
    if (prev) prev.count++; else g.byStation.set(cell.i, { x, y, count: 1 });
  });
  const out: NatureHit[] = [], area = terrain.cell ** 2;
  for (const g of groups.values()) {
    const at = [...g.byStation.keys()].sort((a, b) => a - b);
    for (let k = 0; k < at.length; k++) {
      const i0 = at[k];
      let i1 = i0, count = g.byStation.get(i0)!.count;
      // a support or entrance stands at one station; works over adjacent stations are one stretch
      while (k + 1 < at.length && at[k + 1] <= i1 + 1) { i1 = at[++k]; count += g.byStation.get(i1)!.count; }
      const p = g.byStation.get(i0)!;
      out.push({ site: g.site, level: g.level, work: g.work, i0, i1, s0: Math.max(0, r.s[i0] - r.ds / 2), s1: Math.min(r.s[r.n - 1], r.s[i1] + r.ds / 2),
        area: count * area, x: p.x, y: p.y });
    }
  }
  return out.sort((a, b) => a.s0 - b.s0 || a.site - b.site);
}

const WORK_WORDS: Record<NatureWork, string> = { earth: 'earthworks', pier: 'bridge pier', abutment: 'bridge end', portal: 'tunnel entrance', pit: 'tunnel pit' };
/** "Pod skálou (nature monument)" and what of ours stands there, for a note on a stretch card */
export function natureNote(terrain: Terrain, hit: NatureHit, motorway: boolean): string {
  const areas = terrain.protectedAreas!, site = areas.sites[hit.site], rule = areas.rule(hit.site, motorway);
  return `${hit.work === 'earth' ? 'Our earthworks reach into' : `Our ${WORK_WORDS[hit.work]} ${hit.work === 'pit' ? 'is dug' : 'stands'} in`} ${protectedName(site)}. ${rule.why}`;
}
export { WORK_WORDS as NATURE_WORK_WORDS };

/** The problem of our works in an area that takes none (hits of one area over one stretch, natureHits): what
 * stands where, why, and the way out real designs take (a bridge with no supports in it, a mined tunnel under
 * it, or another line). */
export function natureViolation(terrain: Terrain, hits: readonly NatureHit[], motorway: boolean, routeLength: number): Violation {
  const areas = terrain.protectedAreas!, site = areas.sites[hits[0].site], rule = areas.rule(hits[0].site, motorway);
  const s0 = Math.min(...hits.map(h => h.s0)), s1 = Math.max(...hits.map(h => h.s1)), area = hits.reduce((v, h) => v + h.area, 0);
  const works = new Set(hits.map(h => h.work)), mined = STRUCTURE_RULES.tunnelMinDepth;
  const km = (s: number) => (s / 1000).toFixed(2), a = Math.max(0, s0 - 20), b = Math.min(routeLength, s1 + 20);
  const tunnel = works.has('portal') || works.has('pit');
  const title = works.has('earth') ? `Our earthworks reach into a ${rule.label}` : works.has('pit') ? `Our tunnel is dug from above in a ${rule.label}`
    : `A ${WORK_WORDS[works.has('portal') ? 'portal' : works.has('pier') ? 'pier' : 'abutment']} stands in a ${rule.label}`;
  const fix = works.has('earth')
    ? `Put our road on a bridge from km ${km(a)} to km ${km(b)} with no supports in ${site.name}, take it under in a tunnel at least ${mined} m below the ground, or move the route away from it`
    : tunnel ? `Take the tunnel on past ${site.name}, at least ${mined} m below the ground so it is mined, not dug from above, or move the route away from it`
      : `Make the bridge at km ${km(s0)} long enough to stand clear of ${site.name}, or move the route away from it`;
  const list = [...works].map(w => WORK_WORDS[w]);
  const what = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0];
  return { kind: 'footprint', basis: 'law', s0, s1, title, fix, rule: rule.rule,
    detail: `Our ${what} take${list.length > 1 || works.has('earth') ? '' : 's'} about ${Math.round(area)} m² of ${protectedName(site)}. ${rule.why}` };
}

/** Hits of the same area closer than `gap` m along the route, as one problem each (natureViolation). */
export function natureProblems(terrain: Terrain, hits: readonly NatureHit[], motorway: boolean, routeLength: number, gap = 25): Violation[] {
  const out: Violation[] = [], bySite = new Map<number, NatureHit[]>();
  for (const h of hits) if (h.level === 'ban') { const list = bySite.get(h.site) ?? []; list.push(h); bySite.set(h.site, list); }
  for (const list of bySite.values()) {
    list.sort((p, q) => p.s0 - q.s0);
    let group: NatureHit[] = [];
    for (const h of list) {
      if (group.length && h.s0 > Math.max(...group.map(g => g.s1)) + gap) { out.push(natureViolation(terrain, group, motorway, routeLength)); group = []; }
      group.push(h);
    }
    if (group.length) out.push(natureViolation(terrain, group, motorway, routeLength));
  }
  return out.sort((p, q) => p.s0 - q.s0);
}
