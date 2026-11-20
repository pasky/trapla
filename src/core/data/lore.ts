// Local knowledge: one grey, sourced line on the card a real mapped object already opens (research/96). Keyed by
// the OSM way (the same way in several packs says the same thing). Never a pop-up, never on our own road's cards;
// a line goes when its source does.

export interface Lore {
  /** the sentence, plain words, ≤ ≈ 15 words */
  line: string;
  /** the card's title where the way carries no name of its own */
  title?: string;
}

const way = (ids: readonly number[], lore: Lore): [string, Lore][] => ids.map(id => [`osm:way:${id}`, lore]);

export const MAPPED_LORE: ReadonlyMap<string, Lore> = new Map([
  // Ecce Homo, Šternberk: III/44423 from the start (Opavská × Sadová) north out of town (research/96 §1)
  ...way([233754777, 260133002, 233754932, 260133001, 1562071054, 233754680, 233757455, 233757456, 233757497, 682525712,
    41552242, 205203355, 23396775, 969799598],
  { line: 'The Ecce Homo hill-climb runs here: a 7.8 km course up from Šternberk, first raced in 1905.' }),
  // the Žampach viaduct, line 210 by the D3 (research/96 §2)
  ...way([30231642], { title: 'Žampach viaduct', line: 'Stone, opened in 1900; its highest arch stands 42 m above the Kocour gorge.' }),
  // the I/35 into the Hřebeč tunnel, both sides (the tunnel way itself is not drawn; research/96 §3)
  ...way([1319367452, 694293527], { line: 'It passes under the ridge in the Hřebeč tunnel, the first motorway-size tunnel mined in Czechia.' }),
  // the Trutnov – Královec railway (research/96 §6)
  ...way([602447755], { title: 'Trutnov – Lubawka railway', line: 'Trains run on over the border to Lubawka and Sędzisław.' }),
]);

/** By road number where every mapped way of it in the packs says the same (research/96 §4: the I/35 in Český ráj). */
const BY_REF: Readonly<Record<string, { packs: readonly string[]; lore: Lore }>> = {
  'primary:35': { packs: ['i35-full', 'i35-turnov', 'i35-rovensko', 'i35-jicin'],
    lore: { line: 'The new road planned beside it was called the R35 expressway until 2015.' } },
};

/** The line for a mapped way of pack `pack`, if any. */
export function mappedLore(pack: string | undefined, sourceId: string, tags: { highway?: string; ref?: string } | undefined): Lore | undefined {
  const own = MAPPED_LORE.get(sourceId);
  if (own) return own;
  const ref = BY_REF[`${tags?.highway}:${tags?.ref}`];
  return ref && pack && ref.packs.includes(pack) ? ref.lore : undefined;
}

/** A mined tunnel of ours on these maps, under its card's More (research/96 §7: St Barbara at the real D11 tunnels'
 * portals; a trade custom, said as whose it is; no statue drawn). */
export const MINED_TUNNEL_LORE: Readonly<Record<string, string>> = {
  d11: 'A statue of St Barbara, tunnellers’ patron, has stood at the real Poříčí tunnel’s portal since November 2026.',
};

/** The dashed official / planned line's card on these maps (research/94: ŘSD leaflet 04/2026, "Druhý tunel Opevnění";
 * the name as the project's own context reports it, not that the tunnel passes under a fort). */
export const OFFICIAL_LORE: Readonly<Record<string, string>> = {
  d11: 'Its second tunnel is to be called Opevnění, “fortifications”, after the border forts built here in the 1930s.',
};

/** Every line, for the player-text guard. */
export const ALL_LORE: readonly Lore[] = [...MAPPED_LORE.values(), ...Object.values(BY_REF).map(r => r.lore),
  ...Object.values(MINED_TUNNEL_LORE).map(line => ({ line })), ...Object.values(OFFICIAL_LORE).map(line => ({ line }))];
