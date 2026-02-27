# Step 31 — Mobile Feature Parity + Performance Optimization

## Implementation Prompt for Claude Code

**Sprint:** 6 — Becomes Undeniable  
**Builds on:** Mobile Foundation (Step 12), All Sprint 5 features (Steps 23–28), Security Hardening (Step 30), All Sprint 4 native integrations (Steps 14–22)  
**Test target:** 60+ new tests. All existing 3,578 tests must pass. TypeScript clean. Privacy audit clean.  
**Baseline:** 3,578 tests, 0 failures, TypeScript clean.

---

## Context

You are implementing Step 31. Steps 1–30 are complete with 3,578 tests, zero failures. This is the third step of Sprint 6 ("Becomes Undeniable").

Step 12 established the mobile foundation: React Native shell, platform adapters, mDNS discovery, encrypted cross-device sync, basic task routing. Sprint 4 (Steps 14–22) added native integrations: contacts, messaging, clipboard, location, weather, voice, cloud storage, financial dashboard, health dashboard. Sprint 5 (Steps 23–28) added sovereignty features: Living Will, Witness, Inheritance Protocol, Semblance Network, Visual Knowledge Graph, Adversarial Self-Defense. Step 30 added security hardening: Argon2id, Ed25519, SQLCipher, biometric auth, encrypted backup.

This step ensures **every feature works on mobile** and the app **performs well on real hardware**.

Read `CLAUDE.md` and `docs/DESIGN_SYSTEM.md` before writing any code.

---

## Architecture Rules — ALWAYS ENFORCED

1. **RULE 1 — Zero Network in AI Core.** Nothing in `packages/core/` touches the network.
2. **RULE 2 — Gateway Only.** All external network calls flow through the Semblance Gateway via IPC.
3. **RULE 3 — Action Signing.** Every Gateway action is signed and audit-trailed.
4. **RULE 4 — No Telemetry.** Zero analytics or tracking.
5. **RULE 5 — Local Only Data.** All data on-device only.

Mobile code lives in `packages/mobile/`. Shared business logic is in `packages/core/`. The mobile app composes from core + gateway + semblance-ui, same as desktop. Platform-specific code uses the `PlatformAdapter` interface.

---

## What You're Building

Two interconnected deliverables:

### 1. Mobile Feature Parity
Every feature from Sprints 3–5 must be accessible on mobile with appropriate mobile adaptations. This is NOT about pixel-perfect replication of desktop layouts — it's about functional equivalence. Every capability the desktop has, mobile must have, adapted for the mobile form factor.

### 2. Performance Optimization
Cold start, inference speed, battery impact, and memory footprint must meet targets on mobile hardware. This includes profiling infrastructure to measure these metrics reliably.

---

## Existing Code to Reuse

**From Step 12 (Mobile Foundation):**
- `packages/mobile/` — React Native shell, navigation, platform adapters
- `packages/mobile/src/adapters/` — MobilePlatformAdapter implementations (contacts, messaging, clipboard, location, etc.)
- Cross-device sync infrastructure (mDNS, encrypted transport)

**From Sprint 4 (Native Integrations):**
- All native adapter implementations in `packages/mobile/src/adapters/`
- Financial, health, and form automation screens already have mobile layouts
- Digital Representative UI components

**From Sprint 5 (Sovereignty Features):**
- All business logic is in `packages/core/` — shared with mobile already
- Living Will, Witness, Inheritance, Network, Knowledge Graph, Adversarial Defense — the logic exists, needs mobile screens/adapters

**From Step 30 (Security):**
- `packages/core/auth/biometric-auth-manager.ts` — BiometricAuthManager
- `packages/core/auth/sensitive-action-guard.ts` — SensitiveActionGuard
- `packages/core/backup/backup-manager.ts` — BackupManager
- BiometricAdapter on PlatformAdapter — needs mobile implementation

**From semblance-ui:**
- `packages/semblance-ui/` — shared component library. Components should work on both platforms. Any that need mobile-specific variants get them here.

---

## Detailed Specification

### Mobile Feature Audit

Every feature below must be verified accessible on mobile. For each: the core logic already exists in `packages/core/`. What's needed is either (a) a mobile screen/component, (b) a mobile PlatformAdapter implementation, or (c) both.

#### Sprint 3 Features (Steps 9–13) — Should Already Work
These were addressed in Step 12's mobile foundation. Verify they still work after Sprint 4/5 changes:
- Runtime ownership + embedding pipeline
- Web search + web fetch + reminders + quick capture
- Communication style learning
- Daily digest + chat-about-document
- Task routing

**Action:** Write verification tests, not new implementations. If something broke, fix it.

#### Sprint 4 Features (Steps 14–22) — Most Should Work
Native integrations were built with mobile in mind. Verify:
- Contacts + relationship intelligence (Step 14)
- SMS/messaging + clipboard intelligence (Step 15)
- Location + weather + contextual awareness (Step 16)
- Voice interaction (Step 17)
- Cloud storage sync (Step 18)
- Full financial awareness (Step 19) — mobile dashboard view
- Digital Representative + subscription cancellation (Step 20) — mobile DR UI
- Form & bureaucracy automation (Step 21) — view mode on mobile, fill on desktop
- Health & wellness (Step 22) — mobile health dashboard

**Action:** Verify each works. Fix regressions. Add mobile-specific tests for any that needed adaptation.

#### Sprint 5 Features (Steps 23–28) — Need Mobile Screens

These are the primary new work for this step:

**1. Alter Ego Verification + Morning Brief (Step 23)**
- Morning Brief should render on mobile (it's primarily text/cards — likely works already via shared components)
- Alter Ego verification mode toggle needs to be accessible from mobile settings

**2. Visual Knowledge Graph (Step 24)**
- D3.js force-directed graph needs mobile adaptation: touch gestures (pinch-zoom, tap-to-select), simplified rendering for smaller screens, reduce node count or LOD for performance
- The knowledge graph is the most performance-sensitive UI component on mobile
- Consider: render as a simpler list/tree view on low-memory devices, with full graph as optional

**3. Import Everything + Adversarial Self-Defense (Step 25)**
- Import triggers (browser history, notes, photos metadata) — most importers are file-based and work cross-platform
- Adversarial Defense UI (dark pattern flags, manipulation alerts) — notification-based, should render on mobile
- DarkPatternTracker insights display on mobile

**4. Living Will (Step 26)**
- Export settings screen on mobile
- Living Will status in mobile settings
- `.semblance` file export — uses platform share sheet on mobile
- Import — file picker on mobile to select `.semblance` archive

**5. Witness Attestation (Step 26)**
- Attestation viewing from audit trail on mobile
- Export/share attestation — uses platform share sheet
- Verification UI on mobile

**6. Inheritance Protocol (Step 27)**
- Configuration UI on mobile (trusted parties, actions, templates)
- This is a settings-heavy feature — forms work well on mobile
- Activation package export — platform share sheet
- Test run accessible on mobile

**7. Semblance Network (Step 28)**
- Network panel showing discovered peers
- Sharing offer/accept flow on mobile
- Shared context viewing
- Revocation controls
- mDNS discovery already works via Gateway — mobile just needs the UI

#### Sprint 6 Features (Steps 29–30) — Need Mobile Screens

**8. Privacy Dashboard (Step 29)**
- Dashboard sections render on mobile (cards, collapsible sections)
- Comparison Statement on mobile
- Proof of Privacy report generation + export on mobile

**9. Security Features (Step 30)**
- Biometric auth — implement `MobileBiometricAdapter`:
  - iOS: Face ID / Touch ID via `react-native-biometrics` or `expo-local-authentication`
  - Android: Fingerprint / face recognition via same
- Encrypted backup — mobile file picker for backup destination
- External drive detection — limited on mobile (primarily USB-C/Lightning connected drives, or AirDrop/Nearby Share as alternative)

### Mobile PlatformAdapter Extensions

The `PlatformAdapter` interface needs these mobile-specific implementations:

```typescript
// BiometricAdapter — CRITICAL for Step 30 integration
interface MobileBiometricAdapter implements BiometricAdapter {
  isAvailable(): Promise<boolean>;
  authenticate(reason: string): Promise<BiometricResult>;
  getAvailableTypes(): Promise<BiometricType[]>;  // 'face-id' | 'touch-id' | 'fingerprint' | 'face-recognition'
}

// File sharing adapter — for Living Will, Witness, Backup exports
interface MobileShareAdapter {
  shareFile(path: string, mimeType: string): Promise<void>;
  pickFile(types: string[]): Promise<string | null>;
}

// Backup location adapter — mobile-specific backup destinations
interface MobileBackupAdapter {
  getAvailableDestinations(): Promise<BackupDestination[]>;
  // On mobile: app documents folder, iCloud Drive / Google Drive (local cache), connected external storage
}
```

### Performance Optimization

#### Cold Start Target: < 3 seconds

Measure from app launch to first interactive screen on:
- **iOS:** iPhone 12 or newer (your fiancée's iPhone for real testing)
- **Android:** Samsung S25 Ultra (your device) AND mid-range simulation (throttle CPU/memory to Pixel 6a equivalent)

Cold start optimization:
1. **Lazy loading:** Don't load all Sprint 5 sovereignty features at startup. Load core + daily features immediately, load Living Will/Inheritance/Network on first access.
2. **Database initialization:** SQLCipher database open is slow on first launch. Pre-initialize schema in background. Don't block UI on schema creation.
3. **Embedding pipeline:** Don't start embedding pipeline until after first interactive screen. Queue initial embeddings but don't process until user has seen the main screen.
4. **LLM warmup:** Defer Ollama/llama.cpp connection check until after cold start completes. Show "AI loading" indicator if user tries to interact before ready.

#### Battery Impact

- Measure battery drain per hour of active use and background use
- Targets: < 5% per hour active, < 1% per hour background
- Optimizations:
  - Reduce sync frequency on battery (4h → 8h for Semblance Network)
  - Pause non-essential background tasks below 20% battery
  - Embedding pipeline batch size reduction on mobile (smaller batches, longer intervals)
  - Knowledge graph visualization: stop animation when app is backgrounded

#### Memory Footprint

- Target: < 200MB RSS on mid-range Android, < 300MB on flagship
- Measure with all features loaded
- Optimizations:
  - Knowledge graph D3 rendering: virtualize nodes off-screen
  - Limit in-memory cache sizes on mobile (reduce from desktop defaults)
  - Release large objects (embedding buffers, graph layouts) when backgrounded

#### Performance Profiling Infrastructure

Create a lightweight profiling module:

```typescript
interface PerformanceProfiler {
  measureColdStart(): Promise<ColdStartMetrics>;
  measureMemoryUsage(): MemoryMetrics;
  measureBatteryImpact(durationMinutes: number): Promise<BatteryMetrics>;
  getPerformanceReport(): PerformanceReport;
}

interface ColdStartMetrics {
  totalMs: number;              // Full cold start time
  databaseInitMs: number;       // SQLCipher + schema
  uiReadyMs: number;            // First interactive screen
  llmReadyMs: number;           // LLM available for queries
  embeddingReadyMs: number;     // Embedding pipeline ready
}

interface MemoryMetrics {
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  externalBytes: number;
  platform: 'ios' | 'android' | 'desktop';
  deviceTier: 'low' | 'mid' | 'high';
}
```

This profiler is a **development tool** — it does NOT phone home, does NOT track usage, and is stripped from production builds (or gated behind a developer mode toggle). It outputs to local logs only.

---

## File Structure

```
packages/mobile/src/
├── screens/
│   ├── privacy/
│   │   ├── PrivacyDashboardScreen.tsx       # Mobile Privacy Dashboard
│   │   └── ProofOfPrivacyScreen.tsx         # Report generation + export
│   ├── sovereignty/
│   │   ├── LivingWillScreen.tsx              # Living Will settings + export
│   │   ├── WitnessScreen.tsx                 # Attestation viewing + sharing
│   │   ├── InheritanceScreen.tsx             # Protocol configuration
│   │   ├── InheritanceActivationScreen.tsx   # Activation flow
│   │   └── NetworkScreen.tsx                 # Semblance Network panel
│   ├── knowledge/
│   │   └── KnowledgeGraphScreen.tsx          # Mobile-adapted knowledge graph
│   ├── security/
│   │   ├── BiometricSetupScreen.tsx          # Biometric enrollment
│   │   └── BackupScreen.tsx                  # Encrypted backup management
│   └── adversarial/
│       └── AdversarialDashboardScreen.tsx    # Dark pattern alerts + defense
├── adapters/
│   ├── mobile-biometric-adapter.ts           # Face ID / Touch ID / fingerprint
│   ├── mobile-share-adapter.ts               # Platform share sheet
│   └── mobile-backup-adapter.ts              # Mobile backup destinations
├── components/
│   ├── MobileKnowledgeGraph.tsx              # Touch-optimized graph visualization
│   ├── SovereigntyStatusCard.tsx             # Living Will / Inheritance status summary
│   └── PerformanceMonitor.tsx                # Dev-only performance overlay
├── performance/
│   ├── profiler.ts                           # Performance measurement
│   ├── cold-start-optimizer.ts               # Lazy loading + deferred initialization
│   ├── memory-manager.ts                     # Mobile memory budget management
│   └── battery-optimizer.ts                  # Battery-aware task scheduling
└── navigation/
    └── sovereignty-navigator.ts              # Navigation routes for Sprint 5 features

packages/core/performance/
├── types.ts                                  # Performance metric types (shared)
├── performance-budget.ts                     # Platform-specific performance budgets
└── lazy-loader.ts                            # Feature lazy-loading infrastructure
```

---

## Commit Strategy

### Commit 1: Mobile PlatformAdapter Extensions (8 tests)

New mobile adapters for Step 30 integration and file sharing:

- `mobile-biometric-adapter.ts`:
  - Implements BiometricAdapter for iOS (Face ID, Touch ID) and Android (fingerprint, face recognition)
  - Uses react-native-biometrics or expo-local-authentication
  - `isAvailable()`, `authenticate()`, `getAvailableTypes()`
  - Graceful fallback: if no biometrics, falls back to device passcode

- `mobile-share-adapter.ts`:
  - Platform share sheet for exporting files (Living Will, Witness attestations, Proof of Privacy, backup archives)
  - `shareFile()`, `pickFile()`
  - iOS: UIActivityViewController
  - Android: Intent.ACTION_SEND

- `mobile-backup-adapter.ts`:
  - Lists available backup destinations on mobile
  - App documents folder (always available)
  - Connected external storage (if accessible)
  - Returns BackupDestination[] compatible with BackupManager

- Register all adapters on MobilePlatformAdapter

**Tests:** tests/mobile/adapters/
1. Biometric adapter reports availability correctly (mock biometric module)
2. Biometric adapter handles 'not enrolled' gracefully
3. Biometric adapter falls back to passcode when biometrics unavailable
4. Share adapter calls platform share sheet with correct MIME type
5. Share adapter handles user cancellation
6. File picker returns selected file path
7. Backup adapter lists app documents as default destination
8. Backup adapter detects connected external storage

### Commit 2: Performance Profiling Infrastructure (7 tests)

- `packages/core/performance/types.ts` — shared metric types
- `packages/core/performance/performance-budget.ts`:
  - Platform-specific budgets: cold start (3s mobile, 5s desktop), memory (200MB mid-range, 300MB flagship, 500MB desktop)
  - `isWithinBudget(metrics, platform, tier)`: validates against budgets
  - Budget definitions are configuration, not hardcoded — can adjust for different hardware

- `packages/mobile/src/performance/profiler.ts`:
  - `measureColdStart()`: timestamps from app launch through each initialization phase
  - `measureMemoryUsage()`: queries React Native's performance API
  - `getPerformanceReport()`: assembles all metrics into a structured report
  - Development-only — no telemetry, no network, local log output

- `packages/core/performance/lazy-loader.ts`:
  - Generic lazy-loading infrastructure for deferred feature initialization
  - `registerFeature(name, loader)`: registers a feature for lazy loading
  - `loadFeature(name)`: loads a feature on first access
  - `preloadFeatures(names)`: background preloads specified features
  - Tracks load times per feature

**Tests:** tests/core/performance/
1. Performance budget validates cold start within limit
2. Performance budget rejects cold start over limit
3. Performance budget adjusts thresholds by platform tier
4. Lazy loader defers feature loading until first access
5. Lazy loader tracks load time per feature
6. Lazy loader preloads specified features in background
7. Performance report includes all metric categories

### Commit 3: Cold Start Optimization (6 tests)

- `packages/mobile/src/performance/cold-start-optimizer.ts`:
  - Defines initialization phases: `'critical'` (UI + auth), `'important'` (daily features), `'deferred'` (sovereignty, knowledge graph)
  - Critical phase: React Native shell, navigation, biometric check, main screen render — target <1.5s
  - Important phase: daily digest, email sync status, calendar data — starts after first render
  - Deferred phase: Living Will, Inheritance, Network, Knowledge Graph, Adversarial Defense — loads on first navigation to those screens

- `packages/mobile/src/performance/memory-manager.ts`:
  - Monitors memory pressure events from the OS
  - `onMemoryWarning()`: releases non-essential caches (knowledge graph layout, shared context cache, stale digest data)
  - Tracks current memory allocation by feature module
  - Enforces per-feature memory caps on mobile

- `packages/mobile/src/performance/battery-optimizer.ts`:
  - Monitors battery level and charging state
  - `getBatteryAwareConfig()`: returns adjusted configuration based on battery:
    - Above 50%: normal operation
    - 20-50%: reduce sync frequency (4h → 8h), reduce embedding batch size
    - Below 20%: pause non-essential background tasks, pause embedding pipeline
  - Charging: restore normal operation regardless of level

**Tests:** tests/mobile/performance/
1. Cold start optimizer classifies features into correct phases
2. Deferred features not loaded during critical phase
3. Deferred features load on first navigation
4. Memory manager releases caches on memory warning
5. Battery optimizer reduces sync frequency below 50%
6. Battery optimizer pauses background tasks below 20%

### Commit 4: Sprint 5 Mobile Screens — Sovereignty (8 tests)

Mobile screens for Living Will, Witness, and Inheritance Protocol:

- `LivingWillScreen.tsx`:
  - Export status card (last export date, scheduled next)
  - Configure export settings (schedule, categories, passphrase)
  - Manual export button → generates `.semblance` → opens share sheet
  - Import button → file picker → confirmation → import flow

- `WitnessScreen.tsx`:
  - List of recent Witness attestations from audit trail
  - Tap attestation → detail view with verification status
  - Share button → exports attestation JSON → share sheet

- `InheritanceScreen.tsx`:
  - Protocol enable/disable toggle
  - Trusted party list with add/edit/remove
  - Per-party: view pre-authorized actions, notification templates
  - Global settings (time-lock, execution mode, deletion consensus)
  - Test Run button

- `InheritanceActivationScreen.tsx`:
  - File picker for `.inheritance` package
  - Passphrase entry
  - Activation flow with status updates

- All screens use `semblance-ui` components. Mobile-specific layout only (stacked cards, full-width forms, bottom sheet for detail views).

**Tests:** tests/mobile/screens/sovereignty/
1. Living Will screen shows export status
2. Living Will export triggers share sheet with correct file
3. Living Will import navigates through confirmation flow
4. Witness screen lists attestations from audit trail
5. Inheritance screen shows trusted party list
6. Inheritance trusted party add form validates required fields
7. Inheritance test run accessible from mobile
8. Inheritance activation handles wrong passphrase gracefully

### Commit 5: Sprint 5 Mobile Screens — Network + Knowledge Graph + Adversarial (8 tests)

- `NetworkScreen.tsx`:
  - Discovered peers list (from mDNS via Gateway)
  - Active sharing relationships with status indicators
  - Offer/accept flow (category selection, confirmation)
  - Revocation controls
  - Sync status per relationship

- `KnowledgeGraphScreen.tsx`:
  - Mobile-adapted D3 visualization OR simplified list/tree view
  - Touch gestures: pinch-zoom, tap-to-select node, drag to pan
  - Reduced node rendering for performance (max 200 visible nodes, LOD for rest)
  - Time slider for knowledge growth (same as desktop but touch-friendly)
  - Falls back to list view on low-memory devices

- `AdversarialDashboardScreen.tsx`:
  - Dark pattern detection alerts as notification cards
  - Manipulation flagging with factual reframes
  - Subscription value-to-cost ratio display
  - Opt-out autopilot status (Alter Ego mode integration)

**Tests:** tests/mobile/screens/
1. Network screen shows discovered peers
2. Network offer flow creates signed offer
3. Network revocation deletes cached context
4. Knowledge graph renders with touch gesture support
5. Knowledge graph falls back to list view on low memory
6. Knowledge graph limits visible nodes on mobile
7. Adversarial dashboard shows dark pattern alerts
8. Adversarial dashboard displays manipulation reframes

### Commit 6: Sprint 6 Mobile Screens — Privacy + Security (8 tests)

- `PrivacyDashboardScreen.tsx`:
  - All 5 dashboard sections in collapsible cards
  - Comparison Statement prominent at top
  - Data inventory with category breakdown
  - Network activity summary (zero exfiltration highlighted)
  - Privacy guarantees checklist

- `ProofOfPrivacyScreen.tsx`:
  - Generate report button (premium-gated)
  - Report history list
  - Export button → share sheet
  - Verification UI for imported reports

- `BiometricSetupScreen.tsx`:
  - Biometric enrollment status
  - Enable/disable biometric protection
  - Test biometric authentication
  - Fallback configuration (PIN/passcode)

- `BackupScreen.tsx`:
  - Backup status (last backup date, destination)
  - Create backup button → destination picker → passphrase → export
  - Restore from backup → file picker → passphrase → confirmation
  - Scheduled backup configuration

**Tests:** tests/mobile/screens/security/
1. Privacy dashboard renders all 5 sections
2. Comparison statement shows correct counts
3. Proof of Privacy blocked for free tier
4. Proof of Privacy export opens share sheet for premium
5. Biometric setup shows available types
6. Biometric setup handles enrollment
7. Backup screen creates encrypted backup
8. Backup restore navigates through passphrase flow

### Commit 7: Navigation + Feature Integration (6 tests)

- `sovereignty-navigator.ts`:
  - Add navigation routes for all new screens
  - Integrate with existing mobile navigation structure
  - Deep link support for sovereignty features (e.g., notification tap → specific attestation)

- Integrate deferred loading from cold-start-optimizer with navigation:
  - Sovereignty screens lazy-load their dependencies on first navigation
  - Knowledge Graph screen triggers D3 loading on first visit
  - Show loading indicator during deferred feature initialization

- Mobile settings screen updates:
  - Add "Your Digital Twin" section with links to Living Will, Inheritance, Network
  - Add "Security" section with links to Biometric, Backup
  - Add "Privacy" section with link to Privacy Dashboard

**Tests:** tests/mobile/navigation/
1. Sovereignty navigator registers all routes
2. Deep link to Witness attestation opens correct screen
3. Deferred features show loading indicator on first navigation
4. Settings screen shows all new sections
5. Navigation from settings to sovereignty screens works
6. Back navigation preserves screen state

### Commit 8: Mobile Regression + Integration Verification (9 tests)

Comprehensive verification that existing features still work after all additions:

**Tests:** tests/mobile/integration/
1. Sprint 3 features accessible: daily digest renders on mobile
2. Sprint 3 features accessible: web search + quick capture works
3. Sprint 4 features accessible: contacts integration returns data
4. Sprint 4 features accessible: voice interaction initializes
5. Sprint 5 features accessible: Living Will export + import round-trip
6. Sprint 5 features accessible: Semblance Network discovery via Gateway IPC
7. Step 30 features accessible: biometric authentication flow
8. Step 30 features accessible: encrypted backup create + restore
9. Performance budget check: cold start phases within budget limits

---

## What NOT to Do

1. **Do NOT pixel-replicate desktop layouts on mobile.** Adapt for the mobile form factor: stacked cards, bottom sheets, full-width forms. Use semblance-ui components with mobile-responsive variants.
2. **Do NOT load all features at startup.** Use lazy loading. Sovereignty features, Knowledge Graph, and Adversarial Defense are deferred until first access.
3. **Do NOT add telemetry to the performance profiler.** It logs locally in development mode only. No network, no tracking.
4. **Do NOT skip biometric adapter implementation.** This is the critical mobile piece of Step 30's biometric auth. Without it, biometric protection doesn't work on mobile.
5. **Do NOT embed D3.js directly in React Native.** Use a WebView-based approach for the knowledge graph, or react-native-svg with a force-directed layout algorithm. D3's DOM manipulation doesn't work in React Native's native render tree.
6. **Do NOT create new business logic.** All feature logic is in `packages/core/`. Mobile code is screens, adapters, and platform-specific integration. If you're writing business logic in `packages/mobile/`, you're probably in the wrong place.
7. **Do NOT add platform-specific networking code.** All network operations go through the Gateway via IPC, same as desktop. The mobile app does not make its own network calls.
8. **Do NOT block the main thread during database initialization.** SQLCipher open should be async and not block first render.

---

## Autonomous Decision Authority

You may proceed without escalating for:
- Screen layout and component composition decisions
- Navigation structure and route naming
- Performance budget threshold tuning (within ±20% of specified targets)
- Lazy loading phase assignments
- Memory cache sizing decisions
- Knowledge graph mobile rendering approach (WebView vs react-native-svg vs simplified list)
- Internal helper functions and utility code

You MUST escalate for:
- Any network code in `packages/mobile/` outside of Gateway IPC
- Any business logic that should be in `packages/core/`
- Any new external dependency (especially biometric or D3 rendering libraries)
- Any change to existing PlatformAdapter interfaces
- Any modification to the security model (biometric, backup, encryption)
- Any decision to skip a feature's mobile adaptation (everything must be accessible)

---

## Repo Enforcement Check

Before committing, verify:

```bash
# No direct network imports in mobile (should use Gateway IPC)
grep -rn "import.*\bnet\b\|import.*\bhttp\b\|import.*\bdns\b" packages/mobile/src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v "__tests__"  # Must be empty (or only test mocks)

# No telemetry in performance profiler
grep -rn "analytics\|telemetry\|tracking\|phone.home\|beacon" packages/mobile/src/performance/ --include="*.ts"  # Must be empty

# No business logic in mobile (check for direct store imports from core)
grep -rn "import.*Store\|import.*Manager\|import.*Generator" packages/mobile/src/screens/ --include="*.tsx" | grep -v "from.*hooks\|from.*context\|from.*providers"  # Should use hooks/context, not direct imports

# No DR imports in core
grep -rn "from.*@semblance/dr" packages/core/ --include="*.ts"  # Must be empty

# All tests pass
npx tsc --noEmit && npx vitest run
```

---

## Exit Criteria Checklist

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | All Sprint 3 features accessible on mobile | Test: daily digest, web search, quick capture, style learning work |
| 2 | All Sprint 4 features accessible on mobile | Test: contacts, messaging, location, voice, cloud storage, financial, health, DR, forms |
| 3 | Sprint 5 features accessible on mobile: Living Will, Witness | Test: export, import, attestation viewing, sharing via share sheet |
| 4 | Sprint 5 features accessible on mobile: Inheritance Protocol | Test: configuration, trusted party management, test run, activation |
| 5 | Sprint 5 features accessible on mobile: Semblance Network | Test: discovery, offer/accept, sync, revocation |
| 6 | Sprint 5 features accessible on mobile: Knowledge Graph | Test: graph renders, touch gestures work, fallback on low memory |
| 7 | Sprint 5 features accessible on mobile: Adversarial Defense | Test: dark pattern alerts, manipulation reframes displayed |
| 8 | Sprint 6 features accessible on mobile: Privacy Dashboard, Proof of Privacy | Test: all dashboard sections render, report generates (premium) |
| 9 | Sprint 6 features accessible on mobile: Biometric auth, Backup | Test: biometric adapter works, backup create + restore |
| 10 | Cold start < 3 seconds on target hardware | Test: profiler validates startup phases within budget |
| 11 | Battery impact acceptable (< 5%/hr active, < 1%/hr background) | Test: battery optimizer reduces operations below thresholds |
| 12 | Memory footprint within budget (< 200MB mid-range, < 300MB flagship) | Test: memory manager enforces caps, releases on pressure |
| 13 | Performance profiling infrastructure available (dev-only) | Test: profiler measures cold start, memory, battery metrics |
| 14 | 60+ new tests. All existing tests pass. Privacy audit clean. | `npx vitest run` — 3,638+ total, 0 failures. `npx tsc --noEmit` clean. |

---

## Test Count

| Commit | Tests | Cumulative |
|--------|-------|------------|
| 1 | 8 | 8 |
| 2 | 7 | 15 |
| 3 | 6 | 21 |
| 4 | 8 | 29 |
| 5 | 8 | 37 |
| 6 | 8 | 45 |
| 7 | 6 | 51 |
| 8 | 9 | 60 |

**Total: 60 new tests. Baseline + new = 3,578 + 60 = 3,638.**

---

## Final Verification

After all commits:

```bash
npx tsc --noEmit                    # Must be clean
npx vitest run                       # Must show 3,638+ tests, 0 failures
```

Report:
1. Exact test count (total and new)
2. TypeScript status
3. List of all new files created with line counts
4. Which existing modules were reused (with file paths)
5. Exit criteria checklist — each criterion (all 14) with PASS/FAIL and evidence
6. Repo enforcement check results
7. Performance budget results: cold start timing, memory footprint, battery optimizer thresholds
8. List of features verified on mobile with their screen locations
9. Any features that required significant mobile adaptation (beyond layout changes) — document decisions made
