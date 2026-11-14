// Stream-crossing screening assumptions, not hydraulic design. research/17-stream-crossings.md.
export const CULVERT_RULES = {
  /** PROVISIONAL upland runoff proxy: Q100 = 3 A^0.75 m³/s, A in km². Not a ČHMÚ regional formula. */
  runoff: 3, areaExponent: 0.75,
  unknownArea: 0.1, truncatedFlowFactor: 2,
  /** Conservative screening velocity and available flow area; no inlet/tailwater computation. */
  velocity: 2, pipeFlowShare: 0.7, boxDepthShare: 0.75,
  cover: 0.8, dryBank: 0.5,
  /** PROVISIONAL ecological proxy, NOT an assertion of surveyed fish presence. */
  naturalBedArea: 1,
  maxPipeLength: 80, maxBoxLength: 100,
  bridgeBanks: 2,
  /** Legacy raster packs only; vector crossings deduplicate only coincident geometry. */
  rasterMerge: 30,
};

// OTSKP April 2026 pipe supply/laying + separate encasement and heads.
// Encasement quantity 0.6*(DN/0.8)^2 m³/m and 3000*(DN/0.8) bedding/excavation
// are PROVISIONAL assemblies, not catalogue quantities. 2.0 m uses the >DN1600 band.
export const PIPE_SIZES = [
  { width: 0.8, pipe: 9450.93, head: 73383.97 },
  { width: 1, pipe: 12641.30, head: 73383.97 },
  { width: 1.2, pipe: 18688.24, head: 93823.61 },
  { width: 1.4, pipe: 23093.38, head: 113553.52 },
  { width: 1.6, pipe: 27765.44, head: 133851.20 },
  { width: 2, pipe: 44317.95, head: 160252.41 },
].map(p => ({ ...p, perM: p.pipe + 0.6 * (p.width / 0.8) ** 2 * 4366.36 + 3000 * p.width / 0.8 }));

// Frames 91843/91844/91845; +25% provisional bedding/waterproofing/bed assembly.
// 4×2.5 and 5×3 extrapolate 3×2 by perimeter; heads are provisional complete endworks.
export const BOX_SIZES = [
  { width: 2, height: 2, frame: 48259.84 },
  { width: 2.5, height: 2, frame: 52997.84 },
  { width: 3, height: 2, frame: 61052.44 },
  { width: 4, height: 2.5, frame: 61052.44 * 6.5 / 5 },
  { width: 5, height: 3, frame: 61052.44 * 8 / 5 },
].map(p => ({ ...p, perM: p.frame * 1.25, head: 100000 * p.width }));
