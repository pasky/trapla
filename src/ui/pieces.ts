// The road cut into pieces a player thinks in: bridges, tunnels, cuts and embankments. A click on the
// road (map or profile) selects the piece under it; the HUD lists the most expensive ones.
import { PART_KEYS } from '../core/cost';
import type { Result } from '../core/evaluate';
import { KIND } from '../core/structures';

export type PieceKind = 'bridge' | 'tunnel' | 'cut' | 'fill';
export interface Piece { kind: PieceKind; i0: number; i1: number; s0: number; s1: number }

/** earthwork pieces shorter than this merge into a neighbour, m */
const MIN_EARTH = 120;

/** station cell → piece kind */
function cellKind(r: Result, i: number): PieceKind {
  if (r.kind[i] === KIND.bridge) return 'bridge';
  if (r.kind[i] === KIND.tunnel) return 'tunnel';
  return r.grade[i] >= r.ground[i] ? 'fill' : 'cut';
}

const memo = new WeakMap<Result, Piece[]>();

/** all pieces along the route, in order */
export function pieces(r: Result): Piece[] {
  const hit = memo.get(r);
  if (hit) return hit;
  const runs: Piece[] = [];
  for (let i = 0; i < r.n; i++) {
    const k = cellKind(r, i), last = runs[runs.length - 1];
    if (last && last.kind === k) last.i1 = i; else runs.push({ kind: k, i0: i, i1: i, s0: 0, s1: 0 });
  }
  // short cuts / embankments join their longer earthwork neighbour (a dip of 30 m is not a piece)
  const earth = (p: Piece) => p.kind === 'cut' || p.kind === 'fill';
  const len = (p: Piece) => (p.i1 - p.i0 + 1) * r.ds;
  for (let changed = true; changed;) {
    changed = false;
    let k = -1, shortest = MIN_EARTH;
    runs.forEach((p, j) => { if (earth(p) && len(p) < shortest && (earth(runs[j - 1] ?? p) || earth(runs[j + 1] ?? p))) { shortest = len(p); k = j; } });
    if (k < 0) break;
    const a = runs[k - 1], b = runs[k + 1], p = runs[k];
    const into = a && earth(a) && (!b || !earth(b) || len(a) >= len(b)) ? a : b && earth(b) ? b : null;
    if (!into) break;
    into.i0 = Math.min(into.i0, p.i0); into.i1 = Math.max(into.i1, p.i1);
    runs.splice(k, 1);
    // neighbours of the same kind now touch: join them
    for (let j = 1; j < runs.length; j++) if (runs[j].kind === runs[j - 1].kind) { runs[j - 1].i1 = runs[j].i1; runs.splice(j, 1); j--; }
    changed = true;
  }
  for (const p of runs) { p.s0 = Math.max(0, (p.i0 - 0.5) * r.ds); p.s1 = Math.min(r.length, (p.i1 + 0.5) * r.ds); }
  memo.set(r, runs);
  return runs;
}

/** the piece at station s */
export function pieceAt(r: Result, s: number): Piece {
  const i = Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds)));
  return pieces(r).find((p) => i >= p.i0 && i <= p.i1) ?? { kind: cellKind(r, i), i0: i, i1: i, s0: s, s1: s };
}

/** cost of station cells i0…i1, CZK */
export function cellsCost(r: Result, i0: number, i1: number): number {
  let c = 0;
  for (const k of PART_KEYS) { const a = r.parts[k]; for (let i = i0; i <= i1; i++) c += a[i]; }
  return c;
}

/** highest embankment / deepest cut / bridge height / tunnel cover over the cells, m */
export function pieceDepth(r: Result, i0: number, i1: number): number {
  let m = 0;
  for (let i = i0; i <= i1; i++) m = Math.max(m, Math.abs(r.grade[i] - r.ground[i]));
  return m;
}

export const PIECE_NAME: Record<PieceKind, string> = { bridge: 'Bridge', tunnel: 'Tunnel', cut: 'Cut', fill: 'Embankment' };

/** the most expensive pieces (cost per piece), most expensive first */
export function topPieces(r: Result, n = 5): (Piece & { cost: number })[] {
  return pieces(r).map((p) => ({ ...p, cost: cellsCost(r, p.i0, p.i1) })).sort((a, b) => b.cost - a.cost).slice(0, n);
}
