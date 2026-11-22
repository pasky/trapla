// "Your decisions": every choice the player made (forced structures, walls, pins, crossings, buildings),
// each a link that selects it, plus a picker of all crossed roads. Cards for the things themselves are
// the inspector's (inspector.ts).
import { BRIDGE_STYLE_TEXT } from '../core/terms';
import './build-tools.css';
import type { Design, Result } from '../core/evaluate';
import { CROSSING_CHOICE_TEXT } from '../core/terms';
import { ROAD_CLASSES } from '../core/data/urban';
import { crossedRoads, type Sel } from './inspector';
import { shownRange, shownS } from './chainage';

export interface DecisionEvents {
  select?: (sel: Sel) => void;
  /** forget the choice for a road that is no longer crossed */
  forget?: (roadId: number) => void;
}

/** kilometres as the player reads them on the active line (ui/chainage.ts) */
const km = (s: number) => (shownS(s) / 1000).toFixed(2);
const kmr = (s0: number, s1: number) => { const [a, b] = shownRange(s0, s1); return `${(a / 1000).toFixed(2)}–${(b / 1000).toFixed(2)}`; };
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CHOICE = Object.fromEntries(CROSSING_CHOICE_TEXT.map(([v, label]) => [v, label])) as Record<string, string>;

export class DecisionList {
  ev: DecisionEvents = {};
  objectDataChanged = false;
  constructor(private list: HTMLElement, private onCount?: (n: number) => void) {
    list.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.range) { const [s0, s1] = b.dataset.range.split(',').map(Number); this.ev.select?.({ kind: 'stretch', s0, s1 }); }
      else if (b.dataset.pin) this.ev.select?.({ kind: 'pin', s: Number(b.dataset.pin) });
      else if (b.dataset.road) this.ev.select?.({ kind: 'crossing', roadId: Number(b.dataset.road) });
      else if (b.dataset.buildingJ) this.ev.select?.({ kind: 'building', j: Number(b.dataset.buildingJ) });
      else if (b.dataset.forget) this.ev.forget?.(Number(b.dataset.forget));
    });
    list.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.id === 'crossing-select' && t.value !== '') this.ev.select?.({ kind: 'crossing', roadId: Number(t.value) });
    });
  }

  /** `kind(j)`: "house" etc. */
  setResult(r: Result, d: Design, kind: (j: number) => string = () => 'building') {
    const items: string[] = [];
    const li = (attrs: string, text: string) => items.push(`<li><button type="button" class="link" ${attrs}>${text}</button></li>`);
    for (const o of [...(d.structureOverrides ?? [])].sort((a, b) => a.s0 - b.s0)) li(`data-range="${o.s0},${o.s1}"`, `<i class="st-${o.kind}"></i>${['Earthwork', 'Bridge', 'Tunnel'][o.kind]}${o.style ? `: ${BRIDGE_STYLE_TEXT.find(([v]) => v === o.style)![1].toLowerCase()}` : o.method === 'cut' ? ': cut and cover' : ''} <small>km ${kmr(o.s0, o.s1)}</small>`);
    for (const o of [...(d.wallOverrides ?? [])].sort((a, b) => a.s0 - b.s0)) li(`data-range="${o.s0},${o.s1}"`, `<i class="wall"></i>${o.height ? `${o.height} m wall` : 'No wall'} ${o.side === 'L' ? 'left' : 'right'} <small>km ${kmr(o.s0, o.s1)}</small>`);
    for (const p of d.gradePins ?? []) li(`data-pin="${p.s}"`, `<i class="pin"></i>Height ${p.z.toFixed(1)} m <small>km ${km(p.s)}${p.s > r.length ? ' · past the end' : ''}</small>`);
    const inactive: number[] = [];
    // (a way and its pieces another road's cut left are one choice, core/project-roadnet.ts withPieces: no longer crossed
    // only where none of them is)
    const wayOf = new Map(r.pieceOf?.list ?? []), crossed = new Set(r.crossings.map(c => c.roadId === undefined ? undefined : wayOf.get(c.roadId) ?? c.roadId));
    for (const o of d.crossingOverrides ?? []) {
      const c = r.crossings.find((c) => c.roadId === o.roadId);
      if (c) li(`data-road="${o.roadId}"`, `<i class="xing"></i>${CHOICE[o.type]}${o.via ? ' (your path)' : ''} · ${esc(ROAD_CLASSES[c.cls].label)} <small>km ${km(c.s)}</small>`);
      else if (!crossed.has(wayOf.get(o.roadId) ?? o.roadId)) inactive.push(o.roadId);
    }
    for (const o of d.buildingOverrides ?? []) li(`data-building-j="${o.j}"`, `<i class="${o.action === 'keep' ? 'keep' : 'buy'}"></i>${o.action === 'keep' ? 'Keep' : 'Buy out'} ${esc(kind(o.j))}`);
    const roads = crossedRoads(r);
    this.list.innerHTML = `${this.objectDataChanged ? '<p class="warn">Map data changed: building and crossing choices cleared.</p>' : ''}
      ${items.length ? `<ul class="decisions">${items.join('')}</ul>` : '<div class="sub">Nothing yet — everything is Auto.</div>'}
      ${inactive.map((id) => `<button type="button" class="forget" data-forget="${id}">Forget a choice for a road no longer crossed</button>`).join('')}
      <label class="all-crossings">Crossed roads <select id="crossing-select"><option value="">all ${roads.length}…</option>${roads.map((c) => `<option value="${c.roadId}">km ${km(c.s)} · ${esc(ROAD_CLASSES[c.cls].label)}</option>`).join('')}</select></label>`;
    this.onCount?.(items.length);
  }
}
