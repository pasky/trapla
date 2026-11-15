// Interactive drag probe: a real mouse drag of one bend on best-design for ~2 s, measuring what
// the player feels — frame intervals, main-thread time per worker result, worker time and the
// latency from the pointer move (eval posted) to the handled result. Works on older commits too
// (instrumentation wraps the page's Worker; nothing in the app is required).
//
//   node scripts/drag-perf.mjs [--root DIR] [--gpu] [--profile out.cpuprofile] [--trace out.json]
//        [--design scripts/best-design.json] [--mode bend|radius|pin|vpi] [--bend 9] [--seconds 2] [--check] [--shot out.png]
//
// --check: exit 1 when the thresholds below are missed (p95 frame on GPU, preview latency).
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1] ?? d; };
const root = arg('--root', process.cwd());
const gpu = process.argv.includes('--gpu');
const port = Number(arg('--port', 5197));
const designFile = arg('--design', 'scripts/best-design.json');
const mode = arg('--mode', 'bend'); // bend | radius (a grip) | pin (an Automatic height pin) | vpi (a height point)
const bend = Number(arg('--bend', 9));
const seconds = Number(arg('--seconds', 2));
const profileOut = arg('--profile'), traceOut = arg('--trace');
const check = process.argv.includes('--check');
const shot = arg('--shot'); // screenshot path, taken once in the middle of the measured drag (skews its timing)

// other agents / scripts may hold the port: take the next free one
const server = await createServer({ root, server: { port, strictPort: false }, logLevel: 'warn' });
await server.listen();
const url = server.resolvedUrls.local[0];
const args = gpu
  ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript(() => {
  try { localStorage.setItem('trapla.intro.v1', '1'); } catch { /* opaque origin */ }
  const D = window.__drag = { on: false, posts: new Map(), results: [], frames: [], longtasks: [], moves: [] };
  const Orig = window.Worker;
  window.Worker = class extends Orig {
    postMessage(m, t) { if (m && m.type === 'eval' && D.on) D.posts.set(m.id, performance.now()); return super.postMessage(m, t); }
    set onmessage(fn) {
      super.onmessage = (ev) => {
        const t0 = performance.now();
        fn(ev);
        const t1 = performance.now();
        const m = ev.data;
        if (D.on && m && m.type === 'result') D.results.push({ id: m.id, t0, t1, preview: !!(m.preview ?? m.result?.preview), worker: m.result?.timing?.total, parts: window.trapla?.handlerTiming?.() });
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
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text().slice(0, 300)); });
await page.goto(url);
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 180000 });
await page.evaluate(() => window.trapla.whenIdle());
const renderer = await page.evaluate(() => {
  const gl = document.querySelector('#view canvas').getContext('webgl2');
  const e = gl.getExtension('WEBGL_debug_renderer_info');
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
const design = JSON.parse(readFileSync(designFile, 'utf8')).design;
await page.evaluate((d) => window.trapla.setDesign(d), design);
await page.evaluate(() => window.trapla.whenIdle());
const pi = design.pis[bend];
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
let grab, path;
if (mode === 'bend') {
  // a loop around the bend's spot (the route length changes every step)
  grab = () => uncovered(`.pi[data-i="${bend}"]`);
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
    grab = async () => T(() => { const r = window.trapla.result(), v = r.vpis[Math.floor(r.vpis.length / 2)]; return window.trapla.profilePoint(v.s, v.z); });
  }
  path = (u, size) => ({ x: 0, y: -size * 0.4 * Math.sin(u * 2 * Math.PI) });
} else throw new Error(`unknown --mode ${mode}`);

const drag = async (secs, size, shotAt = null) => {
  const c = await grab();
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  const t0 = Date.now();
  let k = 0;
  // pointer moves on a fixed 60 Hz timeline (late moves jump ahead, as a real mouse would)
  while (Date.now() - t0 < secs * 1000) {
    const o = path((Date.now() - t0) / 1000 / secs, size);
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
await drag(0.6, 30);
await page.evaluate(() => window.trapla.whenIdle());
await page.waitForTimeout(800);

const cdp = await page.context().newCDPSession(page);
if (profileOut) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
if (traceOut) await browser.startTracing(page, { path: traceOut, categories: ['devtools.timeline', 'v8', 'v8.execute', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'gpu'] });
const programsBefore = await page.evaluate(() => window.trapla.programs?.() ?? []);
await page.evaluate(() => { window.__drag.on = true; window.__drag.start = performance.now(); });
const moves = await drag(seconds, 80, shot);
if (!(await page.evaluate(() => window.__drag.posts.size))) throw new Error(`the ${mode} drag changed nothing (no evaluation requested)`);
const tUp = await page.evaluate(() => performance.now());
await page.evaluate(() => window.trapla.whenIdle());
const tIdle = await page.evaluate(() => performance.now());
const rebuild = await page.evaluate(() => window.trapla.rebuildStats?.());
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
await browser.close();
await server.close();
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
  over('median preview latency', q(lp, 0.5), budget.latencyP50);
  over('p95 preview latency', q(lp, 0.95), budget.latencyP95);
  over('p95 main-thread time per preview result', q(hp, 0.95), budget.handlerP95);
  if (dragLong.length) fails.push(`${dragLong.length} long task(s) ≥ 50 ms during the drag`);
  if (afterLong.length) fails.push(`${afterLong.length} long task(s) ≥ 50 ms after release`);
  over('longest gap between displayed results', resultGap, env('DRAG_RESULT_GAP', gpu ? 250 : 1000));
  if (compiled.length) fails.push(`shader programs compiled during the drag: ${compiled.join(', ')}`);
  if (fails.length) { console.log('FAIL:', fails.join('; ')); process.exit(1); }
  console.log('OK');
}
