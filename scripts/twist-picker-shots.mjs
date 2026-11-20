// The twist screen as picture cards (src/ui/twist-picker.ts), at 1280 × 800 as a player meets it: Start here's eight
// twists (the default three marked and on), the long line and the small map on hover, the keyboard (Tab, Space), a twist
// a mission cannot ask for (Šternberk's Hands off says why), the I/35 Jičín's eight, and the game's card after Start.
//
//   node scripts/twist-picker-shots.mjs [--docs]      --docs: docs/screenshots/760–765 (look at them)
// Untimed: flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/twist-picker-shots.mjs (AGENTS.md).
import { startGame, checker, INTRO_KEY } from './lib/browser.mjs';

const docs = process.argv.includes('--docs');
const { ok } = checker();
const game = await startGame({ viewport: { width: 1280, height: 800 } });
const { page } = game;
let n = 760;
const shot = async (name) => { if (docs) await page.screenshot({ path: `docs/screenshots/${n}-${name}.png` }); n++; };
const home = async () => {
  await page.goto(game.base);
  await page.evaluate((key) => { localStorage.clear(); localStorage.setItem(key, '1'); }, INTRO_KEY);
  await page.reload();
};
/** a mission's twist screen from the start screen: a card's Start, or a section of a corridor's card */
const pick = async (card, section) => {
  const c = page.locator('.scenario-picker-card', { hasText: card });
  if (section) await c.locator('.scenario-picker-section', { hasText: section }).click();
  await page.waitForFunction((t) => [...document.querySelectorAll('.scenario-picker-card')].some(e => e.textContent.includes(t) && !e.querySelector('.scenario-picker-actions button').disabled), card, { timeout: 120000 });
  await c.locator('.scenario-picker-actions button').first().click();
  await page.locator('.twist-picker').waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
};
const fits = () => page.evaluate(() => document.querySelector('.twist-picker').scrollHeight <= innerHeight && document.querySelector('.twist-start').getBoundingClientRect().bottom <= innerHeight);
try {
  // ---- Start here ----
  await home();
  await page.waitForFunction(() => document.querySelector('[data-start-here] button')?.disabled === false, null, { timeout: 120000 });
  await page.locator('[data-start-here] button').click();
  await page.locator('.twist-picker').waitFor({ timeout: 30000 });
  await page.waitForSelector('.twist-picker-map svg', { timeout: 30000 });
  ok(await page.getByRole('checkbox').count() === 8 && await fits(), 'Start here: eight twist cards, each a checkbox, all in view at 1280 × 800');
  ok((await page.locator('.tw-card.on b').allTextContents()).join() === 'Earth balance,Hands off the castle,Curveballs' && await page.locator('.tw-default').count() === 3,
    'the default three marked Default and on');
  const short = await page.locator('.tw-card small').allTextContents();
  ok(short.every(t => t.length <= 34), `each card has one short line (${short.join(' | ')})`);
  ok(await page.locator('.twist-picker-map circle.tw-map-ring').count() === 1, 'the small map shows the line from A to B and the chapel’s ring');
  await page.mouse.move(1270, 790);
  await shot('twist-screen-start-here');
  await page.locator('.tw-card[data-t="landmarks"]').hover(); await page.waitForTimeout(200);
  ok(/Hands off the castle: .*Here: Chapel of St Roch, Staré Město · chapel · 600 m ring/.test(await page.locator('.twist-picker-detail').textContent()), 'on hover: what it asks and the chapel with its kind and ring');
  await shot('twist-screen-hands-off-hover');
  // the keyboard: Tab to Curveballs, Space turns it off
  await page.mouse.move(1270, 790);
  await page.locator('h1').focus();
  for (let k = 0; k < 3; k++) await page.keyboard.press('Tab');
  ok(await page.evaluate(() => document.activeElement.dataset.t) === 'curveballs', 'Tab goes card by card');
  await page.keyboard.press('Space'); await page.waitForTimeout(300);
  ok(!(await page.locator('.tw-card[data-t="curveballs"]').getAttribute('class')).includes('on') && /^Curveballs: News from the site/.test(await page.locator('.twist-picker-detail').textContent()),
    'Space turns it off; its long line shows while it has focus');
  await shot('twist-screen-keyboard');
  // ---- Šternberk: Hands off says why not ----
  await home(); await pick('Šternberk bypass');
  const none = page.locator('.tw-card.unavailable');
  ok(await none.count() === 1 && /Hands off the castle\s*No listed place near enough/.test(await none.textContent()), 'Šternberk: Hands off is there and says no listed place is near enough');
  await none.hover(); await page.waitForTimeout(200);
  ok(/670 m from the town’s historic centre, 1\.2 km from its castle/.test(await page.locator('.twist-picker-detail').textContent()), '…and on hover why: the bypass keeps clear of the town and its castle');
  await shot('twist-screen-sternberk');
  // ---- I/35 Jičín: eight twists, a heritage area ----
  await home(); await pick('Turnov → Úlibice through Český ráj', 'Čímyšl → Úlibice');
  ok(await page.getByRole('checkbox').count() === 8 && await fits() && /Studeňany heritage area/.test(await page.locator('.tw-card[data-t="landmarks"]').textContent()),
    'Jičín: eight cards in view; Hands off names the Studeňany heritage area');
  await page.mouse.move(1270, 790);
  await shot('twist-screen-jicin');
  // ---- after Start: the game's card names the chapel ----
  await home();
  await page.locator('[data-start-here] button').click();
  await page.locator('.twist-start').click();
  await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 });
  await game.idle(600);
  await page.locator('#chip-twists').click(); await page.waitForTimeout(500);
  ok(/Chapel of St Roch, Staré Město · chapel · 600 m ring/.test(await page.locator('#twists').textContent()), 'in the game, the Twists card names the chapel with its kind and ring');
  await game.park(); await shot('game-twists-card');
  ok(game.pageErrors.length === 0, `no page errors (${game.pageErrors.join('; ')})`);
} finally {
  await game.close();
}
