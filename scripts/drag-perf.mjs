// Interactive drag probe: a real mouse drag of one bend on best-design for ~2 s, measuring what
// the player feels — frame intervals, main-thread time per worker result, worker time and the
// latency from the pointer move (eval posted) to the handled result. Works on older commits too
// (instrumentation wraps the page's Worker; nothing in the app is required).
//
//   node scripts/drag-perf.mjs [--root DIR] [--gpu] [--profile out.cpuprofile] [--trace out.json]
//        [--scenario d11] [--preset d3-motorway] [--design scripts/best-design.json] [--mode bend|road|radius|pin|vpi|link|crossing|ends] [--bend 9]
//        [--seconds 2] [--check] [--shot out.png] [--split forward|reverse] [--alloc out.heapprofile]
//
// --scenario <id>: another pack; the design defaults to scripts/scenarios/<id>/default.json and the
// bend to the middle one. The budgets are the same for every scenario.
//
// --check: exit 1 when the thresholds below are missed (p95 frame on GPU, preview latency).
import { readFileSync, writeFileSync } from 'node:fs';
import { startGame, dismissIntro } from './lib/browser.mjs';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1] ?? d; };
const root = arg('--root', process.cwd());
const gpu = process.argv.includes('--gpu');
const port = Number(arg('--port', process.env.PORT ?? 5300));
const scenarioId = arg('--scenario', 'd11');
const presetId = arg('--preset'); // e.g. d3-motorway: design defaults to scripts/scenarios/<id>/<preset>.json
const designFile = arg('--design', presetId ? `scripts/scenarios/${scenarioId}/${presetId}.json` : scenarioId === 'd11' ? 'scripts/best-design.json' : `scripts/scenarios/${scenarioId}/default.json`);
const mode = arg('--mode', 'bend'); // bend | road (drag the road: a new bend) | radius (a grip) | pin (an Automatic height pin) | vpi (a height point) | link (shape a reroute) | crossing (slide a crossing's ring) | ends (pull a rebuilt stretch's end along the old road)
const bendArg = arg('--bend');
const split = arg('--split'); // motorway: split the directions and drag the one towards B (forward) or A (reverse)
const seconds = Number(arg('--seconds', 2));
const profileOut = arg('--profile'), traceOut = arg('--trace'), allocOut = arg('--alloc');
const check = process.argv.includes('--check');
const shot = arg('--shot'); // screenshot path, taken once in the middle of the measured drag (skews its timing)

// (other agents / scripts may hold the port: the next free one is taken)
const game = await startGame({ root, gpu, port });
const { page, browser } = game;
const url = `${game.base}?scenario=${encodeURIComponent(scenarioId)}${presetId ? `&preset=${encodeURIComponent(presetId)}` : ''}`;
try {
// one navigation (the page's Worker is wrapped before its own code runs), the first-run intro dismissed beforehand:
// it lies over the map's corner and the start view is framed around it
await dismissIntro(page);
// (the twists stay on, as a player has them, but the reveal has been seen: a design that meets them under the goal, as
// the D11 best design meets Hands off, would otherwise open it over the map before the drag)
await page.addInitScript((key) => {
  try { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ chosen: false, firstValid: true, revealed: { cost: 0, on: [] } })); } catch { /* none */ }
}, `trapla.twists.v1.${scenarioId}.${presetId ?? scenarioId}`);
await page.addInitScript(() => {
  const D = window.__drag = { on: false, posts: new Map(), results: [], frames: [], longtasks: [], moves: [] };
  const Orig = window.Worker;
  window.Worker = class extends Orig {
    postMessage(m, t) { if (m && ['eval', 'project-eval', 'project-preview'].includes(m.type) && D.on) D.posts.set(m.id, performance.now()); return super.postMessage(m, t); }
    set onmessage(fn) {
      super.onmessage = (ev) => {
        const t0 = performance.now();
        // (the message is deserialised on its first read: timed apart, part of the handler's time as before)
        void ev.data;
        const tData = performance.now();
        fn(ev);
        const t1 = performance.now();
        const m = ev.data;
        const r = m?.type === 'project-preview' ? m.result?.legacy
          : m?.type === 'project-result' ? m.result?.routes[window.trapla?.activeRoute?.()]?.legacy : m?.type === 'result' ? m.result : null;
        const handled = !window.trapla?.handledRequest || window.trapla.handledRequest() === m?.id;
        if (D.on && r && handled) D.results.push({ id: m.id, t0, t1, preview: m.type === 'project-preview' || !!(m.preview ?? r.preview), worker: r.timing?.total, timing: r.timing, parts: { ...window.trapla?.handlerTiming?.(), decode: tData - t0 } });
      };
    }
    get onmessage() { return super.onmessage; }
  };
  const frame = (t) => { if (D.on) D.frames.push(t); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  try {
    new PerformanceObserver((l) => { if (D.on) for (const e of l.getEntries()) D.longtasks.push({ t: e.startTime, d: e.duration }); })
      .observe({ type: 'longtask', buffered: false });
  } catch { /* unsupported */ }
});
// (an evaluation or a 3D rebuild that fails during the measured drag fails the check: the work it would have cost
// was not done)
let measuring = false;
const failures = [];
page.on('pageerror', (e) => { console.log('pageerror', e.message); if (measuring) failures.push(e.message); });
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  console.log('console', m.text().slice(0, 300));
  if (measuring && /worker error|3D rebuild failed/.test(m.text())) failures.push(m.text().slice(0, 120));
});
await page.goto(url);
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 180000 });
await page.evaluate(() => window.trapla.whenIdle());
const renderer = await page.evaluate(() => {
  const gl = document.querySelector('#view canvas').getContext('webgl2');
  const e = gl.getExtension('WEBGL_debug_renderer_info');
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
const saved = JSON.parse(readFileSync(designFile, 'utf8'));
if (saved.scenario && saved.scenario !== scenarioId) throw new Error(`${designFile} belongs to ${saved.scenario}, not ${scenarioId}`);
const design = saved.design;
const bend = bendArg !== null ? Number(bendArg) : scenarioId === 'd11' && !presetId ? 9 : Math.floor(design.pis.length / 2);
await page.evaluate((d) => window.trapla.setDesign(d), design);
await page.evaluate(() => window.trapla.whenIdle());
if (split) {
  await page.evaluate(() => { const b = document.querySelector('#sec-design .fold-h button'); if (b?.getAttribute('aria-expanded') === 'false') b.click(); });
  // the switch is on the motorway's own card (the Motorway section's copy steps aside while it is shown)
  const own = page.locator(`.motorway-head [data-dir="${split}"]`);
  await ((await own.count()) && await own.first().isVisible() ? own.first() : page.locator(`#dir-${split}`)).click();
  await page.evaluate(() => window.trapla.whenIdle());
}
const pi = (await page.evaluate(() => window.trapla.getDesign())).pis[bend]; // the live design (a split direction has its own bends)
await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 2500, 20, 45), [pi.x, pi.y]);
await page.waitForTimeout(1500);
// the selected bend is drawn first and never shrinks to a dot; grab it where no other overlay
// element (culvert / wall symbols) covers it
await page.evaluate((i) => window.trapla.selectPi(i), bend);
// culvert / wall symbols can sit on the bend at some zooms: let the probe's pointer through them
await page.addStyleTag({ content: '.build-annotation { pointer-events: none !important; }' });
await page.waitForTimeout(300);
const uncovered = async (selector) => {
  // markers are placed by the render loop: wait until the camera move has settled on screen
  let box = null;
  for (let k = 0; k < 40; k++) {
    const b = await page.locator(selector).filter({ visible: true }).first().boundingBox();
    if (b && box && Math.abs(b.x - box.x) < 0.5 && Math.abs(b.y - box.y) < 0.5) break;
    box = b;
    // two rendered frames apart (SwiftShader frames take ~0.4 s)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(100);
  }
  if (!box) throw new Error(`${selector} is not on screen`);
  const at = await page.evaluate(([b, sel]) => {
    for (const [fx, fy] of [[.5, .5], [.3, .3], [.7, .3], [.3, .7], [.7, .7], [.5, .2], [.5, .8], [.2, .5], [.8, .5]]) {
      const x = b.x + b.width * fx, y = b.y + b.height * fy, e = document.elementFromPoint(x, y);
      if (e?.closest(sel)) return { x, y };
    }
    return null;
  }, [box, selector]);
  if (!at) {
    const by = await page.evaluate((b) => { const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return e ? `${e.tagName}.${e.className}` : null; }, box);
    throw new Error(`${selector} is covered by ${by}`);
  }
  return at;
};
const T = (f, a) => page.evaluate(f, a);
/** where the drag starts and its pointer offset (px) at phase u ∈ [0, 1) of the measured drag */
let grab, path, beforeMeasure = async () => {}, afterWarmUp = async () => {}, afterMeasure = async () => {};
if (mode === 'bend') {
  // a loop around the bend's spot (the route length changes every step)
  grab = () => uncovered(`.pi[data-i="${bend}"]`);
  path = (u, size) => ({ x: size * Math.sin(u * 2 * Math.PI), y: size * (1 - Math.cos(u * 2 * Math.PI)) * 0.6 });
} else if (mode === 'road') {
  // drag the road itself between this bend and the next: every drag inserts a new bend that follows
  // the pointer (the same loop as a bend drag)
  grab = async () => {
    const at = await T((i) => {
      const t = window.trapla, b = t.bendStations(), s = (b[i].s + (b[i + 1]?.s ?? t.result().length)) / 2;
      t.selectPi(null);
      const p = t.roadScreen(s), box = document.querySelector('#view canvas').getBoundingClientRect();
      return { x: box.left + p.sx, y: box.top + p.sy };
    }, bend);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return at;
  };
  path = (u, size) => ({ x: size * Math.sin(u * 2 * Math.PI), y: size * (1 - Math.cos(u * 2 * Math.PI)) * 0.6 });
} else if (mode === 'radius') {
  // a radius grip slid outwards along its leg and back (closer to the bend it would hide)
  await T(([x, y]) => window.trapla.lookAt(x, y, 900, 20, 50), [pi.x, pi.y]);
  await page.waitForTimeout(800);
  const at = await uncovered('.rgrip'), pi0 = await uncovered(`.pi[data-i="${bend}"]`);
  const len = Math.hypot(at.x - pi0.x, at.y - pi0.y) || 1, ux = (at.x - pi0.x) / len, uy = (at.y - pi0.y) / len;
  grab = async () => uncovered('.rgrip');
  path = (u, size) => { const a = size * 0.5 * (1 - Math.cos(u * 2 * Math.PI)); return { x: ux * a, y: uy * a }; };
} else if (mode === 'pin' || mode === 'vpi') {
  await T(() => window.trapla.profileFit());
  await page.waitForTimeout(200);
  if (mode === 'pin') {
    // pin the road height at the bend (a short vertical drag of the road line), then drag the pin's head
    const s = await T((i) => window.trapla.bendStations()[i].s, bend);
    const p = await T((s) => window.trapla.profilePoint(s), s);
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    for (let k = 1; k <= 3; k++) await page.mouse.move(p.x, p.y - 2 * k);
    await page.mouse.up();
    await T(() => window.trapla.whenIdle());
    grab = async () => { const pin = (await T(() => window.trapla.getDesign())).gradePins[0]; const q = await T((pin) => window.trapla.profilePoint(pin.s, pin.z), pin); return { x: q.x, y: q.y - 14 }; };
  } else {
    // a height point By hand (in Auto, dragging the line pins it instead)
    await T(() => document.getElementById('grade-manual').click());
    await T(() => window.trapla.whenIdle());
    // the shown height point nearest the middle (the others have no handle at this zoom)
    grab = async () => T(() => { const r = window.trapla.result(), mid = r.vpis.length / 2;
      const k = window.trapla.profileShownPoints().reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a)), v = r.vpis[k];
      return window.trapla.profilePoint(v.s, v.z); });
  }
  path = (u, size) => ({ x: 0, y: -size * 0.4 * Math.sin(u * 2 * Math.PI) });
} else if (mode === 'link') {
  // a reroute link (the new road of a cut crossed road), dragged by its middle: every drag adds a bend
  // point there that follows the pointer (the same loop as a bend drag). The measured drag shapes the longest reroute
  // for the first time, as a player's first drag of it; the warm-up the next longest (of another way crossed once:
  // `shapeable`), so that no full result of the measured one's shape is kept yet.
  const viewIdle = () => T(() => new Promise((resolve) => { const tick = () => requestAnimationFrame(() => (window.trapla.viewBusy() ? tick() : resolve())); tick(); }));
  const focus = async (rank) => {
    const at = await T((rank) => {
      const r = window.trapla.result(), once = (id) => r.crossings.filter(c => c.roadId === id).length === 1;
      const list = r.crossings.filter(c => (c.type === 'reconnection' || c.type === 'diversion') && !c.moved && once(c.roadId) && c.geometry?.links?.some(l => l.length > 6))
        .sort((a, b) => (b.linkLength ?? 0) - (a.linkLength ?? 0));
      const c = list[rank];
      if (!c) return null;
      const link = c.geometry.links.find(l => l.length > 6), q = link[Math.floor(link.length / 2)];
      // (a reroute is shaped once its crossing is selected, as a click on it would)
      window.trapla.select({ kind: 'crossing', roadId: c.roadId }); window.trapla.lookAt(q.x, q.y, 1200, 20, 45);
      return { roadId: c.roadId, link: [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8].map(f => link[Math.floor(link.length * f)]) };
    }, rank);
    if (!at) throw new Error('link mode needs two reroutes of ways crossed once (one to warm up on, one to measure)');
    await page.waitForTimeout(1500);
    await viewIdle();
    // its middle, else the nearest point along it clear on screen of a culvert's symbol on our road (a press there
    // selects the culvert instead)
    const q = await T((pts) => {
      const r = window.trapla.result(), screen = (x, y, z) => window.trapla.project(x, y, z);
      const marks = r.waterCrossings.map(w => { const i = Math.round(w.s / r.ds); return screen(r.x[i], r.y[i], r.grade[i]); });
      return pts.find(p => { const s = screen(p.x, p.y, p.z); return marks.every(m => Math.hypot(s.sx - m.sx, s.sy - m.sy) > 40); }) ?? pts[0];
    }, at.link);
    return { roadId: at.roadId, q };
  };
  const before = await T(() => window.trapla.getDesign().crossingOverrides ?? []);
  let target = await focus(1);
  grab = async () => {
    // (the link drawn where it is before a press grabs it: on a loaded host the scene of a long route catches up after the
    // camera move or the evaluation)
    await viewIdle();
    return T((q) => { const p = window.trapla.project(q.x, q.y, q.z), box = document.querySelector('#view canvas').getBoundingClientRect(); return { x: box.left + p.sx, y: box.top + p.sy }; }, target.q);
  };
  // (each drag shapes its own reroute: its bend points are new)
  const shapedNow = (id) => T(([id, before]) => {
    const via = (list) => JSON.stringify((list ?? []).find(o => o.roadId === id)?.via ?? null);
    return via(window.trapla.getDesign().crossingOverrides) !== via(before);
  }, [id, before]);
  afterWarmUp = async () => { if (!(await shapedNow(target.roadId))) throw new Error('the warm-up drag did not shape its reroute'); };
  afterMeasure = async () => { if (!(await shapedNow(target.roadId))) throw new Error('the measured drag did not shape its reroute'); };
  // after the warm-up drag: back to Auto's crossings as the design had them, the longest reroute in view
  beforeMeasure = async () => {
    await T((before) => { const d = window.trapla.getDesign(); d.crossingOverrides = before; window.trapla.setDesign(d); }, before);
    await T(() => window.trapla.whenIdle());
    target = await focus(0);
    await page.waitForTimeout(300);
  };
  path = (u, size) => ({ x: size * Math.sin(u * 2 * Math.PI), y: size * (1 - Math.cos(u * 2 * Math.PI)) * 0.6 });
} else if (mode === 'crossing' || mode === 'ends') {
  // a selected crossing's ring slid along our road (ui/crossing-drag.ts): the first drag rebuilds the crossed mapped road
  // (a project road from then on) and moves its piece so that it crosses ours under the pointer. The warm-up slides
  // another crossing and is undone; the measured drag is a player's first slide of its crossing.
  const viewIdle = () => T(() => new Promise((resolve) => { const tick = () => requestAnimationFrame(() => (window.trapla.viewBusy() ? tick() : resolve())); tick(); }));
  await T(() => window.trapla.whenTransport());
  // the crossings carried over or under ours (a cut way has nothing crossing to slide), nearest the bend first
  const list = await T((at) => window.trapla.result().crossings
    .filter(c => c.roadId !== undefined && !c.designed && !c.mapped && ['bridge', 'overbridge', 'underpass', 'tunnel'].includes(c.type))
    .sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y)).map(c => ({ roadId: c.roadId, x: c.x, y: c.y, s: c.s })), pi);
  let dir = { x: 1, y: 0 };
  // (the ring lets the pointer through to the map under it: its middle is where a press grabs it)
  const ring = async () => { const b = await page.locator('.selected-crossing').filter({ visible: true }).first().boundingBox().catch(() => null); return b && { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  /** select crossing k of the list that a ring drag slides (the next one where it cannot), in view */
  const focus = async (skip) => {
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      if (k === skip) continue;
      await T((c) => { window.trapla.select({ kind: 'crossing', roadId: c.roadId }); window.trapla.lookAt(c.x, c.y, 900, 20, 50); }, c);
      await page.waitForTimeout(800); await viewIdle();
      const at = await ring();
      if (!at || !(await T(([x, y]) => window.trapla.grabsAt(x, y), [at.x, at.y]))) continue;
      // the screen direction of our road there
      const q = await T((s) => [window.trapla.roadScreen(s - 20), window.trapla.roadScreen(s + 20)], c.s), l = Math.hypot(q[1].sx - q[0].sx, q[1].sy - q[0].sy) || 1;
      dir = { x: (q[1].sx - q[0].sx) / l, y: (q[1].sy - q[0].sy) / l };
      return k;
    }
    throw new Error('crossing mode needs two crossings carried over or under ours whose ring a drag slides');
  };
  const missionId = await T(() => window.trapla.activeRoute());
  const warm = await focus(-1);
  grab = async () => { await viewIdle(); return ring(); };
  const routes = () => T(() => Object.keys(window.trapla.projectResult().routes).length);
  const before = await routes();
  afterWarmUp = async () => { if ((await routes()) !== before + 1) throw new Error('the warm-up drag did not rebuild the crossed road'); };
  beforeMeasure = async () => {
    await page.keyboard.press('Control+z'); await T(() => window.trapla.whenIdle());
    if ((await routes()) !== before) throw new Error('undo did not take the warm-up slide back');
    await T((id) => window.trapla.setActiveRoute(id), missionId);
    await focus(warm);
  };
  afterMeasure = async () => { if ((await routes()) !== before + 1 || !/^moving where/.test((await T(() => window.trapla.undoLabels())).undo)) throw new Error('the measured drag did not slide its crossing'); };
  path = (u, size) => { const a = size * 0.8 * Math.sin(u * 2 * Math.PI); return { x: dir.x * a, y: dir.y * a }; };
  if (mode === 'ends') {
    // ends: the slid crossing's road is rebuilt (the warm-up); the measured drag pulls its stretch's End handle along the
    // old road, out past its end and back (ui/stretch-ends.ts: past junctions onto the next ways of the road). Nothing
    // is evaluated while it moves (the stretch and the old road ahead are lit); its release is one edit.
    const handle = async () => { const b = await page.locator('.stretch-end[data-end="1"]').filter({ visible: true }).first().boundingBox().catch(() => null); return b && { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    beforeMeasure = async () => {
      const id = await T(() => window.trapla.getProject().routes.find(r => r.source)?.id);
      if (!id) throw new Error('the warm-up drag did not rebuild the crossed road');
      const ends = await T((id) => { window.trapla.setActiveRoute(id); const r = window.trapla.getProject().routes.find(q => q.id === id); return [r.endpoints.a.position, r.endpoints.b.position]; }, id);
      await T(([b]) => window.trapla.lookAt(b.x, b.y, 700, 20, 50), [ends[1]]);
      await page.waitForTimeout(800); await viewIdle();
      const a = await handle(), sa = await page.locator('.stretch-end[data-end="0"]').first().boundingBox();
      if (!a || !sa) throw new Error('the rebuilt stretch shows no end handles');
      const l = Math.hypot(a.x - sa.x - sa.width / 2, a.y - sa.y - sa.height / 2) || 1;
      dir = { x: (a.x - sa.x - sa.width / 2) / l, y: (a.y - sa.y - sa.height / 2) / l };
      grab = handle;
    };
    afterMeasure = async () => { if (!/^rebuilding (more|less) of/.test((await T(() => window.trapla.undoLabels())).undo)) throw new Error('the measured drag did not move the stretch\'s end'); };
    // (out past the end first: the old road beyond it, through its junction)
    path = (u, size) => { const a = size * 1.2 * Math.sin(u * 2 * Math.PI); return { x: dir.x * a, y: dir.y * a }; };
  }
} else throw new Error(`unknown --mode ${mode}`);

/** `steps`: at least this many moves, the k-th at least k / steps of the way round (the warm-up: on a loaded host the
 * first moves over a long route, a hover's first picks, can take the whole time, and a drag must still begin: the first
 * move goes past the 5 px a drag starts with) */
const drag = async (secs, size, shotAt = null, steps = 0, pressing = async () => {}) => {
  const c = await grab();
  // (the pointer comes to rest over what it grabs before the press, as a player's does: what the hover shows there, the
  // first picks of a new result, is not part of the drag)
  await page.mouse.move(c.x, c.y);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await pressing();
  await page.mouse.down();
  const t0 = Date.now();
  let k = 0;
  // pointer moves on a fixed 60 Hz timeline (late moves jump ahead, as a real mouse would)
  while (Date.now() - t0 < secs * 1000 || k < steps) {
    const o = path(Math.max((Date.now() - t0) / 1000 / secs, steps ? (k + 1) / steps : 0), size);
    await page.mouse.move(c.x + o.x, c.y + o.y);
    // next slot of the timeline: missed slots are skipped, not sent in a burst
    k++;
    if (shotAt && Date.now() - t0 > secs * 500) { await page.screenshot({ path: shotAt }); shotAt = null; }
    const next = t0 + (Math.floor((Date.now() - t0) / 16.7) + 1) * 16.7;
    if (next > Date.now()) await page.waitForTimeout(next - Date.now());
  }
  await page.mouse.up();
  return k;
};
// warm-up: a short drag so JIT / shader programs are not first-use (the owner drags repeatedly)
await drag(0.6, 30, null, 12);
await page.evaluate(() => window.trapla.whenIdle());
await afterWarmUp();
await beforeMeasure();
await page.waitForTimeout(800);

const cdp = await page.context().newCDPSession(page);
if (allocOut) { await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
if (profileOut) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
if (traceOut) await browser.startTracing(page, { path: traceOut, categories: ['devtools.timeline', 'v8', 'v8.execute', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'gpu'] });
const programsBefore = await page.evaluate(() => window.trapla.programs?.() ?? []);
const rebuildBefore = await page.evaluate(() => JSON.stringify(window.trapla.rebuildStats?.() ?? null));
measuring = true;
const moves = await drag(seconds, 80, shot, 0, () => page.evaluate(() => { window.__drag.on = true; window.__drag.start = performance.now(); }));
if (!(await page.evaluate(() => window.__drag.posts.size))) throw new Error(`the ${mode} drag changed nothing (no evaluation requested)`);
const tUp = await page.evaluate(() => performance.now());
await page.evaluate(() => window.trapla.whenIdle());
const tIdle = await page.evaluate(() => performance.now());
const rebuild = await page.evaluate(() => window.trapla.rebuildStats?.());
measuring = false;
// (the full result after release drawn: its 3D rebuild committed, a new one's stats)
const redrawn = rebuild === undefined || JSON.stringify(rebuild) !== rebuildBefore;
await page.waitForTimeout(300);
const programsAfter = await page.evaluate(() => window.trapla.programs?.() ?? []);
// three.js numbers programs in creation order: any id above the highest before the drag was
// compiled during it (even if deleted again since)
const pid = (p) => Number(p.split(':')[0]);
const maxBefore = Math.max(-1, ...programsBefore.map(pid));
const compiledCount = programsAfter.length ? Math.max(-1, ...programsAfter.map(pid)) - maxBefore : 0;
const compiled = compiledCount > 0 ? programsAfter.filter((p) => pid(p) > maxBefore).concat(compiledCount > programsAfter.filter((p) => pid(p) > maxBefore).length ? ['(+ deleted again)'] : []) : [];
await page.waitForTimeout(300);
const D = await page.evaluate(() => { const D = window.__drag; D.on = false; return { ...D, posts: [...D.posts] }; });
if (traceOut) await browser.stopTracing();
await afterMeasure();
if (allocOut) { const { profile } = await cdp.send('HeapProfiler.stopSampling'); writeFileSync(allocOut, JSON.stringify(profile)); }
if (profileOut) { const { profile } = await cdp.send('Profiler.stop'); writeFileSync(profileOut, JSON.stringify(profile)); }

const q = (arr, f) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
const posts = new Map(D.posts);
const dragFrames = D.frames.filter((t) => t >= D.start && t <= tUp);
const intervals = dragFrames.slice(1).map((t, i) => t - dragFrames[i]);
const during = D.results.filter((r) => r.t0 <= tUp);
const lat = (rs) => rs.filter((r) => posts.has(r.id)).map((r) => r.t1 - posts.get(r.id));
const handler = (rs) => rs.map((r) => r.t1 - r.t0);
const fmt = (a) => a.length ? `p50 ${q(a, 0.5).toFixed(0)} / p95 ${q(a, 0.95).toFixed(0)} / max ${Math.max(...a).toFixed(0)} ms` : '—';
const previews = during.filter((r) => r.preview), full = D.results.filter((r) => !r.preview);
const parts = (rs) => {
  const sum = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.parts ?? {})) sum[k] = (sum[k] ?? 0) + v / rs.length;
  return Object.entries(sum).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ') || '—';
};
const dragLong = D.longtasks.filter((e) => e.t <= tUp), afterLong = D.longtasks.filter((e) => e.t > tUp);
const shownAt = during.map((r) => r.t1);
// from the first evaluation request (the pointer's first move), not from the probe's mouse-down
const first = Math.min(...posts.values());
const gaps = [...shownAt, tUp].map((t, i, a) => ({ at: (i ? a[i - 1] : first) - D.start, gap: t - (i ? a[i - 1] : first), full: i < during.length && !during[i].preview }));
const resultGap = Math.max(0, ...gaps.map((g) => g.gap));
if (process.env.DRAG_DEBUG) console.log('previews (worker ms, latency ms, handler ms)', JSON.stringify(previews.map((r) => [Math.round(r.worker ?? -1), Math.round(r.t0 - posts.get(r.id)), Math.round(r.t1 - r.t0)])));
if (process.env.DRAG_DEBUG) { // the preview worker's phases (cumulative ms, median) and counters
  const keys = [...new Set(previews.flatMap((r) => Object.keys(r.timing ?? {})))];
  console.log('preview timing (median)', keys.map((k) => `${k} ${q(previews.map((r) => r.timing?.[k]).filter((v) => v !== undefined), 0.5)?.toFixed?.(1)}`).join(' '));
}
if (process.env.DRAG_DEBUG) console.log('gaps', JSON.stringify(gaps.filter((g) => g.gap > 60).map((g) => [Math.round(g.at), Math.round(g.gap), g.full])));
const out = {
  mode, renderer, moves, evalsPosted: posts.size, resultsDuringDrag: during.length, previewResults: previews.length,
  frames: dragFrames.length, framesPerSec: dragFrames.length / ((tUp - D.start) / 1000),
  frame: fmt(intervals), framesOver50: intervals.filter((v) => v > 50).length,
  handlerAll: fmt(handler(D.results)), handlerPartsFull: parts(full), handlerPartsPreview: parts(previews), handlerPreview: fmt(handler(previews)), handlerFull: fmt(handler(full)),
  workerAll: fmt(D.results.map((r) => r.worker).filter((v) => v !== undefined)),
  latencyDuringDrag: fmt(lat(during)), latencyPreview: fmt(lat(previews)),
  settleAfterRelease: `${(tIdle - tUp).toFixed(0)} ms`,
  fullRebuild: rebuild ? `${rebuild.slices} slices, busy ${rebuild.busy.toFixed(0)} ms, longest slice ${rebuild.maxSlice.toFixed(0)} ms, commit ${rebuild.commit.toFixed(0)} ms (view ${rebuild.commitView?.toFixed(0)}, crossings ${rebuild.commitCrossings?.toFixed(0)}, overlays ${rebuild.overlays?.toFixed(0)}), wall ${rebuild.wall.toFixed(0)} ms` : '—',
  programsCompiled: compiled.length ? compiled.join(', ') : 'none',
  longtasksDrag: `${dragLong.length} (sum ${dragLong.reduce((a, e) => a + e.d, 0).toFixed(0)} ms over ${(tUp - D.start).toFixed(0)} ms drag)`,
  longtasksAfterRelease: `${afterLong.length} (sum ${afterLong.reduce((a, e) => a + e.d, 0).toFixed(0)} ms until settled + 300 ms)`,
  maxResultGap: `${resultGap.toFixed(0)} ms between displayed results during the drag`,
};
console.log(JSON.stringify(out, null, 1));
if (check) {
  // Budgets (ms). GPU: what the player sees. SwiftShader rasterises the whole scene on the CPU
  // (frames of ~0.5 s regardless of the app), so there only main-thread work is checked.
  const env = (k, d) => Number(process.env[k] ?? d);
  const budget = gpu
    ? { frameP95: env('DRAG_FRAME_P95', 34), latencyP50: env('DRAG_LATENCY_P50', 60), latencyP95: env('DRAG_LATENCY_P95', 120), handlerP95: env('DRAG_HANDLER_P95', 25) }
    : { frameP95: Infinity, latencyP50: env('DRAG_LATENCY_P50', 150), latencyP95: env('DRAG_LATENCY_P95', 300), handlerP95: env('DRAG_HANDLER_P95', 50) };
  const lp = lat(previews.length ? previews : during), hp = handler(previews.length ? previews : during);
  const fails = [];
  const over = (what, v, max) => { if (!(v <= max)) fails.push(`${what} ${v.toFixed(0)} ms > ${max}`); };
  over('p95 frame', q(intervals, 0.95), budget.frameP95);
  // (a stretch's end evaluates nothing while it moves: only the frames and the release are measured)
  if (mode !== 'ends') {
    over('median preview latency', q(lp, 0.5), budget.latencyP50);
    over('p95 preview latency', q(lp, 0.95), budget.latencyP95);
    over('p95 main-thread time per preview result', q(hp, 0.95), budget.handlerP95);
  } else if (during.length) fails.push(`${during.length} evaluation(s) during the end's drag`);
  if (dragLong.length) fails.push(`${dragLong.length} long task(s) ≥ 50 ms during the drag`);
  if (afterLong.length) fails.push(`${afterLong.length} long task(s) ≥ 50 ms after release`);
  if (mode !== 'ends') over('longest gap between displayed results', resultGap, env('DRAG_RESULT_GAP', gpu ? 250 : 1000));
  if (compiled.length) fails.push(`shader programs compiled during the drag: ${compiled.join(', ')}`);
  if (failures.length) fails.push(`errors during the drag: ${failures.join('; ')}`);
  if (!redrawn) fails.push('the full result after release was not drawn (no 3D rebuild committed)');
  if (fails.length) { console.log('FAIL:', fails.join('; ')); process.exitCode = 1; }
  else console.log('OK');
}
} finally { await game.close(); }
