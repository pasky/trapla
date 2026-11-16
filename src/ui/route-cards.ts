// The inspector's cards for a road as a whole (not a thing on it), moved out of main.ts:
//  - the head of a side road / rebuilt stretch / built railway (what it is, its traffic, its junctions and
//    works, how to undo it) and a motorway's own card (what a drag bends);
//  - the card of a proposed change that is not checked yet;
//  - the card of a mapped road in a pack without road links.
// They read the project through `RouteCardDeps` and change it only through its commands.
import { ENDPOINT_JUNCTIONS, ROAD_CLASSES } from '../core/data/urban';
import { UNCOUNTED_TRAFFIC } from '../core/data/traffic';
import type { Result } from '../core/evaluate';
import type { Anchor, ProjectDesign, ProjectResult, RouteDesign, RouteId } from '../core/project';
import type { ProjectTransportIndex } from '../core/project-network';
import { groundRoadSourceInfo } from '../core/project-promotion';
import { DIRECTIONS_TEXT, mappedRoadName } from '../core/terms';
import { ROUNDABOUT_HOSTS } from '../core/tie-in';
import { classTraffic } from '../core/traffic-census';
import { fillDirections, type DirectionsState } from './hud';
import { DEFAULT_SPEED, isTraffic, startSpeed, strayDistance } from './road-edit';
import { toast } from './toast';

export interface RouteCardDeps {
  /** the active route, its shown result, the last full project result, the project and the road links */
  route(): RouteDesign | null;
  result(): Result | null;
  project(): ProjectResult | null;
  design(): ProjectDesign;
  transport(): ProjectTransportIndex | null;
  /** the road widgets can edit the active route (a design is read from it) */
  editable(): boolean;
  /** the motorway direction switch's state; null: not a motorway */
  directions(): DirectionsState | null;
  onDirection(which: 'both' | 'forward' | 'reverse'): void;
  joinStretch(id: string): void;
  editProject(edit: (project: ProjectDesign) => void): void;
  inTransaction(): boolean;
  /** throws when another line joins this one */
  deleteRoute(id: RouteId): void;
  missionRouteId(): RouteId | undefined;
  switchRoute(id: RouteId): void;
  undo(): void;
  flyTo(x: number, y: number, dist: number): void;
  selectBend(i: number): void;
  /** the inspector's element, borrowed for a whole-road card; and its empty state */
  host(): HTMLElement;
  clear(message: string): void;
}

/** A side road's own settings, above whatever is selected on it: what it is, its traffic, its junctions
 * and works, and how to undo it. */
export function routeHeadCard(deps: RouteCardDeps): (shown: string | null) => HTMLElement | null {
  let strayKey = '', stray = 0;
  return (shown) => {
  const route = deps.route(), r = deps.result(), projectFull = deps.project(), transportIndex = deps.transport();
  // a motorway's own card: what a drag bends (both directions or one), where they run apart
  const directions = deps.directions();
  if (route?.kind === 'motorway' && directions && (shown === null || shown === 'stretch')) {
    // below a selected stretch's card; alone when nothing is selected
    const box = document.createElement('div'); box.className = 'route-head motorway-head'; box.dataset.place = 'below';
    box.innerHTML = `<div class="mode-h"><b>${DIRECTIONS_TEXT.heading}</b></div>
        <div class="seg" role="radiogroup" aria-label="Directions"><button type="button" data-dir="both" role="radio">${DIRECTIONS_TEXT.both}</button><button type="button" data-dir="forward" role="radio"></button><button type="button" data-dir="reverse" role="radio"></button></div>
        <p data-dir="explain" class="mode-explain"></p><div data-dir="apart" class="dir-apart"></div>`;
    fillDirections(box, directions, { onDirection: w => deps.onDirection(w), onJoin: deps.joinStretch });
    return box;
  }
  if (!route || route.role === 'mission' || (route.kind !== 'road' && route.kind !== 'railway') || !r) return null;
  // a railway's card: what it is, its own works and removing it (no traffic or junction choices)
  const rail = route.kind === 'railway', old = rail ? 'old track' : 'old road';
  const head = document.createElement('div'); head.className = 'route-head';
  const h = document.createElement('div'); h.className = 'ctx-h';
  const title = document.createElement('b'); title.textContent = route.name;
  const sub = document.createElement('small'); sub.textContent = `${(r.length / 1000).toFixed(2)} km`;
  h.append(title, sub);
  const what = document.createElement('div'); what.className = 'sub';
  const interval = route.source?.intervals[0];
  if (interval && transportIndex) {
    const key = `${route.id}:${route.revision}:${r.n}:${r.x[r.n >> 1]}`;
    if (key !== strayKey) {
      strayKey = key;
      try {
        const old = transportIndex.path(interval), line = Array.from({ length: Math.ceil(r.n / 2) }, (_, k) => ({ x: r.x[2 * k], y: r.y[2 * k] }));
        stray = strayDistance(line, old);
      } catch { stray = NaN; }
    }
    const accepted = rail ? !!projectFull?.routes[route.id]?.legacy
      : projectFull?.acceptedReplacements.some(i => i.sourceId === interval.sourceId && i.s0 === interval.s0 && i.s1 === interval.s1);
    if (route.kind === 'railway') what.textContent = `Rebuilt stretch${Number.isFinite(stray) ? `, up to ${Math.round(stray)} m from the old track` : ''}. ${accepted
      ? `On the old track it is kept as it is. Off it, a new track is built for ${route.specification.designSpeed} km/h.` : 'Checking the change…'}`;
    else {
    // why this design speed: the lowest the norm allows for a new road; the map's limit is for noise and time
    const signed = (() => { try { return groundRoadSourceInfo(transportIndex, interval.sourceId).taggedSpeed; } catch { return null; } })();
    const lowest = route.specification.crossSection === 'existing' ? DEFAULT_SPEED : startSpeed(route.specification.crossSection);
    const speed = route.specification.designSpeed === lowest
      ? ` for ${lowest} km/h (the lowest the norm allows${signed && signed !== lowest ? `; signed ${signed}` : ''})` : '';
    what.textContent = `Rebuilt stretch${Number.isFinite(stray) ? `, up to ${Math.round(stray)} m from the old road` : ''}. ${accepted
      ? `On the old road it is kept as it is. Off it, a new road is built${speed} and the old one removed.` : 'Checking the change…'}`;
    }
  } else {
    const end = (e: typeof route.endpoints.a) => e.anchor.kind === 'free' ? 'open ground'
      : e.anchor.kind === 'route' ? (() => { const host = deps.design().routes.find(q => q.id === (e.anchor as { routeId: string }).routeId);
        return !host ? 'a road' : host.role === 'mission' ? 'our road' : host.name; })()
      : e.anchor.kind === 'source' ? (rail ? (() => { const t = transportIndex?.source(e.anchor.location.sourceId)?.tags; return t?.name || (t?.ref ? `railway ${t.ref}` : 'a railway'); })()
        : mappedRoadName(transportIndex?.source(e.anchor.location.sourceId)?.tags, 'a road')) : 'a scenario end';
    what.textContent = `New ${rail ? 'railway' : 'road'} from ${end(route.endpoints.a)} to ${end(route.endpoints.b)}.`;
  }
  const form = document.createElement('form'); form.className = 'source-operations route-traffic';
  const fields: HTMLInputElement[] = [];
  if (route.kind === 'road') { const op = route.specification.operations;
  for (const [key, label, unit, value] of [
    ['traffic', 'Traffic', 'a day,', String(op.aadt)],
    ['heavy', 'heavy', '%', String(Math.round(op.heavyShare * 1000) / 10)],
  ] as const) {
    const row = document.createElement('label'); row.textContent = label;
    const input = document.createElement('input'); input.type = 'number'; input.required = true; input.min = '0';
    input.max = key === 'traffic' ? '100000' : '100'; input.step = key === 'traffic' ? '1' : 'any'; input.name = key; input.value = value;
    const small = document.createElement('small'); small.textContent = unit;
    input.setAttribute('aria-label', key === 'traffic' ? 'Traffic, vehicles a day' : 'Heavy vehicles, percent');
    row.append(input, small); form.append(row); fields.push(input);
  }
  const apply = () => {
    const [traffic, heavy] = fields.map(f => f.value === '' ? NaN : Number(f.value));
    if (!(traffic >= 0 && traffic <= 100000 && heavy >= 0 && heavy <= 100)) return;
    const id = route.id;
    deps.editProject(d => {
      const q = d.routes.find(x => x.id === id); if (!q || q.kind !== 'road') return;
      q.specification.operations = { ...q.specification.operations, aadt: Math.round(traffic), heavyShare: heavy / 100 };
    });
    // the card is not redrawn under a focused field: the player's own number carries no "counted" label
    if (!filled || Math.round(traffic) !== filled.aadt || Math.abs(heavy / 100 - filled.heavyShare) > 1e-9) basis.remove();
  };
  // where the numbers come from, while they are still the ones the game filled in
  const cls = route.specification.legalClass, averaged = ['I', 'II', 'III'].includes(cls) ? cls : 'III';
  const uncounted = UNCOUNTED_TRAFFIC[cls as keyof typeof UNCOUNTED_TRAFFIC];
  const filled = interval ? transportIndex?.traffic(interval, cls) : route.source ? undefined : classTraffic(cls);
  const basis = document.createElement('small'); basis.className = 'traffic-basis';
  if (filled && isTraffic(op, filled)) {
    basis.textContent = filled.basis === 'census' ? `Counted in the ${filled.year} traffic census.`
      : uncounted ? `Not counted: a guess for ${uncounted.what}. Change it to what you expect.`
      : interval ? `Not counted in the traffic census: the average class ${averaged} road is assumed.` : `A new road: the average class ${averaged} road is assumed.`;
    basis.title = filled.basis === 'census' ? `ŘSD traffic census ${filled.year}, section ${filled.section}. Change it if you expect otherwise.`
      : averaged === cls ? 'Average of all roads of this class in the 2025 traffic census (ŘSD). Change it to what you expect.'
      : `The traffic census (ŘSD) counts class I–III roads only. For ${uncounted?.what ?? 'this road'} the game guesses low (a residential zone is recommended up to 500 vehicles a day, TP 132). Change it to what you expect.`;
    form.append(basis);
  }
  for (const f of fields) f.onchange = apply;
  form.onsubmit = e => { e.preventDefault(); apply(); };
  }
  const remove = document.createElement('button'); remove.type = 'button'; remove.id = 'remove-route';
  remove.textContent = route.source ? `Keep the ${old}` : rail ? 'Remove railway' : 'Remove road';
  remove.onclick = () => {
    if (deps.inTransaction()) return;
    const mission = deps.missionRouteId();
    try { deps.deleteRoute(route.id); }
    catch { toast(rail ? 'Another railway joins this one: remove that railway first.' : 'Another road joins this one: remove that road first.'); return; }
    if (mission) deps.switchRoute(mission);
    toast(route.source ? `The ${old} is kept.` : rail ? 'Railway removed.' : 'Road removed.', 'Undo', () => deps.undo());
  };
  // what replacing the old stretch adds to this road's own price (C1 b)
  // (a line that rounds to 0.0 M stays in the bill, not on the card)
  const works = projectFull?.works.items.filter(w => w.owner.kind === 'route' && w.owner.id === route.id && w.label && (Math.abs(w.cost) >= 5e4 || w.id.includes(':kept:'))) ?? [];
  const list = document.createElement('ul'); list.className = 'route-works';
  for (const w of works) {
    const li = document.createElement('li'), label = document.createElement('span'), cost = document.createElement('b');
    // (what stays on the old road costs nothing: no amount)
    label.textContent = w.label!; cost.textContent = w.cost ? `${(w.cost / 1e6).toFixed(w.cost < 1e7 ? 1 : 0)} M CZK` : '';
    li.append(label, cost);
    if (w.at) li.onclick = () => { deps.flyTo(w.at!.x, w.at!.y, 700); };
    list.append(li);
  }
  // each end that joins a road: its junction, Auto (a priority T) or a roundabout — plain choices
  const junctions = document.createElement('div'); junctions.className = 'route-junctions';
  if (!rail && !route.source && route.alignment.kind === 'pi') for (const end of ['a', 'b'] as const) {
    const anchor: Anchor = route.endpoints[end].anchor;
    const cls: string | undefined = anchor.kind === 'source' ? transportIndex?.source(anchor.location.sourceId)?.tags.highway : anchor.kind === 'route' ? 'designed' : undefined;
    if (!cls || ROAD_CLASSES[cls]?.noAtGrade) continue;
    const row = document.createElement('div'); row.className = 'ctx-row';
    const label = document.createElement('span'); label.textContent = end === 'a' ? 'Start junction' : 'End junction';
    const choice = document.createElement('div'); choice.className = 'seg choice';
    const current = route.alignment.controls.junctionForms?.[end];
    const options: [string, 'roundabout' | undefined, string][] = [['Auto', undefined, 'A priority T junction (research/29)']];
    if (cls === 'designed' || ROUNDABOUT_HOSTS.includes(cls)) options.push(['Roundabout', 'roundabout', `A roundabout, ${Math.round(ENDPOINT_JUNCTIONS.roundabout.cost / 1e6)} M CZK plus its ring's land (ŘSD awards, research/08)`]);
    if (options.length < 2) continue;
    for (const [text, value, title] of options) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.title = title; b.dataset.end = end;
      b.className = current === value ? 'on' : ''; b.setAttribute('aria-pressed', String(current === value));
      b.onclick = () => {
        if (current === value) return;
        const id = route.id;
        deps.editProject(d => {
          const q = d.routes.find(x => x.id === id); if (!q || q.alignment.kind !== 'pi') return;
          const forms = { ...q.alignment.controls.junctionForms };
          if (value) forms[end] = value; else delete forms[end];
          if (Object.keys(forms).length) q.alignment.controls.junctionForms = forms; else delete q.alignment.controls.junctionForms;
        });
      };
      choice.append(b);
    }
    row.append(label, choice); junctions.append(row);
  }
  // where the line stays on the old road, the old road is kept although a new road could not be built so
  const notes = document.createElement('div'); notes.className = 'route-kept';
  const bends = [...new Set((r.inherited ?? []).flatMap(v => v.pis ?? (v.pi !== undefined ? [v.pi] : [])))].sort((p, q) => p - q);
  if (r.inherited?.length) {
    const text = document.createElement('span');
    text.textContent = `The ${old} is tighter than the norm ${bends.length ? `at bend${bends.length > 1 ? 's' : ''} ` : 'here'}`;
    notes.append(text);
    bends.forEach((i, k) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'link'; b.textContent = String(i + 1);
      b.title = r.inherited!.filter(v => v.pi === i || v.pis?.includes(i)).map(v => v.title).join('; ');
      b.onclick = () => deps.selectBend(i);
      notes.append(b, k + 1 < bends.length ? ', ' : '');
    });
    notes.append(`: kept as it is. Move it off the ${old} and it must meet the norm.`);
  }
  head.append(h, what, ...(notes.childElementCount ? [notes] : []), ...(junctions.childElementCount ? [junctions] : []), ...(works.length ? [list] : []), ...(rail ? [] : [form]), remove);
  return head;
  };
}

/** the active route's card when the road widgets cannot edit it: a proposed change on map geometry */
export function proposalCard(deps: RouteCardDeps): void {
  const route = deps.route(), result = route ? deps.project()?.routes[route.id] : undefined;
  if (!route || deps.editable()) { deps.clear(route ? 'This road has not been checked yet.' : 'Choose a road to inspect.'); return; }
  const root = deps.host(), h = document.createElement('div'), title = document.createElement('b'), close = document.createElement('button');
  root.replaceChildren(); root.className = 'card ctx inspector k-proposal';
  h.className = 'ctx-h'; title.textContent = route.name; close.className = 'x'; close.textContent = '✕'; close.title = 'Close';
  close.onclick = () => { const mission = deps.missionRouteId(); if (mission) deps.switchRoute(mission); };
  h.append(title, close);
  const state = document.createElement('div'); state.className = 'ctx-state'; state.textContent = 'Proposed change · not checked yet';
  const note = document.createElement('p'); note.textContent = 'The old road stays until this change is checked.';
  const length = route.alignment.kind === 'reference' ? route.alignment.path[route.alignment.path.length - 1].s : result?.surface?.points.at(-1)?.s;
  const size = document.createElement('div'); size.className = 'sub'; size.textContent = length ? `${Math.round(length)} m` : '';
  const remove = document.createElement('button'); remove.type = 'button'; remove.id = 'remove-route'; remove.textContent = 'Remove change';
  remove.onclick = () => {
    if (!deps.design().routes.some(r => r.id === route.id) || deps.inTransaction()) return;
    const mission = deps.missionRouteId(); deps.deleteRoute(route.id);
    if (mission && mission !== route.id) deps.switchRoute(mission);
  };
  root.append(h, state, note, size, remove);
}

/** a mapped road in a pack without road links: its card says it cannot be changed here */
export function noLinksCard(host: () => HTMLElement, onClose: () => void): void {
  const root = host(), h = document.createElement('div'), title = document.createElement('b'), close = document.createElement('button');
  root.replaceChildren(); root.className = 'card ctx inspector k-source';
  h.className = 'ctx-h'; title.textContent = 'Road'; close.className = 'x'; close.textContent = '✕'; close.title = 'Close (Esc)'; close.type = 'button';
  close.onclick = onClose; h.append(title, close);
  const p = document.createElement('p'); p.textContent = 'This map’s roads cannot be changed yet: its road links are missing.';
  root.append(h, p);
}
