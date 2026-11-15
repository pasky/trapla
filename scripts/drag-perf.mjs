// Interactive drag probe: a real mouse drag of one bend on best-design for ~2 s, measuring what
// the player feels — frame intervals, main-thread time per worker result, worker time and the
// latency from the pointer move (eval posted) to the handled result. Works on older commits too
// (instrumentation wraps the page's Worker; nothing in the app is required).
//
//   node scripts/drag-perf.mjs [--root DIR] [--gpu] [--profile out.cpuprofile] [--trace out.json]
//        [--design scripts/best-design.json] [--bend 9] [--seconds 2] [--check]
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
// warm-up: a short drag so JIT / shader programs are not first-use (the owner drags repeatedly)
// the selected bend is drawn first and never shrinks to a dot; grab it where no other overlay
// element (culvert / wall symbols) covers it
await page.evaluate((i) => window.trapla.selectPi(i), bend);
await page.waitForTimeout(300);
const centre = async () => {
  const box = await page.locator(`.pi[data-i="${bend}"]`).boundingBox();
  if (!box) throw new Error(`bend ${bend} has no marker on screen`);
  const at = await page.evaluate(([b, i]) => {
    for (const [fx, fy] of [[.5, .5], [.3, .3], [.7, .3], [.3, .7], [.7, .7], [.5, .2], [.5, .8], [.2, .5], [.8, .5]]) {
      const x = b.x + b.width * fx, y = b.y + b.height * fy, e = document.elementFromPoint(x, y);
      if (e?.closest(`.pi[data-i="${i}"]`)) return { x, y };
    }
    return null;
  }, [box, bend]);
  if (!at) throw new Error(`bend ${bend}'s marker is covered by other overlay elements`);
  return at;
};
const drag = async (secs, radius, shotAt = null) => {
  const c = await centre();
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  const t0 = Date.now();
  let k = 0;
  // pointer moves on a fixed 60 Hz timeline (late moves jump ahead, as a real mouse would)
  while (Date.now() - t0 < secs * 1000) {
    const u = (Date.now() - t0) / 1000;
    const a = u * Math.PI * 2 / secs;
    await page.mouse.move(c.x + radius * Math.sin(a), c.y + radius * (1 - Math.cos(a)) * 0.6);
    k++;
    if (shotAt && Date.now() - t0 > secs * 500) { await page.screenshot({ path: shotAt }); shotAt = null; }
    const next = t0 + k * 16.7;
    if (next > Date.now()) await page.waitForTimeout(next - Date.now());
  }
  await page.mouse.up();
  return k;
};
await drag(0.6, 30);
await page.evaluate(() => window.trapla.whenIdle());
await page.waitForTimeout(800);

const cdp = await page.context().newCDPSession(page);
if (profileOut) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
if (traceOut) await browser.startTracing(page, { path: traceOut, categories: ['devtools.timeline', 'v8', 'v8.execute', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'gpu'] });
await page.evaluate(() => { window.__drag.on = true; window.__drag.start = performance.now(); });
const moves = await drag(seconds, 80, shot);
if (!(await page.evaluate(() => window.__drag.posts.size))) throw new Error('the drag did not move the bend (no evaluation requested)');
const tUp = await page.evaluate(() => performance.now());
await page.evaluate(() => window.trapla.whenIdle());
const tIdle = await page.evaluate(() => performance.now());
const rebuild = await page.evaluate(() => window.trapla.rebuildStats?.());
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
const out = {
  renderer, moves, evalsPosted: posts.size, resultsDuringDrag: during.length, previewResults: previews.length,
  frames: dragFrames.length, framesPerSec: dragFrames.length / ((tUp - D.start) / 1000),
  frame: fmt(intervals), framesOver50: intervals.filter((v) => v > 50).length,
  handlerAll: fmt(handler(D.results)), handlerPartsFull: parts(full), handlerPartsPreview: parts(previews), handlerPreview: fmt(handler(previews)), handlerFull: fmt(handler(full)),
  workerAll: fmt(D.results.map((r) => r.worker).filter((v) => v !== undefined)),
  latencyDuringDrag: fmt(lat(during)), latencyPreview: fmt(lat(previews)),
  settleAfterRelease: `${(tIdle - tUp).toFixed(0)} ms`,
  fullRebuild: rebuild ? `${rebuild.slices} slices, busy ${rebuild.busy.toFixed(0)} ms, longest slice ${rebuild.maxSlice.toFixed(0)} ms, commit ${rebuild.commit.toFixed(0)} ms, wall ${rebuild.wall.toFixed(0)} ms` : '—',
  longtasks: `${D.longtasks.length} (sum ${D.longtasks.reduce((a, e) => a + e.d, 0).toFixed(0)} ms over ${(tUp - D.start).toFixed(0)} ms drag)`,
};
console.log(JSON.stringify(out, null, 1));
await browser.close();
await server.close();
if (check) {
  const p95 = q(intervals, 0.95), pl = q(lat(previews.length ? previews : during), 0.95);
  const frameBudget = gpu ? 33 : Number(process.env.SWIFTSHADER_FRAME_BUDGET ?? 120);
  const fails = [];
  if (!(p95 <= frameBudget)) fails.push(`p95 frame ${p95.toFixed(0)} ms > ${frameBudget}`);
  if (!(pl <= 60 * (gpu ? 1 : 2))) fails.push(`p95 preview latency ${pl.toFixed(0)} ms > ${60 * (gpu ? 1 : 2)}`);
  if (fails.length) { console.log('FAIL:', fails.join('; ')); process.exit(1); }
  console.log('OK');
}
