import type { Result } from '../core/evaluate';
import { KIND } from '../core/structures';

/** Same visible indication for drawing and picking (tunnels are marked above the rendered ground). */
export function routeIndicationHeight(r: Pick<Result, 'x' | 'y' | 'grade' | 'kind'>, i: number,
  drape: (x: number, y: number) => number): number {
  return r.kind[i] === KIND.tunnel ? drape(r.x[i], r.y[i]) + 2 : r.grade[i] + 1.5;
}
