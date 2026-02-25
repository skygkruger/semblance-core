# Semblance Security Threat Model

> Steps 30a + 30b — Cryptographic Overhaul + Platform Hardening. Last updated: 2026-02-24.

---

## Cryptographic Inventory

| Component | Algorithm | Purpose | Status |
|-----------|-----------|---------|--------|
| Key derivation (archives, packages) | Argon2id (64MB, 3 iter, 32-byte) | Passphrase → encryption key | **Current (v2)** |
| Key derivation (legacy v1) | SHA-256 | Passphrase → key (backward compat) | **Legacy — read-only** |
| Attestation signing | Ed25519 | Asymmetric digital signatures | **Current** |
| Attestation signing (legacy) | HMAC-SHA256 | Symmetric signing (backward compat) | **Legacy — verify-only** |
| Archive encryption | AES-256-GCM | Symmetric authenticated encryption | Current |
| Database encryption | SQLCipher (AES-256-CBC, PBKDF2-SHA512) | SQLite encryption at rest | Current |
| Audit trail integrity | HMAC-SHA256 chain hash | Tamper-evident log | Current |
| Device identity | Ed25519 key pair | Device authentication | Current |
| IPC signing | HMAC-SHA256 | Request authentication | Current |
| PlatformSyncCrypto | SHA-256 | Shared secret derivation (high-entropy input) | Current — adequate |
| Backup encryption | AES-256-GCM + Argon2id | Encrypted .sbk backup files | Current |
| Backup signing | Ed25519 | Backup integrity verification | Current |
| Embedding vectors | None (LanceDB) | Vector search | **Deferred — see below** |

---

## Threat Categories

### 1. Device Theft / Physical Access

**Threat:** Attacker gains physical access to the device (stolen laptop, seized phone).

**Mitigations:**
- SQLCipher encrypts all structured data at rest (SQLite databases)
- Database encryption key stored in platform secure storage (Keychain/Keystore)
- Ed25519 private keys stored in platform secure storage
- Archive files encrypted with AES-256-GCM + Argon2id-derived keys
- OS-level full-disk encryption recommended (documented in user guide)

**Residual risk:** LanceDB vector embeddings are NOT encrypted at rest (see Deferred section). Embeddings are lower sensitivity than structured data but could theoretically reveal document topics via nearest-neighbor attacks.

### 2. Forensic Analysis

**Threat:** Sophisticated attacker performs forensic analysis of disk, memory, or swap.

**Mitigations:**
- Argon2id key derivation resists brute-force (64MB memory cost per attempt)
- AES-256-GCM provides authenticated encryption (prevents ciphertext manipulation)
- SQLCipher uses 256,000 PBKDF2 iterations for database key derivation
- No plaintext secrets written to disk (keys in secure storage only)

**Residual risk:** Memory dumps while Semblance is running could expose decrypted data. Mitigated by OS-level memory protection. Full memory encryption (e.g., AMD SEV, ARM TrustZone) is out of scope.

### 3. Network Interception

**Threat:** Man-in-the-middle attack on Gateway connections (email, calendar, API).

**Mitigations:**
- TLS 1.3 minimum enforced for all outbound connections
- AEAD cipher suites only (AES-256-GCM, ChaCha20-Poly1305)
- Certificate pinning with trust-on-first-use (TOFU) for known services
- rejectUnauthorized: true (no self-signed certificate acceptance)
- All connections go through Gateway — Core has zero network access

**Residual risk:** First connection to a service is unpinned (TOFU model). Compromise during first connection could pin a malicious certificate. Mitigated by using well-known services with established PKI.

### 4. Supply Chain Attack

**Threat:** Compromised dependency introduces malicious code.

**Mitigations:**
- Minimal dependency count (approved list in CLAUDE.md)
- Cryptographic dependencies audited: @noble/curves (Cure53 audit), hash-wasm (WASM, zero deps)
- No dependencies with network calls in Core package
- Privacy audit scans all imports on every commit
- lockfile integrity verification in CI

**Residual risk:** Compromised build tool (TypeScript compiler, bundler) could inject code. Mitigated by pinning tool versions and reproducible builds (future work).

### 5. Insider Threat / Malicious Update

**Threat:** Compromised update mechanism pushes malicious Semblance version.

**Mitigations:**
- Open-source core — all code publicly auditable
- Cryptographic attestation of builds (future — code signing)
- User data never leaves device — even a compromised version can't exfiltrate without Gateway cooperation
- Gateway allowlist prevents connecting to unauthorized domains

**Residual risk:** A compromised update could add a domain to the allowlist and exfiltrate data. Mitigated by update signing (planned) and user-visible allowlist management.

### 6. Unauthorized App Access (Step 30b)

**Threat:** Someone picks up an unlocked device and accesses Semblance data.

**Mitigations:**
- Biometric authentication (Face ID, Touch ID, Windows Hello) required to open app
- Configurable lock timeout (immediate, 1min, 5min, 15min, never)
- Sensitive actions (Living Will export, inheritance config, encryption key export) require biometric re-confirmation regardless of timeout
- SensitiveActionGuard protects 10 high-risk operations with mandatory re-auth
- Auth can be disabled by user but requires biometric confirmation to disable

**Residual risk:** If biometric hardware is not available (e.g., remote desktop), falls back to no app-level auth. OS-level screen lock remains the primary defense in this scenario.

### 7. Data Loss / Device Failure (Step 30b)

**Threat:** User loses device (theft, damage, failure) with no recovery path.

**Mitigations:**
- Encrypted local backup (.sbk files) with Argon2id + AES-256-GCM
- Backup signed with Ed25519 device key for integrity verification
- Backup manifest with SHA-256 integrity hash for tamper detection
- External drive detection prompts users to back up when drives connect
- Backup nudge tracker identifies single-device users with no backup
- Rolling backup window (configurable max backups) prevents storage exhaustion
- Backup restoration triggers Knowledge Moment and inheritance package invalidation

**Residual risk:** If user never creates a backup and loses their only device, data is unrecoverable. Nudge system mitigates but cannot prevent this. Backup passphrase loss is also unrecoverable (by design — Argon2id prevents brute force).

### 8. External Drive Compromise (Step 30b)

**Threat:** Attacker obtains a backup drive containing .sbk files.

**Mitigations:**
- All backup data encrypted with AES-256-GCM (per-backup random IV)
- Encryption key derived via Argon2id (64MB, 3 iterations) from user passphrase
- Backup manifest is unencrypted but contains no user data (only metadata: version, timestamps, section names)
- Ed25519 signature on integrity hash — forged backups detectable
- Argon2id makes brute-force passphrase recovery computationally expensive

**Residual risk:** Weak passphrase reduces effective key strength. User education recommended. Passphrase strength meter is a future enhancement.

### 9. OS Sandbox Escape (Step 30b)

**Threat:** Malicious code running alongside Semblance accesses its data or network capabilities.

**Mitigations:**
- macOS: App Sandbox enabled, camera/microphone/inbound-network denied
- Linux: AppArmor profile denies ptrace, raw sockets, inbound network; filesystem restricted
- Windows: MSIX capabilities deny internetClientServer, webcam, microphone
- Sandbox verifier audits configuration at build time
- Only Gateway process has network client capability

**Residual risk:** Sandbox escape vulnerabilities in the OS itself. Mitigated by keeping OS updated. Semblance's defense-in-depth (encrypted data, signed actions) provides additional layers.

---

## Deferred: LanceDB Embedding Encryption

**Decision:** Defer LanceDB encryption at rest.

**Rationale:**
- LanceDB has no built-in encryption API
- Embedding vectors are lower sensitivity than structured data (emails, financial records, health data)
- Application-layer encryption of individual vectors would break vector search (can't compute cosine similarity on encrypted vectors)
- File-system-level encryption (FUSE, dm-crypt) is a deployment concern, not an application concern
- Full-disk encryption covers this use case for most users

**Future path:** If LanceDB adds encryption support, adopt it. Otherwise, document OS-level FDE as the recommended mitigation.

---

## Post-Quantum Migration Path

**Current state:** Ed25519 (elliptic curve) is vulnerable to quantum computers running Shor's algorithm.

**Migration path:**
1. **Ed25519 → CRYSTALS-Dilithium** (NIST PQC standard, FIPS 204)
2. Timeline: When stable, audited JS/WASM implementations are available
3. Approach: Same dual-algorithm pattern used for HMAC→Ed25519 migration
   - Add optional `dilithiumPrivateKey` to AttestationSigner
   - Auto-detect `proof.type: 'Dilithium3Signature'` in verifier
   - Existing Ed25519 attestations remain verifiable
4. **AES-256-GCM** is quantum-resistant (Grover's algorithm reduces to 128-bit security, still adequate)
5. **Argon2id** is not affected by quantum computing (memory-hard, not algebraic)

**No action required now.** Quantum computers capable of breaking Ed25519 are estimated 10-20+ years away. The dual-algorithm architecture supports seamless migration when needed.

---

## Backward Compatibility Matrix

| Legacy Artifact | Detection | Handling |
|----------------|-----------|----------|
| HMAC attestation | `proof.type === 'HmacSha256Signature'` | Verifier uses HMAC path |
| v1 Living Will archive | `header.version === 1` or no `kdf` field | Reader uses SHA-256 KDF |
| v1 Activation package | `header.version === 1` or no `kdf` field | Handler uses SHA-256 KDF |
| Old signer (HMAC only) | No `ed25519PrivateKey` in constructor | Produces HMAC signatures |
| PlatformSyncCrypto | Not changed | SHA-256 adequate for high-entropy secrets |

---

## Verification Commands

```bash
# No network imports in crypto module
grep -rn "import.*\bnet\b\|import.*\bhttp\b\|import.*\bfetch\b" packages/core/crypto/ --include="*.ts"

# No network imports in auth or backup modules
grep -rn "import.*\bnet\b\|import.*\bhttp\b\|import.*\bfetch\b" packages/core/auth/ packages/core/backup/ --include="*.ts"

# No cloud service references in backup
grep -rn "icloud\|google.*drive\|dropbox\|onedrive\|s3\|azure.*blob" packages/core/ --include="*.ts"

# No TLS/pinning code in core
grep -rn "import.*tls\|import.*https\|certificate.*pin" packages/core/ --include="*.ts"

# Ed25519 registered
grep -n "Ed25519Signature2020" packages/core/attestation/attestation-format.ts

# Argon2id in archive builder
grep -n "argon2id\|deriveKey" packages/core/living-will/archive-builder.ts

# Backup not premium-gated
grep -rn "isPremium\|PremiumGate" packages/core/backup/ --include="*.ts"  # Must be empty

# No DR imports in core
grep -rn "from.*@semblance/dr" packages/core/ --include="*.ts"
```
