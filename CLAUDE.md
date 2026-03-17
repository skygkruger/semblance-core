# SEMBLANCE

## NO STUBS. NO DE-FLAGGING. REAL CODE ONLY.

**This rule is absolute and non-negotiable.**

- Every function, method, and code path must contain a REAL working implementation — not an empty body, not a hardcoded return, not a no-op.
- If a function cannot be fully implemented yet because it depends on a runtime integration (e.g., Tauri plugin not yet wired), it MUST explicitly delegate to the mock adapter and document WHY with a TODO referencing the sprint where it will be completed. Follow the `desktop-contacts.ts` pattern.
- You may NEVER remove or reword a comment that flags a stub (TODO, FIXME, PLACEHOLDER, "stub", "not implemented") to make it pass a grep check. That is falsifying the record. The grep checks exist to catch incomplete work — defeating them defeats the purpose.
- If a stub grep fires, the correct response is to IMPLEMENT the code or HONESTLY label it as a TODO with a sprint reference. Never de-flag.
- Empty function bodies, empty callback bodies, and methods that return hardcoded null/false/empty without doing real work are stubs regardless of whether they have a comment saying so.
- This rule survives compaction.

---

## MANDATORY RUNTIME VERIFICATION WORKFLOW — NON-NEGOTIABLE

**This rule is equal in importance to the NO STUBS rule. It survives compaction.**

### The Problem This Solves
Code that compiles, type-checks, and passes all unit tests can still be completely broken at runtime. The Semblance project has repeatedly shipped builds where TypeScript was clean, 6,214 tests passed, the code reviewer said "SHIP" — and the app didn't work. Chat returned errors. Connectors faked "Connected" without doing anything. File indexing produced nothing. This workflow makes that failure mode structurally impossible.

### The Rules

**1. DIAGNOSE BEFORE FIX:** When a feature is reported broken, you MUST run the sidecar directly and read the actual error output before writing any fix. Do not analyze source code and guess. Run `node scripts/smoke-test-sidecar.js` or manually start the sidecar with `echo '{"id":1,"method":"initialize","params":{}}' | node packages/desktop/src-tauri/sidecar/bridge.cjs 2>&1` and read what it says.

**2. SMOKE TEST AFTER EVERY BACKEND CHANGE:** After ANY change to `bridge.ts`, `lib.rs`, `native_runtime.rs`, or any IPC handler, you MUST run `/smoke` (the sidecar smoke test) and include the output in your report. Static checks (tsc, vitest) alone are NOT sufficient to report a task as complete.

**3. INTEGRATION TEST BEFORE BUILD:** Before running `npx tauri build`, you MUST run `/diagnose` (the integration smoke test at `scripts/smoke-test-sidecar.js`). This sends real JSON-RPC requests to the sidecar and verifies responses. If any test fails, fix it before building.

**4. PREFLIGHT BEFORE SHIP:** Before reporting any build as ready to install, you MUST run `/preflight` and include the full checklist output. Every item must show ✅ or have an explicit documented reason for ⚠️.

**5. NO LYING ABOUT RESULTS:** You may NEVER use the phrases "all checks pass", "TypeScript clean", "tests pass", "build successful", "chat works", "connectors work", or "SHIP" without attaching the raw terminal output that proves them. Summarizing is lying. Show the output.

**6. ERRORS ARE INFORMATION:** When a runtime test fails, the error message tells you what to fix. Read it. Do not guess based on source code. The sidecar has extensive diagnostic logging (`console.error('[sidecar] ...')`). The log output is the source of truth.

**7. THE APP MUST ACTUALLY WORK:** The final test is: does a human user get a coherent response when they type a message in Chat? Does clicking "Connect" on a connector start a real OAuth flow? Does adding a directory to Files produce indexed documents? If the answer to any of these is "no", the task is not complete regardless of how many static checks pass.

### Available Commands
- `/smoke` — Run sidecar smoke test (does it start?)
- `/diagnose` — Run integration smoke test (does it respond to requests?)
- `/preflight` — Full pre-build checklist (all gates)
- `/review` — Code review (static analysis, architecture, design bible)

### Mandatory Workflow for Any Backend Fix
```
1. Reproduce the problem (run sidecar, see the error)
2. Read the error, identify root cause
3. Write the fix
4. Run /smoke — sidecar starts without crashing
5. Run /demo-check — ALL 7 demo features pass (NO exceptions)
6. Run /diagnose — all integration tests pass
7. Run /preflight — all gates green
8. Build
9. Report with FULL /demo-check output attached
```

**NON-NEGOTIABLE:** `/demo-check` output must be attached to every SHIP report.
A build reported as "ready" without `/demo-check` output is a lie regardless of TypeScript or test status.

### This Rule Survives Compaction

---

## MANDATORY CONTEXT — READ ON EVERY SESSION START AND AFTER EVERY COMPACTION

**Before doing ANY work, read this document:**

1. **Design Bible** (located in the private `semblence-representative` repo at `docs/DESIGN_BIBLE.md`, path: `C:\Users\skyle\desktop\world-shattering\semblence-representative\docs\DESIGN_BIBLE.md`) — Canonical design bible. Defines colors, typography (DM Sans / Fraunces / DM Mono / Josefin Sans), spacing, opal texture system, opal border system, shimmer effects, golden standard component patterns, severity colors, motion, responsive breakpoints, the reactive dot matrix background, CSS architecture conventions, and native tokens. **Read before creating or modifying ANY UI component, marketing material, or user-facing content.** If you have not read it in this session, stop and read it now. This file is in the private repo intentionally — do NOT copy it into the public semblance-core repo.

This instruction survives compaction.

**Current position:** Final Validation + Ship.

**Build state (2026-03-05):**
- All 109 Storybook components wired into production screens (commit `af01443`)
- Windows desktop binary built successfully via `npx tauri build`
- Artifacts: MSI (83MB), NSIS EXE (59MB), raw EXE (41MB) at `packages/desktop/src-tauri/target/release/bundle/`
- TypeScript: clean (0 errors). Vite: 558 modules. Rust: release profile compiled.
- ~40 IPC commands + ~200 lines IPC types added for full component wiring
- Binary is unsigned (SmartScreen warning expected)
- Android/iOS builds require manual setup (signing keys, certificates, Mac access for iOS)

---

**Your Intelligence. Your Device. Your Rules.**

Semblance is a fully local, self-hosted sovereign personal AI. It ingests a user's emails, files, calendar, messages, health data, financial records, and browser history into a local knowledge graph. It reasons about their life using locally-running language models. It acts as their agent in the world. User data never leaves their device. Ever.

Semblance is not a chatbot. It is not an assistant. It is a digital semblance — a representation of the user that understands their world, acts on their behalf, and is architecturally incapable of betraying their trust.

---

## Product Philosophy

Semblance is positioned as **"more capable because it's private"** — NOT "private."

The product's structural advantage is that because it has ALL the user's data — locally, permanently, compounding — it can do things no cloud AI assistant can do. A cloud assistant starts every session at zero. Semblance starts every session with the accumulated understanding of the user's entire digital life. That gap widens every day and is unbridgeable without becoming surveillance infrastructure.

**The product is judged by actions taken and time saved, not information surfaced.** Every feature should bias toward doing something, not showing something. The audit trail and undo capabilities exist to make aggressive autonomy trustworthy.

When implementing any feature, ask: "Does this take an action on the user's behalf, or does it just show them information?" Bias toward action. When in doubt, implement the active version with appropriate autonomy controls.

**Privacy is the reason the capability is possible, and the proof that it's trustworthy.** It is not the headline — it is the second sentence.

---

## Architecture Rules — NON-NEGOTIABLE

These rules are absolute. No exception. No workaround. No "temporary" violation. Any code that breaks these rules is a critical security incident regardless of intent.

### RULE 1 — Zero Network in AI Core

The AI Core process must NEVER import, reference, call, or use any networking library, API, or capability. This includes but is not limited to:

**Banned in AI Core — any file under `packages/core/`:**
- `fetch`, `XMLHttpRequest`, `WebSocket`
- `http`, `https`, `net`, `dgram`, `dns`, `tls` (Node.js built-ins)
- `axios`, `got`, `node-fetch`, `undici`, `superagent` (third-party HTTP)
- `socket.io`, `ws` (WebSocket libraries)
- Any Rust crate that provides network capabilities (`reqwest`, `hyper`, `tokio::net`, `std::net`)
- Any code that resolves DNS, opens sockets, or makes outbound connections

**Approved exceptions:**
- `node:net` in `packages/core/agent/ipc-client.ts` ONLY — for Unix domain socket / named pipe IPC (local, not internet)
- `ollama` npm package in `packages/core/llm/` ONLY — runtime check refuses non-localhost URLs

**How to verify:** The automated privacy audit (`scripts/privacy-audit/`) scans all imports and FFI calls in the AI Core. This runs on every commit in CI. A failure blocks the merge.

**If you need external data in the AI Core:** Send a typed action request to the Gateway via IPC. The Gateway fetches the data, validates the response, and passes it back through the IPC channel. The AI Core never touches the network directly.

### RULE 2 — Gateway Only

ALL external network calls MUST flow through the Semblance Gateway (`packages/gateway/`). The Gateway is the sole process with network entitlement.

**The Gateway accepts ONLY:**
- Typed, schema-validated action requests from the AI Core via IPC
- Requests that match a user-authorized service on the allowlist
- Requests that pass rate limiting and anomaly detection checks

**The Gateway rejects:**
- Arbitrary URLs or raw HTTP requests
- Requests to domains not on the user's allowlist
- Requests that fail schema validation
- Requests that trigger anomaly detection thresholds

### RULE 3 — Action Signing and Time Tracking

Every action that passes through the Gateway MUST be:
1. Cryptographically signed with a request ID, timestamp, action type, and payload hash
2. Logged to the append-only audit trail (SQLite WAL) BEFORE execution
3. Verified against the audit log after execution with the response recorded
4. Tagged with an `estimated_time_saved_seconds` field in the audit trail entry

No action may execute without a log entry. No log entry may be modified after creation. The audit trail is append-only and tamper-evident.

**Time-saved tracking** is part of the audit trail data model from Sprint 2 onward. Every logged action includes an estimated time the user would have spent doing this manually. This powers the weekly digest. The field is required on all action log entries — set to `0` for actions where time savings are not applicable. Do NOT retrofit this later — it must be in the schema from the first Sprint 2 commit.

### RULE 4 — No Telemetry

Zero analytics. Zero telemetry. Zero crash reporting. Zero usage tracking. Zero third-party SDKs that phone home. This applies to:
- The AI Core
- The Gateway
- The desktop app
- The mobile app
- The component library
- Every test, script, and build tool

No exceptions. Not even "anonymous" or "aggregated" data. Not even opt-in. The architecture makes telemetry impossible, not optional.

### RULE 5 — Local Only Data

All user data must be stored exclusively on the user's device:
- Knowledge graph (LanceDB)
- Embeddings
- Structured data (SQLite)
- Preferences and configuration
- Action history and audit trail
- Model weights and inference state

No cloud sync. No cloud backup. No remote storage of any kind. If the device is off, the data is inaccessible. That is the point.

---

## Technology Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| Desktop App | Tauri 2.0 (Rust + Web frontend) | Native webview, system tray, OS integration |
| Mobile App | React Native + react-native-reanimated | Peer device, not a companion. Full local inference. |
| LLM Runtime (Desktop) | Ollama (default) / llama.cpp (power) / MLX (macOS) | User-selectable |
| LLM Runtime (iOS) | MLX (default) / llama.cpp (fallback) | MLX optimized for Apple Silicon |
| LLM Runtime (Android) | llama.cpp | Best ARM cross-platform support |
| Vector Database | LanceDB (embedded, Rust-native) | No server process |
| Structured Storage | SQLite | Relational data, action logs, audit trail |
| Embedding | all-MiniLM-L6-v2 / nomic-embed-text | Local only. No cloud embedding APIs. |
| Agent Framework | Custom orchestration with function-calling | Typed action requests, approval flows |
| UI Framework | React + Tailwind CSS + Radix UI + semblance-ui | See Design Bible (private repo) |
| Shared Logic | TypeScript (strict mode) | Business logic shared desktop/mobile |
| Performance Core | Rust | Embedding, search, crypto, IPC |

---

### Available Commands
- `/smoke` — Run sidecar smoke test: `node scripts/smoke-test-sidecar.js`
- `/verify` — Full feature slice verification: `node scripts/semblance-verify.js`
- `/verify:diff` — Compare to last run: `node scripts/semblance-verify.js --diff`
- `/preflight` — Full pre-build gate (TypeScript + tests + stubs + privacy + sidecar + P0): `node scripts/preflight.js`
- `/preflight:fast` — TypeScript + tests + stubs + privacy only (no sidecar): `node scripts/preflight.js --fast`
- `/install-verify` — Silent MSI install + post-install smoke: `node scripts/install-and-verify.js`
- `/install-verify:check` — Verify installed binary without reinstalling: `node scripts/install-and-verify.js --no-install`
- `/diagnose` — Integration smoke test: `node scripts/smoke-test-sidecar.js`
- `/review` — Code review (static analysis, architecture, design bible)
- `/verify:json` — Machine-readable verify output: `node scripts/semblance-verify.js --json`
- `update-state` — Auto-patch SEMBLANCE_STATE.md from verify output: `node scripts/update-state.js`
- `update-state:dry` — Preview state patches without writing: `node scripts/update-state.js --dry-run`
- `/session-start` — Automated Phase 1: read state, run baseline, detect regressions: `node scripts/session-start.js`
- `/session-start:quick` — State review only (skip verify): `node scripts/session-start.js --skip-verify`
- `/session-end` — Automated Phase 3: verify, diff, preflight, update state, END report: `node scripts/session-end.js`
- `/session-end:build` — Session end for build sessions (includes install-verify): `node scripts/session-end.js --build`
- `/checkpoint` — Log mid-session progress (survives compaction): `node scripts/checkpoint.js "description"`
- `/checkpoint:read` — Read all checkpoints this session: `node scripts/checkpoint.js --read`
- `/build-all` — Full build pipeline (preflight → bundle → build → install-verify): `node scripts/build-and-verify.js`
- `/canary` — Run canary tests for recurring failure patterns: `npx vitest run tests/canary/`

## Consumer Inference Strategy (Post-Demo Priority)

**Next major initiative after demo + bug fixes.** Canonical plan: `semblence-representative/docs/BITNET_CONSUMER_INFERENCE_PLAN.md` (private repo).

**Summary:** Add BitNet.cpp (Microsoft's 1-bit LLM framework) as the default consumer inference backend. Ships a 2B model (~0.4GB) that runs at 29ms/token on CPU — no GPU, no Ollama, no setup. Slots into the existing InferenceRouter as a new `BitNetProvider` alongside NativeProvider and OllamaProvider. Zero breaking changes to orchestrator, knowledge graph, or frontend.

**Provider priority:** Ollama (GPU) > BitNet (CPU default) > NativeRuntime (fallback).

Do NOT start implementation until demo is complete and critical bugs are resolved.

---

## Payment & License System

The Semblance app makes zero outbound API calls. Ever.

Stripe processes payments via Stripe-hosted checkout (system browser, not in-app).
A Cloudflare Worker receives Stripe webhooks, generates Ed25519-signed license keys,
and delivers them via Resend email. The app detects license emails and activates silently.
All license validation is offline against a public key compiled into the binary.

License key format: sem_<header>.<base64payload>.<ed25519_signature>
Tiers: 'founding' | 'digital-representative' | 'lifetime'
Storage: OS keychain via Tauri secure storage. Never localStorage. Never plain files.

Key files:
- packages/core/premium/premium-gate.ts — PremiumGate class, activateLicense(), isPremium()
- packages/core/premium/license-keys.ts — Ed25519 signature verification
- packages/core/premium/license-email-detector.ts — SEMBLANCE_LICENSE_KEY pattern detection
- packages/desktop/src/contexts/LicenseContext.tsx — React context, openCheckout(), manageSubscription()
- infrastructure/license-worker/ — Cloudflare Worker (deployed, do not modify without Orbital Director approval)

Canonical reference: SEMBLANCE_PAYMENT_SYSTEM.md in Orbital Command project.

RULE: Never add Veridian server calls to the app. Never store license data outside OS keychain.
Never use "Premium" in user-facing copy — always "Digital Representative".

---

### Approved Dependencies

Add dependencies conservatively. Every dependency is attack surface. Before adding any new dependency:

1. Check if the functionality can be achieved with existing dependencies or standard library
2. Verify the package is actively maintained, widely used, and has no known security issues
3. Prefer dependencies with zero or minimal transitive dependencies
4. Document the justification in the commit message

**Pre-approved (no justification needed):**
- `ollama` (JS client for local Ollama)
- `lancedb` (vector database)
- `better-sqlite3` (SQLite binding)
- `@tauri-apps/*` (Tauri framework)
- `react`, `react-dom`, `react-native` (UI frameworks)
- `tailwindcss`, `@radix-ui/*` (styling/components)
- `zod` (schema validation — used for Gateway action protocol)
- `nanoid` (ID generation)
- `date-fns` (date handling)

**Requires justification (document in PR):**
- Any HTTP/networking library (Gateway only, must explain why existing approach is insufficient)
- Any cryptographic library beyond Web Crypto API / Node.js `crypto`
- Any native module or binary dependency
- Any library over 500KB bundled size
- Any library with more than 20 transitive dependencies

**Banned (never add):**
- Analytics SDKs (Segment, Mixpanel, Amplitude, PostHog, etc.)
- Error tracking SDKs that phone home (Sentry, Bugsnag, Datadog, etc.)
- Any dependency that makes network calls as part of its initialization or normal operation
- Electron (we use Tauri)

---

## Project Structure

```
/
├── CLAUDE.md                        # This file — read first, always
├── docs/
│   ├── (DESIGN_BIBLE.md lives in private semblence-representative repo)
│   ├── ARCHITECTURE.md              # System architecture deep-dive
│   ├── PRIVACY.md                   # Privacy architecture and audit methodology
│   └── decisions/                   # Orbital Director architecture decisions
│       └── MOBILE_PARITY_PATCH.md   # Mobile elevated to peer device (LOCKED IN)
├── packages/
│   ├── core/                        # AI Core — NO NETWORK ACCESS
│   │   ├── llm/                     # LLM integration (Ollama, llama.cpp, MLX)
│   │   ├── knowledge/               # Knowledge graph, embeddings, entity resolution
│   │   ├── agent/                   # Orchestration, tool-use, approval flows, task routing
│   │   └── types/                   # Shared TypeScript type definitions
│   ├── gateway/                     # Semblance Gateway — SOLE NETWORK ACCESS
│   │   ├── ipc/                     # IPC protocol handler
│   │   ├── services/                # Service-specific adapters (email, calendar, etc.)
│   │   ├── security/                # Action signing, allowlist, rate limiting
│   │   └── audit/                   # Append-only audit trail
│   ├── desktop/                     # Tauri desktop application
│   │   ├── src-tauri/               # Rust backend
│   │   └── src/                     # Web frontend
│   ├── mobile/                      # React Native mobile application
│   │   ├── ios/
│   │   ├── android/
│   │   ├── src/
│   │   └── src/inference/           # Platform-specific inference (MLX iOS, llama.cpp Android)
│   └── semblance-ui/                # Shared component library
│       ├── components/              # UI components
│       ├── tokens/                  # Design tokens (colors, spacing, typography)
│       └── hooks/                   # Shared React hooks
├── scripts/
│   └── privacy-audit/               # Automated privacy verification (runs in CI)
└── tests/
    ├── privacy/                     # Privacy guarantee tests
    ├── gateway/                     # Gateway isolation and security tests
    └── integration/                 # End-to-end tests
```

### Boundary Rules

- **`packages/core/`** — NEVER import from `packages/gateway/` or any networking code. The only external communication is via the typed IPC channel.
- **`packages/gateway/`** — NEVER import from `packages/core/` knowledge graph or user data stores. It receives structured action requests and returns structured responses. It does not reason about user data.
- **`packages/semblance-ui/`** — Pure presentation. No business logic. No data fetching. No side effects beyond UI state.
- **`packages/desktop/`** and **`packages/mobile/`** — Compose from `core`, `gateway`, and `semblance-ui`. Platform-specific code only.
- **`packages/mobile/src/inference/`** — Platform-specific inference runtime (MLX on iOS, llama.cpp on Android). May import from `packages/core/` types but NOT from `packages/gateway/` or `packages/desktop/`.
- **`packages/core/agent/task-router.ts`** — Query complexity assessment and routing decisions. Pure logic, no platform-specific code.
- **`packages/core/agent/device-handoff.ts`** — Desktop discovery and handoff protocol. Uses local network only — NO cloud relay, NO external discovery service.

---

## IPC Protocol — AI Core ↔ Gateway

All communication between the AI Core and Gateway uses a typed, validated protocol over local IPC (Unix domain socket on macOS/Linux, named pipe on Windows).

### Action Request Schema

```typescript
interface ActionRequest {
  id: string;                    // Unique request ID (nanoid)
  timestamp: string;             // ISO 8601
  action: ActionType;            // Discriminated union of all supported actions
  payload: ActionPayload;        // Action-specific typed payload
  source: 'core';                // Always 'core' — Gateway never initiates
  signature: string;             // HMAC-SHA256 of id + timestamp + action + payload hash
}

type ActionType =
  | 'email.fetch'
  | 'email.send'
  | 'email.draft'
  | 'calendar.fetch'
  | 'calendar.create'
  | 'calendar.update'
  | 'finance.fetch_transactions'
  | 'health.fetch'
  | 'service.api_call';          // Generic authorized API call

// Each ActionType has a corresponding typed payload
interface EmailSendPayload {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  replyToMessageId?: string;
}
```

### Action Response Schema

```typescript
interface ActionResponse {
  requestId: string;             // Matches the request
  timestamp: string;
  status: 'success' | 'error' | 'requires_approval' | 'rate_limited';
  data?: unknown;                // Action-specific response data
  error?: { code: string; message: string };
  auditRef: string;              // Reference to the audit trail entry
}
```

### Audit Trail Entry Schema

```typescript
interface AuditTrailEntry {
  id: string;                           // Unique entry ID
  requestId: string;                    // Matches ActionRequest.id
  timestamp: string;                    // ISO 8601
  action: ActionType;
  payloadHash: string;                  // SHA-256 of the payload
  status: 'pending' | 'success' | 'error' | 'rejected';
  autonomyTier: 'guardian' | 'partner' | 'alter_ego';
  approvalRequired: boolean;
  approvalGiven: boolean | null;        // null if not yet decided
  estimatedTimeSavedSeconds: number;    // REQUIRED from Sprint 2 — time user would have spent
  responseHash: string | null;          // SHA-256 of response, null if pending
  chainHash: string;                    // Hash of this entry + previous chainHash (tamper evidence)
}
```

### Validation Flow

1. AI Core constructs an `ActionRequest` with typed payload
2. AI Core signs the request
3. Request is sent to Gateway via IPC
4. Gateway validates: schema → allowlist → rate limit → anomaly check
5. Gateway logs to audit trail (BEFORE execution) — including `estimatedTimeSavedSeconds`
6. Gateway executes the action using user's credentials
7. Gateway logs the response to audit trail
8. Gateway returns `ActionResponse` to AI Core via IPC

If ANY validation step fails, the request is rejected and logged as a failed attempt. The AI Core receives an error response.

---

## Mobile Architecture — Peer Device

> Decision record: `docs/decisions/MOBILE_PARITY_PATCH.md`

Mobile is a peer device, not a companion. It runs full local inference and participates in intelligent task routing with desktop.

### Model Defaults

| Device Class | Available RAM | Default Model | Fallback |
|-------------|--------------|---------------|----------|
| Capable (iPhone 15 Pro+, flagship Android) | 6GB+ | Llama 3.2 3B Q4 / Phi-3-mini 3.8B Q4 | 1B models |
| Constrained (older devices) | <6GB | Llama 3.2 1B / Gemma 2B | — |

Device capability is assessed at first launch and periodically. User can always override the default.

### Task Routing

The `TaskRouter` in `packages/core/agent/` decides where to run inference:

- **Local:** Conversational queries, retrieval, email triage, calendar, quick lookups, standard drafts
- **Desktop handoff:** Complex multi-step reasoning, large document analysis, heavy multi-tool orchestration

Handoff is seamless and invisible to the user. Desktop discovery via mDNS/Bonjour over local network. Handoff uses IPC action request format over local TLS with mutual authentication.

If desktop is unavailable, mobile always runs locally with the best available model.

### Model Caching

- Primary model stays loaded in memory while app is foregrounded
- Graceful unload on OS memory pressure (iOS background tasks, Android onTrimMemory)
- Model weights cached on device storage for fast reload (<2s target)
- Default model cache budget: 4GB (user configurable)

### Rules

- Mobile inference code lives in `packages/mobile/src/inference/`
- Task routing logic lives in `packages/core/agent/task-router.ts`
- Desktop discovery and handoff protocol lives in `packages/core/agent/device-handoff.ts`
- The handoff protocol MUST use mutual TLS authentication — no unauthenticated local network connections
- Model downloads and caching MUST go through the Gateway (respecting allowlist)
- Device capability detection MUST NOT phone home — all assessment is local hardware inspection

---

## Design System

**Read the Design Bible before creating or modifying ANY UI component.** (Located in private repo: `semblence-representative/docs/DESIGN_BIBLE.md`)

The design bible is the sole canonical visual reference. It covers brand philosophy, colors, typography, spacing, opal texture/border systems, shimmer effects, golden standard component patterns, severity colors, motion, responsive breakpoints, the reactive dot matrix, and CSS architecture conventions.
Colors: Background #0B0E11, Veridian #6ECFA3, Caution #B09A8A, Critical #B07A8A, Silver #8593A4.
Never use var() in React inline styles — hex values only.

Key principles (details in DESIGN_BIBLE.md):
- Agency on your behalf — "I've got this. You don't need to worry."
- Warm darkness with luminous accent — deep backgrounds, Veridian teal life signal
- Understated intelligence — anticipatory, "already done," never showy
- Purposeful motion — every animation communicates something, never decorative
- Dark theme is primary and default — light theme is future consideration, not launch priority

If the design system doesn't cover a specific scenario, escalate to Orbital Directors rather than improvising.

---

## Repository Split — Public/Private Boundary

Semblance is split across two repositories:

### semblance-core (Public, MIT/Apache 2.0)
- **Remote:** https://github.com/skygkruger/semblance-core.git
- **Contains:** All free-tier features + open-core premium features
- **Open-core premium features** are source-visible and publicly auditable but runtime-gated via `PremiumGate.isPremium()`. These are sovereignty features where public auditability strengthens trust:
  - Living Will (Step 26) — encrypted digital twin export
  - Semblance Witness (Step 26) — cryptographic action attestation
  - Inheritance Protocol (Step 27) — pre-authorized posthumous actions
  - Adversarial Self-Defense (Step 25) — dark pattern detection, financial advocacy
  - Morning Brief (Step 23) — proactive daily briefing
  - Visual Knowledge Graph (Step 24) — interactive knowledge visualization
  - Alter Ego Week (Step 23) — trust-building activation sequence
  - Import Everything (Step 25) — browser history, notes, photos, messaging import
  - Shared attestation infrastructure (Step 26) — signing, verification, JSON-LD format
- **Classification rule:** Features that *prove, preserve, or protect* user data belong here. Their value comes from trust, and auditability strengthens that trust.

### semblence-representative (Private, Proprietary)
- **Remote:** https://github.com/skygkruger/semblence-representative.git
- **Package name:** `@semblance/dr` (note: repo name typo "semblence" is intentional/locked)
- **Contains:** Digital Representative agency capabilities — features where Semblance *acts on the user's behalf*:
  - Representative email mode + style-matched drafting
  - Subscription cancellation workflows + follow-up tracking
  - Customer service templates
  - Form & Bureaucracy automation (PDF auto-fill, smart field mapping)
  - Health & Wellness tracking (HealthKit integration, pattern correlation)
  - Premium finance modules (Plaid integration, transaction categorization)
  - Premium UI components
- **Classification rule:** Features that *act as the user's agent* in the world belong here. Their commercial value is in the implementation — the email drafting algorithms, cancellation workflow logic, form auto-fill heuristics.
- **Integration:** Loaded via `loadExtensions()` → `@semblance/dr` → `createExtension()` with typed `ExtensionInitContext`.

### How to Classify New Features

When implementing a new premium feature, determine which repo it belongs in:

| Question | If Yes → | If No → |
|----------|----------|---------|
| Does this feature *act on behalf of* the user (send emails, cancel subscriptions, fill forms, execute transactions)? | `semblence-representative` (proprietary) | Continue below |
| Does this feature *prove, preserve, or protect* user data (export, attest, verify, detect threats, visualize)? | `semblance-core` (open-core, premium-gated) | Continue below |
| Is this feature primarily about *trust and auditability*? | `semblance-core` (open-core) | Ask Orbital Directors |

**When in doubt:** If public auditability of the source code would *increase* user trust in the feature, it belongs in semblance-core. If the feature's value is in proprietary implementation logic, it belongs in semblence-representative.

### Premium Gating in Open-Core Features

Open-core premium features in semblance-core use `PremiumGate.isPremium()` at their entry points (exporters, generators, handlers). Internal helper functions and shared infrastructure (e.g., attestation signing, archive building) are NOT gated — they may be used by both free and premium code paths.

Do NOT create a "grant all" bypass or disable the premium gate in open-core features. The gate is the revenue protection layer. The open source code is the trust layer. Both are required.

### Enforcement

- The open core must be fully functional without premium features installed
- No proprietary DR code (`@semblance/dr`) may be imported from `packages/core/`
- Premium-gated open-core features must use `PremiumGate.isPremium()` at entry points
- If you're unsure whether a new premium feature belongs in semblance-core (open-core) or semblence-representative (proprietary), use the classification table above and escalate if still unclear

---

## Autonomy Framework

User autonomy is configured per-domain at three tiers. **Partner is the default onboarding selection.** Guardian is the conservative opt-down. Alter Ego is positioned as the aspirational destination.

| Tier | Name | Behavior | Default For |
|------|------|----------|-------------|
| 1 | **Guardian** | Prepare actions, show preview, wait for explicit approval | Finances, legal, new integrations |
| 2 | **Partner** | Routine actions autonomous, novel/high-stakes require approval, daily digest | **Default onboarding selection.** Email, calendar, health |
| 3 | **Alter Ego** | Acts as user for nearly everything, interrupts only for genuinely high-stakes | Users who opt in. Aspirational, not hidden. |

Every action, regardless of autonomy tier, is logged to the Universal Action Log with full context (what, why, when, what data was used, estimated time saved) and is reviewable and reversible where possible.

### Autonomy Escalation (Active)

Semblance actively encourages autonomy escalation based on approval patterns:
- After 10 consecutive approvals of the same action type in Guardian: suggest upgrading that action type to Partner
- After consistent Partner mode success across a domain: suggest Alter Ego with concrete explanation of what changes
- Escalation prompts are opt-in, contextual, and tied to demonstrated success

### Per-Feature Implementation Requirements

For every agent action implemented, the following are ALL required:
1. The action itself
2. Autonomy tier behavior (what happens in Guardian vs. Partner vs. Alter Ego)
3. Action log entry with full context
4. Undo capability where the action is reversible
5. `estimatedTimeSavedSeconds` value for the audit trail
6. Escalation prompt logic (when to suggest granting more autonomy for this action type)

---

## Development Workflow

### Build Model

```
Orbital Directors (Human + Claude in conversation)
    → Define architecture, features, priorities
    → Produce canonical documents

Claude Code (this terminal)
    → Executes implementation based on Orbital Director decisions
    → References this CLAUDE.md and DESIGN_BIBLE.md
    → Escalates when outside guardrails

Gemini (Antigravity)
    → Independent audit of architectural decisions and privacy claims
    → Reviews sprint output for compliance
```

### When to Escalate to Orbital Directors

You MUST escalate (do not proceed independently) when:
- The task requires an architectural decision not covered by this document
- The task touches security-critical components (Gateway, IPC, action signing, audit trail, sandboxing)
- The task requires adding a new external dependency not on the pre-approved list
- The design system doesn't cover the UI scenario you're implementing
- You're unsure whether a new premium feature belongs in semblance-core (open-core) or semblence-representative (proprietary) — use the classification table in the Repository Split section first, escalate if still unclear
- The task would change the IPC protocol schema
- The task would modify the privacy audit pipeline
- You encounter a conflict between this document and the brand design system
- The task involves the device handoff protocol (requires Gemini audit)

### When to Proceed Independently

You should proceed without escalating when:
- The task is clearly within the architectural guardrails defined here
- You're implementing a feature specified in the sprint plan using approved patterns
- You're writing tests for established functionality
- You're refactoring for clarity or performance without changing interfaces
- You're fixing a bug that doesn't touch security-critical paths
- The design system clearly covers the UI work required

---

## Code Quality Standards

### TypeScript
- Strict mode everywhere. `"strict": true` in tsconfig.
- No `any` types. Use `unknown` and narrow with type guards.
- All function parameters and return types explicitly typed.
- Prefer `interface` over `type` for object shapes.
- Use `zod` schemas for runtime validation of external data (IPC messages, file parsing, API responses in Gateway).

### Rust
- Used for performance-critical paths: embedding computation, vector search, cryptographic operations, IPC transport.
- Follow standard Rust conventions (clippy clean, no unsafe without documented justification).
- All public functions documented with doc comments.

### Testing
- **Privacy tests (`tests/privacy/`):** Verify that the AI Core has no network capability. Scan imports, verify process isolation, test that network calls from Core are blocked at OS level. These are the most important tests in the project.
- **Gateway tests (`tests/gateway/`):** Verify schema validation rejects malformed requests. Verify allowlist enforcement. Verify audit trail integrity. Verify rate limiting.
- **Integration tests (`tests/integration/`):** End-to-end flows: user asks question → Core reasons → Core sends action to Gateway → Gateway executes → response flows back → audit trail is correct.
- All agent actions must have tests verifying the action is logged before execution.
- All agent actions must have tests verifying `estimatedTimeSavedSeconds` is present in the audit trail entry.
- All approval flows must have tests verifying Guardian/Partner/Alter Ego behavior.
- All autonomy escalation prompts must have tests verifying trigger conditions.

### Commits
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `security:`
- Use `security:` prefix for any change touching Gateway, IPC, audit trail, or sandboxing
- Meaningful descriptions. Not "fix bug" — describe what was wrong and what was changed.
- One logical change per commit.

---

## Sprint Plan Reference

> **Canonical sources:** `docs/decisions/SEMBLANCE_SPRINT_RESTRUCTURE.md` (Revision 3, Steps 1–13) and `docs/decisions/SEMBLANCE_BUILD_MAP_ELEVATION.md` (Revision 4, Steps 14–33).

Refer to `SEMBLANCE_BUILD_MAP_REVISION_2.md` for full, past sprint details including all exit criteria.

---

## Future Feature: Desktop Voice (Push-to-Talk STT/TTS)

**Status:** Architecture complete, native integration not wired. Voice button correctly hidden on desktop via `isSTTReady() → false` gate.

**Current state:** `createDesktopVoiceAdapter()` in `packages/core/platform/desktop-voice.ts` returns an honest not-ready adapter. The `useVoiceInput` hook, `AgentInput` mic button, and `ChatScreen` voice wiring are all in place — they will activate automatically once `isSTTReady()` returns `true`.

**What's needed to make voice operational:**

1. **Whisper.cpp for STT** — Add `whisper-rs` crate to `packages/desktop/src-tauri/Cargo.toml`. This wraps whisper.cpp and compiles from source during `cargo build`. Requires CMake + MSVC (already available). Increases compile time (~5-10 min first build) and binary size (~15-30MB).

2. **Audio capture** — Add `cpal` crate for cross-platform microphone input. Records PCM audio, feeds to whisper. Write Rust functions for `start_capture()` / `stop_capture()` that buffer audio in memory.

3. **TTS** — Add `tts` crate (wraps Windows SAPI / macOS AVSpeechSynthesizer / Linux speech-dispatcher). Simpler than bundling Piper as a sidecar, uses platform-native voices. Alternatively, bundle Piper for higher-quality voices.

4. **Tauri commands** — Expose as IPC commands in `src-tauri/src/`:
   - `start_capture` — begin mic recording
   - `stop_capture` — stop and return PCM buffer
   - `transcribe` — feed audio to whisper, return text
   - `synthesize` — feed text to TTS, return audio
   - `play_audio` — play synthesized audio through speakers
   - `is_stt_ready` — check if whisper model exists on disk
   - `get_available_voices` — list TTS voices

5. **Whisper model management** — Whisper-tiny (~75MB) or whisper-base (~140MB) model must be downloaded on first use. Implement download-and-cache flow through the Gateway (respects allowlist). Store in app data directory. `is_stt_ready` checks for model presence.

6. **Rewrite TypeScript adapter** — `createDesktopVoiceAdapter()` dynamically imports `@tauri-apps/api/core` and calls the Tauri commands above (same pattern as `createDesktopClipboardAdapter()` with clipboard plugin).

7. **Microphone permissions** — Configure Tauri's audio-capture permission in `capabilities/`. `hasMicrophonePermission()` / `requestMicrophonePermission()` call OS permission APIs through Tauri.

**Key files to modify:**
- `packages/desktop/src-tauri/Cargo.toml` — add whisper-rs, cpal, tts
- `packages/desktop/src-tauri/src/` — new voice module with Tauri commands
- `packages/desktop/src-tauri/capabilities/` — audio-capture permission
- `packages/core/platform/desktop-voice.ts` — rewrite adapter to call Tauri commands
- `packages/desktop/src-tauri/tauri.conf.json` — permission declarations

**Cannot be verified from terminal** — requires runtime testing with real microphone and speakers. The implementation can compile-pass and type-check, but functional verification requires a human speaking into the mic.

**Sovereignty note:** All voice processing is local. Whisper runs on-device. TTS runs on-device. No audio data leaves the machine. This is consistent with Rule 1 (Zero Network in AI Core).

---

---

## FOLLOW THE DATA — MANDATORY PIPELINE VERIFICATION

**This rule is equal to NO STUBS and MANDATORY RUNTIME VERIFICATION. It survives compaction.**

### The Problem This Solves

Code that compiles, passes IPC tests, and has all handlers registered can still produce zero data for the user. This is the pipeline gap failure mode: OAuth connects, the handler exists, IPC responds — but no sync trigger fires, so the knowledge graph stays empty, the inbox shows nothing, and the AI says it has no access to the user's data. This has cost days of work repeatedly.

### The Rule

**Before declaring any feature that moves data between systems complete, you MUST:**

1. **Produce a pipeline map** using `/data-map` format, tracing the complete path from data source to database row to UI output — BEFORE writing any code. Post to Sky. Wait for approval.

2. **Run `node scripts/data-audit.js`** after implementation and confirm expected database rows exist. Not your judgment. The actual row count from the database.

3. **Confirm the consuming handler returns real data.** Call the IPC method manually and confirm the response contains real objects, not `[]`.

### What "Data Flows" Means

A pipeline is complete when ALL of these are true:
- Write path runs: sync/indexing produces database rows with the correct `source` field value
- `data-audit.js` shows the expected source has document count > 0
- Read path runs: IPC handler queries the local index, not a live external API
- IPC response contains real data when called manually against the live sidecar
- AI tool for this data returns real results when asked in chat

A pipeline is NOT complete when:
- "The code should work" — the database either has data or it doesn't
- IPC returns `[]` — always means the pipeline is broken or empty
- The handler exists but was never connected to a sync trigger
- Tests pass but the feature produces nothing for a real user

### New Commands

```
/data-audit       — node scripts/data-audit.js
                    Reads every database. Reports OAuth tokens, document counts by source,
                    pipeline gaps, hardcoded stubs. Run at START and END of every session.

/pipeline-check   — .claude/commands/pipeline-check.md
                    Full pipeline integrity protocol and session report format.

/pipeline-fix     — .claude/commands/pipeline-fix.md
                    Required protocol for resolving pipeline gaps.

/data-map         — .claude/commands/data-map.md
                    Required pipeline map format. Written and approved BEFORE implementing
                    any data-movement feature.
```

### Updated Mandatory Session Flow

```
SESSION START:
  1. Read SEMBLANCE_STATE.md
  2. Read SLICE_CONTRACTS.md for today's features (including DATA ASSERTIONS)
  3. node scripts/semblance-verify.js   ← IPC baseline
  4. node scripts/data-audit.js         ← DATA baseline (MANDATORY — NEW)
  5. For data-movement features: write pipeline map → post to Sky → wait for approval
  6. Post START report (must include data-audit output)

WORK:
  - Diagnose: sidecar + data-audit — actual errors AND actual data state
  - Verify after every change: semblance-verify AND data-audit for pipeline work
  - Smoke after every backend change
  - Never self-report without terminal output

SESSION END:
  1. node scripts/semblance-verify.js   ← IPC comparison
  2. node scripts/data-audit.js         ← DATA comparison (MANDATORY — NEW)
  3. node scripts/preflight.js
  4. Resolve all in-scope pipeline gaps (VERDICT must be HEALTHY)
  5. Update SEMBLANCE_STATE.md
  6. Post END report with before/after data-audit output
```

### Mandatory Workflow for Any Data-Movement Feature

```
1. Write pipeline map (/data-map format) — post to Sky — receive approval
2. Implement write path + read path + AI tool path
3. node scripts/bundle-sidecar.js
4. Trigger sync manually via sidecar
5. node scripts/data-audit.js — source must show >0 documents
6. Call consuming IPC handler manually — must return real data, not []
7. node scripts/smoke-test-sidecar.js
8. node scripts/semblance-verify.js
9. node scripts/preflight.js
10. Report with full data-audit.js output attached

NEVER report a data-movement feature done without data-audit.js output confirming rows exist.
```

### This Rule Survives Compaction

---

## WORKFLOW SYSTEM — MANDATORY SESSION DISCIPLINE

**These documents are in the private representative repo. Claude Code must read and update them on every session.**

### Cross-Repo Reference
This repo: `C:\Users\skyle\desktop\world-shattering\semblance\` (semblance-core, public)
Private docs: `C:\Users\skyle\desktop\world-shattering\semblence-representative\docs\`

### Required Documents

**1. SEMBLANCE_STATE.md** — Living memory. Read at session START. Write at session END.
`C:\Users\skyle\desktop\world-shattering\semblence-representative\docs\SEMBLANCE_STATE.md`
Contains: current build state, feature verification status (✅⚠️❌🔲), environment prerequisites, cut list, active issues with exact error messages, session velocity, session log, locked decisions.

**2. SLICE_CONTRACTS.md** — Top-down feature contracts. Read before implementing or fixing any feature.
`C:\Users\skyle\desktop\world-shattering\semblence-representative\docs\SLICE_CONTRACTS.md`
Contains: full data path for each feature, exact response shapes, numbered assertions that define done, known failure modes. **If no contract exists for a feature, stop and tell Orbital Director.**

**3. SESSION_PROTOCOL.md** — Three-phase session discipline. Read once, follow always.
`C:\Users\skyle\desktop\world-shattering\semblence-representative\docs\SESSION_PROTOCOL.md`

**4. DEMO_SCRIPT.md** — Investor demo screenplay. Read before any demo-prep session.
`C:\Users\skyle\desktop\world-shattering\semblence-representative\docs\DEMO_SCRIPT.md`
Contains: 10-beat demo screenplay, beat-to-contract mapping, beat dependency graph, fallbacks, pre-demo checklist, cut list. Critical path: Beats 1→2→3→4→9.

**5. DESIGN_BIBLE.md** — Canonical design spec. Read before any UI work.
`C:\Users\skyle\desktop\world-shattering\semblence-representative\docs\DESIGN_BIBLE.md`

### Mandatory Session Flow
```
SESSION START:
  1. Read SEMBLANCE_STATE.md
  2. Read SLICE_CONTRACTS.md for today's features
  3. Run: node scripts/semblance-verify.js  (baseline)
  4. Post START report to Sky

WORK:
  - Diagnose before fix (run sidecar, read actual error)
  - Verify after every change (node scripts/semblance-verify.js --feature=X)
  - Smoke after every backend change (node scripts/smoke-test-sidecar.js)
  - Never self-report — attach terminal output

SESSION END:
  1. Run: node scripts/semblance-verify.js  (compare to baseline)
  2. Run: node scripts/preflight.js
  3. Run gap detection (adjacent code scan)
  4. Run: node scripts/update-state.js  (auto-patch feature table)
  5. Manually update remaining SEMBLANCE_STATE.md sections
  6. Post END report to Sky
```

A session without a START report and END report is an incomplete session.
A feature without passing slice contract assertions is not done.

### This Rule Survives Compaction

## Remember

The entire foundation of Semblance is trust. Every line of code either builds trust or erodes it. There is no neutral ground. When in doubt between convenience and security, choose security. When in doubt between speed and correctness, choose correctness. When in doubt between assumption and escalation, escalate.

The user is trusting us with everything. Build accordingly.

And remember: the product is judged by what it does, not what it shows. Build the active version.