// Mapped railway tunnels (a pack's structures.json `rail`, pipeline/build_structures.py; research/107).
//
// The overlays' railway raster (pipeline/build_pack.py) draws every mapped railway, its tunnels too, so a road over a
// tunnel met "the railway" at the ground: a forced bridge, a railway crossing's card and bill. OSM gives no height; a
// tunnel's rails run straight between the ground at its two portals (the cutting's floor just outside them), as the
// game reads a mapped road tunnel (mapped-structures.ts). Where the ground is at least RAIL_TUNNEL_OVER above them the
// tunnel is underground: its cells leave the raster (`clearUnderground`, once as the pack loads), and our road meets it
// only as a level to keep clear of (`crossings`: above it by RAIL_TUNNEL_OVER, or under it by `RAIL_TUNNEL_UNDER`).
// Nearer its portals it stays the railway at the ground it was.
// Limits: a surface railway drawn within 1.5 cells of a tunnel's deep stretch (crossing over it) would be cleared with it
// (none in the packs); our road running along over a tunnel without crossing its line is not held off it; a stream over
// it within the same station is one band with it for the grade search (over both or under both).

import { RAIL_TUNNEL, RAIL_TUNNEL_OVER } from './data/railway';
import { TUNNEL_RULES } from './data/prices';

/** A pack's railway tunnels: polylines in local metres (x0, y0, x1, y1, …), portal to portal, and their OSM ways. */
export interface RailStructureData { ways: number[][]; kind: string[]; osm?: string[][] }

/** Our grade at least this far under a railway tunnel's rails to pass under it: its floor, its lining and our own
 * tunnel's height over our grade (TUNNEL_RULES.structureHeight), m. */
export const RAIL_TUNNEL_UNDER = RAIL_TUNNEL.invert + RAIL_TUNNEL.lining + TUNNEL_RULES.structureHeight;

interface Ground { heightAt(x: number, y: number): number; isOob(x: number, y: number): boolean }
interface Laid { xy: number[]; d: number[]; z0: number; z1: number; box: [number, number, number, number] }

/** How far beyond each portal the ground is read for its rails' level (the lowest of it: the cutting's floor, not the
 * hillside over the portal face that OSM's end node may fall on), m. Railway grades are a few ‰: 15 m is centimetres. */
const PORTAL_READ = [0, 5, 10, 15];

export class RailTunnels {
  readonly laid: readonly Laid[];
  constructor(readonly data: RailStructureData, ground: Ground) {
    const laid: Laid[] = [];
    data.ways.forEach((xy, k) => {
      if (data.kind[k] !== 'tunnel' || xy.length < 4) return;
      const n = xy.length / 2, d = [0];
      for (let j = 1; j < n; j++) d.push(d[j - 1] + Math.hypot(xy[2 * j] - xy[2 * j - 2], xy[2 * j + 1] - xy[2 * j - 1]));
      if (!(d[n - 1] > 0)) return;
      // (a portal outside the map: no level for it, the tunnel stays in the raster as it was)
      const portal = (j: number, k2: number) => {
        const x = xy[2 * j], y = xy[2 * j + 1], l = Math.hypot(x - xy[2 * k2], y - xy[2 * k2 + 1]) || 1;
        const ux = (x - xy[2 * k2]) / l, uy = (y - xy[2 * k2 + 1]) / l;
        if (ground.isOob(x, y)) return NaN;
        return Math.min(...PORTAL_READ.map(r => ground.isOob(x + ux * r, y + uy * r) ? Infinity : ground.heightAt(x + ux * r, y + uy * r)));
      };
      const z0 = portal(0, 1), z1 = portal(n - 1, n - 2);
      if (!Number.isFinite(z0) || !Number.isFinite(z1)) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let j = 0; j < n; j++) { x0 = Math.min(x0, xy[2 * j]); y0 = Math.min(y0, xy[2 * j + 1]); x1 = Math.max(x1, xy[2 * j]); y1 = Math.max(y1, xy[2 * j + 1]); }
      laid.push({ xy, d, z0, z1, box: [x0, y0, x1, y1] });
    });
    this.laid = laid;
  }

  /** The rails' level of a tunnel at chainage `at` along it. */
  private level(t: Laid, at: number): number {
    const total = t.d[t.d.length - 1];
    return t.z0 + (t.z1 - t.z0) * at / total;
  }

  /** The nearest point of a tunnel to (x, y) within `reach`: its distance and the rails' level there. */
  private nearest(t: Laid, x: number, y: number, reach: number): { e: number; level: number } | undefined {
    if (x < t.box[0] - reach || x > t.box[2] + reach || y < t.box[1] - reach || y > t.box[3] + reach) return undefined;
    let best = reach * reach, at = NaN;
    for (let j = 0; j + 3 < t.xy.length; j += 2) {
      const ax = t.xy[j], ay = t.xy[j + 1], dx = t.xy[j + 2] - ax, dy = t.xy[j + 3] - ay, len2 = dx * dx + dy * dy;
      const u = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
      const e = (x - ax - u * dx) ** 2 + (y - ay - u * dy) ** 2;
      if (e <= best) { best = e; at = t.d[j / 2] + u * (t.d[j / 2 + 1] - t.d[j / 2]); }
    }
    return Number.isNaN(at) ? undefined : { e: Math.sqrt(best), level: this.level(t, at) };
  }

  /** Take the underground stretches out of the railway raster: every cell drawn as railway (its class or its crossing
   * bit) within 1.5 cells of a tunnel where the ground is at least RAIL_TUNNEL_OVER above its rails loses its crossing
   * bit; one of the railway's class takes the commonest other class around it (what the railway was drawn over), any
   * other class is kept. Idempotent (a second pass finds no railway cells left there), so the evaluation workers may
   * apply it to the cells they are handed. */
  clearUnderground(lc: Uint8Array, g: { nx: number; ny: number; cell: number; height: number; heightAt(x: number, y: number): number },
    bits: { classMask: number; rail: number; railBit: number }): number {
    const { nx, ny, cell } = g, reach = 1.5 * cell, isRail = (v: number) => (v & bits.railBit) !== 0 || (v & bits.classMask) === bits.rail;
    const cleared: number[] = [];
    for (const t of this.laid) {
      const c0 = Math.max(0, Math.floor((t.box[0] - reach) / cell)), c1 = Math.min(nx - 1, Math.floor((t.box[2] + reach) / cell));
      const r0 = Math.max(0, Math.floor((g.height - t.box[3] - reach) / cell)), r1 = Math.min(ny - 1, Math.floor((g.height - t.box[1] + reach) / cell));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const i = r * nx + c;
        if (!isRail(lc[i])) continue;
        const x = (c + 0.5) * cell, y = g.height - (r + 0.5) * cell, near = this.nearest(t, x, y, reach);
        if (near && g.heightAt(x, y) - near.level >= RAIL_TUNNEL_OVER) cleared.push(i);
      }
    }
    if (!cleared.length) return 0;
    const out = new Map<number, number>();
    for (const i of cleared) {
      const r = Math.floor(i / nx), c = i % nx, count = new Array<number>(bits.classMask + 1).fill(0);
      if (out.has(i)) continue; // (near two tunnels)
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= ny || cc >= nx) continue;
        const v = lc[rr * nx + cc];
        if (!isRail(v)) count[v & bits.classMask]++;
      }
      let cls = lc[i] & bits.classMask;
      if (cls === bits.rail) { cls = 0; for (let k = 1; k < count.length; k++) if (count[k] > count[cls]) cls = k; }
      out.set(i, (lc[i] & ~bits.classMask & ~bits.railBit) | cls);
    }
    for (const [i, v] of out) lc[i] = v;
    return out.size;
  }

  /** Where a polyline (chainages `s`, points `x`, `y`) crosses a tunnel: the chainage there, the point and the rails'
   * level under it, in chainage order. */
  crossings(n: number, s: ArrayLike<number>, x: ArrayLike<number>, y: ArrayLike<number>): { s: number; x: number; y: number; level: number }[] {
    const out: { s: number; x: number; y: number; level: number }[] = [];
    if (!this.laid.length || n < 2) return out;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (let i = 0; i < n; i++) { bx0 = Math.min(bx0, x[i]); by0 = Math.min(by0, y[i]); bx1 = Math.max(bx1, x[i]); by1 = Math.max(by1, y[i]); }
    for (const t of this.laid) {
      if (t.box[0] > bx1 || t.box[2] < bx0 || t.box[1] > by1 || t.box[3] < by0) continue;
      for (let j = 0; j + 3 < t.xy.length; j += 2) {
        const ax = t.xy[j], ay = t.xy[j + 1], ex = t.xy[j + 2] - ax, ey = t.xy[j + 3] - ay;
        const sx0 = Math.min(ax, ax + ex), sx1 = Math.max(ax, ax + ex), sy0 = Math.min(ay, ay + ey), sy1 = Math.max(ay, ay + ey);
        for (let i = 0; i + 1 < n; i++) {
          const px = x[i], py = y[i], qx = x[i + 1] - px, qy = y[i + 1] - py;
          if (Math.max(px, px + qx) < sx0 || Math.min(px, px + qx) > sx1 || Math.max(py, py + qy) < sy0 || Math.min(py, py + qy) > sy1) continue;
          const den = qx * ey - qy * ex;
          if (den === 0) continue;
          const u = ((ax - px) * ey - (ay - py) * ex) / den, v = ((ax - px) * qy - (ay - py) * qx) / den;
          // (a point where two of either's segments meet belongs to the later one; our line's end to its last)
          if (u < 0 || (u >= 1 && i + 2 < n) || u > 1 || v < 0 || (v >= 1 && j + 4 < t.xy.length) || v > 1) continue;
          const at = t.d[j / 2] + v * (t.d[j / 2 + 1] - t.d[j / 2]);
          out.push({ s: s[i] + u * (s[i + 1] - s[i]), x: px + u * qx, y: py + u * qy, level: this.level(t, at) });
        }
      }
    }
    return out.sort((p, q) => p.s - q.s);
  }
}
