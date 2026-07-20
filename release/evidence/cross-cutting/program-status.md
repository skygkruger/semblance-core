# Semblance Program Status — Field-Proof + Multi-Model Audit

**Release ID:** `field-proof-multi-model-2026-07-19`  
**Generated:** 2026-07-19  

## Summary

Program §17–19 plus multi-model architecture audit are machine-verifiable via `node scripts/cross-cutting-gate-matrix.js`. Automatable DeferredFieldProof gates are **runnable and passing**. **Windows launch-floor** and **installer three-VM matrix** are pinned (GHA run 29705809411). Matrix: **37 pass / 0 fail / 1 deferred** (`mobile-device-acceptance` — **follow-up**, not blocking remaining branch closeout). Multi-model path audited by `node scripts/audit-multi-model.js`.

## Multi-model architecture (verified)

| Capability | Status |
|------------|--------|
| Installer bundles Node runtimes + sidecar bridges (`runtimes/**/*`) | Verified |
| LLM weights in installer | Not shipped — downloaded during onboarding to `~/.semblance/models/` (catalog policy) |
| Hardware detect → tier classify | Verified |
| Onboarding shows recommended standard GGUF for tier | Verified |
| Onboarding downloads `getRecommendedReasoningModel(tier)` | Verified |
| Post-onboarding auto-load (Ollama → standard GGUF → BitNet fallback) | Verified |
| Settings AI Engine manual select (standard + BitNet opt-in) | Verified |
| BitNet router preference gated on loaded+available | Verified |
| BitNet not pre-attached / not onboarding default | Verified (catalog on-demand) |

## Release trains (A–H)

| Train | Name | Slices | Status | Field proof |
|-------|------|--------|--------|-------------|
| A | Sovereign Foundation | 1–2 | RuntimeVerified | Windows launch-floor + installer three-VM pinned |
| B | Local Intelligence | 3–5 | RuntimeVerified | Follow-up: real-data strict needs connected OAuth |
| C | Paid Agency | 6–7 | RuntimeVerified | Installer + launch-floor pinned |
| D | User-Controlled Cloud | 8 | RuntimeVerified | — |
| E | Confidential Semblance Cloud | 9 | AdversariallyVerified | Follow-up: production confidential workload |
| F | Full Personal Agency | 10 | AdversariallyVerified | — |
| G | Sovereign Network | 11–12 | AdversariallyVerified | Follow-up: mobile physical acceptance |
| H | Shared Sovereignty | 13 | AdversariallyVerified | Follow-up: multi-member acceptance |

Canonical: `release/release-trains.v1.json`

## Cleared this release (automatable + Windows field)

- outage-safety, corruption-safety, accessibility (automated axe), supply-chain, diagnostic-privacy
- **performance-launch-floor** — pinned `release/evidence/field/launch-floor.v1.json`
- **installer-three-vms** — pinned `release/evidence/field/installer-matrix.v1.json` (same-version reinstall proxy)
- Multi-model architecture audit — `node scripts/audit-multi-model.js`
- Task-based a11y **automated half** — `release/evidence/a11y/task-based-2026-07-19.md`

## Follow-ups (explicit — not claimed FieldProven)

| ID | Item | Why deferred | How to clear |
|----|------|--------------|--------------|
| FU-1 | **Mobile physical device acceptance** | No physical iOS+Android on CI/dev host; simulators do not qualify | `MOBILE_DEVICE_ACCEPTANCE.md` → `node scripts/capture-mobile-acceptance.js` → pin `mobile-acceptance.v1.json` |
| FU-2 | **VoiceOver / NVDA sign-off** | Requires human SR session on production desktop build | `task-based-checklist.md` → `node scripts/capture-a11y-sr.js` → pin `sr-signoff.v1.json` |
| FU-3 | Real-data strict (train B) | Needs connected OAuth sources on operator machine | Existing real-data audit with live tokens |
| FU-4 | Confidential production field proof (train E) | Needs production confidential workload attestation | Slice 9 Released + field attestation |
| FU-5 | Multi-member shared-space acceptance (train H) | Needs multi-member field test | Slice 13 shared-space acceptance protocol |

Matrix gate `mobile-device-acceptance` remains **DeferredFieldProof** until FU-1 is pinned. That is intentional and honest.

## Field evidence capture harnesses

Capture scripts write evidence **only when checks actually pass**. Operators pin JSON under `release/evidence/` after review; CI uploads artifacts but does **not** auto-commit.

| Gate | Capture | Verify |
|------|---------|--------|
| Windows launch-floor | `node scripts/capture-launch-floor.js` (win32 only) | `node scripts/verify-field-evidence.js --launch-floor` |
| Installer three-VM matrix | Per VM + `aggregate-installer-matrix.js` | `node scripts/verify-field-evidence.js --installer-matrix` |
| Mobile device acceptance (FU-1) | `capture-mobile-acceptance.js` + checklist template | `node scripts/verify-field-evidence.js --mobile-acceptance` |
| SR sign-off (FU-2) | `capture-a11y-sr.js` + `sr-signoff.checklist.template.json` | Manual pin under `release/evidence/a11y/sr-signoff.v1.json` |
| Task-based a11y (automated) | `node scripts/run-task-based-a11y.js` | Covered by `a11y-gate.js` |

**Windows CI:** `.github/workflows/field-proof-windows.yml` (**workflow_dispatch only**).

**Mobile protocol:** `semblence-representative/docs/MOBILE_DEVICE_ACCEPTANCE.md`  
Checklist template: `release/evidence/field/mobile-acceptance.checklist.template.json`

## Branch closeout criteria (this workstream)

Done when:

1. Matrix automatable gates pass (including Windows field pins) — **met**
2. Multi-model audit passes — **met**
3. Follow-ups FU-1…FU-5 listed honestly — **met**
4. No fake FieldProven for hardware/human-only gates — **met**

## Active product plan

**Production / consumer-ready phases:** `semblence-representative/docs/superpowers/plans/2026-07-19-production-consumer-ready-phases.md`

- Launch bar: Train A–C FieldProven desktop (earliest paid launch), then full platform.
- Voice, finance, health, web search, calendar, proactive insights are **v1 requirements** (not a cut list).
- **Current execution: Phase 1** — Mac release binary, install, real-data dogfood, polish.
