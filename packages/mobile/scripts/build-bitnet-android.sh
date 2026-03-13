#!/bin/bash
# build-bitnet-android.sh — Cross-compile BitNet.cpp for Android (arm64-v8a)
#
# Prerequisites: Android NDK (set ANDROID_NDK_HOME or NDK_HOME), CMake
#
# Produces:
#   build/android/arm64-v8a/libllama.a, libggml.a
#
# These static libraries are linked into the SemblanceBitNet React Native
# native module via CMakeLists.txt in android/app/src/main/jni/.
#
# Usage: ./scripts/build-bitnet-android.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BITNET_DIR="$MOBILE_DIR/../desktop/src-tauri/3rdparty/BitNet"
BUILD_BASE="$MOBILE_DIR/build/android"

# Find Android NDK
NDK="${ANDROID_NDK_HOME:-${NDK_HOME:-}}"
if [ -z "$NDK" ]; then
  # Try common locations
  if [ -d "$HOME/Android/Sdk/ndk" ]; then
    NDK=$(ls -d "$HOME/Android/Sdk/ndk/"*/ 2>/dev/null | sort -V | tail -1)
  elif [ -d "$ANDROID_HOME/ndk" ]; then
    NDK=$(ls -d "$ANDROID_HOME/ndk/"*/ 2>/dev/null | sort -V | tail -1)
  fi
fi

if [ -z "$NDK" ] || [ ! -d "$NDK" ]; then
  echo "ERROR: Android NDK not found."
  echo "Set ANDROID_NDK_HOME or install via: sdkmanager 'ndk;27.0.12077973'"
  exit 1
fi
echo "Using NDK: $NDK"

TOOLCHAIN="$NDK/build/cmake/android.toolchain.cmake"
if [ ! -f "$TOOLCHAIN" ]; then
  echo "ERROR: CMake toolchain not found at $TOOLCHAIN"
  exit 1
fi

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
  -DGGML_METAL=OFF
  # MAD kernels for multi-model support (same rationale as desktop build.rs).
  # TL1 LUT kernels require per-model pre-computed headers. Can be enabled
  # per-model at download time by generating headers via codegen_tl1.py.
  -DBITNET_ARM_TL1=OFF
  -DGGML_BITNET_ARM_TL1=OFF
  -DBITNET_X86_TL2=OFF
  -DGGML_BITNET_X86_TL2=OFF
)

# ── Build for arm64-v8a ──────────────────────────────────────────────────────
echo "Building BitNet.cpp for Android arm64-v8a..."
mkdir -p "$BUILD_BASE/arm64-v8a"
cmake -S "$BITNET_DIR" -B "$BUILD_BASE/arm64-v8a" \
  "${CMAKE_FLAGS[@]}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
  -DANDROID_ABI=arm64-v8a \
  -DANDROID_PLATFORM=android-24 \
  -DANDROID_STL=c++_static \
  -DCMAKE_INSTALL_PREFIX="$BUILD_BASE/arm64-v8a/install"

cmake --build "$BUILD_BASE/arm64-v8a" --config Release --target ggml --target llama --parallel

echo "Android arm64-v8a build complete."
echo "Libraries at: $BUILD_BASE/arm64-v8a/"
echo "Done."
