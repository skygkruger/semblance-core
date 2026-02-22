# Semblance — Build Map Elevation (Revision 4)

## Date: February 22, 2026
## Status: DRAFT — For Orbital Director Review
## Context: Sprint 3 closing (Step 13 in progress). 9 feature elevations to incorporate pre-launch.
## Baseline: SEMBLANCE_SPRINT_RESTRUCTURE.md (Revision 3) remains canonical for Steps 1–13 and Sprint 3 exit criteria. This document adds and restructures Steps 14–33 for Sprints 4–6.

---

## What Changed and Why

The current build map (Revision 3) has 27 steps across 5 sprints. The Orbital Director identified 9 features that must ship pre-launch because their differentiation and market impact justify the timeline extension. These aren't nice-to-haves — they're the features that make Semblance irreplaceable rather than just preferable.

**Shelved (not pre-launch):** Semblance Score — risk of feeling gamified, time-saved metric already serves the compounding-value function. May revisit post-launch.

**The 9 features to incorporate:**

| # | Feature | Complexity | New Infrastructure? |
|---|---------|-----------|-------------------|
| 1 | Proactive Morning Brief | Low | No — elevated daily digest + aggressive proactive engine |
| 2 | Alter Ego Week | Low | No — designed onboarding experience over existing features |
| 3 | Comparison Statement | Trivial | No — UI element showing indexed counts vs. cloud AI |
| 4 | Visual Knowledge Graph | Medium | Partial — visualization layer over existing knowledge graph |
| 5 | Import Everything Moment | Medium | Partial — new file parsers for browser history, notes, photos metadata |
| 6 | Living Will | Medium | Partial — export format + signing over existing data |
| 7 | Semblance Witness | Medium | Yes — attestation export, VTI bridge |
| 8 | Inheritance Protocol | Medium-High | Partial — pre-authorized action sequences + trusted party auth |
| 9 | Adversarial Self-Defense | Medium | Partial — new analysis prompts + dark pattern detection models |

**Principle:** Features are ordered by dependency and complexity. Low-infrastructure features slot into existing steps or adjacent steps. High-infrastructure features get dedicated steps. Nothing is crammed — every feature gets proper implementation, testing, and exit criteria.

---

## Sprint Structure (Revised)

| Sprint | Theme | Steps | New? |
|--------|-------|-------|------|
| 3 | Becomes Powerful (Free Product) | 9–13 | No change. In progress. |
| 4 | Becomes Part of You (Native + Premium) | 14–22 | Minor additions only |
| 5 | Becomes Permanent (Sovereignty + Trust) | 23–28 | **NEW SPRINT** — Living Will, Witness, Inheritance, Adversarial Defense |
| 6 | Becomes Undeniable (Hardening + Launch) | 29–33 | Renamed from old Sprint 5, absorbs polish + launch |

**Key change:** The old Sprint 5 ("Becomes Undeniable") splits into two sprints. The sovereignty/trust features (Living Will, Witness, Inheritance, Adversarial Defense) become their own Sprint 5 because they share infrastructure (attestation engine, export formats, cryptographic signing) and they represent a distinct product promise: permanence. The hardening and launch prep moves to Sprint 6.

This adds ~6 steps to the total build. At the current pace (averaging 1–2 steps per day with remediation), that's 3–6 additional days. Worth it for what these features represent.

---

## What Slots Into Existing Steps (No New Steps Required)

### Comparison Statement → Step 24 (Privacy Dashboard)

The Comparison Statement is a UI element: "Your Semblance has indexed 14,847 emails, 2,341 calendar events, 847 documents, and 6 months of financial history. When you open ChatGPT, it knows nothing."

This belongs in the Privacy Dashboard (Step 24, now renumbered to Step 30). It's also surfaced in the weekly digest. Implementation: query knowledge graph for indexed counts by category, format as a comparison card. A few hours of work inside an existing step.

**Added to Step 30 (formerly Step 24) exit criteria:**
- Comparison Statement shows accurate indexed data counts
- Comparison Statement appears in Privacy Dashboard and weekly digest
- Counts update automatically as data is indexed

### Proactive Morning Brief → Elevation of Step 13 Daily Digest + Step 23 Alter Ego Verification

The daily digest in Step 13 delivers the data. The Morning Brief is the designed elevation — not "here's what happened" but "here's what's coming and what you need to know." The difference is:

- Digest: "6 emails handled, 1 meeting prepped. Time saved: 25 min."
- Morning Brief: "You have 3 meetings today. The 2pm with Sarah — she mentioned the Portland contract was stalled on legal. David is waiting on the proposal (6 days). Weather turns bad at 3pm, leave for your 4pm by 3:15."

Step 13's daily digest lays the foundation. The full Morning Brief requires the proactive engine to run aggressively — pulling calendar context, email thread analysis, weather data (Step 16), and relationship context (Step 14). The Morning Brief reaches full power after Sprint 4's native integration steps land.

**Plan:**
- Step 13: Ships daily digest as specced (action counts + time saved). Foundation.
- Step 23 (Alter Ego Verification): Elevates to full Morning Brief using all Sprint 4 data sources. Named experience: "Morning Brief." Configurable delivery time. This is where the proactive engine is tuned to its most aggressive and useful configuration.

### Alter Ego Week → Step 23 (Alter Ego End-to-End Verification)

Step 23 is already "Alter Ego End-to-End Verification." The Alter Ego Week is the designed onboarding experience that makes that verification meaningful — a structured 7-day trust-building sequence:

- Day 1: Email triage (Semblance categorizes all email, shows results)
- Day 2: Calendar management (Semblance resolves a conflict, preps a meeting)
- Day 3: Financial awareness (Semblance surfaces subscription findings)
- Day 4: Style-matched drafting (Semblance drafts a reply in user's voice)
- Day 5: Web research (Semblance proactively researches tomorrow's meeting topics)
- Day 6: Multi-domain autonomy (Semblance handles email + calendar + reminders together)
- Day 7: Full Alter Ego activation offer — "You've seen what I can do. Ready to let me run?"

Each day demonstrates capability, shows the audit trail, and builds trust. By day 7 the escalation to Alter Ego feels earned. This is layered over existing features — no new infrastructure, just a designed progression.

**Added to Step 23 exit criteria:**
- Alter Ego Week 7-day sequence fully designed and implemented
- Each day's demonstration uses real user data and real actions
- Day 7 escalation prompt converts meaningfully higher than unguided escalation
- Alter Ego Week can be replayed or skipped by the user
- Morning Brief at full power (all Sprint 4 data sources integrated)

---

## New Steps Required

### Step 23 (REVISED) — Alter Ego Verification + Morning Brief + Alter Ego Week

**Builds on:** All Sprint 4 steps

**Deliverables:**
- Everything from the original Step 23 (Alter Ego end-to-end verification)
- Morning Brief: full proactive daily briefing using all data sources (email, calendar, contacts, weather, financial, relationship context). Named experience. Configurable delivery time. More than a digest — a briefing that anticipates your day.
- Alter Ego Week: 7-day guided trust-building sequence. Each day demonstrates one autonomous capability domain. Day 7 offers full Alter Ego activation.
- Morning Brief on mobile: notification + deep link to brief view.

**Exit Criteria (updated):**
1. All original Step 23 criteria (Alter Ego end-to-end verification)
2. Morning Brief generates with calendar context, relationship context, weather, and proactive insights
3. Morning Brief delivers at configured time on desktop and mobile
4. Alter Ego Week 7-day sequence implemented with daily demonstrations
5. Day 7 activation prompt functional
6. Alter Ego Week can be skipped or replayed
7. 50+ new tests. All existing tests pass.

---

### Step 24 (NEW) — Visual Knowledge Graph

**Builds on:** Step 14 (Contacts + Relationship Intelligence), Knowledge Graph (Sprint 1)

**Rationale:** The Knowledge Moment is powerful but happens in chat. Users can feel compound knowledge but they can't see it. A visual knowledge graph — showing contacts, topics, connections, and activity patterns — gives users something to show others. "Look what it knows about my life" as a visual is shareable in a way that chat conversations are not.

**Deliverables:**
- Interactive visualization of the user's knowledge graph
- Nodes: people (from contacts + email), topics (from semantic clustering), documents, calendar events
- Edges: relationships between entities (Sarah ↔ Portland Contract ↔ Legal Review)
- Visual clusters by domain (work, personal, finance, health)
- Time slider: see how your knowledge graph has grown over time
- Tap any node to see related context (emails, documents, events involving that entity)
- Statistics overlay: total entities, connections, growth rate
- Exportable as image (for sharing)
- Desktop and mobile responsive views

**Technology:**
- D3.js or similar force-directed graph library for desktop (Tauri webview)
- React Native compatible graph library for mobile (react-native-svg or WebView-based)
- Data source: existing knowledge graph entities + relationship mappings from Step 14
- No new data collection — purely visualization of existing indexed data

**Exit Criteria:**
1. Knowledge graph visualization renders with real user data
2. Nodes represent actual entities from knowledge graph (people, topics, documents)
3. Edges show real relationships extracted from data
4. Time slider shows graph growth over time
5. Node tap shows relevant context
6. Visualization works on desktop and mobile
7. Graph exportable as image
8. 25+ new tests. All existing tests pass.

---

### Step 25 (NEW) — Import Everything Moment + Adversarial Self-Defense

**Builds on:** Step 18 (Cloud Storage Sync), File Indexer (Sprint 1), Financial Intelligence (Step 19)

**Rationale for bundling:** Both features deepen what Semblance knows about the user and how it acts on that knowledge. Import Everything expands the data surface. Adversarial Self-Defense turns that expanded data surface into protective action.

**Import Everything Moment:**
- One-time "Import Your Digital Life" flow in Settings → Data Sources
- New data source parsers:
  - **Browser history:** Import from Chrome, Firefox, Safari (exported JSON/SQLite). Index URLs, titles, timestamps. Semantic search across browsing history. Privacy note: processed locally, originals deletable after indexing.
  - **Notes apps:** Import from Apple Notes (exported), Google Keep (exported), Notion (exported), Obsidian (direct folder). Index text, tags, dates.
  - **Photos metadata:** EXIF data from photo library (NOT the images themselves — just location, timestamp, camera, album names). Enables: "Where was I last Tuesday?" and "Show me photos from the Portland trip" via metadata correlation.
  - **Messaging history:** Import from iMessage (macOS SQLite), WhatsApp (exported), Signal (exported). Index messages for relationship context and communication pattern analysis.
- Each import source has a clear consent card explaining what's accessed and confirming local-only processing
- Import progress tracking with estimated time
- All imported data feeds into the existing embedding pipeline and knowledge graph
- Knowledge Moment re-fires after significant import (demonstrates compound knowledge from new data)

**Adversarial Self-Defense:**
- **Dark pattern detection:** Semblance analyzes emails and notifications for manipulation patterns — artificial urgency ("LAST CHANCE!"), loss framing, pre-checked renewals, deliberately confusing cancellation flows. Flags them in the inbox with a shield icon and explanation.
- **Financial advocacy:** For each detected subscription and recurring charge, Semblance calculates the actual value-to-cost ratio based on usage patterns. "You pay $14.99/mo for this service. You've used it twice in 6 months. Annual cost: $180. Estimated value: $12." Surfaces in the financial dashboard.
- **Manipulative content flagging:** Emails designed to create anxiety or FOMO are flagged with a calm, factual reframe. "This email uses urgency language ('act now', 'last chance') to pressure a purchase decision. The offer has been 'ending soon' for 3 weeks."
- **Opt-out autopilot (Alter Ego mode):** In Alter Ego mode, Semblance proactively navigates opt-out flows, unsubscribes from manipulative email lists, and cancels services that score below a value threshold (with undo window).

**Exit Criteria:**
1. Browser history import works for Chrome and Firefox export formats
2. Notes import works for at least 2 formats (Apple Notes export, Obsidian folder)
3. Photos metadata extraction works (EXIF → knowledge graph entities)
4. Messaging import works for at least 1 format
5. All imported data generates embeddings and is searchable
6. Knowledge Moment re-fires after significant import
7. Dark pattern detection flags urgency/manipulation emails
8. Financial value-to-cost ratio surfaces for subscriptions
9. Manipulative content flagging works with factual reframe
10. Alter Ego opt-out autopilot functional with undo window
11. All imports visible in Network Monitor (data stays local, audit trail shows processing)
12. 60+ new tests. All existing tests pass. Privacy audit clean.

---

## Sprint 5 — Becomes Permanent (Sovereignty + Trust)

**Theme:** These features make Semblance permanent, trusted, and irreplaceable. They transform the sovereignty promise from an architectural claim into a tangible, exportable, verifiable, and inheritable reality. No cloud AI can offer any of these — not because of technical limitations, but because their business models depend on the exact dynamics these features destroy.

---

### Step 26 (NEW) — Living Will + Semblance Witness

**Builds on:** Audit Trail (Sprint 1), Action Signing (Sprint 1), Style Profile (Step 11), Knowledge Graph (all sprints), VTI architecture

**Rationale for bundling:** Both features share cryptographic infrastructure — export format design, attestation signing, verification mechanisms. Building them together ensures a unified attestation approach that connects directly to VTI.

**Living Will:**

The Living Will is a structured, exportable, cryptographically signed document that contains your complete digital twin in a portable format.

- **Export format:** Encrypted archive (.semblance file) containing:
  - Knowledge graph snapshot (entities, relationships, embeddings — not raw email/documents, but the semantic understanding derived from them)
  - Style profile (communication patterns, vocabulary, tone)
  - Decision pattern profile (how you prioritize, what you value, recurring decision patterns)
  - Relationship map (contacts, interaction frequency, relationship context)
  - Preference manifest (autonomy settings, domain configurations, learned preferences)
  - Action history summary (categories of actions taken, not individual audit trail entries)
  - Cryptographic signature chain proving provenance and integrity
- **Encryption:** AES-256-GCM. User sets a passphrase. The passphrase never leaves the device.
- **Portability:** The .semblance file can be imported into any future Semblance instance on any device to restore full digital twin continuity. Device migration becomes: export → install on new device → import → continuity.
- **Scheduled exports:** User can configure automatic Living Will generation (weekly, monthly) stored in a designated location.
- **Selective export:** User can choose which aspects to include/exclude (e.g., export style profile and relationship map but not financial data).
- **UI:** Settings → Your Digital Twin → Living Will. Clear explanation of what's included. Export button. Scheduled export toggle.

**Semblance Witness:**

Cryptographically signed, shareable attestations that specific actions were taken by your AI twin autonomously.

- **Attestation format:** JSON-LD structure containing:
  - Action type and summary (not full payload — privacy preserved)
  - Timestamp
  - Autonomy tier at time of action
  - Device identity (from hardware attestation if available, keypair otherwise)
  - Cryptographic signature (same signing infrastructure as audit trail)
  - Optional: Veridian Trust Infrastructure chain (links to VTI Registry when available)
- **Generation:** Any action in the audit trail can generate a Witness attestation. User selects an action → "Create Witness" → signed attestation produced.
- **Verification:** Anyone with the attestation and the user's public key can verify it was created by that user's Semblance instance. Verification is deterministic and requires no server.
- **Use cases:**
  - Email sent by Alter Ego: recipient can verify it was an authorized AI action
  - Subscription cancellation: attestation is proof of cancellation request
  - Any autonomous action: cryptographic proof of what happened, when, by whose AI
- **VTI bridge:** Witness attestations follow VTI attestation format. When VTI Registry is live, attestations can optionally be registered. This makes Semblance the first consumer application producing VTI-compatible attestations.
- **UI:** Audit trail → any action → "Create Witness" button → attestation card with share/export options.

**Exit Criteria:**
1. Living Will export generates valid .semblance archive
2. Living Will import restores digital twin on fresh Semblance instance
3. Scheduled export works on configured cadence
4. Selective export includes/excludes chosen categories
5. Living Will encryption uses AES-256-GCM with user passphrase
6. Semblance Witness generates signed attestation for any audit trail action
7. Witness attestation is verifiable with public key (no server required)
8. Witness attestation format is VTI-compatible (JSON-LD, standard signing)
9. Witness UI accessible from audit trail with share/export options
10. 50+ new tests. All existing tests pass. Privacy audit clean.

---

### Step 27 (NEW) — Inheritance Protocol

**Builds on:** Living Will (Step 26), Alter Ego (Step 23), Action Signing (Sprint 1)

**Deliverables:**

The Inheritance Protocol is a pre-authorized set of actions that Semblance executes on the user's behalf when activated by a designated trusted party.

- **Configuration UI:** Settings → Your Digital Twin → Inheritance Protocol
  - Designate trusted parties (name, email, relationship)
  - For each trusted party: generate a cryptographically secured activation package
  - Activation package: encrypted with the trusted party's passphrase (set during designation)
  - Define pre-authorized actions per trusted party:
    - Notification list: people to contact, message templates (drafted in user's voice via style profile)
    - Account actions: subscriptions to cancel, services to notify
    - Data sharing: which aspects of the Living Will to share with which parties
    - Preservation: what to archive permanently, what to delete
  - All pre-authorized actions are reviewable and editable by the user at any time
  - "Test run" mode: simulate the protocol without executing (shows what would happen)

- **Activation flow:**
  1. Trusted party presents activation package to a Semblance instance
  2. Trusted party enters their passphrase
  3. Package authenticates and Semblance enters Inheritance Mode
  4. Pre-authorized actions execute in sequence with full audit trail
  5. Notifications sent in user's voice using style profile
  6. Each action generates a Witness attestation for the record

- **Safety guardrails:**
  - Activation requires the cryptographic package AND the passphrase — neither alone is sufficient
  - Time-lock option: protocol doesn't execute until X days after activation (allows cancellation if activated in error)
  - Action-by-action confirmation mode: trusted party can choose to approve each action individually instead of batch execution
  - Complete audit trail of all Inheritance Protocol actions
  - Inheritance Protocol cannot modify the Living Will or the protocol itself (read-execute only)

- **Style-matched notifications:**
  - When Semblance notifies contacts on the user's behalf, it uses the style profile to draft messages that sound like the user
  - Each message is pre-drafted and stored — the user can review and edit any message before they're needed
  - Messages are NOT sent during test runs

**Exit Criteria:**
1. Trusted party designation flow complete with cryptographic package generation
2. Pre-authorized actions configurable per trusted party
3. Notification templates drafted in user's voice via style profile
4. Activation flow works: package + passphrase → Inheritance Mode → actions execute
5. Test run mode simulates without executing
6. Time-lock option delays execution
7. Action-by-action confirmation mode works
8. Every Inheritance action generates a Witness attestation
9. Audit trail captures complete Inheritance Protocol execution
10. Inheritance Protocol cannot modify Living Will or itself (security test)
11. 40+ new tests. All existing tests pass. Privacy audit clean.

---

### Step 28 (NEW) — Semblance Network (Local Consensual Sharing)

**Builds on:** mDNS Discovery (Step 12), Encrypted Sync (Step 12), Witness (Step 26), Relationship Intelligence (Step 14)

**Deliverables:**

Peer-to-peer contextual sharing between Semblance instances with explicit, granular, revocable consent.

- **Sharing model:**
  - Default: zero sharing. Every sharing relationship is a deliberate opt-in choice.
  - Granularity: share specific context categories (calendar availability, communication style awareness, project context, topic expertise)
  - NOT shared: credentials, raw data, financial information, health data, full knowledge graph
  - Every sharing choice is visible to both parties at all times
  - Revocation: instant. Revoke any sharing relationship or specific category at any time. Revocation deletes shared context from the other party's instance.

- **Connection flow:**
  1. Both users are on the same local network (mDNS discovery) OR exchange connection codes (for remote)
  2. User A initiates sharing request to User B
  3. User B sees request with clear description of what's being shared
  4. User B accepts → encrypted channel established
  5. Shared context syncs as configured
  6. Both audit trails record the sharing relationship and all context exchanges

- **Use cases:**
  - **Scheduling:** Both AIs know both parties' real availability → scheduling that actually works
  - **Meeting prep:** Both AIs provide their human's relevant context before a shared meeting
  - **Follow-ups:** Both AIs track shared commitments → nothing drops
  - **Delegation:** "Ask Sarah's Semblance if she's available Tuesday" — your AI asks her AI directly

- **Transport:**
  - Local network: direct encrypted TCP (reuses Step 12 sync infrastructure)
  - Remote: encrypted relay via a Veridian relay server (optional, user opt-in)
  - Relay is stateless — encrypted payloads pass through, relay cannot read contents
  - All sharing visible in Network Monitor with full audit trail

- **Privacy safeguards:**
  - Shared context is stored separately from the user's own knowledge graph
  - Clear visual distinction in UI between "my data" and "shared context"
  - Sharing never automatic — always explicitly configured per relationship per category
  - Audit trail shows exactly what was shared, when, with whom, and what it was used for
  - Consent attestations generated as Witness attestations (for both parties' records)

**Exit Criteria:**
1. Sharing request → acceptance flow works on local network
2. Connection code exchange works for remote connections
3. Granular sharing: can share calendar availability without sharing other data
4. Revocation: instant, deletes shared context from other party
5. Shared context stored separately from own knowledge graph
6. Scheduling with shared context demonstrably better than without
7. All sharing visible in both parties' Network Monitors
8. Consent attestations generated as Witness attestations
9. Relay server (if implemented) is stateless — cannot read payloads
10. 50+ new tests. All existing tests pass. Privacy audit clean.

---

## Sprint 6 — Becomes Undeniable (Hardening + Launch)

Renumbered from old Sprint 5. All original Steps 24–27 renumbered to 29–33.

### Step 29 — Privacy Dashboard + Proof of Privacy + Comparison Statement

*Formerly Step 24.* All original deliverables plus:
- **Comparison Statement:** "Your Semblance has indexed X emails, Y events, Z documents. Cloud AI knows nothing." In Privacy Dashboard and weekly digest.
- **Privacy Dashboard as a statement:** Beautiful, not just functional. The Proof of Privacy report should look like something you'd want to share. Designed artifact, not a data dump.

### Step 30 — OS Sandboxing + Reproducible Builds + Security Hardening

*Formerly Step 25.* No changes to scope.

### Step 31 — Mobile Feature Parity for All Sprints + Performance Optimization

*Formerly Step 26.* Scope expanded to include mobile parity for Sprint 5 features (Living Will export, Witness attestation viewing, Inheritance Protocol configuration, Network sharing controls, Visual Knowledge Graph, Adversarial Defense UI).

### Step 32 — Launch Preparation

*Formerly Step 27.* No changes to scope, but marketing materials now include Living Will, Witness, Inheritance Protocol, and Adversarial Self-Defense in the product narrative.

### Step 33 — Final Validation + Ship

**NEW step.** Final end-to-end validation with all features from all sprints.
- Fresh-install journey test covering every sprint's exit criteria
- All platforms: macOS, Windows, Linux, iOS, Android
- Performance validation on all hardware profiles
- Privacy audit: final comprehensive scan
- Security audit: final Gemini review
- Ship.

---

## Complete Step Index (Revised)

| Step | Sprint | Name | Status |
|------|--------|------|--------|
| 1–8 | 1–2 | Sprint 1 + Sprint 2 | ✅ COMPLETE |
| 9 | 3 | Runtime Ownership + Embedding Pipeline | ✅ COMPLETE |
| 10 | 3 | Web Search + Web Fetch + Reminders + Quick Capture | ✅ COMPLETE |
| 11 | 3 | Communication Style Learning | ✅ COMPLETE |
| 12 | 3 | Mobile Feature Parity + Task Routing | ✅ COMPLETE (remediated) |
| 13 | 3 | Daily Digest + Chat-About-Document + Sprint 3 Validation | 🔄 NEXT |
| 14 | 4 | Native Contacts + Relationship Intelligence | Planned |
| 15 | 4 | SMS/Messaging + Clipboard Intelligence | Planned |
| 16 | 4 | Location + Weather + Contextual Awareness | Planned |
| 17 | 4 | Voice Interaction | Planned |
| 18 | 4 | Cloud Storage Sync | Planned |
| 19 | 4 | Full Financial Awareness | Planned (Premium) |
| 20 | 4 | Digital Representative + Subscription Cancellation | Planned (Premium) |
| 21 | 4 | Form & Bureaucracy Automation | Planned (Premium) |
| 22 | 4 | Health & Wellness | Planned (Premium) |
| 23 | 5 | Alter Ego Verification + Morning Brief + Alter Ego Week | Planned (REVISED) |
| 24 | 5 | Visual Knowledge Graph | Planned (NEW) |
| 25 | 5 | Import Everything + Adversarial Self-Defense | Planned (NEW) |
| 26 | 5 | Living Will + Semblance Witness | Planned (NEW) |
| 27 | 5 | Inheritance Protocol | Planned (NEW) |
| 28 | 5 | Semblance Network | Planned (NEW) |
| 29 | 6 | Privacy Dashboard + Proof of Privacy + Comparison Statement | Planned (REVISED) |
| 30 | 6 | OS Sandboxing + Reproducible Builds + Security Hardening | Planned |
| 31 | 6 | Mobile Feature Parity for All Sprints + Performance | Planned (REVISED) |
| 32 | 6 | Launch Preparation | Planned |
| 33 | 6 | Final Validation + Ship | Planned (NEW) |

---

## Test Count Projections

| Sprint | Steps | Estimated Tests | Cumulative |
|--------|-------|----------------|------------|
| 3 | 9–13 | ~2,700 at close | ~2,700 |
| 4 | 14–22 | +500–600 | ~3,200–3,300 |
| 5 | 23–28 | +300–400 | ~3,500–3,700 |
| 6 | 29–33 | +300–400 | ~3,800–4,100 |

**Final test target: 3,800–4,100.**

---

## Risk Assessment (New Features)

### Medium-High Risk
- **Step 28 (Semblance Network):** Peer-to-peer sharing with consent management is architecturally complex. The relay server for remote connections adds infrastructure. Mitigation: local-network-only in v1, relay as stretch goal. The feature is valuable even without remote connectivity.

### Medium Risk
- **Step 25 (Import Everything):** Browser history and messaging formats vary widely. Each import source is a parser that may need updating as formats change. Mitigation: ship with 2–3 best-supported formats per category, expand post-launch.
- **Step 27 (Inheritance Protocol):** Legal and ethical considerations around posthumous AI actions. Mitigation: conservative defaults (notification-only, no financial actions), time-lock, action-by-action confirmation mode.
- **Step 25 (Adversarial Self-Defense):** Dark pattern detection depends on LLM reasoning quality. False positives (flagging legitimate urgency emails) could erode trust. Mitigation: conservative threshold, "why this was flagged" explanations, user can dismiss flags.

### Low Risk
- **Step 23 (Morning Brief + Alter Ego Week):** No new infrastructure. Designed experience over existing features.
- **Step 24 (Visual Knowledge Graph):** Visualization of existing data. D3.js is mature.
- **Step 26 (Living Will):** Export format over existing data. Cryptographic signing already built.
- **Step 26 (Semblance Witness):** Attestation format over existing audit trail. Signing already built.

---

## Sprint 5 Ordering Rationale

Step 23 (Alter Ego + Morning Brief) comes first because it consumes all Sprint 4 data sources and validates them end-to-end.

Step 24 (Visual Knowledge Graph) comes second because it visualizes the knowledge graph that has been populated by all prior sprints.

Step 25 (Import Everything + Adversarial Defense) comes third because it expands the data surface and adds protective analysis — both of which make the knowledge graph richer and the Living Will more comprehensive.

Step 26 (Living Will + Witness) comes fourth because it exports the now-complete digital twin with cryptographic signing.

Step 27 (Inheritance Protocol) comes fifth because it builds on Living Will's export format and Witness's attestation infrastructure.

Step 28 (Semblance Network) comes last in Sprint 5 because it's the highest-complexity feature and benefits from all prior infrastructure being stable.

---

## What This Means for Launch

The original build had 27 steps. This revision has 33 steps. At the pace we've maintained (averaging ~1.5 steps per day including remediation), the additional 6 steps add approximately 4 days to the timeline.

What you get for those 4 days:

- A product that is not just useful but **permanent** — your digital twin survives any device, any version, any company
- A product that is not just private but **verifiable** — every autonomous action has cryptographic proof
- A product that is not just smart but **protective** — actively defending you against systems designed to exploit you
- A product that is not just personal but **social** — voluntarily shareable with people you trust
- A product that doesn't just work but **endures** — your digital life can be preserved and transferred

No cloud AI company can build any of these. Not because of technical limitations. Because their business models depend on the dynamics these features destroy.

That's worth 4 days.
