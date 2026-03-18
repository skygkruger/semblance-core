# SEMBLANCE JARVIS MASTERPLAN
## 21 Days to Funding-Ready

**Date:** 2026-03-12  
**Author:** Orbital Director  
**Status:** ACTIVE — this document governs all work until launch

---

## THE HONEST DIAGNOSIS

Before strategy: here is what I verified by reading the actual code.

### What Exists (More Than You Think)
- Full orchestrator with 30+ real tool definitions wired to Gateway action types
- All screens exist and compose real IPC calls (not fake data)  
- The sidecar architecture is sound — NDJSON over stdin/stdout is correct
- NativeRuntime bridge exists and routes to Rust via callbacks
- Gateway with OAuth adapters for Gmail, Google Drive, CalDAV
- Knowledge graph infrastructure (LanceDB + embeddings)
- `demo-verify.js` — the right idea, but only 7 features and too shallow

### What's Actually Broken
1. **No model = no chat.** Without a downloaded GGUF or running Ollama, every `send_message` returns an error. This is gate #1 and it's failing silently in every demo.
2. **The verification gap.** CLAUDE.md explicitly documents this: "TypeScript clean, 6,214 tests passed, the code reviewer said SHIP — and the app didn't work." Nothing in the workflow catches this before the 20-minute build.
3. **Hollow features are invisible.** IPC handlers exist, return shape-correct responses, pass TypeScript — but execute against empty databases or fail silently.
4. **The fix cycle is the real enemy.** Fix → report → build → install → test → still broken → repeat. Each cycle burns 30–60 minutes and generates no learning.

### Root Cause
**Claude Code's success metric is `tsc + vitest`. The real success metric is `demo-verify green`. These are different things and nothing enforces the second one.**

The new workflow makes them the same thing.

---

## THE NEW WORKFLOW (REPLACES EVERYTHING ELSE)

### The Sidecar IS the Truth
The sidecar is a Node.js process that can be tested directly — no build, no install required. Every feature must be verified through the sidecar before any UI work, and before any claim of "done."

```
OLD (BROKEN):
Code → tsc → vitest → Claude Code says SHIP → Build → Install → Test → Broken

NEW (CORRECT):
Code → sidecar-verify → all slices green → Build → Install → Confirm
```

### The 5 Inviolable Rules

**RULE 1: SIDECAR FIRST**  
Before touching UI, every feature is verified through `node scripts/semblance-verify.js --feature=<name>`. The sidecar test must show the real response. If it shows empty data, null, or an error — the feature is not done.

**RULE 2: SLICE TESTS ARE THE GATE**  
Every feature has a slice test. Claude Code must add its slice test and make it green before claiming the feature is complete. The slice test sends real IPC messages and verifies real responses.

**RULE 3: NO LYING ABOUT RESULTS**  
Attaching raw sidecar output is mandatory. "TypeScript clean" is not evidence. "Tests pass" is not evidence. The only evidence is the output of `semblance-verify.js` showing green.

**RULE 4: REGRESSIONS ARE CAUGHT ON SESSION START**  
Every Claude Code session starts with `node scripts/semblance-verify.js`. If anything that was green is now red, that regression must be fixed before new work begins.

**RULE 5: BUILD IS THE LAST STEP**  
`npx tauri build` is only run when all slice tests are green. It is not a test. It is packaging. If it fails, that's a packaging problem — not a debugging opportunity.

### The Feature Slice Format
Each feature must have:
1. A sidecar handler that exists and responds
2. A response with real data (not null/empty/mock)
3. A slice test in `semblance-verify.js` that verifies #1 and #2
4. For write operations: a verification that the write persisted

---

## GROUND TRUTH: CURRENT STATE CLASSIFICATION

Run `node scripts/semblance-verify.js` to get the real current state. Until then, here is what the code tells us:

| Feature | Code State | Runtime State | Priority |
|---------|-----------|---------------|----------|
| Chat (with Ollama) | Handler exists | Needs Ollama running | P0 |
| Chat (with NativeRuntime) | Handler exists | Needs model downloaded | P0 |
| File indexing | Handler exists | Unknown — DB may be empty | P0 |
| Knowledge graph display | Handler exists, null crash fixed | Unknown | P0 |
| Onboarding persistence | Prefs DB code looks correct | Previously flaky | P0 |
| Google Drive connect | OAuth config exists | Browser open not tested | P1 |
| Gmail connect | OAuth config exists | Browser open not tested | P1 |
| Email fetch (IMAP) | Handler exists | No credentials = empty | P1 |
| Calendar fetch | Handler exists | No credentials = empty | P1 |
| Reminders | Handler exists | DB state unknown | P1 |
| Web search | SearXNG adapter exists | Needs SearXNG or Brave key | P1 |
| Morning Brief | Generator exists | Needs model + data | P2 |
| Knowledge Graph visual | GraphVis provider exists | Needs indexed data | P2 |
| Financial dashboard | Statement parser exists | Needs import or Plaid | P2 |

---

## THE 21-DAY JARVIS DELIVERY PLAN

### Organizing Principle
Each week has a theme. No week 2 work begins until week 1 is provably complete via `semblance-verify.js`. No exceptions.

**Week 1: "It Actually Works" (Days 1–7)**  
Every user can type a message and get a real AI response. Every feature that claims to work actually works. The app installs in 5 minutes and does not crash.

**Week 2: "JARVIS Core" (Days 8–14)**  
Semblance takes real autonomous actions. It reads email, manages calendar, creates reminders, searches the web. The orchestrator routes correctly. Approvals fire correctly. Actions log to the audit trail.

**Week 3: "JARVIS Experience" (Days 15–21)**  
The features that make the demo extraordinary: Morning Brief, Knowledge Graph, proactive intelligence, sovereignty proof. This is what Bud shows to his 8 people.

---

## WEEK 1: "IT ACTUALLY WORKS"

### Day 1–2: Audit + Baseline

**Goal:** Know exactly what is green and what is red right now.

**Tasks:**
1. Run `node scripts/semblance-verify.js` — record current pass/fail for all features
2. Run the app — confirm or deny each of the 4 manual checks:
   - [ ] Connect Google Drive → card shows "Connected" immediately + persists after restart
   - [ ] Knowledge graph opens without crash
   - [ ] Close/reopen → no onboarding flash → straight to Chat
   - [ ] Ask AI its name → responds with onboarding name
3. Document every failure with exact error message (from sidecar log at `~/.semblance/data/sidecar.log`)
4. Classify: which failures are sidecar-level (fixable without rebuild) vs. Rust-level (require build)

**Claude Code prompt:**
```
Run node scripts/semblance-verify.js and attach the FULL output.
Then read the sidecar log at C:\Users\skyle\.semblance\data\sidecar.log (last 200 lines).
List every error, warning, and "null" result. Do not fix anything yet. Just report.
```

**Day 2 exit criteria:**
- Complete audit table with status for every feature
- Every failure has a root cause identified (not guessed — from actual log output)
- Priority order for fixes established

---

### Day 3–4: P0 Fixes — Model + Chat

**Goal:** A user types a message and gets a real AI response.

**The Model Problem:**
The sidecar tries to load any GGUF model it finds in `~/.semblance/data/models/`. If none exist, NativeRuntime has nothing to load. If Ollama isn't running, OllamaProvider fails. The user sees: "No AI model available."

**Fix strategy:**
1. Check if Ollama is running (`ollama list`) — if yes, this should work already
2. If no model at all: the onboarding model download flow must work end-to-end
3. The `get_model_status` handler must accurately report the real state (not cached/stale)

**The Chat Reliability Problem:**
`handleSendMessage` has multiple fallback paths. When it fails, the error is often swallowed or returns a generic message. The fix: every failure path must emit a specific, actionable error to the UI.

**Slice tests to add to semblance-verify.js:**
```
CHAT-1: initialize → inferenceEngine is 'native' or 'ollama' (not 'none')
CHAT-2: get_model_status → activeModel is non-null
CHAT-3: send_message("What is 2+2?") → returns responseId within 5s
CHAT-4: chat-complete event fires within 60s of send_message
CHAT-5: The response contains the word "four" or "4" (actual reasoning)
```

**Day 4 exit criteria:**  
CHAT-1 through CHAT-5 all green in semblance-verify.js output.

---

### Day 5–6: P0 Fixes — Persistence + Connections

**Goal:** Onboarding never re-shows. Connected services stay connected. AI name persists.

**The Persistence Problem:**
`getPref('onboarding_complete')` returns from `core.db` at `~/.semblance/data/core.db`. The UI checks this via `get_onboarding_complete` IPC. Previous fix deployed prefs to AppData location — verify it's working in the installed build.

**The Connection Problem:**
OAuth tokens are stored by `OAuthTokenManager`. The `get_connected_services` handler reads from the token store. If the token store path differs between dev and installed app, tokens are lost on relaunch.

**Slice tests:**
```
PERSIST-1: set_pref + get_pref → value survives sidecar restart
PERSIST-2: get_onboarding_complete → returns boolean (not error)
PERSIST-3: complete_onboarding → set name → restart → get_pref('ai_name') matches
CONNECT-1: get_connected_services → returns array (not error)
CONNECT-2: If any service connected: persists after sidecar restart
CONNECT-3: get_connector_config('google-drive') → returns config (warns if no .env)
```

**Day 6 exit criteria:**  
All PERSIST and CONNECT slices green. Manual test: connect Google Drive, restart app, Drive still shows connected.

---

### Day 7: P0 Fixes — Knowledge Graph + File Indexing

**Goal:** Knowledge graph opens without crash. Files indexed shows real count.

**The Graph Crash:**
Previous session fixed a null `contactStore` reference in `GraphVisualizationProvider`. Verify the fix is in the installed build.

**The Indexing Problem:**
`get_knowledge_stats` must return `documentCount`, `chunkCount`, `indexSizeBytes` (camelCase). If this returns empty, the Files screen shows "NaN MB."

**Slice tests:**
```
GRAPH-1: get_graph_data → no "Cannot read" error, returns {nodes, edges}
GRAPH-2: get_knowledge_stats → has documentCount, chunkCount, indexSizeBytes
FILES-1: add_directory('/path/to/test') → returns {status: 'indexing'}
FILES-2: get_knowledge_stats → documentCount > 0 after indexing completes
FILES-3: search_files('test') → returns array (may be empty, must not error)
```

**Day 7 exit criteria:**  
All GRAPH and FILES slices green. Manual test: open Knowledge Graph screen without crash.

**WEEK 1 EXIT GATE:**  
Run full `semblance-verify.js`. Every P0 slice is green. Build new MSI. Sky installs. All 4 manual checks pass. Only then does Week 2 begin.

---

## WEEK 2: JARVIS CORE

### Day 8–10: Real Email + Calendar

**Goal:** Semblance reads your actual inbox and calendar. AI references real emails in chat.

**What needs to work:**
1. IMAP fetch (Gmail, Outlook) returns real messages
2. Email indexer stores them in the knowledge graph
3. Orchestrator's `fetch_inbox` tool returns real data to the AI
4. AI can search emails and surface relevant context
5. Calendar events display in Inbox screen today section

**These are not UI problems — they're data pipeline problems.**

**The Email Pipeline:**
```
OAuth token in OAuthTokenManager
→ EmailAdapter.imap.fetchMessages()
→ EmailIndexer.indexMessages()
→ Knowledge graph stores with 'email' category
→ search_emails tool returns results
→ AI incorporates into response
```

Each arrow is a potential break point. The slice tests must verify each one.

**Slice tests:**
```
EMAIL-1: get_connected_services → gmail or outlook in list
EMAIL-2: get_inbox_items → returns array (at least 1 email if connected)
EMAIL-3: search_emails('test') → returns results from indexed emails
EMAIL-4: send_message("What's in my inbox?") → AI mentions real emails
EMAIL-5: archive_email([messageId]) → returns actionId, audit log entry exists
CAL-1: get_today_events → returns array (may be empty, must not error)
CAL-2: send_message("What's on my calendar?") → AI mentions real events
```

**Day 10 exit criteria:**  
EMAIL-1 through EMAIL-5 and CAL-1 through CAL-2 green. Sky types "What's in my inbox?" and the AI mentions a real email by subject.

---

### Day 11–12: Reminders + Web Search + Actions

**Goal:** AI creates reminders that actually fire. AI searches the web and returns real results.

**Reminders:**
The `create_reminder` tool → Gateway → `reminder.create` action → SQLite. The reminder must show in `list_reminders` immediately. The scheduler must fire it at the right time (this requires a background timer that survives app relaunch).

**Web Search:**
The `search_web` tool → Gateway → SearXNG or Brave Search adapter. Requires either:
- SearXNG running locally (self-hosted)  
- Brave Search API key in `.env`

**Slice tests:**
```
REMIND-1: create_reminder("Test", dueAt: 60s from now) → returns id
REMIND-2: list_reminders → contains created reminder
REMIND-3: Scheduler fires within 90s → event emitted
REMIND-4: snooze_reminder → new dueAt updated
WEB-1: search_web("current weather Hillsboro Oregon") → returns ≥3 results
WEB-2: Each result has title, url, snippet
WEB-3: send_message("Search for AI news today") → AI uses search_web tool
```

**Day 12 exit criteria:**  
All REMIND and WEB slices green. Sky says "Remind me to check email in 2 minutes" and 2 minutes later gets an OS notification.

---

### Day 13–14: Proactive Intelligence + Autonomy

**Goal:** Semblance takes autonomous actions in Partner mode without being asked.

**The Proactive Engine:**
`ProactiveEngine` should be running and emitting insights to the UI. These become the "priority items" in the Inbox screen. For this to work:
- ProactiveEngine must be initialized in bridge.ts after email+calendar are indexed
- Insights must be stored and retrievable via `get_proactive_insights`
- The Inbox screen must display them

**Autonomy tiers:**
In Partner mode, routine actions (archive email, create reminder, mark read) should execute automatically. The UI should show the action in the Activity log, not require approval.

**Slice tests:**
```
PROACTIVE-1: get_proactive_insights → returns array after email indexed
PROACTIVE-2: Insights have type, priority, title, suggestedAction
PROACTIVE-3: approve_action(id) → action executes, audit log entry created
PROACTIVE-4: get_actions_summary → todayCount > 0 after actions taken
PROACTIVE-5: Activity screen shows real action log
```

**Day 14 exit criteria:**  
All PROACTIVE slices green. Run app for 1 hour — Inbox screen shows at least 1 proactive insight with a suggested action.

**WEEK 2 EXIT GATE:**  
Sky uses Semblance for an entire day as their primary email/calendar interface. At least 10 real actions logged. Demo to fiancée's iPhone shows live data. Only then does Week 3 begin.

---

## WEEK 3: JARVIS EXPERIENCE

### Day 15–16: Morning Brief

**Goal:** Every morning Semblance delivers a personalized briefing that a human would actually read.

**What makes a great Morning Brief:**
- Today's calendar events with prep notes
- High-priority emails requiring action
- Weather for the day
- Upcoming reminders
- 1–2 proactive insights ("That email from Sarah 3 days ago — still no reply")

**The brief must generate from real local data.** No hallucination. If there's nothing in the inbox, say so honestly.

**Slice tests:**
```
BRIEF-1: generate_morning_brief → returns {summary, events, emails, weather, insights}
BRIEF-2: summary is ≥ 3 sentences, references real data
BRIEF-3: Morning Brief screen renders without crash
BRIEF-4: 7am scheduler would trigger brief (manual trigger test)
BRIEF-5: AI responds to "Give me my morning brief" with real brief content
```

---

### Day 17–18: Knowledge Graph + Visual Intelligence

**Goal:** The Knowledge Graph is populated, visual, and tells the story of Sky's digital life.

**What the graph should show:**
- Email contacts as nodes
- File topics as nodes  
- Calendar events as nodes
- Edges: "Sky emailed Sarah about Project X, which is also in these 3 documents"
- Real entity extraction from indexed documents

**This requires:**
- Files indexed (Week 1 ✓)
- Emails indexed (Week 2 ✓)
- Entity extraction running on indexed content
- GraphVisualizationProvider returning populated data

**Slice tests:**
```
GRAPH-3: get_graph_data → nodes.length > 10 after data indexed
GRAPH-4: nodes have category labels (email, file, calendar, contact, etc.)
GRAPH-5: edges connect related entities
GRAPH-6: search_graph("work") → returns relevant subgraph
GRAPH-7: Knowledge Graph screen shows interactive D3 visualization with real nodes
```

---

### Day 19–20: Sovereignty Proof + Privacy Dashboard

**Goal:** Semblance can prove, cryptographically, that it has never sent user data anywhere.

**What the Privacy Dashboard shows:**
- Bytes processed locally vs. zero bytes sent to cloud
- Network monitor showing zero outbound connections to AI services
- The audit trail — every action logged with cryptographic chain
- "Proof of Privacy" exportable document

**Slice tests:**
```
PRIVACY-1: get_network_monitor_report → shows zero connections to cloud AI endpoints
PRIVACY-2: get_audit_trail → returns recent entries with chain hashes
PRIVACY-3: generate_sovereignty_report → returns signed PDF
PRIVACY-4: verify_sovereignty_report → passes verification
PRIVACY-5: Privacy screen renders real data (not placeholder text)
```

**This is the investor slide that closes the deal.** The moment you say "click Privacy" and they see cryptographic proof that their data stayed local — that's when Bud's 8 contacts write checks.

---

### Day 21: The Demo

**Goal:** A non-technical user downloads Semblance, sets it up in 5 minutes, and never goes back to ChatGPT.

**The 5-minute onboarding:**
1. Download MSI. Install. Open. ✓
2. Hardware detected — model loading (they see the spinner, then "Ready") ✓
3. Name the AI. Name yourself. ✓
4. Connect Gmail — click Connect, browser opens, authorize, back in app → connected ✓
5. "What's in my inbox?" — AI mentions 3 real emails by name ✓

**The 10-minute "oh my god" moment:**
1. "Remind me to call Sarah about the contract on Friday at 9am" → reminder created, confirms it ✓
2. "Do I have any forgotten subscriptions?" → financial awareness shows Netflix trial that became $15/mo ✓
3. "Give me my morning brief" → real personalized briefing ✓
4. Click Knowledge Graph → their emails, files, contacts as a living visual web ✓
5. Click Privacy → cryptographic proof, zero cloud connections ✓

**The closer:**
"Every AI assistant you've used has a copy of everything you just showed me on their servers right now. Semblance doesn't. That's not a privacy policy — it's a mathematical fact. The architecture makes it impossible."

---

## THE EXTENDED VERIFICATION SCRIPT

The current `demo-verify.js` tests 7 features. The new `semblance-verify.js` tests every slice.

**File to create:** `scripts/semblance-verify.js`

**Structure:**
```javascript
// Run all slices: node scripts/semblance-verify.js
// Run one feature: node scripts/semblance-verify.js --feature=chat
// Run and watch: node scripts/semblance-verify.js --watch
// Get diff from last run: node scripts/semblance-verify.js --diff

// Slices: CHAT, PERSIST, CONNECT, GRAPH, FILES, EMAIL, CAL, REMIND, WEB, PROACTIVE, BRIEF, PRIVACY
// Each slice: green = all tests pass, yellow = partial, red = critical failure
```

**The output format:**
```
═══════════════════════════════════════
  SEMBLANCE VERIFICATION REPORT
  2026-03-12 09:34:21
═══════════════════════════════════════

  FOUNDATION
  ✅ CHAT     5/5 — qwen2.5-7b via ollama, 2.3s response
  ✅ PERSIST  6/6 — ai_name persists, onboarding_complete correct
  ✅ CONNECT  3/3 — google-drive config resolves
  ✅ GRAPH    3/3 — 0 nodes (no data yet), no crash
  ✅ FILES    3/3 — 0 docs (no dir added yet), camelCase keys ✓

  JARVIS CORE
  ⚠️  EMAIL   3/5 — IMAP fetches but email-indexer-2 fails: no tables
  ❌ CAL      0/2 — No CalDAV credentials configured
  ✅ REMIND   4/4 — Creates, lists, snoozes correctly
  ⚠️  WEB     2/3 — SearXNG not running, Brave key missing
  ❌ PROACT   0/5 — ProactiveEngine not initialized (email not indexed)

  JARVIS EXPERIENCE
  ❌ BRIEF    0/5 — No data to brief from
  ⚠️  PRIVACY 2/5 — Audit chain valid, sovereignty report fails (missing PDF lib)

═══════════════════════════════════════
  TOTAL: 31/51 slices green
  P0 GATE: ✅ (Foundation complete)
  P1 GATE: ❌ (5 JARVIS CORE failures)
  BUILD READY: ❌
═══════════════════════════════════════
```

This output is what Claude Code submits. Not a summary. The raw output.

---

## CLAUDE CODE OPERATING INSTRUCTIONS

These replace all previous operating instructions for Claude Code.

### Session Start Protocol
```
1. node scripts/semblance-verify.js
2. Read the output
3. Fix any regressions from last session FIRST
4. Report which slices are green before starting new work
```

### Feature Implementation Protocol
```
1. Add slice test for the feature to semblance-verify.js
2. Run the slice test — it fails (expected)
3. Implement the feature
4. Run the slice test — it passes
5. Run FULL semblance-verify.js — no regressions
6. Report with full output attached
```

### What "Done" Means
A feature is done when:
- Its slice tests are green in semblance-verify.js output
- The FULL script shows no new regressions
- The raw output is attached to the report

A feature is NOT done when:
- TypeScript compiles
- Unit tests pass
- "The code looks correct"
- "The handler exists"

### The Only Acceptable Report Format
```
FEATURE: [name]
STATUS: [COMPLETE / IN PROGRESS / BLOCKED]

SLICE TESTS:
[paste raw semblance-verify.js output for this feature]

REGRESSIONS: [none / list any that appeared]

FULL VERIFICATION:
[paste raw semblance-verify.js output — all features]

NEXT: [what comes next]
```

---

## INVESTOR TIMELINE

**Week 1 complete (Day 7):** App installs, chat works, no crashes. Show Bud a working demo.  
**Week 2 complete (Day 14):** Email, calendar, reminders, web search. Sky uses it as primary tool.  
**Week 3 complete (Day 21):** Morning Brief, Knowledge Graph, Privacy proof. Show Bud's 8 contacts.  
**Day 30:** Funding conversations begin with a working product, not a prototype.

The product is judged by what it does, not what it shows.  
Build the active version.  
Nothing ships with gaps.

---

*This document is the operating truth. All other strategic documents are subordinate to it.*  
*Update it when reality changes. Never update it to match what you wish were true.*
