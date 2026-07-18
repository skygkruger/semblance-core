# Slice 1 Task 3 Report

Date: 2026-07-18  
Status: Implemented and pushed

## Repository commits

- `semblance-core` (`cursor/truth-baseline-2180`): `ced7448` — `security: separate founding reservations from entitlements`
- `semblance-core` review remediation: `a73def4` — `security: harden reservation migration boundaries`
- `semblence-representative` (`cursor/sovereign-platform-design-2180`): `9adbc0c` — `docs: record reservation entitlement migration runbook`
- `semblence-representative` review remediation: `1b68cc4` — `docs: record hardened reservation rollback evidence`

No files in `semblance-run` were modified. No Stripe, Worker, Resend, or other external commerce mutation was performed.

## Outcome

- Legacy Ed25519 founding/waitlist JWTs now return only:

  ```ts
  {
    valid: boolean;
    kind: 'reservation_only';
    seat: number | null;
    error?: string;
  }
  ```

- `PremiumGate.activateFoundingMember` and all `license:activate_founding` wiring were removed. Paid `sem_` founding keys remain accepted by the signed paid-license path.
- Explicit imports write only one-way token/subject hashes, non-secret decoded metadata, and import time to `founding_reservations`; bearer JWT ciphertext is never persisted. Recovery requires re-import from the original email/token.
- Startup invokes `runReservationEntitlementSplit` before constructing `PremiumGate`.
- Migration creates and SHA-256-verifies a consistent SQLite backup, chmods the backup and marker to `0600`, checkpoints each step, resumes idempotently, securely deletes legacy bearer material, and records `storage_sanitized` only after WAL checkpoint/truncation. Every cryptographically valid paid `sem_` key is preserved regardless of stale tier metadata.
- Rollback verifies the backup hash, removes stale WAL/SHM files, restores the byte-equivalent database copy, and verifies the restored hash.
- Exact `semblance://activate?key=sem_...` routes to paid activation. Exact `semblance://reservation/import?token=...` routes only to reservation recovery. Prefix lookalikes, mixed/duplicate parameters, paid keys on the reservation route, and reservation tokens on the activation route are rejected.
- The desktop reads `commerce.newSalesEnabled` from the bundled release manifest. When false, all new checkout controls are absent and `openCheckout` is fail-closed. Existing paid-key activation and subscription portal management remain present.
- Web and native upgrade UI include the migration state and a separate “Import reservation” recovery action.
- Cross-repository compatibility artifacts:
  - `release/contracts/reservation-token-v0.schema.json`
  - `release/contracts/legacy-waitlist-token.fixture.json`
- Private migration definition/runbook:
  - `docs/release-manifests/migrations/slice-1-reservation-entitlement-split.json`
  - Executable definition and per-install runtime evidence are separate.
  - Runtime hash fields remain `null` with status `NOT_EXECUTED`; no installation evidence was fabricated.

## TDD red phase

Command:

```bash
pnpm exec vitest run tests/premium/founding-token.test.ts tests/premium/premium-gate-founding.test.ts tests/integration/founding-activation.test.ts tests/integration/commerce-freeze.test.ts tests/premium/reservation-entitlement-migration.test.ts
```

Observed result before implementation:

```text
Test Files  5 failed (5)
Tests  22 failed | 41 passed (63)

Error: Cannot find module '../../packages/core/premium/founding-reservation-store.js'
AssertionError: expected { valid: true, payload: { … } } to deeply equal
{ valid: true, kind: 'reservation_only', seat: 1 }
```

The failures also identified the old `activateFoundingMember`, `founding-activate`, `license:activate_founding`, and ungated checkout paths.

## Final verification outputs

### Targeted entitlement, migration, release, and paid-key regression suite

Command:

```bash
pnpm exec vitest run tests/premium/founding-token.test.ts tests/premium/premium-gate-founding.test.ts tests/premium/reservation-contract.test.ts tests/integration/founding-activation.test.ts tests/integration/commerce-freeze.test.ts tests/premium/reservation-entitlement-migration.test.ts tests/core/premium/premium-gate-license-key.test.ts tests/core/premium/keychain-migration.test.ts tests/release/release-manifest.test.ts
```

Output:

```text
 RUN  v4.0.18 /agent/repos/semblance-core

 ✓ tests/premium/reservation-contract.test.ts (3 tests) 62ms
 ✓ tests/premium/reservation-entitlement-migration.test.ts (6 tests) 122ms
 ✓ tests/core/premium/keychain-migration.test.ts (24 tests) 42ms
 ✓ tests/premium/premium-gate-founding.test.ts (4 tests) 12ms
 ✓ tests/release/release-manifest.test.ts (16 tests) 418ms
 ✓ tests/integration/commerce-freeze.test.ts (2 tests) 7ms
 ✓ tests/core/premium/premium-gate-license-key.test.ts (6 tests) 20ms
 ✓ tests/premium/founding-token.test.ts (13 tests) 17ms
 ✓ tests/integration/founding-activation.test.ts (44 tests) 11ms

 Test Files  9 passed (9)
      Tests  118 passed (118)
```

### Core and desktop typechecks

Commands:

```bash
pnpm typecheck
pnpm exec tsc --noEmit -p packages/desktop/tsconfig.json
```

Output:

```text
> semblance-core@1.0.0 typecheck /agent/repos/semblance-core
> tsc --noEmit
```

The desktop command exited `0` with no output.

### Sidecar smoke

The first unqualified run failed before bridge startup because the workspace package was not on Node's bundled-sidecar resolution path:

```text
❌ initialize: Timeout waiting for response to initialize (180000ms)
Error: Cannot find module '@lancedb/lancedb'
Require stack:
- /agent/repos/semblance-core/packages/desktop/src-tauri/sidecar/bridge.cjs
```

`pnpm install --frozen-lockfile` confirmed the locked workspace was already installed. The package exists under `packages/core/node_modules`, so the smoke was rerun with the workspace module path:

```bash
NODE_PATH="$PWD/packages/core/node_modules" node scripts/smoke-test-sidecar.js
```

Output:

```text
🔬 SIDECAR INTEGRATION SMOKE TEST

Starting sidecar...
Sending initialize (may take up to 3 minutes for model loading)...
  ✅ initialize — sidecar initializes
  ✅ initialize — returns onboardingComplete
  ✅ initialize — inference engine: none
  ⚠️  initialize — no active model (expected without Rust backend)
  ✅ sidecar — reached Ready state

  ✅ get_onboarding_complete — returns {"complete":false}
  ✅ audit_get_chain_status — verified: true, entries: 0
  ✅ hw_key_get_backend — backend: libsecret, hardware: true
  ✅ get_knowledge_stats — documents: 0
  ✅ list_conversations — returned 0 conversations
  ⏳ Testing chat (send_message)...
  ✅ send_message — correct error without Rust backend: "No AI model available. Go to Settings → AI Engine to download a model, or install Ollama (ollama.com) for GPU-accelerated inference."

==================================================
RESULTS: 10 passed, 0 failed
==================================================
```

### Privacy audit

Command:

```bash
pnpm privacy-audit
```

Output:

```text
RESULT: CLEAN
No violations found.
Core files scanned: 330
Desktop files scanned: 146
Tauri config: verified
```

### Release source policy

Command:

```bash
node scripts/release-manifest.js --verify-source
```

Output:

```text
Release manifest source verified: truth-baseline-2026-07-18
```

### Recorded rollback command in a disposable database

The exact rollback command from the private runbook was executed after creating a disposable pre-migration backup/hash and destructive post-backup state. Legacy readback output:

```text
{"tier":{"tier":"founding"},"key":{"value":"legacy-jwt"}}
```

The migration test additionally verifies byte-hash restoration, stale WAL/SHM removal, and pre-Slice-1 table readability.

### Diff and documentation checks

Commands:

```bash
git diff --check
node -e "JSON.parse(require('node:fs').readFileSync('docs/release-manifests/migrations/slice-1-reservation-entitlement-split.json','utf8')); console.log('private migration JSON valid')"
```

Output:

```text
private migration JSON valid
```

Both repositories' `git diff --check` commands exited `0` with no output.

### Rust validation limitation

Command:

```bash
cargo check --manifest-path packages/desktop/src-tauri/Cargo.toml
```

Output:

```text
error: failed to parse manifest at `/usr/local/cargo/registry/src/index.crates.io-6f17d22bba15001f/zbus-5.14.0/Cargo.toml`

Caused by:
  feature `edition2024` is required

  The package requires the Cargo feature called `edition2024`, but that feature is not stabilized in this version of Cargo (1.83.0 (5ffbef321 2024-10-29)).
```

`cargo fmt --check` parsed the Rust sources but reported extensive pre-existing formatting differences across `hardware.rs`, `lib.rs`, `native_runtime.rs`, and tests. No broad formatting rewrite was made.

## Runtime wiring and callers

- App startup:
  - `bridge.ts::handleInitialize`
  - `runReservationEntitlementSplit(...)`
  - `FoundingReservationStore(...)`
  - `PremiumGate(...)`
- Explicit reservation import:
  - Tauri `import_founding_reservation`
  - sidecar `reservation:import`
  - `reservationStore.importReservation(...)`
- Deep link:
  - Rust deep-link listener emits `reservation-import`
  - `App.tsx` listener calls `license.importReservation(...)`
  - `LicenseContext` calls typed `importFoundingReservation(...)`
- Rollback:
  - Operator-only `rollbackReservationEntitlementSplit(...)` is called by the exact private runbook command and is intentionally not part of normal startup.

Caller search output included:

```text
packages/desktop/src-tauri/sidecar/bridge.ts:762: runReservationEntitlementSplit({
packages/desktop/src-tauri/sidecar/bridge.ts:768: reservationStore = new FoundingReservationStore(
packages/desktop/src-tauri/sidecar/bridge.ts:6743: result = reservationStore.importReservation(token);
packages/desktop/src/App.tsx:471: await license.importReservation(event.payload.token);
packages/desktop/src/contexts/LicenseContext.tsx:113: return await importFoundingReservation(token);
```

## Concerns

1. The mandated `SEMBLANCE_BUILD_BIBLE.md` is absent from this checkout. The task brief and private Slice 1 plan were used as the implementation authority.
2. Stable Rust 1.97.1 resolves the previous edition-2024 parser limitation. The focused deep-link tests compile and pass, but full `cargo check` is blocked by the image lacking the native `gdk-3.0` development package.
3. The bundled-sidecar smoke needs `packages/core/node_modules` in `NODE_PATH` in this checkout. With that existing workspace dependency path supplied, initialization and all 10 smoke assertions succeed.
4. Per-install migration evidence is intentionally not populated. The private record clearly marks it `NOT_EXECUTED`; only the executable migration, test evidence, and disposable rollback output are recorded here.

## Critical/Important review remediation

Review fixes were committed and pushed without amend or force-push. No external commerce mutation was performed.

### Security behavior

- Signed paid keys are classified before SQLite tier metadata. Founding, lifetime, and digital-representative key payloads are preserved and reconcile stale metadata; valid signatures are never deleted, including across resume paths.
- The crash matrix covers every paid-key/stale-tier combination and every migration interruption point: `backup_complete`, `reservation_recorded`, `bearer_deleted`, `storage_sanitized`, and `complete`.
- Schema version 2 upgrades the prior ciphertext table atomically, preserves only its one-way fingerprint and metadata, reruns a version-1 `complete` checkpoint, securely deletes bearer columns, and truncates WAL before completion.
- Production reservation startup no longer imports or constructs `FileKeyStorage`.
- Portal responses require `res.ok`; URLs must parse as HTTPS with no credentials or non-default port and hostname exactly `billing.stripe.com` before any external opener is called.
- Checkout tests render controls and invoke both enabled and frozen behavior. Portal tests execute success, HTTP failure, malformed URL, wrong scheme, lookalike host, wrong port, and approved-host cases.
- Rust unit tests execute the extracted exact-route parser. Native UI now exposes the same reservation recovery action as web.

### Final targeted suite

```text
✓ tests/premium/reservation-entitlement-migration.test.ts (18 tests)
✓ tests/release/release-manifest.test.ts (16 tests)
✓ tests/integration/commerce-freeze.test.tsx (5 tests)
✓ tests/premium/reservation-contract.test.ts (3 tests)
✓ tests/core/premium/premium-gate-license-key.test.ts (6 tests)
✓ tests/premium/founding-token.test.ts (13 tests)
✓ tests/core/premium/keychain-migration.test.ts (24 tests)
✓ tests/integration/founding-activation.test.ts (42 tests)
✓ tests/premium/premium-gate-founding.test.ts (4 tests)

Test Files  9 passed (9)
Tests  131 passed (131)
```

Core and desktop typechecks exited `0`. Privacy audit output:

```text
RESULT: CLEAN
No violations found.
Core files scanned: 330
Desktop files scanned: 147
Tauri config: verified
```

Sidecar smoke output ended with:

```text
RESULTS: 10 passed, 0 failed
```

Release source verification:

```text
Release manifest source verified: truth-baseline-2026-07-18
```

Focused stable-Rust parser test:

```text
running 3 tests
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

`rustup run stable cargo check` reached native dependency compilation with Rust 1.97.1, then stopped at:

```text
The system library `gdk-3.0` required by crate `gdk-sys` was not found.
The file `gdk-3.0.pc` needs to be installed.
```

The disposable rollback fixture produced:

```text
restoredSha256=db7028694bfe1ea3fa9053535ecf43237d307b34c19442de021a9507faf38aa1
```

Exact output SHA-256:

```text
9ebd30ef90fb71100e5ddb0027253173cca27e00445f589b71760740bcc57cb6
```

The private definition records this as synthetic disposable evidence while all per-install production runtime fields remain `null` and `status` remains `NOT_EXECUTED`.
