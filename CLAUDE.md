# SEMBLANCE

**Your Intelligence. Your Device. Your Rules.**

Semblance is a fully local, self-hosted sovereign personal AI. It ingests a user's emails, files, calendar, messages, health data, financial records, and browser history into a local knowledge graph. It reasons about their life using locally-running language models. It acts as their agent in the world. User data never leaves their device. Ever.

Semblance is not a chatbot. It is not an assistant. It is a digital semblance — a representation of the user that understands their world, acts on their behalf, and is architecturally incapable of betraying their trust.

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

### RULE 3 — Action Signing

Every action that passes through the Gateway MUST be:
1. Cryptographically signed with a request ID, timestamp, action type, and payload hash
2. Logged to the append-only audit trail (SQLite WAL) BEFORE execution
3. Verified against the audit log after execution with the response recorded

No action may execute without a log entry. No log entry may be modified after creation. The audit trail is append-only and tamper-evident.

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
| Mobile App | React Native + react-native-reanimated | First-class interface, not a companion |
| LLM Runtime | Ollama (default) / llama.cpp (power) / MLX (Apple) | User-selectable |
| Vector Database | LanceDB (embedded, Rust-native) | No server process |
| Structured Storage | SQLite | Relational data, action logs, audit trail |
| Embedding | all-MiniLM-L6-v2 / nomic-embed-text | Local only. No cloud embedding APIs. |
| Agent Framework | Custom orchestration with function-calling | Typed action requests, approval flows |
| UI Framework | React + Tailwind CSS + Radix UI + semblance-ui | See DESIGN_SYSTEM.md |
| Shared Logic | TypeScript (strict mode) | Business logic shared desktop/mobile |
| Performance Core | Rust | Embedding, search, crypto, IPC |

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
│   ├── DESIGN_SYSTEM.md             # Canonical design reference — read before any UI work
│   ├── ARCHITECTURE.md              # System architecture deep-dive
│   └── PRIVACY.md                   # Privacy architecture and audit methodology
├── packages/
│   ├── core/                        # AI Core — NO NETWORK ACCESS
│   │   ├── llm/                     # LLM integration (Ollama, llama.cpp, MLX)
│   │   ├── knowledge/               # Knowledge graph, embeddings, entity resolution
│   │   ├── agent/                   # Orchestration, tool-use, approval flows
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
│   │   └── src/
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

### Validation Flow

1. AI Core constructs an `ActionRequest` with typed payload
2. AI Core signs the request
3. Request is sent to Gateway via IPC
4. Gateway validates: schema → allowlist → rate limit → anomaly check
5. Gateway logs to audit trail (BEFORE execution)
6. Gateway executes the action using user's credentials
7. Gateway logs the response to audit trail
8. Gateway returns `ActionResponse` to AI Core via IPC

If ANY validation step fails, the request is rejected and logged as a failed attempt. The AI Core receives an error response.

---

## Design System

**Read `/docs/DESIGN_SYSTEM.md` before creating or modifying ANY UI component.**

The design system is the canonical visual reference. It defines colors, typography, spacing, components, motion, and responsive breakpoints. Every UI element must conform to the design system.

Key principles (details in DESIGN_SYSTEM.md):
- Calm confidence — restraint over noise, white space as feature
- Warm intelligence — rounded, soft, approachable, not clinical
- Transparency by design — privacy and activity indicators always visible
- Motion with purpose — smooth transitions that communicate state, never decorative
- Progressive disclosure — power users see depth, casual users see simplicity

If the design system doesn't cover a specific scenario, escalate to Orbital Directors rather than improvising.

---

## Repository Separation — Public vs. Private

### Public Repository: `semblance-core`

All code in this repository is open source (MIT or Apache 2.0). It contains:
- AI Core (LLM integration, knowledge graph, agent orchestration)
- Semblance Gateway (network isolation, action signing, audit trail)
- Desktop and mobile apps with Tier 1 features
- semblance-ui component library
- Privacy audit tools
- Full documentation

### Private Repository: `semblance-premium`

Premium features are proprietary and live in a separate repository:
- Advanced agent autonomy (full Alter Ego capabilities)
- Financial intelligence (bank integration, subscription management, anomaly detection)
- Digital Representative mode (voice matching, negotiation playbooks)
- Health & wellness analytics (pattern correlation, insight engine)
- Relationship intelligence (social graph, relationship health)
- Premium integrations and connectors

### Enforcement

- NEVER place premium feature code in `semblance-core`
- Premium features integrate with the open core via a plugin/extension API — they do not modify core code
- The open core must be fully functional without premium features installed
- If you're unsure whether something belongs in public or private, **escalate to Orbital Directors**

---

## Autonomy Framework

User autonomy is configured per-domain at three tiers. Default varies by domain sensitivity.

| Tier | Name | Behavior | Default For |
|------|------|----------|-------------|
| 1 | **Guardian** | Prepare actions, show preview, wait for explicit approval | Finances, legal, new integrations |
| 2 | **Partner** | Routine actions autonomous, novel/high-stakes require approval, daily digest | Email, calendar, health |
| 3 | **Alter Ego** | Acts as user for nearly everything, interrupts only for genuinely high-stakes | Power users who opt in |

Every action, regardless of autonomy tier, is logged to the Universal Action Log with full context (what, why, when, what data was used) and is reviewable and reversible where possible.

---

## Development Workflow

### Build Model

```
Orbital Directors (Human + Claude in conversation)
    → Define architecture, features, priorities
    → Produce canonical documents

Claude Code (this terminal)
    → Executes implementation based on Orbital Director decisions
    → References this CLAUDE.md and DESIGN_SYSTEM.md
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
- You're unsure whether code belongs in the public or private repository
- The task would change the IPC protocol schema
- The task would modify the privacy audit pipeline
- You encounter a conflict between this document and the design system

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
- All approval flows must have tests verifying Guardian/Partner/Alter Ego behavior.

### Commits
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `security:`
- Use `security:` prefix for any change touching Gateway, IPC, audit trail, or sandboxing
- Meaningful descriptions. Not "fix bug" — describe what was wrong and what was changed.
- One logical change per commit.

---

## Sprint Plan Reference

| Sprint | Weeks | Focus | Key Deliverables |
|--------|-------|-------|-----------------|
| 1 | 1–4 | The Spine | LLM integration, knowledge graph, Gateway, app shells, CLAUDE.md, design system |
| 2 | 5–8 | Becomes Useful | Universal Inbox, proactive context, basic agent actions, onboarding, Network Monitor |
| 3 | 9–12 | Becomes Powerful | Financial awareness, form automation, Digital Representative, health tracking |
| 4 | 13–16 | Becomes Undeniable | Relationship intelligence, learning/adaptation, Privacy Dashboard, mobile parity, launch prep |

Refer to `semblance_build_map.docx` for full sprint details including exit criteria.

---

## Remember

The entire foundation of Semblance is trust. Every line of code either builds trust or erodes it. There is no neutral ground. When in doubt between convenience and security, choose security. When in doubt between speed and correctness, choose correctness. When in doubt between assumption and escalation, escalate.

The user is trusting us with everything. Build accordingly.
