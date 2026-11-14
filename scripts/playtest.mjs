// A new player's first session, with real mouse / keyboard events and a screenshot after every step:
// intro → add bends on the map → drag one → hover the profile → select a stretch → force a bridge →
// pin a height on the road line and drag it → pick a crossed road on the map and change it → keep /
// buy a building → paint a noise wall → undo / redo → map views C / S / E / O / N → start over.
// Checks what a player would notice (nothing overlaps the score, cards open where expected, Undo
// works) and prints every step.
// Ends with the reference design: the map overview (decluttered symbols) and demolished buildings close up.
// node scripts/playtest.mjs [--docs] [--size=1280x800]   (every step into /tmp/trapla-playtest; --docs writes
// the gallery subset to docs/screenshots/49…)
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const DOCS = process.argv.includes('--docs');
const [W, H] = (process.argv.find((a) => a.startsWith('--size='))?.slice(7) ?? '1280x800').split('x').map(Number);
const OUT = DOCS ? 'docs/screenshots' : process.env.OUT ?? '/tmp/trapla-playtest';
const GALLERY = ['first-run', 'forced-bridge', 'noise-wall', 'pinned-height', 'crossing', 'keep-building', 'noise-view', 'profile-key', 'start-over', 'overview', 'demolished'];
const FIRST = 49; // docs numbering continues after the highest existing screenshot
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.PORT ?? 5207);
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const T = (fn, arg) => page.evaluate(fn, arg);
const idle = async (ms = 150) => {
  await T(() => window.trapla.whenIdle());
  await T(() => new Promise((res) => { const f = () => requestAnimationFrame(() => (window.trapla.viewBusy() ? f() : res())); requestAnimationFrame(() => requestAnimationFrame(f)); }));
  await page.waitForTimeout(ms);
};
const get = () => T(() => window.trapla.getDesign());
let n = 0;
const shot = async (name) => {
  if (DOCS && !GALLERY.includes(name)) return;
  const file = DOCS ? `${OUT}/${FIRST + n}-playtest-${name}.png` : `${OUT}/${String(n).padStart(2, '0')}-${name}.png`;
  n++;
  await page.screenshot({ path: file });
  console.log('SHOT', file);
};
/** the boxes of two elements overlap */
const overlap = (a, b) => T(([a, b]) => {
  const p = document.querySelector(a)?.getBoundingClientRect(), q = document.querySelector(b)?.getBoundingClientRect();
  return !!p && !!q && p.width > 0 && q.width > 0 && p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom;
}, [a, b]);
const visible = (sel) => page.locator(sel).first().isVisible();
/** the control is on screen and on top: what a click at its centre would hit */
const clickable = (sel) => T((sel) => {
  const el = document.querySelector(sel), b = el?.getBoundingClientRect();
  if (!b || !b.width) return false;
  const x = b.left + b.width / 2, y = b.top + b.height / 2;
  return x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight && el.contains(document.elementFromPoint(x, y));
}, sel);

try {
  await page.goto(`http://localhost:${PORT}/`);
  await T(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
  await idle(300);
  const view = await page.locator('#view').boundingBox();
  const cb = await page.locator('#profile-canvas').boundingBox();

  // 1. first run: the intro explains the three basic actions; the score is at the top of the HUD
  ok(await visible('#intro'), 'the intro is shown on the first run');
  ok(!(await overlap('#intro', '#viewbar')) && !(await overlap('#intro', '#editbar')), 'the intro does not cover the map buttons');
  const score = await page.locator('#score').boundingBox();
  ok(score.y < 20 && score.height < 160, `the score card is at the top of the HUD (${Math.round(score.height)} px tall)`);
  await shot('first-run');
  await page.click('#intro-ok');
  ok(!(await visible('#intro')), '"Got it" dismisses the intro');

  // 2. add two bends by clicking the map, east of the straight line
  const ab = await T(() => { const t = window.trapla, p = (q) => t.project(q.x, q.y, 500); return { a: p(t.A), b: p(t.B) }; });
  const at = (f, side) => ({ x: view.x + ab.a.sx + (ab.b.sx - ab.a.sx) * f + side, y: view.y + ab.a.sy + (ab.b.sy - ab.a.sy) * f });
  for (const [f, side] of [[0.35, 60], [0.7, -40]]) { const p = at(f, side); await page.mouse.click(p.x, p.y); await idle(); }
  let d = await get();
  ok(d.pis.length === 2, `two clicks on the map add two bends (${d.pis.length})`);
  ok(await visible('#pi-card'), 'the new bend is selected and its card opens under the score');
  await shot('two-bends');

  // 3. drag the first bend
  const m = await page.locator('.pi[data-i="0"]').boundingBox();
  const p0 = { ...d.pis[0] };
  await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2); await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(m.x + m.width / 2 + 6 * k, m.y + m.height / 2 + 2 * k);
  await page.mouse.up(); await idle();
  d = await get();
  ok(Math.hypot(d.pis[0].x - p0.x, d.pis[0].y - p0.y) > 50, 'dragging a bend moves it');
  await shot('drag-bend');

  // 4. hover the profile: the tooltip shows the costs there, the map marks the spot
  await page.mouse.move(cb.x + cb.width * 0.45, cb.y + cb.height * 0.4); await page.waitForTimeout(300);
  ok(await visible('.profile-tip'), 'hovering the profile shows the cost tooltip');
  await shot('profile-hover');

  // 5. select a stretch by dragging across the profile; force a bridge from the stretch card
  const y = cb.y + cb.height * 0.45;
  await page.mouse.move(cb.x + cb.width * 0.3, y); await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(cb.x + cb.width * (0.3 + 0.01 * k), y);
  await page.mouse.up(); await idle();
  ok(await visible('#range') && await visible('.sel-bar.range'), 'a dragged stretch opens its card and the bar over the profile');
  ok(!(await overlap('#range', '#score')), 'the stretch card sits below the score');
  await page.waitForTimeout(400); // the HUD scrolls the new card into view
  ok(await clickable('#range #wall-add') && await clickable('#range [data-structure="2"]'), 'the stretch card\'s buttons are on screen, not covered');
  await page.click('#range [data-structure="1"]'); await idle();
  d = await get();
  ok(d.structureOverrides.length === 1 && d.structureOverrides[0].kind === 1, 'Bridge on the stretch card forces a bridge');
  ok(await page.locator('#range [data-structure="1"].on').count() === 1, 'the Bridge button shows as chosen');
  await shot('forced-bridge');

  // 6. noise wall on the selected stretch: right side, 5 m
  await page.click('#range [data-side="both"]');
  await page.click('#wall-add'); await idle();
  ok((await get()).wallOverrides?.length === 2, 'a wall on both sides');
  await page.keyboard.press('Control+z'); await idle();
  ok(!(await get()).wallOverrides?.length, 'one Undo takes both sides back');
  await page.click('#range [data-side="R"]');
  await page.fill('#wall-height', '5'); await page.click('#wall-add'); await idle();
  d = await get();
  ok(d.wallOverrides?.length === 1 && d.wallOverrides[0].side === 'R' && d.wallOverrides[0].height === 5, 'a 5 m wall on the right side of the stretch');
  await shot('noise-wall');
  await page.keyboard.press('Escape'); await idle();
  ok(!(await visible('#range')), 'Esc deselects the stretch');

  // 7. pin the road height: click the road line, then drag the pin up
  await T(() => window.trapla.profileFit());
  // a spot on the line clear of crossed-road marks (those open the crossing instead)
  const sPin = await T(() => {
    const r = window.trapla.result();
    for (let s = r.length * 0.8; s > r.length * 0.3; s -= 50) if (!r.crossings.some((c) => Math.abs(c.s - s) < 500) && !r.waterCrossings.some((c) => Math.abs(c.s - s) < 300)) return Math.round(s);
    return Math.round(r.length * 0.8);
  });
  let q = await T((s) => window.trapla.profilePoint(s), sPin);
  await page.mouse.click(q.x, q.y); await idle();
  d = await get();
  ok(d.gradePins?.length === 1, 'a click on the road line pins its height');
  if (!d.gradePins?.length) await page.screenshot({ path: '/tmp/pt/shots/pinfail.png' }), console.log(await T(() => ({ view: window.trapla.profileView(), sel: document.querySelector('.sel-bar')?.className, hidden: document.querySelector('.sel-bar')?.hidden })), q);
  const pin = d.gradePins[0];
  q = await T((p) => window.trapla.profilePoint(p.s, p.z), pin);
  await page.mouse.move(q.x, q.y); await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(q.x, q.y - 5 * k);
  await page.mouse.up(); await idle();
  d = await get();
  ok(d.gradePins[0].z > pin.z + 1, `dragging the pin raises the road (${pin.z} → ${d.gradePins[0].z} m)`);
  await shot('pinned-height');
  await page.keyboard.press('Escape');

  // 8. a crossed road: click it on the map, choose another solution in its card
  const xing = await T(() => {
    // away from A / B (their tie-ins have no room for links)
    const r = window.trapla.result(), mid = r.crossings.filter((c) => c.roadId !== undefined && c.s > 2000 && c.s < r.length - 2000);
    const c = mid.find((c) => c.type === 'overbridge') ?? mid[0];
    window.trapla.lookAt(c.x, c.y, 900, 20, 55);
    return { roadId: c.roadId, type: c.type, x: c.x, y: c.y, z: r.grade[c.i] - Math.min(0, c.h) + 2 };
  });
  await idle(300);
  const xs = await T((c) => window.trapla.project(c.x, c.y, c.z), xing);
  await page.mouse.move(view.x + xs.sx, view.y + xs.sy); await page.waitForTimeout(200);
  ok(await T(() => document.querySelector('#view canvas').style.cursor) === 'pointer', 'a crossed road under the mouse shows a pointer');
  await page.mouse.click(view.x + xs.sx, view.y + xs.sy); await idle();
  ok(await visible('#crossing-card'), `clicking a crossed road on the map opens its card (${xing.type})`);
  const other = xing.type === 'overbridge' ? 'reconnection' : 'overbridge';
  await page.click(`#crossing-choice [data-crossing="${other}"]`); await idle();
  d = await get();
  ok(d.crossingOverrides?.some((o) => o.roadId === xing.roadId && o.type === other), `the crossing is changed to ${other}`);
  await shot('crossing');
  await page.keyboard.press('Escape');

  // 9. a building: click one near the road, keep it, then buy it out
  const j = await T(() => {
    const r = window.trapla.result(), rec = r.noise.receivers.find((p) => p.status === 'wall') ?? r.noise.receivers[0];
    window.trapla.lookAt(r.x[rec.i], r.y[rec.i], 600, 15, 60); return rec.j;
  });
  await idle(300);
  const bs = await T((j) => window.trapla.buildingScreen(j, 3), j);
  await page.mouse.click(view.x + bs.sx, view.y + bs.sy); await idle();
  ok(await visible('#building-card'), 'clicking a building on the map opens its card');
  await page.waitForTimeout(400);
  ok(await clickable('#building-choice [data-building="keep"]'), 'its buttons are on screen, not covered');
  await page.click('#building-choice [data-building="keep"]'); await idle();
  await shot('keep-building');
  await page.click('#building-choice [data-building="buy"]'); await idle();
  ok(await T((j) => window.trapla.result().boughtOut.some((p) => p.j === j && p.reason === 'manual'), j), 'Buy out buys the building');
  await page.keyboard.press('Escape');

  // 10. undo / redo with the buttons over the map and the keyboard
  const before = JSON.stringify(await get());
  await page.click('#undo'); await idle();
  ok(JSON.stringify(await get()) !== before, 'Undo (button) takes the last change back');
  await page.keyboard.press('Control+Shift+Z'); await idle();
  ok(JSON.stringify(await get()) === before, 'Ctrl+Shift+Z redoes it');

  // 11. map views: contours, slope, relief, photo, noise (keys)
  await T(() => window.trapla.resetCamera()); await idle(300);
  for (const k of ['c', 's']) await page.keyboard.press(k);
  await idle(300);
  await shot('contours-slope');
  for (const k of ['c', 's', 'e', 'e']) await page.keyboard.press(k);
  await idle(300);
  await shot('relief');
  for (const k of ['e', 'e', 'n']) await page.keyboard.press(k);
  await idle(300);
  ok(await visible('#noise-legend'), 'N shows the noise view and its legend');
  ok(!(await overlap('#noise-legend', '#legend')), 'the noise legend does not cover the map legend');
  await shot('noise-view');
  await page.keyboard.press('n');
  await page.keyboard.press('o'); await idle(800);
  await shot('photo');
  await page.keyboard.press('o');

  // 12. the profile key and the HUD's foldable sections
  await page.click('#key-toggle'); await page.waitForTimeout(150);
  ok(await visible('#profile-key'), 'Key opens the full legend of the profile');
  ok(await clickable('#key-toggle'), 'the Key button stays clickable (closes it again)');
  await shot('profile-key');
  await page.keyboard.press('Escape');
  ok(!(await visible('#profile-key')), 'Esc closes it');

  // 12b. Esc closes the most recently picked card first
  await T(() => { window.trapla.selectPi(0); window.trapla.selectRange(3000, 3500); });
  await T((j) => window.trapla.selectBuilding(j), j); await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  ok(!(await visible('#building-card')) && await visible('#range') && await visible('#pi-card'), 'Esc closes the building card picked last, the stretch and bend stay');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  ok(!(await visible('#range')) && !(await visible('#pi-card')), 'then the stretch, then the bend');

  // 13. start over: one click, a toast offers Undo
  await page.click('#reset'); await idle();
  d = await get();
  ok(d.pis.length === 0 && await visible('#toast'), 'Start over goes back to the straight line and offers Undo');
  await shot('start-over');
  await page.click('#toast button:not(.x)'); await idle();
  ok((await get()).pis.length === 2, 'the toast\'s Undo brings the design back');
  await page.click('#reset'); await idle();
  await page.selectOption('#speed', '80'); await idle();
  ok(!(await visible('#toast')), 'another edit takes the toast (and its Undo) away');
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await idle();
  ok((await get()).pis.length === 2 && (await get()).speed === 90, 'Ctrl+Z twice: back to the design before Start over');

  // 14. the reference design: the overview keeps the route readable (crowded bends shrink to dots,
  //     culverts and walls are small marks); demolished buildings are gone from the map
  const design = JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design;
  await T((d) => { window.trapla.setDesign(d); window.trapla.resetCamera(); window.trapla.profileFit(); }, design); await idle(300);
  await page.mouse.move(view.x + 5, view.y + view.height - 5);
  const minis = await T(() => document.querySelectorAll('.pi.mini').length);
  ok(minis > 0, `crowded bends at the overview shrink to dots (${minis})`);
  await shot('overview');
  const dem = await T(() => { const r = window.trapla.result(), b = r.demolished[0]; window.trapla.lookAt(r.x[b.i], r.y[b.i], 450, 30, 50); return r.demolished.length; });
  await idle(500);
  const shown = await T(() => { const r = window.trapla.result(); return { gone: r.demolished.filter((b) => !window.trapla.buildingShown(b.j)).length, kept: r.noise.receivers.slice(0, 20).filter((p) => window.trapla.buildingShown(p.j)).length }; });
  ok(dem > 0 && shown.gone === dem && shown.kept > 0, `all ${dem} demolished buildings are removed from the 3D map (${shown.gone}); others stay (${shown.kept} of 20 receivers drawn)`);
  await shot('demolished');

  ok(errors.length === 0, `no browser errors ${errors.join(' | ')}`);
} finally { await browser.close(); await server.close(); }
