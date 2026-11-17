#!/bin/sh
# usage: qa3/chunk.sh <app-root> <outdir>  — waits for queued exclusive runs, then holds the shared lock for ≤ 20 min
ROOT=$1; OUT=$2
while pgrep -f "^flock -x" >/dev/null; do sleep 20; done
cd "$ROOT" && OUT=$OUT exec flock -s /tmp/trapla-browser.lock timeout -k 30 1200 nice -n 10 node qa3/drive.mjs
