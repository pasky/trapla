#!/usr/bin/env bash
# The quality gates of AGENTS.md as one command, with the browser / GPU lock protocol built in.
#
#   scripts/gates.sh quick                  while iterating: tsc, vitest, frozen bills, one drag mode
#   scripts/gates.sh full                   once per merge: everything below (smoke / playtest / toolbar also on
#                                           the built site, dist/ from the build gate: scripts/release.sh)
#   scripts/gates.sh full --no-browser      the Node gates only (no Chromium, no lock)
#   scripts/gates.sh full --only smoke,drag-pin      just these gates
#   scripts/gates.sh full --skip playtest            all but these
#   scripts/gates.sh full --exact /tmp/before.json   also: results bit-identical to that snapshot
#                                                    (npx tsx scripts/exact.ts --out /tmp/before.json on the base)
#   scripts/gates.sh full --jobs 4          at most 4 Node gates at a time (default: nproc/2, fewer if memory is short)
#   scripts/gates.sh list                   the gates and their commands
#
# Each gate's output goes to $GATES_LOG/<gate>.log (default /tmp/trapla-gates-<branch>); the summary says
# PASS / FAIL and the time taken; exit 1 if any gate failed. Order: the timed runs (drag-perf) one after another,
# alone on our side, under the exclusive browser lock; then vitest alone (its tests time out beside the other
# gates); then the other Node gates in parallel (the longest first); then
# the untimed browser runs together, each on its own port, which wait for queued timed runs, then take the
# shared lock under nice (the protocol in AGENTS.md; beside our Node gates nice starved them and they flaked).
# A timed or browser run is run again once if it fails while the host is loaded (load > 6). The outcome audit
# never fails the run: its flags are for reading.
set -u
cd "$(dirname "$0")/.."

LOCK=${TRAPLA_BROWSER_LOCK:-/tmp/trapla-browser.lock}
# the browser scripts start at PORT (the next free one if it is taken): one per checkout, 10 apart per browser gate
export PORT=${PORT:-$((5300 + $(pwd | cksum | cut -d' ' -f1) % 600))}
PACKS="d3 d3-0301 d3-0302 d3-0303 d3-0304 d3-0305 d3-full d35 d35-full i16-nova-paka i46-sternberk i35-turnov i35-rovensko i35-jicin i35-full"
branch=$(git rev-parse --abbrev-ref HEAD | tr '/' '-')
log=${GATES_LOG:-/tmp/trapla-gates-$branch}

# name | kind (node; alone: a Node gate on its own, its tests time out on a loaded host; timed; browser) | set (quick, full) | command
# (the whole I/35's road drag is between bends 20 and 21: between the middle bends 19 and 20 the press lands on a crossed
# road's works and selects that crossing)
gates() {
  cat <<EOF
tsc|node|quick|npx tsc --noEmit
vitest|alone|quick|npx vitest run
eval-regression|node|quick|npx tsx scripts/eval-regression.ts
drag-bend|timed|quick|node scripts/drag-perf.mjs --gpu --check --mode bend
build|node|full|scripts/release.sh --no-browser
bench|node|full|npx tsx scripts/bench.ts --check scripts/*.json
edit-locality|node|full|npx tsx scripts/edit-locality.ts
straighten|node|full|npx tsx scripts/straighten-audit.ts d3-motorway d11 d11-best d11-town-centre
choice-audit|node|full|npx tsx scripts/choice-audit.ts
outcome-audit|node|full|npx tsx scripts/outcome-audit.ts --quiet --straight scripts/*-design.json --random 24
local-retry|node|full|npx tsx scripts/local-retry-report.ts
vc-overlap|node|full|npx tsx scripts/vc-overlap-audit.ts
bridge-ends|node|full|npx tsx scripts/bridge-ends-audit.ts
$(for p in $PACKS; do echo "scenario-$p|node|full|env SCENARIO=$p node --max-old-space-size=2048 --import tsx scripts/scenarios/check.ts"; done)
scenario-d11-motorway|node|full|env SCENARIO=d11 PRESET=d11-motorway node --max-old-space-size=2048 --import tsx scripts/scenarios/check.ts
$(for p in i35-turnov i35-rovensko i35-jicin i35-full; do echo "scenario-$p-road|node|full|env SCENARIO=$p PRESET=$p-road node --max-old-space-size=2048 --import tsx scripts/scenarios/check.ts"; done)
pipeline|node|full|uv run --with numpy --with shapely --with pillow python -m unittest discover -s pipeline -p 'test_*.py'
smoke|browser|full|PORT=\$((PORT + 10)) node scripts/smoke.mjs
playtest|browser|full|PORT=\$((PORT + 20)) OUT=$log/playtest-shots node scripts/playtest.mjs
toolbar|browser|full|PORT=\$((PORT + 30)) node scripts/toolbar-layout.mjs --out $log/toolbar-shots
smoke-dist|browser|full|DIST=dist PORT=\$((PORT + 40)) node scripts/smoke.mjs
playtest-dist|browser|full|DIST=dist PORT=\$((PORT + 50)) OUT=$log/playtest-dist-shots node scripts/playtest.mjs
toolbar-dist|browser|full|DIST=dist PORT=\$((PORT + 60)) node scripts/toolbar-layout.mjs --out $log/toolbar-dist-shots
start-screen|browser|full|DIST=dist PORT=\$((PORT + 70)) node scripts/release-shots.mjs --check
$(for m in road radius pin vpi link; do echo "drag-$m|timed|full|node scripts/drag-perf.mjs --gpu --check --mode $m"; done)
$(for m in road link; do echo "drag-d11-motorway-$m|timed|full|node scripts/drag-perf.mjs --gpu --check --scenario d11 --preset d11-motorway --mode $m"; done)
$(for m in bend road link; do echo "drag-i35-full-$m|timed|full|node scripts/drag-perf.mjs --gpu --check --scenario i35-full --preset i35-full-road --mode $m$([ $m = road ] && echo ' --bend 20')"; done)
EOF
}

mode=${1:-}; [ $# -gt 0 ] && shift
only=""; skip=""; browser=1; exact=""; jobs=""
while [ $# -gt 0 ]; do
  case "$1" in
    --only) only=",$2,"; shift 2 ;;
    --skip) skip=",$2,"; shift 2 ;;
    --no-browser) browser=0; shift ;;
    --exact) exact=$2; shift 2 ;;
    --jobs) jobs=$2; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
case "$mode" in
  list) gates | awk -F'|' '{ printf "%-24s %-8s %-6s %s\n", $1, $2, $3, $4 }'; exit 0 ;;
  quick|full) ;;
  *) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac

# Node gates at a time: half the cores, and ≈ 3 GB of available memory each (a whole-D3 pack is ≈ 0.5 GB of heap
# per process; vitest and the scenario checks run several)
if [ -z "$jobs" ]; then
  jobs=$(( $(nproc) / 2 ))
  mem=$(awk '/MemAvailable/ { print int($2 / 3145728) }' /proc/meminfo)
  [ "$mem" -lt "$jobs" ] && jobs=$mem
  [ "$jobs" -lt 1 ] && jobs=1
fi

mkdir -p "$log"
# stopped: our gates go too (only ours: `kill 0` would also take a caller's wrapper shell sharing our group)
killtree() { local p; for p in $(pgrep -P "$1"); do killtree "$p"; kill "$p"; done; }
trap 'trap - INT TERM; echo "gates: stopped by a signal" >&2; killtree $$; exit 130' INT TERM

finish() { # name status took [seconds waited for the lock]: the gate's line, kept for the summary
  local name=$1 status=$2 took=$3 note="" line
  [ "${4:-0}" -gt 0 ] && note="  (${4}s of it waiting for the lock)"
  [ "$name" = outcome-audit ] && note+="  $(grep -o '^## Flags ([0-9]*)' "$log/$name.log" | tr -d '#' | xargs): for reading, in $log/$name.log"
  if [ "$status" -eq 0 ]; then line=$(printf 'PASS %-24s %4ss%s' "$name" "$took" "$note")
  else line=$(printf 'FAIL %-24s %4ss  see %s' "$name" "$took" "$log/$name.log"); fi
  echo "$line" >"$log/$name.result"
  echo "$line"
}

run() { # name kind command
  local name=$1 kind=$2 cmd=$3 start=$SECONDS status
  case "$kind" in
    node|alone) bash -c "$cmd" >"$log/$name.log" 2>&1; status=$? ;;
    timed)
      flock -x "$LOCK" bash -c "[ -f $log/$name.locked ] || date +%s >$log/$name.locked; $cmd" >"$log/$name.log" 2>&1; status=$?
      if [ $status -ne 0 ] && awk '{ exit !($1 > 6) }' /proc/loadavg; then
        echo "(missed a budget under load $(cut -d' ' -f1 /proc/loadavg): once more)" >>"$log/$name.log"
        sleep 20; flock -x "$LOCK" bash -c "$cmd" >>"$log/$name.log" 2>&1; status=$?
      fi ;;
    browser)
      while pgrep -f "^flock -x" >/dev/null; do sleep 10; done
      flock -s "$LOCK" nice -n 10 bash -c "$cmd" >"$log/$name.log" 2>&1; status=$?
      # (they play in real time: on a loaded host a 6 s toast can be gone before the script clicks it)
      if [ $status -ne 0 ] && awk '{ exit !($1 > 6) }' /proc/loadavg; then
        mv "$log/$name.log" "$log/$name.first.log"; sleep 20
        flock -s "$LOCK" nice -n 10 bash -c "$cmd" >"$log/$name.log" 2>&1; status=$?
        [ $status -eq 0 ] && echo "(failed once under load, passed the second time: $log/$name.first.log)" >>"$log/$name.log"
      fi ;;
  esac
  local waited=0
  [ -f "$log/$name.locked" ] && waited=$(( $(cat "$log/$name.locked") - $(date +%s) + SECONDS - start )) && rm -f "$log/$name.locked"
  finish "$name" $status $((SECONDS - start)) $waited
}

# the selected gates, in the table's order (the summary's)
order=(); timed=(); alone=(); browsers=(); nodes=()
declare -A cmds
while IFS='|' read -r name kind set cmd; do
  [ -z "$name" ] && continue
  [ "$mode" = quick ] && [ "$set" != quick ] && continue
  [ -n "$only" ] && [[ "$only" != *",$name,"* ]] && continue
  [ -n "$skip" ] && [[ "$skip" == *",$name,"* ]] && continue
  [ $browser -eq 0 ] && [ "$kind" != node ] && [ "$kind" != alone ] && continue
  order+=("$name"); cmds[$name]=$cmd
  case "$kind" in timed) timed+=("$name") ;; alone) alone+=("$name") ;; browser) browsers+=("$name") ;; node) nodes+=("$name") ;; esac
done < <(gates)
if [ -n "$exact" ]; then order+=(exact); cmds[exact]="npx tsx scripts/exact.ts --compare $exact"; nodes+=(exact); fi

# the Node gates longest first (their times in the last run; new ones first of all)
if [ ${#nodes[@]} -gt 0 ]; then
  mapfile -t nodes < <(for name in "${nodes[@]}"; do
    took=$(awk '{ print $3 + 0 }' "$log/$name.result" 2>/dev/null)
    echo "${took:-100000} $name"; done | sort -rn -k1,1 -s | cut -d' ' -f2)
fi
for name in "${order[@]}"; do rm -f "$log/$name.result" "$log/$name.locked"; done

# 1. timed runs, one after another, before anything of ours loads the host
for name in "${timed[@]}"; do run "$name" timed "${cmds[$name]}"; done

# 2. the Node gates, those that need the host alone first, then the others `jobs` at a time
for name in "${alone[@]}"; do run "$name" alone "${cmds[$name]}"; done
[ ${#nodes[@]} -gt 0 ] && echo "(${#nodes[@]} Node gates, $jobs at a time)"
running=()
for name in "${nodes[@]}"; do
  while [ ${#running[@]} -ge "$jobs" ]; do
    wait -n -p done_pid "${running[@]}"
    keep=(); for pid in "${running[@]}"; do [ "$pid" != "$done_pid" ] && keep+=("$pid"); done; running=("${keep[@]}")
  done
  run "$name" node "${cmds[$name]}" &
  running+=($!)
done
wait

# 3. the untimed browser runs together: on the dev server, then on the built site (dist/, from the build gate)
for name in "${browsers[@]}"; do [[ "${cmds[$name]}" == DIST=* ]] || run "$name" browser "${cmds[$name]}" & done
wait
for name in "${browsers[@]}"; do [[ "${cmds[$name]}" == DIST=* ]] && run "$name" browser "${cmds[$name]}" & done
wait

echo
echo "== gates ($mode) on $branch @ $(git rev-parse --short HEAD)$(git diff --quiet HEAD || echo ' + uncommitted changes'): logs in $log"
failed=0
for name in "${order[@]}"; do
  if [ -f "$log/$name.result" ]; then cat "$log/$name.result"; grep -q '^PASS' "$log/$name.result" || failed=1
  else printf 'FAIL %-24s  (no result)\n' "$name"; failed=1; fi
done
exit $failed
