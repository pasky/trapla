#!/usr/bin/env bash
# Copy a checked build (scripts/release.sh) to a web server's directory, pages last:
#   deploy/rsync.sh user@host:/var/www/trapla/
# 1. the content-hashed assets and packs, keeping the previous deploy's (a page loaded a minute ago still finds
#    its files), 2. the pages. Old hashed files stay until you prune them (`--prune`: after the new deploy has been
#    up for a day, delete what the current build does not have).
set -euo pipefail
cd "$(dirname "$0")/.."
target=${1:?usage: deploy/rsync.sh user@host:/path/ [--prune]}
[ -f dist/index.html ] || { echo "no dist/: run scripts/release.sh first" >&2; exit 1; }
rsync -av --checksum --exclude .git dist/assets dist/scenarios "$target"
rsync -av --checksum --exclude .git --exclude assets --exclude scenarios dist/ "$target"
if [ "${2:-}" = --prune ]; then rsync -av --checksum --delete --exclude .git dist/ "$target"; fi
