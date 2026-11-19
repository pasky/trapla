// Bit-exactness check of the 3D scene for render refactors (as scripts/exact.ts is for the evaluators): every mesh,
// line and point set of the map's world after a settled evaluation, hashed in full (each geometry's attributes with
// their layout and index, its object's name, place in the tree, transform, visibility, draw order and material kind;
// CPU-side data textures). Not covered: what is drawn on the GPU into render targets (the shared terrain mask), and
// uniforms. Cases: each mission with a saved design set on it, then edits (a bend moved, a bend added, a reroute
// shaped, back) so that a rebuild after a change is covered, not only a first build.
//
//   node scripts/scene-exact.mjs --out /tmp/scene-before.json [--root <older checkout>] [--only d3-full,d11]
//   node scripts/scene-exact.mjs --compare /tmp/scene-before.json
//
// Software GL is enough (nothing is timed); run it under the shared browser lock (AGENTS.md).
import { readFileSync, writeFileSync } from 'node:fs';
import { startGame } from './lib/browser.mjs';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1] ?? d; };
const out = arg('--out'), compare = arg('--compare'), root = arg('--root', process.cwd()), only = arg('--only')?.split(',');
if (!out === !compare) { console.error('usage: scene-exact.mjs --out file.json | --compare file.json [--root dir] [--only ids]'); process.exit(2); }

// [case id, scenario, preset or null, design file]
const CASES = [
  ['d11', 'd11', null, 'scripts/best-design.json'],
  ['d11-motorway', 'd11', 'd11-motorway', 'scripts/scenarios/d11/d11-motorway.json'],
  ['d3-0305', 'd3-0305', null, 'scripts/scenarios/d3-0305/default.json'],
  ['i35-full', 'i35-full', 'i35-full-road', 'scripts/scenarios/i35-full/i35-full-road.json'],
  ['d3-full', 'd3-full', null, 'scripts/scenarios/d3-full/default.json'],
].filter(([id]) => !only || only.includes(id));
if (!CASES.length) { console.error(`no case among ${only}`); process.exit(2); }

/** the world's digest (run in the page): one entry per drawn object, in tree order */
function digest() {
  const view = window.trapla.debugView();
  const h32 = (bytes) => { let h = 0x811c9dc5; for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
  const arr = (a) => a ? `${a.constructor.name}:${a.length}:${h32(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))}` : null;
  const entries = [];
  const textures = new Map();
  const walk = (o, path) => {
    const here = `${path}/${o.name || o.type}`;
    const e = { path: here, type: o.type, visible: o.visible, order: o.renderOrder, matrix: arr(new Float64Array(o.matrix.elements)) };
    if (o.geometry) {
      const g = o.geometry;
      // (an interleaved attribute: its offset and stride in the shared buffer, hashed once per buffer)
      e.attrs = Object.fromEntries(Object.entries(g.attributes).map(([k, a]) => [k, a.isInterleavedBufferAttribute
        ? `${a.itemSize}:${a.normalized}:@${a.offset}/${a.data.stride}:${arr(a.data.array)}` : `${a.itemSize}:${a.normalized}:${arr(a.array)}`]));
      e.index = g.index ? arr(g.index.array) : null;
      e.groups = JSON.stringify(g.groups); e.draw = JSON.stringify(g.drawRange);
      if (g.instanceCount !== undefined && g.instanceCount !== Infinity) e.instances = g.instanceCount;
    }
    if (o.instanceMatrix) e.instanceMatrix = arr(o.instanceMatrix.array);
    if (o.count !== undefined && o.isInstancedMesh) e.count = o.count;
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      e.material = ms.map((m) => `${m.type}:${m.visible}:${m.transparent}:${m.opacity}:${m.depthTest}:${m.side}`).join(',');
      for (const m of ms) for (const [k, u] of Object.entries(m.uniforms ?? {})) {
        const v = u?.value;
        if (v?.isDataTexture && v.image?.data && !textures.has(v)) textures.set(v, `${k}:${v.image.width}x${v.image.height}:${arr(v.image.data)}`);
      }
    }
    entries.push(e);
    for (const c of o.children) walk(c, here);
  };
  walk(view.world, '');
  return { entries, textures: [...textures.values()].sort() };
}

const game = await startGame({ root });
const result = {};
try {
  const { page } = game;
  for (const [id, scenario, preset, file] of CASES) {
    await game.open(`scenario=${scenario}${preset ? `&preset=${preset}` : ''}`);
    const design = JSON.parse(readFileSync(file, 'utf8')).design;
    await page.evaluate((d) => window.trapla.setDesign(d), design);
    await game.idle();
    result[`${id} start`] = await page.evaluate(digest);
    // a bend moved 40 m (the middle one), then a bend added on the road between two others
    const k = Math.floor(design.pis.length / 2);
    const moved = structuredClone(design); moved.pis[k] = { ...moved.pis[k], x: moved.pis[k].x + 40, y: moved.pis[k].y + 25 };
    await page.evaluate((d) => window.trapla.setDesign(d), moved);
    await game.idle();
    result[`${id} bend moved`] = await page.evaluate(digest);
    const added = structuredClone(moved), p = added.pis[k], q = added.pis[k + 1] ?? p;
    added.pis.splice(k + 1, 0, { x: (p.x + q.x) / 2 + 30, y: (p.y + q.y) / 2 - 20, r: null });
    await page.evaluate((d) => window.trapla.setDesign(d), added);
    await game.idle();
    result[`${id} bend added`] = await page.evaluate(digest);
    // the longest reroute shaped by a bend point off its middle
    const shaped = await page.evaluate(() => {
      const r = window.trapla.result(), d = window.trapla.getDesign();
      const c = r.crossings.filter((c) => (c.type === 'reconnection' || c.type === 'diversion') && !c.moved && c.geometry?.links?.some((l) => l.length > 6)
        && r.crossings.filter((x) => x.roadId === c.roadId).length === 1).sort((a, b) => (b.linkLength ?? 0) - (a.linkLength ?? 0))[0];
      if (!c) return null;
      const side = c.geometry.links.findIndex((l) => l.length > 6), link = c.geometry.links[side], m = link[Math.floor(link.length / 2)];
      const via = [[], []]; via[side] = [{ x: m.x + 15, y: m.y + 10 }];
      (d.crossingOverrides ??= []).push({ roadId: c.roadId, type: 'reconnection', via });
      return d;
    });
    if (shaped) {
      await page.evaluate((d) => window.trapla.setDesign(d), shaped);
      await game.idle();
      result[`${id} reroute shaped`] = await page.evaluate(digest);
    }
    // and back to the start (a rebuild to what was there before)
    await page.evaluate((d) => window.trapla.setDesign(d), design);
    await game.idle();
    result[`${id} back`] = await page.evaluate(digest);
    console.log(`${id}: ${Object.keys(result).filter((k) => k.startsWith(`${id} `)).length} scenes, ${result[`${id} start`].entries.length} objects`);
  }
} finally { await game.close(); }

if (out) { writeFileSync(out, JSON.stringify(result)); console.log(`${Object.keys(result).length} scenes written to ${out}`); }
else {
  const before = JSON.parse(readFileSync(compare, 'utf8'));
  let diffs = 0;
  for (const name of Object.keys(result)) {
    const a = before[name], b = result[name];
    if (!a) { diffs++; console.log(`DIFF ${name}: not in the snapshot`); continue; }
    const key = (e) => JSON.stringify(e);
    const was = a.entries.map(key), now = b.entries.map(key);
    const lines = [];
    if (was.length !== now.length) lines.push(`objects ${was.length} → ${now.length}`);
    for (let i = 0; i < Math.max(was.length, now.length) && lines.length < 6; i++) if (was[i] !== now[i]) lines.push(`#${i} ${a.entries[i]?.path ?? '—'} ≠ ${b.entries[i]?.path ?? '—'}: ${diffKeys(a.entries[i], b.entries[i])}`);
    if (JSON.stringify(a.textures) !== JSON.stringify(b.textures)) lines.push('data textures differ');
    if (lines.length) { diffs++; console.log(`DIFF ${name}\n    ${lines.join('\n    ')}`); }
  }
  // (a scene of these cases the snapshot has and this run did not make, e.g. a reroute no longer shaped)
  for (const name of Object.keys(before)) if (!(name in result) && CASES.some(([id]) => name.startsWith(`${id} `))) { diffs++; console.log(`DIFF ${name}: not made`); }
  console.log(diffs ? `${diffs} scenes differ` : `identical: ${Object.keys(result).length} scenes`);
  process.exit(diffs ? 1 : 0);
}
function diffKeys(a, b) {
  if (!a || !b) return 'missing';
  return Object.keys({ ...a, ...b }).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => k === 'attrs'
    ? `attrs(${Object.keys({ ...a.attrs, ...b.attrs }).filter((n) => a.attrs?.[n] !== b.attrs?.[n]).join(',')})` : k).join(',');
}
