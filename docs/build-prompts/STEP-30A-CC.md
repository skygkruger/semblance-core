# Step 30a — Cryptographic Overhaul + Encryption at Rest

## Implementation Prompt for Claude Code

**Sprint:** 6 — Becomes Undeniable  
**Builds on:** Sprint 1 (action signing), Step 13 (cross-device sync encryption), Step 26 (attestation, Living Will, Witness), Step 27 (Inheritance Protocol), Step 29 (Proof of Privacy)  
**Test target:** 50+ new tests. All existing 3,469 tests must pass. TypeScript clean. Privacy audit clean.  
**Nature of this step:** Internal cryptographic upgrade. No new user-facing features. All existing features continue to work the same way but with stronger cryptography under the hood.

---

## Context

You are implementing Step 30a — the first half of the security hardening step. Steps 1–29 are complete with 3,469 tests across 305 files, zero failures.

This step upgrades the cryptographic foundations of the entire platform:
1. **Key derivation:** sha256(passphrase) → Argon2id (memory-hard, brute-force resistant)
2. **Digital signatures:** HMAC-SHA256 → Ed25519 (asymmetric — verifier cannot forge)
3. **Data at rest:** Unencrypted SQLite/LanceDB → SQLCipher + AES-256-GCM file encryption
4. **Transport security:** TLS enforcement + certificate pinning in Gateway
5. **Archive versioning:** Living Will v1 → v2 with backward-compatible import

These are foundational changes that affect multiple modules across the codebase. The upgrade must be backward-compatible — existing Living Will v1 archives must still be importable, existing audit trail entries must still be verifiable with the old HMAC approach.

Read `CLAUDE.md` and `docs/DESIGN_SYSTEM.md` before writing any code.

---

## Architecture Rules — ALWAYS ENFORCED

1. **RULE 1 — Zero Network in AI Core.** Crypto upgrades in core are local operations.
2. **RULE 2 — Gateway Only.** TLS and certificate pinning changes go in Gateway only.
3. **RULE 3 — Action Signing.** The signing upgrade (Ed25519) must maintain audit trail integrity. Old entries signed with HMAC remain valid and verifiable.
4. **RULE 4 — No Telemetry.** No crypto library that phones home.
5. **RULE 5 — Local Only Data.** Encryption at rest is local by definition.

---

## Detailed Specification

### Upgrade 1: Argon2id Key Derivation

**Current state:** `sha256(passphrase)` produces a 32-byte key for AES-256-GCM encryption. Used in Living Will (Step 26), Inheritance Protocol activation packages (Step 27), cross-device sync (Step 13).

**Problem:** SHA-256 is fast. An attacker with an encrypted file can brute-force passphrases at billions of attempts per second.

**Upgrade:** Replace with Argon2id — the winner of the Password Hashing Competition (2015), recommended by OWASP.

**Parameters:**
- Memory: 64 MB (65536 KB)
- Iterations: 3
- Parallelism: 1 (single-threaded for consistency across platforms)
- Output: 32 bytes
- Salt: 16 bytes random, generated per encryption operation, stored alongside ciphertext

**Implementation:**

```typescript
// New module: packages/core/crypto/key-derivation.ts

interface KeyDerivationResult {
  key: Buffer;          // 32 bytes
  salt: Buffer;         // 16 bytes
  algorithm: 'argon2id' | 'sha256-legacy';
  params?: {
    memory: number;     // 65536
    iterations: number; // 3
    parallelism: number; // 1
  };
}

// Primary function — all new code uses this
async function deriveKey(passphrase: string, salt?: Buffer): Promise<KeyDerivationResult>

// Legacy function — only for reading old v1 archives
function deriveKeyLegacy(passphrase: string): Buffer  // sha256(passphrase)
```

**Argon2id in Rust:** Use the `argon2` Rust crate (pure Rust, no C dependencies, well-maintained). Expose via Tauri command or FFI bridge to TypeScript. If the Rust FFI path is too complex for this step, use the `hash-wasm` npm package which provides Argon2id as a WASM module — works on all platforms without native compilation.

**Check what's available:** Before choosing an implementation, check if there's already a Rust crypto layer exposed to TypeScript in the codebase. The `getPlatform().crypto` adapter may be the right place to add Argon2id.

**Where it's used — update all callers:**
1. `packages/core/living-will/archive-builder.ts` — `createEncryptedArchive()` uses sha256(passphrase). Upgrade to Argon2id. Store the salt in the archive header.
2. `packages/core/living-will/archive-reader.ts` — `decryptArchive()` must detect archive version and use the correct KDF (v1 = sha256, v2 = Argon2id with salt from header).
3. `packages/core/inheritance/activation-package-generator.ts` — package encryption uses sha256(passphrase). Upgrade to Argon2id.
4. `packages/core/inheritance/activation-handler.ts` — package decryption must handle both old (sha256) and new (Argon2id) packages.
5. `packages/core/routing/platform-sync-crypto.ts` — cross-device sync encryption. Upgrade to Argon2id.
6. Any other caller of sha256(passphrase) for key derivation purposes.

**Backward compatibility:** The archive/package header must indicate which KDF was used. v1 headers = sha256. v2 headers = Argon2id + salt. Readers check the header and use the appropriate KDF.

### Upgrade 2: Ed25519 Digital Signatures

**Current state:** HMAC-SHA256 for all signing — audit trail, attestations (Witness, Proof of Privacy), activation packages. Symmetric: the verification key IS the signing key. Anyone who can verify can forge.

**Problem:** Third-party verification (Witness's core promise) is meaningless if the verifier can forge signatures.

**Upgrade:** Ed25519 (EdDSA over Curve25519). Asymmetric: private key signs, public key verifies. Possession of the public key does NOT allow forging.

**Implementation:**

```typescript
// New module: packages/core/crypto/signing.ts (or update existing)

interface Ed25519KeyPair {
  publicKey: Buffer;    // 32 bytes
  privateKey: Buffer;   // 64 bytes (Ed25519 expanded private key)
}

// Generate a new keypair (done once per device, at first launch)
function generateKeyPair(): Ed25519KeyPair

// Sign a payload
function sign(payload: Buffer, privateKey: Buffer): Buffer  // 64-byte signature

// Verify a signature
function verify(payload: Buffer, signature: Buffer, publicKey: Buffer): boolean
```

**Ed25519 library:** Use the `@noble/ed25519` npm package (pure JS, audited, zero dependencies, by Paul Miller — widely trusted in the crypto community) OR expose via the Rust `ed25519-dalek` crate if a Rust FFI bridge already exists. Check the codebase first.

**Where it's used — update all callers:**
1. `packages/core/attestation/attestation-signer.ts` — replace HMAC signing with Ed25519. The `sign()` method now uses the device's Ed25519 private key.
2. `packages/core/attestation/attestation-verifier.ts` — replace HMAC verification with Ed25519. The `verify()` method now uses the signer's Ed25519 public key.
3. `packages/core/attestation/attestation-format.ts` — update `proof.type` from `"HmacSha256Signature"` to `"Ed25519Signature2020"`.
4. `packages/core/witness/witness-exporter.ts` — public key export now exports the Ed25519 public key (not the HMAC shared secret).
5. `packages/core/witness/vti-bridge.ts` — update the stub to reflect Ed25519 (this was already planned as "Ed25519 in Step 30").

**Backward compatibility for audit trail:**
- Existing audit trail entries signed with HMAC-SHA256 must remain verifiable.
- The verification logic must detect the signature type (HMAC vs Ed25519) and use the appropriate algorithm.
- New entries going forward are signed with Ed25519.
- The HMAC signing key should be preserved (read-only) for legacy verification purposes.

```typescript
// Verification detects algorithm from proof.type
function verifyAttestation(attestation: SignedAttestation, keys: VerificationKeys): boolean {
  if (attestation.proof.type === 'HmacSha256Signature') {
    return verifyHmac(attestation, keys.hmacKey);
  } else if (attestation.proof.type === 'Ed25519Signature2020') {
    return verifyEd25519(attestation, keys.ed25519PublicKey);
  }
  return false;
}
```

**Device keypair storage:** The Ed25519 private key MUST be stored in the OS secure keychain (Tauri secure storage on desktop, Keychain on iOS, Keystore on Android). It must NEVER be stored in plaintext in the SQLite database or filesystem. The public key can be stored in SQLite for easy access.

### Upgrade 3: SQLCipher for SQLite Encryption at Rest

**Current state:** SQLite databases store all user data as plaintext files on disk. If the device is unlocked and unencrypted, anyone can read them.

**Upgrade:** Replace SQLite with SQLCipher — a drop-in replacement that provides transparent page-level encryption using AES-256.

**Implementation approach:**

Option A (preferred): If the project uses `better-sqlite3`, switch to `better-sqlite3` compiled with SQLCipher support, or use `@journeyapps/sqlcipher` which is a prebuilt SQLCipher binding for Node.js.

Option B: If using a different SQLite binding, check if it supports the SQLCipher extension or if there's a compatible alternative.

**Before choosing:** Examine the current SQLite usage in the project. Check:
- Which SQLite package is used (`better-sqlite3`, `sql.js`, `sqlite3`, etc.)
- How database connections are created
- Whether the connection setup is centralized or scattered

**Key derivation for SQLCipher:**
- The encryption key is derived from the user's device credential stored in the OS secure keychain
- On first launch (or upgrade), generate a random 32-byte database encryption key
- Store this key in the OS secure keychain (protected by biometrics — biometric auth itself ships in Step 30b)
- Pass the key to SQLCipher via `PRAGMA key = 'x''...'';` on every database open

**Migration from unencrypted to encrypted:**
- On upgrade, detect unencrypted databases
- Export data from unencrypted DB → import into new encrypted DB
- Delete unencrypted DB after successful migration
- This migration runs once, automatically, transparently to the user

**Which databases to encrypt:**
- All SQLite databases in the project. Every `.db` or `.sqlite` file that stores user data.
- Check the codebase for all database file creation/opening points.

### Upgrade 4: LanceDB File-Level Encryption

**Current state:** LanceDB vector store files sit on disk unencrypted.

**Upgrade:** Encrypt LanceDB data files at rest using AES-256-GCM.

**Implementation approach:**

LanceDB is an embedded database. Unlike SQLite (which has SQLCipher as a drop-in), LanceDB doesn't have built-in encryption. The approach is:

1. **Encryption wrapper:** Create a storage adapter that encrypts data before writing to disk and decrypts after reading.
2. **Same key as SQLCipher:** Use the same device-derived encryption key stored in the OS keychain.
3. **Check LanceDB API:** LanceDB may have a custom storage backend API. If so, implement an encrypting storage backend. If not, encrypt at the file level — intercept reads/writes to the LanceDB data directory.

**If file-level encryption is too invasive for LanceDB:** An acceptable alternative is to store the LanceDB data directory inside an encrypted container (e.g., an encrypted disk image on macOS, encrypted folder via OS APIs). Document the approach and tradeoffs.

**Pragmatic fallback:** If LanceDB encryption proves too complex for this step, document the limitation in the security threat model and defer to a post-launch enhancement. SQLCipher for SQLite is the higher priority since SQLite contains the most sensitive structured data (emails, contacts, financial data, audit trail). LanceDB primarily contains embeddings, which are less directly sensitive.

### Upgrade 5: TLS 1.3 + Certificate Pinning in Gateway

**Current state:** The Gateway makes HTTPS requests to external services (email providers, calendar APIs, etc.) using default TLS settings.

**Upgrade:**

**TLS 1.3 minimum:**
- Configure the Gateway's HTTP client to reject TLS 1.2 and below
- Set minimum TLS version to 1.3
- This is typically a single configuration option in the HTTP client library (e.g., `minVersion: 'TLSv1.3'` in Node.js `https` options)

**Certificate pinning for known services:**
- Create a pinning registry: a map of domain → expected certificate fingerprint(s)
- On each HTTPS connection, verify the server's certificate against the pinned fingerprint
- If the certificate doesn't match, reject the connection and log to audit trail
- Pin certificates for critical services: major email providers (Gmail, Outlook), calendar providers, financial APIs (Plaid)
- The pin registry should be updatable (stored in a config file, not hardcoded) to handle certificate rotations

**Implementation:**

```typescript
// packages/gateway/security/tls-config.ts
interface TlsConfig {
  minVersion: 'TLSv1.3';
  certificatePins: CertificatePin[];
}

interface CertificatePin {
  domain: string;
  fingerprints: string[];  // SHA-256 fingerprints of expected certificates
  enforced: boolean;        // true = block if mismatch, false = warn only (for rollout)
}
```

**Where to apply:** Find where the Gateway creates HTTP clients or makes requests. Apply TLS config there. This is a Gateway-only change — nothing in `packages/core/`.

### Upgrade 6: Living Will Archive Version Bump

**Current state:** Living Will archives use version 1 with sha256 key derivation and HMAC-SHA256 signing.

**Upgrade:** Version 2 archives use Argon2id key derivation and Ed25519 signing.

**Changes:**
1. `ArchiveBuilder.createEncryptedArchive()` — now produces v2 archives:
   - Header: `{ version: 2, encrypted: true, createdAt, kdf: 'argon2id', salt: hex }`
   - Signature: Ed25519 instead of HMAC
2. `ArchiveReader.decryptArchive()` — handles both versions:
   - v1: sha256 KDF, HMAC signature verification
   - v2: Argon2id KDF (reads salt from header), Ed25519 signature verification
3. `LivingWillExporter` — generates v2 archives going forward
4. `LivingWillImporter` — imports both v1 and v2 archives seamlessly

**Same pattern for Inheritance Protocol:**
- New activation packages use Argon2id + Ed25519
- Old packages (if any exist) still decrypt with sha256 + HMAC verification

### Security Threat Model Document

Create `docs/SECURITY_THREAT_MODEL.md` in the repo:

1. **Threat categories:** Device theft, forensic analysis, network interception, supply chain, insider threat
2. **Mitigations:** For each threat, document what Semblance does (or will do)
3. **Cryptographic inventory:** List every algorithm, where it's used, and its strength
4. **Post-quantum migration path:** Document that Ed25519 will be upgraded to CRYSTALS-Dilithium when the ecosystem matures. The `proof.type` field in attestations supports algorithm migration. Archive version fields support format evolution.
5. **Known limitations:** HMAC-SHA256 for legacy audit trail entries (can't re-sign historical entries), LanceDB encryption status, any other limitations

---

## File Structure

```
packages/core/crypto/
├── key-derivation.ts              # Argon2id + legacy sha256 KDF
├── ed25519.ts                     # Ed25519 keypair generation, sign, verify
├── device-keypair.ts              # Device keypair management (generate, store, retrieve)
├── migration.ts                   # Detects old formats, handles upgrades
├── types.ts                       # KeyDerivationResult, Ed25519KeyPair, VerificationKeys
├── index.ts                       # Barrel exports
```

```
packages/gateway/security/
├── tls-config.ts                  # TLS 1.3 enforcement
├── certificate-pins.ts            # Certificate pinning registry
```

```
docs/
├── SECURITY_THREAT_MODEL.md       # Threat model document
```

Plus modifications to existing files in attestation/, living-will/, inheritance/, witness/, and gateway/.

---

## Commit Strategy

### Commit 1: Core Crypto Module — Argon2id + Ed25519 (10 tests)

- Create `packages/core/crypto/types.ts` — all crypto types
- Create `packages/core/crypto/key-derivation.ts`:
  - `deriveKey(passphrase, salt?)` — Argon2id with 64MB memory, 3 iterations
  - `deriveKeyLegacy(passphrase)` — sha256 for backward compatibility
  - `generateSalt()` — 16 random bytes
- Create `packages/core/crypto/ed25519.ts`:
  - `generateKeyPair()` — Ed25519 keypair
  - `sign(payload, privateKey)` — Ed25519 signature
  - `verify(payload, signature, publicKey)` — Ed25519 verification
- Create `packages/core/crypto/device-keypair.ts`:
  - `getOrCreateDeviceKeyPair(storage)` — generates on first call, retrieves from secure storage thereafter
  - `exportPublicKey()` — returns public key for sharing
- Create `packages/core/crypto/index.ts` — barrel exports

**Tests:** tests/core/crypto/key-derivation.test.ts
1. Argon2id produces 32-byte key
2. Same passphrase + same salt = same key (deterministic)
3. Same passphrase + different salt = different key
4. Legacy sha256 produces same result as old implementation (backward compatibility)

**Tests:** tests/core/crypto/ed25519.test.ts
5. Generates valid keypair (public 32 bytes, private 64 bytes)
6. Sign + verify with correct key returns true
7. Sign + verify with wrong key returns false
8. Tampered payload fails verification
9. Different keypairs produce different signatures for same payload

**Tests:** tests/core/crypto/device-keypair.test.ts
10. Generates keypair on first call, returns same on subsequent calls

### Commit 2: Attestation System Upgrade — Ed25519 Signing (8 tests)

- Modify `packages/core/attestation/attestation-signer.ts`:
  - Constructor now accepts Ed25519 private key (in addition to or replacing HMAC key)
  - `sign()` produces Ed25519 signatures with `proof.type: "Ed25519Signature2020"`
  - Retains legacy HMAC signing capability for migration

- Modify `packages/core/attestation/attestation-verifier.ts`:
  - `verify()` detects proof.type and uses appropriate algorithm
  - Supports both `"HmacSha256Signature"` (legacy) and `"Ed25519Signature2020"` (new)
  - Constant-time comparison maintained

- Modify `packages/core/attestation/attestation-format.ts`:
  - Default proof type is now `"Ed25519Signature2020"`
  - `verificationMethod` now references Ed25519 public key

**Tests:** tests/core/crypto/attestation-upgrade.test.ts
1. New attestations use Ed25519Signature2020 proof type
2. Ed25519 signature verifies with public key
3. Ed25519 signature fails with wrong public key
4. Legacy HMAC attestations still verify (backward compat)
5. Tampered Ed25519 attestation fails verification
6. Verifier auto-detects proof type (HMAC vs Ed25519)
7. New attestation cannot be verified with HMAC key (type mismatch)
8. Public key from attestation matches device keypair

### Commit 3: Witness + VTI Bridge + Proof of Privacy Upgrade (6 tests)

- Modify `packages/core/witness/witness-generator.ts`:
  - Uses Ed25519 signer (via updated AttestationSigner)
  - Generated attestations now have Ed25519 signatures

- Modify `packages/core/witness/witness-exporter.ts`:
  - `exportPublicKey()` now exports Ed25519 public key (not HMAC shared secret)
  - Export format: `{ algorithm: "ed25519", publicKey: hex, deviceId: string }`
  - This is a real public key — sharing it does NOT allow forging signatures

- Modify `packages/core/witness/vti-bridge.ts`:
  - Update stub to reference Ed25519 as the signing algorithm
  - VTI format now uses `"Ed25519Signature2020"` proof type

- Modify `packages/core/privacy/proof-of-privacy-exporter.ts`:
  - Uses Ed25519 signer (via updated AttestationSigner)

**Tests:** tests/core/crypto/witness-upgrade.test.ts
1. New Witness attestations use Ed25519Signature2020
2. Witness public key export is Ed25519 (not HMAC)
3. Exported public key cannot forge attestations (asymmetric verification)
4. VTI bridge reflects Ed25519 proof type
5. Proof of Privacy report uses Ed25519 signature
6. Old Witness attestations (HMAC) still verify with legacy key

### Commit 4: Living Will Archive v2 — Argon2id + Ed25519 (8 tests)

- Modify `packages/core/living-will/archive-builder.ts`:
  - `createEncryptedArchive()` now uses Argon2id for key derivation
  - Archive header: `{ version: 2, encrypted: true, createdAt, kdf: 'argon2id', salt: hex }`
  - Archive signature uses Ed25519

- Modify `packages/core/living-will/archive-reader.ts`:
  - `decryptArchive()` reads header version:
    - v1: sha256 KDF, HMAC verification
    - v2: Argon2id KDF (reads salt from header), Ed25519 verification
  - Seamless handling — user doesn't need to know which version

- Modify `packages/core/living-will/living-will-exporter.ts`:
  - Generates v2 archives going forward

- Modify `packages/core/living-will/living-will-importer.ts`:
  - Imports both v1 and v2 archives

**Tests:** tests/core/crypto/living-will-v2.test.ts
1. New archive has version: 2 in header
2. New archive header includes kdf: 'argon2id' and salt
3. New archive encrypted with Argon2id-derived key
4. New archive signed with Ed25519
5. v2 archive decrypts with correct passphrase
6. v2 archive fails to decrypt with wrong passphrase
7. v1 archive still imports successfully (backward compat)
8. Roundtrip: export v2 → import → verify data integrity

### Commit 5: Inheritance Protocol Crypto Upgrade (5 tests)

- Modify `packages/core/inheritance/activation-package-generator.ts`:
  - New packages use Argon2id for passphrase-based encryption
  - Package header indicates KDF used

- Modify `packages/core/inheritance/activation-handler.ts`:
  - Detects package KDF from header (sha256 vs Argon2id)
  - Decrypts with appropriate algorithm
  - Both old and new packages work

**Tests:** tests/core/crypto/inheritance-upgrade.test.ts
1. New activation packages use Argon2id KDF
2. New packages include salt in header
3. New packages decrypt with correct passphrase via Argon2id
4. Old packages (sha256) still decrypt correctly (backward compat)
5. Wrong passphrase fails for both old and new packages

### Commit 6: SQLCipher — SQLite Encryption at Rest (7 tests)

- Create `packages/core/crypto/database-encryption.ts`:
  - `getOrCreateDatabaseKey(secureStorage)` — generates random 32-byte key on first launch, stores in OS keychain
  - `openEncryptedDatabase(path, key)` — opens SQLite database with encryption key
  - `migrateToEncrypted(unencryptedPath, encryptedPath, key)` — one-time migration
  - `isDatabaseEncrypted(path)` — checks if a database file is encrypted

- Modify database connection setup (find the centralized database initialization):
  - On startup, check if databases are encrypted
  - If not, run migration: export → create encrypted DB → import → delete unencrypted
  - All subsequent opens use the encryption key from keychain

- Install SQLCipher-compatible SQLite binding (check what's currently used and find the appropriate SQLCipher equivalent)

**Tests:** tests/core/crypto/database-encryption.test.ts
1. Generates database encryption key on first launch
2. Encrypted database opens with correct key
3. Encrypted database fails to open with wrong key
4. Encrypted database file is not readable as plain text
5. Migration converts unencrypted DB to encrypted
6. Migrated database retains all data
7. isDatabaseEncrypted correctly detects encrypted vs unencrypted

### Commit 7: Gateway TLS + Certificate Pinning (5 tests)

- Create `packages/gateway/security/tls-config.ts`:
  - `getTlsConfig()` — returns config with `minVersion: 'TLSv1.3'`
  - Applied to all Gateway HTTP client creation

- Create `packages/gateway/security/certificate-pins.ts`:
  - `CertificatePinRegistry` class
  - `loadPins()` — loads from config file or defaults
  - `verifyPin(domain, certificate)` — checks certificate against pinned fingerprints
  - `isPinned(domain)` — checks if a domain has pins
  - Default pins for: Gmail (smtp.gmail.com, imap.gmail.com), Outlook (outlook.office365.com), Google Calendar API, Plaid API
  - Pins stored in a JSON config file that can be updated without code changes

- Modify Gateway HTTP client setup to apply TLS config and pin verification
- Failed pin verification: log to audit trail, reject connection

**Tests:** tests/gateway/tls-certificate.test.ts
1. TLS config enforces minimum TLS 1.3
2. Valid certificate passes pin verification
3. Wrong certificate fails pin verification
4. Unpinned domains pass without pin check
5. Pin verification failure logs to audit trail

### Commit 8: LanceDB Encryption + Security Threat Model + Documentation (5 tests)

- Implement LanceDB encryption (approach depends on LanceDB API — check first):
  - Option A: Custom storage backend with encryption layer
  - Option B: File-level encryption wrapper
  - Option C: If too complex, document the limitation and defer

- Create `docs/SECURITY_THREAT_MODEL.md`:
  - Threat categories: device theft, forensic analysis, network interception, supply chain, insider threat
  - Mitigations per category
  - Cryptographic inventory: every algorithm, where used, strength
  - Post-quantum migration path: Ed25519 → CRYSTALS-Dilithium (documented, not implemented)
  - Known limitations

- Create `packages/core/crypto/migration.ts`:
  - `detectLegacyFormats()` — scans for v1 archives, HMAC-only attestations, unencrypted DBs
  - `getMigrationStatus()` — returns what's been migrated and what hasn't
  - Informational — does not auto-migrate anything except databases (which migrate on startup)

**Tests:** tests/core/crypto/lancedb-encryption.test.ts (if implemented)
1. LanceDB data encrypted before writing to disk
2. LanceDB data decrypted correctly on read
3. Raw LanceDB files are not readable as plaintext

**Tests:** tests/core/crypto/migration.test.ts
4. Detects legacy v1 archive format
5. Reports migration status correctly

---

## What NOT to Do

1. **Do NOT remove HMAC-SHA256 support.** Legacy audit trail entries and v1 archives must remain verifiable. The old crypto is read-only — new operations use the new crypto, old data remains verifiable with the old crypto.
2. **Do NOT store Ed25519 private keys in plaintext.** They MUST go in the OS secure keychain (Tauri secure storage). Never in SQLite, never in a config file, never in the filesystem.
3. **Do NOT break existing tests.** All 3,469 existing tests must pass. Crypto upgrades are internal — external behavior is unchanged.
4. **Do NOT force re-encryption of existing Living Will archives.** v1 archives work forever. Users can re-export as v2 when they choose.
5. **Do NOT add crypto libraries that phone home.** Verify that any new dependency (Argon2id, Ed25519) is pure JS/WASM/Rust with zero network calls.
6. **Do NOT put TLS or certificate pinning code in packages/core/.** Transport security is a Gateway concern.
7. **Do NOT hardcode certificate pins.** Store them in a JSON config file that can be updated for certificate rotations.
8. **Do NOT auto-migrate Living Will archives or Inheritance packages.** Only SQLite databases auto-migrate (on startup). Archives and packages are migrated when the user re-exports or re-generates.

---

## Autonomous Decision Authority

You may proceed without escalating for:
- Choice of Argon2id implementation (WASM vs Rust FFI) based on what's available in the codebase
- Choice of Ed25519 implementation (@noble/ed25519 vs Rust crate) based on what's available
- SQLCipher binding choice based on current SQLite usage
- LanceDB encryption approach based on LanceDB API capabilities
- Certificate pin fingerprint values for default services
- Security threat model content and organization
- Internal helper functions and utilities

You MUST escalate for:
- If Argon2id or Ed25519 requires adding a dependency that makes network calls
- If SQLCipher migration could lose data (the migration MUST be lossless)
- If LanceDB encryption is too complex and needs deferral (escalate with recommendation)
- If any existing test breaks due to crypto changes (fix it, don't skip it)
- If the Ed25519 private key storage approach requires changing the platform adapter interface
- Any change to the IPC protocol

---

## Repo Enforcement Check

Before committing, verify:

```bash
# No TLS/pinning code in core
grep -rn "import.*tls\|import.*https\|certificate.*pin" packages/core/ --include="*.ts"  # Must be empty

# No network imports in crypto module
grep -rn "import.*\bnet\b\|import.*\bhttp\b\|import.*\bfetch\b" packages/core/crypto/ --include="*.ts"  # Must be empty

# Ed25519 private key not stored in plaintext
grep -rn "privateKey.*=\|private_key.*=" packages/core/ --include="*.ts" | grep -v "test\|mock\|\.test\."  # Review each match

# No DR imports in core
grep -rn "from.*@semblance/dr" packages/core/ --include="*.ts"  # Must be empty

# All tests pass
npx tsc --noEmit && npx vitest run
```

---

## Exit Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Argon2id key derivation produces correct 32-byte keys | Test: deterministic with same passphrase+salt |
| 2 | Ed25519 keypair generation, signing, and verification work | Test: sign+verify roundtrip, wrong key fails |
| 3 | Attestation system uses Ed25519 for new signatures | Test: new attestations have Ed25519Signature2020 proof type |
| 4 | Legacy HMAC attestations still verify (backward compat) | Test: old HMAC attestation verifies with legacy key |
| 5 | Living Will v2 archives use Argon2id + Ed25519 | Test: v2 header has kdf=argon2id, signature is Ed25519 |
| 6 | Living Will v1 archives still import successfully | Test: v1 archive imports with sha256 KDF |
| 7 | Inheritance packages upgraded to Argon2id | Test: new packages use Argon2id, old packages still work |
| 8 | SQLCipher encrypts SQLite databases at rest | Test: encrypted DB not readable as plaintext |
| 9 | Database migration from unencrypted to encrypted is lossless | Test: migrated DB retains all data |
| 10 | TLS 1.3 minimum enforced in Gateway | Test: config specifies TLSv1.3 minimum |
| 11 | Certificate pinning rejects mismatched certificates | Test: wrong cert fails, correct cert passes |
| 12 | Security threat model document created | File exists: docs/SECURITY_THREAT_MODEL.md |
| 13 | Post-quantum migration path documented | Content exists in threat model |
| 14 | 50+ new tests. All existing tests pass. TypeScript clean. | `npx vitest run` — 3,519+ total, 0 failures |

---

## Test Count

| Commit | Tests | Cumulative |
|--------|-------|------------|
| 1 | 10 | 10 |
| 2 | 8 | 18 |
| 3 | 6 | 24 |
| 4 | 8 | 32 |
| 5 | 5 | 37 |
| 6 | 7 | 44 |
| 7 | 5 | 49 |
| 8 | 5 | 54 |

**Total: 54 new tests. Baseline + new = 3,469 + 54 = 3,523.**

---

## Final Verification

After all commits:

```bash
npx tsc --noEmit                    # Must be clean
npx vitest run                       # Must show 3,523+ tests, 0 failures
```

Report:
1. Exact test count (total and new)
2. TypeScript status
3. List of all new files created with line counts
4. List of all modified files with change summary
5. Which crypto libraries were chosen and why (Argon2id impl, Ed25519 impl, SQLCipher binding)
6. LanceDB encryption status (implemented, deferred, or alternative approach)
7. Exit criteria checklist — each criterion with PASS/FAIL and evidence
8. Repo enforcement check results
9. Backward compatibility confirmation: v1 Living Will imports, HMAC attestation verification, old Inheritance packages
