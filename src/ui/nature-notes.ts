// Notes on a stretch card where our works stand in a nature protection area that allows them on conditions
// (a protection zone: the nature authority's consent; a bird area: a Natura assessment). Areas that take no
// works are problems (footprint.ts), not notes. Computed on demand from the result, like the hairpin note.
import { CATEGORIES } from '../core/data/categories';
import { natureHits, natureNote, type NatureHit } from '../core/nature-works';
import { cutCoverMask, KIND } from '../core/structures';
import type { Design, Result } from '../core/evaluate';
import type { Terrain } from '../core/terrain';

let memo: { r: Result; hits: NatureHit[]; motorway: boolean } | null = null;
export function natureNotes(terrain: Terrain, r: Result, d: Design, s0: number, s1: number): string[] {
  if (!terrain.protectedAreas) return [];
  if (memo?.r !== r) {
    const cat = CATEGORIES[d.category], motorway = cat.mode === 'motorway';
    const cutMethod = new Uint8Array(r.n);
    for (const run of r.runs) if (run.kind === KIND.tunnel && run.method === 'cut') cutMethod.fill(1, run.i0, run.i1 + 1);
    const h = Float64Array.from(r.grade, (g, i) => g - r.ground[i]);
    const route = { ...r, crownWidth: cat.crownWidth, cutCover: cutCoverMask(r.kind, r.runs, h, r.ds, cutMethod) };
    memo = { r, motorway, hits: natureHits(route, terrain, motorway).filter(hit => hit.level !== 'ban') };
  }
  // one note per area: what of ours stands in it on this stretch
  const bySite = new Map<number, NatureHit[]>();
  for (const h of memo.hits) if (h.s1 >= s0 && h.s0 <= s1) bySite.set(h.site, [...bySite.get(h.site) ?? [], h]);
  return [...bySite.values()].map(hits => natureNote(terrain, hits, memo!.motorway));
}
