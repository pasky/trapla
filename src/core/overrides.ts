// Manual structure ranges use absolute chainage, not station indices, so they survive resampling.
export type StructureKind = 0 | 1 | 2;
export interface StructureOverride { s0: number; s1: number; kind: StructureKind }

/** Paint/erase a half-open range. New paint wins; retain unaffected fragments and merge neighbours. */
export function paintOverride(ranges: readonly StructureOverride[], s0: number, s1: number, kind: StructureKind | null): StructureOverride[] {
  if (!Number.isFinite(s0) || !Number.isFinite(s1) || s1 <= s0 || s0 < 0) return ranges.map((r) => ({ ...r }));
  const out: StructureOverride[] = [];
  for (const r of ranges) {
    if (r.s1 <= s0 || r.s0 >= s1) out.push({ ...r });
    else {
      if (r.s0 < s0) out.push({ ...r, s1: s0 });
      if (r.s1 > s1) out.push({ ...r, s0: s1 });
    }
  }
  if (kind !== null) out.push({ s0, s1, kind });
  out.sort((a, b) => a.s0 - b.s0);
  const merged: StructureOverride[] = [];
  for (const r of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === r.kind && prev.s1 === r.s0) prev.s1 = r.s1;
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
    out = paintOverride(out, r.s0, r.s1, r.kind);
  }
  return out;
}

/** −1 = automatic, 0 = earthwork, 1 = bridge, 2 = tunnel. Half-open except at the route endpoint. */
export function overrideMask(s: ArrayLike<number>, ranges: readonly StructureOverride[] = []): Int8Array {
  const mask = new Int8Array(s.length).fill(-1);
  for (const r of ranges) for (let i = 0; i < s.length; i++) {
    if (s[i] >= r.s0 && (s[i] < r.s1 || (i === s.length - 1 && s[i] === r.s1))) mask[i] = r.kind;
  }
  return mask;
}
