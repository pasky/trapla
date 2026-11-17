// Oblique views of Auto underpasses on the demo design (a track and a local street).
// CHROME=/usr/bin/chromium node scripts/underpass-shots.mjs [--out dir]
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';
const outIndex = process.argv.indexOf('--out'), out = outIndex > 0 ? process.argv[outIndex + 1] : 'docs/screenshots/underpass';
mkdirSync(out, { recursive: true });
const game = await startGame({ viewport: { width: 1400, height: 900 } });
const { page, pageErrors: errors } = game;
const design = JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design;
const idle = () => game.idle(500);
try {
  await game.open('scenario=d11'); await idle();
  await page.evaluate(d => window.trapla.setDesign(d), design); await idle();
  const boxes = await page.evaluate(() => window.trapla.result().crossings.filter(c => c.type === 'underpass' && !c.issues?.length)
    .map(c => ({ roadId: c.roadId, cls: c.cls, s: c.s, x: c.x, y: c.y, length: c.underpassLength, cost: c.cost })));
  assert(boxes.length > 0, 'demo has an Auto underpass');
  for (const c of boxes) {
    for (const [name, size, bearing, elev] of [['oblique', 260, 35, 32], ['portal', 110, 125, 14]]) {
      await page.evaluate(({ c, size, bearing, elev }) => {
        window.trapla.selectCrossing(c.roadId);
        window.trapla.lookAt(c.x, c.y, size, bearing, elev);
        window.trapla.profileFocus(c.s - 200, c.s + 200);
      }, { c, size, bearing, elev });
      await idle(); await game.park();
      const path = `${out}/underpass-${c.cls}-${c.roadId}-${name}.png`;
      await page.screenshot({ path }); console.log(path, JSON.stringify(c));
    }
  }
  assert.deepEqual(errors, []);
} finally { await game.close(); }
