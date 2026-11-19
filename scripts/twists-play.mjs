// Twists as a first-time player meets them on the Šternberk bypass: the start screen → the twist screen (the default
// three on) → the starter with its twists card and the landmarks' rings → a height pinned by dragging the profile → a
// design that meets the twists and the goal, and the first news from the site (the villa) on top of it → the fix, by
// dragging a bend on the map → the reveal → the next news at its pace → changing twists mid-game → From scratch.
//
//   node scripts/twists-play.mjs [--docs]      --docs: docs/screenshots/640–653 (look at them)
// Untimed: flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/twists-play.mjs (AGENTS.md).
import { readFileSync } from 'node:fs';
import { startGame, checker, INTRO_KEY } from './lib/browser.mjs';

const docs = process.argv.includes('--docs');
const { ok } = checker();
const game = await startGame({ viewport: { width: 1440, height: 900 } });
const { page } = game;
let n = 640;
const shot = async (name) => { if (docs) await page.screenshot({ path: `docs/screenshots/${n}-${name}.png` }); n++; };
const twistCard = () => page.locator('#twists').textContent();
const KEY = 'trapla.twists.v1.i46-sternberk.i46-sternberk-road';
// a reference design that meets Earth balance and Hands off under the goal, as a player who had worked at it would have it
// (its bridge ends in what becomes the villa's garden)
const before = JSON.parse(readFileSync('scripts/twists/i46-sternberk-road/earth-landmarks.json', 'utf8')).design;
try {
  await page.goto(game.base);
  await page.evaluate((key) => { localStorage.clear(); localStorage.setItem(key, '1'); }, INTRO_KEY);
  await page.reload();
  const card = page.locator('.scenario-picker-card', { hasText: 'Šternberk bypass' });
  await page.waitForFunction(() => [...document.querySelectorAll('.scenario-picker-card')].some(c => /Šternberk/.test(c.textContent) && !c.querySelector('button').disabled), null, { timeout: 60000 });
  await card.getByRole('button', { name: 'Start' }).click();
  // ---- the twist screen ----
  await page.locator('.twist-picker').waitFor({ timeout: 30000 });
  const names = await page.locator('.twist-picker-list b').allTextContents();
  ok(names.join() === 'Earth balance,Hands off the castle,Curveballs,From scratch,By hand', `the twist screen lists Šternberk's twists (${names.join(', ')})`);
  ok(await page.locator('.twist-picker-list input:checked').count() === 3, 'the default three are on');
  ok(/Goal: a valid design under 792 M CZK/.test(await page.locator('.twist-picker-goal').textContent()), 'it says the goal');
  await shot('twist-screen');
  await page.locator('.twist-start').click();
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
  await game.idle(400);
  // ---- the starter ----
  ok(/✗ Twists 2\/3/.test(await page.locator('#chip-twists').textContent()), 'the chip by the verdict: 2 of 3 twists met');
  await page.locator('#chip-twists').click();
  await page.waitForTimeout(700);
  ok(/Earth balance.*18 % of the fill brought in/.test(await twistCard()), 'the card: the starter brings in 18 % of its fill');
  await game.park(); await shot('starter-twists');
  await page.evaluate(() => window.trapla.lookAt(3400, 6000, 1400, 0, 55)); await game.still();
  ok(await page.locator('.twist-label.landmark').count() >= 5, 'the landmarks in town carry their names close up');
  await game.park(); await shot('landmark-rings');
  await page.evaluate(() => window.trapla.resetCamera()); await game.still();
  // ---- a height pinned by hand: drag the road line in the profile down a little at the embankment by km 3.2 ----
  const share = async () => Number((await twistCard()).match(/(\d+) % of the fill brought in/)?.[1] ?? 0);
  const was = await share();
  const at = await page.evaluate(() => { const r = window.trapla.result(); const i = Math.round(3200 / r.ds); return window.trapla.profilePoint(r.s[i], r.grade[i]); });
  await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.mouse.move(at.x, at.y + 14, { steps: 8 }); await page.mouse.up();
  await game.idle(500);
  if (process.env.DEBUG) console.log('after the drag', JSON.stringify(await page.evaluate(() => window.trapla.getDesign().gradePins)), (await twistCard()).replace(/\s+/g, ' '));
  const now = await share();
  ok(now < was, `one embankment lowered by a drag brings in less fill (${was} % → ${now} %)`);
  await game.park(); await shot('pin-lower');
  // ---- …some work later: a design that meets the twists and the goal; the first news comes on top of it ----
  await page.evaluate((d) => window.trapla.setProject(d), before);
  await game.idle(800);
  const news = page.locator('.news-card');
  ok(await news.count() === 1 && /The villa is now a listed monument/.test(await news.textContent()), 'meeting everything the first time brings news: the villa');
  ok(!(await page.locator('.reveal').count()), 'no reveal while the news is not met');
  await game.park(); await shot('news-villa');
  await news.getByRole('button', { name: 'Show me' }).click(); await game.still();
  ok(await page.locator('.twist-label.zone.broken').count() === 1, 'the villa’s garden on the map, red: our works in it');
  ok(/No pier or earthworks in the villa’s garden/.test(await twistCard()), 'the card says what breaks it');
  await game.park(); await shot('villa-broken');
  await news.getByRole('button', { name: 'OK' }).click();
  // ---- the fix the card offers: our bridge over the garden on long spans, its piers outside ----
  await page.locator('#chip-twists').click(); await page.waitForTimeout(400);
  await page.locator('#twists').getByRole('button', { name: 'Long spans over it' }).first().click();
  if (process.env.DEBUG) { await game.idle(900); console.log(JSON.stringify(await page.evaluate(() => window.trapla.getDesign().structureOverrides)), (await twistCard()).replace(/\s+/g, ' ')); }
  await game.idle(900);
  ok(/Curveballs 1 of 1 news met/.test((await twistCard()).replace(/\s+/g, ' ')), 'the garden kept clear: the news met');
  const reveal = page.locator('.reveal');
  ok(await reveal.count() === 1, 'valid, every twist met and under the goal: the reveal');
  const text = await reveal.textContent();
  ok(/You beat the planned line/.test(text) && /2\.04 bn CZK/.test(text) && /880 M CZK/.test(text), 'it shows ours, the planned line priced the same way and the real 2.04 bn');
  await shot('reveal');
  await reveal.getByRole('button', { name: 'Keep improving' }).click();
  // ---- the next news at its pace: 5 minutes of play and 8 edits later ----
  await page.evaluate((key) => { const s = JSON.parse(localStorage.getItem(key)); s.playMs += 6 * 60_000; s.editsSince = 9; localStorage.setItem(key, JSON.stringify(s)); }, KEY);
  await page.reload(); await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 }); await game.idle(800);
  ok(await page.locator('.news-card').count() === 1 && /butterflies/.test(await page.locator('.news-card').textContent()), 'later, at its pace: the butterflies');
  await game.park(); await shot('news-butterflies');
  await page.locator('.news-card').getByRole('button', { name: 'OK' }).click();
  await page.locator('#chip-twists').click(); await page.waitForTimeout(500);
  ok(await page.getByRole('button', { name: 'The real project' }).count() === 1, 'the reveal can be opened again from the twists card');
  // ---- twists changed mid-game: By hand on ----
  await page.getByRole('button', { name: 'Change twists' }).click();
  await page.locator('#twists input[data-t="byHand"]').check();
  await game.idle(800);
  ok(await page.evaluate(() => window.trapla.getDesign().profileMode) === 'manual', 'By hand on: our road’s heights go to height pins');
  ok(await page.locator('#grade-auto').isDisabled(), 'and Auto heights are off while it is on');
  await game.park(); await shot('by-hand');
  await page.locator('#twists input[data-t="byHand"]').uncheck();
  await page.getByRole('button', { name: 'Done' }).click();
  // ---- From scratch: the straight line ----
  await page.getByRole('button', { name: 'Change twists' }).click();
  await page.locator('#twists input[data-t="scratch"]').check();
  await page.locator('#toast').getByRole('button', { name: 'Start from it' }).click();
  await game.idle(800);
  ok(await page.evaluate(() => window.trapla.getDesign().pis.length) === 0, 'From scratch: the design starts again on the straight line');
  await page.getByRole('button', { name: 'Done' }).click();
  await game.park(); await shot('from-scratch');
  ok(game.pageErrors.length === 0, `no page errors (${game.pageErrors.join('; ')})`);
} finally {
  await game.close();
}
