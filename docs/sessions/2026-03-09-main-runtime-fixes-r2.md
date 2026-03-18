# Session: 2026-03-09 - main

## Git State
- Branch: `main`
- Commit: `5380bc0` - fix: runtime fixes R2 — status-update emit, IPC field mapping, crash guards, onboarding gate, Intent UX
- Uncommitted: No (clean working tree, untracked files are temp/docs only)
- CI: Green (all 3 jobs: Privacy Audit, TypeScript Check, Test Suite)
- Tests: 477 files, 6214 tests, 0 failures

## Work Context
**Active WO:** None (executing RUNTIME_FIXES_R2.md spec from user)
**Task:** Execute 5 runtime fixes from RUNTIME_FIXES_R2.md, run full verification pipeline, build, commit, push
**Progress:** All 5 fixes complete, verified, built, committed, pushed, CI green

## Fixes Completed

### Fix 1: Settings shows "Loading..." forever
- Sidecar never emitted `status-update` event after initialization
- Added `emit('status-update', {...})` at end of handleInitialize in bridge.ts

### Fix 2: Connectors doing nothing
- Frontend `ipcSend()` sent `{ action, payload }` but Rust expects `{ action, params }`
- Fixed field mapping in `packages/desktop/src/ipc/commands.ts`

### Fix 3: Indexing crashes app
- Unhandled exceptions killed sidecar process
- Added `process.on('uncaughtException')` and `process.on('unhandledRejection')` handlers
- Added knowledge null check before indexing
- Added per-file indexing progress logs

### Fix 4: Onboarding 30-second flash on restart
- Frontend defaults onboardingComplete=false and shows onboarding while waiting for sidecar
- Added `sidecarReady` state gate with WireframeSpinner loading screen in App.tsx

### Fix 5: Intent UX issues
- 5A: Moved Intent/Hard Limits button below SettingsNavigator
- 5B: Added back button to IntentScreen (both loading and main headers)
- 5C: Changed Create/Save buttons from inline Veridian (#6ECFA3) to `btn btn--opal btn--sm`

## Verification Pipeline Results
- `/smoke`: Gateway + PrefsDB pass, no crashes, no MODULE_NOT_FOUND
- `/diagnose`: 10/10 integration tests pass
- `/audit-deep`: 0 critical, 3 moderate (pre-existing), 4 minor
- `/preflight`: All checks pass, build produced MSI + NSIS EXE

## Build Artifacts
- MSI: `packages/desktop/src-tauri/target/release/bundle/msi/Semblance_0.1.0_x64_en-US.msi`
- NSIS: `packages/desktop/src-tauri/target/release/bundle/nsis/Semblance_0.1.0_x64-setup.exe`

## What's Working
- Sidecar starts cleanly, models load (with Rust backend)
- IPC pipe connects in 1ms (per-user suffix fix from previous session)
- Chat inference works end-to-end
- All 6214 tests pass
- Desktop binary builds successfully

## What's Not Working (pre-existing, not regressions)
- 6 Sprint 5 sovereignty screens have no useEffect data loading (AdversarialDashboard, Backup, CloudStorageSettings, Inheritance, LivingWill, Witness)
- 11 empty callbacks in SettingsScreen (onExportData, onDeleteAllData, etc.)
- No SEMBLANCE_ env vars — OAuth connectors need env setup to function

## Next Steps (in order)
1. Wire data loading (useEffect + IPC) for 6 empty sovereignty screens
2. Implement Settings empty callbacks (export, delete, sign out)
3. Set up OAuth env vars for connector testing
4. User testing of the new build — verify Settings shows model, indexing doesn't crash, no onboarding flash

## Blockers
- None currently

## Notes
- Previous session fixes (timeout increases, IPC pipe path, SocketTransport promise leak) in commit `3758dc5`
- bridge.ts is now ~4300 lines — the largest single file in the project
- The smoke test can't fully verify "Ready" state without Rust backend (native_status callbacks need Rust)
- Audit found HealthDashboardScreen has `hasHealthKit={false}` hardcoded — correct for Windows but needs platform detection for mobile

---
*Session saved: 2026-03-09T19:57:00-06:00*
