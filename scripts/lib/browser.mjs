// Shared start-up and waits for the headless browser scripts (new ones should start here; 17 older ones
// carry their own copies and move over when they are next touched):
//
//   import { startGame } from './lib/browser.mjs';
//   const game = await startGame();                 // vite on a free port + Chromium (--gpu / GPU=1: the real GPU)
//   try {
//     const { page } = game;
//     await game.open('scenario=d11');              // fresh storage, no first-run intro, loaded and idle
//     …real mouse and keyboard…; await game.idle(); // evaluation settled, 3D scene up, a frame drawn
//     await game.still();                           // …and the camera has stopped (after a flight)
//   } finally { await game.close(); }
//
// What it settles for every script: the port (PORT, else the first free one from 5300: fixed strict ports
// collided between worktrees), the intro's storage key (15 scripts set only the retired `trapla.intro.v1`
// and so ran with the intro open), browser errors in `game.errors` (uncaught ones alone in
// `game.pageErrors`), and waits that hold on a busy host (fixed pauses measured the camera mid-flight and
// labels before their first frame).
// A script that times the first load (perf, startup-perf, drag-perf) navigates itself, once, after
// `dismissIntro(page)`; `open()` loads twice.
// Lock protocol and "run from a clean checkout": AGENTS.md; scripts/gates.sh does both for the gates.
// DIST=dist (a built site): served by a plain static server under /trapla/ instead of Vite (scripts/release.sh).
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { serveStatic } from '../static-serve.mjs';

/** the first-run intro's storage key (src/ui/intro.ts KEY) */
export const INTRO_KEY = 'trapla.intro.v2';
/** what older checkouts read (scripts with `--root <older checkout>`) */
const OLD_INTRO_KEYS = ['trapla.intro.v1'];
const SOFTWARE = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const GPU = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'];

/** the first-run intro never shows on this page, whatever it loads (set before the page's own code runs, on every
 *  load); for scripts that navigate themselves: `open()` dismisses it once instead, so a script can bring it back */
export const dismissIntro = (page) => page.addInitScript((keys) => {
  try { for (const key of keys) localStorage.setItem(key, '1'); } catch { /* opaque origin */ }
}, [INTRO_KEY, ...OLD_INTRO_KEYS]);

/** the built site on the first free port from `port`, shaped like a Vite server for the scripts (resolvedUrls, close) */
async function staticServer(dir, port) {
  for (let p = port; ; p++) {
    try {
      const s = await serveStatic({ dir, port: p, gzEncoded: process.env.GZ_ENCODED === '1' });
      return { resolvedUrls: { local: [s.url] }, close: s.close };
    } catch (error) { if (error.code !== 'EADDRINUSE' || p > port + 100) throw error; }
  }
}

/** `args`: Chromium flags on top of the GPU / software ones */
export async function startGame({ root = process.cwd(), gpu = process.argv.includes('--gpu') || process.env.GPU === '1',
  viewport = { width: 1600, height: 1000 }, port = Number(process.env.PORT ?? 5300), args = [] } = {}) {
  const server = process.env.DIST ? await staticServer(process.env.DIST, port)
    : await createServer({ root, server: { port, strictPort: false }, logLevel: 'warn' });
  if (!process.env.DIST) await server.listen();
  let browser;
  try { browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: [...(gpu ? GPU : SOFTWARE), ...args] }); }
  catch (error) { await server.close(); throw error; }
  const page = await browser.newPage({ viewport });
  const errors = [], pageErrors = [];
  page.on('pageerror', (e) => { errors.push(e.message); pageErrors.push(e.message); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const base = server.resolvedUrls.local[0];
  const loaded = () => page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
  /** the evaluation has settled, the 3D scene is up and drawn; `ms`: a pause on top (CSS transitions) */
  const idle = async (ms = 0) => {
    await page.evaluate(() => window.trapla.whenIdle());
    await page.evaluate(() => new Promise((r) => { const f = () => requestAnimationFrame(() => (window.trapla.viewBusy() ? f() : r())); requestAnimationFrame(f); }));
    if (ms) await page.waitForTimeout(ms);
  };
  /** n frames have been drawn (markers and labels are placed by the view's next frame) */
  const frames = (n = 2) => page.evaluate((n) => new Promise((r) => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); }), n);
  /** the camera has stopped moving (a flight takes a few frames, many on a busy host) and a frame was drawn since */
  const still = async () => {
    let last = '', same = 0;
    for (let k = 0; k < 150 && same < 3; k++) {
      await page.waitForTimeout(150);
      const now = JSON.stringify(await page.evaluate(() => { const p = window.trapla.cameraPose(), t = window.trapla.cameraTarget(); return [p.distance, p.pitch, t.x, t.y].map((v) => Math.round(v * 100)); }));
      same = now === last ? same + 1 : 0; last = now;
    }
    await frames(2);
  };
  /** the pointer out of the picture before a shot: at the side panel's corner, where nothing answers it (the
   *  map's corner can lie on a mapped road or a bend, which answer with a tip) */
  const park = () => page.mouse.move(viewport.width - 4, viewport.height - 4);
  /** load the game at `?query` (already there: load it again); `fresh`: with empty storage; `intro`: leave the
   *  first-run intro to show */
  const open = async (query = 'scenario=d11', { fresh = true, intro = false } = {}) => {
    const url = `${base}?${query}`;
    if (page.url() !== url) { await page.goto(url); await loaded(); }
    await page.evaluate(([fresh, intro, key]) => { if (fresh) localStorage.clear(); if (!intro) localStorage.setItem(key, '1'); }, [fresh, intro, INTRO_KEY]);
    await page.reload();
    await loaded();
    await idle();
  };
  return { server, browser, page, errors, pageErrors, base, open, idle, frames, still, park, close: async () => { await browser.close(); await server.close(); } };
}

/** `ok(condition, what)`: prints PASS / FAIL, counts failures and makes the process exit 1 on any */
export function checker() {
  let failed = 0;
  const ok = (condition, message) => { console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`); if (!condition) { failed++; process.exitCode = 1; } };
  return { ok, get failed() { return failed; } };
}
