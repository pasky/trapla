// A pin the player set is honoured (PLAN.md "A pin the player set is honoured"): the owner's I/35 case (Turnov →
// Valdštejnsko, a pin 256.0 m at km 0.29 under the Liberec railway's bridge height) played as a player: the road line
// dragged in the profile pins it, the height typed on the pin's card; the problem at the railway, its fix the pin; the
// fix's button; then the Královec railway's pin 441.9 m at km 2.03, out of reach of the climb (steeper there), and
// one 100 m higher (out of any reach: left out, said at the pin).
// node scripts/pin-honour-shots.mjs [--gpu]   (writes docs/screenshots/690…; OUT= another folder)
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const out = process.env.OUT ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const game = await startGame({ viewport: { width: 1600, height: 1000 } });
const { page } = game;
const T = (f, a) => page.evaluate(f, a);
const shot = async (name) => { await game.idle(800); await game.still(); await game.park(); await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
const card = () => T(() => document.querySelector('#inspector')?.innerText ?? '');
const at = (s) => T((s) => { const r = window.trapla.result(), i = Math.round(s / r.ds); return { x: r.x[i], y: r.y[i] }; }, s);
const problems = () => T(() => [...document.querySelectorAll('#viol li[data-k]')].map((li) => li.innerText.replace(/\s+/g, ' ')));
/** pin the road where it is at chainage s (a short drag of the road line in the profile), then type the height on its card */
const pin = async (s, z) => {
  const p = await T((s) => window.trapla.profilePoint(s), s);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let k = 1; k <= 3; k++) await page.mouse.move(p.x, p.y - 2 * k);
  await page.mouse.up();
  await game.idle();
  const pins = (await T(() => window.trapla.getDesign())).gradePins;
  assert.equal(pins.length, 1, 'one pin');
  await T((s) => window.trapla.selectStation(s), pins[0].s);
  await page.fill('#pin-z', z.toFixed(1));
  await page.click('#pin-set');
  await game.idle(1500);
  return (await T(() => window.trapla.getDesign())).gradePins[0];
};
/** open the listed problem whose text matches */
const openProblem = async (re) => {
  const k = await T((src) => { const li = [...document.querySelectorAll('#viol li[data-k]')].find((x) => new RegExp(src).test(x.innerText)); li?.click(); return !!li; }, re.source);
  assert(k, `a problem ${re}`);
  await game.idle(600);
};
try {
  await game.open('scenario=i35-turnov&preset=i35-turnov-road'); await game.idle(1500);
  assert((await T(() => window.trapla.summary())).valid, 'the Turnov stage opens VALID');
  await T(() => { window.trapla.profileFocus(0, 1400); });
  const p = await pin(290, 256);
  console.log('pin', p);
  const rail = await at(474);
  await T(([x, y]) => window.trapla.lookAt(x, y, 700, 200, 40), [rail.x, rail.y]);
  await T(() => document.getElementById('chip-viol')?.click());
  await game.idle(400);
  const list = await problems();
  console.log('problems:', list);
  assert(list.some((t) => /Road too low over the railway/.test(t) && /Set the pin at km 0\.29 to/.test(t)), 'the railway problem, its fix the pin');
  await shot('690-i35-pin-honoured-railway-too-low');
  await openProblem(/Road too low over the railway/);
  const c = await card();
  console.log('problem card:', c);
  await shot('691-i35-pin-railway-problem-card');
  // the pin's own card: what honouring it costs
  await T((s) => window.trapla.selectStation(s), p.s);
  await game.idle(400);
  console.log('pin card:', await card());
  await shot('692-i35-pin-card-at-a-cost');
  // the fix's button
  await openProblem(/Road too low over the railway/);
  const set = page.locator('#inspector button.fix', { hasText: /Set the pin to/ });
  assert(await set.count() >= 1, 'a "Set the pin to …" button');
  await set.first().click();
  await game.idle(2000);
  const after = await T(() => window.trapla.summary());
  console.log('after the button:', after.valid, (await T(() => window.trapla.getDesign())).gradePins);
  assert(after.valid, 'the suggested height is VALID');
  await shot('693-i35-pin-set-by-button-valid');

  // the Královec railway (a saved project): the pin 441.9 m at km 2.03, out of reach of the climb at its limit
  const project = JSON.parse(readFileSync('tests/fixtures/qa-final/rail-kralovec.json', 'utf8'));
  await game.open('scenario=d11&preset=d11-rail-kralovec'); await game.idle(1000);
  await T((d) => window.trapla.setProject(d), project); await game.idle(3000);
  await T(() => { window.trapla.profileFocus(1000, 3200); });
  await pin(2030, 441.9);
  await T(() => document.getElementById('chip-viol')?.click());
  await game.idle(400);
  const rl = await problems();
  console.log('railway problems:', rl);
  const q = await at(1800);
  await T(([x, y]) => window.trapla.lookAt(x, y, 900, 120, 35), [q.x, q.y]);
  await shot('694-kralovec-pin-honoured-steep');
  await openProblem(/Too steep/);
  console.log('steep card:', await card());
  await shot('695-kralovec-pin-steep-card');
  // out of any reach (100 m over the climb): left out, said at the pin, the line Auto's own
  await T((s) => window.trapla.selectStation(s), 2030);
  await page.fill('#pin-z', '541.9'); await page.click('#pin-set');
  await game.idle(2000);
  const far = await problems();
  console.log('far pin problems:', far);
  assert(far.length === 1 && /Pinned height out of reach/.test(far[0]), 'one problem, at the pin');
  await T((s) => window.trapla.selectStation(s), 2030); await game.idle(400);
  console.log('far pin card:', await card());
  await shot('696-kralovec-pin-out-of-any-reach');
  assert.deepEqual(game.pageErrors, [], 'no page errors');
} finally { await game.close(); }
