// Right-hand HUD, top to bottom: the score (total cost, validity, travel time, violations, best design;
// sticky), the contextual cards of whatever is selected (bend, height point, stretch, crossed road,
// building), then foldable sections: scenario goals, design controls, violations, cost breakdown,
// quantities, the list of the player's decisions and how to play. Fold state is remembered.

import { BASIS_LABEL, type Violation } from '../core/checks';
import type { CostBreakdown } from '../core/cost';
import type { Design, Result } from '../core/evaluate';
import { CATEGORIES, PLAYABLE_CATEGORIES } from '../core/data/categories';
import { speedNorms } from '../core/data/norms';
import { LAND, PRICES, STRUCTURE_RULES } from '../core/data/prices';
import { minCategoryForTraffic, SCENARIOS, TRAFFIC_THRESHOLDS, type ScenarioParams } from '../core/data/scenario';
import { ACCESS, BUILDING_KINDS, BUILDING_RULES, CROSSING_RULES, JUNCTION, NOISE, URBAN_LAND, URBAN_RATES } from '../core/data/urban';
import { rangeSummary } from '../core/range';
import type { Best, StationRange } from '../state';
import { COST_GROUPS, czk } from './costgroups';
import { footprintConflictsInRange, footprintConflictText, footprintConflictTitle } from './footprint';

export { czk };
// toLocaleString with options builds a formatter per call (≈ 0.1 ms; hundreds per HUD render)
const formats = new Map<number, Intl.NumberFormat>();
const num = (v: number, d = 0) => {
  let f = formats.get(d);
  if (!f) formats.set(d, f = new Intl.NumberFormat('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
  return f.format(v);
};
const km = (m: number) => `${num(m / 1000, 2)} km`;
const kvol = (m3: number) => `${num(m3 / 1000, 0)}k m³`;

export interface HudEvents {
  onCategory?: (c: string) => void;
  onSpeed?: (s: number) => void;
  onProfileMode?: (mode: 'auto' | 'manual') => void;
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
  /** close the bend / height point card */
  onClosePi?: () => void;
  onCloseVpi?: () => void;
  /** show the first-run introduction again */
  onIntro?: () => void;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const whyKey = (v: Violation) => `${v.kind}|${v.title}`;

const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

/** what each line of the breakdown contains (shown as a tooltip) */
export const ROW_HELP: Record<string, (c: CostBreakdown, sc: ScenarioParams) => string> = {
  roadBase: () => `SFDI per-km norm minus the value of the earthworks already counted in it, at-grade length only; inside built-up areas the "intravilán" norm row`,
  earthworks: (c) => {
    const e = c.earthDetail;
    return `excavation ${czk(e.excavation)} (ČGS mapped ground + estimated weathering profiles; unmapped ground uses norm mix), fill ${czk(e.fillPlacing)}, haul ${czk(e.haul)}, surplus to tip ${czk(e.surplusHaul)}, unsuitable 15 % to tip ${czk(e.unsuitable)}, bought fill ${czk(e.borrow)}, topsoil ${czk(e.topsoil)}, high-earthwork ground works ${czk(e.geotechnical)} (provisional reserve)`;
  },
  bridges: () => 'SFDI bridge norm per km of bridge; includes the short bridges forced over rivers, railways and roads clearly below the grade',
  tunnels: () => 'SFDI bored-tunnel norm per km of tube (urban rows under built-up areas)',
  culverts: () => 'Every stream we cross: the 100-year flood estimated from the land draining into it sizes a pipe or a box with a natural bed; its length under our earthworks × a size-specific rate, plus two end walls (OTSKP 2026 items and provisional assemblies, research/17). Big flows, wide streams or very long culverts need bridges instead. Drainage areas and floods are rough estimates from the terrain, not surveyed. Ordinary road drainage is already in the road price. Also includes the longer culverts needed where our slopes cover a stream.',
  crossings: () => `Roads we cross and roads our earthworks cover. Class I–III roads get a junction at least ${CROSSING_RULES.junctionSpacing} m from the next (counting both route ends; also in town as a scenario assumption), ${czk(JUNCTION)} each (low-confidence estimate from roundabout contracts, research/08). Other roads get the cheapest of: a bridge over our road with earth ramps; a reroute along the outside of our earthworks to a nearby crossing (preferably within ${CROSSING_RULES.linkMaxReach} m; up to ${CROSSING_RULES.linkHardReach} m when that costs at most half of a bridge over us), priced by its measured length × the SPK 2026 road price (paved P4 for tracks), plus ${czk(ACCESS)} for a service road's new access (provisional, research/13); or, for tracks, service and local roads under a high enough embankment, a concrete box underpass priced by its measured length (OTSKP 2026 items 389385 + 711442 + 451315 + the road surface) plus two entrance heads (research/19). Roads our earthworks cover are rebuilt beside them at the same prices, closed when other roads already connect their ends, or held back by retaining walls. These works get the other-objects surcharge. Roads at least ${CROSSING_RULES.overHeight} m below our road pass under our bridges (under Bridges). Motorways and expressways need our bridge at least ${STRUCTURE_RULES.railClearance} m above, or their bridge over a cutting at least ${CROSSING_RULES.underDepth} m deep.`,
  noiseWalls: (_c, sc) => `PROVISIONAL screening model, not an acoustic assessment: ${NOISE.wallHeights.join(' / ')} m walls at ${NOISE.wallPerM2.toLocaleString('en-US')} CZK/m² (research-informed calibrated estimate; project datapoint assumes 3 m height, not escalated to 2026); geometric single-edge diffraction at ${NOISE.wavelength} m wavelength, minus a ${NOISE.trafficCorrectionDb} dB traffic correction, capped at ${NOISE.maxAttenuationDb} dB. Near-lane source ${NOISE.sourceHeight} m above grade; wall at crown edge + ${NOISE.wallEdgeOffset} m, not the slope toe. Czech Manuál 2018/2020 vehicle emissions and ${NOISE.ground}-ground propagation (EIA-calibrated ground class, no emission offset); separate 16 h day / 8 h night traffic (TP 219), ${Math.round(100 * (sc.heavyShare ?? NOISE.heavyShare))}% acoustic heavy share. Excess is the larger exceedance of ${NOISE.limitDayDb}/${NOISE.limitNightDb} dB day/night. No guessed contour. Receiver ${NOISE.facadeOffset} m in front of the facade, top floor ${NOISE.receiverHeight} + ${NOISE.storeyHeight} × (levels − 1) m above building ground; attenuation depends on the source–wall–receiver path difference; zero when the receiver sees over the wall. Excess uses slant source–receiver distance. Cut edges use the same diffraction formula; take the better of earth edge and wall, not their sum. Only tunnels fully shield.`,
  noiseBuyouts: () => `Buildings bought out explicitly by the player or automatically for noise, separate from buildings demolished under the road; building-only estimate × ${BUILDING_RULES.purchaseMultiplier} + demolition, plus a PROVISIONAL plot max(${BUILDING_RULES.buyoutPlotMultiple} × the building's ground area, ${BUILDING_RULES.buyoutPlotMinimum} m²) at ${URBAN_LAND.buildingLandPerM2} × ${URBAN_LAND.multiplier} CZK/m². Bought out when neither the earth edge nor the tallest available wall protects the top-floor receiver in the PROVISIONAL model; not an acoustic assessment.`,
  surcharge: () => `SFDI "other objects" (utilities, drainage, safety, preparation…): +${pct(PRICES.otherObjectsSurcharge)} of construction, +${pct(URBAN_RATES.otherObjectsSurcharge)} inside built-up areas`,
  land: () => `statutory purchase (Act 416/2009 §3b): ${LAND.perM2} CZK/m² (8 × ${LAND.perM2 / 8} market price) outside, ${(URBAN_LAND.buildingLandPerM2 * URBAN_LAND.multiplier).toLocaleString('en-US')} CZK/m² (1.5 × ${URBAN_LAND.buildingLandPerM2.toLocaleString('en-US')}) inside built-up areas`,
  forest: () => `+${LAND.forestExtraPerM2} CZK/m² of forest under our road and its slopes (clearing, forest-land removal levy; PROVISIONAL estimate, not a sourced local rate)`,
  buildings: () => `building only, land billed separately: floor area × (replacement-value estimate × ${BUILDING_RULES.purchaseMultiplier} + demolition), CZK/m²: ${BUILDING_KINDS.map((k) => `${k.label} ${k.pricePerM2.toLocaleString('en-US')} + ${k.demolitionPerM2.toLocaleString('en-US')}`).join(', ')}`,
};


const FOLD_KEY = 'trapla.folds';
/** sections folded by default (the rest start open) */
const FOLDED = new Set(['stats', 'decisions', 'help']);

/** a foldable HUD section: a header button and a body; `extra` goes into the header (e.g. a count) */
function fold(id: string, title: string, body: string, extra = '') {
  return `<section class="card fold" id="sec-${id}" data-fold="${id}">
    <h2 class="fold-h"><button type="button" aria-expanded="true" title="Show / hide">${title}${extra}</button></h2>
    <div class="fold-body">${body}</div></section>`;
}

const AUTO_LONG = 'Automatic: the game sets the road\'s height along the whole route for the lowest cost and redoes it after every change of the route. To force a height somewhere, click the road line in the profile: that pins it there, and you can drag the pin up or down (or type the height). Pins stay at their km when you move the route.';
const MANUAL_LONG = 'By hand: you drag the height points (◆) in the profile yourself; double-click the road line to add one, right-click one to delete it. Moving the route keeps your points. Switching back to Automatic replaces them (Undo brings them back).';

export class Hud {
  ev: HudEvents = {};
  private last: { r: Result; d: Design } | null = null;
  private range: StationRange | null = null;
  /** violations whose explanation the player unfolded */
  private openWhy = new Set<string>();
  /** the violations the list shows: the last full result's (a drag preview keeps them) */
  private listed: Result['violations'] | null = null;
  private folds: Record<string, boolean> = {};
  private $ = <T extends HTMLElement = HTMLElement>(id: string) => this.root.querySelector<T>(`#${id}`)!;
  /** where the contextual cards go (the bend / height point cards here, the build tools' cards too) */
  readonly context: HTMLElement;
  /** body of the "Your decisions" section (filled by the build tools) */
  readonly decisions: HTMLElement;

  constructor(private root: HTMLElement, private sc: ScenarioParams) {
    const minCat = minCategoryForTraffic(sc.traffic);
    const n = Object.keys(SCENARIOS).indexOf(sc.id) + 1;
    root.innerHTML = `
      <section class="card score" id="score" aria-live="polite">
        <div class="total-row">
          <div><div class="kicker" id="cost-scope">Total cost</div><div id="total" class="total">—</div></div>
          <div id="valid" class="badge" title="Valid = all norm checks pass and both goals are met">…</div>
        </div>
        <div id="invalid-note" class="invalid-note" hidden>Not valid yet — this cost does not count until the violations are fixed.</div>
        <div class="chips">
          <span id="chip-time" class="chip" title="Travel time = route length ÷ design speed; the goal is ≤ ${sc.maxTravelMin.toFixed(1)} min"></span>
          <button type="button" id="chip-viol" class="chip" title="Show the violations"></button>
          <span id="best" class="chip best"></span>
        </div>
        <div id="perkm" class="sub"></div>
      </section>
      <div id="context" class="context"></div>
      ${fold('goal', `<span class="kicker">Scenario ${n}</span> ${esc(sc.title)}`, `
        <p>Build the <b>cheapest</b> norm-abiding road from ${sc.labels.brief}.</p>
        <div class="goals">
          <div><span>Traffic Y</span><b>${num(sc.traffic)} veh/day</b><small>needs ≥ ${CATEGORIES[minCat].label.split(' (')[0]} <i title="Class I road at LOS C (TP 188 / TP 189, hilly, 15 % heavy; research/14): ${TRAFFIC_THRESHOLDS.filter((t) => isFinite(t.maxAadt)).map((t) => `${t.category} ≤ ${num(t.maxAadt)}`).join(', ')}">(TP 188)</i></small></div>
          <div><span>Travel time X</span><b>≤ ${sc.maxTravelMin.toFixed(1)} min</b><small>length ÷ design speed</small></div>
        </div>`)}
      ${fold('design', 'Design', `
        <label>Category <select id="cat" title="Road category (cross-section): wider roads cost more but carry more traffic">${PLAYABLE_CATEGORIES.map((c) => `<option value="${c}">${CATEGORIES[c].label}</option>`).join('')}</select></label>
        <label>Design speed <select id="speed" title="Faster: shorter travel time, but larger curves and gentler rounding are required">${[90, 80, 70].map((s) => `<option value="${s}">${s} km/h</option>`).join('')}</select></label>
        <div class="norms" id="norms"></div>
        <div class="mode">
          <div class="mode-h"><b>Road height</b><small>the black line in the profile</small><span class="q" id="mode-help" tabindex="0">?</span></div>
          <div class="seg" role="radiogroup" aria-label="Road height">
            <button type="button" id="grade-auto" role="radio" title="The game picks the cheapest legal heights and redoes them after every change of the route">Automatic</button><button type="button" id="grade-manual" role="radio" title="Start from the current automatic heights and drag the height points yourself">By hand</button>
          </div>
          <p id="mode-explain" class="mode-explain"></p>
        </div>
        <div class="btns"><button type="button" id="reset" title="Throw the design away and start again from the straight line (Undo brings it back)">Start over</button></div>`, '<small class="fold-note" id="design-note"></small>')}
      ${fold('viol', 'Violations', '<ol id="viol"></ol>', '<span class="count" id="viol-count"></span>')}
      ${fold('cost', '<span id="cost-h">Cost breakdown</span>', '<table id="breakdown"></table>')}
      ${fold('stats', 'Quantities', `<table id="stats"></table><div class="sub">Noise: provisional screening, not an acoustic assessment. On the map: teal = noise walls; red squares = buildings under the road, demolished; magenta diamonds = noise / player buyouts; KEEP labels = buildings you keep.</div>`)}
      ${fold('decisions', 'Your decisions', '<div id="decisions"></div>', '<span class="count neutral" id="decisions-count"></span>')}
      ${fold('help', 'How to play', `
        <ul>
          <li><b>Move the route:</b> click the map to add a bend, drag a numbered bend to move it, right-click it (or <kbd>Del</kbd>) to delete it.</li>
          <li><b>Wider or tighter curve:</b> click a bend, then drag its ◇ grips or press + / −.</li>
          <li><b>Look around the map:</b> drag to pan, right-drag to rotate, wheel or pinch to zoom.</li>
          <li><b>Look along the profile:</b> click it to zoom in there (the map follows), wheel to zoom, right-drag to scroll.</li>
          <li><b>Bridge or tunnel somewhere:</b> drag across the profile to select a stretch, then pick <b>Bridge</b>, <b>Tunnel</b>, <b>Earthwork</b> or <b>Automatic</b> (keys <kbd>B</kbd> <kbd>T</kbd> <kbd>E</kbd> <kbd>C</kbd>).</li>
          <li><b>Raise or lower the road:</b> in Automatic, click the road line in the profile to pin its height there, then drag the pin. By hand, drag the height points (◆); double-click the line to add one.</li>
          <li><b>Why so expensive?</b> Hover the profile for the costs at that spot; a selected stretch shows its own bill.</li>
          <li><b>Crossed roads, buildings:</b> click one on the map (or the ▪ mark of a crossed road in the profile) and choose what happens to it right here at the top (<kbd>Shift</kbd>+click adds a bend there instead).</li>
          <li><b>Noise walls:</b> select a stretch, then choose a wall. <kbd>N</kbd> = noise view: the road's noise relative to the limit, dwellings coloured by outcome; hover a building or wall for details.</li>
          <li><b>Map views:</b> <kbd>C</kbd> contours, <kbd>S</kbd> slope tint, <kbd>E</kbd> relief exaggeration, <kbd>O</kbd> aerial photo, <kbd>N</kbd> noise.</li>
          <li><b>Made a mistake?</b> Undo / Redo at the top left of the map, <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Shift+Z</kbd>.</li>
        </ul>
        <div class="btns"><button type="button" id="show-intro" title="Show the three-step introduction over the map again">Show the intro again</button></div>
        <label class="exag">Vertical exaggeration <select id="exag"><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="3">3×</option></select></label>`)}`;
    this.context = this.$('context');
    this.decisions = this.$('decisions');
    this.context.innerHTML = '<section class="card ctx" id="pi-card" style="display:none"></section><section class="card ctx" id="vpi-card" style="display:none"></section>';
    // fold state: remembered per section
    try { this.folds = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}'); } catch { this.folds = {}; }
    for (const sec of root.querySelectorAll<HTMLElement>('[data-fold]')) {
      const id = sec.dataset.fold!;
      this.setFold(id, this.folds[id] ?? !FOLDED.has(id), false);
      sec.querySelector<HTMLButtonElement>('.fold-h button')!.onclick = () => this.setFold(id, !sec.classList.contains('open'));
    }
    this.$<HTMLSelectElement>('cat').onchange = (e) => this.ev.onCategory?.((e.target as HTMLSelectElement).value);
    this.$<HTMLSelectElement>('speed').onchange = (e) => this.ev.onSpeed?.(Number((e.target as HTMLSelectElement).value));
    this.$<HTMLSelectElement>('exag').onchange = (e) => this.ev.onExaggeration?.(Number((e.target as HTMLSelectElement).value));
    this.$('grade-auto').onclick = () => this.ev.onProfileMode?.('auto');
    this.$('grade-manual').onclick = () => this.ev.onProfileMode?.('manual');
    this.$('reset').onclick = () => this.ev.onReset?.();
    this.$('show-intro').onclick = () => this.ev.onIntro?.();
    this.$('chip-viol').onclick = () => this.reveal('viol');
    this.$('viol').onclick = (e) => {
      const why = (e.target as HTMLElement).closest('.why') as HTMLElement | null;
      const li = (e.target as HTMLElement).closest('li') as HTMLElement | null;
      if (why && li) {
        // "why?" unfolds the explanation (kept open across recomputes) instead of jumping to the place
        const x = this.listed?.[Number(why.dataset.why)];
        const box = li.querySelector<HTMLElement>('.vdetail')!;
        box.hidden = !box.hidden;
        why.textContent = box.hidden ? 'why?' : 'less';
        if (x) { if (box.hidden) this.openWhy.delete(whyKey(x)); else this.openWhy.add(whyKey(x)); }
        return;
      }
      if (li?.dataset.k) this.ev.onViolation?.(Number(li.dataset.k));
    };
  }

  /** open or close a section (remembered unless `save` is false) */
  setFold(id: string, open: boolean, save = true) {
    const sec = this.root.querySelector<HTMLElement>(`[data-fold="${id}"]`);
    if (!sec) return;
    sec.classList.toggle('open', open);
    sec.querySelector('.fold-h button')?.setAttribute('aria-expanded', String(open));
    if (!save) return;
    this.folds[id] = open;
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(this.folds)); } catch { /* private mode */ }
  }

  /** open a section, scroll it into view below the sticky score and flash it */
  reveal(id: string) {
    this.setFold(id, true);
    const sec = this.root.querySelector<HTMLElement>(`[data-fold="${id}"]`);
    if (!sec) return;
    this.scrollTo(sec);
  }

  /** scroll the HUD so `el` shows just below the sticky score card, and flash it */
  scrollTo(el: HTMLElement) {
    const score = this.$('score');
    const top = el.getBoundingClientRect().top - this.root.getBoundingClientRect().top + this.root.scrollTop - score.offsetHeight - 16;
    this.root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  /** bring the card of what was just picked fully into view (below the sticky score) unless it already is */
  revealContext(cardId: string) {
    requestAnimationFrame(() => {
      const card = this.root.querySelector<HTMLElement>(`#${cardId}`);
      if (!card || card.style.display === 'none') return;
      const c = card.getBoundingClientRect(), top = this.$('score').getBoundingClientRect().bottom + 8;
      const bottom = this.root.getBoundingClientRect().bottom - 8;
      // too high: align its top under the score; too low: lift its bottom into view (its top first if it is taller)
      const delta = c.top < top ? c.top - top : c.bottom > bottom ? Math.min(c.bottom - bottom, c.top - top) : 0;
      if (Math.abs(delta) > 1) this.root.scrollBy({ top: delta, behavior: 'smooth' });
    });
  }

  setDesign(d: Design) {
    this.$<HTMLSelectElement>('cat').value = d.category;
    this.$<HTMLSelectElement>('speed').value = String(d.speed);
    const n = speedNorms(d.speed);
    const norms = this.$('norms');
    norms.innerHTML = `At ${d.speed} km/h: curves ≥ <b>${n.minRadius} m</b> radius · slopes ≤ <b>${(this.sc.maxGradient * 100).toFixed(0)} %</b> · hilltops rounded ≥ ${num(n.minCrestRadius)} m, dips ≥ ${num(n.minSagRadius)} m <span class="prov" title="The rounding radii come from an older edition of ČSN 73 6101, not confirmed for 2018">(provisional)</span>`;
    norms.title = `ČSN 73 6101 at ${d.speed} km/h: smallest curve radius ${n.minRadius} m (with 6 % banking); from ${n.noSuperelevationRadius} m no banking is needed; easement (transition) curves ≥ ${n.minTransition} m; steepest slope ${(this.sc.maxGradient * 100).toFixed(0)} %; vertical rounding radius ≥ ${num(n.minCrestRadius)} m on hilltops (crests), ≥ ${num(n.minSagRadius)} m in dips (sags).`;
    for (const mode of ['auto', 'manual'] as const) {
      const b = this.$(`grade-${mode}`);
      b.classList.toggle('on', d.profileMode === mode);
      b.setAttribute('aria-checked', String(d.profileMode === mode));
    }
    const auto = d.profileMode === 'auto';
    this.$('mode-explain').innerHTML = auto
      ? '<b>Automatic</b> — the lowest-cost legal heights; click the road line in the profile to pin one.'
      : '<b>By hand</b> — drag the ◆ height points in the profile; double-click the line to add one.';
    this.$('mode-help').title = auto ? AUTO_LONG : MANUAL_LONG;
    this.$('design-note').textContent = ` ${CATEGORIES[d.category].label.split(' (')[0]} · ${d.speed} km/h · ${auto ? 'automatic height' : 'height by hand'}`;
  }

  setProfileBusy(busy: boolean) {
    const manual = this.$<HTMLButtonElement>('grade-manual');
    manual.disabled = busy;
    manual.title = busy ? 'One moment: the automatic heights are still being computed' : 'Start from the current automatic heights and drag the height points yourself';
    this.$('score').classList.toggle('busy', busy);
  }

  /** switch the breakdown and quantities to a station range (null = whole route) */
  setRange(range: StationRange | null) {
    this.range = range;
    if (this.last) this.renderCost(this.last.r, this.last.d);
  }

  private renderCost(r: Result, d: Design) {
    const whole = r.cost;
    const total = this.$('total');
    // A drag preview is approximate and never a verdict: "≈" total, a neutral badge, no ✓ / ✗.
    const preview = !!r.preview;
    total.textContent = (preview ? '≈ ' : '') + czk(whole.total);
    total.classList.toggle('invalid', !preview && !r.valid);
    this.$('score').classList.toggle('preview', preview);
    this.$('invalid-note').hidden = preview || r.valid;
    const valid = this.$('valid');
    valid.textContent = preview ? '≈ PREVIEW' : r.valid ? '✓ VALID' : '✗ NOT VALID';
    valid.className = 'badge ' + (preview ? 'preview' : r.valid ? 'ok' : 'bad');
    valid.title = preview ? 'Approximate while you drag: crossings, roads and streams next to our earthworks, noise and bridge support heights are worked out (and validity checked) when you pause or let go'
      : 'Valid = all norm checks pass and both goals are met';
    this.$('perkm').textContent = `${czk(whole.total / (r.length / 1000))} per km · ${km(r.length)} · ${CATEGORIES[d.category].label.split(' (')[0]} · ${d.speed} km/h`;
    const tOk = r.travelMin <= this.sc.maxTravelMin;
    const time = this.$('chip-time');
    time.className = `chip ${tOk ? 'ok' : 'bad'}`;
    time.innerHTML = `${tOk ? '✓' : '✗'} ${num(r.travelMin, 1)} <small>/ ${this.sc.maxTravelMin.toFixed(1)} min</small>`;
    const sel = this.range && this.range.s0 < r.length ? rangeSummary(r, this.range.s0, Math.min(this.range.s1, r.length)) : null;
    this.$('cost-h').innerHTML = sel ? `Cost breakdown <small class="sel-tag">selected km ${num(sel.s0 / 1000, 2)}–${num(sel.s1 / 1000, 2)}</small>` : 'Cost breakdown <small>whole route</small>';
    const c = sel ? sel.cost : whole;
    this.$('breakdown').innerHTML = COST_GROUPS.map((g) => {
      const v = g.of(c);
      const label = g.id === 'surcharge' ? `Other objects <small>+${(PRICES.otherObjectsSurcharge * 100).toFixed(0)} / ${(URBAN_RATES.otherObjectsSurcharge * 100).toFixed(0)} %</small>` : g.label;
      return `<tr title="${ROW_HELP[g.id](c, this.sc).replace(/"/g, '&quot;')}" class="${v > 0 ? '' : 'zero'}"><td><i class="sw" style="background:${g.color}"></i>${label}</td><td>${czk(v)}</td><td class="bar"><span style="width:${Math.min(100, (100 * v) / Math.max(1, c.total)).toFixed(1)}%;background:${g.color}"></span></td></tr>`;
    }).join('') + (sel ? `<tr class="sum"><td>Selected stretch</td><td>${czk(sel.cost.total)}</td><td></td></tr>` : '');
    const q = r.quantities;
    const x = { bridge: 0, tunnel: 0, overbridge: 0, atGrade: 0, junction: 0, reconnection: 0, diversion: 0, underpass: 0 };
    let reconnectM = 0, divertM = 0, underpassM = 0;
    for (const cr of r.crossings) if (!sel || (cr.i >= sel.i0 && cr.i <= sel.i1)) {
      x[cr.type]++;
      if (cr.type === 'reconnection') reconnectM += cr.linkLength ?? 0;
      if (cr.type === 'diversion') divertM += cr.linkLength ?? 0;
      if (cr.type === 'underpass') underpassM += cr.underpassLength ?? 0;
    }
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const xing = `${Object.values(x).reduce((a, b) => a + b, 0)} <small>(${[x.junction ? plural(x.junction, 'junction', 'junctions') : '',
      x.reconnection ? `${plural(x.reconnection, 'road', 'roads')} reconnected (+${num(reconnectM, 0)} m of new road)` : '',
      x.diversion ? `${plural(x.diversion, 'track', 'tracks')} rerouted (+${num(divertM, 0)} m of new track)` : '',
      x.underpass ? `${plural(x.underpass, 'underpass', 'underpasses')} ${num(underpassM, 0)} m` : '', x.atGrade ? `${x.atGrade} crossing at the same level (not allowed)` : '',
      x.overbridge ? `${plural(x.overbridge, 'bridge', 'bridges')} over our road` : '', x.bridge ? `${x.bridge} under our bridges` : '', x.tunnel ? `${x.tunnel} above our tunnels` : ''].filter(Boolean).join(', ') || 'none'})</small>`;
    const conflicts = footprintConflictsInRange(r.footprintConflicts ?? [], sel?.s0 ?? 0, sel?.s1 ?? r.length);
    const footprint = conflicts.length ? `<tr class="${conflicts.some(c => c.action === 'blocked') ? 'warn' : ''}"><td colspan="2"><details>
      <summary>Things next to our road: ${conflicts.length} <small>(grey: retaining wall; blue line: new stream bed; red dashes: removed road or stream bed; amber dashes: a rebuild that does not work; red ×: in the way)</small></summary>
      ${conflicts.map(c => `<div class="sub" title="${esc(footprintConflictTitle(c))}">km ${num(c.s0 / 1000, 2)}–${num(c.s1 / 1000, 2)} · ${esc(footprintConflictText(c))}</div>`).join('')}
      <div class="sub">Roads, streams, railways and water our earthworks would cover, and what is built about them. Amounts are already in the bill.</div>
      </details></td></tr>` : '';
    const cls = q.cutByClass.map((v) => num((100 * v) / Math.max(1, q.cut), 0)).join(' / ');
    const common = (cut: number, fill: number, len: number, fp: number, forest: number, urban: number, bld: number, buyouts: number, walls: number, wallArea: number) => `
      <tr><td>Cut / fill</td><td>${kvol(cut)} / ${kvol(fill)} <small>(${num(cut / len, 0)} / ${num(fill / len, 0)} m³/m)</small></td></tr>
      <tr><td title="Land the road, its slopes and its working strips take">Land taken</td><td>${num(fp / 1e4, 1)} ha <small>(forest ${num(forest / 1e4, 1)} ha)</small></td></tr>
      <tr><td>In built-up area</td><td>${km(urban)}</td></tr>
      <tr class="${bld ? 'warn' : ''}"><td title="Buildings under the road or its slopes, demolished">Demolished buildings</td><td>${bld}</td></tr>
      <tr class="${buyouts ? 'warn' : ''}" title="Away from the road, bought out for noise or by you: purchase + demolition"><td>Bought-out buildings</td><td>${buyouts}</td></tr>
      <tr><td>Roads crossed</td><td>${xing}</td></tr>
      ${footprint}
      <tr><td>Noise walls</td><td>${num(walls, 0)} m / ${num(wallArea, 0)} m²</td></tr>`;
    this.$('stats').innerHTML = sel ? `
      <tr class="head"><td colspan="2">Selected stretch</td></tr>
      <tr><td>Length</td><td>${km(sel.length)} <small>of ${km(r.length)}</small></td></tr>
      <tr><td>Bridges / tunnels</td><td>${num(sel.quantities.bridgeLength, 0)} m / ${num(sel.quantities.tunnelLength, 0)} m</td></tr>
      ${common(sel.quantities.cut, sel.quantities.fill, sel.length, sel.quantities.footprint, sel.quantities.forestArea, sel.quantities.urbanLength, sel.quantities.buildings, sel.quantities.noiseBuyouts, sel.quantities.wallLength, sel.quantities.wallArea)}` : `
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
    // Violations and the best score belong to full evaluations: during a drag preview the chip
    // says they are pending and the best chip is dimmed (the list keeps the last full verdict).
    const chip = this.$('chip-viol');
    this.$('best').classList.toggle('stale', !!r.preview);
    if (r.preview) {
      chip.className = 'chip pending';
      chip.innerHTML = '⋯ checked when you pause';
      chip.toggleAttribute('disabled', true);
      return;
    }
    const v = r.violations;
    this.listed = v;
    const count = this.$('viol-count');
    count.textContent = String(v.length);
    count.className = `count${v.length ? '' : ' ok'}`;
    chip.className = `chip ${v.length ? 'bad' : 'ok'}`;
    chip.innerHTML = v.length ? `⚠ ${v.length} violation${v.length === 1 ? '' : 's'} <small>show ›</small>` : '✓ no violations';
    chip.toggleAttribute('disabled', !v.length);
    this.$('viol').innerHTML = v.length
      ? v.slice(0, 60).map((x, k) => {
        const open = this.openWhy.has(whyKey(x));
        return `<li data-k="${k}" class="${x.goal ? 'goal' : ''}" title="Click to show the place on the map and in the profile">
          <span class="where">${x.goal ? 'goal' : `km ${num(x.s0 / 1000, 2)}`}</span>
          <div><div class="vt">${esc(x.title)}</div>
          <div class="vfix">→ ${esc(x.fix)}</div>
          <div class="vmeta"><span class="basis ${x.basis}" title="${esc(x.rule)}">${BASIS_LABEL[x.basis]}</span><button type="button" class="why" data-why="${k}">${open ? 'less' : 'why?'}</button></div>
          <div class="vdetail"${open ? '' : ' hidden'}>${x.detail ? esc(x.detail) : ''}<small>${esc(x.rule)}</small></div></div>
        </li>`;
      }).join('')
      : '<li class="none">All norm checks pass.</li>';
    const b = this.$('best');
    const isBest = !!best && r.valid && Math.abs(best.cost - r.cost.total) < 1;
    b.innerHTML = best
      ? `${isBest ? '★ best' : `best ${czk(best.cost)}`}${isBest ? '' : ' <button type="button" id="load-best" title="Load your cheapest valid design (Undo brings this one back)">Load</button>'}`
      : '<small>no valid design yet</small>';
    b.title = best ? `${isBest ? 'This is' : 'Your best:'} your cheapest valid design so far: ${czk(best.cost)}` : 'Your cheapest valid design is kept here once you have one';
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
    card.innerHTML = `<div class="ctx-h"><b>Bend ${i + 1}</b><small>${cv ? `turns ${num((cv.delta * 180) / Math.PI, 1)}°` : ''}</small><button type="button" class="x" title="Deselect the bend (Esc)">✕</button></div>
      <div class="pi-row">
        <label title="Curve radius: larger is smoother (and needs more room)">Radius <input id="pi-r" type="number" min="50" step="5" value="${Math.round(rv)}" ${auto ? 'disabled' : ''}> m</label>
        <label title="Use the smallest radius the rules allow (${n.minRadius} m at ${d.speed} km/h)"><input id="pi-auto" type="checkbox" ${auto ? 'checked' : ''}> smallest allowed</label>
      </div>
      <input id="pi-slider" type="range" min="${Math.round(n.minRadius * 0.5)}" max="5000" step="5" value="${Math.round(rv)}" title="Drag to change the radius (or drag the ◇ grips on the map)">
      <div class="btns"><button type="button" id="pi-height" title="${d.profileMode === 'auto' ? 'Keep the road at its current height here; then drag the pin in the profile' : 'A height point at the bend; then drag it in the profile'}">${d.profileMode === 'auto' ? 'Pin road height here' : 'Add a height point here'}</button><button type="button" id="pi-del" class="danger" title="Delete this bend (Del, or right-click it on the map)">Delete bend</button></div>
      <div class="sub">curve ${cv ? num(cv.delta * cv.rEff, 0) : '—'} m long, starts ${cv ? num(cv.t, 0) : '—'} m before the bend${cv && cv.rEff < cv.r - 1 ? ' · <span class="badtxt">runs into the next curve</span>' : ''}</div>`;
    const inp = card.querySelector<HTMLInputElement>('#pi-r')!;
    const sl = card.querySelector<HTMLInputElement>('#pi-slider')!;
    inp.onchange = () => this.ev.onRadius?.(i, Math.max(10, Number(inp.value)));
    sl.oninput = () => { inp.value = sl.value; this.ev.onRadius?.(i, Number(sl.value)); };
    card.querySelector<HTMLInputElement>('#pi-auto')!.onchange = (e) => this.ev.onRadius?.(i, (e.target as HTMLInputElement).checked ? null : Math.round(rv));
    card.querySelector<HTMLButtonElement>('#pi-del')!.onclick = () => this.ev.onDeletePi?.(i);
    card.querySelector<HTMLButtonElement>('#pi-height')!.onclick = () => this.ev.onBendHeight?.(i);
    card.querySelector<HTMLButtonElement>('.x')!.onclick = () => this.ev.onClosePi?.();
  }

  setSelectedVpi(i: number | null, r: Result | null) {
    const card = this.$('vpi-card');
    if (i === null || !r || i <= 0 || i >= r.vpis.length - 1) { card.style.display = 'none'; return; }
    card.style.display = '';
    const vc = r.vcurves[i - 1];
    const v = r.vpis[i];
    const what = vc?.type === 'crest' ? 'Hilltop' : vc?.type === 'sag' ? 'Dip' : 'Bend';
    card.innerHTML = `<div class="ctx-h"><b>Height point ${i}</b><small>km ${num(v.s / 1000, 2)} · ${num(v.z, 1)} m</small><button type="button" class="x" title="Close">✕</button></div>
      <div class="pi-row">
        <label title="How gently the road rounds over this point (vertical curve radius)">${what} rounding <input id="vpi-r" type="number" min="100" step="100" value="${Math.round(vc?.r ?? 0)}" ${v.r === null ? 'disabled' : ''}> m</label>
        <label title="The smallest rounding the rules allow"><input id="vpi-auto" type="checkbox" ${v.r === null ? 'checked' : ''}> smallest allowed</label>
      </div>
      <div class="btns"><button type="button" id="vpi-del" class="danger" title="Delete this height point (or right-click it in the profile)">Delete point</button></div>
      <div class="sub">the rounding is ${num(vc?.len ?? 0, 0)} m long</div>`;
    const inp = card.querySelector<HTMLInputElement>('#vpi-r')!;
    inp.onchange = () => this.ev.onVpiRadius?.(i, Number(inp.value));
    card.querySelector<HTMLInputElement>('#vpi-auto')!.onchange = (e) => this.ev.onVpiRadius?.(i, (e.target as HTMLInputElement).checked ? null : Math.round(vc?.r ?? 0));
    card.querySelector<HTMLButtonElement>('#vpi-del')!.onclick = () => this.ev.onDeleteVpi?.(i);
    card.querySelector<HTMLButtonElement>('.x')!.onclick = () => this.ev.onCloseVpi?.();
  }
}
