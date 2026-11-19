// Twists as a first-time player meets them: the start screen → Šternberk → the twist screen (defaults on) → the map with
// its twists chip, card, rings; a reference design that meets them → the curveball arrives → meeting it → the reveal.
//
//   node scripts/twists-play.mjs [--docs] [--gpu]     --docs: docs/screenshots/640–659 (look at them)
// Untimed: flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/twists-play.mjs (AGENTS.md).
import { readFileSync } from 'node:fs';
import { startGame, checker, INTRO_KEY } from './lib/browser.mjs';

const docs = process.argv.includes('--docs');
const { ok } = checker();
const game = await startGame({ viewport: { width: 1440, height: 900 } });
const { page } = game;
let n = Number(process.env.SHOT_FROM ?? 640);
const shot = async (name, opts = {}) => { if (docs) await page.screenshot({ path: `docs/screenshots/${n}-${name}.png`, ...opts }); n++; };
try {
  await page.goto(game.base);
  await page.evaluate((key) => { localStorage.clear(); localStorage.setItem(key, '1'); }, INTRO_KEY);
  await page.reload();
  const card = page.locator('.scenario-picker-card', { hasText: 'Šternberk bypass' });
  await card.getByRole('button', { name: 'Start' }).waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.scenario-picker-card')].some(c => /Šternberk/.test(c.textContent) && !c.querySelector('button').disabled), null, { timeout: 60000 });
  await card.getByRole('button', { name: 'Start' }).click();
  // ---- the twist screen ----
  await page.locator('.twist-picker').waitFor({ timeout: 30000 });
  const names = await page.locator('.twist-picker-list b').allTextContents();
  const checked = await page.locator('.twist-picker-list input:checked').count();
  ok(names.length >= 3 && names[0] === 'Earth balance', `the twist screen lists Šternberk's twists (${names.join(', ')})`);
  ok(checked === 3, 'the default three are on: Earth balance, Hands off the castle, Curveballs');
  await shot('twist-screen');
  await page.locator('.twist-start').click();
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
  await game.idle(400);
  const chip = await page.locator('#chip-twists').textContent();
  ok(/Twists \d\/3/.test(chip), `the HUD's chip says how the twists stand (${chip})`);
  await page.locator('#chip-twists').click();
  await page.waitForTimeout(600);
  await shot('twists-card-starter');
  const status = await page.locator('#twists').textContent();
  ok(/Earth balance/.test(status) && /brought in/.test(status), 'the card says the starter brings fill in (Earth balance broken)');
  ok(await page.locator('.twist-label.landmark').count() > 0, 'the landmarks are on the map');
  // ---- a design that meets the twists (as a player who worked at it would have) ----
  const ref = JSON.parse(readFileSync('scripts/twists/i46-sternberk-road/default-twists.json', 'utf8'));
  await page.evaluate((d) => window.trapla.setProject(d), ref.design);
  await game.idle(600);
  const news = page.locator('.news-card');
  ok(await news.count() === 1, 'meeting everything the first time brings the first news from the site');
  ok(/villa/i.test(await news.textContent()), `…the villa (${(await news.textContent()).slice(0, 120)})`);
  await shot('news-villa');
  await news.getByRole('button', { name: 'Show me' }).click();
  await game.still();
  await shot('villa-on-map');
  ok(!(await page.locator('.reveal').count()), 'no reveal before the news is met');
} finally {
  await game.close();
}
