// Component browser contract for the picker, independent of concurrent main/store migration.
// The actual integrated bootstrap is additionally exercised by the UX stream.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5293, strictPort: true }, logLevel: 'warn' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--headless', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/src/main.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    import { pickScenario, addScenariosButton } from '/src/ui/scenario-picker.ts';
    const id = await pickScenario(); window.chosen = id; addScenariosButton();
  ` }));
  await page.goto('http://localhost:5293/');
  await page.waitForSelector('.scenario-picker-card');
  assert.equal(await page.locator('.scenario-picker-card').count(), 7);
  const first = page.locator('[data-start-here]');
  await page.waitForFunction(() => document.querySelector('[data-start-here] button').disabled === false);
  await first.getByRole('button', { name: 'Start', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.chosen), { scenarioId: 'd35', presetId: 'd35-stage1-motorway', fromPicker: true });
  assert.ok(page.url().includes('scenario=d35'));
  await page.evaluate(async () => {
    const { projectStorageKeys } = await import('/src/project-store-contract.ts');
    localStorage.setItem(projectStorageKeys({ scenarioId: 'd35', presetId: 'd35-stage1-motorway' }).project, 'unrecognized bytes kept for recovery');
  });
  await page.getByRole('button', { name: 'Scenarios', exact: true }).click();
  await page.waitForSelector('.scenario-picker-card');
  assert.equal(await page.locator('[data-start-here]').getByRole('button', { name: 'Continue', exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => Object.values(localStorage).includes('unrecognized bytes kept for recovery')), true);
  await page.goto('http://localhost:5293/?scenario=d11');
  await page.waitForFunction(() => window.chosen?.scenarioId === 'd11');
  assert.equal(await page.locator('.scenario-picker').count(), 0);
  await page.route('**/scenarios/d3-0301/ready.json', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('http://localhost:5293/?scenario=d3-0301&preset=d3-0301-motorway');
  const d3 = page.locator('.scenario-picker-card', { hasText: 'The D3 south of Prague' });
  await d3.locator('.scenario-picker-section', { hasText: 'Praha → Jílové' }).click();
  await d3.getByText('npm run data -- d3-0301', { exact: true }).waitFor();
  assert.equal(await d3.getByRole('button', { name: 'Start', exact: true }).isDisabled(), true);
  await page.unroute('**/scenarios/d3-0301/ready.json');
  await d3.getByRole('button', { name: 'Check again', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.scenario-picker-card')]
    .find(e => e.textContent.includes('The D3 south of Prague')).querySelector('.scenario-picker-actions button').disabled === false);
  await page.goto('http://localhost:5293/?scenario=unknown-place');
  await page.waitForSelector('.scenario-picker');
  assert.equal(await page.locator('.scenario-picker-card').count(), 7);
  assert.deepEqual(errors, []);
  console.log('PASS seven cards, Start here, canonical Continue/recovery bytes, return, direct D11, a section missing/retry and unknown link');

  // ---- the twist screen (src/ui/twist-picker.ts): cards that are checkboxes, by keyboard too ----
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/src/main.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
    import { pickTwists } from '/src/ui/twist-picker.ts';
    import { scenarioParams } from '/src/core/data/scenario.ts';
    const [id, preset] = new URLSearchParams(location.search).get('m').split(':');
    window.answer = null; pickTwists(scenarioParams(id, preset), false).then(a => { window.answer = a; });
  ` }));
  await page.goto('http://localhost:5293/?m=d35:d35-stage1-motorway');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.twist-picker');
  const boxes = page.getByRole('checkbox');
  assert.equal(await boxes.count(), 8);
  assert.deepEqual(await page.locator('.tw-card.on b').allTextContents(), ['Earth balance', 'Hands off the castle', 'Curveballs']);
  assert.equal(await page.locator('.tw-card .tw-default').count(), 3);
  const hands = page.getByRole('checkbox', { name: /Hands off the castle/ });
  assert.match(await hands.evaluate(b => document.getElementById(b.getAttribute('aria-describedby')).textContent), /Chapel of St Roch, Staré Město · chapel · 600 m ring/);
  assert.ok(await page.evaluate(() => document.querySelector('.twist-picker').scrollHeight <= innerHeight), 'eight twists fit 1280 × 800');
  // the keyboard: Tab to a card, Space toggles it; its long line shows while it has focus
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.t), 'landmarks');
  await page.keyboard.press('Space');
  assert.equal(await hands.isChecked(), false);
  assert.equal(await page.locator('.tw-card[data-t="landmarks"]').getAttribute('class'), 'tw-card');
  assert.match(await page.locator('.twist-picker-detail').textContent(), /^Hands off the castle: Keep out of/);
  await page.getByRole('button', { name: 'All on' }).click();
  assert.equal(await page.locator('.tw-card.on').count(), 8);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  assert.equal((await page.evaluate(() => window.answer)).on.length, 8);
  // a mission where Hands off asks nothing: its card says so, can be focused and read, and does not turn on
  await page.goto('http://localhost:5293/?m=i46-sternberk:i46-sternberk-road');
  await page.waitForSelector('.twist-picker');
  const none = page.locator('.tw-card.unavailable');
  assert.match(await none.textContent(), /Hands off the castle.*No listed place near enough/);
  await none.locator('input').focus(); await page.keyboard.press('Space');
  assert.equal(await none.locator('input').isChecked(), false);
  assert.match(await page.locator('.twist-picker-detail').textContent(), /keeps 670 m from the town’s historic centre/);
  assert.deepEqual(errors, []);
  console.log('PASS the twist screen: eight cards fit 1280 × 800, each a checkbox with its description, by keyboard; a twist not offered says why');
} finally {
  if (browser) await browser.close();
  await server.close();
}
