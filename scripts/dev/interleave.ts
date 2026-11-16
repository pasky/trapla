// Interleaved evaluate timing of two checkouts in one process (docs/evaluate-performance.md):
//   npx tsx scripts/dev/interleave.ts <checkout A> <checkout B> [rounds]      (absolute paths; A = the base)
// The five saved D11 designs, both evaluators loaded and warm, alternating (order swapped every round), so
// host load hits both alike. Prints min / median per design, the ratio of the sums and the CPU time.
import { readFileSync } from 'node:fs';
const [rootA, rootB, roundsArg] = process.argv.slice(2);
const rounds = Number(roundsArg ?? 12);
async function load(root: string) {
  const { loadPack } = await import(`${root}/scripts/loadpack.ts`);
  const { evaluate } = await import(`${root}/src/core/evaluate.ts`);
  const pack = loadPack(`${root}/public/scenarios/d11`);
  const { meta, terrain, scenario, buildings, roads, junctions } = pack;
  const ctx = { terrain, scenario, buildings, roads, junctions, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
  return (d: unknown) => evaluate(ctx, d);
}
const A = await load(rootA), B = await load(rootB);
const names = ['best', 'demo', 'direct-80', 'direct-90', 'town-centre'];
const designs = names.map(n => JSON.parse(readFileSync(`${rootA}/scripts/${n}-design.json`, 'utf8')).design);
const cpu = [0, 0]; // process CPU time: steadier than wall time on a loaded host (includes GC threads)
const times: Record<string, number[][]> = Object.fromEntries(names.map(n => [n, [[], []]]));
for (const d of designs) { A(d); B(d); A(d); B(d); }
for (let r = 0; r < rounds; r++) for (let k = 0; k < names.length; k++) for (const side of r % 2 ? [1, 0] : [0, 1]) {
  const t = performance.now(), c = process.cpuUsage(); (side ? B : A)(designs[k]); times[names[k]][side].push(performance.now() - t);
  const used = process.cpuUsage(c); cpu[side] += (used.user + used.system) / 1000;
}
const stat = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return [s[0], s[s.length >> 1]]; };
let sums = [0, 0, 0, 0];
for (const n of names) {
  const [a0, a1] = stat(times[n][0]), [b0, b1] = stat(times[n][1]);
  sums = [sums[0] + a0, sums[1] + a1, sums[2] + b0, sums[3] + b1];
  console.log(`${n.padEnd(12)} A ${a0.toFixed(1)} / ${a1.toFixed(1)}   B ${b0.toFixed(1)} / ${b1.toFixed(1)}   (min / median ms)`);
}
console.log(`sum          A ${sums[0].toFixed(0)} / ${sums[1].toFixed(0)}   B ${sums[2].toFixed(0)} / ${sums[3].toFixed(0)}   B/A min ${(sums[2] / sums[0]).toFixed(3)}, median ${(sums[3] / sums[1]).toFixed(3)}`);
console.log(`cpu          A ${(cpu[0] / rounds).toFixed(0)}   B ${(cpu[1] / rounds).toFixed(0)}   ms per round   B/A ${(cpu[1] / cpu[0]).toFixed(3)}`);
