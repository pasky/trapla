// Player pass over model 24 (crossing remedies as designers choose them): the D3 motorway starter's road
// running along the motorway moved beside it, two field tracks on one bridge (and what its skewed ways do
// when the player straightens them); on best a skewed way Auto straightens, the player keeping its line and
// straightening it again, and a service road moved aside; Nová Paka's neighbouring roads led to one crossing.
// The examples are found by what they show (which ways show it changes with the cost model).
// flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/crossing-economy-shots.mjs [--out docs/screenshots] [--first 170]
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const out = arg('--out', 'docs/screenshots'); let number = Number(arg('--first', 170));
mkdirSync(out, { recursive: true });
const game = await startGame();
const { page, pageErrors: errors } = game;
const idle = () => game.idle(700);
const shot = async (name) => { const path = `${out}/${number++}-${name}.png`; await game.park(); await page.screenshot({ path }); console.log('SHOT', path); };
const card = async () => (await page.evaluate(() => document.getElementById('inspector')?.innerText ?? '')).replace(/\s+/g, ' ');
const T = (f, a) => page.evaluate(f, a);
const design = (file) => JSON.parse(readFileSync(file, 'utf8')).design;
const crossingNear = (s, roadId) => T(([s, roadId]) => window.trapla.result().crossings
  .filter(c => roadId === undefined || c.roadId === roadId).reduce((a, c) => !a || Math.abs(c.s - s) < Math.abs(a.s - s) ? c : a, null), [s, roadId]);
const show = async (c, distance, azimuth, tilt, span = 300) => {
  await T(([c, d, az, t, span]) => { window.trapla.selectCrossing(c.roadId); window.trapla.lookAt(c.x, c.y, d, az, t); window.trapla.profileFocus(c.s - span, c.s + span); }, [c, distance, azimuth, tilt, span]);
  await idle();
};
try {
  // D3 motorway starter
  await game.open('scenario=d3&preset=d3-motorway'); await idle();
  await T(d => window.trapla.setDesign(d), design('scripts/scenarios/d3/d3-motorway.json')); await idle();
  const total = await T(() => { const r = window.trapla.result(); return { total: r.cost.total, valid: r.valid, v: r.violations.map(v => v.title) }; });
  console.log('D3 MOTORWAY', JSON.stringify(total));
  assert.ok(total.valid, 'the D3 motorway starter is valid');
  const moved = await T(() => window.trapla.result().crossings.filter(c => c.moved).sort((a, b) => (b.linkLength ?? 0) - (a.linkLength ?? 0))[0] ?? null);
  assert.ok(moved, 'a road running along the motorway is moved beside it');
  await show(moved, 900, 30, 45, 600);
  let text = await card(); console.log('CARD moved', text.slice(0, 500));
  assert.match(text, /Moved beside our motorway/);
  await shot('d3-motorway-road-moved-beside');
  // A skewed box or bridge over us: Auto lays the way on a new line that crosses at a right angle where that
  // is cheaper and fits, else keeps its line; the card offers the other. What the starter's most skewed ways
  // do when the player asks (said here; the pictures of both are taken on best, below).
  const skewed = await T(() => window.trapla.result().crossings.filter(c => (c.type === 'underpass' || c.type === 'overbridge') && !c.geometry?.sameSide && c.geometry?.skew !== undefined)
    .sort((a, b) => a.geometry.skew - b.geometry.skew).slice(0, 4));
  const state = async (tag, roadId) => { const c = await T(id => window.trapla.result().crossings.find(c => c.roadId === id), roadId), r = await T(() => { const r = window.trapla.result(); return { valid: r.valid, v: r.violations.filter(v => v.kind === 'crossing').map(v => `${v.title} | ${v.fix}`) }; });
    console.log(tag, `km ${(c.s / 1000).toFixed(2)}`, c.cls, c.type, c.squared !== undefined ? `straightened (met at ${Math.round(c.squared)}°)` : `on its line (${Math.round(c.geometry?.skew ?? 90)}°)`, `box ${Math.round(c.underpassLength ?? 0)} m`, `span ${Math.round(c.span ?? 0)} m`, `${(c.cost / 1e6).toFixed(1)} M`, JSON.stringify(r)); };
  for (const c of skewed) {
    await show(c, 260, 200, 35);
    const button = c.squared !== undefined ? '[data-crossing-square="0"]' : '[data-crossing-square="1"]';
    if (!(await page.locator(button).count())) continue; // not skewed enough to be offered
    await state('D3 AUTO', c.roadId);
    await page.click(button); await idle();
    await state('D3 PLAYER', c.roadId);
    await page.click('#crossing-choice [data-crossing=""]'); await idle(); // back to Automatic
  }
  const pair = await crossingNear(3630, undefined);
  console.log('3.63', pair.type, pair.targetS, pair.linkLength);
  await show(pair, 900, 160, 50, 600);
  console.log('CARD 3.63', (await card()).slice(0, 400));
  await shot('d3-motorway-neighbouring-tracks');
  // best: a skewed way Auto straightens (it was town-centre's service road at km 15.98 until its 30 m box
  // on its own line became the cheaper one)
  await game.open('scenario=d11'); await idle();
  await T(d => window.trapla.setDesign(d), design('scripts/best-design.json')); await idle();
  const square = await T(() => window.trapla.result().crossings.find(c => c.squared !== undefined) ?? null);
  if (square) {
    await show(square, 300, 300, 32);
    text = await card(); console.log('CARD straightened', text.slice(0, 500));
    assert.match(text, /straightened to cross at a right angle/); assert.match(text, /Keep its line/);
    await state('BEST AUTO', square.roadId); await shot('best-way-straightened');
    // the player keeps the way on its own line (a longer bridge or box; said so where it does not fit), then
    // straightens it again
    await page.click('[data-crossing-square="0"]'); await idle();
    await show(square, 300, 300, 32);
    await state('BEST PLAYER', square.roadId); await shot('best-way-kept-line');
    await page.click('[data-crossing-square="1"]'); await idle();
    text = await card(); console.log('CARD straightened again', text.slice(0, 300));
    assert.match(text, /straightened/);
    await page.click('#crossing-choice [data-crossing=""]'); await idle(); // back to Automatic
  } else { console.log('SKIPPED: best has no way Auto straightens'); number += 2; }
  // best: a service road that runs into our earthworks and back out on the same side, moved aside
  const aside = await T(() => window.trapla.result().crossings.find(c => c.moved));
  if (aside) {
    await show(aside, 400, 120, 45);
    console.log('CARD moved', (await card()).slice(0, 400));
    await shot('best-service-road-moved-aside');
  } else { console.log('SKIPPED: best moves no road aside'); number++; }
  // Nová Paka: the service road and the tracks beside it, led to one crossing (the view takes in both)
  await game.open('scenario=i16-nova-paka'); await idle();
  await T(d => window.trapla.setDesign(d), design('scripts/scenarios/i16-nova-paka/default.json')); await idle();
  const joined = await crossingNear(3480, undefined);
  console.log('NOVA PAKA 3.48', joined.type, joined.targetS, joined.linkLength);
  await show(joined, 260, 200, 38, 300);
  console.log('CARD 3.48', (await card()).slice(0, 400));
  const target = joined.targetS === undefined ? null : await T(s => { const r = window.trapla.result(), i = Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds))); return { x: r.x[i], y: r.y[i] }; }, joined.targetS);
  if (target) { await T(([c, t]) => window.trapla.lookAt((c.x + t.x) / 2, (c.y + t.y) / 2, Math.max(260, 1.6 * Math.hypot(c.x - t.x, c.y - t.y)), 200, 45), [joined, target]); await idle(); }
  await shot('nova-paka-roads-joined-to-one-crossing');
  assert.deepEqual(errors, [], `page errors: ${errors}`);
} finally { await game.close(); }
