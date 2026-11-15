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
  assert.equal(await page.locator('.scenario-picker-card').count(), 4);
  const d3 = page.locator('.scenario-picker-card').filter({ hasText: 'Jílové' });
  await d3.getByRole('button', { name: 'Start', exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.scenario-picker-card')]
    .find(e => e.textContent.includes('Jílové')).querySelector('button').disabled === false);
  await page.screenshot({ path: 'docs/screenshots/73-scenario-picker.png' });
  await d3.getByRole('button', { name: 'Start', exact: true }).click();
  assert.equal(await page.evaluate(() => window.chosen), 'd3');
  assert.ok(page.url().includes('scenario=d3'));
  await page.evaluate(async () => {
    const { projectStorageKeys } = await import('/src/project-store-contract.ts');
    localStorage.setItem(projectStorageKeys({ scenarioId: 'd3', presetId: 'd3-road' }).project, 'unrecognized bytes kept for recovery');
  });
  await page.getByRole('button', { name: 'Scenarios', exact: true }).click();
  await page.waitForSelector('.scenario-picker-card');
  assert.equal(await page.locator('.scenario-picker-card').filter({ hasText: 'Jílové' }).getByRole('button', { name: 'Continue', exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => Object.values(localStorage).includes('unrecognized bytes kept for recovery')), true);
  await page.goto('http://localhost:5293/?scenario=d11');
  await page.waitForFunction(() => window.chosen === 'd11');
  assert.equal(await page.locator('.scenario-picker').count(), 0);
  await page.route('**/scenarios/d3/ready.json', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('http://localhost:5293/?scenario=d3');
  const missing = page.locator('.scenario-picker-card').filter({ hasText: 'Jílové' });
  await missing.getByText('npm run data -- d3', { exact: true }).waitFor();
  assert.equal(await missing.getByRole('button', { name: 'Continue', exact: true }).isDisabled(), true);
  await page.unroute('**/scenarios/d3/ready.json');
  await missing.getByRole('button', { name: 'Check again', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.scenario-picker-card')]
    .find(e => e.textContent.includes('Jílové')).querySelector('button').disabled === false);
  await page.goto('http://localhost:5293/?scenario=unknown-place');
  await page.waitForSelector('.scenario-picker');
  assert.equal(await page.locator('.scenario-picker-card').count(), 4);
  assert.deepEqual(errors, []);
  console.log('PASS four cards, Start, canonical Continue/recovery bytes, return, direct D11, missing/retry and unknown link');
} finally {
  if (browser) await browser.close();
  await server.close();
}
