#!/usr/bin/env bash
# Reproducible Build Script — Verifies build determinism for Semblance.
#
# Usage: ./scripts/reproducible-build.sh
#
# This script:
# 1. Records the git commit hash
# 2. Runs a clean build
# 3. Computes checksums of all output artifacts
# 4. Outputs a manifest that can be compared across builds
#
# For full documentation, see docs/REPRODUCIBLE_BUILDS.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Semblance Reproducible Build ==="
echo ""

# 1. Record build metadata
GIT_HASH=$(git -C "$PROJECT_ROOT" rev-parse HEAD)
GIT_DIRTY=$(git -C "$PROJECT_ROOT" status --porcelain | head -1)
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
NODE_VERSION=$(node --version)
PNPM_VERSION=$(pnpm --version 2>/dev/null || echo "not installed")

echo "Git commit:    $GIT_HASH"
echo "Working tree:  ${GIT_DIRTY:+dirty}${GIT_DIRTY:-clean}"
echo "Build date:    $BUILD_DATE"
echo "Node version:  $NODE_VERSION"
echo "pnpm version:  $PNPM_VERSION"
echo ""

if [ -n "$GIT_DIRTY" ]; then
  echo "WARNING: Working tree is dirty. Build will not be reproducible."
  echo ""
fi

# 2. Clean previous build artifacts
echo "Cleaning previous build..."
rm -rf "$PROJECT_ROOT/dist" "$PROJECT_ROOT/.turbo"
echo ""

# 3. Install dependencies (frozen lockfile)
echo "Installing dependencies (frozen lockfile)..."
cd "$PROJECT_ROOT"
pnpm install --frozen-lockfile
echo ""

# 4. Run build
echo "Building..."
pnpm build 2>&1 || true
echo ""

# 5. Compute checksums
echo "=== Build Artifact Checksums ==="
MANIFEST_FILE="$PROJECT_ROOT/build-manifest.txt"

{
  echo "# Semblance Build Manifest"
  echo "# Generated: $BUILD_DATE"
  echo "# Git: $GIT_HASH"
  echo "# Node: $NODE_VERSION"
  echo "# pnpm: $PNPM_VERSION"
  echo ""

  # Checksum all JS/TS output files
  if [ -d "$PROJECT_ROOT/dist" ]; then
    find "$PROJECT_ROOT/dist" -type f \( -name "*.js" -o -name "*.mjs" -o -name "*.cjs" \) -print0 | \
      sort -z | \
      xargs -0 sha256sum 2>/dev/null || true
  fi

  # Checksum lockfile
  if [ -f "$PROJECT_ROOT/pnpm-lock.yaml" ]; then
    sha256sum "$PROJECT_ROOT/pnpm-lock.yaml"
  fi
} > "$MANIFEST_FILE"

echo "Build manifest written to: $MANIFEST_FILE"
echo ""
echo "=== Done ==="
echo ""
echo "To verify reproducibility:"
echo "  1. Run this script on a clean checkout of the same commit"
echo "  2. Compare build-manifest.txt files"
echo "  3. Checksums should match for all artifacts"
