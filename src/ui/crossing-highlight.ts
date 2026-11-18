// The selected crossing's works, outlined on the map: the crossed road's rebuilt stretch (ramps, deck,
// lowered cut, box), its new roads (a reroute) and the side roads regraded to meet it. A player who
// selects a crossing sees everything it builds, also the new road kilometres away from the crossing.
// A way cut at our road with nothing new built for a part (way-pieces.ts): that part is lit up dashed from where it
// now ends, an end bar beyond our earthworks, to where it meets the road it still reaches (a dot).
import './link-edit.css';
import type { Result } from '../core/evaluate';
import type { View } from '../render/view';

type XY = { x: number; y: number; z?: number };
/** The end bar across a part's end, screen px either side of its line (longer than its end handle, ui/link-edit.ts). */
const BAR = 15;

export class CrossingHighlight {
  private svg: SVGSVGElement;
  private lines: SVGPathElement[] = [];
  private pieces: SVGPathElement[] = [];
  private bars: SVGPathElement[] = [];
  private joins: SVGCircleElement[] = [];

  constructor(private view: View, overlay: HTMLElement, private host: { selected(): number | null; result(): Result | null | undefined; heightAt(x: number, y: number): number }) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('crossing-works');
    overlay.prepend(this.svg);
    view.addRenderListener(() => this.place());
  }
  /** after a selection or result change */
  refresh() { this.place(); }
  private grow<T extends SVGElement>(list: T[], n: number, tag: string, cls: string) {
    while (list.length < n) {
      const e = document.createElementNS('http://www.w3.org/2000/svg', tag) as T;
      e.classList.add(cls); this.svg.appendChild(e); list.push(e);
    }
  }
  private place() {
    const roadId = this.host.selected();
    const crossings = roadId === null ? [] : (this.host.result()?.crossings ?? []).filter(c => c.roadId === roadId);
    const paths = crossings.flatMap(c => {
      const g = c.geometry;
      // (a designed road draws its own body; one high above our bridge is not at this copy's ground level)
      return g ? [...(g.road && !c.above ? [g.road] : []), ...(g.links ?? []), ...(g.ties ?? []).map(t => t.path)] : [];
    }).filter(p => p.length > 1);
    // the parts that just end: from their end to the road they reach (nothing built on them)
    const pieces = crossings.flatMap(c => (c.closure?.reach ?? []).flatMap((r, k) => r && c.closure!.connected[k] && r.path.length > 1 ? [r.path] : []));
    const z = (p: XY) => (p.z ?? this.host.heightAt(p.x, p.y)) + 0.3;
    const stroke = (path: readonly XY[]) => {
      // (a point off the view breaks the line: each visible run is its own stroke)
      let d = '', open = false;
      for (const p of path) {
        const q = this.view.project(p.x, p.y, z(p));
        if (!q.vis) { open = false; continue; }
        d += `${open ? 'L' : 'M'}${q.sx.toFixed(1)},${q.sy.toFixed(1)}`; open = true;
      }
      return d;
    };
    this.grow(this.lines, paths.length, 'path', 'works');
    this.lines.forEach((l, k) => l.setAttribute('d', paths[k] ? stroke(paths[k]) : ''));
    this.grow(this.pieces, pieces.length, 'path', 'piece');
    this.grow(this.bars, pieces.length, 'path', 'piece-end');
    this.grow(this.joins, pieces.length, 'circle', 'piece-join');
    this.pieces.forEach((l, k) => l.setAttribute('d', pieces[k] ? stroke(pieces[k]) : ''));
    this.bars.forEach((l, k) => {
      const path = pieces[k];
      if (!path) { l.setAttribute('d', ''); return; }
      // (across the part's line where it ends: its first metres give the direction)
      const a = this.view.project(path[0].x, path[0].y, z(path[0]));
      const next = path.find(p => Math.hypot(p.x - path[0].x, p.y - path[0].y) > 2) ?? path[1], b = this.view.project(next.x, next.y, z(next));
      const dx = b.sx - a.sx, dy = b.sy - a.sy, len = Math.hypot(dx, dy) || 1, nx = -dy / len * BAR, ny = dx / len * BAR;
      l.setAttribute('d', a.vis ? `M${(a.sx + nx).toFixed(1)},${(a.sy + ny).toFixed(1)}L${(a.sx - nx).toFixed(1)},${(a.sy - ny).toFixed(1)}` : '');
    });
    this.joins.forEach((l, k) => {
      const p = pieces[k]?.[pieces[k].length - 1], q = p && this.view.project(p.x, p.y, z(p));
      l.setAttribute('r', q?.vis ? '5' : '0');
      if (q?.vis) { l.setAttribute('cx', q.sx.toFixed(1)); l.setAttribute('cy', q.sy.toFixed(1)); }
    });
  }
}
