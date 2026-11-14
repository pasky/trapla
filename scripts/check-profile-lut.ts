// Differential check against an unoptimized worktree, without duplicating the solver in tests.
// npx tsx scripts/check-profile-lut.ts /tmp/trapla-perf-before/src/core/autoprofile.ts
import { deepStrictEqual } from 'node:assert';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { autoProfile } from '../src/core/autoprofile';
if (!process.argv[2]) throw new Error('Pass the baseline autoprofile.ts module path');
const before: typeof import('../src/core/autoprofile') = await import(pathToFileURL(resolve(process.argv[2])).href);
let seed = 12345;
const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const count = Number(process.env.CASES ?? 400);
for (let t = 0; t < count; t++) {
  const n = 150 + Math.floor(random() * 250), s = new Float64Array(n), g = new Float64Array(n);
  let z = 0, slope = 0;
  const amp = random() < 0.3 ? 6 : 1;
  for (let i = 0; i < n; i++) {
    s[i] = i * 10;
    slope = Math.max(-0.4, Math.min(0.4, slope + (random() - 0.5) * 0.05 * amp));
    z += slope * 10; g[i] = z;
  }
  const kinds = new Int8Array(n).fill(-1);
  if (random() < 0.5) {
    const a = Math.floor(random() * n), b = Math.min(n - 1, a + Math.floor(random() * 40)), k = Math.floor(random() * 3);
    for (let i = a; i <= b; i++) kinds[i] = k;
  }
  const classes = Uint8Array.from(s, (_, i) => Math.floor(i / 60) % 2);
  const minH = new Float64Array(n).fill(NaN);
  if (random() < 0.4) minH[Math.floor(random() * n)] = 6;
  const pins = random() < 0.4 ? [{ s: s[Math.floor(n / 2)], z: g[Math.floor(n / 2)] + (random() - 0.5) * 20 }] : undefined;
  const costFor = (mv: number) => (h: number, k = -1, c = 0) => k === 2 ? 4e5 : k === 1 ? 2e5 + 3e3 * Math.abs(h)
    : 1e3 + (h >= 0 ? 60 : 90 + mv) * h * h * (1 + c);
  const balance = random() < 0.4 ? { costFor, balanceOf: (v: unknown[], mv: number) => v.length * 100 - mv * 3,
    start: 10, lo: 0, hi: 100, tolerance: 1 } : undefined;
  const options = { maxGradient: 0.04 + random() * 0.05, minCrest: 3000, minSag: 2000, costPerM: costFor(10),
    structureKind: kinds, costClass: classes, costClassCount: 2, minH, pins, balance };
  deepStrictEqual(autoProfile(s, g, options), before.autoProfile(s, g, options), `seeded profile case ${t}`);
}
console.log(`PASS ${count} seeded profiles: exact costs, grades, pins and feasibility`);
