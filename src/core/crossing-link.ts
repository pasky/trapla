interface XY { x: number; y: number }
/** Shortcuts and rounded bends on a paid diversion, not a display-only alternate alignment.
 * Clearance is checked along each chord; endpoints stay on their surveyed road anchors.
 * Input/output and look-ahead are bounded by the crossing geometry's point budget.
 * `clearance` receives a reused scratch point: it must not retain it. */
export function smoothLink<T extends XY>(points: T[], clearance: (p: XY) => number,
  point: (p: XY) => T, minimumClearance = .5): T[] {
  if (points.length < 3) return points;
  const lerp = (a: XY, b: XY, t: number) => ({ x: a.x+(b.x-a.x)*t, y: a.y+(b.y-a.y)*t });
  const probe = { x: 0, y: 0 };
  const probeAt = (a: XY, b: XY, t: number) => { probe.x = a.x+(b.x-a.x)*t; probe.y = a.y+(b.y-a.y)*t; return probe; };
  const safe = (a: XY, b: XY) => {
    const count = Math.max(1, Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2.5));
    // Reject obvious corner cuts first, before the fine clearance walk.
    if (clearance(probeAt(a,b,.5)) < minimumClearance) return false;
    // k/count === .5 exactly when 2k === count: that sample already passed above.
    for (let k = 0; k <= count; k++) if (2 * k !== count && clearance(probeAt(a,b,k/count)) < minimumClearance) return false;
    return true;
  };
  const simple = [points[0]];
  for (let i = 0; i + 1 < points.length;) {
    let far = i+1, length = 0;
    while (far + 1 < points.length && far-i < 32) {
      length += Math.hypot(points[far].x-points[far-1].x,points[far].y-points[far-1].y);
      if (length > 160) break;
      far++;
    }
    while (far > i+1 && !safe(points[i],points[far])) far = i+Math.floor((far-i)/2);
    simple.push(points[far]); i = far;
  }
  const rounded = [simple[0]];
  for (let i = 1; i + 1 < simple.length; i++) {
    const a = simple[i-1], b = simple[i], c = simple[i+1];
    const trim = Math.min(20, Math.hypot(b.x-a.x,b.y-a.y)*.3, Math.hypot(c.x-b.x,c.y-b.y)*.3);
    const start = lerp(b,a,trim/(Math.hypot(b.x-a.x,b.y-a.y) || 1));
    const end = lerp(b,c,trim/(Math.hypot(c.x-b.x,c.y-b.y) || 1));
    let curve: XY[] | undefined;
    // First try rounding inward. If the reserved setback forbids that, extend the tangent
    // controls beyond the corner: a smooth outward bow, not a shortcut through the cut crest.
    for (const scale of [.65, 1.5, 2, 3]) {
      const c1 = lerp(start,b,scale), c2 = lerp(end,b,scale);
      const candidate = Array.from({ length: 9 }, (_, k) => {
        const t = k/8, u = 1-t;
        return { x: u*u*u*start.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t*t*t*end.x,
          y: u*u*u*start.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t*t*t*end.y };
      });
      if (candidate.every((p,j) => !j || safe(candidate[j-1],p))) { curve = candidate; break; }
    }
    if (curve) rounded.push(...curve.map(point)); else rounded.push(b);
  }
  rounded.push(simple[simple.length-1]);
  // Never turn a pathological sawtooth into unbounded render/worker geometry.
  return rounded.length <= 480 ? rounded : simple;
}
