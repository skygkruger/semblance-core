# Session: 2026-03-18 - main

## Git State
- Branch: `main`
- Commit: `e1fc525` - feat: three-tier model architecture — fast tier (SmolLM2) fully wired
- Uncommitted: No (only verify cache + BitNet submodule drift)

## Work Context
**Active WO:** None (Orbital Director-directed sprint)
**Task:** IP boundary separation, full system audit, behavioral wiring, three-tier model architecture
**Progress:** 13 commits landed. Massive session covering 6 major workstreams.

## Session Summary — 13 Commits

### 1. IP Boundary Separation (commits 0055fe5, e0b9c9d)
- Created adapter interfaces: finance, defense, style, digest, alter-ego-week
- Created IPAdapterRegistry singleton for runtime registration
- Rewired orchestrator.ts, bridge.ts, core/index.ts to use registry
- Removed 18 proprietary implementation files from public repo
- Moved 24 implementation-specific tests to private repo
- Safety tags: `pre-ip-boundary-v2`, `pre-ip-deletion-checkpoint`

### 2. Full System Audit (commit bbd8892)
- Fixed get_financial_dashboard: ipAdapters.recurringDetector pattern
- Fixed get_dark_pattern_flags: removed deleted class reference
- Fixed brief_get_morning: try-catch for missing knowledge graph

### 3. CI Fix (commit a97674f)
- BinaryAllowlist basename() cross-platform fix (Linux CI can't parse Windows paths)
- CI now fully green

### 4. localStorage Migration + SemblanceNetworkScreen (commit 641a934)
- 7 files migrated from localStorage to IPC-backed SQLite (pref_get/pref_set)
- Zero localStorage remaining in production desktop code
- SemblanceNetworkScreen built (BUILD BIBLE 6.6) with 5 bridge handlers
- 10 new bridge handlers total (5 pref + 5 network_peers)

### 5. Behavioral Parity (commit a0a615c)
- 6 mobile stub screens rewritten from 25-line placeholders to 170-257 line real implementations
- ProactiveEngine: startPeriodicRun() now called (was one-shot)
- MorningBriefGenerator: 9 additional dependencies now passed

### 6. Critical Wiring Fixes (commits 2f6bcae, 89260bb, 45938b9)
- CronScheduler: setFireHandler() + startTickLoop() — 6 built-in jobs now fire
- EventBus: passed to all 8 EmailIndexer/CalendarIndexer construction sites
- ChannelRegistry: created before adapter construction, startAll() called
- CanvasManager: created before event bus subscriptions
- SkillRegistry: loadAll() now extracts and registers tools with orchestrator

### 7. Three-Tier Model Architecture (commit e1fc525)
- Rust: fast_model slot in NativeRuntime, load_fast_model(), generate_fast()
- Rust: native_generate_fast callback in lib.rs dispatch
- TypeScript: FastNativeProvider class, loadFastModel/generateFast on bridge
- LLMProvider: optional routedChat() for task-aware routing
- Orchestrator: conversational messages use fast tier when available
- SmolLM2 downloads during onboarding + loads at startup

## Final Metrics
- Tests: 482 files, 6,327 passing, 0 failures
- TypeScript: Clean
- Verify: 38/40 (2 env-dependent: inference timeout + morning brief KG)
- CI: Green (all workflows passing)
- Privacy audit: Clean
- localStorage: Zero in production code

## What's Working
- IP boundary clean — public repo has no proprietary implementations
- All sovereignty screens use real IPC (no localStorage)
- CronScheduler fires jobs on schedule
- EventBus events flow from indexers to subscribers
- ChannelRegistry starts all adapters at boot
- CanvasManager receives event bus pushes
- Three-tier inference pipeline: fast (SmolLM2) → primary (Qwen) → embedding (nomic)
- routedChat routes conversational messages to fast tier

## What's Not Working
- Verify score stuck at 38/40 (needs running Ollama + indexed data — environment, not code)
- Desktop binary stale (needs `npx tauri build` rebuild)
- Vision tier (Moondream2) not yet wired (same pattern as fast tier)
- NativeRuntime doesn't support concurrent model hot-swap (ModelResidencyManager gap)

## Next Steps (in order)
1. Rebuild desktop binary (`npx tauri build`) — includes all sprint work + fast tier
2. Runtime verification on installed binary with real Ollama/OAuth
3. Vision tier (Moondream2) — copy fast tier pattern for Part 3B
4. Hardware verification: WireGuard tunnel, channel adapters, device pairing
5. Update SEMBLANCE_STATE.md with all session findings

## Blockers
- [ ] Desktop binary rebuild requires Sky to trigger on Alienware
- [ ] Hardware verification requires two physical devices + Headscale server
- [ ] Channel adapters require real messaging accounts (iMessage, Telegram, etc.)
- [ ] Vision tier requires Moondream2 GGUF download + mmproj handling

## Notes
- IP boundary safety tags exist: `pre-ip-boundary-v2` and `pre-ip-deletion-checkpoint`
- Tests moved to private repo at `semblence-representative/tests/ip-boundary/`
- Internal prompt files moved to `semblence-representative/docs/`
- SkillRegistry.loadAll() now registers tools but the loaded module must export `tools` object with handler functions
- Style profile learning trigger is behind IP boundary (ipAdapters) — fires when DR extension loads

---
*Session saved: 2026-03-18T17:45:00Z*
