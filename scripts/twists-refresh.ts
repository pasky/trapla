// Twist references refreshed: a scheduled / manual job, not a merge gate (PLAN.md "Follow-ups").
//
//   npx tsx scripts/twists-refresh.ts [preset…] [--minutes 30] [--iters 600] [--seeds 1,2,3] [--dry]
//
// Re-checks every reference design in scripts/twists/<preset>/ against its twists and the goal under today's bills
// (scripts/twists-check.ts checkMission: its warnings, and references no longer VALID). Each one that no longer meets
// what it claims is searched again from itself (twists-check.ts --find, the same twists and the goal it claims), seed
// after seed until one meets it all or its share of the time is spent; a design found replaces the reference's design
// (its claims and purpose kept). What is still stale at the end is listed; exit 1 then. `--dry`: list only.
// Twist references are a developer's check that each twist can be met, never a game rule: the game offers a twist
// whatever its reference does (data/twists.ts), and nothing in src/ reads these files.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { checkMission, find, type Fixture, type Stale } from './twists-check';
import { MISSION_TWISTS } from '../src/core/data/twists';

const args = process.argv.slice(2), opt = (k: string) => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
const flags = new Set(['--minutes', '--iters', '--seeds']);
const presets = args.filter((a, i) => !a.startsWith('--') && !flags.has(args[i - 1]));
const minutes = Number(opt('--minutes') ?? 30), iters = Number(opt('--iters') ?? 600);
const seeds = (opt('--seeds') ?? '1,2,3').split(',').map(Number), dry = args.includes('--dry');
const deadline = performance.now() + minutes * 60e3;
const quiet = () => {};

const todo: { preset: string; s: Stale }[] = [];
for (const preset of presets.length ? presets : Object.keys(MISSION_TWISTS)) {
  const c = checkMission(preset, quiet);
  for (const f of c.failures) console.log(`${preset}: ✗ ${f}`);
  for (const s of c.stale) { todo.push({ preset, s }); console.log(`${preset}/${s.file}: stale (${s.why.join('; ').slice(0, 200)})`); }
}
console.log(`${todo.length} stale references${dry ? '' : `, ${minutes} min to search`}`);

const left: string[] = [];
for (let k = 0; k < todo.length; k++) {
  const { preset, s } = todo[k], path = `scripts/twists/${preset}/${s.file}`;
  if (dry) { left.push(path); continue; }
  const fx = JSON.parse(readFileSync(path, 'utf8')) as Fixture;
  // (an equal share of what time is left for each reference still to do)
  const until = performance.now() + (deadline - performance.now()) / (todo.length - k);
  const tmp = `${tmpdir()}/twists-refresh-${process.pid}-${preset}-${s.file}`;
  let found = false;
  for (const seed of seeds) {
    if (performance.now() >= until) break;
    console.log(`${path}: searching (seed ${seed}) for ${fx.meets.join(', ') || 'nothing'}${fx.goal ? ' and the goal' : ''}`);
    found = find(preset, fx.meets, !!fx.goal, path, iters, seed, tmp, { deadline: until, log: quiet });
    if (found) break;
  }
  if (found) {
    const design = (JSON.parse(readFileSync(tmp, 'utf8')) as Fixture).design;
    writeFileSync(path, JSON.stringify({ ...fx, design } satisfies Fixture, null, 1));
    // (what twists-check says of it now: the search's own verdict is the same check, so this only guards the write)
    const now = checkMission(preset, quiet);
    if (now.stale.some(x => x.file === s.file)) { writeFileSync(path, JSON.stringify(fx, null, 1)); left.push(path); console.log(`${path}: the design found does not check, kept the old one`); }
    else console.log(`${path}: refreshed`);
  } else { left.push(path); console.log(`${path}: not found in time, left as it was`); }
  rmSync(tmp, { force: true });
}
if (left.length) {
  console.log(`\nstill stale (list them under PLAN.md "Follow-ups"):\n${left.map(p => `  ${p}`).join('\n')}`);
  process.exitCode = 1;
}
