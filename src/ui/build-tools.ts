// Contextual construction controls. They appear in the HUD's context area when the player picks the
// thing they act on: a selected stretch (what to build there, noise walls), a crossed road (how to cross
// it) or a building (automatic / buy out / keep). The options are buttons; the active one is
// highlighted. "Your decisions" lists every choice the player made (and all crossed roads) as a
// secondary way in. Every edit goes through the owner's Store, so all of it can be undone.
import './build-tools.css';
import type { Design, Result } from '../core/evaluate';
import { crossingChoice, crossingLabel, type CrossingChoice } from '../core/crossings';
import { BUILDING_KINDS, ROAD_CLASSES } from '../core/data/urban';
import type { BuildingOverride } from '../core/build-controls';
import type { StructureKind } from '../core/overrides';
import { rangeSummary } from '../core/range';
import { czk } from './costgroups';
import { activeStructure, structureButtons } from './structure-bar';
import type { StationRange } from '../state';

export interface BuildToolEvents {
  pin?: (s: number, z: number | null) => void;
  selectStation?: (s: number) => void;
  crossing?: (roadId: number, type: CrossingChoice | null) => void;
  selectCrossing?: (roadId: number) => void;
  building?: (j: number, action: BuildingOverride['action'] | null) => void;
  selectBuilding?: (j: number) => void;
  /** a wall of `height` (0: none, null: automatic) on these sides of the selected stretch, one edit */
  wall?: (sides: ('L' | 'R')[], height: number | null) => void;
  /** bridge / tunnel / earthwork / automatic (null) on the selected stretch */
  structure?: (kind: StructureKind | null) => void;
  /** deselect the stretch */
  clearRange?: () => void;
  /** close the crossing / building card */
  closeCrossing?: () => void;
  closeBuilding?: () => void;
  /** select a stretch (from the decisions list) */
  selectRange?: (s0: number, s1: number) => void;
}

const km = (s: number) => (s / 1000).toFixed(2);
const num = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CROSSING_OPTIONS: [CrossingChoice | '', string, string][] = [
  ['', 'Automatic', 'Keep existing bridges, junctions at least 1.5 km apart, otherwise the cheaper of a bridge or a link to a nearby crossing road'],
  ['junction', 'Junction', 'An at-grade junction with our road (class I–III roads only, ≥ 1.5 km from the next junction)'],
  ['bridge', 'Our bridge over it', 'Our road bridges over the crossed road (needs clearance above it)'],
  ['overbridge', 'Its bridge over us', 'The crossed road bridges over ours, with raised approach ramps (a motorway only over a ≥ 6 m cut)'],
  ['reconnection', 'Close + reconnect', 'Close the crossed road at our road and link both ends to the nearest crossing road'],
];
const TYPE_NAME: Record<string, string> = {
  bridge: 'under our bridge', tunnel: 'above our tunnel', overbridge: 'its bridge over us', junction: 'junction',
  reconnection: 'closed + reconnected', diversion: 'diverted', atGrade: 'at grade (not allowed)',
};

export class BuildTools {
  ev: BuildToolEvents = {};
  objectDataChanged = false;
  station: number | null = null;
  crossing: number | null = null;
  building: number | null = null;
  private range: StationRange | null = null;
  private wallSide: 'L' | 'R' | 'both' = 'both';
  private wallHeight = 4;
  private r: Result | null = null;
  private d: Design | null = null;
  private rangeCard: HTMLElement;
  private crossingCard: HTMLElement;
  private buildingCard: HTMLElement;
  private pendingRender = false;

  /** `context`: host of the contextual cards; `list`: body of the "Your decisions" section */
  constructor(context: HTMLElement, private list: HTMLElement, private onCount?: (n: number) => void) {
    const card = (id: string, cls: string) => {
      const el = document.createElement('section');
      el.className = `card ctx ${cls}`; el.id = id; el.style.display = 'none';
      context.appendChild(el);
      return el;
    };
    this.rangeCard = card('range', 'range-card');
    this.crossingCard = card('crossing-card', 'crossing-card');
    this.buildingCard = card('building-card', 'building-card');
    for (const host of [context, list]) {
      host.addEventListener('focusout', () => queueMicrotask(() => {
        if (this.pendingRender && !host.contains(document.activeElement)) this.render();
      }));
    }
    this.render();
  }
  setResult(r: Result, d: Design) {
    this.r = r; this.d = d;
    // do not redraw under the player's fingers while they type a wall height
    if (document.activeElement?.matches('#range input')) this.pendingRender = true;
    else this.render();
  }
  selectStation(s: number) { this.station = s; this.crossing = this.building = null; this.render(); }
  selectCrossing(roadId: number | null) { this.crossing = roadId; if (roadId !== null) this.station = this.building = null; this.render(); }
  selectBuilding(j: number | null) { this.building = j; if (j !== null) this.station = this.crossing = null; this.render(); }
  setRange(range: StationRange | null) { this.range = range; this.render(); }

  /** the selected stretch: its bill, what to build there, noise walls */
  private renderRange(r: Result, d: Design) {
    const card = this.rangeCard, range = this.range;
    const sel = range && range.s0 < r.length ? rangeSummary(r, range.s0, Math.min(range.s1, r.length)) : null;
    card.style.display = sel ? '' : 'none';
    if (!range || !sel) { card.innerHTML = ''; return; }
    const existing = (d.wallOverrides ?? []).filter((o) => o.s1 > range.s0 && o.s0 < range.s1);
    const autoWalls = r.walls.filter((w) => w.s1 > range.s0 && w.s0 < range.s1);
    const sideBtn = (v: 'L' | 'R' | 'both', label: string) => `<button type="button" data-side="${v}" class="${this.wallSide === v ? 'on' : ''}" aria-pressed="${this.wallSide === v}">${label}</button>`;
    card.innerHTML = `<div class="ctx-h"><b>Selected km ${num(sel.s0 / 1000, 2)} – ${num(sel.s1 / 1000, 2)}</b><small>${num(sel.length / 1000, 2)} km</small><button type="button" class="x" title="Deselect: back to the whole route (Esc)">✕</button></div>
      <div class="range-cost"><b>${czk(sel.cost.total)}</b> · ${czk(sel.cost.total / (sel.length / 1000))} per km <small>${num((100 * sel.cost.total) / Math.max(1, r.cost.total), 0)} % of the route's cost on ${num((100 * sel.length) / r.length, 0)} % of its length</small></div>
      <div class="ctx-lbl">Build here</div>
      <div class="ctx-grid range-build">${structureButtons(activeStructure(range, d.structureOverrides))}</div>
      <div class="ctx-lbl" id="wall-tools">Noise wall</div>
      <div class="ctx-row wall-opts"><span class="seg mini" role="group" aria-label="Side of the road (driving from A to B)">${sideBtn('L', 'left')}${sideBtn('R', 'right')}${sideBtn('both', 'both sides')}</span>
        <label title="Wall height, 2–6 m"><input id="wall-height" type="number" min="2" max="6" step="0.5" value="${this.wallHeight}"> m high</label>
      </div>
      <div class="ctx-grid three"><button type="button" id="wall-add" title="A wall of this height along the whole selected stretch (none inside tunnels)">Build wall</button><button type="button" id="wall-remove" title="No wall here. Houses left too loud become a violation; they are not bought out silently.">No wall</button><button type="button" id="wall-auto" title="Let the game decide again: 3 / 4 / 5 m walls where they help, otherwise it buys out the houses it cannot protect (unless you keep them)">Automatic</button></div>
      <div class="sub">${existing.length ? `Your walls here: ${existing.map((o) => `${o.side === 'L' ? 'left' : 'right'}: ${o.height ? `${o.height} m wall` : 'no wall'} (km ${km(o.s0)}–${km(o.s1)})`).join(' · ')}.` : autoWalls.length ? `Automatic walls here: ${wallSummary(autoWalls)}.` : 'No walls here now.'} Sides as seen driving from A to B.</div>`;
    const height = card.querySelector<HTMLInputElement>('#wall-height')!;
    height.onchange = () => { if (Number.isFinite(height.valueAsNumber)) this.wallHeight = Math.max(2, Math.min(6, height.valueAsNumber)); };
    const sides = (): ('L' | 'R')[] => (this.wallSide === 'both' ? ['L', 'R'] : [this.wallSide]);
    card.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.classList.contains('x')) this.ev.clearRange?.();
      else if (b.dataset.structure !== undefined) this.ev.structure?.(b.dataset.structure === 'clear' ? null : Number(b.dataset.structure) as StructureKind);
      else if (b.dataset.side) { this.wallSide = b.dataset.side as 'L' | 'R' | 'both'; this.render(); }
      else if (b.id === 'wall-add') {
        const h = height.valueAsNumber;
        if (Number.isFinite(h) && h >= 2 && h <= 6) { this.wallHeight = h; this.ev.wall?.(sides(), h); }
        else { height.classList.add('bad'); height.focus(); }
      } else if (b.id === 'wall-remove') this.ev.wall?.(sides(), 0);
      else if (b.id === 'wall-auto') this.ev.wall?.(sides(), null);
    };
  }

  private renderBuilding(r: Result, d: Design) {
    const j = this.building, card = this.buildingCard;
    card.style.display = j === null ? 'none' : '';
    if (j === null) { card.innerHTML = ''; return; }
    const action = d.buildingOverrides?.find((o) => o.j === j)?.action ?? '';
    const removed = r.demolished.find((p) => p.j === j), bought = r.boughtOut.find((p) => p.j === j);
    const kept = r.kept.find((p) => p.j === j), receiver = r.noise.receivers.find((p) => p.j === j);
    const state = removed ? `<span class="tag bad">demolished</span> in the road's footprint · ${czk(removed.cost)}`
      : bought ? `<span class="tag buy">bought out</span> ${bought.reason === 'manual' ? 'by you' : 'for noise'} + demolished · ${czk(bought.cost)}`
        : kept?.hit ? '<span class="tag bad">kept — in the road\'s way</span> (violation)'
          : receiver?.unresolved ? `<span class="tag bad">${receiver.unresolved.excess.toFixed(1)} dB too loud</span> a violation: ${action === 'keep' ? 'you keep it' : 'your wall choice here leaves it'} over the noise limit`
            : receiver ? `<span class="tag ok">stays</span> ${receiver.status === 'wall' ? 'behind a noise wall' : receiver.status === 'cut' ? 'screened by a cut' : 'within the noise limit'}`
              : '<span class="tag ok">stays</span> not affected by the road';
    const kind = esc(this.describeBuilding?.(j) ?? 'building');
    const opt = (v: string, label: string, title: string) => `<button type="button" data-building="${v}" class="${action === v ? 'on' : ''}" aria-pressed="${action === v}" title="${title}">${label}</button>`;
    card.innerHTML = `<div class="ctx-h"><b>Building</b><small>${kind} #${j}</small><button type="button" class="x" title="Close (Esc)">✕</button></div>
      <div class="ctx-state">${state}</div>
      <div class="ctx-row choice" id="building-choice" role="group" aria-label="Decision">${opt('', 'Automatic', 'Demolish it if it is in the road\'s way; buy it out if 3–5 m walls and cuts cannot protect it from noise; otherwise it stays')}${opt('buy', 'Buy out', 'Buy out and demolish it (building, demolition and plot)')}${opt('keep', 'Keep', 'Never demolish or buy it. In the road\'s way, or left too loud, it is a violation')}</div>
      <div class="sub">Buying out includes the plot. A kept building in the road's way, or left too loud, is a violation.</div>`;
    card.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.classList.contains('x')) this.ev.closeBuilding?.();
      else if (b.dataset.building !== undefined) this.ev.building?.(j, (b.dataset.building || null) as BuildingOverride['action'] | null);
    };
  }

  /** the kind of building j (house, flats…), when the owner knows it */
  describeBuilding?: (j: number) => string;

  private renderCrossing(r: Result, d: Design) {
    const card = this.crossingCard;
    const c = this.crossing === null ? undefined : r.crossings.find((c) => c.roadId === this.crossing);
    card.style.display = c ? '' : 'none';
    if (!c) { card.innerHTML = ''; return; }
    const choice = crossingChoice(c.roadId!, d.crossingOverrides ?? []) ?? '';
    const all = r.crossings.filter((x) => x.roadId === c.roadId);
    const cost = all.reduce((a, x) => a + x.cost, 0);
    const roads = this.crossedRoads(r);
    const k = roads.findIndex((x) => x.roadId === c.roadId);
    const bad = c.issues?.length || (c.type === 'atGrade' && ROAD_CLASSES[c.cls].noAtGrade);
    card.innerHTML = `<div class="ctx-h"><b>Crossed road</b><small title="${esc(ROAD_CLASSES[c.cls].label)} #${c.roadId} (OpenStreetMap way in the map data), crossed at km ${km(c.s)}">${esc(ROAD_CLASSES[c.cls].label)} · km ${km(c.s)}</small>
        <button type="button" class="nav" data-nav="-1" title="Previous crossed road along the route" ${k <= 0 ? 'disabled' : ''}>‹</button><button type="button" class="nav" data-nav="1" title="Next crossed road along the route" ${k >= roads.length - 1 ? 'disabled' : ''}>›</button><button type="button" class="x" title="Close (Esc)">✕</button></div>
      <div class="ctx-state"><span class="tag ${bad ? 'bad' : 'ok'}">${TYPE_NAME[c.type] ?? c.type}</span> ${esc(crossingLabel(c))}${cost > 0 ? ` · <b>${czk(cost)}</b>` : ''}<br><small>our road ${Math.abs(c.h).toFixed(1)} m ${c.h >= 0 ? 'above' : 'below'} it${all.length > 1 ? ` · crossed ${all.length}× (km ${all.map((x) => km(x.s)).join(', ')})` : ''}</small></div>
      ${c.issues?.length ? `<div class="ctx-issue">⚠ ${c.issues.map((v) => esc(v.title)).join('; ')}</div>` : ''}
      <div class="ctx-row choice" id="crossing-choice" role="group" aria-label="How to cross it">${CROSSING_OPTIONS.map(([v, label, title]) => `<button type="button" data-crossing="${v}" class="${choice === v ? 'on' : ''}" aria-pressed="${choice === v}" title="${title}">${label}</button>`).join('')}</div>
      <div class="sub">Applies wherever we cross this road. Choices that do not work are kept and shown as violations.</div>`;
    card.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.classList.contains('x')) this.ev.closeCrossing?.();
      else if (b.dataset.nav) { const n = roads[k + Number(b.dataset.nav)]; if (n) this.ev.selectCrossing?.(n.roadId!); }
      else if (b.dataset.crossing !== undefined) this.ev.crossing?.(c.roadId!, (b.dataset.crossing || null) as CrossingChoice | null);
    };
  }

  /** every crossed road once, in route order */
  private crossedRoads(r: Result) {
    const list = r.crossings.filter((c) => c.roadId !== undefined).sort((a, b) => a.s - b.s);
    return list.filter((c, i) => list.findIndex((x) => x.roadId === c.roadId) === i);
  }

  /** "Your decisions": the player's choices, each a link to the thing; all crossed roads in a picker */
  private renderList(r: Result, d: Design) {
    const items: string[] = [];
    const li = (attrs: string, text: string, title = 'Show it') => items.push(`<li><button type="button" class="link" ${attrs} title="${title}">${text}</button></li>`);
    for (const o of [...(d.structureOverrides ?? [])].sort((a, b) => a.s0 - b.s0)) li(`data-range="${o.s0},${o.s1}"`, `<i class="st-${o.kind}"></i>${['Earthwork', 'Bridge', 'Tunnel'][o.kind]} km ${km(o.s0)}–${km(o.s1)}`, 'Select this stretch');
    for (const o of [...(d.wallOverrides ?? [])].sort((a, b) => a.s0 - b.s0)) li(`data-range="${o.s0},${o.s1}"`, `<i class="wall"></i>${o.height ? `${o.height} m wall` : 'No wall'} ${o.side === 'L' ? 'left' : 'right'} km ${km(o.s0)}–${km(o.s1)}`, 'Select this stretch');
    for (const p of d.gradePins ?? []) li(`data-pin="${p.s}"`, `<i class="pin"></i>Pinned height ${p.z.toFixed(1)} m at km ${km(p.s)}${p.s > r.length ? ' <small>(beyond the end of the route)</small>' : ''}`);
    const inactive: number[] = [];
    for (const o of d.crossingOverrides ?? []) {
      const c = r.crossings.find((c) => c.roadId === o.roadId);
      if (c) li(`data-road="${o.roadId}"`, `<i class="xing"></i>${CROSSING_OPTIONS.find(([v]) => v === o.type)?.[1]} — ${esc(ROAD_CLASSES[c.cls].label)} #${o.roadId} km ${km(c.s)}`);
      else inactive.push(o.roadId);
    }
    for (const o of d.buildingOverrides ?? []) li(`data-building-j="${o.j}"`, `<i class="${o.action === 'keep' ? 'keep' : 'buy'}"></i>${o.action === 'keep' ? 'Keep' : 'Buy out'} building #${o.j}`);
    const roads = this.crossedRoads(r);
    const range = this.range;
    const inRange = roads.filter((c) => !range || (c.s >= range.s0 && c.s <= range.s1));
    this.list.innerHTML = `${this.objectDataChanged ? '<p class="warn">The map data changed: your building and road-crossing choices were cleared so they cannot land on different objects. Choices tied to km positions are kept.</p>' : ''}
      ${items.length ? `<ul class="decisions">${items.join('')}</ul>` : '<div class="sub">No choices of your own yet: everything is automatic. Select a stretch in the profile, or click a crossed road or a building on the map.</div>'}
      ${inactive.map((id) => `<button type="button" class="forget" data-forget="${id}" title="This road is no longer crossed. Its saved choice would apply again if you reroute across it.">Forget the choice for road #${id} (no longer crossed)</button>`).join('')}
      <label class="all-crossings">Crossed roads <select id="crossing-select" title="Pick a crossed road to see its options"><option value="">${range ? `${inRange.length} in the selected stretch…` : `all ${roads.length} along the route…`}</option>${inRange.map((c) => `<option value="${c.roadId}" ${c.roadId === this.crossing ? 'selected' : ''}>km ${km(c.s)} · ${esc(ROAD_CLASSES[c.cls].label)} · ${TYPE_NAME[c.type] ?? c.type}</option>`).join('')}</select></label>`;
    this.onCount?.(items.length);
    this.list.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.range) { const [s0, s1] = b.dataset.range.split(',').map(Number); this.ev.selectRange?.(s0, s1); }
      else if (b.dataset.pin) this.ev.selectStation?.(Number(b.dataset.pin));
      else if (b.dataset.road) this.ev.selectCrossing?.(Number(b.dataset.road));
      else if (b.dataset.buildingJ) this.ev.selectBuilding?.(Number(b.dataset.buildingJ));
      else if (b.dataset.forget) this.ev.crossing?.(Number(b.dataset.forget), null);
    };
    this.list.querySelector<HTMLSelectElement>('#crossing-select')!.onchange = (e) => {
      const value = (e.target as HTMLSelectElement).value;
      if (value !== '') this.ev.selectCrossing?.(Number(value));
    };
  }

  private render() {
    this.pendingRender = false;
    const r = this.r, d = this.d;
    if (!r || !d) return;
    this.renderRange(r, d);
    this.renderCrossing(r, d);
    this.renderBuilding(r, d);
    this.renderList(r, d);
  }
}

/** short name of a building's kind, e.g. "house · 2 storeys" (binfo: [?, levels, kind, …]) */
export function buildingKind(info: ArrayLike<number> | undefined, levels: number): string {
  const kind = BUILDING_KINDS[info ? info[2] : 0]?.label ?? 'building';
  return `${kind} · ${levels} storey${levels === 1 ? '' : 's'}`;
}

/** "left 3 m ×2, right 4 m" */
function wallSummary(walls: readonly { side: 'L' | 'R'; height: number }[]): string {
  const n = new Map<string, number>();
  for (const w of walls) { const k = `${w.side === 'L' ? 'left' : 'right'} ${w.height} m`; n.set(k, (n.get(k) ?? 0) + 1); }
  return [...n].map(([k, c]) => (c > 1 ? `${k} ×${c}` : k)).join(', ');
}
