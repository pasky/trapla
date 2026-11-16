// Untimed browser play of one motorway direction on its own (playtest P0 #3 / P1 #11):
// D3 motorway → the motorway's own card → Towards Václavice (nothing changes) → drag that carriageway
// between two bends → only that stretch runs apart → Join.
// flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/stretch-play.mjs [--gpu]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const out = '/tmp/trapla-stretch';
mkdirSync(out, { recursive: true });
const gpu = process.argv.includes('--gpu');
const server = await createServer({ server: { port: 5297, strictPort: true }, logLevel: 'warn' });
let browser, n = 0;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium',
    args: gpu ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => localStorage.setItem('trapla.intro.v2', '1'));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const settle = async () => {
    await page.evaluate(() => window.trapla.whenIdle());
    await page.evaluate(() => new Promise(resolve => { const tick = () => requestAnimationFrame(() => window.trapla.viewBusy() ? tick() : resolve()); requestAnimationFrame(tick); }));
    await page.waitForTimeout(500);
  };
  const shot = async name => { await settle(); const path = `${out}/${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path }); console.log('shot', path); };
  const state = () => page.evaluate(() => {
    const p = window.trapla.projectResult(), d = window.trapla.getProject(), c = d.corridors[0];
    return { total: p?.cost.total && Math.round(p.cost.total / 1e6), valid: p?.valid, unpriced: p?.cost.unpriced?.length,
      issues: p?.issues.map(i => `${Math.round(i.locations[0]?.s0 ?? 0)} ${i.violation.title}`), active: window.trapla.activeRoute(),
      stretches: c?.stretches?.map(t => `${t.id.slice(0, 12)} k${t.k0}-${t.k1} ${Math.round(t.a)}–${Math.round(t.b)} ${t.forward ? 'F' : ''}${t.reverse ? 'R' : ''}`) ?? [],
      card: document.querySelector('.motorway-head')?.textContent?.replace(/\s+/g, ' ').trim() };
  });
  await page.goto('http://localhost:5297/?scenario=d3&preset=d3-motorway');
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180_000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180_000 });
  await settle();
  const start = await state();
  console.log('start', JSON.stringify(start));
  await shot('start');
  // the motorway's own card offers the direction switch (nothing selected)
  await page.locator('.motorway-head [data-dir="forward"]').click();
  await settle();
  const picked = await state();
  console.log('picked', JSON.stringify(picked));
  if (picked.total !== start.total || picked.stretches.length) throw new Error('choosing a direction changed the design');
  await shot('picked');
  // drag the carriageway between bends 3 and 4 (shown order) sideways, the way a player bends a road
  const k = 2;
  const target = await page.evaluate(k => {
    const d = window.trapla.getDesign(), p = d.pis[k], q = d.pis[k + 1], r = window.trapla.result();
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    let best = 0, bd = Infinity;
    for (let i = 0; i < r.n; i++) { const dd = (r.x[i] - mx) ** 2 + (r.y[i] - my) ** 2; if (dd < bd) { bd = dd; best = i; } }
    window.trapla.lookAt(r.x[best], r.y[best], 1500, 20, 60);
    return { s: r.s[best] };
  }, k);
  await settle();
  const box = await page.locator('#view canvas').first().boundingBox();
  // the grab point on the forward carriageway and the way away from the other direction (its right)
  const [p, q] = await page.evaluate(([s, away]) => {
    const r = window.trapla.result(), i = Math.round(s / r.ds), z = r.grade[i] + 1.5;
    const nx = r.ty[i], ny = -r.tx[i];
    return [window.trapla.screenOf(r.x[i] + nx * 6.9, r.y[i] + ny * 6.9, z), window.trapla.screenOf(r.x[i] + nx * (6.9 + away), r.y[i] + ny * (6.9 + away), z)];
  }, [target.s, Number(process.env.AWAY ?? 120)]);
  const at = { x: box.x + p.sx, y: box.y + p.sy }, to = { x: box.x + q.sx, y: box.y + q.sy };
  await page.mouse.move(at.x, at.y); await page.mouse.down();
  for (let j = 1; j <= 20; j++) { await page.mouse.move(at.x + (to.x - at.x) * j / 20, at.y + (to.y - at.y) * j / 20); await page.waitForTimeout(30); }
  await page.mouse.up();
  await settle();
  const bent = await state();
  console.log('bent', JSON.stringify(bent));
  await shot('bent');
  await page.evaluate(s => { const r = window.trapla.result(), i = Math.round(s / r.ds); window.trapla.lookAt(r.x[i], r.y[i], 700, 40, 45); }, target.s);
  await shot('bent-close');
  await page.keyboard.press('Escape');
  await settle();
  const join = page.locator('.motorway-head .apart-row button').first();
  if (await join.count()) { await join.click(); await settle(); }
  const joined = await state();
  console.log('joined', JSON.stringify(joined));
  if (joined.total !== start.total) throw new Error('joining did not restore the paired price');
  await shot('joined');
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  if (browser) await browser.close();
  await server.close();
}
