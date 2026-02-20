# Sprint 1 — Step 4: Desktop App Shell

## Implementation Prompt for Claude Code

**Date:** February 20, 2026
**Prerequisite Steps:** Step 1 (Scaffolding ✅), Step 2 (Gateway Isolation ✅), Step 3 (AI Core ✅)
**Test Baseline:** 154 passing tests (66 Core + 88 Gateway), privacy audit clean

---

## Mission

Wire the AI Core and Gateway into a usable Tauri 2.0 desktop application. When this step is complete, a human can install the app, go through onboarding, connect a local LLM, select directories, index their files, ask questions about their documents in a chat interface, and verify that every action is logged. The app must look and feel like it belongs alongside Arc, Linear, and Notion — not a developer prototype.

**Read before writing any code:**
1. `CLAUDE.md` (root) — architectural rules, boundary rules, approved dependencies, escalation criteria
2. `docs/DESIGN_SYSTEM.md` — every color, font, spacing token, component spec, and motion definition
3. `docs/MOBILE_PARITY_PATCH.md` — mobile architecture context (not implemented this step, but informs shared component decisions)

---

## What Already Exists

You are building on top of completed, tested infrastructure. Do not rebuild or modify these unless you find a blocking bug (and if you do, log the change and the reason).

### packages/core/ (Step 3 — 66 tests passing)

- **SemblanceCore** — entry point with `initialize()` that boots SQLite, LanceDB, Ollama connection, orchestrator
- **OllamaProvider** — LLM interface (refuses non-localhost URLs)
- **ModelManager** — hardware-aware model selection and defaults
- **Orchestrator** — message → knowledge search → LLM → tool calls → autonomy check → IPC routing
- **DocumentStore** (SQLite metadata) + **VectorStore** (LanceDB embeddings)
- **Chunker**, **Indexer**, **SemanticSearch**, **FileScanner** (.txt, .md, .pdf, .docx)
- **CoreIPCClient** — sends signed action requests over domain socket
- **AutonomyFramework** — Guardian/Partner/Alter Ego with domain overrides

### packages/gateway/ (Step 2 — 88 tests passing)

- Full IPC protocol handler with Zod validation
- HMAC-SHA256 action signing (pure functions in Core, key management in Gateway)
- Append-only SQLite audit trail with WAL mode and chain hashing
- SQLite-backed domain allowlist
- Per-action and global sliding window rate limiter
- Anomaly detector (burst, new domain, large payload)
- Full validation pipeline
- Unix domain socket / named pipe transport
- Stub service adapters with registry

### packages/semblance-ui/ (Step 1 — scaffolded)

- Design tokens defined (colors, typography, spacing, shadows, motion, breakpoints)
- Component stubs may exist — implement fully per DESIGN_SYSTEM.md specs

---

## Deliverables

### A. Tauri 2.0 Application Shell

**Location:** `packages/desktop/`

#### A1. Rust Backend (`src-tauri/`)

Initialize and manage the Core and Gateway processes from the Tauri Rust backend.

1. **Process Lifecycle Management**
   - On app launch: start Gateway process → start Core process (with `initialize()`) → establish IPC connections
   - On app quit: graceful shutdown — flush audit trail, close IPC, terminate processes in reverse order
   - Health checks: periodic liveness ping to both Core and Gateway; surface status in UI via Tauri events
   - Crash recovery: if Core or Gateway dies, show clear error state in UI (not a silent failure), offer restart

2. **Tauri Commands (invoke handlers)**
   - `send_message(message: String)` → route to Orchestrator, stream response tokens back via Tauri events
   - `get_ollama_status()` → check Ollama connection, return model list and active model
   - `select_model(model_id: String)` → switch active model via ModelManager
   - `start_indexing(directories: Vec<String>)` → trigger FileScanner + Indexer, emit progress events
   - `get_indexing_status()` → return current indexing state (idle, scanning, indexing, complete, error)
   - `get_action_log(limit: u32, offset: u32)` → query audit trail, return paginated entries
   - `get_privacy_status()` → return Gateway connection count, allowlist state, last audit entry
   - `set_user_name(name: String)` → persist to Core preferences (SQLite)
   - `get_user_name()` → retrieve from Core preferences
   - `set_autonomy_tier(domain: String, tier: String)` → update AutonomyFramework config
   - `get_autonomy_config()` → return current per-domain autonomy settings
   - `get_indexed_directories()` → return list of directories currently being watched/indexed
   - `get_knowledge_stats()` → return document count, chunk count, index size, last indexed timestamp

3. **System Tray**
   - Tray icon present when app is running (use a simple, clean icon — Semblance Blue on transparent)
   - Menu items: "Open Semblance", "Privacy Status: ✓ Local Only", separator, "Quit"
   - Privacy status item reflects real Gateway state — green check when clean, amber warning if anomaly detected
   - Click tray icon to show/focus main window

4. **Window Configuration**
   - Default size: 1200×800, minimum 900×600
   - Title bar: use Tauri's decorations (platform native)
   - Single window application (no multi-window for Sprint 1)
   - Remember window position and size between launches (persist to local preferences)

#### A2. Web Frontend (`src/`)

React application rendered in Tauri's webview. Uses `semblance-ui` components exclusively — no raw HTML/CSS unless the design system has no applicable component.

**Tech stack for frontend:**
- React 18+ with TypeScript strict mode
- Tailwind CSS (configured with design system tokens)
- Radix UI primitives (for accessible interactive components)
- `semblance-ui` components (build what's needed, follow DESIGN_SYSTEM.md exactly)
- Lucide Icons (icon set specified in design system)
- `@tauri-apps/api` for invoke commands and event listeners

---

### B. semblance-ui Components

**Location:** `packages/semblance-ui/`

Build the components needed for this step. Every component must:
- Use design tokens from `tokens/` — never hardcode colors, spacing, fonts, or shadows
- Render correctly in both light and dark mode (test both)
- Be keyboard navigable and meet WCAG AA contrast minimums
- Respect `prefers-reduced-motion` — disable animations when set
- Use Radix UI primitives for interactive elements (dialogs, menus, toggles, etc.)
- Have no business logic, no data fetching, no side effects beyond UI state
- Export from `packages/semblance-ui/index.ts`

#### Required Components (implement per DESIGN_SYSTEM.md specs)

| Component | Usage | Key Specs |
|-----------|-------|-----------|
| **Button** | Primary, secondary, ghost, danger variants | Pill radius for primary, `--radius-md` for others. `--text-base`, `--font-semibold`. Hover: darken 10%. Focus: `--shadow-focus` ring. |
| **Input** | Text inputs, search bar | `--radius-md`, 1px `--color-border` → `--color-primary` on focus. `--shadow-focus` ring. Error state: `--color-attention` border. |
| **Card** | Content containers throughout the app | `--color-surface-1` bg, `--radius-lg`, `--shadow-sm`. Hover lift optional. |
| **ActionCard** | Action log entries, onboarding data source cards | Card base + action type indicator, timestamp, status badge, expandable detail. |
| **StatusIndicator** | System health dots | 8px circle. Colors: success/accent/attention/muted. Optional pulse animation (1.5s) for active states. |
| **PrivacyBadge** | Persistent local-only indicator | Fixed position in sidebar. Lock icon + "Local Only" text. `--color-success-subtle` bg, `--color-success` text. `--text-xs`, `--font-medium`. **Always visible. Never hidden.** |
| **Toast** | Notifications | Bottom-right. Max 400px. `--radius-lg`, `--shadow-lg`. Auto-dismiss 5s for info, persistent for actions. Slide up + fade enter, fade exit. |
| **Navigation** | Sidebar nav | 240px width, collapsible to 64px icons. Active: `--color-primary-subtle` bg, `--color-primary` text. Hover: `--color-surface-2` bg. |
| **ChatBubble** | User and AI messages in chat | User: right-aligned, `--color-primary-subtle` bg. AI: left-aligned, `--color-surface-1` bg. `--radius-lg`. Timestamps in `--text-xs`. |
| **ChatInput** | Message composition area | Multi-line input with send button. Auto-grow height. `--radius-lg` container. Shift+Enter for newlines, Enter to send. |
| **ProgressBar** | File indexing progress | `--color-primary` fill on `--color-surface-2` track. `--radius-full`. Indeterminate mode with shimmer animation. |
| **DirectoryPicker** | Folder selection display | Shows selected directories with remove buttons. "Add folder" button triggers native OS directory picker via Tauri dialog API. |
| **AutonomySelector** | Tier selection during onboarding and in settings | Three cards (Guardian/Partner/Alter Ego) with descriptions. Partner pre-selected (default). Radio-style selection. Per-domain override toggle for advanced users. |
| **ThemeToggle** | Light/dark mode switch | Radix Toggle or Switch primitive. Persists preference to local storage. System theme detection as default. |

---

### C. Application Screens

All screens use the sidebar navigation layout (except onboarding, which is full-screen cinematic).

#### C1. Onboarding Flow (First Run Only)

Full-screen flow. No sidebar. Uses `--duration-cinematic` (1200ms) timing and DM Serif Display for headlines. Background: subtle gradient from Deep Ink (`#1A1D2E`) to slightly lighter shade. Crossfade transitions between screens (800ms).

**This is the most emotionally important flow in the product. It must feel significant, not like a setup wizard.**

| Screen | Content | Interaction | Visual Notes |
|--------|---------|-------------|--------------|
| **1. Welcome** | "This is your Semblance." | Auto-advance after pause (2s) or click/key to advance | Centered. DM Serif Display `--text-display`. Fade in. |
| **2. Promise** | "It will learn who you are, manage your world, and represent you. It will never share what it knows." | Auto-advance after pause (3s) or click/key | Centered. DM Serif Display `--text-3xl`. Fade transition. |
| **3. Naming** | "What would you like to call it?" | Single centered input. Submit on Enter. | DM Serif Display headline. Inter for input. Name renders in Warm Amber (`#E8A838`) after entry. **This is the most important interaction in the entire product.** |
| **4. Data Connection** | "Let's connect [name] to your world." | Data source cards. For Sprint 1: only "Files" card is active. Email/calendar show "Coming in the next update" with lock icons. | [name] in Warm Amber. Cards show privacy indicator (lock icon + "stays on your device"). |
| **5. File Selection** | "Choose folders for [name] to learn from." | Native directory picker (Tauri dialog API). Show selected directories with doc count estimates. "Start Learning" button. | Show indexing progress after start. Brief — don't make them wait for full index. |
| **6. Knowledge Moment** | "[name] is exploring your documents..." → transition to first insight | Show real-time indexing count. Once a minimum threshold is indexed (50 chunks or 30 seconds, whichever first), show a sample: "[name] found [X] documents across [Y] topics. Here's something interesting:" followed by a real semantic search result from their files. | This is the Sprint 1 version — file intelligence only. The full cross-source Knowledge Moment activates in Sprint 2 when email + calendar connect. Make this feel magical even with just files. |
| **7. Autonomy** | "How much should [name] do on its own?" | Three cards: Guardian ("I'll show you everything before I act"), Partner ("I'll handle the routine, check on the important stuff" — **pre-selected**), Alter Ego ("I'll handle everything, interrupt only when it matters"). | Partner card has subtle `--color-primary-subtle` background to indicate recommendation. Per-domain override link for advanced users. Alter Ego shows "Most users start with Partner and move here within a few weeks." |
| **8. Ready** | "[name] is ready." | Button: "Start Talking to [name]" → transitions to main chat view | [name] in Warm Amber. Show quick stat: "[X] documents indexed, [Y] ready to discuss." If indexing still running, show progress + "Still learning — you can start chatting now." |

**Implementation notes:**
- Persist onboarding state so it can resume if the app closes mid-flow
- Persist user name to Core preferences via `set_user_name` Tauri command
- After onboarding completes, never show it again (set `onboarding_complete` flag in preferences)
- The naming moment must persist — the user's chosen name appears throughout the entire app wherever `[name]` is referenced

#### C2. Main Chat View (Default Screen After Onboarding)

The primary interaction screen. This is where users talk to their Semblance.

**Layout:**
- Sidebar (left): Navigation with PrivacyBadge, nav items, system status
- Main area (center/right): Chat history + input

**Sidebar navigation items:**
1. Chat (default active) — speech bubble icon
2. Files — folder icon (file management + indexing)
3. Activity — clock icon (action log viewer)
4. Privacy — shield icon (privacy dashboard)
5. Settings — gear icon (at bottom of sidebar)

**Chat area:**
- Message history scrolls. Auto-scroll to bottom on new messages. User can scroll up to review history.
- User messages: right-aligned ChatBubble, `--color-primary-subtle` background
- AI messages: left-aligned ChatBubble, `--color-surface-1` background
- AI responses stream token-by-token (subscribe to Tauri events from `send_message`)
- Typing indicator while AI is thinking: gentle pulse in `--color-primary`
- Empty state (first time): "Ask [name] anything about your documents." with 2-3 suggested questions based on indexed content (or generic starters if nothing indexed yet)
- Message timestamps in `--text-xs`, `--color-muted`

**Chat input:**
- Anchored to bottom of chat area
- Multi-line with auto-grow (max ~6 lines before scroll)
- Send button (primary style, right side of input)
- Enter sends, Shift+Enter for newline
- Disabled state while AI is responding (prevent double-send)

**Connection status bar** (subtle, top of chat area or below input):
- LLM status: model name + green dot if connected, red dot + "Ollama not connected" if down
- Indexing status: if actively indexing, show compact progress ("Indexing: 142/500 files...")
- These are informational — not intrusive. `--text-xs`, `--color-muted` text.

#### C3. Files Screen

Directory management and indexing status.

**Sections:**
1. **Indexed Directories** — list of directories currently being indexed. Each shows: path, file count, last indexed time, remove button. "Add Folder" button triggers native directory picker.
2. **Indexing Status** — if currently indexing: progress bar, file count, estimated time. If idle: "All directories up to date" with last completed timestamp.
3. **Knowledge Stats** — total documents, total chunks, index size on disk, supported file types (.txt, .md, .pdf, .docx).

**Note:** File watching is manual re-scan only in Sprint 1 (see stub tracking). Show a "Re-scan" button per directory. Automatic file watching ships later.

#### C4. Activity Screen (Action Log Viewer)

The transparency layer. Every action the AI takes is logged and visible here.

**Layout:**
- Chronological list of ActionCard components (newest first)
- Each card shows: timestamp, action type, brief description, autonomy tier that authorized it, status (success/error/pending)
- Cards are expandable: click to reveal full payload, data used, audit trail reference
- Filter bar at top: filter by action type, status, date range
- Pagination (load more on scroll or explicit button)

**Data source:** Queries the audit trail via `get_action_log` Tauri command. This reads from the Gateway's append-only SQLite audit trail.

**Empty state:** "No actions yet. As [name] works for you, every action will appear here — fully transparent and reviewable."

#### C5. Privacy Dashboard (Foundational Version)

The trust differentiator. Shows proof that data stays local.

**Sections:**
1. **Privacy Status** — large, prominent status card. Green with lock icon: "All Data Local — No External Connections." This must be the most visible element. If the Gateway has detected any anomaly (which it shouldn't), this turns amber with details.
2. **Network Activity** — list of recent Gateway activity. For Sprint 1 this is minimal (only Ollama localhost connections and any service adapter calls). Each entry shows: timestamp, destination, action type, bytes transferred. Real-time update via Tauri events.
3. **Audit Trail Summary** — total actions logged, chain integrity status (hash chain unbroken = ✓), link to full activity log.
4. **Data Inventory** — what data Semblance has: indexed directories, document count, database sizes. "All stored at: [path to ~/.semblance/]" with native "Open in Finder/Explorer" button.

**Note:** The full Network Monitor with real-time connection display is a Sprint 2 deliverable. This foundational version shows audit data and privacy status.

#### C6. Settings Screen

Application preferences.

**Sections:**
1. **Your Semblance** — name (editable), avatar/icon (future — show placeholder)
2. **AI Model** — current model, Ollama connection status, model switcher dropdown, download status for models
3. **Autonomy** — per-domain tier configuration (reuse AutonomySelector component). Shows current settings with ability to change per-domain.
4. **Appearance** — theme toggle (light/dark/system), text size adjustment (future — show as coming soon)
5. **Data** — indexed directories (link to Files screen), clear index button (with confirmation dialog), export data (future)
6. **About** — version, "Open Source — View on GitHub" link, "Verify Privacy — Run Audit" button (triggers privacy audit script and shows result)

---

### D. Integration Wiring

This is the critical step that turns UI into a working product.

#### D1. Core ↔ Frontend Communication

All communication between the React frontend and the backend uses Tauri's invoke/event system. No direct filesystem access, no direct SQLite access, no direct IPC from the frontend.

```
React Frontend
    ↕ Tauri invoke() / events
Tauri Rust Backend
    ↕ Function calls / spawned processes
SemblanceCore + Gateway
```

**Streaming pattern for chat:**
1. Frontend calls `invoke('send_message', { message })` 
2. Rust backend routes to Orchestrator
3. Orchestrator streams LLM tokens — Rust backend emits Tauri events (`semblance://chat-token`) for each token
4. Frontend subscribes to events, appends tokens to the active AI message bubble in real-time
5. When complete, Rust backend emits `semblance://chat-complete` with the full response and any actions taken
6. Frontend finalizes the message bubble and updates action log if actions were taken

**Indexing pattern:**
1. Frontend calls `invoke('start_indexing', { directories })`
2. Rust backend triggers FileScanner → Chunker → Indexer pipeline
3. Progress emitted as Tauri events (`semblance://indexing-progress`) with: `{ filesScanned, filesTotal, chunksCreated, currentFile }`
4. Completion emitted as `semblance://indexing-complete` with final stats
5. Frontend updates progress UI in real-time

#### D2. State Management

Use React Context + useReducer for global app state. No external state management library needed for Sprint 1 scope.

**Global state shape:**

```typescript
interface AppState {
  userName: string | null;
  onboardingComplete: boolean;
  ollamaStatus: 'connected' | 'disconnected' | 'checking';
  activeModel: string | null;
  availableModels: string[];
  indexingStatus: {
    state: 'idle' | 'scanning' | 'indexing' | 'complete' | 'error';
    filesScanned: number;
    filesTotal: number;
    chunksCreated: number;
    currentFile: string | null;
    error: string | null;
  };
  knowledgeStats: {
    documentCount: number;
    chunkCount: number;
    indexSizeBytes: number;
    lastIndexedAt: string | null;
  };
  autonomyConfig: Record<string, 'guardian' | 'partner' | 'alter_ego'>;
  theme: 'light' | 'dark' | 'system';
  privacyStatus: {
    allLocal: boolean;
    connectionCount: number;
    lastAuditEntry: string | null;
    anomalyDetected: boolean;
  };
}
```

Initialize from persisted preferences on app load. Subscribe to Tauri events to keep state current.

#### D3. Chat History Persistence

Chat messages are stored in the Core's SQLite database (NOT in the frontend). The frontend is a view layer.

- `send_message` returns a message ID
- `get_chat_history(limit, offset)` Tauri command retrieves paginated history
- On app launch, load the most recent conversation
- Conversation threading is Sprint 2 scope — Sprint 1 is a single continuous conversation

---

### E. Privacy & Testing

#### E1. Privacy Audit Must Still Pass

The privacy audit script (`scripts/privacy-audit/`) must exit 0 after Step 4. The desktop package introduces Tauri dependencies which have legitimate network capability (webview rendering, Tauri update checks). Handle this:

- **Tauri's built-in updater:** DISABLE. Set `"updater": { "active": false }` in `tauri.conf.json`. Semblance does not auto-update. Users update manually. This is a privacy decision.
- **Webview network access:** The webview renders local content only. Configure Tauri's CSP (Content Security Policy) to block all external resource loading: no external scripts, no external stylesheets, no external images, no external fonts (bundle all fonts locally). The only allowed connections are to Tauri's internal protocol (`tauri://`, `asset://`).
- **Privacy audit exceptions:** If the audit needs new exceptions for `packages/desktop/`, scope them narrowly (document exactly which files and why) following the same pattern used for the Ollama exception in `packages/core/llm/`.

#### E2. New Tests

| Test Suite | Location | What It Validates |
|------------|----------|-------------------|
| **Desktop privacy** | `tests/privacy/desktop.test.ts` | CSP blocks external resources. Updater disabled. No telemetry in desktop package. No analytics. Bundle does not contain external font/script URLs. |
| **Desktop integration** | `tests/integration/desktop.test.ts` | Send message → receive streamed response. Start indexing → receive progress events → indexing completes. Action log returns entries from audit trail. Onboarding state persists across app restarts. User name persists and displays correctly. Autonomy config persists. |
| **UI component tests** | `packages/semblance-ui/**/*.test.tsx` | Each component renders in both light and dark mode. Keyboard navigation works. Focus states visible. PrivacyBadge is always rendered (snapshot tests for layouts). Design token usage (no hardcoded colors/spacing in component code). |

**Test runner:** Vitest for all TypeScript tests. Tauri integration tests can use Tauri's test utilities or spawn the app headlessly.

**Minimum passing requirement:** All 154 existing tests + all new tests pass. Zero regressions.

#### E3. Privacy Audit Exit Criteria

```bash
pnpm run privacy-audit
# Must exit 0
# The audit verifies:
# - packages/core/ has no network imports (existing)
# - packages/desktop/src/ has no direct network calls (new)
# - packages/desktop/src-tauri/tauri.conf.json has updater disabled (new)
# - CSP in tauri.conf.json blocks external origins (new)
# - No analytics/telemetry packages in desktop dependencies (new)
```

---

## Exit Criteria

**Step 4 is complete when ALL of the following are true:**

1. ☐ `pnpm run test` passes — all existing 154 tests + all new tests, zero failures
2. ☐ `pnpm run privacy-audit` exits 0 — no regressions, desktop exceptions documented
3. ☐ App launches via `pnpm tauri dev` and shows onboarding on first run
4. ☐ Onboarding flow is complete: welcome → promise → naming → data connection → file selection → knowledge moment → autonomy → ready
5. ☐ User name persists and appears in Warm Amber throughout the app
6. ☐ Chat interface connects to Orchestrator — user sends message, receives streamed AI response using local LLM
7. ☐ File indexing works: user selects directories, indexing runs, progress displays, knowledge stats update
8. ☐ Knowledge Moment shows a real semantic search result from the user's indexed files during onboarding
9. ☐ Activity screen displays audit trail entries from the Gateway
10. ☐ Privacy Dashboard shows "All Data Local" status and audit trail summary
11. ☐ System tray icon works with privacy status and quit option
12. ☐ PrivacyBadge is visible on every screen (non-negotiable)
13. ☐ Both light and dark themes render correctly
14. ☐ Design system tokens are used throughout — no hardcoded colors, spacing, or font sizes in component code
15. ☐ Sidebar navigation works across all screens (Chat, Files, Activity, Privacy, Settings)
16. ☐ Settings screen allows model switching, autonomy configuration, and name editing
17. ☐ Tauri updater is disabled in config
18. ☐ CSP blocks all external resource loading

---

## Boundary Reminders

These are not suggestions. They are rules from CLAUDE.md.

- **`packages/core/`** — NEVER import from `packages/gateway/` or any networking code.
- **`packages/gateway/`** — NEVER import from `packages/core/` knowledge graph or user data stores.
- **`packages/semblance-ui/`** — Pure presentation. No business logic. No data fetching. No side effects beyond UI state.
- **`packages/desktop/`** — Composes from `core`, `gateway`, and `semblance-ui`. Platform-specific code only.
- **No `any` types.** Use `unknown` and narrow with type guards.
- **No telemetry.** Not even opt-in. Not even anonymous. Not even crash reporting.
- **All user data local.** No cloud sync. No cloud backup. No remote storage.
- **Fonts bundled locally.** Inter, JetBrains Mono, DM Serif Display — all served from the app bundle, never loaded from Google Fonts or any CDN.

---

## Escalation Triggers

Stop and escalate to Orbital Directors if:

- The design system doesn't cover a UI scenario you need to implement
- You need to add a dependency not on the pre-approved list
- You find a bug in Core or Gateway that requires modifying their interfaces
- You need to change the IPC protocol schema
- You need to modify the privacy audit pipeline
- The Tauri CSP configuration blocks legitimate local functionality
- You're unsure whether something belongs in the public or private repository
- A design decision feels like it could compromise the "naming moment" or onboarding emotional arc

---

## Autonomous Decision Authority

You may proceed without escalating for:

- Component styling decisions within the design system's defined tokens and specs
- React state management patterns (Context, useReducer, custom hooks)
- Tauri command naming and parameter conventions (as long as they align with existing patterns)
- Test structure and assertion patterns (following existing test conventions)
- File organization within `packages/desktop/src/` (components, hooks, screens, utils)
- Build configuration (Vite config, Tailwind config, tsconfig) as long as it doesn't add banned dependencies
- Error handling patterns in the UI (error boundaries, toast notifications, retry logic)

If you make an autonomous decision that feels significant, document it in a comment block at the top of the relevant file, following the pattern from Step 3:

```typescript
/**
 * AUTONOMOUS DECISION: [Brief description]
 * Reasoning: [Why this was the right call]
 * Escalation check: [Why this doesn't require Orbital Director input]
 */
```

---

## Implementation Order (Recommended)

This is a suggested sequence. Adjust if you find a better critical path, but document why.

1. **Tauri scaffolding** — `tauri init` in `packages/desktop/`, configure `tauri.conf.json` (window size, CSP, disabled updater, system tray), wire build tooling
2. **Design system components** — build the required `semblance-ui` components per DESIGN_SYSTEM.md. Write component tests. These are the building blocks for everything else.
3. **Application layout** — sidebar navigation shell, theme toggle, PrivacyBadge placement, basic routing between screens
4. **Tauri commands** — implement the Rust invoke handlers that bridge frontend ↔ Core/Gateway
5. **Chat interface** — the primary interaction. Wire send_message, event streaming, chat history
6. **Onboarding flow** — the full cinematic sequence. This is the emotional centerpiece — invest time here
7. **Files screen** — directory picker, indexing UI, knowledge stats
8. **Activity screen** — action log viewer reading from audit trail
9. **Privacy Dashboard** — foundational version with status, audit summary, data inventory
10. **Settings screen** — model management, autonomy config, preferences
11. **System tray** — icon, menu, privacy status
12. **Testing** — privacy audit verification, integration tests, component tests
13. **Polish** — transitions, empty states, error states, loading states, responsive behavior

---

## What This Step Does NOT Include

These are explicitly deferred. Do not implement them, but do not create blockers that prevent their future implementation.

| Feature | Ships In | What To Do Now |
|---------|----------|----------------|
| Email integration | Sprint 2 | Show "Coming Soon" card in onboarding data connection screen |
| Calendar integration | Sprint 2 | Show "Coming Soon" card in onboarding data connection screen |
| Network Monitor (real-time) | Sprint 2 | Privacy Dashboard shows audit data, not live connections |
| Proactive engine | Sprint 2 | Not referenced in UI |
| File watching (automatic) | Sprint 3-4 | Manual "Re-scan" button per directory |
| Subscription detection | Sprint 2 | Not referenced in UI |
| Time-saved tracking | Sprint 2 | Not in data model yet — ships with first Sprint 2 commit |
| Task routing (mobile ↔ desktop) | Sprint 2 | Not referenced in UI |
| Autonomy escalation prompts | Sprint 2 | Autonomy selection exists, active escalation does not |
| Alter Ego full implementation | Sprint 4 | Selection available in UI, behavior is stub (relaxed Partner) |
| Mobile app | Separate step | Shared `semblance-ui` components will be reused |
| OS-level sandboxing | Sprint 4 | Not configured — CSP is the Sprint 1 security boundary |

---

## Quality Bar

This app ships to humans. It is not a prototype. Every screen must:

- Feel intentional — no placeholder text that says "TODO" or "Lorem ipsum" in the committed version
- Handle errors gracefully — if Ollama isn't running, show a clear message with instructions, not a crash
- Handle empty states — first launch before any data is indexed should feel welcoming, not broken
- Load fast — no unnecessary re-renders, no blocking the main thread during indexing
- Respect the design system — if something looks off, the code is wrong, not the design system
