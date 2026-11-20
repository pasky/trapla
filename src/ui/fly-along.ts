// Fly along our line from one end to the other, ≈ 28 m up: max(ground + 26, deck + 15) — above the view's own 25 m
// clearance over the ground, 15 m over a bridge's deck, over the hill where the line is in a tunnel (there is no
// inside of a tunnel to show). The map's markers and labels are hidden meanwhile; Esc or any click stops it and
// puts the view back. Nothing runs unless the player asks for it, and it never edits anything.
import type { Result } from '../core/evaluate';
import type { View } from '../render/view';

/** over the ground / over the deck (m) */
const OVER_GROUND = 26, OVER_DECK = 15;
/** the camera looks this far ahead along the line (m), its heights smoothed over ± this (m) */
const AHEAD = 180, SMOOTH = 120;
/** cruising speed, m/s, faster on long lines so that a flight lasts at most ≈ 2 minutes */
const SPEED = 45, LONGEST_S = 120;

export interface FlyAlong {
  /** `hold`: stay at that many metres from the start (screenshot scripts), not flying on */
  start(r: Result, from: 'a' | 'b', hold?: number): void; stop(): void; readonly flying: boolean; onChange?: (flying: boolean) => void }

export function createFlyAlong(view: View, overlay: HTMLElement, ground: (x: number, y: number) => number): FlyAlong {
  let raf = 0, flying = false, before: View['eyeTarget'] | null = null;
  // (installed once, before the game's own shortcuts (app.ts makes this first): while flying, Esc, a press or a
  // wheel stops the flight and does nothing else)
  // (a press that stops it is the stop only: the click it ends in does nothing else either, a HUD button included)
  let swallow = 0;
  const stop = (e: Event) => {
    if (!flying || (e instanceof KeyboardEvent && e.key !== 'Escape')) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.type === 'pointerdown') swallow = performance.now();
    api.stop();
  };
  for (const type of ['keydown', 'pointerdown', 'wheel']) addEventListener(type, stop, { capture: true, passive: false });
  addEventListener('click', (e) => { if (swallow && performance.now() - swallow < 1500) { e.stopImmediatePropagation(); e.preventDefault(); } swallow = 0; }, { capture: true });
  const api: FlyAlong = {
    get flying() { return flying; },
    start(r, from, hold) {
      api.stop();
      const n = r.n;
      if (n < 3) return;
      // the camera's height at each station, then smoothed (no jolt at a bridge's end)
      const raw = new Float64Array(n);
      for (let i = 0; i < n; i++) raw[i] = Math.max(ground(r.x[i], r.y[i]) + OVER_GROUND, r.grade[i] + OVER_DECK);
      const k = Math.max(1, Math.round(SMOOTH / r.ds)), zc = new Float64Array(n);
      for (let i = 0; i < n; i++) { let m = -Infinity; for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) m = Math.max(m, raw[j]); zc[i] = m; }
      // (a running mean of the running max: never below the clearance, no steps)
      const cam = new Float64Array(n);
      for (let i = 0; i < n; i++) { let t = 0, c = 0; for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) { t += zc[j]; c++; } cam[i] = t / c; }
      // what it looks at: the road ahead, or the ground over it in a tunnel
      const look = (i: number) => Math.max(r.grade[i], r.kind[i] === 2 ? ground(r.x[i], r.y[i]) : -Infinity);
      const at = (s: number, arr: (i: number) => number) => {
        const u = Math.max(0, Math.min(n - 1, s / r.ds)), i = Math.min(n - 2, Math.floor(u)), t = u - i;
        return { x: r.x[i] + t * (r.x[i + 1] - r.x[i]), y: r.y[i] + t * (r.y[i + 1] - r.y[i]), z: arr(i) + t * (arr(i + 1) - arr(i)) };
      };
      const L = r.length, speed = Math.max(SPEED, L / LONGEST_S), dir = from === 'a' ? 1 : -1;
      before = view.eyeTarget; flying = true; overlay.classList.add('flying'); api.onChange?.(true);
      const t0 = performance.now();
      const step = () => {
        const run = Math.min(L, hold ?? ((performance.now() - t0) / 1000) * speed), s = from === 'a' ? run : L - run;
        const eye = at(s, (i) => cam[i]), ahead = at(Math.max(0, Math.min(L, s + dir * AHEAD)), look);
        // near the far end the point ahead stops: keep looking the same way
        if (Math.hypot(ahead.x - eye.x, ahead.y - eye.y) < AHEAD / 2) {
          const back = at(Math.max(0, Math.min(L, s - dir * AHEAD)), look);
          ahead.x = eye.x + (eye.x - back.x); ahead.y = eye.y + (eye.y - back.y);
        }
        view.holdCamera(eye, ahead);
        if (hold !== undefined) return;
        if (run >= L) { api.stop(); return; }
        raf = requestAnimationFrame(step);
      };
      step();
    },
    stop() {
      if (!flying) return;
      cancelAnimationFrame(raf); flying = false; overlay.classList.remove('flying');
      if (before) view.holdCamera(before.eye, before.target);
      view.holdCamera(null); before = null;
      api.onChange?.(false);
    },
  };
  return api;
}
