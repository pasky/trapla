// Interaction smoke test with real mouse events: add a PI by clicking, drag it, take over the profile, undo.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const PORT = Number(process.env.PORT ?? 5197); // set PORT when several checkouts run at once
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
await page.evaluate(() => window.trapla.whenIdle());
// PI markers are positioned by the view's next frame, which can lag an edit under software rendering
const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const st = () => page.evaluate(() => ({ d: window.trapla.getDesign(), s: window.trapla.summary() }));

// 0. the start is the straight line with the automatic (legal) grade line
let s = await st();
ok(s.d.pis.length === 0 && s.d.profileMode === 'auto', `starts from the straight line with the auto profile (${s.d.profileMode})`);
ok(s.s.violations.every((v) => v.goal || v.kind !== 'gradient'), 'the start profile has no gradient violations');
const struck = () => page.evaluate(() => ({ invalid: document.getElementById('total').classList.contains('invalid'), note: document.getElementById('invalid-note').style.display !== 'none' }));
let inv = await struck();
ok(inv.invalid === !s.s.valid && inv.note === !s.s.valid, `cost is struck through exactly when the design is not valid (valid: ${s.s.valid})`);
// 1. click on terrain near the middle of the view → PI added
await page.mouse.click(600, 420);
await page.waitForTimeout(300);
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.pis.length === 1, `click adds a PI (${s.d.pis.length})`);
// 2. drag the PI marker
await frames();
const box = await page.locator('.pi').first().boundingBox();
const p0 = { ...s.d.pis[0] };
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
for (let k = 1; k <= 8; k++) await page.mouse.move(box.x + box.width / 2 + 10 * k, box.y + box.height / 2 + 4 * k);
await page.mouse.up();
await page.waitForTimeout(300);
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(Math.hypot(s.d.pis[0].x - p0.x, s.d.pis[0].y - p0.y) > 20, `drag moves the PI (${(s.d.pis[0].x - p0.x).toFixed(0)}, ${(s.d.pis[0].y - p0.y).toFixed(0)})`);
// 3. profile: drag a VPI → manual
const cb = await page.locator('#profile-canvas').boundingBox();
await page.evaluate(() => window.trapla.profileFit());
const hit = await page.evaluate(() => {
  const r = window.trapla.result();
  const c = document.getElementById('profile-canvas');
  const W = c.clientWidth, H = c.clientHeight;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < r.n; i++) { lo = Math.min(lo, r.ground[i], r.grade[i]); hi = Math.max(hi, r.ground[i], r.grade[i]); }
  for (const v of r.vpis) { lo = Math.min(lo, v.z); hi = Math.max(hi, v.z); }
  const m = Math.max(8, (hi - lo) * 0.08); lo -= m; hi += m;
  const k = Math.floor(r.vpis.length / 2), v = r.vpis[k];
  // layout of ui/profile.ts: chart from y = 26 to H − 96 (alignment band and cost strip below it)
  return { k, x: 52 + (v.s / r.length) * (W - 66), y: 26 + (1 - (v.z - lo) / (hi - lo)) * (H - 122) };
});
await page.mouse.move(cb.x + hit.x, cb.y + hit.y);
await page.mouse.down();
for (let k = 1; k <= 5; k++) await page.mouse.move(cb.x + hit.x, cb.y + hit.y - 6 * k);
await page.mouse.up();
await page.waitForTimeout(300);
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.profileMode === 'manual', `dragging a VPI takes manual control (${s.d.profileMode})`);
// 4. auto button, undo
await page.click('#grade-auto');
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.profileMode === 'auto', 'Auto profile button restores auto mode');
await page.keyboard.press('Control+z');
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.profileMode === 'manual', 'Ctrl+Z undoes');
inv = await struck();
ok(inv.invalid === !s.s.valid && inv.note === !s.s.valid, `cost struck through when not valid (valid: ${s.s.valid}, ${s.s.violations.length} violations)`);
// 4b. cost breakdown of a stretch: hover shows the split, dragging in the cost strip selects a range
const stripY = cb.y + cb.height - 22 - 25;
await page.mouse.move(cb.x + 400, cb.y + 80);
await page.waitForTimeout(100);
const tip = await page.evaluate(() => { const t = document.querySelector('.profile-tip'); return t && t.style.display !== 'none' ? t.textContent : ''; });
ok(/km \d/.test(tip) && /Cost per metre/.test(tip), `hovering the profile shows the cost split (${tip.slice(0, 40).replace(/\s+/g, ' ')}…)`);
await page.mouse.move(cb.x + 300, stripY);
await page.mouse.down();
for (let k = 1; k <= 10; k++) await page.mouse.move(cb.x + 300 + 20 * k, stripY);
await page.mouse.up();
let sel = await page.evaluate(() => {
  const t = window.trapla, r = t.range(), res = t.result();
  if (!r) return null;
  let sum = 0;
  const i0 = Math.ceil(r.s0 / res.ds), i1 = Math.floor(r.s1 / res.ds);
  for (const k of Object.keys(res.parts)) for (let i = i0; i <= i1; i++) sum += res.parts[k][i];
  return { r, sum, shown: document.getElementById('range').textContent, visible: document.getElementById('range').style.display !== 'none' };
});
ok(sel && sel.r.s1 - sel.r.s0 > 1000 && sel.visible && /Selected km/.test(sel.shown), `drag in the cost strip selects a stretch (${sel && ((sel.r.s1 - sel.r.s0) / 1000).toFixed(2)} km)`);
ok(sel && sel.shown.includes((sel.sum >= 1e9 ? (sel.sum / 1e9).toFixed(2) + ' bn' : (sel.sum / 1e6).toFixed(sel.sum >= 1e7 ? 0 : 1) + ' M')), `HUD shows the cost of the stretch (${sel && (sel.sum / 1e6).toFixed(0)} M CZK)`);
// 4c. manual construction on the selected range: buttons, shortcuts, undo and explicit grade mode.
await page.click('#range [data-structure="1"]');
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.structureOverrides.length === 1 && s.d.structureOverrides[0].kind === 1, 'Bridge button paints selected range');
await page.keyboard.press('t');
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.structureOverrides.length === 1 && s.d.structureOverrides[0].kind === 2, 'T repaints the range as tunnel');
await page.keyboard.press('e');
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.structureOverrides[0].kind === 0, 'E repaints earthwork');
await page.keyboard.press('c');
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.structureOverrides.length === 0, 'C clears the override, not the selection');
await page.keyboard.press('Control+z');
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.structureOverrides[0].kind === 0, 'Undo restores cleared override');
await page.click('#grade-auto');
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.profileMode === 'auto' && s.d.structureOverrides[0].kind === 0, 'Auto retains manual structure paint');
await page.click('#grade-manual');
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.profileMode === 'manual' && await page.getAttribute('#grade-manual', 'aria-pressed') === 'true', 'Manual button freezes the current profile');
await page.keyboard.press('Escape');
sel = await page.evaluate(() => ({ r: window.trapla.range(), visible: document.getElementById('range').style.display !== 'none' }));
ok(sel.r === null && !sel.visible, 'Esc returns to the whole route');
await page.mouse.click(cb.x + 500, cb.y + cb.height - 22 - 54 - 3 - 5);
sel = await page.evaluate(() => window.trapla.range());
ok(sel !== null, `clicking the alignment band selects a tangent / curve (${sel && (sel.s0 / 1000).toFixed(2)}–${sel && (sel.s1 / 1000).toFixed(2)} km)`);
await page.click('#range button');
sel = await page.evaluate(() => window.trapla.range());
ok(sel === null, '"Whole route" button clears the selection');
// 5. right-click deletes the PI
await frames();
const b2 = await page.locator('.pi').first().boundingBox();
await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2, { button: 'right' });
await page.evaluate(() => window.trapla.whenIdle());
s = await st();
ok(s.d.pis.length === 0, `right-click deletes a PI (${s.d.pis.length})`);
// 6. persistence
await page.reload();
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
s = await st();
ok(s.d.pis.length === 0 && s.d.profileMode === 'manual' && s.d.structureOverrides[0]?.kind === 0, 'design and manual structure paint persisted across reload');
ok(errors.length === 0, `no console errors ${errors.join(' | ')}`);
await browser.close(); await server.close();
