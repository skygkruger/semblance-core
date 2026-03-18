# Claude Code Development Guide

This document is for contributors using Claude Code to work on Semblance.

## Session Start Checklist

Before writing any code:
1. Read this file
2. Run `node scripts/privacy-audit/index.js` ΓÇö must pass
3. Run `npx tsc --noEmit` ΓÇö must be clean
4. Run `npx vitest run` ΓÇö must pass

## The Non-Negotiables

**AI Core has zero network access.** `packages/core/` must never import any networking library.
The privacy audit enforces this on every commit. If you're unsure, check first.

**No stubs.** Every function must contain a real implementation.
Empty bodies, hardcoded returns, and no-ops fail code review.

**Runtime verification required.** TypeScript clean + tests passing does not mean done.
After any change to `bridge.ts` or IPC handlers, run:
```bash
echo '{"id":1,"method":"initialize","params":{}}' | node packages/desktop/src-tauri/sidecar/bridge.cjs 2>&1
```
and confirm the sidecar starts without errors.

## Architecture Boundaries

- `packages/core/` ΓÇö AI reasoning, knowledge graph. Zero network imports. No exceptions.
- `packages/gateway/` ΓÇö All external communication. The only network-capable process.
- `packages/desktop/` ΓÇö Tauri desktop shell. No business logic.
- `packages/mobile/` ΓÇö React Native. No business logic.
- `packages/semblance-ui/` ΓÇö Shared UI components. No side effects.

## The Open/Private Boundary

This repo (`semblance-core`) is the open-source sovereign architecture. The Digital Representative module (`@semblance/dr`) is a proprietary extension that loads via the extension registry. Type stubs in `packages/core/finance/`, `packages/core/defense/`, and `packages/core/style/` allow the open core to compile without the DR module installed.

## Available Scripts
```bash
node scripts/privacy-audit/index.js   # Verify AI Core has no network access
node scripts/semblance-verify.js      # Full feature verification
node scripts/preflight.js             # Pre-build checklist
node scripts/data-audit.js            # Data pipeline health
```

## Commit Standards

Use conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `security:`, `chore:`

Security-critical changes (`security:`) require explicit mention of what the change protects against.
