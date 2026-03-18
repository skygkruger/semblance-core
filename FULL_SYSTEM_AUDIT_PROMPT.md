# FULL-SYSTEM GROUND TRUTH AUDIT
## VERIDIAN SYNTHETICS — Pre-Launch Production Readiness Verification
## Claude Code Implementation Prompt

> **Date:** 2026-03-18
> **Baseline:** 6,327 tests passing (482 files), 0 failures, TypeScript clean, 38/40 verify, IP boundary complete
> **Mandate:** Trace EVERY feature in the product. Find EVERY gap. Fix EVERY gap that can be fixed without hardware. Report EVERY gap that requires hardware. No exceptions, no deferrals, no "future work."
> **Authority:** BUILD BIBLE (SEMBLANCE_BUILD_BIBLE.md) is the sole specification. If a feature is in the BUILD BIBLE, it ships. If it doesn't work, this audit finds it.

---

## READ FIRST

1. `SEMBLANCE_BUILD_BIBLE.md` — the canonical product spec
2. `SEMBLANCE_STATE.md` at `C:\Users\skyle\desktop\world-shattering\semblence-representative\docs\SEMBLANCE_STATE.md`
3. `packages/core/extensions/ip-adapter-registry.ts` — the new adapter registry from today's IP boundary work

**Record baseline before starting:**
```bash
npx vitest run 2>&1 | grep -E "Tests|Test Files|failures"
npx tsc --noEmit 2>&1 | tail -5
node scripts/semblance-verify.js 2>&1 | tail -5
```

---

## PHASE 0: FIX THE VERIFY SCRIPT

`semblance-verify.js` has method name mismatches that produce false ❌ results. Fix it FIRST so every subsequent verification in this audit uses correct method names.

**Known mismatches (from STATE.md Issue 6):**
- `get_pref` / `set_pref` → should be `get_onboarding_complete` / `set_onboarding_complete`
- `search_files` → should be `start_indexing` or orchestrator knowledge tools
- `create_reminder` → orchestrator tool, not direct IPC
- `web_search` → orchestrator tool, not direct IPC
- `get_morning_brief` → should be `brief_get_morning`
- Network monitor methods → should use `network:*` prefix
- Audit trail methods → should use `audit_*` prefix
- Sovereignty report → should use `report_generate_sovereignty`

**Task:** Read `scripts/semblance-verify.js` and `packages/desktop/src-tauri/sidecar/bridge.ts` case statement. For every method name the verify script sends, confirm the exact corresponding case label in bridge.ts. Fix ALL mismatches. Then re-run:

```bash
node scripts/semblance-verify.js 2>&1
```

Report the new score. It should be higher than 38/40. If it's not, report why.

---

## PHASE 1: FOUNDATION — App Launch, Onboarding, Model Architecture

### 1A. Onboarding Flow (BUILD BIBLE Section 9)
Trace the COMPLETE desktop onboarding sequence:
1. App launches → Welcome screen renders (VERIDIAN SYNTHETICS brand moment)
2. AI naming step (default: "Semblance") → `set_ai_name` IPC handler → persists in SQLite
3. Mode selection (Partner default, Guardian option) → `set_autonomy_tier` → persists
4. Hardware detection → model recommendation → correct BitNet model selected for hardware tier
5. Model download → progress visible → `handleModelDownload` in bridge.ts → actual HTTP fetch to HuggingFace → file written to disk
6. Source connection → Gmail OAuth → real browser opens → callback received → token stored in OS keychain
7. Initial indexing begins → progress indicator → background pipeline runs
8. Knowledge Moment fires after sufficient indexing
9. Tunnel pairing offer (optional, skippable)
10. Alter Ego Week offer

**For each step: confirm the IPC handler exists, confirm the UI screen exists, confirm data flows from UI → bridge → core → persistence. Report any step that is a dead end.**

### 1B. Model Architecture (BUILD BIBLE Section 2.6)
Verify the three-tier inference pipeline:
1. `BitNetProvider` — default. Confirm it's priority 2 in InferenceRouter.
2. `OllamaProvider` — priority 1 when Ollama detected. Confirm auto-detection logic.
3. `NativeProvider` — priority 3 fallback. Confirm it exists.
4. Provider transition: if Ollama crashes, conversation continues on BitNet. Confirm the fallback code path.
5. `ModelResidencyManager` — eviction policy, idle timeout, RAM tracking. Confirm exists.
6. `InferenceRouter` — tier routing + vision support. Confirm exists and routes correctly.
7. Model catalog: all 7 BitNet models from BUILD BIBLE Section 2.6 table present in registry.
8. `AdaptiveContextBudget` — model-aware allocation in orchestrator.buildMessages(). Confirm integration.

### 1C. Persistence Across Restart
1. Close app → reopen → onboarding does NOT show (onboarding complete flag persists)
2. AI name persists
3. Autonomy tier persists
4. Connected accounts persist (OAuth tokens in OS keychain)
5. Chat history persists (SQLite)
6. Conversation list shows previous conversations

**Trace each persistence path: what writes it, where it's stored (must be SQLite or OS keychain — NOT localStorage), what reads it on restart.**

---

## PHASE 2: CORE INTELLIGENCE — Knowledge, Email, Calendar, Chat

### 2A. Knowledge Graph (BUILD BIBLE Section 2.7 + 5.1)
1. File indexing: `start_indexing` handler → `file-scanner.ts` → chunks → `nomic-embed-text-v1.5` embedding → LanceDB insert. Trace the full pipeline.
2. Semantic search: query → embedding → LanceDB similarity search → results. Confirm `SemanticSearch` class works.
3. Entity resolution: "Sarah" in email = "Sarah" in calendar. Confirm `ContactResolver` exists and resolves.
4. Knowledge Moment: `KnowledgeMomentGenerator` — what triggers it, does it use real data, does it surface compound knowledge?
5. Sanitization: `sanitizeRetrievedContent()` called BEFORE content enters KG at indexing time (Issue 9 fix). Verify in file-scanner.ts.
6. Document chunker: 2,000 char chunks, max 2,000 chunks per doc. Verify constants.

### 2B. Email Intelligence (BUILD BIBLE Section 5.2)
1. Multi-account OAuth: schema uses compound key `(provider, account_id)` — verify migration ran.
2. `get_inbox_items` → reads from local `emailIndexer` (not live Gmail API). Verify.
3. `search_emails` → `emailIndexer.searchEmails()`. Verify handler chain.
4. `draft_email_action` → `emailAdapter.execute()` → style profile applied if DR loaded. Verify.
5. Email send: Gmail API send (not SMTP XOAUTH2). Verify the actual send path.
6. Follow-up tracking: commitment extraction from sent emails. Verify `CommitmentTracker` is wired to email pipeline.
7. Dark pattern flagging: `ipAdapters.darkPatternDetector` in email triage pipeline. Verify integration post-IP-boundary.
8. Auto-triage categories: meeting requests, action items, newsletters, receipts. Verify categorization code.

### 2C. Calendar Intelligence (BUILD BIBLE Section 5.3)
1. CalDAV/Google Calendar OAuth → token storage → sync → local index.
2. `get_today_events` → `calendarIndexer.getUpcomingEvents()`. Verify handler.
3. Conflict detection: exists in code? Wired to anything?
4. Meeting prep brief: auto-generated before meetings. What triggers it? Is it wired to CronScheduler?
5. Calendar events indexed into knowledge graph. Verify the indexing pipeline.

### 2D. Chat and Conversation (BUILD BIBLE — core UX)
1. Message sent → orchestrator.processMessage() → inference → streaming response. Full pipeline trace.
2. Conversation history: `ConversationManager` → SQLite. Verify CRUD operations.
3. Conversation list: sidebar shows all conversations. Verify the IPC handler that returns the list.
4. Conversation search: semantic search across past chats. Does this exist?
5. Chat-About-Document: drop file → index in context → scoped queries. Verify `DocumentContextManager`.
6. Artifact generation: formatted documents from conversation. Verify `ArtifactParser`.
7. Tool dispatch: orchestrator invokes tools during conversation. Verify tool registry and dispatch.

---

## PHASE 3: FEATURES — Web Search, Reminders, Contacts, Style, Digests

### 3A. Web Search (BUILD BIBLE Section 5.5)
1. Provider priority chain: SearXNG → Brave → DuckDuckGo. Verify `getAdapter()` factory and fallback.
2. DuckDuckGo adapter: zero-config, always available. Verify it works without API key.
3. `deep_search_web` tool: search + parallel page fetches. Verify `DeepSearchAdapter`.
4. Every search logged in Network Monitor. Verify audit trail entry created.
5. Domain allowlist enforced. Verify the check in Gateway before fetch.

### 3B. Reminders and Quick Capture (BUILD BIBLE Section 5.6)
1. Create reminder via orchestrator tool (natural language). Verify tool is registered.
2. `reminder_list` → returns real reminders from SQLite. Verify handler.
3. `reminder_snooze` / `reminder_dismiss` — verify handlers mutate real data.
4. Quick capture widget: desktop and mobile. Verify the UI component exists and routes to an IPC handler.
5. Location-aware reminders on mobile. Verify `LocationStore` integration.

### 3C. Relationships and Contacts (BUILD BIBLE Section 5.7)
1. `ContactStore` — unified contact graph from email + calendar + messaging. Verify.
2. `RelationshipAnalyzer` — communication patterns, frequency, strength. Verify.
3. Contact context surfaced in email/calendar views. Verify the integration.
4. `ReciprocityScore` + `IntroductionHistory` (Sprint E). Verify bridge handlers.
5. `PatternShiftDetector` — 4 shift types. Verify bridge handlers.

### 3D. Style Profile (BUILD BIBLE Section 5.4)
1. `StyleProfileStore` — public, remains in core. Verify it reads/writes SQLite.
2. Style learning from sent email analysis. What triggers the analysis? Is it wired to email sync?
3. Style-matched draft generation: now goes through `ipAdapters.styleAdapter`. Verify the orchestrator uses the registry correctly post-IP-boundary.
4. Style match score in drafts. Verify the score is included in draft_email_action response.
5. Corrections feed back into profile. Verify the feedback loop exists.

### 3E. Morning Brief and Digests (BUILD BIBLE Sections 6.1 + complete-launch-feature-list)
1. `brief_get_morning` handler → `morningBriefGenerator.generateBrief()`. Verify the full assembly.
2. Morning Brief pulls from: weather, calendar, email, financial, tasks, proactive insights. Verify each data source is queried.
3. `MorningBriefScheduler` — configurable delivery time. Verify CronScheduler integration.
4. Daily digest: `daily-digest.ts`. Verify it exists and generates.
5. Weekly digest: now through `ipAdapters.weeklyDigestGenerator`. Verify post-IP-boundary.
6. Speculative pre-loading: `SpeculativeLoader` pre-assembles morning brief context. Verify integration.

### 3F. Proactive Engine (BUILD BIBLE — proactive context)
1. `ProactiveEngine` — what triggers it, what data it queries, what insights it produces.
2. `get_proactive_insights` handler. Verify it returns real data (not empty array when data exists).
3. Proactive insights surface in Morning Brief. Verify the integration.

---

## PHASE 4: SOVEREIGNTY FEATURES — THE CRITICAL ❌ ITEMS

**These three features are the ONLY remaining ❌ in the feature table. Core backends are REAL. Bridge handlers are MISSING. UI uses localStorage facades. This phase MUST fix all three.**

### 4A. Living Will (BUILD BIBLE Section 7.1) — ❌ → must become ⚠️
1. Core backend exists: `packages/core/living-will/` — 5 files, SQLite, AES-256-GCM encryption, passphrase handling. **Read these files to understand the API.**
2. **CREATE bridge handlers** in bridge.ts for: export (create .semblance archive), list exports, get export status, configure scheduled exports, selective export.
3. **REPLACE localStorage in the UI screen** with real IPC calls to the new bridge handlers.
4. Premium gate: Living Will export requires Digital Representative tier. Verify `PremiumGate` check.
5. **No localStorage. No window.prompt. Real SQLite + real crypto + real file export.**

### 4B. Semblance Witness (BUILD BIBLE Section 7.2) — ❌ → must become ⚠️
1. Core backend exists: `packages/core/witness/` + `packages/core/attestation/` — Ed25519 signing, JSON-LD format, offline verification. **Read these files.**
2. **CREATE bridge handlers** for: generate attestation from audit trail entry, verify attestation, list attestations, export attestation.
3. **REPLACE localStorage in the UI screen** with real IPC calls.
4. Witness is available to ALL tiers (sovereignty feature, not DR-gated). Verify no premium gate.
5. **Must produce a real Ed25519-signed JSON-LD attestation, not a localStorage string.**

### 4C. Inheritance Protocol (BUILD BIBLE Section 7.3) — ❌ → must become ⚠️
1. Core backend exists: `packages/core/inheritance/` — 5 files, 5 SQLite tables, trusted party management, activation packages, time-lock. **Read these files.**
2. **CREATE bridge handlers** for: designate trusted party, create activation package, list packages, test run mode, activate (with passphrase), get protocol status.
3. **REPLACE localStorage + window.prompt in the UI screen** with real IPC calls.
4. Premium gate: requires Digital Representative. Verify.
5. **Must produce real cryptographic activation packages, not localStorage mockups.**

**After this phase, run full test suite and verify score. All three features must move from ❌ to ⚠️ (code complete, runtime unverified).**

---

## PHASE 5: DIGITAL REPRESENTATIVE FEATURES

### 5A. Adversarial Self-Defense (BUILD BIBLE Section 5.8)
1. Dark pattern detection now goes through `ipAdapters.darkPatternDetector`. Verify the bridge handlers still work post-IP-boundary.
2. `dark_pattern_get_flags` + `get_dark_pattern_flags` — both should query through the adapter. Verify.
3. Financial subscription advocacy — through `ipAdapters.recurringDetector`. Verify integration.
4. Opt-out autopilot — was in defense/optout-autopilot.ts, now behind adapter. Verify it's accessible.

### 5B. Financial Dashboard (BUILD BIBLE Section 6.8)
1. Statement import: `ipAdapters.statementParser`. Verify the bridge handler for import flow.
2. `get_financial_dashboard` → `ipAdapters.recurringDetector.getFinancialDashboard()`. Verify post-IP-boundary.
3. Transaction categorization through adapter. Verify.
4. Subscription tracker. Verify the data path.
5. Biometric protection: first open per session. Verify `BiometricGate` wraps the Financial screen.

### 5C. Health Dashboard (BUILD BIBLE Section 6.9)
1. `get_health_dashboard` → `healthEntryStore`. Verify handler returns correct shape.
2. Manual entry support (non-iOS). Verify a handler exists for adding entries.
3. Biometric protection: first open per session. Verify `BiometricGate` wraps the Health screen.

### 5D. Visual Knowledge Graph (BUILD BIBLE Section 6.3)
1. D3 3D force-directed graph in canvas panel. Verify the component exists.
2. `graphVisualizationProvider` returns node/edge data. Verify handler.
3. Node categories: documents, emails, events, contacts. Verify the data includes type information.
4. Filtering by source, date, person. Verify filter params are accepted.

### 5E. Import Everything (BUILD BIBLE Section 6.4)
1. `ImportEverythingOrchestrator` — browser history, notes, photo metadata, messaging. Verify the 3 bridge handlers.
2. Consent cards per source. Verify the consent flow exists in UI.
3. Platform-specific source detection. Verify path resolution for Chrome, Firefox, Safari, Apple Notes, etc.
4. Knowledge Moment re-fires after import. Verify the trigger.

### 5F. Form Automation (BUILD BIBLE Section 6.5)
1. `BrowserCDPAdapter` — 9 action types. Verify all bridge handlers respond.
2. `fill_web_form` tool registered in orchestrator. Verify.
3. Canvas preview before form fill. Verify the canvas push happens.
4. Allowlist enforcement on navigate. Verify the check in the adapter.

### 5G. Semblance Network (BUILD BIBLE Section 6.6)
1. Peer-to-peer sharing infrastructure. Verify the UI screen exists.
2. Connection flow: mDNS + remote codes. Verify `PairingCoordinator` bridge handlers.
3. Granular consent controls. Verify the sharing permission model.
4. Revocation flow. Verify instant delete of shared context.

---

## PHASE 6: OPENCLAW INTEGRATIONS + COMPUTE MESH + HARDWARE BRIDGE

### 6A. OpenClaw Orchestration (BUILD BIBLE Part IV)
1. **DaemonManager** (Sprint B) — launchd/Windows startup/systemd. Verify the install/uninstall methods exist and are callable from bridge.
2. **CronScheduler** (Sprint B) — 6 built-in jobs. Verify each job exists: morning-brief, follow-up-scan, subscription-audit, kg-maintenance, license-scan, tunnel-sync. Verify SQLite persistence.
3. **Browser CDP** (Sprint G.5) — 9 action types. Verify all 9 bridge handlers: browser_connect, browser_disconnect, browser_navigate, browser_snapshot, browser_click, browser_type, browser_extract, browser_fill, browser_screenshot.
4. **Channel adapters** (Sprint C+G):
   - iMessage: BlueBubbles + AppleScript. Verify adapter file and bridge handler.
   - Telegram: Bot API long-poll. Verify adapter and handler.
   - Signal: signal-cli via SystemCommandGateway. Verify graceful degradation when signal-cli not installed.
   - Slack: Socket Mode WebSocket. Verify adapter distinct from OAuth import adapter.
   - WhatsApp: Baileys protocol. Verify QR code linking flow exists.
5. **InboundPipeline** — mandatory sanitization via `sanitizeInboundContent()`. Verify EVERY channel adapter routes through this.
6. **NamedSessionManager** (Sprint C) — session keys, autonomy overrides, channel binding. Verify bridge handlers.
7. **SkillRegistry** (Sprint G) — install/uninstall/enable/disable. Verify 7 bridge handlers. Verify SQLite persistence.
8. **SubAgentCoordinator** (Sprint G) — create/list/terminate. Verify 3 bridge handlers.
9. **CanvasManager** (Sprint C) — typed component validation, audit-logged pushes. Verify `CanvasPanel.tsx` mounted in App.tsx.

### 6B. VERIDIAN Compute Mesh (BUILD BIBLE Part III)
1. **TunnelTransport** (Sprint D) — IPCTransport impl, retry/backoff/heartbeat. Verify it implements the same interface as SocketTransport.
2. **TunnelGatewayServer** — HTTP on mesh IP with /action /health /info /kg-sync. Verify all 4 endpoints.
3. **WireGuardKeyManager** — Curve25519 keypair, OS keychain storage. Verify.
4. **HeadscaleClient** — registration, peers, config. Verify REST API calls go through Gateway (not Core).
5. **PairingCoordinator** — QR code generation, 6-digit codes, paired_devices table. Verify bridge handlers.
6. **Mobile TaskRouter** — local/tunnel routing, classify always-local tasks, threshold offload. Verify.
7. **TunnelKGSync** — Merkle delta sync, sovereignty filter (no raw content/email bodies). Verify forbidden fields.
8. **ActionResponse provenance** — `executedOn` field set in TunnelTransport.sendOnce(). Verify.

### 6C. Hardware Bridge (BUILD BIBLE Part XVI, Sprint F)
1. **BinaryAllowlist** — 40+ permanent block list. Verify the block list includes: curl, wget, ssh, python, node, etc.
2. **ArgumentValidator** — shell metacharacter rejection, path traversal. Verify.
3. **SystemCommandGateway** — execFile-only (not exec/shell:true). Verify `child_process.execFile` is used.
4. **15 system.* action types** — all in IPC types + autonomy maps. Verify each one has a risk level mapping.
5. **Rust `get_live_hardware_stats`** — registered as Tauri command. Verify in lib.rs.
6. **4 binary_allowlist_* bridge handlers** — list, add, remove, check. Verify.
7. **14 system_* bridge handlers** — execute, hw_stat, app_launch, app_list, file_watch, clipboard_read, clipboard_write, notification, accessibility, keypress, shortcut, process_kill, process_list, process_signal. Verify each one.

### 6D. Intelligence Depth (BUILD BIBLE Parts XIX-XXI, Sprint E)
1. **SemblanceEventBus** — 18 event types. List all 18 and verify each has an emitter wired.
2. **PreferenceGraph** — SQLite-backed, confidence EMA. Verify 4 bridge handlers: preference_list, preference_confirm, preference_deny, preference_get_high_confidence.
3. **4 preference detectors** — temporal response, meeting time, format, system. Verify they're wired to kg-maintenance cron.
4. **SpeculativeLoader** — in-memory cache, TTL. Verify 2 bridge handlers: speculative_cache_status, speculative_preload_now.
5. **CommitmentTracker** — heuristic extraction, auto-resolve. Verify 3 bridge handlers: commitment_list_due, commitment_resolve, commitment_dismiss.
6. **PatternShiftDetector** — 4 shift types. Verify bridge handler: relationship_pattern_shifts.
7. **ReciprocityScore** — initiation ratio, response asymmetry. Verify bridge handler: relationship_reciprocity.
8. **Autonomy + Preference integration** — high-confidence (≥0.85) auto-approves. Verify the decision path in AutonomyManager.

---

## PHASE 7: PAYMENT, LICENSING, AUTONOMY

### 7A. License System (BUILD BIBLE Section 10)
1. `license:activate_key` handler — accepts Ed25519-signed license key, validates against compiled public key. Verify the validation logic.
2. `license:status` handler — returns current tier (free/DR/lifetime/founding). Verify.
3. License key stored in OS keychain (not localStorage, not SQLite). Verify `keytar` or Tauri keychain usage.
4. Offline validation — no server contact after activation. Verify no network call in the validation path.
5. License email detection — Semblance scans inbox for license key email and activates silently. Verify the pipeline: email sync → license email detected → key extracted → validated → activated.
6. Founding Member seat number — encoded in signed key, decoded at activation, displayed as "Founding Member #N". Verify the encoding/decoding.
7. `PremiumGate` — checks license tier before enabling DR features. Verify it gates correctly.
8. Upgrade popup: email capture only, copy: "No accounts ever. We just need to know where to send your license key." Verify the UI.

### 7B. Autonomy Framework (BUILD BIBLE Section 2.5)
1. Three tiers: Guardian, Partner, Alter Ego. Verify `AutonomyManager` implements all three.
2. Per-domain configuration: different tiers for different action domains. Verify SQLite persistence.
3. 60+ ActionTypes mapped to domains and risk levels. Verify the mapping covers ALL action types in the system (including new ones from Sprints B-G.5).
4. `decide(action)` returns: auto_approve, requires_approval, or blocked. Verify.
5. Preference integration: high-confidence prefs (≥0.85) auto-approve at Partner tier. Verify the triple input: tier + risk + preference confidence.
6. Alter Ego guardrails: hard blocks on irreversible high-stakes actions. Verify `alter-ego-guardrails.ts`.
7. Escalation boundaries: `EscalationEngine` + `BoundaryEnforcer`. Verify they're wired.

### 7C. Privacy and Security
1. Privacy audit script: `node scripts/privacy-audit/index.js` — scans all core imports for network capability. Run it, verify CLEAN.
2. Network Monitor: 6 `network:*` handlers wired to `NetworkMonitor`. Verify each one returns real data.
3. Comparison Statement: dynamic text, not hardcoded. Verify it uses real indexed item counts.
4. Sovereignty Report: `report_generate_sovereignty` + `report_render_pdf`. Verify Ed25519 signature over canonical JSON.
5. Merkle chain: `audit_verify_chain` + `audit_generate_receipt` + `audit_get_chain_status`. Verify real Ed25519 signing.
6. Biometric gates: app launch, Alter Ego activation, Privacy/Financial/Health screens (first open per session). Verify `BiometricGate` component wraps each.
7. Content sanitizer: `sanitizeRetrievedContent()` called at both indexing AND retrieval time. Verify both paths.

---

## PHASE 8: UI — EVERY SCREEN, BOTH PLATFORMS

### 8A. Desktop UI — Screen Inventory
For EVERY screen below, verify: (a) the component file exists, (b) it's routed in App.tsx or SettingsNavigator, (c) it fetches data via IPC (not hardcoded/localStorage), (d) it renders something meaningful.

**Main screens:**
- Chat (main conversation view)
- Conversation list / sidebar
- Morning Brief view
- Knowledge Graph visualization
- Privacy Dashboard
- Network Monitor
- Settings root (all 9 section groups)

**Settings screens (all 22):**
Walk the SettingsNavigator. Every screen type must resolve to a real component. Report any that resolve to a placeholder or "Coming Soon" text.

**Sovereign feature screens:**
- Living Will — MUST use real IPC after Phase 4 fix
- Witness — MUST use real IPC after Phase 4 fix
- Inheritance — MUST use real IPC after Phase 4 fix
- Adversarial Self-Defense
- Alter Ego Week

**New screens from Sprint UI:**
- Tunnel Pairing (/tunnel-pairing)
- Alter Ego Week (/alter-ego-week)
- Semblance Network (/semblance-network)
- Import Everything (/import)
- Canvas Panel (mounted in App.tsx)

**Settings panels:**
- SettingsChannels
- SettingsSessions
- SettingsPreferences
- SettingsSkills
- SettingsBinaryAllowlist
- SettingsTunnelPairing

**For each screen, report: LIVE (fetches real data via IPC), PLACEHOLDER (static text/mock data), DEAD (renders nothing or crashes), or MISSING (route exists but component doesn't).**

### 8B. Mobile UI — Screen Inventory
Verify every mobile screen:

**Tab screens (5):**
- Chat
- Brief
- Knowledge
- Privacy
- Settings

**Settings screens:**
All registered mobile settings screens. Verify navigation.

**Stub screens that NEED real data (from handoff — Sprint H priority):**
- TunnelPairing
- Channels
- Sessions
- LearnedPreferences
- Skills
- BinaryAllowlist

**For each stub screen: does it still show static placeholder text, or has it been wired to real SQLite data?** If still placeholder, report it as a gap that must be fixed before user testing.

### 8C. Navigation Completeness
1. Desktop sidebar: every entry navigates to a real screen. Click test all entries.
2. Desktop settings: all 9 section groups expand. All 22 screen types route correctly.
3. `onNavigateExternal` map in SettingsNavigator.web.tsx — every key maps to a real screen file.
4. Mobile tab navigator: all 5 tabs render.
5. Mobile settings: NativeStackNavigator, all sections navigate.

---

## PHASE 9: IP BOUNDARY VERIFICATION

The IP boundary separation was completed earlier today. Verify it's working correctly:

1. `ipAdapters` registry exists at `packages/core/extensions/ip-adapter-registry.ts`. Read it.
2. All finance bridge handlers use `ipAdapters.recurringDetector` etc. — not direct imports. Verify NO direct imports of deleted files exist anywhere.
3. `orchestrator.ts` uses `ipAdapters.styleAdapter` for style scoring. When null, drafts skip style scoring (free tier). Verify the null check works.
4. All alter_ego_week_* handlers use `ipAdapters.alterEgoWeekEngine`. When null, return `{ error: 'Requires Digital Representative' }`. Verify.
5. All digest handlers use `ipAdapters.weeklyDigestGenerator`. When null, return error. Verify.
6. Run: `grep -rn "from.*finance/category\|from.*finance/merchant-normalizer\|from.*finance/recurring-detector\|from.*finance/statement-parser\|from.*defense/dark-pattern-detector\|from.*style/style-injector\|from.*style/style-scorer\|from.*digest/weekly-digest\|from.*alter-ego-week-engine" packages/ --include="*.ts"` — MUST return zero results.

---

## PHASE 10: DESIGN SYSTEM VERIFICATION

1. Desktop entry point imports Design Bible CSS tokens (tokens.css, fonts.css, opal.css, surfaces.css). Verify in styles.css or equivalent.
2. No raw hex colors in production screens (except documented legitimate exceptions). Run: `grep -rn "#[0-9A-Fa-f]\{6\}" packages/desktop/src/ --include="*.tsx" --include="*.css" | head -20` — report findings.
3. Font stack: DM Sans (body), Fraunces (display), DM Mono (mono). Verify CSS @font-face declarations.
4. CSP policy: `data:` in img-src and font-src. Verify in tauri.conf.json or equivalent.

---

## PHASE 11: i18n VERIFICATION

1. 10 locales configured: EN, ES, DE, PT, FR, JA, ZH-CN, ZH-TW, KO, IT. Verify locale files exist.
2. No hardcoded English strings in UI components (except documented exceptions). Spot-check 5 screens.
3. i18n keys resolve to real translations. Spot-check 3 non-English locales.

---

## DELIVERABLES

After completing ALL phases, produce the following:

### Deliverable 1: Complete Feature Status Table
Update SEMBLANCE_STATE.md FEATURE VERIFICATION STATUS table with findings from this audit. Every feature gets a fresh status based on what you actually traced, not what the table previously said.

Use these statuses:
- ✅ VERIFIED — traced the full pipeline, code is correct, data flows end-to-end
- ⚠️ CODE COMPLETE — implementation exists but requires real hardware/data/accounts for runtime verification
- ❌ BROKEN — code exists but pipeline is broken, missing handler, wrong data shape, localStorage facade
- 🔲 MISSING — no implementation exists
- 🔧 FIXED THIS SESSION — was broken, now fixed

### Deliverable 2: Gap Report
A numbered list of every gap found, categorized:
- **FIXED:** gaps that were found and fixed during this audit (with what was done)
- **HARDWARE-DEPENDENT:** gaps that can only be verified on real devices (list what's needed)
- **NEEDS ORBITAL DIRECTOR:** gaps that require architectural decisions

### Deliverable 3: Updated Metrics
```bash
npx vitest run 2>&1 | grep -E "Tests|Test Files|failures"
npx tsc --noEmit 2>&1 | tail -5
node scripts/semblance-verify.js 2>&1 | tail -10
node scripts/privacy-audit/index.js 2>&1 | tail -5
```

### Deliverable 4: Bridge Handler Census
Total IPC handlers in bridge.ts. Compare to pre-audit count. List any handlers added during this audit.

### Deliverable 5: localStorage Sweep
```bash
grep -rn "localStorage" packages/desktop/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".test."
```
Report every hit. Any localStorage in a sovereignty feature screen (Living Will, Witness, Inheritance) after Phase 4 is a FAILURE.

---

## RULES

1. **No self-reported success.** Show raw terminal output for every verification claim.
2. **Fix what you find.** If a bridge handler is missing, add it. If a screen uses localStorage when it should use IPC, fix it. If a pipeline is broken, trace the break and fix it.
3. **Do NOT use `.skip` on any test.**
4. **Do NOT create stub implementations.** If something can't be implemented without hardware, report it — don't fake it.
5. **Test count may go UP (new tests for fixes) but must not go DOWN.**
6. **Read the actual code** before making any claim about what exists or works. Do not rely on file names, comments, or previous audit results.
7. **The BUILD BIBLE is the specification.** If a feature is described in the BUILD BIBLE and doesn't work in the code, that is a gap. Report it.
