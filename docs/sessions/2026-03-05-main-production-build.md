# Session: 2026-03-05 - main

## Git State
- Branch: `main`
- Commit: `af01443` - feat: wire all Storybook components into production screens, build desktop binary
- Uncommitted: No
- Pushed: Yes (origin/main up to date)

## Work Context
**Active WO:** None (Step 32 COMPLETE, Step 33 ship phase)
**Task:** Wire all 109 Storybook components into production screens, build Windows desktop binary
**Progress:** COMPLETE

## What Got Done

### Storybook-to-Production Wiring (all screens)
- **MorningBriefScreen** — Rewrote from WireframeSpinner placeholder to full screen: BriefingCard, MorningBriefCard, WeatherCard, CommuteCard, KnowledgeMomentDisplay, AlterEgoActivationCard, DailyDigestCard
- **KnowledgeGraphScreen** — Rewrote from placeholder to full screen: KnowledgeGraphView with FilterPanel, node context panel, export
- **ActivityScreen** — Added AlterEgoReceipt, AlterEgoDraftReview, EscalationPromptCard, AlterEgoWeekCard
- **InboxScreen** — Added ApprovalCard, ReminderCard, DarkPatternBadge, QuickCaptureInput, ClipboardInsightToast
- **ChatScreen** — Added VoiceButton, VoiceWaveform, WebSearchResult, WebFetchSummary
- **FinancialDashboardScreen** — Added StatementImportDialog, SubscriptionInsightCard
- **PrivacyScreen** — Added SovereigntyReportCard with PDF export
- **SettingsScreen** — Added StyleProfileCard, VoiceOnboardingCard, ModelDownloadProgress, ImportDigitalLifeView
- **IntentScreen** — Added EscalationPromptCard
- **DigestScreen** — Added DailyDigestCard
- **App.tsx** — Added ToastContainer, UpgradeEmailCapture

### IPC Layer
- ~40 new IPC command functions in `packages/desktop/src/ipc/commands.ts`
- ~200 lines of new type definitions in `packages/desktop/src/ipc/types.ts`
- Types aligned to match actual component prop interfaces (19 TS errors fixed)

### Production Build
- TypeScript: clean (0 errors)
- Vite: 558 modules, built in 7.4s
- Rust: compiled release in 1m 52s
- Sidecar: bridge.cjs + 65 node_modules bundled
- **Artifacts produced:**
  - MSI: `src-tauri/target/release/bundle/msi/Semblance_0.1.0_x64_en-US.msi` (83 MB)
  - NSIS: `src-tauri/target/release/bundle/nsis/Semblance_0.1.0_x64-setup.exe` (59 MB)
  - Raw: `src-tauri/target/release/semblance-desktop.exe` (41 MB)
- Previous install uninstalled via PowerShell

## What's Working
- All 109 Storybook stories have corresponding production screen usage
- TypeScript compiles clean
- Tauri build succeeds end-to-end (Vite + Rust + NSIS + WiX)
- MSI and NSIS installers both generated

## What's Not Working
- MSI is unsigned (SmartScreen warning expected on install)
- Audio assets are large (~20MB total WAV files in bundle) — could compress to OGG
- Vite warns about 1.5MB chunk size — could code-split

## Next Steps (in order)
1. Install fresh binary and smoke test (window opens, tray icon, sidecar spawns)
2. Fix CI workflows (CMake step in release.yml, keystore heredoc in android-release.yml)
3. Android/iOS build paths require Sky's manual setup (signing keys, certificates)
4. Code signing for Windows binary (removes SmartScreen warning)

## Blockers
- [ ] Android build: needs signing keystore + GitHub secrets (Sky manual)
- [ ] iOS build: needs Mac + Xcode + Apple Developer Program (Sky manual)
- [ ] Code signing: needs certificate purchase (Sky manual)

## Notes
- The `as unknown as` casts in KnowledgeGraphScreen bridge IPC response types to core visualization types — this is intentional since IPC returns plain objects, not the full core type with methods
- MessageDraftCard is imported in InboxScreen but not rendered in JSX — it's available for SMS/message draft scenarios but has no trigger path yet
- bundle-sidecar.js was added as a new file (bundles bridge.ts + node_modules for Tauri sidecar)

---
*Session saved: 2026-03-05T18:00*
