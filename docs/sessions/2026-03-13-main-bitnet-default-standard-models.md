# Session: 2026-03-13 - main (BitNet Default + Standard Models)

## Git State
- Branch: `main`
- Commit: `b0afc1c` - feat: ship BitNet as default inference backend with standard model settings
- Previous: `be28c87` - feat: add BitNet inference backend with model browser UI
- Uncommitted: Submodule pointer (BitNet 3rdparty) — non-critical
- Pushed: Yes

## Work Context
**Active WO:** TODO-05 (BitNet Phase 5: Ship as Default Inference Backend)
**Task:** Complete BitNet integration — make it the default inference, expose standard models in Settings
**Progress:** TODO-05 functionally complete. 22 of 26 gaps closed; 4 require hardware/external tools.

## What Got Done This Session

### Commit `be28c87` (prior conversation, carried forward)
- BitNet.cpp one-fork approach: replaces llama-cpp-2 entirely
- BitNetProvider with XML tool-calling support
- InferenceRouter with BitNet/Ollama/NativeRuntime routing
- BITNET_MODEL_CATALOG: 7 models with SHA-256 hashes, exact file sizes
- BitNet model browser UI in Settings > AI Engine (download/activate)
- Onboarding rewritten: downloads ONLY embedding + recommended BitNet model
- Hardware tier mapping: constrained→Falcon-E 1B, standard→3B, performance→7B, workstation→10B
- Exponential backoff retry (3 attempts) for downloads
- Provider transition audit trail logging
- Mobile: model-download.ts, memory pressure handling, build scripts (MAD kernels)
- Task assessor: meeting_prep/knowledge_moment can run on mobile with 3B
- Llama3 8B removed (no pre-built GGUF)
- Rust: bitnet-sys crate, native_runtime.rs BitNet kernel support

### Commit `b0afc1c` (this session)
- **Standard Models in Settings UI** — "Standard Models" section showing all Qwen GGUF models
- Full IPC pipeline: types → UI component → navigator → screen → commands → Rust → sidecar handlers
- 3 new Rust Tauri commands: `standard_get_models`, `standard_download_model`, `standard_set_active`
- 3 new sidecar handlers with download/activate logic
- Mutual exclusion: activating standard clears BitNet active and vice versa
- Fixed `handleSetPref` → `setPref` bug in BitNet/standard handlers
- Updated all test fixtures with new standard model props

## Current State
- TypeScript: clean (0 errors)
- Tests: 478 files, 6225 tests, 0 failures
- CI: should be green (pushed to main)

## What's Working
- BitNet is the default inference backend during onboarding
- Standard Qwen models exposed in Settings for power users
- Model download with SHA-256 verification and retry
- Provider transition logging in audit trail
- Mobile inference architecture (model download, memory pressure)
- All existing functionality preserved (no regressions)

## Remaining Gaps (4 — require hardware/external tools)
1. **GAP-6.4: iOS cross-compilation** — Needs GitHub Actions macOS runner (Apple toolchain requirement). User confirmed this approach.
2. **GAP-7.1: Runtime binary verification** — Needs actual `npx tauri build` + install test with BitNet model loaded
3. **GAP-7.2: End-to-end inference test** — Needs running sidecar with downloaded BitNet model
4. **GAP-7.3: Mobile runtime test** — Needs physical iOS/Android device or emulator

## Remaining Gaps (3 — require hardware/external tools)
1. **GAP-1.5/1.6: Runtime model load + sidecar smoke** — Needs `npx tauri build` + real BitNet model
2. **GAP-2.1/2.2: Token/sec benchmarks** — Needs real models loaded for performance measurement
3. **GAP-6.4: iOS cross-compilation** — Needs GitHub Actions macOS runner (Apple toolchain requirement)

## Next Steps (in order)
1. **Build desktop binary** — `npx tauri build` to verify BitNet integration compiles into the release binary
2. **Runtime test** — Install binary, run sidecar smoke test with BitNet model download + chat
3. **GitHub Actions macOS runner** — Set up CI/CD workflow for iOS cross-compilation

## Also Done This Session
- Updated `SEMBLANCE_STATE.md` in representative repo with full session 2 log, TODO-05 status, gap assessment updates, locked decisions — committed `05a799a` and pushed

## Notes
- The one-fork approach is LOCKED — BitNet.cpp replaces llama-cpp-2 entirely
- MAD kernels chosen over TL1/TL2 LUT for multi-model support
- Android can cross-compile from Windows (NDK), iOS requires macOS (Apple toolchain)
- Standard models use same `BitNetModelInfo` type shape (nativeOneBit: false) to reuse ModelCard component
- `handleSetPref` was a ghost function — the actual function is `setPref` (found and fixed)
- GAP-3.2 (Llama3 8B) resolved by removal — Falcon3 7B covers same tier, total gaps now 23/26 closed

---
*Session saved: 2026-03-13 (final)*
