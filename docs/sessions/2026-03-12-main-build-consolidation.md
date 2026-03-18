# Session: 2026-03-12 - main

## Git State
- Branch: `main`
- Commit: `d95a4da` - chore: add diagnostic logging to KG Three.js renderer
- Uncommitted: No
- Pushed: Yes (all up to date with remote)

## Work Context
**Active WO:** None (Sprint 6 hardening)
**Task:** Consolidated build with all runtime fixes — embed crash, Ollama GPU inference, model name correction, KG diagnostics
**Progress:** Build complete, installer ready, all commits pushed

## Recent Commits (this + prior session)
- `d95a4da` — KG Three.js diagnostic logging (constructor, WebGL context, setData, createNodeMeshes, click handler)
- `141c900` — Replace all `llama3.2` model defaults with `llama3.1` across 11 files (llama3.2:8b tag doesn't exist in Ollama)
- `46bacd4` — Embed crash fix (chunked 512-token prefill), KG 3D glow + camera snap, Ollama GPU inference wiring
- `67409f1` — Token overflow segfault fix (chat + indexing crash), KG Storybook parity
- `b618269` — Chat crash (double-templating), indexing OOM, KG full Storybook parity

## Current Approach
Consolidated all fixes into a single installer so user doesn't have to redownload multiple times. Added diagnostic logging to KG renderer to debug production vs Storybook visual mismatch.

## What's Working
- File indexing no longer crashes (chunked embed prefill fix)
- Ollama GPU inference wired into bridge.ts (provider hot-swap + model name persistence)
- Model name `llama3.1:8b` correct across all 11 source files (verified 0 refs to `llama3.2:8b` in sidecar bundle)
- Desktop binary builds successfully (NSIS 59MB, MSI 83MB)
- CI green: 477 test files, 6215 tests, 0 failures
- Three.js KG renderer code verified correct in bundle (glow tiers, camera snap, WebGL init)

## What's Not Working
- **KG visual mismatch** — Production KG renders flat dots instead of 3D glowing orbs. Storybook looks correct. Same code path confirmed. Root cause unknown — diagnostic logging added to narrow down.
- Possible causes: WebView2 WebGL limitations, canvas size issues, data shape differences between Storybook mock data and real VisualizationGraph data, or the component not mounting the Three.js renderer at all

## Next Steps (in order)
1. User installs new build and opens Knowledge Graph
2. User opens DevTools (F12) and shares `[GraphRenderer]` console output
3. Diagnose from logs: Did Three.js init? Did WebGL context succeed? How many nodes? What glow tiers? Did clicks fire?
4. Fix root cause based on diagnostic output
5. Verify chat works end-to-end with Ollama GPU inference (`llama3.1:8b`)
6. Full demo readiness check

## Blockers
- [ ] Need user's `[GraphRenderer]` console output from production to diagnose KG visual issue
- [ ] User hasn't confirmed chat works with Ollama after model name fix (needs install first)

## Key Files
- `packages/desktop/src-tauri/sidecar/bridge.ts` — Ollama provider wiring, model persistence
- `packages/semblance-ui/components/KnowledgeGraph/graph-renderer.web.ts` — Three.js renderer with diagnostics
- `packages/semblance-ui/components/KnowledgeGraph/KnowledgeGraph.web.tsx` — Component that creates GraphRenderer
- `packages/desktop/src/components/KnowledgeGraphView.tsx` — Desktop wrapper, data conversion
- `packages/core/index.ts` — Model defaults
- `packages/desktop/src-tauri/src/native_runtime.rs` — Embed chunked prefill fix

## User Rules (Active)
- "Don't keep rebuilding without asking me first"
- "Make sure the new build has ALL of the fixes" — no partial builds
- "Don't keep redownloading over a single change everytime" — batch fixes

## Notes
- BitNet consumer inference plan locked in as post-demo priority (in private repo docs)
- User has NVIDIA 5090 — Ollama GPU inference should be fast
- Installer path: `packages/desktop/src-tauri/target/release/bundle/nsis/Semblance_0.1.0_x64-setup.exe`
- The KG issue is the critical remaining blocker before demo readiness

---
*Session saved: 2026-03-12T00:00:00Z*
