// Automatic structure choice per station: embankment vs bridge, cut vs bored tunnel, followed by
// gap merging and a run-level cost comparison so the result is not confetti.

import { STRUCTURE_RULES } from './data/prices';
import type { Violation } from './checks';

export const KIND = { earth: 0, bridge: 1, tunnel: 2 } as const;

export interface Run { kind: 1 | 2; i0: number; i1: number; s0: number; s1: number; length: number; forced?: boolean }

export interface StructureInput {
  ds: number;
  /** grade minus ground at the centreline, m */
  h: ArrayLike<number>;
  /** cost per metre of the earthwork option at each station */
  earthPerM: ArrayLike<number>;
  /** bridge cost per m: one number, or per station (urban rates and land differ along the route) */
  bridgePerM: number | ArrayLike<number>;
  /** tunnel cost per m (short-tunnel rate; long rate applied in the bill), number or per station */
  tunnelPerM: number | ArrayLike<number>;
  /** stations that must be bridged (river / railway crossings), unless deep in cut */
  forced?: ArrayLike<number>;
  /** −1 = automatic; otherwise KIND. Applied after automatic run decisions, even when invalid. */
  overrides?: ArrayLike<number>;
}


export function chooseStructures(inp: StructureInput, rules = STRUCTURE_RULES): { kind: Uint8Array; runs: Run[]; violations: Violation[] } {
  const n = inp.h.length;
  const kind = new Uint8Array(n);
  const bp = inp.bridgePerM, tp = inp.tunnelPerM;
  const bridgeAt = typeof bp === 'number' ? () => bp : (i: number) => bp[i];
  const tunnelAt = typeof tp === 'number' ? () => tp : (i: number) => tp[i];
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
  // endpoints stay at grade
  kind[0] = 0; kind[n - 1] = 0;
  const gapStations = (m: number) => Math.round(m / inp.ds);
  mergeGaps(kind, KIND.bridge, gapStations(rules.bridgeGapMerge), (i) => inp.h[i] > 0);
  mergeGaps(kind, KIND.tunnel, gapStations(rules.tunnelGapMerge), (i) => inp.h[i] < 0);
  // run-level decision
  const runs: Run[] = [];
  for (const r of findRuns(kind)) {
    const len = (r.i1 - r.i0 + 1) * inp.ds;
    let earth = 0, struct = 0;
    for (let i = r.i0; i <= r.i1; i++) {
      earth += inp.earthPerM[i] * inp.ds;
      struct += (r.kind === KIND.bridge ? bridgeAt(i) : tunnelAt(i)) * inp.ds;
    }
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
    for (let i = 0; i < n; i++) if (inp.overrides[i] >= 0) kind[i] = inp.overrides[i];
    runs.length = 0;
    for (const r of findRuns(kind)) {
      const length = (r.i1 - r.i0 + 1 - (r.i0 === 0 ? 0.5 : 0) - (r.i1 === n - 1 ? 0.5 : 0)) * inp.ds;
      let manual = false, forced = false;
      for (let i = r.i0; i <= r.i1; i++) {
        manual ||= inp.overrides[i] >= 0;
        forced ||= r.kind === KIND.bridge && !!locked[i];
      }
      const min = r.kind === KIND.bridge ? rules.minBridgeLength : rules.minTunnelLength;
      // Paint may split a formerly viable automatic run. Unrequested, unlocked remnants remain
      // automatic: reconsider them rather than forcing the player to repair our leftover pieces.
      if (!manual && !forced) {
        let earth = 0, structure = 0;
        for (let i = r.i0; i <= r.i1; i++) {
          earth += inp.earthPerM[i];
          structure += r.kind === KIND.bridge ? bridgeAt(i) : tunnelAt(i);
        }
        if (length < min || structure >= earth) {
          for (let i = r.i0; i <= r.i1; i++) kind[i] = KIND.earth;
          continue;
        }
      }
      runs.push({ ...r, kind: r.kind as 1 | 2, s0: Math.max(0, (r.i0 - 0.5) * inp.ds), s1: Math.min((n - 1) * inp.ds, (r.i1 + 0.5) * inp.ds), length, forced });
      if (length < min) violations.push({ kind: 'structure', s0: r.i0 * inp.ds, s1: r.i1 * inp.ds,
        msg: `${manual ? 'manual' : 'remaining'} ${r.kind === KIND.bridge ? 'bridge' : 'tunnel'} is ${length.toFixed(0)} m long; minimum ${min} m` });
    }
    const flagRanges = (bad: (i: number) => boolean, msg: string) => {
      for (let i = 0; i < n; i++) {
        if (!bad(i)) continue;
        let j = i;
        while (j + 1 < n && bad(j + 1)) j++;
        violations.push({ kind: 'structure', s0: i * inp.ds, s1: j * inp.ds, msg });
        i = j;
      }
    };
    flagRanges((i) => inp.overrides![i] === KIND.bridge && inp.h[i] < rules.bridgeMinHeight,
      `manual bridge needs at least ${rules.bridgeMinHeight} m above ground`);
    flagRanges((i) => inp.overrides![i] === KIND.tunnel && -inp.h[i] < rules.tunnelMinDepth,
      `manual tunnel needs at least ${rules.tunnelMinDepth} m below ground`);
    flagRanges((i) => !!inp.forced?.[i] && kind[i] !== KIND.bridge,
      'crossing requires a bridge — clear or change the manual structure override');
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
