// Shots of the grade line's problems in the player's words (owner's rail-6 shot: "Two roundings of the road
// height overlap" between two of Auto's own, undrawn height points): the owner's Královec drag now valid on
// Auto; By hand, two height pins 30 m apart named, both drawn, with Move / Delete buttons; the move applied;
// an Auto pin drawn in the profile.
//   flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/vc-text-shots.mjs [--out docs/screenshots] [--first 400]
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const OUT = arg('--out', '/tmp/trapla-vc-text-shots');
let number = Number(arg('--first', 400));
mkdirSync(OUT, { recursive: true });
const game = await startGame({ viewport: { width: 1440, height: 900 } });
const { page } = game;
const T = (f, a) => page.evaluate(f, a);
const card = () => page.locator('#hud').innerText();
const shot = async (name) => { await game.idle(); await game.still(); const f = `${OUT}/${number++}-${name}.png`; await page.screenshot({ path: f }); console.log('SHOT', f); };
const park = async () => { const b = await page.locator('#hud').boundingBox(); await page.mouse.move(b.x + b.width - 4, b.y + b.height - 4); };
const setDesign = async (d) => { await T(d => window.trapla.setDesign(d), d); await game.idle(); };
const violations = () => T(() => window.trapla.result().violations.map(v => ({ kind: v.kind, title: v.title, fix: v.fix })));
// the owner's drag: bend 3 of the Královec railway moved (tunnel km 1.98–4.50)
const owner = [{ x: 6012, y: 8426, r: null }, { x: 7966, y: 11521, r: null }, { x: 11493.4, y: 16218.7, r: null }, { x: 11560, y: 18613, r: null }];
try {
  await game.open('scenario=d11&preset=d11-rail-kralovec'); await park();
  const base = await T(() => window.trapla.getDesign());
  await setDesign({ ...base, pis: owner, profileMode: 'auto', vpis: [], gradePins: [] });
  let v = await violations();
  console.log('owner drag, Auto:', JSON.stringify(v));
  assert.ok(!v.some(x => x.kind === 'vcOverlap'), 'Auto squeezes none of its own changes of slope');
  const tunnel = await T(() => window.trapla.result().runs.find(r => r.kind === 2 && r.s0 > 1500 && r.s0 < 2500));
  await T(s => window.trapla.selectPiece(s), (tunnel.s0 + tunnel.s1) / 2); await game.idle();
  console.log('CARD tunnel', (await card()).slice(0, 500));
  await shot('rail-owner-drag-auto-no-overlap');

  // By hand: Auto's line taken over, two height pins 30 m apart at km 6.0 (the climb broken by a 5 ‰ dip between them): the track cannot bend so fast
  const r = await T(() => { const r = window.trapla.result(); return { vpis: r.vpis, grade: Array.from(r.grade), ds: r.ds }; });
  const z = (s) => r.grade[Math.round(s / r.ds)];
  const s1 = 6000, s2 = 6030;
  const vpis = [...r.vpis.filter(p => p.s < s1 - 300 || p.s > s2 + 300), { s: s1 - 300, z: z(s1 - 300), r: null }, { s: s1, z: z(s1), r: null }, { s: s2, z: z(s1) - 0.15, r: null }, { s: s2 + 300, z: z(s2 + 300), r: null }]
    .sort((a, b) => a.s - b.s);
  await setDesign({ ...base, pis: owner, profileMode: 'manual', vpis, gradePins: [] });
  v = await violations();
  console.log('By hand, two pins 30 m apart:', JSON.stringify(v));
  const close = v.find(x => x.kind === 'vcOverlap');
  assert.ok(close, 'two pins too close are reported');
  assert.match(close.title, /height pins? too close/i);
  assert.match(close.fix, /your height pin at km 6\.0[0-3]/);
  assert.doesNotMatch(`${close.title} ${close.fix}`, /rounding|height point|\broad\b/);
  // the problem clicked: its pins selected and both drawn, the card with its buttons
  await page.locator('#hud').getByText(close.title).first().click(); await game.idle();
  await park();
  const text = await card(); console.log('CARD pin', text.slice(0, 900));
  assert.match(text, /Move pin to km/); assert.match(text, /Delete pin/);
  const shown = await T(() => window.trapla.profileShownPoints?.() ?? null);
  console.log('profile handles', shown);
  await shot('rail-by-hand-two-pins-too-close');
  await page.click('[data-fix-vpi-move]'); await game.idle();
  v = await violations();
  console.log('after Move:', JSON.stringify(v));
  assert.ok(!v.some(x => x.kind === 'vcOverlap'), 'moving the pin as asked fixes it');
  await shot('rail-by-hand-pin-moved');

  // Auto with the player's pin at km 3.24 (the owner's card): drawn in the profile
  await setDesign({ ...base, pis: owner, profileMode: 'auto', vpis: [], gradePins: [{ s: 3240, z: z(3240) + 2 }] });
  await T(s => window.trapla.selectPiece(s), 3240); await game.idle();
  await park();
  await shot('rail-auto-pin-drawn');
} finally {
  await game.close();
}
