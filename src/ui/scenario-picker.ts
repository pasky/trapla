import './scenario-picker.css';
import { PRESETS, SCENARIOS, type ScenarioParams } from '../core/data/scenario';
import { hasProjectSave } from '../project-store-contract';
import { megabytes, packBase, PACKS, speculate } from '../packs';

export interface ScenarioPickerOptions {
  /** Supplied by the project store: the picker never invents a project storage key. */
  hasSaved?: (scenarioId: string, presetId: string) => boolean;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

/** Check actual files, not just a directory or Vite's HTML fallback for missing assets. */
export async function scenarioAvailable(id: string): Promise<boolean> {
  const base = packBase(id);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${base}/meta.json`, { signal: controller.signal });
    if (!response.ok) return false;
    const meta = await response.json();
    // New builders invalidate this marker before touching any output, and publish it last.
    // Legacy D11 deliberately keeps its original pack format/fingerprint.
    if (id !== 'd11') {
      const readyResponse = await fetch(`${base}/ready.json`, { signal: controller.signal, cache: 'no-store' });
      if (!readyResponse.ok) return false;
      const ready = await readyResponse.json();
      if (ready.id !== id || ready.ready !== true) return false;
    }
    if (meta.id !== id || !Number.isInteger(meta.nx) || !Number.isInteger(meta.ny)
      || meta.nx <= 0 || meta.ny <= 0 || !meta.heights?.file || !meta.landcover?.file) return false;
    const files = [meta.heights.file, meta.landcover.file, 'overlays.json',
      meta.ground?.file, meta.watercourses?.file, meta.vector?.file, meta.transport?.file].filter(Boolean) as string[];
    return (await Promise.all(files.map(async (file) => {
      if (!/^[a-zA-Z0-9_.-]+$/.test(file)) return false;
      const r = await fetch(`${base}/${file}`, { method: 'HEAD', signal: controller.signal });
      return r.ok && !r.headers.get('content-type')?.includes('text/html');
    }))).every(Boolean);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** A built site has exactly the packs of its manifest (checked when it was built); in dev a pack may be built,
 *  rebuilt or missing while the page is open, so its files are checked. */
const available = (id: string): Promise<boolean> => import.meta.env.PROD ? Promise.resolve(!!PACKS[id]) : scenarioAvailable(id);

/** The line a new design starts from (A, its bends, B) in km, from the pack's ends; null without them. */
export function missionKm(scenario: ScenarioParams): number | null {
  const pack = PACKS[scenario.id];
  const a = scenario.ports?.a.xy ?? pack?.a, b = scenario.ports?.b.xy ?? pack?.b;
  if (!a || !b) return null;
  const pts = [a, ...(scenario.initial?.pis ?? []).map(p => [p.x, p.y] as [number, number]), b];
  let m = 0;
  for (let i = 1; i < pts.length; i++) m += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return m / 1000;
}
const kmText = (km: number) => `${km < 10 ? km.toFixed(1).replace(/\.0$/, '') : Math.round(km)} km`;
/** "Motorway · 4.5 km" */
export function kindLine(scenario: ScenarioParams): string {
  const km = missionKm(scenario);
  return [scenario.picker?.kind ?? 'Class I road', km === null ? null : kmText(km)].filter(Boolean).join(' · ');
}
const loadSize = (scenario: ScenarioParams) => PACKS[scenario.id] ? megabytes(PACKS[scenario.id].startupBytes) : '';

/** a built site may carry only some packs (docs/deploy.md); in dev every mission is offered, built or not */
const onThisSite = (scenario: ScenarioParams) => !import.meta.env.PROD || !!PACKS[scenario.id];

/** Where the start screen puts each mission: the one offered first (if its map is on the site), one card per corridor (its sections as
 * choices, the whole route last) or per mission, and the retired missions that have a save. */
export interface PickerLayout {
  startHere: ScenarioParams | null;
  cards: { group?: string; presets: ScenarioParams[] }[];
  older: ScenarioParams[];
}
export function pickerLayout(presets: readonly ScenarioParams[], isSaved: (scenario: ScenarioParams) => boolean,
  onSite: (scenario: ScenarioParams) => boolean = () => true): PickerLayout {
  const layout: PickerLayout = { startHere: null, cards: [], older: [] };
  for (const scenario of presets) {
    if (scenario.retired) { if (isSaved(scenario)) layout.older.push(scenario); continue; }
    if (scenario.picker?.startHere && !layout.startHere && onSite(scenario)) layout.startHere = scenario;
    const card = scenario.picker?.section ? layout.cards.find(c => c.group !== undefined && c.group === scenario.group) : undefined;
    if (card) card.presets.push(scenario);
    else layout.cards.push({ group: scenario.picker?.section ? scenario.group : undefined, presets: [scenario] });
  }
  for (const card of layout.cards) {
    const whole = (p: ScenarioParams) => /^Whole/.test(p.picker?.section ?? '') ? 1 : 0;
    card.presets.sort((p, q) => whole(p) - whole(q)); // stable: PRESETS order otherwise
  }
  // a mission with a warning (the real road already in the ground) goes last
  layout.cards.sort((c, d) => (c.presets[0].picker?.aside ? 1 : 0) - (d.presets[0].picker?.aside ? 1 : 0));
  return layout;
}

/** what each corridor card is called */
const CORRIDOR: Record<string, string> = { 'Středočeská D3': 'The D3 south of Prague', D35: 'The D35 to Mohelnice', Trutnov: 'Trutnov → Polish border' };

/** Root shows the catalogue. A valid direct link bypasses it, including reproducible D11 scripts.
 * Missing packs stay here with a build instruction instead of starting a broken terrain view.
 * Continue is advisory only: loading/migration and save protection belong to the store.
 */
export interface PickedScenario { scenarioId: string; presetId: string | null }
export async function pickScenario(options: ScenarioPickerOptions = {}): Promise<PickedScenario> {
  const params = new URLSearchParams(location.search), requested = params.get('scenario');
  const requestedPreset = params.get('preset');
  const known = requested && Object.hasOwn(SCENARIOS, requested)
    && (!requestedPreset || PRESETS.some(p => p.id === requested && (p.presetId ?? p.id) === requestedPreset));
  if (known && await available(requested)) return { scenarioId: requested, presetId: requestedPreset };
  const root = element('main', '', 'scenario-picker');
  root.setAttribute('aria-labelledby', 'scenario-picker-heading');
  const content = element('div', '', 'scenario-picker-content');
  const heading = element('h1', 'Design roads and railways on real terrain');
  heading.id = 'scenario-picker-heading';
  content.append(element('p', 'Trapla', 'scenario-picker-brand'), heading,
    element('p', 'Lead roads, motorways and railways through real Czech hills: bridge the valleys, keep them safe, and build them as cheap as you can.', 'scenario-picker-lead'));
  if (requested) content.append(element('p', import.meta.env.PROD ? 'That place is not on this site. Choose another.'
    : 'That place is not ready. Choose another or build its map.', 'scenario-picker-notice'));
  root.append(content);
  document.body.append(root);
  const status = document.getElementById('status');
  if (status) status.style.display = 'none';
  heading.tabIndex = -1;
  heading.focus();
  const isSaved = (scenario: ScenarioParams) => saved(options, scenario);
  return new Promise((resolve) => {
    const open = (scenario: ScenarioParams) => {
      const url = new URL(location.href);
      url.searchParams.set('scenario', scenario.id);
      // The road exercise keeps its plain link; other missions on the same map name their preset.
      if (scenario === SCENARIOS[scenario.id]) url.searchParams.delete('preset');
      else url.searchParams.set('preset', scenario.presetId ?? scenario.id);
      history.replaceState(null, '', url);
      root.remove();
      resolve({ scenarioId: scenario.id, presetId: scenario === SCENARIOS[scenario.id] ? null : scenario.presetId ?? null });
    };
    const layout = pickerLayout(PRESETS, isSaved, onThisSite);
    // A first visit (no design saved anywhere) most likely starts the mission offered first: its map downloads
    // while the visitor reads (stopped if another one is picked, main.ts).
    const firstVisit = !PRESETS.some(isSaved);
    if (layout.startHere && firstVisit && !requested) {
      const id = layout.startHere.id, go = () => { void available(id).then((ok) => { if (ok && root.isConnected) speculate(id); }); };
      if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 300);
    }
    if (layout.startHere) {
      const section = element('section', '', 'scenario-picker-group scenario-picker-first');
      section.append(element('h2', 'Start here'));
      const card = missionCard([layout.startHere], isSaved, open, layout.startHere.title);
      card.dataset.startHere = '';
      section.append(card);
      content.append(section);
    }
    const more = element('section', '', 'scenario-picker-group');
    const grid = element('div', '', 'scenario-picker-grid');
    more.append(element('h2', layout.startHere ? 'More places' : 'Places'), grid);
    content.append(more);
    for (const { group, presets } of layout.cards)
      grid.append(missionCard(presets, isSaved, open, group ? CORRIDOR[group] ?? group : presets[0].title));
    if (layout.older.length) {
      const older = element('section', '', 'scenario-picker-older');
      older.append(element('h2', 'Your older saves'));
      const list = element('ul');
      for (const scenario of layout.older) {
        const item = element('li');
        const button = element('button', 'Continue', 'scenario-picker-retry');
        button.type = 'button';
        button.addEventListener('click', () => open(scenario));
        item.append(element('span', `${scenario.title}`), button);
        if (!onThisSite(scenario)) { button.disabled = true; item.append(element('span', 'Its map is not on this site.', 'scenario-picker-kind')); }
        list.append(item);
      }
      older.append(element('p', 'Missions no longer offered. Your designs are kept.', 'scenario-picker-kind'), list);
      content.append(older);
    }
    const foot = element('p', '', 'scenario-picker-foot');
    const about = element('a', 'About Trapla and its data');
    about.href = 'about.html';
    foot.append(about);
    content.append(foot);
  });
}

/** One card: a mission, or a corridor whose sections are its choices (`presets` in order). */
function missionCard(presets: ScenarioParams[], isSaved: (s: ScenarioParams) => boolean, open: (s: ScenarioParams) => void, title: string): HTMLElement {
  const card = element('article', '', 'scenario-picker-card');
  const sectioned = presets.length > 1;
  const kind = element('p', '', 'scenario-picker-kind');
  const name = element('h3', title);
  const goal = element('p', '', 'scenario-picker-goal');
  card.append(kind, name);
  const chips = sectioned ? element('div', '', 'scenario-picker-sections') : null;
  if (chips) { chips.setAttribute('role', 'radiogroup'); chips.setAttribute('aria-label', 'Section'); card.append(chips); }
  card.append(goal);
  const aside = presets[0].picker?.aside;
  if (aside) card.append(element('p', aside, 'scenario-picker-note'));
  const note = element('p', '', 'scenario-picker-state');
  note.setAttribute('role', 'status');
  const actions = element('div', '', 'scenario-picker-actions');
  const button = element('button', 'Start');
  button.type = 'button';
  const size = element('span', '', 'scenario-picker-size');
  actions.append(button, size);
  card.append(note, actions);
  const ready = new Map<ScenarioParams, boolean>();
  let chosen = presets.find(isSaved) ?? presets.find(p => p.picker?.startHere) ?? presets[0];
  const chipFor = new Map<ScenarioParams, HTMLButtonElement>();
  const show = () => {
    kind.textContent = kindLine(chosen);
    goal.textContent = chosen.picker?.goal ?? '';
    button.textContent = isSaved(chosen) ? 'Continue' : 'Start';
    const ok = ready.get(chosen);
    button.disabled = ok !== true;
    size.textContent = ok ? loadSize(chosen) : '';
    note.textContent = ok === undefined ? 'Checking map…' : ok ? '' : import.meta.env.PROD ? 'Not on this site.' : 'Map not built. Run this in the project folder:';
    card.querySelector('.scenario-picker-build')?.remove();
    actions.querySelector('.scenario-picker-retry')?.remove();
    if (ok === false && !import.meta.env.PROD) {
      note.after(element('code', `npm run data -- ${chosen.id}`, 'scenario-picker-build'));
      const retry = element('button', 'Check again', 'scenario-picker-retry');
      retry.type = 'button';
      retry.addEventListener('click', () => { void check(chosen); });
      actions.append(retry);
    }
    for (const [p, chip] of chipFor) { chip.setAttribute('aria-checked', String(p === chosen)); chip.classList.toggle('on', p === chosen); }
  };
  const check = async (scenario: ScenarioParams) => {
    ready.delete(scenario); show();
    ready.set(scenario, await available(scenario.id));
    show();
  };
  if (chips) for (const scenario of presets) {
    const chip = element('button', '', 'scenario-picker-section');
    chip.type = 'button';
    chip.setAttribute('role', 'radio');
    const km = missionKm(scenario);
    chip.append(element('b', scenario.picker?.section ?? scenario.title),
      element('small', [km === null ? '' : kmText(km), loadSize(scenario)].filter(Boolean).join(' · ')));
    if (isSaved(scenario)) { chip.title = 'You have a design here'; chip.classList.add('saved'); }
    chip.addEventListener('click', () => { chosen = scenario; show(); });
    chipFor.set(scenario, chip);
    chips!.append(chip);
  }
  button.addEventListener('click', () => open(chosen));
  // a pointer on Start (or the keyboard on it) is a likely click: the map's download starts a moment earlier
  const early = () => { if (ready.get(chosen)) speculate(chosen.id); };
  button.addEventListener('pointerenter', early);
  button.addEventListener('focus', early);
  for (const scenario of presets) void check(scenario);
  show();
  return card;
}

function saved(options: ScenarioPickerOptions, scenario: ScenarioParams): boolean {
  try {
    const presetId = scenario.presetId ?? scenario.id;
    if (options.hasSaved) return options.hasSaved(scenario.id, presetId);
    return hasProjectSave(localStorage, { scenarioId: scenario.id, presetId })
      || localStorage.getItem(`trapla.${scenario.id}.design`) !== null;
  }
  catch { return false; } // Storage disabled: Start still works without deleting anything.
}

/** Reload into the picker; store persistence remains untouched. */
export function addScenariosButton(parent: HTMLElement = document.body): HTMLButtonElement {
  const button = element('button', 'Scenarios', 'scenario-picker-return');
  button.type = 'button';
  button.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.delete('scenario');
    url.searchParams.delete('preset');
    location.assign(url.href);
  });
  parent.append(button);
  return button;
}
