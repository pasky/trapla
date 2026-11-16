// Screen-space label declutter: labels are placed in priority order, and one that would overlap a label
// already placed this frame is hidden (no overprinted names, no "3 3 m"). Sizes are measured once per label.

const PAD = 2;

export class Declutter {
  private boxes: number[] = [];
  private size = new WeakMap<HTMLElement, { w: number; h: number; dx: number; dy: number }>();

  /** a new frame: nothing placed yet */
  reset() { this.boxes.length = 0; }

  /** Show `el` at screen (sx, sy) unless it overlaps a label placed before it (`always`: shown anyway,
   * and its room kept). Returns whether it is shown; the caller has set its position. */
  fit(el: HTMLElement, sx: number, sy: number, always = false): boolean {
    let s = this.size.get(el);
    if (!s) {
      el.style.display = '';
      const style = getComputedStyle(el);
      s = { w: el.offsetWidth, h: el.offsetHeight, dx: parseFloat(style.marginLeft) || 0, dy: parseFloat(style.marginTop) || 0 };
      if (s.w > 0) this.size.set(el, s);
    }
    const x0 = sx + s.dx - PAD, y0 = sy + s.dy - PAD, x1 = x0 + s.w + 2 * PAD, y1 = y0 + s.h + 2 * PAD;
    if (!always) for (let k = 0; k < this.boxes.length; k += 4)
      if (x0 < this.boxes[k + 2] && x1 > this.boxes[k] && y0 < this.boxes[k + 3] && y1 > this.boxes[k + 1]) return false;
    this.boxes.push(x0, y0, x1, y1);
    return true;
  }
}
