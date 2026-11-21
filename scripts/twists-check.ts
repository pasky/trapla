// Twists: is every twist a mission offers achievable, and does it ask for something? (data/twists.ts, core/twists.ts)
//
//   npx tsx scripts/twists-check.ts [preset…]          check (the merge gate, tests/twists.test.ts): the starting bill, what
//                                                      the starter breaks, the landmarks and curveball places on the map,
//                                                      every reference design in scripts/twists/<preset>/ loads and is VALID,
//                                                      every offered twist claimed by one, the default twists + every
//                                                      curveball + the goal by one (the reveal); exit 1 if not. Whether a
//                                                      reference still MEETS what it claims under today's bills and goal is
//                                                      a warning: scripts/twists-refresh.ts searches those again
//   npx tsx scripts/twists-check.ts --find <preset> --twists earth,landmarks,curveballs [--goal] [--from file.json]
//        [--iters 600] [--seed 1] [--out scripts/twists/<preset>/<name>.json]
//                                                      a local search (bends, height pins, bridges) for a VALID design that
//                                                      meets those twists (and the goal), starting from the starter
//   npx tsx scripts/twists-check.ts --edit <preset> <file.json|-> --out f.json op…
//                                                      a design edited by hand (- : the starter) and what it meets; ops:
//                                                      move:i:dx,dy (bend i by metres) set:i:x,y add:x,y (a bend, in order
//                                                      along the line) del:i pin:s,z unpin:s0,s1 (Auto heights only)
//                                                      paint:s0,s1,kind (0 earth, 1 bridge, 2 tunnel) unpaint:s0,s1 (back
//                                                      to Auto there); TW=a,b: the twists shown
//
// A reference design is a whole project (as window.trapla.getProject() gives it) with what it claims:
//   { "preset", "purpose", "meets": [twist ids; "curveballs" = every curveball of the mission has arrived], "goal": bool, "design" }
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadPack, projectContext as packContext } from './loadpack';
import { projectContext } from './eval-project';
import { scenarioParams, PRESETS, type ScenarioParams } from '../src/core/data/scenario';
import { evaluateProject, type ProjectEvalContext } from '../src/core/project-evaluate';
import type { ProjectDesign, ProjectResult } from '../src/core/project';
import { corridorOfRoute } from '../src/core/project-motorway';
import { legacyDesignForRoute, replaceRouteFromLegacy } from '../src/core/project-legacy';
import { checkTwists, earthShare, shapeRings, ourResults, twistFacts, useAt, DEFAULT_TWISTS, TWIST_ORDER, type TwistCheck, type TwistId, type TwistFacts } from '../src/core/twists';
import { GOAL_SHARE, missionDefaults, MISSION_TWISTS } from '../src/core/data/twists';
import { missionLandmarks, missionTwistSetup, type MissionTwistSetup } from '../src/core/mission-twists';
import { CATEGORIES } from '../src/core/data/categories';
import type { Design } from '../src/core/evaluate';
import { paintOverride } from '../src/core/overrides';
import { KIND } from '../src/core/structures';

export type Fixture = { preset: string; purpose: string; meets: TwistId[]; goal?: boolean; design: ProjectDesign };
const presetOf = (id: string) => PRESETS.find(p => (p.presetId ?? p.id) === id);

export interface Mission {
  preset: string; scenario: ScenarioParams; pack: ReturnType<typeof loadPack>; setup: MissionTwistSetup; starter: ProjectDesign;
  ctx: ProjectEvalContext;
}
export function mission(preset: string): Mission {
  const scenario = presetOf(preset);
  if (!scenario) throw new Error(`no mission ${preset}`);
  const pack = loadPack(`public/scenarios/${scenario.id}`), { meta } = pack;
  const ends = scenario.ports ? { a: { x: scenario.ports.a.xy[0], y: scenario.ports.a.xy[1] }, b: { x: scenario.ports.b.xy[0], y: scenario.ports.b.xy[1] } }
    : { a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
  const setup = missionTwistSetup(preset, scenario, { origin: meta.origin as [number, number], width: meta.nx * meta.cell, height: meta.ny * meta.cell, ...ends }, pack.heritage);
  if (!setup) throw new Error(`${preset}: no twists`);
  // (ALL=1: every twist, the landmarks near the line too where the mission does not offer them: what a survey asks)
  if (process.env.ALL && !setup.terms.landmarks.length) setup.terms = { ...setup.terms, landmarks: missionLandmarks(scenario, { origin: meta.origin as [number, number], width: meta.nx * meta.cell, height: meta.ny * meta.cell, ...ends }, pack.heritage) };
  const starter = packContext(pack, scenarioParams(scenario.id, scenario.presetId)).initial();
  return { preset, scenario, pack, setup, starter, ctx: projectContext(starter).ctx };
}
const ours = (d: ProjectDesign) => {
  const id = d.routes.find(r => r.role === 'mission')!.id, c = corridorOfRoute(d, id);
  return [id, c?.children.forward, c?.children.reverse].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
};
function facts(m: Mission, d: ProjectDesign, r: ProjectResult): TwistFacts {
  return twistFacts(r, ours(d), j => (m.pack.overlays.binfo?.[j]?.[2] ?? 0) <= 1, j => ({ x: m.pack.overlays.buildings[j][0], y: m.pack.overlays.buildings[j][1] }));
}
export function check(m: Mission, d: ProjectDesign, r: ProjectResult, on: readonly TwistId[], scratch = false): TwistCheck[] {
  const mission = d.routes.find(x => x.role === 'mission')!, legacy = legacyDesignForRoute(d, mission.id);
  return checkTwists(on, facts(m, d, r), m.setup.terms, { manual: legacy.profileMode === 'manual', scratch, curveballs: m.setup.curveballs,
    startBill: m.setup.mission.startBill, deckHalf: CATEGORIES[legacy.category].crownWidth / 2 });
}
export const evalDesign = (m: Mission, d: ProjectDesign) => evaluateProject(m.ctx, { epoch: 'twists', revision: 1, design: d });

// ---- search ----------------------------------------------------------------------------------------
// (STEP=0.2: bends moved a fifth as far, for a design a few metres off what it needs)
const SCALE = Number(process.env.STEP ?? 1);
// (WEIGHT=landmarks:5: what a twist still broken weighs, ×; a search from a design that meets it holds on to it)
const WEIGHT: Record<string, number> = Object.fromEntries((process.env.WEIGHT ?? '').split(',').filter(Boolean).map(w => { const [k, v] = w.split(':'); return [k, Number(v)]; }));
/** `deadline`: a time (performance.now()) the search stops at, as after its last iteration; `first`: stop at the first design
 * meeting it all (else the cheapest found); returns whether `out` meets it all */
export function find(preset: string, twists: TwistId[], goal: boolean, from: string | undefined, iters: number, seed: number, out: string,
  { deadline = Infinity, log: print = console.log, first = false }: { deadline?: number; log?: (line: string) => void; first?: boolean } = {}): boolean {
  const m = mission(preset), scratch = twists.includes('scratch');
  let rng = seed * 2654435761 % 2147483647 || 1;
  const rand = () => (rng = rng * 16807 % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const start = from ? (JSON.parse(readFileSync(from, 'utf8')) as Fixture).design : m.starter;
  const routeId = start.routes.find(r => r.role === 'mission')!.id;
  const bill = m.setup.mission.startBill, target = (1 - GOAL_SHARE) * bill;
  // what is left to do, in CZK: never a verdict, only the search's sense of direction
  const score = (d: ProjectDesign, r: ProjectResult) => {
    const checks = check(m, d, r, twists, scratch), f = facts(m, d, r);
    let p = r.cost.total ?? 10 * bill;
    p += r.issues.length * 0.3 * bill;
    for (const c of checks) if (!c.met) {
      if (c.id === 'earth') p += 3 * bill * Math.max(0.02, earthShare(f) - (m.setup.terms.earthShare ?? 0.1));
      // (a cap: how far over it, so the search sees the way down)
      else if (c.id === 'forest') p += 0.15 * bill + 0.05 * bill * Math.max(0, f.forestM2 / 1e4 - (m.setup.terms.forestHa ?? 0));
      else if (c.id === 'bridges') p += 0.15 * bill + 0.0005 * bill * Math.max(0, f.bridges.reduce((a, b) => a + b.s1 - b.s0, 0) - (m.setup.terms.bridgeM ?? 0));
      else p += (WEIGHT[c.id] ?? 1) * 0.15 * bill * Math.max(1, c.issues.reduce((a, i) => a + Math.max(1, ((i.s1 ?? 0) - (i.s0 ?? 0)) / 20), 0));
    }
    if (goal && r.cost.total !== null && r.cost.total > target) p += 0.5 * (r.cost.total - target);
    // a curveball's cap on the bill: how far over it
    if (twists.includes('curveballs') && r.cost.total !== null)
      for (const c of m.setup.curveballs) if (c.budget !== undefined) p += Math.max(0, r.cost.total - c.budget * bill);
    return { p, checks, met: checks.every(c => c.met) && r.valid && (!goal || (r.cost.total ?? Infinity) <= target) };
  };
  let cur = start, curR = evalDesign(m, cur), curS = score(cur, curR);
  let best = { d: cur, s: curS, r: curR };
  // (the cheapest design that meets everything asked, kept apart: a cheaper one that breaks something never replaces it)
  let bestMet = curS.met ? best : null;
  const log = (k: number, s: typeof curS, r: ProjectResult) => print(`${k} ${(s.p / 1e6).toFixed(0)} M · cost ${((r.cost.total ?? NaN) / 1e6).toFixed(0)} · valid ${r.valid} (${r.issues.length}${r.issues.length ? ": " + r.issues.slice(0, 2).map(i => i.violation?.title ?? i.code).join("; ") : ""}) · ${s.checks.map(c => `${c.id}:${c.met ? '✓' : '✗'} ${c.status}`).join(' | ')}${s.met ? ' · MET' : ''}`);
  log(0, curS, curR);
  for (let k = 1; k <= iters && performance.now() < deadline; k++) {
    const d0 = legacyDesignForRoute(cur, routeId), d: Design = structuredClone(d0), L = curR.routes[routeId]?.legacy;
    if (!L) break;
    const heat = 1 - k / iters, step = SCALE * (30 + 170 * heat * rand());
    const kind = rand();
    // a repair aimed at something a twist still finds: a bridge over a place that takes one, a bend pushed off a place
    const broken = curS.checks.flatMap(c => c.issues.filter(i => Number.isFinite(i.x) && (!i.routeId || i.routeId === routeId)));
    if (rand() < 0.3 && broken.length) {
      const i = broken[Math.floor(rand() * broken.length)];
      const z = i.ref?.startsWith('curveball:') && i.s0 !== undefined ? m.setup.curveballs.find(c => c.id === i.ref!.slice(10))?.zone : undefined;
      const use = z && /: our (cutting|embankment) at/.exec(i.text)?.[1];
      if (use && d.profileMode === 'manual' && d.vpis.length > 2 && rand() < 0.5) {
        // heights by hand: the nearest height point out of the ground there
        const at = (i.s0! + i.s1!) / 2, k2 = d.vpis.slice(1, -1).reduce((b, v, k) => Math.abs(v.s - at) < Math.abs(d.vpis[b].s - at) ? k + 1 : b, 1);
        const j = Math.max(0, Math.min(L.n - 1, Math.round(d.vpis[k2].s / L.ds)));
        d.vpis[k2] = { ...d.vpis[k2], z: Math.round((use === 'cutting' ? Math.max(d.vpis[k2].z, L.ground[j] + 0.5 + rand() * 4) : Math.min(d.vpis[k2].z, L.ground[j] - 0.5 - rand() * 4)) * 10) / 10 };
      } else if (use && d.profileMode === 'auto' && rand() < 0.5) {
        // earthworks where a place forbids them: a height pin out of the ground there (above it over a cut, below it under a fill)
        const pins = d.gradePins ?? (d.gradePins = []), at = (i.s0! + i.s1!) / 2 + gauss() * 20, j = Math.max(0, Math.min(L.n - 1, Math.round(at / L.ds)));
        const zz = use === 'cutting' ? Math.max(L.grade[j], L.ground[j] + 0.5 + rand() * 4) : Math.min(L.grade[j], L.ground[j] - 0.5 - rand() * 4);
        const s = Math.round(L.s[j]);
        d.gradePins = [...pins.filter(p => Math.abs(p.s - s) > 30), { s, z: Math.round(zz * 10) / 10 }].sort((a, b) => a.s - b.s);
      } else if (i.fix) d.structureOverrides = paintOverride(d.structureOverrides ?? [], Math.max(0, i.fix.s0 - rand() * 40), Math.min(L.length, i.fix.s1 + rand() * 40),
        i.fix.kind === 'bridge' ? KIND.bridge : KIND.tunnel, i.fix.style ?? (i.fix.kind === 'bridge' && rand() < 0.5 ? 'long' : undefined));
      else if (d.pis.length) {
        const c = placeOf(m, i.ref) ?? { x: i.x, y: i.y }, s = i.s0 ?? nearestS(L, i.x, i.y);
        const near = d.pis.map((p, k2) => ({ k2, d: Math.abs(nearestS(L, p.x, p.y) - s) })).sort((a, b) => a.d - b.d)[Math.floor(rand() * Math.min(2, d.pis.length))].k2;
        const p = d.pis[near], dx = p.x - c.x, dy = p.y - c.y, len = Math.hypot(dx, dy) || 1, push = SCALE * (20 + rand() * 120);
        d.pis[near] = { ...p, x: p.x + dx / len * push + gauss() * 15, y: p.y + dy / len * push + gauss() * 15 }; delete d.pis[near].mapped;
      }
    } else if (kind < 0.45 && d.pis.length) { const i = Math.floor(rand() * d.pis.length); d.pis[i] = { ...d.pis[i], x: d.pis[i].x + gauss() * step, y: d.pis[i].y + gauss() * step }; delete d.pis[i].mapped; }
    else if (kind < 0.55) {
      // a new bend on a leg, pushed aside
      const j = Math.floor(rand() * (L.n - 2)) + 1, nx = -L.ty[j], ny = L.tx[j], off = gauss() * step;
      const at = { x: L.x[j] + nx * off, y: L.y[j] + ny * off, r: null };
      const order = [...d.pis.map((p, i) => ({ i, s: nearestS(L, p.x, p.y) }))];
      const idx = order.filter(o => o.s < L.s[j]).length;
      d.pis.splice(idx, 0, at);
    } else if (kind < 0.6 && d.pis.length) d.pis.splice(Math.floor(rand() * d.pis.length), 1);
    else if (kind < 0.85 && d.profileMode === 'manual' && d.vpis.length > 2) {
      const k2 = 1 + Math.floor(rand() * (d.vpis.length - 2));
      d.vpis[k2] = { ...d.vpis[k2], z: Math.round((d.vpis[k2].z + gauss() * (0.5 + 3 * heat)) * 10) / 10 };
    } else if (kind < 0.85 && d.profileMode === 'auto') {
      const pins = d.gradePins ?? (d.gradePins = []);
      if (pins.length && rand() < 0.3) pins.splice(Math.floor(rand() * pins.length), 1);
      else {
        const j = Math.floor(rand() * (L.n - 10)) + 5, dz = gauss() * (1 + 5 * heat);
        pins.push({ s: Math.round(L.s[j]), z: Math.round((L.grade[j] + dz) * 10) / 10 });
        pins.sort((a, b) => a.s - b.s);
      }
    } else {
      const so = d.structureOverrides ?? [];
      if (so.length && rand() < 0.4) so.splice(Math.floor(rand() * so.length), 1);
      else { const j = Math.floor(rand() * L.n), len = 40 + rand() * 260; d.structureOverrides = paintOverride(so, Math.max(0, L.s[j] - len / 2), Math.min(L.length, L.s[j] + len / 2), rand() < 0.6 ? KIND.bridge : KIND.earth); }
    }
    let next: ProjectDesign;
    try { next = replaceRouteFromLegacy(cur, routeId, d); } catch { continue; }
    const r = evalDesign(m, next), s = score(next, r);
    const accept = s.p < curS.p || rand() < Math.exp(-(s.p - curS.p) / (0.01 * bill * heat + 1));
    if (accept) { cur = next; curR = r; curS = s; }
    if (s.p < best.s.p) { best = { d: next, s, r }; log(k, s, r); }
    if (s.met && (!bestMet || (r.cost.total ?? Infinity) < (bestMet.r.cost.total ?? Infinity))) bestMet = { d: next, s, r };
    // (first: the first design that meets it all will do)
    if (first && bestMet) break;
    if (k % 50 === 0) { cur = best.d; curR = best.r; curS = best.s; save(bestMet ?? best); }
  }
  best = bestMet ?? best;
  save(best);
  function save(b: typeof best) {
    mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
    writeFileSync(out, JSON.stringify({ preset, purpose: `Search (seed ${seed}) for ${twists.join(', ')}${goal ? ' and the goal' : ''}`, meets: b.s.met ? twists : [],
      goal: b.s.met && goal, design: b.d } satisfies Fixture, null, 1));
  }
  print(best.s.met ? `found: ${out}` : `not met; best so far in ${out}`);
  return best.s.met;
}
/** where a twist's place stands (an issue's `ref`) */
function placeOf(m: Mission, ref: string | undefined): { x: number; y: number } | undefined {
  if (ref?.startsWith('landmark:')) return m.setup.terms.landmarks[Number(ref.slice(9))];
  const z = ref?.startsWith('curveball:') ? m.setup.curveballs.find(c => c.id === ref.slice(10))?.zone : undefined;
  if (!z) return undefined;
  if (z.shape.kind === 'circle') return z.shape;
  const p = shapeRings(z.shape).flat();
  return { x: p.reduce((a, q) => a + q[0], 0) / p.length, y: p.reduce((a, q) => a + q[1], 0) / p.length };
}
export function nearestS(L: { n: number; x: Float64Array; y: Float64Array; s: Float64Array }, x: number, y: number) {
  let d = Infinity, s = 0;
  for (let i = 0; i < L.n; i++) { const q = (L.x[i] - x) ** 2 + (L.y[i] - y) ** 2; if (q < d) { d = q; s = L.s[i]; } }
  return s;
}

// ---- check -----------------------------------------------------------------------------------------
/** what a reference claims and no longer meets (or meets no longer VALID): scripts/twists-refresh.ts searches again */
export interface Stale { file: string; why: string[] }
/** Everything this script checks for one mission; `log`: what it prints. tests/twists.test.ts runs it too.
 * `failures`: the twists' definitions are inconsistent, or a reference does not load or is not VALID (the merge gate);
 * `warnings`: a reference no longer meets what it claims under the current bills and goal (`stale`, per file), or what
 * is offered has no reference meeting it now: a developer's list for scripts/twists-refresh.ts, never a game rule (the
 * twist stays offered). */
export function checkMission(preset: string, log: (line: string) => void = console.log): { ok: boolean; failures: string[]; warnings: string[]; stale: Stale[] } {
  const m = mission(preset), { mission: mt } = m.setup;
  let ok = true;
  const failures: string[] = [], warnings: string[] = [], stale: Stale[] = [];
  const fail = (why: string) => { ok = false; failures.push(why); log(`  ✗ ${why}`); };
  const warn = (why: string, file?: string) => {
    warnings.push(why); log(`  ! ${why}`);
    if (!file) return;
    const s = stale.find(x => x.file === file);
    if (s) s.why.push(why); else stale.push({ file, why: [why] });
  };
  const console = { log };
  const r0 = evalDesign(m, m.starter), cost0 = r0.cost.total ?? NaN;
  console.log(`${preset}: starter ${(cost0 / 1e6).toFixed(1)} M (data ${(mt.startBill / 1e6).toFixed(0)} M), ${m.setup.terms.landmarks.length} landmarks, ${m.setup.curveballs.length} curveballs`);
  if (!(Math.abs(cost0 - mt.startBill) <= 0.01 * mt.startBill)) fail(`starting bill ${cost0} is not data/twists.ts startBill ${mt.startBill} (±1 %)`);
  // (Hands off the castle too: offered only where the starter breaks it, PLAN.md "Twists")
  const constraints = mt.offer.filter(t => t !== 'scratch' && t !== 'byHand' && t !== 'curveballs');
  for (const c of check(m, m.starter, r0, constraints)) {
    console.log(`  starter ${c.id}: ${c.met ? 'meets it' : 'breaks it'} (${c.status})`);
    if (c.met) fail(`${c.id}: the starter already meets it (not a challenge)`);
  }
  // (each curveball's place on this map, wholly)
  const W = m.pack.meta.nx * m.pack.meta.cell, H = m.pack.meta.ny * m.pack.meta.cell;
  for (const c of m.setup.curveballs) if (c.zone) {
    const z = c.zone.shape, pts = z.kind === 'circle' ? [[z.x - z.r, z.y - z.r], [z.x + z.r, z.y + z.r]] : shapeRings(z).flat();
    if (pts.some(([x, y]) => !(x >= 0 && x <= W && y >= 0 && y <= H))) fail(`curveball ${c.id}: its place (${c.zone.label}) is not inside the map of ${m.scenario.id}`);
  }
  if (MISSION_TWISTS[preset].offer.includes('landmarks') && !m.pack.heritage) fail(`Hands off offered, public/scenarios/${m.scenario.id}/heritage.json missing (pipeline/build_heritage.py)`);
  if (mt.offer.includes('landmarks') && !m.setup.terms.landmarks.length) fail('landmarks offered, none near the line');
  // (the twist screen names the landmarks in play: each is the pack's, of that kind; the starter breaks one of them and
  // nothing else; a mission without Hands off says why)
  if (mt.offer.includes('landmarks') === !!mt.noLandmarks) fail(mt.noLandmarks ? 'Hands off offered and said not to be' : 'Hands off not offered: data/twists.ts noLandmarks says why');
  if (mt.offer.includes('landmarks')) {
    if (!mt.inPlay?.length) fail('Hands off offered: data/twists.ts inPlay names none');
    const lm = m.setup.terms.landmarks;
    for (const p of mt.inPlay ?? []) {
      const l = lm.find(x => x.code === p.code);
      if (!l) fail(`in play: ${p.code} (${p.name}) is not near the line in public/scenarios/${m.scenario.id}/heritage.json`);
      else if (l.kind !== p.kind) fail(`in play: ${p.name} is a ${l.kind}, not a ${p.kind}`);
      else console.log(`  in play: ${p.name} (${l.kind}, ring ${l.ring} m${p.setting ? ', its setting' : ''})`);
    }
    const broken = (check(m, m.starter, r0, ['landmarks'])[0]?.issues ?? []).map(i => lm[Number(i.ref?.slice(9))]);
    const named = new Set(mt.inPlay?.map(p => p.code));
    for (const l of broken) if (!named.has(l?.code ?? '')) fail(`the starter breaks ${l?.name}, not named in data/twists.ts inPlay`);
  }
  const dir = `scripts/twists/${preset}`, files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).sort() : [];
  // claimed: what the references say they meet (a definition: every offered twist and the reveal has one); met: what
  // they meet under today's bills and goal (a warning where not)
  const claimed = new Set<TwistId>(), met = new Set<TwistId>();
  let revealClaimed = false, reveal = false;
  const defaults = missionDefaults(mt);
  for (const t of mt.notDefault ?? []) if (!DEFAULT_TWISTS.includes(t) || !mt.offer.includes(t)) fail(`notDefault: ${t} is not a default twist offered here`);
  for (const file of files) {
    let fx: Fixture;
    try { fx = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) as Fixture; } catch (e) { fail(`${file}: does not load: ${(e as Error).message}`); continue; }
    if (fx.preset !== preset) { fail(`${file}: belongs to ${fx.preset}`); continue; }
    if (!Array.isArray(fx.meets) || !fx.design?.routes?.some(x => x.role === 'mission')) { fail(`${file}: not a reference design (meets, design with our road)`); continue; }
    for (const t of fx.meets) if (!mt.offer.includes(t)) fail(`${file}: claims ${t}, not offered here`);
    for (const t of fx.meets) claimed.add(t);
    if (fx.goal && defaults.every(t => fx.meets.includes(t))) revealClaimed = true;
    const t0 = performance.now();
    let r: ProjectResult;
    try { r = evalDesign(m, fx.design); } catch (e) { fail(`${file}: does not evaluate: ${(e as Error).message}`); continue; }
    const checks = check(m, fx.design, r, fx.meets, fx.meets.includes('scratch'));
    const beats = (r.cost.total ?? Infinity) <= (1 - GOAL_SHARE) * mt.startBill;
    console.log(`  ${file}: ${r.valid ? 'VALID' : 'NOT VALID'} ${((r.cost.total ?? NaN) / 1e6).toFixed(1)} M${beats ? ' (beats the goal)' : ''} · ${checks.map(c => `${c.id} ${c.met ? '✓' : '✗'} ${c.status}`).join(' · ')} (${Math.round(performance.now() - t0)} ms)`);
    if (!r.valid) {
      fail(`${file}: not valid: ${r.issues.map(i => i.violation?.title ?? i.code).join('; ')}`);
      // (twists-refresh.ts searches this one again too)
      stale.push({ file, why: ['not valid'] });
    }
    for (const c of checks) if (!c.met) warn(`${file}: claims ${c.id}, breaks it: ${c.status} ${c.issues.map(i => i.text).join('; ')}`, file);
    if (fx.goal && !beats) warn(`${file}: claims the goal, ${r.cost.total} is over ${(1 - GOAL_SHARE) * mt.startBill}`, file);
    if (r.valid) for (const c of checks) if (c.met) met.add(c.id);
    if (r.valid && checks.every(c => c.met) && fx.goal && beats && defaults.every(t => fx.meets.includes(t))) reveal = true;
  }
  // From scratch: the starter is a design the straight line can be bent into (its own bends), so the twist asks only
  // that the design began there; its reference is the starter itself, VALID.
  if (mt.offer.includes('scratch') && r0.valid) { claimed.add('scratch'); met.add('scratch'); }
  for (const t of mt.offer) if (!claimed.has(t)) fail(`${t}: offered, no reference design claims it`);
    else if (!met.has(t)) warn(`${t}: offered, no reference design meets it now`);
  if (!revealClaimed) fail(`no reference design claims ${defaults.join(' + ')} and the goal (the reveal)`);
  else if (!reveal) warn(`no reference design meets ${defaults.join(' + ')} and the goal now (the reveal)`);
  console.log(ok ? `  ✓ ${preset}${warnings.length ? ` (${warnings.length} warnings: scripts/twists-refresh.ts)` : ''}` : `  ✗ ${preset}`);
  return { ok, failures, warnings, stale };
}

const args = process.argv.slice(2), opt = (k: string) => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
if (import.meta.url !== `file://${process.argv[1]}`) { /* imported (tests/twists.test.ts) */ }
else if (args[0] === '--show') {
  // one design: its verdict and every twist of the mission with what breaks it
  // (`--show <preset>`: the starter)
  const fx = args[1].endsWith('.json') ? JSON.parse(readFileSync(args[1], 'utf8')) as Fixture : { preset: args[1], design: undefined as unknown as ProjectDesign };
  const m = mission(fx.preset); fx.design ??= m.starter;
  const r = evalDesign(m, fx.design);
  console.log(`${r.valid ? 'VALID' : 'NOT VALID'} ${((r.cost.total ?? NaN) / 1e6).toFixed(1)} M (goal ${((1 - GOAL_SHARE) * m.setup.mission.startBill / 1e6).toFixed(0)} M)`, r.issues.map(i => i.violation?.title ?? i.code).join('; '));
  for (const c of check(m, fx.design, r, process.env.ALL ? TWIST_ORDER : m.setup.mission.offer)) console.log(`  ${c.met ? '✓' : '✗'} ${c.id}: ${c.status}${c.issues.map(i => `\n      ${i.text}`).join('')}`);
} else if (args[0] === '--survey') {
  // where to put a curveball: the starter's and the given designs' lines about every 25 m (the nearest whole number of stations) in EPSG:5514 (what the line does there,
  // its height over the ground, the land cover, the ground's cross slope, the nearest village); `--json f` writes them
  const m = mission(args[1]), o = m.pack.meta.origin as [number, number], T = m.pack.terrain, places = m.pack.overlays.places as { name: string; kind: string; x: number; y: number }[];
  const files = args.slice(2).filter(a => a.endsWith('.json') && a !== opt('--json'));
  const lines = [{ name: 'starter', d: m.starter }, ...files.map(f => ({ name: f.replace(/^.*\//, '').replace(/\.json$/, ''), d: (JSON.parse(readFileSync(f, 'utf8')) as Fixture).design }))];
  const LCN = ['open', 'forest', 'water', 'building', 'road', 'urban', 'rail', 'stream'];
  const outJ: Record<string, unknown> = { preset: args[1], origin: o, places: places.map(p => ({ ...p, X: p.x + o[0], Y: p.y + o[1] })), lines: {} };
  for (const { name, d } of lines) {
    const r = evalDesign(m, d), rows: unknown[] = [];
    console.log(`== ${name}: ${r.valid ? 'VALID' : 'NOT VALID'} ${((r.cost.total ?? NaN) / 1e6).toFixed(0)} M`);
    for (const { id, r: L } of ourResults(r, ours(d))) {
      const step = Math.max(1, Math.round(25 / L.ds));
      let line = '';
      for (let i = 0; i < L.n; i += step) {
        const x = L.x[i], y = L.y[i], nx = -L.ty[i], ny = L.tx[i], use = useAt(L, i);
        const cross = (T.heightAt(x + nx * 30, y + ny * 30) - T.heightAt(x - nx * 30, y - ny * 30)) / 60;
        let near = { name: '', d: Infinity };
        for (const p of places) { const dd = Math.hypot(p.x - x, p.y - y); if (dd < near.d) near = { name: p.name, d: dd }; }
        const row = { route: id, s: Math.round(L.s[i]), X: Math.round(x + o[0]), Y: Math.round(y + o[1]), use, h: +(L.grade[i] - L.ground[i]).toFixed(1),
          lc: LCN[T.landcover(x, y)] ?? '?', cross: +cross.toFixed(2), place: near.name, placeM: Math.round(near.d), dayL: Math.round(L.dayL[i] ?? 0), dayR: Math.round(L.dayR[i] ?? 0) };
        rows.push(row);
        if (i % (step * 10) === 0) line += `\n  ${id} km ${(L.s[i] / 1000).toFixed(2)} ${row.X},${row.Y} ${use} ${row.h} m ${row.lc} slope ${row.cross} · ${near.name} ${row.placeM} m`;
      }
      console.log(line.slice(1));
      console.log(`  runs: ${L.runs.map(u => `${u.kind === KIND.bridge ? 'bridge' : u.kind === KIND.tunnel ? 'tunnel' : u.kind} ${(u.s0 / 1000).toFixed(2)}–${(u.s1 / 1000).toFixed(2)}`).join(', ')}`);
    }
    (outJ.lines as Record<string, unknown>)[name] = rows;
    // (the homes this design buys out, EPSG:5514)
    (outJ.homes ??= {} as Record<string, unknown>);
    (outJ.homes as Record<string, unknown>)[name] = facts(m, d, r).homes.map(h => ({ j: h.j, X: Math.round(h.x + o[0]), Y: Math.round(h.y + o[1]) }));
  }
  if (opt('--json')) writeFileSync(opt('--json')!, JSON.stringify(outJ));
} else if (args[0] === '--manual') {
  // By hand: a design with our road's heights set by hand where Auto had them (as the HUD's By hand button takes them)
  const m = mission(args[1]), from = opt('--from'), start = from ? (JSON.parse(readFileSync(from, 'utf8')) as Fixture).design : m.starter;
  const routeId = start.routes.find(r => r.role === 'mission')!.id, r = evalDesign(m, start), L = r.routes[routeId]!.legacy!;
  const d = legacyDesignForRoute(start, routeId);
  d.profileMode = 'manual'; d.vpis = L.vpis.map(v => ({ ...v }));
  const next = replaceRouteFromLegacy(start, routeId, d), out = opt('--out') ?? `scripts/twists/${args[1]}/by-hand.json`;
  const rr = evalDesign(m, next), checks = check(m, next, rr, ['byHand']);
  console.log(`${rr.valid ? 'VALID' : 'NOT VALID'} ${((rr.cost.total ?? NaN) / 1e6).toFixed(1)} M · ${checks.map(c => `${c.id} ${c.met ? '✓' : '✗'}`).join(' ')}`);
  mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(out, JSON.stringify({ preset: args[1], purpose: `By hand: ${from ?? 'the starter'} with Auto's heights taken as height pins`, meets: rr.valid ? ['byHand'] : [], design: next } satisfies Fixture, null, 1));
} else if (args[0] === '--edit') {
  const m = mission(args[1]), inp = args[2], out = opt('--out');
  if (!out) throw new Error('--out <file.json> is needed');
  const fx: Fixture = inp === '-' ? { preset: args[1], purpose: 'By hand from the starter', meets: [], design: m.starter } : JSON.parse(readFileSync(inp, 'utf8'));
  const id = fx.design.routes.find(r => r.role === 'mission')!.id, L0 = evalDesign(m, fx.design).routes[id]!.legacy!;
  const d = structuredClone(legacyDesignForRoute(fx.design, id));
  for (const op of args.slice(3).filter((a, i, all) => a !== '--out' && all[i - 1] !== '--out')) {
    const [k, a, b] = op.split(':'), n = (t: string) => t.split(',').map(Number);
    if (k === 'move') { const [dx, dy] = n(b), i = Number(a); d.pis[i] = { ...d.pis[i], x: d.pis[i].x + dx, y: d.pis[i].y + dy }; delete d.pis[i].mapped; }
    else if (k === 'set') { const [x, y] = n(b), i = Number(a); d.pis[i] = { ...d.pis[i], x, y }; delete d.pis[i].mapped; }
    else if (k === 'add') { const [x, y] = n(a), s = nearestS(L0, x, y); d.pis.splice(d.pis.filter(p => nearestS(L0, p.x, p.y) < s).length, 0, { x, y, r: null }); }
    else if (k === 'del') d.pis.splice(Number(a), 1);
    else if ((k === 'pin' || k === 'unpin') && d.profileMode === 'manual') throw new Error(`${op}: this design's heights are by hand (height pins of Auto do nothing)`);
    else if (k === 'pin') { const [s, z] = n(a); d.gradePins = [...(d.gradePins ?? []).filter(p => Math.abs(p.s - s) > 30), { s, z }].sort((p, q) => p.s - q.s); }
    else if (k === 'unpin') { const [s0, s1] = n(a); d.gradePins = (d.gradePins ?? []).filter(p => p.s < s0 || p.s > (s1 ?? s0)); }
    else if (k === 'paint') { const [s0, s1, kind] = n(a); d.structureOverrides = paintOverride(d.structureOverrides ?? [], s0, s1, kind as typeof KIND[keyof typeof KIND]); }
    // (that stretch back to Auto; painted structures beside it keep their ends)
    else if (k === 'unpaint') { const [s0, s1] = n(a); d.structureOverrides = paintOverride(d.structureOverrides ?? [], s0, s1, null); }
    else throw new Error(`unknown edit ${op}`);
  }
  // (bends moved: the height pins and painted structures stay where they were on the ground, at the new line's stations
  // nearest their old places, so a stretch moved does not shift every pin beyond it)
  const at = (s: number) => { const i = Math.max(0, Math.min(L0.n - 1, Math.round(s / L0.ds))); return { x: L0.x[i], y: L0.y[i] }; };
  const old = JSON.stringify(legacyDesignForRoute(fx.design, id).pis) !== JSON.stringify(d.pis)
    ? { pins: (d.gradePins ?? []).map(p => ({ ...p, ...at(p.s) })), so: (d.structureOverrides ?? []).map(o => ({ o, a: at(o.s0), b: at(o.s1) })) } : null;
  let next = replaceRouteFromLegacy(fx.design, id, d), r = evalDesign(m, next);
  if (old && !process.env.NO_REMAP) {
    const L1 = r.routes[id]!.legacy!;
    if (d.gradePins) d.gradePins = old.pins.map(({ x, y, ...p }) => ({ ...p, s: Math.round(nearestS(L1, x, y)) })).sort((p, q) => p.s - q.s);
    if (d.structureOverrides) d.structureOverrides = old.so.map(({ o, a, b }) => ({ ...o, s0: nearestS(L1, a.x, a.y), s1: nearestS(L1, b.x, b.y) })).filter(o => o.s1 > o.s0);
    next = replaceRouteFromLegacy(fx.design, id, d); r = evalDesign(m, next);
  }
  console.log(`${r.valid ? 'VALID' : 'NOT VALID'} ${((r.cost.total ?? NaN) / 1e6).toFixed(0)} M (goal ${((1 - GOAL_SHARE) * m.setup.mission.startBill / 1e6).toFixed(0)} M)`, r.issues.map(i => i.violation?.title ?? i.code).slice(0, 5).join('; '));
  for (const c of check(m, next, r, (process.env.TW?.split(',') ?? m.setup.mission.offer) as TwistId[]))
    console.log(`  ${c.met ? '✓' : '✗'} ${c.id}: ${c.status}${c.issues.slice(0, 5).map(i => `\n      ${i.text}${i.s0 !== undefined ? ` (km ${(i.s0 / 1000).toFixed(2)}–${((i.s1 ?? i.s0) / 1000).toFixed(2)})` : ''}`).join('')}`);
  // (what it meets is for twists-check to say: claimed nothing yet)
  writeFileSync(out, JSON.stringify({ ...fx, meets: [], goal: false, design: next } satisfies Fixture, null, 1));
} else if (args[0] === '--find') {
  const preset = args[1], twists = (opt('--twists') ?? '').split(',').filter(Boolean) as TwistId[];
  find(preset, twists, args.includes('--goal'), opt('--from'), Number(opt('--iters') ?? 600), Number(opt('--seed') ?? 1),
    opt('--out') ?? `scripts/twists/${preset}/found.json`);
} else {
  const presets = args.length ? args : Object.keys(MISSION_TWISTS);
  let ok = true;
  const warned: string[] = [];
  for (const p of presets) { const c = checkMission(p); ok = c.ok && ok; warned.push(...c.warnings.map(w => `${p}: ${w}`)); }
  // (references that no longer meet what they claim: a warning, refreshed by scripts/twists-refresh.ts, not on a merge)
  if (warned.length) console.log(`\n${warned.length} warnings (npx tsx scripts/twists-refresh.ts searches again):\n${warned.map(w => `  ! ${w}`).join('\n')}`);
  if (!ok) process.exitCode = 1;
}
