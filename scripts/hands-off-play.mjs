// "Hands off the castle" on every mission (twists round 5, research/102 "Round 5"): where the planned line keeps out of
// every monument's own ring, the mission names the listed monuments nearest it with their setting's wider ring. As a
// player meets it: the Start here mission's starter through the chapel of St Roch's 600 m ring (red, the card names it
// with its kind and ring), the ring's tip on hover, the card's row drawing the ring stronger, the reference led round it;
// then each other mission's starter at its named monument. Šternberk's twist screen says why it has none
// (scripts/twist-picker-shots.mjs).
//
//   node scripts/hands-off-play.mjs [--docs]      --docs: docs/screenshots/750–759 (look at them)
// Untimed: flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/hands-off-play.mjs (AGENTS.md).
import { readFileSync } from 'node:fs';
import { startGame, checker } from './lib/browser.mjs';

const docs = process.argv.includes('--docs');
const { ok } = checker();
const game = await startGame({ viewport: { width: 1440, height: 900 } });
const { page } = game;
let n = 750;
const shot = async (name) => { if (docs) await page.screenshot({ path: `docs/screenshots/${n}-${name}.png` }); n++; };
const twistCard = async () => (await page.locator('#twists').textContent()).replace(/\s+/g, ' ');
const reference = (preset, file) => JSON.parse(readFileSync(`scripts/twists/${preset}/${file}.json`, 'utf8')).design;
/** the map at pack point (x, y): what the twists' tip says there */
const hoverAt = async (x, y) => {
  const view = await page.locator('#view').boundingBox();
  const q = await page.evaluate(([x, y]) => window.trapla.groundScreen(x, y), [x, y]);
  await page.mouse.move(view.x + q.sx, view.y + q.sy, { steps: 4 });
  await page.waitForTimeout(300);
  const tip = page.locator('.twist-tip');
  return await tip.isVisible() ? (await tip.textContent()).trim() : '';
};
/** a mission by direct link (its default twists on), the card open */
const open = async (scenario, preset) => {
  await game.open(`scenario=${scenario}&preset=${preset}`);
  await game.idle(600);
  await page.locator('#chip-twists').click(); await page.waitForTimeout(400);
};
/** the named monument's row on the card: Show it */
const showNamed = async (pack, code) => {
  await page.locator('#twists ul.tw-places button', { hasText: 'Show' }).first().click(); await game.still();
  // (from a little higher: the whole ring and the line through it)
  const m = JSON.parse(readFileSync(`public/scenarios/${pack}/heritage.json`, 'utf8')).monuments.find(x => x.code === code);
  await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 3400, 0, 55), [m.x, m.y]); await game.still();
};
// (each mission's named monument: where it stands, pack metres, for the tip; what the card says)
const MISSIONS = [
  ['d3-0303', 'd3-0303-motorway', 'Chapel of Our Lady, Chrášťany', 'chapel', 600, 'd3-0303-chapel', '11034/2-4317'],
  ['i35-rovensko', 'i35-rovensko-road', 'Chapel at Radostná pod Kozákovem', 'chapel', 600, 'i35-rovensko-chapel', '22814/6-2750'],
  ['d11', 'd11-rail-kralovec', 'Church of St John of Nepomuk, Trutnov', 'church', 600, 'kralovec-church', '101745'],
  ['d3-0302', 'd3-0302-motorway', 'St Joseph gold mine adit, Jílové u Prahy', 'technical monument', 600, 'd3-0302-adit', '101806'],
  ['d3-0301', 'd3-0301-motorway', 'Chapel of St Wenceslas, Jílové u Prahy', 'chapel', 600, 'd3-0301-chapel', '10874/2-4319'],
  ['d3-0305', 'd3-0305-motorway', 'Křenovice fort site, Vojkov', 'fort', 600, 'd3-0305-fort', '16850/2-281'],
];
try {
  // ---- Start here: the D35 Opatovec → Staré Město, the chapel of St Roch ----
  await open('d35', 'd35-stage1-motorway');
  let card = await twistCard();
  ok(/Hands off the castle 1 too close/.test(card) && /within 600 m of Chapel of St Roch, Staré Město/.test(card), 'Start here: the planned line passes within 600 m of the chapel of St Roch');
  ok(/Chapel of St Roch, Staré Město · chapel · 600 m ring/.test(card), 'the card names it with its kind and ring');
  await showNamed('d35', '50949/6-6189');
  ok(await page.locator('.twist-marks path.landmark.broken:not(.fill)').count() >= 1 && await page.locator('.twist-label.landmark.broken', { hasText: 'Chapel of St Roch' }).count() === 1,
    'its ring on the map, red, named from afar');
  await game.park(); await shot('d35-st-roch-broken');
  const roch = JSON.parse(readFileSync('public/scenarios/d35/heritage.json', 'utf8')).monuments.find(m => m.code === '50949/6-6189');
  const tip = await hoverAt(roch.x + 250, roch.y + 150);
  ok(tip === 'Chapel of St Roch, Staré Město · chapel · 600 m ring', `the ring's tip on hover ("${tip}")`);
  await shot('d35-st-roch-tip');
  await page.locator('#twists ul.tw-places li').first().hover(); await page.waitForTimeout(200);
  ok(await page.locator('.twist-marks path.landmark.hi:not(.fill)').count() === 1, 'the card’s row under the pointer draws its ring stronger');
  await shot('d35-st-roch-row-hover');
  // the reference: led north of the ring (every news met, under the goal)
  await page.evaluate((d) => window.trapla.setProject(d), reference('d35-stage1-motorway', 'all-news'));
  await game.idle(1200);
  for (let k = 0; k < 3; k++) {
    if (await page.locator('.reveal').count()) await page.locator('.reveal').getByRole('button', { name: 'Keep improving' }).click({ force: true });
    else if (await page.locator('.news-card').count()) await page.locator('.news-card').getByRole('button', { name: 'OK' }).click({ force: true });
    await page.waitForTimeout(300);
  }
  await page.locator('#chip-twists').click(); await page.waitForTimeout(400);
  card = await twistCard();
  ok(/Hands off the castle \d+ kept clear/.test(card), 'a line kept 600 m off the chapel meets the twist');
  await showNamed('d35', '50949/6-6189');
  ok(await page.locator('.twist-marks path.landmark.ok:not(.fill)').count() >= 1 && !(await page.locator('.twist-marks path.landmark.broken:not(.fill)').count()), 'the ring in the twist’s colour, none red');
  await game.park(); await shot('d35-st-roch-kept-clear');
  // ---- the other missions: each starter at the monument it names ----
  for (const [scenario, preset, name, kind, ring, file, code] of MISSIONS) {
    await open(scenario, preset);
    card = await twistCard();
    ok(new RegExp(`within ${ring} m of ${name}`).test(card) && card.includes(`${name} · ${kind} · ${ring} m ring`), `${preset}: the planned line passes within ${ring} m of ${name}`);
    await showNamed(scenario, code);
    await game.park(); await shot(file);
  }
  ok(game.pageErrors.length === 0, `no page errors (${game.pageErrors.join('; ')})`);
} finally {
  await game.close();
}
