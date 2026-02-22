# Sprint 3 — Becomes Powerful: Master Plan

## Strategic Planning Document — NOT an Implementation Prompt
**Date:** February 21, 2026
**Status:** Planning. Individual step prompts will be drafted separately.
**Baseline:** Sprint 2 closed. 1,239 tests passing. Privacy audit clean. All 8 Sprint 2 exit criteria met.

---

## What Changed Since the Original Build Map

Sprint 3's canonical scope (from SEMBLANCE_BUILD_MAP_REVISION_2) is:

- Full Financial Awareness (Plaid or bank integration, transaction categorization, anomaly detection)
- Form & Bureaucracy Automation (PDF form filling, template recognition, data extraction)
- Digital Representative Mode (customer service interactions, subscription negotiation, cancellation handling)
- Health & Wellness tracking (Apple Health, Fitbit, local pattern correlation)
- Communication style learning (for Alter Ego email voice matching)
- Per-domain autonomy refinement UI and daily digest generation
- Mobile feature parity for all Sprint 2 features

**What's being added — Runtime Ownership (locked in Feb 21, 2026):**

The Sprint 2 architecture requires a running Ollama instance that the user must independently install and configure. This is a developer workflow, not a consumer product. For Semblance to be viable for its target users (overwhelmed professionals, parents, freelancers), the entire inference runtime must be owned by Semblance.

**New locked-in decisions:**

1. **Semblance owns the runtime.** The user downloads Semblance. They open it. It works. They never see Ollama, never open a terminal, never think about models. This is non-negotiable.

2. **Zero-config default path.** Hardware detection → automatic model selection → managed download during onboarding → inference ready before the Knowledge Moment fires. No user choices required.

3. **Power user escape hatch.** Settings screen allows: custom model selection, Ollama backend connection, model parameter configuration. But the default path is zero-config.

4. **Tiered inference architecture.** Not every task needs the same model. Small fast model for classification/extraction, primary reasoning model for generation/composition, optional large model for deep analysis. Task routing determines which model handles what.

5. **Embedding pipeline end-to-end.** The knowledge graph's semantic search capability requires a working embedding pipeline: text → embedding model → LanceDB vectors. This is currently a gap — keyword matching works but semantic search isn't wired. This is the single biggest capability multiplier available.

---

## Revised Sprint 3 Exit Criteria

**Original (from build map):** User can delegate financial monitoring, have forms auto-filled, and have Semblance represent them in routine interactions. Communication style learning is operational and improving Alter Ego output quality. Mobile has feature parity with desktop for all Sprint 2 features.

**Revised — adds runtime ownership:**

1. **Zero-config onboarding works.** A new user on a supported Mac (Apple Silicon, 8GB+) or Windows/Linux desktop (16GB+ RAM) downloads Semblance, opens it, names it, and has a working AI within 5 minutes. No terminal. No Ollama install. No model selection. The onboarding wizard handles hardware detection, model download, and runtime initialization seamlessly.

2. **Semantic search is operational.** "Find the contract Sarah sent about Portland" returns the right document based on meaning, not just keywords. The embedding pipeline is wired end-to-end: document text → embedding model → LanceDB vectors → semantic retrieval. Every indexed data source (files, emails, calendar) has embeddings.

3. **Tiered inference runs transparently.** Fast model handles classification tasks in under 1 second. Primary model handles generation tasks in 3-30 seconds. The user never knows multiple models are involved — they just see fast, high-quality results.

4. **Full Financial Awareness works.** Builds on Sprint 2 subscription detection. Transaction categorization, spending insights, anomaly detection. Plaid integration as an optional premium feature; CSV/OFX import remains the core path.

5. **Form automation works.** PDF form filling using knowledge graph data. Template recognition for common forms. At minimum: expense reports and simple government forms.

6. **Digital Representative sends emails in the user's voice.** Communication style learning has enough training data (from indexed sent emails) to draft replies that sound like the user, not like a robot. In Alter Ego mode, these send automatically.

7. **Mobile has feature parity for Sprint 2 features.** Mobile inference runs on-device (MLX on iOS, llama.cpp on Android). Task routing between mobile and desktop is operational. The Universal Inbox, email management, and calendar features work on mobile.

8. **Per-domain autonomy refinement UI is live.** Users can configure autonomy per domain (email: Partner, finance: Guardian, calendar: Alter Ego) from a clear settings screen.

---

## Step Sequence

### Step 9 — Runtime Ownership + Embedding Pipeline (THE FOUNDATION)

**This is the most important step in Sprint 3.** Everything else depends on it.

**Deliverables:**
- **Native inference runtime:** llama.cpp via Rust bindings (llama-cpp-rs or equivalent) as the default desktop runtime. MLX integration for Apple Silicon (via Swift bridge or mlx-rs). Replaces the Ollama-required path with a bundled runtime that Semblance manages.
- **Hardware detection:** On first launch, detect: CPU architecture (x86/ARM), RAM, GPU (discrete/integrated/Apple Silicon), available disk space. Determine the optimal model profile automatically.
- **Model management pipeline:** Model registry with recommended models per hardware profile. Managed download through Gateway (model downloads are network operations). Progress tracking, resume-on-interrupt, integrity verification (SHA-256). Model storage in app data directory. Model switching in Settings.
- **Tiered inference routing:** LLMProvider interface extended with model tiers (fast/primary/quality). Task-to-tier mapping for all existing task types. Transparent routing — callers don't specify which model, the router decides.
- **Embedding pipeline end-to-end:** Embedding model (all-MiniLM-L6-v2 or nomic-embed-text) running via the native runtime. Document indexer, email indexer, and calendar indexer updated to generate and store embeddings in LanceDB. Semantic search operational across the knowledge graph.
- **Onboarding integration:** "Setting up your AI..." screen with hardware detection, model download progress, and seamless transition to data connection. Replaces the current assumption that Ollama is running.
- **Ollama as optional backend:** OllamaProvider remains functional. New Settings screen: "Use built-in AI (default)" vs "Connect to Ollama instance" vs "Custom model configuration." Power users can point to their own setup.
- **Retroactive embedding generation:** For users upgrading from Sprint 2, a background job re-indexes existing emails, calendar, and files with the new embedding pipeline.

**Why this is Step 9:** Every Sprint 3 feature depends on inference working seamlessly. Financial categorization needs the LLM. Form filling needs the LLM. Communication style learning needs the LLM. Mobile inference needs the runtime framework. Semantic search needs embeddings. If this step fails, nothing else in Sprint 3 can ship.

**Risk:** This is the highest-risk step in the entire project. Native model inference involves Rust FFI, platform-specific GPU backends, memory management for multi-GB models, and download reliability. It must be tested aggressively on real hardware.

---

### Step 10 — Full Financial Awareness

**Builds on:** Sprint 2 subscription detection (CSV/OFX import, recurring charge detection) + Step 9 (native inference, embeddings)

**Deliverables:**
- **Transaction categorization:** Every imported transaction classified (food, transport, entertainment, utilities, subscriptions, income, transfers, etc.) using the LLM with a local category taxonomy. Batch processing for efficiency.
- **Spending insights:** Monthly spending by category, month-over-month trends, unusual charges flagged. "You spent 40% more on dining out this month than your 3-month average."
- **Anomaly detection:** Flag charges that are unusual by amount, merchant, or pattern. "New charge: $847 from ACME CORP — this is the first time you've been charged by this merchant."
- **Plaid integration (premium):** Optional real-time bank connection via Gateway adapter. Requires Plaid API key. Auto-imports transactions daily. Premium feature — free tier continues using CSV/OFX manual import.
- **Financial dashboard:** New screen or expanded section in Settings showing spending breakdown, trends, anomalies, subscription status.
- **Proactive financial insights:** Integrated into the Proactive Engine. "Your electric bill is 30% higher than last month" appears in the Universal Inbox priority section.

**Scope boundary:** This is financial awareness, not financial planning. No budgeting tools, no investment tracking, no tax preparation. Those are Sprint 4+ features. Sprint 3 answers "what am I spending and is anything weird?" — not "how should I allocate my money?"

---

### Step 11 — Communication Style Learning + Digital Representative

**Builds on:** Step 9 (native inference, embeddings) + Sprint 2 email infrastructure

**Deliverables:**
- **Communication style extraction:** Analyze the user's sent emails (indexed in Sprint 2) to build a style profile: typical greeting, sign-off, formality level, average sentence length, vocabulary patterns, tone markers. Store as a structured style profile in SQLite.
- **Style-matched drafting:** When Semblance drafts an email, the style profile is injected into the LLM prompt. "Write this reply in the user's voice. Their style: [profile]." The draft should sound like the user wrote it, not like a corporate AI.
- **Style quality validation:** Compare drafts against the style profile. Score how well the draft matches. If below threshold, regenerate. Surface the match score to the user: "This draft matches your writing style: 87%."
- **Digital Representative — email:** In Alter Ego mode, Semblance handles routine email interactions end-to-end in the user's voice: meeting confirmations, simple Q&A, scheduling responses, follow-up messages. Logs everything to the action trail.
- **Digital Representative — subscription management:** In Alter Ego mode, Semblance drafts and sends cancellation emails for forgotten subscriptions. Uses the subscription data from Sprint 2. Follows up if no response. Reports results in the digest.
- **Customer service draft templates:** Pre-built playbooks for common customer service interactions: refund requests, billing disputes, service cancellations, account inquiries. The LLM fills in specifics from the user's context. Guardian/Partner modes show for approval; Alter Ego sends.

**Scope boundary:** Full customer service automation (phone/chat bots, live negotiation) is Sprint 4. Sprint 3 handles email-based representative actions. The user's voice in email is the core deliverable.

---

### Step 12 — Form & Bureaucracy Automation

**Builds on:** Step 9 (native inference, embeddings, semantic search) + knowledge graph

**Deliverables:**
- **PDF form detection:** Identify fillable PDF forms. Detect field types (text, date, checkbox, dropdown). Extract field labels and context.
- **Auto-fill from knowledge graph:** Match form fields to user data in the knowledge graph. Name, address, email, phone, employer, dates — populated automatically from indexed documents, emails, and user profile.
- **Smart field mapping:** The LLM maps ambiguous form labels to user data. "Employer name" → user's company from email signature. "Date of birth" → extracted from indexed documents. "Reference number" → from a recent email about the application.
- **Form template library:** Pre-built mappings for common forms: expense reports, PTO requests, simple tax forms (W-4, not full tax prep), insurance claims. Community-contributed templates in the open-source repo.
- **Fill + review workflow:** Semblance fills the form → shows preview → user reviews and corrects → corrections improve future mapping. Guardian mode requires approval of every field. Partner mode fills known fields automatically, highlights uncertain ones. Alter Ego fills and submits (with undo for digital submissions).
- **Bureaucracy tracking:** When a form is submitted, Semblance tracks the expected timeline. "You submitted your insurance claim 14 days ago. The typical processing time is 30 days. I'll remind you if we don't hear back."

**Scope boundary:** PDF form filling only. No web form automation (would require browser extension — Sprint 4+). No tax preparation (requires certified accuracy — partnership opportunity). No government portal automation (requires OAuth flows per agency — future).

---

### Step 13 — Health & Wellness Integration

**Builds on:** Step 9 (native inference, embeddings) + knowledge graph + calendar data

**Deliverables:**
- **Apple Health import (iOS):** Read HealthKit data locally on iOS: steps, sleep, heart rate, workouts, mindfulness minutes. Store in the local knowledge graph. No cloud sync.
- **Fitbit/Google Fit import (optional):** Gateway adapter for Fitbit/Google Fit API. Fetches data → stores locally → deletes from cloud cache. Optional premium integration.
- **Manual health entries:** Simple input for: mood, energy level, pain, symptoms, medication, water intake. Quick-entry UI designed for daily use.
- **Pattern correlation:** Cross-reference health data with calendar and activity patterns. "Your sleep quality drops 40% during weeks with more than 3 evening meetings." "Your energy ratings are highest on days you exercise before 10 AM." Uses the LLM for natural language insight generation, but the underlying correlations are statistical (computed in code, not hallucinated by the model).
- **Health insights in proactive engine:** Integrated into the Universal Inbox. "You have 4 evening meetings this week — historically this correlates with poor sleep for you. Consider blocking tomorrow morning."
- **Wellness dashboard:** New section showing trends, correlations, and insights. Completely local — no cloud health platform ever sees this data.

**Scope boundary:** Correlation and insight, not medical advice. Semblance observes patterns, it doesn't diagnose or prescribe. Clear disclaimers on the health dashboard. No wearable real-time streaming (batch import only for Sprint 3).

---

### Step 14 — Mobile Feature Parity + Task Routing

**Builds on:** Step 9 (native runtime, MLX/llama.cpp) + Step 8 task routing foundation + all Sprint 2 features

**Deliverables:**
- **Mobile inference operational:** MLX running on iOS (Apple Silicon iPads/iPhones). llama.cpp on Android. 3B model as default on devices with 6GB+ RAM. 1.5B model on constrained devices. Model downloaded and managed same as desktop — seamless.
- **Sprint 2 features on mobile:** Universal Inbox, email management, calendar management, subscription detection results (view, not import — CSV import remains desktop), Knowledge Moment, weekly digest, autonomy controls, Network Monitor.
- **Task routing operational:** When both desktop and mobile are on the same network, tasks route intelligently. Heavy inference (meeting prep, long email drafts) routes to desktop. Quick classification and notification surfaces on mobile. The user sees results on whichever device they're using — the routing is invisible.
- **Mobile-specific UX:** Touch-optimized inbox, swipe gestures for email actions (archive, categorize, approve), notification integration (proactive insights as system notifications), haptic feedback for action confirmations.
- **Offline capability:** Mobile works without desktop. Limited to on-device model capacity, but all core features functional. Email sync when connectivity available.
- **Cross-device state sync:** Action trail, preferences, autonomy settings sync between devices via local network (mDNS discovery + encrypted transfer). No cloud relay. If devices aren't on the same network, each operates independently and reconciles on next connection.

**Scope boundary:** Mobile gets Sprint 2 feature parity, not Sprint 3 features. Financial dashboard, form filling, communication style learning, and health tracking are desktop-first in Sprint 3. Mobile gets those in Sprint 4.

---

### Step 15 — Per-Domain Autonomy Refinement + Daily Digest + Sprint 3 Validation

**Builds on:** Everything above

**Deliverables:**
- **Per-domain autonomy UI:** Clear settings screen where users configure autonomy per domain: email (Guardian/Partner/Alter Ego), calendar, finance, health, forms. Visual preview of what each tier means for each domain. Links to the escalation system from Step 7.
- **Daily digest generation:** In addition to the weekly digest (Sprint 2), generate a lighter daily summary. "Today: 6 emails handled, 1 meeting prepped, 2 follow-ups tracked. Time saved: ~25 minutes." Optional — users can disable in Settings. Appears as a morning notification or inbox card.
- **Sprint 3 exit criteria validation:** Integration tests covering all 8 Sprint 3 exit criteria. End-to-end journey test for Sprint 3.
- **Performance optimization pass:** Inference speed benchmarks on target hardware. Memory footprint audit. Battery impact testing on mobile. Optimize the critical paths: email categorization should be <1 second, Knowledge Moment should generate within 10 seconds of indexing completion.

---

## Sprint 3 Step Summary

| Step | Name | Core Deliverable | Dependencies |
|------|------|-----------------|--------------|
| 9 | Runtime Ownership + Embedding Pipeline | Zero-config inference, semantic search, managed model downloads | None (foundation) |
| 10 | Full Financial Awareness | Transaction categorization, spending insights, anomaly detection, Plaid | Step 9 |
| 11 | Communication Style + Digital Representative | Style-matched drafting, email representative, subscription cancellation | Step 9 |
| 12 | Form & Bureaucracy Automation | PDF auto-fill, knowledge graph extraction, form tracking | Step 9 |
| 13 | Health & Wellness | Apple Health import, pattern correlation, wellness insights | Step 9 |
| 14 | Mobile Feature Parity + Task Routing | Mobile inference, Sprint 2 on mobile, cross-device routing | Step 9 |
| 15 | Autonomy Refinement + Daily Digest + Validation | Per-domain config, daily digest, Sprint 3 exit validation | All above |

---

## Architecture Decisions — New for Sprint 3

### Decision 1: Native Runtime Over Ollama (Locked Feb 21, 2026)

**Default path:** llama.cpp (Rust bindings) on desktop, MLX on Apple Silicon. Semblance bundles and manages the inference runtime. Model weights are downloaded assets managed by Semblance, not external dependencies.

**Ollama path:** Optional. Available in Settings → "Connect to Ollama instance." For power users and developers who want to use their existing setup.

**Rationale:** Consumer product cannot require terminal installation of a separate tool. Every other local AI app that gained consumer traction (LM Studio, Jan) owns its runtime. The target user never sees a model name.

### Decision 2: Tiered Inference (New)

| Tier | Model Size | Use Case | Latency Target |
|------|-----------|----------|----------------|
| Fast | 1.5-3B quantized | Classification, extraction, categorization, embedding | <1 second |
| Primary | 3B-13B (hardware-dependent) | Generation, composition, reasoning, drafting | 3-30 seconds |
| Quality | 13B-70B (optional, power users) | Deep analysis, complex reasoning, style matching | 30-120 seconds |

Task-to-tier mapping is transparent. The caller requests inference, the router picks the tier. Users never configure this unless they want to.

### Decision 3: Embedding Pipeline Architecture (New)

Embedding runs through the native runtime (same as inference), not a separate service. The embedding model (all-MiniLM-L6-v2 or nomic-embed-text) is downloaded alongside the reasoning model during onboarding. Embeddings are computed locally and stored in LanceDB.

For the initial index (potentially thousands of emails + documents), embedding generation runs as a background task with progress indication. Incremental indexing (new emails, new files) generates embeddings on arrival.

### Decision 4: Model Download Through Gateway (New)

Model downloads are network operations. They MUST flow through the Gateway, logged in the audit trail, and visible in the Network Monitor. The user sees: "Downloading AI model: 4.2 GB from huggingface.co" in the Network Monitor. This maintains trust transparency — even the model download is visible and auditable.

The model download domain (huggingface.co or a Veridian-hosted mirror) is added to the Gateway allowlist during onboarding setup, with clear user consent.

### Decision 5: Hardware Profiles (New)

| Profile | Hardware | Default Reasoning Model | Default Embedding Model | Notes |
|---------|----------|------------------------|------------------------|-------|
| Apple Silicon High | M1 Pro/Max/Ultra+, 16GB+ | 7B Q4 (MLX) | nomic-embed-text | Best consumer experience |
| Apple Silicon Base | M1/M2, 8GB | 3B Q4 (MLX) | all-MiniLM-L6-v2 | Majority of Mac users |
| Desktop GPU | NVIDIA/AMD discrete, 16GB+ RAM | 7B Q4 (llama.cpp + CUDA/ROCm) | nomic-embed-text | Power desktop users |
| Desktop CPU | x86/ARM, 16GB+ RAM, no discrete GPU | 7B Q4 (llama.cpp CPU) | all-MiniLM-L6-v2 | Slower but functional |
| Desktop Constrained | 8GB RAM, no discrete GPU | 3B Q4 (llama.cpp CPU) | all-MiniLM-L6-v2 | Minimum viable |
| Mobile High | iPhone 15 Pro+, iPad M-series | 3B Q4 (MLX) | all-MiniLM-L6-v2 | On-device inference |
| Mobile Base | iPhone 12+, 4GB+ RAM | 1.5B Q4 (MLX) | all-MiniLM-L6-v2 (quantized) | Classification only |
| Mobile Constrained | Android, 4GB+ RAM | 1.5B Q4 (llama.cpp) | all-MiniLM-L6-v2 (quantized) | Classification only |

These profiles are auto-detected. The user never sees them. Power users can override in Settings.

---

## What Moves to Sprint 4

The original build map has Sprint 4 as "Becomes Undeniable" with: Relationship Intelligence, Learning & Adaptation, Privacy Dashboard (full), Mobile Parity, Launch Prep.

**Sprint 4 revised scope (given Sprint 3 changes):**
- Relationship Intelligence (social graph, birthday tracking, contact frequency)
- Full Privacy Dashboard (Proof of Privacy with cryptographic signing, data export/wipe)
- Alter Ego mode fully verified end-to-end (communication style matching polished, all action types autonomous)
- OS-level sandboxing configuration (App Sandbox, seccomp/AppArmor, AppContainer)
- Reproducible builds
- Mobile feature parity for Sprint 3 features (financial dashboard, forms, health on mobile)
- Performance optimization (inference speed, battery, memory)
- Launch preparation (documentation, website, marketing, open-source repo, community)
- Sprint 3→4 features that slip (if any)

**Learning & Adaptation is partially absorbed into Sprint 3:** Communication style learning (Step 11) is the core of "Learning & Adaptation." Sprint 4 expands this to decision pattern recognition and preference learning across domains.

---

## Risk Assessment

### High Risk
- **Step 9 (Runtime Ownership):** Native inference involves Rust FFI, platform-specific GPU backends, multi-GB memory management. If this doesn't work reliably across hardware profiles, the entire sprint is blocked. Mitigation: aggressive testing on real hardware, Ollama as fallback path (already built).
- **Mobile inference (Step 14):** MLX on iOS and llama.cpp on Android are both relatively new for production apps. Model size constraints on mobile may limit capability below the "oh shit" threshold for some tasks. Mitigation: task routing ensures heavy work goes to desktop; mobile handles classification and display.

### Medium Risk
- **Communication style matching quality (Step 11):** A 7B local model may not produce email drafts that genuinely sound like the user. The style profile helps, but there's a quality ceiling. Mitigation: style score visibility, user correction feedback loop, and the Alter Ego launch requirement means this MUST be good enough by Sprint 4.
- **Plaid integration (Step 10):** Plaid requires a developer account, API keys, and ongoing costs. As a premium feature this is fine, but the approval process and testing require real bank accounts. Mitigation: CSV/OFX remains the free-tier path; Plaid is additive.

### Low Risk
- **Form automation (Step 12):** PDF parsing libraries are mature. The challenge is field mapping accuracy, which improves with the knowledge graph. Low risk because the feature degrades gracefully — worst case, the user fills in what Semblance misses.
- **Health integration (Step 13):** Apple HealthKit API is well-documented. The correlation engine is statistical code, not LLM-dependent. Low risk technically; moderate UX risk in presenting correlations without implying medical advice.

---

## Test Targets

| Step | Estimated New Tests | Running Total |
|------|-------------------|---------------|
| Step 9 | 120-150 | ~1,360-1,390 |
| Step 10 | 60-80 | ~1,420-1,470 |
| Step 11 | 70-90 | ~1,490-1,560 |
| Step 12 | 60-80 | ~1,550-1,640 |
| Step 13 | 50-70 | ~1,600-1,710 |
| Step 14 | 80-100 | ~1,680-1,810 |
| Step 15 | 40-60 | ~1,720-1,870 |

**Sprint 3 target: 1,700-1,900 total tests passing.** Privacy audit clean on every step.

---

## The Bar

Sprint 2 made Semblance useful. Sprint 3 makes it powerful.

The bar for "powerful" is: a non-technical user downloads Semblance on their MacBook. They open it. Within 5 minutes, the AI is running. They connect their email and calendar. The Knowledge Moment fires with genuine compound intelligence — semantic search, not keyword matching. Over the first week, Semblance handles 30+ actions autonomously. It categorizes their spending, fills out an expense report, drafts replies in their voice, and tells them their sleep suffers when they have too many evening meetings. The weekly digest says "I saved you 4 hours 15 minutes this week."

They never opened a terminal. They never chose a model. They never configured anything beyond naming their AI and connecting their accounts.

That's the bar. Sprint 3 must clear it.
