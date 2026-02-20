# STEP 1: Repository Scaffolding — semblance-core

## Context

You are setting up the foundational repository for Semblance, a fully local sovereign personal AI. This is Step 1 of Sprint 1. Your job is to create the project skeleton — directory structure, configuration files, canonical documents, and bare app shells. NO feature code. NO business logic. Just the scaffolding that everything else builds on.

Read CLAUDE.md in the project root FIRST. It is the governing document for all decisions. Read docs/DESIGN_SYSTEM.md before touching anything UI-related.

## What To Build

### 1. Repository Root

Initialize a monorepo with the following root files:

- `CLAUDE.md` — Already provided in the project. This is the canonical instruction set. Do not modify it.
- `docs/DESIGN_SYSTEM.md` — Already provided in the project. Do not modify it.
- `docs/ARCHITECTURE.md` — Create a placeholder with the section header "# Semblance Architecture" and a note: "Full architecture documentation — to be completed in Sprint 1."
- `docs/PRIVACY.md` — Create a placeholder with the section header "# Semblance Privacy Architecture" and a note: "Privacy architecture and audit methodology — to be completed in Sprint 1."
- `LICENSE` — MIT License, copyright Veridian Synthetics 2026.
- `README.md` — Brief project README with:
  - Project name: Semblance
  - Tagline: Your Intelligence. Your Device. Your Rules.
  - One-paragraph description: what Semblance is (fully local sovereign personal AI, never touches a cloud, acts as your digital twin)
  - Status badge: "Sprint 1 — In Development"
  - Section stubs for: Installation, Architecture Overview, Privacy Guarantee, Contributing, License
- `.gitignore` — Standard Node.js + Rust + Tauri + React Native ignores. Include: node_modules, target/, dist/, build/, .env, *.sqlite, *.db, .DS_Store

### 2. Monorepo Configuration

Use **npm workspaces** (not Turborepo, not Lerna — keep it simple for now). 

Root `package.json`:
- name: `semblance-core`
- private: true
- workspaces: `["packages/*"]`
- scripts: `"privacy-audit": "node scripts/privacy-audit/index.js"`

Root `tsconfig.json`:
- strict: true
- target: ES2022
- module: ES2022
- moduleResolution: bundler
- Paths configured for cross-package imports

### 3. Directory Structure

Create the EXACT structure specified in CLAUDE.md. Every directory listed below must exist with a `.gitkeep` or a minimal `package.json` as appropriate:

```
packages/
├── core/                        # AI Core — NO NETWORK ACCESS
│   ├── llm/                     # LLM integration
│   ├── knowledge/               # Knowledge graph, embeddings
│   ├── agent/                   # Orchestration, tool-use
│   ├── types/                   # Shared TypeScript types
│   ├── package.json             # name: @semblance/core
│   └── tsconfig.json            # extends root, strict: true
├── gateway/                     # Semblance Gateway — SOLE NETWORK ACCESS
│   ├── ipc/                     # IPC protocol handler
│   ├── services/                # Service adapters (email, calendar, etc.)
│   ├── security/                # Action signing, allowlist, rate limiting
│   ├── audit/                   # Append-only audit trail
│   ├── package.json             # name: @semblance/gateway
│   └── tsconfig.json
├── desktop/                     # Tauri desktop application
│   ├── src-tauri/               # Rust backend (Tauri scaffold)
│   ├── src/                     # Web frontend
│   ├── package.json             # name: @semblance/desktop
│   └── tsconfig.json
├── mobile/                      # React Native mobile application
│   ├── src/                     # App source
│   ├── package.json             # name: @semblance/mobile
│   └── tsconfig.json
└── semblance-ui/                # Shared component library
    ├── components/              # UI components
    ├── tokens/                  # Design tokens
    ├── hooks/                   # Shared React hooks
    ├── package.json             # name: @semblance/ui
    └── tsconfig.json

scripts/
└── privacy-audit/
    └── index.js                 # Placeholder — see section 6

tests/
├── privacy/                     # Privacy guarantee tests
├── gateway/                     # Gateway isolation tests
└── integration/                 # End-to-end tests
```

### 4. Package Configurations

Each package under `packages/` gets its own `package.json` and `tsconfig.json`.

**@semblance/core** (`packages/core/package.json`):
- No dependencies yet (those come in Step 3)
- CRITICAL: Add a comment or field noting this package must NEVER have network-capable dependencies
- TypeScript strict mode

**@semblance/gateway** (`packages/gateway/package.json`):
- Dependencies: `zod` (schema validation), `nanoid` (ID generation), `better-sqlite3` (audit trail)
- TypeScript strict mode

**@semblance/desktop** (`packages/desktop/`):
- Initialize a Tauri 2.0 project using `npm create tauri-app@latest` or equivalent scaffolding
- Use React + TypeScript as the frontend framework
- The Tauri app should launch and show a centered page with:
  - The text "Semblance" in the display font style
  - The tagline "Your Intelligence. Your Device. Your Rules." below it
  - A status line: "Sprint 1 — Scaffolding Complete"
- This is the bare shell. No routing, no state management, no components beyond this landing screen.

**@semblance/mobile** (`packages/mobile/`):
- Initialize a React Native project (use React Native CLI, not Expo — we need native module support for future on-device inference)
- Same landing screen content as desktop: "Semblance" + tagline + status
- Add `react-native-reanimated` as a dependency (per locked-in tech stack)

**@semblance/ui** (`packages/semblance-ui/`):
- Create the design token files as specified in DESIGN_SYSTEM.md:
  - `tokens/colors.ts` — Export all color tokens (primary palette + extended palette, light + dark)
  - `tokens/typography.ts` — Export type scale, weights, font stack definitions
  - `tokens/spacing.ts` — Export spacing scale
  - `tokens/shadows.ts` — Export shadow definitions
  - `tokens/motion.ts` — Export duration, easing, animation preset values
  - `tokens/breakpoints.ts` — Export responsive breakpoint values
- `index.ts` — Re-export all tokens
- No components yet — just the token foundation

### 5. Design Token Implementation

The token files in `packages/semblance-ui/tokens/` must contain the EXACT values from DESIGN_SYSTEM.md. Do not improvise or approximate. Reference the design system document directly.

Example for `colors.ts`:
```typescript
export const colors = {
  // Primary Palette
  bgDark: '#1A1D2E',        // Deep Ink
  bgLight: '#FAFBFC',       // Soft White
  primary: '#4A7FBA',       // Semblance Blue
  accent: '#E8A838',        // Warm Amber
  success: '#3DB87A',       // Living Green
  attention: '#E85D5D',     // Alert Coral
  muted: '#8B93A7',         // Muted Slate
  
  // Extended Palette
  primaryHover: '#3D6CA3',
  primaryActive: '#325A8A',
  // ... all 20 extended tokens from DESIGN_SYSTEM.md
} as const;
```

Follow this pattern for all token files. Use `as const` for type safety. Every value must match the design system exactly.

### 6. Privacy Audit Placeholder

Create `scripts/privacy-audit/index.js` with a basic implementation that:
- Scans all `.ts` and `.js` files under `packages/core/`
- Checks for imports of banned network modules: `fetch`, `http`, `https`, `net`, `dgram`, `dns`, `tls`, `axios`, `got`, `node-fetch`, `undici`, `superagent`, `socket.io`, `ws`, `XMLHttpRequest`, `WebSocket`
- Also checks for banned Rust network crates if any `.rs` files exist: `reqwest`, `hyper`, `tokio::net`, `std::net`
- Exits with code 0 if clean, code 1 if violations found
- Prints a clear report of any violations with file paths and line numbers

This does not need to be sophisticated yet. A regex scan is fine for Step 1. It will be hardened in Step 2.

### 7. Git Setup

- Initialize git repo
- Make an initial commit with message: `feat: initialize semblance-core repository scaffolding`
- All files from this step should be in this single commit
- Do NOT push yet — wait for Orbital Director review

## What NOT To Build

- No LLM integration (Step 3)
- No Gateway IPC protocol implementation (Step 2)
- No knowledge graph or embedding pipeline (Step 4)
- No agent orchestration logic
- No real UI components (just the bare shells and tokens)
- No CI/CD pipeline yet
- No external service integrations

## Exit Criteria

Step 1 is complete when ALL of the following are true:

1. ✅ `npm install` runs successfully from the repo root
2. ✅ All packages resolve in the workspace
3. ✅ TypeScript compiles with zero errors across all packages (`npx tsc --noEmit` from root)
4. ✅ The privacy audit script runs and passes (exits 0) — because there's no code in Core yet, it should find nothing
5. ✅ The Tauri desktop app launches and displays the landing screen
6. ✅ The React Native mobile app launches and displays the landing screen
7. ✅ All design token files exist with values matching DESIGN_SYSTEM.md exactly
8. ✅ The directory structure matches CLAUDE.md exactly
9. ✅ CLAUDE.md and DESIGN_SYSTEM.md are in their canonical locations (root and docs/ respectively)
10. ✅ A single clean git commit contains all scaffolding

## After Completion

Report back with:
- Confirmation of each exit criteria (pass/fail)
- Any decisions you made that weren't explicitly specified (so Orbital Directors can verify)
- Any issues encountered and how you resolved them
- File count and rough line count for the initial commit

Do NOT proceed to Step 2. Wait for Orbital Director review.
