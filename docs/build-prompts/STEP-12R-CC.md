# Step 12 Remediation — Mobile Feature Parity: Full Implementation

## Implementation Prompt for Claude Code

**Date:** February 22, 2026
**Context:** Step 12 delivered architecture, scaffolding, and test infrastructure (2,281 tests, 328 new). Task routing, IPC abstraction, and privacy audit are solid. But native inference, PlatformAdapter completion, native providers, and UI data wiring are stub/placeholder state. This remediation converts every stub into production code.
**Test Baseline:** 2,281 tests passing. Privacy audit clean.
**Remediation Rule:** NO stubs. NO placeholders. NO mock data in production code. NO "TODO" comments left behind. Every line of code must be functional, tested, and production-ready.

---

## Read First

Before writing any code, read these files:
- `/CLAUDE.md` — Architecture rules, boundary rules, code quality standards
- `/docs/DESIGN_SYSTEM.md` — All UI must conform to Trellis design system
- `packages/mobile/` — Current mobile package state (your starting point)
- `packages/core/agent/task-router.ts` — Task routing (DONE, do not modify unless fixing a bug)
- `packages/core/agent/device-handoff.ts` — Device handoff protocol
- `packages/mobile/src/inference/` — Current native bridge stubs
- `packages/mobile/src/platform/` — Current PlatformAdapter stubs

---

## What Passed (Do Not Rebuild)

These are verified working from the Step 12 initial implementation. Do not rewrite them — build on top of them:

1. **IPC Transport Abstraction** — `SocketTransport` (desktop) and `InProcessTransport` (mobile) correctly differentiated. Rule 1 (Zero Network in Core) maintained.
2. **Task Routing Engine** — `TaskRouter` scores devices by RAM, battery, model tier, load. `TaskDelegationEngine` classifies tasks by complexity and manages failover. This is production quality.
3. **Privacy Audit** — Clean. Zero violations. All 46 integration tests pass.
4. **Test Infrastructure** — 328 new tests across 14 commits. Test patterns are established for mobile components.

---

## What Must Be Fixed

### Root Cause Analysis

The partial items share two root causes:

**Root Cause 1: PlatformAdapter is an interface without mobile implementation.**
Files in `packages/core/` still import `node:fs`, `node:path`, `better-sqlite3`, and other Node.js built-ins directly. These crash on React Native. The `PlatformAdapter` interface exists but the mobile concrete implementation doesn't abstract these dependencies. Until this is fixed, no core logic runs on mobile — every feature downstream is blocked.

**Root Cause 2: Native inference bridges are skeletons.**
iOS `SemblanceMLXModule.swift` and Android `SemblanceLlamaModule.kt` contain TODO comments instead of actual inference code. Without real inference, every feature that depends on LLM output (email triage, drafting, search, style matching) returns placeholder strings on mobile.

Fixing these two root causes unblocks everything else: mDNS native providers, sync transport, UI data wiring, and feature parity.

---

## Commit Strategy

10 commits. Each must compile, pass all tests, and leave the codebase in a working state.

### Commit 1: PlatformAdapter — Complete Abstraction Layer

**What:** Make `packages/core/` completely platform-agnostic. Every Node.js built-in gets abstracted through the `PlatformAdapter` interface with concrete implementations for desktop and mobile.

**Files to create/modify:**
- `packages/core/platform/platform-adapter.ts` — The interface (may already exist; verify completeness)
- `packages/core/platform/desktop-adapter.ts` — Desktop implementation wrapping Node.js built-ins
- `packages/core/platform/mobile-adapter.ts` — Mobile implementation wrapping React Native equivalents
- Every file in `packages/core/` that currently imports Node.js built-ins

**The PlatformAdapter interface MUST cover:**

```typescript
interface PlatformAdapter {
  // File system
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readTextFile(path: string, encoding?: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  unlink(path: string): Promise<void>;
  stat(path: string): Promise<{ size: number; mtime: Date; isDirectory: boolean }>;

  // Paths
  joinPath(...segments: string[]): string;
  getAppDataDir(): Promise<string>;
  getDocumentsDir(): Promise<string>;
  getCacheDir(): Promise<string>;
  getTempDir(): Promise<string>;

  // SQLite
  openDatabase(path: string): Promise<DatabaseAdapter>;

  // Crypto
  randomUUID(): string;
  hmacSHA256(key: string, data: string): Promise<string>;
  sha256(data: Uint8Array): Promise<string>;

  // Platform info
  getPlatform(): 'desktop' | 'ios' | 'android';
  getDeviceInfo(): Promise<DeviceInfo>;
}

interface DatabaseAdapter {
  execute(sql: string, params?: unknown[]): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

interface DeviceInfo {
  platform: 'macos' | 'windows' | 'linux' | 'ios' | 'android';
  arch: string;
  totalMemoryMB: number;
  availableMemoryMB: number;
  hasMetal: boolean;      // Apple GPU
  hasCUDA: boolean;       // NVIDIA GPU
  hasNPU: boolean;        // Neural Processing Unit
  batteryLevel: number;   // 0-100, -1 if plugged in / desktop
  isCharging: boolean;
}
```

**Desktop implementation** wraps:
- `node:fs/promises` for file operations
- `node:path` for path operations
- `better-sqlite3` for SQLite (wrapped in `DatabaseAdapter`)
- `node:crypto` for crypto operations
- Tauri APIs for app directories

**Mobile implementation** wraps:
- `react-native-fs` for file operations
- React Native path utilities for path operations
- `op-sqlite` for SQLite (wrapped in `DatabaseAdapter`)
- React Native crypto (`expo-crypto` or `react-native-quick-crypto`) for crypto operations
- React Native APIs for app directories

**The critical constraint:** After this commit, `packages/core/` must contain ZERO direct imports of:
- `node:fs`, `node:path`, `node:crypto`, `node:os`, `node:child_process`
- `better-sqlite3`
- `fs`, `path`, `crypto`, `os` (bare Node.js module names)
- Any other Node.js built-in

Every such import must go through `PlatformAdapter`. The adapter is injected at initialization via `SemblanceCore.initialize({ platform: adapter })`.

**Verification test (MUST exist and pass):**
```typescript
// tests/privacy/no-node-builtins-in-core.test.ts
// Scan every .ts file in packages/core/ (excluding platform/desktop-adapter.ts)
// Fail if any file contains: import ... from 'node:', import ... from 'fs', 
// import ... from 'path', import ... from 'better-sqlite3', require('node:'),
// require('fs'), require('path'), require('better-sqlite3')
```

This is the guard test. It runs in CI. If it fails, the build fails.

**Tests:** 20+ new tests covering:
- Desktop adapter: file CRUD, directory operations, path joining, SQLite open/query/close, crypto operations
- Mobile adapter: same operations using React Native equivalents
- Guard test: no Node.js built-ins in core (excluding desktop-adapter.ts)
- SemblanceCore initializes successfully with either adapter

---

### Commit 2: Mobile Dependencies — Package Configuration

**What:** Add all required React Native dependencies to `packages/mobile/package.json` and verify they resolve correctly.

**Required dependencies (production):**
```json
{
  "react-native-fs": "^2.20.0",
  "op-sqlite": "^5.0.0",
  "react-native-device-info": "^11.0.0",
  "react-native-quick-crypto": "^0.7.0",
  "@react-native-community/netinfo": "^11.0.0",
  "react-native-haptic-feedback": "^2.3.0",
  "react-native-reanimated": "^3.0.0",
  "@notifee/react-native": "^7.0.0",
  "react-native-gesture-handler": "^2.0.0"
}
```

**Required dependencies (iOS native, in Podfile):**
```ruby
# MLX Swift for on-device inference
pod 'mlx-swift', :git => 'https://github.com/ml-explore/mlx-swift.git'
```

**Required dependencies (Android native, in build.gradle):**
```groovy
// llama.cpp Android library
implementation 'com.github.anthropics:llama-cpp-android:latest'
// Or build from source: https://github.com/ggerganov/llama.cpp
```

**Note on dependency selection:** If the exact packages above are unavailable or have compatibility issues with the current React Native version, substitute with the closest equivalent that provides the same capability. Document any substitutions and justify them. Do NOT leave a dependency gap — every capability must have a working provider.

**Verification:**
- `cd packages/mobile && npm install` (or `yarn install`) completes without errors
- `cd packages/mobile/ios && pod install` completes without errors
- Android Gradle sync completes without errors

**Tests:** Dependency verification tests that import each package and confirm it exports the expected interface. 5+ tests.

---

### Commit 3: iOS MLX Bridge — Real Inference

**What:** Replace the placeholder `SemblanceMLXModule.swift` with a real MLX inference implementation that loads a GGUF/MLX model and returns actual generated text.

**Architecture:**

```
React Native JS
  → NativeModules.SemblanceMLX.generate(prompt, options)
    → Swift: SemblanceMLXModule
      → MLX Framework: load model, run inference, stream tokens
    → Returns generated text (or streams via events)
```

**SemblanceMLXModule.swift must implement:**

```swift
@objc(SemblanceMLXModule)
class SemblanceMLXModule: RCTEventEmitter {

  // Load a model from the local filesystem
  // modelPath: absolute path to the model file in the app's cache directory
  // Returns: model metadata (name, parameter count, quantization)
  @objc func loadModel(_ modelPath: String,
                       resolver: @escaping RCTPromiseResolveBlock,
                       rejecter: @escaping RCTPromiseRejectBlock)

  // Run inference and return complete result
  // prompt: the full prompt string
  // options: { maxTokens: Int, temperature: Float, topP: Float, stopSequences: [String] }
  @objc func generate(_ prompt: String,
                      options: NSDictionary,
                      resolver: @escaping RCTPromiseResolveBlock,
                      rejecter: @escaping RCTPromiseRejectBlock)

  // Run inference with streaming via RCTEventEmitter
  // Emits 'onToken' events with { token: String, done: Bool }
  @objc func generateStream(_ prompt: String,
                            options: NSDictionary)

  // Unload model and free memory
  @objc func unloadModel(_ resolver: @escaping RCTPromiseResolveBlock,
                         rejecter: @escaping RCTPromiseRejectBlock)

  // Get current model status
  @objc func getModelStatus(_ resolver: @escaping RCTPromiseResolveBlock,
                            rejecter: @escaping RCTPromiseRejectBlock)

  // Get device capability assessment
  @objc func getDeviceCapability(_ resolver: @escaping RCTPromiseResolveBlock,
                                 rejecter: @escaping RCTPromiseRejectBlock)
}
```

**If `mlx-swift` cannot bridge to React Native** (this was an identified escalation trigger):

The fallback path is `llama.cpp` via the iOS C API. llama.cpp has proven iOS compatibility and ships in multiple production apps. The Swift bridge calls llama.cpp's C API directly:

```swift
// Fallback: llama.cpp C API instead of MLX
import llama  // From the llama.cpp SPM package

class SemblanceLlamaIOSModule: RCTEventEmitter {
  private var model: OpaquePointer?  // llama_model
  private var context: OpaquePointer?  // llama_context
  // Same interface as SemblanceMLXModule above
}
```

**IMPORTANT:** Try MLX first. MLX is optimized for Apple Silicon and will deliver better performance. Only fall back to llama.cpp if MLX genuinely cannot bridge to React Native. Document which path was taken and why.

**The TypeScript bridge (React Native side):**

```typescript
// packages/mobile/src/inference/ios-bridge.ts
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { SemblanceMLX } = NativeModules; // or SemblanceLlamaIOS if fallback

export class IOSInferenceBridge implements MobileInferenceBridge {
  async loadModel(modelPath: string): Promise<ModelMetadata> { ... }
  async generate(prompt: string, options: InferenceOptions): Promise<string> { ... }
  async generateStream(prompt: string, options: InferenceOptions): AsyncGenerator<string> { ... }
  async unloadModel(): Promise<void> { ... }
  async getStatus(): Promise<ModelStatus> { ... }
  async getDeviceCapability(): Promise<DeviceCapability> { ... }
}
```

**Verification — the acid test:**
A test that loads a real model (the smallest available — even a 100M test model is fine for verification) and confirms the output is actual generated text, not a placeholder string. The test must fail if the output equals any of: "placeholder", "TODO", "", "not implemented", or any string that doesn't look like model output.

**Tests:** 15+ tests covering:
- Model loading (success path, invalid path, insufficient memory)
- Text generation (prompt in → text out — NOT placeholder)
- Streaming generation (tokens arrive incrementally)
- Model unloading and memory cleanup
- Device capability assessment returns real hardware info
- Error handling (model too large for device, corrupted model file)
- Concurrent inference rejection (only one inference at a time)

---

### Commit 4: Android llama.cpp Bridge — Real Inference

**What:** Replace the placeholder `SemblanceLlamaModule.kt` with a real llama.cpp inference implementation using JNI/NDK.

**Architecture:**

```
React Native JS
  → NativeModules.SemblanceLlama.generate(prompt, options)
    → Kotlin: SemblanceLlamaModule
      → JNI: native C++ bridge
        → llama.cpp: load model, run inference, stream tokens
    → Returns generated text (or streams via events)
```

**Implementation layers:**

**Layer 1 — JNI Bridge (C++):**
```cpp
// packages/mobile/android/app/src/main/cpp/llama-bridge.cpp
#include "llama.h"

extern "C" {
  JNIEXPORT jlong JNICALL Java_com_semblance_llama_LlamaBridge_loadModel(
    JNIEnv *env, jobject obj, jstring modelPath);

  JNIEXPORT jstring JNICALL Java_com_semblance_llama_LlamaBridge_generate(
    JNIEnv *env, jobject obj, jlong contextPtr, jstring prompt,
    jint maxTokens, jfloat temperature, jfloat topP);

  JNIEXPORT void JNICALL Java_com_semblance_llama_LlamaBridge_freeModel(
    JNIEnv *env, jobject obj, jlong contextPtr);
}
```

**Layer 2 — Kotlin Module:**
```kotlin
// packages/mobile/android/app/src/main/java/com/semblance/llama/SemblanceLlamaModule.kt
@ReactModule(name = "SemblanceLlama")
class SemblanceLlamaModule(reactContext: ReactApplicationContext)
  : ReactContextBaseJavaModule(reactContext) {

  @ReactMethod fun loadModel(modelPath: String, promise: Promise)
  @ReactMethod fun generate(prompt: String, options: ReadableMap, promise: Promise)
  @ReactMethod fun generateStream(prompt: String, options: ReadableMap)
  @ReactMethod fun unloadModel(promise: Promise)
  @ReactMethod fun getModelStatus(promise: Promise)
  @ReactMethod fun getDeviceCapability(promise: Promise)
}
```

**Layer 3 — CMakeLists.txt for llama.cpp compilation:**
```cmake
# packages/mobile/android/app/src/main/cpp/CMakeLists.txt
cmake_minimum_required(VERSION 3.18)
project(semblance-llama)

# Download and build llama.cpp from source
include(FetchContent)
FetchContent_Declare(
  llama_cpp
  GIT_REPOSITORY https://github.com/ggerganov/llama.cpp.git
  GIT_TAG master  # Pin to a specific commit in production
)
FetchContent_MakeAvailable(llama_cpp)

add_library(semblance-llama SHARED llama-bridge.cpp)
target_link_libraries(semblance-llama llama)
```

**The TypeScript bridge (React Native side):**

```typescript
// packages/mobile/src/inference/android-bridge.ts
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { SemblanceLlama } = NativeModules;

export class AndroidInferenceBridge implements MobileInferenceBridge {
  async loadModel(modelPath: string): Promise<ModelMetadata> { ... }
  async generate(prompt: string, options: InferenceOptions): Promise<string> { ... }
  async generateStream(prompt: string, options: InferenceOptions): AsyncGenerator<string> { ... }
  async unloadModel(): Promise<void> { ... }
  async getStatus(): Promise<ModelStatus> { ... }
  async getDeviceCapability(): Promise<DeviceCapability> { ... }
}
```

**Verification — same acid test as iOS:**
Load a real model, generate text, confirm it is actual LLM output and not a placeholder.

**Tests:** 15+ tests covering the same categories as iOS:
- Model loading, text generation (real output), streaming, unloading, device capability, error handling, concurrent rejection

---

### Commit 5: MobileInferenceBridge Unification + InferenceRouter Wiring

**What:** Create a unified `MobileInferenceBridge` that selects iOS or Android bridge based on platform, and wire it into the existing `InferenceRouter` so the full inference pipeline works on mobile.

```typescript
// packages/mobile/src/inference/mobile-inference-bridge.ts
import { Platform } from 'react-native';
import { IOSInferenceBridge } from './ios-bridge';
import { AndroidInferenceBridge } from './android-bridge';

export class MobileInferenceBridge implements InferenceBridge {
  private bridge: IOSInferenceBridge | AndroidInferenceBridge;

  constructor() {
    this.bridge = Platform.OS === 'ios'
      ? new IOSInferenceBridge()
      : new AndroidInferenceBridge();
  }

  // Implements the same InferenceBridge interface as the desktop
  // The InferenceRouter in packages/core/ treats this identically to desktop inference
}
```

**Wire into InferenceRouter:**
The `InferenceRouter` in `packages/core/agent/` already handles tier-based routing. It needs a `setInferenceBridge(bridge: InferenceBridge)` method (or receives it at initialization) so that mobile passes in `MobileInferenceBridge` and desktop passes in the existing Rust FFI bridge.

**Tests:** 10+ tests covering:
- Platform selection (iOS → MLX bridge, Android → llama.cpp bridge)
- InferenceRouter accepts MobileInferenceBridge and routes correctly
- Tier classification works on mobile (fast tasks stay local, heavy tasks route to desktop)
- Fallback behavior when model is loaded vs. not loaded

---

### Commit 6: Mobile Model Management — Real Downloads

**What:** Make the model download, caching, and lifecycle fully operational on mobile.

**Requirements:**
- Model downloads go through the Gateway (Rule 2 — Gateway Only). The mobile Gateway adapter must handle model download requests.
- WiFi-only download enforcement: check network status via `@react-native-community/netinfo` before initiating download. Reject on cellular with clear user-facing message.
- Download progress tracking via Gateway events. UI shows percentage, speed, and ETA.
- Model caching in app's cache directory. Check for existing model before downloading.
- Model integrity verification: SHA-256 hash check after download completes.
- Model tier selection based on device capability assessment from Commits 3/4.
- Model deletion from settings (free up storage).

**Model registry for mobile:**

| Device Class | RAM | Default Model | Size (Q4) | Fallback |
|---|---|---|---|---|
| iOS High (iPhone 15 Pro+, M-series iPad) | 6GB+ | Llama 3.2 3B Q4 | ~1.8GB | Llama 3.2 1B Q4 |
| iOS Base (iPhone 12–14) | 4–6GB | Llama 3.2 1B Q4 | ~700MB | — |
| Android High (Snapdragon 8 Gen 2+, 8GB+) | 8GB+ | Llama 3.2 3B Q4 | ~1.8GB | Llama 3.2 1B Q4 |
| Android Base (midrange, 4GB+) | 4–6GB | Llama 3.2 1B Q4 | ~700MB | — |

**Tests:** 15+ tests covering:
- WiFi-only enforcement (download rejected on cellular)
- Download progress events fire correctly
- Model cached after download (second request skips download)
- SHA-256 integrity check (pass and fail cases)
- Device capability → model tier mapping
- Model deletion frees storage
- Gateway audit trail shows model download entry

---

### Commit 7: Native Providers — mDNS + Encrypted Sync Transport

**What:** Replace the placeholder native providers for device discovery and state sync with real implementations.

**mDNS Device Discovery:**

The discovery logic in `packages/mobile/src/sync/discovery.ts` is sound (from Step 12). What's missing is the native provider that actually broadcasts and listens for mDNS services.

- **iOS:** Use `NativeModules` bridge to `NWBrowser` (Network.framework) or `NSNetServiceBrowser` (Bonjour).
- **Android:** Use `NativeModules` bridge to `NsdManager` (Android NSD API).

```typescript
// packages/mobile/src/sync/native-discovery-provider.ts
export class NativeDiscoveryProvider implements DiscoveryProvider {
  async startBrowsing(serviceType: string): Promise<void>;
  async stopBrowsing(): Promise<void>;
  async register(serviceName: string, port: number): Promise<void>;
  async unregister(): Promise<void>;
  onDeviceFound(callback: (device: DiscoveredDevice) => void): void;
  onDeviceLost(callback: (deviceId: string) => void): void;
}
```

The service type is `_semblance._tcp.local.` — registered only on the local network.

**Encrypted State Sync Transport:**

The sync logic and conflict resolution in `packages/mobile/src/sync/sync.ts` are verified working. What's missing is the actual TCP transport.

- Use React Native's TCP socket library (`react-native-tcp-socket`) for the transport layer.
- Encryption: TLS with mutual authentication. Each device generates a keypair at first launch. Devices exchange public keys during initial pairing (QR code or numeric confirmation).
- Sync payload: action trail (append-only merge), preferences (last-write-wins with timestamp), autonomy settings (last-write-wins), style profile (desktop takes precedence per conflict resolution rule).
- Sync is local-network only. The sync transport MUST NOT use any cloud relay, WebSocket service, or external server. Verify this with a test.

```typescript
// packages/mobile/src/sync/encrypted-sync-transport.ts
export class EncryptedSyncTransport implements SyncTransport {
  async connect(host: string, port: number): Promise<void>;
  async disconnect(): Promise<void>;
  async sendSyncPayload(payload: SyncPayload): Promise<SyncResponse>;
  async receiveSyncPayload(): Promise<SyncPayload>;
  isConnected(): boolean;
}
```

**Pairing flow:**
1. Device A starts listening on a random port, registers via mDNS
2. Device B discovers Device A via mDNS
3. Device B initiates TCP connection
4. Devices exchange public keys
5. User confirms pairing on both devices (6-digit numeric code displayed on both)
6. Paired devices stored in local registry
7. Future syncs use the established keypair — no re-pairing needed

**Tests:** 20+ tests covering:
- mDNS registration and browsing (mock native layer, test the provider interface)
- Device discovery events fire on service found/lost
- TCP connection establishment
- TLS handshake with mutual authentication
- Sync payload serialization/deserialization
- Conflict resolution (last-write-wins for preferences, merge for action trail, desktop-wins for style)
- Pairing code generation and verification
- No cloud relay test: verify the transport never opens connections to external hosts
- Reconnection after network interruption

---

### Commit 8: Core Feature Wiring — Live Data on Mobile

**What:** Replace all hardcoded mock data in mobile UI components with live data from the local knowledge graph, Gateway adapters, and inference pipeline.

**This commit wires every mobile screen to real data sources:**

**Universal Inbox:**
- Fetches emails via the Gateway IMAP adapter (same as desktop)
- AI triage categories populated by real inference (not hardcoded labels)
- Swipe actions trigger real Gateway operations (archive → IMAP flag, categorize → knowledge graph update)
- Approval prompts for Partner/Alter Ego actions are real

**Chat Screen:**
- Messages sent to the local InferenceRouter (which uses MobileInferenceBridge from Commit 5)
- Semantic search queries hit the local LanceDB via PlatformAdapter
- Chat history stored in local SQLite via PlatformAdapter
- Streaming responses render token-by-token using the native bridge's event emitter

**Calendar:**
- Fetches events via the Gateway CalDAV adapter
- Conflict resolution UI shows real conflicts
- Meeting prep uses real inference

**Reminders (from Step 10):**
- CRUD operations use local SQLite via PlatformAdapter
- NLP parsing for natural language reminder input uses local inference
- Notification scheduling uses `@notifee/react-native`

**Quick Capture (from Step 10):**
- Capture text stored in knowledge graph
- Auto-reminder detection runs through local inference
- Widget (at least iOS) triggers quick capture

**Web Search (from Step 10):**
- Queries route through Gateway's Brave Search adapter
- Knowledge-graph-first routing: check local data before searching web
- Results rendered in mobile-optimized layout

**Style-Matched Drafting (from Step 11):**
- Style profile loaded from local storage
- Draft generation uses inference with style prompt injection
- StyleMatchIndicator shows match score on mobile drafts

**Settings:**
- Autonomy tier controls read/write real configuration
- Model management shows actual downloaded models
- Network Monitor shows real connection data from Gateway audit trail

**Semantic Search:**
- Search bar queries the local embedding pipeline
- Results from LanceDB rendered with relevance scores
- Works on mobile using the same embedding model as desktop

**Tests:** 25+ tests covering:
- Each screen receives real data (not mock) when backend is connected
- Swipe actions on inbox trigger actual Gateway operations
- Chat messages round-trip through inference and return generated text
- Settings changes persist to SQLite and survive app restart
- Network Monitor reflects actual Gateway traffic

---

### Commit 9: Mobile UX Polish — Touch, Haptic, Notifications

**What:** Complete the mobile-specific UX that distinguishes the mobile experience from a shrunk desktop.

**Touch UX:**
- Swipe gestures on inbox items (react-native-gesture-handler):
  - Swipe right → Archive (with undo toast)
  - Swipe left → Categorize (opens category picker)
  - Long press → Approve/reject for pending autonomous actions
- Pull-to-refresh on inbox, chat history, calendar
- Touch-friendly tap targets (minimum 44×44pt per Apple HIG)

**Haptic Feedback (react-native-haptic-feedback):**
- Light impact: swipe action completion
- Medium impact: autonomous action approved
- Success: email sent, reminder set, sync complete
- Warning: action requires attention, autonomy escalation prompt

**Local Notifications (@notifee/react-native):**
- Proactive insights delivered as system notifications
- Reminder notifications at scheduled times
- Autonomy escalation prompts ("You've approved 10 email categorizations this week. Want me to handle these automatically?")
- Weekly/daily digest notification
- Notification taps deep-link to relevant screen

**iOS Widget (stretch — implement if time permits, do NOT block on this):**
- Quick capture widget: text input that saves to knowledge graph
- If this requires too much native setup, skip and document as a known gap for Step 13

**Android Widget (stretch — same rules as iOS widget):**
- Quick capture widget equivalent

**Design System Compliance:**
All mobile UI must use Trellis design system tokens:
- Colors: `--color-primary` (Warm Amber #E8A04E), `--color-bg` (Deep Ink #1A1A2E), `--color-surface-1` (#252542)
- Typography: Inter for body, JetBrains Mono for code/data
- Spacing: 4px base grid
- Border radius: `--radius-md` (8px) for cards, `--radius-full` for buttons
- Responsive breakpoints: mobile-first, base styles target phone width

**Tests:** 15+ tests covering:
- Swipe gesture recognition triggers correct action
- Haptic feedback fires on action completion
- Notifications schedule and fire at correct time
- Deep links from notifications navigate to correct screen
- All touch targets meet 44×44pt minimum
- Design system tokens used consistently (visual regression or snapshot tests)

---

### Commit 10: Integration Tests + Privacy Audit + Full Suite Verification

**What:** Comprehensive integration testing, privacy verification, and full test suite run. This is the final commit — nothing ships without this passing.

**Integration tests to add/verify:**

```typescript
// tests/integration/mobile-remediation-verification.test.ts

describe('Step 12 Remediation Verification', () => {
  // ROOT CAUSE 1: PlatformAdapter
  it('packages/core/ contains zero Node.js built-in imports (excluding desktop-adapter)', ...);
  it('SemblanceCore initializes with MobilePlatformAdapter', ...);
  it('SQLite operations work through PlatformAdapter on mobile', ...);
  it('File operations work through PlatformAdapter on mobile', ...);

  // ROOT CAUSE 2: Native Inference
  it('iOS bridge returns real generated text, not placeholder', ...);
  it('Android bridge returns real generated text, not placeholder', ...);
  it('InferenceRouter routes tasks to mobile bridge when desktop unavailable', ...);
  it('Streaming inference delivers tokens incrementally', ...);

  // FEATURE PARITY
  it('Universal Inbox displays real emails from IMAP adapter on mobile', ...);
  it('Chat generates real LLM responses on mobile', ...);
  it('Semantic search returns results from LanceDB on mobile', ...);
  it('Web search routes through Gateway on mobile', ...);
  it('Reminders persist and fire notifications on mobile', ...);
  it('Style-matched drafting works on mobile', ...);
  it('Autonomy controls persist changes on mobile', ...);

  // CROSS-DEVICE
  it('mDNS discovery finds desktop device on local network', ...);
  it('State sync transfers preferences between devices', ...);
  it('Sync uses encrypted transport with no cloud relay', ...);
  it('Task routing sends heavy task to desktop when available', ...);
  it('Mobile works offline with local inference when desktop unreachable', ...);

  // PRIVACY
  it('Mobile Gateway audit trail logs all network operations', ...);
  it('No unauthorized network connections from mobile app', ...);
  it('Sync transport connects only to local network addresses', ...);
  it('Model downloads go through Gateway and appear in Network Monitor', ...);
});
```

**Privacy audit:**
- Run the existing privacy audit (`scripts/privacy-audit/`)
- Verify zero violations
- Verify the new guard test (no Node.js builtins in core) passes
- Verify mDNS and sync only use local network addresses

**Full suite verification:**
- Run `npx vitest run` across all test files
- All tests must pass — zero failures, zero skipped
- Report total test count

**Tests:** 30+ new integration tests in this commit alone.

---

## Exit Criteria

Step 12 Remediation is complete when ALL of the following are true:

1. ☐ `packages/core/` contains ZERO direct imports of Node.js built-ins (guard test passes)
2. ☐ `SemblanceCore.initialize()` accepts a `PlatformAdapter` and works with both desktop and mobile adapters
3. ☐ iOS native bridge loads a real model and returns real generated text (not placeholder)
4. ☐ Android native bridge loads a real model and returns real generated text (not placeholder)
5. ☐ `InferenceRouter` works with `MobileInferenceBridge` — tasks route correctly on mobile
6. ☐ Model download works on mobile: WiFi-only enforcement, progress tracking, caching, integrity verification
7. ☐ mDNS device discovery finds devices on local network (native provider implemented)
8. ☐ Encrypted state sync transfers data between devices over local network (no cloud relay)
9. ☐ Universal Inbox displays real emails on mobile (not mock data)
10. ☐ Chat produces real LLM-generated responses on mobile (not placeholder)
11. ☐ Semantic search returns results on mobile using local embeddings
12. ☐ Web search, reminders, quick capture, and style-matched drafting all functional on mobile
13. ☐ Swipe gestures, haptic feedback, and local notifications operational
14. ☐ Settings changes persist and sync between devices
15. ☐ Mobile works offline with on-device inference (degraded but functional)
16. ☐ Privacy audit clean — zero violations
17. ☐ No cloud relay, no external discovery service, no unauthorized network access
18. ☐ All existing tests pass — zero regressions
19. ☐ 150+ new tests from this remediation (cumulative across all 10 commits)
20. ☐ Total test suite passes with zero failures

---

## Approved Dependencies

### New Production Dependencies (Mobile)
- `react-native-fs` — File system access
- `op-sqlite` — SQLite for React Native
- `react-native-device-info` — Hardware detection
- `react-native-quick-crypto` — Crypto operations (or `expo-crypto`)
- `@react-native-community/netinfo` — Network status (WiFi detection)
- `react-native-haptic-feedback` — Haptic feedback
- `@notifee/react-native` — Local notifications
- `react-native-gesture-handler` — Swipe gestures (may already be installed)
- `react-native-reanimated` — Animations (may already be installed)
- `react-native-tcp-socket` — TCP transport for encrypted sync
- `mlx-swift` (iOS native, via SPM or CocoaPods)
- `llama.cpp` (Android native, via CMake from source)

### New Dev Dependencies
- Testing utilities for React Native native modules (if needed)

### NOT Approved (Do Not Add)
- Any cloud service SDK (Firebase, AWS, Azure, Supabase, etc.)
- Any analytics or telemetry package
- Any networking library that bypasses the Gateway
- `expo` (we use bare React Native, not Expo managed workflow — individual expo packages like `expo-crypto` are acceptable if they work in bare workflow)
- Electron, Capacitor, or any alternative to React Native

---

## Autonomous Decision Authority

You may proceed without escalating for:
- Choosing between equivalent packages (e.g., `react-native-quick-crypto` vs `expo-crypto`)
- Implementation details within the architecture defined above
- Test organization and assertion patterns
- Minor PlatformAdapter interface additions if a Core module needs an operation not listed above
- Bug fixes discovered during wiring (document each one)
- Pinning llama.cpp to a specific stable commit instead of `master`

## Escalation Triggers — STOP and Report

You MUST stop and report back to Orbital Directors if:
- MLX Swift cannot be bridged to React Native AND the llama.cpp iOS fallback also fails → we need an architecture discussion
- `op-sqlite` or equivalent SQLite library doesn't support the query patterns used in Core → database adapter needs redesign
- LanceDB cannot run in React Native even through PlatformAdapter → need alternative mobile vector store (this was a pre-identified risk)
- The PlatformAdapter refactor requires changing more than 5 public API signatures in Core → scope is bigger than expected
- Any native module compilation fails on a supported platform and you cannot resolve it within 30 minutes → likely a toolchain issue
- The remediation would require modifying Task Router or IPC Transport logic that was verified working → those are locked

---

## Completion Report

When finished, provide:

```
## Step 12 Remediation — Completion Report

### Exit Criteria Verification
| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Zero Node.js builtins in core | PASS/FAIL | Guard test result |
| ... | ... | ... | ... |

### Test Summary
- Previous test count: 2,281
- New tests added: [number]
- Total tests passing: [number]
- Test files: [number]
- Failures: [number] (must be 0)

### Native Inference Verification
- iOS bridge: [MLX / llama.cpp fallback] — generates real text: [YES/NO]
- Android bridge: llama.cpp — generates real text: [YES/NO]
- Sample output (first 50 chars): "[actual model output]"

### Dependency Substitutions (if any)
- [Package X] replaced with [Package Y] because [reason]

### Escalation Triggers Hit
- [None / description of any triggered]

### Decisions Made
- [List any implementation decisions not explicitly specified above]

### Known Limitations
- [Any remaining gaps, with justification for why they don't block exit criteria]

### Privacy Audit
- Result: CLEAN / [number] violations
- Guard test (no Node.js builtins in core): PASS / FAIL
- Sync transport cloud relay check: PASS / FAIL
```

---

## The Bar

After this remediation, a user picks up their iPhone or Android phone, opens Semblance, and it works. Real inference. Real emails. Real search. Real sync with their desktop. Not mock data. Not placeholder text. Not "coming soon." The phone is a peer device that happens to fit in their pocket.

No stubs. No shortcuts. Production-ready.
