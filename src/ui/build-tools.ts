// Contextual manual construction controls. Every edit goes through the owner's Store.
import './build-tools.css';
import type { Design, Result } from '../core/evaluate';
import { crossingChoice, crossingLabel, type CrossingChoice } from '../core/crossings';
import { ROAD_CLASSES } from '../core/data/urban';
import type { BuildingOverride } from '../core/build-controls';
import { czk } from './costgroups';
import type { StationRange } from '../state';

export interface BuildToolEvents {
  pin?: (s: number, z: number | null) => void;
  selectStation?: (s: number) => void;
  crossing?: (roadId: number, type: CrossingChoice | null) => void;
  selectCrossing?: (roadId: number) => void;
  building?: (j: number, action: BuildingOverride['action'] | null) => void;
  selectBuilding?: (j: number) => void;
  wall?: (side: 'L' | 'R', height: number | null) => void;
}

export class BuildTools {
  ev: BuildToolEvents = {};
  objectDataChanged = false;
  station: number | null = null;
  crossing: number | null = null;
  building: number | null = null;
  private range: StationRange | null = null;
  private wallSide: 'L' | 'R' = 'L';
  private wallHeight = 4;
  private r: Result | null = null;
  private d: Design | null = null;
  private root: HTMLElement;
  private pendingRender = false;
  constructor(hud: HTMLElement) {
    this.root = document.createElement('section');
    this.root.className = 'card build-tools';
    this.root.id = 'build-tools';
    hud.insertBefore(this.root, hud.querySelector('.cost'));
    this.root.addEventListener('focusout', () => queueMicrotask(() => {
      if (this.pendingRender && !this.root.contains(document.activeElement)) this.render();
    }));
    this.root.addEventListener('click', () => queueMicrotask(() => {
      if (this.pendingRender && !document.activeElement?.matches('input, select')) this.render();
    }));
    this.render();
  }
  setResult(r: Result, d: Design) {
    this.r = r; this.d = d;
    if (this.root.contains(document.activeElement) && document.activeElement?.matches('input, select')) this.pendingRender = true;
    else this.render();
  }
  selectStation(s: number) { this.station = s; this.crossing = this.building = null; this.render(); }
  selectCrossing(roadId: number) { this.crossing = roadId; this.station = this.building = null; this.render(); }
  selectBuilding(j: number) { this.building = j; this.station = this.crossing = null; this.render(); }
  setRange(range: StationRange | null) { this.range = range; this.render(); }
  private renderWalls(r: Result, d: Design) {
    const range = this.range;
    if (!range) return;
    const box = document.createElement('div');
    const existing = (d.wallOverrides ?? []).filter((o) => o.s1 > range.s0 && o.s0 < range.s1);
    box.innerHTML = `<p><b>Noise walls · km ${(range.s0 / 1000).toFixed(2)}–${(Math.min(r.length, range.s1) / 1000).toFixed(2)}</b></p>
      <label>Side <select id="wall-side"><option value="L">Left A → B</option><option value="R">Right A → B</option></select>Height <input id="wall-height" type="number" min="2" max="6" step="0.5" value="${this.wallHeight}"> m</label>
      <div class="btns"><button id="wall-add" title="Build the specified height on this side throughout the selected stretch. Actual height is priced and evaluated for noise; no wall is built inside tunnels.">Add wall</button><button id="wall-remove" title="Explicitly remove the wall on this side. Remaining noise excess is a violation, not silent acquisition.">No wall</button><button id="wall-auto" title="Clear this side's wall decision in the selected stretch. Auto chooses 3/4/5 m walls with 50 m end margins, or buys out unprotectable dwellings unless you keep them.">Auto wall</button></div>
      <div class="sub">${existing.length ? existing.map((o) => `${o.side === 'L' ? 'Left' : 'Right'}: ${o.height ? `${o.height} m wall` : 'no wall'} ${(o.s0 / 1000).toFixed(2)}–${(o.s1 / 1000).toFixed(2)} km`).join(' · ') : 'No wall overrides here.'} Manual walls never silently buy out exposed dwellings; add adequate walls or explicitly buy them out.</div>`;
    const select = box.querySelector<HTMLSelectElement>('#wall-side')!;
    select.value = this.wallSide;
    select.onchange = () => { this.wallSide = select.value as 'L' | 'R'; };
    const side = () => this.wallSide;
    box.querySelector<HTMLButtonElement>('#wall-add')!.onclick = () => {
      const height = box.querySelector<HTMLInputElement>('#wall-height')!.valueAsNumber;
      if (Number.isFinite(height) && height >= 2 && height <= 6) { this.wallHeight = height; this.ev.wall?.(side(), height); }
    };
    box.querySelector<HTMLButtonElement>('#wall-remove')!.onclick = () => this.ev.wall?.(side(), 0);
    box.querySelector<HTMLButtonElement>('#wall-auto')!.onclick = () => this.ev.wall?.(side(), null);
    this.root.appendChild(box);
  }
  private renderBuilding(r: Result, d: Design) {
    const j = this.building;
    if (d.buildingOverrides?.length) {
      const saved = document.createElement('select');
      saved.id = 'building-list'; saved.title = 'Select a saved building decision';
      saved.innerHTML = '<option value="">Building decisions…</option>' + d.buildingOverrides.map((o) => `<option value="${o.j}">#${o.j} · ${o.action === 'keep' ? 'keep' : 'buy out'}</option>`).join('');
      saved.onchange = () => { if (saved.value !== '') this.ev.selectBuilding?.(Number(saved.value)); };
      this.root.appendChild(saved);
    }
    if (j === null) return;
    const action = d.buildingOverrides?.find((o) => o.j === j)?.action;
    const removed = r.demolished.find((p) => p.j === j), bought = r.boughtOut.find((p) => p.j === j);
    const kept = r.kept.find((p) => p.j === j), receiver = r.noise.receivers.find((p) => p.j === j);
    const box = document.createElement('div');
    const state = removed ? `Footprint demolition · ${czk(removed.cost)}` : bought ? `${bought.reason === 'manual' ? 'Player' : 'Noise'} buyout + demolition · ${czk(bought.cost)}` : kept?.hit ? 'Kept — footprint/working-strip conflict' : receiver?.unresolved ? `Retained — ${receiver.unresolved.excess.toFixed(1)} dB over limit` : 'Retained';
    box.innerHTML = `<p><b>Building #${j}</b> · ${state}</p><label>Decision <select id="building-choice" title="Auto demolishes footprint/working-strip hits and buys out dwellings if 3–5 m automatic walls and cut edges cannot protect them. Otherwise the building stays."><option value="">Auto</option><option value="buy">Buy out + demolish</option><option value="keep">Keep — forbid acquisition</option></select></label><div class="sub">Off-corridor buyouts include the same provisional plot allowance as noise acquisitions. Keep blocks demolition and noise buyout; conflicts are violations.</div>`;
    const select = box.querySelector<HTMLSelectElement>('select')!;
    select.value = action ?? '';
    select.onchange = () => this.ev.building?.(j, select.value as BuildingOverride['action'] || null);
    this.root.appendChild(box);
  }
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
    const inactive = (d.crossingOverrides ?? []).filter((o) => !r.crossings.some((c) => c.roadId === o.roadId));
    for (const o of inactive) {
      const clear = document.createElement('button');
      clear.textContent = `Clear inactive road #${o.roadId} (${o.type})`;
      clear.title = 'This road is no longer crossed. Its saved decision would apply again if you reroute across it.';
      clear.onclick = () => this.ev.crossing?.(o.roadId, null);
      box.appendChild(clear);
    }
    const c = r.crossings.find((c) => c.roadId === this.crossing);
    if (c) {
      const choice = crossingChoice(c.roadId!, d.crossingOverrides ?? []);
      const options: [string, string][] = [['', 'Auto'], ['junction', 'Junction'], ['bridge', 'Our bridge over it'], ['overbridge', 'Its overbridge over us'], ['reconnection', 'Close + reconnect']];
      const detail = document.createElement('div');
      detail.innerHTML = `<div class="sub">${crossingLabel(c)} · grade ${c.h >= 0 ? '+' : ''}${c.h.toFixed(1)} m above crossed road</div><label>Resolution <select id="crossing-choice" title="Auto retains grade separations, spaces through-road junctions at least 1.5 km apart, then chooses a priced overbridge or a link to an already resolved compatible road.">${options.map(([value, label]) => `<option value="${value}" ${(choice ?? '') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><div class="sub">Affects this road at km ${r.crossings.filter((x) => x.roadId === c.roadId).map((x) => (x.s / 1000).toFixed(3)).join(', ')}. Explicit choices keep separate safety/billing objects rather than merged Auto allowances. Ordinary overbridges include raised approaches; motorways require a ≥6 m cut. Unsafe choices remain violations. Our bridge takes priority over structure paint.</div>`;
      detail.querySelector<HTMLSelectElement>('select')!.onchange = (e) => this.ev.crossing?.(c.roadId!, (e.target as HTMLSelectElement).value as CrossingChoice || null);
      box.appendChild(detail);
    }
    this.root.appendChild(box);
  }
  private render() {
    this.pendingRender = false;
    const r = this.r, d = this.d, s = this.station;
    this.root.innerHTML = `<h2>Build tools</h2><div class="sub">Alt+click the profile for grade pins. Click a building or crossing on the map; choose its action here. Shift+click always adds a bend. Select a cost-strip stretch for B/T/E/C structures and left/right noise walls. All choices are undoable.</div>`;
    if (this.objectDataChanged) {
      const notice = document.createElement('p'); notice.className = 'warn';
      notice.textContent = 'Scenario objects changed: saved building/crossing choices were cleared to avoid selecting different objects. Station-based decisions are retained.';
      this.root.appendChild(notice);
    }
    if (!r || !d) return;
    const station = document.createElement('div');
    station.innerHTML = `<label>Station <input id="station-value" type="number" min="0" max="${r.length}" step="1" value="${Math.round(this.station ?? (this.range ? (this.range.s0 + this.range.s1) / 2 : r.length / 2))}"> m <button id="station-select" title="Select a station for pinning without Alt+click">Select / pin</button></label>`;
    station.querySelector<HTMLButtonElement>('button')!.onclick = () => {
      const s = station.querySelector<HTMLInputElement>('input')!.valueAsNumber;
      if (Number.isFinite(s) && s >= 0 && s <= r.length) this.ev.selectStation?.(s);
    };
    this.root.appendChild(station);
    this.renderWalls(r, d);
    this.renderBuilding(r, d);
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
