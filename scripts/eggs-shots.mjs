// The small details (research/96–101): each one clicked or played as a player would, its screenshot taken, what it says
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
  // 5. the mapped ground (ui/ground-words.ts, research/99): off by default; the key's toggle draws its band under the
  //    ground line and lists it; a cut's More names what it is dug in
  if (want('ground')) {
    await game.open('scenario=d11&preset=d11-motorway');
    await page.locator('#key-toggle').click();
    assert.equal(await page.locator('#ground-band').isChecked(), false, 'off by default');
    await page.locator('#ground-band').check(); await game.frames(2);
    const listed = await page.locator('#ground-key').innerText();
    assert.ok(listed.split('\n').length >= 2, `the key lists the ground: ${listed}`);
    await shot(674, 'ground-band-key');
    await page.locator('#key-toggle').click(); await page.locator('#zoom-in').click(); await page.locator('#zoom-in').click(); await page.waitForTimeout(600); await game.frames(3);
    assert.equal(await page.locator('#profile-key').isHidden(), true);
    await shot(675, 'ground-band');
    await T(() => window.trapla.profileFit());
    // the deepest cut's card, More
    const cut = await T(() => { const r = window.trapla.result(); let best = null, i = 0;
      while (i < r.n) { if (r.kind[i] === 0 && r.grade[i] < r.ground[i] - 1) { let j = i, d = 0; while (j + 1 < r.n && r.kind[j + 1] === 0 && r.grade[j + 1] < r.ground[j + 1] - 1) { j++; d = Math.max(d, r.ground[j] - r.grade[j]); } if (!best || d > best.d) best = { s: (r.s[i] + r.s[j]) / 2, d }; i = j + 1; } else i++; }
      return best; });
    await T((s) => window.trapla.selectPiece(s), cut.s); await idle(300);
    if (!/Less ▴/.test(await inspector())) await page.locator('#inspector .more-t').click();
    assert.match(await inspector(), /Mapped ground: /);
    await shot(676, 'ground-cut-card');
    await page.locator('#inspector .more-t').click(); // (More back as it was)
    await page.locator('#key-toggle').click(); await page.locator('#ground-band').uncheck(); await page.locator('#key-toggle').click();
  }
  // 6. the watershed (core/basins.ts, research/100): the D35 tunnel under the Hřebeč ridge, each end in another sea's basin
  if (want('watershed')) {
    await game.open('scenario=d35&preset=d35-stage1-motorway');
    const t = await T(() => window.trapla.result().runs.filter(q => q.kind === 2).sort((p, q) => q.length - p.length)[0]);
    await T((s) => window.trapla.selectPiece(s), (t.s0 + t.s1) / 2); await idle(300);
    await page.waitForFunction(() => /different seas/.test(document.getElementById('inspector').innerText), null, { timeout: 20000 });
    assert.match(await inspector(), /rain at its km 4\.\d\d end runs to the North Sea, at its km 7\.\d\d end to the Black Sea/);
    await shot(677, 'watershed-tunnel');
  }
  // 7. St Barbara under a mined tunnel's More, on the D11 map only (core/data/lore.ts MINED_TUNNEL_LORE)
  if (want('barbara')) {
    await game.open('scenario=d11&preset=d11-rail-kralovec');
    const t = await T(() => window.trapla.result().runs.filter(q => q.kind === 2 && q.method !== 'cut').sort((p, q) => q.length - p.length)[0]);
    await T((s) => window.trapla.selectPiece(s), (t.s0 + t.s1) / 2); await idle(300);
    assert.doesNotMatch(await inspector(), /St Barbara/, 'under More only');
    await page.locator('#inspector .more-t').click();
    assert.match(await inspector(), /St Barbara, tunnellers’ patron, stands at its portal/);
    await shot(678, 'barbara-tunnel');
    await page.locator('#inspector .more-t').click();
    // not on another map's mined tunnel
    await game.open('scenario=d35&preset=d35-stage1-motorway');
    const u = await T(() => window.trapla.result().runs.filter(q => q.kind === 2).sort((p, q) => q.length - p.length)[0]);
    await T((s) => window.trapla.selectPiece(s), (u.s0 + u.s1) / 2); await idle(300);
    await page.locator('#inspector .more-t').click();
    assert.doesNotMatch(await inspector(), /St Barbara/);
    await page.locator('#inspector .more-t').click();
  }
  // 8. the reveal says how long yours took against the real one's years (research/96 §8), seen again from the twists card
  if (want('reveal')) {
    const key = 'trapla.twists.v1.i46-sternberk.i46-sternberk-road';
    await game.open('scenario=i46-sternberk');
    await T((key) => { const s = JSON.parse(localStorage.getItem(key) ?? '{}'); localStorage.setItem(key, JSON.stringify({ on: ['earth', 'landmarks', 'curveballs'], chosen: true, fired: [], playMs: 41 * 60_000 + 20_000,
      firedAtMs: 0, editsSince: 0, firstValid: true, scratch: false, ...s, revealed: { cost: 791e6, on: ['earth', 'landmarks', 'curveballs'], playMs: 41 * 60_000 + 20_000 } })); }, key);
    await page.reload(); await page.waitForFunction(() => !!window.trapla, null, { timeout: 180000 }); await idle(500);
    await page.locator('#chip-twists').click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'The real project' }).click();
    const text = await page.locator('.reveal').innerText();
    assert.match(text, /Yours took 41 minutes\. The real one was in environmental review by 2003\./);
    await page.waitForTimeout(900); await shot(679, 'reveal-took');
    await page.locator('.reveal').getByRole('button', { name: 'Keep improving' }).click();
  }
  // 9. a finished slip road, first selected: one stroke in its driving direction, then gone; not again
  if (want('slip')) {
    await game.open('scenario=d3-0303&preset=d3-0303-motorway');
    const d = JSON.parse(readFileSync('tests/fixtures/interchange/d3-0303-diamond.json', 'utf8'));
    await T((d) => window.trapla.setProject(d), d); await idle();
    await T(() => window.trapla.lookAt(3510, 7790, 700, 0, 60)); await idle(); await still();
    const slips = await T(() => window.trapla.getProject().routes.filter(r => r.name === 'Slip road').map(r => r.id));
    assert.ok(slips.length >= 1, `slip roads: ${slips}`);
    await T((id) => window.trapla.setActiveRoute(id), slips[0]);
    assert.equal(await T(() => window.trapla.sweeping()), true, 'the first selection draws its stroke');
    await page.waitForTimeout(700); await game.frames(1);
    await shot(680, 'slip-road-stroke');
    await page.waitForFunction(() => !window.trapla.sweeping(), null, { timeout: 20000 });
    await T(() => window.trapla.select(null)); await T(() => window.trapla.setActiveRoute('route:motorway-forward')); await idle();
    await T((id) => window.trapla.setActiveRoute(id), slips[0]);
    assert.equal(await T(() => window.trapla.sweeping()), false, 'once only');
  }
  // 10. the dashed official line answers a click: what it is, where it comes from, its real price, the D11's tunnel name
  if (want('official')) {
    await game.open('scenario=d11&preset=d11-motorway');
    const xy = JSON.parse(readFileSync('public/scenarios/d11/meta.json', 'utf8')).official.xy;
    // a point of it well away from our road (at the start our road lies along it)
    const road = await T(() => { const r = window.trapla.result(); return { x: [...r.x], y: [...r.y] }; });
    let far = null, gap = 0;
    for (let k = 1; k < xy.length; k++) {
      const x = (xy[k - 1][0] + xy[k][0]) / 2, y = (xy[k - 1][1] + xy[k][1]) / 2;
      let d = Infinity; for (let i = 0; i < road.x.length; i += 4) d = Math.min(d, Math.hypot(road.x[i] - x, road.y[i] - y));
      if (d > gap && d < 400) { gap = d; far = { x, y }; }
    }
    assert.ok(far && gap > 60, `a point of the official line clear of our road (${gap.toFixed(0)} m)`);
    await T(([x, y]) => window.trapla.lookAt(x, y, 700, 0, 60), [far.x, far.y]); await still(); await idle();
    const view = await page.locator('#view').boundingBox();
    const p = await T(([x, y]) => { const g = window.trapla.groundScreen(x, y); return window.trapla.screenOf(x, y, window.trapla.pick ? 0 : 0) && g; }, [far.x, far.y]);
    await page.mouse.move(view.x + p.sx, view.y + p.sy - 1); await page.waitForTimeout(300);
    await page.mouse.click(view.x + p.sx, view.y + p.sy - 1); await idle(300);
    const text = await inspector();
    assert.match(text, /^Official D11/); assert.match(text, /as OpenStreetMap maps it/); assert.match(text, /11\.71 bn CZK/); assert.match(text, /Opevnění/);
    await game.park(); await shot(681, 'official-line-card');
  }
  // 11. a bridge for your desk: More → Print bridge card, one landscape A4 (as a PDF here) to fold once
  if (want('print')) {
    for (const [n, query, name] of [[682, 'scenario=d3-0302&preset=d3-0302-motorway', 'd3-0302'], [683, 'scenario=i46-sternberk', 'i46-sternberk']]) {
      await game.open(query);
      const b = await T(() => window.trapla.result().runs.filter(q => q.kind === 1).sort((p, q) => q.length - p.length)[0]);
      await T((s) => window.trapla.selectPiece(s), (b.s0 + b.s1) / 2); await idle(300);
      if (!/Less ▴/.test(await inspector())) await page.locator('#inspector .more-t').click();
      await T(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
      await page.getByRole('button', { name: 'Print bridge card' }).click();
      await page.waitForFunction(() => window.__printed === 1, null, { timeout: 30000 });
      assert.equal(await page.locator('#print-sheet svg').count(), 1);
      await page.emulateMedia({ media: 'print' });
      await page.pdf({ path: `${out}/bridge-card-${name}.pdf`, width: '297mm', height: '210mm', printBackground: true });
      await page.setViewportSize({ width: 1123, height: 794 }); await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/${n}-bridge-card-${name}.png` });
      await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 1440, height: 900 });
      await T(() => window.dispatchEvent(new Event('afterprint')));
      assert.equal(await page.locator('#print-sheet').count(), 0, 'gone after the print');
      await page.locator('#inspector .more-t').click();
    }
  }
  assert.deepEqual(errors, []);
} finally { await game.close(); }
