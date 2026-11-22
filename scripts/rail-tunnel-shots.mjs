// A railway tunnel under our road (research/107): the D3 starter crosses the Jílovský tunel II (OSM 30231638, 130 m) at
// about km 4.43 on its viaduct, the rails 35 m under the ground there. It used to be a railway crossing at the ground (a
// card, our bridge over it); now no railway crossing is there. Two views of the site, from above and along the tunnel.
// node scripts/rail-tunnel-shots.mjs   (writes docs/screenshots/790…791)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const out = process.env.OUT ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const game = await startGame({ viewport: { width: 1400, height: 900 } });
const { page, pageErrors: errors } = game;
const T = (f, a) => page.evaluate(f, a);
try {
  await game.open('scenario=d3'); await game.idle(1000);
  const site = await T(() => {
    const r = window.trapla.result(), i = r.s.findIndex(s => s >= 4430);
    return { x: r.x[i], y: r.y[i], rail: (r.railCrossings ?? []).map(c => Math.round(c.s)), kind: r.kind[i] };
  });
  console.log(JSON.stringify(site));
  await T(([p]) => { window.trapla.setView({ photo: false, contours: false }); window.trapla.lookAt(p.x, p.y, 700, 20, 50); }, [site]);
  await game.idle(); await game.still();
  await page.screenshot({ path: `${out}/790-rail-tunnel-under-viaduct.png` });
  await T(([p]) => window.trapla.lookAt(p.x, p.y, 450, 110, 18), [site]);
  await game.idle(); await game.still();
  await page.screenshot({ path: `${out}/791-rail-tunnel-under-viaduct-low.png` });
  assert(!site.rail.some(s => Math.abs(s - 4430) < 200), 'no railway crossing over the tunnel');
  assert.deepEqual(errors, []);
} finally { await game.close(); }
