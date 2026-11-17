// Shots of the sweep-3 fixes (research/66, /69): a slowed bend's card (its stretch, the faster curve Auto keeps), the
// railway bend card (no speed above the line's), a D11 valley bridge as an arch, the D35 viaduct saying why
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
  const at70 = await T(() => window.trapla.result().cost.total);
  await shot('d11-one-bend-70-keeps-90-geometry');
  // (no dearer than the same road at 90 km/h)
  await setDesign({ ...one, pis: one.pis.map(p => ({ ...p, speed: 90 })) });
  assert.ok(at70 <= await T(() => window.trapla.result().cost.total) + 2e6);
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
  // 4. D11 direct-80 km 8.41–8.88 (the deepest valley on D11, ≈ 50 m): an arch among its styles, then chosen
  await game.open('scenario=d11'); await park();
  await setDesign(JSON.parse(readFileSync('scripts/direct-80-design.json', 'utf8')).design);
  const valley = await T(() => window.trapla.result().runs.find(r => r.kind === 1 && r.s0 > 8300 && r.s1 < 9000));
  assert.ok(valley?.styles?.arch, 'an arch fits the valley');
  await piece((valley.s0 + valley.s1) / 2, 650, 160, 8);
  text = await card(); console.log('CARD valley', text.slice(0, 700));
  await shot('d11-direct-80-valley-arch-fits');
  await page.click('[data-style="arch"]'); await game.idle();
  await piece((valley.s0 + valley.s1) / 2, 650, 160, 8);
  await shot('d11-direct-80-valley-as-an-arch');
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
  // 6. P1 #3 / #4 (research/67, /68): D3 0302 without the deep cut and the high fills; the Sázava bridge's end on its
  //    cone (clicking the cone selects the bridge); a deep-cut tunnel on D11 with the open cut's price
  await game.open('scenario=d3-0302&preset=d3-0302-motorway'); await park();
  const cones = await T(() => window.trapla.result().cones);
  assert.ok(cones.length >= 2, 'the bridge ends stand on cones');
  const deepest = await T(() => { const r = window.trapla.result(); let m = 0; for (let i = 0; i < r.n; i++) m = Math.max(m, r.ground[i] - r.grade[i]); return m; });
  assert.ok(deepest <= 30.5, `no cut deeper than 30 m (${deepest})`);
  const end = cones[cones.length - 1];
  await T(([c]) => window.trapla.lookAt(c.x + c.tx * c.reach * 0.4, c.y + c.ty * c.reach * 0.4, 140, 240, 12), [end]); await game.idle(); await game.still();
  const p = await T(([c]) => window.trapla.groundScreen(c.x + c.tx * c.reach * 0.5, c.y + c.ty * c.reach * 0.5), [end]);
  const box = await page.locator('canvas').first().boundingBox();
  await page.mouse.click(box.x + p.sx, box.y + p.sy); await game.idle();
  text = await card(); console.log('CARD cone click', text.slice(0, 700));
  assert.match(text, /Its ends stand on fills|One end stands on a fill/);
  await T(([c]) => window.trapla.lookAt(c.x + c.tx * c.reach * 0.4, c.y + c.ty * c.reach * 0.4, 140, 240, 12), [end]);
  await shot('d3-0302-sazava-bridge-end-on-its-cone');
  const sazava2 = await T(() => window.trapla.result().runs.find(r => r.kind === 1 && r.length > 1000));
  await piece((sazava2.s0 + sazava2.s1) / 2, 2600, 70, 22);
  text = await card(); console.log('CARD Sázava', text.slice(0, 700));
  assert.match(text, /No arch: the bridge is too long for one arch/);
  await shot('d3-0302-no-deep-cut-one-long-bridge');
  await game.open('scenario=d11'); await park();
  await setDesign(JSON.parse(readFileSync('qa3/designs/d11-deep-cut-tunnel.json', 'utf8')).design);
  const deep = await T(() => window.trapla.result().runs.find(r => r.kind === 2 && r.deepCut));
  assert.ok(deep, 'Auto tunnels the deep cut');
  await piece((deep.s0 + deep.s1) / 2, 1200, 120, 35);
  text = await card(); console.log('CARD deep cut', text.slice(0, 700));
  assert.match(text, /designers tunnel where a cut would be deeper than 30 m/);
  await shot('d11-deep-cut-tunnel-open-cut-price');
  // 7. A bridge end whose cone would cover the road under it: a wall down to the ground (D11 best, km 6.99)
  const best = JSON.parse(readFileSync('tests/fixtures/evaluate-remedies-current.json', 'utf8')).fixtures.find(f => f.name === 'best').design;
  await setDesign(best);
  const walled = await T(() => window.trapla.result().runs.find(r => r.kind === 1 && r.closedEnds?.[0] && r.s0 > 6900 && r.s0 < 7100));
  assert.ok(walled, 'the bridge at km 6.99 starts at a wall');
  await piece(walled.s0 + 30, 260, 200, 18);
  text = await card(); console.log('CARD closed end', text.slice(0, 700));
  assert.match(text, /One end is a wall \d+ m high down to the ground, so the fill does not cover what lies below: /);
  await T(([s]) => { const r = window.trapla.result(), i = Math.round(s / r.ds); window.trapla.lookAt(r.x[i], r.y[i], 110, 270, 14); }, [walled.s0]);
  await shot('d11-bridge-end-wall-beside-the-road-below');
  assert.deepEqual(game.pageErrors, []);
} finally { await game.close(); }
