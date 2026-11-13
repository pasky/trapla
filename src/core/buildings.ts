// Spatial hash over building centroids (from the OSM overlay) for footprint hit tests.

export class BuildingIndex {
  private readonly cell = 50;
  private readonly map = new Map<number, number[]>();
  /** [x, y, radius] per building; each is registered in every cell its circle touches */
  constructor(readonly items: [number, number, number][]) {
    items.forEach((b, i) => {
      const c0 = Math.floor((b[0] - b[2]) / this.cell), c1 = Math.floor((b[0] + b[2]) / this.cell);
      const r0 = Math.floor((b[1] - b[2]) / this.cell), r1 = Math.floor((b[1] + b[2]) / this.cell);
      for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
        const k = this.key(cx, cy);
        let a = this.map.get(k);
        if (!a) this.map.set(k, (a = []));
        a.push(i);
      }
    });
  }

  private key(cx: number, cy: number) { return cx * 100003 + cy; }

  /** call fn(index) (possibly repeatedly) for buildings whose circle may come within r of (x,y) */
  near(x: number, y: number, r: number, fn: (i: number) => void) {
    const c0 = Math.floor((x - r) / this.cell), c1 = Math.floor((x + r) / this.cell);
    const r0 = Math.floor((y - r) / this.cell), r1 = Math.floor((y + r) / this.cell);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const a = this.map.get(this.key(cx, cy));
      if (a) for (const i of a) fn(i);
    }
  }
}
