# Behavioral Integrity + Mobile Parity Pass
## VERIDIAN SYNTHETICS — Claude Code Implementation Prompt

> **Baseline:** 6,327 tests (482 files), 0 failures, TypeScript clean, 38/40 verify
> **Mandate:** Fix every mobile stub screen. Verify and fix every behavioral pipeline. Ensure full cross-platform parity. This is the final code pass before hardware testing.
> **Standard:** Test count goes UP. TypeScript stays clean. No stubs. No placeholders. No "future work."

---

## READ FIRST

1. `SEMBLANCE_BUILD_BIBLE.md`
2. `SEMBLANCE_STATE.md` at `C:\Users\skyle\desktop\world-shattering\semblence-representative\docs\SEMBLANCE_STATE.md`
3. `packages/core/extensions/ip-adapter-registry.ts` — the adapter registry

Record baseline:
```bash
npx vitest run 2>&1 | grep -E "Tests|Test Files|failures"
npx tsc --noEmit 2>&1 | tail -5
```

---

## PART A: MOBILE STUB SCREENS → REAL DATA

Six mobile screens are 24-line placeholders rendering static text. Each must be wired to real SQLite data via the mobile IPC layer. The pattern: use the React Native `invoke()` or equivalent IPC call to the sidecar bridge, passing the same method names that the desktop screens use.

For EACH screen below: read the corresponding desktop implementation first to understand what data it fetches and how. Then wire the mobile screen to fetch the same data via IPC and render it.

### A1. `packages/mobile/src/screens/ChannelsScreen.tsx` (currently 24 lines, static)
**Desktop reference:** `packages/desktop/src/screens/settings/SettingsChannels.tsx` (or equivalent settings panel)
**Must show:** List of configured channel adapters (iMessage, Telegram, Signal, Slack, WhatsApp) with connection status. IPC method: likely `channel_list_adapters` or similar — search bridge.ts for channel-related handlers.
**Each channel card:** name, connection status (connected/disconnected/not installed), last message timestamp if connected.
**Empty state:** "No messaging channels configured. Connect channels in Settings."

### A2. `packages/mobile/src/screens/SessionsScreen.tsx` (currently 24 lines, static)
**Desktop reference:** `packages/desktop/src/screens/settings/SettingsSessions.tsx`
**Must show:** List of named sessions from `NamedSessionManager`. IPC method: search bridge.ts for session-related handlers (likely `session_list`, `session_create`, etc.).
**Each session card:** session key, bound channel, autonomy tier override, last activity.
**Empty state:** "No active sessions."

### A3. `packages/mobile/src/screens/LearnedPreferencesScreen.tsx` (currently 24 lines, static)
**Desktop reference:** `packages/desktop/src/screens/settings/SettingsPreferences.tsx`
**Must show:** Preferences from `PreferenceGraph`. IPC method: `preference_list` (confirmed exists in bridge.ts).
**Each preference row:** domain, pattern description, confidence bar (0-100%), confirm/deny buttons.
**Confirm calls:** `preference_confirm` IPC. **Deny calls:** `preference_deny` IPC.
**Empty state:** "Semblance hasn't detected behavioral patterns yet. Use the app for a few days."

### A4. `packages/mobile/src/screens/SkillsScreen.tsx` (currently 24 lines, static)
**Desktop reference:** `packages/desktop/src/screens/settings/SettingsSkills.tsx`
**Must show:** Installed skills from `SkillRegistry`. IPC methods: `skill_list_installed`, `skill_enable`, `skill_disable` (search bridge.ts to confirm exact names).
**Each skill card:** name, version, author, enabled/disabled toggle, capability list.
**Empty state:** "No skills installed."

### A5. `packages/mobile/src/screens/BinaryAllowlistScreen.tsx` (currently 24 lines, static)
**Desktop reference:** `packages/desktop/src/screens/settings/SettingsBinaryAllowlist.tsx`
**Must show:** User-allowed binaries from `BinaryAllowlist`. IPC methods: `binary_allowlist_list`, `binary_allowlist_add`, `binary_allowlist_remove` (confirmed in bridge.ts).
**Each row:** binary path, platform, date added.
**Permanent block list note:** "Semblance permanently blocks network tools (curl, wget, ssh, etc.) and scripting runtimes. This list shows binaries YOU have explicitly approved."
**Empty state:** "Using default allowlist. Add binaries in Settings on desktop."

### A6. `packages/mobile/src/screens/TunnelPairingScreen.tsx`
**Check if already wired or still static.** If static, wire to: `tunnel_get_status`, `tunnel_list_peers`, `tunnel_generate_pairing_code` (search bridge.ts for tunnel/pairing handlers).
**Must show:** Pairing status, paired devices list, QR code generation button.

**After each screen, verify TypeScript compiles:**
```bash
npx tsc --noEmit 2>&1 | tail -5
```

---

## PART B: BEHAVIORAL PIPELINE VERIFICATION + FIXES

These are the core behavioral chains that make Semblance feel intelligent. Each must be traced end-to-end: trigger → data flow → output. If any link is broken, fix it.

### B1. Indexing → Knowledge Graph Visualization Pipeline
**The chain:**
1. User adds files or connector syncs → `handleConnectorSync()` or `start_indexing` handler
2. Files scanned by `file-scanner.ts` → content extracted → `sanitizeRetrievedContent()` at ingestion
3. Content chunked by `chunker.ts` (2,000 char chunks)
4. Chunks embedded via `embedding-pipeline.ts` (nomic-embed-text-v1.5, 768 dimensions)
5. Embeddings stored in LanceDB via `vector-store.ts`
6. Metadata stored in SQLite via `document-store.ts`
7. `graph-visualization.ts` queries ALL stores and builds VisualizationGraph (nodes + edges + clusters)
8. Frontend calls `get_graph_data` → receives nodes/edges → renders D3 visualization

**VERIFY each link. Specifically:**
- Does `graph-visualization.ts` query the `document_store` table? (It should — documents should appear as nodes even without contacts)
- After `core.knowledge.indexDocument()` is called in `handleConnectorSync`, does the graph data INCLUDE the new document on the next `get_graph_data` call?
- Does the desktop Knowledge Graph screen call `get_graph_data` on mount/refresh?
- Does the mobile Knowledge Graph screen do the same?

**If the visualization only shows contacts/relationships but NOT documents:** Fix `GraphVisualizationProvider.buildGraph()` to include document nodes from the document store. Every indexed document should appear as a node.

### B2. Email Sync → Auto-Index → Knowledge Graph
**The chain:**
1. Gmail OAuth connected → `handleConnectorSync('gmail')` → Gmail adapter pulls emails
2. Emails stored in `indexed_emails` table by `emailIndexer`
3. Email content indexed into knowledge graph (chunks + embeddings)
4. Email entities (senders, recipients) feed into `ContactStore` + `RelationshipAnalyzer`
5. Commitments extracted from sent emails by `CommitmentTracker`
6. Dark patterns detected by `ipAdapters.darkPatternDetector` (when DR loaded)
7. Follow-ups tracked by `ProactiveEngine`

**VERIFY:** Does the Gmail adapter output from `handleConnectorSync` actually get indexed into the knowledge graph? Read the code after the `connectorRouter.execute()` call and confirm the items are passed to `core.knowledge.indexDocument()`. The code I read shows this happening — confirm it's not conditional on something that's always false.

### B3. Proactive Engine → Real Insights
**The chain:**
1. `ProactiveEngine` initialized with references to email indexer, calendar indexer, contact store
2. Engine runs analysis (either on-demand via `get_proactive_insights` or via CronScheduler)
3. Produces insights: follow-ups due, relationship drift, upcoming conflicts, pattern observations
4. Insights surface in Morning Brief and via direct query

**VERIFY:**
- Read `packages/core/agent/proactive-engine.ts`. Does it actually query real data stores?
- What triggers `getActiveInsights()`? Is it called from CronScheduler's `follow-up-scan` job?
- If the proactive engine requires data (emails, calendar events) to produce insights, does it return an empty array gracefully (not crash) when no data exists?

### B4. Autonomous Action Pipeline
**The full autonomy chain:**
1. User sends message → orchestrator extracts tool intent
2. Tool intent mapped to ActionType via `BASE_TOOL_ACTION_MAP`
3. ActionType evaluated by `AutonomyManager.decide(action)` → auto_approve / requires_approval / blocked
4. If auto_approve: IPC to Gateway → Gateway executes → audit trail entry (BEFORE execution) → result
5. If requires_approval: action stored in `pending_actions` table → surfaces to user → user approves → execute
6. `PreferenceGraph.shouldAutoApprove()` called as third input to autonomy decision

**VERIFY:** Read the `processToolCalls` method in orchestrator.ts. Confirm it checks autonomy, handles approval flow, and logs to audit trail. Confirm the preference graph integration exists (the triple input: tier + risk + preference confidence).

### B5. Knowledge Moment
**The chain:**
1. Sufficient data indexed (configurable threshold)
2. `KnowledgeMomentGenerator` fires automatically
3. Produces a compound knowledge demonstration: cross-references email + calendar + documents + contacts
4. Surfaces unprompted in conversation

**VERIFY:** Read `knowledge-moment.ts`. What triggers it? Is the threshold check real? Does it query multiple data sources simultaneously? Is it registered in the CronScheduler or event bus?

### B6. Morning Brief Assembly
**Already verified the code is real (725 lines, 8 sections). Verify the WIRING:**
- Is `MorningBriefGenerator` constructed in bridge.ts with ALL its dependencies?
- Read the construction site. Are these passed: calendarIndexer, contactStore, relationshipAnalyzer, weatherService, reminderStore, recurringDetector, proactiveEngine, semanticSearch, intentManager, alterEgoStore, llm, model?
- Any that are null at construction means that section of the brief will be empty.

### B7. Style Profile Learning Trigger
**The chain:**
1. User sends emails → sent emails indexed
2. Style extractor analyzes sent email patterns (now behind ipAdapters)
3. StyleProfileStore updated with learned patterns
4. When drafting, `ipAdapters.styleAdapter.buildStylePrompt()` uses the profile
5. Score included in draft response

**VERIFY:** What triggers the style extraction? Is it wired to email sync? Or is it a CronScheduler job? If the extraction never triggers, the style profile stays empty and drafts never match the user's voice. This is a potential behavioral gap — confirm the trigger exists.

---

## PART C: CROSS-PLATFORM PARITY AUDIT

For every major feature, confirm it works on BOTH platforms. Where mobile has a screen but desktop doesn't (or vice versa), flag it.

### C1. Desktop → Mobile Feature Map
Walk through every feature and confirm the mobile equivalent exists and is wired:

| Feature | Desktop Screen/Handler | Mobile Screen | Wired? |
|---------|----------------------|---------------|--------|
| Chat | ChatScreen.tsx | ChatScreen.tsx | Check |
| Conversation list | Sidebar | Tab or equivalent | Check |
| Morning Brief | MorningBriefScreen or canvas | BriefScreen.tsx | Check |
| Knowledge Graph | KG visualization | KnowledgeGraphScreen.tsx | Check |
| Email Inbox | InboxScreen or unified | InboxScreen.tsx | Check |
| Financial Dashboard | FinancialDashboardScreen | FinancialDashboardScreen.tsx | Check |
| Health Dashboard | HealthDashboardScreen | HealthDashboardScreen.tsx | Check |
| Privacy Dashboard | PrivacyDashboardScreen | privacy/ directory | Check |
| Network Monitor | NetworkMonitorScreen | NetworkMonitorScreen.tsx | Check |
| Connections/Connectors | ConnectionsScreen | ConnectionsScreen.tsx | Check |
| Living Will | LivingWillScreen | sovereignty/LivingWillScreen.tsx | Check — verify props wired |
| Witness | WitnessScreen | sovereignty/WitnessScreen.tsx | Check — verify props wired |
| Inheritance | InheritanceScreen | sovereignty/InheritanceScreen.tsx | Check — verify props wired |
| Alter Ego Week | AlterEgoWeekScreen | Route exists? | Check |
| Import Everything | ImportScreen | ImportDigitalLifeScreen.tsx | Check |
| Semblance Network | SemblanceNetworkScreen | sovereignty/NetworkScreen.tsx | Check |
| Settings | 22 screen types | SettingsScreen.tsx | Check subsections |
| Sovereignty Report | SovereigntyReportScreen | SovereigntyReportScreen.tsx | Check |
| Adversarial Dashboard | AdversarialDashboardScreen | adversarial/ directory | Check |
| Onboarding | OnboardingFlow | OnboardingFlow.tsx | Check |

**For each row: read the mobile screen file. If it's a stub (<30 lines, static text), rewrite it to fetch real data via IPC matching the desktop pattern.**

### C2. Mobile Sovereignty Screen Navigation Wiring
The mobile sovereignty screens (LivingWillScreen, WitnessScreen, InheritanceScreen) accept data via React Native props. Verify the navigation wrapper that renders these screens actually:
1. Calls the IPC bridge to fetch data on mount
2. Passes the results as props to the screen component
3. Handles loading/error states

If the navigation wrapper just renders `<LivingWillScreen />` with no props, the screen will show empty/default state. This must be fixed — the wrapper must call IPC and pass real data.

### C3. Mobile Onboarding
Read `packages/mobile/src/screens/OnboardingFlow.tsx`. Verify it:
1. Has the naming step (AI name + user name)
2. Has model download with progress
3. Has connector setup (at minimum Gmail OAuth)
4. Has autonomy tier selection (Partner default)
5. Persists all choices via IPC (not AsyncStorage/localStorage)

### C4. Mobile Chat
Read `packages/mobile/src/screens/ChatScreen.tsx`. Verify it:
1. Sends messages via IPC to the sidecar's `send_message` handler
2. Receives streaming responses
3. Shows conversation history
4. Can switch between conversations

---

## PART D: BEHAVIORAL FIX PASS

For EVERY broken pipeline found in Parts B and C, fix it in this session. Specifically:

### D1. If graph-visualization.ts only shows contacts but not documents:
Add document nodes. Query `document_store` table. Each indexed document becomes a node with type='document', sized by chunk count.

### D2. If proactive engine never triggers:
Wire it to CronScheduler's `follow-up-scan` job. The cron job should call `proactiveEngine.runAnalysis()` or equivalent.

### D3. If style extraction never triggers:
Add it as a CronScheduler job or wire it to post-email-sync. The `style-extraction-job.ts` file exists in the private repo — but the TRIGGER for extraction should be in the public repo (it just calls the adapter). Wire: email sync complete → if `ipAdapters.styleAdapter` exists → trigger style extraction.

### D4. If Knowledge Moment never fires:
Wire it. Either: event bus listener on `file.created` / `email.arrived` that counts indexed items and fires KM when threshold is reached. Or: CronScheduler job that checks document count periodically.

### D5. If Morning Brief constructor is missing dependencies:
Pass all available dependencies. If a dependency is null (e.g., no weather service configured), the brief still generates — it just skips that section. But if the dependency EXISTS and isn't passed, that's a bug.

### D6. If mobile sovereignty wrappers don't pass props:
Fix each wrapper to: fetch data on mount via IPC, pass results as props, handle loading state.

---

## DELIVERABLES

```bash
# Tests
npx vitest run 2>&1 | grep -E "Tests|Test Files|failures"

# TypeScript
npx tsc --noEmit 2>&1 | tail -5

# Verify
node scripts/semblance-verify.js 2>&1 | tail -10

# Privacy
node scripts/privacy-audit/index.js 2>&1 | tail -3
```

### Deliverable 1: Mobile Screen Audit
For each of the 6 stub screens: before (line count) → after (line count). Confirm each now fetches real data via IPC.

### Deliverable 2: Behavioral Pipeline Report
For each of the 7 pipelines in Part B:
- **Status:** VERIFIED (chain intact) or FIXED (chain was broken, now fixed) or HARDWARE-DEPENDENT (needs real data/device)
- **Evidence:** what you read to confirm, or what you changed to fix

### Deliverable 3: Cross-Platform Parity Table
Fill in the table from C1 with actual findings. Flag any feature that exists on desktop but is missing/stub on mobile.

### Deliverable 4: Fixes Made
Numbered list of every fix applied, with file paths and descriptions.

### Deliverable 5: Updated Metrics
Test count, TypeScript status, verify score, privacy audit.

---

## RULES

1. **Read the actual code** before claiming any pipeline is intact. Open the file, read the function, trace the data flow.
2. **Fix what you find.** Do not report gaps and move on. Fix them.
3. **No stubs.** A mobile screen that shows "No data available" when the backend has data is a stub. Wire it.
4. **Test count must go UP** (new tests for new mobile screens) or stay the same. Never down.
5. **No `.skip` on any test.**
6. **No AsyncStorage on mobile.** Use the IPC layer to the sidecar, same as desktop. If mobile doesn't have a sidecar, use the InProcessTransport equivalent — read the mobile architecture to understand how IPC works on mobile.
7. **Every fix must compile.** Run `npx tsc --noEmit` after every file change.
