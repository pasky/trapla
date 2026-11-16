// Map → profile: the part of the route the map shows is a light window in the profile, recomputed (at
// most every 120 ms) after the camera has moved. Moved out of main.ts verbatim.
import type { View } from '../render/view';
import type { Session } from '../session';
import type { ProfilePanel } from './profile';

export interface MapWindowContext {
  readonly session: Session; readonly view: View; readonly profile: ProfilePanel;
  canvasBox(): DOMRect;
}

export function installMapWindow(app: MapWindowContext) {
  let windowTimer = 0;
  const updateMapWindow = () => {
    windowTimer = 0;
    const r = app.session.last;
    if (!r) return;
    const box = app.canvasBox();
    let lo = Infinity, hi = -Infinity, seen = 0, total = 0;
    const step = Math.max(1, Math.floor(r.n / 400));
    for (let i = 0; i < r.n; i += step) {
      total++;
      const p = app.view.project(r.x[i], r.y[i], r.grade[i]);
      if (p.vis && p.sx >= 0 && p.sy >= 0 && p.sx <= box.width && p.sy <= box.height) { seen++; lo = Math.min(lo, r.s[i]); hi = Math.max(hi, r.s[i]); }
    }
    app.profile.setMapWindow(seen && seen < total * 0.9 ? { s0: lo, s1: hi } : null);
  };
  const prevRender = app.view.onRender;
  app.view.onRender = () => { prevRender?.(); if (!windowTimer) windowTimer = window.setTimeout(updateMapWindow, 120); };
}
