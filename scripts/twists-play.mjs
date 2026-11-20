// Twists as a first-time player meets them on the Šternberk bypass: the start screen → the twist screen (the default
// two on; Hands off says no listed place is near its planned line) → the starter with its twists card → a height pinned by dragging the profile → a
// design that meets the twists and the goal, and the first news from the site (the villa) on top of it → the fix, by
// dragging a bend on the map → the reveal → the next news at its pace → changing twists mid-game → From scratch.
//
// Then D3 Voračice → Nová Hospoda (a game event on a real register's place, the Mastník's banks, then one without), the class I road (no
// twists) and the whole D3's twist screen.
//
//   node scripts/twists-play.mjs [--docs]      --docs: docs/screenshots/640–654 (look at them)
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
// a reference design that meets Earth balance under the goal, as a player who had worked at it would have it
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
  ok(names.join() === 'Earth balance,Hands off the castle,Curveballs,Spare the forest,Few bridges,From scratch,By hand', `the twist screen lists Šternberk's twists as cards (${names.join(', ')})`);
  ok(await page.locator('.tw-card.unavailable[data-t="landmarks"]').count() === 1 && /No listed place near enough/.test(await page.locator('.tw-card[data-t="landmarks"]').textContent()),
    'Hands off is there and says no listed place is near enough');
  ok(await page.locator('.twist-picker-list input:checked').count() === 2, 'the default two are on');
  ok(/Goal: a valid design under 792 M CZK/.test(await page.locator('.twist-picker-goal').textContent()), 'it says the goal');
  await shot('twist-screen');
  await page.locator('.twist-start').click();
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
  await game.idle(400);
  // ---- the starter ----
  ok(/✗ Twists 1\/2/.test(await page.locator('#chip-twists').textContent()), 'the chip by the verdict: 1 of 2 twists met');
  await page.locator('#chip-twists').click();
  await page.waitForTimeout(700);
  ok(/Earth balance.*18 % of the fill brought in/.test(await twistCard()), 'the card: the starter brings in 18 % of its fill');
  await game.park(); await shot('starter-twists');
  n++; // (642: the landmarks' rings in town, until round 4: scripts/heritage-play.mjs shows the listed monuments now)
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
  ok(/Yours took \d+ minutes?\. The real one was in environmental review by 2003\./.test(text), 'and how long yours took against the real one’s years');
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
  // ---- another mission's news: a real register's place, then a game event (D3 Voračice → Nová Hospoda) ----
  // a section of a corridor's card: its chip, then Start
  const pick = async (section) => {
    await page.goto(game.base);
    const chip = page.locator('.scenario-picker-section', { hasText: section }).first();
    await chip.waitFor({ timeout: 120000 }); await chip.click();
    const card = page.locator('.scenario-picker-card', { has: chip });
    await page.waitForFunction((t) => [...document.querySelectorAll('.scenario-picker-card')].some(c => [...c.querySelectorAll('.scenario-picker-section.on')].some(x => x.textContent.includes(t)) && !c.querySelector('.scenario-picker-actions button').disabled), section, { timeout: 120000 });
    await card.locator('.scenario-picker-actions button').first().click();
    await page.locator('.twist-picker').waitFor({ timeout: 30000 });
  };
  await pick('Voračice → Nová Hospoda');
  ok(await page.locator('.twist-picker-list input:checked').count() === 2 && !(await page.locator('.tw-card[data-t="landmarks"] .tw-default').count()),
    'D3 0305: Earth balance and Curveballs on; Hands off offered, off at first (no line found keeps the fort’s setting under the goal)');
  await page.locator('.twist-start').click();
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
  await game.idle(600);
  // (a design that meets the twists on under the goal: the first triumph)
  await page.evaluate((d) => window.trapla.setProject(d), JSON.parse(readFileSync('scripts/twists/d3-0305-motorway/all-news.json', 'utf8')).design);
  await game.idle(1200);
  const news2 = page.locator('.news-card');
  ok(await news2.count() === 1 && /Leave the Mastník open/.test(await news2.textContent()), 'the first triumph there brings its first news: the Mastník’s banks');
  ok(/nature\.cz/.test(await news2.locator('a').getAttribute('href') ?? '') && /A game event of a kind real projects meet/.test(await news2.textContent()),
    'a game event on a real place: it says so and links the register the place comes from');
  await game.park(); await shot('news-real-place');
  await news2.getByRole('button', { name: 'Show me' }).click(); await game.still();
  ok(await page.locator('.twist-label.zone').count() >= 1 && !(await page.locator('.twist-label.zone.broken').count()), 'the place on the map, in amber: this design already bridges its banks');
  await game.park(); await shot('mastnik-place');
  await news2.getByRole('button', { name: 'OK' }).click();
  const KEY2 = 'trapla.twists.v1.d3-0305.d3-0305-motorway';
  await page.evaluate((key) => { const s = JSON.parse(localStorage.getItem(key)); s.playMs += 6 * 60_000; s.editsSince = 9; s.fired = s.fired.filter(id => id === 'd3-0305-mastnik'); localStorage.setItem(key, JSON.stringify(s)); }, KEY2);
  // (a design that meets every news of the mission, so the next may come)
  await page.reload(); await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 }); await game.idle(600);
  await page.evaluate((d) => window.trapla.setProject(d), JSON.parse(readFileSync('scripts/twists/d3-0305-motorway/all-news.json', 'utf8')).design);
  await game.idle(1200);
  ok(await page.locator('.news-card').count() === 1 && /Graves under the field/.test(await page.locator('.news-card').textContent()), 'at its pace: graves under a field (a game event)');
  ok(await page.locator('.news-card .news-source').count() === 1 && !(await page.locator('.news-card a').count()), 'a game event without a real place: its source line is plain text, no link');
  await game.park(); await shot('news-game-event');
  // ---- a mission without twists says so; a whole route offers its own ----
  await pick('Class I road');
  ok(/No twists on this mission yet/.test(await page.locator('.twist-picker').textContent()), 'the class I road: the twist screen says it has none');
  await shot('no-twists');
  await pick('Whole route');
  const whole = await page.locator('.twist-picker-list b').allTextContents();
  ok(whole.includes('Curveballs') && whole.includes('By hand'), `the whole D3 offers its twists (${whole.join(', ')})`);
  await shot('whole-route-twists');
  ok(game.pageErrors.length === 0, `no page errors (${game.pageErrors.join('; ')})`);
} finally {
  await game.close();
}
