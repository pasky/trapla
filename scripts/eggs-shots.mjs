// The small details (research/96–98): each one clicked or played as a player would, its screenshot taken, what it says
// asserted. Real mouse where a player would use one.
//   node scripts/eggs-shots.mjs [--gpu] [--docs] [--only lore,records,signs,fly,…]   (--docs: docs/screenshots/660…, else /tmp/trapla-eggs)
//   flock -x /tmp/trapla-browser.lock node scripts/eggs-shots.mjs --gpu --only fly --frames   (the fly-along's frame times)
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { passTwists, startGame } from './lib/browser.mjs';

const docs = process.argv.includes('--docs'), out = docs ? 'docs/screenshots' : '/tmp/trapla-eggs';
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const want = (part) => !only || only.includes(part);
mkdirSync(out, { recursive: true });
/** a mapped way's middle point from the pack (a bridge way's height is not resolved: clicked at its drawn ground) */
const wayMid = (pack, id) => { const t = JSON.parse(gunzipSync(readFileSync(`public/scenarios/${pack}/transport.json.gz`)).toString());
  const q = t.sources.find(q => q.id === id), k = 2 * Math.floor(q.xy.length / 4); return { x: q.xy[k], y: q.xy[k + 1] }; };
const game = await startGame({ viewport: { width: 1440, height: 900 } });
try {
  const { page, idle, still, errors } = game;
  const T = (f, a) => page.evaluate(f, a);
  const shot = (n, name) => page.screenshot({ path: `${out}/${n}-${name}.png` });
  const inspector = () => page.locator('#inspector').innerText();

  // 1. local knowledge: a mapped way's card ends with one grey sourced line (core/data/lore.ts, research/96)
  if (want('lore')) {
    const cases = [
      [660, 'lore-ecce-homo', 'scenario=i46-sternberk', 'osm:way:233754932', /Ecce Homo hill-climb/, /Opavská/],
      [661, 'lore-zampach', 'scenario=d3-0302', 'osm:way:30231642', /Kocour gorge/, /Žampach viaduct/],
      [662, 'lore-hrebec', 'scenario=d35-full', 'osm:way:694293527', /Hřebeč tunnel/, /I\/35/],
      [663, 'lore-r35', 'scenario=i35-turnov', null, /R35 expressway/, /I\/35/],
      [664, 'lore-kralovec', 'scenario=d11&preset=d11-rail-kralovec', 'osm:way:602447755', /Lubawka and Sędzisław/, /^Trutnov – Lubawka railway/],
    ];
    for (const [n, name, query, wanted, says, title] of cases) {
      await game.open(query); await T(() => window.trapla.whenTransport());
      // the I/35: its longest mapped way in the pack
      const id = wanted ?? await T(() => window.trapla.sourceIds('primary', 400).find(id => window.trapla.sourceTags(id)?.ref === '35'));
      const len = await T((id) => window.trapla.sourceLength(id), id);
      // (where our own line runs on it, a click there selects ours: another point of the way)
      for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
        await T(([id, s]) => window.trapla.lookAtSource(id, s, 700), [id, len * f]); await still(); await idle();
        const view = await page.locator('#view').boundingBox();
        const p = await T(([id, s]) => window.trapla.sourceScreen(id, s), [id, len * f])
          ?? await T(([x, y]) => window.trapla.groundScreen(x, y), Object.values(wayMid(query.match(/scenario=([^&]+)/)[1], id)));
        await page.mouse.click(view.x + p.sx, view.y + p.sy); await idle(300);
        if (title.test(await inspector())) break;
      }
      const text = await inspector();
      assert.match(text, says, `${name}: the card says it (${text})`); assert.match(text, title, `${name}: its title (${text})`);
      assert.doesNotMatch(text, /625 00/);
      await game.park(); await shot(n, name);
    }
    // the D11's end B: the Polish S3
    await game.open('scenario=d11&preset=d11-motorway');
    await T(() => window.trapla.select({ kind: 'end', end: 'b' })); await idle(300);
    assert.match(await inspector(), /Poland’s S3 has run all the way to Szczecin since July 2024/);
    await shot(665, 'lore-s3');
  }
  // 2. a record, said once: not on the starter's own 3 km D35 tunnel; once the player moves the line over it, yes
  if (want('records')) {
    await game.open('scenario=d35&preset=d35-stage1-motorway');
    const tunnel = () => T(() => window.trapla.result().runs.filter(q => q.kind === 2).sort((p, q) => q.length - p.length)[0]);
    let t = await tunnel();
    assert.ok(t.length > 2168, `the starter's tunnel is ${t.length} m`);
    await T((s) => window.trapla.selectPiece(s), (t.s0 + t.s1) / 2); await idle(300);
    assert.match(await inspector(), /^Tunnel/); assert.doesNotMatch(await inspector(), /Panenská/, 'not on the starter');
    // the player moves the bend nearest the tunnel's middle 30 m aside
    const d = await T(() => window.trapla.getDesign()), mid = await T((s) => { const r = window.trapla.result(), i = r.s.findIndex(q => q >= s); return { x: r.x[i], y: r.y[i] }; }, (t.s0 + t.s1) / 2);
    const pi = d.pis.reduce((b, p) => Math.hypot(p.x - mid.x, p.y - mid.y) < Math.hypot(b.x - mid.x, b.y - mid.y) ? p : b);
    pi.x += 30; pi.y += 10;
    await T((d) => window.trapla.setDesign(d), d); await idle();
    t = await tunnel();
    await T((s) => window.trapla.selectPiece(s), (t.s0 + t.s1) / 2); await idle(300);
    const text = await inspector();
    assert.ok(t.length <= 2168 || /Longer than any motorway tunnel open in Czechia \(Panenská, D8, about 2.2 km\)/.test(text), `the player's ${t.length} m tunnel: ${text}`);
    await shot(666, 'record-tunnel');
  }
  // 3. the failure screens' road signs (ui/signs.ts, research/98), each notice as the game shows it
  if (want('signs')) {
    for (const [n, kind] of [[667, 'insecure'], [668, 'webgl'], [669, 'small']]) {
      await page.goto(`${game.base}?scenario=d3-0302`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(async (kind) => { document.body.replaceChildren(); const m = await import('/src/ui/device-check.ts'); m.showDeviceNotice(kind, kind === 'small' ? () => {} : undefined); }, kind);
      assert.equal(await page.locator('.device-notice svg.notice-sign[aria-hidden="true"]').count(), 1);
      await page.screenshot({ path: `${out}/${n}-sign-${kind}.png`, clip: { x: 0, y: 0, width: 1440, height: 560 } });
    }
    errors.splice(0); // (the game's own page, emptied under it for the notices)
    // (a fresh page: the one above fetched the pack ahead already)
    const failing = await game.browser.newPage({ viewport: { width: 1440, height: 900 } });
    await failing.route(/height\.i16\.gz/, (route) => route.request().method() === 'HEAD' ? route.continue() : route.fulfill({ status: 503, body: 'down' }));
    await failing.goto(`${game.base}?scenario=d3-0302&preset=d3-0302-motorway`);
    await passTwists(failing).catch(() => {});
    await failing.waitForSelector('#loading.failed', { timeout: 60000 }).catch(async (e) => { await failing.screenshot({ path: `${out}/debug.png` }); throw e; });
    assert.equal(await failing.locator('#loading svg.notice-sign[aria-hidden="true"]').count(), 1);
    await failing.screenshot({ path: `${out}/670-sign-loading-failed.png` });
    await failing.close();
  }
  // 4. fly along (ui/fly-along.ts): from end A's card, 28 m up, over the Sázava bridge; frame times while it flies
  //    (and the land cover streams in); Esc stops it and puts the view back
  if (want('fly')) {
    await game.open('scenario=d3-0302&preset=d3-0302-motorway');
    await T(() => window.trapla.select({ kind: 'end', end: 'a' })); await idle(300);
    const pose0 = JSON.stringify(await T(() => window.trapla.cameraPose()));
    const r = await T(() => { const r = window.trapla.result(); let hi = 0, sh = 0; for (let i = 0; i < r.n; i++) if (r.kind[i] === 1 && r.grade[i] - r.ground[i] > hi) { hi = r.grade[i] - r.ground[i]; sh = r.s[i]; } return { L: r.length, high: sh }; });
    // frame gaps meanwhile (rAF to rAF)
    await T(() => { window.__gaps = []; let last = performance.now(); const f = (t) => { window.__gaps.push(t - last); last = t; if (window.__gaps.length < 20000) window.__raf = requestAnimationFrame(f); }; window.__raf = requestAnimationFrame(f); });
    await page.getByRole('button', { name: 'Fly along' }).click();
    assert.equal(await T(() => document.getElementById('overlay').classList.contains('flying')), true, 'flying, the markers hidden');
    const speed = Math.max(45, r.L / 120);
    // (the shots held at their place: a software renderer draws a frame in ≈ 0.6 s, so a time-based shot misses it)
    let n = 671;
    await page.waitForTimeout(process.argv.includes('--frames') ? 0.95 * r.L / speed * 1000 : Math.min(15000, 0.3 * r.L / speed * 1000));
    for (const s of process.argv.includes('--frames') ? [] : [0.25 * r.L, r.high - 450, r.high]) {
      await T((s) => window.trapla.flyAlong('a', s), s); await game.frames(4); await page.waitForTimeout(1500); await game.frames(2);
      await shot(n++, `fly-along-${Math.round(s)}`);
    }
    const pose = await T(() => window.trapla.cameraPose());
    console.log('flying at', JSON.stringify(pose));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    assert.equal(await T(() => document.getElementById('overlay').classList.contains('flying')), false, 'Esc stops it');
    assert.equal(JSON.stringify(await T(() => window.trapla.cameraPose())), pose0, 'and puts the view back');
    const gaps = await T(() => { cancelAnimationFrame(window.__raf); return window.__gaps.slice(5).sort((a, b) => a - b); });
    // (--frames: the whole flight flown, nothing else; a timed run: flock -x, --gpu)
    const q = (p) => gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))];
    console.log(`fly-along frames: ${gaps.length}, median ${q(0.5).toFixed(1)} ms, p95 ${q(0.95).toFixed(1)} ms, p99 ${q(0.99).toFixed(1)} ms, max ${gaps.at(-1).toFixed(1)} ms`);
    // a click stops it too, and selects nothing
    assert.match(await inspector(), /^Interchange/, 'its card stays');
    await page.getByRole('button', { name: 'Fly along' }).click(); await page.waitForTimeout(800);
    const view = await page.locator('#view').boundingBox();
    await page.mouse.click(view.x + view.width / 2, view.y + view.height / 2); await page.waitForTimeout(300);
    assert.equal(await T(() => document.getElementById('overlay').classList.contains('flying')), false, 'a click stops it');
    assert.equal(JSON.stringify(await T(() => window.trapla.cameraPose())), pose0);
  }
  assert.deepEqual(errors, []);
} finally { await game.close(); }
