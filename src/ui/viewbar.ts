// Map view options (top-right of the map): contour lines, slope tint, vertical exaggeration, aerial photo,
// noise view. Persisted in localStorage; keyboard: C, S, R, O, N.

import type { View } from '../render/view';

export interface ViewPrefs { contours: boolean; slope: boolean; exag: number; photo: boolean; noise: boolean }

const KEY = 'trapla.view';
const EXAG = [1, 1.5, 2, 3];

export class ViewBar {
  private prefs: ViewPrefs = { contours: false, slope: false, exag: 1, photo: false, noise: false };
  private bContours: HTMLButtonElement;
  private bSlope: HTMLButtonElement;
  private bExag: HTMLButtonElement;
  private bPhoto: HTMLButtonElement | null = null;
  private bNoise: HTMLButtonElement;
  private interval = '';

  /** `onPhoto`: told when the photo layer is switched (for the attribution line); `noise`: the noise view */
  constructor(root: HTMLElement, private view: View, photoNote = '', private onPhoto: ((on: boolean) => void) | null = null,
    private noise: { setOn(on: boolean): void } | null = null) {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      this.prefs = { contours: !!p.contours, slope: !!p.slope, exag: EXAG.includes(p.exag) ? p.exag : 1, photo: !!p.photo, noise: !!p.noise };
    } catch { /* defaults */ }
    const btn = (title: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.title = title;
      b.onclick = () => { onClick(); b.blur(); };
      root.appendChild(b);
      return b;
    };
    this.bContours = btn('Contour lines (C)', () => this.set({ contours: !this.prefs.contours }));
    this.bSlope = btn('Slope: yellow 8 %, orange 15 %, red 25 %, purple 40 % (S)', () => this.set({ slope: !this.prefs.slope }));
    this.bExag = btn('Vertical exaggeration (R)', () => this.set({ exag: EXAG[(EXAG.indexOf(this.prefs.exag) + 1) % EXAG.length] }));
    if (view.hasPhoto) this.bPhoto = btn(`Aerial photo (O)${photoNote ? ` — ${photoNote}` : ''}`, () => this.set({ photo: !this.prefs.photo }));
    this.bNoise = btn('Night noise at the top floors, houses coloured by their level (N)', () => this.set({ noise: !this.prefs.noise }));
    view.onContourInterval = (minor, major) => { this.interval = `${minor} / ${major} m`; this.paint(); };
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'c') this.bContours.click();
      else if (k === 's') this.bSlope.click();
      else if (k === 'r') this.bExag.click();
      else if (k === 'o') this.bPhoto?.click();
      else if (k === 'n') this.bNoise.click();
    });
    this.apply();
  }

  get(): ViewPrefs { return { ...this.prefs }; }

  /** the saved view shows the aerial photo */
  get photo() { return this.prefs.photo; }
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
    this.view.setPhoto(this.prefs.photo);
    this.noise?.setOn(this.prefs.noise);
    this.onPhoto?.(this.prefs.photo && this.view.hasPhoto);
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
    this.bExag.innerHTML = `Relief ${p.exag}× <kbd>R</kbd>`;
    if (this.bPhoto) { this.bPhoto.classList.toggle('on', p.photo); this.bPhoto.innerHTML = 'Photo <kbd>O</kbd>'; }
    this.bNoise.classList.toggle('on', p.noise);
    this.bNoise.innerHTML = 'Noise <kbd>N</kbd>';
  }
}
