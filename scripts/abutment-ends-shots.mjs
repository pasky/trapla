// Shots of bridge ends under one rule (cost model 42, PLAN.md "Bridge ends: one rule"): the Královec railway's ends
// that were walls of 16–28 m (km 5.61 / 5.70, km 10.27: the owner's shot) now on cones, the fill boxed in between them
// one bridge; D11's straight start: an end that was an 11.4 m wall now on a cone, a closed end within 10 m with its
// wall's height and price on the bridge card.
//   flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/abutment-ends-shots.mjs [--out docs/screenshots] [--first 390]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const OUT = arg('--out', '/tmp/trapla-abutment-ends-shots');
let number = Number(arg('--first', 390));
mkdirSync(OUT, { recursive: true });
const game = await startGame({ viewport: { width: 1440, height: 900 } });
const { page } = game;
const T = (f, a) => page.evaluate(f, a);
const card = () => page.locator('#hud').innerText();
const shot = async (name) => { await game.idle(); await game.still(); const f = `${OUT}/${number++}-${name}.png`; await page.screenshot({ path: f }); console.log('SHOT', f); };
const park = async () => { const b = await page.locator('#hud').boundingBox(); await page.mouse.move(b.x + b.width - 4, b.y + b.height - 4); };
/** look at chainage s of the current result from `dist` m, bearing and elevation in degrees */
const look = (s, dist, bearing, elev) => T(([s, d, b, e]) => { const r = window.trapla.result(), i = Math.round(s / r.ds); window.trapla.lookAt(r.x[i], r.y[i], d, b, e); }, [s, dist, bearing, elev]);
const runNear = (s) => T(s => window.trapla.result().runs.find(r => r.kind === 1 && r.s0 - 30 <= s && r.s1 + 30 >= s), s);
try {
  // 1. the Královec railway: the end at km 10.27 (the owner's 28 m wall) on its cone
  await game.open('scenario=d11&preset=d11-rail-kralovec'); await park();
  const at10 = await runNear(10270);
  assert.ok(at10 && !at10.closedEnds?.[0], 'km 10.27: no closed end');
  assert.ok((await T(s => window.trapla.result().cones.some(c => Math.abs(c.s - s) < 1), at10.s0)), 'km 10.27: a cone');
  await T(s => window.trapla.selectPiece(s), (at10.s0 + at10.s1) / 2); await game.idle();
  let text = await card(); console.log('CARD rail km 10.27', text.slice(0, 600));
  assert.match(text, /Its ends stand on fills/);
  await look(10265, 200, 240, 15);
  await shot('rail-kralovec-km-10-27-end-on-a-cone');
  // 2. km 5.46–6.54: the 80 m fill boxed in by walls of 25 and 16 m is now part of one bridge
  const at5 = await runNear(5650);
  assert.ok(at5 && at5.s0 < 5500 && at5.s1 > 6500, `one bridge over km 5.5–6.5 (${at5?.s0}–${at5?.s1})`);
  assert.ok(!at5.closedEnds, 'no closed end');
  await T(s => window.trapla.selectPiece(s), 5650); await game.idle();
  text = await card(); console.log('CARD rail km 5.46–6.54', text.slice(0, 400));
  await look(5650, 600, 120, 20);
  await shot('rail-kralovec-km-5-6-one-bridge-no-boxed-fill');
  // 3. D11 straight start: km 2.42, once an 11.4 m wall beside road III/3012, on a cone (the bridge 30 m longer)
  await game.open('scenario=d11'); await park();
  const at2 = await runNear(2400);
  assert.ok(at2 && !at2.closedEnds?.[1], 'km 2.4: a cone');
  await look(2410, 110, 150, 22);
  await shot('d11-km-2-42-end-on-a-cone-beside-the-road');
  // 4. D11 straight start: km 3.49, a closed end on an 8.5 m fill: its wall's height and price on the card
  const at3 = await runNear(3450);
  assert.ok(at3?.closedEnds?.[1], 'km 3.49: a closed end');
  assert.ok(at3.endWalls[1].height <= 10 && at3.endWalls[1].cost > 0);
  await T(s => window.trapla.selectPiece(s), (at3.s0 + at3.s1) / 2); await game.idle();
  text = await card(); console.log('CARD D11 km 3.49', text.slice(0, 700));
  assert.match(text, /One end is a wall \d+ m high down to the ground, so the fill does not cover what lies below: [\d.,]+ M CZK/);
  await look(3500, 60, 10, 25);
  await shot('d11-km-3-49-wall-within-10-m-billed');
  assert.deepEqual(game.pageErrors, []);
} finally { await game.close(); }
