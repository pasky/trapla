// Czech records open to traffic in November 2026 (research/97): a bridge or tunnel of the player's own that goes past
// one gets one grey line on its card, said as a fact. Each compares above the larger of the published figures.
import type { OurLine } from '../terms';

export interface RecordRung { piece: 'bridge' | 'tunnel'; measure: 'length' | 'height'; lines: readonly OurLine[]; above: number; line: string }

export const RECORDS: readonly RecordRung[] = [
  // one tube (each direction is its own tunnel); Panenská, D8: 2,168 m left tube (ŘSD), 2,100 m operating length
  { piece: 'tunnel', measure: 'length', lines: ['motorway'], above: 2168, line: 'Longer than any motorway tunnel open in Czechia (Panenská, D8, about 2.2 km).' },
  // (Prague's Blanka is three linked tunnels, its longest 3,090 m: research/97)
  { piece: 'tunnel', measure: 'length', lines: ['road'], above: 2168, line: 'Longer than any road tunnel open in Czechia outside Prague (Panenská, D8, about 2.2 km).' },
  { piece: 'tunnel', measure: 'length', lines: ['railway'], above: 4150, line: 'Longer than any railway tunnel open in Czechia (Ejpovice, about 4.2 km).' },
  // Radotín, D0: 2,291 m (Český rozhlas 2025; Mapy 2,281 m)
  { piece: 'bridge', measure: 'length', lines: ['road', 'motorway'], above: 2291, line: 'Longer than any road bridge open in Czechia (Radotín, D0, about 2.3 km).' },
  // the Negrelli viaduct: 1,100 / 1,110 / 1,120 m
  { piece: 'bridge', measure: 'length', lines: ['railway'], above: 1120, line: 'Longer than any railway bridge in Czechia (the Negrelli viaduct, Prague, about 1.1 km).' },
  // Žďákov: 90 m above the valley floor, "dosud nejvyšším mostem v ČR" (the I/27 Plasy bridge opens in 2028)
  { piece: 'bridge', measure: 'height', lines: ['road', 'motorway', 'railway'], above: 90, line: 'Higher above its valley than any bridge open in Czechia (Žďákov, about 90 m).' },
];

/** The one record line a structure earns (the first rung it goes past: length before height), if any. */
export function recordLine(piece: 'bridge' | 'tunnel', line: OurLine, length: number, height: number): string | null {
  const rung = RECORDS.find(q => q.piece === piece && q.lines.includes(line) && (q.measure === 'length' ? length : height) > q.above);
  return rung?.line ?? null;
}
