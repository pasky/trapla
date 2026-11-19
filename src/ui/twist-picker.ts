// The twist screen: after a mission is picked on the start screen (its map downloads meanwhile), that mission's twists
// as toggles with one line each, the default ones on (or the player's last choice there), "All on", Start.
// Kept light: it is part of the start screen's code (src/main.ts), not the game's.
import './scenario-picker.css';
import './twist-picker.css';
import type { ScenarioParams } from '../core/data/scenario';
import { baselineWords, GOAL_SHARE, missionTwists } from '../core/data/twists';
import { twistLine, TWIST_NAMES, TWIST_ORDER, type TwistId } from '../core/twist-words';
import { loadTwistState } from './twist-state';

/** The twists to start with (none where the mission offers none: the screen says so). */
export function pickTwists(scenario: ScenarioParams, saved: boolean): Promise<{ on: TwistId[]; started: boolean }> {
  const presetId = scenario.presetId ?? scenario.id, mission = missionTwists(presetId);
  if (!mission) return noTwists(scenario, saved);
  const offer = TWIST_ORDER.filter(t => mission.offer.includes(t));
  const state = loadTwistState(scenario.id, presetId, offer);
  const terms = { ...mission.terms, maxTravelMin: scenario.maxTravelMin, landmarks: [] };
  const on = new Set(state.on);
  const root = document.createElement('main');
  root.className = 'scenario-picker twist-picker';
  root.setAttribute('aria-labelledby', 'twist-picker-heading');
  root.innerHTML = `<div class="scenario-picker-content"><p class="scenario-picker-brand">Trapla</p>
    <h1 id="twist-picker-heading" tabindex="-1"></h1>
    <p class="scenario-picker-lead">Pick your twists: the challenges on top of a valid design. You can change them later.</p>
    <div class="twist-picker-card"><p class="twist-picker-goal"></p><ul class="twist-picker-list"></ul>
      <div class="scenario-picker-actions"><button type="button" class="twist-start"></button><button type="button" class="scenario-picker-retry twist-all">All on</button><button type="button" class="scenario-picker-retry twist-none">None</button></div></div></div>`;
  root.querySelector('h1')!.textContent = scenario.title;
  // the goal the twists come on top of (the reveal waits for it)
  const goal = (1 - GOAL_SHARE) * mission.startBill, bn = goal >= 1e9;
  root.querySelector('.twist-picker-goal')!.textContent = `Goal: a valid design under ${(goal / (bn ? 1e9 : 1e6)).toLocaleString('en-US', { maximumFractionDigits: bn ? 2 : 0 })} ${bn ? 'bn' : 'M'} CZK, ${Math.round(GOAL_SHARE * 100)} % under ${baselineWords(mission)}.`;
  const list = root.querySelector('ul')!, start = root.querySelector<HTMLButtonElement>('.twist-start')!;
  const draw = () => {
    list.innerHTML = '';
    for (const t of offer) {
      const li = document.createElement('li'), label = document.createElement('label'), box = document.createElement('input');
      box.type = 'checkbox'; box.checked = on.has(t); box.dataset.t = t;
      box.addEventListener('change', () => { if (box.checked) on.add(t); else on.delete(t); draw(); });
      const name = document.createElement('b'); name.textContent = TWIST_NAMES[t];
      const line = document.createElement('small'); line.textContent = twistLine(t, terms);
      label.append(box, name, line); li.append(label); list.append(li);
      if (on.has(t)) li.classList.add('on');
    }
    start.textContent = on.has('scratch') && saved ? 'Start from scratch' : saved ? 'Continue' : 'Start';
  };
  draw();
  document.body.append(root);
  root.querySelector<HTMLElement>('h1')!.focus();
  return new Promise((resolve) => {
    start.addEventListener('click', () => { root.remove(); resolve({ on: offer.filter(t => on.has(t)), started: true }); });
    root.querySelector<HTMLButtonElement>('.twist-all')!.addEventListener('click', () => { for (const t of offer) on.add(t); draw(); });
    root.querySelector<HTMLButtonElement>('.twist-none')!.addEventListener('click', () => { on.clear(); draw(); });
  });
}

/** A mission without twists: one plain line and Start, so the screen is never empty. */
function noTwists(scenario: ScenarioParams, saved: boolean): Promise<{ on: TwistId[]; started: boolean }> {
  const root = document.createElement('main');
  root.className = 'scenario-picker twist-picker';
  root.setAttribute('aria-labelledby', 'twist-picker-heading');
  root.innerHTML = `<div class="scenario-picker-content"><p class="scenario-picker-brand">Trapla</p>
    <h1 id="twist-picker-heading" tabindex="-1"></h1>
    <div class="twist-picker-card"><p class="twist-picker-goal">No twists on this mission yet: build a valid design, as cheap as you can.</p>
      <div class="scenario-picker-actions"><button type="button" class="twist-start"></button></div></div></div>`;
  root.querySelector('h1')!.textContent = scenario.title;
  const start = root.querySelector<HTMLButtonElement>('.twist-start')!;
  start.textContent = saved ? 'Continue' : 'Start';
  document.body.append(root);
  root.querySelector<HTMLElement>('h1')!.focus();
  return new Promise((resolve) => start.addEventListener('click', () => { root.remove(); resolve({ on: [], started: true }); }));
}
