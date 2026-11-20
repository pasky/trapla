// "Hands off the castle" on the register's data (research/97) and the new Start here, as a player meets them:
// the start screen's Start here (the D35 first section) → the I/35 Jičín twist screen (its full set) → the starter
// through the Studeňany village protection zone (red, the card says so; its name on hover) → a design led round it (the
// zone in the twist's colour) → the I/35 Turnov church ring the planned line passes → the D11's memorial ring.
//
//   node scripts/heritage-play.mjs [--docs]      --docs: docs/screenshots/720–… (look at them)
// Untimed: flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/heritage-play.mjs (AGENTS.md).
import { readFileSync } from 'node:fs';
import { startGame, checker, INTRO_KEY } from './lib/browser.mjs';

const docs = process.argv.includes('--docs');
const { ok } = checker();
const game = await startGame({ viewport: { width: 1440, height: 900 } });
const { page } = game;
let n = 720;
const shot = async (name) => { if (docs) await page.screenshot({ path: `docs/screenshots/${n}-${name}.png` }); n++; };
const twistCard = async () => (await page.locator('#twists').textContent()).replace(/\s+/g, ' ');
const reference = (preset, file) => JSON.parse(readFileSync(`scripts/twists/${preset}/${file}.json`, 'utf8')).design;
/** hover the map at pack point (x, y): what tip shows */
const hoverAt = async (x, y) => {
  const view = await page.locator('#view').boundingBox();
  const q = await page.evaluate(([x, y]) => window.trapla.groundScreen(x, y), [x, y]);
  await page.mouse.move(view.x + q.sx, view.y + q.sy, { steps: 4 });
  await page.waitForTimeout(300);
  const tip = page.locator('.twist-tip');
  return await tip.isVisible() ? (await tip.textContent()).trim() : '';
};
try {
  // ---- the start screen: Start here is the D35 first section ----
  await page.goto(game.base);
  await page.evaluate((key) => { localStorage.clear(); localStorage.setItem(key, '1'); }, INTRO_KEY);
  await page.reload();
  await page.waitForSelector('[data-start-here]', { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('[data-start-here] button')?.disabled === false, null, { timeout: 120000 });
  const first = page.locator('[data-start-here]');
  ok(/Opatovec → Staré Město/.test(await first.textContent()), `Start here: Opatovec → Staré Město ("${(await first.locator('h3').textContent()).trim()}")`);
  ok(/Motorway · 17 km/.test(await first.textContent()), 'a 17 km motorway');
  await shot('start-here-d35');
  // ---- the I/35 Jičín stage: its twist screen ----
  const chip = page.locator('.scenario-picker-section', { hasText: 'Čímyšl → Úlibice' }).first();
  await chip.click();
  const card = page.locator('.scenario-picker-card', { has: chip });
  await page.waitForFunction(() => [...document.querySelectorAll('.scenario-picker-card')].some(c => /Čímyšl/.test(c.querySelector('.scenario-picker-section.on')?.textContent ?? '') && !c.querySelector('.scenario-picker-actions button').disabled), null, { timeout: 120000 });
  await card.locator('.scenario-picker-actions button').first().click();
  await page.locator('.twist-picker').waitFor({ timeout: 30000 });
  const names = await page.locator('.twist-picker-list b').allTextContents();
  ok(names.join() === 'Earth balance,Hands off the castle,Curveballs,Nobody moves,Spare the forest,Few bridges,From scratch,By hand', `the Jičín stage offers its full set (${names.join(', ')})`);
  ok(/listed monuments near the line and their protection zones/.test(await page.locator('.twist-picker').textContent()), 'Hands off says what it keeps clear of: listed monuments and their zones');
  await shot('i35-jicin-twist-screen');
  await page.locator('.twist-start').click();
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
  await game.idle(600);
  // ---- the starter: through the Studeňany village protection zone ----
  await page.locator('#chip-twists').click(); await page.waitForTimeout(500);
  ok(/Hands off the castle 1 too close/.test(await twistCard()) && /in the Studeňany village protection zone/.test(await twistCard()),
    'the card: the planned line cuts through the Studeňany village protection zone');
  await page.locator('#twists li[data-id="landmarks"] button', { hasText: 'Show' }).first().click();
  await game.still();
  ok(await page.locator('.twist-marks path.heritage.broken').count() === 1, 'the zone on the map, red: our road in it');
  await game.park(); await shot('i35-jicin-zone-broken');
  // (a point inside the zone, south-west of where the line crosses it: pack metres)
  const tip = await hoverAt(10300, 3000);
  ok(tip === 'Studeňany village protection zone', `the zone's name on hover ("${tip}")`);
  await shot('i35-jicin-zone-hover');
  // ---- …a design led round it ----
  await page.evaluate((d) => window.trapla.setProject(d), reference('i35-jicin-road', 'all-news'));
  await game.idle(1200);
  // (meeting everything brings the first news, then the reveal: read and closed)
  for (let k = 0; k < 3; k++) {
    if (await page.locator('.reveal').count()) await page.locator('.reveal').getByRole('button', { name: 'Keep improving' }).click({ force: true });
    else if (await page.locator('.news-card').count()) await page.locator('.news-card').getByRole('button', { name: 'OK' }).click({ force: true });
    await page.waitForTimeout(300);
  }
  await page.locator('#chip-twists').click(); await page.waitForTimeout(400);
  ok(/Hands off the castle \d+ kept clear/.test(await twistCard()), 'a line led north and east round the zone keeps clear of it');
  ok(await page.locator('.twist-marks path.heritage.ok').count() >= 1 && !(await page.locator('.twist-marks path.heritage.broken').count()), 'the zone in the twist’s colour, none red');
  await page.evaluate(() => window.trapla.lookAt(11000, 2600, 2600, 0, 50)); await game.still();
  await game.park(); await shot('i35-jicin-zone-kept-clear');
  // ---- I/35 Turnov: the church of St John the Baptist ----
  await game.open('scenario=i35-turnov&preset=i35-turnov-road');
  await game.idle(600);
  await page.locator('#chip-twists').click(); await page.waitForTimeout(400);
  const turnov = await twistCard();
  ok(/within 200 m of Kostel sv\. Jana Křtitele, Turnov/.test(turnov), 'Turnov: the planned line passes within 200 m of the church of St John the Baptist');
  await page.evaluate(() => window.trapla.lookAt(2869, 3314, 1500, 0, 55)); await game.still();
  ok(await page.locator('.twist-label.landmark.broken').count() >= 1, 'the church’s ring on the map, red, named');
  await game.park(); await shot('i35-turnov-church-ring');
  // ---- D11: the memorial to the Austrian gunners of 1866 ----
  await game.open('scenario=d11&preset=d11-motorway');
  await game.idle(600);
  await page.locator('#chip-twists').click(); await page.waitForTimeout(400);
  ok(/Pomník rakouských dělostřelců z války 1866/.test(await twistCard()), 'D11: the planned line passes the memorial to the Austrian gunners of 1866');
  await page.locator('#twists li[data-id="landmarks"] button', { hasText: 'Show' }).first().click();
  await game.still(); await game.park(); await shot('d11-memorial-ring');
  ok(game.pageErrors.length === 0, `no page errors (${game.pageErrors.join('; ')})`);
} finally {
  await game.close();
}
