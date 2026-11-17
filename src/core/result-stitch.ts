// A kernel Result composed of pieces on one station grid (core/motorway-stretches.ts): the common spine's
// result, and inside separate stretches one direction's own carriageway mapped onto the spine's stations
// (its own chainage scaled linearly between the two joins). Bill lines come from the cost parts,
// rebinned by length, so the parts still sum to the bill. Display and bookkeeping only: nothing here
// engineers anything.
import type { Result } from './evaluate';
import { cellLength, PART_KEYS, sumParts, type CostParts } from './cost';
import type { AcousticSource, SideScreen } from './noise-field';
import type { Violation } from './checks';
import type { VPI } from './vertical';
import * as dm from './detmath';

export interface StitchPiece {
  /** spine station indices of the joins; the piece runs over spine chainage base.s[i0]…base.s[i1] */
  i0: number; i1: number;
  /** the direction's carriageway over that stretch, A→B */
  piece: Result;
  /** carriageway axis = shown line + offset × left normal (the shown line is the direction's own centre
   * line, the spine displaced) */
  offset: number;
  /** shown-design bend index of the piece's first bend */
  bend0: number;
}

/** cost parts of indivisible things (a house, a noise buy-out) */
const WHOLE = new Set<string>(['buildings', 'noiseBuyouts']);
const lerp = (a: ArrayLike<number>, t: number) => {
  const k = Math.max(0, Math.min(a.length - 2, Math.floor(t))), f = Math.max(0, Math.min(1, t - k));
  return a.length === 1 ? a[0] : a[k] + (a[k + 1] - a[k]) * f;
};

/** Composed result on `base`'s station grid. `baseBend(k)`: shown-design index of the spine's bend k
 * (null where an own line replaced it); `baseVpi` likewise is computed here. */
export function stitchResult(base: Result, pieces: readonly StitchPiece[], baseBend: (k: number) => number | null): Result {
  const n = base.n, ds = base.ds;
  const list = [...pieces].sort((p, q) => p.i0 - q.i0);
  const inside = (i: number) => list.find(p => i > p.i0 && i < p.i1);
  const outsideS = (s: number) => !list.some(p => s > base.s[p.i0] + 1e-9 && s < base.s[p.i1] - 1e-9);
  const outsideI = (i: number) => !inside(i);
  /** piece fractional index ↔ stitched index / chainage */
  const toS = (p: StitchPiece, sp: number) => base.s[p.i0] + sp / p.piece.length * (base.s[p.i1] - base.s[p.i0]);
  const toI = (p: StitchPiece, ip: number) => Math.max(p.i0, Math.min(p.i1, Math.round(p.i0 + ip / (p.piece.n - 1) * (p.i1 - p.i0))));
  const F = (a: Float64Array) => Float64Array.from(a);
  const out: Result = {
    ...base, s: base.s, x: F(base.x), y: F(base.y), tx: F(base.tx), ty: F(base.ty), ground: F(base.ground),
    geology: { ids: Uint8Array.from(base.geology.ids), profiles: [...base.geology.profiles] },
    grade: F(base.grade), kind: Uint8Array.from(base.kind), cut: F(base.cut), fill: F(base.fill),
    dayL: F(base.dayL), dayR: F(base.dayR), zDayL: F(base.zDayL), zDayR: F(base.zDayR), oob: Uint8Array.from(base.oob),
    wallSurfaceL: F(base.wallSurfaceL), wallSurfaceR: F(base.wallSurfaceR),
    cell: { width: F(base.cell.width), urban: Float32Array.from(base.cell.urban), forest: Float32Array.from(base.cell.forest), wall: Uint8Array.from(base.cell.wall),
      wallLength: F(base.cell.wallLength), wallArea: F(base.cell.wallArea) },
    parts: Object.fromEntries(PART_KEYS.map(k => [k, F(base.parts[k])])) as CostParts,
  };
  const noise = stitchSource(base, list);
  for (const p of list) {
    const r = p.piece, ids0 = out.geology.profiles.length;
    out.geology.profiles.push(...r.geology.profiles);
    // the half of each join cell beyond the join stays the spine's; the piece fills the rest
    for (const k of PART_KEYS) {
      const a = out.parts[k];
      for (let i = p.i0 + 1; i < p.i1; i++) a[i] = 0;
      // houses are bought whole: a join cell keeps the spine's (the composed list keeps them too)
      if (WHOLE.has(k)) { if (p.i0 === 0) a[p.i0] = 0; if (p.i1 === n - 1) a[p.i1] = 0; continue; }
      if (p.i0 > 0) a[p.i0] *= 0.5; else a[p.i0] = 0;
      if (p.i1 < n - 1) a[p.i1] *= 0.5; else a[p.i1] = 0;
    }
    for (let i = p.i0; i <= p.i1; i++) {
      const t = (i - p.i0) / (p.i1 - p.i0) * (r.n - 1), k = Math.max(0, Math.min(r.n - 1, Math.round(t)));
      let tx = lerp(r.tx, t), ty = lerp(r.ty, t);
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      // the shown line: the carriageway axis displaced back by its offset
      out.x[i] = lerp(r.x, t) + p.offset * ty; out.y[i] = lerp(r.y, t) - p.offset * tx;
      out.tx[i] = tx; out.ty[i] = ty;
      out.ground[i] = lerp(r.ground, t); out.grade[i] = lerp(r.grade, t);
      out.kind[i] = r.kind[k]; out.oob[i] = r.oob[k]; out.geology.ids[i] = ids0 + r.geology.ids[k];
      out.cut[i] = lerp(r.cut, t); out.fill[i] = lerp(r.fill, t);
      // daylight distances from the shown line
      out.dayL[i] = lerp(r.dayL, t) + p.offset; out.dayR[i] = lerp(r.dayR, t) - p.offset;
      out.zDayL[i] = lerp(r.zDayL, t); out.zDayR[i] = lerp(r.zDayR, t);
      out.wallSurfaceL[i] = lerp(r.wallSurfaceL, t); out.wallSurfaceR[i] = lerp(r.wallSurfaceR, t);
      out.cell.width[i] = lerp(r.cell.width, t); out.cell.urban[i] = lerp(r.cell.urban, t); out.cell.forest[i] = lerp(r.cell.forest, t);
      out.cell.wall[i] = r.cell.wall[k]; out.cell.wallLength[i] = r.cell.wallLength[k]; out.cell.wallArea[i] = r.cell.wallArea[k];
    }
    // cost per piece cell, spread over the stitched cells its mapped length covers
    const scale = (base.s[p.i1] - base.s[p.i0]) / r.length;
    for (let k = 0; k < r.n; k++) {
      const half = cellLength(k, r.n, r.ds);
      const lo = toS(p, Math.max(0, r.s[k] - (k === 0 ? 0 : r.ds / 2))), hi = lo + half * scale;
      if (!(hi > lo)) continue;
      for (let i = Math.max(0, Math.floor((lo - base.s[0]) / ds - 0.5)); i < n; i++) {
        const c0 = i === 0 ? base.s[0] : base.s[i] - ds / 2, c1 = i === n - 1 ? base.s[i] : base.s[i] + ds / 2;
        if (c0 >= hi) break;
        const w = Math.max(0, Math.min(hi, c1) - Math.max(lo, c0)) / (hi - lo);
        if (w > 0) for (const key of PART_KEYS) out.parts[key][i] += r.parts[key][k] * w;
      }
    }
  }
  out.cost = sumParts(out.parts);
  // ---- lists: the spine's outside the pieces, each piece's mapped inside ----
  const mapS = (p: StitchPiece, s: number) => toS(p, s);
  const pieceRuns = list.flatMap(p => p.piece.runs.map(r => ({ ...r, i0: toI(p, r.i0), i1: toI(p, r.i1), s0: mapS(p, r.s0), s1: mapS(p, r.s1),
    ...(r.pierStations ? { pierStations: r.pierStations.map(s => mapS(p, s)) } : {}),
    ...(r.arch ? { arch: { ...r.arch, s0: mapS(p, r.arch.s0), s1: mapS(p, r.arch.s1) } } : {}) })));
  out.runs = [...base.runs.filter(r => list.every(p => r.i1 <= p.i0 || r.i0 >= p.i1)), ...pieceRuns].sort((a, b) => a.i0 - b.i0);
  // the cones at bridge ends: the spine's outside the pieces, each piece's on the stitched stations (end cell beside)
  const cones = [...(base.cones ?? []).filter(c => list.every(p => Math.max(c.i, c.earthCell) <= p.i0 || Math.min(c.i, c.earthCell) >= p.i1)),
    ...list.flatMap(p => (p.piece.cones ?? []).map(c => { const i = toI(p, c.i); return { ...c, i, earthCell: i - (c.i - c.earthCell), s: mapS(p, c.s) }; }))]
    .filter(c => c.earthCell >= 0 && c.earthCell < n).sort((a, b) => a.s - b.s);
  if (cones.length) out.cones = cones; else delete out.cones;
  // heights: the spine's grade points outside, each piece's inside (its first and last on the joins)
  const vpiMap = new Map<string, number>();
  const vpis: VPI[] = [];
  let piecesLeft = [...list];
  base.vpis.forEach((v, k) => {
    while (piecesLeft.length && v.s >= base.s[piecesLeft[0].i0] - 1e-9) {
      const p = piecesLeft.shift()!;
      p.piece.vpis.forEach((w, j) => { vpiMap.set(`p${list.indexOf(p)}:${j}`, vpis.length); vpis.push({ ...w, s: mapS(p, w.s) }); });
    }
    if (outsideS(v.s) && !list.some(p => Math.abs(v.s - base.s[p.i0]) < 1e-9 || Math.abs(v.s - base.s[p.i1]) < 1e-9)) { vpiMap.set(`b:${k}`, vpis.length); vpis.push({ ...v }); }
  });
  for (const p of piecesLeft) p.piece.vpis.forEach((w, j) => { vpiMap.set(`p${list.indexOf(p)}:${j}`, vpis.length); vpis.push({ ...w, s: mapS(p, w.s) }); });
  out.vpis = vpis;
  out.grades = vpis.slice(1).map((v, k) => (v.z - vpis[k].z) / Math.max(1e-9, v.s - vpis[k].s));
  out.vcurves = [...base.vcurves.filter(c => outsideS(c.s)), ...list.flatMap(p => p.piece.vcurves.map(c => ({ ...c, s: mapS(p, c.s) })))].sort((a, b) => a.s - b.s);
  // bends: the spine's (renumbered) outside, each piece's own inside (radius of the shown line)
  out.curves = [
    ...base.curves.flatMap(c => { const index = baseBend(c.index); return index === null || !outsideS((c.sStart + c.sEnd) / 2) ? [] : [{ ...c, index }]; }),
    // (radii stay the carriageway's own: what is built)
    ...list.flatMap(p => p.piece.curves.map(c => ({ ...c, index: p.bend0 + c.index, sStart: mapS(p, c.sStart), sEnd: mapS(p, c.sEnd) }))),
  ].sort((a, b) => a.index - b.index);
  // problems: the spine's outside the pieces, each piece's inside
  const remap = (v: Violation, bend: (i: number) => number | null, vpi: (i: number) => number | undefined, s: (x: number) => number): Violation => {
    // the words carry the piece's own numbers: its bends and its kilometres
    const text = (t: string) => t
      .replace(/\b([Bb]ends?) (\d+)(?:( and |–)(\d+))?/g, (all, word: string, a: string, sep?: string, b?: string) => {
        const p = bend(Number(a) - 1), q = b === undefined ? null : bend(Number(b) - 1);
        return p === null || (b !== undefined && q === null) ? all : `${word} ${p + 1}${q !== null ? `${sep}${q + 1}` : ''}`;
      })
      .replace(/\bkm (\d+(?:\.\d+)?)/g, (_all, x: string) => `km ${(s(Number(x) * 1000) / 1000).toFixed(x.split('.')[1]?.length ?? 0)}`);
    const out: Violation = { ...v, s0: s(v.s0), s1: s(v.s1), title: text(v.title), fix: text(v.fix), ...(v.detail ? { detail: text(v.detail) } : {}) };
    if (v.pi !== undefined) { const i = bend(v.pi); if (i === null) delete out.pi; else out.pi = i; }
    if (v.pis) out.pis = v.pis.flatMap(i => { const j = bend(i); return j === null ? [] : [j]; });
    if (v.horizontal) out.horizontal = { ...v.horizontal, manualRadii: v.horizontal.manualRadii.flatMap(m => { const j = bend(m.pi); return j === null ? [] : [{ ...m, pi: j }]; }) };
    if (v.vpi !== undefined) { const i = vpi(v.vpi); if (i === undefined) delete out.vpi; else out.vpi = i; }
    if (v.target?.wall) out.target = { ...v.target, wall: { ...v.target.wall, s0: s(v.target.wall.s0), s1: s(v.target.wall.s1) } };
    if (v.target?.auto) out.target = { ...out.target, auto: v.target.auto.flatMap(i => { const j = bend(i); return j === null ? [] : [j]; }) };
    // the player's height pins: by the stitched line's points
    if (v.target?.heightPins || v.target?.movePin || v.target?.smallest !== undefined) {
      const { heightPins, movePin, smallest, ...rest } = out.target!, k = movePin && vpi(movePin.k), m = smallest === undefined ? undefined : vpi(smallest);
      out.target = { ...rest, ...(heightPins ? { heightPins: heightPins.flatMap(i => { const j = vpi(i); return j === undefined ? [] : [j]; }) } : {}),
        ...(movePin && k !== undefined ? { movePin: { k, s: s(movePin.s), z: movePin.z } } : {}), ...(m !== undefined ? { smallest: m } : {}) };
    }
    return out;
  };
  const spineSide = (v: Violation) => list.every(p => v.s1 <= base.s[p.i0] + 1e-9 || v.s0 >= base.s[p.i1] - 1e-9) || (v.s0 === v.s1 && outsideS(v.s0));
  out.violations = [
    // goals: the spine's, except travel time (the caller decides it again on the composed length)
    ...base.violations.filter(v => v.goal && v.kind !== 'time'),
    ...base.violations.filter(v => !v.goal && spineSide(v)).map(v => remap(v, baseBend, k => vpiMap.get(`b:${k}`), s => s)),
    ...list.flatMap((p, j) => p.piece.violations.filter(v => !v.goal).map(v => remap(v, i => p.bend0 + i, k => vpiMap.get(`p${j}:${k}`), s => mapS(p, s)))),
  ];
  out.crossings = [...base.crossings.filter(c => outsideS(c.s)), ...list.flatMap(p => p.piece.crossings.map(c => ({ ...c, s: mapS(p, c.s), i: toI(p, c.i),
    ...(c.targetS !== undefined ? { targetS: mapS(p, c.targetS) } : {}) })))].sort((a, b) => a.s - b.s);
  out.waterCrossings = [...base.waterCrossings.filter(c => outsideS(c.s)), ...list.flatMap(p => p.piece.waterCrossings.map(c => ({ ...c, s: mapS(p, c.s), i: toI(p, c.i) })))];
  out.footprintConflicts = [...base.footprintConflicts.filter(c => outsideI(c.i)), ...list.flatMap(p => p.piece.footprintConflicts.map(c => ({ ...c, i: toI(p, c.i),
    s0: mapS(p, c.s0), s1: mapS(p, c.s1), ...(c.allocations ? { allocations: c.allocations.map(a => ({ ...a, i: toI(p, a.i) })) } : {}) })))];
  out.retainingWalls = [...base.retainingWalls.filter(w => outsideI(w.i)), ...list.flatMap(p => p.piece.retainingWalls.map(w => ({ ...w, i: toI(p, w.i), s0: mapS(p, w.s0), s1: mapS(p, w.s1) })))];
  // buildings a retaining wall keeps clear: the spine's beside the pieces, each piece's own
  out.walledOff = [...base.walledOff.filter(w => list.every(p => w.s1 <= base.s[p.i0] + 1e-9 || w.s0 >= base.s[p.i1] - 1e-9)),
    ...list.flatMap(p => p.piece.walledOff.map(w => ({ ...w, s0: mapS(p, w.s0), s1: mapS(p, w.s1) })))];
  out.walls = [...base.walls.filter(w => list.every(p => w.i1 <= p.i0 || w.i0 >= p.i1)), ...list.flatMap(p => p.piece.walls.map(w => ({ ...w, i0: toI(p, w.i0), i1: toI(p, w.i1), s0: mapS(p, w.s0), s1: mapS(p, w.s1) })))];
  const byI = <T extends { i: number }>(own: readonly T[], f: (p: StitchPiece) => readonly T[]) => [...own.filter(b => outsideI(b.i)), ...list.flatMap(p => f(p).map(b => ({ ...b, i: toI(p, b.i) })))];
  out.demolished = byI(base.demolished, p => p.piece.demolished);
  out.boughtOut = byI(base.boughtOut, p => p.piece.boughtOut);
  out.kept = byI(base.kept, p => p.piece.kept);
  // one house, one decision: a house the spine and a piece both take is listed once (the piece's)
  for (const key of ['demolished', 'boughtOut'] as const) {
    const seen = new Set<number>();
    out[key] = (out[key] as { j: number; i: number; cost: number }[]).reverse().filter(b => !seen.has(b.j) && !!seen.add(b.j)).reverse() as never;
  }
  const receivers = [...base.noise.receivers.filter(r => outsideI(r.i)), ...list.flatMap(p => p.piece.noise.receivers.map(r => ({ ...r, i: toI(p, r.i),
    at: r.at >= 0 ? toI(p, r.at) : r.at, window: [toI(p, r.window[0]), toI(p, r.window[1])] as [number, number],
    ...(r.span ? { span: [toI(p, r.span[0]), toI(p, r.span[1])] as [number, number] } : {}) })))];
  const seenR = new Set<number>();
  out.noise = { ...base.noise, ...noise, receivers: receivers.reverse().filter(r => !seenR.has(r.j) && !!seenR.add(r.j)).reverse() };
  out.wallsAroundChoices = [...(base.wallsAroundChoices ?? []).filter(w => list.every(p => w.i1 <= p.i0 || w.i0 >= p.i1)),
    ...list.flatMap(p => (p.piece.wallsAroundChoices ?? []).map(w => ({ ...w, i0: toI(p, w.i0), i1: toI(p, w.i1), s0: mapS(p, w.s0), s1: mapS(p, w.s1) })))];
  // quantities a player reads: recounted from the composed lists; the rest stay the spine's
  const bridgeRuns = out.runs.filter(r => r.kind === 1), tunnelRuns = out.runs.filter(r => r.kind === 2);
  let cut = 0, fill = 0, footprint = 0, forestArea = 0;
  for (let i = 0; i < n; i++) {
    const len = cellLength(i, n, ds);
    cut += out.cut[i] * len; fill += out.fill[i] * len; footprint += out.cell.width[i] * len; forestArea += out.cell.width[i] * out.cell.forest[i] * len;
  }
  const scaleCut = base.quantities.cut > 0 ? cut / base.quantities.cut : 1;
  out.quantities = { ...base.quantities, cut, fill, footprint, forestArea,
    cutByClass: base.quantities.cutByClass.map(v => v * scaleCut) as [number, number, number],
    buildingsHit: out.demolished.length, hitBuildings: out.demolished.map(b => b.j),
    bridgeLength: bridgeRuns.reduce((t, r) => t + r.length, 0), tunnelLength: tunnelRuns.reduce((t, r) => t + r.length, 0),
    bridges: bridgeRuns.length, tunnels: tunnelRuns.length,
    wallLength: out.walls.reduce((t, w) => t + (w.s1 - w.s0), 0), noiseBuyouts: out.boughtOut.length,
    crossingsPaid: out.crossings.filter(c => c.cost > 0).length };
  // travel: the spine's time outside, each piece's own inside
  const perM = base.travelMin / base.length;
  out.travelMin = base.travelMin + list.reduce((t, p) => t + p.piece.travelMin - perM * (base.s[p.i1] - base.s[p.i0]), 0);
  out.profileFeasible = base.profileFeasible && list.every(p => p.piece.profileFeasible);
  out.geomViolations = out.violations.filter(v => !v.goal).length;
  out.valid = out.violations.length === 0;
  if (list.some(p => p.piece.preview)) out.preview = true;
  return out;
}

/** The composed noise source on the spine's stations: the spine's cells outside the pieces (its two
 * directional lines), each piece's own inside (its carriageway axis, its screens, its line carrying the whole
 * traffic), with the walls built there. The noise band and the house cards sum it like any route's. Limit: a
 * piece decided its houses without the spine's cells beyond its joins (and the spine its own without the
 * piece): near a join a card can show a little more than the decision heard. */
function stitchSource(base: Result, list: readonly StitchPiece[]): Pick<Result['noise'], 'source' | 'L' | 'R'> {
  const src = base.noise.source, n = base.n;
  if (!src || list.some(p => !p.piece.noise.source)) return { source: null, L: base.noise.L, R: base.noise.R };
  const F = (a: ArrayLike<number>) => Float64Array.from(a);
  const screen = (q: SideScreen): SideScreen => ({ shield: Uint8Array.from(q.shield), edgeOff: F(q.edgeOff), edgeTop: F(q.edgeTop),
    edgeLane: Uint8Array.from(q.edgeLane), wallOff: F(q.wallOff), wallFoot: F(q.wallFoot), gap: Uint8Array.from(q.gap) });
  // its lines per cell, as two: the spine's two directions (±6 m, half each), a piece's one (all of it)
  const at = (v: number | ArrayLike<number>, i: number) => (typeof v === 'number' ? v : v[i]);
  const line = (s: AcousticSource, k: number, i: number): [number, number] => {
    const l = s.lanes?.[k];
    return l ? [at(l.pos, i), at(l.share, i)] : k === 0 ? [0, 1] : [0, 0];
  };
  const out: AcousticSource = { ...src, x: F(src.x), y: F(src.y), tx: F(src.tx), ty: F(src.ty), grade: F(src.grade), len: F(src.len),
    L: screen(src.L), R: screen(src.R), weight: new Float64Array(n).fill(1) };
  const pos = [new Float64Array(n), new Float64Array(n)], share = [new Float64Array(n), new Float64Array(n)];
  for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) [pos[k][i], share[k][i]] = line(src, k, i);
  const L = F(base.noise.L), R = F(base.noise.R), weight = out.weight as Float64Array;
  for (const p of list) {
    const q = p.piece.noise.source!, m = p.piece.n;
    const w = dm.pow(10, (q.dayDb - src.dayDb) / 10), len = p.piece.length / Math.max(1, p.i1 - p.i0);
    for (let i = p.i0 + 1; i < p.i1; i++) {
      const k = Math.max(0, Math.min(m - 1, Math.round((i - p.i0) / (p.i1 - p.i0) * (m - 1))));
      (out.x as Float64Array)[i] = q.x[k]; (out.y as Float64Array)[i] = q.y[k]; (out.tx as Float64Array)[i] = q.tx[k]; (out.ty as Float64Array)[i] = q.ty[k];
      (out.grade as Float64Array)[i] = q.grade[k]; (out.len as Float64Array)[i] = len;
      for (const side of ['L', 'R'] as const) {
        const a = out[side], b = q[side];
        a.shield[i] = b.shield[k]; a.edgeOff[i] = b.edgeOff[k]; a.edgeTop[i] = b.edgeTop[k]; a.edgeLane[i] = b.edgeLane[k];
        a.wallOff[i] = b.wallOff[k]; a.wallFoot[i] = b.wallFoot[k]; a.gap[i] = b.gap[k];
      }
      for (let l = 0; l < 2; l++) [pos[l][i], share[l][i]] = line(q, l, k);
      weight[i] = w;
      L[i] = p.piece.noise.L[k] ?? 0; R[i] = p.piece.noise.R[k] ?? 0;
    }
  }
  out.lanes = [{ pos: pos[0], share: share[0] }, { pos: pos[1], share: share[1] }];
  return { source: out, L, R };
}

/** Stations i0…i1 of a result as a result of their own (chainage from 0): for drawing a part of it. */
export function sliceResult(r: Result, i0: number, i1: number): Result {
  const s0 = r.s[i0], n = i1 - i0 + 1;
  const cut = <T extends Float64Array | Float32Array | Uint8Array>(a: T) => a.slice(i0, i1 + 1) as T;
  const inI = (i: number) => i >= i0 && i <= i1, at = (i: number) => i - i0, sh = (s: number) => s - s0;
  const parts = Object.fromEntries(PART_KEYS.map(k => [k, cut(r.parts[k])])) as CostParts;
  const inS = (s: number) => s >= s0 - 1e-9 && s <= r.s[i1] + 1e-9;
  return {
    ...r, length: r.s[i1] - s0, n, s: Float64Array.from(cut(r.s), v => v - s0), x: cut(r.x), y: cut(r.y), tx: cut(r.tx), ty: cut(r.ty),
    ground: cut(r.ground), geology: { ids: cut(r.geology.ids), profiles: r.geology.profiles }, grade: cut(r.grade), kind: cut(r.kind),
    cut: cut(r.cut), fill: cut(r.fill), dayL: cut(r.dayL), dayR: cut(r.dayR), zDayL: cut(r.zDayL), zDayR: cut(r.zDayR), oob: cut(r.oob),
    wallSurfaceL: cut(r.wallSurfaceL), wallSurfaceR: cut(r.wallSurfaceR),
    cell: { width: cut(r.cell.width), urban: cut(r.cell.urban), forest: cut(r.cell.forest), wall: cut(r.cell.wall),
      wallLength: cut(r.cell.wallLength), wallArea: cut(r.cell.wallArea) },
    parts, cost: sumParts(parts),
    runs: r.runs.filter(x => inI(x.i0) && inI(x.i1)).map(x => ({ ...x, i0: at(x.i0), i1: at(x.i1), s0: sh(x.s0), s1: sh(x.s1),
      ...(x.pierStations ? { pierStations: x.pierStations.map(sh) } : {}),
      ...(x.arch ? { arch: { ...x.arch, s0: sh(x.arch.s0), s1: sh(x.arch.s1) } } : {}) })),
    vpis: r.vpis.filter(v => inS(v.s)).map(v => ({ ...v, s: sh(v.s) })), vcurves: r.vcurves.filter(v => inS(v.s)).map(v => ({ ...v, s: sh(v.s) })),
    curves: r.curves.filter(c => inS(c.sStart) && inS(c.sEnd)).map(c => ({ ...c, sStart: sh(c.sStart), sEnd: sh(c.sEnd) })),
    violations: r.violations.filter(v => inS(v.s0) || inS(v.s1)).map(v => ({ ...v, s0: Math.max(0, sh(v.s0)), s1: Math.min(r.s[i1] - s0, sh(v.s1)) })),
    crossings: r.crossings.filter(c => inI(c.i)).map(c => ({ ...c, i: at(c.i), s: sh(c.s), ...(c.targetS !== undefined ? { targetS: sh(c.targetS) } : {}) })),
    cones: r.cones?.filter(c => inI(c.i) && inI(c.earthCell)).map(c => ({ ...c, i: at(c.i), earthCell: at(c.earthCell), s: sh(c.s) })),
    waterCrossings: r.waterCrossings.filter(c => inI(c.i)).map(c => ({ ...c, i: at(c.i), s: sh(c.s) })),
    footprintConflicts: r.footprintConflicts.filter(c => inI(c.i)).map(c => ({ ...c, i: at(c.i), s0: sh(c.s0), s1: sh(c.s1),
      ...(c.allocations ? { allocations: c.allocations.filter(a => inI(a.i)).map(a => ({ ...a, i: at(a.i) })) } : {}) })),
    retainingWalls: r.retainingWalls.filter(w => inI(w.i)).map(w => ({ ...w, i: at(w.i), s0: sh(w.s0), s1: sh(w.s1) })),
    walledOff: r.walledOff.filter(w => inS(w.s0) || inS(w.s1)).map(w => ({ ...w, s0: Math.max(0, sh(w.s0)), s1: Math.min(r.s[i1] - s0, sh(w.s1)) })),
    walls: r.walls.filter(w => inI(w.i0) && inI(w.i1)).map(w => ({ ...w, i0: at(w.i0), i1: at(w.i1), s0: sh(w.s0), s1: sh(w.s1) })),
    demolished: r.demolished.filter(b => inI(b.i)).map(b => ({ ...b, i: at(b.i) })),
    boughtOut: r.boughtOut.filter(b => inI(b.i)).map(b => ({ ...b, i: at(b.i) })),
    kept: r.kept.filter(b => inI(b.i)).map(b => ({ ...b, i: at(b.i) })),
    noise: { ...r.noise, receivers: r.noise.receivers.filter(x => inI(x.i)).map(x => ({ ...x, i: at(x.i),
      at: x.at >= 0 ? at(x.at) : x.at, window: [Math.max(0, at(x.window[0])), Math.min(n - 1, at(x.window[1]))] as [number, number] })),
      source: r.noise.source ? sliceSource(r.noise.source, i0, i1) : null, L: r.noise.L.slice(i0, i1 + 1), R: r.noise.R.slice(i0, i1 + 1) },
    quantities: { ...r.quantities, massHaul: cut(r.quantities.massHaul) },
  };
}

/** cells i0…i1 of a noise source */
function sliceSource(src: AcousticSource, i0: number, i1: number): AcousticSource {
  const c = (a: ArrayLike<number>) => Float64Array.prototype.slice.call(Float64Array.from(a), i0, i1 + 1);
  const scr = (q: SideScreen): SideScreen => ({ shield: q.shield.slice(i0, i1 + 1), edgeOff: q.edgeOff.slice(i0, i1 + 1), edgeTop: q.edgeTop.slice(i0, i1 + 1),
    edgeLane: q.edgeLane.slice(i0, i1 + 1), wallOff: q.wallOff.slice(i0, i1 + 1), wallFoot: q.wallFoot.slice(i0, i1 + 1), gap: q.gap.slice(i0, i1 + 1) });
  return { ...src, n: i1 - i0 + 1, x: c(src.x), y: c(src.y), tx: c(src.tx), ty: c(src.ty), grade: c(src.grade), len: c(src.len), L: scr(src.L), R: scr(src.R),
    ...(src.weight ? { weight: c(src.weight) } : {}),
    ...(src.lanes ? { lanes: src.lanes.map(l => ({ pos: typeof l.pos === 'number' ? l.pos : c(l.pos), share: typeof l.share === 'number' ? l.share : c(l.share) })) } : {}) };
}
