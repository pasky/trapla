// Persisted manual building/wall decisions. Chainage ranges survive station resampling.
/** Non-cryptographic pack identity: prevents persisted positional object IDs from silently referring
 * to different buildings/roads after a data rebuild. Computed once at load, never in evaluate(). */
export function objectDataKey(buildings: unknown, info: unknown, roads: unknown): string {
  const text = JSON.stringify([buildings, info, roads]);
  let a = 2166136261, b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 0x5bd1e995);
  }
  return `${text.length}:${a >>> 0}:${b >>> 0}`;
}
export interface BuildingOverride { j: number; action: 'buy' | 'keep' }
export interface WallOverride { s0: number; s1: number; side: 'L' | 'R'; height: number }

/** Last valid decision wins; unknown building ids can be discarded against the loaded pack. */
export function normalizeBuildingOverrides(value: unknown, buildingCount = Infinity): BuildingOverride[] {
  if (!Array.isArray(value)) return [];
  const out = new Map<number, BuildingOverride>();
  for (const r of value) {
    if (!r || !Number.isSafeInteger(r.j) || r.j < 0 || r.j >= buildingCount || (r.action !== 'buy' && r.action !== 'keep')) continue;
    out.set(r.j, { j: r.j, action: r.action });
  }
  return [...out.values()].sort((a, b) => a.j - b.j);
}

/** Auto (null) erases just this building's decision. */
export function setBuildingOverride(ranges: readonly BuildingOverride[], j: number, action: BuildingOverride['action'] | null): BuildingOverride[] {
  if (!Number.isSafeInteger(j) || j < 0 || (action !== null && action !== 'buy' && action !== 'keep')) return ranges.map(r => ({ ...r }));
  return normalizeBuildingOverrides([...ranges.filter(r => r.j !== j), ...(action === null ? [] : [{ j, action }])]);
}

const wallHeight = (height: number) => Number.isFinite(height) && (height === 0 || (height >= 2 && height <= 6));

/** Paint a half-open range on ONE side, preserving unaffected fragments. Height 0 explicitly
 * removes automatic walls; null restores automatic design, not an explicit zero-height wall. */
export function paintWallOverride(ranges: readonly WallOverride[], s0: number, s1: number,
  side: 'L' | 'R', height: number | null): WallOverride[] {
  if (!Number.isFinite(s0) || !Number.isFinite(s1) || s0 < 0 || s1 <= s0
    || (side !== 'L' && side !== 'R') || (height !== null && !wallHeight(height))) return ranges.map(r => ({ ...r }));
  const out: WallOverride[] = [];
  for (const r of ranges) {
    if (r.side !== side || r.s1 <= s0 || r.s0 >= s1) out.push({ ...r });
    else {
      if (r.s0 < s0) out.push({ ...r, s1: s0 });
      if (r.s1 > s1) out.push({ ...r, s0: s1 });
    }
  }
  if (height !== null) out.push({ s0, s1, side, height });
  out.sort((a, b) => a.side.localeCompare(b.side) || a.s0 - b.s0);
  const merged: WallOverride[] = [];
  for (const r of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.side === r.side && prev.height === r.height && prev.s1 === r.s0) prev.s1 = r.s1;
    else merged.push(r);
  }
  return merged;
}

/** Missing/malformed fields revert to automatic; overlapping valid ranges use last paint wins. */
export function normalizeWallOverrides(value: unknown): WallOverride[] {
  if (!Array.isArray(value)) return [];
  let out: WallOverride[] = [];
  for (const r of value) {
    if (!r || !wallHeight(r.height)) continue;
    out = paintWallOverride(out, r.s0, r.s1, r.side, r.height);
  }
  return out;
}

/** NaN = automatic; 0 = remove; 2…6 = actual built height. Half-open except at the route endpoint. */
export function wallOverrideMasks(s: ArrayLike<number>, ranges: readonly WallOverride[] = []): { L: Float64Array; R: Float64Array } {
  const L = new Float64Array(s.length).fill(NaN), R = new Float64Array(s.length).fill(NaN);
  for (const r of ranges) for (let i = 0; i < s.length; i++) {
    if (s[i] >= r.s0 && (s[i] < r.s1 || (i === s.length - 1 && Math.abs(s[i] - r.s1) < 1e-7))) (r.side === 'L' ? L : R)[i] = r.height;
  }
  return { L, R };
}
