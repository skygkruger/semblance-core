# Thin wrapper for Windows launch-floor field evidence capture.
# Usage: .\scripts\windows-launch-floor-bench.ps1 [-OutPath <json>]
param(
  [string]$OutPath = "release/evidence/field/launch-floor.v1.json"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Test-Path "packages/desktop/src-tauri/sidecar/bridge.cjs")) {
  Write-Host "Bundling sidecar..."
  node scripts/bundle-sidecar.js
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$args = @("scripts/capture-launch-floor.js", "--out", $OutPath)
node @args
exit $LASTEXITCODE
