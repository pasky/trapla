// Twists in the game (core/twists.ts, data/twists.ts): which are on (remembered per mission), where they stand after each
// full evaluation (never in a drag preview), the HUD's chip and card, the map's rings and places, the curveballs as they
// arrive and the reveal. The game stays the builder: a twist never changes the bill or validity.
import './twists.css';
import type { ProjectDesign, ProjectResult, RouteId } from '../core/project';
import type { ScenarioParams } from '../core/data/scenario';
import { CATEGORIES } from '../core/data/categories';
import { checkTwists, landmarkName, landmarkShape, landmarkWords, OFF_AT_FIRST, shapeRings, twistFacts, twistLine, TWIST_NAMES, TWIST_ORDER, type Shape, type TwistCheck, type TwistId, type TwistIssue } from '../core/twists';
import { baselineWords, GOAL_SHARE, missionDefaults } from '../core/data/twists';
import { missionTwistSetup, type MissionTwistSetup, type PackFrame } from '../core/mission-twists';
import type { HeritageData } from '../core/heritage';
import { corridorOfRoute } from '../core/project-motorway';
import { legacyDesignForRoute } from '../core/project-legacy';
import { TwistMarks, type TwistMark } from '../render/twist-marks';
import type { View } from '../render/view';
import { czk } from './costgroups';
import { toast } from './toast';
import { loadTwistState, saveTwistState } from './twist-state';

/** at most one curveball per this much play… */
export const CURVEBALL_EVERY_MS = 5 * 60_000;
/** …and per this many edits the player made (a drag counts once) */
export const CURVEBALL_EVERY_EDITS = 8;
/** play: the page is shown and the player did something within this long */
const IDLE_MS = 120_000;

export interface TwistsContext {
  scenario: ScenarioParams;
  presetId: string;
  pack: { meta: { origin?: unknown; nx: number; ny: number; cell: number }; overlays: { buildings: [number, number, number][]; binfo?: (readonly number[] | null)[] }; terrain: { heightAt(x: number, y: number): number };
    heritage: HeritageData | null };
  ends: { a: { x: number; y: number }; b: { x: number; y: number } };
  view: View; overlay: HTMLElement;
  /** the HUD's chip and card body */
  chip: HTMLButtonElement; card: HTMLElement; section: HTMLElement; revealHud: () => void;
  design: () => ProjectDesign;
  subscribe: (fn: (committed: boolean) => void) => void;
  /** start the design again from the straight line A–B (undoable) */
  startFromScratch: () => void;
  /** our road's heights by hand: `fresh`, laid on the ground (a new start); else from what Auto has now */
  setByHand: (on: boolean, fresh: boolean) => void;
  /** a drag (or another edit) is under way: its full results are provisional */
  busy: () => boolean;
  /** show a stretch of our road (select it), or a place */
  showStretch: (routeId: RouteId, s0: number, s1: number) => void;
  showPlace: (x: number, y: number) => void;
  /** paint a bridge or a tunnel over a stretch of our road */
  build: (kind: 'bridge' | 'tunnel', routeId: RouteId, s0: number, s1: number, style?: 'long') => void;
}

const money = (v: number) => czk(v);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function createTwists(app: TwistsContext, choice: { on: TwistId[]; started: boolean } | null) {
  const meta = app.pack.meta, origin = (Array.isArray(meta.origin) ? meta.origin : [0, 0]) as [number, number];
  const frame: PackFrame = { origin, width: meta.nx * meta.cell, height: meta.ny * meta.cell, a: app.ends.a, b: app.ends.b };
  const setup: MissionTwistSetup | undefined = missionTwistSetup(app.presetId, app.scenario, frame, app.pack.heritage);
  if (!setup) { app.chip.hidden = true; app.section.hidden = true; return null; }
  const offer = setup.mission.offer;
  app.section.hidden = false;
  const state = loadTwistState(app.scenario.id, app.presetId, offer, missionDefaults(setup.mission));
  const save = () => saveTwistState(app.scenario.id, app.presetId, state);
  const goal = (1 - GOAL_SHARE) * setup.mission.startBill;
  let last: { result: ProjectResult; checks: TwistCheck[] } | null = null;
  let changing = false;
  const marks = new TwistMarks(app.view, app.overlay, (x, y) => app.pack.terrain.heightAt(x, y));
  marks.onClick = (id) => { app.revealHud(); highlight(id); };

  // ---- play time and edits (the curveballs' pace) ----
  let lastInput = performance.now();
  for (const ev of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true, capture: true });
  let tick = performance.now();
  window.setInterval(() => {
    // (a timer held back while the page was hidden credits no more than its own second)
    const now = performance.now(), dt = Math.min(2000, now - tick); tick = now;
    if (document.visibilityState !== 'visible' || now - lastInput >= IDLE_MS) return;
    const before = state.playMs;
    state.playMs += dt; if (Math.floor(state.playMs / 10_000) !== Math.floor(before / 10_000)) save();
    // the pace's time comes round after its edits: the news may come now, on the design as it stands
    const due = state.firedAtMs + CURVEBALL_EVERY_MS;
    if (before < due && state.playMs >= due && last && !app.busy()) api.afterFull(last.result);
  }, 1000);
  app.subscribe((committed) => { if (committed) { state.editsSince++; save(); } });

  // ---- the twist screen's answer ----
  if (choice) {
    const was = new Set(state.on);
    state.on = choice.on.filter(t => offer.includes(t)); state.chosen = true; save();
    if (choice.started && state.on.includes('scratch') && !(was.has('scratch') && state.scratch)) { state.scratch = true; save(); app.startFromScratch(); }
    if (choice.started && state.on.includes('byHand')) app.setByHand(true, true);
  }

  const ours = (d: ProjectDesign): RouteId[] => {
    const id = d.routes.find(r => r.role === 'mission')?.id; if (!id) return [];
    const c = corridorOfRoute(d, id);
    return [id, c?.children.forward, c?.children.reverse].filter((x, i, a): x is RouteId => !!x && a.indexOf(x) === i);
  };
  const missionDesign = (d: ProjectDesign) => { const id = d.routes.find(r => r.role === 'mission')?.id; try { return id ? legacyDesignForRoute(d, id) : null; } catch { return null; } };
  const fired = () => setup.curveballs.filter(c => state.fired.includes(c.id));

  function evaluateTwists(result: ProjectResult): TwistCheck[] {
    const d = app.design(), legacy = missionDesign(d);
    const home = (j: number) => (app.pack.overlays.binfo?.[j]?.[2] ?? 0) <= 1;
    const at = (j: number) => ({ x: app.pack.overlays.buildings[j][0], y: app.pack.overlays.buildings[j][1] });
    return checkTwists(state.on, twistFacts(result, ours(d), home, at), setup!.terms, {
      manual: legacy?.profileMode === 'manual', scratch: state.scratch, curveballs: fired(), startBill: setup!.mission.startBill,
      deckHalf: legacy ? CATEGORIES[legacy.category].crownWidth / 2 : 7 });
  }

  // ---- the map ----
  /** the landmarks the mission names (data/twists.ts inPlay): named on the map from afar, listed on the card */
  const named = new Set((setup.mission.inPlay ?? []).map(p => p.code));
  // (what the pointer's tip says over each: the same all game, worded once)
  const tips = setup.terms.landmarks.map(landmarkWords);
  let freshId: string | null = null;
  function drawMarks() {
    const broken = new Set((last?.checks ?? []).flatMap(c => c.issues.flatMap(i => i.ref ? [i.ref] : [])));
    const out: TwistMark[] = [];
    if (state.on.includes('landmarks')) for (const [k, l] of setup!.terms.landmarks.entries())
      out.push({ id: `landmark:${k}`, kind: l.rings ? 'heritage' : 'landmark', shape: landmarkShape(l), label: landmarkName(l), state: broken.has(`landmark:${k}`) ? 'broken' : 'ok', at: l,
        tip: tips[k], named: named.has(l.code ?? '') });
    if (state.on.includes('curveballs')) for (const c of fired()) if (c.zone)
      out.push({ id: `curveball:${c.id}`, kind: 'zone', shape: c.zone.shape, label: c.zone.label, state: broken.has(`curveball:${c.id}`) ? 'broken' : 'ok', fresh: freshId === c.id, at: middle(c.zone.shape) });
    marks.set(out);
  }

  // ---- the HUD: chip and card ----
  function render() {
    const on = state.on.filter(t => offer.includes(t));
    app.chip.hidden = false;
    const checks = last?.checks ?? [], met = checks.filter(c => c.met).length;
    if (!on.length) { app.chip.textContent = 'Twists: off'; app.chip.className = 'chip twists'; }
    else if (!last) { app.chip.textContent = `Twists ${on.length}`; app.chip.className = 'chip twists pending'; }
    else { app.chip.textContent = `${met === checks.length ? '✓' : '✗'} Twists ${met}/${checks.length}`; app.chip.className = `chip twists ${met === checks.length ? 'ok' : 'bad'}`; }
    app.chip.title = 'Your twists: the challenges you picked';
    const total = last?.result.cost.total ?? null;
    const goalLine = `<p class="tw-goal">Goal: a valid design under <b>${money(goal)}</b> <small>(${baselineWords(setup!.mission)} less ${Math.round(GOAL_SHARE * 100)} %)</small>${total !== null && last?.result.valid ? ` · yours ${money(total)}` : ''}</p>`;
    const rows = changing ? '' : checks.map(c => `<li class="${c.met ? 'ok' : 'bad'}" data-id="${c.id}"><span class="tw-mark">${c.met ? '✓' : '✗'}</span><div><b>${esc(c.name)}</b> <span class="tw-status">${esc(c.status)}</span>
      ${c.id === 'curveballs' ? newsList() : ''}${c.id === 'landmarks' ? inPlayList() : ''}
      ${c.issues.filter(i => Number.isFinite(i.x) || i.fix).slice(0, 6).map((i, k) => `<div class="tw-issue">${esc(i.text)} ${Number.isFinite(i.x) ? `<button type="button" class="link" data-show="${c.id}:${k}">Show</button>` : ''}${i.fix ? ` <button type="button" class="link" data-fix="${c.id}:${k}">${i.fix.style === 'long' ? 'Long spans over it' : i.fix.kind === 'bridge' ? 'Bridge it' : 'Tunnel it'}</button>` : ''}</div>`).join('')}
      ${c.issues.filter(i => !Number.isFinite(i.x) && !i.fix).slice(0, 2).map(i => `<div class="tw-issue">${esc(i.text)}</div>`).join('')}
      ${!c.met && c.id === 'scratch' ? '<button type="button" class="tw-act" data-act="scratch">Start from the straight line</button>' : ''}</div></li>`).join('');
    const choose = changing ? `<ul class="tw-choose">${TWIST_ORDER.filter(t => offer.includes(t)).map(t => `<li><label><input type="checkbox" data-t="${t}"${state.on.includes(t) ? ' checked' : ''}> <b>${esc(TWIST_NAMES[t])}</b><small>${esc(twistLine(t, setup!.terms))}${setup!.mission.notDefault?.includes(t) ? ` ${esc(OFF_AT_FIRST)}` : ''}</small></label></li>`).join('')}</ul>` : '';
    app.card.innerHTML = `${goalLine}${on.length || changing ? '' : '<p class="tw-none">No twists: just the cheapest valid design.</p>'}<ul class="tw-list">${rows}</ul>${choose}
      <div class="btns"><button type="button" data-act="change">${changing ? 'Done' : 'Change twists'}</button>${state.revealed ? ' <button type="button" data-act="reveal">The real project</button>' : ''}</div>`;
  }
  /** Hands off: the places the mission names, each with its kind and ring (pointing at one draws it stronger on the map) */
  function inPlayList() {
    const rows = [...setup!.terms.landmarks.entries()].filter(([, l]) => named.has(l.code ?? ''));
    return rows.length ? `<ul class="tw-places">${rows.map(([k]) => `<li data-mark="landmark:${k}" tabindex="0">${esc(tips[k])} <button type="button" class="link" data-place="${k}">Show</button></li>`).join('')}</ul>` : '';
  }
  function newsList() {
    const f = fired();
    return f.length ? `<div class="tw-news">${f.map(c => `<div>News: ${esc(c.headline)} <button type="button" class="link" data-news="${c.id}">Show</button></div>`).join('')}</div>` : '';
  }
  const issueAt = (ref: string): TwistIssue | undefined => { const [id, k] = ref.split(':'); return last?.checks.find(c => c.id === id)?.issues.filter(i => Number.isFinite(i.x) || i.fix)[Number(k)]; };
  app.card.addEventListener('click', (e) => {
    const t = e.target as HTMLElement, b = t.closest('button') as HTMLButtonElement | null;
    if (!b) return;
    if (b.dataset.show) { const i = issueAt(b.dataset.show); if (i) show(i); }
    else if (b.dataset.place) { const l = setup!.terms.landmarks[Number(b.dataset.place)]; if (l) app.showPlace(l.x, l.y); }
    else if (b.dataset.fix) { const i = issueAt(b.dataset.fix); if (i?.fix) app.build(i.fix.kind, i.fix.routeId, i.fix.s0, i.fix.s1, i.fix.style); }
    else if (b.dataset.news) { const c = setup!.curveballs.find(x => x.id === b.dataset.news); if (c) newsCard(c, false); }
    else if (b.dataset.act === 'change') { changing = !changing; render(); }
    else if (b.dataset.act === 'reveal') reveal(true);
    else if (b.dataset.act === 'scratch') { state.scratch = true; save(); app.startFromScratch(); }
  });
  app.card.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement, t = input.dataset.t as TwistId | undefined;
    if (!t) return;
    state.on = TWIST_ORDER.filter(x => x === t ? input.checked : state.on.includes(x));
    state.chosen = true; save();
    if (t === 'byHand') app.setByHand(input.checked, false);
    if (t === 'scratch' && input.checked) toast('From scratch counts from a design that begins at the straight line.', 'Start from it', () => { state.scratch = true; save(); app.startFromScratch(); });
    syncAutoButton();
    // (what is met now may already be news-worthy or a win)
    if (last) api.afterFull(last.result); else { drawMarks(); render(); }
  });
  // (a place's row under the pointer or in focus: its ring drawn stronger)
  const hiOf = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>('[data-mark]')?.dataset.mark ?? null;
  app.card.addEventListener('pointerover', (e) => marks.highlight(hiOf(e)));
  app.card.addEventListener('pointerleave', () => marks.highlight(null));
  app.card.addEventListener('focusin', (e) => marks.highlight(hiOf(e)));
  app.card.addEventListener('focusout', () => marks.highlight(null));
  app.chip.addEventListener('click', () => app.revealHud());
  const show = (i: TwistIssue) => { if (i.routeId !== undefined && i.s0 !== undefined) app.showStretch(i.routeId, i.s0, i.s1 ?? i.s0); else app.showPlace(i.x, i.y); };
  function highlight(id: string) {
    if (id.startsWith('curveball:')) { const c = setup!.curveballs.find(x => x.id === id.slice(10)); if (c?.zone) { const m = middle(c.zone.shape); app.showPlace(m.x, m.y); } }
    else { const l = setup!.terms.landmarks[Number(id.split(':')[1])]; if (l) app.showPlace(l.x, l.y); }
  }
  // By hand: the Auto heights button is off while the twist is on
  function syncAutoButton() {
    const auto = document.getElementById('grade-auto') as HTMLButtonElement | null;
    if (!auto) return;
    const off = state.on.includes('byHand');
    auto.disabled = off;
    auto.title = off ? 'Off while the By hand twist is on' : 'The game picks the cheapest legal heights';
  }

  // ---- news from the site ----
  let newsEl: HTMLElement | null = null;
  function newsCard(c: MissionTwistSetup['curveballs'][number], fresh: boolean) {
    newsEl?.remove();
    const el = newsEl = document.createElement('section');
    el.className = `news-card${fresh ? ' fresh' : ''}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<div class="news-kicker">News from the site</div><b class="news-head"></b><p class="news-story"></p><p class="news-ask"></p>
      <div class="news-foot"><a target="_blank" rel="noopener"></a><span><button type="button" class="news-show">Show me</button> <button type="button" class="news-ok">OK</button></span></div>`;
    el.querySelector('.news-head')!.textContent = c.headline;
    el.querySelector('.news-story')!.textContent = c.story;
    el.querySelector('.news-ask')!.textContent = c.zone ? `${c.ask}. It is marked on the map.` : `${c.ask}: ${money(c.budget! * setup!.mission.startBill)}.`;
    // (a game event names the kind of rule it stands for, as plain text; a real event links its source)
    const a = el.querySelector('a')!; a.textContent = c.cite.text;
    if (c.cite.url) a.href = c.cite.url; else a.replaceWith(Object.assign(document.createElement('span'), { className: 'news-source', textContent: c.cite.text }));
    el.querySelector<HTMLButtonElement>('.news-show')!.onclick = () => { if (c.zone) { const m = middle(c.zone.shape); app.showPlace(m.x, m.y); } else app.revealHud(); };
    el.querySelector<HTMLButtonElement>('.news-ok')!.onclick = () => { el.remove(); newsEl = null; if (pendingReveal) { pendingReveal = false; reveal(false); } };
    (document.getElementById('view') ?? document.body).append(el);
  }
  function fire() {
    const next = setup!.curveballs.find(c => !state.fired.includes(c.id));
    if (!next) return false;
    state.fired.push(next.id); state.firedAtMs = state.playMs; state.editsSince = 0; save();
    freshId = next.id;
    newsCard(next, true);
    window.setTimeout(() => { if (freshId === next.id) { freshId = null; drawMarks(); } }, 6000);
    return true;
  }

  // ---- the reveal ----
  /** how long the player's design took against the real one's years (research/96 §8): play time, whole minutes */
  const tookLine = (ms: number, year: number) => {
    const min = Math.max(1, Math.round(ms / 60_000));
    return `Yours took ${min} minute${min === 1 ? '' : 's'}. The real one was in environmental review by ${year}.`;
  };
  let revealEl: HTMLElement | null = null;
  /** the reveal waits while news is on screen */
  let pendingReveal = false;
  function reveal(again: boolean) {
    const r = last?.result, total = r?.cost.total ?? state.revealed?.cost ?? null;
    if (total === null) return;
    if (!again) { state.revealed = { cost: total, on: [...state.on], playMs: state.playMs }; save(); render(); }
    revealEl?.remove();
    const el = revealEl = document.createElement('section');
    el.className = 'reveal';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'The real project');
    const real = setup!.mission.real, shown = again && state.revealed ? state.revealed : { cost: total, on: state.on };
    const under = setup!.mission.startBill - shown.cost;
    const metList = TWIST_ORDER.filter(t => shown.on.includes(t)).map(t => `<li>✓ ${esc(TWIST_NAMES[t])}${t === 'curveballs' ? ` <small>(${fired().length} news)</small>` : ''}</li>`).join('');
    el.innerHTML = `<div class="reveal-card">
      <div class="reveal-kicker">${again ? 'Your design and the real one' : `You beat ${baselineWords(setup!.mission)}`}</div>
      <div class="reveal-cols">
        <div class="reveal-col yours"><small>Yours</small><b>${money(shown.cost)}</b><span>${under > 0 ? `${money(under)} under ${baselineWords(setup!.mission)}` : ''}</span></div>
        <div class="reveal-col planned"><small>${cap(baselineWords(setup!.mission))}, priced the same way</small><b>${money(setup!.mission.startBill)}</b><span>${setup!.mission.baseline ? 'where you started' : 'the dashed line on the map'}</span></div>
      </div>
      ${real.price ? `<p class="reveal-real">The real project: <b>${money(real.price)}</b> <small>${esc(real.priceText)}</small></p>` : `<p class="reveal-real"><small>${esc(real.priceText)}</small></p>`}
      <p class="reveal-story">${esc(real.story)}</p>
      ${real.reviewBy && state.revealed?.playMs ? `<p class="reveal-took">${esc(tookLine(state.revealed.playMs, real.reviewBy))}</p>` : ''}
      ${metList ? `<ul class="reveal-twists">${metList}</ul>` : '<p class="reveal-twists"><small>No twists on.</small></p>'}
      <div class="reveal-btns"><button type="button" class="primary">Keep improving</button></div></div>`;
    el.querySelector<HTMLButtonElement>('button.primary')!.onclick = () => { el.remove(); revealEl = null; };
    el.addEventListener('click', (e) => { if (e.target === el) { el.remove(); revealEl = null; } });
    (document.getElementById('view') ?? document.body).append(el);
    el.querySelector<HTMLButtonElement>('button.primary')!.focus();
  }

  syncAutoButton(); render();
  const api = {
    /** a full project result is on screen */
    afterFull(result: ProjectResult) {
      const checks = evaluateTwists(result);
      last = { result, checks }; pendingReveal = false;
      // a full result while a drag is held is provisional: no news, no reveal on it
      if (app.busy()) { drawMarks(); render(); return; }
      if (result.valid && !state.firstValid) { state.firstValid = true; save(); }
      const total = result.cost.total;
      const triumph = result.valid && total !== null && total <= goal && checks.every(c => c.met);
      const cbOn = state.on.includes('curveballs'), left = setup!.curveballs.some(c => !state.fired.includes(c.id));
      const cbBroken = checks.some(c => c.id === 'curveballs' && !c.met);
      // a curveball: right when everything else is met the first time, then at its pace, never on top of one still broken
      const paced = state.playMs - state.firedAtMs >= CURVEBALL_EVERY_MS && state.editsSince >= CURVEBALL_EVERY_EDITS;
      if (cbOn && left && state.firstValid && result.valid && !cbBroken && ((triumph && !state.fired.length) || (paced && state.fired.length > 0) || (paced && state.revealed))) {
        if (fire()) {
          last = { result, checks: evaluateTwists(result) }; drawMarks(); render();
          // (news the design meets already: the reveal follows once it is read)
          pendingReveal = triumph && !state.revealed && last.checks.every(c => c.met);
          return;
        }
      }
      if (triumph && !state.revealed && (!cbOn || state.fired.length > 0 || !left)) { if (newsEl) pendingReveal = true; else reveal(false); }
      drawMarks(); render();
    },
    get state() { return state; },
    /** Start over while From scratch is on goes back to the straight line */
    get scratchOn() { return state.on.includes('scratch'); },
    noteScratch(fromStraight: boolean) { state.scratch = fromStraight; save(); },
    syncAutoButton,
  };
  return api;
}

function middle(shape: Shape) {
  if (shape.kind === 'circle') return { x: shape.x, y: shape.y };
  const pts = shapeRings(shape).flat(), n = pts.length;
  return { x: pts.reduce((a, p) => a + p[0], 0) / n, y: pts.reduce((a, p) => a + p[1], 0) / n };
}
