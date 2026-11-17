// Any script with the stretch-local crossing build checked (src/core/crossings-kept.ts): each later finish
// builds its crossings both ways, on the same inputs, and goes on with the whole route's; the differences are
// listed when the script ends (stderr), so its own output stays what it was.
//
//   npx tsx --import ./scripts/dev/local-retry-check.ts scripts/outcome-audit.ts --quiet --straight scripts/*-design.json --random 24
//   LOCAL_RETRY_LOG=/tmp/x.jsonl …   also appends every finish's report there
import { appendFileSync } from 'node:fs';
import { LOCAL_RETRY, type LocalBuildReport } from '../../src/core/crossings-kept';

const paths: Record<string, number> = {}, off: LocalBuildReport[] = [];
let built = 0, all = 0;
LOCAL_RETRY.check = r => {
  paths[r.path] = (paths[r.path] ?? 0) + 1;
  if (r.path === 'local') { built += r.subset; all += r.crossings; }
  if (r.differs?.length || r.issuesDiffer) off.push(r);
  if (process.env.LOCAL_RETRY_LOG) appendFileSync(process.env.LOCAL_RETRY_LOG, JSON.stringify(r) + '\n');
};
process.on('exit', () => {
  const count = Object.values(paths).reduce((a, b) => a + b, 0);
  console.error(`local-retry-check: ${count} finishes (${Object.entries(paths).map(([k, v]) => `${k} ${v}`).join(', ')}); local ones built ${built} of ${all} crossings; ${off.length} local builds differ from the whole route's`);
  for (const r of off) {
    console.error(`  ${r.core} / ${r.subset} / ${r.crossings} crossings built again / with context / in all, ${r.changed} stations changed${r.issuesDiffer ? '; issue list differs' : ''}`);
    for (const x of r.differs ?? []) console.error(`    ${x.key} km ${(x.s / 1000).toFixed(2)}, ${Math.round(x.d)} m from a change${x.core ? ' (built again)' : ''}: whole route ${x.whole}; local ${x.local}`);
  }
});
