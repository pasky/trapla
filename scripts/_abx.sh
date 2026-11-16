#!/bin/bash
# crossing-step ms (sum of phases), min over rounds, main vs this tree
for r in 1 2 3; do for t in /tmp/ce/main /home/pasky/projects/trapla-agent-worktree-0001; do
 (cd $t && npx tsx scripts/_prof.ts scripts/*-design.json 2>/dev/null | awk -v t=$(basename $t) '{s=0; for(i=2;i<=NF;i++) if ($i ~ /^(first|reconsider|join|moved|final)\.ms$/) {v=$(i+1); gsub(",","",v); s+=v}; print t, $1, s}')
done; done | awk '{k=$1" "$2; if(!(k in m) || $3<m[k]) m[k]=$3} END {for (k in m) print k, m[k]}' | sort -k2
