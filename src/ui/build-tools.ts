// Contextual manual construction controls. Every edit goes through the owner's Store.
import './build-tools.css';
import type { Design, Result } from '../core/evaluate';
import { crossingChoice, crossingLabel, type CrossingChoice } from '../core/crossings';
import { ROAD_CLASSES } from '../core/data/urban';
import type { StationRange } from '../state';

export interface BuildToolEvents {
  pin?: (s: number, z: number | null) => void;
  selectStation?: (s: number) => void;
  crossing?: (roadId: number, type: CrossingChoice | null) => void;
  selectCrossing?: (roadId: number) => void;
}

export class BuildTools {
  ev: BuildToolEvents = {};
  station: number | null = null;
  crossing: number | null = null;
  private range: StationRange | null = null;
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
  selectCrossing(roadId: number) { this.crossing = roadId; this.render(); }
  setRange(range: StationRange | null) { this.range = range; this.render(); }
  private renderCrossings(r: Result, d: Design) {
    const box = document.createElement('div');
    const range = this.range;
    const list = r.crossings.filter((c) => c.roadId !== undefined && (!range || c.s >= range.s0 && c.s <= range.s1));
    const unique = list.filter((c, i) => list.findIndex((x) => x.roadId === c.roadId) === i);
    box.innerHTML = `<label>Crossed road <select id="crossing-select"><option value="">${range ? 'In selected stretch…' : 'Select on map or here…'}</option>${unique.map((c) => `<option value="${c.roadId}" ${c.roadId === this.crossing ? 'selected' : ''}>km ${(c.s / 1000).toFixed(2)} · ${ROAD_CLASSES[c.cls].label} #${c.roadId}</option>`).join('')}</select></label>`;
    box.querySelector<HTMLSelectElement>('select')!.onchange = (e) => {
      const value = (e.target as HTMLSelectElement).value;
      if (value !== '') this.ev.selectCrossing?.(Number(value));
    };
    const c = r.crossings.find((c) => c.roadId === this.crossing);
    if (c) {
      const choice = crossingChoice(c.roadId!, d.crossingOverrides ?? []);
      const options: [string, string][] = [['', 'Auto'], ['junction', 'Junction'], ['bridge', 'Our bridge over it'], ['overbridge', 'Its overbridge over us'], ['reconnection', 'Close + reconnect']];
      const detail = document.createElement('div');
      detail.innerHTML = `<div class="sub">${crossingLabel(c)} · grade ${c.h >= 0 ? '+' : ''}${c.h.toFixed(1)} m above crossed road</div><label>Resolution <select id="crossing-choice" title="Auto retains grade separations, spaces through-road junctions at least 1.5 km apart, then chooses a priced overbridge or a link to an already resolved compatible road.">${options.map(([value, label]) => `<option value="${value}" ${(choice ?? '') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><div class="sub">Applies to every crossing of this road. Unsafe clearance, spacing or links remain violations. Our bridge takes priority over overlapping structure paint.</div>`;
      detail.querySelector<HTMLSelectElement>('select')!.onchange = (e) => this.ev.crossing?.(c.roadId!, (e.target as HTMLSelectElement).value as CrossingChoice || null);
      box.appendChild(detail);
    }
    this.root.appendChild(box);
  }
  private render() {
    const r = this.r, d = this.d, s = this.station;
    this.root.innerHTML = `<h2>Build tools</h2><div class="sub">Alt+click the profile for grade pins. Click a crossing on the map or choose it here. Select a cost-strip stretch for B/T/E/C structures. All choices are undoable.</div>`;
    if (!r || !d) return;
    this.renderCrossings(r, d);
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
