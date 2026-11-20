// Which sea a place drains to: a pack's `basins.json` (pipeline/build_basins.py, the official 1st-order basins of
// DIBAVOD A10, research/100), local metres. One basin under the whole map has no rings.
export type Sea = 'north' | 'baltic' | 'black';
export interface BasinData { version: 1; source: string; origin?: [number, number]; size?: [number, number]; basins: { sea: Sea; river: string; rings: number[][] }[] }

export const SEA_NAME: Record<Sea, string> = { north: 'the North Sea', baltic: 'the Baltic', black: 'the Black Sea' };

export function validBasins(data: unknown): data is BasinData {
  const d = data as BasinData;
  return !!d && d.version === 1 && Array.isArray(d.basins) && d.basins.every(b => !!b && b.sea in SEA_NAME && Array.isArray(b.rings)
    && b.rings.every(r => Array.isArray(r) && r.length % 2 === 0 && r.every(v => typeof v === 'number')));
}

/** the sea (x, y) drains to; null outside every basin (Poland is not mapped) */
export function seaAt(data: BasinData, x: number, y: number): Sea | null {
  if (data.basins.length === 1 && !data.basins[0].rings.length) return data.basins[0].sea;
  for (const b of data.basins) {
    let inside = false; // even-odd over all its rings (holes included)
    for (const ring of b.rings) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return b.sea;
  }
  return null;
}

/** the card line where a tunnel's or cut's two ends (km `s0`, `s1`) drain to different seas, else null */
export function watershedLine(data: BasinData, a: { x: number; y: number; s: number }, b: { x: number; y: number; s: number }): string | null {
  const sa = seaAt(data, a.x, a.y), sb = seaAt(data, b.x, b.y);
  if (!sa || !sb || sa === sb) return null;
  const km = (s: number) => (s / 1000).toFixed(2);
  return `Its ends drain to different seas: rain at its km ${km(a.s)} end runs to ${SEA_NAME[sa]}, at its km ${km(b.s)} end to ${SEA_NAME[sb]}.`;
}
