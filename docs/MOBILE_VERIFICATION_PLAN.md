# Mobile Verification Plan

Complete verification plan for native inference (iOS MLX, Android llama.cpp), quick capture widget, and mobile compilation.

## Current Status

All native modules are **structurally complete** but **not compilable on Windows**. This document defines what passes without a device and what requires physical device/simulator verification.

### Modules

| Module | Location | Status |
|--------|----------|--------|
| iOS MLX Inference Bridge | `packages/mobile/ios/SemblanceMLX/` | Structurally complete |
| Android llama.cpp Bridge | `packages/mobile/android/` | Structurally complete |
| iOS Quick Capture Widget | `packages/mobile/ios/SemblanceWidget/` | Structurally complete |
| TypeScript Inference Adapters | `packages/mobile/src/inference/` | Tested, passing |
| SQLiteVectorStore (mobile search) | `packages/core/platform/sqlite-vector-store.ts` | Tested, passing |
| Mobile Search Adapter | `packages/mobile/src/data/search-adapter.ts` | Tested, passing |

---

## What Passes Without a Device

These verification steps run on Windows/Linux CI and are currently passing:

### Static Source Audits

- **iOS MLX bridge**: Contains `import MLX`, `MLXModel` class, `generate()` and `embed()` methods. No TODO/PLACEHOLDER/FIXME markers.
- **Android llama.cpp bridge**: Contains JNI native method declarations, CMakeLists.txt references llama.cpp. No placeholder strings.
- **iOS Widget**: Contains `import WidgetKit`, `AppIntentTimelineProvider`, App Groups shared storage. No marker comments.

### TypeScript Adapter Tests

- `InferenceBridge` adapter correctly routes to MLX on iOS and llama.cpp on Android
- Streaming callback receives tokens
- Embedding adapter returns correct-dimension vectors
- Task router classifies queries by complexity
- Device handoff protocol sends/receives correctly

### Interface Contract Tests

- `VectorStoreAdapter` compliance for both `LanceDBVectorStore` and `SQLiteVectorStore`
- `CryptoAdapter` AES-256-GCM encrypt/decrypt round-trip
- `PlatformAdapter` shape validation for mobile adapter

### Privacy Guards

- No banned imports (`@lancedb/lancedb`, Node.js builtins) in `packages/core/`
- `desktop-vector-store.ts` is the sole approved exception for LanceDB
- Mobile adapter does not import Gateway or networking code

---

## iOS Verification Steps

### Prerequisites

- macOS with Xcode 15+
- iPhone 15 Pro or newer (or simulator)
- MLX framework available (Apple Silicon Mac)

### MLX Inference Bridge

1. **Build**: `cd packages/mobile/ios && xcodebuild -scheme SemblanceMLX`
2. **Simulator test**: Run on iOS 17+ simulator
3. **Model load**: Verify model loads from local storage in <10s
4. **Generate**: Send prompt, verify coherent text response
5. **Embed**: Send text, verify 384/768-dim vector returned
6. **Streaming**: Verify tokens arrive incrementally (not all at once)
7. **Memory**: Monitor memory usage stays within 80% of available RAM

### Quick Capture Widget

1. **Build**: `cd packages/mobile/ios && xcodebuild -scheme SemblanceWidget`
2. **Simulator**: Add widget to home screen
3. **Tap**: Verify deep-link opens app at capture screen
4. **Shared storage**: Capture text via app, verify widget shows it
5. **Timeline**: Widget refreshes within 15 minutes

### Acceptance Criteria (iOS)

- [ ] Model loads in <10s on iPhone 15 Pro
- [ ] `generate()` returns coherent text for simple prompts
- [ ] Streaming delivers tokens progressively
- [ ] `embed()` returns correct-dimension vector
- [ ] Memory stays within 80% of model's expected footprint
- [ ] No crash after 10 consecutive inference calls
- [ ] Widget builds and installs on simulator
- [ ] Widget deep-link navigates to correct screen

---

## Android Verification Steps

### Prerequisites

- Android Studio with NDK r26+
- CMake 3.22+
- Physical device with 6GB+ RAM (or emulator with equivalent)

### llama.cpp Bridge

1. **Build**: `cd packages/mobile/android && ./gradlew assembleDebug`
2. **NDK compile**: Verify llama.cpp native library compiles via CMake
3. **Emulator test**: Run on API 33+ emulator
4. **Model load**: Verify GGUF model loads from local storage in <10s
5. **Generate**: Send prompt, verify coherent text response
6. **Embed**: Send text, verify vector returned
7. **Memory**: Monitor with Android Profiler, stays within budget

### Acceptance Criteria (Android)

- [ ] NDK builds without errors
- [ ] Model loads in <10s on flagship device
- [ ] `generate()` returns coherent text
- [ ] Streaming works via JNI callback
- [ ] `embed()` returns correct-dimension vector
- [ ] Memory within 80% of expected footprint
- [ ] No crash after 10 consecutive inference calls
- [ ] `onTrimMemory` gracefully unloads model

---

## Cross-Platform Verification

### Task Routing

1. Mobile device discovers desktop via mDNS
2. Complex query is routed to desktop
3. Result returns to mobile seamlessly
4. Desktop unavailable: mobile falls back to local inference

### Encrypted Sync

1. Mobile generates sync payload
2. Payload encrypted with AES-256-GCM
3. Desktop decrypts successfully
4. Tampered payload rejected by GCM auth

### Semantic Search

1. Index 100 documents on mobile via `SQLiteVectorStore`
2. Search returns relevant results in <1s
3. Results quality comparable to desktop LanceDB adapter

---

## Performance Benchmarks (To Be Measured on Device)

| Metric | Target | Measured On |
|--------|--------|-------------|
| Model load time | <10s | Device |
| Token generation speed | >5 tok/s (3B model) | Device |
| Embedding latency | <500ms per text | Device |
| Semantic search (1K vectors) | <200ms | Device |
| Semantic search (10K vectors) | <1s | Device |
| Memory footprint (3B Q4 model) | <3GB | Device |
| Widget timeline refresh | <15 min | Device |

---

## Risk Factors

1. **MLX availability**: Only works on Apple Silicon. Intel Macs must use llama.cpp fallback.
2. **op-sqlite limitations**: Cannot load arbitrary SQLite extensions; brute-force cosine is the verified path.
3. **Memory pressure on older devices**: 1B model fallback required for <6GB RAM devices.
4. **Widget limitations**: WidgetKit has strict memory and CPU budget; captures must be lightweight.
