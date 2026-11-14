// Long-curve check with real mouse events: a multi-point curve between two bends is valid, and the
// on-map radius handles (grips, wheel, + / −, max, auto) work and stay in sync with the HUD and undo.
// Usage: node scripts/curves.mjs [outdir]   (screenshots; starts its own Vite dev server)
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const OUT = process.argv[2] ?? 'docs/screenshots';
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5196, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5196/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
const idle = async (ms = 500) => { await page.waitForTimeout(ms); await page.evaluate(() => window.trapla.whenIdle()); await page.waitForTimeout(700); };
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const state = () => page.evaluate(() => ({ d: window.trapla.getDesign(), s: window.trapla.summary() }));
const horiz = (s) => s.violations.filter((v) => ['radius', 'transition', 'arcShort', 'compound'].includes(v.kind));
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('saved', `${OUT}/${name}.png`); };
const centre = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

// ---- 1. the owner's case: bend 4 of the reference design replaced by six points 120–155 m apart
//         (placed by hand, ± 3 m) along a gentle left curve between bends 3 and 5
const design = JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design;
const curvePts = [[9871, 6852], [9937, 6986], [9986, 7122], [10009, 7256], [10015, 7409], [9992, 7528]];
design.pis.splice(3, 1, ...curvePts.map(([x, y]) => ({ x, y, r: null })));
await page.evaluate((d) => window.trapla.setDesign(d), design);
await idle();
await page.waitForLoadState('networkidle');
let s = await state();
ok(horiz(s.s).length === 0, `six points along a gentle curve: no horizontal violations (${horiz(s.s).map((v) => v.msg).join(' | ')})`);
ok(s.s.valid, `design valid, ${(s.s.length / 1000).toFixed(2)} km, ${(s.s.cost.total / 1e9).toFixed(2)} bn CZK`);
const radii = await page.evaluate(() => window.trapla.result().curves.slice(3, 9).map((c) => Math.round(c.rEff)));
ok(radii.every((r) => r >= 355) && Math.max(...radii) / Math.min(...radii) <= 2, `joined radii ${radii.join(', ')} m`);
await page.evaluate(() => window.trapla.lookAt(9950, 7200, 2300, 0, 65));
await idle(300);
await shot('05-long-curve');
await page.evaluate(() => window.trapla.selectPi(5));
await page.evaluate(() => window.trapla.lookAt(9990, 7200, 1100, 0, 65));
await idle(300);
const sub = await page.locator('.rlabel small').textContent();
ok(/one curve with bends 4, 5, 7–9/.test(sub), `label of a joined bend: "${sub}"`);
await shot('06-long-curve-selected');

// ---- 2. radius handles on a single bend (bend 2 of the reference design: 45° right, long legs)
const I = 1;
await page.evaluate(() => window.trapla.selectPi(null));
await page.evaluate(() => window.trapla.lookAt(7454, 5258, 1700, 0, 65));
await idle(300);
// click the bend's marker to select it (a click without movement must not move it)
const before = (await state()).d.pis[I];
const pm = await page.locator('.pi').nth(I).boundingBox();
await page.mouse.click(pm.x + pm.width / 2, pm.y + pm.height / 2);
await idle(200);
s = await state();
ok(s.d.pis[I].x === before.x && s.d.pis[I].r === null, 'clicking a bend selects it without changing it');
ok(await page.locator('.rgrip').first().isVisible() && await page.locator('.rlabel').isVisible(), 'grips and radius label appear on the selected bend');
ok((await page.locator('.rlabel b').textContent()) === 'R 355 m', `label shows the automatic radius (${await page.locator('.rlabel b').textContent()})`);
// drag the first grip away from the bend, along the leg
const piC = await centre('.pi.sel'), g0 = await centre('.rgrip');
const ux = (g0.x - piC.x) / Math.hypot(g0.x - piC.x, g0.y - piC.y), uy = (g0.y - piC.y) / Math.hypot(g0.x - piC.x, g0.y - piC.y);
await page.mouse.move(g0.x, g0.y);
await page.mouse.down();
for (let k = 1; k <= 10; k++) await page.mouse.move(g0.x + ux * 9 * k, g0.y + uy * 9 * k);
await idle(200);
s = await state();
const rDrag = s.d.pis[I].r;
ok(rDrag > 400, `dragging a grip along the leg enlarges the radius (${rDrag} m)`);
ok((await page.locator('.rlabel b').textContent()) === `R ${rDrag.toLocaleString('en-US')} m`, 'label follows the drag');
ok(Number(await page.locator('#pi-r').inputValue()) === rDrag, 'HUD radius field in sync while dragging');
await shot('07-radius-handle');
await page.mouse.up();
await idle(200);
const g1 = await centre('.rgrip');
ok(Math.hypot(g1.x - (g0.x + ux * 90), g1.y - (g0.y + uy * 90)) < 12, 'the grip stays under the cursor');
await page.keyboard.press('Control+z');
await idle(200);
ok((await state()).d.pis[I].r === null, 'one undo step takes the whole drag back');
// wheel over the selected bend (a real wheel event, then a quick burst: one undo step)
await page.mouse.move(piC.x, piC.y);
await page.mouse.wheel(0, -100);
await idle(700);
s = await state();
const rWheel = s.d.pis[I].r;
ok(rWheel > 355 && rWheel < 400, `mouse wheel on the bend changes the radius instead of zooming (${rWheel} m)`);
await page.evaluate(() => {
  const el = document.querySelector('.pi.sel');
  for (let k = 0; k < 4; k++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
});
await idle(700);
s = await state();
const rBurst = s.d.pis[I].r;
ok(rBurst > rWheel * 1.15, `a burst of four notches (${rBurst} m)`);
await page.keyboard.press('+');
await idle(700);
s = await state();
ok(s.d.pis[I].r > rBurst, `+ key enlarges it (${s.d.pis[I].r} m)`);
await page.keyboard.press('Control+z');
await idle(100);
ok((await state()).d.pis[I].r === rBurst, 'undo takes the key step back');
await page.keyboard.press('Control+z');
await idle(100);
ok((await state()).d.pis[I].r === rWheel, 'the wheel burst is one undo step');
await page.keyboard.press('Control+z');
await idle(200);
ok((await state()).d.pis[I].r === null, 'and the first notch another');
// largest radius that fits, back to auto
await page.click('.rlabel .rmax');
await idle(300);
s = await state();
const rMax = s.d.pis[I].r;
ok(rMax > 1000 && horiz(s.s).length === 0, `"max" sets the largest radius that fits (${rMax} m), still no horizontal violations`);
const over = await page.evaluate(([i, r]) => { const t = window.trapla, d = t.getDesign(); d.pis[i].r = r; t.setDesign(d); return t.whenIdle().then(() => t.summary().violations.map((v) => v.msg)); }, [I, Math.round(rMax * 1.03)]);
ok(over.some((m) => /bend/.test(m)), `3 % more does not fit: "${over[0]}"`);
await page.keyboard.press('Control+z');
await idle(300);
await page.evaluate(() => window.trapla.lookAt(7900, 5300, 3000, 0, 65));
await idle(300);
await shot('08-radius-max');
await page.click('.rlabel .rauto');
await idle(300);
ok((await state()).d.pis[I].r === null, '"auto" returns to the automatic radius');

// ---- 3. history stays intact around uncommitted wheel steps, and a drag gives way to outside changes
await page.evaluate(() => window.trapla.lookAt(7454, 5258, 1700, 0, 65));
await idle(300);
await page.keyboard.press('+');
await idle(700); // committed: 375 m
const notch = () => page.evaluate(() => document.querySelector('.pi.sel').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })));
await notch();
const rT = (await state()).d.pis[I].r;
await page.keyboard.press('Control+z'); // within the 500 ms debounce
ok((await state()).d.pis[I].r === 373, `undo right after a wheel step takes back just that step (${rT} → ${(await state()).d.pis[I].r} m)`);
await page.waitForTimeout(800);
await page.keyboard.press('Control+y');
ok((await state()).d.pis[I].r === rT, `… and redo still brings it back (${(await state()).d.pis[I].r} m)`);
await notch();
await page.evaluate(() => { const t = window.trapla, d = t.getDesign(); d.pis[1].r = 600; t.setDesign(d); }); // replaced from outside
await page.waitForTimeout(800);
await page.keyboard.press('Control+z');
ok((await state()).d.pis[I].r === rT, 'a design replaced from outside is not committed a second time by the pending wheel step');
await page.keyboard.press('Control+y');
await idle(300);
const gA = await centre('.rgrip'), pA = await centre('.pi.sel');
const vx = (gA.x - pA.x) / Math.hypot(gA.x - pA.x, gA.y - pA.y), vy = (gA.y - pA.y) / Math.hypot(gA.x - pA.x, gA.y - pA.y);
await page.mouse.move(gA.x, gA.y);
await page.mouse.down();
await page.mouse.move(gA.x + vx * 20, gA.y + vy * 20);
await page.mouse.move(gA.x + vx * 40, gA.y + vy * 40);
ok((await state()).d.pis[I].r > 600, `grip drag in progress (${(await state()).d.pis[I].r} m)`);
await page.evaluate(() => { const t = window.trapla, d = t.getDesign(); d.pis[1].r = 900; t.setDesign(d); });
await page.mouse.move(gA.x + vx * 60, gA.y + vy * 60);
await page.mouse.move(gA.x + vx * 80, gA.y + vy * 80);
await page.mouse.up();
await idle(300);
ok((await state()).d.pis[I].r === 900, `a design replaced during the drag ends the drag (${(await state()).d.pis[I].r} m)`);
// Esc while dragging cancels the drag: the radius is back, nothing new to undo
const gB = await centre('.rgrip');
await page.mouse.move(gB.x, gB.y);
await page.mouse.down();
await page.mouse.move(gB.x + vx * 25, gB.y + vy * 25);
await page.mouse.move(gB.x + vx * 50, gB.y + vy * 50);
const rMid = (await state()).d.pis[I].r;
await page.keyboard.press('Escape');
await page.mouse.move(gB.x + vx * 70, gB.y + vy * 70);
await page.mouse.up();
await idle(300);
ok(rMid > 900 && (await state()).d.pis[I].r === 900 && !(await page.locator('.rlabel').isVisible()), `Esc during a drag restores the radius (${rMid} → ${(await state()).d.pis[I].r} m) and deselects`);
await page.keyboard.press('Control+z');
await idle(200);
ok((await state()).d.pis[I].r === 600, 'the cancelled drag left no undo step behind (undo goes to the design before the replaced one)');
await page.keyboard.press('Control+y');
await idle(200);
await page.mouse.move(pA.x + 200, pA.y + 200);
await page.mouse.down();
await page.mouse.move(pA.x + 230, pA.y + 215);
await page.mouse.up();
await idle(300);
ok((await state()).d.pis[I].r === 900 && (await state()).d.pis.length === 18, 'map controls work again after the aborted drag (pan, no stray edit)');
ok(errors.length === 0, `no console errors ${errors.join(' | ')}`);
await browser.close(); await server.close();
