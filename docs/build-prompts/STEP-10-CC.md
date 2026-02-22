# Step 10 — Web Search + Web Fetch + Reminders + Quick Capture

## Implementation Prompt for Claude Code
**Date:** February 21, 2026
**Sprint:** 3 (Becomes Powerful)
**Baseline:** Step 9 complete. 1,520 tests passing. Privacy audit clean.
**Canonical references:** Read `CLAUDE.md` and `DESIGN_SYSTEM.md` from the project root before making any implementation decisions.

---

## Context

Step 9 delivered native inference (llama-cpp-2 Rust FFI), the embedding pipeline (nomic-embed-text-v1.5, 768-dim), semantic search, hardware detection, managed model downloads, zero-config onboarding, and the InferenceRouter wired into SemblanceCore/Orchestrator. 1,520 tests pass. The privacy audit is clean.

Step 10 delivers four capabilities bundled together because they all follow the established Gateway adapter pattern and address the highest-priority gaps identified in the capability audit:

1. **Web Search** — the #1 critical gap. Without it, Semblance cannot answer "what's the weather" or "what happened with [news event]" and users abandon immediately.
2. **Web Fetch (URL Reading)** — companion to web search. "Summarize this article: [URL]" is a core daily workflow.
3. **Reminders** — the most frequent micro-interaction with AI assistants. Without it, users keep Siri/Google Assistant alongside Semblance.
4. **Quick Capture** — the entry point for ambient intelligence. Users dump thoughts, Semblance organizes them.

**Critical architectural principle:** Web search and web fetch go through the Gateway. The AI Core NEVER makes network requests directly. Every search and fetch is logged to the audit trail BEFORE execution and visible in the Network Monitor. This is non-negotiable.

**Knowledge-graph-first routing:** When the user asks a question, Semblance checks local data (semantic search across the knowledge graph) FIRST. If local data answers the question, no web search fires. If local data is insufficient or the query is inherently external (weather, current events, stock prices, general knowledge questions), web search fires. This routing decision is made by the AI Core's Orchestrator — NOT by the Gateway. The Gateway executes searches; the Core decides when to search.

---

## Architecture

### New ActionTypes

Add to the `ActionType` union in the IPC protocol types:

```typescript
type ActionType =
  | 'email.fetch'
  | 'email.send'
  | 'email.draft'
  | 'calendar.fetch'
  | 'calendar.create'
  | 'calendar.update'
  | 'finance.fetch_transactions'
  | 'health.fetch'
  | 'web.search'          // NEW — Step 10
  | 'web.fetch'           // NEW — Step 10
  | 'reminder.create'     // NEW — Step 10
  | 'reminder.update'     // NEW — Step 10
  | 'reminder.list'       // NEW — Step 10
  | 'reminder.delete'     // NEW — Step 10
  | 'service.api_call';
```

### New Typed Payloads

```typescript
interface WebSearchPayload {
  query: string;
  count?: number;           // Number of results to return (default: 5, max: 20)
  freshness?: 'day' | 'week' | 'month'; // Optional recency filter
}

interface WebSearchResponse {
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    age?: string;            // Relative age ("2 hours ago", "3 days ago")
  }>;
  query: string;             // Echo back for audit
  provider: 'brave' | 'searxng';
}

interface WebFetchPayload {
  url: string;
  maxContentLength?: number; // Max characters to return (default: 50000)
}

interface WebFetchResponse {
  url: string;
  title: string;
  content: string;           // Extracted article text (HTML stripped)
  bytesFetched: number;
  contentType: string;
}

interface ReminderCreatePayload {
  text: string;
  dueAt: string;             // ISO 8601 datetime
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
  source?: 'chat' | 'quick-capture' | 'proactive';
}

interface ReminderUpdatePayload {
  id: string;
  text?: string;
  dueAt?: string;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
  status?: 'pending' | 'fired' | 'dismissed' | 'snoozed';
  snoozedUntil?: string;     // ISO 8601, set when status is 'snoozed'
}

interface ReminderListPayload {
  status?: 'pending' | 'fired' | 'dismissed' | 'snoozed' | 'all';
  limit?: number;
}

interface ReminderDeletePayload {
  id: string;
}
```

### File Locations

Follow existing patterns. Study how `email.fetch`, `email.send`, and the IMAP/SMTP/CalDAV adapters are structured before writing any code. Your implementations must follow the same patterns.

**Gateway (packages/gateway/):**
- `adapters/web-search-adapter.ts` — Brave Search API client. Implements the `ServiceAdapter` interface.
- `adapters/web-fetch-adapter.ts` — HTTP fetch + content extraction. Implements the `ServiceAdapter` interface.
- `adapters/reminder-adapter.ts` — Reminder CRUD against SQLite. Implements the `ServiceAdapter` interface.
- Update `adapters/index.ts` (or equivalent registry) to register the new adapters.
- Update allowlist to include Brave Search API domain (`api.search.brave.com`) and user-configured SearXNG domain.
- Update schema validation for the new ActionTypes and payloads.

**Core (packages/core/):**
- `agent/web-intelligence.ts` — Knowledge-graph-first routing logic. Determines whether a user query should hit local search, web search, or both. Provides the `search_web` and `fetch_url` tools to the Orchestrator.
- `agent/reminder-manager.ts` — Reminder lifecycle management. Natural language parsing (via LLM) for "remind me to X at Y". Provides `create_reminder`, `list_reminders`, `snooze_reminder`, `dismiss_reminder` tools to the Orchestrator.
- `agent/quick-capture.ts` — Capture processing. Receives raw text, determines if it contains time references (→ create reminder) or actionable items (→ link to knowledge graph context via semantic search).
- `knowledge/reminder-store.ts` — SQLite schema and queries for reminders table.
- Update `orchestrator.ts` to register the new tools and integrate them into the tool selection logic.
- Update `types/` with the new interfaces above.

**Desktop (packages/desktop/):**
- `src/screens/SettingsScreen` — Add web search configuration section: API key input for Brave Search, SearXNG URL field (optional), rate limit config.
- `src/components/ReminderCard.tsx` — Reminder display in Universal Inbox (due time, text, snooze/dismiss actions).
- `src/components/QuickCaptureInput.tsx` — Persistent capture input (chat command at minimum; global shortcut is stretch goal).
- `src/components/WebSearchResult.tsx` — Search result display in chat (title, snippet, source URL, attribution).
- Update `NetworkMonitorScreen.tsx` if needed to properly display web search/fetch entries.

**All UI components must follow DESIGN_SYSTEM.md.** Read it before creating any component.

---

## Commit Strategy

Execute these commits in order. Each commit must compile, pass all existing tests, and pass any new tests added in that commit. Do NOT proceed to the next commit if the current one fails.

### Commit 1: IPC Types + Payloads
`feat: add web.search, web.fetch, and reminder ActionTypes with typed payloads`

- Add `web.search`, `web.fetch`, `reminder.create`, `reminder.update`, `reminder.list`, `reminder.delete` to the `ActionType` union.
- Add all typed payload and response interfaces (WebSearchPayload, WebSearchResponse, WebFetchPayload, WebFetchResponse, ReminderCreatePayload, ReminderUpdatePayload, ReminderListPayload, ReminderDeletePayload).
- Add zod schemas for runtime validation of all new payloads.
- Tests: Schema validation accepts valid payloads, rejects malformed payloads. Minimum 10 tests.

### Commit 2: Reminder SQLite Schema + Store
`feat: add reminder storage with SQLite schema and CRUD operations`

- Create `packages/core/knowledge/reminder-store.ts`.
- SQLite table: `reminders` with columns: `id` (TEXT PRIMARY KEY, nanoid), `text` (TEXT NOT NULL), `due_at` (TEXT NOT NULL, ISO 8601), `recurrence` (TEXT DEFAULT 'none'), `status` (TEXT DEFAULT 'pending'), `snoozed_until` (TEXT NULLABLE), `source` (TEXT DEFAULT 'chat'), `created_at` (TEXT NOT NULL), `updated_at` (TEXT NOT NULL).
- CRUD operations: `create`, `update`, `delete`, `findById`, `findByStatus`, `findDue` (returns reminders where `due_at <= now AND status = 'pending'`), `findAll`.
- Snooze operation: sets `status = 'snoozed'` and `snoozed_until` to the snooze target time. A snoozed reminder becomes `pending` again when `snoozed_until <= now`.
- Recurring reminder logic: when a recurring reminder fires, create the next occurrence (next day/week/month) as a new pending reminder. The original is marked `fired`.
- Tests: Full CRUD coverage, snooze round-trip, recurring next-occurrence generation, findDue correctness with time boundaries. Minimum 15 tests.

### Commit 3: Reminder Gateway Adapter
`security: add reminder service adapter with audit trail integration`

- Create `packages/gateway/adapters/reminder-adapter.ts` implementing `ServiceAdapter`.
- Handles `reminder.create`, `reminder.update`, `reminder.list`, `reminder.delete` ActionTypes.
- Each operation logs to audit trail BEFORE execution (following the established Gateway validation flow).
- Each audit entry includes `estimatedTimeSavedSeconds` — use 60 seconds for reminder creation (avoids the user needing to open another app or set a manual alarm).
- Rate limiting: apply standard rate limits (same as other adapters).
- The adapter calls into reminder-store for actual storage. Note: reminders are local-only — no network call involved. The adapter pattern is used for consistency, audit trail, and autonomy tier enforcement.
- Tests: Adapter correctly routes to store, audit trail entries created for each operation, rate limiting applied, malformed payloads rejected. Minimum 10 tests.

### Commit 4: Web Search Gateway Adapter (Brave Search)
`security: add web search adapter with Brave Search API integration`

- Create `packages/gateway/adapters/web-search-adapter.ts` implementing `ServiceAdapter`.
- Brave Search Web Search API: `GET https://api.search.brave.com/res/v1/web/search?q={query}&count={count}`.
- API key from credential store (same encrypted storage as email/calendar credentials).
- Add `api.search.brave.com` to the Gateway allowlist.
- Parse Brave response → extract `title`, `url`, `description` (as snippet), `age` for each result.
- Rate limiting: default 1 request per second, configurable. Brave free tier allows 1 query/second, 2000 queries/month.
- Error handling: API key missing → return clear error suggesting user add their key in Settings. Rate limited → return `rate_limited` status. API error → return error with Brave's error message.
- Audit trail entry for every search: log query text, result count, provider ('brave'), timestamp. `estimatedTimeSavedSeconds`: 30 (faster than switching to browser, searching, and reading results).
- Tests: Adapter sends correct request format (mock HTTP), parses Brave response correctly, handles missing API key, handles rate limiting, handles API errors, creates audit entries. Minimum 12 tests. Use mocked HTTP — do NOT make real API calls in tests.

### Commit 5: SearXNG Adapter Path
`feat: add SearXNG search adapter as configurable alternative`

- Create `packages/gateway/adapters/searxng-adapter.ts` implementing the same `ServiceAdapter` interface as the Brave adapter.
- SearXNG API: `GET {base_url}/search?q={query}&format=json&categories=general`.
- Base URL configurable (user's self-hosted instance). Stored in settings, NOT in credential store (it's not a secret, just a URL).
- No API key required (SearXNG is self-hosted).
- Parse SearXNG response → extract `title`, `url`, `content` (as snippet) for each result.
- Same audit trail behavior as Brave adapter. Provider logged as 'searxng'.
- Search provider selection: configurable in settings. Default is 'brave'. If 'searxng' is selected and base URL is configured, use SearXNG. If SearXNG is selected but no URL is configured, fall back to Brave with a warning.
- Create a `WebSearchAdapterFactory` (or equivalent pattern) that returns the correct adapter based on user configuration. The Gateway routes `web.search` to whichever adapter is configured.
- Tests: SearXNG adapter sends correct request format, parses response, handles connection errors, factory returns correct adapter based on config. Minimum 8 tests.

### Commit 6: Web Fetch Gateway Adapter
`security: add web fetch adapter with content extraction`

- Create `packages/gateway/adapters/web-fetch-adapter.ts` implementing `ServiceAdapter`.
- HTTP GET to the requested URL. Follow redirects (max 5).
- Content extraction: use Mozilla's `@mozilla/readability` (npm package) + `jsdom` to parse HTML and extract article content. If Readability fails (non-article page), fall back to stripping HTML tags and returning raw text content.
- The URL is added to the Gateway allowlist dynamically for that single request (one-time allowlist entry). The base allowlist does NOT include arbitrary domains — each fetch is individually authorized and logged.
- Content limits: `maxContentLength` parameter (default 50,000 characters). Truncate if longer. Response size limit: 5MB raw download — abort if larger.
- Timeout: 15 seconds. Configurable.
- Response includes: extracted text content, page title, bytes fetched, content type.
- Audit trail: log URL, bytes fetched, content type, timestamp. `estimatedTimeSavedSeconds`: 120 (avoids reading and summarizing manually).
- Security: never fetch `file://`, `data:`, or non-HTTP(S) URLs. Validate URL scheme before fetching. Never fetch `localhost` or private IP ranges (prevent SSRF).
- Tests: Content extraction from sample HTML (include a realistic article fixture), URL scheme validation (reject file://, data://, private IPs), timeout handling, size limit enforcement, redirect following, Readability fallback, audit entries. Minimum 15 tests.

### Commit 7: Credential Management + Settings UI
`feat: add web search settings with API key management and provider selection`

- Add to Settings screen (existing SettingsScreen or appropriate section):
  - **Web Search** section header.
  - **Search Provider** selector: Brave Search (default) / SearXNG.
  - **Brave Search API Key** input (password-masked, stored in encrypted credential store alongside email/calendar credentials). Include a help link or text: "Get a free API key at search.brave.com/api".
  - **SearXNG URL** input (visible only when SearXNG is selected). Plain text, stored in app settings.
  - **Rate Limit** input: requests per minute (default: 60). Applies to both web search and web fetch.
- API key validation: on save, attempt a test search ("test") to verify the key works. Show success/failure indicator.
- All UI follows DESIGN_SYSTEM.md.
- Tests: Settings render correctly, API key stored in credential store, provider selection toggles UI, validation request fires on save. Minimum 6 tests.

### Commit 8: Knowledge-Graph-First Routing + Orchestrator Tools
`feat: add knowledge-graph-first web routing and search/fetch orchestrator tools`

- Create `packages/core/agent/web-intelligence.ts`:
  - `classifyQuery(query: string)`: Uses the LLM to classify whether a query should be answered from local data, web search, or both. Categories:
    - `local_only`: Query about user's own data ("find the contract Sarah sent", "what's on my calendar tomorrow").
    - `web_required`: Query requires external information ("what's the weather", "latest news about X", "what's Apple stock at", "who won the game last night").
    - `local_then_web`: Try local first, fall back to web if insufficient ("what did Sarah say about Portland" — could be in emails or could need web context).
  - `searchWithRouting(query: string)`: Orchestrates the routing:
    1. Classify the query.
    2. If `local_only` or `local_then_web`: run semantic search against knowledge graph.
    3. If local results are sufficient (relevance score above threshold), return them without web search.
    4. If `web_required` or local results insufficient: fire `web.search` via IPC to Gateway.
    5. Return combined results with source attribution (local vs. web).
  - `fetchUrl(url: string)`: Fires `web.fetch` via IPC. Returns extracted content.
- Register tools in the Orchestrator:
  - `search_web`: Takes a query string, invokes `searchWithRouting`. Available in all autonomy tiers (web search is informational, not an action on the user's behalf).
  - `fetch_url`: Takes a URL, invokes `fetchUrl`. Available in all autonomy tiers.
- The Orchestrator's existing tool selection must now consider these tools when the user's message contains questions, URLs, or requests for current information.
- Tests: Query classification produces correct categories for representative queries (test at least 10 different query types). Routing correctly skips web when local results are sufficient. Routing correctly fires web when local is insufficient. URL detection in user messages. Minimum 15 tests.

### Commit 9: Reminder Manager + Orchestrator Tools
`feat: add reminder manager with natural language parsing and orchestrator integration`

- Create `packages/core/agent/reminder-manager.ts`:
  - `parseReminder(naturalLanguage: string)`: Uses the LLM to extract structured reminder data from natural language. Input: "remind me to call the dentist at 3pm tomorrow". Output: `{ text: "call the dentist", dueAt: "2026-02-22T15:00:00", recurrence: "none" }`. Handle relative dates ("tomorrow", "next Tuesday", "in 2 hours"), absolute dates ("March 15"), and recurring patterns ("every Monday", "daily at 9am").
  - `createReminder(input: string | ReminderCreatePayload)`: If string, parse first. Then fire `reminder.create` via IPC to Gateway.
  - `listReminders(status?)`: Fire `reminder.list` via IPC.
  - `snoozeReminder(id: string, duration: '15min' | '1hr' | '3hr' | 'tomorrow')`: Calculate new due time, fire `reminder.update` via IPC.
  - `dismissReminder(id: string)`: Fire `reminder.update` with `status: 'dismissed'` via IPC.
- Register tools in the Orchestrator:
  - `create_reminder`: Takes natural language or structured input. Autonomy: Guardian shows reminder for approval before creating. Partner and Alter Ego create immediately.
  - `list_reminders`: Lists reminders. Available in all tiers.
  - `snooze_reminder`: Snoozes a specific reminder. Available in all tiers.
  - `dismiss_reminder`: Dismisses a specific reminder. Available in all tiers.
- Tests: Natural language parsing for at least 10 different reminder phrasings (relative times, absolute times, recurring). Snooze duration calculation. Orchestrator tool registration. Autonomy tier behavior (Guardian requires approval, Partner/Alter Ego create immediately). Minimum 12 tests.

### Commit 10: Quick Capture
`feat: add quick capture with automatic reminder extraction and context linking`

- Create `packages/core/agent/quick-capture.ts`:
  - `processCapture(text: string)`: Receives raw capture text. Uses the LLM to:
    1. Detect if it contains a time reference → if yes, auto-create a reminder via ReminderManager.
    2. Run semantic search against the knowledge graph to find related context (emails, calendar events, documents).
    3. Store the capture with its linked context.
  - Capture storage: new SQLite table `captures` — `id`, `text`, `created_at`, `processed` (boolean), `reminder_id` (nullable FK to reminders), `linked_context` (JSON array of knowledge graph references).
- Create `packages/desktop/src/components/QuickCaptureInput.tsx`:
  - Persistent text input in the chat interface (or a dedicated quick-capture area). Minimal design — single text field with a submit action.
  - On submit: text is sent to `processCapture`. Visual feedback: "Captured ✓" with optional detail ("Reminder created for 3pm Tuesday" or "Linked to 2 related emails").
  - Follow DESIGN_SYSTEM.md for styling.
- Global keyboard shortcut (stretch goal): Cmd+Shift+Space (macOS) / Ctrl+Shift+Space (Windows/Linux) opens a floating capture input. If this is complex to implement in Tauri, defer to the in-chat input and log it as a stretch item. Do NOT block the commit on the global shortcut.
- Tests: Capture processing detects time references and creates reminders. Context linking via semantic search. Captures stored correctly. UI component renders and submits. Minimum 8 tests.

### Commit 11: Reminder Notification System
`feat: add system notifications for due reminders with snooze/dismiss actions`

- Create `packages/core/agent/reminder-scheduler.ts`:
  - Background job (interval-based, e.g., every 30 seconds) that:
    1. Queries `reminder-store.findDue()` for pending reminders where `due_at <= now`.
    2. Queries snoozed reminders where `snoozed_until <= now` and reactivates them (set `status = 'pending'`).
    3. For each due reminder: fire a system notification via Tauri notification API.
    4. Update reminder `status` to `'fired'`.
    5. If recurring: create next occurrence.
  - Notification content: reminder text. Notification actions (if Tauri supports): Snooze 15min, Snooze 1hr, Dismiss.
- Integrate into Proactive Engine: due reminders also surface as cards in the Universal Inbox, not only as system notifications. The card shows the reminder text, due time, and snooze/dismiss buttons.
- Create `packages/desktop/src/components/ReminderCard.tsx` for the Universal Inbox integration.
- Tests: Scheduler finds due reminders correctly. Fired reminders get status update. Snoozed reminders reactivate on schedule. Recurring reminders generate next occurrence. Integration with Proactive Engine. Minimum 10 tests.

### Commit 12: Network Monitor Integration + Chat UI
`feat: add web search result display in chat and network monitor entries`

- Create `packages/desktop/src/components/WebSearchResult.tsx`:
  - Displays search results in the chat interface. Each result shows: title (as link), snippet text, source domain.
  - Attribution line: "🔍 Searched via Brave" or "🔍 Searched via SearXNG" with result count.
  - Follow DESIGN_SYSTEM.md. Clean, readable, not overwhelming.
- Create `packages/desktop/src/components/WebFetchSummary.tsx`:
  - Displays fetched URL content summary in chat. Shows: page title, source URL, and the AI's summary/response using the fetched content.
  - Attribution: "📄 Read from [domain]" with byte count.
- Verify Network Monitor (`NetworkMonitorScreen.tsx`) properly displays:
  - Web search entries: query text, result count, provider, timestamp.
  - Web fetch entries: URL, bytes fetched, content type, timestamp.
  - Reminder operations: action type, reminder text (truncated), timestamp.
  - If Network Monitor needs updates to handle the new ActionTypes, make them here.
- Tests: WebSearchResult renders correctly with fixture data. WebFetchSummary renders correctly. Network Monitor displays new ActionTypes. Minimum 6 tests.

### Commit 13: Privacy Audit + Integration Tests
`security: add privacy audit coverage and integration tests for Step 10`

- Update the privacy audit to verify:
  - `web.search` requests ONLY go through the Gateway. No direct HTTP calls from `packages/core/`.
  - `web.fetch` requests ONLY go through the Gateway. No direct HTTP calls from `packages/core/`.
  - Brave API key is stored in the encrypted credential store, not in plaintext config.
  - Reminder data is stored locally in SQLite, never transmitted.
  - Quick capture data is stored locally, never transmitted.
  - No new imports of networking libraries (fetch, http, axios, etc.) in `packages/core/`.
- Integration tests:
  - End-to-end: user asks "what's the weather in Portland" → Orchestrator classifies as `web_required` → fires `web.search` via IPC → Gateway executes → results return → displayed in chat → audit trail entry created → Network Monitor shows the search.
  - End-to-end: user says "summarize this article: https://example.com/article" → Orchestrator detects URL → fires `web.fetch` via IPC → Gateway fetches and extracts content → content returned → AI summarizes → displayed in chat → audit trail entry.
  - End-to-end: user says "remind me to call Sarah at 3pm" → Orchestrator parses → fires `reminder.create` → reminder stored → at 3pm, scheduler fires notification → reminder card appears in Universal Inbox.
  - End-to-end: user captures "buy milk eggs bread" → no time reference → stored as capture, linked to any related context. User captures "call dentist Tuesday 2pm" → time reference detected → reminder created automatically.
  - Knowledge-graph-first routing: user asks "what did Sarah's email say about the Portland contract" with relevant email indexed → local semantic search returns results → no web search fired. Verify by checking audit trail has no `web.search` entry.
- Guard test: verify that `packages/core/` contains NO direct imports of `fetch`, `http`, `https`, `axios`, `got`, `node-fetch`, or any HTTP client library. This test must scan all source files in `packages/core/` and fail if any are found. If a guard test like this already exists from prior steps, verify it still passes with the new code.
- Tests: Minimum 15 integration and privacy tests.

---

## Exit Criteria

Every exit criterion must be verified. Do not claim completion unless ALL pass.

1. `web.search` ActionType defined with typed payload and zod validation.
2. Brave Search adapter implemented, API calls succeed with valid key (tested with mocked HTTP).
3. SearXNG adapter implemented as a configurable alternative. Factory selects based on user config.
4. `web.fetch` ActionType defined with typed payload and zod validation.
5. Web fetch adapter extracts article content from HTML using Readability. Falls back to tag stripping.
6. Web fetch rejects non-HTTP URLs and private IP ranges (SSRF protection).
7. Knowledge-graph-first routing works: local-answerable queries skip web search. External queries fire web search. Mixed queries try local first.
8. Every web search and web fetch appears in the audit trail and Network Monitor.
9. API key management: Brave key stored in encrypted credential store. Settings UI for key input and validation.
10. Rate limiting applied to web search and web fetch (configurable, defaults to 1/second for search).
11. Reminders SQLite schema created. CRUD operations work. findDue returns correct reminders by time.
12. Natural language → structured reminder parsing works for relative times, absolute times, and recurring patterns.
13. Reminder fires system notification at the correct time via Tauri notification API.
14. Snooze works for 15min, 1hr, 3hr, and tomorrow. Snoozed reminders reactivate correctly.
15. Recurring reminders generate next occurrence when fired.
16. Reminders surface in Universal Inbox as cards (not only system notifications).
17. Quick capture input exists (in-chat or dedicated area).
18. Captures with time references automatically generate reminders.
19. Captures without time references are stored and linked to knowledge graph context via semantic search.
20. Search results display in chat with title, snippet, source attribution, and provider.
21. Fetched URL content displays in chat with page title, source URL, and AI summary.
22. Settings screen includes web search configuration (provider selection, API key, SearXNG URL, rate limit).
23. All new ActionTypes registered in Orchestrator as tools with correct autonomy tier behavior.
24. Privacy audit passes — no new network access from packages/core/, all web traffic through Gateway.
25. Guard test verifies no HTTP client imports in packages/core/.
26. 80+ new tests. All existing 1,520 tests pass.
27. Privacy audit clean.

---

## Approved Dependencies

These packages are approved for this step. Do not add dependencies not on this list without escalating to Orbital Directors.

- `@mozilla/readability` — Article content extraction from HTML. Used in web-fetch-adapter ONLY (packages/gateway/).
- `jsdom` — DOM parsing for Readability. Used in web-fetch-adapter ONLY (packages/gateway/).
- `linkedom` — Acceptable alternative to jsdom if jsdom is too heavy. Used in web-fetch-adapter ONLY.

The Brave Search API and SearXNG are accessed via standard `fetch` (Node.js built-in) from the Gateway. No additional HTTP client libraries.

Reminder storage uses the existing SQLite setup (already in the project). No new storage dependencies.

---

## What This Step Does NOT Include

- **Mobile UI** — Reminders, web search, and quick capture will work on mobile in Step 12. This step is desktop only.
- **Voice input** — No speech-to-text for reminders or capture. Text input only. Voice comes in Sprint 4 Step 17.
- **Browser extension** — No browser integration for web content. Post-launch.
- **Custom search engines** — Only Brave and SearXNG. No Google, Bing, or other providers.
- **Web search result caching** — Results are not cached. Each query fires a fresh search. Caching is a performance optimization for later.
- **Global keyboard shortcut for quick capture** — Stretch goal. If Tauri's global shortcut API makes this straightforward, implement it. If it requires significant platform-specific work, defer and document as a stretch item. The in-chat capture input is the minimum viable implementation.

---

## Escalation Rules

Escalate to Orbital Directors if:
- The Brave Search API response format has changed and the documented format is wrong.
- `@mozilla/readability` or `jsdom` cause bundle size or performance issues that seem prohibitive.
- The Gateway allowlist architecture doesn't cleanly support dynamic per-request URL authorization for web fetch.
- The Tauri notification API doesn't support notification actions (snooze/dismiss buttons). In this case, the notification fires without actions and snooze/dismiss happens only via the in-app reminder card.
- The privacy audit fails for any reason you cannot resolve without architectural changes.
- You need a dependency not on the approved list.

Do NOT escalate for:
- Implementation details within the patterns described above.
- Test structure decisions.
- UI layout choices within DESIGN_SYSTEM.md guidelines.
- Bug fixes in existing code that don't touch security-critical paths.

---

## Completion Report

When you believe all exit criteria are met, provide a completion report with:

1. **Exit criteria checklist** — each criterion with PASS/FAIL and evidence (test name, file path, or description).
2. **Test count** — total tests before and after. Breakdown of new tests by area.
3. **New files created** — list every new file with a one-line description.
4. **Modified files** — list every modified file with what changed and why.
5. **Privacy audit result** — PASS/FAIL with details.
6. **Deferred items** — anything from the spec that was intentionally deferred (e.g., global shortcut) with justification.
7. **Risks or concerns** — anything you're uncertain about or think needs Orbital Director review.

---

## Remember

Web search is the #1 reason users would abandon Semblance. This step fixes that. Reminders are the #1 reason users keep Siri/Google Assistant alongside Semblance. This step fixes that too.

Every search the user makes is visible in the Network Monitor. Every URL Semblance reads is logged. Every reminder is stored locally. The user can verify all of this themselves. That's not a limitation — it's the product. Transparency is the feature.

Build accordingly.
