// Integrated Start / Continue / Start over for the new scenarios: the picker's Start opens the
// scenario's VALID starter; an edit survives a reload behind Continue; Start over restores the starter.
// node scripts/scenarios/start-check.mjs [--gpu]
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5298, strictPort: false }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: process.argv.includes('--gpu')
  ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  // The earlier Jílové → Václavice map is retired: no Start card without a save.
  {
    const page = await browser.newPage();
    await page.goto(server.resolvedUrls.local[0]);
    await page.locator('.scenario-picker-card').first().waitFor();
    assert.equal(await page.locator('.scenario-picker-card', { hasText: 'earlier map' }).count(), 0, 'retired D3 map has no Start card');
    assert.equal(await page.locator('.scenario-picker-group h2', { hasText: 'Středočeská D3' }).count(), 1, 'D3 sections under one heading');
    await page.close();
  }
  const only = process.env.ONLY?.split(',');
  for (const [title, id] of [['0301 Praha', 'd3-0301'], ['0302 Jílové', 'd3-0302'], ['0303 Hostěradice', 'd3-0303'], ['0304 Václavice', 'd3-0304'],
    ['0305/I Voračice', 'd3-0305'], ['The whole D3', 'd3-full'], ['Opatovec → Mohelnice', 'd35-full'], ['Nová Paka', 'i16-nova-paka']].filter(([, id]) => !only || only.includes(id))) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await context.addInitScript(() => localStorage.setItem('trapla.intro.v2', '1'));
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const ready = async () => { await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 }); await page.evaluate(() => window.trapla.whenIdle()); };
    const card = (label) => page.locator('.scenario-picker-card', { hasText: title }).first().getByRole('button', { name: label });
    await page.goto(server.resolvedUrls.local[0]);
    await card('Start').click(); await ready();
    const start = await page.evaluate(() => ({ d: window.trapla.getDesign(), s: window.trapla.summary() }));
    assert(start.d.pis.length > 0 && start.s.valid, `${id}: Start opens the VALID starter`);
    // an edit, then reload: the picker offers Continue and keeps the edit
    await page.evaluate(() => { const d = window.trapla.getDesign(); d.pis[0].x += 40; window.trapla.setDesign(d); });
    await page.evaluate(() => window.trapla.whenIdle());
    await page.goto(server.resolvedUrls.local[0]);
    await card('Continue').click(); await ready();
    const cont = await page.evaluate(() => window.trapla.getDesign());
    assert.equal(cont.pis[0].x, start.d.pis[0].x + 40, `${id}: Continue keeps the edit`);
    // Start over: back to the deep-cloned starter (not the straight line, not the edit)
    await page.click('#sec-design .fold-h button').catch(() => {});
    await page.click('#reset'); await page.waitForTimeout(300); await page.evaluate(() => window.trapla.whenIdle());
    const again = await page.evaluate(() => window.trapla.getDesign());
    assert.deepEqual(again.pis, start.d.pis, `${id}: Start over restores the starter`);
    assert.deepEqual(errors, [], `${id}: no page errors`);
    console.log(`PASS ${id}: Start (VALID ${Math.round(start.s.length)} m) / Continue / Start over`);
    await context.close();
  }
} finally { await browser.close(); await server.close(); }
