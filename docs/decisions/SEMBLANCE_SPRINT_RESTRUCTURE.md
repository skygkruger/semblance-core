# Semblance — Sprint Restructure (Revision 3)

## Date: February 21, 2026
## Status: CANONICAL — Supersedes SPRINT_3_MASTER_PLAN.md for sprint sequencing and step numbering.
## Baseline: Sprint 1 complete (501 tests). Sprint 2 complete (1,239 tests). Step 9 complete (1,520 tests). Codebase capability audit complete.

---

## What Changed and Why

The codebase capability audit revealed 24 capabilities implemented and working, 8 stubbed, and 18 not present. The original Sprint 3 plan (Steps 9–15) bundled premium features alongside free-tier improvements. This restructure separates them cleanly:

- **Sprint 3 (Becomes Powerful):** Delivers the undeniable free product. Everything here ships in the public `semblance-core` repo under open-source license. A user who downloads Semblance gets a product that replaces ChatGPT for daily workflows, manages their email, calendar, and reminders, searches the web, understands their documents semantically, drafts emails in their voice, and works on mobile. Zero cloud dependency. Zero subscription required.

- **Sprint 4 (Becomes Part of You):** Delivers premium capabilities and native device integration. Financial intelligence, form automation, health tracking, Digital Representative, and the native integration suite (contacts, messaging, location, weather, clipboard, voice, cloud storage). This is the intelligence-layer-of-the-device sprint. These features make cloud AI structurally unable to compete.

- **Sprint 5 (Becomes Undeniable):** Pure hardening, polish, and launch readiness. No new features. Alter Ego verification, privacy dashboard, OS sandboxing, reproducible builds, mobile parity for Sprint 4 features, performance optimization, and launch preparation.

**The principle:** Nothing ships with gaps, stubs, or shortcuts. Every capability is fully implemented, tested, and production-ready before launch. The product must be exceptional — genuinely competitive functionality that does not exist yet as a truly personal and sovereign agent.

---

## Codebase Audit Summary (Feb 21, 2026)

### Implemented and Working (24)
Compound Knowledge, Knowledge Moment, Semantic Search, Time-Saved Tracking, Email Triage, Autonomous Email Actions, Follow-up Tracking, Calendar Intelligence, Conflict Resolution, Meeting Prep, Subscription Detection, Three Autonomy Tiers, Per-Domain Configuration, Universal Action Log, Autonomy Escalation, Weekly Digest, Network Monitor, Zero-Network AI Core, Audit Trail, Desktop App, Task Routing, Zero-Config Onboarding, Hardware Detection + Model Management, Embedding Pipeline + Retroactive Embedder.

### Stubbed (8)
Pattern Recognition (approval patterns + recurring detector only — no ML), Transaction Categorization (merchant normalizer for 60+ merchants, no LLM inference), Autonomous Scheduling (tool exists, no smart slot finding), PDF Form Auto-Fill (text extraction only, no field detection), Apple Health Import (IPC types defined, no adapter), Privacy Dashboard (UI shell, no backend), Cross-Device Sync (types + registry, no mDNS/sync), Reminders (referenced in Knowledge Moment, no storage/adapter).

### Not Present (18)
Relationship Awareness, Email Drafting in User's Voice, Subscription Cancellation, Spending Insights, Anomaly Detection, Plaid Integration, Template Recognition, Smart Field Mapping, Bureaucracy Tracking, Manual Health Entries, Pattern Correlation, Proactive Health Insights, Web Search, Web Fetch, SMS/Messaging, Native Contacts, Weather, Location, Clipboard, Voice Interaction, Cloud Storage Sync, Mobile App (scaffolding only).

---

## Sprint 3 — Becomes Powerful (The Undeniable Free Product)

**Theme:** A non-technical user downloads Semblance. Within 5 minutes, it works. It manages their email, answers general questions, reads web articles, reminds them of tasks, drafts replies in their voice, and works on their phone. They never opened a terminal. They never paid anything. They never go back to ChatGPT.

**Test target:** 1,900–2,100 total tests at sprint close.

### Step 9 — Runtime Ownership + Embedding Pipeline ✅ COMPLETE

**Status:** All 25 exit criteria verified. 1,520 tests passing. Privacy audit clean.

**Delivered:** Zero-config native inference (llama-cpp-2 Rust FFI, Metal on macOS, CPU fallback), embedding pipeline (nomic-embed-text-v1.5, 768-dim), semantic search, retroactive embedder, hardware detection and profile classification, model registry and managed downloads, onboarding UI (hardware detection → model consent → download progress), Settings AI Engine section, InferenceRouter wired into SemblanceCore/Orchestrator, NDJSON callback protocol.

---

### Step 10 — Web Search + Web Fetch + Reminders + Quick Capture

**Builds on:** Step 9 (native inference, Gateway adapter pattern from Sprint 2)

**Rationale for bundling:** All four are Gateway adapter work following the established pattern. Web search and web fetch are the #1 critical gap identified in the capability audit. Reminders and quick capture are the most frequent micro-interaction with AI assistants — without them, users keep Siri/Google Assistant alongside Semblance. Bundling keeps Sprint 3 focused with fewer context switches.

**Deliverables:**

**Web Search:**
- Brave Search API as default search provider. Gateway adapter following the established ServiceAdapter pattern.
- SearXNG as optional self-hosted alternative for power users. Configurable in Settings.
- Knowledge-graph-first routing: when the user asks a question, Semblance checks local data (semantic search across knowledge graph) FIRST. If local data answers the question, no web search fires. If local data is insufficient or the query is inherently external (weather, news, stock prices, "what is X"), web search fires.
- Search results displayed in chat with source attribution. User sees every search in Network Monitor.
- New ActionTypes: `web.search`, response includes title, URL, snippet for top results.
- Rate limiting: configurable in Settings, default reasonable limit to prevent abuse of API key.
- API key management: user provides their own Brave Search API key (free tier available from Brave). Stored encrypted in credential store alongside email/calendar credentials.

**Web Fetch (URL Reading):**
- Companion to web search. Gateway adapter that fetches a URL's text content.
- New ActionType: `web.fetch`. Accepts URL, returns extracted text content (HTML stripped, article body extracted).
- Content extraction using readability-style parsing (Mozilla Readability or equivalent). Strip ads, navigation, boilerplate — return the article text.
- Fetched content injected into chat context for the AI to process locally.
- Every fetch visible in Network Monitor with URL, timestamp, and byte count.
- Respects robots.txt. Configurable timeout. Size limit to prevent fetching massive files.

**Reminders:**
- SQLite table for reminders: id, text, due_datetime, recurrence (none/daily/weekly/monthly), status (pending/fired/dismissed/snoozed), created_at, source (chat/quick-capture/proactive).
- Proactive Engine integration: reminders surface in Universal Inbox at the appropriate time.
- System notification when reminder fires (Tauri notification API on desktop, push notification on mobile when mobile ships).
- Natural language parsing: "Remind me to call the dentist at 3pm tomorrow" → parsed by LLM into structured reminder.
- Snooze and dismiss actions with autonomy tier controls.
- Recurring reminders with configurable recurrence.
- Reminders visible in a dedicated section or tab within the Universal Inbox.

**Quick Capture:**
- Lightweight input widget (global shortcut on desktop, widget on mobile when mobile ships) for rapid thought capture.
- Captures go to a "capture inbox" — a simple list in the Universal Inbox.
- AI processes captures in background: extracts actionable items, creates reminders from time-referenced captures, links captures to relevant context (emails, calendar events) via semantic search.
- "Buy milk" → capture stored. "Call dentist Tuesday 3pm" → capture stored AND reminder created automatically.
- Quick capture is the entry point for ambient intelligence — the user dumps thoughts, Semblance organizes them.

**Exit Criteria:**
1. `web.search` ActionType defined, Gateway adapter implemented, Brave Search API integrated.
2. Knowledge-graph-first routing demonstrably works: a query about an indexed email returns local results without firing web search; a query about today's weather fires web search.
3. `web.fetch` ActionType defined, Gateway adapter implemented, content extraction working for major news sites and documentation pages.
4. Every web search and web fetch appears in Network Monitor with full audit trail.
5. SearXNG configuration path exists in Settings (implementation can be adapter swap — same interface, different endpoint).
6. API key management for Brave Search integrated into credential store with encryption.
7. Reminders SQLite schema created with all fields. CRUD operations tested.
8. Natural language → structured reminder parsing works for common patterns (time, date, relative dates, recurrence).
9. Reminder fires system notification at the correct time via Tauri notification API.
10. Snooze (15min, 1hr, tomorrow) and dismiss work with audit trail.
11. Recurring reminders fire on schedule.
12. Quick capture input exists (desktop: global shortcut or persistent input; chat command as minimum viable).
13. Captures with time references automatically generate reminders.
14. Captures link to relevant knowledge graph context via semantic search.
15. All new ActionTypes have Gateway validation, rate limiting, and audit trail entries.
16. Privacy audit clean — no new unauthorized network access.
17. 80+ new tests. All existing tests pass.

**Estimated test count after Step 10:** ~1,600–1,620

---

### Step 11 — Communication Style Learning

**Builds on:** Step 9 (native inference, embeddings) + Sprint 2 email infrastructure (sent email indexing)

**Scope note:** This step is ONLY style extraction and style-matched drafting. Digital Representative features (subscription cancellation, customer service templates, email-based representative actions) move to Sprint 4 Step 20. The style profile built here is consumed by Sprint 4's Digital Representative — the dependency direction is correct (build asset first, consume later).

**Deliverables:**

**Style Extraction:**
- Analyze the user's sent emails (already indexed in Sprint 2) to build a structured style profile.
- Profile captures: typical greeting, sign-off, formality level per recipient type (colleague vs. client vs. friend), average sentence length, vocabulary patterns, tone markers (direct vs. hedging, formal vs. casual), punctuation habits, emoji usage (or lack thereof).
- Style profile stored as structured JSON in SQLite. One profile per user, updated incrementally as new sent emails are indexed.
- Extraction runs as background job after initial email indexing and on each new sent email sync.
- Minimum viable profile: 20+ sent emails analyzed. Below threshold, style matching is disabled and drafts use a neutral professional tone with a notice: "I need more of your sent emails to match your writing style."

**Style-Matched Drafting:**
- When Semblance drafts an email (reply, new composition, follow-up), the style profile is injected into the LLM prompt context.
- Draft output should sound like the user wrote it, not like generic AI. The prompt engineering must produce natural, voice-matched text.
- Style matching applies to all email drafting regardless of autonomy tier — Guardian mode shows the draft for approval, Partner mode sends routine drafts, but all drafts are style-matched.

**Style Quality Validation:**
- Compare generated drafts against the style profile using measurable heuristics: greeting match, sign-off match, sentence length distribution, formality score.
- Style match score surfaced to the user: "This draft matches your writing style: 87%."
- If match score is below configurable threshold (default 70%), regenerate with stronger style injection.
- User corrections to drafts feed back into the style profile (correction loop). If the user consistently changes the greeting Semblance generates, the profile updates.

**Exit Criteria:**
1. Style extraction pipeline processes sent emails and produces a structured JSON profile.
2. Profile includes at minimum: greeting patterns, sign-off patterns, formality level, average sentence length, tone markers.
3. Profile stored in SQLite with versioning (profile updates don't destroy history).
4. Minimum 20-email threshold enforced — below threshold, neutral professional tone used with notice.
5. Style profile injected into all email draft LLM prompts.
6. Generated drafts demonstrably differ from unstyled baseline — A/B test in test suite comparing styled vs. unstyled output.
7. Style match score computed and surfaced in draft UI.
8. Below-threshold drafts trigger regeneration (max 2 retries, then present best attempt with score).
9. User corrections update the style profile (correction feedback loop).
10. Background extraction job runs incrementally on new sent emails.
11. Privacy audit clean — style profiles stored locally, never transmitted.
12. 50+ new tests. All existing tests pass.

**Estimated test count after Step 11:** ~1,650–1,670

---

### Step 12 — Mobile Feature Parity + Task Routing

**Builds on:** Step 9 (native runtime, MLX/llama.cpp) + Sprint 2 features + Step 10 (web search, reminders) + Step 11 (style-matched drafting)

**Deliverables:**

**Mobile Inference:**
- MLX running on iOS (Apple Silicon iPhones/iPads). llama.cpp on Android.
- 3B model as default on devices with 6GB+ RAM. 1.5B model on constrained devices.
- Model downloaded and managed identically to desktop — seamless onboarding on mobile.
- Embedding model (nomic-embed-text-v1.5) operational on mobile for local semantic search.

**Sprint 2 + Sprint 3 Features on Mobile:**
- Universal Inbox with email triage, autonomous actions, follow-up tracking.
- Calendar intelligence, conflict resolution, meeting prep.
- Subscription detection results (view and manage).
- Knowledge Moment on first launch.
- Weekly digest.
- Autonomy controls (all three tiers, per-domain config).
- Network Monitor.
- Web search and web fetch (from Step 10).
- Reminders and quick capture (from Step 10).
- Style-matched email drafting (from Step 11).
- Semantic search across all indexed data.

**Task Routing:**
- When desktop and mobile are on the same local network, tasks route intelligently.
- Heavy inference (meeting prep, long email drafts, document analysis) routes to desktop.
- Quick classification, notifications, and capture stay on mobile.
- Routing is invisible to the user — results appear on whichever device they're using.
- mDNS discovery for device registration on local network.
- Encrypted transfer for state sync (action trail, preferences, autonomy settings, style profile).

**Mobile-Specific UX:**
- Touch-optimized inbox with swipe gestures (archive, categorize, approve).
- Notification integration (proactive insights as system notifications).
- Haptic feedback for action confirmations.
- Quick capture widget (iOS widget, Android widget).

**Offline Capability:**
- Mobile works without desktop connection. Limited to on-device model capacity.
- Email sync when connectivity is available.
- Reconciliation on next local network connection with desktop.

**Cross-Device State Sync:**
- Action trail, preferences, autonomy settings, style profile sync via local network.
- No cloud relay. If devices aren't on the same network, each operates independently.
- Conflict resolution: last-write-wins for preferences, merge for action trail.

**Exit Criteria:**
1. Mobile app launches and completes onboarding (hardware detection, model download, Knowledge Moment) on iOS and Android.
2. MLX inference produces real text on iOS. llama.cpp inference produces real text on Android.
3. All Sprint 2 features functional on mobile (email, calendar, subscriptions, digest, autonomy).
4. Web search, web fetch, reminders, and quick capture functional on mobile.
5. Style-matched email drafting functional on mobile.
6. Semantic search returns results on mobile using local embedding model.
7. Task routing operational: heavy task on mobile triggers routing to desktop when available.
8. mDNS device discovery works on local network.
9. State sync operational: change autonomy setting on mobile, see it reflected on desktop.
10. Mobile works offline with on-device inference (degraded but functional).
11. Touch UX passes usability review: swipe gestures, notifications, haptic feedback.
12. Quick capture widget functional on at least one platform (iOS or Android).
13. Privacy audit clean — no new unauthorized network access, sync is local-network only.
14. 100+ new tests. All existing tests pass.

**Estimated test count after Step 12:** ~1,750–1,770

---

### Step 13 — Daily Digest + Chat-About-Document + Sprint 3 Validation

**Builds on:** All previous steps. This is the Sprint 3 capstone — polish, UX completion, and validation.

**Deliverables:**

**Daily Digest:**
- Lighter daily summary in addition to the weekly digest (Sprint 2).
- Format: "Today: 6 emails handled, 1 meeting prepped, 2 follow-ups tracked. Time saved: ~25 minutes."
- Optional — users can disable in Settings.
- Appears as a morning notification or inbox card.
- Aggregates from the same action log as the weekly digest.

**Chat-About-Document UX:**
- Drag file into chat → file indexes into embedding pipeline → subsequent conversation scoped to that document's embeddings with priority.
- Works for PDF, DOCX, TXT, MD, and common document formats already supported by the file indexer.
- Scoped conversation means semantic search weights the document's chunks heavily, but doesn't exclude other knowledge graph data (the AI can still reference emails about the document's topic).
- Visual indicator in chat showing which document is in context.
- "Clear document context" action to return to general conversation.
- Infrastructure already exists (file indexing + semantic search + chat). This is interaction design and UX wiring.

**Sprint 3 Exit Criteria Validation:**
- Integration tests covering all Sprint 3 exit criteria (below).
- End-to-end journey test: fresh install → onboarding → email connect → Knowledge Moment → web search → reminder → style-matched draft → mobile sync.
- Performance pass: inference speed benchmarks on target hardware profiles (Apple Silicon, modern x86, constrained 8GB RAM).
- Memory footprint audit on desktop and mobile.
- Battery impact testing on mobile.

**Sprint 3 Exit Criteria (must ALL pass):**

1. **Zero-config onboarding works.** User downloads, opens, names AI, and has working inference within 5 minutes. No terminal. No Ollama. No model selection required.
2. **Semantic search is operational.** "Find the contract Sarah sent about Portland" returns relevant results from indexed emails and files using vector similarity, not keyword matching.
3. **Web search answers general questions.** "What's the weather tomorrow?" and "What's Apple stock at?" return real answers via Brave Search API. Knowledge-graph-first routing demonstrably checks local data before searching the web.
4. **URL reading works.** "Summarize this article: [URL]" fetches, extracts, and processes article text locally.
5. **Reminders work end-to-end.** Natural language → structured reminder → system notification at correct time → snooze/dismiss.
6. **Email drafts sound like the user.** Style profile active, match score visible, drafts demonstrably differ from unstyled baseline.
7. **Mobile is operational.** On-device inference, Sprint 2+3 features working, task routing functional, cross-device sync operational.
8. **Chat-about-document works.** Drag file into chat, ask questions, get contextually accurate answers from the document's content.
9. **All privacy guarantees hold.** Zero-network AI core enforced. Every web search, fetch, email action, and sync visible in Network Monitor. Audit trail intact.
10. **Performance is acceptable.** Email categorization <2 seconds. Web search results <5 seconds. Knowledge Moment generates within 30 seconds of indexing completion. Mobile inference responsive for classification tasks.

**Exit Criteria (Step 13 specific):**
1. Daily digest generates correctly with action counts and time-saved estimate.
2. Daily digest respects user preference (enabled/disabled in Settings).
3. Daily digest appears as notification and/or inbox card.
4. Chat-about-document: drag file into chat triggers indexing and scoped conversation.
5. Document context indicator visible in chat UI.
6. "Clear document context" returns to general conversation.
7. All 10 Sprint 3 exit criteria pass.
8. End-to-end journey test passes on desktop and mobile.
9. Performance benchmarks documented for all target hardware profiles.
10. Privacy audit clean.
11. 60+ new tests. All existing tests pass.

**Estimated test count at Sprint 3 close:** ~1,810–1,870

---

## Sprint 4 — Becomes Part of You (Premium + Native Device Integration)

**Theme:** Semblance becomes the intelligence layer of the user's device. Native APIs — contacts, location, weather, clipboard, messaging, health — are first-class data sources and action targets. Premium features unlock financial awareness, form automation, health tracking, and the Digital Representative. Cloud AI cannot access any of these native capabilities. This is the unconquerable moat.

**Test target:** 2,400–2,600 total tests at sprint close.

### Step 14 — Native Contacts + Relationship Intelligence

**Builds on:** Sprint 2 (email frequency tracking in ProactiveEngine) + Step 9 (embeddings, inference)

**Deliverables:**
- Read device contact list (with permission) via native APIs (CNContactStore on iOS/macOS, ContactsContract on Android).
- Enrich the knowledge graph: names, phone numbers, emails, birthdays, organizations, relationship labels.
- Relationship graph: who communicates with whom, frequency, last contact date, relationship type inference (colleague, client, friend, family) from communication patterns.
- Birthday tracking with proactive reminders.
- Contact frequency insights: "You haven't talked to Sarah in 3 weeks — you usually exchange emails weekly."
- Relationship intelligence dashboard in the app.
- No Gateway involvement — pure local data access via native bridge.

**Exit Criteria:**
1. Contacts imported from device with user permission grant.
2. Knowledge graph enriched with contact data (names, emails, phones, birthdays).
3. Relationship graph built from email/calendar + contacts data.
4. Birthday reminders generate automatically.
5. Contact frequency insights surface in proactive engine.
6. 60+ new tests. All existing tests pass. Privacy audit clean.

**Estimated test count after Step 14:** ~1,870–1,930

---

### Step 15 — SMS/Messaging + Clipboard Intelligence

**Builds on:** Step 14 (contacts provide messaging context and recipient resolution)

**Deliverables:**
- iOS: `MFMessageComposeViewController` pre-fills recipient + body, user taps Send (Apple restriction — cannot fully automate).
- Android: full SMS API with read + send capability under Partner/Alter Ego modes.
- "Text Sarah to confirm Tuesday pickup" → resolves Sarah from contacts, drafts message, presents for send.
- Clipboard monitoring (with permission): user copies a tracking number → Semblance offers to track the package. Copies a flight confirmation → offers to add to calendar. Copies an address → offers directions.
- Clipboard data processed locally, never transmitted. Visible in audit trail.
- Autonomy tier controls: Guardian shows every clipboard suggestion for approval. Partner handles routine patterns (tracking numbers, flight codes). Alter Ego acts automatically.

**Exit Criteria:**
1. SMS draft + send works on iOS (user tap to confirm) and Android (autonomous under Partner/Alter Ego).
2. Recipient resolution from contacts works ("Text Sarah" → correct Sarah Chen).
3. Clipboard monitoring detects actionable content patterns (tracking numbers, flight codes, addresses, phone numbers).
4. Clipboard actions respect autonomy tiers.
5. All clipboard data stays local. Privacy audit clean.
6. 50+ new tests. All existing tests pass.

**Estimated test count after Step 15:** ~1,920–1,980

---

### Step 16 — Location + Weather + Contextual Awareness

**Builds on:** Step 14 (contacts + relationship graph), Step 15 (messaging for location-triggered suggestions)

**Deliverables:**
- Location services (with permission): contextual reminders ("You're near the hardware store — you wanted lightbulbs"), commute-aware scheduling ("Meeting at 2pm, traffic heavy — leave by 1:15").
- iOS WeatherKit: local forecast data with zero Gateway involvement. Enables proactive insights: "Rain expected during your 2pm outdoor meeting."
- Android + desktop: weather via web search adapter (Brave Search).
- Location stored locally, never transmitted. Geofence processing happens on-device.
- Location data feeds into proactive engine for contextual suggestions.

**Exit Criteria:**
1. Location permission requested and respected. Location data stored locally only.
2. Contextual reminders fire based on location proximity.
3. WeatherKit provides forecast on iOS without Gateway involvement.
4. Weather queries answered on all platforms (WeatherKit iOS, web search elsewhere).
5. Commute-aware scheduling suggests departure times based on calendar + location.
6. Privacy audit clean — location never transmitted.
7. 50+ new tests. All existing tests pass.

**Estimated test count after Step 16:** ~1,970–2,030

---

### Step 17 — Voice Interaction

**Builds on:** Step 9 (native runtime — same infrastructure runs Whisper.cpp and TTS models)

**Deliverables:**
- Whisper.cpp for local speech-to-text. Runs through the same native runtime as llama.cpp. GGUF model, managed download.
- Piper (or Coqui) TTS for local text-to-speech. Configurable voice.
- Voice conversation mode: tap mic → speak → STT processes → AI responds → TTS reads response.
- Mobile-first: voice on mobile while driving, cooking, etc. "What's on my schedule today?" entirely local.
- Desktop support: voice input via system microphone.
- Audio never leaves the device. No cloud speech API. "Your voice never leaves your device."
- Voice interaction works with all existing capabilities: web search, email management, reminders, etc.

**Risk note:** This is the highest-risk step in Sprint 4. Whisper.cpp on mobile requires careful memory management alongside the primary LLM. Piper TTS quality on local hardware needs validation. Recommend aggressive hardware testing.

**Exit Criteria:**
1. Whisper.cpp STT produces accurate transcription from microphone input on desktop and mobile.
2. Piper TTS produces natural-sounding speech output on desktop and mobile.
3. Voice conversation mode works end-to-end: speak → process → respond → read.
4. Voice works with all existing features (web search, email, reminders, calendar queries).
5. Audio data stays entirely local. Privacy audit clean.
6. Memory management: voice models coexist with primary LLM without OOM on target hardware.
7. 60+ new tests. All existing tests pass.

**Estimated test count after Step 17:** ~2,030–2,090

---

### Step 18 — Cloud Storage Sync

**Builds on:** Step 9 (embedding pipeline for indexing synced files), Sprint 2 (file indexer)

**Deliverables:**
- Google Drive Gateway adapter: OAuth flow, file listing, selective sync, local download.
- Synced files stored locally and indexed into the knowledge graph via the existing file indexer + embedding pipeline.
- "Find the Q3 report" works whether the file is local or synced from Google Drive.
- Dropbox and OneDrive adapters follow the same pattern (stretch goal — Google Drive first).
- Sync is pull-only: Semblance downloads files locally. It does not upload, modify, or delete cloud files.
- User controls which folders/files sync. Storage impact visible in Settings.
- Every sync operation visible in Network Monitor.

**Exit Criteria:**
1. Google Drive OAuth flow completes successfully.
2. Files sync locally from selected Google Drive folders.
3. Synced files indexed and searchable via semantic search.
4. Network Monitor shows all sync operations.
5. Sync is pull-only — no modification of cloud files.
6. Storage usage visible in Settings.
7. Privacy audit clean.
8. 50+ new tests. All existing tests pass.

**Estimated test count after Step 18:** ~2,080–2,140

---

### Step 19 — Full Financial Awareness

**Builds on:** Sprint 2 (subscription detection, CSV/OFX parsing, merchant normalizer) + Step 9 (native inference for categorization)

**Premium feature — ships in `semblance-premium` repo.**

**Deliverables:**
- Transaction categorization: every imported transaction classified using LLM with local category taxonomy. Batch processing for efficiency.
- Spending insights: monthly spending by category, month-over-month trends, unusual charges. "You spent 40% more on dining out this month."
- Anomaly detection: flag charges unusual by amount, merchant, or pattern. "New charge: $847 from ACME CORP — first time."
- Plaid integration (premium within premium): optional real-time bank connection. Auto-imports transactions daily.
- Financial dashboard: spending breakdown, trends, anomalies, subscription status.
- Proactive financial insights integrated into Universal Inbox.

**Scope boundary:** Financial awareness, not financial planning. No budgeting tools, no investment tracking, no tax preparation.

**Exit Criteria:**
1. Transaction categorization works for all imported transactions (LLM-based + merchant normalizer).
2. Monthly spending breakdown by category is accurate.
3. Month-over-month trends computed and displayed.
4. Anomaly detection flags unusual charges.
5. Plaid integration imports transactions from connected bank accounts.
6. Financial dashboard renders all data correctly.
7. Proactive financial insights appear in Universal Inbox.
8. Premium feature gate enforced — free tier sees subscription detection only.
9. 70+ new tests. All existing tests pass. Privacy audit clean.

**Estimated test count after Step 19:** ~2,150–2,210

---

### Step 20 — Digital Representative + Subscription Cancellation

**Builds on:** Step 11 (style profile — consumed here), Step 19 (financial awareness — subscription data), Sprint 2 (email infrastructure)

**Premium feature — ships in `semblance-premium` repo.**

**Deliverables:**
- Digital Representative (email): in Alter Ego mode, handles routine email interactions end-to-end in the user's voice. Meeting confirmations, simple Q&A, scheduling responses, follow-ups.
- Subscription cancellation: drafts and sends cancellation emails for forgotten subscriptions. Uses subscription data from Sprint 2 + Step 19. Follows up if no response. Reports results in digest.
- Customer service draft templates: pre-built playbooks for refund requests, billing disputes, service cancellations, account inquiries. LLM fills specifics from user context.
- Guardian/Partner modes show all representative actions for approval. Alter Ego sends autonomously.

**Exit Criteria:**
1. Digital Representative drafts and sends routine emails in user's voice (style profile from Step 11).
2. Subscription cancellation emails drafted, sent, and follow-up tracked.
3. Customer service templates produce contextually appropriate drafts.
4. All representative actions respect autonomy tiers.
5. Full audit trail for every representative action.
6. Premium feature gate enforced.
7. 60+ new tests. All existing tests pass. Privacy audit clean.

**Estimated test count after Step 20:** ~2,210–2,270

---

### Step 21 — Form & Bureaucracy Automation

**Builds on:** Step 9 (inference for field mapping), Sprint 2 (file indexer — PDF text extraction exists)

**Premium feature — ships in `semblance-premium` repo.**

**Deliverables:**
- PDF fillable field detection and auto-fill from knowledge graph.
- Smart field mapping: LLM maps ambiguous labels to user data ("Employer name" → company from email signature).
- Template library: expense reports, PTO requests, W-4, insurance claims.
- Fill + review workflow with autonomy tier controls.
- Bureaucracy tracking: "You submitted your insurance claim 14 days ago. Typical: 30 days. I'll remind you."

**Scope boundary:** PDF forms only. No web form automation (browser extension — post-launch). No tax preparation.

**Exit Criteria:**
1. Fillable PDF fields detected and populated from knowledge graph.
2. LLM field mapping works for ambiguous labels.
3. At least 4 form templates operational.
4. Fill + review workflow functional with all autonomy tiers.
5. Bureaucracy tracking creates follow-up reminders.
6. Premium feature gate enforced.
7. 60+ new tests. All existing tests pass. Privacy audit clean.

**Estimated test count after Step 21:** ~2,270–2,330

---

### Step 22 — Health & Wellness

**Builds on:** Step 14 (calendar correlation exists), Step 9 (inference, embeddings)

**Premium feature — ships in `semblance-premium` repo.**

**Deliverables:**
- Apple Health import via HealthKit (iOS): steps, sleep, heart rate, workouts. Stored locally.
- Manual health entries: mood, energy, symptoms, medication, water intake. Quick-entry UI.
- Pattern correlation: cross-reference health data with calendar and activity. Statistical analysis, not LLM hallucination. "Your sleep drops 40% during weeks with 3+ evening meetings."
- Health insights in proactive engine. Wellness dashboard with trends and correlations.
- Clear disclaimers: correlation and insight, not medical advice.

**Exit Criteria:**
1. HealthKit data imported and stored locally on iOS.
2. Manual health entries captured and stored.
3. Pattern correlations computed statistically (not LLM-generated).
4. Health insights surface in proactive engine.
5. Wellness dashboard renders trends and correlations.
6. Medical advice disclaimers present.
7. Premium feature gate enforced.
8. 50+ new tests. All existing tests pass. Privacy audit clean.

**Estimated test count after Step 22:** ~2,320–2,380

---

## Sprint 5 — Becomes Undeniable (Hardening, Polish, Launch)

**Theme:** No new features. Everything built in Sprints 1–4 is hardened, polished, verified end-to-end, and prepared for public launch. The product that ships must be exceptional.

**Test target:** 2,600–2,800 total tests at sprint close.

### Step 23 — Alter Ego End-to-End Verification

**Builds on:** All Sprint 4 steps (Alter Ego must work across every capability domain)

**Deliverables:**
- End-to-end verification of Alter Ego mode across all domains: email, calendar, finance, forms, health, messaging, reminders.
- Style matching quality validation: Alter Ego email drafts must consistently score 80%+ on style match.
- Autonomy boundary testing: verify that Alter Ego respects all configured boundaries and escalates genuinely high-stakes decisions.
- Edge case testing: what happens when Alter Ego encounters ambiguous situations, conflicting information, or novel scenarios.
- Alter Ego onboarding flow: clear explanation of what Alter Ego does, trust-building progression from Guardian → Partner → Alter Ego.

**Exit Criteria:**
1. Alter Ego operates correctly in every capability domain.
2. Style match consistently 80%+ for email drafts.
3. High-stakes escalation works (Alter Ego defers appropriately).
4. Edge cases handled gracefully (fallback to asking user rather than guessing).
5. Onboarding flow clearly explains Alter Ego capabilities and trust progression.
6. 40+ new tests. All existing tests pass.

**Estimated test count after Step 23:** ~2,360–2,420

---

### Step 24 — Privacy Dashboard + Proof of Privacy

**Builds on:** Sprint 1 (audit trail), Sprint 2 (Network Monitor)

**Deliverables:**
- Full privacy dashboard: visualization of all data Semblance stores, all connections it has made, all actions it has taken.
- Proof of Privacy report: cryptographically signed attestation of Semblance's privacy behavior. "In the last 30 days, Semblance made X outbound connections, all to services you authorized. Your AI core made zero network connections."
- Data export: full export of all user data in portable format (JSON + original files).
- Data wipe: complete deletion of all Semblance data with cryptographic verification that nothing remains.
- Privacy dashboard accessible from Settings, always visible, never hidden.

**Exit Criteria:**
1. Privacy dashboard shows all stored data categories with counts and sizes.
2. Connection history visualized (from audit trail).
3. Proof of Privacy report generates with cryptographic signing.
4. Data export produces complete, portable archive.
5. Data wipe deletes everything and verifies deletion.
6. 40+ new tests. All existing tests pass. Privacy audit clean.

**Estimated test count after Step 24:** ~2,400–2,460

---

### Step 25 — OS Sandboxing + Reproducible Builds + Security Hardening

**Builds on:** All previous steps (security hardening applies to everything)

**Deliverables:**
- macOS: App Sandbox configuration — Semblance operates within macOS sandbox with declared entitlements only.
- Linux: seccomp/AppArmor profiles restricting system call access.
- Windows: AppContainer or equivalent isolation.
- Reproducible builds: given the same source commit, anyone can produce a bit-identical binary. This is the ultimate trust signal for open-source software.
- Security audit preparation: document all attack surfaces, threat model, and mitigations.
- Gemini security audit on final codebase.

**Exit Criteria:**
1. macOS App Sandbox configured and enforced.
2. Linux seccomp/AppArmor profiles applied and tested.
3. Windows sandboxing configured.
4. Reproducible build process documented and verified (same commit → same binary).
5. Security threat model documented.
6. Gemini security audit passes.
7. 30+ new tests. All existing tests pass.

**Estimated test count after Step 25:** ~2,430–2,490

---

### Step 26 — Mobile Feature Parity for Sprint 4 + Performance Optimization

**Builds on:** Step 12 (mobile foundation), all Sprint 4 steps

**Deliverables:**
- Sprint 4 features on mobile: financial dashboard, form management (view, not fill — PDF fill is desktop), health dashboard, Digital Representative notifications, cloud storage browsing.
- Native device features fully operational on mobile: contacts, messaging, location, weather, clipboard, voice.
- Performance optimization: inference speed, battery impact, memory footprint, startup time.
- Battery impact testing and optimization for mobile inference.
- Cold start optimization: Semblance should be responsive within 3 seconds of launch.

**Exit Criteria:**
1. All Sprint 4 features accessible on mobile (with appropriate mobile adaptations).
2. Native device features operational on both iOS and Android.
3. Inference speed meets targets on all hardware profiles.
4. Battery impact acceptable for daily use on mobile.
5. Memory footprint within budget on all target devices.
6. Cold start <3 seconds on target hardware.
7. 50+ new tests. All existing tests pass. Privacy audit clean.

**Estimated test count after Step 26:** ~2,480–2,540

---

### Step 27 — Launch Preparation

**Builds on:** Everything. This is the final step.

**Deliverables:**
- Documentation: README, ARCHITECTURE.md, PRIVACY.md, CONTRIBUTING.md, API documentation.
- Website: landing page, download links, feature showcase, privacy claims with verification instructions.
- Open-source repository preparation: clean git history, license files, CI/CD pipeline, automated privacy audit in CI.
- Community infrastructure: issue templates, discussion forums, contribution guidelines.
- Marketing materials: launch blog post, social media assets, press kit.
- App store submissions (iOS App Store, Google Play, Microsoft Store if applicable).
- Final end-to-end test on fresh machines: macOS, Windows, Linux, iOS, Android.
- Launch checklist verification against repository launch checklist from build map.

**Exit Criteria:**
1. Documentation complete and reviewed.
2. Website live with accurate feature descriptions and download links.
3. Open-source repo passes all automated checks.
4. App store submissions prepared (or submitted).
5. Fresh-install end-to-end test passes on all 5 platforms.
6. Launch blog post and press kit ready.
7. All tests pass. Privacy audit clean. Security audit clean.

**Final test count target:** 2,600–2,800 total tests.

---

## Complete Step Index

| Step | Sprint | Name | Status |
|------|--------|------|--------|
| 1–8 | 1–2 | (Sprint 1 + Sprint 2) | ✅ COMPLETE |
| 9 | 3 | Runtime Ownership + Embedding Pipeline | ✅ COMPLETE |
| 10 | 3 | Web Search + Web Fetch + Reminders + Quick Capture | NEXT |
| 11 | 3 | Communication Style Learning | Planned |
| 12 | 3 | Mobile Feature Parity + Task Routing | Planned |
| 13 | 3 | Daily Digest + Chat-About-Document + Sprint 3 Validation | Planned |
| 14 | 4 | Native Contacts + Relationship Intelligence | Planned |
| 15 | 4 | SMS/Messaging + Clipboard Intelligence | Planned |
| 16 | 4 | Location + Weather + Contextual Awareness | Planned |
| 17 | 4 | Voice Interaction | Planned |
| 18 | 4 | Cloud Storage Sync | Planned |
| 19 | 4 | Full Financial Awareness | Planned (Premium) |
| 20 | 4 | Digital Representative + Subscription Cancellation | Planned (Premium) |
| 21 | 4 | Form & Bureaucracy Automation | Planned (Premium) |
| 22 | 4 | Health & Wellness | Planned (Premium) |
| 23 | 5 | Alter Ego End-to-End Verification | Planned |
| 24 | 5 | Privacy Dashboard + Proof of Privacy | Planned |
| 25 | 5 | OS Sandboxing + Reproducible Builds + Security Hardening | Planned |
| 26 | 5 | Mobile Feature Parity for Sprint 4 + Performance Optimization | Planned |
| 27 | 5 | Launch Preparation | Planned |

---

## Risk Assessment

### High Risk
- **Step 12 (Mobile):** MLX on iOS and llama.cpp on Android are relatively new for production. Model size constraints on mobile may limit capability. Mitigation: task routing sends heavy work to desktop; mobile handles classification and quick responses.
- **Step 17 (Voice):** Whisper.cpp + primary LLM coexistence requires careful memory management. TTS quality on local hardware needs validation. Mitigation: voice is additive, not critical path — degraded voice is better than no voice.

### Medium Risk
- **Step 11 (Style Learning):** 7B local model may not produce drafts that genuinely sound like the user. Style profile helps but there's a quality ceiling. Mitigation: style score visibility, correction feedback loop, and the 80%+ requirement for Alter Ego pushes quality.
- **Step 19 (Financial — Plaid):** Plaid requires developer account, API keys, real bank testing. Mitigation: CSV/OFX remains free-tier path; Plaid is premium add-on.
- **Step 25 (Reproducible Builds):** Achieving bit-identical builds across platforms is notoriously difficult. Mitigation: start with "deterministic build from same environment" and iterate toward full reproducibility.

### Low Risk
- **Steps 14–16 (Native Device):** Well-documented platform APIs. Permission flows are standard.
- **Step 18 (Cloud Storage):** Google Drive API is mature. OAuth flow is standard.
- **Steps 21–22 (Forms, Health):** PDF libraries and HealthKit are mature. Degrade gracefully.

---

## The Bar

Sprint 3 makes Semblance the best free AI assistant that exists. Sprint 4 makes it the intelligence layer of the user's device. Sprint 5 makes it bulletproof and ships it.

The product that launches must be exceptional. Not "good for a local AI." Not "impressive for open source." Exceptional. A user who tries Semblance should feel that this is what AI was supposed to be — personal, capable, transparent, and sovereign. Something that genuinely does not exist yet.

Nothing less.
