#!/bin/bash
# Build RPM locally (requires Linux + fakeroot + rpm tools).
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

pnpm install --frozen-lockfile
pnpm build
npx electron-builder --linux rpm

RPM_FILE=$(find release/ -name "*.rpm" | head -1)
[[ -z "$RPM_FILE" ]] && { echo "ERROR: No RPM in release/" >&2; exit 1; }
echo "Built: $RPM_FILE"
