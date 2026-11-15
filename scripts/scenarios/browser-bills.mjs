// The browser worker must bill each scenario starter exactly as Node does (scripts/scenarios/check.ts).
// node scripts/scenarios/browser-bills.mjs [--gpu]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const ids = ['d3', 'd35', 'i16-nova-paka'];
const node = Object.fromEntries(ids.map(id => {
  const out = execFileSync('node', ['--max-old-space-size=3072', '--import', 'tsx', 'scripts/scenarios/check.ts'],
    { env: { ...process.env, SCENARIO: id }, encoding: 'utf8', maxBuffer: 1 << 26 });
  return [id, Number(out.match(/"cost": ([0-9.e+]+)/)[1])];
}));
const server = await createServer({ server: { port: 5301, strictPort: false }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: process.argv.includes('--gpu')
  ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
try {
  for (const id of ids) {
    const design = JSON.parse(readFileSync(`scripts/scenarios/${id}/default.json`, 'utf8')).design;
    const page = await browser.newPage();
    await page.addInitScript(() => localStorage.setItem('trapla.intro.v2', '1'));
    await page.goto(`${server.resolvedUrls.local[0]}?scenario=${id}`);
    await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
    await page.evaluate(d => window.trapla.setDesign(d), design);
    await page.evaluate(() => window.trapla.whenIdle());
    const total = await page.evaluate(() => window.trapla.result().cost.total);
    const same = Object.is(total, node[id]); failed ||= !same;
    console.log(`${same ? 'PASS' : 'FAIL'} ${id}: browser ${total} ${same ? '=' : '≠'} node ${node[id]}`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
assert(!failed, 'browser and Node bills differ');
