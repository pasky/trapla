// A pack's listed monuments and heritage areas (`heritage.json`, pipeline/build_heritage.py; research/102): from the
// Central List of Cultural Monuments (ÚSKP, Národní památkový ústav, CC BY 4.0). The "Hands off the castle" twist keeps
// clear of them (core/mission-twists.ts picks those near a mission's line, data/twists.ts sets the rings).

/** what a listed monument is, as the twist rings it (pipeline/build_heritage.py KINDS) */
export type MonumentKind = 'castle' | 'fort' | 'church' | 'chapel' | 'cross' | 'memorial' | 'technical';
export const MONUMENT_KINDS: readonly MonumentKind[] = ['castle', 'fort', 'church', 'chapel', 'cross', 'memorial', 'technical'];

export interface HeritageZone {
  /** in the player's words ("Trosky castle protection zone") */
  name: string;
  /** the register's Czech name */
  cz?: string | null;
  /** ÚSKP number */
  code: string;
  url?: string | null;
  /** its polygons in the pack's metres, [x0, y0, x1, y1, …], filled even-odd */
  rings: number[][];
}
export interface HeritageMonument { name: string; kind: MonumentKind; x: number; y: number; code: string; national?: boolean }
export interface HeritageData { version: 1; source: string; zones: HeritageZone[]; monuments: HeritageMonument[] }

export function validHeritageData(d: unknown): d is HeritageData {
  const h = d as HeritageData;
  return !!h && h.version === 1 && Array.isArray(h.zones) && Array.isArray(h.monuments)
    && h.zones.every(z => typeof z?.name === 'string' && Array.isArray(z.rings) && z.rings.every(r => Array.isArray(r) && r.length >= 6 && r.length % 2 === 0))
    && h.monuments.every(m => typeof m?.name === 'string' && MONUMENT_KINDS.includes(m.kind) && Number.isFinite(m.x) && Number.isFinite(m.y));
}

/** a zone's rings as point lists */
export const zoneRings = (z: Pick<HeritageZone, 'rings'>): [number, number][][] =>
  z.rings.map(r => Array.from({ length: r.length / 2 }, (_, k) => [r[2 * k], r[2 * k + 1]] as [number, number]));
