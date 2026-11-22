import { atan } from '../detmath';
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
  const s = SPOZES;
  return railEverywherePerKm(tracks, urban) + (tracks * s.layersPerM * 1000 + 2 * s.ditchPerM * 1000) * (1 + s.markup.substructure);
}
/** The part of the route-km price that bridges and tunnels carry too: track, catenary, ETCS, signalling,
 * cables, GSM-R and utility relocations (sleeper-bed layers and ditches are ground-only, SPOŽES F). */
export function railEverywherePerKm(tracks: 1 | 2, urban = false): number {
  const s = SPOZES;
  return tracks * (s.trackPerM * 1000 + s.catenaryAcPerKm + s.etcsPerKm) + (tracks === 1 ? s.signallingSinglePerKm : s.signallingDoublePerKm)
    + s.cablesPerKm + s.gsmrPerKm + (urban ? s.utilitiesUrbanPerKm : s.utilitiesPerKm);
}

/** TSI INF (1299/2014 consolidated 2023) annex §4.2.3.3: main-track maximum gradients "shall be defined
 * taking into account the characteristics of the traffic" — a project parameter, no general number.
 * For a new mixed passenger + freight line the game uses 12.5 ‰, the value SŽDC's feasibility study of
 * the new Prague link adopted ("maximální podélný sklon 12,5 ‰", Čech 2018 p. 7; research/34 §7). */
export const RAIL_MAX_GRADIENT = 0.0125;

/** PROVISIONAL game assumption (no source): a new line ending on an existing railway joins it in a station
 * area this long (turnouts and station tracks). Within it the mapped railway is the track we join, not an
 * obstacle to bridge or keep clear of; beyond it the existing line keeps its own space. */
export const RAIL_TIE_IN_M = 300;
/** A new line joins or leaves a station's tracks through a turnout: the steepest it can branch off them is
 * the turnout's angle. The common Czech standard turnout J60-1:12-500 branches at 4.763642° (= atan 1/12;
 * DT Prostějov geometry table as quoted in a ČVUT diploma thesis, research/38 §5); flatter (slimmer)
 * turnouts branch at less. Used as the largest angle between a railway's end straight and the station
 * tracks it ties into. */
export const TURNOUT_ANGLE_RAD = atan(1 / 12);
/** Station tracks' direction at a tie-in: principal axis of the mapped railway cells within this radius of
 * the end (game measurement on the 5 m raster; at Trutnov hl.n. and Královec stable within 1° for 60–150 m). */
export const STATION_AXIS_RADIUS_M = 100;

/** PROVISIONAL game assumption (no source): where a new line joins or leaves an existing track along the
 * way, the track's own space is shared over about a turnout's length beyond the last parallel station. */
export const RAIL_TURNOUT_M = 50;

/** An existing railway carried over our road on a new bridge, our road in a cutting under it (research/105). */
export const RAIL_OVER = {
  /** Height of the traffic space under a bridge by the road passing under it, m: motorways, expressways, class I and
   * II roads 4.80; class III and fast or collector local roads 4.50; local access and public-purpose roads 4.20
   * (ČSN 73 6201 as summarised by VŠB-TUO VMK 02 p. 12 and ŘSD R 111 p. 1, research/105). The game's local road
   * (M 7.5) takes the collector value. */
  clearance: { motorway: 4.8, I: 4.8, II: 4.8, local: 4.5, track: 4.2 } as Record<string, number>,
  /** The safety gap between that space and the underside of the bridge, m (ŘSD R 111 p. 1: "výška průjezdního
   * prostoru + bezpečnostní vzdálenost 0,15 m"). */
  safetyGap: 0.15,
  /** PROVISIONAL construction depth, top of rail to the soffit, m: the upper end of the short-span ballasted Czech
   * railway bridges found (1.29–1.77 m at 13.5–16.5 m spans, research/105 second pass); our cutting's span is longer,
   * no rule was found. */
  depth: 1.8,
  /** PROVISIONAL deck width, m: single track 9.72 m between the railings (the Baláš frame, Otrokovice–Vizovice),
   * double track 11.29 m (Chomutov, ČVUT thesis 2020): two examples, no rule (research/105 second pass). */
  deckWidth: { 1: 9.72, 2: 11.29 } as Record<1 | 2, number>,
  /** SPOŽES 2026 H01 "Nový železniční most - do 40 m", H02 "… nad 40 m, estakáda" (CZK per m², research/32, /105),
   * with the P1 bridges mark-up (SPOZES.markup.bridges). */
  perM2: 86_800, longPerM2: 173_400, longFrom: 40,
  /** SPOŽES 2026 H07 "Mostní provizoria" (CZK per m²): the railway kept running over a provisional bridge while the
   * new one is built (the staging of ŘSD's I/27 Přeštice bypass railway bridge: provisional structures in a first
   * possession, the bridge in a second; research/105). PROVISIONAL scope: one provisional bridge of the new one's area;
   * the possessions themselves (replacement buses, SPOŽES sheet NAD) are not priced. */
  provisionalPerM2: 39_800,
  /** PROVISIONAL (the raster gives no track count): one mapped railway line is drawn 10 m wide (pipeline/build_pack.py,
   * 2 px at 5 m); a band wider than this across the railway is a double track, m. */
  doubleBand: 12,
  /** Engine bound: a band of railway this long along our road (a station's tracks, railways side by side) is not carried
   * over us on one bridge, m. */
  maxRun: 60,
  /** PROVISIONAL engine bound: no railway bridge over us at a sharper angle than 30° to our road (the sine of the angle
   * at least this): a railway running nearly along our road is bridged by us, or it is no crossing. */
  minSine: 0.5,
} as const;

/** A mapped railway tunnel under our road (structures.json `rail`, rail-tunnels.ts; research/107). Heights from the top
 * of rail: the Czech double-track tunnel's sample cross-section (SŽDC vzorový list světlého tunelového průřezu, Tunel
 * 2/2005 p. 46): the inner face of the lining's vault 7.60 m above the rails, the tunnel's floor 0.85 m below them. A
 * single-track tunnel is lower; the raster does not tell them apart, so every tunnel is taken at this size. */
export const RAIL_TUNNEL = {
  crown: 7.6,
  invert: 0.85,
  /** PROVISIONAL (no source taken): the lining's thickness, primary and final together, m */
  lining: 0.5,
  /** PROVISIONAL (no source taken): our road's pavement and formation over the vault, m */
  buildUp: 0.5,
} as const;
/** Our grade at least this far above a railway tunnel's rails: its vault, its lining and our pavement, m. Where the
 * ground is this far above them the tunnel is underground: no railway at the ground for our works. */
export const RAIL_TUNNEL_OVER = RAIL_TUNNEL.crown + RAIL_TUNNEL.lining + RAIL_TUNNEL.buildUp;
