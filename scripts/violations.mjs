// HUD screenshot of typical violations: two bends too close for a hand-set radius, a too steep grade and
// the grade too low over a river / railway. Prints the messages; screenshot to OUT (default /tmp).
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const PORT = Number(process.env.PORT ?? 5198);
const OUT = process.env.OUT ?? '/tmp/trapla-violations.png';
const demo = JSON.parse(readFileSync(new URL(process.env.DESIGN ?? './demo-design.json', import.meta.url))).design;
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
// the first-run intro would cover the map in the screenshots
await page.addInitScript(() => { try { localStorage.setItem('trapla.intro.v1', '1'); } catch { /* opaque origin */ } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
await page.evaluate(() => window.trapla.whenIdle());

const msgs = await page.evaluate(async (demo) => {
  const t = window.trapla;
  t.setDesign(demo);
  await t.whenIdle();
  // 1. bend 10 set by hand to six times its automatic radius
  let d = t.getDesign(), r = t.result();
  d.pis[9].r = Math.round(r.curves[9].rEff * 6 / 5) * 5;
  t.setDesign(d);
  await t.whenIdle();
  // 2. take over the profile and 3. find a river / railway crossing: a grade line on the ground everywhere
  // shows where they are; then keep the automatic grade line except for a dip to the ground at one
  // of them (which makes a too steep grade next to it, too)
  r = t.result();
  const auto = r.vpis.map((v) => ({ ...v }));
  const ground = (s) => r.ground[Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds)))];
  d = t.getDesign();
  d.profileMode = 'manual';
  d.vpis = [auto[0]];
  for (let s = 200; s < r.length - 200; s += 200) d.vpis.push({ s, z: ground(s), r: null });
  d.vpis.push(auto[auto.length - 1]);
  t.setDesign(d);
  await t.whenIdle();
  const xs = t.summary().violations.filter((v) => v.kind === 'crossing');
  const xing = xs.find((v) => /river/.test(v.title)) ?? xs.find((v) => /railway/.test(v.title));
  d = t.getDesign();
  d.vpis = auto.filter((v, k) => k === 0 || k === auto.length - 1 || !xing || Math.abs(v.s - xing.s0) > 160);
  if (xing) d.vpis.push({ s: xing.s0, z: ground(xing.s0) + 1, r: null });
  d.vpis.sort((p, q) => p.s - q.s);
  t.setDesign(d);
  await t.whenIdle();
  return t.summary().violations.map((v) => ({ km: (v.s0 / 1000).toFixed(2), kind: v.kind, basis: v.basis, title: v.title, fix: v.fix, detail: v.detail, rule: v.rule }));
}, demo);
for (const m of msgs) console.log(JSON.stringify(m));
// unfold the explanation of the first one, select bend 10 so the map label shows its headline too
await page.evaluate(() => { document.querySelector('#viol .why')?.click(); window.trapla.selectPi(9); });
await page.evaluate(() => window.trapla.whenIdle());
const box = await page.evaluate(() => { const r = document.querySelector('#viol').closest('section').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await page.evaluate(() => document.querySelector('#viol').closest('section').scrollIntoView());
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT });
await page.evaluate(() => { document.querySelector('#viol').style.maxHeight = 'none'; });
await page.waitForTimeout(300);
await page.screenshot({ path: OUT.replace(/\.png$/, '-hud.png'), clip: await page.evaluate(() => { const r = document.querySelector('#viol').closest('section').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 900) }; }) });
console.log('screenshots:', OUT, OUT.replace(/\.png$/, '-hud.png'), JSON.stringify(box));
if (errors.length) { console.log('page errors:', errors); process.exitCode = 1; }
await browser.close();
await server.close();
