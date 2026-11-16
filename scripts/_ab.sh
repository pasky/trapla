#!/bin/bash
# interleaved A/B: min evaluate ms per design, A=/tmp/ce/main B=this tree
for r in 1 2 3; do
  for t in /tmp/ce/main /home/pasky/projects/trapla-agent-worktree-0001; do
    (cd $t && npx tsx scripts/_timing.ts scripts/*-design.json 2>&1 | awk -v t=$(basename $t) '{print t, $1, $2}')
    (cd $t && SCENARIO=d3 npx tsx scripts/_timing.ts /home/pasky/projects/trapla-agent-worktree-0001/scripts/scenarios/d3/d3-motorway.json 2>&1 | awk -v t=$(basename $t) '{print t, "d3m", $2}')
  done
done
