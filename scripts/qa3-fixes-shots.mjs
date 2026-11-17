// Shots of the sweep-3 fixes (research/66, /69): a slowed bend's card (its stretch, the faster curve Auto keeps), the
// railway bend card (no speed above the line's), the D3 0302 Sázava bridge with an arch, the D35 viaduct saying why
// no arch fits, the tunnel card after the player's cut and cover, a near U-turn offering a hairpin.
//   flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/qa3-fixes-shots.mjs [--out docs/screenshots] [--first 290]
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const OUT = arg('--out', '/tmp/trapla-qa3-fixes-shots');
let number = Number(arg('--first', 290));
mkdirSync(OUT, { recursive: true });
const game = await startGame({ viewport: { width: 1440, height: 900 } });
const { page } = game;
const T = (f, a) => page.evaluate(f, a);
const card = () => page.locator('#hud').innerText();
const shot = async (name) => { await game.idle(); await game.still(); const f = `${OUT}/${number++}-${name}.png`; await page.screenshot({ path: f }); console.log('SHOT', f); };
const park = async () => { const b = await page.locator('#hud').boundingBox(); await page.mouse.move(b.x + b.width - 4, b.y + b.height - 4); };
const setDesign = async (d) => { await T(d => window.trapla.setDesign(d), d); await game.idle(); };
/** select Auto's bridge / tunnel at chainage s (its card) and look at it */
const piece = async (s, dist = 900, bearing = 120, elev = 35) => {
  await T(s => window.trapla.selectPiece(s), s); await game.idle();
  const r = await T(() => { const r = window.trapla.result(); return { x: Array.from(r.x), y: Array.from(r.y), ds: r.ds }; });
  const i = Math.round(s / r.ds);
  await T(([x, y, d, b, e]) => window.trapla.lookAt(x, y, d, b, e), [r.x[i], r.y[i], dist, bearing, elev]); await game.idle(); await game.still();
};
try {
  // 1. D11, one 7° bend at km 11.7 slowed to 70: its stretch is the whole road; Auto keeps the 90 km/h curve (it fits)
  //    and rounds the heights as for 90 km/h (cheaper here)
  await game.open('scenario=d11'); await park();
  const one = JSON.parse(readFileSync('qa3/designs/d11-one-bend-70.json', 'utf8'));
  await setDesign(one);
  await T(() => window.trapla.selectPi(0)); await game.idle();
  let text = await card(); console.log('CARD bend 70', text.slice(0, 700));
  assert.match(text, /Its stretch is the whole road/);
  assert.match(text, /Auto keeps the 90 km\/h curve here: it fits/);
  assert.match(text, /hilltops and dips as for 90 km\/h/);
  assert.equal(Math.round(await T(() => window.trapla.result().cost.total) / 1e6), 8782);
  await shot('d11-one-bend-70-keeps-90-geometry');
  // 2. a near U-turn on the Rýchory slope: "Make it a hairpin"
  await setDesign({ category: 'S9.5', speed: 90, pis: [{ x: 12400, y: 15300, r: null }, { x: 12850, y: 16650, r: null }, { x: 12560, y: 15300, r: null }], profileMode: 'auto', vpis: [] });
  await T(() => window.trapla.selectPi(1)); await game.idle();
  await T(() => window.trapla.lookAt(12700, 16100, 2200, 160, 60)); await game.idle(); await game.still();
  text = await card(); console.log('CARD U-turn', text.slice(0, 600));
  assert.match(text, /Make it a hairpin/);
  await shot('d11-near-u-turn-offers-hairpin');
  await page.click('[data-fix-hairpin]'); await game.idle();
  await T(() => window.trapla.selectPi(1)); await game.idle();
  text = await card(); console.log('CARD hairpin', text.slice(0, 600));
  assert.match(text, /^Hairpin 2/m);
  await shot('d11-u-turn-made-a-hairpin');
  // 3. the railway mission: a bend no faster than the line's 120 km/h
  await game.open('scenario=d11&preset=d11-rail-kralovec'); await park();
  await T(() => window.trapla.selectPi(2)); await game.idle();
  text = await card(); console.log('CARD rail bend', text.slice(0, 600));
  assert.doesNotMatch(text, /\b160\b|\b140\b/);
  assert.match(text, /no faster than the whole line, 120 km\/h/);
  await shot('rail-bend-speeds-up-to-the-line');
  // 4. D3 0302: the Sázava bridge with an arch among its styles
  await game.open('scenario=d3-0302&preset=d3-0302-motorway'); await park();
  const sazava = await T(() => window.trapla.result().runs.find(r => r.kind === 1 && r.length > 300));
  await piece((sazava.s0 + sazava.s1) / 2, 1100, 70, 20);
  text = await card(); console.log('CARD Sázava', text.slice(0, 700));
  assert.ok(sazava.styles.arch, 'an arch fits the Sázava valley');
  await shot('d3-0302-sazava-bridge-arch-fits');
  await page.click('[data-style="arch"]'); await game.idle();
  await piece((sazava.s0 + sazava.s1) / 2, 1100, 70, 20);
  await shot('d3-0302-sazava-bridge-as-an-arch');
  // 5. D35: the 2 km viaduct says why no arch; the tunnel after the player's cut and cover
  await game.open('scenario=d35'); await park();
  const via = await T(() => window.trapla.result().runs.find(r => r.kind === 1 && r.length > 1500));
  await piece((via.s0 + via.s1) / 2, 2400, 90, 30);
  text = await card(); console.log('CARD D35 viaduct', text.slice(0, 700));
  assert.match(text, /No arch: the bridge is too long for one arch/);
  await shot('d35-viaduct-no-arch-why');
  const tun = await T(() => window.trapla.result().runs.find(r => r.kind === 2));
  if (tun) {
    await piece((tun.s0 + tun.s1) / 2, 1500, 90, 40);
    text = await card(); console.log('CARD D35 tunnel', text.slice(0, 700));
    assert.doesNotMatch(text, /Noise walls/);
    await page.click('[data-method="cut"]'); await game.idle();
    await piece((tun.s0 + tun.s1) / 2, 1500, 90, 40);
    text = await card(); console.log('CARD D35 tunnel cut', text.slice(0, 700));
    assert.match(text, /Auto’s tunnel, built by cut and cover as you chose/);
    await shot('d35-tunnel-cut-and-cover-chosen');
  }
  assert.deepEqual(game.pageErrors, []);
} finally { await game.close(); }
