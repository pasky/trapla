// The traffic census shipped with a map pack (`traffic.json`, pipeline/build_traffic.py): what a mapped
// road carries today. A rebuilt stretch starts with the count of its own census section; a road the
// census did not count, and a new road, start with the average of their class, labelled as an estimate.
import { CENSUS_MATCH, CLASS_TRAFFIC } from './data/traffic';

export interface CensusSection {
  /** ŘSD section number (CIS_SU) */ id: string;
  /** road number as the map writes it ("14", "00315") */ road: string;
  /** all motor vehicles a day (RPDI); 0 = the section was not counted */ vehicles: number;
  /** heavy vehicles a day (TV) */ heavy: number;
  /** its line(s), flat x, y in the pack's local metres */ lines: number[][];
}
export interface TrafficCensus { version: 1; source: string; year: number; sections: CensusSection[] }
export interface TrafficDefault {
  aadt: number; heavyShare: number;
  /** counted on this road, or the average of its class */ basis: 'census' | 'class';
  year?: number; section?: string;
}

const lineDistance = (line: readonly number[], x: number, y: number) => {
  let best = Infinity;
  for (let i = 2; i < line.length; i += 2) {
    const ax = line[i - 2], ay = line[i - 1], dx = line[i] - ax, dy = line[i + 1] - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
};

/** The census section of a mapped road at a point: same road number (any of the way's numbers), its line
 * within CENSUS_MATCH of the point; the nearest one. Null: the census has no section of this road here. */
export function censusSection(census: TrafficCensus | null | undefined, ref: string | undefined, x: number, y: number): CensusSection | null {
  if (!census || !ref) return null;
  const numbers = new Set(ref.split(';').map(r => r.trim()).filter(Boolean));
  let best = CENSUS_MATCH, found: CensusSection | null = null;
  for (const section of census.sections) {
    if (!numbers.has(section.road)) continue;
    for (const line of section.lines) { const d = lineDistance(line, x, y); if (d <= best) { best = d; found = section; } }
  }
  return found;
}

/** The average road of a class (the estimate for a road nobody counted). */
export function classTraffic(legalClass: string): TrafficDefault {
  const row = CLASS_TRAFFIC[legalClass as keyof typeof CLASS_TRAFFIC] ?? CLASS_TRAFFIC.III;
  return { aadt: row.aadt, heavyShare: row.heavyShare, basis: 'class' };
}

/** What a road of this class carries where nobody has said otherwise: its census count at (x, y) when it
 * is a mapped road with a counted section there, else the average of its class. */
export function defaultTraffic(legalClass: string, census?: TrafficCensus | null, ref?: string, at?: { x: number; y: number }): TrafficDefault {
  const section = at ? censusSection(census, ref, at.x, at.y) : null;
  if (!section || !(section.vehicles > 0)) return classTraffic(legalClass);
  // the share to 0.1 %, as the card shows and edits it
  return { aadt: section.vehicles, heavyShare: Math.round(1000 * Math.min(1, section.heavy / section.vehicles)) / 1000,
    basis: 'census', year: census!.year, section: section.id };
}

export function validTrafficCensus(value: unknown): value is TrafficCensus {
  const v = value as TrafficCensus;
  return !!v && v.version === 1 && Number.isFinite(v.year) && Array.isArray(v.sections) && v.sections.every(s =>
    typeof s.id === 'string' && typeof s.road === 'string' && s.vehicles >= 0 && s.heavy >= 0
    && Array.isArray(s.lines) && s.lines.every(l => Array.isArray(l) && l.length >= 4 && l.length % 2 === 0 && l.every(Number.isFinite)));
}
