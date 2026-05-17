# Full Fedora smoke test using Docker. Requires Docker Desktop running.
# Usage: .\scripts\smoke-test-fedora.ps1
param(
    [string]$RpmPath = ""
)

$ErrorActionPreference = "Stop"

# Find RPM - use provided path or latest in release/
if (-not $RpmPath) {
    $RpmPath = Get-ChildItem "release" -Filter "*.rpm" -Recurse | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}

if (-not $RpmPath -or -not (Test-Path $RpmPath)) {
    Write-Error "No RPM found. Run 'npx electron-builder --linux rpm' first, or pass -RpmPath."
    exit 1
}

$rpmName = Split-Path $RpmPath -Leaf
Write-Host "[smoke] Testing $rpmName in fedora:latest"

$absRpmPath = (Resolve-Path $RpmPath).Path -replace '\\', '/'
$absRpmPath = $absRpmPath -replace '^([A-Za-z]):', '//$1'

docker run --rm `
    -v "${absRpmPath}:/tmp/${rpmName}:ro" `
    fedora:latest `
    bash -c @"
set -e
dnf install -y /tmp/${rpmName} xorg-x11-server-Xvfb 2>&1 | tail -5
Xvfb :99 -screen 0 1024x768x24 &
sleep 1
DISPLAY=:99 timeout 8 arumu --no-sandbox 2>&1 | tee /tmp/arumu.log || true
if grep -qE 'Cannot find module|ReferenceError|Uncaught Exception' /tmp/arumu.log; then
    echo 'SMOKE TEST FAILED'
    cat /tmp/arumu.log
    exit 1
fi
echo 'SMOKE TEST PASSED'
"@

if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "[smoke] OK"
