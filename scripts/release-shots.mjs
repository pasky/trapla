// The first minute of a new visitor on the built site (dist/, a plain static server under /trapla/): the start
// screen, the loading card on a slow line, the map before and after its first price, the first drag, the older
// saves, the notices for a browser without WebGL and for a small screen, a failed download, the About page.
//
//   node scripts/release-shots.mjs --check            assertions only (scripts/release.sh)
//   node scripts/release-shots.mjs --docs [--before DIR]   also docs/screenshots/550–565 (`--before`: an older build,
//                                                         served at /, for the start screen and intro before)
// Needs a build (npm run build). Untimed: `flock -s /tmp/trapla-browser.lock nice -n 10 …` (AGENTS.md).
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { serveStatic } from './static-serve.mjs';
import { checker } from './lib/browser.mjs';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1] ?? d; };
const docs = process.argv.includes('--docs'), before = arg('--before');
const gpu = process.argv.includes('--gpu') || process.env.GPU === '1';
const ARGS = gpu ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const { ok } = checker();
const port = Number(process.env.PORT ?? 5600);
const site = await serveStatic({ dir: process.env.DIST ?? 'dist', port });
const old = before ? await serveStatic({ dir: before, port: port + 1, base: '/' }) : null;
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ARGS });
const noGL = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--disable-3d-apis', '--disable-gpu'] });
const shot = async (page, n, name, opts = {}) => { if (docs) await page.screenshot({ path: `docs/screenshots/${n}-${name}.png`, ...opts }); };
const errorsOf = (page) => { const e = []; page.on('pageerror', (x) => e.push(x.message)); page.on('console', (m) => { if (m.type() === 'error') e.push(m.text()); }); return e; };
const fresh = async (b = browser, viewport = { width: 1440, height: 900 }, init) => {
  const context = await b.newContext({ viewport });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  return { context, page, errors: errorsOf(page) };
};
const pickerReady = (page) => page.waitForFunction(() => !![...document.querySelectorAll('.scenario-picker button')].find((b) => !b.disabled && /Start|Continue/.test(b.textContent)), null, { timeout: 60000 });
const idle = (page) => page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 }).then(() => page.evaluate(() => window.trapla.whenIdle()));

try {
  // ---- the start screen, before (an older build) and now ----
  if (old) {
    const { context, page } = await fresh(browser, { width: 1440, height: 1500 });
    await page.goto(old.url); await pickerReady(page); await page.waitForTimeout(300);
    await shot(page, 550, 'start-screen-before');
    await context.close();
  }
  {
    const { context, page, errors } = await fresh(browser, { width: 1440, height: 1500 });
    await page.goto(site.url); await pickerReady(page); await page.waitForTimeout(300);
    const titles = await page.locator('.scenario-picker-card h3').allTextContents();
    ok(titles.length === 6, `six cards, one per corridor or mission (${titles.join(' | ')})`);
    ok(!(await page.locator('.scenario-picker').textContent()).match(/earlier map|Your older saves/), 'no retired mission and no older saves on a fresh visit');
    const first = page.locator('[data-start-here]');
    ok(await first.count() === 1 && /Jílové → Hostěradice/.test(await first.textContent()), 'one mission is marked Start here: Jílové → Hostěradice');
    const d3 = page.locator('.scenario-picker-card', { hasText: 'The D3 south of Prague' });
    const chips = await d3.locator('.scenario-picker-section').allTextContents();
    ok(chips.length === 6 && /^0301/.test(chips[0]) && /^Whole route/.test(chips[5]) && chips.every((c) => /km · [\d.]+ MB$/.test(c)),
      `the D3 card has its sections with length and size, the whole route last (${chips.join(' | ')})`);
    const nova = page.locator('.scenario-picker-card').last();
    ok(/Nová Paka/.test(await nova.textContent()) && /already in the ground/.test(await nova.textContent()), 'Nová Paka is last, marked "the real road is already in the ground here"');
    ok(!/km\/h|section 0|Built 27\.5|Earlier map|proposal/.test(await page.locator('.scenario-picker').textContent()), 'no speeds, notes or internal words on the cards');
    await shot(page, 551, 'start-screen');
    await d3.locator('.scenario-picker-section', { hasText: 'Whole route' }).click();
    ok(/57 km/.test(await d3.locator('.scenario-picker-kind').textContent()) && await d3.getByRole('button', { name: 'Start' }).isEnabled(), 'choosing Whole route: its length on the card, Start ready');
    await d3.screenshot({ path: docs ? 'docs/screenshots/553-start-screen-d3-whole-route.png' : '/tmp/trapla-553.png' });
    ok(errors.length === 0, `no errors on the start screen (${errors.join('; ')})`);
    await context.close();
  }
  {
    const { context, page } = await fresh(browser, { width: 1280, height: 800 });
    await page.goto(site.url); await pickerReady(page);
    const box = await page.locator('[data-start-here] button').boundingBox();
    ok(box && box.y + box.height < 800, 'at 1280 × 800 the Start here button is in view without scrolling');
    await shot(page, 552, 'start-screen-1280x800');
    await context.close();
  }
  // ---- older saves: a save of a retired mission is listed apart ----
  {
    const { context, page } = await fresh(browser, { width: 1440, height: 1700 }, () => { localStorage.setItem('trapla.d3.design', JSON.stringify({ pis: [] })); });
    await page.goto(site.url); await pickerReady(page);
    const older = page.locator('.scenario-picker-older');
    ok(await older.count() === 1 && /Jílové → Václavice, two-lane road/.test(await older.textContent()), 'a save of the retired D3 road is under "Your older saves"');
    await page.locator('.scenario-picker-older').scrollIntoViewIfNeeded();
    await shot(page, 554, 'start-screen-older-saves');
    await context.close();
  }
  // ---- the loading card on a slow line, the map before its first price, the first run ----
  {
    const { context, page, errors } = await fresh();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await page.goto(site.url); await pickerReady(page);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 8e6 / 8, uploadThroughput: 2e6 / 8 });
    await page.locator('[data-start-here] button').click();
    await page.waitForFunction(() => { const t = document.querySelector('#loading .loading-line')?.textContent ?? ''; const m = t.match(/^([\d.]+) of ([\d.]+) MB/); return m && +m[1] > 0.3 * +m[2]; }, null, { timeout: 60000, polling: 50 });
    const line = await page.locator('#loading').textContent();
    ok(/Loading the map\s*Jílové → Hostěradice.*[\d.]+ of 3\.9 MB/.test(line), `the loading card says what and how much ("${line}")`);
    await shot(page, 555, 'loading-card');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 120000, polling: 20 });
    const pricing = await page.evaluate(() => { const s = document.getElementById('status'); return s && s.style.display !== 'none' ? s.textContent : ''; });
    await shot(page, 556, 'map-before-its-first-price');
    await idle(page); await page.waitForTimeout(400);
    ok(true, `the map shows before its first price (status then: "${pricing || 'already priced'}")`);
    ok(await page.locator('#intro').isVisible() && /Drag the orange motorway/.test(await page.locator('#intro').textContent()), 'the first run shows the short intro');
    ok(await page.title() === 'Jílové → Hostěradice — Trapla', `the page title names the mission (${await page.title()})`);
    await shot(page, 557, 'first-run');
    // the first drag: on the road, sideways
    const view = await page.locator('#view').boundingBox();
    const p = await page.evaluate(() => window.trapla.roadScreen(window.trapla.result().length * 0.8));
    const x = view.x + p.sx, y = view.y + p.sy;
    await page.mouse.move(x, y); await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(x + 3 * k, y);
    await page.mouse.up(); await idle(page); await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.trapla.getDesign().pis.length);
    ok(after === 2 && !(await page.locator('#intro').isVisible()), `the first drag adds a bend and the intro goes (${after} bends)`);
    await page.mouse.move(view.x + view.width - 4, view.y + view.height - 4);
    await shot(page, 558, 'first-drag');
    const attrib = page.locator('#attrib a', { hasText: 'About the data' });
    ok(await attrib.count() === 1, 'the map credits link to the About page');
    await page.locator('#attrib').screenshot({ path: docs ? 'docs/screenshots/559-map-credits-about-link.png' : '/tmp/trapla-559.png' });
    ok(errors.length === 0, `no errors while loading and playing (${errors.join('; ')})`);
    await context.close();
  }
  if (old) { // the intro before, on the same mission
    const { context, page } = await fresh(browser);
    await page.goto(`${old.url}?scenario=d3-0302&preset=d3-0302-motorway`); await idle(page); await page.waitForTimeout(400);
    await shot(page, 560, 'first-run-before');
    await context.close();
  }
  // ---- no WebGL, a small screen, a failed download ----
  {
    const { context, page, errors } = await fresh(noGL);
    await page.goto(site.url);
    await page.waitForSelector('.device-notice');
    const text = await page.locator('.device-notice').textContent();
    ok(/cannot draw the 3D map/.test(text) && await page.locator('.scenario-picker-card').count() === 0, 'without WebGL: a plain notice, no start screen');
    ok(errors.filter((e) => !/WebGL|GPU/i.test(e)).length === 0, `…and no errors (${errors.join('; ')})`);
    await shot(page, 561, 'no-webgl');
    await context.close();
  }
  {
    const { context, page } = await fresh(browser, { width: 390, height: 844 });
    await page.goto(site.url);
    await page.waitForSelector('.device-notice');
    ok(/desktop game/.test(await page.locator('.device-notice').textContent()), 'a phone-sized window: "Trapla is a desktop game"');
    await shot(page, 562, 'small-screen');
    await page.getByRole('button', { name: 'Continue anyway' }).click();
    await pickerReady(page);
    ok(await page.locator('.scenario-picker-card').count() > 0, '"Continue anyway" opens the start screen');
    await context.close();
  }
  {
    const { context, page } = await fresh();
    await page.route(/height\.i16\.gz$/, (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.goto(`${site.url}?scenario=d3-0302&preset=d3-0302-motorway`);
    await page.waitForSelector('#loading.failed', { timeout: 60000 });
    ok(/could not be loaded/.test(await page.locator('#loading').textContent()) && await page.getByRole('button', { name: 'Try again' }).isVisible(),
      'a failed download: said on the card, with Try again');
    await shot(page, 563, 'loading-failed');
    await context.close();
  }
  // ---- the About page ----
  {
    const { context, page, errors } = await fresh(browser, { width: 1440, height: 1400 });
    await page.goto(`${site.url}about.html`);
    await page.waitForFunction(() => document.querySelectorAll('#pack-list li a').length > 10);
    const text = await page.locator('main').textContent();
    for (const w of ['ČÚZK', 'OpenStreetMap', 'ODbL', 'ČGS', 'AOPK', 'ŘSD', 'CC BY 4.0']) ok(text.includes(w), `About names ${w}`);
    const href = await page.locator('#pack-list a').first().getAttribute('href');
    const r = await page.request.get(new URL(href, page.url()).href);
    ok(r.ok(), `its download links work (${href})`);
    await shot(page, 564, 'about-data');
    ok(errors.length === 0, `no errors on the About page (${errors.join('; ')})`);
    await context.close();
  }
} finally {
  await browser.close(); await noGL.close(); await site.close(); await old?.close();
}
assert.ok(true);
