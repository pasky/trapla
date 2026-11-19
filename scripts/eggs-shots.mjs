// The small details (research/96): each one clicked or played as a player would, its screenshot taken, what it says
// asserted. Real mouse where a player would use one.
//   node scripts/eggs-shots.mjs [--gpu] [--docs] [--only lore,records,…]   (--docs: docs/screenshots/660…, else /tmp/trapla-eggs)
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { startGame } from './lib/browser.mjs';

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
  assert.deepEqual(errors, []);
} finally { await game.close(); }
