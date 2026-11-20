// An existing railway carried over our road on a new bridge, our road in a cutting under it (research/105): how deep
// under the rails our road must be, which way the railway runs where we cross it, and what the bridge costs.
import { CATEGORIES, type CategoryId } from './data/categories';
import { RAIL_OVER, SPOZES } from './data/railway';
import { RETAINING_RULES } from './data/remedies';
import type { Terrain } from './terrain';
import * as dm from './detmath';

type Category = (typeof CATEGORIES)[CategoryId];
/** The traffic space's height class of our road (RAIL_OVER.clearance), none for a railway of ours. */
function clearanceClass(cat: Pick<Category, 'roadClass'>): string | undefined {
  switch (cat.roadClass) {
    case 'motorway': case 'motorway-carriageway': case 'divided': case 'divided-carriageway': return 'motorway';
    case 'rail': return undefined;
    default: return cat.roadClass;
  }
}
/** How far our road's surface must lie under the top of the rails for the railway to pass over it on its own bridge:
 * the traffic space, the safety gap and the bridge's construction depth, m (undefined: our line is a railway). */
export function railUnderDepth(cat: Pick<Category, 'roadClass'>): number | undefined {
  const k = clearanceClass(cat), c = k === undefined ? undefined : RAIL_OVER.clearance[k];
  return c === undefined ? undefined : c + RAIL_OVER.safetyGap + RAIL_OVER.depth;
}

/** The mapped railway's direction near (x, y): the principal axis of its raster cells within `r` m (undefined: too
 * few of them to tell). */
export function railDirection(terrain: Terrain, x: number, y: number, r = 30): { tx: number; ty: number } | undefined {
  const c = terrain.cell;
  let n = 0, mx = 0, my = 0, sxx = 0, syy = 0, sxy = 0;
  for (let dy = -r; dy <= r; dy += c) for (let dx = -r; dx <= r; dx += c) {
    if (dx * dx + dy * dy > r * r || terrain.crossing(x + dx, y + dy) !== 2) continue;
    n++; mx += dx; my += dy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  if (n < 3) return undefined;
  mx /= n; my /= n; sxx = sxx / n - mx * mx; syy = syy / n - my * my; sxy = sxy / n - mx * my;
  const a = 0.5 * dm.atan2(2 * sxy, sxx - syy);
  return { tx: dm.cos(a), ty: dm.sin(a) };
}

export interface RailOverPrice {
  /** the bridge's length along the railway (its abutments at our crown's edges), its width, its area, m, m² */
  span: number; width: number; area: number;
  /** the new bridge (H01 or H02 with the bridges mark-up) and the provisional bridge the trains use meanwhile (H07), CZK */
  bridge: number; provisional: number; cost: number;
  tracks: 1 | 2; code: string;
}
/** What carrying the railway over our road costs: a bridge as long, along the railway, as the opening it spans across
 * our road is wide (`opening`: between its abutments, our cutting's walls; `sine`: of the angle between the two lines),
 * as wide as its tracks need (RAIL_OVER). */
export function railOverPrice(opening: number, sine: number, tracks: 1 | 2): RailOverPrice {
  const span = opening / Math.max(0.3, Math.abs(sine)), width = RAIL_OVER.deckWidth[tracks], area = span * width;
  const long = span > RAIL_OVER.longFrom, rate = long ? RAIL_OVER.longPerM2 : RAIL_OVER.perM2;
  const bridge = area * rate * (1 + SPOZES.markup.bridges), provisional = area * RAIL_OVER.provisionalPerM2;
  return { span, width, area, bridge, provisional, cost: bridge + provisional, tracks, code: `SPOŽES 2026 ${long ? 'H02' : 'H01'} + H07` };
}

/** The player's choice at a mapped railway's crossing: where our road crossed it then, and how. */
export interface RailChoice { x: number; y: number; choice: 'bridge' | 'overbridge' }
/** A choice holds for the crossing nearest it within this far (our road crosses the railway elsewhere once its line
 * moves), m. Engine bound. */
export const RAIL_CHOICE_REACH = 150;
/** A mapped railway's crossing of our line: its raster samples, the rail level (their highest ground), which way it
 * runs, and how it is crossed: `bridge` our bridge over it (as ever: a floor under our grade), `under` the railway on
 * its new bridge over our cutting (the player's choice), `auto` either, Auto's (the grade search weighs `price`). */
export interface RailRun {
  x0: number; x1: number; s: number; x: number; y: number; g: number;
  tx: number; ty: number; sine: number; tracks: 1 | 2;
  mode: 'bridge' | 'auto' | 'under';
  /** our road's surface at least this far under the rails to pass under (railUnderDepth) */
  below?: number; price?: RailOverPrice;
  /** the player's choice that holds here */
  chosen?: RailChoice['choice'];
  samples: { x: number; y: number; at: number; stations: number[]; g: number; item?: { s: number; g: number; need: number; what: string; below?: number } }[];
}
/** The railway crossings of a line from its raster samples (in chainage order; adjacent within `gap`). */
export function railCrossingRuns(samples: RailRun['samples'], st: { n: number; s: ArrayLike<number>; tx: ArrayLike<number>; ty: ArrayLike<number> },
  terrain: Terrain, cat: Pick<Category, 'roadClass' | 'crownWidth'>, choices: readonly RailChoice[], gap = 5, spacing = 2.5): RailRun[] {
  const runs: RailRun[] = [], below = railUnderDepth(cat), sorted = [...samples].sort((p, q) => p.at - q.at);
  let group: RailRun['samples'] = [];
  const close = () => {
    if (!group.length) return;
    const x0 = group[0].at, x1 = group[group.length - 1].at, mid = group[Math.floor(group.length / 2)];
    const ds = st.n > 1 ? st.s[1] - st.s[0] : 1, i = Math.max(0, Math.min(st.n - 1, Math.round(mid.at / ds)));
    const dir = railDirection(terrain, mid.x, mid.y) ?? { tx: -st.ty[i], ty: st.tx[i] };
    const sine = Math.abs(st.tx[i] * dir.ty - st.ty[i] * dir.tx);
    // (the band's width across the railway: the samples' extent and one sample's spacing)
    const tracks: 1 | 2 = (x1 - x0 + spacing) * Math.max(0.3, sine) > RAIL_OVER.doubleBand ? 2 : 1;
    const eligible = below !== undefined && x1 - x0 <= RAIL_OVER.maxRun && sine >= RAIL_OVER.minSine;
    runs.push({ x0, x1, s: (x0 + x1) / 2, x: mid.x, y: mid.y, g: Math.max(...group.map(p => p.g)), tx: dir.tx, ty: dir.ty, sine, tracks,
      // (as the grade search weighs it: its abutments where our cutting's walls stand nearest our crown)
      mode: eligible ? 'auto' : 'bridge', ...(eligible ? { below, price: railOverPrice(cat.crownWidth + 2 * RETAINING_RULES.minimumOffset, sine, tracks) } : {}), samples: group });
    group = [];
  };
  for (const p of sorted) {
    if (group.length && p.at - group[group.length - 1].at > gap) close();
    group.push(p);
  }
  close();
  // each choice holds for the crossing nearest it (within RAIL_CHOICE_REACH)
  for (const c of choices) {
    let run: RailRun | undefined, best = RAIL_CHOICE_REACH;
    for (const r of runs) { const d = Math.hypot(c.x - r.x, c.y - r.y); if (d <= best) { best = d; run = r; } }
    if (!run) continue;
    run.chosen = c.choice;
    if (c.choice === 'bridge') { run.mode = 'bridge'; delete run.below; }
    else if (run.price) run.mode = 'under';
  }
  return runs;
}

/** The stations where our crown passes under a railway carried over us (our grade at least `below` under its rails
 * there, `grade` per station): there its raster cells under our crown are on its bridge, no feature for our works. */
export function railCarriedMask(runs: readonly RailRun[], grade: ArrayLike<number>, st: { n: number; s: ArrayLike<number> }, crownWidth: number): Uint8Array | undefined {
  let mask: Uint8Array | undefined;
  const n = st.n, ds = n > 1 ? st.s[1] - st.s[0] : 1;
  for (const r of runs) if (passesUnder(r, grade, st)) {
    // (the stations under the bridge: the run, and as far again as our crown's half reaches along an oblique railway)
    const reach = crownWidth / 2 * Math.sqrt(Math.max(0, 1 - r.sine * r.sine)) / Math.max(0.3, r.sine) + ds;
    mask ??= new Uint8Array(n);
    for (let i = Math.max(0, Math.floor((r.x0 - reach) / ds)); i <= Math.min(n - 1, Math.ceil((r.x1 + reach) / ds)); i++) mask[i] = 1;
  }
  return mask;
}
/** Our grade passes under the railway's new bridge (not our bridge over it): at least `below` under the rails at each of
 * its samples (the one decision the bill, the card, the screens and the problems read). */
export function passesUnder(r: RailRun, grade: ArrayLike<number>, st: { n: number; s: ArrayLike<number> }): boolean {
  if (r.mode === 'bridge' || r.below === undefined) return false;
  const ds = st.n > 1 ? st.s[1] - st.s[0] : 1;
  return r.samples.every(p => {
    const f = Math.max(0, Math.min(st.n - 1 - 1e-9, p.at / ds)), j = Math.floor(f), t = f - j;
    return grade[j] * (1 - t) + grade[Math.min(st.n - 1, j + 1)] * t <= p.g - r.below! + 1e-3;
  });
}

/** How our road crosses a mapped railway, as built (Result.railCrossings). */
export interface RailCrossing {
  s: number; i: number; x: number; y: number; tx: number; ty: number;
  /** rail level; our grade's height over it there (negative: under it), m */
  g: number; above: number;
  /** `railway`: carried over us on its new bridge (billed here); `ours`: our bridge over it or our tunnel under it;
   * `missed`: neither (a problem) */
  how: 'railway' | 'ours' | 'missed';
  /** Auto chose (else the player's choice `chosen`); passing under was an option (`price`, `below`) */
  auto: boolean; chosen?: 'bridge' | 'overbridge'; below?: number; price?: RailOverPrice; tracks: 1 | 2; sine: number;
  /** what this crossing bills (the railway's bridge where it carries the railway), CZK */
  cost: number;
}
/** Each railway crossing as the finished line builds it; `kindAt` our structure at a station (KIND: 1 bridge, 2 tunnel);
 * `opening` our cutting's width there (its walls': what the railway's bridge spans, billed and drawn). */
export function railCrossingsBuilt(runs: readonly RailRun[], grade: ArrayLike<number>, st: { n: number; s: ArrayLike<number> }, kindAt: (i: number) => number, need: number,
  opening: (i: number) => number): RailCrossing[] {
  const ds = st.n > 1 ? st.s[1] - st.s[0] : 1;
  return runs.map(r => {
    const i = Math.max(0, Math.min(st.n - 1, Math.round(r.s / ds))), f = Math.max(0, Math.min(st.n - 1 - 1e-9, r.s / ds)), j = Math.floor(f), t = f - j;
    // (our tunnel under it needs no bridge of the railway's)
    const above = grade[j] * (1 - t) + grade[Math.min(st.n - 1, j + 1)] * t - r.g, tunnel = kindAt(i) === 2, under = !tunnel && passesUnder(r, grade, st);
    const how: RailCrossing['how'] = under ? 'railway' : kindAt(i) === 1 && above >= need - 1e-6 || tunnel ? 'ours' : 'missed';
    const price = under ? railOverPrice(opening(i), r.sine, r.tracks) : r.price;
    return { s: r.s, i, x: r.x, y: r.y, tx: r.tx, ty: r.ty, g: r.g, above, how, auto: r.mode === 'auto', ...(r.chosen ? { chosen: r.chosen } : {}),
      ...(r.below !== undefined ? { below: r.below } : {}), ...(price ? { price } : {}), tracks: r.tracks, sine: r.sine, cost: under ? price!.cost : 0 };
  });
}
