import './scenario-picker.css';
import { PRESETS, SCENARIOS, type ScenarioParams } from '../core/data/scenario';
import { hasProjectSave } from '../project-store-contract';

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
  const base = `${import.meta.env.BASE_URL}scenarios/${id}`;
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
  if (known && await scenarioAvailable(requested)) return { scenarioId: requested, presetId: requestedPreset };
  const root = element('main', '', 'scenario-picker');
  root.setAttribute('aria-labelledby', 'scenario-picker-heading');
  const content = element('div', '', 'scenario-picker-content');
  const heading = element('h1', 'Choose a place');
  heading.id = 'scenario-picker-heading';
  content.append(element('p', 'Trapla', 'scenario-picker-brand'), heading,
    element('p', 'Build a cheaper road. Keep it safe.', 'scenario-picker-lead'));
  if (requested) content.append(element('p', 'That place is not ready. Choose another or build its map.', 'scenario-picker-notice'));
  root.append(content);
  document.body.append(root);
  const status = document.getElementById('status');
  if (status) status.style.display = 'none';
  heading.tabIndex = -1;
  heading.focus();
  return new Promise((resolve) => {
    for (const { group, presets } of pickerGroups(PRESETS, (scenario) => saved(options, scenario))) {
      const grid = element('div', '', 'scenario-picker-grid');
      if (group) {
        const section = element('section', '', 'scenario-picker-group');
        section.append(element('h2', group), grid);
        content.append(section);
      } else content.append(grid);
      for (const scenario of presets) {
        const card = element('article', '', 'scenario-picker-card');
        const details = scenario.picker;
        card.append(element('p', details?.kind ?? 'Class I road', 'scenario-picker-kind'),
          element(group ? 'h3' : 'h2', scenario.title), element('p', details?.goal ?? 'Connect Trutnov to the Polish border.'));
        if (details?.note) card.append(element('p', details.note, 'scenario-picker-note'));
        const note = element('p', 'Checking map…', 'scenario-picker-state');
        note.setAttribute('role', 'status');
        const actions = element('div', '', 'scenario-picker-actions');
        const button = element('button', saved(options, scenario) ? 'Continue' : 'Start');
        button.type = 'button';
        button.disabled = true;
        button.addEventListener('click', () => {
          const url = new URL(location.href);
          url.searchParams.set('scenario', scenario.id);
          // The road exercise keeps its plain link; other missions on the same map name their preset.
          if (scenario === SCENARIOS[scenario.id]) url.searchParams.delete('preset');
          else url.searchParams.set('preset', scenario.presetId ?? scenario.id);
          history.replaceState(null, '', url);
          root.remove();
          resolve({ scenarioId: scenario.id, presetId: scenario === SCENARIOS[scenario.id] ? null : scenario.presetId ?? null });
        });
        actions.append(button);
        card.append(note, actions);
        grid.append(card);
        const check = async () => {
          button.disabled = true;
          note.textContent = 'Checking map…';
          const available = await scenarioAvailable(scenario.id);
          button.disabled = !available;
          note.textContent = available ? '' : 'Map not built. Run this in the project folder:';
          card.querySelector('.scenario-picker-build')?.remove();
          actions.querySelector('.scenario-picker-retry')?.remove();
          if (!available) {
            const command = element('code', `npm run data -- ${scenario.id}`, 'scenario-picker-build');
            note.after(command);
            const retry = element('button', 'Check again', 'scenario-picker-retry');
            retry.type = 'button';
            retry.addEventListener('click', () => { void check(); });
            actions.append(retry);
          }
        };
        void check();
      }
    }
  });
}

/** Picker cards in PRESETS order; consecutive presets of one corridor share a heading. A retired mission
 * only appears to continue an existing save. */
export function pickerGroups(presets: readonly ScenarioParams[], isSaved: (scenario: ScenarioParams) => boolean) {
  const groups: { group?: string; presets: ScenarioParams[] }[] = [];
  for (const scenario of presets) {
    if (scenario.retired && !isSaved(scenario)) continue;
    const last = groups[groups.length - 1];
    if (last && last.group === scenario.group) last.presets.push(scenario);
    else groups.push({ group: scenario.group, presets: [scenario] });
  }
  return groups;
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
