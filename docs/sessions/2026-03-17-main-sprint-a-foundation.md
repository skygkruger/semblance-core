# Session: 2026-03-17 - main (Sprint A: Close the Foundation)

## Git State
- Branch: `main`
- Commit: `8a5d0c0` - feat: Sprint A — wire sovereignty backends, fix verify script, add sanitization
- Uncommitted: No (all committed and pushed to origin/main)
- Previous commits this session: `8d71775` (local-first pipeline), `df9ef01` (de-stub dark patterns)

## Work Context
**Active WO:** Sprint A — Close the Foundation (4 items from Orbital Director)
**Task:** Wire sovereignty screens, fix verify script, BitNet rebuild, ingestion sanitization
**Progress:** Items 1, 2, 4 complete. Item 3 (BitNet MSI rebuild) deferred — requires Sky to trigger build session.

## Session Summary

### What Got Done

**16-Pass Ground Truth Audit (pre-sprint):**
- Full codebase audit against SEMBLANCE_BUILD_BIBLE.md
- 9 new active issues documented in SEMBLANCE_STATE.md
- Feature table completely rewritten with honest ground truth
- Discovered: 0/14 OpenClaw integrations built, 0/4 mesh components, 3/3 sovereignty features unwired

**Sprint A Item 1 — Wire Sovereignty Screens:**
- Living Will: 6 bridge handlers → LivingWillExporter/Importer/Scheduler. Screen rewritten, zero localStorage.
- Semblance Witness: 4 bridge handlers → WitnessGenerator + AttestationSigner (Ed25519). Screen rewritten.
- Inheritance Protocol: 7 bridge handlers → InheritanceConfigStore (5 SQLite tables). Screen rewritten, window.prompt replaced with React forms.
- Backup: 6 bridge handlers → BackupManager. Screen rewritten.
- 28 new IPC command wrappers in commands.ts.

**Sprint A Item 2 — Fix Verify Script:**
- 14 method name mismatches fixed (get_pref → get_user_name, search_files → search_emails, etc.)
- 5 new bridge handlers added for legitimately missing methods: reminder_create, web_search, fetch_url, list_available_connectors, get_audit_trail
- Zero "Unknown method" errors in verify output.

**Sprint A Item 4 — Ingestion Sanitization:**
- email-indexer.ts: sanitizeRetrievedContent() on body + subject
- calendar-indexer.ts: sanitizeRetrievedContent() on title, description, location
- bridge.ts file indexing: sanitizeRetrievedContent() on fullText
- 7 new tests confirming adversarial content stripped at ingestion

**Earlier in session:**
- 6 connected data pipeline fixes (connector sync auto-indexing, inbox reads local store, list_cloud_files local)
- 8 hardcoded [] stubs replaced with real implementations
- FOLLOW THE DATA pipeline verification rules added to CLAUDE.md
- data-audit.js, pipeline-check, pipeline-fix, data-map slash commands verified
- SEMBLANCE_BUILD_BIBLE.md gitignored + READ FIRST/LAST directives in CLAUDE.md

## Current Approach
Systematic sprint execution against Orbital Director directives. Ground truth audit first to establish honest baseline, then targeted fixes in priority order.

## What's Working
- Verify: 31/40 green (was 17/40 at session start — +14 assertions)
- P0 Gate: PASS (was FAIL)
- P1 Gate: PASS (was FAIL)
- Pipeline audit: HEALTHY (0 stubs)
- Tests: 6,246 passing (+7 new), 0 failures
- TypeScript: clean
- All sovereignty screens wired to real backends
- All verify method names match bridge.ts

## What's Not Working
- Item 3 (BitNet MSI rebuild) not executed — requires `npx tauri build` + runtime hardware test
- 9 remaining ⚠️ in verify are data-dependent (no OAuth/emails/files in test env)
- Morning Brief handler crashes on `exec` call (brief_get_morning — likely missing LLM-dependent dep)
- Pref round-trip test returns `[object Object]` instead of string (set_user_name returns object, verify expects string)

## Next Steps (in order)
1. **BitNet MSI rebuild** — Sky triggers `npx tauri build`, installs, tests BitNet inference end-to-end
2. **Connect Gmail in app** — populate email index, run verify with real data
3. **Fix brief_get_morning crash** — MorningBriefGenerator has an uninitialized dependency
4. **Fix pref round-trip** — set_user_name returns `{ success: true }`, verify expects the written value
5. **OpenClaw integrations** — 0/14 built. Awaiting Orbital Director prioritization on which are launch-blocking.

## Blockers
- [ ] BitNet rebuild requires Sky's hands (unsigned binary + SmartScreen + real hardware test)
- [ ] OpenClaw integration priority not yet decided by Orbital Director
- [ ] Morning Brief depends on LLM being available (90s timeout in verify)

## Metrics
```
Session start:  17/40 verify, P0 FAIL, P1 FAIL, 6,239 tests
Session end:    31/40 verify, P0 PASS, P1 PASS, 6,246 tests
Delta:          +14 assertions, +7 tests, +23 bridge handlers, +28 IPC commands
Commits:        3 (8d71775, df9ef01, 8a5d0c0)
Files changed:  ~25 (bridge.ts, 4 screens, commands.ts, verify.js, 2 indexers, test file, CSS, CLAUDE.md, .gitignore)
```

## Notes
- SEMBLANCE_BUILD_BIBLE.md is the canonical spec — 1,104 lines, 15 parts. Read at session start.
- SEMBLANCE_STATE.md updated with Ground Truth Audit findings (9 active issues).
- The audit revealed the massive gap: OpenClaw integrations (daemon, cron, CDP, channels, tunnel, sessions, skills, sub-agents, canvas) are 0/14 built. The Compute Mesh (TunnelTransport, Headscale, WireGuard) is 0/4 built. These are the largest remaining build effort.
- Sovereignty feature backends (Living Will, Witness, Inheritance) were already fully implemented in packages/core/ — just needed bridge handlers and screen rewrites. This was the highest-ROI fix.

---
*Session saved: 2026-03-17T05:40:00Z*
