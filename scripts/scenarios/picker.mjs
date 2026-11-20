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
  assert.equal(await page.locator('.scenario-picker-card').count(), 6);
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
  await d3.locator('.scenario-picker-section', { hasText: '0301' }).click();
  await d3.getByText('npm run data -- d3-0301', { exact: true }).waitFor();
  assert.equal(await d3.getByRole('button', { name: 'Start', exact: true }).isDisabled(), true);
  await page.unroute('**/scenarios/d3-0301/ready.json');
  await d3.getByRole('button', { name: 'Check again', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.scenario-picker-card')]
    .find(e => e.textContent.includes('The D3 south of Prague')).querySelector('.scenario-picker-actions button').disabled === false);
  await page.goto('http://localhost:5293/?scenario=unknown-place');
  await page.waitForSelector('.scenario-picker');
  assert.equal(await page.locator('.scenario-picker-card').count(), 6);
  assert.deepEqual(errors, []);
  console.log('PASS six cards, Start here, canonical Continue/recovery bytes, return, direct D11, a section missing/retry and unknown link');
} finally {
  if (browser) await browser.close();
  await server.close();
}
