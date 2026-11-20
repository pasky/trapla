// The twist screen: after a mission is picked on the start screen (its map downloads meanwhile), that mission's twists
// as toggle cards in a grid, each with a small picture, its name and a few words (the longer line on hover or focus), the
// default ones marked and on (or the player's last choice there), "All on", "None", Start. A twist the mission cannot ask
// for (Hands off where no listed place is near) shows as a card that says why.
// Kept light: it is part of the start screen's code (src/main.ts), not the game's.
import './scenario-picker.css';
import './twist-picker.css';
import type { ScenarioParams } from '../core/data/scenario';
import { baselineWords, GOAL_SHARE, LANDMARK_RING, missionDefaults, missionTwists, SETTING_RING, type InPlay, type MissionTwists } from '../core/data/twists';
import { landmarkWords, OFF_AT_FIRST, twistLine, twistShort, TWIST_NAMES, TWIST_ORDER, type TwistId } from '../core/twist-words';
import { loadTwistState } from './twist-state';
import { twistArt } from './twist-art';
import { validHeritageData, zoneRings } from '../core/heritage';
import { packBase, PACKS } from '../packs';
import { peekPackFile } from '../pack-fetch';

const ringOf = (p: InPlay) => p.kind === 'zone' ? 0 : (p.setting ? SETTING_RING : LANDMARK_RING)[p.kind];
/** Hands off in a few words (the card) and in full (hover, focus, a screen reader): the landmarks the mission names */
function landmarksWords(m: MissionTwists): { short: string; long: string } {
  if (!m.offer.includes('landmarks')) return { short: 'No listed place near enough', long: m.noLandmarks ?? '' };
  const named = m.inPlay ?? [];
  const short = named.length === 1 ? (named[0].kind === 'zone' ? `${named[0].name.replace(/ (village |town |castle )?protection zone$/, '')} heritage area` : `${named[0].name.replace(/,.*$/, '')} · ${ringOf(named[0]).toLocaleString('en-US')} m`)
    : `${named.length} listed places`;
  return { short, long: `${twistLine('landmarks', { maxTravelMin: 0, landmarks: [] })} Here: ${named.map(p => landmarkWords({ ...p, ring: ringOf(p) })).join('; ')}. Other listed places near the line keep their own rings.` };
}
/** A small map of the mission: the planned line from A to B and the places Hands off names (their rings, the areas), from
 * the pack's heritage.json as the start screen fetches it; null where the pack has no ends or no file. */
async function missionMap(scenario: ScenarioParams, m: MissionTwists): Promise<string | null> {
  const pack = PACKS[scenario.id], ends = scenario.ports ? [scenario.ports.a.xy, scenario.ports.b.xy] : [pack?.a, pack?.b];
  if (!pack || !ends[0] || !ends[1]) return null;
  const line: [number, number][] = [ends[0], ...(scenario.initial?.pis ?? []).map(p => [p.x, p.y] as [number, number]), ends[1]];
  const shapes: { circle?: [number, number, number]; rings?: [number, number][][] }[] = [];
  if (pack.files['heritage.json']) {
    const data: unknown = JSON.parse(new TextDecoder().decode(await peekPackFile(`${packBase(scenario.id)}/heritage.json`, pack.files['heritage.json'])));
    if (!validHeritageData(data)) return null;
    for (const p of m.inPlay ?? []) {
      const mon = data.monuments.find(x => x.code === p.code), zone = data.zones.find(z => z.code === p.code);
      if (mon) shapes.push({ circle: [mon.x, mon.y, ringOf(p)] });
      else if (zone) shapes.push({ rings: zoneRings(zone) });
    }
    // (where Hands off asks nothing: the heritage areas, to show how far off they are)
    if (!m.offer.includes('landmarks')) for (const z of data.zones) shapes.push({ rings: zoneRings(z) });
  }
  // the view: the line and the rings (a zone by its part nearest the line: a protection zone may run off far)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const [x, y] of line) grow(x, y);
  for (const s of shapes) if (s.circle) { grow(s.circle[0] - s.circle[2], s.circle[1] - s.circle[2]); grow(s.circle[0] + s.circle[2], s.circle[1] + s.circle[2]); }
  // (an area that comes within 1.5 km of the line's bends: all of it, to see how far off it is)
  for (const s of shapes) if (s.rings?.some(r => r.some(([x, y]) => line.some(([lx, ly]) => Math.hypot(lx - x, ly - y) < 1500)))) for (const r of s.rings) for (const [x, y] of r) grow(x, y);
  // (a wide route fills 240 × 120, a tall one keeps its shape down to a square)
  const H = 120, W = Math.round(Math.max(H, Math.min(2 * H, H * (x1 - x0) / Math.max(1, y1 - y0))));
  const span = Math.max((x1 - x0) / W, (y1 - y0) / H) * 1.16, k = 1 / span, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // (north up: the pack's y grows north)
  const X = (x: number) => ((x - cx) * k + W / 2).toFixed(1), Y = (y: number) => (H / 2 - (y - cy) * k).toFixed(1);
  const zones = shapes.filter(s => s.rings).map(s => `<path d="${s.rings!.map(r => `M${r.map(([x, y]) => `${X(x)} ${Y(y)}`).join('L')}Z`).join('')}" fill="rgba(122,74,154,0.22)" fill-rule="evenodd" stroke="#7a4a9a" stroke-width="1.2" stroke-dasharray="4 3"/>`).join('');
  const rings = shapes.flatMap(s => s.circle ? [s.circle] : []).map(([x, y, r]) => `<circle class="tw-map-ring" cx="${X(x)}" cy="${Y(y)}" r="${Math.max(4, r * k).toFixed(1)}" fill="rgba(122,74,154,0.14)" stroke="#7a4a9a" stroke-width="1.5" stroke-dasharray="4 3"/><circle cx="${X(x)}" cy="${Y(y)}" r="2" fill="#7a4a9a"/>`).join('');
  // (the bends rounded: from the middle of one leg to the next's, through the bend)
  const mid = (a: [number, number], b: [number, number]) => `${X((a[0] + b[0]) / 2)} ${Y((a[1] + b[1]) / 2)}`;
  const road = `M${X(line[0][0])} ${Y(line[0][1])}` + line.slice(1, -1).map((p, i) => `L${mid(line[i], p)}Q${X(p[0])} ${Y(p[1])} ${mid(p, line[i + 2])}`).join('')
    + `L${X(line[line.length - 1][0])} ${Y(line[line.length - 1][1])}`;
  const end = (p: [number, number], t: string) => `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="7" fill="#fffefa" stroke="#3e4a45" stroke-width="1.5"/><text x="${X(p[0])}" y="${(Number(Y(p[1])) + 3.5).toFixed(1)}" font-size="9" font-weight="700" text-anchor="middle" fill="#3e4a45" font-family="system-ui, sans-serif">${t}</text>`;
  return `<svg class="tw-map" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="The planned line from A to B${shapes.length ? m.offer.includes('landmarks') ? ' and the listed places Hands off names' : ' and the heritage areas near it' : ''}">
    <defs><clipPath id="tw-map-clip"><rect width="${W}" height="${H}" rx="8"/></clipPath></defs><rect width="${W}" height="${H}" rx="8" fill="#edf0e9"/><g clip-path="url(#tw-map-clip)">${zones}${rings}
    <path d="${road}" fill="none" stroke="#3e4a45" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></g>
    ${end(line[0], 'A')}${end(line[line.length - 1], 'B')}</svg>`;
}
const CHECK = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M3 8.5 L6.5 12 L13 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The twists to start with; null where the mission offers none and the player continues a design there (or the mission is
 * retired): a new start on a mission without twists says so on the screen. */
export function pickTwists(scenario: ScenarioParams, saved: boolean): Promise<{ on: TwistId[]; started: boolean }> | null {
  const presetId = scenario.presetId ?? scenario.id, mission = missionTwists(presetId);
  if (!mission) return saved || scenario.retired ? null : noTwists(scenario);
  // (a pack built without its listed places: the game would drop Hands off, so the screen does not offer it)
  const noHeritage = !!PACKS[scenario.id] && !PACKS[scenario.id].files['heritage.json'] && mission.offer.includes('landmarks');
  const offer = TWIST_ORDER.filter(t => mission.offer.includes(t) && !(noHeritage && t === 'landmarks'));
  // (the cards: what is offered, and Hands off where the mission says why not)
  const cards = TWIST_ORDER.filter(t => offer.includes(t) || (t === 'landmarks' && (!!mission.noLandmarks || noHeritage)));
  const defaults = missionDefaults(mission), state = loadTwistState(scenario.id, presetId, offer, defaults);
  const terms = { ...mission.terms, maxTravelMin: scenario.maxTravelMin, landmarks: [] };
  const landmarks = noHeritage ? { short: 'Not on this map yet', long: 'This mission’s map was built without its listed places.' } : landmarksWords(mission);
  const on = new Set(state.on);
  const root = document.createElement('main');
  root.className = 'scenario-picker twist-picker';
  root.setAttribute('aria-labelledby', 'twist-picker-heading');
  root.innerHTML = `<div class="scenario-picker-content"><p class="scenario-picker-brand">Trapla</p>
    <h1 id="twist-picker-heading" tabindex="-1"></h1>
    <p class="scenario-picker-lead">Pick your twists: the challenges on top of a valid design. You can change them later.</p>
    <div class="twist-picker-card"><p class="twist-picker-goal"></p>
      <fieldset class="twist-picker-set"><legend class="tw-hidden">Twists</legend><ul class="twist-picker-list"></ul></fieldset>
      <div class="twist-picker-foot"><div><p class="twist-picker-detail" aria-hidden="true"></p>
      <div class="scenario-picker-actions"><button type="button" class="twist-start"></button><button type="button" class="scenario-picker-retry twist-all">All on</button><button type="button" class="scenario-picker-retry twist-none">None</button></div></div><div class="twist-picker-map"></div></div></div></div>`;
  root.querySelector('h1')!.textContent = scenario.title;
  // (the map of the mission, when its listed places have come)
  void missionMap(scenario, mission).then(svg => { if (svg) root.querySelector('.twist-picker-map')!.innerHTML = svg; }).catch(() => { /* no map: the cards say it all */ });
  // the goal the twists come on top of (the reveal waits for it)
  const goal = (1 - GOAL_SHARE) * mission.startBill, bn = goal >= 1e9;
  root.querySelector('.twist-picker-goal')!.textContent = `Goal: a valid design under ${(goal / (bn ? 1e9 : 1e6)).toLocaleString('en-US', { maximumFractionDigits: bn ? 2 : 0 })} ${bn ? 'bn' : 'M'} CZK, ${Math.round(GOAL_SHARE * 100)} % under ${baselineWords(mission)}.`;
  const list = root.querySelector('ul')!, start = root.querySelector<HTMLButtonElement>('.twist-start')!;
  const detail = root.querySelector<HTMLElement>('.twist-picker-detail')!;
  const longOf = (t: TwistId) => `${t === 'landmarks' ? landmarks.long : twistLine(t, terms)}${mission.notDefault?.includes(t) ? ` ${OFF_AT_FIRST}` : ''}`;
  // one card per twist; built once, its state kept in step (the focus stays where it is)
  const boxes = new Map<TwistId, HTMLInputElement>();
  for (const t of cards) {
    const li = document.createElement('li'), label = document.createElement('label'), box = document.createElement('input');
    const here = offer.includes(t);
    label.className = `tw-card${here ? '' : ' unavailable'}`;
    label.dataset.t = t;
    box.type = 'checkbox'; box.dataset.t = t; box.className = 'tw-box';
    // (one the mission cannot ask for stays focusable, so its reason can be read: it just does not turn on)
    if (!here) { box.setAttribute('aria-disabled', 'true'); box.addEventListener('click', (e) => e.preventDefault()); }
    box.setAttribute('aria-describedby', `tw-desc-${t}`);
    box.addEventListener('change', () => { if (box.checked) on.add(t); else on.delete(t); sync(); });
    const name = document.createElement('b'); name.textContent = TWIST_NAMES[t];
    const line = document.createElement('small'); line.textContent = t === 'landmarks' ? landmarks.short : twistShort(t, terms);
    const desc = document.createElement('span'); desc.id = `tw-desc-${t}`; desc.hidden = true; desc.textContent = longOf(t);
    label.insertAdjacentHTML('beforeend', `<span class="tw-check" aria-hidden="true">${CHECK}</span>${defaults.includes(t) ? '<span class="tw-default">Default</span>' : ''}${twistArt(t)}`);
    label.prepend(box); label.append(name, line, desc);
    const tell = () => { detail.textContent = `${TWIST_NAMES[t]}: ${longOf(t)}`; };
    label.addEventListener('pointerenter', tell); box.addEventListener('focus', tell);
    li.append(label); list.append(li); boxes.set(t, box);
  }
  // (the pointer gone: the line of the card that has the focus, if one has)
  list.addEventListener('pointerleave', () => {
    const t = (document.activeElement as HTMLElement | null)?.dataset?.t as TwistId | undefined;
    detail.textContent = t && list.contains(document.activeElement) ? `${TWIST_NAMES[t]}: ${longOf(t)}` : '';
  });
  const sync = () => {
    for (const [t, box] of boxes) { box.checked = on.has(t); box.closest('label')!.classList.toggle('on', on.has(t)); }
    start.textContent = on.has('scratch') && saved ? 'Start from scratch' : saved ? 'Continue' : 'Start';
  };
  sync();
  document.body.append(root);
  root.querySelector<HTMLElement>('h1')!.focus();
  return new Promise((resolve) => {
    start.addEventListener('click', () => { root.remove(); resolve({ on: offer.filter(t => on.has(t)), started: true }); });
    root.querySelector<HTMLButtonElement>('.twist-all')!.addEventListener('click', () => { for (const t of offer) on.add(t); sync(); });
    root.querySelector<HTMLButtonElement>('.twist-none')!.addEventListener('click', () => { on.clear(); sync(); });
  });
}

/** A mission without twists: one plain line and Start, so the screen is never empty. */
function noTwists(scenario: ScenarioParams): Promise<{ on: TwistId[]; started: boolean }> {
  const root = document.createElement('main');
  root.className = 'scenario-picker twist-picker';
  root.setAttribute('aria-labelledby', 'twist-picker-heading');
  root.innerHTML = `<div class="scenario-picker-content"><p class="scenario-picker-brand">Trapla</p>
    <h1 id="twist-picker-heading" tabindex="-1"></h1>
    <div class="twist-picker-card"><p class="twist-picker-goal">No twists on this mission yet: build a valid design, as cheap as you can.</p>
      <div class="scenario-picker-actions"><button type="button" class="twist-start"></button></div></div></div>`;
  root.querySelector('h1')!.textContent = scenario.title;
  const start = root.querySelector<HTMLButtonElement>('.twist-start')!;
  start.textContent = 'Start';
  document.body.append(root);
  root.querySelector<HTMLElement>('h1')!.focus();
  return new Promise((resolve) => start.addEventListener('click', () => { root.remove(); resolve({ on: [], started: true }); }));
}
