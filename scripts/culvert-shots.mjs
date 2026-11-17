// Views of stream culverts (pipes, frames, buried bridges) on saved D11 designs, from several angles.
// node scripts/culvert-shots.mjs [--gpu] [--out dir] [--design demo] [--only km,km]
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const out = arg('--out', '/tmp/culvert-shots'), designName = arg('--design', 'demo');
const only = arg('--only', '')?.split(',').filter(Boolean).map(Number);
mkdirSync(out, { recursive: true });
const game = await startGame({ viewport: { width: 1400, height: 900 } });
const { page, pageErrors: errors } = game;
const design = JSON.parse(readFileSync(`scripts/${designName}-design.json`, 'utf8')).design;
const idle = () => game.idle(500);
try {
  await game.open('scenario=d11'); await idle();
  await page.evaluate(d => window.trapla.setDesign(d), design); await idle();
  const culverts = await page.evaluate(() => window.trapla.result().waterCrossings.filter(c => c.structure === 'pipe' || c.structure === 'box')
    .map(c => ({ s: c.s, x: c.x, y: c.y, opening: c.opening, length: c.length, h: c.h, tx: c.channelTx, ty: c.channelTy,
      ends: window.trapla.culverts().find(p => p.s === c.s)?.ends })));
  assert(culverts.length > 0, 'design has culverts');
  for (const c of culverts) {
    if (only?.length && !only.some(km => Math.abs(km * 1000 - c.s) < 30)) continue;
    // oblique from above, then each end from outside (looking into the opening, a little from the side)
    const views = [['oblique', 240, Math.atan2(c.tx ?? 1, c.ty ?? 0) * 180 / Math.PI + 40, 30, c]];
    for (const [k, e] of (c.ends ?? []).entries()) {
      const into = Math.atan2(-e.ox, -e.oy) * 180 / Math.PI;
      views.push([`end-${'ab'[k]}`, 80, into + 25, 18, e], [`end-${'ab'[k]}-side`, 80, into + 80, 25, e], [`end-${'ab'[k]}-top`, 80, into, 70, e]);
    }
    for (const [name, size, bearing, elev, at] of views) {
      await page.evaluate(({ c, at, size, bearing, elev }) => {
        window.trapla.lookAt(at.x, at.y, size, bearing, elev);
        window.trapla.profileFocus(c.s - 200, c.s + 200);
      }, { c, at, size, bearing, elev });
      await idle(); await game.park();
      const path = `${out}/culvert-${designName}-${(c.s / 1000).toFixed(3)}-${name}.png`;
      await page.screenshot({ path }); console.log(path, JSON.stringify(c));
    }
  }
  assert.deepEqual(errors, []);
} finally { await game.close(); }
