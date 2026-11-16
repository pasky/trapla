// Traffic of roads the player rebuilds or builds beside the mission road (research/40, research/41).

/** Average traffic of the whole network of a road class, vehicles/24 h: traffic performance ÷ network
 * length, counted and uncounted roads alike. ŘSD Celostátní sčítání dopravy 2025, tab. 4 in Sazmová,
 * Bartoš, Trnka, Jahoda: "Celostátní sčítání dopravy 2025: metodika a výsledky projektu", Silniční obzor
 * 9/2026 (research/41 §1).
 * Heavy share: heavy vehicles ÷ all vehicles (TV ÷ SV) summed over every counted section of the class in the
 * ŘSD Geoportal CSD 2025 layer (`pipeline/fetch_census.py`, national-classes.json; research/41 §2).
 * GAME PRIOR: the class average is sourced; assuming it for one particular road (one the census did not
 * count, or one that does not exist yet) is the game's estimate. The card says so and the player can
 * change it. Uncounted class III roads are on average quieter than the class (≈ 480 by subtraction,
 * research/41 §1); the published average is used because that subtraction is our own derivation. */
export const CLASS_TRAFFIC: Record<'I' | 'II' | 'III', { aadt: number; heavyShare: number }> = {
  I: { aadt: 9613, heavyShare: 0.103 },
  II: { aadt: 3036, heavyShare: 0.075 },
  III: { aadt: 736, heavyShare: 0.064 },
};

/** A census section counts for a mapped road when its line passes this close to the middle of the
 * rebuilt stretch, m. PROVISIONAL: the census line is ŘSD's road axis, the map's is OpenStreetMap's;
 * across the four packs 97 % of mapped ways that carry a counted road number lie within 15 m of that
 * number's section and the rest are other parts of the road, hundreds of metres away (research/41 §3). */
export const CENSUS_MATCH = 50;
