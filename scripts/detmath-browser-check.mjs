// Cross-engine check (about:blank, no app, no GPU): src/core/detmath.ts must give identical bits in
// Chromium and Node; native Math drift is printed for comparison (research/27).
// node scripts/detmath-browser-check.mjs
import vm from 'node:vm';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
const bundle = await build({ entryPoints: ['src/core/detmath.ts'], bundle: true, format: 'iife', globalName: 'DM', write: false });
const src = bundle.outputFiles[0].text;
const ctx = {}; vm.createContext(ctx); vm.runInContext(src + ';this.DM=DM;', ctx);
const DM = ctx.DM;
let seed = 7; const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 2 ** 32; };
const fns = ['sin', 'cos', 'tan', 'atan', 'atan2', 'log10', 'log', 'exp', 'asin', 'acos', 'pow'];
const args = {};
for (const f of fns) {
  args[f] = [];
  for (let i = 0; i < 100000; i++) {
    const s = [1e-6, 0.01, 0.3, 0.7, 0.99, 1, 3, 30, 300, 3000][i % 10];
    if (f === 'atan2') args[f].push([(rnd() * 2 - 1) * s, (rnd() * 2 - 1) * [1, 1e3][i % 2]]);
    else if (/log/.test(f)) args[f].push([rnd() * s * 2]);
    else if (/^a(sin|cos)$/.test(f)) args[f].push([(rnd() * 2 - 1) * Math.min(1, s)]);
    else if (f === 'exp') args[f].push([(rnd() * 2 - 1) * Math.min(700, s)]);
    else args[f].push([(rnd() * 2 - 1) * s]);
  }
}
const powArgs = []; for (let i = 0; i < 100000; i++) powArgs.push([10, (rnd() * 200 - 50) / 10], [rnd() * 100, rnd() * 4 - 2]);
args.pow = powArgs;
const compute = (M, a) => Object.fromEntries(Object.entries(a).map(([f, l]) => [f, l.map(x => M[f](...x))]));
let failed = false;
const nodeDM = compute(DM, args), nodeMath = compute(Math, args), nodePow = powArgs.map(([a, b]) => a ** b);
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--disable-gpu'] });
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: src + ';window.DM=DM;' });
  const out = await page.evaluate(([a, p]) => {
    const compute = (M) => Object.fromEntries(Object.entries(a).map(([f, l]) => [f, l.map(x => M[f](...x))]));
    return { dm: compute(window.DM), math: compute(Math), pow: p.map(([x, y]) => x ** y) };
  }, [args, powArgs]);
  const diff = (A, B) => A.reduce((n, v, i) => n + (Object.is(v, B[i]) ? 0 : 1), 0);
  for (const f of fns) {
    const d = diff(out.dm[f], nodeDM[f]); failed ||= d > 0;
    console.log(f.padEnd(6), 'detmath chrome≠node:', d, ' native chrome≠node:', diff(out.math[f], nodeMath[f]), 'of', args[f].length);
  }
  void nodePow;
} finally { await browser.close(); }
if (failed) { console.log('FAIL: detmath differs between engines'); process.exitCode = 1; } else console.log('PASS detmath is identical in Chromium and Node');
