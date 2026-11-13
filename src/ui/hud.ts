// Right-hand HUD: scenario card, controls, cost, stats, violations, selected PI, best design.

import type { Design, Result } from '../core/evaluate';
import { CATEGORIES, PLAYABLE_CATEGORIES } from '../core/data/categories';
import { speedNorms } from '../core/data/norms';
import { LAND, PRICES } from '../core/data/prices';
import { minCategoryForTraffic, TRAFFIC_THRESHOLDS, type ScenarioParams } from '../core/data/scenario';
import type { Best } from '../state';

export function czk(v: number): string {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)} bn CZK`;
  if (a >= 1e7) return `${(v / 1e6).toFixed(0)} M CZK`;
  return `${(v / 1e6).toFixed(1)} M CZK`;
}
const num = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const km = (m: number) => `${num(m / 1000, 2)} km`;
const kvol = (m3: number) => `${num(m3 / 1000, 0)}k m³`;

export interface HudEvents {
  onCategory?: (c: string) => void;
  onSpeed?: (s: number) => void;
  onAutoProfile?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onReset?: () => void;
  onLoadBest?: () => void;
  onRadius?: (i: number, r: number | null) => void;
  onDeletePi?: (i: number) => void;
  onViolation?: (k: number) => void;
  onExaggeration?: (e: number) => void;
  onVpiRadius?: (i: number, r: number | null) => void;
  onDeleteVpi?: (i: number) => void;
}

export class Hud {
  ev: HudEvents = {};
  private $ = <T extends HTMLElement = HTMLElement>(id: string) => this.root.querySelector<T>(`#${id}`)!;

  constructor(private root: HTMLElement, private sc: ScenarioParams) {
    const minCat = minCategoryForTraffic(sc.traffic);
    root.innerHTML = `
      <section class="card scenario">
        <div class="kicker">Scenario 1</div>
        <h1>${sc.title}</h1>
        <p>Build the <b>cheapest</b> norm-abiding road from <b>A</b> (D11 near Trutnov) to <b>B</b> (Polish border).</p>
        <div class="goals">
          <div><span>Traffic Y</span><b>${num(sc.traffic)} veh/day</b><small>needs ≥ ${CATEGORIES[minCat].label.split(' (')[0]} <i title="Placeholder thresholds: ${TRAFFIC_THRESHOLDS.map((t) => `${t.category} < ${isFinite(t.maxAadt) ? num(t.maxAadt) : '∞'}`).join(', ')}">(placeholder)</i></small></div>
          <div><span>Travel time X</span><b>≤ ${sc.maxTravelMin.toFixed(1)} min</b><small>length ÷ design speed</small></div>
        </div>
      </section>
      <section class="card controls">
        <label>Category <select id="cat">${PLAYABLE_CATEGORIES.map((c) => `<option value="${c}">${CATEGORIES[c].label}</option>`).join('')}</select></label>
        <label>Design speed <select id="speed">${[90, 80, 70].map((s) => `<option value="${s}">${s} km/h</option>`).join('')}</select></label>
        <div class="norms" id="norms"></div>
        <div class="btns">
          <button id="undo" title="Ctrl+Z">↶ Undo</button><button id="redo" title="Ctrl+Y">↷ Redo</button>
          <button id="auto" title="Recompute the grade line automatically">Auto profile</button>
          <button id="reset" title="Back to the naive straight line">Reset</button>
        </div>
      </section>
      <section class="card cost">
        <div class="total-row"><div id="total" class="total">—</div><div id="valid" class="badge">…</div></div>
        <div id="perkm" class="sub"></div>
        <table id="breakdown"></table>
      </section>
      <section class="card" id="pi-card" style="display:none"></section>
      <section class="card" id="vpi-card" style="display:none"></section>
      <section class="card stats"><table id="stats"></table></section>
      <section class="card viol"><h2 id="viol-h">Violations</h2><ol id="viol"></ol></section>
      <section class="card best" id="best"></section>
      <section class="card help">
        <h2>How to play</h2>
        <ul>
          <li><b>Click</b> the terrain to add a bend (PI) to the nearest leg</li>
          <li><b>Drag</b> a numbered PI to move it, <b>right-click</b> or <kbd>Del</kbd> to delete</li>
          <li>Map: <b>left-drag</b> pan · <b>right-drag</b> rotate · <b>wheel</b> zoom</li>
          <li>Profile: drag VPIs (takes manual control), <b>double-click</b> adds, <b>right-click</b> deletes, wheel zooms</li>
        </ul>
        <label class="exag">Vertical exaggeration <select id="exag"><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="3">3×</option></select></label>
      </section>`;
    this.$<HTMLSelectElement>('cat').onchange = (e) => this.ev.onCategory?.((e.target as HTMLSelectElement).value);
    this.$<HTMLSelectElement>('speed').onchange = (e) => this.ev.onSpeed?.(Number((e.target as HTMLSelectElement).value));
    this.$<HTMLSelectElement>('exag').onchange = (e) => this.ev.onExaggeration?.(Number((e.target as HTMLSelectElement).value));
    this.$('undo').onclick = () => this.ev.onUndo?.();
    this.$('redo').onclick = () => this.ev.onRedo?.();
    this.$('auto').onclick = () => this.ev.onAutoProfile?.();
    this.$('reset').onclick = () => { if (confirm('Reset to the naive straight design?')) this.ev.onReset?.(); };
    this.$('viol').onclick = (e) => {
      const li = (e.target as HTMLElement).closest('li') as HTMLElement | null;
      if (li?.dataset.k) this.ev.onViolation?.(Number(li.dataset.k));
    };
  }

  setDesign(d: Design, canUndo: boolean, canRedo: boolean) {
    this.$<HTMLSelectElement>('cat').value = d.category;
    this.$<HTMLSelectElement>('speed').value = String(d.speed);
    const n = speedNorms(d.speed);
    this.$('norms').innerHTML = `min R <b>${n.minRadius} m</b> (6 % superelev.) · no-superelev. R ${n.noSuperelevationRadius} m · transitions ≥ ${n.minTransition} m · max grade ${(this.sc.maxGradient * 100).toFixed(0)} %* · crest ≥ ${num(n.minCrestRadius)} m* · sag ≥ ${num(n.minSagRadius)} m* <span class="prov" title="older edition of ČSN 73 6101, not confirmed for 2018">*provisional</span>`;
    (this.$('undo') as HTMLButtonElement).disabled = !canUndo;
    (this.$('redo') as HTMLButtonElement).disabled = !canRedo;
    const auto = this.$('auto');
    auto.classList.toggle('on', d.profileMode === 'auto');
    auto.textContent = d.profileMode === 'auto' ? 'Auto profile ✓' : 'Auto profile';
  }

  setResult(r: Result, d: Design, best: Best | null) {
    const c = r.cost;
    this.$('total').textContent = czk(c.total);
    const valid = this.$('valid');
    valid.textContent = r.valid ? 'VALID' : 'NOT VALID';
    valid.className = 'badge ' + (r.valid ? 'ok' : 'bad');
    this.$('perkm').textContent = `${czk(c.total / (r.length / 1000))} per km · ${CATEGORIES[d.category].label} · ${d.speed} km/h`;
    const ed = c.earthDetail;
    const row = (k: string, v: number, title = '') => `<tr title="${title}"><td>${k}</td><td>${czk(v)}</td><td class="bar"><span style="width:${Math.min(100, (100 * v) / Math.max(1, c.total)).toFixed(1)}%"></span></td></tr>`;
    this.$('breakdown').innerHTML =
      row('Road (base)', c.roadBase, 'SFDI per-km norm minus the value of its built-in earthworks allowance, at-grade length only') +
      row('Earthworks', c.earthworks, `excavation ${czk(ed.excavation)}, fill ${czk(ed.fillPlacing)}, haul ${czk(ed.haul)}, surplus to tip ${czk(ed.surplusHaul)}, unsuitable 15 % to tip ${czk(ed.unsuitable)}, bought fill ${czk(ed.borrow)}, topsoil ${czk(ed.topsoil)}`) +
      row('Bridges', c.bridges) + row('Tunnels', c.tunnels) +
      row(`Other objects +${(PRICES.otherObjectsSurcharge * 100).toFixed(1)} %`, c.surcharge) +
      row('Land & penalties*', c.land, `land ${czk(c.landDetail.land)} (provisional ${LAND.perM2} CZK/m²), forest ${czk(c.landDetail.forest)}, buildings ${czk(c.landDetail.buildings)} (provisional ${czk(LAND.perBuilding)} each)`);
    const q = r.quantities;
    const tOk = r.travelMin <= this.sc.maxTravelMin;
    this.$('stats').innerHTML = `
      <tr><td>Length</td><td>${km(r.length)}</td></tr>
      <tr class="${tOk ? '' : 'bad'}"><td>Travel time</td><td>${num(r.travelMin, 2)} min <small>/ ≤ ${this.sc.maxTravelMin.toFixed(1)}</small></td></tr>
      <tr><td>Cut / fill</td><td>${kvol(q.cut)} / ${kvol(q.fill)} <small>(${num(q.cut / r.length, 0)} / ${num(q.fill / r.length, 0)} m³/m)</small></td></tr>
      <tr><td>Mass balance</td><td>${q.surplus > 1 ? `surplus ${kvol(q.surplus)} to tip` : q.deficit > 1 ? `deficit ${kvol(q.deficit)} bought` : 'balanced'} <small>· reused ${kvol(q.reused)}, avg haul ${num(q.avgHaul / 1000, 1)} km, 15 % of cut unsuitable</small></td></tr>
      <tr><td>Bridges</td><td>${q.bridges} · ${num(q.bridgeLength, 0)} m</td></tr>
      <tr><td>Tunnels</td><td>${q.tunnels} · ${num(q.tunnelLength, 0)} m</td></tr>
      <tr><td>Footprint</td><td>${num(q.footprint / 1e4, 1)} ha <small>(forest ${num(q.forestArea / 1e4, 1)} ha)</small></td></tr>
      <tr class="${q.buildingsHit ? 'warn' : ''}"><td>Buildings demolished</td><td>${q.buildingsHit}</td></tr>
      <tr><td><small>recompute</small></td><td><small>${num(r.timing.total ?? 0, 0)} ms</small></td></tr>`;
    const v = r.violations;
    this.$('viol-h').innerHTML = v.length ? `Violations <span class="count">${v.length}</span>` : 'Violations <span class="count ok">0</span>';
    this.$('viol').innerHTML = v.length
      ? v.slice(0, 60).map((x, k) => `<li data-k="${k}" class="${x.goal ? 'goal' : ''}"><span class="where">${x.goal ? 'goal' : `km ${num(x.s0 / 1000, 2)}`}</span> ${x.msg}</li>`).join('')
      : '<li class="none">All norm checks pass.</li>';
    this.$('best').innerHTML = best
      ? `<h2>Best valid design</h2><div class="best-row"><b>${czk(best.cost)}</b><button id="load-best">Load</button></div>`
      : '<h2>Best valid design</h2><div class="sub">none yet — make the design valid</div>';
    const lb = this.root.querySelector<HTMLButtonElement>('#load-best');
    if (lb) lb.onclick = () => this.ev.onLoadBest?.();
  }

  setSelectedPi(i: number | null, r: Result | null, d: Design) {
    const card = this.$('pi-card');
    if (i === null || !d.pis[i]) { card.style.display = 'none'; return; }
    card.style.display = '';
    const cv = r?.curves[i];
    const n = speedNorms(d.speed);
    const auto = d.pis[i].r === null;
    const rv = d.pis[i].r ?? cv?.r ?? n.minRadius;
    card.innerHTML = `<h2>PI ${i + 1}</h2>
      <div class="pi-row">
        <label>Radius <input id="pi-r" type="number" min="50" step="5" value="${Math.round(rv)}" ${auto ? 'disabled' : ''}> m</label>
        <label><input id="pi-auto" type="checkbox" ${auto ? 'checked' : ''}> auto</label>
        <button id="pi-del">Delete</button>
      </div>
      <input id="pi-slider" type="range" min="${Math.round(n.minRadius * 0.5)}" max="5000" step="5" value="${Math.round(rv)}">
      <div class="sub">deflection ${cv ? num((cv.delta * 180) / Math.PI, 1) : '—'}° · tangent ${cv ? num(cv.t, 0) : '—'} m · arc ${cv ? num(cv.delta * cv.rEff, 0) : '—'} m${cv && cv.rEff < cv.r - 1 ? ' · <span class="badtxt">overlaps neighbour</span>' : ''}</div>`;
    const inp = card.querySelector<HTMLInputElement>('#pi-r')!;
    const sl = card.querySelector<HTMLInputElement>('#pi-slider')!;
    inp.onchange = () => this.ev.onRadius?.(i, Math.max(10, Number(inp.value)));
    sl.oninput = () => { inp.value = sl.value; this.ev.onRadius?.(i, Number(sl.value)); };
    card.querySelector<HTMLInputElement>('#pi-auto')!.onchange = (e) => this.ev.onRadius?.(i, (e.target as HTMLInputElement).checked ? null : Math.round(rv));
    card.querySelector<HTMLButtonElement>('#pi-del')!.onclick = () => this.ev.onDeletePi?.(i);
  }

  setSelectedVpi(i: number | null, r: Result | null) {
    const card = this.$('vpi-card');
    if (i === null || !r || i <= 0 || i >= r.vpis.length - 1) { card.style.display = 'none'; return; }
    card.style.display = '';
    const vc = r.vcurves[i - 1];
    const v = r.vpis[i];
    card.innerHTML = `<h2>VPI ${i} <small>km ${num(v.s / 1000, 2)} · ${num(v.z, 1)} m</small></h2>
      <div class="pi-row">
        <label>${vc?.type ?? ''} radius <input id="vpi-r" type="number" min="100" step="100" value="${Math.round(vc?.r ?? 0)}" ${v.r === null ? 'disabled' : ''}> m</label>
        <label><input id="vpi-auto" type="checkbox" ${v.r === null ? 'checked' : ''}> min</label>
        <button id="vpi-del">Delete</button>
      </div>
      <div class="sub">curve length ${num(vc?.len ?? 0, 0)} m</div>`;
    const inp = card.querySelector<HTMLInputElement>('#vpi-r')!;
    inp.onchange = () => this.ev.onVpiRadius?.(i, Number(inp.value));
    card.querySelector<HTMLInputElement>('#vpi-auto')!.onchange = (e) => this.ev.onVpiRadius?.(i, (e.target as HTMLInputElement).checked ? null : Math.round(vc?.r ?? 0));
    card.querySelector<HTMLButtonElement>('#vpi-del')!.onclick = () => this.ev.onDeleteVpi?.(i);
  }
}
