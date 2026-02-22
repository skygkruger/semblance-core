# Step 12 — Mobile Feature Parity + Task Routing

## Implementation Prompt for Claude Code
**Date:** February 21, 2026
**Sprint:** 3 (Becomes Powerful)
**Baseline:** Step 11 complete. 1,918 tests passing. Privacy audit clean.
**Canonical references:** Read `CLAUDE.md` and `DESIGN_SYSTEM.md` from the project root before making any implementation decisions.

---

## Context

Steps 9–11 delivered native inference, web search/fetch, reminders/quick capture, and communication style learning — all on desktop. 1,918 tests pass. Privacy audit clean.

Step 12 brings Semblance to mobile. This is the highest-risk step in the project. It involves native inference runtimes on two platforms (MLX on iOS, llama.cpp on Android), cross-device sync over local network, task routing between devices, and porting every feature from Steps 1–11 to touch interfaces. It is also the step that makes Semblance a real product — a desktop-only AI assistant is a hobby project, not a daily driver.

**The strategic frame:** Mobile is a peer device, not a lightweight companion. On-device inference means Semblance works on a phone with no internet, no desktop nearby, and no cloud API. That capability does not exist in any competing product. The user's AI goes with them.

**Critical risk acknowledgment:** MLX on iOS and llama.cpp on Android are relatively new for production use with consumer apps. Model size constraints on mobile (3B default, 1.5B fallback) limit capability compared to desktop (7B+). The mitigation is task routing — heavy work goes to desktop when available, mobile handles classification and quick responses. When desktop is unavailable, mobile works independently at reduced capability. This is acceptable. A user with a phone-only Semblance should still get email triage, quick answers, reminders, and basic drafting. They should NOT expect meeting prep documents or long-form analysis.

---

## Architecture Overview

### What Already Exists

Study these before writing any code:

- **`packages/mobile/`** — React Native scaffolding exists (from Sprint 1). Has `ios/`, `android/`, and `src/` directories. Assess what's there and build on it — do not start from scratch.
- **`packages/core/`** — ALL business logic. This is shared between desktop and mobile. The Core package must work identically on both platforms. If Core currently has Node.js-specific dependencies, you'll need to address compatibility.
- **`packages/gateway/`** — Gateway runs as a process alongside the app. On mobile, it runs in the same app process (React Native doesn't have Tauri's multi-process model). The Gateway's network isolation is still enforced — Core never imports Gateway, IPC protocol is still typed and validated.
- **`packages/semblance-ui/`** — Shared component library. Components here should be usable in React Native. If they're web-only (HTML DOM), you'll need React Native equivalents in `packages/mobile/src/components/`.
- **Cross-Device Sync stubs** — `types` and `registry` exist but mDNS and sync are not implemented.
- **Task Routing** — Listed as "implemented and working" in the codebase audit, but verify what actually exists. It may be types + routing logic without the actual cross-device communication layer.

### Mobile Architecture

```
┌────────────────────────────────────────────────┐
│                  React Native App               │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │   Core   │  │ Gateway  │  │  Mobile UI   │  │
│  │(shared)  │←→│(shared)  │  │(RN screens)  │  │
│  │          │  │          │  │              │  │
│  │ LLM      │  │ Adapters │  │ Inbox        │  │
│  │ Knowledge │  │ Audit    │  │ Chat         │  │
│  │ Agent    │  │ Security │  │ Settings     │  │
│  │ Style    │  │          │  │ Onboarding   │  │
│  └────┬─────┘  └──────────┘  └──────────────┘  │
│       │                                          │
│  ┌────┴─────────────────────────────────────┐   │
│  │         Native Inference Bridge           │   │
│  │  iOS: MLX via Swift bridge                │   │
│  │  Android: llama.cpp via JNI/NDK           │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │       Cross-Device Sync Service           │   │
│  │  mDNS discovery + encrypted local sync    │   │
│  └──────────────────────────────────────────┘   │
└────────────────────────────────────────────────┘
```

### Native Inference on Mobile

**iOS (MLX):**
- MLX is Apple's framework for ML on Apple Silicon. It runs natively on iPhones with A14+ chips (iPhone 12 and later).
- Use `mlx-swift` to run GGUF models via a Swift native module bridged to React Native.
- Default model: 3B parameter (e.g., Llama 3.2 3B Q4_K_M) on devices with 6GB+ RAM.
- Fallback model: 1.5B parameter (e.g., Qwen 2.5 1.5B Q4_K_M) on devices with 4GB RAM.
- Minimum: iPhone 12 (A14 Bionic, 4GB RAM). Below this, inference is not available — the app works in "connected mode" (routes all inference to desktop via task routing, shows "requires desktop connection for AI features" when desktop unavailable).
- Embedding model: nomic-embed-text-v1.5 384-dim variant for mobile (half the desktop dimensionality, significantly smaller memory footprint). If 384-dim is not available as a standard model, use the smallest available variant of nomic-embed or a comparable mobile embedding model.

**Android (llama.cpp):**
- llama.cpp via JNI/NDK. React Native native module wrapping the llama.cpp C++ library.
- Same model tiers as iOS: 3B default (6GB+ RAM), 1.5B fallback (4GB RAM).
- Minimum: Snapdragon 865+ or equivalent with 4GB+ RAM (roughly 2020+ flagship devices).
- Same embedding model approach as iOS.

**Shared InferenceRouter:**
- The existing `InferenceRouter` in `packages/core/llm/` must be extended (not replaced) to support mobile inference backends.
- Desktop uses llama-cpp-2 Rust FFI (Step 9). Mobile uses the native bridge (MLX on iOS, llama.cpp JNI on Android).
- The InferenceRouter's interface stays the same — callers don't know which backend is running. The router detects the platform and uses the appropriate backend.
- If the mobile native bridge is not yet started (model still downloading), the InferenceRouter returns a clear error that the UI handles ("Downloading AI model... X% complete").

### IPC on Mobile

Desktop uses Unix domain sockets / named pipes for Core ↔ Gateway IPC. On mobile, both Core and Gateway run in the same process (React Native's JavaScript thread). The IPC layer must support an **in-process** mode:

- Same `ActionRequest` / `ActionResponse` types.
- Same validation, signing, and audit trail.
- Instead of socket transport, use direct function calls through a thin adapter that preserves the typed interface.
- This means the IPC abstraction must have a transport layer: `SocketTransport` (desktop) and `InProcessTransport` (mobile). The validation pipeline is identical regardless of transport.

If the existing IPC implementation already has this abstraction, use it. If it's hardcoded to sockets, you need to refactor the transport layer. This is a security-critical change — escalate if the refactoring touches the validation or signing logic.

---

## Commit Strategy

This is a large step. 14 commits. Each must compile and pass tests. Some commits are mobile-platform-specific and may not have desktop test coverage — that's acceptable as long as the shared logic is tested.

### Commit 1: IPC Transport Abstraction
`security: refactor IPC to support in-process transport for mobile`

- Refactor the IPC layer to extract a `Transport` interface:
  ```typescript
  interface IPCTransport {
    send(request: ActionRequest): Promise<ActionResponse>;
    start(): Promise<void>;
    stop(): Promise<void>;
  }
  ```
- Implement `SocketTransport` (existing socket-based IPC, used by desktop).
- Implement `InProcessTransport` (direct function calls, used by mobile). The Gateway's validation pipeline runs synchronously in-process — same schema validation, same signing verification, same allowlist check, same audit trail logging.
- The `IPCClient` (used by Core) and `IPCServer` (used by Gateway) must accept a transport at construction time.
- Verify: all existing desktop tests pass with the refactored IPC. The refactor must be a no-op for desktop behavior.
- Tests: InProcessTransport correctly routes requests through the full validation pipeline. Signing still verified. Audit trail still logged. Malformed requests still rejected. Minimum 10 tests.

### Commit 2: Mobile InferenceRouter + Native Bridge Interface
`feat: extend InferenceRouter with mobile inference backend support`

- Extend `packages/core/llm/inference-router.ts` to detect platform and select the appropriate backend:
  - Desktop: existing llama-cpp-2 Rust FFI.
  - iOS: `MLXBridge` interface (implemented as a React Native native module in a later commit).
  - Android: `LlamaCppBridge` interface (implemented as a React Native native module in a later commit).
- Define the native bridge interface:
  ```typescript
  interface MobileInferenceBridge {
    loadModel(modelPath: string, options: ModelOptions): Promise<void>;
    generate(prompt: string, options: GenerateOptions): AsyncIterable<string>;
    embed(text: string): Promise<number[]>;
    unloadModel(): Promise<void>;
    isModelLoaded(): boolean;
    getMemoryUsage(): Promise<{ used: number; available: number }>;
  }

  interface ModelOptions {
    contextLength: number;    // 2048 for mobile default
    batchSize: number;        // 32 for mobile default
    threads: number;          // auto-detect based on device
    gpuLayers?: number;       // Metal layers on iOS, Vulkan on Android if supported
  }
  ```
- Create mock implementations of `MLXBridge` and `LlamaCppBridge` for testing. These mocks return deterministic responses and are used in all non-native tests.
- Hardware detection for mobile: detect RAM, chip, and select model tier (3B/1.5B/none). Extend the existing `HardwareDetector` (from Step 9) with mobile device profiles.
- Tests: InferenceRouter selects correct backend by platform. Mock bridge produces valid output. Hardware detection returns correct tier for simulated mobile devices. Generate options adapt to mobile constraints. Minimum 12 tests.

### Commit 3: iOS Native Module — MLX Bridge
`feat: implement MLX inference bridge as iOS native module`

- Create `packages/mobile/ios/SemblanceMLX/` — Swift native module for React Native.
- Implements `MobileInferenceBridge` interface via React Native's native module system.
- Uses `mlx-swift` to load and run GGUF models.
- Model loading: accepts a file path to a downloaded GGUF model. Manages Metal GPU acceleration automatically.
- Generation: streaming token output via React Native events (not return values). Maps to the `AsyncIterable<string>` interface on the JS side.
- Embedding: runs the embedding model through MLX. Returns float array.
- Memory management: monitors available memory. If memory pressure is detected (iOS memory warning), optionally unloads the model and notifies JS.
- **This commit involves Swift code.** It must compile with `xcodebuild` and the React Native iOS build must succeed. You may need CocoaPods or Swift Package Manager integration.
- Tests: React Native JS tests that verify the bridge interface is callable (using the mock from Commit 2 on non-iOS environments). If you can run iOS-specific tests, test model loading and basic generation. Minimum 5 tests (bridge interface tests; platform-specific tests are best-effort).

### Commit 4: Android Native Module — llama.cpp Bridge
`feat: implement llama.cpp inference bridge as Android native module`

- Create `packages/mobile/android/app/src/main/java/com/semblance/llm/` (or Kotlin) — JNI bridge for llama.cpp.
- Implements `MobileInferenceBridge` interface via React Native's native module system.
- Uses llama.cpp C++ library via JNI. The llama.cpp library is compiled as a shared library (.so) via NDK.
- Model loading: accepts a file path to a downloaded GGUF model. GPU acceleration via Vulkan if available, CPU fallback.
- Generation: streaming token output via React Native events.
- Embedding: same as iOS — runs embedding model through llama.cpp.
- Memory management: monitors available RAM. Respects Android's memory limits for background processes.
- **This commit involves Kotlin/Java + C++ (JNI).** The React Native Android build must succeed with the native module.
- Tests: React Native JS tests verifying bridge interface (using mock). Same approach as iOS. Minimum 5 tests.

### Commit 5: Model Management for Mobile
`feat: add mobile model download, caching, and lifecycle management`

- Extend the existing model management from Step 9 to support mobile:
  - Model registry: same registry, but mobile entries include model variants optimized for mobile (3B, 1.5B).
  - Download manager: same download approach as desktop, but:
    - Downloads go to app-specific storage (iOS: Application Support, Android: internal storage).
    - Progress reporting via React Native state.
    - Resume-capable downloads (mobile connections are unreliable).
    - WiFi-only option: default to WiFi-only for model downloads. Cellular download requires explicit opt-in.
  - Model caching: once downloaded, models persist across app restarts. No re-download needed.
  - Model switching: if the user upgrades their device or frees memory, they can switch from 1.5B to 3B.
  - Storage cleanup: option to delete downloaded models in Settings to free device storage.
- Onboarding flow for mobile (adapts desktop's Step 9 onboarding):
  1. Hardware detection → display device capability and recommended model.
  2. User consent for model download (show size: "Download 1.8 GB AI model over WiFi?").
  3. Download progress.
  4. First inference test ("Hi, I'm [name]. Let me show you what I can do.").
  5. If device is below minimum spec: "Your device can connect to Semblance on your computer for AI features. [Skip AI download]."
- Tests: Model selection for different mobile hardware profiles. Download manager handles WiFi-only restriction. Resume after interruption. Cache persistence. Minimum 10 tests.

### Commit 6: Shared Core Compatibility Audit
`fix: ensure packages/core works in React Native JavaScript environment`

- **This is the critical compatibility commit.** The `packages/core/` codebase was built for Node.js (Tauri backend). React Native uses JavaScriptCore (iOS) or Hermes (Android). There WILL be compatibility issues.
- Audit every import in `packages/core/` for Node.js-specific APIs:
  - `node:fs` → Use a file system abstraction that maps to React Native FS (react-native-fs or expo-file-system).
  - `node:path` → Polyfill or abstract.
  - `node:crypto` → Use react-native-crypto or a pure JS implementation for HMAC signing.
  - `node:net` → Only in ipc-client.ts. Handled by the InProcessTransport from Commit 1.
  - SQLite → Use a React Native SQLite library (e.g., `react-native-quick-sqlite` or `op-sqlite`) that exposes the same synchronous API. Create an abstraction layer if the API differs.
  - LanceDB → Verify React Native compatibility. LanceDB is Rust-native via NAPI — this may NOT work in React Native. If it doesn't, you need a bridge: either compile LanceDB as a native module, or use a mobile-compatible vector store. **ESCALATE if LanceDB doesn't work on mobile** — this is an architectural decision.
- Create `packages/core/platform/` — platform abstraction layer:
  ```typescript
  interface PlatformAdapter {
    fs: FileSystemAdapter;
    crypto: CryptoAdapter;
    sqlite: SQLiteAdapter;
    vectorDb: VectorDbAdapter;
    notifications: NotificationAdapter;
  }
  ```
  - Desktop implementation uses Node.js APIs (existing code, wrapped).
  - Mobile implementation uses React Native equivalents.
  - Core imports platform functionality through this adapter, not directly.
- This commit may require significant refactoring of Core. **Do not change Core's behavior — only change how it accesses platform APIs.** Every existing desktop test must still pass.
- Tests: Platform adapter works with both desktop and mobile implementations (mobile via mocks). All existing Core tests pass. SQLite operations work through the adapter. Minimum 12 tests.

### Commit 7: Mobile App Shell + Navigation
`feat: build mobile app shell with navigation, screens, and design system`

- Build out `packages/mobile/src/`:
  - Navigation: React Navigation stack + bottom tabs.
    - Tab bar: Inbox, Chat, Capture, Settings.
    - Stack screens within each tab as needed (e.g., email detail from Inbox, reminder detail).
  - Screens (scaffold with data wiring — full feature integration in later commits):
    - `InboxScreen` — Universal Inbox adapted for touch. Pull-to-refresh. Swipe actions.
    - `ChatScreen` — Conversational interface. Same chat UX as desktop, adapted for mobile keyboard.
    - `CaptureScreen` — Quick capture. Large text input, submit button, recent captures list.
    - `SettingsScreen` — All settings from desktop, adapted for mobile. AI Engine, Web Search, Writing Style, Autonomy, Network Monitor.
    - `OnboardingFlow` — Mobile-adapted onboarding screens (naming, hardware detection, model download, data connection, Knowledge Moment).
  - Design system: Apply `DESIGN_SYSTEM.md` tokens and patterns to React Native components. Use the same colors, typography scales, and spacing tokens. Create React Native equivalents of semblance-ui components where needed.
  - App icon + splash screen: Use Semblance brand assets. Follow DESIGN_SYSTEM.md for the icon treatment.
- Tests: Navigation structure renders. All screens mount without crash. Design tokens applied correctly. Minimum 8 tests.

### Commit 8: Mobile Feature Wiring — Email + Calendar + Subscriptions
`feat: wire Sprint 2 features into mobile app (email, calendar, subscriptions)`

- Connect mobile screens to the shared Core:
  - **InboxScreen:** Wire to the existing Universal Inbox data source (Core's inbox manager). Display email cards with category badges, priority indicators. Swipe-to-archive, swipe-to-categorize. Tap to expand.
  - **Email actions:** Approve/reject drafts (Guardian mode), view autonomous actions (Partner/Alter Ego). All actions go through the same Orchestrator → IPC → Gateway path.
  - **Calendar:** Calendar view accessible from Inbox or Settings. Shows events, conflict indicators, meeting prep cards.
  - **Subscriptions:** View detected subscriptions and annual cost. No CSV import on mobile (stays desktop) — but subscription data synced from desktop is viewable.
  - **Knowledge Moment:** On first email sync completion, display the Knowledge Moment card (same as desktop).
  - **Weekly Digest:** Display weekly digest as an inbox card.
  - **Autonomy controls:** All three tiers configurable from mobile Settings. Per-domain configuration if already available.
  - **Network Monitor:** Scrollable list of all Gateway actions with timestamps. Same data as desktop.
  - **Action Log:** View all autonomous actions with context.
- Tests: Inbox renders with mock email data. Swipe actions trigger correct Core methods. Calendar renders. Subscriptions display. Network Monitor displays entries. Minimum 10 tests.

### Commit 9: Mobile Feature Wiring — Step 10 + Step 11 Features
`feat: wire Step 10 and Step 11 features into mobile (search, reminders, style)`

- **Web Search:** Chat interface on mobile can trigger web search. Results display in chat with same `WebSearchResult` component (React Native version). Network Monitor shows searches.
- **Web Fetch:** "Summarize this article: [URL]" works in mobile chat. `WebFetchSummary` component adapted for mobile.
- **Reminders:** View, snooze, dismiss reminders from Inbox. Reminder cards adapted for mobile. System notifications for due reminders (React Native push notifications — local, not remote). Snooze/dismiss from notification if platform supports notification actions.
- **Quick Capture:** The Capture tab is the mobile quick capture interface. Large text input, recent captures with their linked context. Time-referenced captures auto-create reminders.
- **Style-Matched Drafting:** Email drafts on mobile use the same style profile (synced from desktop or extracted from mobile-indexed emails). StyleMatchIndicator shown on draft previews.
- **Semantic Search:** "Find..." queries in mobile chat use the local embedding model and vector store. Results displayed in chat.
- Tests: Web search results render in mobile chat. Reminders display and snooze works. Quick capture creates entries and auto-reminders. Style indicator renders on mobile drafts. Minimum 10 tests.

### Commit 10: Cross-Device Discovery — mDNS
`feat: implement mDNS device discovery for local network sync`

- Implement device discovery using mDNS (Bonjour on iOS/macOS, Avahi on Linux, built-in on Android):
  - Each Semblance instance (desktop or mobile) advertises itself on the local network as `_semblance._tcp.local.`
  - Service record includes: device ID (nanoid, generated on first launch and persisted), device name (user-facing, e.g., "Sky's MacBook Pro" or "Sky's iPhone"), device type (`desktop` | `mobile`), protocol version, sync port.
  - Discovery: each instance scans for other `_semblance._tcp.local.` services. When a new device is found, it appears in a "Devices" section in Settings.
  - Pairing: first connection requires explicit user approval on both devices. A 6-digit code is displayed on the initiating device and must be confirmed on the receiving device. After pairing, devices are trusted and sync automatically.
  - Use `react-native-zeroconf` (or equivalent) for React Native mDNS. For Tauri desktop, use `mdns-sd` Rust crate or equivalent.
  - Paired devices stored in SQLite: device ID, name, type, paired timestamp, last seen.
- **Security:** mDNS is local network only. The pairing code prevents a rogue device on the same WiFi from auto-pairing. After pairing, all sync communication is encrypted (see Commit 11).
- Tests: mDNS advertisement and discovery (mock network layer). Pairing flow generates and validates codes. Paired device persistence. Duplicate device handling. Minimum 10 tests.

### Commit 11: Cross-Device State Sync
`security: implement encrypted local-network state sync between devices`

- After devices are paired via mDNS, implement state synchronization:
  - **Sync protocol:** Direct TCP connection between devices on the local network. TLS encrypted using a shared secret derived during pairing (from the 6-digit code + ECDH key exchange).
  - **What syncs:**
    - Preferences and settings (autonomy tiers, per-domain config, search provider config).
    - Action trail (audit trail entries).
    - Style profile (entire StyleProfile JSON).
    - Reminder state (pending reminders, so reminders created on desktop appear on mobile).
    - Quick capture entries (captures from mobile appear on desktop).
    - Device capabilities (what model each device runs, RAM, etc. — used by task routing).
  - **What does NOT sync:**
    - Raw email content (each device fetches its own via IMAP).
    - Raw calendar data (each device syncs via CalDAV).
    - Model weights (each device downloads its own).
    - Embedding vectors (dimensions may differ between desktop and mobile models).
    - Full knowledge graph (too large for real-time sync; each device builds its own).
  - **Conflict resolution:**
    - Preferences: last-write-wins with timestamp. Most recent change wins.
    - Action trail: merge (union of entries by ID — entries are append-only, no conflicts possible).
    - Reminders: merge by ID. If same reminder modified on both devices, last-write-wins.
    - Style profile: desktop profile takes precedence (more data, larger model = better profile).
  - **Sync frequency:** On reconnection after being apart. Then every 60 seconds while both devices are on the same network. Sync is lightweight — only changed items since last sync (delta sync using timestamps).
  - **Offline behavior:** When devices are not on the same network, each operates independently. Full reconciliation on next connection.
- Tests: Sync protocol encrypts data in transit. Preferences sync with last-write-wins. Action trail merges without duplicates. Reminder sync handles concurrent edits. Delta sync only transfers changed items. Offline operation doesn't break. Minimum 15 tests.

### Commit 12: Task Routing
`feat: implement intelligent task routing between desktop and mobile`

- Extend the existing task routing infrastructure (audit showed this as "implemented and working" — verify what exists and build on it):
  - **Task classification:** The Orchestrator classifies each task by complexity:
    - `lightweight`: Email classification, quick responses, reminder management, subscription detection. Runs on mobile (3B model sufficient).
    - `medium`: Email drafting (short), web search query classification, calendar conflict detection. Runs on mobile if 3B model available, routes to desktop if only 1.5B.
    - `heavy`: Meeting prep, long email drafts, document analysis, style extraction, complex reasoning. Routes to desktop when available, degrades gracefully on mobile.
  - **Routing logic:**
    1. Check if task is `lightweight` → run locally on current device.
    2. Check if task is `medium` or `heavy` → check if a paired desktop is available (via sync service connectivity).
    3. If desktop available → send task via sync connection → receive result → display locally.
    4. If desktop unavailable → run locally with mobile model (degraded capability for `heavy` tasks).
  - **Task offloading protocol:** Extends the sync service with a task request/response channel:
    ```typescript
    interface TaskRequest {
      id: string;
      type: 'inference' | 'embedding' | 'analysis';
      payload: unknown;        // Task-specific
      priority: 'high' | 'normal' | 'low';
      timeoutMs: number;       // Default: 30000 for inference, 60000 for analysis
    }

    interface TaskResponse {
      requestId: string;
      status: 'success' | 'error' | 'timeout';
      result?: unknown;
      executedOn: string;      // Device ID that executed the task
      durationMs: number;
    }
    ```
  - **User transparency:** When a task routes to desktop, a subtle indicator appears: "⚡ Processing on MacBook Pro..." The user sees where their work is happening. This is a feature, not an implementation detail.
  - **Failover:** If the desktop becomes unreachable mid-task (network drop), the task fails gracefully. The user gets "Desktop connection lost. Running locally instead..." and the task re-executes on mobile.
- Tests: Task classification is correct for representative tasks. Routing sends heavy tasks to desktop when available. Routing falls back to local when desktop unavailable. Failover handles mid-task disconnection. Transparency indicator fires for routed tasks. Minimum 10 tests.

### Commit 13: Mobile-Specific UX Polish
`feat: add touch gestures, notifications, haptic feedback, and capture widget`

- **Swipe gestures:** On InboxScreen, swipe-right to archive, swipe-left to categorize/action. Use react-native-gesture-handler + react-native-reanimated for fluid animations. Follow DESIGN_SYSTEM.md motion principles (smooth, purposeful, never decorative).
- **Haptic feedback:** Light haptic on swipe threshold. Medium haptic on action confirmation (email sent, reminder created, capture saved). Use react-native-haptic-feedback.
- **Push notifications (local only):**
  - Due reminders → local notification with text and snooze/dismiss actions (if platform supports).
  - Proactive insights → local notification ("Meeting with Sarah in 30 min — prep materials ready").
  - Digest → morning notification with daily summary.
  - NO remote push notifications. No push notification servers. All notifications are scheduled locally by the app.
- **Quick capture widget (stretch goal):**
  - iOS: Today Widget or Lock Screen Widget (WidgetKit). Tap → opens capture input → submit → done.
  - Android: App Widget. Same flow.
  - If widget development is prohibitively complex (requires significant native code beyond what's already built), defer and document. The in-app Capture tab is the minimum viable implementation.
- Tests: Swipe gestures trigger correct actions. Haptic feedback fires on correct events. Local notifications schedule correctly for due reminders. Minimum 8 tests.

### Commit 14: Privacy Audit + Integration Tests + Full Suite Verification
`security: mobile privacy audit, integration tests, and full test suite verification`

- **Privacy audit for mobile:**
  - `packages/core/` still has zero network imports (guard test passes).
  - Mobile native modules (MLX bridge, llama.cpp bridge) do NOT make network calls. Verify Swift/Kotlin code.
  - mDNS is local network only — no internet traffic.
  - Sync communication is encrypted (TLS with pairing-derived keys).
  - Local notifications only — no remote push notification servers.
  - Model downloads go through the Gateway's web fetch path (audit trailed and visible in Network Monitor).
  - No telemetry SDKs in the React Native project. No analytics. No crash reporting services.
  - Audit `package.json` for any React Native dependencies that phone home. Remove or replace if found.
- **Integration tests:**
  - End-to-end: Mobile app launches → onboarding detects hardware → model downloads → first inference succeeds → chat works.
  - End-to-end: Mobile creates reminder → syncs to desktop → desktop shows reminder → snooze on desktop → syncs back to mobile.
  - End-to-end: User asks complex question on mobile → task routes to desktop → result appears on mobile → Network Monitor shows the routing.
  - End-to-end: Mobile offline → all core features work locally (email triage, reminders, quick capture, chat) → mobile reconnects to network → syncs with desktop.
  - End-to-end: User drafts email on mobile → style profile applied → style score shown → draft sent through Gateway.
  - Platform adapter: Core operations work through mobile platform adapter (SQLite, file system, crypto).
  - IPC: InProcessTransport correctly validates, signs, and logs all actions.
- **Full test suite:** Run ALL tests (desktop + mobile shared). Report exact count from test runner.
- Tests: Minimum 15 integration and privacy tests. All existing 1,918 tests pass.

---

## Exit Criteria

Every criterion must be verified. Do not claim completion unless ALL pass.

1. Mobile app launches and completes onboarding on iOS and Android (hardware detection, model download consent, first inference, Knowledge Moment).
2. MLX inference produces real text on iOS (via native bridge, verified by integration test or native test).
3. llama.cpp inference produces real text on Android (via native bridge, verified by integration test or native test).
4. All Sprint 2 features functional on mobile: email triage, autonomous actions, calendar, subscriptions (view), Knowledge Moment, weekly digest, autonomy controls, Network Monitor, action log.
5. Web search and web fetch work on mobile (from Step 10).
6. Reminders and quick capture work on mobile (from Step 10). Local notifications fire for due reminders.
7. Style-matched email drafting works on mobile with style score display (from Step 11).
8. Semantic search returns results on mobile using local embedding model.
9. Task routing classifies tasks by complexity and routes heavy tasks to paired desktop when available.
10. mDNS device discovery finds other Semblance instances on local network. Pairing flow works with 6-digit code.
11. State sync works: preferences, action trail, reminders, style profile, and captures sync between paired devices. Encrypted in transit.
12. Mobile works offline with on-device inference (degraded but functional for lightweight/medium tasks).
13. Touch UX implemented: swipe gestures on inbox, haptic feedback on actions, pull-to-refresh.
14. Quick capture widget functional on at least one platform (iOS or Android). In-app Capture tab is the minimum.
15. InProcessTransport maintains full validation pipeline (signing, schema validation, allowlist, audit trail).
16. Platform abstraction layer works for both desktop and mobile (Core shared without platform-specific imports).
17. Privacy audit clean: no network access from Core, no telemetry, no remote push, sync is encrypted local-only.
18. 100+ new tests. All existing 1,918 tests pass. Total verified by test runner output.

---

## Approved Dependencies (Mobile-Specific)

These packages are approved for mobile. Do not add dependencies not on this list without escalating.

**React Native Core:**
- `react-native` (already in project)
- `react-native-reanimated` (already specified in tech stack)
- `@react-navigation/native` + `@react-navigation/bottom-tabs` + `@react-navigation/stack` — Navigation
- `react-native-gesture-handler` — Swipe gestures
- `react-native-screens` — Native screen containers (performance)
- `react-native-safe-area-context` — Safe area handling

**Native Capabilities:**
- `react-native-haptic-feedback` — Haptic feedback
- `react-native-fs` or `expo-file-system` — File system access
- `react-native-quick-sqlite` or `op-sqlite` — SQLite for React Native
- `react-native-zeroconf` — mDNS discovery
- `react-native-push-notification` or `notifee` — Local notifications
- `react-native-crypto` or a pure-JS HMAC implementation — Cryptographic operations

**Native Inference (platform-specific, not npm packages):**
- `mlx-swift` — iOS, via Swift Package Manager
- `llama.cpp` — Android, via NDK/CMake

**Explicitly NOT approved:**
- `expo` (full framework) — too heavy, too many dependencies
- Any analytics, crash reporting, or telemetry package
- Any remote push notification service
- `react-native-webview` (unless specifically needed for a contained use case)

---

## What This Step Does NOT Include

- **Sprint 4 features on mobile** — No contacts, SMS, location, weather, voice, financial dashboard, forms, or health. Those come in Step 26.
- **App Store submission** — Step 27.
- **Mobile performance optimization** — Step 26. This step gets features working. Step 26 optimizes.
- **iOS/Android widgets (hard requirement)** — Stretch goal. The in-app Capture tab is sufficient. Widget is additive.
- **Cloud relay for sync** — No cloud. If devices aren't on the same network, they don't sync. That's the design.
- **Tablet-specific layouts** — Use phone layout on tablets. Tablet-optimized layouts are post-launch polish.

---

## Escalation Rules

Escalate to Orbital Directors if:
- **LanceDB doesn't work in React Native.** This is a potential architectural blocker. If the Rust NAPI bindings don't compile for mobile, we need an alternative vector store strategy for mobile (e.g., compile LanceDB as a native module, use a simpler vector search implementation on mobile, or use SQLite-vss).
- **MLX Swift integration with React Native is fundamentally incompatible.** If mlx-swift cannot be bridged to React Native via native modules, we need an alternative iOS inference path.
- **Core refactoring for platform compatibility requires changes to the IPC protocol, validation, or signing logic.** These are security-critical.
- **The InProcessTransport creates a security gap** where Core could bypass Gateway validation. If in-process execution makes it possible for Core to call Gateway methods directly (bypassing the validation pipeline), the architecture needs review.
- **Memory pressure on mobile causes OOM crashes during inference.** If even the 1.5B model causes crashes on minimum-spec devices, we need to adjust the minimum device requirements.
- Any dependency not on the approved list.

Do NOT escalate for:
- React Native layout/styling issues.
- Platform-specific build configuration.
- Navigation structure decisions.
- Animation/gesture tuning.
- Test structure decisions.

---

## Completion Report

When you believe all exit criteria are met, provide:

1. **Exit criteria checklist** — each criterion with PASS/FAIL and evidence.
2. **Test count** — exact number from test runner output. Before and after.
3. **New files created** — list with one-line descriptions. Separate by platform (shared / iOS / Android / mobile-shared).
4. **Modified files** — list with what changed and why.
5. **Platform compatibility** — explicit list of Node.js APIs that were abstracted and how.
6. **Escalated items** — anything you escalated or deferred with justification.
7. **LanceDB status** — does it work on mobile? If not, what was the alternative?
8. **Native module status** — MLX bridge compiles on iOS? llama.cpp bridge compiles on Android? Any platform-specific issues?
9. **Privacy audit result** — PASS/FAIL with details.
10. **Deferred items** — stretch goals deferred (widgets, etc.).
11. **Performance notes** — any observed inference speed, memory usage, or battery impact data.
12. **Risks** — anything uncertain or needing review.

---

## Remember

This is the step where Semblance goes from "a desktop AI app" to "my AI that's always with me." The phone is the most personal device a human owns — it goes everywhere, it knows everything, it's the first thing they check in the morning and the last thing they touch at night.

When Semblance runs on that device — locally, privately, with no cloud dependency — something fundamental shifts. The user's AI isn't a tab they visit. It's a presence on their most intimate device, processing their world entirely under their control.

That's not a feature. That's the product.

Build it.
