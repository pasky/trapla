// The I/35 Turnov – Úlibice missions (research/89): the four-lane road's body, the stretch in CHKO Český ráj zone III
// (a note for a class I road), the houses at Nudvojovice in the noise view, the two ends' cards.
// node scripts/scenarios/i35-shots.mjs [--gpu]   (writes docs/screenshots/600 and 605…609; OUT= another folder)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { startGame } from '../lib/browser.mjs';

const out = process.env.OUT ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const game = await startGame({ viewport: { width: 1600, height: 1000 } });
const { page } = game;
const T = (f, a) => page.evaluate(f, a);
const shot = async (name) => { await game.idle(800); await game.still(); await game.park(); await page.screenshot({ path: `${out}/${name}.png` }); };
const card = () => T(() => document.querySelector('#inspector')?.innerText ?? '');
const at = (s) => T((s) => { const r = window.trapla.result(), i = Math.round(s / r.ds); return { x: r.x[i], y: r.y[i] }; }, s);
try {
  // the start screen's card: the three stages and the whole route as its choices, its note
  await page.goto(game.base);
  const box = page.locator('.scenario-picker-card', { hasText: 'Turnov → Úlibice through Český ráj' });
  await box.locator('.scenario-picker-section', { hasText: 'Turnov → Valdštejnsko' }).waitFor();
  assert.equal(await box.locator('.scenario-picker-section').count(), 4, 'three stages and the whole route');
  assert.match(await box.innerText(), /Four-lane road/); assert.match(await box.innerText(), /Not a motorway: a motorway may not enter the protected landscape\./);
  await page.waitForFunction(() => !document.querySelector('.scenario-picker-card button[disabled]'), null, { timeout: 60_000 }).catch(() => {});
  await box.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await box.screenshot({ path: `${out}/600-start-screen-cesky-raj.png` });
  await game.open('scenario=i35-turnov&preset=i35-turnov-road'); await game.idle(1500);
  const sum = await T(() => window.trapla.summary());
  assert(sum.valid, 'the Turnov stage opens VALID');
  // the stretch in zone III of the protected landscape area: a note, not a problem
  const z = await at(4600);
  await T(([x, y]) => { window.trapla.selectRange(4515, 4685); window.trapla.lookAt(x, y, 900, 30, 55); }, [z.x, z.y]);
  const zone = await card();
  console.log('zone III card:', zone);
  assert.match(zone, /zone III of a protected landscape area/); assert.match(zone, /needs the nature authority's consent/);
  await shot('605-i35-chko-zone-iii-note');
  // the four-lane body: two carriageways, a 3 m median, on the bridges twin decks
  const b = await at(2650);
  await T(([x, y]) => { window.trapla.select(null); window.trapla.setView({ photo: false, contours: false }); window.trapla.lookAt(x, y, 260, 40, 50); }, [b.x, b.y]);
  await shot('606-i35-four-lane-body');
  // the noise view at Nudvojovice, south-west of Turnov
  const n = await at(1300);
  await T(([x, y]) => { window.trapla.setView({ noise: true }); window.trapla.lookAt(x, y, 1400, 10, 55); }, [n.x, n.y]);
  await shot('607-i35-nudvojovice-noise');
  await T(() => window.trapla.setView({ noise: false }));
  // end A: the interchange with the D10 and road I/35, not built here
  await T(() => { const p = window.trapla.A; window.trapla.select({ kind: 'end', end: 'a' }); window.trapla.lookAt(p.x, p.y, 1200, 0, 55); });
  const a = await card();
  console.log('end A card:', a);
  assert.match(a, /Interchange with the D10 and road I\/35 to Liberec/); assert.doesNotMatch(a, /motorway/i);
  await shot('608-i35-end-a');
  // end B of the whole route: it goes on as the D35
  await game.open('scenario=i35-full&preset=i35-full-road'); await game.idle(3000);
  assert((await T(() => window.trapla.summary())).valid, 'the whole route opens VALID');
  await T(() => { const p = window.trapla.B; window.trapla.select({ kind: 'end', end: 'b' }); window.trapla.lookAt(p.x, p.y, 1500, 0, 55); });
  const e = await card();
  console.log('end B card:', e);
  assert.match(e, /Goes on as the D35 to Hradec Králové/);
  await shot('609-i35-end-b');
  assert.deepEqual(game.pageErrors, [], 'no page errors');
} finally { await game.close(); }
