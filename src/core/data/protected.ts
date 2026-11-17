// Nature protection areas (research/75; data: AOPK ČR open data, pipeline/fetch_protected.py and
// build_protected.py, a pack's `protected.json`). What zákon 114/1992 Sb. forbids in each kind of area and
// how the game treats works there: a `ban` or `consent` area takes no works of ours (cuts, fills, tunnel
// ends and their pits, bridge supports, walls, rebuilt roads): Auto bridges over it with no supports inside,
// takes the road under it in a mined tunnel, or the player moves the route; the player's works there are a
// problem. An `info` area is only drawn and named.

/** AOPK category codes: national / nature reserve and monument, protection zone, Natura 2000 site of community
 * importance (EVL) and bird area (PO), national park, protected landscape area (CHKO). */
export type ProtectedKind = 'NPR' | 'PR' | 'NPP' | 'PP' | 'OP' | 'EVL' | 'PO' | 'NP' | 'CHKO';

/** One area as the pack ships it (build_protected.py). `rings`: flat [x0, y0, x1, y1, …] in the pack's local
 * metres, filled even-odd (holes are rings too). */
export interface ProtectedSiteData {
  kind: ProtectedKind;
  /** NP zone A–D, CHKO zone I–IV */
  zone?: string;
  name: string;
  /** AOPK code (small areas) or the Natura 2000 site code */
  code?: string;
  /** protection zone: the kind of area it protects (a small area's kind, or NP) */
  of?: string;
  /** protection zone: declared by its own act (else the statutory 50 m) */
  declared?: boolean;
  rings: number[][];
}
export interface ProtectedData { version: 1; source: string; sites: ProtectedSiteData[] }

export type ProtectedLevel = 'ban' | 'consent' | 'info';
export interface ProtectedRule {
  level: ProtectedLevel;
  /** plain words: "nature monument" */
  label: string;
  /** why no works go there, plain words */
  why: string;
  /** the requirement with its source (a violation's rule line) */
  rule: string;
}

const KIND_LABEL: Record<string, string> = {
  NPR: 'national nature reserve', PR: 'nature reserve', NPP: 'national nature monument', PP: 'nature monument',
  EVL: 'Natura 2000 site', PO: 'Natura 2000 bird area', NP: 'national park', CHKO: 'protected landscape area',
};
/** strictest first: which of overlapping areas names a place (a monument inside a Natura 2000 site is the monument) */
export const PROTECTED_ORDER: readonly ProtectedKind[] = ['NPR', 'NPP', 'PR', 'PP', 'NP', 'CHKO', 'EVL', 'OP', 'PO'];

/** The game's rule for works of a road at a place in this area. `motorway`: our road is a motorway
 * (CHKO bans new motorways anywhere in it); `builtUp`: the place is in a built-up area (a national park's
 * ban on building stops at villages). */
export function protectedRule(site: Pick<ProtectedSiteData, 'kind' | 'zone' | 'of' | 'declared'>, motorway = false, builtUp = false): ProtectedRule {
  const label = protectedLabel(site);
  switch (site.kind) {
    case 'NPR': return { level: 'ban', label, why: 'Nothing may be built in a national nature reserve.',
      rule: 'Act 114/1992 §29(b): no building in a national nature reserve' };
    case 'PR': return { level: 'ban', label, why: 'Nothing may be built in a nature reserve.',
      rule: 'Act 114/1992 §34(1)(c): no building in a nature reserve' };
    case 'NPP': return { level: 'ban', label, why: 'A national nature monument may not be changed or damaged.',
      rule: 'Act 114/1992 §35(2): a national nature monument may not be changed or damaged' };
    case 'PP': return { level: 'ban', label, why: 'A nature monument may not be changed or damaged.',
      rule: 'Act 114/1992 §36(2): a nature monument may not be changed or damaged' };
    case 'OP': return { level: 'consent', label, why: `Works next to a protected ${site.of === 'NP' ? 'national park' : 'reserve or monument'} need the nature authority's consent.`,
      rule: `Act 114/1992 §37: works in a protection zone need the nature authority's consent${site.declared ? '' : ' (50 m round a reserve or monument where no zone is declared)'}` };
    case 'EVL': return { level: 'ban', label, why: 'A Natura 2000 site is protected from damage; works that may harm it need a Natura assessment and are allowed only for an overriding public interest.',
      rule: 'Act 114/1992 §45c(2), §§45h–45i: a Natura 2000 site is protected from damage; harmful works need consent and a Natura assessment' };
    case 'PO': return { level: 'info', label, why: 'A bird area: works there need a Natura assessment, but are not forbidden as such.',
      rule: 'Act 114/1992 §45e, §§45h–45i: works in a bird area need a Natura assessment' };
    case 'NP': return builtUp ? { level: 'info', label, why: 'Inside a village of a national park building is allowed.', rule: 'Act 114/1992 §16(2)' }
      : { level: 'ban', label, why: 'Outside its villages, nothing may be built in a national park.',
        rule: 'Act 114/1992 §16(2)(b): no building in a national park outside its villages' };
    case 'CHKO':
      if (site.zone === 'I') return { level: 'ban', label, why: 'Nothing new may be built in the first zone of a protected landscape area.',
        rule: 'Act 114/1992 §26(2)(a): no new building in zone I of a protected landscape area' };
      if (site.zone === 'II') return { level: 'ban', label, why: 'Large earthworks are forbidden in the second zone of a protected landscape area.',
        rule: 'Act 114/1992 §26(3)(a): no large earthworks in zones I–II of a protected landscape area' };
      return motorway ? { level: 'ban', label, why: 'No new motorway may be built anywhere in a protected landscape area.',
        rule: 'Act 114/1992 §26(1)(f): no new motorways in a protected landscape area' }
        : { level: 'info', label, why: 'Building here needs the nature authority\'s consent.', rule: 'Act 114/1992 §44' };
  }
}

/** "nature monument", "zone II of a protected landscape area", "protection zone of a nature monument" */
export function protectedLabel(site: Pick<ProtectedSiteData, 'kind' | 'zone' | 'of'>): string {
  if (site.kind === 'OP') return `protection zone of a ${KIND_LABEL[site.of ?? 'PP'] ?? 'protected area'}`;
  if (site.kind === 'CHKO' && site.zone) return `zone ${site.zone} of a protected landscape area`;
  if (site.kind === 'NP' && site.zone) return `zone ${site.zone} of a national park`;
  return KIND_LABEL[site.kind];
}

/** a site's name in a sentence: "the nature monument Pod skálou" */
export function protectedName(site: Pick<ProtectedSiteData, 'kind' | 'zone' | 'of' | 'name'>): string {
  if (site.kind === 'OP') return `the protection zone of ${site.name}`;
  return `${site.name} (${protectedLabel(site)})`;
}

export function validProtectedData(v: unknown): v is ProtectedData {
  const d = v as ProtectedData;
  return !!d && d.version === 1 && Array.isArray(d.sites) && d.sites.every(s => typeof s.name === 'string'
    && PROTECTED_ORDER.includes(s.kind) && Array.isArray(s.rings) && s.rings.every(r => Array.isArray(r) && r.length >= 6 && r.length % 2 === 0));
}
