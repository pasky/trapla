// The mapped ground under our line in plain words and a colour each (research/99): the classes of
// pipeline/ground_profiles.json (from the ČGS geological map 1:50,000, GEOCR50) and the engineering-geology zones
// that fill its gaps (IG 1:50,000, `ig_<code>`). Unmapped ground has no name and no band.
import type { GroundProfile } from '../core/ground';

// (muted, away from the profile's own saturated colours: embankment green, cut orange, bridge blue, tunnel violet)
const WORDS: Record<string, [string, string]> = {
  loam: ['loam', '#e4d390'], alluvium: ['river silt and sand', '#d5dbac'], gravel: ['sand and gravel', '#e8cf98'],
  slope: ['stony slope debris', '#cdbf9f'], mixed: ['slope and stream deposits', '#ddd2ad'], peat: ['peat', '#8e7f66'],
  fill: ['made ground', '#b4b0a8'],
  perm_sand: ['sandstone and arkose', '#c4a07f'], perm_congl: ['conglomerate', '#ae8b74'], perm_fine: ['siltstone and claystone', '#a0937f'],
  carb_sand: ['sandstone and conglomerate', '#a9a796'], carb_mixed: ['layered siltstone and sandstone', '#8f8d84'],
  cret_sand: ['sandstone', '#b3bf9c'], marl: ['marlstone', '#c6ccb2'],
  phyllite: ['phyllite and mica schist', '#a79cb3'], gneiss: ['gneiss and schist', '#c2a3aa'], hard: ['quartzite and hard schist', '#a38e8e'],
  carbonate: ['limestone and dolomite', '#9eb1c2'], igneous: ['granite or volcanic rock', '#ad716c'], tuff: ['volcanic tuff', '#c18f87'],
};
/** the IG zones by their code: words of their own, the colour of the class they are priced as (pipeline/geology.py) */
const IG: Record<string, [string, string]> = {
  An: ['made ground', 'fill'], Ft: ['river terrace gravel', 'gravel'], Fn: ['river silt and sand', 'alluvium'],
  Dk: ['stony slope debris', 'slope'], D: ['slope deposits', 'mixed'], P: ['fan deposits', 'mixed'],
  Nk: ['layered sand, gravel and clay', 'gravel'], Ss: ['sandstone and conglomerate', 'carb_sand'], Sj: ['claystone and siltstone', 'perm_fine'],
  Sv: ['limestone and dolomite', 'carbonate'], Sf: ['layered sandstone and shale', 'carb_mixed'], Vk: ['volcanic tuff', 'tuff'],
  Vl: ['hard volcanic rock', 'igneous'], Ih: ['granite-like rock', 'igneous'], Mv: ['gneiss', 'gneiss'], Mn: ['phyllite and slate', 'phyllite'],
};

/** The ground's plain name and colour; null where it is not mapped. */
export function groundWords(p: GroundProfile | undefined): { name: string; color: string } | null {
  if (!p || p.normMix || !p.key) return null;
  const ig = /^ig_(\w+)$/.exec(p.key)?.[1];
  if (ig) { const w = IG[ig]; return w ? { name: w[0], color: WORDS[w[1]]?.[1] ?? '#ccc' } : null; }
  const w = WORDS[p.key];
  return w ? { name: w[0], color: w[1] } : null;
}

/** What a stretch i0…i1 stands on, by share of its length, largest first (unmapped left out): "sandstone 70 %, loam 30 %". */
export function groundShares(geology: { ids: ArrayLike<number>; profiles: readonly GroundProfile[] }, i0: number, i1: number): { name: string; color: string; share: number }[] {
  const by = new Map<string, { name: string; color: string; n: number }>();
  let n = 0;
  for (let i = i0; i <= i1; i++) {
    const w = groundWords(geology.profiles[geology.ids[i]]);
    n++;
    if (!w) continue;
    const e = by.get(w.name) ?? { ...w, n: 0 }; e.n++; by.set(w.name, e);
  }
  return [...by.values()].sort((a, b) => b.n - a.n).map(e => ({ name: e.name, color: e.color, share: e.n / Math.max(1, n) }));
}
