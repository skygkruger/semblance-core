# MOBILE PARITY ARCHITECTURE — Orbital Director Decision

## Date: February 19, 2026
## Status: LOCKED IN
## Authority: Human Orbital Director + Claude Orbital Director

---

## Decision

Mobile is elevated from "lightweight companion that defers to desktop" to **peer device with intelligent task routing**. Semblance on mobile must be a first-class sovereign AI, not a remote control for the desktop version.

---

## What Changes

### 1. MLX as Default iOS Runtime

**Previous:** Ollama (default), llama.cpp (power users), MLX (Apple Silicon optimization) — MLX listed only for desktop.

**New:** 
- **iOS:** MLX is the default runtime. It is purpose-built for Apple Silicon and runs optimally on A-series and M-series chips.
- **Android:** llama.cpp remains the default (best cross-platform support for ARM).
- **Desktop macOS:** MLX preferred, Ollama as easy-onboarding alternative.
- **Desktop Linux/Windows:** Ollama (default), llama.cpp (power users).

### 2. 3B Model Default on Capable Hardware

**Previous:** Mobile defaults to 1B models (Phi-3-mini 3.8B, Gemma 2B, Llama 3.2 1B).

**New:** 
- **Capable devices (6GB+ available RAM):** Default to 3B-class models (Llama 3.2 3B Q4, Phi-3-mini 3.8B Q4). These provide materially better reasoning than 1B.
- **Constrained devices (<6GB available RAM):** Fall back to 1B models.
- **Detection:** At first launch and periodically, assess available device RAM and set the default model tier accordingly. User can always override.

### 3. Intelligent Task Routing (Mobile ↔ Desktop)

**Previous:** "Heavy reasoning defers to desktop/server when available."

**New:** The device self-assesses query complexity against local capability before deciding where to run inference.

**Routing logic:**
- **Run locally** when: the query is conversational, retrieval-based, or involves simple reasoning that the local model handles well (email triage, calendar queries, quick lookups, standard drafts).
- **Hand off to desktop** when: the query involves complex multi-step reasoning, large document analysis (beyond what's indexed locally), heavy agent orchestration with multiple tool calls, or the user has explicitly set a preference for desktop inference quality.
- **Handoff is seamless:** The user doesn't choose where to run. The system decides and executes. If desktop is unavailable, mobile runs locally with a quality indicator showing it's using the lighter model.

**Implementation:**
- A `TaskRouter` component in `packages/core/agent/` evaluates query complexity (token count, tool calls expected, reasoning depth heuristic) against device capability profile.
- Desktop discovery via local network (mDNS/Bonjour) — encrypted, authenticated, no cloud relay.
- Handoff protocol uses the same IPC action request format over local network TLS, with mutual authentication via shared device key.

### 4. Model Caching Strategy

**Previous:** Not specified. Implied load-on-demand.

**New:**
- **Foreground:** Primary model stays loaded in memory while the app is active. No cold-start delay for queries.
- **Background:** On iOS, use background task API to gracefully unload when the OS requests memory. On Android, use `onTrimMemory` callbacks. Cache model weights in device storage for fast reload.
- **Warm restart:** When the user returns to the app, reload the model from cached weights. Target: <2 seconds to ready state on current-gen devices.
- **Model weight storage:** Keep the active model's weights on device storage (not re-downloading). Manage storage budget — user configurable, default 4GB for model cache.

---

## CLAUDE.md Changes Required

Apply the following changes to the CLAUDE.md file in the project root:

### Change 1: Update Technology Stack Table

Replace the current Mobile App and LLM Runtime rows:

**Old:**
```
| Mobile App | React Native + react-native-reanimated | First-class interface, not a companion |
| LLM Runtime | Ollama (default) / llama.cpp (power) / MLX (Apple) | User-selectable |
```

**New:**
```
| Mobile App | React Native + react-native-reanimated | Peer device, not a companion. Full local inference. |
| LLM Runtime (Desktop) | Ollama (default) / llama.cpp (power) / MLX (macOS) | User-selectable |
| LLM Runtime (iOS) | MLX (default) / llama.cpp (fallback) | MLX optimized for Apple Silicon |
| LLM Runtime (Android) | llama.cpp | Best ARM cross-platform support |
```

### Change 2: Add Mobile Inference Section

Add a new section after the "IPC Protocol" section and before the "Design System" section:

```markdown
## Mobile Architecture — Peer Device

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
```

### Change 3: Update Boundary Rules

Add to the existing Boundary Rules section:

```markdown
- **`packages/mobile/src/inference/`** — Platform-specific inference runtime (MLX on iOS, llama.cpp on Android). May import from `packages/core/` types but NOT from `packages/gateway/` or `packages/desktop/`.
- **`packages/core/agent/task-router.ts`** — Query complexity assessment and routing decisions. Pure logic, no platform-specific code.
- **`packages/core/agent/device-handoff.ts`** — Desktop discovery and handoff protocol. Uses local network only — NO cloud relay, NO external discovery service.
```

### Change 4: Update Sprint Plan Reference

Update Sprint descriptions to reflect mobile parity timeline:

```markdown
| Sprint | Weeks | Focus | Key Deliverables |
|--------|-------|-------|-----------------|
| 1 | 1–4 | The Spine | LLM integration, knowledge graph, Gateway, desktop app shell, **mobile inference foundation (MLX/llama.cpp, 3B defaults, model caching)**, CLAUDE.md, design system |
| 2 | 5–8 | Becomes Useful | Universal Inbox (desktop + mobile), proactive context, basic agent actions, onboarding, Network Monitor, **task routing between devices** |
| 3 | 9–12 | Becomes Powerful | Financial awareness, form automation, Digital Representative, health tracking, **mobile feature parity with desktop** |
| 4 | 13–16 | Becomes Undeniable | Relationship intelligence, learning/adaptation, Privacy Dashboard, **full mobile parity verified**, launch prep |
```

---

## What Does NOT Change

- The Gateway architecture (mobile has its own Gateway process, same isolation model)
- The privacy model (zero network for AI Core on mobile, same as desktop)
- The autonomy framework (same Guardian/Partner/Alter Ego, same per-domain config)
- The design system (same visual identity, responsive breakpoints handle mobile layout)
- The repository strategy (mobile code in public repo semblance-core)

---

## Files Claude Code Will Create/Modify

### New Files
- `packages/core/agent/task-router.ts` — Query complexity assessment and routing
- `packages/core/agent/device-handoff.ts` — Desktop discovery and handoff protocol  
- `packages/mobile/src/inference/mlx-runtime.ts` — MLX inference wrapper for iOS
- `packages/mobile/src/inference/llamacpp-runtime.ts` — llama.cpp inference wrapper for Android
- `packages/mobile/src/inference/model-cache.ts` — Model weight caching and memory management
- `packages/mobile/src/inference/device-capability.ts` — RAM detection and model tier selection
- Tests for all of the above

### Modified Files
- `CLAUDE.md` — Changes 1–4 above
- `packages/core/llm/types.ts` — Add mobile runtime interfaces if needed
- `packages/core/agent/orchestrator.ts` — Integrate TaskRouter into the orchestration flow

---

## Escalation Note

The desktop↔mobile handoff protocol introduces a new network communication path that is NOT the Gateway. This is local-network-only, mutually authenticated TLS between the user's own devices. It requires careful security review:

- It must be opt-in (user explicitly pairs devices)
- It must use mutual TLS with device-specific certificates
- It must never traverse the internet (local network only, no STUN/TURN/relay)
- It must be auditable in the same action log as Gateway actions

**This handoff protocol should be Gemini-audited before merging.**
