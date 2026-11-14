// UX interaction checks with real mouse / keyboard events and screenshots of each: road-height mode switch,
// floating stretch bar (Bridge / Tunnel / Earthwork / Automatic), always-visible Undo / Redo (incl. build
// tools), bends in the profile (hover-linked to the map), map hover → profile, click-to-zoom profile + map,
// curve-band click, Whole route / zoom buttons, pins in Automatic (click the line, drag the pin), height
// points By hand (diamonds, hover → named on the map, double-click adds).
// node scripts/ux.mjs [--docs]  (--docs writes docs/screenshots/36…42-*.png, else /tmp/trapla-ux)
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const PORT = Number(process.env.PORT ?? 5199);
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
// the first-run intro would cover the map in the screenshots
await page.addInitScript(() => { try { localStorage.setItem('trapla.intro.v1', '1'); } catch { /* opaque origin */ } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const out = process.argv.includes('--docs') ? 'docs/screenshots' : '/tmp/trapla-ux';
mkdirSync(out, { recursive: true });
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const idle = async (ms = 0) => {
  await page.evaluate(() => window.trapla.whenIdle());
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  if (ms) await page.waitForTimeout(ms);
};
const get = () => page.evaluate(() => window.trapla.getDesign());
const T = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log(`SHOT ${out}/${name}.png`); };
const design = JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design;

try {
  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
  await idle();
  await T((d) => window.trapla.setDesign(d), design);
  await idle();
  const view = await page.locator('#view').boundingBox();

  // 1. road height: a segmented control with a sentence; Automatic draws no height points
  const mode = await T(() => ({
    on: document.querySelector('.seg button.on')?.textContent, explain: document.getElementById('mode-explain').textContent,
    help: document.getElementById('sec-help').textContent, hud: document.getElementById('hud').textContent,
  }));
  ok(mode.on === 'Automatic' && /lowest.cost/.test(mode.explain), `road height switch: "${mode.on}" — ${mode.explain.slice(0, 70)}…`);
  ok(!/grade line|VPI|dynamic programming|\bDP\b|PI\b/.test(mode.hud), 'no "grade line" / VPI / DP / PI jargon in the HUD');

  // 2. a click on the road line pins its height (Automatic); dragging the pin moves it; Undo / Redo buttons
  await T(() => window.trapla.profileFit());
  await idle();
  let p = await T(() => window.trapla.profilePoint(15000));
  await page.mouse.click(p.x, p.y);
  await idle(150);
  let d = await get();
  ok(d.gradePins?.length === 1 && Math.abs(d.gradePins[0].s - 15000) < 30 && d.profileMode === 'auto', `click on the road line pins its height (${JSON.stringify(d.gradePins)})`);
  ok(await page.locator('.sel-bar.station').isVisible(), 'the pin bar opens at the spot');
  const pin0 = d.gradePins[0];
  p = await T((pin) => window.trapla.profilePoint(pin.s, pin.z), pin0);
  await page.mouse.move(p.x, p.y - 14);
  await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(p.x, p.y - 14 - 4 * k);
  await page.mouse.up();
  await idle(150);
  d = await get();
  ok(d.gradePins[0].z > pin0.z + 1, `dragging the pin raises it (${pin0.z} → ${d.gradePins[0].z} m)`);
  await page.mouse.move(p.x, p.y - 40);
  await idle(100);
  await page.evaluate(() => { document.getElementById('hud').scrollTop = 0; });
  await shot('36-road-height-auto-pin');
  const labels = await T(() => window.trapla.undoLabels());
  ok(/pinned height/.test(labels.undo), `Undo says what it undoes ("${labels.undo}")`);
  await page.click('#undo'); await idle();
  ok((await get()).gradePins[0].z === pin0.z, 'the Undo button over the map undoes the drag');
  await page.keyboard.press('Control+Shift+Z'); await idle();
  ok((await get()).gradePins[0].z > pin0.z + 1, 'Ctrl+Shift+Z redoes it');
  // Ctrl+Z in the middle of a drag is ignored (the drag's final commit would otherwise overwrite it)
  const z1 = (await get()).gradePins[0].z;
  p = await T((pin) => window.trapla.profilePoint(pin.s, pin.z), (await get()).gradePins[0]);
  await page.mouse.move(p.x, p.y - 14); await page.mouse.down();
  for (let k = 1; k <= 4; k++) await page.mouse.move(p.x, p.y - 14 + 4 * k);
  await page.keyboard.press('Control+z');
  await page.mouse.up(); await idle(150);
  const z2 = (await get()).gradePins[0].z;
  await page.keyboard.press('Control+z'); await idle();
  ok(z2 < z1 && (await get()).gradePins[0].z === z1, `Ctrl+Z during a drag is ignored; afterwards it undoes the whole drag (${z1} → ${z2} → ${(await get()).gradePins[0].z})`);
  await page.keyboard.press('Control+Shift+Z'); await idle();
  await page.keyboard.press('Escape');

  // 3. By hand: height points are diamonds; hovering one names it on the map; double-click on the line adds one
  await page.click('#grade-manual'); await idle();
  ok((await get()).profileMode === 'manual', '"By hand" switches the road height mode');
  const vp = await T(() => { const r = window.trapla.result(); const k = Math.floor(r.vpis.length / 2); return { k, ...r.vpis[k] }; });
  p = await T((v) => window.trapla.profilePoint(v.s, v.z), vp);
  await page.mouse.move(p.x, p.y);
  await idle(100);
  const hoverLabel = await T(() => document.querySelector('.hover-dot span')?.textContent ?? '');
  const tipHint = await T(() => document.querySelector('.profile-tip .tip-hint')?.textContent ?? '');
  ok(/height point/.test(hoverLabel), `hovering a height point names it on the map ("${hoverLabel}")`);
  ok(/not a bend/.test(tipHint), `…and the tooltip says it is not a bend ("${tipHint.slice(0, 60)}…")`);
  await shot('37-road-height-by-hand');
  const nV = (await get()).vpis.length;
  const mid = await T((v) => { const r = window.trapla.result(); return (r.vpis[v.k].s + r.vpis[v.k + 1].s) / 2; }, vp);
  await T((s) => window.trapla.profileFocus(s - 200, s + 200), mid); // the points are ≈ 250 m apart: zoom in
  p = await T((s) => window.trapla.profilePoint(s), mid);
  await page.mouse.dblclick(p.x, p.y); await idle();
  ok((await get()).vpis.length === nV + 1, `double-click on the line adds a height point (${nV} → ${(await get()).vpis.length})`);
  await page.click('#grade-auto'); await idle();

  // 4. drag across the profile (no modifier) → floating bar → Bridge; keys; Automatic; undo
  await T(() => window.trapla.profileFit()); await idle();
  const a = await T(() => window.trapla.profilePoint(8000)), b = await T(() => window.trapla.profilePoint(9500));
  const y = a.y - 40;
  await page.mouse.move(a.x, y); await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(a.x + ((b.x - a.x) * k) / 10, y);
  await page.mouse.up(); await idle();
  const range = await T(() => window.trapla.range());
  ok(range && Math.abs(range.s0 - 8000) < 60 && Math.abs(range.s1 - 9500) < 60, `plain drag selects a stretch (${range && (range.s0 / 1000).toFixed(2)}–${range && (range.s1 / 1000).toFixed(2)} km)`);
  ok(await page.locator('.sel-bar.range').isVisible(), 'the action bar pops up over the selection');
  await page.click('.sel-bar [data-structure="1"]'); await idle();
  d = await get();
  ok(d.structureOverrides.length === 1 && d.structureOverrides[0].kind === 1, 'Bridge in the bar builds a bridge there');
  ok(await page.locator('.sel-bar [data-structure="1"].on').count() === 1, '…and the bar shows Bridge as chosen');
  await page.mouse.move(view.x + 15, view.y + view.height - 60); await idle(100);
  await shot('38-stretch-action-bar');
  await page.keyboard.press('t'); await idle();
  ok((await get()).structureOverrides[0].kind === 2, 'T repaints it as a tunnel');
  await page.click('.sel-bar [data-structure="clear"]'); await idle();
  ok((await get()).structureOverrides.length === 0, 'Automatic clears it');
  await page.keyboard.press('Control+z'); await idle();
  ok((await get()).structureOverrides[0]?.kind === 2, 'Ctrl+Z restores the tunnel');
  await page.click('.sel-bar .close');
  ok(await T(() => window.trapla.range()) === null && !(await page.locator('.sel-bar').isVisible()), '✕ deselects and closes the bar');

  // 5. bends: numbered markers in the profile, hover-linked both ways; clicking one offers a pin there
  const bends = await T(() => window.trapla.bendStations());
  ok(bends.length === design.pis.length, `every bend has a profile marker (${bends.length})`);
  const bk = 4;
  p = await T((s) => window.trapla.profilePoint(s), bends[bk].s);
  await page.mouse.move(p.x, p.bendY); await idle(100);
  ok(await page.locator(`.pi.hl[data-i="${bk}"]`).count() === 1, `hovering bend ${bk + 1} in the profile highlights it on the map`);
  await shot('39-bends-in-profile');
  await page.mouse.click(p.x, p.bendY); await idle(500);
  ok(await page.locator('.sel-bar.bend').isVisible(), 'clicking a bend marker offers "Pin road height here"');
  const nPins = (await get()).gradePins.length;
  await page.click('.sel-bar .bend-height'); await idle();
  ok((await get()).gradePins.length === nPins + 1, 'which pins the height at the bend');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  // map → profile: the bend marker, then the road itself
  await T(() => window.trapla.resetCamera()); await idle(200);
  const before = (await get()).pis.length;
  await page.keyboard.down('Shift'); await page.mouse.click(view.x + 300, view.y + 300); await page.keyboard.up('Shift'); await idle(300);
  ok((await get()).pis.length === before + 1, 'Shift+click on the map adds a bend (even on a building)…');
  ok((await T(() => window.trapla.bendStations())).length === before + 1, '…and it appears in the profile');
  const piBox = await page.locator('.pi').nth(bk).boundingBox();
  await page.mouse.move(piBox.x + piBox.width / 2, piBox.y + piBox.height / 2); await idle(100);
  await page.keyboard.press('Control+z'); await idle();
  // the road halfway between bends 4 and 5 (the bends' own map markers would catch the mouse)
  const road = await T((bs) => { const r = window.trapla.result(), i = Math.round((bs[3].s + bs[4].s) / 2 / r.ds); return { s: r.s[i], ...window.trapla.project(r.x[i], r.y[i], r.grade[i]) }; }, bends);
  await page.mouse.move(view.x + road.sx, view.y + road.sy); await page.waitForTimeout(150); await idle(150);
  await page.mouse.move(view.x + road.sx + 1, view.y + road.sy); await idle(150);
  await shot('40-map-hover-in-profile');
  const mh = await T(() => window.trapla.profileHover());
  ok(mh.fromMap && Math.abs(mh.s - road.s) < 30, `hovering the road on the map marks the spot in the profile (km ${mh.s && (mh.s / 1000).toFixed(2)})`);
  ok(errors.length === 0, `no errors so far ${errors.join(' | ')}`);

  // 6. single click zooms the profile there and flies the map; Whole route shows only when zoomed
  await T(() => window.trapla.profileFit()); await idle();
  ok(await page.locator('#fit').isHidden(), '"Whole route" is hidden while the whole route shows');
  const t0 = await T(() => window.trapla.cameraTarget());
  p = await T(() => window.trapla.profilePoint(16000));
  await page.mouse.click(p.x, p.y - 60);
  const at = await T(() => { const r = window.trapla.result(), i = Math.round(16000 / r.ds); return { x: r.x[i], y: r.y[i] }; });
  // the glide is timed, but software rendering can stall its frames: wait for it (≤ 5 s)
  let t1 = t0;
  for (let k = 0; k < 50 && Math.hypot(t1.x - at.x, t1.y - at.y) > 50; k++) { await page.waitForTimeout(100); t1 = await T(() => window.trapla.cameraTarget()); }
  await idle(200);
  const v = await T(() => window.trapla.profileView());
  ok(v.v1 - v.v0 < 8000 && v.v0 < 16000 && v.v1 > 16000, `a click zooms the profile around km 16 (${(v.v0 / 1000).toFixed(1)}–${(v.v1 / 1000).toFixed(1)} km)`);
  ok(Math.hypot(t1.x - at.x, t1.y - at.y) < 50 && Math.hypot(t0.x - at.x, t0.y - at.y) > 500, `…and the map flies there (target ${Math.hypot(t1.x - at.x, t1.y - at.y).toFixed(0)} m off)`);
  ok(await page.locator('#fit').isVisible(), '"Whole route" appears when zoomed in');
  await page.mouse.move(view.x + 15, view.y + view.height - 60); await idle(100);
  await shot('41-profile-click-zoom');
  const bandP = await T(() => window.trapla.profilePoint(16000, undefined, true));
  await page.mouse.click(bandP.x, bandP.y);
  const el = await T(() => window.trapla.range());
  ok(el && el.s0 <= 16000 + 20 && el.s1 >= 16000 - 20, `click on the curve band selects that curve / straight (${el && (el.s0 / 1000).toFixed(2)}–${el && (el.s1 / 1000).toFixed(2)} km)`);
  await page.keyboard.press('Escape');
  await page.click('#fit');
  const w = await T(() => ({ v: window.trapla.profileView(), L: window.trapla.result().length }));
  ok(w.v.v0 === 0 && Math.abs(w.v.v1 - w.L) < 1 && await page.locator('#fit').isHidden(), '"Whole route" zooms out and hides again');
  await page.click('#zoom-in');
  ok((await T(() => window.trapla.profileView())).v1 - (await T(() => window.trapla.profileView())).v0 < w.L * 0.6, '+ zooms in');

  // 7. a building's options are buttons in its card; Undo right after a click (focus still on the button)
  await T(() => window.trapla.profileFit());
  const j = await T(() => window.trapla.result().noise.receivers[0]?.j ?? 0);
  await T((j) => window.trapla.selectBuilding(j), j);
  ok(await page.locator('#building-card').isVisible(), 'selecting a building opens its card at the top of the HUD');
  await page.click('#building-choice [data-building="keep"]'); await idle();
  ok((await get()).buildingOverrides.some((o) => o.j === j && o.action === 'keep'), 'building Keep chosen');
  ok(await page.locator('#building-choice [data-building="keep"].on').count() === 1, 'the Keep button shows as chosen');
  await page.keyboard.press('Control+z'); await idle(100);
  ok(!(await get()).buildingOverrides.some((o) => o.j === j), 'Ctrl+Z undoes it');
  ok(await page.locator('#building-choice [data-building=""].on').count() === 1, 'and the card shows Automatic again');
  await page.keyboard.press('Escape');
  ok(await page.locator('#building-card').isHidden(), 'Esc closes the building card');
  ok(errors.length === 0, `no browser errors ${errors.join(' | ')}`);
} finally { await browser.close(); await server.close(); }
