# Session: 2026-04-02 - main

## Git State
- Branch: `main`
- Commit: `867494e` - style: ChatMonitor refactor + ConnectorCard/DirectoryPicker tweaks
- Uncommitted: Minor (privacy-audit-cache, BitNet submodule, compiled .web.js files)

## Work Context
**Active WO:** None (design session continuation)
**Task:** UI overhaul session 3 continued — ChatMonitor gutter sizing, onboarding fixes, Vite config management
**Progress:**
- ChatMonitor rewritten to dynamically fill the right gutter using `useRightGutter()` hook
- Trigger icon and minimized indicator centered in measured gutter
- Panel spans full gutter height (top: 8 → bottom: 72)
- Graceful degradation when gutter < 60px
- Wraith stability fix confirmed working (children removed from measure effect)
- Onboarding step reorder confirmed working (Meet→Bond→Trust→Empower→Launch)
- All onboarding visual atmosphere in place (grid, particles, glow, vignette)
- Vite config toggling between onboarding/app views for dev iteration

## Current Approach
ChatMonitor measures the right gutter dynamically via ResizeObserver on `<main>` + window resize + 500ms polling interval (for sidebar transition catching). Panel positions itself with `position: fixed` using measured gutter bounds.

## What's Working
- ChatMonitor fills right gutter perfectly
- Trigger icon centered in gutter, moves with sidebar toggle
- Wraith stays stable when ChatMonitor toggles
- Onboarding atmosphere (grid + particles + glow + vignette)
- New onboarding step order
- All severity colors (Electric Cadmium #EDDD52, Signal Rose #E8657A)
- Cloud Bridge Electric Cyan identity
- Multi-agent bracket with full living animations
- Production chat UX (persistent orchestration, contextual thinking, smart scroll)

## What's Not Working
- Vite config keeps reverting `onboardingComplete` between sessions (multiple Claude instances editing same file)
- Some compiled .web.js files in semblance-ui can shadow .web.tsx source edits

## Next Steps (in order)
1. Build desktop binary (npx tauri build)
2. Test ChatMonitor in production with real agent responses
3. Wire multi-agent bracket to real orchestrator events (currently demo only)
4. Complete remaining onboarding font fixes on compiled .web.js files
5. Address any build-time issues

## Blockers
- [ ] None critical — ready to build

## Notes
- Other Claude Code instance made additional commits (867494e through 4f8dbad) fixing onboarding connectors, Tauri plugin stubs, test updates, and anti-fabrication defense
- Vite config `onboardingComplete` needs to be set to `true` for app dev and `false` for onboarding dev — this keeps getting toggled between instances
- Design Bible Section 18 (Onboarding) fully documented in private repo

---
*Session saved: 2026-04-02*
