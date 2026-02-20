

**SEMBLANCE**

*Your Intelligence. Your Device. Your Rules.*

**Canonical Build Map & Technical Reference**

**VERIDIAN SYNTHETICS**

Confidential Build Document

February 2026

*Build Model: Orbital Director (Human \+ Claude) → Claude Code (Execution)*

# **1\. Vision & Mission**

Semblance is a fully local, self-hosted AI that runs entirely on your own hardware. It ingests your emails, files, calendar, messages, health data, financial records, and browser history into a local knowledge graph. It reasons about your life using locally-running language models. It acts as your agent in the world. Your data never leaves your device. Ever.

Semblance is not a chatbot. It is not an assistant. It is your digital semblance — a representation of you that understands your world, acts on your behalf, and is architecturally incapable of betraying your trust.

## **1.1 Core Principles**

* **Sovereign by architecture:** The AI core has zero network access. Privacy is not a policy. It is a physical constraint.

* **Useful from day one:** Not a demo. Not a concept. A tool that saves hours per week immediately.

* **Warm and personal:** Semblance feels like an extension of yourself, not a plugin you installed.

* **Open-core, trust by verification:** Core engine is open source. People verify privacy claims by reading code, not marketing.

* **Aggressively autonomous, safely configurable:** Acts boldly by default. Every action logged, reviewable, reversible. Autonomy is user-configurable per domain.

## **1.2 The Onboarding Moment**

*When a user first launches Semblance, before any setup, before any data connection, they see this:*

*"This is your Semblance.*

*It will learn who you are, manage your world, and represent you.*

*It will never share what it knows.*

*What would you like to call it?"*

Users name their own digital twin. This is not a gimmick. It is a design decision that transforms the relationship from tool-usage to personal trust. The name persists across all interfaces and interactions.

# **2\. System Architecture**

Semblance is built as a layered system with strict isolation between components. The critical architectural constraint is that the AI Core (reasoning \+ knowledge) has zero network access. All external interactions flow through a dedicated, isolated, auditable Gateway.

## **2.1 Architecture Layers**

**Layer 1: Local LLM Engine**

The reasoning brain. Quantized open-source models running entirely on-device.

* **Primary runtime:** Ollama (default for ease of onboarding), llama.cpp (power users), MLX (Apple Silicon optimization).

* **Default models:** Llama 3.2 (3B/8B), Mistral 7B, Phi-3 (3.8B), Gemma 2 (9B). User-swappable.

* **Quantization:** 4-bit (Q4\_K\_M) for 8GB RAM devices, 8-bit for 16GB+. GGUF format for cross-platform compatibility.

* **Minimum hardware:** 8GB RAM laptop (2020 or newer). Recommended: 16GB+ with discrete GPU or Apple Silicon.

* **Mobile inference:** Smaller models (Phi-3-mini 3.8B, Gemma 2B, Llama 3.2 1B) via llama.cpp on-device. Heavy reasoning defers to desktop/server when available.

**Layer 2: Local Knowledge Graph**

The memory. All personal data indexed, embedded, and searchable locally.

* **Vector database:** LanceDB (embedded, no server process, Rust-native, excellent performance). Fallback: ChromaDB, SQLite-VSS.

* **Embedding model:** Local embedding via all-MiniLM-L6-v2 or nomic-embed-text running on-device. No cloud embedding APIs.

* **Structured storage:** SQLite for relational data (contacts, calendar events, financial records, action logs). Single-file database, no server.

* **Document processing:** Local parsing for PDF, DOCX, XLSX, images (OCR via Tesseract), email (IMAP/MAPI), calendar (CalDAV/ICS).

* **Knowledge organization:** Entity extraction, relationship mapping, temporal indexing. The AI understands that 'Sarah' in your email is the same 'Sarah' in your calendar and contacts.

**Layer 3: Agent Orchestration**

The executor. Connects the LLM to real-world actions through structured tool use.

* **Architecture:** Function-calling / tool-use pattern. The LLM emits structured action requests. The orchestrator validates, logs, and routes them.

* **Action types:** Read (fetch email, check calendar), Write (draft email, create event), Execute (send email, book appointment), Monitor (watch for changes, alert on conditions).

* **Approval flow:** Governed by autonomy tier (Guardian/Partner/Alter Ego) and per-domain configuration. Every action is logged before and after execution.

* **Proactive engine:** Background process that monitors for conditions and surfaces context before the user asks. Meeting prep, deadline reminders, anomaly detection.

**Layer 4: The Semblance Gateway**

**The sole point of external contact. The most critical security component in the entire system.**

The Gateway is the ONLY component with network access. It runs as an isolated, sandboxed process separate from the AI Core. The AI Core communicates with the Gateway exclusively through structured, typed action requests over a local IPC channel. The Gateway cannot be instructed to perform arbitrary network calls.

* **Process isolation:** Runs in its own OS-level sandboxed process. On macOS: App Sandbox with network entitlement. On Linux: seccomp/AppArmor profile. On Windows: AppContainer. The AI Core process has NO network entitlement at the OS level.

* **Allowlist-only networking:** The Gateway only makes outbound calls to services the user has explicitly authorized (their email provider, calendar API, bank API, etc.). No wildcard DNS resolution. No unauthorized domains.

* **Typed action protocol:** The AI Core sends structured requests like {action: 'send\_email', to: '...', subject: '...', body: '...'}. The Gateway validates the request schema, checks permissions, and executes. It does NOT accept arbitrary URLs, raw HTTP requests, or unstructured commands.

* **Cryptographic action signing:** Every action request is signed and logged to a tamper-evident local audit trail (append-only SQLite WAL) before execution. The user can replay, inspect, and verify every outbound interaction.

* **Rate limiting and anomaly detection:** The Gateway monitors its own behavior. Unusual patterns (burst of requests, new domain access, large data transfers) trigger pause and user alert.

* **Traffic opacity:** External observers see standard TLS connections to the user's own service providers. No distinctive traffic patterns reveal the AI's involvement. The Gateway is architecturally nebulous to external observation.

**Layer 5: Presentation Layer**

The face. Desktop and mobile applications with a sophisticated, distinctive visual identity.

* **Desktop:** Tauri 2.0 (Rust backend, native webview frontend). Lightweight, performant, native OS integration. System tray, native notifications, global hotkeys.

* **Mobile:** React Native with react-native-reanimated for fluid 60fps interactions. Not a dumbed-down companion — a first-class interface with on-device inference for lightweight tasks.

* **Shared core:** TypeScript business logic shared between desktop and mobile. Rust core for performance-critical operations (embedding, search, crypto) compiled to native for both platforms.

* **Design system:** Custom component library (semblance-ui) with distinctive visual identity. See Section 5: Design System.

## **2.2 Technology Stack Summary**

| Component | Technology |
| :---- | :---- |
| **Desktop App** | Tauri 2.0 (Rust \+ Web frontend) |
| **Mobile App** | React Native \+ react-native-reanimated |
| **LLM Runtime** | Ollama (default) / llama.cpp (power) / MLX (Apple) |
| **Vector Database** | LanceDB (embedded, Rust-native) |
| **Structured Storage** | SQLite (relational data, action logs, audit trail) |
| **Embedding** | all-MiniLM-L6-v2 / nomic-embed-text (local) |
| **Agent Framework** | Custom orchestration with function-calling pattern |
| **UI Framework** | React \+ Tailwind CSS \+ Radix UI \+ semblance-ui |
| **Core Language** | TypeScript (business logic) \+ Rust (performance-critical) |

# **3\. Privacy Architecture — Zero-Cloud Guarantee**

Privacy is not a feature of Semblance. It is the architecture. The system is designed so that violating user privacy is not a policy decision but a physical impossibility within the constraints of the software.

## **3.1 Isolation Model**

The system runs as two isolated processes:

* **AI Core Process:** Contains the LLM, knowledge graph, agent orchestrator, and all user data. This process has NO network entitlement at the OS level. It communicates only via local IPC with the Gateway and the Presentation Layer. Even if a bug or exploit attempted to exfiltrate data, the operating system would block the network call.

* **Gateway Process:** The sole network-capable process. Accepts only typed, validated action requests from the AI Core. Maintains an allowlist of authorized services. Logs every outbound byte.

## **3.2 Provable Privacy**

Claims of privacy must be verifiable, not just stated. Semblance provides four layers of proof:

* **Open source core:** The entire AI Core, knowledge graph, and Gateway are open source. Anyone can audit the code and verify there are no hidden network calls, telemetry, or data exfiltration paths.

* **Network Monitor:** A built-in, always-visible network activity monitor shows every outbound connection in real time. Not buried in settings. Visible on the main dashboard. 'Your Semblance made 0 external requests today' or 'Your Semblance sent 3 emails on your behalf — tap to review.'

* **Proof of Privacy report:** The app can generate a cryptographically signed report showing its complete network activity (or lack thereof) over any time period. Users can share this. Journalists can verify it. Security researchers can audit it. It is not a claim. It is evidence.

* **Reproducible builds:** Given the source code, anyone can build the exact binary that is distributed. This prevents the 'open source but the binary is different' attack vector.

## **3.3 OS-Level Sandboxing**

Defense in depth. Even if the application code had a vulnerability, the operating system enforces the isolation:

* **macOS:** App Sandbox. AI Core process runs without com.apple.security.network.client entitlement. The OS physically blocks any network call.

* **Linux:** seccomp/AppArmor profiles restricting network syscalls for the AI Core process. Flatpak sandboxing for distributed builds.

* **Windows:** AppContainer isolation. AI Core runs in a restricted token with no network capability.

## **3.4 Privacy Dashboard**

A first-class screen in the application, not buried in settings:

* What data Semblance has access to (with granular per-source controls)

* What actions Semblance has taken today / this week / all time

* What network calls were made (and why, with full request/response logs)

* Real-time indicator: local inference active / idle / sleeping

* One-tap data export: download everything Semblance knows about you

* One-tap data wipe: destroy all Semblance data instantly and verifiably

## **3.5 Automated Privacy Audit**

A CI/CD pipeline tool that scans the entire codebase and verifies:

* No unauthorized network calls exist in the AI Core

* No telemetry, analytics, or tracking code is present

* All outbound network paths flow exclusively through the Gateway

* The Gateway's allowlist mechanism is intact and correctly enforced

Results are public and run on every commit. The privacy guarantee is continuously verified, not just claimed at launch.

# **4\. Autonomy Framework**

Semblance ships with aggressive autonomy as the default, configurable per-domain for user comfort. Three named tiers define the relationship between user and AI:

## **4.1 Guardian Mode (Conservative)**

The AI prepares actions, shows what it would do, and waits for explicit approval before executing anything. Every email draft, every calendar change, every financial action requires a tap. This is the 'I am still learning to trust you' mode.

*Best for: New users, sensitive domains (finances, legal), high-stakes actions.*

## **4.2 Partner Mode (Balanced)**

The AI handles routine actions autonomously (triaging email, scheduling non-conflicting meetings, routine responses it is confident about) and asks for approval on anything novel, high-stakes, or uncertain. It reports what it did in a daily digest. This is the 'we have a working relationship' mode.

*Best for: Users who trust the system but want oversight on important decisions.*

## **4.3 Alter Ego Mode (Aggressive)**

The AI acts as you for nearly everything. It handles communications, scheduling, financial monitoring, form filing, and service interactions autonomously. It only interrupts for genuinely high-stakes decisions (large purchases, legal matters, irreversible actions). This is the 'you are my digital twin' mode.

*Best for: Power users who want maximum delegation and trust the system fully.*

## **4.4 Domain-Level Configuration**

Users can set different autonomy levels for different domains. Examples:

* **Email:** Alter Ego (handle everything, report daily)

* **Calendar:** Partner (schedule routine meetings, ask about conflicts)

* **Finances:** Guardian (show me everything, touch nothing without approval)

* **Health:** Partner (track and surface insights, never share externally)

* **Digital Representative:** Guardian initially, upgradeable per-service

## **4.5 Universal Action Log**

Regardless of autonomy level, every action is:

* Logged with full context (what, why, when, what data was used)

* Reviewable at any time through the Action History screen

* Reversible where possible (unsend email, cancel appointment, undo change)

* Auditable via the tamper-evident cryptographic audit trail

Trust is built through transparency, even when the user is not actively watching.

# **5\. Design System — Visual Identity**

Semblance must feel like it belongs in the same sentence as Claude, Arc, Linear, and Notion — products where the design itself communicates quality and trustworthiness. The visual identity communicates three things simultaneously: intelligence (this is not a toy), warmth (this is yours), and security (this is a vault, not a sieve).

## **5.1 Design Principles**

* **Calm confidence:** The interface is never loud, never cluttered, never anxious. It communicates capability through restraint. White space is a feature.

* **Warm intelligence:** Rounded corners, soft shadows, gentle gradients. The AI feels approachable and personal, not clinical or corporate.

* **Transparency by design:** Privacy and activity indicators are always visible, never hidden. The user should always know what their Semblance is doing.

* **Motion with purpose:** Animations are smooth and meaningful, never decorative. Transitions communicate state changes. Loading states feel alive, not stuck.

* **Information density without clutter:** The power user sees depth. The casual user sees simplicity. Progressive disclosure governs every screen.

## **5.2 Color Palette**

Primary palette communicates trust, warmth, and intelligence:

* **Deep Ink (\#1A1D2E):** Primary background for dark mode. Rich, not black. Conveys depth.

* **Soft White (\#FAFBFC):** Primary background for light mode. Warm, not sterile.

* **Semblance Blue (\#4A7FBA):** Primary brand color. Trustworthy, intelligent, calm. Used for primary actions and brand moments.

* **Warm Amber (\#E8A838):** Secondary accent. Warmth, attention, human touch. Used for notifications, highlights, and the user's named twin.

* **Living Green (\#3DB87A):** Status indicator for 'active and healthy.' Privacy confirmed, system running, action successful.

* **Alert Coral (\#E85D5D):** Attention required. Not alarm — attention. Permission requests, anomalies, review needed.

* **Muted Slate (\#8B93A7):** Secondary text, borders, disabled states. The quiet supporting color.

## **5.3 Typography**

* **Primary:** Inter — clean, modern, excellent legibility at all sizes. Used for all UI text.

* **Monospace:** JetBrains Mono — for code, technical data, action logs, and the network monitor.

* **Display (brand moments):** DM Serif Display or Fraunces — for the onboarding moment, the naming screen, and marketing. Warm, distinctive serif that contrasts with the clean UI font.

## **5.4 Motion Language**

* **Transitions:** 200-300ms ease-out for state changes. Never jarring.

* **Loading:** Gentle pulse animation in Semblance Blue. The system feels alive, not frozen.

* **Success:** Brief, satisfying micro-animation. The user knows their Semblance completed an action.

* **Attention:** Soft glow or gentle bounce for items requiring review. Never a harsh alert.

* **Onboarding:** Slower, more cinematic transitions. The first experience is a moment, not a setup wizard.

## **5.5 Component Architecture**

A custom component library (semblance-ui) built on top of Radix UI primitives for accessibility, styled with Tailwind CSS:

* **Cards:** Rounded corners (12px), subtle shadow, hover state with gentle lift.

* **Buttons:** Pill-shaped primary, rounded-rect secondary. Clear hierarchy.

* **Inputs:** Clean, spacious, with inline validation and gentle error states.

* **Status indicators:** Small colored dots (green/amber/coral) always visible for system state.

* **Action cards:** Expandable cards showing what Semblance did, with full context and undo option.

* **Privacy badge:** A persistent, small indicator showing local-only status. Always visible.

## **5.6 Design Document Location**

The canonical design system document lives at:

  /docs/DESIGN\_SYSTEM.md

This file is the source of truth for all visual decisions. It includes color hex codes, spacing scales, component specifications, motion timing curves, and responsive breakpoints. Claude Code must reference this document before creating any UI component.

# **6\. v1 Feature Bundle**

The v1 must undeniably differentiate from every AI assistant on the market. Not just in privacy — in capability. The feature set is organized in three tiers that build on each other across four development sprints.

## **6.1 Tier 1 — The Foundation**

*The minimum for the product to be genuinely useful.*

**Universal Inbox**

Email, calendar, and notifications unified into a single AI-managed stream. Semblance triages, prioritizes, drafts responses, and handles routine items autonomously. Not 'here is a summary.' More like 'I handled these 12 things, here are 3 that need your decision.'

**Total File Intelligence**

Every local file indexed, embedded, and searchable by meaning. 'Find the contract Sarah sent me about the Portland project' works instantly. The AI understands relationships between documents, surfaces relevant context proactively.

**Proactive Context Engine**

Before your meetings, the AI assembles everything relevant — past emails with that person, related documents, notes, action items. Before deadlines, it reminds you with context. It does not wait to be asked. It anticipates.

## **6.2 Tier 2 — The Differentiators**

*What nobody else does. The features that make Semblance undeniable.*

**Financial Awareness**

Connects to your bank/financial data locally, categorizes spending, flags anomalies, tracks subscriptions, surfaces insights like 'you are paying $47/month for something you have not used in 90 days.' Not Mint (which sold your data). Your AI, your money, your device.

**Form & Bureaucracy Automation**

Tax forms, government applications, insurance claims, expense reports — the AI can fill, file, and track these using your local data. This alone saves hours per month for most people and is transformative in developing countries with complex bureaucracy.

**Digital Representative Mode**

The AI can draft and send emails in your voice, respond to scheduling requests, handle customer service interactions, negotiate on your behalf (cancel subscriptions, dispute charges, request refunds) — all governed by your autonomy settings. You set the level: Guardian (ask before sending), Partner (show after sending), or Alter Ego (handle it entirely).

**Health & Wellness Tracking**

Ingest health data (Apple Health, Fitbit, manual entries) locally. Track patterns, correlate with calendar/stress/activity. 'Your sleep quality drops 40% during weeks with more than 3 evening meetings.' No cloud health platform ever sees this data.

## **6.3 Tier 3 — The Wow Factor**

*What makes Semblance spread. The features people tell others about.*

**Relationship Intelligence**

The AI understands your social graph from your communications. It remembers birthdays, tracks how long since you contacted someone, knows who is important to you. 'You have not talked to your mom in 2 weeks' or 'Jake mentioned his daughter's recital — that is tomorrow.' This is what a great personal assistant does, and nobody has it unless they are wealthy.

**Learning & Adaptation**

The AI learns your communication style, decision patterns, and preferences over time. It does not just get better at retrieval — it gets better at being you. The more you use it, the more it can represent you accurately.

**Privacy Dashboard**

A clear, visual display of exactly what data your AI has access to, what it has done, and proof that nothing has left your device. This is the trust differentiator. No other AI product can show you this because they cannot — their architectures will not allow it.

## **6.4 What This Bundle Communicates**

*The message is not 'here is another AI assistant.' The message is:*

*"This is your AI. It works for you. It knows everything about you. It acts on your behalf. And it is architecturally incapable of betraying you."*

That is not a feature list. That is a movement.

# **7\. Development Sprint Plan**

Four sprints across 16 weeks. Each sprint delivers a usable increment. The product ships after Sprint 4 with all three tiers complete. The build model is Orbital Director (Human \+ Claude in conversation) directing Claude Code for implementation execution.

## **7.1 Sprint 1 — The Spine (Weeks 1–4)**

*Core architecture. Get the skeleton working end to end.*

* **Local LLM integration:** Ollama setup, model management, inference pipeline. Confirm performance on 8GB and 16GB machines.

* **Knowledge graph foundation:** LanceDB setup, embedding pipeline, SQLite schema for structured data. Local file indexing (start with common document types).

* **Gateway architecture:** Isolated process, IPC protocol, allowlist mechanism, action signing, audit log. This must be rock-solid from Sprint 1\.

* **Desktop app shell:** Tauri 2.0 scaffolding with design system foundations. System tray, native notifications, basic navigation.

* **Mobile app shell:** React Native project with shared TypeScript core. Basic navigation and design system components.

* **CLAUDE.md and design system:** Canonical reference files in project root. All subsequent development references these.

**Sprint 1 Exit Criteria:** User can install the app, connect to a local LLM, index local files, and ask questions about their documents. Gateway exists and logs all actions. Both desktop and mobile shells render the design system.

## **7.2 Sprint 2 — Becomes Useful (Weeks 5–8)**

*The product is now usable for daily work.*

* **Universal Inbox:** Email integration (IMAP), calendar integration (CalDAV/ICS), unified triage view. AI categorization and priority scoring.

* **Proactive Context Engine:** Meeting prep automation, deadline monitoring, relevant document surfacing. Background scheduling of proactive tasks.

* **Basic agent actions:** Draft emails, manage calendar events, respond to scheduling requests. Approval flow matching autonomy tier.

* **Onboarding experience:** The naming moment. Data source connection wizard. Autonomy tier selection. Privacy explanation flow.

* **Network Monitor:** Real-time display of all outbound connections. Always visible on dashboard.

**Sprint 2 Exit Criteria:** User receives daily AI-managed email triage, gets proactive meeting prep, and can have Semblance draft and send emails on their behalf (with appropriate approval flow). Network Monitor shows zero unauthorized connections.

## **7.3 Sprint 3 — Becomes Powerful (Weeks 9–12)**

*Tier 2 features. This is where Semblance becomes undeniable.*

* **Financial Awareness:** Bank data integration (Plaid or local CSV/OFX import), transaction categorization, subscription tracking, anomaly detection.

* **Form & Bureaucracy Automation:** PDF form filling, template recognition, data extraction from user's knowledge graph to populate forms.

* **Digital Representative Mode:** Voice matching for email drafting, customer service interaction scripts, subscription negotiation playbooks.

* **Health & Wellness:** Apple Health / Fitbit data ingestion, pattern correlation, insight surfacing.

* **Autonomy refinement:** Per-domain configuration UI, daily digest generation, action review and undo capabilities.

**Sprint 3 Exit Criteria:** User can delegate financial monitoring, have forms auto-filled, and have Semblance represent them in routine interactions. The product handles entire categories of the user's life.

## **7.4 Sprint 4 — Becomes Undeniable (Weeks 13–16)**

*Tier 3 features, polish, mobile parity, and launch readiness.*

* **Relationship Intelligence:** Social graph construction from communications, birthday/contact tracking, relationship health indicators.

* **Learning & Adaptation:** Communication style modeling, preference learning, decision pattern recognition. The AI becomes progressively better at being you.

* **Privacy Dashboard:** Full visualization of data access, action history, network activity. Proof of Privacy report generation.

* **Mobile parity:** All features available on mobile with on-device inference for lightweight tasks and seamless handoff to desktop for heavy reasoning.

* **Performance optimization:** Inference speed, indexing performance, battery optimization for mobile, memory footprint reduction.

* **Launch preparation:** Documentation, website, marketing materials, open-source repository preparation, community infrastructure.

**Sprint 4 Exit Criteria:** Complete v1 with all three feature tiers, desktop and mobile parity, polished UX, provable privacy, and launch readiness. Ship.

# **8\. CLAUDE.md Specification**

The CLAUDE.md file is the canonical instruction set for Claude Code when working on the Semblance codebase. It must be comprehensive enough that Claude Code can make correct architectural, design, and security decisions without human intervention on routine matters. It lives in the project root and is the first thing Claude Code reads.

## **8.1 Required Sections**

**Project Identity**

  \# SEMBLANCE

  Your Intelligence. Your Device. Your Rules.

Brief description of what Semblance is, its core mission, and the non-negotiable architectural constraints.

**Architecture Rules (Non-Negotiable)**

These rules must be enforced on every code change:

* **RULE 1 — Zero Network in AI Core:** The AI Core process must NEVER import, reference, or use any networking library (fetch, axios, http, net, dns, etc.). Any code that adds network capability to the AI Core is a critical violation. No exceptions.

* **RULE 2 — Gateway Only:** ALL external network calls MUST flow through the Semblance Gateway. The Gateway is the sole process with network entitlement. It accepts only typed, schema-validated action requests via IPC.

* **RULE 3 — Action Signing:** Every action that passes through the Gateway MUST be cryptographically signed and logged to the append-only audit trail BEFORE execution. No action may execute without a log entry.

* **RULE 4 — No Telemetry:** No analytics, telemetry, crash reporting, or usage tracking of any kind. No third-party SDKs that phone home. No exceptions.

* **RULE 5 — Local Only Data:** All user data (knowledge graph, embeddings, preferences, action history) must be stored exclusively on the user's device. No cloud sync. No cloud backup. No cloud anything.

**Design System Reference**

Claude Code must read /docs/DESIGN\_SYSTEM.md before creating any UI component. The design system defines:

* Color palette with exact hex codes

* Typography scale and font choices

* Spacing system and layout grid

* Component specifications and variants

* Motion and animation standards

* Responsive breakpoints

Any UI code that does not conform to the design system must be flagged and corrected.

**Repository Separation**

Claude Code must enforce the public/private repository boundary:

* **Public repository (semblance-core):** AI Core, knowledge graph, Gateway, basic agent orchestration, privacy architecture, design system, documentation. All code here is open source under a permissive license.

* **Private repository (semblance-premium):** Advanced agent autonomy features, financial intelligence, Digital Representative mode, premium integrations. This code is proprietary and licensed.

Claude Code must never place premium feature code in the public repository. When in doubt, ask.

**Orbital Director Workflow**

The development workflow is:

* **1\. Orbital Directors (Human \+ Claude in conversation)** define architecture, features, and priorities.

* **2\. Claude Code** executes implementation sprints based on Orbital Director decisions.

* **3\. Claude Code** escalates to Orbital Directors when facing: architectural decisions not covered by CLAUDE.md, security-sensitive changes, design system ambiguities, public/private boundary questions.

Claude Code should optimize for speed and quality within the guardrails. It should not ask for permission on routine implementation decisions that are clearly within the architectural and design constraints.

**Code Quality Standards**

* TypeScript strict mode everywhere. No 'any' types.

* Rust for performance-critical paths (embedding, search, crypto, IPC).

* Tests for all agent actions, Gateway operations, and privacy-critical paths.

* Conventional commits. Meaningful PR descriptions.

* No dependencies without explicit justification. Minimize supply chain attack surface.

**File Structure Reference**

  /

  ├── CLAUDE.md                    \# This file

  ├── docs/

  │   ├── DESIGN\_SYSTEM.md         \# Canonical design reference

  │   ├── ARCHITECTURE.md          \# System architecture deep-dive

  │   └── PRIVACY.md               \# Privacy architecture details

  ├── packages/

  │   ├── core/                    \# AI Core (NO NETWORK)

  │   │   ├── llm/                 \# LLM integration layer

  │   │   ├── knowledge/           \# Knowledge graph & embeddings

  │   │   ├── agent/               \# Orchestration & tool-use

  │   │   └── types/               \# Shared type definitions

  │   ├── gateway/                 \# Network gateway (ISOLATED)

  │   ├── desktop/                 \# Tauri app

  │   ├── mobile/                  \# React Native app

  │   └── semblance-ui/            \# Shared component library

  ├── scripts/

  │   └── privacy-audit/           \# Automated privacy verification

  └── tests/

      ├── privacy/                 \# Privacy guarantee tests

      ├── gateway/                 \# Gateway isolation tests

      └── integration/             \# End-to-end tests

# **9\. Repository Strategy**

Open-core from day one. Public repo immediately. The code is the proof of the privacy promise.

## **9.1 Public Repository: semblance-core**

Contains everything needed to run Semblance with full privacy guarantees:

* AI Core (LLM integration, knowledge graph, agent orchestration)

* Semblance Gateway (network isolation, action signing, audit trail)

* Desktop app (Tauri) and mobile app (React Native) with Tier 1 features

* Design system and component library (semblance-ui)

* Privacy audit tools and test suite

* Full documentation (CLAUDE.md, DESIGN\_SYSTEM.md, ARCHITECTURE.md, PRIVACY.md)

License: MIT or Apache 2.0 for maximum adoption. The open-source community can verify, audit, contribute, and build on the core.

## **9.2 Private Repository: semblance-premium**

Contains proprietary features that power the paid tier:

* Advanced agent autonomy (Alter Ego mode full capabilities)

* Financial intelligence (bank integration, subscription management, anomaly detection)

* Digital Representative mode (voice matching, negotiation playbooks)

* Health & wellness analytics (pattern correlation, insight engine)

* Relationship intelligence (social graph, relationship health)

* Premium integrations and connectors

License: Proprietary. Accessed via license key mechanism integrated into the open-source build. The premium features plug into the open core without modifying it.

## **9.3 Repository Launch Checklist**

Before the public repo goes live:

* Clear, compelling README with project vision and quick-start guide

* CLAUDE.md in project root

* DESIGN\_SYSTEM.md with full visual specifications

* ARCHITECTURE.md with system diagrams and component descriptions

* PRIVACY.md with provable privacy claims and audit methodology

* CONTRIBUTING.md with contribution guidelines and code standards

* Working Sprint 1 build that a developer can install and run

* Automated privacy audit passing on CI/CD

* LICENSE file

# **10\. Revenue Model & Go-to-Market**

## **10.1 Pricing Structure**

**Free Tier (Open Source)**

Full Tier 1 functionality: Universal Inbox, Total File Intelligence, Proactive Context Engine. Complete privacy architecture. No feature gates on privacy or security. This tier is the trust-building engine and the open-source community driver.

**Premium Tier ($15–20/month)**

Full Tier 2 and Tier 3 functionality: Financial Awareness, Form Automation, Digital Representative Mode, Health & Wellness, Relationship Intelligence, Learning & Adaptation. Premium model support and priority updates.

**One-Time Purchase Option**

For privacy purists who reject subscriptions. Lifetime access to premium features for a single payment. This is a trust signal — Semblance does not need recurring revenue from holding your data hostage.

**Enterprise Tier (Per-Seat Licensing)**

For companies wanting to give employees a sovereign AI that keeps corporate data local. Includes deployment tooling, centralized configuration, compliance reporting. Massive market as enterprises grapple with AI data governance.

## **10.2 Additional Revenue Streams**

* **Services marketplace:** Verified integrations with financial, health, legal, and government platforms. Revenue share with integration partners.

* **Professional services:** Setup, customization, and training for high-value users and organizations.

* **Semblance Protocol licensing:** If the agent orchestration layer becomes a standard, license it to other platforms.

## **10.3 Go-to-Market Strategy**

* **Phase 1 — Developer community:** Open-source launch targeting privacy-conscious developers and tech early adopters. Hacker News, Reddit, GitHub trending. The code is the marketing.

* **Phase 2 — Privacy advocates:** Press coverage targeting privacy-focused media, digital rights organizations, and the post-surveillance tech movement.

* **Phase 3 — General consumers:** Polished product marketing targeting overwhelmed professionals, parents, and anyone drowning in digital complexity. The message: 'Your AI. Your rules.'

* **Phase 4 — Enterprise:** Corporate deployments targeting companies with strict data governance requirements. Healthcare, legal, financial services, government.

## **10.4 Target Market**

The market is every human who uses a computer. More specifically:

* **Immediate (v1 launch):** Privacy-conscious professionals, developers, tech early adopters. Estimated: 10-50M globally.

* **Near-term (6-12 months):** Knowledge workers overwhelmed by digital complexity. Parents, freelancers, small business owners. Estimated: 500M+.

* **Long-term:** Every smartphone user globally. The personal assistant economy, currently a luxury for the wealthy, becomes universal. TAM: billions.

# **11\. Global Impact**

## **11.1 Economic Disruption**

* **Data extraction economy collapses:** Google, Facebook, Amazon, and Microsoft's business models depend on holding user data and monetizing attention. A Sovereign Personal AI makes them architecturally irrelevant. There is no reason to give Google your search history if your local AI already knows what you need. Economic disruption in the hundreds of billions of dollars.

* **Cloud AI subscriptions face structural competition:** ChatGPT, Copilot, Gemini charge monthly for cloud-based AI that processes your data on their servers. Semblance offers superior privacy at lower long-term cost with no data lock-in.

* **Software categories dissolve:** Email clients, calendar apps, personal finance tools, CRM, form fillers, health trackers — entire categories of standalone software become features of one sovereign agent.

## **11.2 Social Transformation**

* **Personal assistant economy inverts:** Having someone manage your life is currently a luxury for the wealthy. Semblance democratizes it. A single parent working two jobs gets the same quality of life management as a CEO with a staff. This is a class barrier falling.

* **Developing world transformation:** In countries with byzantine government bureaucracy, language barriers, and limited access to professional services, a local AI that speaks your language, understands your documents, and navigates systems on your behalf is transformative. It is not a chatbot. It is access to capability that was previously gated by wealth and education.

* **Privacy as a right, not a product:** By making the privacy-preserving option also the most capable option, Semblance eliminates the false choice between convenience and privacy.

# **12\. Strategic Context**

## **12.1 Position Within Veridian Synthetics**

Semblance is Phase 1 of the Veridian Synthetics execution roadmap. It is the fastest path to revenue and establishes the credibility, audience, and platform for every subsequent project:

* **Phase 1 (Immediate):** Semblance — Sovereign Personal AI. Revenue from day one.

* **Phase 2 (Fast Follow):** Proof of Truth — Cryptographic media provenance. Grant funding \+ government interest.

* **Phase 3 (Revenue-Funded):** AI Passport, NL-to-Verified-Software, Internet Immune System.

* **Phase 4 (Scale-Dependent):** Universal Basic Compute, Global Resource Optimizer.

## **12.2 Competitive Landscape**

No direct competitor occupies Semblance's exact position. Adjacent products:

* **Cloud AI assistants (ChatGPT, Copilot, Gemini):** Powerful but require sending all data to corporate servers. Fundamentally different architecture.

* **Apple Intelligence:** Claims on-device processing but routes complex queries through Apple's cloud. Locked to Apple ecosystem. Not truly sovereign.

* **Rewind.ai / Recall:** Screen recording and search. Not an agent that acts on your behalf. Passive, not active.

* **Open-source local AI tools (Jan, LM Studio, GPT4All):** Chat interfaces for local models. No agent capabilities. No knowledge graph. No life management.

Semblance is the first product that combines genuinely local AI, comprehensive life knowledge, autonomous agent capabilities, and provable privacy in a single, beautifully designed experience.

## **12.3 The Open-Source Strategy**

Open-source the core, monetize the enterprise layer. The core creates the ecosystem. The ecosystem creates the demand. The enterprise offering captures the revenue. This is the playbook of Hugging Face, GitLab, HashiCorp, and every infrastructure company that achieved massive scale.

For Semblance specifically, open source serves a dual purpose: it is the distribution strategy AND the proof mechanism. Users do not have to trust marketing claims about privacy. They can read the code.

*End of Document*

**Semblance — Your Intelligence. Your Device. Your Rules.**

Veridian Synthetics © 2026