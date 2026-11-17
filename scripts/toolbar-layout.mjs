// The map's own controls never collide: at common window widths the brand, Undo / Redo / Scenarios, Build
// and the view buttons do not overlap one another, and no map marker (a bend, a label, a structure tag)
// is drawn over them. Plays D11 and the D3 motorway with a selected bend near the top-left corner too.
//   flock -s /tmp/trapla-browser.lock nice -n 10 node scripts/toolbar-layout.mjs [--out /tmp/trapla-toolbar]
// Exit 1 on any overlap.
import { mkdirSync, readFileSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const OUT = arg('--out', '/tmp/trapla-toolbar');
mkdirSync(OUT, { recursive: true });
const SIZES = [[1280, 720], [1280, 800], [1366, 768], [1400, 900], [1440, 900], [1600, 1000], [1920, 1080]];
let bad = 0;
const game = await startGame();
const { page } = game;
/** the boxes of the map's controls and of everything the overlay draws that lies under one */
const measure = () => page.evaluate(() => {
  const view = document.getElementById('view').getBoundingClientRect();
  const visible = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0' ? r : null; };
  const controls = [];
  const add = (name, el) => { const r = el && visible(el); if (r) controls.push({ name, r: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }); };
  add('brand', document.getElementById('brand'));
  for (const b of document.querySelectorAll('#editbar > *')) add(`editbar "${b.textContent.trim().split(/\s+/)[0]}"`, b);
  for (const b of document.querySelectorAll('#viewbar > *')) add(`viewbar "${b.textContent.trim().split(/\s+/)[0]}"`, b);
  for (const b of document.querySelectorAll('#view .route-bar > *')) add(`route bar "${b.textContent.trim().split(/\s+/)[0]}"`, b);
  add('photo note', document.getElementById('photo-note'));
  const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const clashes = [];
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++)
    if (hit(controls[i].r, controls[j].r) && controls[i].name.split(' ')[0] !== controls[j].name.split(' ')[0]) clashes.push(`${controls[i].name} × ${controls[j].name}`);
  // within one bar: neighbours never overlap (a bar that ran out of room)
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++)
    if (hit(controls[i].r, controls[j].r) && controls[i].name.split(' ')[0] === controls[j].name.split(' ')[0]) clashes.push(`${controls[i].name} × ${controls[j].name}`);
  for (const el of document.querySelectorAll('#overlay *')) {
    const r = visible(el);
    // (leaves only, and not the layers spanning the map: an SVG of crossing works, the contour layer)
    if (!r || el.children.length || (r.width > view.width / 2 && r.height > view.height / 2)) continue;
    const c = controls.find(c => hit(r, c.r));
    if (c) clashes.push(`map marker "${(el.className?.baseVal ?? el.className) || el.tagName}" "${el.textContent.trim().slice(0, 20)}" under ${c.name}`);
  }
  return { view: { width: view.width, height: view.height }, controls, clashes };
});
try {
  for (const [scenario, query, design] of [['d11', 'scenario=d11', 'scripts/best-design.json'], ['d3-motorway', 'scenario=d3&preset=d3-motorway', null]]) {
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await game.open(query);
      if (design) { await page.evaluate((d) => window.trapla.setDesign(d), JSON.parse(readFileSync(design, 'utf8')).design); }
      await game.idle(); await game.still();
      const m = await measure();
      const tag = `${scenario} ${w}×${h} (map ${Math.round(m.view.width)}×${Math.round(m.view.height)})`;
      if (m.clashes.length) { bad++; console.log('FAIL', tag, m.clashes.join('; ')); } else console.log('PASS', tag);
      await page.screenshot({ path: `${OUT}/${scenario}-${w}x${h}.png`, clip: { x: 0, y: 0, width: w, height: 140 } });
    }
  }
} finally { await game.close(); }
console.log(bad ? `${bad} layouts with overlaps` : 'no overlaps');
process.exit(bad ? 1 : 0);
