// The selected crossing's works, outlined on the map: the crossed road's rebuilt stretch (ramps, deck,
// lowered cut, box), its new roads (a reroute) and the side roads regraded to meet it. A player who
// selects a crossing sees everything it builds, also the new road kilometres away from the crossing.
import './link-edit.css';
import type { Result } from '../core/evaluate';
import type { View } from '../render/view';

export class CrossingHighlight {
  private svg: SVGSVGElement;
  private lines: SVGPathElement[] = [];

  constructor(private view: View, overlay: HTMLElement, private host: { selected(): number | null; result(): Result | null | undefined }) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('crossing-works');
    overlay.prepend(this.svg);
    view.addRenderListener(() => this.place());
  }
  /** after a selection or result change */
  refresh() { this.place(); }
  private place() {
    const roadId = this.host.selected();
    const paths = roadId === null ? [] : (this.host.result()?.crossings ?? []).filter(c => c.roadId === roadId).flatMap(c => {
      const g = c.geometry;
      return g ? [...(g.road ? [g.road] : []), ...(g.links ?? []), ...(g.ties ?? []).map(t => t.path)] : [];
    }).filter(p => p.length > 1);
    while (this.lines.length < paths.length) {
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.svg.appendChild(l); this.lines.push(l);
    }
    this.lines.forEach((l, k) => {
      const path = paths[k];
      if (!path) { l.setAttribute('d', ''); return; }
      // (a point off the view breaks the line: each visible run is its own stroke)
      let d = '', open = false;
      for (const p of path) {
        const q = this.view.project(p.x, p.y, p.z + 0.3);
        if (!q.vis) { open = false; continue; }
        d += `${open ? 'L' : 'M'}${q.sx.toFixed(1)},${q.sy.toFixed(1)}`; open = true;
      }
      l.setAttribute('d', d);
    });
  }
}
