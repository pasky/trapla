// Shots of the bug-fix sweep (research/60): the player's straightening on the D3 motorway (done at km 2.67,
// said at km 7.94), the sheds a field-track reroute buys out (km 3.63), a street reroute that takes homes
// because nothing else is buildable (D11 direct-80), the cleared plots of the sheds, a track Auto straightens on its own earthworks
// (town-centre km 10.05), the top bars at 1,366 px.
//   flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/bugfix-sweep-shots.mjs [--out docs/screenshots] [--first 240]
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const OUT = arg('--out', '/tmp/trapla-bugfix-shots');
let number = Number(arg('--first', 240));
mkdirSync(OUT, { recursive: true });
const game = await startGame({ viewport: { width: 1440, height: 900 } });
const { page } = game;
const T = (f, a) => page.evaluate(f, a);
const design = (f) => JSON.parse(readFileSync(f, 'utf8')).design;
const card = () => page.locator('#hud').innerText();
const shot = async (name) => { await game.idle(); await game.still(); const f = `${OUT}/${number++}-${name}.png`; await page.screenshot({ path: f }); console.log('SHOT', f); };
const show = async (roadId, dist, bearing, elev) => {
  const c = await T(id => window.trapla.result().crossings.find(c => c.roadId === id), roadId);
  assert.ok(c, `way ${roadId} is crossed`);
  await T(id => window.trapla.selectCrossing(id), roadId); await game.idle();
  await T(([c, d, b, e]) => window.trapla.lookAt(c.x, c.y, d, b, e), [c, dist, bearing, elev]); await game.idle(); await game.still();
  return c;
};
// park the pointer over the side panel's corner (no hover on the map)
const park = async () => { const b = await page.locator('#hud').boundingBox(); await page.mouse.move(b.x + b.width - 4, b.y + b.height - 4); };
try {
  await game.open('scenario=d3&preset=d3-motorway'); await park();
  // km 2.67: the player straightens the track: a 31 m box instead of 36 m, lowered on ramps
  await show(789, 260, 200, 38);
  await page.click('[data-crossing-square="1"]'); await game.idle();
  const done = await show(789, 260, 200, 38);
  let text = await card(); console.log("CARD 2.67", text.slice(0, 600));
  assert.match(text, /Straightened to cross at a right angle \(your choice\)/);
  await shot('d3-motorway-track-straightened-by-player');
  await page.keyboard.press('Control+z'); await game.idle();
  // km 7.94: it cannot be straightened (the bank beside our road is too steep even on 10 m of earthworks):
  // said, kept on its line, our road as it was
  const before = await T(() => window.trapla.result().cost.total);
  await show(1734, 300, 200, 40);
  await page.click('[data-crossing-square="1"]'); await game.idle();
  await show(1734, 300, 200, 40);
  text = await card(); console.log('CARD 7.94', text.slice(0, 900));
  assert.match(text, /cannot be straightened here/); assert.doesNotMatch(text, /clashes/);
  assert.equal(await T(() => window.trapla.result().cost.total), before);
  await shot('d3-motorway-track-cannot-be-straightened');
  await page.keyboard.press('Control+z'); await game.idle();
  // km 3.63: the field-track diversion buys out three sheds (not houses)
  await show(1869, 260, 120, 50);
  text = await card(); console.log('CARD 3.63', text.slice(0, 700));
  assert.match(text, /3 buildings stand in its way/);
  await shot('d3-motorway-track-reroute-sheds');
  // …the three sheds drawn bought out, beside the new track zigzagging up the bank
  await T(() => window.trapla.select(null)); await T(() => window.trapla.lookAt(3840, 12170, 120, 150, 55)); await game.idle(); await game.still();
  assert.ok(await T(() => [12776, 8935, 8911].every(j => window.trapla.result().demolished.some(d => d.j === j) && window.trapla.buildingTaken(j))), 'the sheds are drawn bought out');
  await shot('d3-motorway-track-reroute-sheds-cleared');
  // D11 direct-80 km 6.83: a street reroute takes three homes: nothing else is buildable at Auto's grade
  await game.open('scenario=d11'); await park();
  await T(d => window.trapla.setDesign(d), design('scripts/direct-80-design.json')); await game.idle();
  await show(2047, 420, 160, 50);
  text = await card(); console.log('CARD 6.83', text.slice(0, 700));
  assert.match(text, /3 houses and 3 other buildings stand in its way/);
  await shot('d11-direct-80-street-reroute-homes');
  // town-centre km 10.05: Auto straightens the track, its new line on its own earthworks up the bank
  await T(d => window.trapla.setDesign(d), design('scripts/town-centre-design.json')); await game.idle();
  await show(3637, 300, 230, 35);
  text = await card(); console.log('CARD 10.05', text.slice(0, 600));
  assert.match(text, /straightened to cross at a right angle/);
  await shot('town-centre-track-straightened-on-earthworks');
  // the top bars at 1,366 px: the key hints dropped, nothing overlaps
  await page.setViewportSize({ width: 1366, height: 768 }); await game.idle(); await game.still();
  await page.screenshot({ path: `${OUT}/${number}-top-bars-1366.png`, clip: { x: 0, y: 0, width: 1366, height: 120 } }); console.log('SHOT', `${OUT}/${number++}-top-bars-1366.png`);
  assert.deepEqual(game.pageErrors, [], `page errors: ${game.pageErrors}`);
} finally { await game.close(); }
