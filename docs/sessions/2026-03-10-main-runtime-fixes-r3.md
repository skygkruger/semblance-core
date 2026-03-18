# Session: 2026-03-10 - main

## Git State
- Branch: `main`
- Commit: `086b31f` - fix: runtime fixes R3 — connector state persistence, graph table creation, onboarding retry, AI name persistence
- Uncommitted: No (clean tracked tree, untracked artifacts only)

## Work Context
**Active WO:** None (direct bugfix session)
**Task:** Fix 4 runtime bugs reported after NSIS install testing
**Progress:** All 4 bugs fixed, plus 2 reviewer flags addressed

## Fixes Applied

### Bug 1 — Connector never shows "Connected"
- `ConnectionsScreen.tsx`: dispatch `SET_CONNECTOR_STATE` on successful auth + success toast
- Flag fix: hydrate from `getConnectedServices()` on mount so state survives restart
- `commands.ts`: new `getConnectedServices()` export (respects screen import boundary test)

### Bug 2 — Knowledge graph "no such table: entities"
- `graph-visualization.ts` `initSchema()`: creates `entities`, `entity_mentions`, `entity_relationships` (CREATE IF NOT EXISTS)
- Flag fix: removed `documents` table from initSchema (DocumentStore owns it, schema mismatch risk)
- `addDocumentNodes` + `getGrowthTimeline` wrapped in try/catch for missing documents table

### Bug 3 — Onboarding re-shows 5-10s on relaunch
- `App.tsx`: `checkOnboarding` retries up to 5x (800ms) when false before concluding first-run
- `fetchModelStatus` extracted to `useCallback`, called after onboarding resolves

### Bug 4 — AI name never persists
- `OnboardingFlow.tsx`: `setAiName` imported as `saveAiNamePref`, NamingYourAI handler calls `await saveAiNamePref(name)`

## Also in this commit (from prior context carry-over)
- Crash-proof indexing: 100MB metadata-only tier, 50K char truncation, 200 chunk cap, 4GB Node heap, GC after batches
- Sidecar log append mode (OpenOptions::new().append(true))
- NSIS hooks kill stale node.exe, Rust startup kills stale processes
- Tauri 2.0 shell API migration in LicenseContext
- .env bundling into sidecar directory
- demo-verify.js script (7-feature runtime gate)
- camelCase knowledge stats, custom checkbox, spinner sizing, Learn More nav fix
- 3 new IPC handlers: get_connected_services, get_connector_config, get_graph_data

## Verification
- TypeScript: 0 errors
- Tests: 477 files, 6214 pass, 0 fail
- demo-verify.js: 7 PASS, 0 FAIL, 3 WARN (expected — Rust backend only)
- Sidecar stderr: zero SQL errors, zero crashes
- Desktop binary built: MSI + NSIS EXE (post-fix R3 build complete)

## What's Working
- All 7 demo-verify features pass against live sidecar
- OAuth config resolves with real credentials from .env
- Knowledge graph returns empty state gracefully (no crash)
- Sidecar initializes cleanly with all subsystems

## What's Not Working
- Manual verification (a-d) not yet done — requires installed app

## Next Steps (in order)
1. Install NSIS binary and manually verify:
   a. Connect Google Drive → card shows "Connected" → survives restart
   b. Knowledge Graph screen opens without crash
   c. Close/reopen → no onboarding flash → straight to Chat
   d. Ask "what is your name?" → AI responds with onboarding-chosen name
3. Check sidecar.log for session markers and clean startup

## Blockers
- None

## Build Artifacts Location
- MSI: `packages/desktop/src-tauri/target/release/bundle/msi/Semblance_0.1.0_x64_en-US.msi`
- NSIS: `packages/desktop/src-tauri/target/release/bundle/nsis/Semblance_0.1.0_x64-setup.exe`
- Built with all R3 fixes applied (commit 086b31f)

## Notes
- The `documents` table is owned by DocumentStore (core.db), NOT by GraphVisualizationProvider (prefsDb). Do not add it to graph-visualization initSchema — schema mismatch risk.
- Screen files must not import `@tauri-apps/api/core` directly — enforced by `ipc-typed-commands.test.ts`. All IPC goes through `commands.ts`.
- `get_connected_services` returns flat `string[]` of connector IDs, not an object with `.services`.

---
*Session saved: 2026-03-10T17:45:00 (updated: build complete)*
