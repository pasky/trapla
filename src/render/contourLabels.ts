// Elevation labels on major contour lines. When the camera comes to rest, a coarse grid of screen
// points is picked on the terrain and each is slid along the slope to the nearest major contour; the
// labels are anchored in the world, so they follow the terrain while the camera moves and are laid out
// afresh at the next rest.

import type { Terrain } from '../core/terrain';

interface Screen { sx: number; sy: number; vis: boolean; dist: number }

const COLS = 6, ROWS = 4, MAX_LABELS = 16;
const MIN_GAP = 130; // px between labels
const MAX_SLIDE = 140; // px a grid point may be moved to reach a contour

export class ContourLabels {
  private labels: { el: HTMLElement; x: number; y: number; z: number; on: boolean }[] = [];
  private timer = 0;
  private major = 0;

  constructor(private overlay: HTMLElement, private canvas: HTMLElement, private terrain: Terrain,
    private pick: (clientX: number, clientY: number) => { x: number; y: number } | null,
    private screenOf: (x: number, y: number, z: number) => Screen, private requestRender: () => void) {}

  /** lay the labels out again once the view has been still for a moment; major = 0 hides them */
  schedule(major: number) {
    this.major = major;
    clearTimeout(this.timer);
    if (!major) { this.layout(); return; }
    this.timer = window.setTimeout(() => this.layout(), 220);
  }

  private layout() {
    const T = this.terrain, major = this.major;
    const found: { x: number; y: number; z: number; sx: number; sy: number }[] = [];
    if (major) {
      const r = this.canvas.getBoundingClientRect();
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
        // staggered grid, clear of the buttons at the top and the legend at the bottom
        const fx = (i + 0.3 + 0.4 * (j % 2)) / COLS, fy = 0.1 + (0.8 * (j + 0.5)) / ROWS;
        const p = this.pick(r.left + fx * r.width, r.top + fy * r.height);
        if (!p) continue;
        let { x, y } = p;
        const s0 = this.screenOf(x, y, T.heightAt(x, y));
        const mPerPx = s0.dist / Math.max(200, r.height); // ≈ ground size of a pixel there (45° lens)
        const target = Math.round(T.heightAt(x, y) / major) * major;
        let ok = false;
        for (let it = 0; it < 8; it++) {
          const h = T.heightAt(x, y);
          if (Math.abs(h - target) < 0.15) { ok = true; break; }
          const gx = (T.heightAt(x + 5, y) - T.heightAt(x - 5, y)) / 10, gy = (T.heightAt(x, y + 5) - T.heightAt(x, y - 5)) / 10;
          const g2 = gx * gx + gy * gy;
          if (g2 < 1e-5) break;
          // damped Newton step along the gradient
          const k = Math.max(-40, Math.min(40, (target - h) / Math.sqrt(g2))) / Math.sqrt(g2);
          x += gx * k; y += gy * k;
        }
        if (!ok || T.isOob(x, y) || Math.hypot(x - p.x, y - p.y) > MAX_SLIDE * mPerPx) continue;
        const s = this.screenOf(x, y, target);
        if (!s.vis || s.sx < 40 || s.sx > r.width - 40 || s.sy < 50 || s.sy > r.height - 50) continue;
        if (found.some((f) => Math.hypot(f.sx - s.sx, f.sy - s.sy) < MIN_GAP)) continue;
        found.push({ x, y, z: target, sx: s.sx, sy: s.sy });
        if (found.length >= MAX_LABELS) break;
      }
    }
    while (this.labels.length < found.length) {
      const el = document.createElement('div');
      el.className = 'contour-label';
      el.appendChild(document.createElement('span'));
      this.overlay.appendChild(el);
      this.labels.push({ el, x: 0, y: 0, z: 0, on: false });
    }
    this.labels.forEach((l, i) => {
      const f = found[i];
      l.on = !!f;
      if (f) { l.x = f.x; l.y = f.y; l.z = f.z; l.el.firstElementChild!.textContent = String(f.z); }
      else l.el.style.display = 'none';
    });
    this.requestRender();
  }

  /** per frame: keep the labels on their contours */
  place() {
    for (const l of this.labels) {
      if (!l.on) continue;
      const s = this.screenOf(l.x, l.y, l.z);
      l.el.style.display = s.vis ? '' : 'none';
      if (s.vis) l.el.style.transform = `translate(${s.sx.toFixed(1)}px, ${s.sy.toFixed(1)}px)`;
    }
  }
}
