#!/usr/bin/env bash
# Publish dist/ to GitHub Pages (https://pasky.github.io/trapla/) as a one-commit `gh-pages` branch.
#
#   deploy/gh-pages.sh            scripts/release.sh (build + browser checks on the built site), then publish
#   deploy/gh-pages.sh --no-check publish the dist/ already built
#
# GitHub Pages caches everything for 10 minutes (no custom headers), so a visitor's cached page may still ask for
# the previous build's hashed files: those are kept alongside (listed in .build-files), older ones dropped.
# The branch is force-pushed, so the packs never pile up in the history.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=${TRAPLA_PAGES_REPO:-https://github.com/pasky/trapla.git}
[ "${1:-}" = --no-check ] || scripts/release.sh
[ -f dist/index.html ] || { echo "no dist/: run scripts/release.sh first" >&2; exit 1; }

site=$(mktemp -d /tmp/trapla-pages.XXXXXX)
old=$(mktemp -d /tmp/trapla-pages-old.XXXXXX)
trap 'rm -rf "$site" "$old"' EXIT

# the previous build's files (only those it listed as its own)
if git clone -q --depth 1 --branch gh-pages "$REPO" "$old" 2>/dev/null && [ -f "$old/.build-files" ]; then
  (cd "$old" && while IFS= read -r f; do [ -f "$f" ] && { mkdir -p "$site/$(dirname "$f")"; cp -a "$f" "$site/$f"; }; done < .build-files)
fi
cp -a dist/. "$site/"
rm -rf "$site/.git"
(cd dist && find . -type f ! -path './.git/*' | sed 's|^\./||' | sort) > "$site/.build-files"
touch "$site/.nojekyll"

cd "$site"
git init -q -b gh-pages
git add -A
git commit -qm "site from $(git -C "$OLDPWD" rev-parse --short HEAD)"
git push -q -f "$REPO" gh-pages
echo "pushed; Pages rebuilds in ≈ 1 min: https://pasky.github.io/trapla/"
