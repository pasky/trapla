// Right-hand HUD, top to bottom: the score (total cost, validity, travel time, violations, best design;
// sticky), the contextual cards of whatever is selected (bend, height point, stretch, crossed road,
// building), then foldable sections: scenario goals, design controls, violations, cost breakdown,
// quantities, the list of the player's decisions and how to play. Fold state is remembered.

import type { Violation } from '../core/checks';
import type { CostBreakdown } from '../core/cost';
import type { Design, Result } from '../core/evaluate';
import type { ProjectResult, RouteId } from '../core/project';
import { aloneText, billChangeText, lineBills, listProjectIssues, projectBadge, unpricedText, type LineBill, type ListedIssue } from './project-issues';
import { trainsPerDay } from '../core/project-railway';
import { CATEGORIES, PLAYABLE_CATEGORIES, type CategoryId } from '../core/data/categories';
import { designSpeeds, speedNorms } from '../core/data/norms';
import { DIRECTIONS_TEXT } from '../core/terms';
import { LAND, PRICES, STRUCTURE_RULES, TUNNEL_RULES } from '../core/data/prices';
import { minCategoryForTraffic, type ScenarioParams } from '../core/data/scenario';
import { ACCESS, BUILDING_KINDS, BUILDING_RULES, CROSSING_RULES, JUNCTION, NOISE, URBAN_LAND, URBAN_RATES } from '../core/data/urban';
import { rangeSummary } from '../core/range';
import type { Best, StationRange } from '../state';
import { COST_GROUPS, czk, groupLabel } from './costgroups';
import { RAILWAY_EVIDENCE, SPOZES } from '../core/data/railway';
import { footprintConflictsInRange, footprintConflictText, footprintConflictTitle } from './footprint';
import { shownRange, shownS, shownText } from './chainage';

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
  /** motorway: edit both directions together, or one of them on its own */
  onDirection?: (which: 'both' | 'forward' | 'reverse') => void;
  /** motorway: both directions on one line again over a stretch where they run apart */
  onJoinStretch?: (id: string) => void;
  onLoadBest?: () => void;
  onViolation?: (k: number) => void;
  /** show the first-run introduction again */
  onIntro?: () => void;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const whyKey = (v: Pick<Violation, 'kind' | 'title'>) => `${v.kind}|${v.title}`;

const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

/** what each line of a railway's breakdown contains where it differs from a road's (data/railway.ts,
 * data/categories.ts R1 / R2, rail-noise.ts) */
const RAIL_ROW_HELP: Record<string, (c: CostBreakdown, sc: ScenarioParams) => string> = {
  roadBase: () => `SPOŽES 2026 price book per km of new electrified line: track, catenary, signalling, ETCS, cables, GSM-R and moving utilities everywhere; sleeper bed and ditches on the ground. Not included: stations, turnouts, substations`,
  bridges: () => `SPOŽES 2026 railway bridge per m² of deck, the deck as wide as the track bed (an assumption); includes the short bridges forced over rivers, railways and roads clearly below the track`,
  tunnels: () => `SPOŽES 2026 single- or double-track tunnel per km (dearer rows under built-up areas)`,
  crossings: () => `Roads we cross and roads our earthworks cover. No level crossings (a game rule): each road gets the cheapest of a bridge over the track with earth ramps, an underpass, or a reroute along our earthworks to a nearby crossing, priced by its measured length × the SPK 2026 road price. Roads our earthworks cover are rebuilt beside them, closed when other roads already connect their ends, or held back by retaining walls. Roads at least ${CROSSING_RULES.overHeight} m below the track pass under our bridges (under Bridges).`,
  noiseWalls: (_c, sc) => `Walls of ${NOISE.wallHeights.join(' / ')} m (yours 2–6 m) at ${NOISE.wallPerM2.toLocaleString('en-US')} CZK/m² (an estimate). A game estimate, not an acoustic study: EU train noise (CNOSSOS-EU), ${num(trainsPerDay(sc.railTraffic))} trains a day (an assumption, not a timetable), limits for a new line ${RAILWAY_EVIDENCE.newLineNoise.dayDb} dB by day and ${RAILWAY_EVIDENCE.newLineNoise.nightDb} dB at night at the façade, checked at each house's top floor. A wall or a cut edge helps a floor only where it hides the track from it; only tunnels hide it completely.`,
  surcharge: () => `SPOŽES 2026 markups for a new line at study stage: +${Math.round(100 * SPOZES.markup.substructure)} % on earthworks and the sleeper bed, +${Math.round(100 * SPOZES.markup.bridges)} % on bridges and tunnels, none on track and systems`,
};
/** what a motorway's crossing line contains (no junctions on the way: its ends are interchanges) */
const motorwayCrossings = () => `Roads we cross and roads our earthworks cover. No junctions on the way (the motorway's ends are its interchanges): each road gets the cheapest of a bridge over us with earth ramps, an underpass, or a reroute along our earthworks to a nearby crossing, priced by its measured length × the SPK 2026 road price. Roads our earthworks cover are rebuilt beside them, closed when other roads already connect their ends, or held back by retaining walls. These works get the other-objects surcharge. Roads at least ${CROSSING_RULES.overHeight} m below our road pass under our bridges (under Bridges).`;
/** a breakdown line's tooltip for the line being built (road / motorway / railway) */
export const rowHelp = (id: string, c: CostBreakdown, sc: ScenarioParams, line = 'road') =>
  (line === 'railway' ? RAIL_ROW_HELP[id] : line === 'motorway' && id === 'crossings' ? motorwayCrossings : undefined)?.(c, sc) ?? ROW_HELP[id](c, sc);

/** what each line of the breakdown contains (shown as a tooltip) */
export const ROW_HELP: Record<string, (c: CostBreakdown, sc: ScenarioParams) => string> = {
  roadBase: () => `SFDI per-km norm minus the value of the earthworks already counted in it, at-grade length only; inside built-up areas the "intravilán" norm row`,
  earthworks: (c) => {
    const e = c.earthDetail;
    return `excavation ${czk(e.excavation)} (ČGS mapped ground + estimated weathering profiles; unmapped ground uses norm mix), fill ${czk(e.fillPlacing)}, haul ${czk(e.haul)}, surplus to tip ${czk(e.surplusHaul)}, unsuitable 15 % to tip ${czk(e.unsuitable)}, bought fill ${czk(e.borrow)}, topsoil ${czk(e.topsoil)}, high-earthwork ground works ${czk(e.geotechnical)} (estimated reserve)`;
  },
  bridges: () => 'SFDI bridge norm per km of bridge; includes the short bridges forced over rivers, railways and roads clearly below the grade',
  tunnels: () => `SFDI tunnel norm per km of tube (urban rows under built-up areas): mined where the ground is at least ${STRUCTURE_RULES.tunnelMinDepth} m above the road, cut and cover (+7.5 %; dug from a pit, then covered again) elsewhere and at least ${TUNNEL_RULES.portalCutCoverMin} m at each end, out to where the ground is ${STRUCTURE_RULES.portalDepth} m above the road. One tube over ${TUNNEL_RULES.escapeFromLength} m gets an escape tunnel beside it (×${TUNNEL_RULES.escapeGalleryFactor}; two tubes above ${TUNNEL_RULES.twinTubesFromLaneTraffic.toLocaleString('en-US')} vehicles a day per lane)`,
  culverts: () => 'Every stream we cross: the 100-year flood estimated from the land draining into it sizes a pipe or a box with a natural bed; its length under our earthworks × a size-specific rate, plus two end walls (OTSKP 2026 items and estimated assemblies). Big flows, wide streams or very long culverts need bridges instead. Drainage areas and floods are rough estimates from the terrain, not surveyed. Ordinary road drainage is already in the road price. Also includes the longer culverts needed where our slopes cover a stream.',
  crossings: () => `Roads we cross and roads our earthworks cover. Class I–III roads get a junction at least ${CROSSING_RULES.junctionSpacing} m from the next (counting both route ends; also in town as a scenario assumption), ${czk(JUNCTION)} each (low-confidence estimate from roundabout contracts). Other roads get the cheapest of: a bridge over our road with earth ramps; a reroute along the outside of our earthworks to a nearby crossing (preferably within ${CROSSING_RULES.linkMaxReach} m; up to ${CROSSING_RULES.linkHardReach} m when that costs at most half of a bridge over us), priced by its measured length × the SPK 2026 road price (paved P4 for tracks), plus ${czk(ACCESS)} for a service road's new access (estimate); or, for tracks, service and local roads under a high enough embankment, a concrete box underpass priced by its measured length (OTSKP 2026 items 389385 + 711442 + 451315 + the road surface) plus two entrance heads. Roads our earthworks cover are rebuilt beside them at the same prices, closed when other roads already connect their ends, or held back by retaining walls. These works get the other-objects surcharge. Roads at least ${CROSSING_RULES.overHeight} m below our road pass under our bridges (under Bridges). Motorways and expressways need our bridge at least ${STRUCTURE_RULES.railClearance} m above, or their bridge over a cutting at least ${CROSSING_RULES.underDepth} m deep.`,
  noiseWalls: (_c, sc) => `Walls of ${NOISE.wallHeights.join(' / ')} m (yours ${NOISE.playerWallHeights.join(' / ')} m) at ${NOISE.wallPerM2.toLocaleString('en-US')} CZK/m² (an estimate). A game estimate, not an acoustic study: Czech Manuál 2018/2020 vehicle noise, day / night traffic from TP 219 with ${Math.round(100 * (sc.heavyShare ?? NOISE.heavyShare))} % heavy vehicles, limits ${NOISE.limitDayDb} dB by day and ${NOISE.limitNightDb} dB at night at the façade, checked at every floor of each house, adding up every 10 m of road it can see. A wall, a cut edge or the road's own edge helps a floor only where it hides that piece of road from it. In a cut the wall stands on the top edge. Only tunnels hide the road completely.`,
  noiseBuyouts: () => `Houses bought out by you, or by the game when no wall or cut edge gets every floor under the limit: the building × ${BUILDING_RULES.purchaseMultiplier} + demolition, plus its plot (estimate: ${BUILDING_RULES.buyoutPlotMultiple} × the building's ground area, at least ${BUILDING_RULES.buyoutPlotMinimum} m², at ${URBAN_LAND.buildingLandPerM2} × ${URBAN_LAND.multiplier} CZK/m²). Houses under the road are under Demolished buildings.`,
  surcharge: () => `SFDI "other objects" (utilities, drainage, safety, preparation…): +${pct(PRICES.otherObjectsSurcharge)} of construction, +${pct(URBAN_RATES.otherObjectsSurcharge)} inside built-up areas; motorways +${pct(PRICES.technologySurcharge)} more for their technology`,
  land: () => `statutory purchase (Act 416/2009 §3b): ${LAND.perM2} CZK/m² (8 × ${LAND.perM2 / 8} market price) outside, ${(URBAN_LAND.buildingLandPerM2 * URBAN_LAND.multiplier).toLocaleString('en-US')} CZK/m² (1.5 × ${URBAN_LAND.buildingLandPerM2.toLocaleString('en-US')}) inside built-up areas`,
  forest: () => `+${LAND.forestExtraPerM2} CZK/m² of forest under our road and its slopes (clearing, forest-land removal levy; an estimate, not a sourced local rate)`,
  buildings: () => `building only, land billed separately: floor area × (replacement-value estimate × ${BUILDING_RULES.purchaseMultiplier} + demolition), CZK/m²: ${BUILDING_KINDS.map((k) => `${k.label} ${k.pricePerM2.toLocaleString('en-US')} + ${k.demolitionPerM2.toLocaleString('en-US')}`).join(', ')}`,
};


const FOLD_KEY = 'trapla.folds.v2';
/** sections folded by default (the rest start open) */
const FOLDED = new Set(['cost', 'design', 'stats', 'decisions', 'help']);

/** a foldable HUD section: a header button and a body; `extra` goes into the header (e.g. a count) */
function fold(id: string, title: string, body: string, extra = '') {
  return `<section class="card fold" id="sec-${id}" data-fold="${id}">
    <h2 class="fold-h"><button type="button" aria-expanded="true" title="Show / hide">${title}${extra}</button></h2>
    <div class="fold-body">${body}</div></section>`;
}

/** What a live ≈ price leaves out until the drag pauses (core/preview-window.ts, evaluate.ts preview). */
const ESTIMATE = {
  short: '≈ Quick estimate: noise, walls and knock-on changes are counted when you pause.',
  long: 'While you drag, the price is a quick estimate: noise walls, retaining walls and rebuilt side roads are left out where the road moved, and what the change does further along the road (heights, bridges, tunnels) comes with the full count when you pause. On a long road that can be a few per cent.',
};
const AUTO_LONG = 'Auto: the cheapest legal heights, redone after every change. Drag the black line in the profile up or down to pin a height there; pins stay at their km.';
const MANUAL_LONG = 'By hand: drag the ◆ height pins in the profile; double-click the line adds one, right-click deletes. Back to Auto replaces them (Undo brings them back).';

export class Hud {
  ev: HudEvents = {};
  private last: { r: Result; d: Design } | null = null;
  private projectIssuesFor: ProjectResult | null | undefined;
  private issuesActive: RouteId | undefined;
  private project: { result: ProjectResult | null; pending: boolean; best: Pick<Best, 'cost'> | null; missionRouteId?: RouteId; ours: ReadonlySet<RouteId>; groups?: Record<RouteId, string>;
    ownPrice: { total: number; approx: boolean; label: string; routeId?: RouteId } | null; names: Record<RouteId, string>; lengths: Record<RouteId, number>; activeRouteId?: RouteId;
    liveTotal: number | null; dragging: boolean } | null = null;
  setRouteState(editable: boolean, hasResult: boolean) {
    this.$('sec-design').hidden = !editable;
    for (const id of ['sec-cost', 'sec-stats', 'sec-decisions']) this.$(id).hidden = !hasResult;
    if (!hasResult) { this.last = null; this.renderProjectScore(); }
  }
  /** `legacy`: the project is exactly one legacy road (the facade): the unchanged single-road score shows,
   * including its live ≈ preview total. Otherwise the project score owns the total and verdict. */
  setProject(result: ProjectResult | null, pending: boolean, best: Pick<Best, 'cost'> | null, opts: { missionRouteId?: RouteId; ours?: ReadonlySet<RouteId>; groups?: Record<RouteId, string>; legacy?: boolean;
    /** one road's own bill against the unchanged network (core `cost.alone`, a live ≈ during its drag);
     * shown only while there is no project total, never added up */
    ownPrice?: { total: number; approx: boolean; label: string; routeId?: RouteId } | null;
    /** the project total while a road is dragged (≈: the last full total with that road's live price) */
    liveTotal?: number | null;
    /** a drag is under way (its checks wait for a pause); otherwise a pending result is just being checked */
    dragging?: boolean;
    /** road names, to say which road an issue belongs to when it is not the active one */
    names?: Record<RouteId, string>; activeRouteId?: RouteId; lengths?: Record<RouteId, number> } = {}) {
    const { missionRouteId, groups, legacy = false, ownPrice = null, names = {}, activeRouteId, lengths = {}, liveTotal = null, dragging = false } = opts;
    // every road that is "our road" (a motorway's two directions); default: the mission road
    const ours = opts.ours ?? new Set(missionRouteId ? [missionRouteId] : []);
    if (legacy) {
      const was = this.project; this.project = null; this.projectIssuesFor = undefined;
      this.$('best').style.display = '';
      if (was) this.$('cost-scope').textContent = 'Total cost';
      // re-render the legacy score when leaving project mode or when a new best arrived
      if (this.last && (was || (best?.cost ?? null) !== (this.legacyBest?.cost ?? null))) this.setResult(this.last.r, this.last.d, best);
      return;
    }
    this.project = { result, pending, best, missionRouteId, ours, groups, ownPrice, names, lengths, activeRouteId, liveTotal, dragging }; this.renderProjectScore();
  }
  /** the listed project issue k */
  listedIssue(k: number) { return this.project?.result?.issues[k] ?? null; }
  private renderProjectScore() {
    if (!this.project) return;
    const { result, pending, best, missionRouteId, ours, groups, ownPrice, names, lengths, activeRouteId, liveTotal, dragging } = this.project, total = result?.cost.total;
    const priced = total !== null && total !== undefined, unpriced = result?.cost.unpriced.length ?? 0;
    const shownTotal = pending && liveTotal !== null ? liveTotal : total;
    // An unpriced network keeps one road's own price visible, plainly labelled, never as a total.
    this.$('cost-scope').textContent = priced ? 'Total cost' : ownPrice ? ownPrice.label : 'Total cost';
    this.$('total').textContent = priced ? `${pending ? '≈ ' : ''}${czk(shownTotal!)}`
      : ownPrice ? `${ownPrice.approx || pending ? '≈ ' : ''}${czk(ownPrice.total)}` : pending ? '…' : '—';
    this.$('total').classList.toggle('invalid', priced && !pending && !result?.valid);
    this.$('score').classList.toggle('preview', pending);
    // no total: say which change holds it back, and keep what IS priced in view (each road alone, never added up)
    const others = !priced && unpriced ? aloneText(result!.cost.alone, ownPrice?.routeId, ours, names, czk, `our ${this.sc.mode === 'railway' ? 'railway' : this.sc.mode === 'motorway' ? 'motorway' : 'road'}`, groups) : '';
    // a live ≈ price says what it does not count yet (QA: the whole D3 moved by 0.9 bn when the drag settled)
    const estimate = pending && (liveTotal !== null || (!priced && !!ownPrice?.approx));
    this.$('perkm').textContent = estimate ? ESTIMATE.short : !priced && unpriced ? `${unpricedText(result!.cost.unpriced, ours, names, groups)}${others ? `. ${others}` : ''}` : this.goalText;
    this.$('perkm').title = estimate ? ESTIMATE.long : others ? 'Each road priced as if it were the only change. Not added up: roads that affect each other can cost more or less together.' : '';
    const time = missionRouteId ? result?.routes[missionRouteId]?.legacy?.travelMin : undefined;
    this.$('chip-time').hidden = time === undefined;
    if (time !== undefined) {
      const ok = time <= this.sc.maxTravelMin;
      this.$('chip-time').innerHTML = `${ok ? '✓' : '✗'} ${num(time, 1)} <small>/ ${this.sc.maxTravelMin.toFixed(1)} min</small>`;
      this.$('chip-time').className = `chip ${ok ? 'ok' : 'bad'}`;
    }
    const chip = this.$('chip-viol');
    const { violations, notChecked } = listProjectIssues(result?.issues ?? [], activeRouteId, names, lengths);
    const badge = projectBadge(result, pending, violations.length);
    this.$('valid').textContent = badge.text; this.$('valid').className = `badge ${badge.cls}`;
    const n = violations.length;
    chip.className = `chip ${pending ? 'pending' : n ? 'bad' : result?.complete ? 'ok' : 'pending'}`;
    chip.innerHTML = pending ? (dragging ? '⋯ checked when you pause' : '⋯ checking') : n ? `⚠ ${n} violation${n === 1 ? '' : 's'} <small>show ›</small>`
      : result?.complete ? '✓ no violations' : notChecked.length ? `${notChecked.length} not checked yet <small>show ›</small>` : 'Checks not finished';
    chip.toggleAttribute('disabled', pending || !(n + notChecked.length));
    if (this.projectIssuesFor !== result || this.issuesActive !== activeRouteId) {
      this.projectIssuesFor = result; this.issuesActive = activeRouteId;
      this.$('viol-count').textContent = String(n);
      this.$('viol-count').className = `count${n ? '' : ' ok'}`;
      this.$('sec-viol').hidden = !(n + notChecked.length);
      const line = (v: ListedIssue, cls: string) => {
        const open = this.openWhy.has(whyKey(v));
        return `<li data-k="${v.k}" class="${cls}"><span class="where">${v.s0 !== undefined ? `km ${num(shownS(v.s0) / 1000, 2)}` : ''}</span>
        <div>${v.road ? `<div class="vroad">${esc(v.road)}</div>` : ''}<div class="vt">${esc(shownText(v.title))}</div><div class="vfix">${esc(shownText(v.fix))} <button type="button" class="why" data-why="${v.k}">${open ? 'less' : 'why?'}</button></div>
        <div class="vdetail"${open ? '' : ' hidden'}>${v.detail ? esc(shownText(v.detail)) : ''}<small>${esc(v.rule)}</small></div></div></li>`;
      };
      this.$('viol').innerHTML = violations.slice(0, 60).map(v => line(v, '')).join('')
        + (notChecked.length ? `<li class="not-checked-h">Not checked yet</li>${notChecked.slice(0, 20).map(v => line(v, 'not-checked')).join('')}` : '');
    }
    // The change line follows the shown total: live while dragging, cleared while a result is only checked.
    const delta = this.baseline !== null && priced && (!pending || liveTotal !== null) ? shownTotal! - this.baseline : 0;
    this.$('delta').textContent = Math.abs(delta) >= 5e5 ? `${pending ? '≈ ' : ''}${delta < 0 ? '−' : '+'}${czk(Math.abs(delta))}` : '';
    this.$('delta').className = `delta ${delta < 0 ? 'down' : 'up'}`;
    if (!pending) this.lastTotal = priced ? total : null;
    // an edit that changed more than one road's bill (a side road rebuilt under our bridge): which, and why
    const bills = !pending && priced ? lineBills(result!, ours, names, `our ${this.sc.mode === 'railway' ? 'railway' : this.sc.mode === 'motorway' ? 'motorway' : 'road'}`, groups) : null;
    const why = bills && this.baselineBills && delta ? billChangeText(this.baselineBills, bills, v => czk(v).replace(' CZK', '')) : '';
    this.$('delta-why').textContent = why; this.$('delta-why').hidden = !why;
    if (!pending) this.lastBills = bills;
    // no best while the project is not priced: a stored best is not comparable to an unpriced change
    this.$('best').style.display = priced ? '' : 'none';
    const isBest = !!best && !!result?.valid && total !== null && total !== undefined && Math.abs(best.cost - total) < 1;
    this.$('best').innerHTML = best ? `${isBest ? '★ your best' : `best ${czk(best.cost)}`}${isBest ? '' : ' <button type="button" id="load-best">Load</button>'}` : '<small>no valid design yet</small>';
    this.$('best').classList.toggle('stale', pending);
    const load = this.root.querySelector<HTMLButtonElement>('#load-best'); if (load) load.onclick = () => this.ev.onLoadBest?.();
  }
  private range: StationRange | null = null;
  /** one direction of a split motorway: the cost card shows that direction alone */
  private oneDirection = false;
  /** violations whose explanation the player unfolded */
  private openWhy = new Set<string>();
  /** the violations the list shows: the last full result's (a drag preview keeps them) */
  private listed: Result['violations'] | null = null;
  private legacyBest: Pick<Best, 'cost'> | null = null;
  private folds: Record<string, boolean> = {};
  private goalText = '';
  /** total before the edit in progress (the change chip compares against it) */
  private baseline: number | null = null;
  /** each road's bill before the edit in progress, and after the last priced result */
  private baselineBills: Map<string, LineBill> | null = null;
  private lastBills: Map<string, LineBill> | null = null;
  private editOpen = false;
  private lastTotal: number | null = null;
  private $ = <T extends HTMLElement = HTMLElement>(id: string) => this.root.querySelector<T>(`#${id}`)!;
  /** where the contextual cards go (the bend / height point cards here, the build tools' cards too) */
  readonly context: HTMLElement;
  /** body of the "Your decisions" section (filled by the build tools) */
  readonly decisions: HTMLElement;

  /** what the active line is (road / motorway / railway): the bill's words follow it */
  private line = 'road';
  setLine(line: string) { this.line = line; }
  constructor(private root: HTMLElement, private sc: ScenarioParams) {
    const minCat = minCategoryForTraffic(sc.traffic);
    root.innerHTML = `
      <section class="card score" id="score" aria-live="polite">
        <div class="total-row">
          <div><div class="kicker" id="cost-scope">Total cost</div><div id="total" class="total">—</div></div>
          <div class="score-r"><div id="valid" class="badge" title="Valid: every rule passes and the travel time is met. Only a valid design's cost counts.">…</div><div id="delta" class="delta"></div></div>
        </div>
        <div class="chips">
          <span id="chip-time" class="chip" title="Travel time: length ÷ design speed"></span>
          <button type="button" id="chip-viol" class="chip" title="Show the first one"></button>
          <span id="best" class="chip best"></span>
        </div>
        <div id="delta-why" class="sub delta-why" hidden title="What the last change did to each road's own bill"></div>
        <div id="perkm" class="sub"></div>
      </section>
      <div id="context" class="context"></div>
      ${fold('viol', 'Violations', '<ol id="viol"></ol>', '<span class="count" id="viol-count"></span>')}
      ${fold('cost', '<span id="cost-h">Cost</span>', '<table id="breakdown"></table>')}
      ${fold('design', '<span id="design-h">Road</span>', `
        <label>Type <select id="cat" title="Wider roads cost more, carry more traffic">${PLAYABLE_CATEGORIES.map((c) => `<option value="${c}">${CATEGORIES[c].label}</option>`).join('')}</select></label>
        <label>Design speed <select id="speed" title="Faster: shorter travel time, wider curves">${[90, 80, 70].map((s) => `<option value="${s}">${s} km/h</option>`).join('')}</select></label>
        <div class="norms" id="norms"></div>
        <div class="mode" id="directions" hidden>
          <div class="mode-h"><b>${DIRECTIONS_TEXT.heading}</b></div>
          <div class="seg" role="radiogroup" aria-label="Directions">
            <button type="button" id="dir-both" role="radio">${DIRECTIONS_TEXT.both}</button><button type="button" id="dir-forward" role="radio"></button><button type="button" id="dir-reverse" role="radio"></button>
          </div>
          <p id="dir-explain" class="mode-explain"></p>
          <div id="dir-apart" class="dir-apart"></div>
        </div>
        <div class="mode">
          <div class="mode-h"><b id="height-h">Road height</b><span class="q" id="mode-help" tabindex="0">?</span></div>
          <div class="seg" role="radiogroup" aria-label="Road height">
            <button type="button" id="grade-auto" role="radio" title="The game picks the cheapest legal heights">Auto</button><button type="button" id="grade-manual" role="radio" title="Drag the height pins yourself">By hand</button>
          </div>
          <p id="mode-explain" class="mode-explain"></p>
        </div>
        <div class="btns"><button type="button" id="reset" title="Back to the straight line (Undo brings it back)">Start over</button></div>`, '<small class="fold-note" id="design-note"></small>')}
      ${fold('decisions', 'Your choices', '<div id="decisions"></div>', '<span class="count neutral" id="decisions-count"></span>')}
      ${fold('stats', 'Quantities', '<table id="stats"></table>')}
      ${fold('help', 'Help', `
        <ul>
          <li><b>Bend the road:</b> click the orange road, then drag it (a drag on a road not selected moves the map; Esc or a click on open ground lets go of it). Drag a numbered bend to move it; right-click deletes it. Double-click the map adds a bend to the selected road there. A selected bend's ◇ grips or <kbd>+</kbd> / <kbd>−</kbd> change its curve.</li>
          <li><b>Inspect anything:</b> click the road, a bridge, a bend, a house or a crossed road — on the map or in the profile. The card on the right says what it costs and offers the choices.</li>
          <li><b>Any stretch:</b> drag sideways across the profile.</li>
          <li><b>Road height:</b> drag the black line in the profile up or down to pin it.</li>
          <li><b>Map:</b> drag pans, right-drag rotates, wheel or pinch zooms. <kbd>C</kbd> contours, <kbd>S</kbd> slope, <kbd>R</kbd> relief, <kbd>O</kbd> photo, <kbd>N</kbd> noise.</li>
          <li><b>Keys:</b> <kbd>Esc</kbd> deselect, <kbd>Del</kbd> delete a bend, <kbd>Ctrl+Z</kbd> undo; on a stretch <kbd>A</kbd> <kbd>B</kbd> <kbd>T</kbd> <kbd>E</kbd> = Auto / Bridge / Tunnel / Earthwork.</li>
          <li><b>The model:</b> real terrain, Czech prices and norms; noise and some crossings are rough estimates.</li>
        </ul>
        <div class="btns"><button type="button" id="show-intro">Show the intro</button></div>`)}`;
    this.goalText = sc.mode === 'motorway'
      ? `Goal: cheapest valid motorway · ≤ ${sc.maxTravelMin.toFixed(1)} min · ${num(sc.traffic)} veh/day`
      : sc.mode === 'railway' ? `Goal: cheapest valid railway · ≤ ${sc.maxTravelMin.toFixed(1)} min · ${num(trainsPerDay(sc.railTraffic))} trains a day`
      : `Goal: cheapest valid road · ≤ ${sc.maxTravelMin.toFixed(1)} min · ${num(sc.traffic)} veh/day needs ≥ ${CATEGORIES[minCat].label.split(' (')[0]}`;
    this.context = this.$('context');
    this.decisions = this.$('decisions');
    this.context.innerHTML = '<section class="card ctx inspector" id="inspector"></section>';
    // fold state: remembered per section
    try { this.folds = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}'); } catch { this.folds = {}; }
    for (const sec of root.querySelectorAll<HTMLElement>('[data-fold]')) {
      const id = sec.dataset.fold!;
      this.setFold(id, this.folds[id] ?? !FOLDED.has(id), false);
      sec.querySelector<HTMLButtonElement>('.fold-h button')!.onclick = () => this.setFold(id, !sec.classList.contains('open'));
    }
    this.$<HTMLSelectElement>('cat').onchange = (e) => this.ev.onCategory?.((e.target as HTMLSelectElement).value);
    this.$<HTMLSelectElement>('speed').onchange = (e) => this.ev.onSpeed?.(Number((e.target as HTMLSelectElement).value));
    this.$('grade-auto').onclick = () => this.ev.onProfileMode?.('auto');
    this.$('grade-manual').onclick = () => this.ev.onProfileMode?.('manual');
    this.$('reset').onclick = () => this.ev.onReset?.();
    this.$('show-intro').onclick = () => this.ev.onIntro?.();
    // the first listed item (project mode: the first real violation, else the first not-checked item)
    this.$('chip-viol').onclick = () => {
      const first = this.root.querySelector<HTMLElement>('#viol li[data-k]');
      this.ev.onViolation?.(this.project && first ? Number(first.dataset.k) : 0);
    };
    this.$('viol').onclick = (e) => {
      const why = (e.target as HTMLElement).closest('.why') as HTMLElement | null;
      const li = (e.target as HTMLElement).closest('li') as HTMLElement | null;
      if (why && li) {
        // "why?" unfolds the explanation (kept open across recomputes) instead of jumping to the place
        const k = Number(why.dataset.why), listed = this.project ? this.listedIssue(k) : null;
        const x = this.project ? listed?.violation : this.listed?.[k];
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

  /** Type and speed lists follow the route's kind: a motorway offers motorway speeds, never road widths. */
  private optionsFor = '';
  setDesign(d: Design) {
    const cat = CATEGORIES[d.category], speeds = designSpeeds(d.category), key = `${cat.mode}|${d.category}|${speeds.join(',')}`;
    const catSelect = this.$<HTMLSelectElement>('cat'), speedSelect = this.$<HTMLSelectElement>('speed');
    if (key !== this.optionsFor) {
      this.optionsFor = key;
      const types: CategoryId[] = cat.mode === 'road' ? PLAYABLE_CATEGORIES : cat.mode === 'railway' ? ['R1', 'R2'] : [d.category];
      catSelect.innerHTML = types.map((c) => `<option value="${c}">${CATEGORIES[c].label}</option>`).join('');
      catSelect.disabled = types.length < 2;
      speedSelect.innerHTML = speeds.map((s) => `<option value="${s}">${s} km/h</option>`).join('');
      this.$('design-h').textContent = cat.mode === 'motorway' ? 'Motorway' : cat.mode === 'railway' ? 'Railway' : 'Road';
      this.$('height-h').textContent = cat.mode === 'railway' ? 'Track height' : 'Road height';
    }
    catSelect.value = d.category;
    speedSelect.value = String(d.speed);
    const n = speedNorms(d.speed, d.category), grade = d.maxGradient ?? cat.maxGradient?.[this.sc.terrainClass] ?? this.sc.maxGradient;
    const pct = (g: number) => `${Math.round(g * 1000) / 10}`;
    const norms = this.$('norms');
    if (cat.mode === 'railway') {
      norms.innerHTML = `Curves ≥ <b>${num(n.minRadius)} m</b> · slopes ≤ <b>${Math.round(grade * 10000) / 10} ‰</b>`;
      norms.title = `Track at ${d.speed} km/h (provisional teaching values for ČSN 73 6360-1): smallest curve radius ${num(n.minRadius)} m with 150 mm cant and 80 mm cant deficiency; every curve needs a cant ramp of ≥ ${num(n.minTransition)} m; steepest slope ${Math.round(grade * 10000) / 10} ‰ for passenger and freight trains; radius over hilltops and dips ≥ ${num(n.minCrestRadius)} m.`;
    } else if (cat.minor) {
      norms.innerHTML = `Curves ≥ <b>${num(n.minRadius)} m</b> · slopes ≤ <b>${pct(grade)} %</b>`;
      norms.title = `${n.norm} at ${d.speed} km/h: smallest curve radius ${num(n.minRadius)} m${cat.minor === 'local' ? ` (with 6 % banking; from ${num(n.noSuperelevationRadius)} m no banking is needed)` : ''}; no easement curves are needed; steepest slope ${pct(grade)} %; radius over hilltops ≥ ${num(n.minCrestRadius)} m, in dips ≥ ${num(n.minSagRadius)} m${n.verticalNorm ? ` (${n.verticalNorm})` : ''}.`;
    } else {
      norms.innerHTML = `Curves ≥ <b>${n.minRadius} m</b> · slopes ≤ <b>${pct(grade)} %</b>`;
      norms.title = `ČSN 73 6101 at ${d.speed} km/h: smallest curve radius ${n.minRadius} m (with 6 % banking); from ${n.noSuperelevationRadius} m no banking is needed; easement (transition) curves ≥ ${n.minTransition} m; steepest slope ${pct(grade)} %; radius over hilltops ≥ ${num(n.minCrestRadius)} m, in dips ≥ ${num(n.minSagRadius)} m.`;
    }
    for (const mode of ['auto', 'manual'] as const) {
      const b = this.$(`grade-${mode}`);
      b.classList.toggle('on', d.profileMode === mode);
      b.setAttribute('aria-checked', String(d.profileMode === mode));
    }
    const auto = d.profileMode === 'auto';
    this.$('mode-explain').innerHTML = auto
      ? 'Cheapest legal heights. Drag the line in the profile to pin one.'
      : 'Drag the ◆ points in the profile; double-click the line adds one.';
    this.$('mode-help').title = auto ? AUTO_LONG : MANUAL_LONG;
    this.$('design-note').textContent = ` ${CATEGORIES[d.category].label.split(' (')[0]} · ${d.speed} km/h · ${auto ? 'Auto height' : 'height by hand'}`;
  }

  /** Motorway direction switch; null hides it (roads). `places`: where each direction leads. */
  setDirections(state: DirectionsState | null) {
    const box = this.$('directions');
    box.hidden = !state; this.oneDirection = !!state?.split;
    if (!state) return;
    fillDirections(box, state, { onDirection: w => this.ev.onDirection?.(w), onJoin: id => this.ev.onJoinStretch?.(id) });
  }

  setProfileBusy(busy: boolean) {
    const manual = this.$<HTMLButtonElement>('grade-manual');
    manual.disabled = busy;
    manual.title = busy ? 'One moment: still computing' : 'Drag the height pins yourself';
    this.$('score').classList.toggle('busy', busy);
  }

  /** switch the breakdown and quantities to a station range (null = whole route) */
  setRange(range: StationRange | null) {
    this.range = range;
    if (this.last) this.renderCost(this.last.r, this.last.d);
  }

  private renderCost(r: Result, _d: Design) {
    const whole = r.cost;
    const total = this.$('total');
    // A drag preview is approximate and never a verdict: "≈" total, a neutral badge, no ✓ / ✗.
    const preview = !!r.preview;
    total.textContent = (preview ? '≈ ' : '') + czk(whole.total);
    total.classList.toggle('invalid', !preview && !r.valid);
    this.$('score').classList.toggle('preview', preview);
    const valid = this.$('valid');
    valid.textContent = preview ? '≈ PREVIEW' : r.valid ? '✓ VALID' : '✗ NOT VALID';
    valid.className = 'badge ' + (preview ? 'preview' : r.valid ? 'ok' : 'bad');
    valid.title = preview ? 'Approximate while you drag; checked when you pause or let go'
      : 'Valid: every rule passes and the travel time is met. Only a valid design\'s cost counts.';
    this.$('perkm').textContent = preview ? ESTIMATE.short : this.goalText;
    this.$('perkm').title = preview ? ESTIMATE.long : '';
    const tOk = r.travelMin <= this.sc.maxTravelMin;
    const time = this.$('chip-time');
    time.className = `chip ${tOk ? 'ok' : 'bad'}`;
    time.innerHTML = `${tOk ? '✓' : '✗'} ${num(r.travelMin, 1)} <small>/ ${this.sc.maxTravelMin.toFixed(1)} min</small>`;
    const sel = this.range && this.range.s0 < r.length ? rangeSummary(r, this.range.s0, Math.min(this.range.s1, r.length)) : null;
    this.$('cost-h').innerHTML = sel ? `Cost <small class="sel-tag">km ${shownRange(sel.s0, sel.s1).map(v => num(v / 1000, 2)).join('–')}</small>` : `Cost <small>${this.oneDirection ? 'this direction · ' : ''}${czk(whole.total / (r.length / 1000))} per km · ${km(r.length)}</small>`;
    const c = sel ? sel.cost : whole;
    this.$('breakdown').innerHTML = COST_GROUPS.map((g) => {
      const v = g.of(c);
      const label = g.id === 'surcharge' && this.line !== 'railway' ? 'Other (drainage, safety…)' : groupLabel(g, this.line);
      return `<tr title="${rowHelp(g.id, c, this.sc, this.line).replace(/"/g, '&quot;')}" class="${v > 0 ? '' : 'zero'}"><td><i class="sw" style="background:${g.color}"></i>${label}</td><td>${czk(v)}</td><td class="bar"><span style="width:${Math.min(100, (100 * v) / Math.max(1, c.total)).toFixed(1)}%;background:${g.color}"></span></td></tr>`;
    }).join('') + (sel ? `<tr class="sum"><td>Selected</td><td>${czk(sel.cost.total)}</td><td></td></tr>` : '');
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
      <summary>Things in the road's way: ${conflicts.length}</summary>
      ${conflicts.map(c => `<div class="sub" title="${esc(footprintConflictTitle(c))}">km ${shownRange(c.s0, c.s1).map(v => num(v / 1000, 2)).join('–')} · ${esc(shownText(footprintConflictText(c)))}</div>`).join('')}
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
    this.renderProjectScore();
  }

  setResult(r: Result, d: Design, best: Pick<Best, 'cost'> | null) {
    this.last = { r, d };
    this.renderCost(r, d);
    if (this.project) return; // active-route widgets never overwrite the project score/violations
    this.legacyBest = best;
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
    this.root.querySelector<HTMLElement>('#sec-viol')!.hidden = !v.length;
    this.$('viol').innerHTML = v.slice(0, 60).map((x, k) => {
      const open = this.openWhy.has(whyKey(x));
      return `<li data-k="${k}" class="${x.goal ? 'goal' : ''}">
          <span class="where">${x.goal ? 'goal' : `km ${num(shownS(x.s0) / 1000, 2)}`}</span>
          <div><div class="vt">${esc(x.title)}</div>
          <div class="vfix">${esc(x.fix)} <button type="button" class="why" data-why="${k}">${open ? 'less' : 'why?'}</button></div>
          <div class="vdetail"${open ? '' : ' hidden'}>${x.detail ? esc(x.detail) : ''}<small>${esc(x.rule)}</small></div></div>
        </li>`;
    }).join('');
    // the change the last edit made
    const delta = this.$('delta');
    if (this.baseline !== null && Math.abs(r.cost.total - this.baseline) >= 5e5) {
      const dv = r.cost.total - this.baseline;
      delta.textContent = `${dv < 0 ? '−' : '+'}${czk(Math.abs(dv))}`;
      delta.className = `delta ${dv < 0 ? 'down' : 'up'}`;
      delta.title = 'Change made by your last edit';
    } else { delta.textContent = ''; delta.className = 'delta'; }
    this.lastTotal = r.cost.total;
    const b = this.$('best');
    const isBest = !!best && r.valid && Math.abs(best.cost - r.cost.total) < 1;
    b.innerHTML = best
      ? `${isBest ? '★ your best' : `best ${czk(best.cost)}`}${isBest ? '' : ' <button type="button" id="load-best" title="Load your cheapest valid design (Undo brings this one back)">Load</button>'}`
      : '<small>no valid design yet</small>';
    b.title = best ? 'Your cheapest valid design so far' : '';
    const lb = this.root.querySelector<HTMLButtonElement>('#load-best');
    if (lb) lb.onclick = () => this.ev.onLoadBest?.();
    this.renderProjectScore();
  }

  /** an edit started (a drag counts once, from its start); the change chip compares with the total before it */
  noteEdit(committed: boolean) {
    if (!this.editOpen) { this.baseline = this.lastTotal; this.baselineBills = this.lastBills; this.editOpen = true; }
    if (committed) this.editOpen = false;
  }
}

/** A motorway's direction switch: what a drag bends, and where the directions run apart (each with Join). */
export interface DirectionsState {
  /** old saves: whole-route separate directions */
  split: boolean;
  active: 'both' | 'forward' | 'reverse';
  places: { forward: string; reverse: string };
  apart: { id: string; s0: number; s1: number; following?: boolean }[];
}
/** Fills a box holding #dir-both / #dir-forward / #dir-reverse, #dir-explain and #dir-apart (by class or id). */
export function fillDirections(box: HTMLElement, state: DirectionsState, ev: { onDirection: (w: 'both' | 'forward' | 'reverse') => void; onJoin: (id: string) => void }) {
  const q = (k: string) => box.querySelector<HTMLElement>(`[data-dir="${k}"]`) ?? box.querySelector<HTMLElement>(`#dir-${k}`)!;
  for (const which of ['both', 'forward', 'reverse'] as const) {
    const b = q(which);
    if (which !== 'both') { b.textContent = DIRECTIONS_TEXT.towards(state.places[which]); b.title = DIRECTIONS_TEXT.oneTitle(state.places[which]); }
    else b.title = DIRECTIONS_TEXT.bothTitle;
    b.classList.toggle('on', state.active === which); b.setAttribute('aria-checked', String(state.active === which));
    b.onclick = () => ev.onDirection(which);
  }
  q('explain').textContent = state.split ? DIRECTIONS_TEXT.separate : state.active === 'both' ? DIRECTIONS_TEXT.together : DIRECTIONS_TEXT.one(state.places[state.active]);
  const apart = q('apart');
  apart.replaceChildren();
  if (!state.apart.length) return;
  const h = document.createElement('div'); h.className = 'mode-h'; h.textContent = DIRECTIONS_TEXT.apart;
  apart.append(h);
  for (const t of state.apart) {
    const row = document.createElement('div'); row.className = 'apart-row';
    const [a, b] = shownRange(t.s0, t.s1);
    const where = document.createElement('span'); where.textContent = DIRECTIONS_TEXT.stretch((a / 1000).toFixed(1), (b / 1000).toFixed(1))
      + (t.following ? ` · ${DIRECTIONS_TEXT.following}` : '');
    const join = document.createElement('button'); join.type = 'button';
    join.textContent = t.following ? DIRECTIONS_TEXT.resetFollow : DIRECTIONS_TEXT.joinHere;
    join.title = t.following ? DIRECTIONS_TEXT.resetFollowTitle : DIRECTIONS_TEXT.joinTitle;
    join.onclick = () => ev.onJoin(t.id);
    row.append(where, join); apart.append(row);
  }
}
