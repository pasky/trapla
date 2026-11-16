// Reproducible oblique crossing views; --before saves outside the tracked documentation.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';
const game = await startGame();
const { page, pageErrors: errors } = game;
const out = process.argv.includes('--before') ? '/tmp/trapla-crossings-before' : 'docs/screenshots';
mkdirSync(out, { recursive: true });
const design = JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design;
const idle = () => game.idle(500);
try {
  await game.open('scenario=d11'); await idle();
  for (const [k, type] of ['overbridge', 'bridge', 'reconnection', 'diversion', 'junction'].entries()) {
    await page.evaluate(d => window.trapla.setDesign(d), design); await idle();
    // Keep the original short track example reproducible after Auto learns cheaper alternatives.
    // Exercise the real crossing choice tool rather than fabricating render-only geometry.
    if (type === 'diversion') {
      await page.evaluate(() => window.trapla.selectCrossing(2704));
      await page.click('#crossing-choice [data-crossing="reconnection"]'); await idle();
    }
    const selected = await page.evaluate(type => {
      const r = window.trapla.result();
      const candidates = r.crossings.filter(c => c.type === type && !c.issues?.length);
      const c = (type === 'diversion' ? candidates.find(c => c.roadId === 2704) : undefined)
        ?? candidates.find(c => c.cls !== 'track' && (type !== 'overbridge' || c.approachLength > 5)) ?? candidates[0];
      if (!c) return null;
      window.trapla.selectCrossing(c.roadId);
      const size = type === 'reconnection' || type === 'diversion' ? Math.max(450, Math.min(2200, c.linkLength * .8)) : Math.max(400, Math.min(1000, (c.span ?? 50) * 3 + (c.approachLength ?? 0)));
      let x = c.x, y = c.y;
      if (c.geometry?.links) { const path = c.geometry.links[0]; x = (path[0].x + path.at(-1).x) / 2; y = (path[0].y + path.at(-1).y) / 2; }
      window.trapla.lookAt(x, y, size, 30, 58);
      window.trapla.profileFocus(c.s - 200, c.s + 200);
      window.trapla.setView({ contours: true });
      return { type, roadId: c.roadId, cls: c.cls, s: c.s, span: c.span, approaches: c.approachLength, links: c.linkLength };
    }, type);
    assert(selected, `demo has ${type}`); await idle();
    await page.mouse.move(5, 5);
    const path = `${out}/${42 + k}-crossing-${type}.png`;
    await page.screenshot({ path }); console.log(path, JSON.stringify(selected));
    if (type === 'junction') {
      await page.evaluate(id => { const c = window.trapla.result().crossings.find(c => c.roadId === id); window.trapla.lookAt(c.x, c.y, 180, 70, 40); }, selected.roadId);
      await idle(); await page.screenshot({ path: `${out}/48-crossing-junction-detail.png` });
    }
    if (type === 'overbridge') {
      await page.evaluate(id => { const c = window.trapla.result().crossings.find(c => c.roadId === id); window.trapla.lookAt(c.x, c.y, 180, 115, 24); }, selected.roadId);
      await idle(); await page.screenshot({ path: `${out}/47-crossing-overbridge-detail.png` });
    }
  }
  assert.deepEqual(errors, []);
} finally { await game.close(); }
