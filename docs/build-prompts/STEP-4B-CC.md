# Sprint 1 — Step 4B: Integration Wiring

## Implementation Prompt for Claude Code

**Date:** February 20, 2026
**Prerequisite:** Step 4A (Desktop App Shell ✅ — 351 tests passing, privacy audit clean)
**Test Baseline:** 351 passing tests (154 Core/Gateway + 197 Desktop UI/privacy), privacy audit exit 0
**Scope:** Replace all Rust backend stubs with real Core/Gateway process management and IPC routing

---

## Mission

The desktop app shell exists and is fully built — all 14 UI components, all 6 screens, onboarding flow, state management, privacy tests, and design system compliance are complete and passing. What remains is connecting the Rust backend (`packages/desktop/src-tauri/src/lib.rs`) to the real SemblanceCore and Gateway processes so the app actually works.

When this step is complete, `pnpm tauri dev` launches an app where a human can go through onboarding, select real directories, index real files, ask real questions to a real local LLM, see real responses streamed token-by-token, review real audit trail entries, and verify real privacy status — all against the infrastructure built in Steps 1–3.

**Read before writing any code:**
1. `CLAUDE.md` (root) — architectural rules, boundary rules, IPC protocol schema, process isolation model
2. `packages/core/` source — understand how `SemblanceCore.initialize()` works, what the Orchestrator expects, how FileScanner/Indexer/SemanticSearch are called
3. `packages/gateway/` source — understand how the IPC server starts, how the audit trail is queried, how the validation pipeline works
4. `packages/desktop/src-tauri/src/lib.rs` — the file you are modifying. Read every `// TODO(Sprint 1 wiring)` comment to understand the current stub structure
5. `packages/desktop/src/` — understand what the frontend expects from each invoke command (parameter shapes, event names, response types)

---

## What Already Exists

### Working Infrastructure (Do Not Modify Unless Blocking Bug Found)

**packages/core/ (Step 3 — 66 tests)**
- `SemblanceCore.initialize()` — boots SQLite, LanceDB, Ollama connection, Orchestrator. Returns a ready-to-use instance.
- `Orchestrator` — accepts a message string, runs: knowledge search → LLM inference → tool calls → autonomy check → IPC routing. Streams tokens.
- `OllamaProvider` — connects to localhost Ollama. Exposes `chat()` (streaming), `listModels()`, `setModel()`.
- `ModelManager` — hardware-aware model selection. `getAvailableModels()`, `getActiveModel()`, `setActiveModel()`.
- `FileScanner` — given directory paths, discovers .txt, .md, .pdf, .docx files. Returns file list with metadata.
- `Chunker` — splits documents into chunks for embedding.
- `Indexer` — orchestrates scan → chunk → embed → store pipeline. Emits progress callbacks.
- `SemanticSearch` — query → vector search → ranked results.
- `DocumentStore` (SQLite) — file metadata, preferences, chat history.
- `VectorStore` (LanceDB) — embeddings and vector search.
- `CoreIPCClient` — sends signed action requests to Gateway over domain socket.
- `AutonomyFramework` — get/set per-domain autonomy tiers. Persists to SQLite preferences.

**packages/gateway/ (Step 2 — 88 tests)**
- IPC server on Unix domain socket (`/tmp/semblance-gateway.sock`) / named pipe on Windows
- Audit trail: append-only SQLite with WAL mode and chain hashing. Queryable.
- Validation pipeline: schema → allowlist → rate limit → anomaly check
- Service adapter registry (stubs — real adapters ship in Sprint 2)

**packages/desktop/ (Step 4A — 197 tests)**
- Complete React frontend with 14 semblance-ui components
- 6 screens: Onboarding, Chat, Files, Activity, Privacy, Settings
- AppState via React Context + useReducer
- Tauri event subscriptions via `useTauriEvent` hook
- All privacy tests passing (CSP, updater disabled, no banned packages)
- Frontend expects these Tauri event names:
  - `semblance://chat-token` — `{ token: string }`
  - `semblance://chat-complete` — `{ fullResponse: string, actions: ActionLogEntry[] }`
  - `semblance://indexing-progress` — `{ filesScanned: number, filesTotal: number, chunksCreated: number, currentFile: string | null }`
  - `semblance://indexing-complete` — `{ documentCount: number, chunkCount: number, indexSizeBytes: number }`
  - `semblance://status-update` — `{ ollamaStatus: string, gatewayStatus: string }`

### The Stubs You Are Replacing

Every `#[tauri::command]` in `lib.rs` currently has stub/placeholder logic. Each one must be wired to the real system. The stubs fall into these categories:

**Chat (must connect to Orchestrator):**
- `send_message` — currently returns a fake streamed response. Must route through the real Orchestrator, stream real LLM tokens via Tauri events.

**LLM Management (must connect to OllamaProvider/ModelManager):**
- `get_ollama_status` — currently returns a hardcoded status. Must check real Ollama connection and return real model list.
- `select_model` — currently no-ops. Must call real ModelManager.

**Indexing (must connect to FileScanner/Indexer):**
- `start_indexing` — currently emits a fake completion after 500ms. Must trigger the real FileScanner → Chunker → Indexer pipeline with real progress events.
- `get_indexing_status` — currently returns idle. Must reflect real indexing state.
- `get_indexed_directories` — currently returns empty. Must read from real DocumentStore.
- `get_knowledge_stats` — currently returns zeroes. Must query real DocumentStore/VectorStore.

**Audit Trail (must connect to Gateway's SQLite):**
- `get_action_log` — currently returns empty array. Must query the real Gateway audit trail with pagination.
- `get_privacy_status` — currently returns hardcoded "all local." Must query real Gateway state.

**Preferences (must connect to Core's SQLite):**
- `set_user_name` / `get_user_name` — currently uses in-memory variable. Must persist to Core preferences.
- `set_autonomy_tier` / `get_autonomy_config` — currently no-ops. Must read/write real AutonomyFramework config.

---

## Architecture: How the Pieces Connect

The Tauri Rust backend is the orchestration layer. It manages process lifecycles and bridges the frontend to Core and Gateway.

```
┌─────────────────────────────────────────────────┐
│                  Tauri App                        │
│                                                   │
│  ┌──────────┐    invoke/events    ┌────────────┐ │
│  │  React    │◄──────────────────►│   Rust     │ │
│  │  Frontend │                    │   Backend  │ │
│  └──────────┘                    └─────┬──────┘ │
│                                        │         │
│                          ┌─────────────┼─────────┤
│                          │             │         │
│                    ┌─────▼─────┐ ┌─────▼─────┐  │
│                    │ Semblance │ │  Gateway   │  │
│                    │   Core    │ │  Process   │  │
│                    │ (in-proc  │ │ (in-proc   │  │
│                    │  or child)│ │  or child) │  │
│                    └───────────┘ └────────────┘  │
└─────────────────────────────────────────────────┘
```

### Process Model Decision

SemblanceCore and Gateway can be integrated in two ways. Choose the approach that works with the existing code:

**Option A — In-process (Recommended for Sprint 1):**
Initialize SemblanceCore and Gateway as library calls within the Tauri Rust backend's async runtime. Core and Gateway are TypeScript/Node packages, so this means spawning a Node.js sidecar process that hosts both, with communication over a local channel (stdin/stdout JSON-RPC, or the existing Unix domain socket IPC).

**Option B — Sidecar processes:**
Spawn Core and Gateway as separate child processes managed by Tauri's sidecar API. More aligned with the production isolation model but more complex to wire.

**Guidance:** Use whichever approach gets to working integration fastest. The production process isolation model (OS-level sandboxing) ships in Sprint 4. For Sprint 1, the critical requirement is that the data flows correctly — user message reaches the real Orchestrator, real LLM tokens stream back, real files get indexed, real audit entries are written. The isolation model can be tightened later without changing the frontend contract.

**If you use a sidecar/child process approach:**
- The sidecar script lives at `packages/desktop/src-tauri/sidecar/` or similar
- It must be a thin wrapper that imports from `packages/core` and `packages/gateway` and exposes the needed functions over a local communication channel
- All communication between Rust and the sidecar must be over localhost only — no network calls
- The sidecar must be killed on app quit
- Document the approach in an autonomous decision comment

---

## Detailed Wiring Specifications

### 1. Process Lifecycle

**On app launch (`setup` hook in Tauri builder):**
1. Start the Gateway (IPC server begins listening)
2. Initialize SemblanceCore (`initialize()` — boots SQLite, LanceDB, connects to Ollama, creates Orchestrator)
3. Verify Ollama is reachable — if not, set status to `disconnected` (not a crash — the app works, chat just shows "Ollama not connected" in the status bar)
4. Emit `semblance://status-update` with initial status
5. Store handles/references to Core and Gateway in Tauri's managed state so invoke commands can access them

**On app quit (`on_window_event` with `CloseRequested` or tray quit):**
1. Cancel any in-progress indexing
2. Flush any pending audit trail writes
3. Close IPC connections
4. Shut down Core (close SQLite, close LanceDB)
5. Shut down Gateway
6. Exit cleanly

**On crash/unexpected termination of Core or Gateway:**
1. Detect via health check or process exit signal
2. Emit `semblance://status-update` with error state
3. Frontend shows error banner: "[name] encountered a problem. Restart?" with a restart button
4. Restart button re-runs the startup sequence
5. Do NOT silently continue with a dead backend — the user must know

### 2. Chat — `send_message`

This is the most important command. It must feel responsive.

```
Frontend: invoke('send_message', { message: "What's in my project notes?" })
    │
    ▼
Rust backend: receives message string
    │
    ▼
Route to Orchestrator.processMessage(message)
    │
    ▼
Orchestrator internally:
    1. Searches knowledge graph (SemanticSearch)
    2. Constructs LLM prompt with context
    3. Calls OllamaProvider.chat() with streaming
    4. For each token: callback fires
    │
    ▼
For each token from Orchestrator:
    Rust backend emits: app.emit("semblance://chat-token", { "token": tokenString })
    │
    ▼
On completion:
    Rust backend emits: app.emit("semblance://chat-complete", {
        "fullResponse": completeResponseString,
        "actions": [] // any actions the Orchestrator routed through Gateway
    })
```

**Critical requirements:**
- Tokens must stream in real-time — the user sees words appearing, not a loading spinner followed by a wall of text
- If Ollama is disconnected, return an error immediately: `{ error: "Ollama is not running. Start Ollama and try again." }`
- If indexing is in progress while a chat message is sent, that's fine — search whatever is indexed so far
- Chat messages and responses must be persisted to Core's SQLite (DocumentStore) so `get_chat_history` returns real data on next app launch
- Only one message can be in-flight at a time. If the frontend sends while a response is streaming, queue it or reject it — do not corrupt the stream

### 3. Indexing — `start_indexing`

```
Frontend: invoke('start_indexing', { directories: ["/Users/sky/Documents", "/Users/sky/Projects"] })
    │
    ▼
Rust backend:
    1. Pass directories to FileScanner
    2. FileScanner discovers files → returns file list with total count
    3. Emit: semblance://indexing-progress { filesScanned: 0, filesTotal: totalCount, chunksCreated: 0, currentFile: null }
    4. For each file: Chunker → Indexer (embed + store)
    5. After each file: emit semblance://indexing-progress with updated counts
    6. On completion: emit semblance://indexing-complete with final stats from DocumentStore/VectorStore
```

**Critical requirements:**
- Indexing must not block the main thread or the chat. It runs asynchronously.
- Progress events must fire frequently enough that the UI progress bar moves smoothly (at minimum after each file, ideally with sub-file granularity for large PDFs)
- If a file fails to parse (corrupted PDF, binary file misidentified), log the error, skip the file, continue indexing. Do not crash the pipeline.
- Persist the list of indexed directories to Core preferences so `get_indexed_directories` returns them on next launch
- The `get_knowledge_stats` command must query real counts from DocumentStore (document count) and VectorStore (chunk count, index size)

### 4. Audit Trail — `get_action_log`

```
Frontend: invoke('get_action_log', { limit: 50, offset: 0 })
    │
    ▼
Rust backend:
    Query Gateway's audit trail SQLite database
    SELECT * FROM audit_trail ORDER BY timestamp DESC LIMIT ? OFFSET ?
    │
    ▼
Return: Array of audit entries matching the shape the ActivityScreen expects:
    {
        id: string,
        timestamp: string,        // ISO 8601
        actionType: string,       // e.g. "chat.message", "file.index", "knowledge.search"
        description: string,      // Human-readable summary
        status: string,           // "success" | "error"
        autonomyTier: string,     // "guardian" | "partner" | "alter_ego"
        details: object | null    // Expandable payload for the ActionCard
    }
```

**Note:** In Sprint 1, the audit trail entries will primarily be chat messages and indexing actions. Service adapter actions (email, calendar) are Sprint 2. The Activity screen should still work and show whatever entries exist — even if it's just "Indexed 142 files" and "Answered question about project notes."

**Implementation detail:** The Gateway's audit trail schema may not perfectly match the shape the frontend expects. Write a mapping function in the Rust backend that translates Gateway audit entries to the frontend's expected format. Do not modify the Gateway's audit trail schema.

### 5. Privacy Status — `get_privacy_status`

```
Frontend: invoke('get_privacy_status')
    │
    ▼
Rust backend:
    1. Query Gateway: how many active connections? (Should be 0 or 1 for Ollama localhost)
    2. Query Gateway: any anomalies detected? (burst, new domain, large payload)
    3. Query audit trail: total entry count, last entry timestamp
    4. Verify chain hash integrity (optional for Sprint 1 — note if deferred)
    │
    ▼
Return: {
    allLocal: true,              // false only if Gateway reports anomaly
    connectionCount: 0,          // active outbound connections
    lastAuditEntry: "2026-02-20T14:32:00Z",
    anomalyDetected: false,
    totalActions: 47,
    chainIntegrityVerified: true  // or null if deferred
}
```

### 6. Preferences — `set_user_name`, `get_user_name`, `set_autonomy_tier`, `get_autonomy_config`

These persist to Core's SQLite preferences store. The Core already has a preferences mechanism (used internally for model selection, signing key path, etc.). Wire these commands to it.

- `set_user_name(name)` → persist to `preferences` table, key `user_name`
- `get_user_name()` → read from `preferences` table, key `user_name`, return `null` if not set
- `set_autonomy_tier(domain, tier)` → call `AutonomyFramework.setTier(domain, tier)` which persists to SQLite
- `get_autonomy_config()` → call `AutonomyFramework.getConfig()` which returns the full per-domain map

### 7. LLM Management — `get_ollama_status`, `select_model`

- `get_ollama_status()` → call `OllamaProvider.isConnected()` + `ModelManager.getAvailableModels()` + `ModelManager.getActiveModel()`. Return: `{ connected: boolean, models: string[], activeModel: string | null }`
- `select_model(modelId)` → call `ModelManager.setActiveModel(modelId)`. Return success/error. If the model isn't downloaded, return an error with the model name (the UI will display it — Ollama model pulling is not in Sprint 1 scope).

---

## Testing Requirements

### New Tests

| Test | Location | Validates |
|------|----------|-----------|
| **Wiring integration** | `tests/integration/desktop-wiring.test.ts` | `send_message` with real Orchestrator returns a real LLM response (requires Ollama running). Token events fire. Response persists to chat history. |
| **Indexing integration** | `tests/integration/desktop-indexing.test.ts` | `start_indexing` with a test directory containing sample .txt and .md files. Progress events fire with increasing counts. `get_knowledge_stats` returns non-zero counts after completion. `get_indexed_directories` returns the test directory. |
| **Audit trail integration** | `tests/integration/desktop-audit.test.ts` | After sending a message and indexing files, `get_action_log` returns entries with correct types and timestamps. Entries are in reverse chronological order. Pagination works. |
| **Preferences integration** | `tests/integration/desktop-preferences.test.ts` | `set_user_name` → `get_user_name` roundtrips. `set_autonomy_tier` → `get_autonomy_config` roundtrips. Values persist across Core restart. |
| **Lifecycle** | `tests/integration/desktop-lifecycle.test.ts` | App startup initializes Core and Gateway. Status events fire. Graceful shutdown completes without errors. |

**Note on Ollama-dependent tests:** Tests that require a running Ollama instance should be marked so they can be skipped in CI environments without a local LLM. Use an environment variable check (e.g., `SEMBLANCE_TEST_OLLAMA=1`) to gate these. The indexing and preference tests do NOT require Ollama and should always run.

### Existing Tests — Zero Regressions

All 351 existing tests must continue to pass. The changes in this step are confined to `lib.rs` and possibly a sidecar script. No changes to `packages/core/`, `packages/gateway/`, or `packages/semblance-ui/` source code should be necessary. If you find a bug in Core or Gateway that blocks wiring, document it as an autonomous decision and fix it minimally.

### Privacy Audit

`pnpm run privacy-audit` must still exit 0. The wiring step should not introduce any new network-capable code in the frontend or new external connections. If the sidecar approach requires a new audit exception (e.g., `node` binary spawned as child process), scope the exception narrowly and document it.

---

## Exit Criteria

**Step 4B is complete when ALL of the following are true:**

1. ☐ `pnpm tauri dev` launches the app and completes onboarding on first run
2. ☐ After onboarding, user name persists and displays in Warm Amber across all screens
3. ☐ Chat works end-to-end: user types a message → real LLM processes it → tokens stream back in real-time → response displays in chat bubble
4. ☐ If Ollama is not running, the app shows a clear "Ollama not connected" status (not a crash)
5. ☐ File indexing works end-to-end: user selects real directories → FileScanner discovers files → Indexer processes them → progress events update the UI → knowledge stats reflect real counts
6. ☐ Knowledge Moment in onboarding shows a real semantic search result from the user's actual indexed files
7. ☐ Activity screen shows real audit trail entries (at minimum: indexing actions and chat messages)
8. ☐ Privacy Dashboard shows real Gateway status (connection count, audit summary)
9. ☐ Settings screen changes actually persist: model switching works, autonomy tier changes persist, name changes persist
10. ☐ App gracefully shuts down: quit from tray or window close flushes state and exits cleanly
11. ☐ All existing 351 tests pass — zero regressions
12. ☐ All new integration tests pass
13. ☐ `pnpm run privacy-audit` exits 0

---

## Boundary Reminders

- **Do not modify `packages/core/` or `packages/gateway/` source code** unless you find a genuine blocking bug. If you do, document the change, the bug, and why the fix is minimal and safe.
- **Do not modify `packages/semblance-ui/` components.** The UI layer is done.
- **Do not modify the frontend React code** unless you discover the event payload shapes don't match what the backend needs to emit. If you need a frontend fix, document it and keep it minimal.
- **All user data stays local.** The sidecar/child process communicates over localhost only.
- **No new external dependencies** without justification per CLAUDE.md rules.

---

## Autonomous Decision Authority

You may proceed without escalating for:

- Choice between in-process vs. sidecar approach for hosting Core/Gateway
- Internal communication protocol between Rust and Node.js (stdin/stdout JSON, domain socket, etc.)
- Mapping function design for translating audit trail entries to frontend format
- Error handling patterns (retry logic, timeout values, error message wording)
- Test file organization and assertion patterns
- Minor bug fixes in Core/Gateway if they are clearly bugs (wrong return type, missing null check) — document each one

**Escalate if:**
- You need to change the IPC protocol schema
- You need to change the audit trail schema
- You need to add a dependency not on the pre-approved list
- The Core or Gateway API doesn't expose what you need and would require a significant interface change
- You discover a fundamental incompatibility between Tauri 2.0's process model and the Core/Gateway architecture

Document all autonomous decisions:

```rust
// AUTONOMOUS DECISION: [Brief description]
// Reasoning: [Why this was the right call]
// Escalation check: [Why this doesn't require Orbital Director input]
```

---

## Implementation Order (Recommended)

1. **Spike the process model** — get Core's `initialize()` callable from the Tauri context. This is the critical unknown. Figure out whether sidecar, embedded Node, or another approach works. Get a "hello world" round-trip (send message → get response) before building anything else.
2. **Wire `send_message`** — the most important command. Get real LLM tokens streaming to the frontend. Once this works, the app feels alive.
3. **Wire indexing pipeline** — `start_indexing` with real FileScanner/Indexer and progress events.
4. **Wire preferences** — `set_user_name`, `get_user_name`, `set_autonomy_tier`, `get_autonomy_config`. Quick wins.
5. **Wire LLM management** — `get_ollama_status`, `select_model`. Connects to ModelManager.
6. **Wire audit trail** — `get_action_log`, `get_privacy_status`. Reads from Gateway's SQLite.
7. **Process lifecycle** — startup sequence, graceful shutdown, crash recovery.
8. **Integration tests** — validate each wiring point end-to-end.
9. **Privacy audit verification** — confirm no regressions.

---

## What This Step Does NOT Include

Do not build these. They are not in scope.

- Ollama model downloading/pulling UI
- Email/calendar integration (Sprint 2)
- Proactive engine (Sprint 2)
- File watching / automatic re-indexing (Sprint 3-4)
- Conversation threading / multiple conversations
- OS-level process sandboxing (Sprint 4)
- Mobile anything

---

## Quality Bar

After this step, the app works. Not "the app launches." Not "the app looks correct." The app **works** — a human installs it, talks to their AI, gets real answers about their real documents, and sees every action logged transparently. That is the Sprint 1 exit criteria, and this step is what makes it real.
