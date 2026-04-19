#!/usr/bin/env bash
# Start all test servers and wait until they are healthy.
# Usage: bash docker/scripts/start.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "$ROOT"

echo "==> Starting test containers..."
docker compose up -d

echo "==> Waiting for MySQL, PostgreSQL, SQL Server to become healthy..."
docker compose up -d --wait --wait-timeout 120 mysql postgres sqlserver 2>/dev/null || {
  # Fallback: poll manually (older docker compose without --wait)
  for SERVICE in mysql postgres sqlserver; do
    echo "  Polling $SERVICE..."
    for i in $(seq 1 60); do
      STATUS=$(docker compose ps "$SERVICE" --format "{{.Health}}" 2>/dev/null || echo "unknown")
      if [[ "$STATUS" == "healthy" ]]; then
        echo "  $SERVICE is healthy."
        break
      fi
      sleep 3
    done
  done
}

echo "==> Waiting for Oracle to become healthy (this can take 2-3 min)..."
docker compose up -d --wait --wait-timeout 360 oracle 2>/dev/null || {
  for i in $(seq 1 72); do
    STATUS=$(docker compose ps oracle --format "{{.Health}}" 2>/dev/null || echo "unknown")
    if [[ "$STATUS" == "healthy" ]]; then
      echo "  Oracle is healthy."
      break
    fi
    echo "  Oracle not ready yet (attempt $i/72)..."
    sleep 5
  done
}

echo "==> All services started."
docker compose ps
