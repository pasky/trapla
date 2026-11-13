// Automatic structure choice per station: embankment vs bridge, cut vs bored tunnel, followed by
// gap merging and a run-level cost comparison so the result is not confetti.

import { STRUCTURE_RULES } from './data/prices';

export const KIND = { earth: 0, bridge: 1, tunnel: 2 } as const;

export interface Run { kind: 1 | 2; i0: number; i1: number; s0: number; s1: number; length: number }

export interface StructureInput {
  ds: number;
  /** grade minus ground at the centreline, m */
  h: ArrayLike<number>;
  /** cost per metre of the earthwork option at each station */
  earthPerM: ArrayLike<number>;
  bridgePerM: number;
  /** tunnel cost per m (short-tunnel rate; long rate applied in the bill) */
  tunnelPerM: number;
}

export function chooseStructures(inp: StructureInput, rules = STRUCTURE_RULES): { kind: Uint8Array; runs: Run[] } {
  const n = inp.h.length;
  const kind = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const h = inp.h[i];
    if (h >= rules.bridgeMinHeight && inp.bridgePerM < inp.earthPerM[i]) kind[i] = KIND.bridge;
    else if (-h >= rules.tunnelMinDepth && inp.tunnelPerM < inp.earthPerM[i]) kind[i] = KIND.tunnel;
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
    let earth = 0;
    for (let i = r.i0; i <= r.i1; i++) earth += inp.earthPerM[i] * inp.ds;
    const struct = (r.kind === KIND.bridge ? inp.bridgePerM : inp.tunnelPerM) * len;
    const minLen = r.kind === KIND.bridge ? rules.minBridgeLength : rules.minTunnelLength;
    if (len < minLen || struct >= earth) {
      for (let i = r.i0; i <= r.i1; i++) kind[i] = 0;
      continue;
    }
    runs.push({ kind: r.kind as 1 | 2, i0: r.i0, i1: r.i1, s0: (r.i0 - 0.5) * inp.ds, s1: (r.i1 + 0.5) * inp.ds, length: len });
  }
  return { kind, runs };
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
