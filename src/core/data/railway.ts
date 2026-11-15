/** Sourced facts and explicitly provisional conventional-track inputs; research/23-railway-evidence.md.
 * None enables a scored railway or replaces current ČSN/SŽ clearance/transition/operations checks.
 */
export const RAILWAY_EVIDENCE = {
  /** ERA standard-gauge terminology. Gauge is not rail-centre spacing or formation width. */
  standardGaugeMm: 1435,
  /** SŽDC S3 X change 4, clause 38: concrete sleepers, national/regional through track.
   * Measured below sleeper bearing face at shallower rail; special layers can require +50 mm.
   */
  minimumConcreteSleeperBallastM: 0.35,
  /** SŽDC S3 X fig4 p15: uncanted single track, NOT Y-steel sleepers. Cant widening needs S4. */
  uncantedFormationHalfWidthM: 3.1,
  ballastTopHalfWidthM: 1.7,
  ballastSlopeHorizontalPerVertical: 1.25,
  /** S3 X cl11/fig3/6: constrained reconstruction WITHOUT formation-width change only.
   * New/modified formations require an applicable SŽ S4 minimum, not this exception.
   */
  constrainedReconstructionMaintenancePathM: 0.4,
  /** Standard-gauge equilibrium cant: 1500 mm contact-circle convention, rounded coefficient. */
  equilibriumCantCoefficient: 11.8,
  /** PROVISIONAL old VUT/ČSN teaching ordinary design values, not exceptional maxima.
   * 2009 PDF pp4/7/9/14 personally checked including merged table cells. No turnouts,
   * ≤160 km/h, ≤20 million tonnes/year; above that annual load the old cant limit is120 mm.
   */
  ordinaryCantMm: 150,
  highLoadCantMm: 120,
  ordinaryDeficiencyMm: 80,
  ordinaryExcessMm: 80,
  linearCantRampFactor: 10, // n=10*V, L=n*ΔD/1000, ordinary ≤160 km/h
  /** PROVISIONAL conservative policy: apply the ≤80 km/h LIMIT-column floor (6V,
   * VUT p14 footnote a) to the ordinary 10V calculation too. The source does NOT attach
   * this footnote to its standard column. Avoids a steeper low-speed standard ramp
   * than that limit; not claimed as a sourced standard-column minimum.
   */
  conservativeRampMinimumInverseSlope: 445,
  /** NV272/2011 §12(3) + annex3 A: post-2000 permitted ordinary residential railway case.
   * Railway night −5 is in annex3 A; relocation/legal classification must be resolved separately.
   * Not an emission model.
   */
  newLineNoise: { dayDb: 60, nightDb: 55 },
} as const;

/** SFDI SPOŽES 2026 (study-stage railway price book), functional workbook 260429, sheet "Tabulka
 * propočtu", CU2026, CZK excl. VAT; personally checked against the downloaded workbook (research/32).
 * Item codes in comments. Per metre/km of TRACK unless the unit says route. */
export const SPOZES = {
  trackPerM: 22_000, // E02 Kolej, nová, štěrkové lože (m koleje)
  layersPerM: 12_300, // F03 Konstrukční vrstvy pražcového podloží, do 160 km/h (m koleje)
  ditchPerM: 2_700, // F09 Odvodnění (zpevněný příkop) (bm)
  catenaryAcPerKm: 13_310_300, // N04 Trakční vedení, střídavá soustava (trať) (km koleje)
  signallingSinglePerKm: 3_751_100, // A04 TZZ - jednokolejná trať (km tratě)
  signallingDoublePerKm: 5_921_800, // A05 TZZ - dvoukolejná trať (km tratě)
  etcsPerKm: 2_605_100, // A09 ETCS (km koleje)
  cablesPerKm: 3_495_300, // B02 Sdělovací kabelizace v trati (km tratě)
  gsmrPerKm: 5_056_300, // B10 Rádiový systém GSM-R (km tratě)
  utilitiesPerKm: 4_952_600, // I02 Přeložky sítí v řídce zastavěném území (km tratě)
  utilitiesUrbanPerKm: 14_965_800, // I01 … v hustě zastavěném území (km tratě)
  bridgeLongPerM2: 173_400, // H02 Nový železniční most - nad 40 m, estakáda (m²)
  tunnelSinglePerKm: 847_500_000, // J01 Tunel 1-kolejný v extravilánu (bm)
  tunnelSingleUrbanPerKm: 1_194_900_000, // J02 … v intravilánu
  tunnelDoublePerKm: 1_920_900_000, // J03 Tunel 2-kolejný v extravilánu (bm)
  tunnelDoubleUrbanPerKm: 2_818_300_000, // J04 … v intravilánu
  /** Sheet "Databaze přirážek" P1, novostavba (lower study detail): railway substructure (F) +10 %,
   * bridges (H) and tunnels (J) +13 %; track, systems and catenary 0 %. P2 (environment, extravilán) 0. */
  markup: { substructure: 0.10, bridges: 0.13, tunnels: 0.13 },
} as const;

/** PROVISIONAL track-centre distance on open line ≤ 160 km/h: Plášek (VUT 2009) p. 42, 4.0 m; current
 * SŽ S11 / ČSN 73 6320 values not verified (research/34 §4). Double-track formation = single + this. */
export const TRACK_CENTRES_M = 4.0;

/** Route-km price of a new electrified (25 kV AC) line: track, sleeper-bed layers, a lined ditch on
 * each side, catenary, line signalling, ETCS, line cables, GSM-R and utility relocations (sparse).
 * NOT included (not modelled): stations, turnouts, traction substations and feeders, buildings.
 * Earthworks, land, bridges and tunnels are measured separately by the game. */
export function railRouteBasePerKm(tracks: 1 | 2, urban = false): number {
  const s = SPOZES, perTrack = (s.trackPerM + s.layersPerM * (1 + s.markup.substructure)) * 1000 + s.catenaryAcPerKm + s.etcsPerKm;
  return tracks * perTrack + 2 * s.ditchPerM * 1000 * (1 + s.markup.substructure)
    + (tracks === 1 ? s.signallingSinglePerKm : s.signallingDoublePerKm) + s.cablesPerKm + s.gsmrPerKm
    + (urban ? s.utilitiesUrbanPerKm : s.utilitiesPerKm);
}
