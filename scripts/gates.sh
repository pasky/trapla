#!/usr/bin/env bash
# The quality gates of AGENTS.md as one command, with the browser / GPU lock protocol built in.
#
#   scripts/gates.sh quick                  while iterating: tsc, vitest, frozen bills, one drag mode
#   scripts/gates.sh full                   once per merge: everything below
#   scripts/gates.sh full --no-browser      the Node gates only (no Chromium, no lock)
#   scripts/gates.sh full --only smoke,drag-pin      just these gates
#   scripts/gates.sh full --skip playtest            all but these
#   scripts/gates.sh full --exact /tmp/before.json   also: results bit-identical to that snapshot
#                                                    (npx tsx scripts/exact.ts --out /tmp/before.json on the base)
#   scripts/gates.sh list                   the gates and their commands
#
# Each gate's output goes to $GATES_LOG/<gate>.log (default /tmp/trapla-gates-<branch>); the summary says
# PASS / FAIL and the time taken; exit 1 if any gate failed. Timed runs (drag-perf) take the exclusive
# browser lock; untimed browser runs wait for queued timed runs, then take the shared lock under nice (the
# protocol in AGENTS.md). Either is run again once if it fails while the host is loaded (load > 6).
# The outcome audit never fails the run: its flags are for reading (it prints how many).
set -u
cd "$(dirname "$0")/.."

LOCK=${TRAPLA_BROWSER_LOCK:-/tmp/trapla-browser.lock}
# the browser scripts start at PORT (the next free one if it is taken): one per checkout
export PORT=${PORT:-$((5300 + $(pwd | cksum | cut -d' ' -f1) % 600))}
PACKS="d3 d3-0301 d3-0302 d3-0303 d3-0304 d3-0305 d3-full d35 d35-full i16-nova-paka"

# name | kind (node, timed, browser) | set (quick, full) | command
gates() {
  cat <<EOF
tsc|node|quick|npx tsc --noEmit
vitest|node|quick|npx vitest run
eval-regression|node|quick|npx tsx scripts/eval-regression.ts
drag-bend|timed|quick|node scripts/drag-perf.mjs --gpu --check --mode bend
build|node|full|npm run build
bench|node|full|npx tsx scripts/bench.ts --check scripts/*.json
edit-locality|node|full|npx tsx scripts/edit-locality.ts
straighten|node|full|npx tsx scripts/straighten-audit.ts d3-motorway d11 d11-best d11-town-centre
outcome-audit|node|full|npx tsx scripts/outcome-audit.ts --quiet --straight scripts/*-design.json --random 24
$(for p in $PACKS; do echo "scenario-$p|node|full|env SCENARIO=$p node --max-old-space-size=2048 --import tsx scripts/scenarios/check.ts"; done)
pipeline|node|full|uv run --with numpy --with shapely --with pillow python -m unittest discover -s pipeline -p 'test_*.py'
smoke|browser|full|node scripts/smoke.mjs
playtest|browser|full|node scripts/playtest.mjs
$(for m in road radius pin vpi link; do echo "drag-$m|timed|full|node scripts/drag-perf.mjs --gpu --check --mode $m"; done)
EOF
}

mode=${1:-}; [ $# -gt 0 ] && shift
only=""; skip=""; browser=1; exact=""
while [ $# -gt 0 ]; do
  case "$1" in
    --only) only=",$2,"; shift 2 ;;
    --skip) skip=",$2,"; shift 2 ;;
    --no-browser) browser=0; shift ;;
    --exact) exact=$2; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
case "$mode" in
  list) gates | awk -F'|' '{ printf "%-24s %-8s %-6s %s\n", $1, $2, $3, $4 }'; exit 0 ;;
  quick|full) ;;
  *) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac

branch=$(git rev-parse --abbrev-ref HEAD | tr '/' '-')
log=${GATES_LOG:-/tmp/trapla-gates-$branch}
mkdir -p "$log"
failed=0; summary=""

run() { # name kind command
  local name=$1 kind=$2 cmd=$3 start=$SECONDS status
  case "$kind" in
    node) bash -c "$cmd" >"$log/$name.log" 2>&1; status=$? ;;
    timed)
      flock -x "$LOCK" bash -c "$cmd" >"$log/$name.log" 2>&1; status=$?
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
  local took=$((SECONDS - start)) note=""
  [ "$name" = outcome-audit ] && note="  $(grep -o '^## Flags ([0-9]*)' "$log/$name.log" | tr -d '#' | xargs): for reading, in $log/$name.log"
  if [ $status -eq 0 ]; then summary+=$(printf 'PASS %-24s %4ss%s' "$name" "$took" "$note")$'\n'
  else summary+=$(printf 'FAIL %-24s %4ss  see %s' "$name" "$took" "$log/$name.log")$'\n'; failed=1; fi
  printf '%s %-24s %4ss%s\n' "$([ $status -eq 0 ] && echo PASS || echo FAIL)" "$name" "$took" "$note"
}

while IFS='|' read -r name kind set cmd; do
  [ -z "$name" ] && continue
  [ "$mode" = quick ] && [ "$set" != quick ] && continue
  [ -n "$only" ] && [[ "$only" != *",$name,"* ]] && continue
  [ -n "$skip" ] && [[ "$skip" == *",$name,"* ]] && continue
  [ $browser -eq 0 ] && [ "$kind" != node ] && continue
  run "$name" "$kind" "$cmd"
done < <(gates)
if [ -n "$exact" ]; then run exact node "npx tsx scripts/exact.ts --compare $exact"; fi

echo
echo "== gates ($mode) on $branch @ $(git rev-parse --short HEAD)$(git diff --quiet HEAD || echo ' + uncommitted changes'): logs in $log"
printf '%s' "$summary"
exit $failed
