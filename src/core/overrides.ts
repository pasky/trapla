import type { BridgeStyle } from './bridge';
// Manual structure ranges use absolute chainage, not station indices, so they survive resampling.
export type StructureKind = 0 | 1 | 2;
/** `method` (tunnels only): 'cut' = cut and cover throughout instead of mined (the default); `style` (bridges
 * only): how the player wants it built (bridge.ts BridgeStyle; absent: Auto's choice). `auto`: only that choice,
 * about whatever structure of that kind Auto builds there: the stretch stays Auto's (not the player's bridge or
 * tunnel: it neither fixes the grade search nor the structure's ends), the method / style applies to it. */
export interface StructureOverride { s0: number; s1: number; kind: StructureKind; method?: 'cut'; style?: BridgeStyle; auto?: true }
/** a structure's own choice: a tunnel's method or a bridge's style */
export type StructureChoice = 'cut' | BridgeStyle;
const STYLES: readonly string[] = ['short', 'long', 'arch'];

/** Paint/erase a half-open range. New paint wins; retain unaffected fragments and merge neighbours. */
export function paintOverride(ranges: readonly StructureOverride[], s0: number, s1: number, kind: StructureKind | null, method?: StructureChoice, auto = false): StructureOverride[] {
  if (!Number.isFinite(s0) || !Number.isFinite(s1) || s1 <= s0 || s0 < 0) return ranges.map((r) => ({ ...r }));
  const out: StructureOverride[] = [];
  for (const r of ranges) {
    if (r.s1 <= s0 || r.s0 >= s1) out.push({ ...r });
    else {
      if (r.s0 < s0) out.push({ ...r, s1: s0 });
      if (r.s1 > s1) out.push({ ...r, s0: s1 });
    }
  }
  const choice = kind === 2 && method === 'cut' ? { method } as const : kind === 1 && method && method !== 'cut' ? { style: method } : undefined;
  // A choice about Auto's structure: where the player painted that structure, it stays theirs (with the choice);
  // elsewhere only the choice (and with none, the stretch is simply Auto's again).
  const own = auto ? ranges.filter(r => !r.auto && r.kind === kind && r.s1 > s0 && r.s0 < s1).map(r => [Math.max(s0, r.s0), Math.min(s1, r.s1)] as const).sort((a, b) => a[0] - b[0]) : [];
  if (kind !== null && auto) {
    let at = s0;
    for (const [a, b] of [...own, [s1, s1] as const]) {
      if (a > at && choice) out.push({ s0: at, s1: a, kind, ...choice, auto: true });
      if (b > a) out.push({ s0: a, s1: b, kind, ...choice });
      at = Math.max(at, b);
    }
  } else if (kind !== null) out.push({ s0, s1, kind, ...choice });
  out.sort((a, b) => a.s0 - b.s0);
  const merged: StructureOverride[] = [];
  for (const r of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === r.kind && prev.method === r.method && prev.style === r.style && prev.auto === r.auto && prev.s1 === r.s0) prev.s1 = r.s1;
    else merged.push(r);
  }
  return merged;
}

/** Missing field is the backwards-compatible automatic design. Reject malformed persisted ranges. */
export function normalizeOverrides(value: unknown): StructureOverride[] {
  if (!Array.isArray(value)) return [];
  let out: StructureOverride[] = [];
  for (const r of value) {
    if (!r || ![0, 1, 2].includes(r.kind)) continue;
    out = paintOverride(out, r.s0, r.s1, r.kind, r.method === 'cut' ? 'cut' : STYLES.includes(r.style) ? r.style : undefined, r.auto === true);
  }
  return out;
}

/** −1 = automatic, 0 = earthwork, 1 = bridge, 2 = tunnel. Half-open except at the route endpoint. */
export function overrideMask(s: ArrayLike<number>, ranges: readonly StructureOverride[] = []): Int8Array {
  const mask = new Int8Array(s.length).fill(-1);
  for (const r of ranges) if (!r.auto) for (let i = 0; i < s.length; i++) {
    if (s[i] >= r.s0 && (s[i] < r.s1 || (i === s.length - 1 && Math.abs(s[i] - r.s1) < 1e-7))) mask[i] = r.kind;
  }
  return mask;
}

/** 1 where the player chose a cut-and-cover tunnel (same ranges as overrideMask) */
export function cutMethodMask(s: ArrayLike<number>, ranges: readonly StructureOverride[] = []): Uint8Array {
  const mask = new Uint8Array(s.length);
  for (const r of ranges) if (r.kind === 2 && r.method === 'cut') for (let i = 0; i < s.length; i++) {
    if (s[i] >= r.s0 && (s[i] < r.s1 || (i === s.length - 1 && Math.abs(s[i] - r.s1) < 1e-7))) mask[i] = 1;
  }
  return mask;
}

/** the bridge style the player chose per station (support-layout STYLE_CODES: 0 none, 1 short, 2 long, 3 arch) */
export function styleMask(s: ArrayLike<number>, ranges: readonly StructureOverride[] = []): Uint8Array {
  const mask = new Uint8Array(s.length);
  for (const r of ranges) if (r.kind === 1 && r.style) for (let i = 0; i < s.length; i++) {
    if (s[i] >= r.s0 && (s[i] < r.s1 || (i === s.length - 1 && Math.abs(s[i] - r.s1) < 1e-7))) mask[i] = STYLES.indexOf(r.style) + 1;
  }
  return mask;
}
