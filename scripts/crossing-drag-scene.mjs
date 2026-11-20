// A selected crossing's parts are dragged with the real mouse (owner report, I/35 Turnov → Valdštejnsko, Photo view:
// "anywhere I click on the segment (the big circle, elsewhere), it just drags the landscape"), and a mapped cul-de-sac
// is cut back (same report):
//  1. I/35 Turnov km 1.67, Nudvojovická (class III) carried over us: its ring says "drag to move where it crosses" and
//     slides where it crosses along our road (the map stays put; undo "moving where Nudvojovická crosses"); slid
//     again once it is a road of the project; its lit works say "drag to bend Nudvojovická" and bend it.
//  2. D11 km 2.32, road III/3012 under our bridge: the ring slides it (undo "moving where road III/3012 crosses").
//  3. A cut way's ring says why no drag moves it. Roads of yours joining the crossed road keep where they join: a new
//     road on Nudvojovická; D3 0303's diamond, road II/105 slid between its slip roads' junctions.
//  4. I/35 Turnov, a local road ending at our embankment near km 3.0: its End handle says "drag to shorten"; dragged
//     back 120 m the piece is taken up (billed, the home it served is a problem); undo makes it whole.
//  5. D11 road III/3012, slid: its rebuilt stretch's End pulled through a junction and over a 7 m bridge onto the next
//     way, its Start back past its junction onto the way before (one undo step each); on I/35 a Start held short of a
//     road you built, the hover saying why.
// node scripts/crossing-drag-scene.mjs [--gpu] [--docs]   (--docs: docs/screenshots/700–709, 780–785)
import { mkdirSync, readFileSync } from 'node:fs';
import { checker, startGame } from './lib/browser.mjs';

const out = process.argv.includes('--docs') ? 'docs/screenshots' : '/tmp/trapla-crossing-drag';
mkdirSync(out, { recursive: true });
const { ok } = checker();
const game = await startGame({ viewport: { width: 1400, height: 900 } });
const { page } = game;
const T = (f, a) => page.evaluate(f, a);
const shot = async (name, park = true) => { if (park) await game.park(); await game.frames(3); await page.screenshot({ path: `${out}/${name}.png` }); };
const hoverText = () => T(() => document.querySelector('.hover-dot')?.textContent ?? '');
const cursor = () => T(() => document.querySelector('#view canvas').style.cursor);
const view = () => page.locator('#view').boundingBox();
const ground = async (x, y) => { const b = await view(), p = await T(([x, y]) => window.trapla.groundScreen(x, y), [x, y]); return { x: b.x + p.sx, y: b.y + p.sy }; };
const camera = () => T(() => window.trapla.cameraTarget());
const moved = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const undo = () => T(() => window.trapla.undoLabels().undo);
/** the selected crossing's ring (it lets the pointer through to the map: its middle is where a press grabs it) */
const ring = async () => { const b = await page.locator('.selected-crossing').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const hover = async (p) => { await page.mouse.move(p.x - 4, p.y - 3); await page.mouse.move(p.x, p.y, { steps: 3 }); await page.waitForTimeout(250); return { text: await hoverText(), cursor: await cursor() }; };
/** a drag from p by (dx, dy) px in `steps` moves; `during`: called before the release */
const drag = async (p, dx, dy, steps = 12, during = async () => {}) => {
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let k = 1; k <= steps; k++) { await page.mouse.move(p.x + dx * k / steps, p.y + dy * k / steps); await page.waitForTimeout(30); }
  await during();
  await page.mouse.up(); await game.idle(600);
};
/** our road's screen direction at station s, `along` m of it in px */
const alongRoad = async (s, along) => { const q = await T(([s, a]) => [window.trapla.roadScreen(s), window.trapla.roadScreen(s + a)], [s, along]); return { dx: q[1].sx - q[0].sx, dy: q[1].sy - q[0].sy }; };
const crossingOf = (route, pick) => T(([route, pick]) => {
  const r = window.trapla.projectResult().routes[route].legacy;
  return r.crossings.filter(c => eval(pick)(c)).map(c => ({ roadId: c.roadId, s: c.s, x: c.x, y: c.y, type: c.type, designed: !!c.designed, name: c.crossedRoute?.name }));
}, [route, pick]);
const select = async (route, roadId, x, y, dist = 500) => {
  await T(([route, roadId, x, y, dist]) => { window.trapla.setActiveRoute(route); window.trapla.selectCrossing(roadId); window.trapla.lookAt(x, y, dist, 0, 50); }, [route, roadId, x, y, dist]);
  await game.idle(); await game.still();
};

try {
  // ---- 1. I/35 Turnov: Nudvojovická carried over us at km 1.67 ----
  await game.open('scenario=i35-turnov');
  await T(() => window.trapla.whenTransport());
  await T(() => window.trapla.setView({ photo: true, contours: false }));
  const F = 'route:motorway-forward';
  const [nud] = await crossingOf(F, 'c => c.roadId === 344');
  ok(nud?.type === 'overbridge', `I/35 km ${(nud.s / 1000).toFixed(2)}: Nudvojovická carried over us (${nud.type})`);
  await select(F, 344, nud.x, nud.y);
  const r0 = await ring(), h0 = await hover(r0);
  ok(/drag to move where it crosses/.test(h0.text) && h0.cursor === 'grab', `its ring, selected: "${h0.text}", cursor ${h0.cursor}`);
  await shot('700-crossing-ring-hover', false);
  const c0 = await camera(), dir = await alongRoad(nud.s, 60);
  await drag(r0, dir.dx, dir.dy, 12, () => shot('701-crossing-ring-sliding', false));
  const [slid] = await crossingOf(F, 'c => c.designed && c.s > 1400 && c.s < 2000');
  ok(moved(c0, await camera()) < 1, 'the drag moved no map');
  ok(slid && slid.s - nud.s > 25, `it crosses ${slid ? (slid.s - nud.s).toFixed(0) : '?'} m further along our road, where the ring was dragged (km ${(slid?.s / 1000).toFixed(2)})`);
  ok(await undo() === 'moving where Nudvojovická crosses', `undo: "${await undo()}"`);
  await select(F, slid.roadId, slid.x, slid.y);
  await shot('702-crossing-slid-its-card');
  // again, now a road of the project: back the other way
  const back = await alongRoad(slid.s, -40);
  const r1 = await ring(), h1 = await hover(r1);
  ok(/drag to move where it crosses/.test(h1.text), `slid once, its ring still slides it ("${h1.text}")`);
  await drag(r1, back.dx, back.dy);
  const [again] = await crossingOf(F, 'c => c.designed && c.s > 1400 && c.s < 2000');
  ok(again && again.s < slid.s - 15, `slid back ${(slid.s - again.s).toFixed(0)} m`);
  // its works bend it: back to the mapped road first (two undos)
  await page.keyboard.press('Control+z'); await game.idle(); await page.keyboard.press('Control+z'); await game.idle(600);
  ok((await T(() => window.trapla.getProject().routes.length)) === 2, 'two undos: the mapped road again');
  await select(F, 344, nud.x, nud.y);
  const w = await ground(2915.5, 3434), h2 = await hover(w);
  ok(/drag to bend Nudvojovická/.test(h2.text) && h2.cursor === 'grab', `its lit works: "${h2.text}"`);
  const c1 = await camera();
  await drag(w, 40, -10, 10);
  ok(moved(c1, await camera()) < 1 && await undo() === 'changing Nudvojovická', `a drag on them rebuilds it and bends it (undo "${await undo()}"), no map moved`);
  await shot('703-crossed-road-works-bent');
  // the player's choice goes with a slid crossing: an underpass stays one
  await page.keyboard.press('Control+z'); await game.idle(600);
  await select(F, 344, nud.x, nud.y);
  await page.locator('#inspector button', { hasText: /^Underpass$/ }).click(); await game.idle(600);
  const [under] = await crossingOf(F, 'c => c.roadId === 344');
  await select(F, 344, under.x, under.y);
  const r6 = await ring(), d6 = await alongRoad(under.s, 40);
  await drag(r6, d6.dx, d6.dy);
  const [kept] = await crossingOf(F, 'c => c.designed && c.s > 1400 && c.s < 2000');
  ok(under.type === 'underpass' && kept?.type === 'underpass', `your underpass under us, slid: still an underpass (${under.type} → ${kept?.type})`);

  // ---- 2. D11: road III/3012 under our bridge at km 2.32 ----
  await game.open('scenario=d11');
  await T(() => window.trapla.whenTransport());
  await T(() => window.trapla.setView({ photo: true, contours: false }));
  const M = await T(() => window.trapla.activeRoute());
  const [iii] = await crossingOf(M, 'c => c.roadId === 177');
  ok(iii?.type === 'bridge', `D11 km ${(iii.s / 1000).toFixed(2)}: road III/3012 under our bridge`);
  await select(M, 177, iii.x, iii.y);
  await shot('704-d11-iii-3012-ring');
  const r2 = await ring(), d2 = await alongRoad(iii.s, 70), c2 = await camera();
  ok(/drag to move where it crosses/.test((await hover(r2)).text), 'its ring slides it');
  await drag(r2, d2.dx, d2.dy);
  const [iii2] = await crossingOf(M, 'c => c.designed && c.s > 2000 && c.s < 2800');
  ok(moved(c2, await camera()) < 1 && iii2 && iii2.s - iii.s > 30, `it crosses ${iii2 ? (iii2.s - iii.s).toFixed(0) : '?'} m further on; no map moved`);
  ok(await undo() === 'moving where road III/3012 crosses', `undo: "${await undo()}"`);
  const priced = () => T(() => { const r = window.trapla.projectResult(); return { total: r.cost.total, why: [...new Set(r.cost.unpriced.map(u => u.reason))].join() }; });
  const p2 = await priced();
  ok(p2.total !== null, `slid, the project is priced (${p2.total !== null ? (p2.total / 1e9).toFixed(3) + ' bn' : `unpriced: ${p2.why}`})`);
  await shot('705-d11-iii-3012-slid');

  // ---- 5. its rebuilt stretch's ends pulled past junctions on both sides (owner: the squares could not pass them) ----
  // III/3012 is mapped as ways split at its junctions and at a 7 m bridge over a brook: its stretch [228 m, 802 m] of
  // one way is pulled on through the junction with a street, over the bridge and 150 m along the next way; then back
  // past the junction at its start onto the way before it. Each pull is one undo step; the project stays priced.
  const III = 'osm:way:236292102', NEXT = 'osm:way:141372692', BRIDGE = 'osm:way:141372695', BEFORE = 'osm:way:28729805';
  const rebuiltId = await T(() => window.trapla.getProject().routes.find(r => r.source)?.id);
  const stretch = () => T((id) => window.trapla.getProject().routes.find(r => r.id === id).source.intervals.map(i => ({ id: i.sourceId, s0: i.s0, s1: i.s1 })), rebuiltId);
  const iv0 = await stretch();
  ok(iv0.length === 1 && iv0[0].id === III, `the slid road is rebuilt on one way (${JSON.stringify(iv0.map(i => [i.id, Math.round(i.s0), Math.round(i.s1)]))})`);
  const endHandle = async (k) => { const hb = await page.locator(`.stretch-end[data-end="${k}"]`).boundingBox(); return { x: hb.x + hb.width / 2, y: hb.y + hb.height - 4 }; };
  const sp = (id, s) => T(([id, s]) => window.trapla.sourcePoint(id, s), [id, s]);
  const pull = async (k, id, s, during = async () => {}) => {
    const h = await endHandle(k), to = await ground(...Object.values(await sp(id, s)).slice(0, 2));
    await drag(h, to.x - h.x, to.y - h.y, 16, during);
  };
  const lookAtSource = async (id, s, dist = 900) => { const q = await sp(id, s); await T(([x, y, d]) => window.trapla.lookAt(x, y, d, 0, 55), [q.x, q.y, dist]); await game.idle(); await game.still(); };
  await T((id) => window.trapla.setActiveRoute(id), rebuiltId);
  await lookAtSource(III, 802);
  ok(await page.locator('.stretch-end').count() === 2, 'its stretch shows its two ends');
  const hv = await hover(await endHandle(1));
  ok(hv.text === 'drag along the old road', `its End: "${hv.text}"`);
  await shot('780-stretch-ends', false);
  await pull(1, NEXT, 150, () => shot('781-stretch-end-past-junction', false));
  const iv1 = await stretch(), bill1 = await T(() => { const r = window.trapla.projectResult(); return { total: r.cost.total, valid: r.valid, unpriced: r.cost.unpriced.length,
    works: r.works.items.map(w => w.label ?? '').filter(l => /Old (road|bridge)|Junction|kept as it is/.test(l)), why: r.cost.unpriced.map(u => u.reason), issues: r.issues.map(i => i.violation.title) }; });
  ok(iv1.map(i => i.id).join() === [III, 'osm:way:236292104', BRIDGE, NEXT].join() && Math.abs(iv1[3].s1 - 150) < 25,
    `pulled on through its junction and over the bridge: ${iv1.map(i => `${i.id.slice(8)} ${Math.round(i.s0)}–${Math.round(i.s1)}`).join(', ')}`);
  ok(await undo() === 'rebuilding more of Road III/3012' || /^rebuilding more of /.test(await undo()), `undo: "${await undo()}"`);
  ok(bill1.total !== null && !/Branch|cannot end/.test(await T(() => document.querySelector('.toast')?.textContent ?? '')),
    `engineered and priced (${bill1.works.join(' | ')}; ${bill1.total !== null ? (bill1.total / 1e9).toFixed(3) + ' bn' : `unpriced: ${bill1.why.join()}`}; ${bill1.issues.join(' | ')})`);
  await shot('782-stretch-over-the-bridge');
  await lookAtSource(III, 228);
  await pull(0, BEFORE, 120, () => shot('783-stretch-start-past-junction', false));
  const iv2 = await stretch();
  ok(iv2[0].id === BEFORE && iv2.at(-1).id === NEXT && iv2.length === 5, `its start pulled back past its junction onto the way before: ${iv2.map(i => `${i.id.slice(8)} ${Math.round(i.s0)}–${Math.round(i.s1)}`).join(', ')}`);
  const p5 = await priced();
  ok(p5.total !== null, `engineered and priced (${p5.total !== null ? (p5.total / 1e9).toFixed(3) + ' bn' : `unpriced: ${p5.why}`})`);
  await shot('784-stretch-both-ends-pulled');
  await page.keyboard.press('Control+z'); await game.idle(600);
  ok((await stretch()).length === 4, 'undo: its start where it was');

  // ---- 3. what no drag changes says why ----
  // a cut way: its ring (its new road keeps its own drag)
  await game.open('scenario=i35-turnov');
  await T(() => window.trapla.whenTransport());
  const [cut] = await crossingOf(F, 'c => c.roadId === 347');
  await select(F, 347, cut.x, cut.y);
  const h3 = await hover(await ring());
  ok(/Cut here: pick how it crosses in the card/.test(h3.text), `a cut way's ring: "${h3.text}"`);
  await shot('706-cut-way-ring-says-why', false);
  // a road of yours that joins the crossed road's stretch: it would lose where it joins (a slip road's junction alike)
  await page.locator('#build-route').click();
  await page.locator('.route-build-choices button', { hasText: /^Road$/ }).click(); await page.waitForTimeout(200);
  const j0 = await T(() => window.trapla.sourcePoint('osm:way:35336916', 60));
  await T(([x, y]) => window.trapla.lookAt(x, y, 500, 0, 60), [j0.x, j0.y]); await game.idle(); await game.still();
  const jp = await ground(j0.x, j0.y), jq = await ground(j0.x - 120, j0.y - 60);
  await page.mouse.move(jp.x, jp.y, { steps: 3 }); await page.waitForTimeout(150); await page.mouse.click(jp.x, jp.y); await page.waitForTimeout(200);
  await page.mouse.move(jq.x, jq.y, { steps: 3 }); await page.waitForTimeout(150); await page.mouse.click(jq.x, jq.y); await game.idle();
  ok((await T(() => window.trapla.getProject().routes.length)) === 3, 'Build → Road from Nudvojovická');
  await select(F, 344, nud.x, nud.y);
  const start0 = await T(() => JSON.stringify(window.trapla.getProject().routes.find(r => r.name === 'New road').endpoints.a));
  const r4 = await ring(), d4 = await alongRoad(nud.s, 30);
  ok(/drag to move where it crosses/.test((await hover(r4)).text), 'with a road of yours joining it, its ring still slides it');
  await drag(r4, d4.dx, d4.dy);
  const rebuilt = await T(() => window.trapla.getProject().routes.find(r => r.source)?.source.intervals[0]);
  ok(rebuilt && rebuilt.s0 > 61 && await T(() => JSON.stringify(window.trapla.getProject().routes.find(r => r.name === 'New road').endpoints.a)) === start0,
    `…rebuilding it from km ${(rebuilt?.s0 / 1000).toFixed(2)} of it, clear of where your road joins it (km 0.06), which stays`);
  // its Start pulled back towards your road's junction: held short of it (of its earthworks there), the hover says why
  const nudId = await T(() => window.trapla.getProject().routes.find(r => r.source)?.id);
  await T((id) => window.trapla.setActiveRoute(id), nudId);
  const n0 = await T(() => window.trapla.sourcePoint('osm:way:35336916', 0));
  await T(([x, y]) => window.trapla.lookAt(x, y, 600, 0, 55), [n0.x, n0.y]); await game.idle(); await game.still();
  const sh = await page.locator('.stretch-end[data-end="0"]').boundingBox(), shp = { x: sh.x + sh.width / 2, y: sh.y + sh.height - 4 };
  const beyond = await ground(n0.x - 0.3 * (j0.x - n0.x), n0.y - 0.3 * (j0.y - n0.y));
  let held = '';
  await drag(shp, beyond.x - shp.x, beyond.y - shp.y, 16, async () => { held = await hoverText(); await shot('785-stretch-end-held-at-your-road', false); });
  const after3 = await T((id) => window.trapla.getProject().routes.find(r => r.id === id).source.intervals[0], nudId);
  ok(/^(A road you built joins it here|New road covers it here)$/.test(held) && after3.s0 >= 60 && after3.s0 <= rebuilt.s0 + 0.5, `held short of your road's junction (from ${Math.round(after3.s0)} m), the hover: "${held}"`);
  // the slip roads of a diamond join road II/105 either side of the stretch its ring moves (D3 0303, saved from the game)
  await game.open('scenario=d3-0303');
  await T(() => window.trapla.whenTransport());
  const diamond = JSON.parse(readFileSync(new URL('../tests/fixtures/interchange/d3-0303-diamond.json', import.meta.url), 'utf8'));
  await T((d) => window.trapla.setProject(d), diamond); await game.idle();
  const [ii] = await crossingOf('route:motorway-forward', 'c => c.roadId === 429');
  await select('route:motorway-forward', 429, ii.x, ii.y, 700);
  const ends0 = await T(() => JSON.stringify(window.trapla.getProject().routes.filter(r => r.name.startsWith('Slip road')).map(r => r.endpoints)));
  const r5 = await ring(), d5 = await alongRoad(ii.s, 30);
  ok(/drag to move where it crosses/.test((await hover(r5)).text), 'road II/105 between the slip roads\' junctions: its ring slides it');
  await drag(r5, d5.dx, d5.dy);
  ok(await undo() === 'moving where road II/105 crosses'
    && await T(() => JSON.stringify(window.trapla.getProject().routes.filter(r => r.name.startsWith('Slip road')).map(r => r.endpoints))) === ends0,
  'slid between them: the slip roads join it where they did');

  // ---- 4. I/35 Turnov: a local road's dead end cut back ----
  await game.open('scenario=i35-turnov');
  await T(() => window.trapla.whenTransport());
  await T(() => window.trapla.setView({ photo: true, contours: false }));
  const ID = 'osm:way:37738160', before = await T(() => window.trapla.projectResult().cost.total);
  const p = await T((id) => window.trapla.sourcePoint(id, 60), ID);
  await T(([x, y]) => window.trapla.lookAt(x, y, 600, 0, 55), [p.x, p.y]);
  await game.idle(); await game.still();
  const q = await T((id) => window.trapla.sourceScreen(id, 200), ID), b = await view();
  await page.mouse.click(b.x + q.sx, b.y + q.sy); await game.idle(300);
  const card = await page.locator('.inspector').innerText();
  ok(/Local road/.test(card) && /its End to shorten it/.test(card), 'the local road\'s card: drag its End to shorten it');
  const handle = page.locator('.dead-end');
  ok(await handle.count() === 1, 'its dead end has a handle');
  const hb = await handle.boundingBox(), hp = { x: hb.x + hb.width / 2, y: hb.y + hb.height - 4 };
  ok((await hover(hp)).text === 'drag to shorten', 'its hover: "drag to shorten"');
  await shot('707-dead-end-handle', false);
  // forward past the old end: it stays there
  const outward = await T((id) => [window.trapla.sourceScreen(id, 0), window.trapla.sourceScreen(id, 30)], ID);
  await drag(hp, (outward[0].sx - outward[1].sx) * 2, (outward[0].sy - outward[1].sy) * 2, 6);
  ok(!(await T(() => window.trapla.getProject().takenUp)), 'dragged past where the road ends: nothing changes');
  const to = await T((id) => window.trapla.sourceScreen(id, 120), ID), hb2 = await handle.boundingBox(), hp2 = { x: hb2.x + hb2.width / 2, y: hb2.y + hb2.height - 4 };
  let label = '';
  await drag(hp2, b.x + to.sx - hp2.x, b.y + to.sy - hp2.y, 10, async () => { label = await handle.innerText(); await shot('708-dead-end-dragged-back', false); });
  ok(/^−1[12]\d m$/.test(label), `while dragged the handle says what goes (${label})`);
  const after = await T(() => { const r = window.trapla.projectResult(); return { total: r.cost.total, valid: r.valid, taken: window.trapla.getProject().takenUp,
    issues: r.issues.map(i => i.violation.title), works: r.works.items.filter(w => /taken up/.test(w.label ?? '')).map(w => ({ label: w.label, cost: w.cost })) }; });
  ok(after.taken?.length === 1 && Math.abs(after.taken[0].interval.s1 - 120) < 3, `120 m taken up (${JSON.stringify(after.taken?.[0]?.interval.s1)})`);
  ok(await undo() === 'shortening Local road', `undo: "${await undo()}"`);
  ok(after.works.length === 1 && /Local road taken up: 1[12]\d m/.test(after.works[0].label) && after.works[0].cost > 1e5, `billed: ${after.works[0]?.label}, ${(after.works[0]?.cost / 1e6).toFixed(2)} M`);
  ok(after.issues.includes('A home loses its road') && !after.valid, 'the home it was the only road to is a problem');
  ok(/Shortened: 1[12]\d m taken up/.test(await page.locator('.inspector').innerText()), 'its card says it is shortened');
  await shot('709-dead-end-taken-up');
  await page.keyboard.press('Control+z'); await game.idle(600);
  ok(!(await T(() => window.trapla.getProject().takenUp)) && await T(() => window.trapla.projectResult().cost.total) === before, 'undo: the road whole again, the bill as before');
  ok(game.pageErrors.length === 0, `no page errors (${game.pageErrors.join('; ')})`);
} finally { await game.close(); }
