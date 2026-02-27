# Step 26 — Living Will + Semblance Witness

## Implementation Prompt for Claude Code

**Sprint:** 5 — Becomes Permanent  
**Builds on:** Audit Trail (Sprint 1), Action Signing (Sprint 1), Style Profile (Step 11), Knowledge Graph (all sprints), Cross-Device Sync encryption (Step 13), VTI architecture  
**Test target:** 50+ new tests. All existing 3,271 tests must pass. TypeScript clean. Privacy audit clean.

---

## Context

You are implementing Step 26 of the Semblance build. Steps 1–25 are complete with 3,271 tests across 261 files, zero failures. The codebase is split across two repositories:

- **semblance-core** (open source): All free-tier code. 3,112 tests at split time.
- **semblence-representative** (proprietary, package name `@semblance/dr`): Premium code. 251 tests.

Both features in this step are **Digital Representative tier** (premium-gated via `PremiumGate.isPremium()` — NOT `isActive()`).

Read `CLAUDE.md` and `docs/DESIGN_SYSTEM.md` before writing any code.

---

## What You're Building

Two features that share cryptographic infrastructure:

### Feature 1: Living Will

A structured, exportable, cryptographically signed archive (`.semblance` file) containing the user's complete digital twin in a portable format. This is NOT raw data — it contains **derived knowledge** (semantic understanding, patterns, profiles) extracted from the knowledge graph and other data stores.

### Feature 2: Semblance Witness

Cryptographically signed, shareable attestations that specific actions were taken by the user's AI twin autonomously. Uses JSON-LD format compatible with the Veridian Trust Infrastructure (VTI).

---

## Architecture Rules — ALWAYS ENFORCED

1. **RULE 1 — Zero Network in AI Core.** Nothing in `packages/core/` touches the network. Ever.
2. **RULE 2 — Gateway Only.** All external network calls flow through the Semblance Gateway via IPC.
3. **RULE 3 — Action Signing.** Every Gateway action is cryptographically signed, logged to append-only audit trail BEFORE execution, verified after.
4. **RULE 4 — No Telemetry.** Zero analytics, crash reporting, usage tracking. No exceptions.
5. **RULE 5 — Local Only Data.** All user data on-device. No cloud anything.

Both Living Will and Witness are entirely local features. Living Will exports to a local file. Witness produces a local attestation file. Neither feature requires Gateway or network access. All cryptographic operations happen in the AI Core.

---

## Shared Infrastructure: Cryptographic Foundations

### Reuse What Exists

**DO NOT create new crypto modules.** Reuse the existing infrastructure:

1. **AES-256-GCM encryption** — Already implemented in cross-device sync (Step 13, `packages/core/`). Reuse the same encryption/decryption functions for Living Will archive encryption. The passphrase-based key derivation (PBKDF2 or Argon2 — check what Step 13 uses) is already built.

2. **Action signing** — Already implemented in Sprint 1 audit trail (`packages/core/` or `packages/gateway/security/`). The same signing infrastructure (keypair generation, signature creation, signature verification) is the foundation for Witness attestations.

3. **Audit trail** — The append-only SQLite WAL audit trail from Sprint 1. Witness reads from this to generate attestations for specific actions.

### New Shared Code

Create a shared attestation module that both Living Will and Witness use:

```
packages/core/attestation/
├── attestation-signer.ts      # Signs attestations (reuses existing signing)
├── attestation-verifier.ts    # Verifies attestations with public key
├── attestation-format.ts      # JSON-LD structure definition
└── types.ts                   # Shared types for attestation system
```

---

## Feature 1: Living Will — Detailed Specification

### Archive Format (.semblance file)

The `.semblance` file is a structured archive. Use a ZIP container (or similar) with a well-defined internal structure:

```
archive.semblance (ZIP)
├── manifest.json              # Version, creation timestamp, creator device ID, 
│                              # content manifest (what's included/excluded),
│                              # signature chain
├── knowledge-graph.json       # Entities, relationships, embeddings metadata
│                              # (NOT raw email content — derived semantic data)
├── style-profile.json         # Communication patterns, vocabulary, tone
├── decision-profile.json      # Decision patterns, priorities, values
├── relationship-map.json      # Contacts, interaction frequency, relationship context
├── preference-manifest.json   # Autonomy settings, domain configs, learned preferences
├── action-summary.json        # Categories of actions taken (NOT individual audit entries)
└── signature.json             # Cryptographic signature proving provenance + integrity
```

### Critical Design Decisions

1. **Version field in manifest.json** — MANDATORY. Format: `{ "version": 1, "semblance_min_version": "1.0.0" }`. Future Semblance versions MUST be able to import older `.semblance` files. The import code must check version and handle gracefully.

2. **Derived knowledge only** — The knowledge graph export contains entities, relationships, and embedding metadata. It does NOT contain raw email bodies, raw document content, or raw financial transactions. It contains the semantic understanding derived from those. For example: an entity node for a person includes name, relationship context, interaction frequency, and topic associations — not the actual emails exchanged with them.

3. **Encryption** — AES-256-GCM with user-supplied passphrase. Key derivation uses the same KDF as cross-device sync (Step 13). The passphrase NEVER leaves the device. The passphrase is NOT stored anywhere — it is entered by the user at export time and required again at import time.

4. **Signing** — The archive manifest includes a cryptographic signature chain that proves:
   - The archive was created by this Semblance instance (device identity)
   - The archive has not been tampered with (integrity)
   - When the archive was created (timestamp)

### Living Will Implementation

```
packages/core/living-will/              # In semblance-core OR semblence-representative
├── living-will-exporter.ts             # Orchestrates export pipeline
├── living-will-importer.ts             # Orchestrates import + restoration
├── living-will-scheduler.ts            # Scheduled auto-export (weekly/monthly)
├── archive-builder.ts                  # Assembles archive sections
├── archive-reader.ts                   # Reads + validates archive sections
├── selective-export.ts                 # Include/exclude specific categories
├── types.ts                            # LivingWillConfig, ArchiveManifest, etc.
└── __tests__/
    ├── living-will-exporter.test.ts
    ├── living-will-importer.test.ts
    ├── living-will-scheduler.test.ts
    ├── selective-export.test.ts
    └── archive-roundtrip.test.ts       # Export → Import → verify data integrity
```

### Export Flow

1. User navigates to Settings → Your Digital Twin → Living Will
2. User selects categories to include/exclude (selective export)
3. User enters a passphrase (with strength indicator)
4. System queries all data stores:
   - Knowledge graph → entities, relationships (via existing knowledge graph APIs)
   - Style profile → communication patterns (from Step 11)
   - Decision patterns → from proactive engine history
   - Relationship map → from contacts + interaction data
   - Preferences → autonomy settings, domain configs
   - Action summary → aggregated from audit trail (categories + counts, NOT individual entries)
5. System assembles archive sections as JSON
6. System signs the manifest with the device keypair
7. System encrypts the entire archive with the user's passphrase
8. System writes `.semblance` file to user-designated location
9. System generates a Witness attestation for the export action (uses Witness infrastructure from this same step)

### Import Flow

1. User has a fresh Semblance instance (new device or fresh install)
2. User selects "Restore from Living Will"
3. User provides `.semblance` file
4. User enters passphrase
5. System decrypts archive
6. System verifies signature chain (proves integrity, warns if device identity doesn't match but still allows import)
7. System checks version compatibility (`manifest.version`)
8. System restores each section:
   - Knowledge graph entities + relationships → indexed into LanceDB + SQLite
   - Style profile → restored to style profile store
   - Decision patterns → restored to proactive engine
   - Relationship map → restored to contacts
   - Preferences → restored to settings
   - Action summary → stored as historical reference (NOT replayed into audit trail)
9. System fires a Knowledge Moment (significant import) to trigger re-indexing if needed

### Scheduled Export

- User configures cadence: weekly or monthly
- User configures storage location (local path)
- System auto-exports on schedule using the last-set passphrase (stored in secure OS keychain — Tauri's secure storage)
- Each scheduled export replaces the previous one at that location (not accumulating)
- If passphrase is not available (keychain cleared), skip and notify user

### Selective Export

The user can choose which categories to include:

```typescript
interface LivingWillExportConfig {
  includeKnowledgeGraph: boolean;    // default: true
  includeStyleProfile: boolean;       // default: true
  includeDecisionProfile: boolean;    // default: true
  includeRelationshipMap: boolean;    // default: true
  includePreferences: boolean;        // default: true
  includeActionSummary: boolean;      // default: true
  // Granular exclusions within categories:
  excludeFinancialData: boolean;      // default: false (strips financial entities from KG)
  excludeHealthData: boolean;         // default: false (strips health entities from KG)
}
```

### Premium Gate

Both export and import are premium-gated:

```typescript
if (!PremiumGate.isPremium()) {
  throw new PremiumFeatureError('living-will');
}
```

Register `'living-will'` as a new PremiumFeature entry.

---

## Feature 2: Semblance Witness — Detailed Specification

### Attestation Format (JSON-LD)

Every Witness attestation follows this structure. It is designed to be VTI-compatible (Veridian Trust Infrastructure) so that when the VTI Registry goes live, attestations can optionally be registered.

```typescript
interface WitnessAttestation {
  "@context": "https://veridian.run/witness/v1";  // JSON-LD context
  "@type": "SemblanceWitness";
  
  // What happened
  action: {
    type: string;              // e.g., "email.send", "subscription.cancel", "form.submit"
    summary: string;           // Human-readable summary (NOT full payload — privacy preserved)
    timestamp: string;         // ISO 8601
    auditTrailRef: string;     // Reference to audit trail entry ID (local only, not included in shared attestation)
  };
  
  // Who authorized it
  autonomy: {
    tier: "guardian" | "partner" | "alter-ego";
    approvedBy: "user" | "alter-ego-autonomous";
  };
  
  // Which device created it
  device: {
    id: string;                // Device identity from hardware attestation or keypair
    platform: string;          // e.g., "macos", "windows", "linux", "ios", "android"
  };
  
  // Cryptographic proof
  proof: {
    type: "Ed25519Signature2020";   // Or whatever signing algorithm is used in Sprint 1
    created: string;                 // ISO 8601
    verificationMethod: string;      // Public key reference
    proofPurpose: "assertionMethod";
    proofValue: string;              // Base64-encoded signature
  };
  
  // VTI bridge (optional, for future use)
  vti?: {
    registryRef?: string;      // VTI Registry reference (null until Registry is live)
    chainPosition?: number;    // Position in VTI attestation chain
  };
}
```

### Critical Design Decisions

1. **Privacy-preserving summaries** — The attestation `action.summary` is a HUMAN-READABLE SUMMARY, not the full action payload. Example: "Sent email to john@example.com regarding meeting reschedule" — NOT the full email body. The `auditTrailRef` links back to the full entry locally but is NOT included when the attestation is shared.

2. **Verification without server** — Anyone with the attestation JSON and the user's public key can verify the signature. Verification is deterministic, offline, requires no server. This is the core Witness promise.

3. **VTI compatibility** — The JSON-LD context (`@context`) and structure follow VTI attestation format conventions. The `vti` field is optional and empty until the VTI Registry launches. The format is forward-compatible — adding VTI registration later requires no format changes.

4. **Signing algorithm** — Use whatever signing algorithm the Sprint 1 audit trail uses. Do NOT introduce a new algorithm. Check the existing code in `packages/core/` or `packages/gateway/security/` for the signing implementation.

### Witness Implementation

```
packages/core/witness/                  # In semblence-representative (premium)
├── witness-generator.ts                # Creates attestation from audit trail entry
├── witness-verifier.ts                 # Verifies attestation with public key
├── witness-exporter.ts                 # Exports attestation as JSON file
├── witness-format.ts                   # JSON-LD structure builder
├── vti-bridge.ts                       # VTI compatibility layer (stub for now, real when Registry launches)
├── types.ts                            # WitnessAttestation, WitnessConfig, etc.
└── __tests__/
    ├── witness-generator.test.ts
    ├── witness-verifier.test.ts
    ├── witness-roundtrip.test.ts       # Generate → Export → Verify cycle
    ├── witness-format.test.ts          # JSON-LD validity
    └── vti-bridge.test.ts             # VTI format compatibility
```

### Generation Flow

1. User navigates to Audit Trail (already exists from Sprint 1)
2. User selects any action entry
3. User taps "Create Witness" button
4. System reads the full audit trail entry
5. System generates a privacy-preserving summary of the action
6. System constructs the JSON-LD attestation structure
7. System signs the attestation with the device keypair
8. System presents the attestation card with options:
   - **View** — show attestation details
   - **Export** — save as `.witness.json` file
   - **Share** — copy to clipboard or share via OS share sheet
   - **Verify** — self-verify (demonstrates the verification flow)

### Verification Flow

Given an attestation JSON and a public key:

1. Extract the `proof.proofValue` (signature)
2. Reconstruct the signed payload (attestation without the proof block)
3. Verify the signature against the public key
4. Return: `{ valid: boolean, signerDevice: string, timestamp: string }`

This is a pure function. No network. No state. Deterministic.

### Public Key Export

For verification to work, the user needs to be able to share their public key. Add a "Export Public Key" option in Settings → Your Digital Twin. This exports the device's public key in a standard format (PEM or JWK) that can be shared with anyone who wants to verify Witness attestations.

### Premium Gate

Witness generation is premium-gated:

```typescript
if (!PremiumGate.isPremium()) {
  throw new PremiumFeatureError('witness-attestation');
}
```

Witness **verification** is NOT premium-gated — anyone can verify an attestation. This is intentional: verification is a public good that increases trust in the ecosystem.

Register `'witness-attestation'` as a new PremiumFeature entry.

---

## Commit Strategy

Execute in this order. Each commit must leave all tests passing and TypeScript clean.

### Commit 1: Shared Attestation Infrastructure
- `packages/core/attestation/` — attestation-signer, attestation-verifier, attestation-format, types
- Reuses existing signing infrastructure from Sprint 1
- Reuses existing encryption from Step 13
- **Tests:** 8–10 tests covering sign, verify, format construction, roundtrip verification
- **Verify:** `npx tsc --noEmit && npx vitest run`

### Commit 2: Living Will Archive Builder + Format
- `archive-builder.ts`, `archive-reader.ts`, `types.ts`
- Archive assembly from mock data, ZIP packaging, manifest with version field
- JSON structure for each section (knowledge graph, style profile, etc.)
- **Tests:** 8–10 tests covering archive build, read, version check, manifest structure
- **Verify:** `npx tsc --noEmit && npx vitest run`

### Commit 3: Living Will Export Pipeline
- `living-will-exporter.ts`, `selective-export.ts`
- Full export flow: query data stores → assemble → sign → encrypt → write file
- Selective export with include/exclude configuration
- Premium gate enforcement
- **Tests:** 10–12 tests covering full export, selective export, premium gate, encryption verification
- **Verify:** `npx tsc --noEmit && npx vitest run`

### Commit 4: Living Will Import Pipeline
- `living-will-importer.ts`
- Full import flow: read file → decrypt → verify signature → check version → restore sections
- Handles version mismatch gracefully (older versions importable, newer versions warn)
- Fires Knowledge Moment after significant import
- **Tests:** 8–10 tests covering full import, version handling, signature verification, restoration
- **Verify:** `npx tsc --noEmit && npx vitest run`

### Commit 5: Living Will Scheduler
- `living-will-scheduler.ts`
- Configurable cadence (weekly/monthly), storage location, keychain passphrase retrieval
- Skip + notify if passphrase unavailable
- **Tests:** 5–6 tests covering scheduling, cadence, passphrase-missing fallback
- **Verify:** `npx tsc --noEmit && npx vitest run`

### Commit 6: Witness Generator + Format
- `witness-generator.ts`, `witness-format.ts`, `vti-bridge.ts`, types
- Read audit trail entry → generate summary → build JSON-LD → sign
- VTI bridge stub (format-compatible, registration is no-op until Registry)
- **Tests:** 8–10 tests covering generation, JSON-LD validity, VTI format compliance, summary privacy
- **Verify:** `npx tsc --noEmit && npx vitest run`

### Commit 7: Witness Verifier + Exporter + Public Key Export
- `witness-verifier.ts`, `witness-exporter.ts`
- Offline verification: attestation + public key → valid/invalid
- Export as `.witness.json`, public key export
- Verification is NOT premium-gated
- **Tests:** 6–8 tests covering verification (valid + tampered), export format, public key export
- **Verify:** `npx tsc --noEmit && npx vitest run`

### Commit 8: Extension Registration + Integration
- Register both features via `loadExtensions()` → `@semblance/dr` → `createExtension()`
- Register tools: `registerTools()` for Living Will and Witness actions
- Register PremiumFeature entries: `'living-will'`, `'witness-attestation'`
- Living Will export generates a Witness attestation (cross-feature integration)
- **Tests:** 5–8 tests covering extension registration, premium gating, cross-feature attestation
- **Verify:** `npx tsc --noEmit && npx vitest run`

---

## Exit Criteria Checklist

All 10 criteria from `SEMBLANCE_BUILD_MAP_ELEVATION.md`:

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Living Will export generates valid `.semblance` archive | Test: export → file exists, is valid ZIP, contains all sections |
| 2 | Living Will import restores digital twin on fresh instance | Test: export → wipe → import → verify all sections restored |
| 3 | Scheduled export works on configured cadence | Test: scheduler fires, writes file, handles missing passphrase |
| 4 | Selective export includes/excludes chosen categories | Test: exclude financial → verify archive lacks financial entities |
| 5 | Living Will encryption uses AES-256-GCM with user passphrase | Test: encrypted archive not readable without passphrase, wrong passphrase fails |
| 6 | Witness generates signed attestation for any audit trail action | Test: select action → attestation created with valid signature |
| 7 | Witness attestation verifiable with public key (no server) | Test: generate → export → verify with public key → valid. Tamper → invalid. |
| 8 | Witness attestation format is VTI-compatible (JSON-LD, standard signing) | Test: attestation has @context, @type, proof block, valid JSON-LD structure |
| 9 | Witness UI accessible from audit trail with share/export options | Test: attestation card renders, export produces valid file, share works |
| 10 | 50+ new tests. All existing tests pass. Privacy audit clean. | `npx vitest run` — 3,321+ total, 0 failures. `npx tsc --noEmit` clean. |

---

## What NOT to Do

1. **Do NOT create new crypto modules.** Reuse Step 13 encryption and Sprint 1 signing. Find them, import them, use them.
2. **Do NOT include raw data in Living Will archives.** No email bodies, no document content, no raw financial transactions. Only derived/semantic data.
3. **Do NOT require a server for Witness verification.** Verification is purely cryptographic: attestation + public key → boolean.
4. **Do NOT import premium features into core.** Both features register via the extension system (`@semblance/dr`). Core does not import from the DR package.
5. **Do NOT add any network calls.** Both features are entirely local. No Gateway involvement. No IPC for these features.
6. **Do NOT store the Living Will passphrase in plaintext.** For scheduled exports, use the OS secure keychain (Tauri secure storage).
7. **Do NOT hardcode the signing algorithm.** Read what Sprint 1 uses and match it exactly.
8. **Do NOT skip the version field in the archive manifest.** Forward compatibility is a hard requirement.

---

## Autonomous Decision Authority

You may proceed without escalating for:
- File placement decisions within the established package structure
- Test naming and organization
- JSON-LD field naming beyond what's specified (as long as VTI-compatible structure is maintained)
- Internal helper functions and utilities
- Mock data structure for tests

You MUST escalate for:
- Any change to the IPC protocol
- Any addition of network capabilities to core
- Any new external dependency not on the approved list
- Any modification to the audit trail format
- Any change to existing cryptographic signing behavior
- Any decision about what constitutes "derived knowledge" vs "raw data" beyond the examples given

---

## Final Verification

After all commits:

```bash
npx tsc --noEmit                    # Must be clean
npx vitest run                       # Must show 3,321+ tests, 0 failures
npx vitest run --reporter=verbose | grep -c "✓"  # Count new tests (50+ required)
```

Report:
1. Exact test count (total and new)
2. TypeScript status
3. List of all new files created with line counts
4. Which existing crypto modules were reused (with file paths)
5. Exit criteria checklist — each criterion with PASS/FAIL and evidence
