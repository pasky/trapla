// Serialized GPU/browser slot required. Plays the motorway / railway features as a player would, with the
// real mouse: the railway mission (its card, double track, a bend dragged), Build → Railway (one end on a
// mapped railway, one on open ground), a mapped railway rebuilt by dragging it, and Build → Motorway.
// Prints what the player sees (score, issues, card text) at each step; screenshots in /tmp/trapla-mode-play.
// node scripts/mode-play.mjs [--gpu]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const out = '/tmp/trapla-mode-play';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5296, strictPort: true }, logLevel: 'warn' });
await server.listen();
let browser, n = 0;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: process.argv.includes('--gpu')
    ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const idle = async () => {
    await page.evaluate(() => window.trapla.whenIdle());
    await page.evaluate(() => new Promise(r => { const f = () => requestAnimationFrame(() => window.trapla.viewBusy() ? f() : r()); requestAnimationFrame(f); }));
    await page.waitForTimeout(400);
  };
  const shot = async name => { await idle(); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); console.log('shot', name); };
  const seen = async (label) => {
    const s = await page.evaluate(() => {
      const p = window.trapla.projectResult();
      return { total: p?.cost.total, valid: p?.valid, unpriced: p?.cost.unpriced.map(u => u.reason),
        issues: p?.issues.map(i => `${i.violation.title} | ${i.violation.fix}`).slice(0, 8),
        score: document.querySelector('#score')?.textContent?.replace(/\s+/g, ' ').trim(),
        card: document.querySelector('#inspector')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 400), active: window.trapla.activeRoute() };
    });
    console.log(label, JSON.stringify(s));
    return s;
  };
  const box = await (async () => null)();
  void box;
  const open = async (query) => {
    await page.goto(`http://localhost:5296/?${query}`);
    await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('trapla.intro.v2', '1'); });
    await page.reload();
    await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
    await idle();
  };
  const at = async (fn, ...args) => {
    const b = await page.locator('#view').boundingBox();
    const p = await page.evaluate(([fn, args]) => window.trapla[fn](...args), [fn, args]);
    assert(p?.vis, `${fn}(${args}) on screen`);
    return { x: b.x + p.sx, y: b.y + p.sy };
  };

  // 1. the start screen: the railway card, then the mission
  await page.goto('http://localhost:5296/');
  await page.waitForSelector('.scenario-picker-card');
  const cards = await page.locator('.scenario-picker-card :is(h2, h3)').allTextContents();
  console.log('cards', JSON.stringify(cards));
  assert(cards.includes('Railway: Trutnov → Královec') && !cards.includes('Railway: Trutnov → Polish border'));
  await open('scenario=d11&preset=d11-rail-kralovec');
  const start = await seen('mission');
  assert.equal(start.valid, true);
  await shot('mission');
  // its settings card: double track instead of single
  await page.evaluate(() => { const b = document.querySelector('#sec-design .fold-h button'); if (b?.getAttribute('aria-expanded') === 'false') b.click(); });
  console.log('types', JSON.stringify(await page.locator('#cat option').allTextContents()), 'speeds', JSON.stringify(await page.locator('#speed option').allTextContents()),
    'norms', await page.locator('#norms').textContent());
  await page.selectOption('#cat', 'R2'); await idle();
  const double = await seen('double track');
  assert(double.total > start.total, 'double track costs more');
  await shot('double-track');
  await page.locator('#undo').click(); await idle();
  // drag the middle bend 300 px sideways
  await page.evaluate(() => { const d = window.trapla.getDesign(); const p = d.pis[1]; window.trapla.lookAt(p.x, p.y, 3000, 20, 50); window.trapla.selectPi(1); });
  await idle();
  // (the marker is placed by the view's next frame: on a busy host that can be later than idle() waits, and a
  // drag from its old place ends somewhere else. Wait until it sits on its bend.)
  let pi = null;
  for (let k = 0; k < 150 && !pi; k++) {
    const box = await page.locator('.pi[data-i="1"]').filter({ visible: true }).first().boundingBox();
    const [want, view] = [await page.evaluate(() => { const b = window.trapla.getDesign().pis[1]; return window.trapla.groundScreen(b.x, b.y); }), await page.locator('#view').boundingBox()];
    if (box && Math.abs(box.x + box.width / 2 - view.x - want.sx) < 2 && Math.abs(box.y + box.height / 2 - view.y - want.sy) < 2) pi = box; else await page.waitForTimeout(100);
  }
  assert(pi, 'the bend marker sits on its bend');
  await page.mouse.move(pi.x + pi.width / 2, pi.y + pi.height / 2); await page.mouse.down();
  await page.mouse.move(pi.x + pi.width / 2 - 120, pi.y + pi.height / 2 + 40, { steps: 15 }); await page.mouse.up();
  await idle(); // (without it this read whatever was shown when the mouse came up: on a busy host a preview, and the full result of a pause mid-drag)
  await seen('bend dragged');
  await shot('bend-dragged');
  await page.locator('#undo').click(); await idle();

  // 2. Build → Railway: one end on a mapped railway, the other on open ground
  await page.evaluate(() => window.trapla.whenTransport());
  await page.evaluate(() => window.trapla.lookAtSource('osm:way:277838071', 1600, 2500)); await idle();
  await page.locator('#build-route').click();
  console.log('build menu', JSON.stringify(await page.locator('.route-build-choices button').allTextContents()));
  await page.locator('.route-build-choices button', { hasText: 'Railway' }).click();
  let p = await at('sourceScreen', 'osm:way:277838071', 1600);
  console.log('placement on railway', JSON.stringify(await page.evaluate(([x, y]) => window.trapla.placementAt(x, y), [p.x, p.y])));
  await page.mouse.click(p.x, p.y); await idle();
  const free = { x: p.x + 250, y: p.y - 150 };
  console.log('placement on ground', JSON.stringify(await page.evaluate(([x, y]) => window.trapla.placementAt(x, y), [free.x, free.y])));
  await page.mouse.click(free.x, free.y); await idle();
  const built = await seen('built railway');
  assert.equal((await page.evaluate(() => window.trapla.getProject())).routes.at(-1).kind, 'railway');
  assert.equal(await page.locator('#remove-route').textContent(), 'Remove railway');
  await shot('built-railway');
  await page.locator('#undo').click(); await idle();

  // 3. a mapped railway, not selected: the pointer says it can be dragged, and a drag rebuilds it
  p = await at('sourceScreen', 'osm:way:277838071', 1600);
  await page.mouse.move(p.x - 3, p.y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.querySelector('#view canvas').style.cursor), 'grab', 'an unselected railway can be grabbed');
  await page.mouse.down(); await page.mouse.move(p.x + 40, p.y - 30, { steps: 12 }); await page.mouse.up(); await idle();
  const project = await page.evaluate(() => window.trapla.getProject());
  console.log('rebuilt', JSON.stringify(project.routes.map(r => [r.kind, r.name, r.source?.intervals[0]])));
  const rebuilt = await seen('rebuilt railway');
  // its own card: what it is, its works (the kept old track), and keeping the old track instead; its ends
  // continue the old track (checked, not a pending junction)
  assert(!rebuilt.unpriced.includes('connection-pending'), 'a rebuilt railway continues its old track');
  const head = page.locator('.route-head').first();
  const headText = (await head.textContent()).replace(/\s+/g, ' ');
  console.log('railway card', headText);
  assert(/Rebuilt stretch/.test(headText) && /old track/.test(headText) && !/old road|Traffic/.test(headText), 'a railway card in railway words');
  assert(/kept as it is/.test(await head.locator('.route-works').textContent()), 'its works list the kept old track');
  assert.equal(await page.locator('#remove-route').textContent(), 'Keep the old track');
  await shot('rebuilt-railway');
  await page.locator('#remove-route').click(); await idle();
  assert(!(await page.evaluate(() => window.trapla.getProject())).routes.some(r => r.kind === 'railway' && r.source), 'the old track is kept');
  assert.equal(await page.locator('#toast span').textContent(), 'The old track is kept.');
  await page.locator('#toast button', { hasText: 'Undo' }).click(); await idle();
  assert((await page.evaluate(() => window.trapla.getProject())).routes.some(r => r.kind === 'railway' && r.source), 'Undo brings the rebuilt stretch back');
  await page.locator('#undo').click(); await idle();

  // 4. Build → Motorway on open ground
  await page.evaluate(() => window.trapla.lookAt(9000, 4500, 4000, 0, 60)); await idle();
  await page.locator('#build-route').click();
  await page.locator('.route-build-choices button', { hasText: 'Motorway' }).click();
  const b = await page.locator('#view').boundingBox();
  for (const [fx, fy] of [[0.3, 0.6], [0.7, 0.35]]) {
    const q = { x: b.x + b.width * fx, y: b.y + b.height * fy };
    console.log('motorway end', JSON.stringify(await page.evaluate(([x, y]) => window.trapla.placementAt(x, y), [q.x, q.y])));
    await page.mouse.click(q.x, q.y); await idle();
  }
  const mw = await page.evaluate(() => window.trapla.getProject());
  console.log('motorway', JSON.stringify(mw.routes.map(r => [r.kind, r.name, r.role]), mw.corridors.length));
  await seen('built motorway');
  await shot('built-motorway');
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  if (browser) await browser.close();
  await server.close();
}
