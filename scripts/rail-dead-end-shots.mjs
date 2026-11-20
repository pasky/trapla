// Two engine gaps closed (2026-11-20): a mapped dead end under our works that served nothing held Auto's line up
// (I/35 Turnov km 3.0: now Auto ends it beside our works itself), and an existing railway could not be carried over
// our road on a new bridge (now Auto weighs it, the player picks it on the railway's card, a pin's fix offers it).
// Checks what it shows and writes the screenshots.
//   node scripts/rail-dead-end-shots.mjs [--docs]   (--docs: docs/screenshots/740…747, else /tmp/rail-dead-end-shots)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const out = process.argv.includes('--docs') ? 'docs/screenshots' : (process.env.OUT ?? '/tmp/rail-dead-end-shots');
mkdirSync(out, { recursive: true });
const game = await startGame({ viewport: { width: 1400, height: 900 } });
const { page } = game;
const T = (f, a) => page.evaluate(f, a);
const idle = (ms = 600) => game.idle(ms);
const shot = async (name) => { await game.park(); await page.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
const card = () => T(() => document.querySelector('#inspector')?.innerText ?? '');
try {
  // ---- 1. I/35 Turnov: the local road's dead end at km 3.0, ended beside our works by Auto ----
  await game.open('scenario=i35-turnov');
  // (the curveball's news, if it shows: read and closed)
  const news = page.locator('button', { hasText: /^OK$/ });
  if (await news.count()) { await news.first().click(); await idle(200); }
  const dead = await T(() => {
    const r = window.trapla.projectResult(), route = Object.values(r.routes)[0].legacy;
    const f = route.footprintConflicts.find(c => c.takenUp && Math.abs(c.s0 - 2990) < 40);
    return { total: r.cost.total, valid: r.valid, f: f && { s0: f.s0, s1: f.s1, length: f.takenUp.length, cost: f.takenUp.cost, x: f.x, y: f.y, detail: f.detail } };
  });
  console.log('i35 turnov', JSON.stringify(dead));
  assert.ok(dead.valid && dead.total < 4.8e9, `the starter ${(dead.total / 1e9).toFixed(2)} bn, valid`);
  assert.ok(dead.f && dead.f.length > 10, 'the local road\'s dead end at km 3.0 is taken up');
  await T(() => window.trapla.setView({ photo: true, contours: false }));
  await T(([x, y]) => { window.trapla.lookAt(x, y, 420, 20, 50); window.trapla.selectRange(2900, 3100); }, [dead.f.x, dead.f.y]);
  await idle(); await game.still();
  // (the quantities: what lies in our road's way there)
  if (!await page.locator('#stats').isVisible()) await page.locator('#sec-stats .fold-h button').click();
  await idle(200);
  await page.locator('#stats summary', { hasText: /Things in the road/ }).first().click();
  await idle(300);
  const panel = await T(() => document.body.innerText);
  assert.match(panel, /its last \d+ m taken up, a turning area where it now ends/, 'the quantities say it is taken up');
  await shot('740-i35-dead-end-taken-up');
  await T(([x, y]) => { window.trapla.setView({ photo: false }); window.trapla.lookAt(x, y, 150, 340, 40); }, [dead.f.x, dead.f.y]);
  await idle(); await game.still();
  await shot('741-i35-dead-end-close');

  // ---- 2. D11: the railway at km 14.13 carried over our cutting on a new bridge (Auto's) ----
  await game.open('scenario=d11');
  const rails = await T(() => (window.trapla.result().railCrossings ?? []).map(c => ({ s: c.s, how: c.how, auto: c.auto, x: c.x, y: c.y, g: c.g, cost: c.cost, above: c.above, price: c.price?.cost })));
  console.log('d11 rails', JSON.stringify(rails.map(c => [Math.round(c.s), c.how, Math.round((c.price ?? 0) / 1e6)])));
  const over = rails.find(c => c.how === 'railway');
  assert.ok(over, 'Auto carries one railway over our road');
  const before = await T(() => window.trapla.result().cost.total);
  await T(([x, y, s]) => { window.trapla.setView({ photo: false, contours: false }); window.trapla.lookAt(x, y, 170, 150, 42); window.trapla.select({ kind: 'rail', s }); }, [over.x, over.y, over.s]);
  await idle(); await game.still();
  let text = await card();
  console.log('card', text);
  assert.match(text, /Carried over our road on a new \d+ m bridge/); assert.match(text, /Auto: cheaper here than lifting our road over the railway/);
  assert.match(text, /The railway over us/); assert.match(text, /Our bridge over it/);
  await shot('742-d11-railway-over-us');
  // the deck is what a click there selects
  await T(() => window.trapla.select(null)); await idle(200);
  const deck = await T(([x, y, z]) => window.trapla.screenOf(x, y, z), [over.x, over.y, over.g]);
  const box = await page.locator('#view').boundingBox();
  await page.mouse.click(box.x + deck.sx, box.y + deck.sy); await idle(300);
  assert.deepEqual(await T(() => window.trapla.selection()), { kind: 'rail', s: over.s }, 'a click on its deck opens the railway\'s card');
  // the player's other way: our bridge over it
  await page.locator('#inspector button', { hasText: 'Our bridge over it' }).click(); await idle(1500); await game.still();
  const bridged = await T((s) => { const r = window.trapla.result(), c = r.railCrossings.find(c => Math.abs(c.s - s) < 150); return { how: c.how, chosen: c.chosen, total: r.cost.total, valid: r.valid }; }, over.s);
  text = await card();
  console.log('bridged', JSON.stringify(bridged), text);
  assert.equal(bridged.how, 'ours'); assert.equal(bridged.chosen, 'bridge'); assert.ok(bridged.total > before, 'our bridge over it costs more');
  assert.match(text, /Your choice/);
  await shot('743-d11-railway-our-bridge-chosen');
  assert.equal((await T(() => window.trapla.undoLabels())).undo, 'a railway crossing');
  await page.keyboard.press('Control+z'); await idle(1500);
  assert.equal(await T(() => window.trapla.result().cost.total), before, 'undo: Auto\'s again');
  // the profile: the rail mark at the rails' level, the railway's deck over our road
  await T(([s]) => { window.trapla.select({ kind: 'rail', s }); window.trapla.profileFocus(s - 400, s + 400); }, [over.s]);
  await idle(); await game.still();
  await shot('744-d11-railway-profile');

  // ---- 3. a pin that holds our road at the railway's level: its fixes, our bridge over it or the railway over us ----
  // (Auto's railway over us at km 14.13: a pin 2 m over the rails)
  const ours = over;
  const z = Math.round((ours.g + 2) * 10) / 10;
  await T(([s, z]) => { const d = window.trapla.getDesign(); d.gradePins = [...(d.gradePins ?? []), { s: Math.round(s), z }]; window.trapla.setDesign(d); }, [ours.s, z]);
  await idle(1500);
  await T(([x, y, s]) => { window.trapla.lookAt(x, y, 500, 0, 45); window.trapla.selectStation(Math.round(s)); window.trapla.profileFocus(s - 600, s + 600); }, [ours.x, ours.y, ours.s]);
  await idle(); await game.still();
  text = await card();
  console.log('pin card', text, JSON.stringify(await T((s) => window.trapla.result().railCrossings.filter(c => Math.abs(c.s - s) < 100).map(c => [c.how, c.above]), ours.s)));
  assert.match(text, /Lower to [\d.]+ m: the railway on a bridge over us/);
  await shot('745-d11-pin-railway-over-us');
  assert.equal(game.pageErrors.length, 0, `no page errors (${game.pageErrors.join('; ')})`);
} finally { await game.close(); }
