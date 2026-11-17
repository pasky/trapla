// Interaction smoke test with real mouse events: a click on empty ground adds nothing, dragging the road
// adds a bend, drag it, the inspector for a stretch (buttons + keys), By hand height points, undo,
// right-click delete, double-click add, persistence.
import { startGame } from './lib/browser.mjs';

const game = await startGame();
try {
const { page, errors } = game;
await game.open('scenario=d11', { intro: true }); // a first run: nothing stored, the intro shows
const idle = () => page.evaluate(() => window.trapla.whenIdle());
// markers are positioned by the view's next frame, which can lag an edit under software rendering
const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const st = () => page.evaluate(() => ({ d: window.trapla.getDesign(), s: window.trapla.summary() }));
const view = await page.locator('#view').boundingBox();

// 0. the start is the straight line with the automatic (legal) grade line
let s = await st();
ok(s.d.pis.length === 0 && s.d.profileMode === 'auto', `starts from the straight line with the auto profile (${s.d.profileMode})`);
ok(s.s.violations.every((v) => v.goal || v.kind !== 'gradient'), 'the start profile has no gradient violations');
const struck = () => page.evaluate(() => document.getElementById('total').classList.contains('invalid'));
ok(await struck() === !s.s.valid, `cost is struck through exactly when the design is not valid (valid: ${s.s.valid})`);
ok(await page.locator('#intro').isVisible(), 'the first-run intro is shown');
ok(await page.locator('#inspector .money li').count() === 5, 'with nothing selected the inspector lists where the money goes');

// 1. a click on empty ground adds nothing (and dismisses the intro)
const empty = await page.evaluate(() => { const t = window.trapla, a = t.project(t.A.x, t.A.y, 450), b = t.project(t.B.x, t.B.y, 450); return { x: (a.sx + b.sx) / 2 + 200, y: (a.sy + b.sy) / 2 }; });
await page.mouse.click(view.x + empty.x, view.y + empty.y);
await idle();
ok(await page.locator('#intro').isHidden(), 'the first click on the map dismisses the intro');
ok((await st()).d.pis.length === 0, 'a click on empty ground adds no bend');

// 2. drag the road: a new bend follows the mouse
const road = await page.evaluate(() => window.trapla.roadScreen(window.trapla.result().length * 0.45));
await page.mouse.move(view.x + road.sx, view.y + road.sy);
await page.mouse.down();
for (let k = 1; k <= 10; k++) await page.mouse.move(view.x + road.sx + 12 * k, view.y + road.sy + 3 * k);
await page.mouse.up();
await idle();
s = await st();
ok(s.d.pis.length === 1, `dragging the road adds a bend (${s.d.pis.length})`);
ok((await page.evaluate(() => window.trapla.selection()))?.kind === 'bend' && await page.locator('#inspector.k-bend').isVisible(), 'the new bend is selected, its card is open');

// 3. drag the bend marker
await frames();
const box = await page.locator('.pi').first().boundingBox();
const p0 = { ...s.d.pis[0] };
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
for (let k = 1; k <= 8; k++) await page.mouse.move(box.x + box.width / 2 + 10 * k, box.y + box.height / 2 + 4 * k);
await page.mouse.up();
await idle();
s = await st();
ok(Math.hypot(s.d.pis[0].x - p0.x, s.d.pis[0].y - p0.y) > 20, `drag moves the bend (${(s.d.pis[0].x - p0.x).toFixed(0)}, ${(s.d.pis[0].y - p0.y).toFixed(0)})`);
ok(await page.locator('#delta').textContent() !== '', `the score shows what the edit changed (${await page.locator('#delta').textContent()})`);

// 4. a click on the road selects the piece under it
const road2 = await page.evaluate(() => window.trapla.roadScreen(window.trapla.result().length * 0.2));
await page.mouse.click(view.x + road2.sx, view.y + road2.sy);
await idle();
let sel = await page.evaluate(() => window.trapla.selection());
ok(sel?.kind === "stretch" && !!sel.piece && await page.locator("#inspector.k-stretch").isVisible(), `a click on the road selects its piece (${JSON.stringify(sel)} ${sel?.piece} km ${(sel?.s0 / 1000).toFixed(2)}–${(sel?.s1 / 1000).toFixed(2)})`);
await page.keyboard.press('Escape');
ok(await page.evaluate(() => window.trapla.selection()) === null, 'Esc deselects');

const cb = await page.locator('#profile-canvas').boundingBox();
// 5. profile: "By hand", then drag a height point
await page.evaluate(() => window.trapla.profileFit());
await page.click('#sec-design .fold-h button');
await page.click('#grade-manual');
await idle();
const hit = await page.evaluate(() => {
  const r = window.trapla.result(), k = Math.floor(r.vpis.length / 2), v = r.vpis[k];
  window.trapla.profileFocus(v.s - 300, v.s + 300);
  return { k, z: v.z, ...window.trapla.profilePoint(v.s, v.z) };
});
await page.mouse.move(hit.x, hit.y);
await page.mouse.down();
for (let k = 1; k <= 5; k++) await page.mouse.move(hit.x, hit.y - 6 * k);
await page.mouse.up();
await idle();
s = await st();
ok(s.d.profileMode === 'manual' && s.d.vpis[hit.k].z > hit.z + 1, `By hand: dragging a height point raises it (${hit.z} → ${s.d.vpis[hit.k].z})`);
await page.evaluate(() => window.trapla.profileFit());
// 6. Auto button, undo
await page.click('#grade-auto');
await idle();
s = await st();
ok(s.d.profileMode === 'auto', '"Auto" restores the automatic road height');
await page.keyboard.press('Control+z');
await idle();
s = await st();
ok(s.d.profileMode === 'manual', 'Ctrl+Z undoes');
ok(await struck() === !s.s.valid, `cost struck through when not valid (valid: ${s.s.valid}, ${s.s.violations.length} violations)`);

// 7. hover shows a short tip; dragging sideways in the cost strip selects a stretch
const stripY = cb.y + cb.height - 22 - 25;
await page.mouse.move(cb.x + 400, cb.y + 80);
await page.waitForTimeout(100);
const tip = await page.evaluate(() => { const t = document.querySelector('.profile-tip'); return t && t.style.display !== 'none' ? t.textContent : ''; });
ok(/km \d/.test(tip) && /CZK\/m/.test(tip), `hovering the profile shows a short tip (${tip.slice(0, 50).replace(/\s+/g, ' ')}…)`);
await page.mouse.move(cb.x + 300, stripY);
await page.mouse.down();
for (let k = 1; k <= 10; k++) await page.mouse.move(cb.x + 300 + 20 * k, stripY);
await page.mouse.up();
await idle();
sel = await page.evaluate(() => {
  const t = window.trapla, r = t.range(), res = t.result();
  if (!r) return null;
  let sum = 0;
  const i0 = Math.round(r.s0 / res.ds), i1 = Math.round(r.s1 / res.ds) - 1;
  for (const k of Object.keys(res.parts)) for (let i = i0; i <= i1; i++) sum += res.parts[k][i];
  return { r, sum, shown: document.getElementById('inspector').textContent };
});
ok(sel && sel.r.s1 - sel.r.s0 > 1000 && /Stretch/.test(sel.shown), `drag in the cost strip selects a stretch (${sel && ((sel.r.s1 - sel.r.s0) / 1000).toFixed(2)} km)`);
ok(sel && sel.shown.includes((sel.sum >= 1e9 ? (sel.sum / 1e9).toFixed(2) + ' bn' : (sel.sum / 1e6).toFixed(sel.sum >= 1e7 ? 0 : 1) + ' M')), `the inspector shows the cost of the stretch (${sel && (sel.sum / 1e6).toFixed(0)} M CZK)`);

// 8. what to build on it: buttons, keys A / B / T / E, undo
await page.click('#structure-choice [data-structure="1"]');
await idle();
s = await st();
ok(s.d.structureOverrides.length === 1 && s.d.structureOverrides[0].kind === 1, 'Bridge paints the selected stretch');
await page.keyboard.press('t');
await idle();
s = await st();
ok(s.d.structureOverrides.length === 1 && s.d.structureOverrides[0].kind === 2, 'T repaints it as tunnel');
const viewBeforePaint = await page.locator('#viewbar').innerHTML();
await page.keyboard.press('e');
await idle();
s = await st();
ok(s.d.structureOverrides[0].kind === 0, 'E repaints earthwork');
await page.keyboard.press('a');
await idle();
s = await st();
ok(s.d.structureOverrides.length === 0, 'A clears the choice, not the selection');
ok(await page.locator('#viewbar').innerHTML() === viewBeforePaint, 'the stretch keys do not change the map views');
await page.keyboard.press('a'); // clearing an already automatic stretch must not add undo history
await idle();
await page.keyboard.press('Control+z');
await idle();
s = await st();
ok(s.d.structureOverrides[0]?.kind === 0, 'Undo restores the cleared choice despite a repeated Auto');
ok((await page.evaluate(() => window.trapla.selection()))?.kind === 'stretch' && await page.locator('#inspector.k-stretch').isVisible(), 'Undo keeps the stretch selected, its card open');
await page.click('#grade-auto');
await idle();
s = await st();
ok(s.d.profileMode === 'auto' && s.d.structureOverrides[0].kind === 0, 'Auto height keeps the structure choice');
await page.click('#grade-manual');
await idle();
s = await st();
ok(s.d.profileMode === 'manual' && await page.getAttribute('#grade-manual', 'aria-checked') === 'true', '"By hand" starts from the current automatic heights');
await page.keyboard.press('Escape');
ok(await page.evaluate(() => window.trapla.range()) === null && await page.locator('#inspector.idle').isVisible(), 'Esc returns to the whole route (the card closes)');
await page.mouse.click(cb.x + 500, cb.y + cb.height - 22 - 54 - 3 - 5);
sel = await page.evaluate(() => window.trapla.range());
ok(sel !== null, `clicking the alignment band selects a tangent / curve (${sel && (sel.s0 / 1000).toFixed(2)}–${sel && (sel.s1 / 1000).toFixed(2)} km)`);
await page.click('#inspector .x');
ok(await page.evaluate(() => window.trapla.range()) === null, '✕ deselects');

// 9. right-click deletes the bend; double-click on empty ground adds one
await frames();
const b2 = await page.locator('.pi').first().boundingBox();
await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2, { button: 'right' });
await idle();
s = await st();
ok(s.d.pis.length === 0, `right-click deletes a bend (${s.d.pis.length})`);
await page.evaluate(() => window.trapla.resetCamera());
await frames();
await page.mouse.dblclick(view.x + empty.x, view.y + empty.y);
await idle();
s = await st();
ok(s.d.pis.length === 1, `double-click on the ground adds a bend (${s.d.pis.length})`);
await page.keyboard.press('Control+z');
await idle();

// 10. persistence
await page.reload();
await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
s = await st();
ok(s.d.pis.length === 0 && s.d.profileMode === 'manual' && s.d.structureOverrides[0]?.kind === 0, 'design and structure choice persisted across reload');
ok(await page.locator('#intro').isHidden(), 'the dismissed intro stays away after a reload');
ok(errors.length === 0, `no console errors ${errors.join(' | ')}`);
} finally { await game.close(); }
