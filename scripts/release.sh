#!/usr/bin/env bash
# Build the static site and check it the way a visitor gets it: dist/ served by a plain static server (no Vite)
# under a sub-path, then the browser checks against that. Publishing is up to you (docs/deploy.md).
#
#   scripts/release.sh                build, check dist/, smoke + playtest + toolbar on the built site, and a smoke
#                                     with *.gz sent as Content-Encoding: gzip
#   scripts/release.sh --no-browser   build and check dist/ only
#   scripts/release.sh --serve        build, check, then serve dist/ at http://127.0.0.1:4173/trapla/ (Ctrl+C stops)
#
# Needs public/scenarios/ (the packs, `npm run data`). Browser runs take the shared browser lock under nice (AGENTS.md).
set -euo pipefail
cd "$(dirname "$0")/.."

browser=1; serve=0
for a in "$@"; do
  case "$a" in
    --no-browser) browser=0 ;;
    --serve) serve=1; browser=0 ;;
    *) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
  esac
done

LOCK=${TRAPLA_BROWSER_LOCK:-/tmp/trapla-browser.lock}
export PORT=${PORT:-$((5700 + $(pwd | cksum | cut -d' ' -f1) % 200))}
log=${RELEASE_LOG:-/tmp/trapla-release-$(git rev-parse --abbrev-ref HEAD | tr '/' '-')}
mkdir -p "$log"

echo "== build"
npm run build >"$log/build.log" 2>&1 || { tail -30 "$log/build.log"; exit 1; }
echo "== check dist/"
node scripts/release-check.mjs dist

if [ $serve -eq 1 ]; then exec node scripts/static-serve.mjs --dir dist --port 4173 --base /trapla/; fi
[ $browser -eq 1 ] || exit 0

status=0
browser_run() { # name command…: on the built site, under the shared lock
  local name=$1; shift
  while pgrep -f "^flock -x" >/dev/null; do sleep 10; done
  if DIST=dist flock -s "$LOCK" nice -n 10 "$@" >"$log/$name.log" 2>&1; then echo "PASS $name"
  else echo "FAIL $name  see $log/$name.log"; status=1; fi
}
echo "== on the built site (static server, /trapla/)"
browser_run smoke env PORT=$((PORT + 10)) node scripts/smoke.mjs
browser_run smoke-gz-encoded env PORT=$((PORT + 15)) GZ_ENCODED=1 node scripts/smoke.mjs
browser_run playtest env PORT=$((PORT + 20)) OUT="$log/playtest-shots" node scripts/playtest.mjs
browser_run toolbar env PORT=$((PORT + 30)) node scripts/toolbar-layout.mjs --out "$log/toolbar-shots"
browser_run start-screen env PORT=$((PORT + 40)) node scripts/release-shots.mjs --check
exit $status
