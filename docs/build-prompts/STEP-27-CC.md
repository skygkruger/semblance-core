# Step 27 — Inheritance Protocol

## Implementation Prompt for Claude Code

**Sprint:** 5 — Becomes Permanent  
**Builds on:** Living Will (Step 26), Alter Ego (Step 23), Action Signing (Sprint 1), Style Profile (Step 11), Witness (Step 26)  
**Test target:** 40+ new tests. All existing 3,331 tests must pass. TypeScript clean. Privacy audit clean.

---

## Context

You are implementing Step 27 of the Semblance build. Steps 1–26 are complete with 3,331 tests across 276 files, zero failures. This is the fifth step in Sprint 5 ("Becomes Permanent").

The codebase is split across two repositories:
- **semblance-core** (open source): All free-tier code.
- **semblence-representative** (proprietary, package name `@semblance/dr`): Premium code.

This feature is **Digital Representative tier** (premium-gated via `PremiumGate.isPremium()`).

Read `CLAUDE.md` and `docs/DESIGN_SYSTEM.md` before writing any code.

---

## What You're Building

The Inheritance Protocol is a pre-authorized set of actions that Semblance executes on the user's behalf when activated by a designated trusted party. Think of it as a digital will — the user configures what should happen, who can trigger it, and under what conditions. When activated, Semblance carries out the user's wishes in their voice.

This is one of the most sensitive features in the entire product. Conservative defaults are non-negotiable. Every action must be auditable. Safety guardrails must be architecturally enforced, not just policy.

---

## Architecture Rules — ALWAYS ENFORCED

1. **RULE 1 — Zero Network in AI Core.** Nothing in `packages/core/` touches the network.
2. **RULE 2 — Gateway Only.** All external network calls flow through the Semblance Gateway via IPC.
3. **RULE 3 — Action Signing.** Every Gateway action is cryptographically signed and audit-trailed.
4. **RULE 4 — No Telemetry.** Zero analytics or tracking.
5. **RULE 5 — Local Only Data.** All data on-device only.

The Inheritance Protocol configuration, trusted party data, activation packages, and execution state are ALL local. The only network-touching actions are when the protocol *executes* pre-authorized actions (e.g., sending notification emails) — those flow through the Gateway via normal IPC action requests with full signing and audit trail, same as any other Semblance action.

---

## Existing Code to Reuse

Find and reuse these. DO NOT recreate.

**From Step 26 (attestation infrastructure):**
- `packages/core/attestation/attestation-signer.ts` — AttestationSigner for signing activation packages and protocol actions
- `packages/core/attestation/attestation-verifier.ts` — AttestationVerifier for verifying activation packages

**From Step 26 (Living Will):**
- `packages/core/living-will/types.ts` — LivingWillArchive, LivingWillExportConfig
- `packages/core/living-will/archive-builder.ts` — ArchiveBuilder (for including Inheritance config in Living Will exports)

**From Step 26 (Witness):**
- `packages/core/witness/witness-generator.ts` — WitnessGenerator (every Inheritance action generates a Witness attestation)

**From Sprint 1 (audit trail):**
- Audit trail logging infrastructure — all Inheritance Protocol actions must be logged

**From Step 11 (Style Profile):**
- `packages/core/style/style-profile.ts` — StyleProfileStore.getActiveProfile() for drafting notification messages in the user's voice

**From Step 23 (Autonomy):**
- `packages/core/agent/autonomy.ts` — AutonomyManager for understanding current autonomy configuration

**From Step 13 (encryption):**
- AES-256-GCM encryption via PlatformAdapter for encrypting activation packages

**From Premium infrastructure:**
- `packages/core/premium/premium-gate.ts` — PremiumGate.isPremium()
- `packages/core/extensions/types.ts` — ExtensionInsightTracker, SemblanceExtension

---

## Detailed Specification

### Core Concepts

**Trusted Party:** A person the user designates to activate the Inheritance Protocol. Each trusted party gets:
- A name, email, and relationship label
- A unique cryptographic activation package
- A passphrase (set by the user during designation, communicated to the trusted party out-of-band)
- A set of pre-authorized actions specific to that trusted party

**Activation Package:** An encrypted bundle that, combined with the trusted party's passphrase, authenticates and triggers Inheritance Mode. The package alone is insufficient — the passphrase is required. The passphrase alone is insufficient — the package is required. Neither can activate the protocol independently.

**Inheritance Mode:** A special operational mode where Semblance executes pre-authorized actions sequentially with a full audit trail. While in Inheritance Mode, Semblance cannot:
- Modify the Living Will
- Modify the Inheritance Protocol configuration itself
- Modify autonomy settings
- Execute any action not explicitly pre-authorized
- This is enforced architecturally (read-execute only mode), not just by policy

**Pre-Authorized Actions:** The user defines exactly what each trusted party can trigger. Categories:
- **Notifications:** People to contact, with message templates drafted in the user's voice (via style profile)
- **Account Actions:** Subscriptions to cancel, services to notify
- **Data Sharing:** Which Living Will sections to share with which parties
- **Preservation:** What to archive permanently, what to delete

### Data Model

```typescript
interface InheritanceConfig {
  id: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  trustedParties: TrustedParty[];
  globalSettings: {
    timeLockHours: number;           // Default: 72 (3 days). 0 = immediate.
    defaultExecutionMode: 'batch' | 'step-by-step';  // Default: 'step-by-step'
    requireAllPartiesForDeletion: boolean;  // Default: true (deletion actions need ALL parties to agree)
  };
}

interface TrustedParty {
  id: string;
  name: string;
  email: string;
  relationship: string;             // e.g., "spouse", "sibling", "attorney", "friend"
  createdAt: string;
  activationPackage: EncryptedActivationPackage;  // Encrypted with party's passphrase
  preAuthorizedActions: PreAuthorizedAction[];
  notificationTemplates: NotificationTemplate[];
}

interface EncryptedActivationPackage {
  id: string;
  encryptedPayload: EncryptedPayload;  // AES-256-GCM encrypted with sha256(passphrase)
  deviceSignature: string;              // Signed by device keypair to prove origin
  createdAt: string;
}

interface PreAuthorizedAction {
  id: string;
  category: 'notification' | 'account-action' | 'data-sharing' | 'preservation';
  description: string;               // Human-readable description of what this action does
  actionType: string;                 // Specific action identifier
  parameters: Record<string, unknown>;  // Action-specific parameters
  requiresConfirmation: boolean;      // In step-by-step mode, does trusted party confirm this one?
  order: number;                      // Execution order within this party's actions
}

interface NotificationTemplate {
  id: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  body: string;                      // Pre-drafted in user's voice via style profile
  lastEditedAt: string;              // User can review and edit anytime
  isDefault: boolean;                // System-generated vs user-edited
}

// Activation state (runtime, not persisted until activation)
interface InheritanceActivationState {
  activatedAt: string;
  activatedBy: string;               // TrustedParty.id
  mode: 'batch' | 'step-by-step';
  timeLockExpiresAt: string | null;  // null if time-lock is 0
  status: 'time-locked' | 'executing' | 'paused' | 'completed' | 'cancelled';
  executedActions: ExecutedAction[];
  pendingActions: PreAuthorizedAction[];
  cancelledBy?: string;              // If cancelled during time-lock
}

interface ExecutedAction {
  actionId: string;
  executedAt: string;
  result: 'success' | 'failed' | 'skipped';
  witnessAttestationId: string;      // Every action generates a Witness attestation
  error?: string;
}
```

### Configuration Flow

1. User navigates to Settings → Your Digital Twin → Inheritance Protocol
2. User enables the protocol (disabled by default)
3. User adds a trusted party:
   a. Enters name, email, relationship
   b. Sets a passphrase for this trusted party (shown once, user must communicate it to the party)
   c. System generates the encrypted activation package
   d. System signs the package with the device keypair
4. User configures pre-authorized actions for this trusted party:
   a. **Notifications:** Add recipients → system auto-drafts messages in user's voice using style profile → user reviews and edits
   b. **Account Actions:** Select from known subscriptions/services (from Step 25 financial data) → define action (cancel, notify, etc.)
   c. **Data Sharing:** Select Living Will sections → assign to specific recipients
   d. **Preservation:** Mark data categories for permanent archiving or deletion
5. User sets global settings: time-lock duration, execution mode, deletion consensus requirement
6. User can run a **Test Run** at any time (simulates the entire protocol without executing)

### Activation Flow

1. Trusted party presents the activation package to a Semblance instance
   - This could be the same device, a synced device, or a device with a Living Will import
   - The activation package is a file (`.inheritance` extension) that the trusted party was given
2. Trusted party enters their passphrase
3. System decrypts the activation package using the passphrase
4. System verifies the package signature (proves it was created by the original device)
5. System enters **Inheritance Mode:**
   a. If time-lock > 0: status = 'time-locked', `timeLockExpiresAt` set. Activation can be cancelled during this window (by presenting the activation package + passphrase again and choosing cancel). This is the "oops, false alarm" safety net.
   b. If time-lock = 0 or time-lock expired: execution begins
6. Execution proceeds based on mode:
   a. **Batch mode:** All pre-authorized actions execute sequentially. Each action is logged. Each generates a Witness attestation.
   b. **Step-by-step mode:** Each action is presented to the trusted party for confirmation before execution. The trusted party can skip individual actions.
7. Notifications are sent using the style profile templates. Messages are NOT re-generated at execution time — the pre-drafted, user-reviewed templates are used exactly as stored.
8. After all actions complete (or are skipped), status = 'completed'. Full audit trail available.

### Safety Guardrails — ARCHITECTURALLY ENFORCED

These are not policy. These are code-level invariants that must be tested.

1. **Dual-factor activation:** Package AND passphrase required. Neither alone is sufficient. Test this explicitly.
2. **Read-execute only:** Inheritance Mode CANNOT modify Living Will, Inheritance Protocol config, or autonomy settings. The activation handler must reject any such operation. Test with explicit attempts to modify each.
3. **Notification templates are frozen:** Messages sent are the pre-drafted templates, not regenerated. The style profile is used during configuration (drafting), not during execution.
4. **Time-lock cancellation:** During the time-lock window, presenting package + passphrase + cancel flag cancels the activation. After time-lock expires, cancellation is not possible.
5. **Witness attestation for every action:** No Inheritance action executes without generating a Witness attestation. Test this for each action type.
6. **Deletion consensus (default):** If `requireAllPartiesForDeletion` is true, deletion/preservation actions that destroy data require ALL designated trusted parties to have activated and confirmed. A single trusted party cannot trigger data deletion alone.
7. **No financial actions without explicit pre-authorization:** The default action set for a new trusted party includes zero financial actions. The user must explicitly add each one. There is no "grant all" option for financial actions.
8. **Complete audit trail:** Every activation attempt (successful or failed), every action execution, every skip, every cancellation — all logged to the audit trail with full detail.

### Living Will Integration — CRITICAL REQUIREMENT

**The Inheritance Protocol configuration MUST be included as a Living Will archive section.** This ensures the protocol survives device loss.

Modify the Living Will system (Step 26) to support a new section:

```typescript
// Add to LivingWillArchive type:
interface LivingWillArchive {
  // ... existing sections ...
  inheritanceConfig?: InheritanceConfigExport;  // NEW
}

// Add to LivingWillExportConfig:
interface LivingWillExportConfig {
  // ... existing options ...
  includeInheritanceConfig: boolean;  // default: true
}
```

**What gets exported:** Trusted party designations (names, emails, relationships), pre-authorized action definitions, notification template text, global settings. 

**What does NOT get exported in the Living Will:** Activation packages and passphrase-derived keys. These are security-critical and device-specific. When Inheritance config is restored from a Living Will import, the user must re-generate activation packages for each trusted party (re-enter passphrases, re-distribute packages). This is intentional — you can't clone activation credentials across devices via Living Will.

**What this means for import:** When a Living Will with Inheritance config is imported, the protocol is restored in a "needs re-activation" state. All configuration is preserved (parties, actions, templates, settings), but all activation packages are marked as invalid until the user re-generates them. The UI should clearly communicate this.

### Test Run Mode

Test Run simulates the entire protocol without executing any actions:

1. User selects a trusted party and triggers "Test Run" from the configuration UI
2. System walks through the entire activation flow:
   - Validates the activation package can be decrypted (user enters the passphrase)
   - Shows what each action would do, in execution order
   - Shows what each notification message would say
   - Shows the time-lock that would apply
3. No emails are sent. No subscriptions are cancelled. No data is shared or deleted.
4. The test run IS logged to the audit trail (as a test run, clearly marked)
5. The test run does NOT generate Witness attestations (those are for real actions only)

### Extension Registration

Register the Inheritance Protocol via the extension system:

- **InheritanceTracker** implements `ExtensionInsightTracker`:
  - `generateInsights()`: checks if Inheritance Protocol is enabled but has stale configuration (e.g., trusted party email changed in contacts, notification templates not reviewed in 90+ days). Returns insight suggesting review.
  - Only returns results if `premiumGate.isPremium()`

- Register `'inheritance-protocol'` as a new PremiumFeature entry in PremiumGate (17 → 18 features)

---

## File Structure

```
packages/core/inheritance/
├── types.ts                           # All interfaces defined above
├── inheritance-config-store.ts        # CRUD for InheritanceConfig in SQLite
├── trusted-party-manager.ts           # Add/remove/update trusted parties
├── activation-package-generator.ts    # Creates encrypted activation packages
├── activation-handler.ts              # Processes activation: decrypt, verify, enter Inheritance Mode
├── inheritance-executor.ts            # Executes pre-authorized actions sequentially
├── notification-drafter.ts            # Drafts notification templates using style profile
├── test-run-engine.ts                 # Simulates protocol without executing
├── inheritance-mode-guard.ts          # Enforces read-execute only restrictions in Inheritance Mode
├── inheritance-tracker.ts             # ExtensionInsightTracker for stale config
├── living-will-integration.ts         # Hooks into Living Will export/import for Inheritance config
├── index.ts                           # Barrel exports
└── __tests__/                         
    # (tests go in tests/core/inheritance/)
```

---

## Commit Strategy

### Commit 1: Types + Config Store (6 tests)

Create all type definitions and the SQLite-backed configuration store.

- `types.ts` — all interfaces
- `inheritance-config-store.ts`:
  - `initSchema()` — creates `inheritance_config`, `trusted_parties`, `pre_authorized_actions`, `notification_templates` tables
  - `getConfig()`, `saveConfig()`, `isEnabled()`
  - `addTrustedParty()`, `removeTrustedParty()`, `updateTrustedParty()`, `getTrustedParty()`
  - `addAction()`, `removeAction()`, `updateAction()`, `getActionsForParty()`
  - `addTemplate()`, `updateTemplate()`, `getTemplatesForParty()`

**Tests:** tests/core/inheritance/inheritance-config-store.test.ts
1. Creates schema and stores config
2. Adds trusted party and retrieves it
3. Removes trusted party and cascades actions/templates
4. Adds pre-authorized action with correct ordering
5. Stores and retrieves notification templates
6. Returns disabled config by default (conservative default)

### Commit 2: Activation Package Generator (5 tests)

- `activation-package-generator.ts`:
  - `generatePackage(trustedParty, passphrase, signingKey)`: encrypts party config + authorization token with AES-256-GCM using sha256(passphrase), signs with device key
  - `exportPackage(package)`: serializes to `.inheritance` file format
  - Reuses AES-256-GCM from PlatformAdapter and AttestationSigner from Step 26

- `trusted-party-manager.ts`:
  - `designateParty(name, email, relationship, passphrase)`: creates TrustedParty + generates activation package
  - `regeneratePackage(partyId, passphrase)`: creates new package (for re-distribution or after Living Will restore)
  - `revokeParty(partyId)`: removes party and invalidates their package

**Tests:** tests/core/inheritance/activation-package.test.ts
1. Generates encrypted activation package from trusted party config
2. Package decrypts with correct passphrase
3. Package fails to decrypt with wrong passphrase
4. Package signature verifies with device key
5. Regenerated package invalidates previous package

### Commit 3: Activation Handler + Mode Guard (8 tests)

- `activation-handler.ts`:
  - `activate(packageFile, passphrase)`: decrypts → verifies signature → checks party exists → enters Inheritance Mode
  - `cancelActivation(packageFile, passphrase)`: cancels during time-lock window
  - `getActivationState()`: returns current InheritanceActivationState
  - Returns clear errors: 'invalid_passphrase', 'invalid_package', 'unknown_party', 'already_active', 'time_lock_expired'

- `inheritance-mode-guard.ts`:
  - `isInheritanceMode()`: boolean
  - `assertNotRestricted(operation)`: throws if in Inheritance Mode and operation is restricted
  - Restricted operations: 'modify_living_will', 'modify_inheritance_config', 'modify_autonomy', 'modify_settings'
  - This guard must be checked by the relevant stores/managers — add integration points

**Tests:** tests/core/inheritance/activation-handler.test.ts
1. Activates with valid package + passphrase → enters Inheritance Mode
2. Rejects activation with wrong passphrase
3. Rejects activation with tampered package (signature invalid)
4. Time-lock: activation sets status to 'time-locked' with correct expiry
5. Cancel during time-lock succeeds → status = 'cancelled'
6. Cancel after time-lock expired fails

**Tests:** tests/core/inheritance/inheritance-mode-guard.test.ts
7. Blocks Living Will modification in Inheritance Mode
8. Blocks Inheritance Protocol config modification in Inheritance Mode

### Commit 4: Notification Drafter (5 tests)

- `notification-drafter.ts`:
  - `draftNotification(recipientName, recipientEmail, relationship, context, styleProfile)`: uses style profile to draft a message in the user's voice
  - `draftBatchNotifications(recipients, context, styleProfile)`: drafts for multiple recipients
  - Returns NotificationTemplate objects that the user can review and edit
  - The drafting uses the style profile's vocabulary, tone, and communication patterns
  - Does NOT use the LLM at draft time (style profile already contains extracted patterns — use template interpolation with style-matched language)

**Tests:** tests/core/inheritance/notification-drafter.test.ts
1. Drafts notification with recipient name and context
2. Draft includes style-matched language from style profile
3. Batch drafting produces unique messages per recipient
4. Returns editable NotificationTemplate objects
5. Templates include subject and body fields

### Commit 5: Inheritance Executor (8 tests)

- `inheritance-executor.ts`:
  - `execute(activationState, mode)`: runs pre-authorized actions in order
  - `executeAction(action)`: dispatches single action by category:
    - 'notification': sends email via Gateway IPC (uses stored template, NOT regenerated)
    - 'account-action': sends cancellation/notification via Gateway IPC
    - 'data-sharing': exports Living Will sections and prepares for sharing
    - 'preservation': archives or marks for deletion (respects deletion consensus)
  - `executeStepByStep(activationState, confirmCallback)`: presents each action for trusted party confirmation
  - Each executed action: logged to audit trail, generates Witness attestation via WitnessGenerator
  - Failed actions: logged with error, does not halt execution of remaining actions (continues sequentially)

**Tests:** tests/core/inheritance/inheritance-executor.test.ts
1. Executes notification action — sends via Gateway IPC with stored template
2. Executes account-action — sends cancellation request via Gateway IPC
3. Executes data-sharing — exports specified Living Will sections
4. Step-by-step mode: waits for confirmation before each action
5. Step-by-step mode: skipped action is logged as 'skipped'
6. Every executed action generates a Witness attestation
7. Failed action logs error and continues to next action
8. Deletion action blocked when consensus required and only one party has activated

### Commit 6: Test Run Engine (4 tests)

- `test-run-engine.ts`:
  - `runTestRun(partyId, passphrase)`: simulates full activation flow
  - Returns TestRunResult: { actions: SimulatedAction[], notifications: NotificationPreview[], timeLock: number, warnings: string[] }
  - Validates package decryption (proves passphrase is correct)
  - Does NOT execute any actions, send any emails, share any data, or generate Witness attestations
  - IS logged to audit trail as a test run

**Tests:** tests/core/inheritance/test-run-engine.test.ts
1. Test run validates passphrase (correct → succeeds, wrong → fails)
2. Test run shows all actions that would execute in order
3. Test run shows notification message previews
4. Test run does NOT generate Witness attestations

### Commit 7: Living Will Integration (5 tests)

- `living-will-integration.ts`:
  - `exportInheritanceConfig(configStore)`: extracts config for Living Will export (strips activation packages and passphrase-derived keys)
  - `importInheritanceConfig(data, configStore)`: restores config from Living Will import, marks all activation packages as invalid
  - Hook into ArchiveBuilder: add 'inheritanceConfig' section
  - Hook into LivingWillImporter: restore inheritance config during import

- Modify `packages/core/living-will/types.ts`: add `inheritanceConfig?` to LivingWillArchive
- Modify `packages/core/living-will/types.ts`: add `includeInheritanceConfig: boolean` to LivingWillExportConfig (default: true)
- Modify `packages/core/living-will/archive-builder.ts`: include inheritance config section when present
- Modify `packages/core/living-will/living-will-importer.ts`: restore inheritance config + fire Knowledge Moment after import (also patches the Step 26 gap of missing Knowledge Moment on import)

**Tests:** tests/core/inheritance/living-will-integration.test.ts
1. Export includes inheritance config (trusted parties, actions, templates, settings)
2. Export excludes activation packages and passphrase-derived keys
3. Import restores config with all activation packages marked invalid
4. Import with no inheritance config section is handled gracefully
5. Living Will import fires Knowledge Moment after restoring sections (patches Step 26 gap)

### Commit 8: Extension Registration + Premium Gate (4 tests)

- Modify `packages/core/premium/premium-gate.ts`: add `'inheritance-protocol'` to PremiumFeature type and FEATURE_TIER_MAP → 'digital-representative' (17 → 18 features)

- `inheritance-tracker.ts` implements ExtensionInsightTracker:
  - `generateInsights()`: checks for stale config (templates not reviewed in 90+ days, trusted party contact info changed), returns insights
  - Only returns results if `premiumGate.isPremium()`

- Register Inheritance Protocol via extension system

- Modify `tests/core/premium/premium-gate.test.ts`: update feature count 17 → 18

**Tests:** tests/core/inheritance/inheritance-tracker.test.ts
1. InheritanceTracker returns insight for stale notification templates (90+ days unreviewed)
2. InheritanceTracker returns empty when premium inactive
3. Premium gate blocks inheritance-protocol for free tier
4. Premium gate allows inheritance-protocol for DR tier

---

## What NOT to Do

1. **Do NOT regenerate notification messages at execution time.** Templates are drafted during configuration, reviewed by the user, and stored. Execution uses the stored templates exactly. The user's voice is captured at config time, not reconstructed at activation time.
2. **Do NOT allow Inheritance Mode to modify anything.** It is read-execute only. Test this explicitly with attempts to modify Living Will, Inheritance config, and autonomy settings.
3. **Do NOT create a "grant all" option for financial actions.** Each financial action must be explicitly pre-authorized individually.
4. **Do NOT store passphrase or passphrase-derived keys in the Living Will export.** Activation packages are device-specific and security-critical. They must be regenerated after Living Will restore.
5. **Do NOT skip Witness attestation generation for any executed action.** Every real action (not test run) generates an attestation.
6. **Do NOT add network calls in the Inheritance Protocol code itself.** Action execution dispatches to the Gateway via existing IPC patterns. The Inheritance code orchestrates; the Gateway executes.
7. **Do NOT allow a single trusted party to trigger data deletion when consensus mode is enabled.** Deletion requires all parties to have activated.

---

## Autonomous Decision Authority

You may proceed without escalating for:
- SQLite table schema design for inheritance config storage
- File placement within the established package structure
- Test naming and organization
- Notification template interpolation approach
- Error message wording
- Internal helper functions

You MUST escalate for:
- Any change to the IPC protocol
- Any change to the Living Will archive format beyond adding the new section
- Any modification to the activation package encryption approach
- Any decision about what constitutes a "financial action" (use conservative interpretation)
- Any change to existing Witness or audit trail behavior
- Any new external dependency

---

## Exit Criteria Checklist

All 11 criteria from `SEMBLANCE_BUILD_MAP_ELEVATION.md`:

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Trusted party designation flow with cryptographic package generation | Test: add party → package generated, encrypted, signed |
| 2 | Pre-authorized actions configurable per trusted party | Test: add/remove/update actions per party |
| 3 | Notification templates drafted in user's voice via style profile | Test: draft produces style-matched message |
| 4 | Activation flow: package + passphrase → Inheritance Mode → actions execute | Test: full activation → execution → completion |
| 5 | Test run mode simulates without executing | Test: test run shows actions, sends nothing |
| 6 | Time-lock option delays execution | Test: activation with time-lock → status = 'time-locked' → cancellable |
| 7 | Action-by-action confirmation mode works | Test: step-by-step mode waits for confirmation, allows skip |
| 8 | Every Inheritance action generates a Witness attestation | Test: executed actions have attestation IDs |
| 9 | Audit trail captures complete Inheritance Protocol execution | Test: full audit trail of activation, execution, completion |
| 10 | Inheritance Protocol cannot modify Living Will or itself (security) | Test: explicit modification attempts rejected in Inheritance Mode |
| 11 | 40+ new tests. All existing tests pass. Privacy audit clean. | `npx vitest run` — 3,376+ total, 0 failures. `npx tsc --noEmit` clean. |

**Additional requirement (locked in this session):**
| 12 | Inheritance Protocol config included as Living Will section | Test: export includes config, import restores it, packages marked invalid |

---

## Test Count

| Commit | Tests | Cumulative |
|--------|-------|------------|
| 1 | 6 | 6 |
| 2 | 5 | 11 |
| 3 | 8 | 19 |
| 4 | 5 | 24 |
| 5 | 8 | 32 |
| 6 | 4 | 36 |
| 7 | 5 | 41 |
| 8 | 4 | 45 |

**Total: 45 new tests. Baseline + new = 3,331 + 45 = 3,376.**

---

## Final Verification

After all commits:

```bash
npx tsc --noEmit                    # Must be clean
npx vitest run                       # Must show 3,376+ tests, 0 failures
```

Report:
1. Exact test count (total and new)
2. TypeScript status
3. List of all new files created with line counts
4. Which existing modules were reused (with file paths)
5. Exit criteria checklist — each criterion (all 12) with PASS/FAIL and evidence
6. Confirmation that Living Will import now fires Knowledge Moment (Step 26 gap patched)
