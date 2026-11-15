// Three players' sessions with real mouse / keyboard events and a screenshot after every step
// (docs/interface-rethink.md has the personas and what each step checks):
//  A. first-time player who wants a cheaper road: intro, empty clicks are harmless, drag the road to bend
//     it, the change chip, "where the money goes", click the road / the profile to inspect a piece;
//  B. a player fixing violations: the violations chip selects the first one, a noise violation opens the
//     house with its cross-section, the fix is a button, the noise view;
//  C. a power user: bridge over a valley from the map, keep a house and remove its wall, walls on a
//     stretch, a crossed road, a pinned height by dragging the profile's line, undo / redo, Start over.
// Ends with the reference design: the overview and demolished buildings close up.
// node scripts/playtest.mjs [--docs] [--size=1280x800]   (every step into /tmp/trapla-playtest; --docs writes
// the gallery subset to docs/screenshots/60…)
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const DOCS = process.argv.includes('--docs');
const [W, H] = (process.argv.find((a) => a.startsWith('--size='))?.slice(7) ?? '1280x800').split('x').map(Number);
const OUT = DOCS ? 'docs/screenshots' : process.env.OUT ?? '/tmp/trapla-playtest';
const GALLERY = ['first-run', 'drag-road', 'money', 'piece', 'violation', 'noise-fix', 'noise-view', 'forced-bridge', 'walls', 'crossing', 'pin', 'overview'];
const FIRST = 60; // docs numbering continues after the highest existing screenshot
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.PORT ?? 5207);
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const T = (fn, arg) => page.evaluate(fn, arg);
const idle = async (ms = 150) => {
  await T(() => window.trapla.whenIdle());
  await T(() => new Promise((res) => { const f = () => requestAnimationFrame(() => (window.trapla.viewBusy() ? f() : res())); requestAnimationFrame(() => requestAnimationFrame(f)); }));
  await page.waitForTimeout(ms);
};
const get = () => T(() => window.trapla.getDesign());
const sel = () => T(() => window.trapla.selection());
let n = 0;
const shot = async (name) => {
  if (DOCS && !GALLERY.includes(name)) return;
  const file = DOCS ? `${OUT}/${FIRST + GALLERY.indexOf(name)}-playtest-${name}.png` : `${OUT}/${String(n).padStart(2, '0')}-${name}.png`;
  n++;
  await page.screenshot({ path: file });
  console.log('SHOT', file);
};
const visible = (s) => page.locator(s).first().isVisible();
/** the control is on screen and on top: what a click at its centre would hit */
const clickable = (s) => T((s) => {
  const el = document.querySelector(s), b = el?.getBoundingClientRect();
  if (!b || !b.width) return false;
  const x = b.left + b.width / 2, y = b.top + b.height / 2;
  return x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight && el.contains(document.elementFromPoint(x, y));
}, s);
const demo = JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design;
const fresh = async (design) => {
  await T(() => { localStorage.clear(); localStorage.setItem('trapla.intro.v2', '1'); });
  await page.reload();
  await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
  if (design) await T((d) => window.trapla.setDesign(d), design);
  await T(() => window.trapla.resetCamera());
  await idle(300);
};

try {
  await page.goto(`http://localhost:${PORT}/?scenario=d11`);
  await T(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.trapla !== undefined, null, { timeout: 120000 });
  await idle(300);
  const view = await page.locator('#view').boundingBox();
  const at = (p) => ({ x: view.x + p.sx, y: view.y + p.sy });

  // ---------------- A. first-time player ----------------
  ok(await visible('#intro'), 'A: the intro is shown on the first run');
  const route = await T(() => [0.02, 0.25, 0.5, 0.75, 0.98].map((f) => window.trapla.roadScreen(window.trapla.result().length * f)));
  const ib = await page.locator('#intro').boundingBox();
  const covered = route.filter((p) => view.x + p.sx > ib.x && view.x + p.sx < ib.x + ib.width && view.y + p.sy > ib.y && view.y + p.sy < ib.y + ib.height);
  ok(covered.length === 0, `A: the intro leaves the route visible (${covered.length} of 5 sample points covered)`);
  ok(await T(() => document.querySelectorAll('#inspector .money li').length) === 5, 'A: the card under the score says where the money goes');
  await shot('first-run');
  await page.click('#intro-ok');
  // a stray click on empty ground: nothing happens
  const mid = { x: view.x + (route[1].sx + route[2].sx) / 2 + 220, y: view.y + (route[1].sy + route[2].sy) / 2 };
  await page.mouse.click(mid.x, mid.y); await idle();
  ok((await get()).pis.length === 0, 'A: a click on empty ground adds nothing');
  // the road under the mouse can be grabbed
  const r1 = at(await T(() => window.trapla.roadScreen(window.trapla.result().length * 0.4)));
  await page.mouse.move(r1.x, r1.y); await page.waitForTimeout(250);
  ok(await T(() => document.querySelector('#view canvas').style.cursor) === 'grab', 'A: the road shows a grab cursor');
  const cost0 = await T(() => window.trapla.result().cost.total);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(r1.x + 6 * k, r1.y + 2 * k);
  await page.mouse.up(); await idle(300);
  let d = await get();
  ok(d.pis.length === 1 && (await sel())?.kind === 'bend', 'A: dragging the road adds a bend, selected');
  const delta = await page.locator('#delta').textContent();
  const cost1 = await T(() => window.trapla.result().cost.total);
  ok(delta !== '' && (cost1 < cost0) === delta.startsWith('−'), `A: the score shows the change (${delta})`);
  await shot('drag-road');
  // where the money goes → the most expensive piece
  await page.keyboard.press('Escape');
  ok(await visible('#inspector.idle .money'), 'A: Esc deselects; the money list is back');
  await page.locator('#inspector .money button').first().click(); await idle(700);
  let s = await sel();
  ok(s?.kind === 'stretch' && !!s.piece, `A: the most expensive piece is selected (${s?.piece} km ${(s?.s0 / 1000).toFixed(2)}–${(s?.s1 / 1000).toFixed(2)})`);
  const pv = await T(() => window.trapla.profileView());
  ok(pv.v0 <= s.s0 + 1 && pv.v1 >= s.s1 - 1, 'A: the profile shows the selected piece');
  await shot('money');
  // click the road on the map: the piece under it; click in the profile: the piece there
  const q = await T(() => window.trapla.profilePoint(window.trapla.result().length * 0.15));
  await T(() => window.trapla.profileFit()); await page.waitForTimeout(100);
  const q2 = await T(() => window.trapla.profilePoint(window.trapla.result().length * 0.15));
  await page.mouse.click(q2.x, q2.y - 40); await idle(700);
  s = await sel();
  ok(s?.kind === 'stretch' && !!s.piece && s.s0 <= (await T(() => window.trapla.result().length)) * 0.15 + 20, `A: a click in the profile selects the piece there (${s?.piece})`);
  ok(!!q && await visible('#inspector.k-stretch #structure-choice'), 'A: its card offers Auto / Bridge / Tunnel / Earthwork');
  await page.mouse.move(q2.x + 30, q2.y - 30); await page.waitForTimeout(250);
  const tip = await page.locator('.profile-tip').boundingBox();
  const prof = await page.locator('#profile').boundingBox();
  ok(!!tip && tip.y >= prof.y - 1 && tip.height < 90, `A: the profile tooltip is short and stays in the profile (${tip && Math.round(tip.height)} px)`);
  await shot('piece');

  // ---------------- B. fixing violations ----------------
  const bad = JSON.parse(JSON.stringify(demo));
  bad.pis[6].x += 200;
  bad.wallOverrides = [{ s0: 10001.75, s1: 10251.67, side: 'R', height: 0 }];
  await fresh(bad);
  const nv = await T(() => window.trapla.result().violations.length);
  ok(nv >= 2, `B: the design has ${nv} violations`);
  await page.click('#chip-viol'); await idle(700);
  s = await sel();
  ok(!!s && await visible('#inspector .ctx-issue'), `B: the violations chip selects the first one's object (${s?.kind}) with its banner`);
  ok(await visible('#inspector .ctx-issue .fix'), 'B: the fix is a button');
  await shot('violation');
  const k = await T(() => window.trapla.result().violations.findIndex((v) => v.kind === 'noise'));
  await page.locator('#viol li').nth(k).click(); await idle(700);
  s = await sel();
  ok(s?.kind === 'building' && await visible('#inspector .noise-section'), 'B: the noise violation opens the house with its cross-section');
  const floors = await page.locator('#inspector .noise-section text.bad, #inspector .noise-section text.ok').count();
  ok(floors >= 1, `B: every floor's level is shown (${floors})`);
  ok(!/#\d|receiver|LAeq|retained|blocking/i.test(await page.locator('#inspector').textContent()), 'B: no IDs or jargon in the card');
  const svg0 = await page.locator('#inspector .noise-section').innerHTML();
  await page.hover('#inspector .wall-row button[data-wall-r="6"]'); await page.waitForTimeout(150);
  ok(await page.locator('#inspector .noise-section').innerHTML() !== svg0, 'B: hovering a wall height previews it in the cross-section');
  await page.mouse.move(view.x + 10, view.y + 10);
  await page.click('#inspector .ctx-issue .fix'); await idle(700);
  const left = await T(() => window.trapla.result().violations.filter((v) => v.kind === 'noise').length);
  ok(left === 0, 'B: one click on the fix removes the noise violation');
  await shot('noise-fix');
  await page.keyboard.press('n'); await idle(600);
  ok(await visible('#noise-legend'), 'B: N shows the noise view');
  const lg = await page.locator('#noise-legend').boundingBox();
  ok(lg.height < 90, `B: its legend is small (${Math.round(lg.height)} px)`);
  await shot('noise-view');
  await page.keyboard.press('n');

  // ---------------- C. power user ----------------
  await fresh(demo);
  // a bridge over the valley, from the map: click the highest embankment, then Bridge
  const fill = await T(() => { const r = window.trapla.result(); let b = null; for (let i = 0; i < r.n; i++) { const h = r.grade[i] - r.ground[i]; if (r.kind[i] === 0 && (!b || h > b.h)) b = { i, h, s: r.s[i] }; } window.trapla.lookAt(r.x[b.i], r.y[b.i], 1500, 30, 40); return b; });
  await idle(500);
  const fp = at(await T((s) => window.trapla.roadScreen(s), fill.s));
  await page.mouse.click(fp.x, fp.y); await idle(500);
  s = await sel();
  ok(s?.kind === 'stretch' && s.piece === 'fill', `C: a click on the embankment selects it (${(fill.h).toFixed(0)} m high)`);
  await page.click('#structure-choice [data-structure="1"]'); await idle(600);
  d = await get();
  ok(d.structureOverrides?.length === 1 && d.structureOverrides[0].kind === 1 && (await sel())?.piece === 'bridge', 'C: Bridge builds it; the card now says Bridge');
  await shot('forced-bridge');
  await page.keyboard.press('Control+z'); await idle(300);
  ok(!(await get()).structureOverrides?.length, 'C: Ctrl+Z takes it back');
  await page.keyboard.press('Control+Shift+Z'); await idle(300);
  ok((await get()).structureOverrides?.length === 1, 'C: Ctrl+Shift+Z redoes it');
  // walls on a stretch: both sides 6 m
  const w = await T(() => { const r = window.trapla.result(), w = r.walls[0]; window.trapla.lookAt(r.x[w.i0], r.y[w.i0], 900, 200, 50); window.trapla.selectRange(w.s0, w.s1); return w; });
  await idle(500);
  ok(await visible('#inspector .wall-row'), 'C: a stretch with houses beside it shows the wall rows');
  await page.click('#inspector .wall-row button[data-wall-l="6"]'); await idle(400);
  await page.click('#inspector .wall-row button[data-wall-r="6"]'); await idle(500);
  d = await get();
  ok(d.wallOverrides?.length === 2 && d.wallOverrides.every((o) => o.height === 6), `C: 6 m walls on both sides of km ${(w.s0 / 1000).toFixed(2)}–${(w.s1 / 1000).toFixed(2)}`);
  await shot('walls');
  await page.keyboard.press('Escape');
  // keep a house, take its wall away: a violation, with the fix as a button
  const rec = await T(() => { const r = window.trapla.result(); const p = r.noise.receivers.find((p) => p.status === 'wall' && !r.walls.some((w) => w.i0 <= p.key.i && w.i1 >= p.key.i && w.s0 >= 6000 && w.s0 <= 7000)) ?? r.noise.receivers.find((p) => p.status === 'wall'); window.trapla.lookAt(r.x[p.i], r.y[p.i], 500, 20, 55); return p; });
  await idle(600);
  const bs = await T((j) => window.trapla.buildingScreen(j, 3), rec.j);
  await page.mouse.click(view.x + bs.sx, view.y + bs.sy); await idle(400);
  ok((await sel())?.kind === 'building' && (await sel()).j === rec.j, 'C: a click on a house selects it');
  ok(await clickable('#building-choice [data-building="keep"]'), 'C: its buttons are on screen');
  await page.click('#building-choice [data-building="keep"]'); await idle(400);
  await page.click(`#inspector .wall-row button[data-wall-${rec.key.side.toLowerCase()}="0"]`); await idle(600);
  ok(await visible('#inspector .ctx-issue'), 'C: kept and without its wall, the house shows a violation');
  await page.click('#inspector .wall-row button[data-wall-' + rec.key.side.toLowerCase() + '="auto"]'); await idle(600);
  ok(!(await visible('#inspector .ctx-issue')), 'C: Auto wall again: the violation is gone');
  await page.keyboard.press('Escape');
  // a crossed road, close up on the map
  const xing = await T(() => {
    const r = window.trapla.result(), m = r.crossings.filter((c) => c.roadId !== undefined && c.s > 2000 && c.s < r.length - 2000);
    const c = m.find((c) => c.type === 'overbridge') ?? m[0];
    window.trapla.lookAt(c.x, c.y, 900, 20, 55);
    return { roadId: c.roadId, type: c.type, x: c.x, y: c.y, z: r.grade[c.i] - Math.min(0, c.h) + 2 };
  });
  await idle(400);
  const xs = at(await T((c) => window.trapla.project(c.x, c.y, c.z), xing));
  await page.mouse.move(xs.x, xs.y); await page.waitForTimeout(250);
  ok(await T(() => document.querySelector('#view canvas').style.cursor) === 'pointer', 'C: a crossed road under the mouse shows a pointer');
  await page.mouse.click(xs.x, xs.y); await idle(400);
  ok((await sel())?.kind === 'crossing' && await visible('#crossing-choice'), `C: a click on it opens its card (${xing.type})`);
  const other = xing.type === 'overbridge' ? 'reconnection' : 'overbridge';
  await page.click(`#crossing-choice [data-crossing="${other}"]`); await idle(500);
  ok((await get()).crossingOverrides?.some((o) => o.roadId === xing.roadId && o.type === other), `C: changed to ${other}`);
  await shot('crossing');
  // the crossed road's own works (rerouted link, rebuilt approach), well away from the crossing point
  // and from our road: a click there opens the same card
  await page.keyboard.press('Escape');
  await T((c) => window.trapla.lookAt(c.x, c.y, 350, 20, 55), xing); await idle(400);
  const works = await T(() => {
    const r = window.trapla.result(), box = document.querySelector('#view canvas').getBoundingClientRect();
    const road = []; for (let i = 0; i < r.n; i++) road.push(window.trapla.project(r.x[i], r.y[i], r.grade[i]));
    for (const c of r.crossings) {
      const g = c.geometry, mark = window.trapla.project(c.x, c.y, r.grade[c.i]);
      for (const p of [...(g?.road ? [g.road] : []), ...(g?.links ?? [])]) for (let k = 1; k + 1 < p.length; k++) {
        const q = window.trapla.project(p[k].x, p[k].y, p[k].z);
        if (!q.vis || q.sx < 80 || q.sy < 80 || q.sx > box.width - 80 || q.sy > box.height - 80) continue;
        if (Math.hypot(q.sx - mark.sx, q.sy - mark.sy) < 60 || road.some((o) => o.vis && Math.hypot(o.sx - q.sx, o.sy - q.sy) < 20)) continue;
        return { roadId: c.roadId, type: c.type, sx: q.sx, sy: q.sy, link: p !== g.road };
      }
    }
    return null;
  });
  if (works) {
    await page.mouse.move(view.x + works.sx, view.y + works.sy); await page.waitForTimeout(250);
    ok(await T(() => document.querySelector('#view canvas').style.cursor) === 'pointer', `C: the crossed road's works under the mouse show a pointer (${works.type})`);
    await page.mouse.click(view.x + works.sx, view.y + works.sy); await idle(400);
    const picked = await sel();
    ok(picked?.kind === 'crossing' && picked.roadId === works.roadId && await visible('#crossing-choice'), `C: a click on its ${works.type} works, away from the crossing, opens its card`);
  } else ok(false, 'C: no crossing works on screen to click');
  // a pinned height: drag the profile's line up
  await T(() => window.trapla.profileFit());
  const sPin = await T(() => { const r = window.trapla.result(); for (let s = r.length * 0.8; s > r.length * 0.3; s -= 50) if (!r.crossings.some((c) => Math.abs(c.s - s) < 150) && !r.waterCrossings.some((c) => Math.abs(c.s - s) < 150)) return Math.round(s); return Math.round(r.length * 0.8); });
  const lp = await T((s) => window.trapla.profilePoint(s), sPin);
  const z0 = await T((s) => { const r = window.trapla.result(); return r.grade[Math.round(s / r.ds)]; }, sPin);
  await page.mouse.move(lp.x, lp.y); await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(lp.x, lp.y - 4 * k);
  await page.mouse.up(); await idle(600);
  d = await get();
  ok(d.gradePins?.length === 1 && d.gradePins[0].z > z0 + 1 && (await sel())?.kind === 'pin', `C: dragging the line up pins a higher road (${z0.toFixed(1)} → ${d.gradePins?.[0]?.z} m), the pin is selected`);
  await page.fill('#pin-z', String(Math.round(z0 + 3))); await page.click('#pin-set'); await idle(400);
  ok(Math.abs((await get()).gradePins[0].z - Math.round(z0 + 3)) < 0.05, 'C: its height can be typed');
  await shot('pin');
  // start over, with Undo in the toast
  await page.click('#sec-design .fold-h button');
  const t0 = Date.now();
  await page.click('#reset'); await page.waitForTimeout(100);
  ok((await get()).pis.length === 0 && await visible('#toast'), 'C: Start over goes back to the straight line and offers Undo');
  await page.click('#toast button:not(.x)'); console.log(`(Undo clicked ${Date.now() - t0} ms after Start over)`); await idle(300);
  ok((await get()).pis.length === demo.pis.length, 'C: the toast\'s Undo brings the design back');

  // ---------------- the reference design ----------------
  await T(() => { window.trapla.select(null); window.trapla.resetCamera(); window.trapla.profileFit(); }); await idle(300);
  await page.mouse.move(view.x + 5, view.y + view.height - 5);
  ok(await T(() => document.querySelectorAll('.pi.mini').length) > 0, 'crowded bends at the overview shrink to dots');
  await shot('overview');
  const dem = await T(() => { const r = window.trapla.result(), b = r.demolished[0]; window.trapla.lookAt(r.x[b.i], r.y[b.i], 450, 30, 50); return r.demolished.length; });
  await idle(500);
  const shown = await T(() => { const r = window.trapla.result(); return { gone: r.demolished.filter((b) => !window.trapla.buildingShown(b.j)).length, kept: r.noise.receivers.slice(0, 20).filter((p) => window.trapla.buildingShown(p.j)).length }; });
  ok(dem > 0 && shown.gone === dem && shown.kept > 0, `all ${dem} demolished buildings are removed from the 3D map (${shown.gone}); others stay`);
  await shot('demolished');

  ok(errors.length === 0, `no browser errors ${errors.join(' | ')}`);
} finally { await browser.close(); await server.close(); }
