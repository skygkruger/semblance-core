#!/bin/bash
# build-bitnet-ios.sh — Cross-compile BitNet.cpp for iOS (arm64 + simulator)
#
# Prerequisites: Xcode Command Line Tools, CMake
#
# Produces:
#   build/ios/arm64/libllama.a, libggml.a     (device)
#   build/ios/sim-arm64/libllama.a, libggml.a (simulator)
#   build/ios/BitNet.xcframework              (universal framework)
#
# Usage: ./scripts/build-bitnet-ios.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BITNET_DIR="$MOBILE_DIR/../desktop/src-tauri/3rdparty/BitNet"
BUILD_BASE="$MOBILE_DIR/build/ios"

if [ ! -d "$BITNET_DIR" ]; then
  echo "ERROR: BitNet.cpp not found at $BITNET_DIR"
  echo "Run: cd packages/desktop/src-tauri && git submodule update --init --recursive"
  exit 1
fi

CMAKE_FLAGS=(
  -DBUILD_SHARED_LIBS=OFF
  -DLLAMA_BUILD_TESTS=OFF
  -DLLAMA_BUILD_EXAMPLES=OFF
  -DLLAMA_BUILD_SERVER=OFF
  -DLLAMA_BUILD_COMMON=OFF
  -DGGML_BUILD_TESTS=OFF
  -DGGML_BUILD_EXAMPLES=OFF
  -DGGML_OPENMP=OFF
  -DGGML_VULKAN=OFF
  -DGGML_CUDA=OFF
  -DGGML_RPC=OFF
  -DGGML_METAL=ON
  # MAD kernels for multi-model support (same rationale as desktop build.rs).
  # TL1 LUT kernels require per-model pre-computed headers. Can be enabled
  # per-model at download time by generating headers via codegen_tl1.py.
  -DBITNET_ARM_TL1=OFF
  -DGGML_BITNET_ARM_TL1=OFF
  -DBITNET_X86_TL2=OFF
  -DGGML_BITNET_X86_TL2=OFF
)

# ── Build for arm64-apple-ios (device) ───────────────────────────────────────
echo "Building BitNet.cpp for iOS arm64 (device)..."
mkdir -p "$BUILD_BASE/arm64"
cmake -S "$BITNET_DIR" -B "$BUILD_BASE/arm64" \
  "${CMAKE_FLAGS[@]}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_SYSTEM_NAME=iOS \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=16.0 \
  -DCMAKE_INSTALL_PREFIX="$BUILD_BASE/arm64/install"

cmake --build "$BUILD_BASE/arm64" --config Release --target ggml --target llama --parallel
echo "iOS arm64 (device) build complete."

# ── Build for arm64-apple-ios-simulator ──────────────────────────────────────
echo "Building BitNet.cpp for iOS arm64 (simulator)..."
mkdir -p "$BUILD_BASE/sim-arm64"
cmake -S "$BITNET_DIR" -B "$BUILD_BASE/sim-arm64" \
  "${CMAKE_FLAGS[@]}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_SYSTEM_NAME=iOS \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_SYSROOT=iphonesimulator \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=16.0 \
  -DCMAKE_INSTALL_PREFIX="$BUILD_BASE/sim-arm64/install"

cmake --build "$BUILD_BASE/sim-arm64" --config Release --target ggml --target llama --parallel
echo "iOS arm64 (simulator) build complete."

# ── Create xcframework ───────────────────────────────────────────────────────
echo "Creating BitNet.xcframework..."

# Find the built static libraries
find_lib() {
  local base="$1" name="$2"
  find "$base" -name "lib${name}.a" -o -name "${name}.lib" | head -1
}

DEVICE_LLAMA=$(find_lib "$BUILD_BASE/arm64" "llama")
DEVICE_GGML=$(find_lib "$BUILD_BASE/arm64" "ggml")
SIM_LLAMA=$(find_lib "$BUILD_BASE/sim-arm64" "llama")
SIM_GGML=$(find_lib "$BUILD_BASE/sim-arm64" "ggml")

if [ -z "$DEVICE_LLAMA" ] || [ -z "$DEVICE_GGML" ]; then
  echo "ERROR: Could not find device static libraries"
  exit 1
fi

# Merge ggml + llama into a single .a per platform for xcframework
mkdir -p "$BUILD_BASE/merged"
libtool -static -o "$BUILD_BASE/merged/libbitnet-device.a" "$DEVICE_LLAMA" "$DEVICE_GGML"
libtool -static -o "$BUILD_BASE/merged/libbitnet-sim.a" "$SIM_LLAMA" "$SIM_GGML"

# Create xcframework
rm -rf "$BUILD_BASE/BitNet.xcframework"
xcodebuild -create-xcframework \
  -library "$BUILD_BASE/merged/libbitnet-device.a" \
  -library "$BUILD_BASE/merged/libbitnet-sim.a" \
  -output "$BUILD_BASE/BitNet.xcframework"

echo "BitNet.xcframework created at: $BUILD_BASE/BitNet.xcframework"
echo "Done."
