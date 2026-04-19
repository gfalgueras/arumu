#!/usr/bin/env bash
# Stop and remove all test containers and their volumes.
# Usage: bash docker/scripts/stop.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "$ROOT"

echo "==> Stopping and removing test containers..."
docker compose down --volumes --remove-orphans
echo "==> Done."
