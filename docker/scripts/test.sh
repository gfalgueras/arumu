#!/usr/bin/env bash
# Start test servers, run driver integration tests, then leave containers running.
# Pass --down to stop containers afterwards.
# Usage:
#   bash docker/scripts/test.sh           # run tests, leave containers up
#   bash docker/scripts/test.sh --down    # run tests, stop containers after
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "$ROOT"

STOP_AFTER=0
for arg in "$@"; do
  [[ "$arg" == "--down" ]] && STOP_AFTER=1
done

# ── Start servers ─────────────────────────────────────────────────────────
bash docker/scripts/start.sh

# ── Run tests ─────────────────────────────────────────────────────────────
echo ""
echo "==> Running driver integration tests..."
EXIT_CODE=0
pnpm test:integration || EXIT_CODE=$?

# ── Optionally stop ───────────────────────────────────────────────────────
if [[ "$STOP_AFTER" == "1" ]]; then
  echo ""
  bash docker/scripts/stop.sh
fi

echo ""
if [[ "$EXIT_CODE" == "0" ]]; then
  echo "==> Tests PASSED."
else
  echo "==> Tests FAILED (exit code $EXIT_CODE)."
fi

exit $EXIT_CODE
