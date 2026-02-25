# Contributing to Semblance

Thank you for your interest in contributing to Semblance. This guide will help you get set up and understand how the project is structured.

---

## Code of Conduct

Be respectful. Be constructive. Remember that Semblance handles people's most sensitive data — treat that responsibility seriously in every contribution.

---

## Development Setup

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Runtime |
| pnpm | 9+ | Package manager |
| Rust | stable | Tauri backend, performance-critical paths |
| Ollama | latest | Local LLM inference |

### Getting Started

```bash
# Clone the repository
git clone https://github.com/skygkruger/semblance-core.git
cd semblance-core

# Install dependencies
pnpm install

# Run the privacy audit (should pass before any development)
node scripts/privacy-audit/index.js

# Type check
pnpm typecheck

# Run tests
pnpm test

# Start the desktop app in dev mode
pnpm --filter @semblance/desktop dev
```

---

## Architecture Overview

Semblance runs as two isolated processes:

- **AI Core** (`packages/core/`) — LLM inference, knowledge graph, agent orchestration. **Zero network access.** This is the most important architectural constraint in the project.
- **Gateway** (`packages/gateway/`) — The sole network-capable process. Handles all external communication through typed, schema-validated action requests.

Communication between them uses local IPC (Unix domain socket / named pipe).

### Package Structure

| Package | Purpose | Network Access |
|---------|---------|---------------|
| `packages/core/` | AI reasoning, knowledge graph, agent | **NONE** |
| `packages/gateway/` | External communication, audit trail | Yes (sole owner) |
| `packages/desktop/` | Tauri desktop application | Via Gateway |
| `packages/mobile/` | React Native mobile application | Via Gateway |
| `packages/semblance-ui/` | Shared component library | **NONE** |

### Boundary Rules

- `packages/core/` NEVER imports from `packages/gateway/` or any networking code
- `packages/gateway/` NEVER imports from `packages/core/` knowledge graph or user data
- `packages/semblance-ui/` is pure presentation — no business logic, no side effects

---

## Testing

### Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Privacy audit
node scripts/privacy-audit/index.js
```

### Test Categories

- **Privacy tests** (`tests/privacy/`) — Verify AI Core has no network capability
- **Gateway tests** (`tests/gateway/`) — Schema validation, allowlist, audit trail
- **Integration tests** (`tests/integration/`) — End-to-end action flows
- **UI tests** (`tests/ui/`) — Component structure and design token compliance
- **Launch tests** (`tests/launch/`) — Documentation and repo hygiene

### Writing Tests

Every agent action must have tests verifying:
1. The action is logged before execution
2. `estimatedTimeSavedSeconds` is present in the audit trail
3. Guardian/Partner/Alter Ego tier behavior
4. Undo capability where applicable

---

## Pull Request Process

1. Fork the repository and create a feature branch
2. Make your changes following the code standards below
3. Run the full verification suite:
   ```bash
   pnpm typecheck        # TypeScript must be clean
   pnpm test             # All tests must pass
   node scripts/privacy-audit/index.js  # Privacy audit must pass
   ```
4. Open a PR using the [pull request template](.github/PULL_REQUEST_TEMPLATE.md)
5. Wait for CI and code review

### Commit Messages

Use conventional commits:

- `feat:` — New feature
- `fix:` — Bug fix
- `refactor:` — Code restructuring
- `test:` — Adding tests
- `docs:` — Documentation
- `security:` — Security-critical changes (Gateway, IPC, audit trail, sandboxing)
- `chore:` — Maintenance

### What Belongs Where

| Question | If Yes | If No |
|----------|--------|-------|
| Does it reason about user data? | `packages/core/` | Continue |
| Does it communicate externally? | `packages/gateway/` | Continue |
| Is it a UI component? | `packages/semblance-ui/` | Continue |
| Is it platform-specific? | `packages/desktop/` or `packages/mobile/` | Ask |

---

## Code Standards

- **TypeScript strict mode** — `"strict": true`, no `any` types
- **Explicit types** — All function parameters and return types typed
- **Zod schemas** — Runtime validation for external data (IPC, file parsing, API responses)
- **No hardcoded secrets** — CI scans for API keys and tokens
- **No telemetry** — Never add analytics, tracking, or crash reporting
- **Design tokens** — UI components use design tokens, not hardcoded values

---

## Storybook

The component library has a Storybook setup for visual development:

```bash
cd packages/semblance-ui
pnpm storybook
```

When adding or modifying UI components, add or update the corresponding `.stories.tsx` file.

---

## Security Reporting

If you discover a security vulnerability, please report it privately to **security@semblance.run**. Do not open a public issue for security bugs. We will acknowledge receipt within 48 hours.

---

## License

By contributing, you agree that your contributions will be licensed under the project's dual MIT + Apache 2.0 license.
