// Comparable owner-view valley screenshot, no profile edits.
// node scripts/valley.mjs before|after [design.json]
import { readFileSync, mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';
const game = await startGame();
try {
  const { page } = game;
  await game.open('scenario=d11');
  const design = JSON.parse(readFileSync(process.argv[3] ?? 'scripts/best-design.json', 'utf8')).design;
  await page.evaluate(async (d) => { window.trapla.setDesign(d); await window.trapla.whenIdle(); }, design);
  const view = await page.evaluate((chainage) => {
    const t = window.trapla, r = t.result(), i = Math.round(chainage / r.ds);
    const camera = [r.x[i], r.y[i], 2200, 235, 30];
    t.setView({ contours: true, slope: false, exag: 1, photo: false });
    t.lookAt(...camera); t.profileFocus(chainage - 1000, chainage + 1000);
    return { camera, total: r.cost.total, maxFill: Math.max(...Array.from(r.grade, (z, k) => r.kind[k] === 0 ? z - r.ground[k] : 0)), bridges: r.quantities.bridgeLength, valid: r.valid };
  }, Number(process.env.CHAINAGE ?? 15000));
  await page.waitForTimeout(4000);
  await page.waitForFunction(() => !window.trapla.viewBusy(), null, { timeout: 120000 });
  mkdirSync('docs/screenshots', { recursive: true });
  const path = `docs/screenshots/valley-${process.argv[2] ?? 'current'}.png`;
  await page.screenshot({ path }); console.log(path, JSON.stringify(view));
} finally { await game.close(); }
