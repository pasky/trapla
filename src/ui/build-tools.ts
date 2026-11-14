// Contextual manual construction controls. Every edit goes through the owner's Store.
import './build-tools.css';
import type { Design, Result } from '../core/evaluate';
import type { StationRange } from '../state';

export interface BuildToolEvents {
  pin?: (s: number, z: number | null) => void;
  selectStation?: (s: number) => void;
}

export class BuildTools {
  ev: BuildToolEvents = {};
  station: number | null = null;
  private r: Result | null = null;
  private d: Design | null = null;
  private root: HTMLElement;
  constructor(hud: HTMLElement) {
    this.root = document.createElement('section');
    this.root.className = 'card build-tools';
    this.root.id = 'build-tools';
    hud.insertBefore(this.root, hud.querySelector('.cost'));
    this.render();
  }
  setResult(r: Result, d: Design) { this.r = r; this.d = d; this.render(); }
  selectStation(s: number) { this.station = s; this.render(); }
  setRange(_range: StationRange | null) { /* range controls are added alongside station tools */ }
  private render() {
    const r = this.r, d = this.d, s = this.station;
    this.root.innerHTML = `<h2>Build tools</h2><div class="sub">Alt+click the profile to select a grade station. Select a cost-strip stretch for B/T/E/C structures. All choices are undoable.</div>`;
    if (!r || !d) return;
    if (d.gradePins?.length) {
      const list = document.createElement('select');
      list.id = 'pin-list'; list.title = 'Select any saved pin, including pins beyond a shortened route';
      list.innerHTML = '<option value="">Saved pins…</option>' + d.gradePins.map((p, k) => `<option value="${k}">km ${(p.s / 1000).toFixed(3)} · ${p.z.toFixed(1)} m${p.s > r.length ? ' · outside route' : ''}</option>`).join('');
      list.onchange = () => { if (list.value !== '') this.ev.selectStation?.(d.gradePins![Number(list.value)].s); };
      this.root.appendChild(list);
    }
    if (s === null) return;
    const pin = d.gradePins?.find((p) => Math.abs(p.s - s) < 0.1);
    const i = Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds)));
    const z = pin?.z ?? r.grade[i];
    const box = document.createElement('div');
    box.innerHTML = `<p><b>Grade station km ${(s / 1000).toFixed(3)}</b>${pin ? ' · pinned' : ''}</p>
      <label>Elevation <input id="pin-height" type="number" step="0.1" value="${z.toFixed(1)}"> m</label>
      <div class="btns"><button id="pin-set" title="Auto optimises the rest of the grade while passing through this elevation. Gradient and vertical-curve checks still apply.">Pin height</button><button id="pin-clear" title="Remove this pin; Auto is free to optimise this station again." ${pin ? '' : 'disabled'}>Auto / unpin</button></div>
      <div class="sub">${d.profileMode === 'auto' ? 'Pins stay at their chainages when you reroute.' : 'Pins are saved but inactive in Manual; switch Grade line to Auto to use them.'}</div>`;
    this.root.appendChild(box);
    box.querySelector<HTMLButtonElement>('#pin-set')!.onclick = () => {
      const z = box.querySelector<HTMLInputElement>('#pin-height')!.valueAsNumber;
      if (Number.isFinite(z)) this.ev.pin?.(s, z);
    };
    box.querySelector<HTMLButtonElement>('#pin-clear')!.onclick = () => this.ev.pin?.(s, null);
  }
}
