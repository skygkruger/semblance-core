# Alter Ego Mode Is Live: Meet Semblance, Your Sovereign Personal AI

*February 2026 — Veridian Synthetics*

What if your AI assistant remembered everything? Not because it uploaded your life to a server farm, but because it lived on your device, permanently, with access to all your data — and was architecturally incapable of sharing it with anyone?

That's Semblance. And today, it ships with Alter Ego Mode.

---

## What Semblance Is

Semblance is a fully local, self-hosted personal AI. It ingests your emails, files, calendar, messages, health data, financial records, and browser history into a private knowledge graph that lives entirely on your device. It runs local language models to reason about your life. And it acts as your agent in the world — sending emails, managing your calendar, canceling forgotten subscriptions, detecting dark patterns, and filing forms — with every action logged, auditable, and reversible.

It is not a chatbot. It is not an assistant that starts at zero every session. It is your digital semblance — a representation of you that understands your world and gets more capable every day because your data compounds locally instead of evaporating into the cloud.

The free core product gives you a Universal Inbox, knowledge graph, proactive context, daily digest, web search, style learning, and real-time network monitoring. Every feature works completely offline after initial setup.

## The Alter Ego Moment

Alter Ego Mode is the feature we built Semblance to deliver.

When you enable Alter Ego, Semblance stops being a tool you use and becomes a digital representative that acts as you. It responds to routine emails in your voice. It resolves calendar conflicts before you wake up. It cancels subscriptions you forgot about. It detects when a company is charging you twice. It fills out forms. It drafts messages that match your writing style so precisely that recipients cannot tell the difference.

Every action is logged to a tamper-evident audit trail. Every action is reversible. You can review what Semblance did, why it did it, what data it used, and how much time it saved you — down to the second.

Alter Ego is not a single switch. It builds trust progressively through three autonomy tiers. Guardian mode shows you everything before acting. Partner mode handles routine tasks autonomously and asks about novel situations. Alter Ego mode acts as you for nearly everything, interrupting only for genuinely high-stakes decisions.

Most users start at Partner and graduate to Alter Ego within a week — not because we push them there, but because they see the audit trail and realize they trust it more than they trust their own memory.

## Why This Matters

The AI industry has a fundamental architectural problem: to be useful, an AI needs your data; to access your data, it needs a server; and once your data is on someone else's server, you've lost control of it.

Cloud AI assistants handle this by collecting as little as possible and starting fresh each session. That's privacy by limitation — and it's why they feel so shallow. They cannot know you because knowing you would require storing your data, and storing your data would require trust that no cloud provider has earned.

Semblance resolves this by running locally. The AI Core process has zero network access — no HTTP libraries, no WebSocket, no DNS resolution. This isn't a policy. It's an architectural constraint enforced at the import level, the build level, and the OS sandbox level. The privacy audit runs on every commit in CI. A violation blocks the merge.

Because everything is local, Semblance can be maximally useful without any privacy compromise. It has your entire digital life because that life never leaves your device. The capability advantage is permanent and grows every day.

## The Architecture: Two Isolated Processes

Semblance runs as two processes with a hard security boundary:

The AI Core handles all reasoning — LLM inference, knowledge graph queries, entity resolution, agent orchestration. It has access to everything you've ever stored locally. It has zero network access. It cannot phone home because it is architecturally incapable of it.

The Semblance Gateway is the sole process with network capability. It accepts only typed, schema-validated action requests from the AI Core over local IPC. Every request must match a service on your personal allowlist. Every request is cryptographically signed, logged to a tamper-evident audit trail before execution, and verified after. If it's not on your allowlist, it doesn't go out.

This means you can grant Semblance access to your entire digital life and sleep soundly. The part that knows everything about you cannot reach the internet. The part that can reach the internet knows nothing about you beyond structured action requests.

## Sovereignty Features

Alter Ego Mode ships alongside a suite of sovereignty features that give you provable control over your digital life:

**Living Will** creates encrypted exports of your digital twin — your data, your format, your rules. You can create verifiable snapshots with cryptographic attestation.

**Semblance Witness** provides cryptographic proof of every action Semblance has taken on your behalf. Not "we promise we logged it" — mathematically verifiable chain-of-custody for your digital life.

**Inheritance Protocol** allows you to configure pre-authorized posthumous actions. What happens to your digital life when you're gone shouldn't be an afterthought.

**Adversarial Self-Defense** detects dark patterns, tracks subscription creep, identifies duplicate charges, and advocates on your behalf with companies designed to make cancellation hard.

**Morning Brief** delivers a proactive daily briefing with actions already queued — conflicts resolved, responses drafted, anomalies flagged. Your day starts organized because Semblance worked while you slept.

All sovereignty features are open source. Their code is publicly auditable. Trust isn't something we ask for — it's something you can verify in the source code.

## Pricing

The free core product has no limits, no trial period, and no feature degradation. Universal Inbox, knowledge graph, proactive context, daily digest, web search, style learning, network monitor — all free, forever.

The Digital Representative tier adds Alter Ego Mode and all sovereignty features for $18 per month or $349 lifetime.

For the first 500 users, we're offering Founding Member pricing: $199 lifetime. That's permanent access to every Digital Representative feature, current and future, for less than a year of ChatGPT Plus.

Fifteen percent of all Digital Representative revenue funds free emotional wellness sanctuaries through the Open Sanctuary Model. Building ethical technology isn't just about privacy architecture — it's about what you do with the revenue.

## The Founding Story

Semblance was built by one person at Veridian Synthetics, a company founded on a simple belief: ethical technology can compete with extractive systems.

We were promised connection. We got extraction. Every "free" service we use is funded by surveillance. Every "AI assistant" is a data collection endpoint wearing a helpful mask. The industry trained us to accept that convenience requires compromise.

It doesn't.

Semblance proves that the most capable personal AI is the one that never sends your data to a server. That privacy isn't a limitation — it's the architectural foundation that makes real capability possible. That you can build software that treats users with respect and still build a sustainable business.

The code is open source. The architecture is auditable. The privacy audit runs on every commit. The claims are verifiable.

Your intelligence. Your device. Your rules.

Welcome to Semblance.

---

*Semblance 1.0.0 is available now at [semblance.run](https://semblance.run). The core product is free. The source code is at [github.com/skygkruger/semblance-core](https://github.com/skygkruger/semblance-core). Founding Member pricing ($199 lifetime) is limited to the first 500 users.*
