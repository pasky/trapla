// Automatic structure choice per station: embankment vs bridge, cut vs bored tunnel, followed by
// gap merging and a run-level cost comparison so the result is not confetti.

import { STRUCTURE_RULES, TUNNEL_RULES } from './data/prices';
import type { Violation } from './checks';
import type { BridgeArch, BridgeLayout, BridgeStyle } from './bridge';

export const KIND = { earth: 0, bridge: 1, tunnel: 2 } as const;

export interface Run {
  kind: 1 | 2; i0: number; i1: number; s0: number; s1: number; length: number; forced?: boolean;
  /** Obstacle-adjusted support layout; absent means the ordinary equal-span arrangement. */
  layout?: BridgeLayout;
  /** Absolute route chainages of all internal piers, shared by pricing and rendering. */
  pierStations?: number[];
  /** Bank regraded under the first/last span in front of each abutment, m³ (support-layout). */
  regradeM3?: [number, number];
  /** A tunnel: its tubes and escape provision against one tube (cost.ts tunnelTubeFactor), how much of it is
   * cut and cover, m, and 'cut' where the player chose cut and cover throughout (evaluate). */
  tubes?: number; cutCoverM?: number; method?: 'cut';
  /** A bridge: how it is built (absent: short spans), its arch, the price of each style that fits it (as
   * billed, for the card), and whether the player chose the style (support-layout). */
  style?: Exclude<BridgeStyle, 'short'>; arch?: BridgeArch; styles?: Partial<Record<BridgeStyle, number>>; styleChosen?: BridgeStyle;
}

export interface StructureInput {
  ds: number;
  /** grade minus ground at the centreline, m */
  h: ArrayLike<number>;
  /** cost per metre of the earthwork option at each station */
  earthPerM: ArrayLike<number>;
  /** bridge cost per m: one number, or per station (urban rates and land differ along the route) */
  bridgePerM: number | ArrayLike<number>;
  /** Exact whole-run bridge cost incl. abutments, surcharge and land. Initial station costs only
   * seed candidate runs; this callback also rechecks automatic remnants after manual paint. */
  bridgeRunCost?: (i0: number, i1: number, length: number) => number;
  /** tunnel cost per m (short-tunnel rate; long rate applied in the bill), number or per station */
  tunnelPerM: number | ArrayLike<number>;
  /** cut-and-cover tunnel cost per m of its tubes (default: the bored price) */
  cutCoverPerM?: number | ArrayLike<number>;
  /** what else a cut-and-cover station costs per m, whatever the tubes: its pit beyond the priced cover, the
   * buildings over it */
  cutCoverExtraPerM?: ArrayLike<number>;
  /** a tunnel's tubes and escape provision for its length, against one tube (default 1) */
  tunnelFactor?: (length: number) => number;
  /** the bill's price of a tunnel this long against `tunnelPerM` / `cutCoverPerM` (the ≤ 500 m rows): the long
   * rows, a long mined tube's length factor (default 1) */
  tunnelRate?: (length: number, cut: boolean) => number;
  /** 1 = the player chose cut and cover for the tunnel painted here */
  cutMethod?: ArrayLike<number>;
  /** stations that must be bridged (river / railway crossings), unless deep in cut */
  forced?: ArrayLike<number>;
  /** A surface watercourse above a grade a tunnel's height below it keeps a tunnel, not an open cut. */
  forcedTunnel?: ArrayLike<number>;
  /** −1 = automatic; otherwise KIND. Applied after automatic run decisions, even when invalid. */
  overrides?: ArrayLike<number>;
  /** 1 = a higher-ranking road's deck this road rides (its bridge over that road, built and billed
   * there): a bridge in `overrides`, but none of the player's bridge rules apply to it. */
  held?: ArrayLike<number>;
}


/** Stations at each portal that are cut and cover at the least (TUNNEL_RULES.portalCutCoverMin). */
export function portalCells(ds: number, rules = STRUCTURE_RULES): number {
  return Math.max(1, Math.ceil(rules.portalCutCoverMin / ds - 1e-9));
}

/** Is station i of the tunnel i0…i1 cut and cover? Where the cover is too thin to mine (anywhere along it),
 * the first and last `portal` stations (each portal's block), or where the player chose so (`cut`). */
export function cutCoverAt(h: ArrayLike<number>, i0: number, i1: number, i: number, portal: number, cut: boolean, rules = STRUCTURE_RULES): boolean {
  return cut || -h[i] < rules.tunnelMinDepth || i - i0 < portal || i1 - i < portal;
}

/** Cut-and-cover mask over a route's tunnels (1 = cut and cover). */
export function cutCoverMask(kind: ArrayLike<number>, runs: readonly Run[], h: ArrayLike<number>, ds: number, cutMethod?: ArrayLike<number>, rules = STRUCTURE_RULES): Uint8Array {
  const out = new Uint8Array(kind.length), portal = portalCells(ds, rules);
  for (const r of runs) if (r.kind === KIND.tunnel) {
    for (let i = r.i0; i <= r.i1; i++) if (kind[i] === KIND.tunnel && cutCoverAt(h, r.i0, r.i1, i, portal, !!cutMethod?.[i], rules)) out[i] = 1;
  }
  return out;
}

/** the player chose cut and cover for all of the tunnel i0…i1 */
export function allCut(i0: number, i1: number, cutMethod?: ArrayLike<number>): boolean {
  if (!cutMethod) return false;
  for (let i = i0; i <= i1; i++) if (!cutMethod[i]) return false;
  return true;
}

export function chooseStructures(inp: StructureInput, rules = STRUCTURE_RULES): { kind: Uint8Array; runs: Run[]; violations: Violation[] } {
  const n = inp.h.length;
  const kind = new Uint8Array(n);
  const bp = inp.bridgePerM, tp = inp.tunnelPerM, cp = inp.cutCoverPerM ?? tp;
  const bridgeAt = typeof bp === 'number' ? () => bp : (i: number) => bp[i];
  const tunnelAt = typeof tp === 'number' ? () => tp : (i: number) => tp[i];
  const cutCoverPerMAt = typeof cp === 'number' ? () => cp : (i: number) => cp[i];
  const portal = portalCells(inp.ds, rules);
  /** a tunnel i0…i1's whole price: bored where the cover allows, cut and cover elsewhere and at the portals,
   * its tubes times its tubes / escape provision (`cell`: the length of station i's cell) */
  const tunnelRunCost = (i0: number, i1: number, length: number, cell: (i: number) => number) => {
    let tubes = 0, extra = 0;
    const mined = inp.tunnelRate ? inp.tunnelRate(length, false) : 1, cut = inp.tunnelRate ? inp.tunnelRate(length, true) : 1;
    for (let i = i0; i <= i1; i++) {
      const cc = cutCoverAt(inp.h, i0, i1, i, portal, !!inp.cutMethod?.[i], rules);
      tubes += (cc ? cutCoverPerMAt(i) * cut : tunnelAt(i) * mined) * cell(i);
      if (cc && inp.cutCoverExtraPerM) extra += inp.cutCoverExtraPerM[i] * cell(i);
    }
    return tubes * (inp.tunnelFactor ? inp.tunnelFactor(length) : 1) + extra;
  };
  for (let i = 0; i < n; i++) {
    const h = inp.h[i];
    if (h >= rules.bridgeMinHeight && bridgeAt(i) < inp.earthPerM[i]) kind[i] = KIND.bridge;
    else if (-h >= rules.tunnelMinDepth && tunnelAt(i) < inp.earthPerM[i]) kind[i] = KIND.tunnel;
  }
  const locked = new Uint8Array(n);
  if (inp.forced) {
    // a forced crossing is bridged over at least the minimum bridge length, centred on it
    const pad = Math.max(1, Math.ceil((rules.minBridgeLength / inp.ds - 1) / 2));
    for (let i = 0; i < n; i++) {
      if (!inp.forced[i]) continue;
      for (let j = Math.max(1, i - pad); j <= Math.min(n - 2, i + pad); j++) {
        // never lock a "bridge" below ground: the span ends where the terrain rises above the grade
        if (kind[j] !== KIND.tunnel && inp.h[j] > 0) { kind[j] = KIND.bridge; locked[j] = 1; }
      }
    }
  }
  if (inp.forcedTunnel) {
    const pad = Math.ceil((rules.minTunnelLength / inp.ds - 1) / 2);
    for (let i = 0; i < n; i++) if (inp.forcedTunnel[i]) {
      for (let j = Math.max(1, i - pad); j <= Math.min(n - 2, i + pad); j++) {
        if (inp.h[j] <= -rules.portalDepth) { kind[j] = KIND.tunnel; locked[j] = 1; }
      }
    }
  }
  // endpoints stay at grade
  kind[0] = 0; kind[n - 1] = 0;
  const gapStations = (m: number) => Math.round(m / inp.ds);
  mergeGaps(kind, KIND.bridge, gapStations(rules.bridgeGapMerge), (i) => inp.h[i] > 0);
  // (a dip between two tunnels: cut and cover across it, backfilled over, as across a side valley)
  mergeGaps(kind, KIND.tunnel, gapStations(rules.tunnelGapMerge), (i) => inp.h[i] < 0);
  // A tunnel goes on (cut and cover where the cover is too thin to mine) out to its portals, where the
  // ground is about a structure height above the grade: no deep open cut ends at a bare face.
  for (const r of findRuns(kind)) if (r.kind === KIND.tunnel) {
    for (let j = r.i0 - 1; j >= 1 && kind[j] === 0 && -inp.h[j] >= rules.portalDepth; j--) kind[j] = KIND.tunnel;
    for (let j = r.i1 + 1; j <= n - 2 && kind[j] === 0 && -inp.h[j] >= rules.portalDepth; j++) kind[j] = KIND.tunnel;
  }
  mergeGaps(kind, KIND.tunnel, gapStations(rules.tunnelGapMerge), (i) => inp.h[i] < 0);
  // run-level decision
  const runs: Run[] = [];
  const whole = () => inp.ds;
  for (const r of findRuns(kind)) {
    const len = (r.i1 - r.i0 + 1) * inp.ds;
    let earth = 0, struct = 0;
    for (let i = r.i0; i <= r.i1; i++) {
      earth += inp.earthPerM[i] * inp.ds;
      if (r.kind === KIND.bridge) struct += bridgeAt(i) * inp.ds;
    }
    if (r.kind === KIND.tunnel) struct = tunnelRunCost(r.i0, r.i1, len, whole);
    if (r.kind === KIND.bridge && inp.bridgeRunCost) struct = inp.bridgeRunCost(r.i0, r.i1, len);
    const minLen = r.kind === KIND.bridge ? rules.minBridgeLength : rules.minTunnelLength;
    let isLocked = false;
    for (let i = r.i0; i <= r.i1; i++) if (locked[i]) { isLocked = true; break; }
    if (!isLocked && (len < minLen || struct >= earth)) {
      for (let i = r.i0; i <= r.i1; i++) kind[i] = 0;
      continue;
    }
    runs.push({ kind: r.kind as 1 | 2, i0: r.i0, i1: r.i1, s0: (r.i0 - 0.5) * inp.ds, s1: (r.i1 + 0.5) * inp.ds, length: len, forced: isLocked });
  }
  // Manual paint is authoritative: never optimise away or silently extend an invalid request.
  // Rebuild runs for billing, then report the safety constraints rather than repairing the design.
  const violations: Violation[] = [];
  if (inp.overrides && Array.from(inp.overrides).some((k) => k >= 0)) {
    const automatic = kind.slice();
    for (let i = 0; i < n; i++) if (inp.overrides[i] >= 0) kind[i] = inp.overrides[i];
    runs.length = 0;
    for (const r of findRuns(kind)) {
      const length = (r.i1 - r.i0 + 1 - (r.i0 === 0 ? 0.5 : 0) - (r.i1 === n - 1 ? 0.5 : 0)) * inp.ds;
      let manual = false, forced = false, held = true;
      for (let i = r.i0; i <= r.i1; i++) {
        manual ||= inp.overrides[i] >= 0;
        held &&= !!inp.held?.[i];
        forced ||= !!locked[i];
      }
      const min = r.kind === KIND.bridge ? rules.minBridgeLength : rules.minTunnelLength;
      // Paint may split a formerly viable automatic run. Unrequested, unlocked remnants remain
      // automatic: reconsider them rather than forcing the player to repair our leftover pieces.
      if (!manual && !forced) {
        let earth = 0, structure = 0;
        const cellOf = (i: number) => (i === 0 || i === n - 1 ? 0.5 : 1) * inp.ds;
        for (let i = r.i0; i <= r.i1; i++) {
          earth += inp.earthPerM[i] * cellOf(i);
          if (r.kind === KIND.bridge) structure += bridgeAt(i) * cellOf(i);
        }
        if (r.kind === KIND.tunnel) structure = tunnelRunCost(r.i0, r.i1, length, cellOf);
        if (r.kind === KIND.bridge && inp.bridgeRunCost) structure = inp.bridgeRunCost(r.i0, r.i1, length);
        if (length < min || structure >= earth) {
          for (let i = r.i0; i <= r.i1; i++) kind[i] = KIND.earth;
          continue;
        }
      }
      runs.push({ ...r, kind: r.kind as 1 | 2, s0: Math.max(0, (r.i0 - 0.5) * inp.ds), s1: Math.min((n - 1) * inp.ds, (r.i1 + 0.5) * inp.ds), length, forced });
      // Do not turn an existing clipped crossing bridge into a new violation merely because
      // the player painted an unrelated range. Validate manual runs and fragments paint shortened.
      const shortened = (r.i0 > 0 && automatic[r.i0 - 1] === r.kind) || (r.i1 + 1 < n && automatic[r.i1 + 1] === r.kind);
      if (length < min && (manual || shortened) && !held) violations.push({ kind: 'structure', s0: r.i0 * inp.ds, s1: r.i1 * inp.ds,
        title: `${manual ? 'Your' : 'Remaining'} ${r.kind === KIND.bridge ? 'bridge' : 'tunnel'} is too short`,
        fix: `Extend it to the ${min} m minimum (now ${length.toFixed(0)} m), or set the stretch back to Automatic`,
        basis: 'game', rule: `Game rule: a bridge or tunnel is at least ${min} m long`,
        detail: 'Your choice stays as you made it and is priced; the game does not extend it for you.' });
      // A tunnel the player chose, starting in a cut deeper than any Czech portal's: where it would end as Auto builds it
      if (r.kind === KIND.tunnel && manual && !held) for (const [end, step] of [[r.i0, -1], [r.i1, 1]] as const) {
        if (-inp.h[end] <= TUNNEL_RULES.maxPortalCut) continue;
        let j = end;
        while (j + step > 0 && j + step < n - 1 && -inp.h[j + step] >= rules.portalDepth) j += step;
        violations.push({ kind: 'structure', s0: end * inp.ds, s1: end * inp.ds, title: 'A tunnel entrance stands in a very deep cut',
          fix: `Extend the tunnel to km ${(j * inp.ds / 1000).toFixed(2)}, where the ground is ${rules.portalDepth} m above the road, or set it back to Automatic`,
          basis: 'game', rule: `Game rule: the cut in front of a tunnel is at most ${TUNNEL_RULES.maxPortalCut} m deep (the deepest Czech ones: D0 Komořany 30 m, Mrázovka 27 m)`,
          detail: `Here it is ${(-inp.h[end]).toFixed(0)} m deep. A tunnel usually goes on, built from a pit that is filled in again, to where only its own height of cut is left.` });
      }
    }
    const flagRanges = (bad: (i: number) => boolean, title: string, fix: string, rule: string) => {
      for (let i = 0; i < n; i++) {
        if (!bad(i)) continue;
        let j = i;
        while (j + 1 < n && bad(j + 1)) j++;
        violations.push({ kind: 'structure', s0: i * inp.ds, s1: j * inp.ds, title, fix, rule, basis: 'game' });
        i = j;
      }
    };
    flagRanges((i) => inp.overrides![i] === KIND.bridge && !inp.held?.[i] && inp.h[i] < rules.bridgeMinHeight,
      'Your bridge is too close to the ground', `Raise the road to at least ${rules.bridgeMinHeight} m above ground, or shorten the bridge / set it back to Automatic`,
      `Bridges you choose need ${rules.bridgeMinHeight} m of height (game simplification)`);
    flagRanges((i) => inp.overrides![i] === KIND.tunnel && -inp.h[i] < rules.portalDepth,
      'Your tunnel has too little cover', `Lower the road to at least ${rules.portalDepth} m below ground, or shorten the tunnel / set it back to Automatic`,
      `A tunnel needs the ground at least ${rules.portalDepth} m above the road, its own height (game simplification)`);
    const deepest = rules.portalDepth + TUNNEL_RULES.cutCoverMaxCover;
    flagRanges((i) => inp.overrides![i] === KIND.tunnel && !!inp.cutMethod?.[i] && -inp.h[i] > deepest + 1e-9,
      'Too deep to dig from above', `Choose Mined, or raise the road to at most ${deepest} m below ground`,
      `Cut and cover is dug from the surface, with at most ${TUNNEL_RULES.cutCoverMaxCover} m of ground over the tunnel`);
    flagRanges((i) => !!inp.forcedTunnel?.[i] && inp.overrides![i] >= 0 && kind[i] !== KIND.tunnel,
      'A stream needs our road in a tunnel here', 'Set this stretch back to Automatic, or keep a tunnel under the stream',
      'Game rule: an open cutting cannot cut through a stream');
    flagRanges((i) => !!inp.forced?.[i] && inp.overrides![i] >= 0 && kind[i] !== KIND.bridge,
      'A bridge is needed here', 'Set this stretch back to Automatic (or Bridge), or choose "Our bridge over it" for the crossed road',
      'Game rule: rivers, railways and roads that must be crossed at a different level cannot be buried under earthworks');
  }
  // cut and cover chosen for Auto's tunnel (overrides.ts `auto`): as deep as it can be dug, as for the player's own
  const cut = inp.cutMethod;
  if (cut && cut.length && Array.prototype.some.call(cut, (v: number) => v === 1)) {
    const deepest = rules.portalDepth + TUNNEL_RULES.cutCoverMaxCover;
    const bad = (j: number) => kind[j] === KIND.tunnel && !!cut[j] && !(inp.overrides && inp.overrides[j] >= 0) && -inp.h[j] > deepest + 1e-9;
    for (let i = 0; i < n; i++) {
      if (!bad(i)) continue;
      let j = i;
      while (j + 1 < n && bad(j + 1)) j++;
      violations.push({ kind: 'structure', s0: i * inp.ds, s1: j * inp.ds, title: 'Too deep to dig from above', basis: 'game',
        fix: `Choose Mined, or raise the road to at most ${deepest} m below ground`,
        rule: `Cut and cover is dug from the surface, with at most ${TUNNEL_RULES.cutCoverMaxCover} m of ground over the tunnel` });
      i = j;
    }
  }
  return { kind, runs, violations };
}

function mergeGaps(kind: Uint8Array, k: number, maxGap: number, ok: (i: number) => boolean) {
  const n = kind.length;
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (kind[i] !== k) continue;
    if (last >= 0 && i - last - 1 > 0 && i - last - 1 <= maxGap) {
      let all = true;
      for (let j = last + 1; j < i; j++) if (kind[j] !== 0 || !ok(j)) { all = false; break; }
      if (all) for (let j = last + 1; j < i; j++) kind[j] = k;
    }
    last = i;
  }
}

export function findRuns(kind: Uint8Array): { kind: number; i0: number; i1: number }[] {
  const out: { kind: number; i0: number; i1: number }[] = [];
  let i = 0;
  while (i < kind.length) {
    if (kind[i] === 0) { i++; continue; }
    const k = kind[i];
    let j = i;
    while (j + 1 < kind.length && kind[j + 1] === k) j++;
    out.push({ kind: k, i0: i, i1: j });
    i = j + 1;
  }
  return out;
}
