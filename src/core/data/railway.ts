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
  /** S3 X fig3/6: minimum maintenance path width. */
  minimumMaintenancePathM: 0.4,
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
  ordinaryRampMinimumInverseSlope: 445, // simultaneous ≤80 km/h limit, VUT p14 footnote a
  /** NV272/2011 §12(3) + annex3 A: post-2000 permitted ordinary residential railway case.
   * Railway night −5 is in annex3 A; relocation/legal classification must be resolved separately.
   * Not an emission model.
   */
  newLineNoise: { dayDb: 60, nightDb: 55 },
} as const;
