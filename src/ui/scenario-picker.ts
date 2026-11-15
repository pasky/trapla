import './scenario-picker.css';
import { SCENARIOS, type ScenarioParams } from '../core/data/scenario';

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
    if (meta.id !== id || !Number.isInteger(meta.nx) || !Number.isInteger(meta.ny)
      || meta.nx <= 0 || meta.ny <= 0 || !meta.heights?.file || !meta.landcover?.file) return false;
    const files = [meta.heights.file, meta.landcover.file, 'overlays.json',
      meta.ground?.file, meta.watercourses?.file, meta.vector?.file].filter(Boolean) as string[];
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
export async function pickScenario(options: ScenarioPickerOptions = {}): Promise<string> {
  const requested = new URLSearchParams(location.search).get('scenario');
  if (requested && Object.hasOwn(SCENARIOS, requested) && await scenarioAvailable(requested)) return requested;
  const root = element('main', '', 'scenario-picker');
  root.setAttribute('aria-labelledby', 'scenario-picker-heading');
  const content = element('div', '', 'scenario-picker-content');
  const heading = element('h1', 'Choose a place');
  heading.id = 'scenario-picker-heading';
  content.append(element('p', 'Trapla', 'scenario-picker-brand'), heading,
    element('p', 'Build a cheaper road. Keep it safe.', 'scenario-picker-lead'));
  if (requested) content.append(element('p', 'That place is not ready. Choose another or build its map.', 'scenario-picker-notice'));
  const grid = element('div', '', 'scenario-picker-grid');
  content.append(grid);
  root.append(content);
  document.body.append(root);
  const status = document.getElementById('status');
  if (status) status.style.display = 'none';
  heading.tabIndex = -1;
  heading.focus();
  return new Promise((resolve) => {
    for (const scenario of Object.values(SCENARIOS)) {
      const card = element('article', '', 'scenario-picker-card');
      const details = scenario.picker;
      card.append(element('p', details?.kind ?? 'Class I road', 'scenario-picker-kind'),
        element('h2', scenario.title), element('p', details?.goal ?? 'Connect Trutnov to the Polish border.'));
      const note = element('p', 'Checking map…', 'scenario-picker-state');
      note.setAttribute('role', 'status');
      const actions = element('div', '', 'scenario-picker-actions');
      const button = element('button', saved(options, scenario) ? 'Continue' : 'Start');
      button.type = 'button';
      button.disabled = true;
      button.addEventListener('click', () => {
        const url = new URL(location.href);
        url.searchParams.set('scenario', scenario.id);
        history.replaceState(null, '', url);
        root.remove();
        resolve(scenario.id);
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
  });
}

function saved(options: ScenarioPickerOptions, scenario: ScenarioParams): boolean {
  try { return options.hasSaved?.(scenario.id, scenario.presetId ?? scenario.id) ?? false; }
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
