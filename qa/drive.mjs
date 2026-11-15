// Interactive QA driver: one vite + one headless Chromium kept alive; POST JS to http://127.0.0.1:$CTL
// executed as an async function body with (page, shot, T, idle, S) in scope; returns JSON of the result.
//   node qa/drive.mjs [--gpu]   (PORT=5291 CTL=5292 OUT=/tmp/trapla-qa)
import { mkdirSync } from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const PORT = Number(process.env.PORT ?? 5291), CTL = Number(process.env.CTL ?? 5292);
const OUT = process.env.OUT ?? '/tmp/trapla-qa';
mkdirSync(OUT, { recursive: true });
const gpu = process.argv.includes('--gpu');
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const args = gpu
  ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const log = [];
page.on('pageerror', (e) => log.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(m.type() + ' ' + m.text()); });
const T = (fn, arg) => page.evaluate(fn, arg);
const idle = async (ms = 200) => {
  try {
    await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
    await T(() => window.trapla.whenIdle());
    await T(() => new Promise((res) => { const f = () => requestAnimationFrame(() => (window.trapla.viewBusy() ? f() : res())); requestAnimationFrame(() => requestAnimationFrame(f)); }));
  } catch (e) { log.push('idle: ' + e.message); }
  await page.waitForTimeout(ms);
};
let n = 0;
const shot = async (name, opts = {}) => { const f = `${OUT}/${String(n++).padStart(3, '0')}-${name}.png`; await page.screenshot({ path: f, ...opts }); return f; };
const S = {}; // scratch state between commands
const base = `http://localhost:${PORT}/`;
http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  let out;
  try {
    const fn = new Function('page', 'shot', 'T', 'idle', 'S', 'base', 'log', `return (async () => { ${body} })();`);
    out = await fn(page, shot, T, idle, S, base, log);
  } catch (e) { out = { error: String(e?.stack ?? e) }; }
  const errs = log.splice(0);
  res.end(JSON.stringify({ out, errs }, null, 1) + '\n');
  if (body.trim() === 'QUIT') { await browser.close(); await server.close(); process.exit(0); }
}).listen(CTL, '127.0.0.1');
console.log(`ready: app ${base}, control 127.0.0.1:${CTL}, shots ${OUT}`);
