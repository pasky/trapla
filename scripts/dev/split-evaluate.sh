#!/usr/bin/env bash
# The first four stages of evaluateRoute as named functions, by scripts/dev/stage.mjs (statements untouched;
# the diff is the four wrappers, ≈ 80 lines). Anchored on statements, not line numbers, so it can be run on
# whatever evaluate.ts looks like on the day. After it: npx tsc --noEmit, npx tsx scripts/exact.ts --compare
# <snapshot of the base>, npx tsx scripts/dev/interleave.ts <base checkout> <this checkout>.
# Dry run of 2026-11-16 on 6fb4a7b: 754 lines in four stages, 177 / 177 results identical, time ratio
# 0.98 (min) / 0.91 (median) under load. The closures engineer / finish / complete come next and need two
# hand steps first (docs/architecture-review.md, "Core engine").
set -euo pipefail
cd "$(dirname "$0")/../.."
F=src/core/evaluate.ts
line() { local n; n=$(grep -n -- "$1" "$F" | head -1 | cut -d: -f1); [ -n "$n" ] || { echo "anchor not found: $1" >&2; exit 1; }; echo "$n"; }
stage() { # first-line last-line function record
  node scripts/dev/stage.mjs extract "$F" evaluateRoute "$1" "$2" "$3" "$4" | grep -E "PROBLEM|REFUSED|extracted|returns" || true
  node scripts/dev/stage.mjs prune "$F" evaluateRoute
}
stage "$(line '^  const preview = !!opts.preview')" "$(( $(line '^  const mk = cat.markup;') - 1 ))" routeSetup setup
stage "$(line '^  const mk = cat.markup;')" "$(( $(line '^  let vpis: VPI\[\];') - 1 ))" routePrices prices
stage "$(line '^  let vpis: VPI\[\];')" "$(( $(line '^  const pc = opts.passCache;') - 1 ))" routeGradeLine solved
stage "$(line '^  const pc = opts.passCache;')" "$(( $(line '^  const engineer = ') - 1 ))" routeCaches caches
npx tsc --noEmit
