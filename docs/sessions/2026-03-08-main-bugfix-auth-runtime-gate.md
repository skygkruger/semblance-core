# Session: 2026-03-08 - main

## Git State
- Branch: `main`
- Commit: `4232e1d` - fix: model_path deserialization, connector auth type routing, onboarding runtime gate
- Uncommitted: No (only untracked scratch files)

## Work Context
**Active WO:** None (bug fix pass)
**Task:** Fix 3 bugs: serde deserialization crash, non-OAuth connector auth, missing model-loaded gate on onboarding

**Progress:**
- Bug 1: Added `#[serde(default)]` to `model_path` in `GenerateRequest` and `EmbedRequest` (native_runtime.rs)
- Bug 2: Updated `handleConnectorAuth` in bridge.ts to differentiate by `authType` from connector registry (native -> immediate success, api_key -> requiresCredentials, oauth2/pkce/oauth1a -> existing OAuth flow)
- Bug 3: Added `runtimeReady` prop to InitializeStep, listening for `semblance://native-model-loaded` event in OnboardingFlow, 30s timeout fallback if event never fires
- /review ran and caught 2 issues: missing Storybook parity (fixed), missing timeout fallback (fixed)
- All verification passed: tsc clean, 477 test files / 6213 tests / 0 failures, Tauri build successful
- CI green on push

## Previous Session Work (same day)
- Commit `b4bd889`: Navigation restructure — 4-section grouped sidebar, 9 new desktop screens, mobile Dashboards tab
- Commit `43158ef`: Design token import fix, Tailwind/mobile token parity

## Current Approach
Incremental bug fixes from prompt-provided specifications, verified with tsc + vitest + tauri build + /review before commit.

## What's Working
- Desktop binary builds and installs (MSI 83MB, NSIS 59MB)
- All 109 Storybook components wired into production
- Navigation restructure with 4 grouped sections
- 9 new desktop screens (Adversarial, LivingWill, Witness, Inheritance, Biometric, Backup, Voice, Location, CloudStorage)
- Mobile Dashboards tab with hub screen
- Connector auth now properly differentiates native/api_key/oauth flows
- Onboarding gates Continue button on model loaded event

## What's Not Working
- Binary is unsigned (SmartScreen warning)
- Pre-existing: var() in React inline styles for font families throughout Onboarding pages
- Pre-existing: 5 instances of silent .catch(() => {}) in OnboardingFlow.tsx
- No tests for the 3 new bug fixes (flagged by review, not blocking)

## Next Steps (in order)
1. User is testing the installer — await feedback
2. Step 33 final validation continues (Sprint 6 hardening)
3. Consider adding test coverage for connector auth branching and runtimeReady gate
4. Address pre-existing inline var() font references in Onboarding if prioritized

## Build Artifacts
- MSI: `packages/desktop/src-tauri/target/release/bundle/msi/Semblance_0.1.0_x64_en-US.msi`
- NSIS: `packages/desktop/src-tauri/target/release/bundle/nsis/Semblance_0.1.0_x64-setup.exe`
- Raw EXE: `packages/desktop/src-tauri/target/release/semblance-desktop.exe`

## Key Files Modified This Session
- `packages/desktop/src-tauri/src/native_runtime.rs` — serde(default) on model_path
- `packages/desktop/src-tauri/sidecar/bridge.ts` — connector auth type routing
- `packages/desktop/src/screens/OnboardingFlow.tsx` — runtimeReady state + event listener + timeout
- `packages/semblance-ui/pages/Onboarding/InitializeStep.{types,web,native,stories}.tsx` — runtimeReady prop

## Notes
- Connector registry has 5 auth types: oauth2, pkce, oauth1a, api_key, native
- The OAuth flow for pkce/oauth1a uses the same code path as oauth2 — PKCE code_challenge and OAuth1a request-token flows are pre-existing gaps, not introduced here
- The `native-model-loaded` event is emitted by bridge.ts after `sendCallback('native_load_model')` succeeds, prefixed to `semblance://native-model-loaded` by Rust lib.rs line 267

---
*Session saved: 2026-03-08T20:10Z*
