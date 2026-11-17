// Nature protection areas on the map (data/protected.ts, research/75): each area's border as line layers of the
// land-cover map, drawn over the photo too (landcover.ts NATURE_PASSES): a soft green band with a solid edge
// where no works may go, a dashed edge round a protection zone, a dotted one where works are allowed (a bird
// area, an outer zone of a landscape area). The legend explains them; a problem card names the area.
import { protectedRule, type ProtectedData } from '../core/data/protected';
import type { LineLayer } from './vectorPack';

/** the map's line layers of the areas: `nature-ban` (and its `nature-band`), `nature-zone`, `nature-info` */
export function natureLayers(data: ProtectedData | undefined, motorway = false): LineLayer[] {
  const rings: Record<'nature-ban' | 'nature-zone' | 'nature-info', number[][]> = { 'nature-ban': [], 'nature-zone': [], 'nature-info': [] };
  for (const site of data?.sites ?? []) {
    const level = protectedRule(site, motorway).level;
    const layer = level === 'ban' ? 'nature-ban' : level === 'consent' ? 'nature-zone' : 'nature-info';
    for (const r of site.rings) rings[layer].push([...r, r[0], r[1]]);
  }
  const layer = (name: string, list: number[][]): LineLayer => {
    const starts = new Uint32Array(list.length + 1);
    let n = 0;
    list.forEach((r, k) => { starts[k] = n; n += r.length / 2; });
    starts[list.length] = n;
    const verts = new Float32Array(2 * n);
    let o = 0;
    for (const r of list) { verts.set(r, o); o += r.length; }
    return { name, verts, starts };
  };
  return [layer('nature-band', rings['nature-ban']), layer('nature-ban', rings['nature-ban']),
    layer('nature-zone', rings['nature-zone']), layer('nature-info', rings['nature-info'])];
}
