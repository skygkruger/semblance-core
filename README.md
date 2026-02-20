# Semblance

**Your Intelligence. Your Device. Your Rules.**

![Status](https://img.shields.io/badge/Sprint_1-In_Development-blue)

Semblance is a fully local, self-hosted sovereign personal AI. It ingests your emails, files, calendar, messages, health data, financial records, and browser history into a local knowledge graph. It reasons about your life using locally-running language models. It acts as your agent in the world. Your data never leaves your device. Ever. Semblance is not a chatbot or an assistant — it is your digital semblance, a representation of you that understands your world, acts on your behalf, and is architecturally incapable of betraying your trust.

---

## Installation

> Coming soon — Sprint 1 in progress.

## Architecture Overview

Semblance runs as two isolated processes:

- **AI Core** — LLM, knowledge graph, and agent orchestration. Zero network access, enforced at the OS level.
- **Semblance Gateway** — The sole network-capable process. Accepts only typed, schema-validated action requests via local IPC. Every action is cryptographically signed and logged before execution.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Privacy Guarantee

Privacy is not a feature of Semblance. It is the architecture. The AI Core process has no network entitlement at the OS level. All data stays on your device. All outbound connections are logged, auditable, and visible in real time. The code is open source so you can verify these claims yourself.

See [docs/PRIVACY.md](docs/PRIVACY.md) for details.

## Contributing

> Contributing guidelines coming soon.

## License

[MIT](LICENSE) — Copyright (c) 2026 Veridian Synthetics
