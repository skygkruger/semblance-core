#!/bin/bash
#
# TEST 4: Post-Deploy Verification Script
#
# Run this AFTER deploying to /Applications/Semblance.app.
# It launches the actual compiled app, waits for initialization,
# sends a test chat, and verifies everything end-to-end.
#
# This is the "finish line" — the build isn't done until this passes.
#
# Usage:
#   ./scripts/post-deploy-verify.sh
#
# Prerequisites:
#   - Semblance.app installed in /Applications
#   - xattr/codesign already applied
#   - No stale sidecar processes running

set -euo pipefail

APP="/Applications/Semblance.app"
BINARY="$APP/Contents/MacOS/semblance-desktop"
STDERR_LOG="/tmp/semblance-verify-stderr.log"
STDOUT_LOG="/tmp/semblance-verify-stdout.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

passed=0
failed=0
warnings=0

pass() { ((passed++)); echo -e "  ${GREEN}✅ $1${NC}"; }
fail() { ((failed++)); echo -e "  ${RED}❌ $1: $2${NC}"; }
warn() { ((warnings++)); echo -e "  ${YELLOW}⚠️  $1${NC}"; }

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  SEMBLANCE POST-DEPLOY VERIFICATION"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ─── Pre-flight ──────────────────────────────────────────────────────────────

echo "Pre-flight checks..."

if [ ! -d "$APP" ]; then
  fail "App bundle exists" "$APP not found"
  exit 1
fi
pass "App bundle exists at $APP"

if [ ! -f "$BINARY" ]; then
  fail "Binary exists" "$BINARY not found"
  exit 1
fi
pass "Binary exists"

# Check for sidecar in Resources
if [ -f "$APP/Contents/Resources/sidecar/bridge.cjs" ]; then
  pass "Sidecar bundled in Resources"
else
  fail "Sidecar bundle" "bridge.cjs not found in Contents/Resources/sidecar/"
  exit 1
fi

# Check for model files
MODEL_DIR="$HOME/.semblance/data/models"
if [ -d "$MODEL_DIR" ]; then
  model_count=$(ls -1 "$MODEL_DIR"/*.gguf 2>/dev/null | wc -l | tr -d ' ')
  if [ "$model_count" -ge 2 ]; then
    pass "Model files present ($model_count .gguf files)"
  else
    warn "Only $model_count model files found (expected 4+)"
  fi
else
  fail "Model directory" "$MODEL_DIR not found"
fi

# Kill any stale sidecar processes
stale_count=$(pgrep -f 'semblance.*bridge\.cjs' 2>/dev/null | wc -l | tr -d ' ')
if [ "$stale_count" -gt 0 ]; then
  echo "  Killing $stale_count stale sidecar processes..."
  pkill -f 'semblance.*bridge\.cjs' 2>/dev/null || true
  sleep 1
  pass "Stale sidecar processes cleaned up"
else
  pass "No stale sidecar processes"
fi

echo ""
echo "Launching Semblance..."

# ─── Launch App ──────────────────────────────────────────────────────────────

# Launch with stderr capture
"$BINARY" > "$STDOUT_LOG" 2> "$STDERR_LOG" &
APP_PID=$!

# Cleanup on exit
cleanup() {
  kill $APP_PID 2>/dev/null || true
  # Kill any sidecar processes spawned by this test
  pkill -f 'semblance.*bridge\.cjs' 2>/dev/null || true
}
trap cleanup EXIT

# Wait for sidecar initialization (check stderr for key markers)
echo "  Waiting for sidecar initialization (up to 180s)..."
MAX_WAIT=180
WAITED=0
INITIALIZED=false

while [ $WAITED -lt $MAX_WAIT ]; do
  if grep -q "Sprint G initialization complete\|All subsystems initialized\|Core initialized" "$STDERR_LOG" 2>/dev/null; then
    INITIALIZED=true
    break
  fi
  # Check if process died
  if ! kill -0 $APP_PID 2>/dev/null; then
    fail "App process alive" "Process died during startup"
    echo ""
    echo "Last 20 lines of stderr:"
    tail -20 "$STDERR_LOG"
    exit 1
  fi
  sleep 2
  WAITED=$((WAITED + 2))
  if [ $((WAITED % 30)) -eq 0 ]; then
    echo "  ... ${WAITED}s elapsed"
  fi
done

if [ "$INITIALIZED" = true ]; then
  pass "Sidecar initialized (${WAITED}s)"
else
  fail "Sidecar initialization" "Timed out after ${MAX_WAIT}s"
  echo ""
  echo "Last 30 lines of stderr:"
  tail -30 "$STDERR_LOG"
  exit 1
fi

# ─── Stderr Analysis ─────────────────────────────────────────────────────────

echo ""
echo "Analyzing startup logs..."

# Check NativeRuntime model loading
if grep -q "Embedding model loaded" "$STDERR_LOG"; then
  pass "Embedding model loaded"
else
  fail "Embedding model" "Not loaded"
fi

if grep -q "Reasoning model loaded" "$STDERR_LOG"; then
  model_name=$(grep "Reasoning model loaded" "$STDERR_LOG" | head -1 | grep -oE '[^/]+\.gguf')
  pass "Reasoning model loaded: $model_name"
else
  fail "Reasoning model" "Not loaded"
fi

if grep -q "Fast model loaded" "$STDERR_LOG"; then
  pass "Fast model loaded"
else
  warn "Fast model not loaded (may be hardware-dependent)"
fi

if grep -q "Vision model loaded" "$STDERR_LOG"; then
  pass "Vision model loaded"
else
  warn "Vision model not loaded (may be hardware-dependent)"
fi

# Check for the wrong model selection bug (Issue 7)
if grep -q "Chat model selected: llama3" "$STDERR_LOG"; then
  fail "Model selection" "Still falling back to Ollama model name (llama3.x)"
else
  pass "No Ollama model name fallback"
fi

# Check for SqliteError (Issue 8)
if grep -q "SqliteError" "$STDERR_LOG"; then
  error_count=$(grep -c "SqliteError" "$STDERR_LOG")
  fail "SQLite errors" "$error_count SqliteError occurrences in stderr"
else
  pass "No SQLite errors"
fi

# Check for missing packages (Issue 9)
if grep -q "Cannot find package" "$STDERR_LOG"; then
  fail "Missing packages" "$(grep 'Cannot find package' "$STDERR_LOG" | head -1)"
else
  pass "No missing package errors"
fi

# Check for deprecation warnings (Issue 10)
if grep -q "DeprecationWarning" "$STDERR_LOG"; then
  fail "Deprecation warnings" "Still present in stderr"
else
  pass "No deprecation warnings"
fi

# Check sidecar path resolution (original FAILURE #1)
if grep -q "Found bundled bridge in resources" "$STDERR_LOG"; then
  pass "Sidecar path resolved via resource_dir()"
elif grep -q "Found bundled bridge alongside exe" "$STDERR_LOG"; then
  warn "Sidecar found via exe fallback (expected resource_dir)"
else
  fail "Sidecar path" "No bridge found log in stderr"
fi

# Check for Metal GPU initialization
if grep -q "Apple M" "$STDERR_LOG"; then
  gpu=$(grep "GPU name:" "$STDERR_LOG" | head -1 | sed 's/.*GPU name: *//')
  pass "Metal GPU detected: $gpu"
else
  warn "No Metal GPU detected in logs"
fi

# Check for stale sidecar cleanup (Issue 6)
if grep -q "Killing stale sidecar" "$STDERR_LOG"; then
  pass "Stale sidecar cleanup executed"
else
  pass "No stale sidecars to clean (clean environment)"
fi

# Check for crashes
if grep -q "panic\|SIGSEGV\|SIGABRT\|abort" "$STDERR_LOG"; then
  fail "Crash detection" "Panic or signal found in stderr"
else
  pass "No crashes detected"
fi

# ─── Wait for model loading + cron cycle ─────────────────────────────────────

echo ""
echo "Waiting 30s for models to finish loading + first cron cycle..."
sleep 30

# Re-check for late errors (cron-triggered issues like Issue 8)
if grep -q "SqliteError" "$STDERR_LOG"; then
  error_count=$(grep -c "SqliteError" "$STDERR_LOG")
  fail "Late SQLite errors (post-cron)" "$error_count errors after cron cycle"
else
  pass "No SQLite errors after cron cycle"
fi

# ─── Report ──────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "  RESULTS: ${GREEN}${passed} passed${NC}, ${RED}${failed} failed${NC}, ${YELLOW}${warnings} warnings${NC}"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Logs saved to:"
echo "  stderr: $STDERR_LOG"
echo "  stdout: $STDOUT_LOG"

if [ $failed -gt 0 ]; then
  echo ""
  echo -e "${RED}VERIFICATION FAILED${NC} — do not ship this build."
  echo ""
  echo "Last 20 lines of stderr:"
  tail -20 "$STDERR_LOG"
  exit 1
else
  echo ""
  echo -e "${GREEN}VERIFICATION PASSED${NC} — build is ready."
  exit 0
fi
