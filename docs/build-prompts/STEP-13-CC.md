# Step 13 — Sprint 3 Capstone: Daily Digest + Chat-About-Document + Clean Slate

## Implementation Prompt for Claude Code

**Date:** February 22, 2026
**Context:** Steps 1–12 complete. Step 12 remediation delivered PlatformAdapter enforcement, real native inference code, and 2,570 passing tests. This is the Sprint 3 capstone — new features, ALL carry-forward loose ends resolved, full Sprint 3 exit criteria validation. Sprint 3 closes with a clean slate or it does not close.
**Test Baseline:** 2,570 tests passing across 137 files. Privacy audit clean. TypeScript compilation clean on `packages/core/`.
**Rule:** ZERO loose ends survive this step. Every carry-forward item listed below must be resolved. Every TypeScript error across ALL packages must be fixed. Every placeholder, stub, TODO, and mock-data path in production code must be replaced with real implementation or explicitly removed.

---

## Read First

Before writing any code, read these files:
- `/CLAUDE.md` — Architecture rules, boundary rules, code quality standards
- `/docs/DESIGN_SYSTEM.md` — All UI must conform to Trellis design system
- `packages/core/platform/types.ts` — PlatformAdapter interface (all I/O goes through this)
- `packages/core/knowledge/vector-store.ts` — Current LanceDB implementation (you will abstract this)
- `packages/core/agent/orchestrator.ts` — Where chat-about-document context injection happens
- `packages/core/agent/weekly-digest.ts` — Existing weekly digest (daily digest builds on same data)

---

## Scope Overview

This step has four sections. ALL four must be completed. No section can be deferred.

| Section | Description | Why |
|---------|-------------|-----|
| A | Carry-Forward Resolution | 9 items from Step 12 that MUST be closed |
| B | New Features | Daily Digest + Chat-About-Document |
| C | TypeScript Clean Slate | ALL TypeScript errors across ALL packages → 0 |
| D | Sprint 3 Exit Criteria Validation | 10 criteria, integration tests, journey test |

---

## Section A: Carry-Forward Resolution (MANDATORY)

These 9 items are carried forward from Step 12. Every one must be resolved in this step. None may be deferred to Sprint 4.

---

### A1: Mobile Vector Store — Replace LanceDB on Mobile

**Problem:** `packages/core/knowledge/vector-store.ts` directly imports `@lancedb/lancedb`, a Rust-native binary that cannot load on React Native. Mobile currently has keyword search only. Sprint 3 exit criterion #2 (semantic search operational) and #7 (mobile operational) both require semantic search on mobile.

**Solution:** Abstract vector storage behind the PlatformAdapter, with LanceDB on desktop and a SQLite-based vector store on mobile.

**Implementation:**

**Step 1 — VectorStoreAdapter interface:**

```typescript
// Add to packages/core/platform/types.ts
interface VectorStoreAdapter {
  // Initialize the vector store with a collection/table name and vector dimensions
  initialize(name: string, dimensions: number): Promise<void>;

  // Add vectors with associated metadata
  add(vectors: VectorEntry[]): Promise<void>;

  // Search for nearest neighbors
  search(queryVector: number[], limit: number, filter?: VectorFilter): Promise<VectorResult[]>;

  // Delete vectors by ID
  delete(ids: string[]): Promise<void>;

  // Get count of stored vectors
  count(): Promise<number>;

  // Close/cleanup
  close(): Promise<void>;
}

interface VectorEntry {
  id: string;
  vector: number[];
  metadata: Record<string, unknown>;
  text: string;  // Original text for this chunk
}

interface VectorResult {
  id: string;
  score: number;  // Cosine similarity (0-1)
  metadata: Record<string, unknown>;
  text: string;
}

interface VectorFilter {
  source?: string;      // Filter by data source (email, file, calendar)
  dateAfter?: string;   // ISO date
  dateBefore?: string;  // ISO date
}
```

**Step 2 — Desktop adapter (LanceDB wrapper):**

```typescript
// packages/core/platform/desktop-adapter.ts — add to existing desktop adapter
// Wraps the existing LanceDB implementation behind VectorStoreAdapter interface
// This is a refactor, not a rewrite — the existing vector-store.ts logic moves here
```

**Step 3 — Mobile adapter (SQLite-VSS or brute-force cosine):**

Two implementation paths, in order of preference:

**Path A — sqlite-vss (preferred):**
`sqlite-vss` is a SQLite extension that adds vector similarity search. Since mobile already has `op-sqlite`, this is the most natural fit. Store embeddings as BLOBs in SQLite, use the `vss0` virtual table for approximate nearest neighbor search.

```sql
-- Create virtual table for vector search
CREATE VIRTUAL TABLE vss_vectors USING vss0(embedding(768));

-- Insert
INSERT INTO vss_vectors(rowid, embedding) VALUES (?, ?);

-- Search (returns rowids ordered by distance)
SELECT rowid, distance FROM vss_vectors WHERE vss_search(embedding, ?) LIMIT ?;
```

Check if `op-sqlite` supports loading extensions. If it does, use sqlite-vss. If not, fall back to Path B.

**Path B — Brute-force cosine similarity (fallback):**
Store embedding vectors as BLOBs in a regular SQLite table. On search, load all vectors, compute cosine similarity in TypeScript, return top-K. This is O(n) but perfectly adequate for personal-scale datasets (tens of thousands of vectors, not millions).

```typescript
// packages/core/platform/mobile-vector-store.ts
export class SQLiteVectorStore implements VectorStoreAdapter {
  // Store vectors in SQLite as Float32Array BLOBs
  // On search: load chunks in batches, compute cosine similarity, heap-select top-K
  // For 10,000 vectors × 768 dimensions: ~30MB RAM, <500ms search time
  // This is acceptable for a personal AI with email + calendar + files
}
```

**Step 4 — Refactor vector-store.ts:**

`packages/core/knowledge/vector-store.ts` must be refactored to use `VectorStoreAdapter` from the platform instead of importing LanceDB directly.

- Remove: `import * as lancedb from '@lancedb/lancedb'`
- Replace: all LanceDB API calls with `VectorStoreAdapter` method calls
- The adapter is obtained via `getPlatform().vectorStore`

**Step 5 — Guard test extension:**

Add `@lancedb/lancedb` to the banned imports list in the guard test (`tests/privacy/no-node-builtins-in-core.test.ts`). After this, any direct LanceDB import in `packages/core/` (outside `platform/desktop-adapter.ts`) fails the build.

**Step 6 — Mobile semantic search wiring:**

`packages/mobile/src/data/search-adapter.ts` must route search queries through the Core's `SemanticSearch` module (which now uses `VectorStoreAdapter`), NOT fall back to keyword-only search. Remove the keyword-only fallback path. If semantic search doesn't work on mobile after this change, the tests fail — that's the fail-loud mechanism.

**Tests (20+):**
- VectorStoreAdapter interface compliance test (desktop and mobile implementations)
- Desktop adapter: add vectors, search returns nearest neighbors, filter by source/date
- Mobile adapter: same tests — add, search, filter, delete, count
- Search quality: cosine similarity of known similar vectors > cosine similarity of known dissimilar vectors
- Guard test: `@lancedb/lancedb` import in core (outside desktop-adapter) fails build
- Mobile search-adapter routes through SemanticSearch (not keyword fallback)
- Performance: 10,000 vector search completes in <1 second on mobile adapter
- End-to-end: index document → embed → search by meaning → return relevant chunks (on mobile adapter)

---

### A2: Encrypted Sync — Real AES-256-GCM

**Problem:** `packages/core/routing/platform-sync-crypto.ts` uses Base64 encoding + HMAC tag instead of real AES-256-GCM encryption. Cross-device sync data (action trail, preferences, style profile) travels over local network with weak protection.

**Solution:** Replace with real AES-256-GCM using the PlatformAdapter crypto interface.

**Implementation:**

Add to PlatformAdapter's CryptoAdapter interface:
```typescript
interface CryptoAdapter {
  // Existing methods...
  sha256(data: string): Promise<string>;
  hmacSha256(key: string, data: string): Promise<string>;
  randomUUID(): string;

  // NEW — symmetric encryption
  generateKey(): Promise<string>;  // Returns base64-encoded 256-bit key
  encrypt(plaintext: string, key: string): Promise<EncryptedPayload>;
  decrypt(payload: EncryptedPayload, key: string): Promise<string>;
}

interface EncryptedPayload {
  ciphertext: string;  // Base64
  iv: string;          // Base64, 12 bytes for GCM
  tag: string;         // Base64, 16 bytes authentication tag
}
```

Desktop implementation: use Node.js `crypto.createCipheriv('aes-256-gcm', ...)`.
Mobile implementation: use `react-native-quick-crypto` which provides the same `createCipheriv` API.

Replace the Base64+HMAC code in `platform-sync-crypto.ts` with calls to `getPlatform().crypto.encrypt()` / `decrypt()`.

**Tests (8+):**
- Encrypt → decrypt roundtrip produces original plaintext
- Decrypt with wrong key throws error
- Decrypt with tampered ciphertext throws error (GCM authentication)
- Decrypt with tampered IV throws error
- Each encrypted payload has unique IV (no IV reuse)
- Desktop and mobile adapter both produce valid encrypted payloads
- Cross-adapter: desktop encrypts, mobile decrypts (and vice versa) with shared key
- Payload format matches EncryptedPayload interface

---

### A3: Mobile Inbox End-to-End Wiring

**Problem:** `packages/mobile/src/data/inbox-adapter.ts` has the adapter layer but it isn't wired to real upstream data (email indexer → SQLite → adapter).

**Solution:** Wire `inbox-adapter.ts` to read from the Core's email store via PlatformAdapter's SQLite. When the Gateway has fetched emails and the Core has indexed them, the mobile inbox adapter must read the same indexed data — not mock data, not a separate store.

**Implementation:**
- `inbox-adapter.ts` calls into Core's email index via the `KnowledgeGraph` query interface
- Query returns real indexed emails with AI triage categories
- If no emails are indexed yet (fresh install before email connection), the adapter returns an empty state with a clear "Connect email to get started" message — NOT mock data

**Tests (5+):**
- Adapter returns real indexed emails when email store is populated
- Adapter returns empty state (not mock data) when email store is empty
- Triage categories come from Core's AI classification, not hardcoded labels
- Swipe actions on inbox items trigger real Gateway operations through IPC
- Adapter correctly maps Core data types to mobile UI format

---

### A4: Settings Sync Wiring

**Problem:** Cross-device sync transport exists (Commit 7 of remediation) but settings-specific sync isn't wired. Changing autonomy tier on mobile doesn't propagate to desktop.

**Solution:** Wire settings changes to the sync payload explicitly.

**Implementation:**
- When user changes autonomy tier, per-domain config, or notification preferences on any device, the change is added to the next sync payload
- Sync payload already has the data format (from Commit 7); this wires the trigger
- Conflict resolution: last-write-wins with timestamp (already defined in sync logic)

**Tests (4+):**
- Change autonomy tier on mobile → sync payload includes the change
- Receive sync payload with newer autonomy tier → local settings updated
- Receive sync payload with older timestamp → local settings preserved (last-write-wins)
- Style profile sync: desktop takes precedence (per conflict resolution rule)

---

### A5: LanceDB Fail-Loud on Mobile

**Problem:** Resolved by A1. After A1, mobile uses `VectorStoreAdapter` (SQLite-based), not LanceDB. The fail-loud concern is addressed by the guard test that prevents LanceDB imports in Core and by removing the keyword-only fallback in the search adapter.

**Verification:** After A1 is complete, verify:
- Mobile search adapter NEVER falls back to keyword-only search
- If the mobile vector store fails to initialize, it throws a clear error (not silent degradation)
- Guard test blocks any re-introduction of direct LanceDB imports

**No separate commit needed — verified as part of A1 tests.**

---

### A6: 243 Pre-Existing TypeScript Errors — See Section C

This is handled in Section C below, which addresses ALL TypeScript errors across ALL packages. The 243 errors found during Step 10 audit plus any additional errors accumulated since then — all go to zero.

---

### A7: vitest-results.txt Staleness

**Problem:** In Steps 10 and 11, the test results file on disk was sometimes stale (showing pre-step baseline instead of actual post-commit results).

**Solution:** In the final commit of this step (the Sprint 3 validation commit), the completion report must include:
1. The exact `npx vitest run` command executed
2. The timestamp of execution
3. The total test count and pass/fail from that execution
4. Confirmation that the count reflects ALL new tests from this step

**Additionally:** Add a CI verification script that compares the test count in vitest output against the expected minimum. If the count is below the expected floor (2,570 + new tests from this step), the verification fails.

**Tests (2):**
- Verification script exists and runs
- Script correctly identifies when reported count is below expected floor

---

### A8: Quick Capture Widget — At Least One Platform

**Problem:** Step 12 exit criterion 12 from `SEMBLANCE_SPRINT_RESTRUCTURE.md` requires "Quick capture widget functional on at least one platform (iOS or Android)." The Step 12 remediation treated this as a stretch goal and it was not verified as complete. Quick capture itself works (Step 10 delivered it), but the native home screen widget is missing.

**Solution:** Implement quick capture widget for at least one platform. iOS WidgetKit is preferred (simpler API, higher-value user base). Android App Widget is the fallback.

**Implementation:**

**iOS WidgetKit (preferred):**
- Widget target in the Xcode project
- Simple text input widget that sends captured text to the app via App Groups shared container
- App reads from shared container on launch, processes captures through the existing quick capture pipeline
- Widget displays: text input + "Capture" button + last 3 captures preview

**If iOS widget cannot be implemented** (WidgetKit requires Xcode project setup that can't be done on Windows):
- Create the complete widget source files (Swift + widget configuration) with clear documentation
- Add to `docs/MOBILE_VERIFICATION_PLAN.md` as a build-on-Mac verification step
- Create a mock widget test that verifies the shared container integration path works

**Android alternative:**
- Android App Widget with text input and capture button
- Uses SharedPreferences or ContentProvider to pass data to the React Native app

**At minimum:** The widget source code must be structurally complete with real framework APIs (same standard as the inference bridges). If it can't be compiled on Windows, it gets the same treatment — static source audit to verify no placeholders, documentation in the verification plan.

**Tests (4+):**
- Quick capture from widget input processes through existing capture pipeline
- Widget data reaches the app's capture store
- Capture with time reference from widget creates reminder
- Static source audit of widget code (no placeholder strings)

---

### A9: Native Inference Real-Device Verification Plan

**Problem:** iOS MLX and Android llama.cpp are structurally complete with real framework API calls, but cannot be compiled or tested on Windows. Real device testing requires macOS (iOS) and macOS/Linux (Android NDK).

**This is the ONE item that cannot be fully resolved in Step 13** due to hardware constraints. The resolution is a documented verification plan, not a deferred fix.

**Required documentation** (add to `docs/MOBILE_VERIFICATION_PLAN.md`):

```markdown
# Mobile Native Inference — Verification Plan

## Status
Native Swift (MLX/llama.cpp) and Kotlin/C++ (llama.cpp JNI) modules are
structurally complete with real framework API calls. Verified by static
source audit (no placeholder strings, real API calls confirmed).
Cannot compile or test on device from Windows development environment.

## Verification Steps (requires macOS)
1. Open packages/mobile/ios in Xcode
2. Verify pod install / SPM resolution for mlx-swift (or llama.cpp SPM)
3. Build for iOS Simulator (arm64)
4. Run: load test model (smallest available GGUF), call generate(), verify output
5. If MLX path fails: verify llama.cpp iOS fallback path

## Verification Steps (requires macOS or Linux)
1. Open packages/mobile/android in Android Studio
2. Verify CMake NDK build for semblance_llama_jni.cpp
3. Build for Android Emulator (arm64-v8a)
4. Run: load test model, call generate(), verify output

## What Passes Without Device
- Static source audit: zero placeholder strings in native code
- TypeScript adapter layer: full test coverage with mock native modules
- Interface contracts: native module exports match TypeScript bridge expectations
- Architecture: InferenceRouter correctly routes to mobile bridge

## Acceptance Criteria for Device Test
- Model loads in <10 seconds on target device class
- generate() returns coherent text (not placeholder, not empty, not error)
- Streaming tokens arrive incrementally
- Memory stays within 80% of device available RAM
- No crash after 10 consecutive inference calls
```

**No code changes needed for this item — documentation only.**

---

## Section B: New Features

---

### B1: Daily Digest

**What:** A lighter daily summary that complements the existing weekly digest. Shows action counts and time-saved estimate for the current day.

**Format:**
```
Today: 6 emails handled, 1 meeting prepped, 2 follow-ups tracked.
Time saved: ~25 minutes.
```

**Implementation:**

**Data source:** Same action log used by the weekly digest (`packages/core/agent/weekly-digest.ts`). The daily digest queries for actions within the current day (midnight to now in user's local timezone).

**Generator:**
```typescript
// packages/core/agent/daily-digest.ts
export class DailyDigestGenerator {
  // Queries action log for today's actions
  // Groups by category (email, calendar, follow-up, web search, reminder, etc.)
  // Sums estimatedTimeSavedSeconds across all actions
  // Returns structured DigestData, not formatted string

  generateDigest(date?: Date): Promise<DailyDigest>;
}

interface DailyDigest {
  date: string;                    // ISO date
  actionCounts: Record<string, number>;  // { email: 6, calendar: 1, follow_up: 2 }
  totalActions: number;
  estimatedTimeSavedMinutes: number;
  topActions: DigestAction[];      // 3 most significant actions for detail view
  comparedToAverage?: {            // Optional: "32% more productive than your weekly average"
    percentDifference: number;
    direction: 'more' | 'less';
  };
}
```

**User preference:**
- Setting: `dailyDigestEnabled` (boolean, default: `true`)
- Setting: `dailyDigestTime` (string, default: `"08:00"`, user's local time)
- Stored in preferences SQLite table via PlatformAdapter
- Synced across devices via settings sync (A4)

**Desktop UI:**
- Inbox card at top of Universal Inbox when daily digest is available
- Card uses `--color-surface-2` background, `--color-primary` (Warm Amber) accent for time-saved number
- Dismissible (tap X to dismiss for today)
- Tap to expand shows top 3 actions with detail

**Mobile UI:**
- Same inbox card design, responsive for mobile width
- Local notification at configured time (`@notifee/react-native`)
- Notification tap deep-links to inbox with digest card expanded

**Settings UI:**
- Toggle: "Daily summary" (on/off)
- Time picker: "Deliver at" (time selector)
- Located in Settings → Notifications section

**Tests (12+):**
- Digest generates correct action counts from action log
- Digest sums time-saved correctly
- Empty day produces zero-action digest (not error)
- Setting disabled → no digest generated, no notification
- Setting enabled → digest generated at configured time
- Digest card renders on desktop with correct data
- Digest card renders on mobile with correct data
- Notification fires at configured time on mobile
- Notification deep-links to inbox
- Digest data syncs to weekly digest totals (consistency check)
- Time-saved comparison to average calculates correctly
- Digest respects user timezone

---

### B2: Chat-About-Document

**What:** Drag a file into the chat → file indexes into embedding pipeline → conversation scoped to that document's embeddings with priority. The infrastructure exists (file indexing + semantic search + chat). This is interaction design and UX wiring.

**Supported formats:** PDF, DOCX, TXT, MD (already supported by file indexer in `packages/core/knowledge/file-scanner.ts`).

**Implementation:**

**Document context manager:**
```typescript
// packages/core/agent/document-context.ts
export class DocumentContextManager {
  // Holds reference to the currently-scoped document
  private activeDocumentId: string | null = null;
  private activeDocumentChunks: string[] = [];  // Chunk IDs in vector store

  // Index a document and set it as active context
  async setDocument(filePath: string): Promise<DocumentContextInfo>;

  // Clear active document context
  clearDocument(): void;

  // Check if a document is in context
  hasActiveDocument(): boolean;

  // Get context for injection into LLM prompt
  getContextForPrompt(userQuery: string): Promise<DocumentContext>;
}

interface DocumentContextInfo {
  id: string;
  filename: string;
  format: string;
  chunkCount: number;
  wordCount: number;
}

interface DocumentContext {
  documentName: string;
  relevantChunks: string[];     // Top chunks by semantic similarity to query
  fullDocumentAvailable: boolean;
}
```

**Orchestrator integration:**
When `DocumentContextManager.hasActiveDocument()` is true, the Orchestrator's prompt construction must:
1. Retrieve relevant chunks from the document using semantic search against the user's query
2. Inject those chunks into the system prompt with a preamble: "The user is asking about the document '{filename}'. Relevant sections: ..."
3. Still allow the LLM to reference other knowledge graph data (emails about the document's topic, related calendar events) — scoped conversation means document chunks are prioritized, not exclusive

**Desktop UI:**

Drop zone:
- Chat area accepts drag-and-drop of files
- On drag enter: overlay with "Drop file to discuss" text and document icon
- On drop: file path passed to `DocumentContextManager.setDocument()`
- Also: file picker button in chat input area (for users who prefer click over drag)

Document context indicator:
- When document is active: persistent banner below chat header
- Banner shows: document icon + filename + "Discussing: {filename}" + X button to clear
- Background: `--color-accent-subtle` (Sage #7C9A8E at 10% opacity)
- Text: `--color-text-secondary`
- X button: `--color-muted`

Clear action:
- Click X on banner → `DocumentContextManager.clearDocument()`
- Banner disappears, conversation returns to general mode
- Chat shows system message: "Document context cleared. Ask me anything."

**Mobile UI:**
- No drag-and-drop (mobile limitation)
- File picker button in chat input area → opens system file picker
- Same document context banner (responsive for mobile width)
- Same clear action

**Tests (15+):**
- Drop file into chat → document indexes and context activates
- File picker → same result as drag-and-drop
- Context indicator shows correct filename
- Clear action removes context and shows system message
- Prompt includes relevant document chunks when context is active
- Semantic search prioritizes document chunks over general knowledge
- Non-document knowledge is still accessible (not exclusive)
- Unsupported file format shows clear error message
- Large file (>10MB) shows progress indicator during indexing
- Multiple documents: setting new document replaces previous (only one at a time)
- Context survives across messages in same conversation
- Context does NOT survive across conversations (new conversation = no context)
- Document chunks appear in correct relevance order
- Mobile file picker works and activates context
- Context indicator renders correctly on mobile

---

## Section C: TypeScript Clean Slate (MANDATORY)

**Requirement:** After this step, `npx tsc --noEmit` must produce ZERO errors across ALL packages. Not just `packages/core/`. ALL of them:

- `packages/core/`
- `packages/gateway/`
- `packages/desktop/`
- `packages/mobile/`
- `packages/semblance-ui/`

**Process:**

1. Run `npx tsc --noEmit` from project root (or each package individually if no root tsconfig project references)
2. Catalog every error by package and file
3. Fix every error. Categories of likely fixes:
   - Missing type annotations → add explicit types
   - `any` types → narrow with type guards or replace with `unknown`
   - Missing interface members → add implementations
   - Import errors → fix paths, add missing exports
   - Strict null checks → add null guards
   - Unused variables → remove or use
   - Type mismatches from recent refactoring → align types
4. Re-run `npx tsc --noEmit` and confirm ZERO errors
5. Add a CI verification: `npx tsc --noEmit` runs as part of the test suite. If it produces any errors, the build fails.

**The 243 pre-existing errors from Step 10 audit:** These were in code prior to Step 10. Some may have been fixed by Step 12 remediation's refactoring. Whatever remains, plus any new errors — ALL go to zero.

**Tests (3+):**
- CI script runs `tsc --noEmit` and exits 0
- CI script correctly fails when a type error is introduced (regression test)
- All packages compile individually without errors

---

## Section D: Sprint 3 Exit Criteria Validation (MANDATORY)

All 10 Sprint 3 exit criteria must pass. Each one gets at least one integration test that verifies the criterion end-to-end.

### D1: Sprint 3 Exit Criteria — Integration Tests

Create `tests/integration/sprint-3-validation.test.ts`:

```typescript
describe('Sprint 3 Exit Criteria', () => {

  // Criterion 1: Zero-config onboarding
  describe('1. Zero-config onboarding', () => {
    it('hardware detection returns valid profile without user input');
    it('model registry returns default model for detected hardware');
    it('onboarding flow completes: detect → consent → download → inference ready');
    it('no terminal interaction required (no Ollama dependency)');
  });

  // Criterion 2: Semantic search operational
  describe('2. Semantic search', () => {
    it('index document → search by meaning → returns relevant results (desktop)');
    it('index document → search by meaning → returns relevant results (mobile adapter)');
    it('semantic search outperforms keyword search on meaning-based query');
    it('knowledge-graph-first routing checks local data before web search');
  });

  // Criterion 3: Web search answers general questions
  describe('3. Web search', () => {
    it('general knowledge query routes to Brave Search via Gateway');
    it('search results return within 5 seconds');
    it('web search visible in Network Monitor audit trail');
  });

  // Criterion 4: URL reading works
  describe('4. URL reading', () => {
    it('URL submitted → web fetch adapter → content extracted → response generated');
    it('Readability extraction produces clean text from article HTML');
  });

  // Criterion 5: Reminders end-to-end
  describe('5. Reminders', () => {
    it('natural language → parsed reminder → stored → notification fires');
    it('snooze and dismiss work');
    it('quick capture with time detection creates reminder');
  });

  // Criterion 6: Email drafts sound like user
  describe('6. Style-matched drafting', () => {
    it('style profile extracts patterns from sent emails');
    it('draft with style profile differs from unstyled draft');
    it('style match score is visible in UI');
    it('correction feedback updates style profile');
  });

  // Criterion 7: Mobile operational
  describe('7. Mobile', () => {
    it('mobile adapter initializes SemblanceCore successfully');
    it('mobile inference bridge routes through InferenceRouter');
    it('mobile semantic search uses VectorStoreAdapter (not keyword fallback)');
    it('task routing classifies and delegates correctly');
    it('cross-device sync transfers preferences via encrypted transport');
    it('mobile works offline with local inference');
  });

  // Criterion 8: Chat-about-document works
  describe('8. Chat-about-document', () => {
    it('set document context → query → response references document content');
    it('clear document context → query → response uses general knowledge');
    it('document context indicator present when active');
  });

  // Criterion 9: Privacy guarantees hold
  describe('9. Privacy', () => {
    it('guard test: zero Node.js builtins in packages/core/');
    it('guard test: zero direct LanceDB imports in packages/core/');
    it('no HTTP imports anywhere in packages/core/');
    it('sync transport uses local network only (no cloud relay)');
    it('sync encryption uses AES-256-GCM (not Base64)');
    it('all web searches appear in Network Monitor');
    it('all email operations appear in audit trail');
  });

  // Criterion 10: Performance acceptable
  describe('10. Performance', () => {
    it('email categorization completes in <2 seconds (mocked inference)');
    it('web search returns results in <5 seconds (mocked network)');
    it('semantic search returns results in <1 second for 10K vectors');
    it('mobile vector store search completes in <1 second for 10K vectors');
    it('daily digest generates in <500ms');
  });
});
```

### D2: End-to-End Journey Test

Create `tests/integration/sprint-3-journey.test.ts`:

```typescript
describe('Sprint 3 End-to-End Journey', () => {
  it('complete user journey: fresh install → working AI assistant', async () => {
    // 1. Initialize SemblanceCore with test platform adapter
    // 2. Hardware detection → model selection (mocked)
    // 3. Onboarding completes → user names their Semblance
    // 4. Email connection established (mocked Gateway)
    // 5. Knowledge Moment fires — compound knowledge from email + calendar
    // 6. User asks a web search question → Brave Search via Gateway
    // 7. User sets a reminder → stored → retrievable
    // 8. User drops a document into chat → indexed → contextual Q&A works
    // 9. User requests email draft → style-matched draft returned with score
    // 10. Daily digest generates with correct action counts
    // 11. Mobile adapter performs semantic search (not keyword fallback)
    // 12. Cross-device sync sends encrypted payload (AES-256-GCM verified)
    // 13. All actions appear in audit trail
    // 14. Privacy audit passes — zero unauthorized network access
  });
});
```

### D3: Performance Benchmarks Documentation

Create `docs/PERFORMANCE_BENCHMARKS.md`:

Document measured performance for each criterion 10 metric:
- Email categorization latency
- Web search round-trip latency
- Semantic search latency (desktop — LanceDB)
- Semantic search latency (mobile — SQLite vector store)
- Knowledge Moment generation time
- Daily digest generation time
- Mobile inference latency (estimated from mock timings)
- Document indexing time per page

---

## Commit Strategy

12 commits. Each compiles, passes all tests, and leaves the codebase in a working state.

| Commit | Section | Description | Tests |
|--------|---------|-------------|-------|
| 1 | A1 | VectorStoreAdapter interface + desktop LanceDB wrapper | 10+ |
| 2 | A1 | Mobile SQLite vector store + guard test extension | 12+ |
| 3 | A1 | Refactor vector-store.ts + wire mobile search adapter | 8+ |
| 4 | A2 | AES-256-GCM encryption for sync transport | 8+ |
| 5 | A3+A4 | Mobile inbox end-to-end wiring + settings sync | 9+ |
| 6 | C | TypeScript errors → zero across all packages | 3+ |
| 7 | B1 | Daily digest generator + preferences | 8+ |
| 8 | B1 | Daily digest UI (desktop + mobile) + notifications | 6+ |
| 9 | B2 | Document context manager + orchestrator integration | 10+ |
| 10 | B2 | Chat-about-document UI (desktop + mobile) | 8+ |
| 11 | A8 | Quick capture widget (at least iOS) | 4+ |
| 12 | A7+A9 | vitest verification script + MOBILE_VERIFICATION_PLAN.md | 4+ |
| 13 | D | Sprint 3 validation: exit criteria tests + journey test + benchmarks | 30+ |

**Minimum 120 new tests. Target: 140+.**

---

## Exit Criteria

Step 13 is complete when ALL of the following are true. No exceptions. No deferrals.

### Carry-Forward Resolution (A)
1. ☐ Mobile semantic search uses VectorStoreAdapter (SQLite-based), NOT keyword fallback
2. ☐ Guard test blocks direct `@lancedb/lancedb` imports in `packages/core/` (outside desktop-adapter)
3. ☐ VectorStoreAdapter tests pass on both desktop (LanceDB) and mobile (SQLite) implementations
4. ☐ 10,000 vector search on mobile completes in <1 second
5. ☐ Cross-device sync uses real AES-256-GCM encryption (not Base64+HMAC)
6. ☐ Encrypt → decrypt roundtrip with wrong key throws error (authentication verified)
7. ☐ Mobile inbox returns real indexed data (not mock data) or empty state
8. ☐ Settings changes sync between devices via encrypted transport
9. ☐ Quick capture widget source code complete for at least one platform (iOS preferred)
10. ☐ `docs/MOBILE_VERIFICATION_PLAN.md` exists with complete verification steps (including widget)
11. ☐ vitest verification script confirms test count matches expected floor

### New Features (B)
12. ☐ Daily digest generates correct action counts and time-saved from action log
13. ☐ Daily digest respects enabled/disabled preference
14. ☐ Daily digest notification fires on mobile at configured time
15. ☐ Chat-about-document: drop/pick file → index → scoped conversation works
16. ☐ Document context indicator visible when document is active
17. ☐ Clear document context returns to general conversation

### TypeScript Clean Slate (C)
18. ☐ `npx tsc --noEmit` produces ZERO errors across ALL packages
19. ☐ CI script for TypeScript compilation check exists and passes

### Sprint 3 Validation (D)
20. ☐ All 10 Sprint 3 exit criteria pass with integration tests
21. ☐ End-to-end journey test passes
22. ☐ Performance benchmarks documented
23. ☐ Privacy audit clean
24. ☐ All existing 2,570 tests still pass — zero regressions
25. ☐ 120+ new tests from this step
26. ☐ Total test suite passes with zero failures

**All 26 criteria must be marked PASS. Sprint 3 does not close until every line is checked.**

---

## Approved Dependencies

### New (if needed for mobile vector store)
- `sqlite-vss` — SQLite vector search extension (if compatible with op-sqlite)
- No other new production dependencies should be needed — this step uses existing infrastructure

### NOT Approved
- Any cloud service SDK
- Any analytics or telemetry package
- Any new vector database (ChromaDB, Pinecone, Weaviate, etc.)
- Any networking library that bypasses the Gateway

---

## Autonomous Decision Authority

You may proceed without escalating for:
- Choosing between sqlite-vss (Path A) and brute-force cosine (Path B) for mobile vector store
- TypeScript error fixes that don't change public APIs
- Performance optimization within existing architecture
- Test organization and assertion patterns
- Daily digest formatting details
- Chat-about-document UX micro-interactions
- Minor PlatformAdapter interface additions for vector store operations

## Escalation Triggers — STOP and Report

You MUST stop and report back to Orbital Directors if:
- sqlite-vss AND brute-force cosine both fail to provide adequate mobile search quality → need architecture discussion
- TypeScript errors require changing more than 5 public API signatures → scope is bigger than expected
- Document indexing for chat-about-document requires new file format support not in the existing file scanner
- Any change would require modifying PlatformAdapter guard test exclusions beyond `desktop-adapter.ts`
- Performance benchmarks show any metric >3x the target → may need architecture changes
- Sprint 3 exit criteria cannot all be met with the current codebase → need to identify what's blocking

---

## Completion Report

When finished, provide:

```
## Step 13 — Completion Report

### Section A: Carry-Forward Resolution
| # | Item | Status | Evidence |
|---|------|--------|----------|
| A1 | Mobile vector store | PASS/FAIL | Implementation path chosen, search test result |
| A2 | AES-256-GCM sync encryption | PASS/FAIL | Encrypt/decrypt test, wrong-key rejection |
| A3 | Mobile inbox wiring | PASS/FAIL | Real data or empty state (not mock) |
| A4 | Settings sync | PASS/FAIL | Change on mobile → reflected on desktop |
| A5 | LanceDB fail-loud | PASS/FAIL | Guard test + no keyword fallback |
| A6 | TypeScript errors | PASS/FAIL | tsc --noEmit output |
| A7 | vitest verification | PASS/FAIL | Script output |
| A8 | Quick capture widget | PASS/FAIL | Widget source complete, static audit passes |
| A9 | Mobile verification plan | PASS/FAIL | docs/MOBILE_VERIFICATION_PLAN.md exists |

### Section B: New Features
| Feature | Status | Evidence |
|---------|--------|----------|
| Daily Digest | PASS/FAIL | Digest output for test day |
| Chat-About-Document | PASS/FAIL | Document indexed, contextual query answered |

### Section C: TypeScript Clean Slate
- tsc --noEmit: [number] errors (MUST be 0)
- Packages checked: core, gateway, desktop, mobile, semblance-ui

### Section D: Sprint 3 Validation
| Sprint 3 Exit Criterion | Status |
|-------------------------|--------|
| 1. Zero-config onboarding | PASS/FAIL |
| 2. Semantic search (desktop + mobile) | PASS/FAIL |
| 3. Web search | PASS/FAIL |
| 4. URL reading | PASS/FAIL |
| 5. Reminders | PASS/FAIL |
| 6. Style-matched drafting | PASS/FAIL |
| 7. Mobile operational | PASS/FAIL |
| 8. Chat-about-document | PASS/FAIL |
| 9. Privacy guarantees | PASS/FAIL |
| 10. Performance acceptable | PASS/FAIL |

### Test Summary
- Previous: 2,570
- New: [number]
- Total: [number]
- Failures: 0

### Escalation Triggers Hit
- [None / description]

### Decisions Made
- Mobile vector store: [sqlite-vss / brute-force cosine] because [reason]
- [Any other decisions]
```

---

## The Bar

This is the Sprint 3 capstone. When this step closes:

- Every carry-forward item from Step 12 is resolved. Not deferred. Not documented. Resolved.
- TypeScript compiles clean across the entire project. Zero errors. Zero warnings that were errors.
- A non-technical user downloads Semblance, it works in 5 minutes, manages email, answers questions from the web, reads articles, reminds them of tasks, drafts in their voice, works on their phone with real semantic search, syncs securely between devices. They drop a PDF into chat and ask questions about it. They get a daily summary of what their AI did for them.
- Never opened a terminal. Never paid. Never goes back to ChatGPT.

Sprint 3 makes Semblance the best free AI assistant that exists. Nothing less.
