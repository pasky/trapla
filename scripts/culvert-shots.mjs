// Views of stream culverts (pipes, frames, buried bridges) on saved D11 designs, from several angles.
// node scripts/culvert-shots.mjs [--gpu] [--out dir] [--design demo|starter] [--scenario d11 | --query 'scenario=…&preset=…']
//   [--only km,km] [--views oblique,end-a,…] [--no-play]
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const out = arg('--out', '/tmp/culvert-shots'), designName = arg('--design', 'demo'), scenario = arg('--scenario', 'd11'), query = arg('--query', `scenario=${scenario}`);
const views = arg('--views', 'oblique,end-a,end-a-side,end-a-top,end-b,end-b-side,end-b-top').split(','), play = !process.argv.includes('--no-play');
const only = arg('--only', '')?.split(',').filter(Boolean).map(Number);
mkdirSync(out, { recursive: true });
const game = await startGame({ viewport: { width: 1400, height: 900 } });
const { page, pageErrors: errors } = game;
// `--design starter`: the scenario's own starting road
const design = designName === 'starter' ? null : JSON.parse(readFileSync(`scripts/${designName}-design.json`, 'utf8')).design;
const idle = () => game.idle(500);
try {
  await game.open(query); await idle();
  if (design) { await page.evaluate(d => window.trapla.setDesign(d), design); await idle(); }
  const culverts = await page.evaluate(() => window.trapla.result().waterCrossings.filter(c => c.structure === 'pipe' || c.structure === 'box')
    .map(c => ({ s: c.s, x: c.x, y: c.y, bed: c.bed, opening: c.opening, length: c.length, h: c.h, tx: c.channelTx, ty: c.channelTy,
      ends: window.trapla.culverts().find(p => p.s === c.s)?.ends })));
  assert(culverts.length > 0, 'design has culverts');
  console.log(culverts.map(c => `km ${(c.s / 1000).toFixed(3)} ${c.opening} ${c.length.toFixed(0)} m, fill ${c.h.toFixed(1)} m`).join('\n'));
  for (const c of culverts) {
    if (only?.length && !only.some(km => Math.abs(km * 1000 - c.s) < 30)) continue;
    // oblique from above, then each end from outside (looking into the opening, a little from the side)
    const shots = [['oblique', 240, Math.atan2(c.tx ?? 1, c.ty ?? 0) * 180 / Math.PI + 40, 30, c]];
    for (const [k, e] of (c.ends ?? []).entries()) {
      const into = Math.atan2(-e.ox, -e.oy) * 180 / Math.PI;
      shots.push([`end-${'ab'[k]}`, 80, into + 25, 18, e], [`end-${'ab'[k]}-side`, 80, into + 80, 25, e], [`end-${'ab'[k]}-top`, 80, into, 70, e]);
    }
    for (const [name, size, bearing, elev, at] of shots.filter(v => views.includes(v[0]))) {
      await page.evaluate(({ c, at, size, bearing, elev }) => {
        window.trapla.lookAt(at.x, at.y, size, bearing, elev);
        window.trapla.profileFocus(c.s - 200, c.s + 200);
      }, { c, at, size, bearing, elev });
      await idle(); await game.park();
      const path = `${out}/culvert-${scenario}-${designName}-${(c.s / 1000).toFixed(3)}-${name}.png`;
      await page.screenshot({ path }); console.log(path, JSON.stringify(c));
    }
  }
  if (play) {
    // play it: click a culvert's end on the map, its mark, its ring in the profile; the card and both views agree
    const c = culverts.find(c => c.ends) ?? culverts[0], e = c.ends[0];
    await page.evaluate(({ e }) => { window.trapla.lookAt(e.x, e.y, 80, Math.atan2(-e.ox, -e.oy) * 180 / Math.PI + 25, 18); }, { e });
    await idle(); await game.park();
    const box = await page.locator('#view canvas, canvas').first().boundingBox();
    const p = await page.evaluate(({ e }) => window.trapla.screenOf(e.x + e.ox, e.y + e.oy, e.z + 1), { e });
    await page.mouse.click(box.x + p.sx, box.y + p.sy); await idle();
    const picked = await page.evaluate(() => window.trapla.selection());
    assert.equal(picked?.kind, 'culvert', `a click on the culvert's end selects it (got ${JSON.stringify(picked)})`);
    assert(Math.abs(picked.s - c.s) < 1, 'the clicked culvert');
    const card = await page.locator('.inspector').innerText();
    assert.match(card, /culvert|Buried bridge/i); assert.match(card, /m long/); assert.match(card, /CZK/);
    await page.mouse.move(box.x + p.sx, box.y + p.sy + 40);
    await page.screenshot({ path: `${out}/culvert-${designName}-card.png` }); console.log(`${out}/culvert-${designName}-card.png`);
    // the profile shows it selected; a click on another culvert's ring there selects that one, and its mark on the map
    const other = culverts.find(o => o.s !== c.s);
    if (other) {
      await page.evaluate(({ o }) => { window.trapla.profileFocus(o.s - 300, o.s + 300); }, { o: other }); await idle();
      const ring = await page.evaluate(({ o }) => window.trapla.profileScreen?.(o.s, o.bed), { o: other });
      if (ring) {
        const pb = await page.locator('#profile-canvas').boundingBox();
        await page.mouse.click(pb.x + ring.x, pb.y + ring.y - 4); await idle();
        const sel = await page.evaluate(() => window.trapla.selection());
        assert.equal(sel?.kind, 'culvert'); assert(Math.abs(sel.s - other.s) < 1, 'the profile ring selects its culvert');
        assert.equal(await page.locator('.build-annotation.culvert.selected').count(), 1, 'its mark on the map is the selected one');
        await page.screenshot({ path: `${out}/culvert-${designName}-profile-pick.png` });
      }
    }
    // the map mark selects too
    await page.locator('.build-annotation.culvert:not(.selected)').first().click(); await idle();
    const marked = await page.evaluate(() => window.trapla.selection());
    assert.equal(marked?.kind, 'culvert', 'the mark selects its culvert');
    // its alternative: a bridge over the stream instead (one edit; the culvert goes, the card with it)
    await page.locator('.inspector button[data-fix-bridge]').click(); await idle();
    const after = await page.evaluate((s) => { const r = window.trapla.result(), i = Math.round(s / r.ds);
      return { kind: r.kind[i], culvert: r.waterCrossings.some(c => c.size && Math.abs(c.s - s) < 5), sel: window.trapla.selection() }; }, marked.s);
    assert.equal(after.kind, 1, 'a bridge stands over the stream'); assert(!after.culvert, 'no culvert there any more');
    assert.notEqual(after.sel?.kind, 'culvert', 'the culvert card closed');
    await page.screenshot({ path: `${out}/culvert-${designName}-bridge-instead.png` });
  }
  assert.deepEqual(errors, []);
} finally { await game.close(); }
