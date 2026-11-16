#!/bin/sh
# usage: qa2/chunk-gpu.sh <app-root> <outdir> — timed GPU session: exclusive lock, ≤ 10 min
ROOT=$1; OUT=$2
cd "$ROOT" && OUT=$OUT exec flock -x /tmp/trapla-browser.lock timeout -k 30 600 node qa2/drive.mjs --gpu
