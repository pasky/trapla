// The final QA sweep's P2s (docs/playtest-findings.md "Final sweep — main e24df59"), with a real mouse:
//  1. D3 motorway, III/1057 dragged so that it passes our bridge further from its end (QA: −17 M, unexplained):
//     the score says which roads' bills moved and why; the new bend's label is plain words and stays clear of
//     the map's legend and credits when the bend sits at the map's bottom edge.
//  2. D3 0302 motorway, "Towards Hostěradice": the card names the place without brackets in brackets.
//  3. While a drag's ≈ price shows, the score line says what it does not count yet; the goal line returns.
//  4. Nová Paka: the photo's construction note shows with the photo and goes with it (key O), both ways.
// node scripts/p2-scene.mjs [--gpu] [--docs]   (screenshots 195–197 with --docs; own port 5293)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const docs = process.argv.includes('--docs');
const out = docs ? 'docs/screenshots' : '/tmp/trapla-p2';
const shot = (n, name) => `${out}/${docs ? `${n}-` : ''}${name}.png`;
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: Number(process.env.PORT ?? 5293), strictPort: true }, logLevel: 'warn' });
await server.listen();
let browser;
const errors = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: process.argv.includes('--gpu')
    ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (query, prefs = {}) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(p => { if (!sessionStorage.getItem('p2')) { localStorage.clear(); sessionStorage.setItem('p2', '1');
      localStorage.setItem('trapla.intro.v2', '1'); for (const [k, v] of Object.entries(p)) localStorage.setItem(k, v); } }, prefs);
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${server.resolvedUrls.local[0]}?${query}`);
    await page.waitForFunction(() => !!window.trapla, null, { timeout: 300000 });
    const idle = async () => {
      await page.evaluate(() => window.trapla.whenIdle());
      await page.evaluate(() => new Promise(resolve => {
        const frame = () => requestAnimationFrame(() => window.trapla.viewBusy() ? frame() : resolve());
        requestAnimationFrame(() => requestAnimationFrame(frame));
      }));
    };
    await idle();
    const box = await page.locator('#view').boundingBox();
    return { context, page, idle, box, at: p => ({ x: box.x + p.sx, y: box.y + p.sy }) };
  };
  const rect = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e || !e.offsetParent) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }, sel);
  const overlaps = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  // ---- 1. D3 motorway: III/1057 rebuilt past our bridge ----
  {
    const { context, page, idle, at } = await open('scenario=d3&preset=d3-motorway');
    assert.equal(await page.evaluate(() => window.trapla.whenTransport()), true, 'the road links load');
    const start = await page.evaluate(() => {
      const t = window.trapla, p = t.getProject(), r = t.projectResult(), ours = p.routes.filter(q => q.role === 'mission').map(q => q.id);
      const crossings = r.routes[ours[0]].legacy.crossings.filter(c => c.cls === 'tertiary' && c.type === 'bridge' && c.s > 11000 && c.s < 12600)
        .map(c => ({ s: c.s, x: c.x, y: c.y, roadId: c.roadId }));
      return { ours, total: r.cost.total, crossings };
    });
    assert(start.crossings.length, 'our motorway bridges III/1057 near km 11.8');
    const roads = (await page.evaluate(() => window.trapla.baseRoads(150))).filter(r => r.name === 'road III/1057' && r.rebuildable);
    // III/1057 25 m from our bridge, on its north side (as QA grabbed it)
    const near = await page.evaluate(([roads, crossings]) => {
      let best = null;
      for (const road of roads) for (let s = 0; s <= road.length; s += 5) {
        const p = window.trapla.sourcePoint(road.id, s); if (!p) continue;
        for (const c of crossings) { const d = Math.hypot(p.x - c.x, p.y - c.y); if (!best || d < best.d) best = { d, id: road.id, s, length: road.length }; }
      }
      const side = [best.s - 25, best.s + 25].map(s => ({ s, p: window.trapla.sourcePoint(best.id, s) })).filter(q => q.p).sort((a, b) => b.p.y - a.p.y);
      return side[0].p;
    }, [roads, start.crossings]);
    await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 800, 0, 62), [near.x, near.y]); await idle();
    const q = at(await page.evaluate(([x, y]) => window.trapla.groundScreen(x, y), [near.x, near.y]));
    await page.evaluate(() => window.trapla.whenTransport());
    await page.mouse.click(q.x, q.y); await page.locator('#inspector.k-source').waitFor({ timeout: 5000 }); // a click selects it first
    await page.mouse.move(q.x, q.y); await page.mouse.down();
    await page.mouse.move(q.x + 40, q.y - 20, { steps: 10 }); await page.mouse.up(); await idle();
    const after = await page.evaluate(() => { const r = window.trapla.projectResult(); return { total: r.cost.total, alone: r.cost.alone }; });
    const rebuilt = (await page.evaluate(() => window.trapla.getProject())).routes.find(r => r.source);
    assert(rebuilt && after.total !== null, 'III/1057 rebuilt and the project priced');
    const motorway = (after.alone[start.ours[0]] - start.total) / 1e6, road = after.alone[rebuilt.id] / 1e6;
    console.log(`total ${((after.total - start.total) / 1e6).toFixed(1)} M: Road III/1057 +${road.toFixed(1)} M, our motorway ${motorway.toFixed(1)} M`);
    const why = await page.locator('#delta-why').textContent();
    console.log(`score: "${await page.locator('#delta').textContent()}" / "${why}"`);
    if (Math.abs(motorway) >= 0.5) {
      assert(await page.locator('#delta-why').isVisible(), 'the score says which roads the change moved');
      assert.match(why, /Road III\/1057 \+[\d.]+ M/); assert.match(why, /[Oo]ur motorway [−+][\d.]+ M/);
      if (motorway < -10) assert.match(why, /\(bridges −[\d.]+ M\)/, 'and that our bridge got cheaper');
    }
    // the new bend's label at the map's bottom edge: plain words, clear of the legend and the credits
    await page.evaluate(id => window.trapla.setActiveRoute(id), rebuilt.id); await idle();
    const bends = await page.evaluate(() => window.trapla.getDesign().pis.length);
    let label = null;
    for (let i = 0; i < bends && !label; i++) {
      await page.evaluate(k => window.trapla.selectPi(k), i); await idle();
      const pi = await page.evaluate(k => window.trapla.getDesign().pis[k], i);
      // the camera so that the bend sits just above the legend at the map's bottom edge (as in QA's screenshot)
      for (let north = 100; north < 1200; north *= 1.3) {
        await page.evaluate(([x, y]) => window.trapla.lookAt(x, y, 700, 0, 62), [pi.x, pi.y + north]); await idle();
        const s = await page.evaluate(([x, y]) => window.trapla.groundScreen(x, y), [pi.x, pi.y]);
        const view = await rect(page, '#view');
        if (s && s.sy > view.h - 85 && s.sy < view.h - 45) break;
      }
      if (await page.locator('.rlabel').isVisible()) label = await page.locator('.rlabel').textContent();
    }
    assert(label, 'a bend label');
    assert(!/polygon|tangent/i.test(label), `the bend label is plain words (${label})`);
    const lr = await rect(page, '.rlabel'), view = await rect(page, '#view');
    for (const sel of ['#legend', '#attrib']) assert(!overlaps(lr, await rect(page, sel)), `the bend label is clear of ${sel} (${JSON.stringify([lr, await rect(page, sel)])})`);
    assert(lr.y + lr.h <= view.y + view.h && lr.y >= view.y, 'the bend label is inside the map');
    console.log(`bend label: "${label}"`);
    await page.screenshot({ path: shot(195, 'd3-1057-rebuilt-change-explained') });
    await context.close();
  }

  // ---- 2 + 3. D3 0302 motorway: one direction; a drag's ≈ price says what it leaves out ----
  {
    const { context, page, idle, at } = await open('scenario=d3-0302&preset=d3-0302-motorway');
    const goal = await page.locator('#perkm').textContent();
    const towards = page.locator('button', { hasText: 'Towards Hostěradice' }).first();
    await towards.click(); await idle();
    const card = await page.locator('[data-dir="explain"], #dir-explain').evaluateAll(es => es.filter(e => e.offsetParent).map(e => e.textContent));
    assert(card.length, 'the direction card');
    for (const t of card) {
      assert(!/\([^()]*\(/.test(t), `no brackets inside brackets (${t})`);
      assert.match(t, /towards Hostěradice\b/);
    }
    console.log(`direction card: "${card[0]}"`);
    // a slow drag of the motorway: while the ≈ price shows, the line under the score says it is an estimate
    const id = await page.evaluate(() => window.trapla.activeRoute());
    const L = await page.evaluate(i => window.trapla.projectResult().routes[i].legacy.length, id);
    const p = at(await page.evaluate(([i, s]) => window.trapla.routeScreen(i, s), [id, L * 0.4]));
    await page.mouse.click(p.x, p.y); await idle(); // a click selects it first
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    let seen = null;
    for (let k = 1; k <= 10 && !seen; k++) {
      await page.mouse.move(p.x + 3 * k, p.y - 4 * k, { steps: 2 });
      await page.waitForTimeout(60);
      const [total, line] = await Promise.all([page.locator('#total').textContent(), page.locator('#perkm').textContent()]);
      // (the first ≈ is the last total while the drag's first price is on its way)
      if (total.startsWith('≈') && line.startsWith('≈')) { seen = line; await page.screenshot({ path: shot(196, 'd3-0302-drag-estimate') }); }
    }
    assert(seen, 'a ≈ price of the dragged motorway, with its line');
    assert.match(seen, /^≈ Quick estimate: .*counted when you pause\.$/, `the line says what the ≈ price leaves out (${seen})`);
    await page.mouse.up(); await idle();
    assert.equal(await page.locator('#perkm').textContent(), goal, 'the goal line is back once settled');
    await context.close();
  }

  // ---- 4. Nová Paka: the photo's construction note ----
  {
    const { context, page, idle } = await open('scenario=i16-nova-paka', { 'trapla.view': JSON.stringify({ photo: true }) });
    const hasPhoto = await page.locator('#viewbar button', { hasText: 'Photo' }).count();
    assert(hasPhoto, 'Nová Paka has a photo');
    const note = page.locator('#photo-note');
    assert(await note.isVisible(), 'the photo is on (saved view): its note shows');
    assert.match(await note.textContent(), /real bypass was being built/);
    for (const r of await Promise.all(['#viewbar', '#legend'].map(s => rect(page, s)))) assert(!overlaps(await rect(page, '#photo-note'), r), 'the note covers no buttons');
    await page.screenshot({ path: shot(197, 'nova-paka-photo-note') });
    await page.keyboard.press('o'); await idle();
    assert(!(await note.isVisible()), 'photo off (O): the note goes');
    await page.keyboard.press('o'); await idle();
    assert(await note.isVisible(), 'photo on again (O): the note is back');
    await page.keyboard.press('o'); await page.reload(); await page.waitForFunction(() => !!window.trapla, null, { timeout: 300000 }); await idle();
    assert(!(await page.locator('#photo-note').isVisible()), 'a fresh page without the photo shows no note');
    console.log('photo note: on with the photo, off without it (O both ways, and after a reload)');
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS p2 scene: change explained, plain bend label kept in the map, direction card, ≈ estimate line, photo note');
} finally {
  await browser?.close();
  await server.close();
}
