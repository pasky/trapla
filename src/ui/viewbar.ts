// Map view options (top-right of the map): contour lines, slope tint, vertical exaggeration.
// Persisted in localStorage; keyboard: C, S, E.

import type { View } from '../render/view';

export interface ViewPrefs { contours: boolean; slope: boolean; exag: number }

const KEY = 'trapla.view';
const EXAG = [1, 1.5, 2, 3];

export class ViewBar {
  private prefs: ViewPrefs = { contours: false, slope: false, exag: 1 };
  private bContours: HTMLButtonElement;
  private bSlope: HTMLButtonElement;
  private bExag: HTMLButtonElement;
  private interval = '';

  constructor(root: HTMLElement, private view: View) {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      this.prefs = { contours: !!p.contours, slope: !!p.slope, exag: EXAG.includes(p.exag) ? p.exag : 1 };
    } catch { /* defaults */ }
    const btn = (title: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.title = title;
      b.onclick = () => { onClick(); b.blur(); };
      root.appendChild(b);
      return b;
    };
    this.bContours = btn('Contour lines; the interval follows the zoom (C)', () => this.set({ contours: !this.prefs.contours }));
    this.bSlope = btn('Tint the ground by slope: yellow from 8 %, orange from 15 %, red from 25 %, purple from 40 % (S)', () => this.set({ slope: !this.prefs.slope }));
    this.bExag = btn('Vertical exaggeration of the whole scene (E)', () => this.set({ exag: EXAG[(EXAG.indexOf(this.prefs.exag) + 1) % EXAG.length] }));
    view.onContourInterval = (minor, major) => { this.interval = `${minor} / ${major} m`; this.paint(); };
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'c') this.bContours.click();
      else if (k === 's') this.bSlope.click();
      else if (k === 'e') this.bExag.click();
    });
    this.apply();
  }

  get(): ViewPrefs { return { ...this.prefs }; }

  set(p: Partial<ViewPrefs>) {
    Object.assign(this.prefs, p);
    if (!EXAG.includes(this.prefs.exag)) this.prefs.exag = 1;
    try { localStorage.setItem(KEY, JSON.stringify(this.prefs)); } catch { /* private mode */ }
    this.apply();
  }

  private apply() {
    this.view.setContours(this.prefs.contours);
    this.view.setSlopeTint(this.prefs.slope);
    this.view.setExaggeration(this.prefs.exag);
    // the HUD has its own exaggeration select; keep it in step
    const sel = document.getElementById('exag') as HTMLSelectElement | null;
    if (sel) sel.value = String(this.prefs.exag);
    this.paint();
  }

  private paint() {
    const p = this.prefs;
    this.bContours.classList.toggle('on', p.contours);
    this.bContours.innerHTML = `Contours${p.contours && this.interval ? ` <small>${this.interval}</small>` : ''} <kbd>C</kbd>`;
    this.bSlope.classList.toggle('on', p.slope);
    this.bSlope.innerHTML = 'Slope <kbd>S</kbd>';
    this.bExag.classList.toggle('on', p.exag !== 1);
    this.bExag.innerHTML = `Relief ${p.exag}× <kbd>E</kbd>`;
  }
}
