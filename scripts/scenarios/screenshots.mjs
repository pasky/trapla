// Serialized GPU/browser slot required. Captures actual scenario map, ends, noise and aerial view.
// node scripts/scenarios/screenshots.mjs d3 [--docs]
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// node scripts/scenarios/screenshots.mjs picker [--docs]: the integrated start screen (73)
const id = process.argv[2];
if (!['picker', 'd3', 'd35', 'i16-nova-paka'].includes(id)) throw new Error('Choose a new scenario or picker.');
const design = id === 'picker' ? null : JSON.parse(readFileSync(`scripts/scenarios/${id}/default.json`, 'utf8')).design;
const out = `/tmp/trapla-scenarios/${id}`;
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5292, strictPort: true }, logLevel: 'warn' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript(() => localStorage.setItem('trapla.intro.v2', '1'));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (id === 'picker') {
    await page.goto('http://localhost:5292/');
    await page.waitForSelector('.scenario-picker-card');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/picker.png` });
    if (process.argv.includes('--docs')) await page.screenshot({ path: 'docs/screenshots/73-scenario-picker.png' });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ id, out }));
    process.exit(0);
  }
  await page.goto(`http://localhost:5292/?scenario=${id}`);
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180_000 });
  await page.evaluate(d => window.trapla.setDesign(d), design);
  await page.evaluate(() => window.trapla.whenIdle());
  const summary = await page.evaluate(() => window.trapla.summary());
  if (!summary.valid) throw new Error(`Starter is invalid: ${JSON.stringify(summary.violations)}`);
  const settle = async () => {
    await page.evaluate(() => new Promise(resolve => {
      const tick = () => requestAnimationFrame(() => window.trapla.viewBusy() ? tick() : resolve());
      requestAnimationFrame(tick);
    }));
    await page.waitForTimeout(600);
  };
  const shot = async (name, docsName) => {
    await settle();
    await page.screenshot({ path: `${out}/${name}.png` });
    if (process.argv.includes('--docs') && docsName)
      await page.screenshot({ path: `docs/screenshots/${docsName}.png` });
  };
  await page.evaluate(() => window.trapla.resetCamera());
  await shot('overview', ({ d3: '74-d3-posazavi', d35: '75-d35-opatovec-stare-mesto', 'i16-nova-paka': '76-nova-paka' })[id]);
  for (const end of ['A', 'B']) {
    await page.evaluate(end => {
      const p = window.trapla[end]; window.trapla.lookAt(p.x, p.y, 1700, 20, 55);
    }, end);
    await shot(`endpoint-${end}`, id === 'i16-nova-paka' && end === 'B' ? '77-nova-paka-roundabout-junction' : null);
  }
  await page.evaluate(() => {
    const r = window.trapla.result(), i = Math.floor(r.n / 2);
    window.trapla.lookAt(r.x[i], r.y[i], 2400, 20, 55);
    window.trapla.setView({ noise: true, photo: false, contours: false });
  });
  await shot('noise');
  await page.evaluate(id => {
    window.trapla.setView({ noise: false, photo: true, contours: true });
    if (id === 'i16-nova-paka') {
      const origin = window.trapla.meta.origin;
      window.trapla.lookAt(-657686.367 - origin[0], -1008446.935 - origin[1], 1600, 0, 70);
    }
  }, id);
  await page.waitForTimeout(8000);
  await shot('photo', id === 'i16-nova-paka' ? '78-nova-paka-photo' : null);
  console.log(JSON.stringify({ id, valid: summary.valid, length: summary.length, cost: summary.cost.total, errors, out }));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  if (browser) await browser.close();
  await server.close();
}
