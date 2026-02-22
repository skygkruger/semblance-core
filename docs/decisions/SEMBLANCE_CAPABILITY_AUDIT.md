# Semblance — Capability Audit (Revision 1)

## Date: February 21, 2026
## Purpose: Comprehensive review of planned capabilities vs cloud AI user expectations
## Status: CANONICAL — Approved by Orbital Directors. Feed to Claude Code for codebase verification.

---

## How to Read This Document

**Section 1:** Everything Semblance CAN do at launch (planned across Sprints 1–4).
**Section 2:** Everything Semblance CANNOT do at launch — and why.
**Section 3:** The gap analysis — where a ChatGPT/Claude user would feel the product is inferior and potentially abandon it.
**Section 4:** Decisions locked by Orbital Directors.
**Section 5:** The "ChatGPT Refugee" test — a day-by-day scenario.

The standard is: a user who currently uses ChatGPT/Claude daily must feel that Semblance is **at least comparable for their daily workflows, and demonstrably superior in areas that matter to their life.** They should never hit a wall where they think "I need to go back to ChatGPT for this."

The strategic frame is: **Semblance is not an app. It is the intelligence layer of the user's device.** It unifies native hardware capabilities — messaging, weather, contacts, location, health, files, clipboard — through autonomy, transparency, and capability. Cloud AI is a chatbot in a browser tab. Semblance is woven into the device itself.

---

## Section 1: What Semblance CAN Do at Launch

### 1.1 — Personal Intelligence (THE MOAT — Cloud AI Cannot Do This)

| Capability | Sprint | Description |
|------------|--------|-------------|
| **Compound Knowledge** | 2 | Cross-references email + calendar + files + contacts to surface insights no one asked for. "You have a meeting with Sarah tomorrow — here are the 3 emails and the contract relevant to it." |
| **Knowledge Moment** | 2 | Within 5 minutes of connecting data sources, demonstrates understanding of the user's life that cloud AI cannot replicate. |
| **Semantic Search Across Everything** | 3 (Step 9) | "Find the contract Sarah sent about Portland" works across emails, files, and calendar using meaning, not keywords. |
| **Relationship Awareness** | 4 | Understands who you communicate with, how often, relationship dynamics. Birthday tracking, contact frequency, relationship health. Fed by native contacts API. |
| **Pattern Recognition** | 3–4 | Learns your habits, preferences, decision patterns. Gets better at being you over time. |
| **Time-Saved Tracking** | 2 | Quantifies value: "I saved you 4 hours 15 minutes this week." No cloud AI does this. |

### 1.2 — Email Management

| Capability | Sprint | Description |
|------------|--------|-------------|
| **Email Triage** | 2 | Reads, categorizes, prioritizes all incoming email. |
| **Autonomous Email Actions** | 2 | In Partner/Alter Ego mode: responds to routine emails, archives low-priority, drafts replies to substantive messages. |
| **Email Drafting in User's Voice** | 3 (Step 11) | Communication style learning analyzes sent emails, builds style profile, drafts new emails that sound like the user. |
| **Follow-up Tracking** | 2 | "You haven't heard back from David in 5 days about the proposal." |
| **Subscription Cancellation via Email** | 3 (Step 11) | In Alter Ego mode, drafts and sends cancellation emails for forgotten subscriptions. |

### 1.3 — Calendar Management

| Capability | Sprint | Description |
|------------|--------|-------------|
| **Calendar Intelligence** | 2 | Reads all calendar events, understands scheduling patterns. |
| **Conflict Resolution** | 2 | Proactively detects and resolves scheduling conflicts. |
| **Meeting Prep** | 2 | Auto-generates prep materials: attendee history, relevant emails, related documents, draft agenda. |
| **Autonomous Scheduling** | 2 | In Partner/Alter Ego mode: handles scheduling requests, sends invites, reschedules. |

### 1.4 — Financial Awareness

| Capability | Sprint | Description |
|------------|--------|-------------|
| **Subscription Detection** | 2 | Identifies recurring charges from bank statements (CSV/OFX). Flags forgotten subscriptions with annual cost. |
| **Transaction Categorization** | 3 (Step 10) | Classifies every transaction: food, transport, entertainment, utilities, income, etc. |
| **Spending Insights** | 3 (Step 10) | Monthly breakdown, trends, month-over-month comparison. "You spent 40% more on dining out this month." |
| **Anomaly Detection** | 3 (Step 10) | Flags unusual charges by amount, merchant, or pattern. |
| **Plaid Integration** | 3 (Step 10) | Premium: real-time bank connection for automatic transaction import. |

### 1.5 — Form & Bureaucracy Automation

| Capability | Sprint | Description |
|------------|--------|-------------|
| **PDF Form Auto-Fill** | 3 (Step 12) | Detects fillable PDF fields, maps to knowledge graph data, auto-fills. |
| **Template Recognition** | 3 (Step 12) | Pre-built mappings for expense reports, PTO requests, W-4, insurance claims. |
| **Smart Field Mapping** | 3 (Step 12) | LLM maps ambiguous labels to user data. "Employer name" → extracts from email signature. |
| **Bureaucracy Tracking** | 3 (Step 12) | "You submitted your insurance claim 14 days ago. Typical processing: 30 days. I'll remind you." |

### 1.6 — Health & Wellness

| Capability | Sprint | Description |
|------------|--------|-------------|
| **Apple Health Import** | 3 (Step 13) | Steps, sleep, heart rate, workouts — all stored locally via HealthKit API. |
| **Manual Health Entries** | 3 (Step 13) | Mood, energy, symptoms, medication tracking with quick-entry UI. |
| **Pattern Correlation** | 3 (Step 13) | "Your sleep drops 40% during weeks with 3+ evening meetings." Statistical, not hallucinated. |
| **Proactive Health Insights** | 3 (Step 13) | "You have 4 evening meetings this week — historically bad for your sleep." |

### 1.7 — Web Intelligence (Locked Feb 21, 2026)

| Capability | Sprint | Description |
|------------|--------|-------------|
| **Web Search** | 3 (post Step 9) | General knowledge questions, current events, real-time info. Brave Search API default. SearXNG optional for power users. Knowledge-graph-first routing: Semblance checks local data before searching the web. |
| **Web Fetch / URL Reading** | 3 (post Step 9) | "Summarize this article: [URL]." Gateway adapter fetches page text, AI processes locally. User sees every fetch in Network Monitor. |

### 1.8 — Native Device Integration (Locked Feb 21, 2026)

| Capability | Sprint | Description |
|------------|--------|-------------|
| **SMS / Messaging** | 4 | iOS: `MFMessageComposeViewController` pre-fills recipient + body, user taps Send (Apple restriction). Android: full SMS API with read + send capability. Partner mode drafts; Alter Ego pre-fills and prompts. "I've drafted a text to Sarah confirming Tuesday pickup — tap to send." |
| **Native Contacts** | 4 | Reads device contact list (with permission) to enrich the relationship graph — names, phone numbers, emails, birthdays. Feeds Relationship Intelligence. No Gateway involvement, pure local data. |
| **Weather (iOS WeatherKit)** | 4 | iOS: WeatherKit provides local forecast data — no third-party API, no Gateway, pure device capability. Android + desktop: web search adapter handles weather queries. Enables proactive insights: "Rain expected during your 2pm outdoor meeting." |
| **Location-Aware Intelligence** | 4 | With permission, contextual awareness: "You're near the hardware store — you wanted to pick up lightbulbs." Commute-aware scheduling: "Your meeting is at 2pm, traffic is heavy — leave by 1:15." Location stored locally, never transmitted. |
| **Clipboard Intelligence** | 4 | With permission, monitors clipboard for actionable content. User copies a tracking number → Semblance tracks the package. Copies a flight confirmation → adds to calendar. Copies an address → offers directions. Ambient intelligence that makes Semblance feel woven into the device. |
| **Voice Interaction** | 4 | Whisper.cpp for local speech-to-text. Piper or Coqui TTS for text-to-speech. Both run through the native runtime — no cloud APIs. Full voice conversation with the AI. Mobile mic/speaker integration. |
| **Reminders + Quick Capture** | 3 or 4 | "Remind me to call the dentist at 3pm." "Note: Sarah's kid is named Oliver." SQLite storage, proactive engine integration, system notifications. Quick-capture widget (mobile) and system tray (desktop). |
| **Cloud Storage Sync** | 4 | Google Drive / Dropbox / OneDrive Gateway adapters. Files downloaded locally → indexed into knowledge graph → searchable via semantic search. The user's cloud documents become part of their local knowledge. Google Drive first (largest user base). |

### 1.9 — Autonomy & Trust

| Capability | Sprint | Description |
|------------|--------|-------------|
| **Three Autonomy Tiers** | 1–2 | Guardian (approve everything), Partner (routine auto, novel asks), Alter Ego (fully autonomous). |
| **Per-Domain Configuration** | 3 (Step 15) | Different autonomy per domain: Partner for email, Guardian for finance, Alter Ego for calendar. |
| **Universal Action Log** | 1 | Every action logged, reviewable, reversible. Full context: what, why, what data was used. |
| **Autonomy Escalation** | 2 | After consistent approvals, suggests granting more autonomy. Active, not buried in settings. |
| **Daily + Weekly Digest** | 2–3 | Concrete action summary with time-saved metrics. |

### 1.10 — Privacy & Trust Infrastructure

| Capability | Sprint | Description |
|------------|--------|-------------|
| **Network Monitor** | 2 | Real-time display of every outbound connection. Always visible. |
| **Zero-Network AI Core** | 1 | The AI process literally cannot access the internet. OS-level enforcement. |
| **Audit Trail** | 1 | Tamper-evident, append-only log of every Gateway action. Cryptographically signed. |
| **Privacy Dashboard** | 4 | Full visualization, Proof of Privacy report, data export/wipe. |

### 1.11 — Platform

| Capability | Sprint | Description |
|------------|--------|-------------|
| **Desktop App** | 1 | Tauri 2.0. macOS, Windows, Linux. |
| **Mobile App** | 3–4 (Step 14) | React Native. iOS and Android. On-device inference. |
| **Cross-Device Sync** | 3 (Step 14) | Local network sync. Action trail, preferences, autonomy settings. No cloud relay. |
| **Task Routing** | 3 (Step 14) | Heavy inference routes to desktop, quick tasks stay on mobile. Invisible to user. |
| **Zero-Config Onboarding** | 3 (Step 9) | Download, open, name your AI, working in 5 minutes. No terminal, no Ollama. |

---

## Section 2: What Semblance CANNOT Do at Launch

### 2.1 — Conversational AI Constraints

| Constraint | Severity | Notes |
|------------|----------|-------|
| **Multi-turn conversational depth** | 🟡 MEDIUM | 7B local model is competent but not GPT-4/Claude-level for extended reasoning, nuanced analysis, or creative writing. Fundamental hardware constraint. Compensated by specialization — Semblance doesn't need to write novels, it needs to manage your life. |
| **Context window** | 🟡 MEDIUM | Local models: 4K-32K vs cloud 128K-200K. Long document analysis hits this wall. Mitigated by chunking + semantic search — the knowledge graph handles what the context window cannot. |
| **Speed on constrained hardware** | 🟡 MEDIUM | CPU-only: 10-30 tok/s. Mitigated by tiered routing (classification is fast) and background processing (drafts ready before you ask). |

### 2.2 — Not in Launch Scope

| Gap | Severity | Notes |
|-----|----------|-------|
| **Slack / Teams** | 🟡 MEDIUM | First post-launch integration priority. Gateway adapter pattern applies. |
| **Image generation** | 🟢 LOW | Not core to the value proposition. Post-launch via local Stable Diffusion if demand warrants. |
| **Image understanding / vision** | 🟡 MEDIUM | Post-launch via multimodal GGUF models (LLaVA). Would enable receipt scanning, screenshot analysis. |
| **Advanced code generation** | 🟢 LOW | Not the target user. Basic code handled by local model. |
| **Browser extension** | 🟡 MEDIUM | Would enable web form filling, page context. Post-launch. |
| **Social media** | 🟢 LOW | Not core. |
| **Smart home / IoT** | 🟢 LOW | Post-launch ecosystem play. |
| **Screen Time correlation** | 🟢 LOW | iOS API. Post-launch polish. |
| **iMessage full automation** | 🟡 MEDIUM | Apple restricts send to require user tap. Cannot be fully autonomous on iOS. Android has no restriction. |

---

## Section 3: Abandon Risk Ranking

Ranked by likelihood of causing a user to think "I need to go back to ChatGPT."

### 🔴 CRITICAL — Resolved

**1. Web Search + Web Fetch** — RESOLVED. Locked Feb 21.

### 🟡 HIGH PRIORITY — Scheduled for Launch

**2. Native Device Integration Suite (Sprint 4)**
The difference between "an app" and "the intelligence layer of my device." SMS, contacts, weather, location, clipboard, voice. Cloud AI cannot access any of these. This is the unconquerable moat.

**3. Voice Interaction (Sprint 4)**
ChatGPT Advanced Voice Mode normalized talking to AI. Whisper.cpp + local TTS. "Your voice never leaves your device."

**4. Cloud Storage Sync (Sprint 4)**
Documents in Google Drive are invisible without this. Gateway adapters download locally, index, search.

**5. Reminders + Quick Capture (Sprint 3 or 4)**
The most frequent micro-interaction with AI assistants. Without it, users keep Siri/Google Assistant.

**6. Chat-About-Document UX (Sprint 3 or 4)**
Drag PDF into chat, ask questions. Infrastructure exists. Needs interaction design.

### 🟢 POST-LAUNCH

**7. Slack/Teams** — First post-launch integration.
**8. Vision / Image Understanding** — When multimodal GGUF quality is sufficient.
**9. Browser Extension** — Significant effort, high value.
**10. Image Generation** — Heavyweight, not core.
**11. Screen Time Correlation** — iOS polish feature.
**12. Smart Home / IoT** — Ecosystem play.

---

## Section 4: Decisions Locked by Orbital Directors (Feb 21, 2026)

### 4.1 — Web Search is a Launch Capability
- Gateway adapter. Brave Search API default. SearXNG for power users.
- Knowledge-graph-first routing: local data checked before web search.
- Web fetch (URL reading) bundled as companion capability.
- Every search and fetch visible in Network Monitor with full audit trail.
- Slots into Sprint 3 after Step 9 completes.

### 4.2 — Semblance is the Intelligence Layer of the Device
- Not an app. The intelligence layer that unifies native hardware capabilities.
- Native APIs (contacts, location, weather, clipboard, messaging, health) are first-class data sources and action targets.
- The device integration suite is what makes cloud AI competition structurally impossible.
- Sprint 4 becomes "Becomes Part of You" — focused on native integration depth.

### 4.3 — Native Integration Suite (Sprint 4 Scope)
Locked capabilities for Sprint 4:
- SMS/messaging (MFMessageComposeViewController iOS, SMS API Android)
- Contacts API (feeds relationship intelligence)
- WeatherKit on iOS (pure local, no Gateway)
- Location-aware intelligence (contextual reminders, commute awareness)
- Clipboard monitoring (ambient intelligence)
- Voice interaction (Whisper.cpp STT + Piper/Coqui TTS, both local)
- Cloud storage sync (Google Drive first)

### 4.4 — Reminders + Quick Capture
- Low effort, high daily-use frequency.
- Sprint 3 or Sprint 4 — final placement after Step 9 codebase audit.

### 4.5 — Chat-About-Document UX
- Infrastructure exists. Needs interaction design.
- Sprint 3 or Sprint 4 — final placement after codebase audit.

---

## Section 5: The "ChatGPT Refugee" Test

A user who currently uses ChatGPT daily switches to Semblance. Here's their first week:

### Day 1 (Onboarding)
- ✅ Downloads app, names their AI, working in 5 minutes. No terminal, no confusion.
- ✅ Knowledge Moment: "How does it already know about my meeting with Sarah and the Portland contract?"
- ✅ Email triage starts immediately. Three routine emails handled in the first 10 minutes.
- ✅ Asks "what's the weather tomorrow" — web search returns the answer, visible in Network Monitor.
- ✅ Pastes a URL: "summarize this article" — web fetch grabs it, AI summarizes locally.
- ✅ "Remind me to call the dentist at 3pm" — reminder set, notification fires at 3pm.

### Day 2-3 (Testing)
- ✅ Semblance handles 10+ emails autonomously. Trust builds.
- ✅ Meeting prep appears 30 minutes before a big meeting. Relevant emails, documents, attendee history — all surfaced automatically.
- ✅ "Find the contract Sarah sent about Portland" — semantic search finds it instantly.
- ✅ "What's Apple stock at?" — web search, answer in seconds.
- ✅ Drags a PDF into chat, asks questions about it — semantic indexing + scoped conversation.
- ✅ Google Drive files synced locally and indexed — "find the Q3 report" works.

### Day 3-4 (Native Integration)
- ✅ Contacts imported. Semblance knows who Sarah Chen is, her phone number, her birthday next month.
- ✅ "Text Sarah to confirm Tuesday pickup" — message pre-filled, one tap to send.
- ✅ Location-aware: "You're near Trader Joe's — you wanted to pick up coffee."
- ✅ Clipboard: copies a FedEx tracking number, Semblance says "Want me to track this package?"
- ✅ Weather integrated: "Rain expected during your 2pm outdoor meeting — consider moving indoors."

### Day 4-7 (Commitment)
- ✅ Voice conversation on mobile while driving. "What's on my schedule today?" All local.
- ✅ Weekly digest: "I saved you 4 hours 15 minutes. Here's what I did."
- ✅ Subscription detection: "You're paying $340/year for services you don't use."
- ✅ Spending insight: "You spent 40% more on dining out this month."
- ✅ Autonomy escalation: "You've approved all my email categorizations for two weeks. Handle automatically?"
- ✅ Privacy dashboard: zero unauthorized connections. Every web search, every email fetch — all visible.

### Day 7 Verdict
The user has not opened ChatGPT once. Semblance manages their email, calendar, finances, reminders, documents, and messages. It knows their contacts, their location, their health patterns, and their daily routine. It responds by voice. It's woven into their device.

They describe it to a friend: "It's like if Siri actually worked, knew everything about your life, and you could verify it's not spying on you."

ChatGPT is still technically smarter for complex analytical tasks. But the user doesn't care. Semblance runs their life. ChatGPT is a search engine with a chat interface. Semblance is their digital twin.

**That's the product that converts people. That's the product that proves sovereign AI is superior.**

---

## Claude Code Audit Instructions

Run this audit against the current codebase. For each capability in Section 1, report:

1. **Implemented and working** — tests exist and pass
2. **Stubbed** — interface/types exist but implementation is placeholder
3. **Not present** — no code exists for this capability

For each gap in Section 2, report whether any related infrastructure exists that could be leveraged.

Do not fix anything. Report findings only. This audit informs Sprint 3 and Sprint 4 scope decisions.
