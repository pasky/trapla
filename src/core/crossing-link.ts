interface XY { x: number; y: number }
/** Shortcuts and rounded bends on a paid diversion, not a display-only alternate alignment.
 * Clearance is checked along each chord; endpoints stay on their surveyed road anchors.
 * Input/output and look-ahead are bounded by the crossing geometry's point budget. */
export function smoothLink<T extends XY>(points: T[], clearance: (p: XY) => number,
  point: (p: XY) => T): T[] {
  if (points.length < 3) return points;
  const lerp = (a: XY, b: XY, t: number) => ({ x: a.x+(b.x-a.x)*t, y: a.y+(b.y-a.y)*t });
  const safe = (a: XY, b: XY) => {
    const count = Math.max(1, Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2.5));
    for (let k = 0; k <= count; k++) if (clearance(lerp(a,b,k/count)) < .5) return false;
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
    while (far > i+1 && !safe(points[i],points[far])) far--;
    simple.push(points[far]); i = far;
  }
  const rounded = [simple[0]];
  for (let i = 1; i + 1 < simple.length; i++) {
    const a = simple[i-1], b = simple[i], c = simple[i+1];
    const trim = Math.min(20, Math.hypot(b.x-a.x,b.y-a.y)*.3, Math.hypot(c.x-b.x,c.y-b.y)*.3);
    const start = lerp(b,a,trim/(Math.hypot(b.x-a.x,b.y-a.y) || 1));
    const end = lerp(b,c,trim/(Math.hypot(c.x-b.x,c.y-b.y) || 1));
    const curve = Array.from({ length: 9 }, (_, k) => lerp(lerp(start,b,k/8),lerp(b,end,k/8),k/8));
    if (curve.every((p,j) => !j || safe(curve[j-1],p))) rounded.push(...curve.map(point));
    else rounded.push(b);
  }
  rounded.push(simple[simple.length-1]);
  // Never turn a pathological sawtooth into unbounded render/worker geometry.
  return rounded.length <= points.length ? rounded : simple;
}
