// Shots of the P2 re-check fixes (PLAN.md "A rebuilt stretch kept on its old road; a side road's stub"): road III/3012's
// corner dragged 22 m but kept on the old road (our bridge over it as without it, the curve's grips on the road), and the
// track's access to III/3012 dragged 23 m (no stub between walls across our cut slope). docs/screenshots/490–491 are
// the before | after pairs of these.
//   flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/render-kept-corner-shots.mjs [--out docs/screenshots] [--first 490]
//   [--root <older checkout> --before]: the same views on an older checkout, without the checks
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const OUT = arg('--out', '/tmp/trapla-render-kept-corner-shots'), before = process.argv.includes('--before'), tag = before ? 'before' : 'after';
let number = Number(arg('--first', 490));
mkdirSync(OUT, { recursive: true });
const game = await startGame({ root: arg('--root', process.cwd()), viewport: { width: 1440, height: 900 } });
const { page } = game;
const T = (f, a) => page.evaluate(f, a);
const check = (ok, what) => { if (!before) assert.ok(ok, what); };
const shot = async (name) => { await game.idle(); await game.still(); const f = `${OUT}/${number++}-${name}-${tag}.png`; await page.screenshot({ path: f }); console.log('SHOT', f); };
const park = async () => { const b = await page.locator('#hud').boundingBox(); await page.mouse.move(b.x + b.width - 4, b.y + b.height - 4); };
const load = async (file, route) => {
  await game.open('scenario=d11'); await park();
  await T(() => window.trapla.whenTransport());
  await T(d => window.trapla.setProject(d), JSON.parse(readFileSync(file, 'utf8'))); await game.idle();
  await T(id => window.trapla.setActiveRoute(id), route); await game.idle(); await park();
};
try {
  // 1. III/3012's old corner dragged 22 m: every metre still on the old road, kept (0 CZK); our bridge over it as without it
  await load('qa3/designs/d11-iii3012-corner-kept-on-old-road.json', 'route:d51df26b-f7b4-484f-911a-1d0c7db01d4c');
  const ours = await T(() => { const l = window.trapla.projectResult()?.routes['route:legacy-mission']?.legacy;
    return l && { total: l.cost.total, bridge: l.runs.filter(u => u.kind === 1 && u.s0 < 3000).map(u => [Math.round(u.s0), Math.round(u.s1)]) }; });
  console.log('ours', JSON.stringify(ours));
  check(ours && Math.abs(ours.total - 8787.0e6) < 0.5e6 && JSON.stringify(ours.bridge).includes('[2185,2424]'), 'our bridge over the kept road as without it');
  await T(() => window.trapla.selectPi(1)); await game.idle(); await park();
  await T(() => window.trapla.lookAt(7660, 5430, 150, 250, 45));
  await shot('d11-iii3012-corner-kept-our-bridge-as-without-it');
  // 2. III/3012 dragged 23 m: the track's access ends at its carriageway, no stub across the cut slope
  await load('qa3/designs/d11-iii3012-dragged-23m.json', 'route:r1');
  await T(() => window.trapla.lookAt(7660, 5432, 30, 300, 30));
  await shot('d11-iii3012-track-access-no-stub');
  assert.deepEqual(game.pageErrors, []);
} finally { await game.close(); }
