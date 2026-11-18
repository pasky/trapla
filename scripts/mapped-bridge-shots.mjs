// A mapped bridge of a road crossed by ours (the owner's D11 case: the local road's 60 m bridge over the planned D11 at
// about km 6.3 of a design along the official line, which the crossing network used to leave out). With Auto's grade our
// road passes only 3.5 m under its deck: the bridge is rebuilt higher on ramps and billed; with the grade lowered 8 m by
// hand it passes under it: "Existing bridge kept", nothing billed, drawn at its own level. A click on the bridge selects
// its crossing. Nová Paka's starter along the real bypass: one of its three bridges kept.
// node scripts/mapped-bridge-shots.mjs   (writes docs/screenshots/540…545)
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const out = process.env.OUT ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });
const game = await startGame({ viewport: { width: 1400, height: 900 } });
const { page, pageErrors: errors } = game;
const T = (f, a) => page.evaluate(f, a);
const idle = (ms = 600) => game.idle(ms);
const design = (file) => JSON.parse(readFileSync(`tests/fixtures/${file}`, 'utf8')).design;
const card = () => T(() => document.querySelector('.inspector')?.innerText ?? '');
const mappedCrossing = () => T(() => { const c = window.trapla.result().crossings.find(c => c.mapped === 'bridge' && Math.abs(c.s - 6300) < 200);
  return c && { roadId: c.roadId, x: c.x, y: c.y, s: c.s, type: c.type, kept: !!c.kept, cost: c.cost, h: c.h, span: c.span, deck: c.geometry?.deck, road: c.geometry?.road?.length }; });
try {
  await game.open('scenario=d11'); await idle();
  // Auto's grade along the official line: the bridge is rebuilt
  await T((d) => window.trapla.setDesign(d), design('d11-official-line-design.json')); await idle(1000);
  const auto = await mappedCrossing();
  console.log('auto', JSON.stringify(auto));
  assert(auto && auto.type === 'overbridge' && !auto.kept && auto.cost > 0);
  await T(([c]) => { window.trapla.setView({ photo: false, contours: false }); window.trapla.selectCrossing(c.roadId); window.trapla.lookAt(c.x, c.y, 260, 30, 35); }, [auto]);
  await idle(); await game.still();
  const autoCard = await card();
  console.log(autoCard);
  assert.match(autoCard, /old bridge here is too low/);
  await page.screenshot({ path: `${out}/540-mapped-bridge-rebuilt.png` });
  // the grade by hand, lowered 8 m at the bridge: it passes under it, the bridge is kept
  await T((d) => window.trapla.setDesign(d), design('d11-official-line-lowered-design.json')); await idle(1000);
  const kept = await mappedCrossing();
  console.log('kept', JSON.stringify(kept));
  assert(kept && kept.type === 'overbridge' && kept.kept && kept.cost === 0 && kept.deck);
  await T(([c]) => { window.trapla.selectCrossing(c.roadId); window.trapla.lookAt(c.x, c.y, 260, 30, 35); }, [kept]);
  await idle(); await game.still();
  const keptCard = await card();
  console.log(keptCard);
  assert.match(keptCard, /Existing bridge kept/);
  await page.screenshot({ path: `${out}/541-mapped-bridge-kept.png` });
  await T(([c]) => window.trapla.lookAt(c.x, c.y, 120, 120, 12), [kept]); await idle(); await game.still();
  await page.screenshot({ path: `${out}/542-mapped-bridge-kept-low.png` });
  // a click on the bridge (away from the crossing's own marker) selects its crossing, not the mapped road's card
  await T(() => window.trapla.select?.(null)); await idle();
  const box = await page.locator('#view').boundingBox();
  const onDeck = await T(([c]) => { const c2 = window.trapla.result().crossings.find(x => x.roadId === c.roadId); const g = c2.geometry; const q = g.road[Math.max(g.deck.start, Math.min(g.deck.end, g.deck.start + 2))];
    return window.trapla.groundScreen(q.x, q.y); }, [kept]);
  await page.mouse.click(box.x + onDeck.sx, box.y + onDeck.sy); await idle();
  const clicked = await card();
  console.log('clicked:', clicked.split('\n')[0]);
  assert.match(clicked, /Existing bridge kept/);
  await page.screenshot({ path: `${out}/543-mapped-bridge-click.png` });
  // Nová Paka's starter along the real bypass: under one of its bridges with room, the other two rebuilt higher
  await game.open('scenario=i16-nova-paka'); await idle(1000);
  const np = await T(() => window.trapla.result().crossings.filter(c => c.mapped).map(c => ({ roadId: c.roadId, x: c.x, y: c.y, s: c.s, type: c.type, kept: !!c.kept, cost: c.cost })));
  console.log('nova paka', JSON.stringify(np));
  const npKept = np.find(c => c.kept), npNew = np.find(c => !c.kept);
  assert(npKept && npNew);
  await T(([c]) => { window.trapla.setView({ photo: true }); window.trapla.selectCrossing(c.roadId); window.trapla.lookAt(c.x, c.y, 260, 0, 40); }, [npKept]);
  await idle(); await game.still();
  console.log(await card());
  await page.screenshot({ path: `${out}/544-nova-paka-bridge-kept.png` });
  await T(([c]) => { window.trapla.selectCrossing(c.roadId); window.trapla.lookAt(c.x, c.y, 260, 0, 40); }, [npNew]);
  await idle(); await game.still();
  console.log(await card());
  await page.screenshot({ path: `${out}/545-nova-paka-bridge-rebuilt.png` });
  assert.deepEqual(errors, []);
} finally { await game.close(); }
