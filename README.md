# Semblance

**Your Intelligence. Your Device. Your Rules.**

[![License: MIT OR Apache-2.0](https://img.shields.io/badge/License-MIT%20%7C%20Apache--2.0-blue)](LICENSE)
[![Privacy Audit](https://img.shields.io/badge/Privacy%20Audit-Passing-green)]()
[![Version](https://img.shields.io/badge/Version-1.0.0-blue)]()

Semblance is a fully local, self-hosted sovereign personal AI. It ingests your emails, files, calendar, messages, health data, financial records, and browser history into a local knowledge graph. It reasons about your life using locally-running language models. It acts as your agent in the world.

Your data never leaves your device. Ever.

Semblance is not a chatbot. It is not an assistant. It is your digital semblance — a representation of you that understands your world, acts on your behalf, and is architecturally incapable of betraying your trust.

---

## Why Semblance

Cloud AI assistants start every session at zero. They know nothing about you beyond what you paste into a chat window. To know more, they'd need your data on their servers — and that makes you the product.

Semblance takes the opposite approach. Because everything runs locally, it has access to *all* your data — permanently, compounding, growing more capable every day. No cloud AI can match this without becoming surveillance infrastructure.

**More capable because it's private. Trustworthy because you can verify it.**

---

## The 5 Inviolable Rules

These are not guidelines. They are architectural constraints enforced at the OS level, verified by automated audits, and confirmed by the open source code you're reading right now.

### 1. Zero Network in AI Core

The AI Core process — the part that reasons about your life — has **zero network access**. No HTTP libraries, no WebSockets, no DNS resolution. This is enforced at the import level (automated scanning) and the OS level (sandbox entitlements). The Core cannot phone home because it is architecturally incapable of it.

### 2. Gateway Only

All external communication flows through a single, auditable Gateway process. The Gateway accepts only typed, schema-validated action requests over local IPC. Every request must match a user-authorized service on your personal allowlist. If it's not on your list, it doesn't go out.

### 3. Action Signing and Audit Trail

Every action the Gateway executes is cryptographically signed, logged to a tamper-evident append-only audit trail *before* execution, and verified after. You can review every outbound action Semblance has ever taken — what it did, why it did it, what data it used, and how much time it saved you.

### 4. No Telemetry

Zero analytics. Zero crash reporting. Zero usage tracking. Zero third-party SDKs that phone home. Not even opt-in. Not even "anonymous." The architecture makes telemetry impossible, not optional.

### 5. Local Only Data

All data stays on your device. Knowledge graph, embeddings, preferences, action history — everything. No cloud sync. No cloud backup. If your device is off, your data is inaccessible. That is the point.

---

## Features

### Free (Core Product)

- **Universal Inbox** — Email, calendar, and notifications unified in one local view
- **Knowledge Graph** — Your digital life organized as an interconnected graph of entities, relationships, and events
- **Proactive Context** — Semblance surfaces relevant information before you ask — meeting prep, follow-up reminders, pattern detection
- **Web Search & Fetch** — AI-powered web research through the Gateway, with full audit trail
- **Quick Capture** — Capture thoughts, notes, and tasks from anywhere on your device
- **Style Learning** — Semblance learns your writing style for drafts that sound like you
- **Daily Digest** — Morning summary of what matters today, what happened yesterday, and what's coming up
- **Chat-About-Document** — Ask questions about any local file — PDFs, emails, notes, spreadsheets
- **Network Monitor** — Real-time visibility into every outbound connection

### Autonomy Tiers

Every action can operate at three trust levels, configured per domain:

| Tier | Name | Behavior |
|------|------|----------|
| 1 | **Guardian** | Prepares actions, shows preview, waits for your approval |
| 2 | **Partner** | Routine actions autonomous, novel/high-stakes ask first (default) |
| 3 | **Alter Ego** | Acts as you for nearly everything, interrupts only for genuinely high-stakes decisions |

### Digital Representative ($18/month)

When you're ready for Semblance to act on your behalf:

- **Alter Ego Mode** — Full autonomous operation with Semblance acting as your digital representative
- **Morning Brief** — Proactive daily briefing with actions already queued
- **Visual Knowledge Graph** — Interactive 3D visualization of your knowledge graph
- **Adversarial Self-Defense** — Dark pattern detection, subscription tracking, financial advocacy
- **Import Everything** — Browser history, notes, photos, messaging archives — all local
- **Living Will** — Encrypted digital twin export that you control
- **Semblance Witness** — Cryptographic attestation of every action for provable trust
- **Inheritance Protocol** — Pre-authorized posthumous actions for digital legacy
- **Representative Email** — Style-matched email drafting and autonomous responses
- **Subscription Cancellation** — Automated workflows to cancel forgotten services
- **Form Automation** — PDF auto-fill, smart field mapping for bureaucratic forms
- **Health & Wellness** — HealthKit integration, pattern correlation, local health insights
- **Financial Awareness** — Transaction categorization, duplicate charge detection, spending patterns

### Pricing

| Plan | Price |
|------|-------|
| **Free** | $0 — Core product, no limits, no trial |
| **Digital Representative** | $18/month |
| **Lifetime** | $349 one-time |
| **Founding Member** | $199 lifetime (first 500 users) |
| **Family** | $27/month or $499 lifetime (up to 5 users) |

---

## Architecture

Semblance runs as two isolated processes with a strict security boundary between them:

```
+-------------------------------+     Local IPC     +----------------------------+
|          AI CORE              | <===============> |      SEMBLANCE GATEWAY     |
|                               |   (typed, signed  |                            |
|  - LLM inference (Ollama)     |    action requests |  - Sole network access     |
|  - Knowledge graph (LanceDB)  |    over Unix sock/ |  - Allowlist enforcement   |
|  - Entity resolution          |    named pipe)     |  - Rate limiting           |
|  - Agent orchestration        |                    |  - Cryptographic signing   |
|  - Task routing               |                    |  - Audit trail (SQLite)    |
|                               |                    |                            |
|  ZERO NETWORK ACCESS          |                    |  Schema-validated only     |
+-------------------------------+                    +----------------------------+
        |                                                      |
        v                                                      v
  Local Storage                                         User's Services
  - LanceDB (vectors)                                   - Email (IMAP/SMTP)
  - SQLite (structured)                                  - Calendar (CalDAV)
  - Model weights                                        - Authorized APIs
  - Embeddings                                           - (allowlist only)
```

**Desktop:** Tauri 2.0 (Rust + Web frontend) with OS-level sandboxing
**Mobile:** React Native with on-device inference (MLX on iOS, llama.cpp on Android)
**LLM:** Ollama (default), llama.cpp, or MLX — user-selectable, always local
**Storage:** LanceDB (vectors) + SQLite (structured) — no server process, no cloud

Mobile is a peer device, not a companion. It runs full local inference and hands off complex tasks to desktop over your local network using mutual TLS authentication.

Detailed architecture documentation coming soon.

---

## Privacy Verification

Don't take our word for it. Verify it yourself.

### Automated Privacy Audit

```bash
# Run the privacy audit — scans all imports in AI Core for network capability
node scripts/privacy-audit/index.js
```

The privacy audit scans every import in `packages/core/` for networking libraries (`fetch`, `http`, `https`, `axios`, `ws`, etc.) and fails if any are found. This runs on every commit in CI.

### Manual Verification

```bash
# Check: AI Core has no network imports
grep -rn "import.*fetch\|import.*http\|import.*axios\|import.*ws\b" packages/core/

# Check: No telemetry packages in any dependency
grep -rn "segment\|mixpanel\|amplitude\|posthog\|sentry\|bugsnag" package.json packages/*/package.json

# Check: No @semblance/dr (proprietary) imports in open core
grep -rn "@semblance/dr" packages/core/

# Watch: Real-time network connections via Network Monitor (in-app)
```

### Open Source

The entire core product is open source under MIT + Apache 2.0 dual license. The AI Core, Gateway, privacy audit, knowledge graph, and all free-tier features are publicly auditable. You can read every line of code that touches your data.

The Digital Representative module (`@semblance/dr`) is proprietary — it contains the implementation logic for autonomous agency features. But every action it takes still flows through the open source Gateway and audit trail. You can always verify *what* Semblance does on your behalf, even when the *how* is proprietary.

---

## Quick Start

### Prerequisites

- **Node.js** 20+
- **pnpm** 9+
- **Rust** (stable toolchain) — for Tauri desktop app
- **Ollama** — for local LLM inference

### Installation

```bash
# Clone the repository
git clone https://github.com/skygkruger/semblance-core.git
cd semblance-core

# Install dependencies
pnpm install

# Run the privacy audit (verify before first use)
node scripts/privacy-audit/index.js

# Start the desktop app in development mode
pnpm --filter @semblance/desktop dev
```

### Building from Source

```bash
# TypeScript type checking
pnpm typecheck

# Run all tests
pnpm test

# Build the desktop app
pnpm --filter @semblance/desktop build
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, architecture overview, testing guide, and PR process.

**Security issues:** Please report security vulnerabilities privately to security@semblance.run. Do not open public issues for security bugs.

---

## License

Dual licensed under [MIT](LICENSE-MIT) and [Apache 2.0](LICENSE-APACHE).

Copyright (c) 2026 Veridian Synthetics.

---

## About

Semblance is built by [Veridian Synthetics](https://semblance.run) — a company founded on the belief that ethical technology can compete with extractive systems. Users respond to respectful design. You don't need an empire to build what matters.

15% of Digital Representative revenue funds free emotional wellness sanctuaries through the Open Sanctuary Model.

**The promise:** We were promised connection. We got extraction. Semblance is the correction.
