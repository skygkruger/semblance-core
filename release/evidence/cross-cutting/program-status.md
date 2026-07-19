# Semblance Program Status — Field-Proof + Multi-Model Audit

**Release ID:** `field-proof-multi-model-2026-07-19`  
**Generated:** 2026-07-19  

## Summary

Program §17–19 plus multi-model architecture audit are machine-verifiable via `node scripts/cross-cutting-gate-matrix.js`. Automatable DeferredFieldProof gates (outage, corruption, diagnostic privacy, accessibility axe, supply-chain) are **runnable and passing**. **3 gates remain DeferredFieldProof** until Windows/mobile field evidence is pinned. Multi-model path (installer runtimes → onboarding hardware suggest → download → auto-load → Settings select) is audited by `node scripts/audit-multi-model.js`.

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
| A | Sovereign Foundation | 1–2 | RuntimeVerified | Installer three-VM + Windows launch-floor deferred |
| B | Local Intelligence | 3–5 | RuntimeVerified | Real-data strict needs connected OAuth on user machine |
| C | Paid Agency | 6–7 | RuntimeVerified | Broad launch FieldProven pending installer/performance |
| D | User-Controlled Cloud | 8 | RuntimeVerified | — |
| E | Confidential Semblance Cloud | 9 | AdversariallyVerified | Production confidential workload field proof pending |
| F | Full Personal Agency | 10 | AdversariallyVerified | — |
| G | Sovereign Network | 11–12 | AdversariallyVerified | Mobile physical device + multi-device sync deferred |
| H | Shared Sovereignty | 13 | AdversariallyVerified | Multi-member acceptance deferred |

Canonical: `release/release-trains.v1.json`

## Deferred field proof (3 — honest)

1. **Mobile physical device acceptance** — pin `release/evidence/field/mobile-acceptance.v1.json` per `MOBILE_DEVICE_ACCEPTANCE.md`
2. **Performance Windows launch-floor** — pin `release/evidence/field/launch-floor.v1.json` from Win11 harness
3. **Installer three clean VMs** — pin `release/evidence/field/installer-matrix.v1.json`

Cleared since prior cross-cutting pin: outage-safety, corruption-safety, accessibility (automated), supply-chain, diagnostic-privacy. Task-based screen-reader review remains documented at `release/evidence/a11y/task-based-checklist.md` (not required for automated a11y gate).

## Field evidence capture harnesses

Capture scripts write evidence **only when checks actually pass**. Operators pin JSON under `release/evidence/field/` after review; CI uploads artifacts but does **not** auto-commit.

| Gate | Capture | Verify |
|------|---------|--------|
| Windows launch-floor | `node scripts/capture-launch-floor.js` (win32 only) | `node scripts/verify-field-evidence.js --launch-floor` |
| Installer three-VM matrix | Per VM: `node scripts/capture-installer-vm.js --vm-id vm-a --installer-path path.msi --result-out vm-a.json` then `node scripts/aggregate-installer-matrix.js --vm-a vm-a.json --vm-b vm-b.json --vm-c vm-c.json` | `node scripts/verify-field-evidence.js --installer-matrix` |
| Mobile device acceptance | `node scripts/capture-mobile-acceptance.js --interactive` or `--from-checklist checklist.json` | `node scripts/verify-field-evidence.js --mobile-acceptance` |
| Task-based a11y (partial) | `node scripts/run-task-based-a11y.js` | Manual SR checklist still required |

**Windows CI:** `.github/workflows/field-proof-windows.yml` (**workflow_dispatch only**). Launch-floor capture on `windows-latest` reached hardware check (4c / ~16GB class / disk OK) but **initialize timed out at 300s** without Tauri native runtime — no PASS evidence written (honest fail). Installer matrix requires `build_msi=true` or `installer_url`. Same-version reinstall proxy: `SEMBLANCE_INSTALLER_MATRIX_ALLOW_SAME_VERSION_REENSTALL=1`.

**PowerShell wrapper:** `.\scripts\windows-launch-floor-bench.ps1`

**Mobile protocol:** `semblence-representative/docs/MOBILE_DEVICE_ACCEPTANCE.md`  
This host has Xcode SDKs but **no iOS Simulator runtimes / no adb** — physical devices still required; `capture-mobile-acceptance.js` is ready for operators.

**A11y task-based (automated half):** `release/evidence/a11y/task-based-2026-07-19.md` — fixture keyboard/landmark checks **PASS**. VoiceOver/NVDA items remain unchecked (not FieldProven SR).

## Next steps

1. On a real Win11 launch-floor machine (or installed MSI), run `capture-launch-floor.js` / installer matrix; pin JSON
2. On physical iOS + Android, complete `MOBILE_DEVICE_ACCEPTANCE.md` → `capture-mobile-acceptance.js`
3. Complete VoiceOver/NVDA sign-off on production desktop build
4. Promote trains to FieldProven only when the three field evidence files validate
