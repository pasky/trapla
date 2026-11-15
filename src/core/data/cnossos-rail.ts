// CNOSSOS-EU railway source data: Directive 2002/49/EC Annex II as consolidated 29.07.2021 (Directive
// 2015/996 + Delegated Directive 2021/1226), §2.3 and Appendix G. Transcribed from the EUR-Lex
// consolidated PDF (CELEX 02002L0049-20210729, pp. 164-172), personally checked; research/35.
// Decibels; wavelengths in mm (1/3-octave bands, longest first); frequencies 50 Hz … 10 kHz.

export const FREQUENCIES = [50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000] as const;
/** IEC 61672-1 A-weighting at the 1/3-octave centre frequencies above, dB. */
export const A_WEIGHTING = [-30.2, -26.2, -22.5, -19.1, -16.1, -13.4, -10.9, -8.6, -6.6, -4.8, -3.2, -1.9, -0.8, 0,
  0.6, 1.0, 1.2, 1.3, 1.2, 1.0, 0.5, -0.1, -1.1, -2.5] as const;

/** Wavelength bands of the rail-roughness, contact-filter and impact tables (G-1, G-2, G-4). */
export const WAVELENGTHS = [2000, 1600, 1250, 1000, 800, 630, 500, 400, 315, 250, 200, 160, 125, 100, 80, 63, 50, 40,
  31.5, 25, 20, 16, 12.5, 10, 8, 6.3, 5, 4, 3.15, 2.5, 2, 1.6, 1.25, 1, 0.8] as const;

/** Table G-1, Lr,TR,i rail roughness. E: EN ISO 3095:2013 (well maintained, very smooth);
 * M: average network (normally maintained, smooth). */
export const RAIL_ROUGHNESS = {
  E: [17.1, 17.1, 17.1, 17.1, 17.1, 17.1, 17.1, 17.1, 15.0, 13.0, 11.0, 9.0, 7.0, 4.9, 2.9, 0.9, -1.1, -3.2, -5.0, -5.6,
    -6.2, -6.8, -7.4, -8.0, -8.6, -9.2, -9.8, -10.4, -11.0, -11.6, -12.2, -12.8, -13.4, -14.0, -14.0],
  M: [35.0, 31.0, 28.0, 25.0, 23.0, 20.0, 17.0, 13.5, 10.5, 9.0, 6.5, 5.5, 5.0, 3.5, 2.0, 0.1, -0.2, -0.3, -0.8, -3.0,
    -5.0, -7.0, -8.0, -9.0, -10.0, -12.0, -13.0, -14.0, -15.0, -16.0, -17.0, -18.0, -19.0, -19.0, -19.0],
} as const;

/** Table G-1, Lr,VEH,i wheel roughness by brake type, for WAVELENGTHS[3…] (1 000 mm down to 0.8 mm; the
 * table's 120 / 12 / 3.2 / 1.2 mm rows are the 125 / 12.5 / 3.15 / 1.25 mm bands). Longer: the 1 000 mm value. */
export const WHEEL_ROUGHNESS = {
  /** c: cast-iron tread brake */
  castIron: [2.2, 2.2, 2.2, 2.2, 2.2, 2.2, 2.2, 2.2, 2.4, 0.6, 2.6, 5.8, 8.8, 11.1, 11.0, 9.8, 7.5, 5.1, 3.0, 1.3, 0.2,
    -0.7, -1.2, -1.0, 0.3, 0.2, 1.3, 3.1, 3.1, 3.1, 3.1, 3.1],
  /** k: composite brake */
  composite: [-4.0, -4.0, -4.0, -4.0, -4.0, -4.0, -4.0, -4.0, -4.0, -4.0, -4.0, -4.3, -4.6, -4.9, -5.2, -6.3, -6.8, -7.2,
    -7.3, -7.3, -7.1, -6.9, -6.7, -6.0, -3.7, -2.4, -2.6, -2.5, -2.5, -2.5, -2.5, -2.5],
  /** n: disc brake */
  disc: [-5.9, -5.9, -5.9, -5.9, -5.9, -5.9, 2.3, 2.8, 2.6, 1.2, 2.1, 0.9, -0.3, -1.6, -2.9, -4.9, -7.0, -8.6, -9.3,
    -9.5, -10.1, -10.3, -10.3, -10.8, -10.9, -9.5, -9.5, -9.5, -9.5, -9.5, -9.5, -9.5],
} as const;

/** Table G-2, A3,i contact filter for wheel diameter 920 mm at wheel loads 50 kN and 100 kN. */
export const CONTACT_FILTER = {
  load50kN: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.1, -0.1, -0.3, -0.6, -1.1, -1.3, -3.5, -5.3, -8.0, -12.0, -16.8,
    -17.7, -18.0, -21.5, -21.8, -22.8, -24.0, -24.5, -25.0, -27.3, -28.1, -28.9, -29.7],
  load100kN: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.1, -0.2, -0.3, -0.6, -1.0, -1.8, -3.2, -5.4, -8.7, -12.2, -16.7, -17.7,
    -17.8, -20.7, -22.1, -22.8, -24.0, -24.5, -24.7, -27.0, -27.8, -28.6, -29.4, -30.2],
} as const;

/** Table G-3, LH,TR,i track transfer (per axle), M/M: mono-block sleeper on medium-stiffness rail pad. */
export const TRACK_TRANSFER_MM = [50.9, 57.8, 66.5, 76.8, 80.9, 83.3, 85.8, 90.0, 91.6, 93.9, 95.6, 97.4, 101.7, 104.4,
  106.0, 106.8, 108.3, 108.9, 109.1, 109.4, 109.9, 109.9, 110.3, 111.0] as const;
/** Table G-3, LH,VEH,i vehicle transfer (per axle), wheel diameter 920 mm, no measure. */
export const VEHICLE_TRANSFER_920 = [75.4, 77.3, 81.1, 84.1, 83.3, 84.3, 86.0, 90.1, 89.8, 89.0, 88.8, 90.4, 92.4, 94.9,
  100.4, 104.6, 109.6, 114.9, 115.0, 115.0, 115.5, 115.6, 116.0, 116.7] as const;
/** Table G-3, LH,VEH,SUP,i superstructure (freight wagons, type a "EU standard"): 0 dB in every band. */
export const SUPERSTRUCTURE_TRANSFER = 0;

/** Table G-5, LW,0 traction (= idling, per vehicle), sources A (0.5 m) and B (4.0 m). */
export const TRACTION = {
  electricMultipleUnit: {
    A: [80.5, 81.4, 80.5, 82.2, 80.0, 79.7, 79.6, 96.4, 80.5, 81.3, 97.2, 79.5, 79.8, 86.7, 81.7, 82.7, 80.7, 78.0, 75.1,
      72.1, 69.6, 66.7, 64.1, 61.8],
    B: [84.8, 86.6, 83.4, 81.6, 80.5, 80.5, 79.5, 94.3, 78.3, 78.4, 94.4, 77.7, 77.3, 84.6, 79.5, 81.7, 79.8, 76.9, 74.1,
      71.3, 68.6, 66.0, 63.5, 61.3],
  },
  electricLocomotive: {
    A: [87.9, 90.8, 91.6, 94.6, 94.8, 96.8, 104.0, 100.8, 99.6, 101.7, 98.6, 95.6, 95.2, 96.1, 92.1, 89.1, 87.1, 85.4,
      83.5, 81.5, 80.0, 78.1, 76.5, 75.2],
    B: [92.2, 96.0, 94.5, 94.0, 95.3, 97.6, 103.9, 98.7, 97.4, 98.8, 95.8, 93.8, 92.7, 94.0, 89.9, 88.1, 86.2, 84.3,
      82.5, 80.7, 79.0, 77.4, 75.9, 74.7],
  },
} as const;
