# Step 30b — Platform Hardening + Biometric Auth + Encrypted Backup

## Implementation Prompt for Claude Code

**Sprint:** 6 — Becomes Undeniable  
**Builds on:** Step 30a (Cryptographic Overhaul), Step 13 (cross-device sync), Step 26 (Living Will), Step 27 (Inheritance Protocol)  
**Test target:** 50+ new tests. All existing 3,525 tests must pass. TypeScript clean.  
**Nature of this step:** User-facing platform security. New features: biometric auth, encrypted backup, OS sandboxing. This is what the user sees and interacts with — the external hardening layer that protects Step 30a's internal cryptographic upgrades.

---

## Context

You are implementing Step 30b — the second half of the security hardening step. Steps 1–29 are complete, Step 30a landed 56 tests of cryptographic upgrades (Argon2id, Ed25519, SQLCipher, TLS 1.3, certificate pinning). Total baseline: 3,525 tests across 315 files, zero failures.

Step 30a upgraded how Semblance encrypts, signs, and derives keys internally. Step 30b upgrades how the OS protects Semblance and how the user protects their data. The dependency flows one direction: 30b uses 30a's Argon2id KDF for backup encryption and 30a's SQLCipher database key storage pattern for biometric-protected key access.

This step exists because of a critical gap identified during Step 27 (Inheritance Protocol): **single-device users with no scheduled Living Will exports have zero recovery path if their device is lost or destroyed.** Cross-device sync (Step 13) protects multi-device users. Living Will scheduled exports provide recovery points if exported to a surviving location. But a single-device user who never set up exports loses everything. This step closes that gap.

Read `CLAUDE.md` and `docs/DESIGN_SYSTEM.md` before writing any code. Read `docs/SECURITY_THREAT_MODEL.md` (created in Step 30a) for the cryptographic inventory and threat model context.

---

## Architecture Rules — ALWAYS ENFORCED

1. **RULE 1 — Zero Network in AI Core.** Backup encryption, biometric auth logic — all in core. No network.
2. **RULE 2 — Gateway Only.** No network calls from backup or auth modules.
3. **RULE 3 — Action Signing.** Backup creation and biometric config changes are audit-trailed.
4. **RULE 4 — No Telemetry.** No analytics on biometric usage, backup frequency, or auth patterns.
5. **RULE 5 — Local Only Data.** Encrypted backups are written to a LOCAL filesystem path chosen by the user. Semblance never connects to cloud services. If the user points the backup at an iCloud Drive or Google Drive synced folder, the OS handles sync — Semblance writes an encrypted blob to a local path and doesn't know or care what syncs it.

---

## Existing Infrastructure from Step 30a

Find and reuse these. DO NOT recreate.

```
packages/core/crypto/key-derivation.ts    — deriveKey() (Argon2id), deriveKeyLegacy(), generateSalt()
packages/core/crypto/ed25519.ts           — generateKeyPair(), sign(), verify()
packages/core/crypto/device-keypair.ts    — getOrCreateDeviceKeyPair(storage), exportPublicKey()
packages/core/crypto/database-encryption.ts — getOrCreateDatabaseKey(), openEncryptedDatabase(), migrateToEncrypted()
packages/core/crypto/types.ts             — KeyDerivationResult, Ed25519KeyPair, SecureStorageAdapter
packages/core/platform/types.ts           — SecureStorageAdapter interface (added in 30a)
packages/gateway/security/tls-config.ts   — TLS 1.3 enforcement
packages/gateway/security/certificate-pins.ts — CertificatePinRegistry
docs/SECURITY_THREAT_MODEL.md             — Existing threat model to update
```

Also reuse:
```
packages/core/living-will/archive-builder.ts — ArchiveBuilder for full-state backups
packages/core/attestation/attestation-signer.ts — AttestationSigner (now Ed25519 from 30a)
packages/core/extensions/types.ts — ExtensionInsightTracker for backup nudge tracker
packages/core/premium/premium-gate.ts — PremiumGate.isPremium() (backup is free, but nudges may differ)
```

---

## Detailed Specification

### Feature 1: Biometric Authentication

**What:** App-level authentication using the device's native biometric hardware — Face ID, Touch ID, fingerprint, Windows Hello, PIN. Two tiers of protection: app unlock and sensitive action re-confirmation.

**Why:** Semblance holds the user's entire digital life. Launching without biometric lock would be a legitimate security concern. Every device that can run Semblance has some form of native biometrics.

**Implementation approach:**

Create a `BiometricAuthManager` that abstracts platform-specific biometrics behind a unified interface. The actual biometric API calls are platform-specific (Tauri on desktop, React Native on mobile), so the core module defines the interface and the platform adapters implement it.

```typescript
// Add to packages/core/platform/types.ts (extend PlatformAdapter)
interface BiometricAdapter {
  isAvailable(): Promise<boolean>;
  getBiometricType(): Promise<'face-id' | 'touch-id' | 'fingerprint' | 'windows-hello' | 'pin' | 'none'>;
  authenticate(reason: string): Promise<BiometricResult>;
  canStoreInKeychain(): boolean;
}

interface BiometricResult {
  success: boolean;
  error?: 'cancelled' | 'not-enrolled' | 'lockout' | 'not-available' | 'failed';
}
```

**BiometricAuthManager (packages/core/auth/biometric-auth-manager.ts):**
- `initialize(adapter: BiometricAdapter)`: checks availability, stores adapter reference
- `isEnabled(): boolean`: reads from user preferences
- `setEnabled(enabled: boolean): void`: updates preference, requires biometric confirmation to disable
- `requireAuth(reason: string): Promise<boolean>`: triggers biometric prompt, returns success/failure
- `getAuthConfig(): AuthConfig`: returns current configuration
- `setAuthConfig(config: AuthConfig): void`: updates config

**AuthConfig:**
```typescript
interface AuthConfig {
  enabled: boolean;                          // Default: true (prompt user on first launch)
  lockTimeout: 'immediate' | '1min' | '5min' | '15min' | 'never';  // Default: '5min'
  sensitiveActionReconfirm: boolean;         // Default: true
  lastAuthTimestamp: number;                 // Track for timeout
}
```

**App unlock flow:**
1. On app launch or resume from background, check if lock timeout has elapsed
2. If elapsed → show biometric prompt with reason "Unlock Semblance"
3. If biometric fails → show retry with option for device PIN/password fallback
4. If not enrolled → show guidance to set up biometrics in device settings, allow access with warning
5. If disabled by user → no prompt (user's choice, but default is enabled)

**Sensitive action re-confirmation:**
These actions require biometric re-confirmation even if the app is already unlocked:
- Living Will export (passphrase confirmation already exists, biometric adds a layer)
- Living Will import
- Inheritance Protocol configuration changes
- Inheritance Protocol activation
- Alter Ego tier activation
- Witness key export
- Backup passphrase changes
- Auth settings changes (including disabling biometric)

Implementation: `requireSensitiveAuth(action: string): Promise<boolean>` checks `sensitiveActionReconfirm` config and prompts if enabled.

**SQLCipher key integration:**
Step 30a's `getOrCreateDatabaseKey()` stores the database encryption key in `SecureStorageAdapter`. The biometric auth manager integrates with this: the `SecureStorageAdapter` implementation on each platform should require biometric authentication to access stored keys. This means:
- On macOS: Keychain access with `kSecAccessControlBiometryAny` 
- On iOS: Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` + biometric policy
- On Android: Keystore with `setUserAuthenticationRequired(true)`
- On Windows: Windows Hello credential guard

The core module doesn't implement this directly — it delegates to the `SecureStorageAdapter` which is platform-specific. What the core module does is:
1. Define the interface
2. Implement the auth flow logic (timeouts, config, sensitive action gating)
3. Test with a mock BiometricAdapter

**First launch experience:**
On first launch after the update (or fresh install), prompt the user to enable biometric protection. Default is enabled. The user can decline, but the prompt should explain why it matters. This prompt is NOT a nag — it appears once and respects the user's choice.

### Feature 2: Encrypted Local Backup

**What:** Automatic encrypted backups to a user-designated local filesystem path. Covers the single-device protection gap.

**Why:** Living Will is a portable digital twin export — derived knowledge designed for migration. Encrypted backup is a full state snapshot that can restore Semblance to its exact state including raw indexed data, audit trail, and configuration. This is the safety net for single-device users.

**Key principle: Semblance writes an encrypted blob to a local folder. What happens to that folder is the user's business.** If they point it at an iCloud Drive synced folder, a Google Drive folder, a NAS mount, or an external USB drive — that's their choice. Semblance never touches the network. It writes locally. The OS handles any sync. This respects sovereignty completely.

**BackupManager (packages/core/backup/backup-manager.ts):**

```typescript
interface BackupConfig {
  enabled: boolean;                          // Default: false (user must opt in)
  destinationPath: string;                   // User-chosen folder
  schedule: 'daily' | 'weekly' | 'manual';  // Default: 'weekly'
  maxBackups: number;                        // Default: 5 (rolling window)
  lastBackupAt: string | null;
  lastBackupSizeBytes: number | null;
  passphrase: string | null;                 // Stored in SecureStorageAdapter, NOT here
}

interface BackupManifest {
  version: 2;                                // Matches Living Will archive version
  createdAt: string;
  deviceId: string;
  semblanceVersion: string;
  backupType: 'full' | 'incremental';
  encryptedWith: 'argon2id';                 // KDF identifier
  salt: string;                              // Hex-encoded Argon2id salt
  contents: BackupContentEntry[];            // What's in this backup
  integrityHash: string;                     // SHA-256 of encrypted payload
}

interface BackupContentEntry {
  name: string;                              // e.g., 'main.db', 'vectors.lance', 'preferences'
  type: 'sqlite' | 'lancedb' | 'config' | 'audit-trail';
  sizeBytes: number;
  encryptedSizeBytes: number;
}
```

**Backup creation flow:**
1. User configures backup destination (folder picker) and passphrase
2. Passphrase stored in SecureStorageAdapter (biometric-protected)
3. On schedule (or manual trigger):
   a. Derive encryption key from passphrase via `deriveKey()` (Argon2id from 30a) with fresh salt
   b. Export SQLite databases (all tables — full dump as structured JSON, not raw SQLCipher dump since the backup needs its own independent encryption)
   c. Export LanceDB data files
   d. Export configuration (preferences, autonomy settings, premium gate state)
   e. Export audit trail
   f. Combine into single archive, encrypt with AES-256-GCM
   g. Write manifest (plaintext header) + encrypted payload to `{destinationPath}/semblance-backup-{timestamp}.sbk`
   h. Sign the backup with device Ed25519 key (from 30a) for integrity verification
   i. If `maxBackups` exceeded, delete oldest backup in the destination folder
4. Log backup creation to audit trail

**Backup restoration flow:**
1. User selects `.sbk` file
2. Biometric authentication required
3. User enters backup passphrase
4. Derive key via Argon2id (read salt from manifest)
5. Decrypt and verify integrity hash
6. Verify Ed25519 signature (optional — warns if can't verify, doesn't block)
7. Import data: restore SQLite tables, LanceDB data, configuration, audit trail
8. Fire Knowledge Moment (same pattern as Living Will import)
9. Mark Inheritance Protocol activation packages as invalid (same as Living Will import — they're device-specific)
10. Log restoration to audit trail

**Incremental backups:**
Full backups can be large. After the first full backup, subsequent backups can be incremental:
- Track which tables/files have changed since last backup (via modification timestamps or content hashes)
- Only export changed data
- Incremental backup references the full backup it's based on
- Restoration: apply full backup, then apply incrementals in order

**If incremental backup is too complex for this step:** Ship with full-only backups and document incremental as a post-launch enhancement. Full backups are more important than optimization right now.

**File format (.sbk — Semblance Backup):**
```
[Manifest JSON — plaintext, includes salt and content listing]
[Separator: 0x00 0x00 0x00 0x00]
[Encrypted payload — AES-256-GCM]
[Ed25519 signature — 64 bytes]
```

### Feature 3: External Drive Auto-Detection

**What:** When an external drive is connected, Semblance detects it and offers to set it as a backup destination or trigger an immediate backup.

**Why:** External drives are the most sovereignty-pure backup option — data never leaves physical hardware the user controls. Making this automatic removes friction.

**ExternalDriveDetector (packages/core/backup/external-drive-detector.ts):**

```typescript
interface DriveDetectionConfig {
  enabled: boolean;                          // Default: true
  autoBackupOnConnect: boolean;              // Default: false (offer, don't auto-execute)
  knownDrives: KnownDrive[];                // Previously used drives
}

interface KnownDrive {
  id: string;                                // Stable drive identifier (serial number, UUID, volume name hash)
  label: string;                             // User-friendly name
  lastBackupPath: string;                    // Where backups went on this drive
  lastBackupAt: string;
}

interface DriveEvent {
  type: 'connected' | 'disconnected';
  driveId: string;
  label: string;
  mountPath: string;
  availableSpaceBytes: number;
}
```

**Implementation approach:**

The actual drive detection is platform-specific:
- **macOS:** `NSWorkspace.didMountNotification` / `IOKit` disk arbitration
- **Linux:** `udev` rules or `udisks2` D-Bus monitoring
- **Windows:** `WM_DEVICECHANGE` messages

The core module defines the interface and logic. The platform adapter (Tauri/React Native) implements the actual OS hooks.

**Core logic (platform-agnostic):**
1. `DriveMonitor` receives `DriveEvent` from platform adapter
2. On `connected`:
   a. Check if drive is in `knownDrives` (previously used for backup)
   b. If known AND `autoBackupOnConnect` is true → trigger backup to known path
   c. If known AND `autoBackupOnConnect` is false → show notification: "Your backup drive is connected. Back up now?"
   d. If unknown AND backup is not configured → show notification: "External drive detected. Set up encrypted backup?"
   e. If unknown AND backup is configured elsewhere → no notification (don't nag)
3. On `disconnected`:
   a. If this was the active backup destination → log to audit trail, show subtle warning in settings

**Notification patterns:**
- First detection of ANY external drive (if backup not configured): "Protect your digital twin. Set up encrypted backup to [drive name]?"
- Known backup drive connected: "Back up to [drive name] now?" (with one-tap action)
- Drive disconnected while it was backup destination: subtle settings indicator, no popup

**Do NOT be aggressive with notifications.** One notification per drive connection event max. Dismiss is permanent for that session. The user's choice is respected.

### Feature 4: Single-Device User Nudges

**What:** Proactive insights that nudge single-device users toward setting up backup protection.

**Why:** The entire point of this step. Single-device users with no backups are unprotected.

**BackupNudgeTracker (packages/core/backup/backup-nudge-tracker.ts):**

Implements `ExtensionInsightTracker` with `generateInsights()`:

1. **First nudge (after Knowledge Moment):** When the user has indexed enough data that loss would hurt (>100 entities in knowledge graph AND no backup configured AND no sync peers), generate insight: "Your Semblance has learned a lot about you. Set up an encrypted backup so you never lose it."
2. **Stale backup nudge:** If backup is configured but last backup is >14 days old, generate insight: "Your last backup was [X] days ago. Run a backup to stay protected."
3. **Single-device awareness:** If no sync peers detected (no cross-device sync from Step 13) AND no backup configured, periodic nudge (every 30 days): "You're running Semblance on one device with no backup. If this device is lost, your digital twin goes with it."
4. **Post-import nudge:** After a significant import (Import Everything, Step 25), if no backup exists: "You just imported [X] items. Protect them with an encrypted backup."

**Frequency limits:**
- Max 1 backup-related insight per week
- Dismissed insights don't recur for 30 days
- User can permanently dismiss via "Don't remind me" (stored in preferences)

**This tracker is FREE (not premium-gated).** Backup protection is a sovereignty fundamental, not a premium feature.

### Feature 5: OS Sandboxing + Reproducible Builds

**What:** Platform-level isolation and deterministic builds.

**OS Sandboxing:**

This is primarily configuration, not code. The implementation is:

**macOS App Sandbox (Tauri):**
- Create/update the `.entitlements` file for the Tauri app
- Required entitlements:
  - `com.apple.security.app-sandbox` — enable sandbox
  - `com.apple.security.files.user-selected.read-write` — file access via picker only
  - `com.apple.security.files.bookmarks.app-scope` — persist folder access for backup destination
  - `com.apple.security.network.client` — Gateway needs outbound network
  - `com.apple.security.personal-information.location` — if location features used
  - `com.apple.security.keychain-access-groups` — Keychain for crypto keys
- What the sandbox blocks: arbitrary file system access, launching other apps, accessing other apps' containers
- Verification: app functions correctly with sandbox enabled

**Linux seccomp/AppArmor:**
- Create an AppArmor profile for the Semblance Flatpak/AppImage
- Restrict: network access to Gateway process only, file access to app data directory + user-selected backup path, no ptrace, no raw socket access
- seccomp filter: whitelist required syscalls, deny dangerous ones (ptrace, mount, reboot, etc.)

**Windows AppContainer:**
- Configure Semblance's MSIX package with appropriate capabilities
- Required capabilities: internetClient (Gateway), documentsLibrary (user file access via picker), removableStorage (external drive backup)
- What it blocks: accessing other apps' data, arbitrary registry access, raw network sockets

**Implementation approach for sandboxing:**

Create configuration files and documentation, not runtime code. The sandbox is enforced by the OS based on app packaging configuration. What the core module provides is:

1. `packages/core/security/sandbox-config.ts` — exports the expected entitlements/capabilities for verification
2. Platform-specific config files (`.entitlements`, AppArmor profile, MSIX manifest snippet)
3. A sandbox verification utility that checks at runtime whether expected restrictions are active

```typescript
// packages/core/security/sandbox-verifier.ts
interface SandboxStatus {
  platform: 'macos' | 'linux' | 'windows' | 'ios' | 'android';
  sandboxed: boolean;
  restrictions: SandboxRestriction[];
}

interface SandboxRestriction {
  name: string;                              // e.g., 'filesystem-restricted', 'network-restricted'
  enforced: boolean;
  details: string;
}

// Checks whether the app is running in a sandboxed environment
function verifySandbox(): Promise<SandboxStatus>
```

**Reproducible Builds:**

Create build verification infrastructure:

1. `scripts/reproducible-build.sh` — builds the app twice, compares output hashes
2. `docs/REPRODUCIBLE_BUILDS.md` — documents the build process, toolchain versions, expected hashes
3. Pin all dependency versions (lock files must be committed and checked)
4. Document the build environment: Node.js version, Rust version, OS, architecture

The reproducible build script should:
- Record all dependency versions
- Record build environment details
- Build once → hash output
- Clean → build again → hash output
- Compare hashes
- Report any differences

**If full reproducible builds prove too complex for this step:** Document the approach, pin dependencies, and create the verification script as a best-effort tool. Full bit-for-bit reproducibility across different machines may require additional toolchain work post-launch. The important thing is that the infrastructure exists and the intent is documented.

---

## File Structure

```
packages/core/auth/
├── biometric-auth-manager.ts          # Auth flow logic, timeouts, sensitive action gating
├── types.ts                           # AuthConfig, BiometricResult, BiometricAdapter
├── index.ts                           # Barrel exports

packages/core/backup/
├── backup-manager.ts                  # Backup creation, restoration, scheduling
├── backup-manifest.ts                 # Manifest creation, parsing, verification
├── external-drive-detector.ts         # Drive detection logic, known drives, notifications
├── backup-nudge-tracker.ts            # ExtensionInsightTracker for backup nudges
├── types.ts                           # BackupConfig, BackupManifest, DriveEvent, etc.
├── index.ts                           # Barrel exports

packages/core/security/
├── sandbox-config.ts                  # Expected entitlements/capabilities
├── sandbox-verifier.ts                # Runtime sandbox verification
├── index.ts                           # Barrel exports

scripts/
├── reproducible-build.sh              # Build verification script

docs/
├── REPRODUCIBLE_BUILDS.md             # Build process documentation
```

Plus modifications to:
- `packages/core/platform/types.ts` — add BiometricAdapter to PlatformAdapter
- `docs/SECURITY_THREAT_MODEL.md` — update with backup, biometric, sandboxing sections

---

## Commit Strategy

### Commit 1: Biometric Auth Types + Manager (10 tests)

Create: `packages/core/auth/types.ts`, `biometric-auth-manager.ts`, `index.ts`
Modify: `packages/core/platform/types.ts` — add `BiometricAdapter` interface

**BiometricAuthManager implementation:**
- `initialize(adapter)` — checks availability, loads config from preferences
- `isEnabled()` — reads from stored `AuthConfig`
- `setEnabled(enabled)` — requires biometric confirmation to disable (prevent unauthorized disable)
- `requireAuth(reason)` — checks timeout, prompts if needed
- `requireSensitiveAuth(action)` — always prompts if sensitiveActionReconfirm is enabled
- `isLocked()` — returns true if timeout has elapsed since last auth
- `updateLastAuth()` — records successful auth timestamp
- `getAuthConfig()` / `setAuthConfig(config)` — CRUD for auth configuration

**Mock BiometricAdapter for tests:**
```typescript
class MockBiometricAdapter implements BiometricAdapter {
  available = true;
  biometricType: BiometricType = 'fingerprint';
  shouldSucceed = true;
  
  async isAvailable() { return this.available; }
  async getBiometricType() { return this.biometricType; }
  async authenticate(reason: string) { 
    return this.shouldSucceed 
      ? { success: true } 
      : { success: false, error: 'failed' as const };
  }
  canStoreInKeychain() { return true; }
}
```

**Tests:** tests/core/auth/biometric-auth-manager.test.ts
1. Initializes with available biometric adapter
2. requireAuth prompts when lock timeout has elapsed
3. requireAuth skips prompt when within timeout window
4. requireSensitiveAuth always prompts regardless of timeout
5. setEnabled(false) requires biometric confirmation first
6. Handles biometric not available gracefully (allows access with warning)
7. Handles biometric cancelled (returns false, doesn't error)
8. Handles biometric lockout (returns false with lockout error)
9. Default config has enabled=true, timeout=5min, sensitiveReconfirm=true
10. Config changes persist across manager instances

### Commit 2: Sensitive Action Registry + Guard (6 tests)

Extend `biometric-auth-manager.ts` with sensitive action registry.

**Sensitive actions that require re-confirmation:**
```typescript
const SENSITIVE_ACTIONS = [
  'living-will-export',
  'living-will-import', 
  'inheritance-config-change',
  'inheritance-activate',
  'alter-ego-activate',
  'witness-key-export',
  'backup-passphrase-change',
  'auth-settings-change',
  'backup-restore',
  'encryption-key-export',
] as const;
```

**SensitiveActionGuard utility class:**
```typescript
class SensitiveActionGuard {
  constructor(private authManager: BiometricAuthManager) {}
  
  async guard(action: SensitiveAction): Promise<void> {
    if (!this.authManager.isEnabled()) return;
    const result = await this.authManager.requireSensitiveAuth(action);
    if (!result) throw new AuthRequiredError(action);
  }
}
```

Other modules call `guard.guard('living-will-export')` before sensitive operations. The guard does NOT modify existing modules — it's a utility that callers opt into.

**Tests:** tests/core/auth/sensitive-action-guard.test.ts
1. Guard prompts for Living Will export
2. Guard prompts for Inheritance Protocol activation
3. Guard prompts for backup restoration
4. Guard skips prompt when biometric is disabled by user
5. Guard throws AuthRequiredError on biometric failure
6. All SENSITIVE_ACTIONS are registered and recognized

### Commit 3: Backup Types + Manifest (5 tests)

Create: `packages/core/backup/types.ts`, `backup-manifest.ts`, `index.ts`

**BackupManifest:**
- `createManifest(contents, deviceId, salt)` — builds manifest object
- `serializeManifest(manifest)` — JSON.stringify with consistent formatting
- `parseManifest(data)` — parses and validates manifest from .sbk header
- `verifyIntegrity(manifest, encryptedPayload)` — checks SHA-256 hash
- Version validation: rejects manifests with version > 2 (future-proof but don't silently accept unknown formats)

**Tests:** tests/core/backup/backup-manifest.test.ts
1. Creates manifest with correct version, timestamp, and content entries
2. Serializes and parses manifest roundtrip
3. Integrity hash matches encrypted payload
4. Integrity hash fails with tampered payload
5. Rejects manifest with unknown version

### Commit 4: Backup Manager — Creation (8 tests)

Create: `packages/core/backup/backup-manager.ts`

**BackupManager — creation side:**
- `constructor(deps: { db, crypto, secureStorage, signer, auditLogger })`
- `configure(config: Partial<BackupConfig>)` — stores backup config in preferences
- `getConfig(): BackupConfig`
- `createBackup(passphrase?: string)` — creates full backup:
  1. Get or prompt for passphrase (stored in SecureStorageAdapter)
  2. Generate fresh salt via `generateSalt()`
  3. Derive key via `deriveKey(passphrase, salt)` (Argon2id from 30a)
  4. Export all SQLite tables as JSON (not raw SQLCipher dump — backup has its own encryption)
  5. Export LanceDB data (if accessible, skip gracefully if not)
  6. Export configuration from preferences table
  7. Export audit trail entries
  8. Combine into single JSON object
  9. Encrypt combined data with AES-256-GCM using derived key
  10. Sign encrypted payload with Ed25519 device key
  11. Build manifest
  12. Write `{manifest}\n{separator}\n{encrypted payload}\n{signature}` to .sbk file
  13. Enforce maxBackups rolling window (delete oldest if exceeded)
  14. Log backup creation to audit trail
- `getBackupHistory(): BackupHistoryEntry[]` — list of past backups with timestamps and sizes

**Tests:** tests/core/backup/backup-creation.test.ts
1. Creates backup file at configured destination
2. Backup file contains valid manifest header
3. Backup payload is encrypted (not readable as plaintext)
4. Backup is signed with device Ed25519 key
5. Manifest integrity hash matches payload
6. Rolling window deletes oldest backup when maxBackups exceeded
7. Backup creation logs to audit trail
8. Backup fails gracefully if destination path is inaccessible

### Commit 5: Backup Manager — Restoration (7 tests)

Extend `backup-manager.ts` with restoration:

- `restoreFromBackup(filePath: string, passphrase: string)`:
  1. Read .sbk file
  2. Parse manifest from header
  3. Verify manifest version (must be ≤ 2)
  4. Derive key via Argon2id using salt from manifest
  5. Decrypt payload
  6. Verify integrity hash
  7. Verify Ed25519 signature (warn if can't verify — don't block, the user may be restoring on a new device with a different keypair)
  8. Import SQLite data (same pattern as Living Will import but with raw data, not derived knowledge)
  9. Import LanceDB data
  10. Import configuration
  11. Import audit trail
  12. Fire Knowledge Moment (same pattern as Living Will import from Step 27)
  13. Mark Inheritance Protocol activation packages as invalid (device-specific, must regenerate)
  14. Log restoration to audit trail

- `validateBackup(filePath: string, passphrase: string): BackupValidation` — validates without restoring (checks manifest, decryption, integrity, signature)

**Tests:** tests/core/backup/backup-restoration.test.ts
1. Restores backup with correct passphrase — data matches original
2. Restoration fails with wrong passphrase
3. Restoration fails with tampered payload (integrity hash mismatch)
4. Restoration warns (but proceeds) with unverifiable signature
5. Inheritance Protocol activation packages marked invalid after restore
6. Knowledge Moment fires after restoration
7. Restoration logs to audit trail

### Commit 6: External Drive Detection + Notifications (6 tests)

Create: `packages/core/backup/external-drive-detector.ts`

**ExternalDriveDetector:**
- `constructor(deps: { backupManager, preferences, notificationService })`
- `handleDriveEvent(event: DriveEvent)` — main entry point from platform adapter
- `isKnownDrive(driveId: string): boolean`
- `addKnownDrive(drive: KnownDrive)`
- `getNotification(event: DriveEvent): DriveNotification | null` — determines what notification to show (or null for no notification)

**Notification logic:**
- Known backup drive connected + autoBackup=true → trigger backup (no notification needed)
- Known backup drive connected + autoBackup=false → "Back up to [name] now?"
- Unknown drive + no backup configured → "Protect your digital twin. Set up encrypted backup?"
- Unknown drive + backup configured elsewhere → no notification
- Backup drive disconnected → subtle indicator in settings (no popup)
- Max 1 notification per drive connection event
- Dismissed = permanent for that session

**Tests:** tests/core/backup/external-drive-detector.test.ts
1. Known backup drive triggers backup-now notification
2. Known drive with auto-backup triggers backup directly (no notification)
3. Unknown drive with no backup configured triggers setup-backup notification
4. Unknown drive with backup configured elsewhere triggers no notification
5. Drive disconnection logs to audit trail
6. No duplicate notifications for same drive connection event

### Commit 7: Backup Nudge Tracker (5 tests)

Create: `packages/core/backup/backup-nudge-tracker.ts`

**BackupNudgeTracker implements ExtensionInsightTracker:**

`generateInsights()`:
1. Check entity count in knowledge graph (query entities table count)
2. Check if backup is configured
3. Check if sync peers exist (query sync_peers table from Step 13)
4. Check last backup timestamp
5. Apply nudge rules:
   - >100 entities AND no backup AND no sync peers → "Set up an encrypted backup"
   - Backup configured but last backup >14 days ago → "Your last backup was X days ago"
   - No sync peers AND no backup (periodic, every 30 days) → "Single device, no backup" warning
   - After significant import AND no backup → "Protect your imports"
6. Frequency limit: max 1 backup insight per 7 days
7. Permanently dismissed insights tracked in preferences

**This tracker is NOT premium-gated.** Backup protection is a sovereignty fundamental.

**Tests:** tests/core/backup/backup-nudge-tracker.test.ts
1. Nudges single-device user with no backup after 100+ entities
2. Nudges on stale backup (>14 days)
3. No nudge when backup is fresh and configured
4. No nudge when sync peers exist (multi-device protection active)
5. Respects permanent dismiss preference

### Commit 8: OS Sandboxing + Reproducible Builds + Documentation (6 tests)

Create: `packages/core/security/sandbox-config.ts`, `sandbox-verifier.ts`, `index.ts`
Create: `scripts/reproducible-build.sh`
Create: `docs/REPRODUCIBLE_BUILDS.md`
Modify: `docs/SECURITY_THREAT_MODEL.md` — add biometric auth, encrypted backup, sandboxing, drive detection sections

**SandboxConfig:**
```typescript
const MACOS_ENTITLEMENTS = [
  'com.apple.security.app-sandbox',
  'com.apple.security.files.user-selected.read-write',
  'com.apple.security.files.bookmarks.app-scope',
  'com.apple.security.network.client',
  'com.apple.security.keychain-access-groups',
];

const LINUX_APPARMOR_RESTRICTIONS = [
  'deny-ptrace',
  'deny-raw-socket',
  'restrict-network-to-gateway',
  'restrict-filesystem-to-appdata',
];

const WINDOWS_CAPABILITIES = [
  'internetClient',
  'documentsLibrary',
  'removableStorage',
];
```

**SandboxVerifier:**
- `verifySandbox(): Promise<SandboxStatus>` — delegates to platform adapter to check active restrictions
- Returns structured report of what's enforced and what isn't
- Logs to audit trail if sandbox is not active (informational, not blocking)

**Threat model updates:**
- New section: "Biometric Authentication" — threat: unauthorized app access, mitigation: platform biometrics + configurable timeout
- New section: "Encrypted Backup" — threat: single-device data loss, mitigation: Argon2id + AES-256-GCM encrypted .sbk files
- New section: "External Drive Protection" — threat: backup on stolen drive, mitigation: backup is encrypted before writing
- New section: "OS Sandboxing" — threat: app escape / lateral movement, mitigation: platform sandbox restrictions
- Update "Known Limitations" section with LanceDB encryption deferral status and incremental backup status

**Tests:** tests/core/security/sandbox-verifier.test.ts
1. Reports macOS sandbox status correctly
2. Reports Linux AppArmor status correctly
3. Reports Windows AppContainer status correctly
4. Reports unsandboxed environment as sandboxed=false
5. Sandbox config exports expected entitlements per platform
6. Reproducible build script exists and is executable

---

## What NOT to Do

1. **Do NOT make Semblance connect to any cloud service for backups.** Write encrypted blobs to a local filesystem path. Period. If the user points that path at a cloud-synced folder, that's their choice and their responsibility.
2. **Do NOT store backup passphrases in plaintext.** They go in SecureStorageAdapter (biometric-protected keychain).
3. **Do NOT nag users about biometrics or backups.** One first-launch prompt for biometrics. Frequency-limited nudges for backups. Permanent dismiss is permanent.
4. **Do NOT implement platform-specific biometric code in packages/core/.** Core defines the interface and flow logic. Platform adapters implement the actual biometric API calls. Tests use mock adapters.
5. **Do NOT implement platform-specific drive detection in packages/core/.** Same pattern — core defines the interface and logic, platform adapters provide the actual OS hooks.
6. **Do NOT dump raw SQLCipher encrypted databases into backups.** Backups use their own encryption (Argon2id + AES-256-GCM) independent of the database encryption. Export data as structured JSON, then encrypt the backup.
7. **Do NOT block restoration on signature verification failure.** The user may be restoring onto a new device with a different keypair. Warn, don't block.
8. **Do NOT auto-backup without user opt-in.** Backup is disabled by default. The user must explicitly configure it. Auto-backup-on-drive-connect also requires explicit opt-in.
9. **Do NOT skip audit trail logging for any backup or auth event.** Every backup creation, restoration, auth failure, drive detection, config change — all logged.
10. **Do NOT premium-gate backup features.** Encrypted backup and nudges are free. Backup protection is a sovereignty fundamental, not a premium upsell.

---

## Autonomous Decision Authority

You may proceed without escalating for:
- SQLite table schema for backup history and drive tracking
- Backup file format details (separator encoding, header structure)
- Notification wording and UX copy
- Sandbox entitlement lists (use the ones specified, adjust if platform requires)
- Reproducible build script implementation details
- Threat model document organization and content
- Internal helper functions and utilities
- Whether to implement incremental backups or defer (full-only is acceptable)

You MUST escalate for:
- If backup restoration could lose data (the restoration MUST be lossless for the data it contains)
- If biometric auth requires changing the PlatformAdapter interface beyond adding BiometricAdapter
- If sandbox configuration would break existing functionality
- If any new external dependency is needed
- Any change to the IPC protocol
- Any change to existing Living Will, Inheritance, or Witness behavior

---

## Repo Enforcement Check

Before committing, verify:

```bash
# No network imports in auth or backup modules
grep -rn "import.*\bnet\b\|import.*\bhttp\b\|import.*\bfetch\b" packages/core/auth/ packages/core/backup/ --include="*.ts"  # Must be empty

# No cloud service references anywhere in backup
grep -rn "icloud\|google.*drive\|dropbox\|onedrive\|s3\|azure.*blob" packages/core/ --include="*.ts"  # Must be empty

# Backup passphrase not stored in plaintext
grep -rn "passphrase.*=\|password.*=" packages/core/backup/ --include="*.ts" | grep -v "test\|mock\|\.test\.\|SecureStorage\|interface\|type "  # Review each match

# No DR imports in core
grep -rn "from.*@semblance/dr" packages/core/ --include="*.ts"  # Must be empty

# All tests pass
npx tsc --noEmit && npx vitest run
```

---

## Exit Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Biometric auth manager initializes with mock adapter | Test: initialize, check available, get type |
| 2 | App lock timeout triggers biometric prompt | Test: elapsed timeout → requireAuth returns prompt |
| 3 | Sensitive actions require re-confirmation | Test: requireSensitiveAuth prompts for all registered actions |
| 4 | Biometric can be disabled by user (with confirmation) | Test: setEnabled(false) requires auth first |
| 5 | Encrypted backup creates .sbk file with Argon2id + AES-256-GCM | Test: backup file not readable as plaintext, manifest has kdf=argon2id |
| 6 | Backup restoration recovers data with correct passphrase | Test: restore → data matches original |
| 7 | Backup restoration fails with wrong passphrase | Test: wrong passphrase → decryption error |
| 8 | Rolling backup window enforced (maxBackups) | Test: oldest deleted when limit exceeded |
| 9 | External drive detection produces correct notifications | Test: known drive → backup-now, unknown drive → setup-backup |
| 10 | Backup nudge tracker identifies single-device users | Test: no sync peers + no backup → nudge generated |
| 11 | Nudge tracker respects frequency limits and dismissals | Test: no duplicate nudges within 7 days |
| 12 | Sandbox verifier reports platform status | Test: reports sandboxed/unsandboxed correctly |
| 13 | Inheritance packages invalidated after backup restore | Test: restore → packages marked invalid |
| 14 | Security threat model updated with all new sections | File check: biometric, backup, sandboxing, drive detection sections exist |
| 15 | Reproducible build documentation and script exist | File check: docs/REPRODUCIBLE_BUILDS.md + scripts/reproducible-build.sh |
| 16 | Backup is NOT premium-gated | Test: backup functions work without premium |
| 17 | 50+ new tests. All existing pass. TypeScript clean. | `npx vitest run` — 3,578+ total, 0 failures |

---

## Test Count

| Commit | Tests | Cumulative |
|--------|-------|------------|
| 1 | 10 | 10 |
| 2 | 6 | 16 |
| 3 | 5 | 21 |
| 4 | 8 | 29 |
| 5 | 7 | 36 |
| 6 | 6 | 42 |
| 7 | 5 | 47 |
| 8 | 6 | 53 |

**Total: 53 new tests. Baseline + new = 3,525 + 53 = 3,578.**

---

## Final Verification

After all commits:

```bash
npx tsc --noEmit                    # Must be clean
npx vitest run                       # Must show 3,578+ tests, 0 failures
```

Report:
1. Exact test count (total and new)
2. TypeScript status
3. List of all new files created with line counts
4. List of all modified files with change summary
5. Exit criteria checklist — each criterion with PASS/FAIL and evidence
6. Backup file format confirmation: .sbk with Argon2id KDF, AES-256-GCM encryption, Ed25519 signature
7. Biometric adapter interface confirmation: BiometricAdapter added to platform types
8. Incremental backup status: implemented or deferred with documentation
9. Sandbox configuration status per platform
10. Repo enforcement check results
