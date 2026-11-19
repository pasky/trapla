// Any mapped road: click selects it (one card, its stretch highlighted); a drag on the highlighted
// stretch rebuilds it as a project road (main.ts dispatches road-edit's command). Nothing is created
// by a click, and nothing needs confirming first.
import type { SourceInterval } from '../core/project';
import type { ProjectTransportIndex } from '../core/project-network';
import { ROAD_CLASSES } from '../core/data/urban';
import type { SourceHit } from '../render/source-pick';
import type { View } from '../render/view';
import { derivedStretch } from './road-edit';
import { mappedLineKindFor, type MappedLineKind } from './route-kinds';
import { coveredText, mappedRoadName, namedByNumber } from '../core/terms';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
  const node = document.createElement(tag); node.textContent = text; return node;
};
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const TOO_SHORT = 'Too short to change here: pick it further from its junctions or from the map edge.';

export class MappedRoadCard {
  private hit: SourceHit | null = null;
  /** the stretch a drag would rebuild (null: this road cannot be rebuilt, see the card) */
  interval: SourceInterval | null = null;
  private path: { x: number; y: number }[] = [];
  /** the kind that rebuilds the selected line (road today; railway when registered) */
  lineKind: MappedLineKind | null = null;
  onClose?: () => void;
  constructor(private root: () => HTMLElement, private view: View, private base: ProjectTransportIndex,
    private claimed: () => readonly SourceInterval[],
    /** the parts of a mapped road other project roads' earthworks cover (road-edit.ts coveredStretches) */
    private covered: (sourceId: string) => readonly (SourceInterval & { by: string })[] = () => []) {}
  get selected() { return this.hit; }
  get selection() { return this.interval && { kind: 'source' as const, interval: { ...this.interval } }; }
  clear() {
    if (this.hit) this.view.setSourceSelection(null);
    this.hit = null; this.interval = null; this.path = []; this.lineKind = null;
  }
  /** What a drag of this mapped line at station s would rebuild: the stretch and the kind that rebuilds it, or why it
   * cannot (the card's own words), with the line's name. */
  stretchAt(sourceId: string, s: number): ({ ok: true; interval: SourceInterval; lineKind: MappedLineKind; becomes: string } | { ok: false; why: string }) & { name: string } {
    const source = this.base.source(sourceId);
    if (!source) return { ok: false, why: 'This road’s map data is incomplete.', name: 'the road' };
    const name = mappedRoadName(source.tags, ROAD_CLASSES[source.tags.highway ?? '']?.label ?? (source.kind === 'railway' ? 'railway' : 'road'));
    const { kind, verdict: what } = mappedLineKindFor(this.base, source.id);
    if (!what.ok || !kind) return { ok: false, why: what.ok ? 'This line cannot be changed yet.' : what.why, name };
    const covered = this.covered(source.id), under = covered.find(c => s >= c.s0 && s <= c.s1);
    if (under) return { ok: false, why: coveredText(under.by), name };
    const interval = derivedStretch(this.base, source.id, s, [...this.claimed(), ...covered]);
    if (!interval) return { ok: false, why: TOO_SHORT, name };
    return { ok: true, interval, lineKind: kind, becomes: what.becomes, name };
  }
  show(hit: SourceHit) {
    this.clear(); this.hit = hit;
    const source = this.base.source(hit.sourceId);
    if (!source) return;
    const { kind, verdict: what } = mappedLineKindFor(this.base, source.id);
    this.lineKind = what.ok ? kind : null;
    const covered = what.ok ? this.covered(source.id) : [], under = covered.find(c => hit.s >= c.s0 && hit.s <= c.s1);
    this.interval = what.ok && !under ? derivedStretch(this.base, source.id, hit.s, [...this.claimed(), ...covered]) : null;
    if (this.interval) {
      try { this.path = this.base.path(this.interval); this.view.setSourceSelection(this.path); } catch { this.interval = null; this.path = []; }
    }
    const root = this.root();
    root.replaceChildren(); root.className = 'card ctx inspector k-source';
    const header = el('div'); header.className = 'ctx-h';
    const label = ROAD_CLASSES[source.tags.highway ?? '']?.label ?? (source.kind === 'railway' ? 'railway' : 'road');
    const name = mappedRoadName(source.tags, label);
    const close = el('button', '✕'); close.className = 'x'; close.title = 'Close (Esc)'; close.type = 'button';
    close.onclick = () => { this.clear(); this.onClose?.(); };
    // "Road III/1057" already says its class
    // ("Street" with no name of its own: said once)
    header.append(el('b', cap(name)), ...(namedByNumber(source.tags) || name === label ? [] : [el('small', cap(label))]), close);
    root.append(header);
    if (!what.ok) { root.append(el('p', what.why)); return; }
    if (under) { root.append(el('p', coveredText(under.by))); return; }
    if (!this.interval) { root.append(el('p', TOO_SHORT)); return; }
    const how = el('p', 'Drag it to change its line.'); how.className = 'mapped-how';
    const stretch = el('div', `The highlighted ${Math.round(this.interval.s1 - this.interval.s0)} m, between its junctions, would be rebuilt as a ${what.becomes}.`);
    stretch.className = 'sub';
    root.append(how, stretch);
  }
  /** Is this map point on the highlighted stretch (within `reach` metres of its line)? */
  covers(x: number, y: number, reach: number): boolean {
    if (!this.interval) return false;
    for (let i = 1; i < this.path.length; i++) {
      const a = this.path[i - 1], b = this.path[i], dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(x - a.x - t * dx, y - a.y - t * dy) <= reach) return true;
    }
    return false;
  }
}
