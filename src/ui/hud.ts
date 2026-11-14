// Right-hand HUD: scenario card, controls, cost, stats, violations, selected PI, best design.

import { BASIS_LABEL, type Violation } from '../core/checks';
import type { CostBreakdown } from '../core/cost';
import type { Design, Result } from '../core/evaluate';
import { CATEGORIES, PLAYABLE_CATEGORIES } from '../core/data/categories';
import { speedNorms } from '../core/data/norms';
import { LAND, PRICES, STRUCTURE_RULES } from '../core/data/prices';
import { minCategoryForTraffic, SCENARIOS, TRAFFIC_THRESHOLDS, type ScenarioParams } from '../core/data/scenario';
import { ACCESS, BUILDING_KINDS, BUILDING_RULES, CROSSING_RULES, JUNCTION, NOISE, URBAN_LAND, URBAN_RATES } from '../core/data/urban';
import { rangeSummary } from '../core/range';
import type { StructureKind } from '../core/overrides';
import type { Best, StationRange } from '../state';
import { COST_GROUPS, czk } from './costgroups';
import { activeStructure, structureButtons } from './structure-bar';

export { czk };
const num = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const km = (m: number) => `${num(m / 1000, 2)} km`;
const kvol = (m3: number) => `${num(m3 / 1000, 0)}k m³`;

export interface HudEvents {
  onCategory?: (c: string) => void;
  onSpeed?: (s: number) => void;
  onProfileMode?: (mode: 'auto' | 'manual') => void;
  onStructure?: (kind: StructureKind | null) => void;
  onReset?: () => void;
  onLoadBest?: () => void;
  onRadius?: (i: number, r: number | null) => void;
  onDeletePi?: (i: number) => void;
  /** pin the road height (Automatic) / add a height point (By hand) at bend i */
  onBendHeight?: (i: number) => void;
  onViolation?: (k: number) => void;
  onExaggeration?: (e: number) => void;
  onVpiRadius?: (i: number, r: number | null) => void;
  onDeleteVpi?: (i: number) => void;
  /** back to the whole-route breakdown */
  onClearRange?: () => void;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const whyKey = (v: Violation) => `${v.kind}|${v.title}`;

const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

/** what each line of the breakdown contains (shown as a tooltip) */
const ROW_HELP: Record<string, (c: CostBreakdown, sc: ScenarioParams) => string> = {
  roadBase: () => `SFDI per-km norm minus the value of its built-in earthworks allowance, at-grade length only; inside built-up areas the "intravilán" norm row`,
  earthworks: (c) => {
    const e = c.earthDetail;
    return `excavation ${czk(e.excavation)} (ČGS mapped ground + estimated weathering profiles; unmapped ground uses norm mix), fill ${czk(e.fillPlacing)}, haul ${czk(e.haul)}, surplus to tip ${czk(e.surplusHaul)}, unsuitable 15 % to tip ${czk(e.unsuitable)}, bought fill ${czk(e.borrow)}, topsoil ${czk(e.topsoil)}, high-earthwork engineering ${czk(e.geotechnical)} (provisional reserve)`;
  },
  bridges: () => 'SFDI bridge norm per km of bridge; includes the short bridges forced over rivers, railways and roads clearly below the grade',
  tunnels: () => 'SFDI bored-tunnel norm per km of tube (urban rows under built-up areas)',
  culverts: () => 'Full watercourse crossing: catchment-estimated Q100 sizes pipe or natural-bed box; skewed footprint length × size-specific rate + two heads. OTSKP 2026 items + provisional assemblies. Large flows/widths or excessive barrel lengths require bridges. DEM catchments and Q100 are screening estimates, not surveyed hydrology. Ordinary road drainage remains in the road norm.',
  crossings: () => `Class I–III junctions ≥ ${CROSSING_RULES.junctionSpacing} m apart, including A/B (also in town: scenario assumption), higher class first. Junction ${czk(JUNCTION)}: low-confidence roundabout-based allowance. Other roads: cheaper of overbridge + approach ramps or parallel reconnection/diversion to a resolved road. Links priced by total length on both sides × SPK 2026 road rows (local roads: rural/urban mask; tracks: paved P4). Reach ≤ ${CROSSING_RULES.linkMaxReach} m per side, otherwise overbridge. Service reconnection includes ${czk(ACCESS)} simple access onto the link, never our road. SPK works get other-objects surcharge. Roads ≥ ${CROSSING_RULES.overHeight} m below grade get our bridge (under Bridges). Motorways/expressways still need bridge ≥ ${STRUCTURE_RULES.railClearance} m above or overbridge ≥ ${CROSSING_RULES.underDepth} m below.`,
  noiseWalls: (_c, sc) => `PROVISIONAL screening model, not an acoustic assessment: ${NOISE.wallHeights.join(' / ')} m walls at ${NOISE.wallPerM2.toLocaleString('en-US')} CZK/m² (research-informed calibrated estimate; project datapoint assumes 3 m height, not escalated to 2026); geometric single-edge diffraction at ${NOISE.wavelength} m wavelength, minus ${NOISE.trafficCorrectionDb} dB traffic allowance, capped at ${NOISE.maxAttenuationDb} dB. Near-lane source ${NOISE.sourceHeight} m above grade; wall at crown edge + ${NOISE.wallEdgeOffset} m, not the slope toe. Czech Manuál 2018/2020 vehicle emissions and ${NOISE.ground}-ground propagation (EIA-calibrated ground class, no emission offset); separate 16 h day / 8 h night traffic (TP 219), ${Math.round(100 * (sc.heavyShare ?? NOISE.heavyShare))}% acoustic heavy share. Excess is the larger exceedance of ${NOISE.limitDayDb}/${NOISE.limitNightDb} dB day/night. No guessed contour. Receiver ${NOISE.facadeOffset} m in front of the facade, top floor ${NOISE.receiverHeight} + ${NOISE.storeyHeight} × (levels − 1) m above building ground; attenuation depends on the source–wall–receiver path difference; zero when the receiver sees over the wall. Excess uses slant source–receiver distance. Cut edges use the same diffraction formula; take the better of earth edge and wall, not their sum. Only tunnels fully shield.`,
  noiseBuyouts: () => `Buildings bought out explicitly by the player or automatically for noise, separate from footprint demolitions; building-only estimate × ${BUILDING_RULES.purchaseMultiplier} + demolition, plus a PROVISIONAL plot max(${BUILDING_RULES.buyoutPlotMultiple} × footprint, ${BUILDING_RULES.buyoutPlotMinimum} m²) at ${URBAN_LAND.buildingLandPerM2} × ${URBAN_LAND.multiplier} CZK/m². Bought out when neither the earth edge nor the tallest available wall protects the top-floor receiver in the PROVISIONAL model; not an acoustic assessment.`,
  surcharge: () => `SFDI "other objects" (utilities, drainage, safety, preparation…): +${pct(PRICES.otherObjectsSurcharge)} of construction, +${pct(URBAN_RATES.otherObjectsSurcharge)} inside built-up areas`,
  land: () => `statutory purchase (Act 416/2009 §3b): ${LAND.perM2} CZK/m² (8 × ${LAND.perM2 / 8} market price) outside, ${(URBAN_LAND.buildingLandPerM2 * URBAN_LAND.multiplier).toLocaleString('en-US')} CZK/m² (1.5 × ${URBAN_LAND.buildingLandPerM2.toLocaleString('en-US')}) inside built-up areas`,
  forest: () => `+${LAND.forestExtraPerM2} CZK/m² of forest in the footprint (clearing, forest-land removal levy; PROVISIONAL estimate, not a sourced local rate)`,
  buildings: () => `building only, land billed separately: floor area × (replacement-value estimate × ${BUILDING_RULES.purchaseMultiplier} + demolition), CZK/m²: ${BUILDING_KINDS.map((k) => `${k.label} ${k.pricePerM2.toLocaleString('en-US')} + ${k.demolitionPerM2.toLocaleString('en-US')}`).join(', ')}`,
};

export class Hud {
  ev: HudEvents = {};
  private last: { r: Result; d: Design } | null = null;
  private range: StationRange | null = null;
  /** violations whose explanation the player unfolded */
  private openWhy = new Set<string>();
  private $ = <T extends HTMLElement = HTMLElement>(id: string) => this.root.querySelector<T>(`#${id}`)!;

  constructor(private root: HTMLElement, private sc: ScenarioParams) {
    const minCat = minCategoryForTraffic(sc.traffic);
    root.innerHTML = `
      <section class="card scenario">
        <div class="kicker">Scenario ${Object.keys(SCENARIOS).indexOf(sc.id) + 1}</div>
        <h1>${sc.title}</h1>
        <p>Build the <b>cheapest</b> norm-abiding road from ${sc.labels.brief}.</p>
        <div class="goals">
          <div><span>Traffic Y</span><b>${num(sc.traffic)} veh/day</b><small>needs ≥ ${CATEGORIES[minCat].label.split(' (')[0]} <i title="Class I road at LOS C (TP 188 / TP 189, hilly, 15 % heavy; research/14): ${TRAFFIC_THRESHOLDS.filter((t) => isFinite(t.maxAadt)).map((t) => `${t.category} ≤ ${num(t.maxAadt)}`).join(', ')}">(TP 188)</i></small></div>
          <div><span>Travel time X</span><b>≤ ${sc.maxTravelMin.toFixed(1)} min</b><small>length ÷ design speed</small></div>
        </div>
      </section>
      <section class="card controls">
        <label>Category <select id="cat">${PLAYABLE_CATEGORIES.map((c) => `<option value="${c}">${CATEGORIES[c].label}</option>`).join('')}</select></label>
        <label>Design speed <select id="speed">${[90, 80, 70].map((s) => `<option value="${s}">${s} km/h</option>`).join('')}</select></label>
        <div class="norms" id="norms"></div>
        <div class="mode">
          <div class="mode-h"><b>Road height</b><small>the black line in the profile below</small></div>
          <div class="seg" role="radiogroup" aria-label="Road height">
            <button id="grade-auto" role="radio" title="The game picks the cheapest legal heights and redoes them after every change of the route">Automatic</button><button id="grade-manual" role="radio" title="Start from the current automatic heights and drag the height points yourself">By hand</button>
          </div>
          <p id="mode-explain" class="mode-explain"></p>
        </div>
        <div class="btns"><button id="reset" title="Throw the design away and start again from the straight line (Undo brings it back)">Start over</button></div>
      </section>
      <section class="card cost">
        <div class="total-row"><div id="total" class="total">—</div><div id="valid" class="badge">…</div></div>
        <div id="invalid-note" class="invalid-note" style="display:none">invalid — fix the violations; this cost does not count</div>
        <div id="perkm" class="sub"></div>
        <div id="range" class="range" style="display:none"></div>
        <table id="breakdown"></table>
      </section>
      <section class="card" id="pi-card" style="display:none"></section>
      <section class="card" id="vpi-card" style="display:none"></section>
      <section class="card stats"><table id="stats"></table><div class="sub">Noise: provisional screening, not an acoustic assessment. Teal = walls; red squares = footprint demolitions; magenta diamonds = noise/player buyouts (purchase + demolition); green outlines = kept buildings.</div></section>
      <section class="card viol"><h2 id="viol-h">Violations</h2><ol id="viol"></ol></section>
      <section class="card best" id="best"></section>
      <section class="card help">
        <h2>How to play</h2>
        <ul>
          <li><b>Move the route:</b> click the map to add a bend, drag a numbered bend to move it, right-click it (or <kbd>Del</kbd>) to delete it.</li>
          <li><b>Wider or tighter curve:</b> click a bend, then drag its ◇ grips or turn the mouse wheel over it.</li>
          <li><b>Look around the map:</b> drag to pan, right-drag to rotate, wheel to zoom.</li>
          <li><b>Look along the profile:</b> click it to zoom in there (the map follows), wheel to zoom, right-drag to scroll.</li>
          <li><b>Bridge or tunnel somewhere:</b> drag across the profile to select a stretch, then pick <b>Bridge</b>, <b>Tunnel</b>, <b>Earthwork</b> or <b>Automatic</b> in the bar that pops up.</li>
          <li><b>Raise or lower the road:</b> in Automatic, click the road line in the profile to pin its height there, then drag the pin. By hand, drag the height points (◆); double-click the line to add one.</li>
          <li><b>Why so expensive?</b> Hover the profile for the costs at that spot; a selected stretch shows its own bill above.</li>
          <li><b>Crossed roads, buildings:</b> click one on the map and choose in <b>Build tools</b> (<kbd>Shift</kbd>+click adds a bend there instead).</li>
          <li>Noise protection: <kbd>N</kbd> = noise view: the road's noise level relative to the limit, dwellings coloured by outcome (wall, cut, bought out); <b>hover</b> a building or wall for the levels and the reason</li>
          <li><b>Made a mistake?</b> Undo / Redo at the top left of the map, <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Shift+Z</kbd>.</li>
        </ul>
        <label class="exag">Vertical exaggeration <select id="exag"><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="3">3×</option></select></label>
      </section>`;
    this.$<HTMLSelectElement>('cat').onchange = (e) => this.ev.onCategory?.((e.target as HTMLSelectElement).value);
    this.$<HTMLSelectElement>('speed').onchange = (e) => this.ev.onSpeed?.(Number((e.target as HTMLSelectElement).value));
    this.$<HTMLSelectElement>('exag').onchange = (e) => this.ev.onExaggeration?.(Number((e.target as HTMLSelectElement).value));
    this.$('grade-auto').onclick = () => this.ev.onProfileMode?.('auto');
    this.$('grade-manual').onclick = () => this.ev.onProfileMode?.('manual');
    this.$('reset').onclick = () => { if (confirm('Start over from the straight line? (Undo brings your design back.)')) this.ev.onReset?.(); };
    this.$('range').onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.structure !== undefined) this.ev.onStructure?.(b.dataset.structure === 'clear' ? null : Number(b.dataset.structure) as StructureKind);
      else this.ev.onClearRange?.();
    };
    this.$('viol').onclick = (e) => {
      const why = (e.target as HTMLElement).closest('.why') as HTMLElement | null;
      const li = (e.target as HTMLElement).closest('li') as HTMLElement | null;
      if (why && li) {
        // "why?" unfolds the explanation (kept open across recomputes) instead of jumping to the place
        const x = this.last?.r.violations[Number(why.dataset.why)];
        const box = li.querySelector<HTMLElement>('.vdetail')!;
        box.hidden = !box.hidden;
        why.textContent = box.hidden ? 'why?' : 'less';
        if (x) { if (box.hidden) this.openWhy.delete(whyKey(x)); else this.openWhy.add(whyKey(x)); }
        return;
      }
      if (li?.dataset.k) this.ev.onViolation?.(Number(li.dataset.k));
    };
  }

  setDesign(d: Design) {
    this.$<HTMLSelectElement>('cat').value = d.category;
    this.$<HTMLSelectElement>('speed').value = String(d.speed);
    const n = speedNorms(d.speed);
    const norms = this.$('norms');
    norms.innerHTML = `Rules at ${d.speed} km/h: curves ≥ <b>${n.minRadius} m</b> radius · slopes ≤ <b>${(this.sc.maxGradient * 100).toFixed(0)} %</b>* · hilltops rounded ≥ ${num(n.minCrestRadius)} m*, dips ≥ ${num(n.minSagRadius)} m* <span class="prov" title="* from an older edition of ČSN 73 6101, not confirmed for 2018">*provisional</span>`;
    norms.title = `ČSN 73 6101 at ${d.speed} km/h: smallest curve radius ${n.minRadius} m (with 6 % banking); from ${n.noSuperelevationRadius} m no banking is needed; easement (transition) curves ≥ ${n.minTransition} m; steepest slope ${(this.sc.maxGradient * 100).toFixed(0)} %; vertical rounding radius ≥ ${num(n.minCrestRadius)} m on hilltops (crests), ≥ ${num(n.minSagRadius)} m in dips (sags).`;
    for (const mode of ['auto', 'manual'] as const) {
      const b = this.$(`grade-${mode}`);
      b.classList.toggle('on', d.profileMode === mode);
      b.setAttribute('aria-checked', String(d.profileMode === mode));
    }
    this.$('mode-explain').innerHTML = d.profileMode === 'auto'
      ? '<b>Automatic:</b> the game sets the road\'s height along the route for the lowest cost and updates it whenever you move the route. To force a height somewhere, click the road line in the profile: that pins it, and you can drag the pin up or down.'
      : '<b>By hand:</b> you drag the height points (◆) in the profile yourself; double-click the road line to add one, right-click one to delete it. Moving the route keeps your points. <i>Automatic</i> would replace them (Undo brings them back).';
  }

  setProfileBusy(busy: boolean) {
    const manual = this.$<HTMLButtonElement>('grade-manual');
    manual.disabled = busy;
    manual.title = busy ? 'One moment: the automatic heights are still being computed' : 'Start from the current automatic heights and drag the height points yourself';
  }

  /** switch the breakdown and quantities to a station range (null = whole route) */
  setRange(range: StationRange | null) {
    this.range = range;
    if (this.last) this.renderCost(this.last.r, this.last.d);
  }

  private renderCost(r: Result, d: Design) {
    const whole = r.cost;
    const total = this.$('total');
    total.textContent = czk(whole.total);
    total.classList.toggle('invalid', !r.valid);
    this.$('invalid-note').style.display = r.valid ? 'none' : '';
    const valid = this.$('valid');
    valid.textContent = r.valid ? 'VALID' : 'NOT VALID';
    valid.className = 'badge ' + (r.valid ? 'ok' : 'bad');
    this.$('perkm').textContent = `${czk(whole.total / (r.length / 1000))} per km · ${CATEGORIES[d.category].label} · ${d.speed} km/h`;
    const sel = this.range && this.range.s0 < r.length ? rangeSummary(r, this.range.s0, Math.min(this.range.s1, r.length)) : null;
    const box = this.$('range');
    box.style.display = sel ? '' : 'none';
    if (sel) {
      box.innerHTML = `<div class="range-h"><b>Selected km ${num(sel.s0 / 1000, 2)} – ${num(sel.s1 / 1000, 2)}</b><button title="Deselect: back to the whole route's bill (Esc)">✕ Deselect</button></div>
        <div class="range-cost"><b>${czk(sel.cost.total)}</b> · ${km(sel.length)} · ${czk(sel.cost.total / (sel.length / 1000))} per km <small>(${num((100 * sel.cost.total) / Math.max(1, whole.total), 0)} % of the route's cost on ${num((100 * sel.length) / r.length, 0)} % of its length)</small></div>
        <div class="range-build"><span>Build here:</span>${structureButtons(activeStructure(sel, d.structureOverrides))}</div>`;
    }
    const c = sel ? sel.cost : whole;
    this.$('breakdown').innerHTML = COST_GROUPS.map((g) => {
      const v = g.of(c);
      const label = g.id === 'surcharge' ? `Other objects <small>+${(PRICES.otherObjectsSurcharge * 100).toFixed(0)} / ${(URBAN_RATES.otherObjectsSurcharge * 100).toFixed(0)} %</small>` : g.label;
      return `<tr title="${ROW_HELP[g.id](c, this.sc).replace(/"/g, '&quot;')}" class="${v > 0 ? '' : 'zero'}"><td><i class="sw" style="background:${g.color}"></i>${label}</td><td>${czk(v)}</td><td class="bar"><span style="width:${Math.min(100, (100 * v) / Math.max(1, c.total)).toFixed(1)}%;background:${g.color}"></span></td></tr>`;
    }).join('');
    const q = r.quantities;
    const tOk = r.travelMin <= this.sc.maxTravelMin;
    const x = { bridge: 0, tunnel: 0, overbridge: 0, atGrade: 0, junction: 0, reconnection: 0, diversion: 0 };
    let reconnectM = 0, divertM = 0;
    for (const cr of r.crossings) if (!sel || (cr.i >= sel.i0 && cr.i <= sel.i1)) {
      x[cr.type]++;
      if (cr.type === 'reconnection') reconnectM += cr.linkLength ?? 0;
      if (cr.type === 'diversion') divertM += cr.linkLength ?? 0;
    }
    const xing = `${Object.values(x).reduce((a, b) => a + b, 0)} <small>(${[x.junction ? `${x.junction} junction${x.junction === 1 ? '' : 's'}` : '', x.reconnection ? `${x.reconnection} reconnection${x.reconnection === 1 ? '' : 's'} ${num(reconnectM, 0)} m` : '', x.diversion ? `${x.diversion} diversion${x.diversion === 1 ? '' : 's'} ${num(divertM, 0)} m` : '', x.atGrade ? `${x.atGrade} invalid at grade` : '', x.overbridge ? `${x.overbridge} overbridge${x.overbridge === 1 ? '' : 's'}` : '', x.bridge ? `${x.bridge} under our bridges` : '', x.tunnel ? `${x.tunnel} above tunnels` : ''].filter(Boolean).join(', ') || 'none'})</small>`;
    const cls = q.cutByClass.map((v) => num((100 * v) / Math.max(1, q.cut), 0)).join(' / ');
    const common = (cut: number, fill: number, len: number, fp: number, forest: number, urban: number, bld: number, buyouts: number, walls: number, wallArea: number) => `
      <tr><td>Cut / fill</td><td>${kvol(cut)} / ${kvol(fill)} <small>(${num(cut / len, 0)} / ${num(fill / len, 0)} m³/m)</small></td></tr>
      <tr><td>Footprint</td><td>${num(fp / 1e4, 1)} ha <small>(forest ${num(forest / 1e4, 1)} ha)</small></td></tr>
      <tr><td>In built-up area</td><td>${km(urban)}</td></tr>
      <tr class="${bld ? 'warn' : ''}"><td>Footprint demolitions</td><td>${bld}</td></tr>
      <tr class="${buyouts ? 'warn' : ''}" title="Separate from footprint demolitions; purchase + demolition"><td>Off-corridor buyouts</td><td>${buyouts}</td></tr>
      <tr><td>Roads crossed</td><td>${xing}</td></tr>
      <tr><td>Noise walls</td><td>${num(walls, 0)} m / ${num(wallArea, 0)} m²</td></tr>`;
    this.$('stats').innerHTML = sel ? `
      <tr class="head"><td colspan="2">Selected stretch</td></tr>
      <tr><td>Length</td><td>${km(sel.length)} <small>of ${km(r.length)}</small></td></tr>
      <tr><td>Bridges / tunnels</td><td>${num(sel.quantities.bridgeLength, 0)} m / ${num(sel.quantities.tunnelLength, 0)} m</td></tr>
      ${common(sel.quantities.cut, sel.quantities.fill, sel.length, sel.quantities.footprint, sel.quantities.forestArea, sel.quantities.urbanLength, sel.quantities.buildings, sel.quantities.noiseBuyouts, sel.quantities.wallLength, sel.quantities.wallArea)}
      <tr class="${tOk ? '' : 'bad'}"><td>Travel time <small>(route)</small></td><td>${num(r.travelMin, 2)} min <small>/ ≤ ${this.sc.maxTravelMin.toFixed(1)}</small></td></tr>` : `
      <tr><td>Length</td><td>${km(r.length)}</td></tr>
      <tr class="${tOk ? '' : 'bad'}"><td>Travel time</td><td>${num(r.travelMin, 2)} min <small>/ ≤ ${this.sc.maxTravelMin.toFixed(1)}</small></td></tr>
      <tr><td>Bridges</td><td>${q.bridges} · ${num(q.bridgeLength, 0)} m</td></tr>
      <tr><td>Tunnels</td><td>${q.tunnels} · ${num(q.tunnelLength, 0)} m</td></tr>
      ${common(q.cut, q.fill, r.length, q.footprint, q.forestArea, q.urbanLength, q.buildingsHit, q.noiseBuyouts, q.wallLength, q.wallArea)}
      <tr title="ČGS GEOCR50 / IG 1:50k lithology + estimated local loose/weathered/competent layers, not measured borehole profiles. Hover the profile for ground names. Unmapped cells use norm mix 75/20/5."><td>Excavation class</td><td>${cls} % <small>I / II / III</small></td></tr>
      <tr><td>Mass balance</td><td>${q.surplus > 1 ? `surplus ${kvol(q.surplus)} to tip` : q.deficit > 1 ? `deficit ${kvol(q.deficit)} bought` : 'balanced'} <small>· reused ${kvol(q.reused)}, avg haul ${num(q.avgHaul / 1000, 1)} km, 15 % of cut unsuitable</small></td></tr>
      <tr><td><small>recompute</small></td><td><small>${num(r.timing.total ?? 0, 0)} ms</small></td></tr>`;
  }

  setResult(r: Result, d: Design, best: Best | null) {
    this.last = { r, d };
    this.renderCost(r, d);
    const v = r.violations;
    this.$('viol-h').innerHTML = v.length ? `Violations <span class="count">${v.length}</span>` : 'Violations <span class="count ok">0</span>';
    this.$('viol').innerHTML = v.length
      ? v.slice(0, 60).map((x, k) => {
        const open = this.openWhy.has(whyKey(x));
        return `<li data-k="${k}" class="${x.goal ? 'goal' : ''}" title="Click to show the place">
          <span class="where">${x.goal ? 'goal' : `km ${num(x.s0 / 1000, 2)}`}</span>
          <div><div class="vt">${esc(x.title)}</div>
          <div class="vfix">→ ${esc(x.fix)}</div>
          <div class="vmeta"><span class="basis ${x.basis}" title="${esc(x.rule)}">${BASIS_LABEL[x.basis]}</span><button class="why" data-why="${k}">${open ? 'less' : 'why?'}</button></div>
          <div class="vdetail"${open ? '' : ' hidden'}>${x.detail ? esc(x.detail) : ''}<small>${esc(x.rule)}</small></div></div>
        </li>`;
      }).join('')
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
    card.innerHTML = `<h2>Bend ${i + 1}</h2>
      <div class="pi-row">
        <label>Curve radius <input id="pi-r" type="number" min="50" step="5" value="${Math.round(rv)}" ${auto ? 'disabled' : ''}> m</label>
        <label title="The smallest radius the rules allow"><input id="pi-auto" type="checkbox" ${auto ? 'checked' : ''}> smallest allowed</label>
        <button id="pi-del">Delete</button>
      </div>
      <input id="pi-slider" type="range" min="${Math.round(n.minRadius * 0.5)}" max="5000" step="5" value="${Math.round(rv)}">
      <div class="btns"><button id="pi-height">${d.profileMode === 'auto' ? 'Pin road height at this bend' : 'Add a height point at this bend'}</button></div>
      <div class="sub">turns ${cv ? num((cv.delta * 180) / Math.PI, 1) : '—'}° · curve ${cv ? num(cv.delta * cv.rEff, 0) : '—'} m long, starts ${cv ? num(cv.t, 0) : '—'} m before the bend${cv && cv.rEff < cv.r - 1 ? ' · <span class="badtxt">runs into the next curve</span>' : ''}</div>`;
    const inp = card.querySelector<HTMLInputElement>('#pi-r')!;
    const sl = card.querySelector<HTMLInputElement>('#pi-slider')!;
    inp.onchange = () => this.ev.onRadius?.(i, Math.max(10, Number(inp.value)));
    sl.oninput = () => { inp.value = sl.value; this.ev.onRadius?.(i, Number(sl.value)); };
    card.querySelector<HTMLInputElement>('#pi-auto')!.onchange = (e) => this.ev.onRadius?.(i, (e.target as HTMLInputElement).checked ? null : Math.round(rv));
    card.querySelector<HTMLButtonElement>('#pi-del')!.onclick = () => this.ev.onDeletePi?.(i);
    card.querySelector<HTMLButtonElement>('#pi-height')!.onclick = () => this.ev.onBendHeight?.(i);
  }

  setSelectedVpi(i: number | null, r: Result | null) {
    const card = this.$('vpi-card');
    if (i === null || !r || i <= 0 || i >= r.vpis.length - 1) { card.style.display = 'none'; return; }
    card.style.display = '';
    const vc = r.vcurves[i - 1];
    const v = r.vpis[i];
    const what = vc?.type === 'crest' ? 'Hilltop' : vc?.type === 'sag' ? 'Dip' : 'Bend';
    card.innerHTML = `<h2>Height point ${i} <small>km ${num(v.s / 1000, 2)} · ${num(v.z, 1)} m</small></h2>
      <div class="pi-row">
        <label title="How gently the road rounds over this point (vertical curve radius)">${what} rounding <input id="vpi-r" type="number" min="100" step="100" value="${Math.round(vc?.r ?? 0)}" ${v.r === null ? 'disabled' : ''}> m</label>
        <label title="The smallest rounding the rules allow"><input id="vpi-auto" type="checkbox" ${v.r === null ? 'checked' : ''}> smallest allowed</label>
        <button id="vpi-del">Delete</button>
      </div>
      <div class="sub">the rounding is ${num(vc?.len ?? 0, 0)} m long</div>`;
    const inp = card.querySelector<HTMLInputElement>('#vpi-r')!;
    inp.onchange = () => this.ev.onVpiRadius?.(i, Number(inp.value));
    card.querySelector<HTMLInputElement>('#vpi-auto')!.onchange = (e) => this.ev.onVpiRadius?.(i, (e.target as HTMLInputElement).checked ? null : Math.round(vc?.r ?? 0));
    card.querySelector<HTMLButtonElement>('#vpi-del')!.onclick = () => this.ev.onDeleteVpi?.(i);
  }
}
