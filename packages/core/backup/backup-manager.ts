// Backup Manager — Creates and restores encrypted .sbk backup files.
// Uses Argon2id key derivation + AES-256-GCM encryption + Ed25519 signing.
// CRITICAL: No networking imports. No cloud services. Entirely local.

import { getPlatform } from '../platform/index.js';
import type { SecureStorageAdapter, DatabaseHandle, EncryptedPayload } from '../platform/types.js';
import { deriveKey } from '../crypto/key-derivation.js';
import { sign, verify } from '../crypto/ed25519.js';
import { getOrCreateDeviceKeyPair, exportPublicKey } from '../crypto/device-keypair.js';
import { createManifest, serializeManifest, parseManifest, verifyIntegrity } from './backup-manifest.js';
import type {
  BackupConfig,
  BackupResult,
  RestoreResult,
  BackupHistoryEntry,
  BackupContentEntry,
} from './types.js';
import { DEFAULT_BACKUP_CONFIG } from './types.js';

// ─── File format ────────────────────────────────────────────────────────────
// .sbk format: manifest_json + \x00\x00\x00\x00 + encrypted_payload_json + signature_hex(128 chars)
// JSON cannot contain null bytes, so the 4-null-byte separator is unambiguous.
// Split on FIRST occurrence of 4 null bytes.

const SEPARATOR = '\x00\x00\x00\x00';
const SIGNATURE_LENGTH = 128; // 64-byte Ed25519 signature as hex
const SEMBLANCE_VERSION = '0.30.0';

// ─── Dependencies ───────────────────────────────────────────────────────────

export interface BackupDataSection {
  name: string;
  type: 'sqlite' | 'lancedb' | 'config' | 'audit-trail';
  data: unknown;
}

export interface BackupManagerDeps {
  db: DatabaseHandle;
  secureStorage: SecureStorageAdapter;
  deviceId: string;
  dataCollector: {
    collectSections(): {
      sections: BackupDataSection[];
      entityCounts: Record<string, number>;
    };
  };
  knowledgeMomentTrigger?: { triggerIfReady: (sectionCount: number) => void };
  inheritanceIntegration?: {
    importInheritanceConfig: (data: unknown) => { success: boolean; warnings: string[] };
  };
}

// ─── Backup Manager ─────────────────────────────────────────────────────────

export class BackupManager {
  private deps: BackupManagerDeps;
  private config: BackupConfig = { ...DEFAULT_BACKUP_CONFIG };
  private history: BackupHistoryEntry[] = [];

  constructor(deps: BackupManagerDeps) {
    this.deps = deps;
  }

  /**
   * Update backup configuration.
   */
  configure(config: Partial<BackupConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current backup configuration.
   */
  getConfig(): BackupConfig {
    return { ...this.config };
  }

  /**
   * Create an encrypted backup file at the configured destination.
   */
  async createBackup(passphrase: string): Promise<BackupResult> {
    const p = getPlatform();

    if (!this.config.destinationPath) {
      return { success: false, error: 'Backup destination path not configured' };
    }

    // 1. Derive encryption key via Argon2id
    const kdfResult = await deriveKey(passphrase);

    // 2. Collect data sections
    const { sections } = this.deps.dataCollector.collectSections();

    // 3. Serialize and encrypt
    const serialized = JSON.stringify(sections);
    const encrypted = await p.crypto.encrypt(serialized, kdfResult.keyHex);

    // 4. Compute integrity hash of encrypted payload
    const payloadJson = JSON.stringify(encrypted);
    const integrityHash = p.crypto.sha256(payloadJson);

    // 5. Sign the integrity hash with device key
    const keyPair = await getOrCreateDeviceKeyPair(this.deps.secureStorage);
    const signature = sign(Buffer.from(integrityHash), keyPair.privateKey);
    const signatureHex = signature.toString('hex');

    // 6. Build manifest
    const contents: BackupContentEntry[] = sections.map((s) => ({
      name: s.name,
      type: s.type,
      sizeBytes: JSON.stringify(s.data).length,
    }));

    const manifest = createManifest({
      deviceId: this.deps.deviceId,
      semblanceVersion: SEMBLANCE_VERSION,
      salt: kdfResult.saltHex,
      contents,
      integrityHash,
      signaturePublicKey: exportPublicKey(keyPair),
    });

    // 7. Assemble .sbk file
    const manifestJson = serializeManifest(manifest);
    const fileContent = manifestJson + SEPARATOR + payloadJson + signatureHex;

    // 8. Write to disk
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `semblance-backup-${timestamp}.sbk`;
    const filePath = p.path.join(this.config.destinationPath, fileName);

    try {
      if (!p.fs.existsSync(this.config.destinationPath)) {
        p.fs.mkdirSync(this.config.destinationPath, { recursive: true });
      }
      p.fs.writeFileSync(filePath, fileContent);
    } catch (err) {
      return {
        success: false,
        error: `Failed to write backup: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }

    const sizeBytes = Buffer.byteLength(fileContent, 'utf-8');

    // 9. Enforce rolling backup window
    this.history.push({
      filePath,
      createdAt: manifest.createdAt,
      sizeBytes,
      sectionCount: sections.length,
    });
    this.enforceMaxBackups(p);

    // 10. Update config
    this.config.lastBackupAt = manifest.createdAt;
    this.config.lastBackupSizeBytes = sizeBytes;

    return {
      success: true,
      filePath,
      sizeBytes,
      sectionCount: sections.length,
    };
  }

  /**
   * Get backup history.
   */
  getBackupHistory(): BackupHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Validate a backup file without restoring.
   */
  async validateBackup(
    filePath: string,
    passphrase: string,
  ): Promise<{
    valid: boolean;
    manifest?: ReturnType<typeof parseManifest>;
    signatureValid?: boolean;
    error?: string;
  }> {
    const p = getPlatform();

    // Read and split file
    let raw: string;
    try {
      raw = p.fs.readFileSync(filePath, 'utf-8');
    } catch {
      return { valid: false, error: 'Could not read backup file' };
    }

    const sepIndex = raw.indexOf(SEPARATOR);
    if (sepIndex === -1) {
      return { valid: false, error: 'Invalid backup file format: missing separator' };
    }

    const manifestRaw = raw.substring(0, sepIndex);
    const rest = raw.substring(sepIndex + SEPARATOR.length);

    // Parse manifest
    let manifest: ReturnType<typeof parseManifest>;
    try {
      manifest = parseManifest(manifestRaw);
    } catch (err) {
      return {
        valid: false,
        error: `Invalid manifest: ${err instanceof Error ? err.message : 'parse error'}`,
      };
    }

    // Extract signature and payload
    const signatureHex = rest.substring(rest.length - SIGNATURE_LENGTH);
    const payloadJson = rest.substring(0, rest.length - SIGNATURE_LENGTH);

    // Verify integrity hash
    const computedHash = p.crypto.sha256(payloadJson);
    if (!verifyIntegrity(manifest, computedHash)) {
      return { valid: false, manifest, error: 'Integrity hash mismatch — file may be tampered' };
    }

    // Verify Ed25519 signature (optional — warn if fails)
    let signatureValid = false;
    if (manifest.signaturePublicKey && signatureHex.length === SIGNATURE_LENGTH) {
      try {
        const publicKey = Buffer.from(manifest.signaturePublicKey, 'hex');
        const sigBuffer = Buffer.from(signatureHex, 'hex');
        signatureValid = verify(Buffer.from(computedHash), sigBuffer, publicKey);
      } catch {
        signatureValid = false;
      }
    }

    // Attempt decrypt to verify passphrase
    let encrypted: EncryptedPayload;
    try {
      encrypted = JSON.parse(payloadJson) as EncryptedPayload;
    } catch {
      return { valid: false, manifest, error: 'Invalid encrypted payload' };
    }

    const salt = Buffer.from(manifest.salt, 'hex');
    const kdfResult = await deriveKey(passphrase, salt);

    try {
      await p.crypto.decrypt(encrypted, kdfResult.keyHex);
    } catch {
      return { valid: false, manifest, signatureValid, error: 'Wrong passphrase' };
    }

    return { valid: true, manifest, signatureValid };
  }

  /**
   * Restore data from a backup file.
   */
  async restoreFromBackup(
    filePath: string,
    passphrase: string,
  ): Promise<RestoreResult> {
    const p = getPlatform();

    // Read and split file
    let raw: string;
    try {
      raw = p.fs.readFileSync(filePath, 'utf-8');
    } catch {
      return { success: false, sectionsRestored: [], warnings: [], error: 'Could not read backup file' };
    }

    const sepIndex = raw.indexOf(SEPARATOR);
    if (sepIndex === -1) {
      return { success: false, sectionsRestored: [], warnings: [], error: 'Invalid backup file format' };
    }

    const manifestRaw = raw.substring(0, sepIndex);
    const rest = raw.substring(sepIndex + SEPARATOR.length);

    // Parse manifest
    let manifest: ReturnType<typeof parseManifest>;
    try {
      manifest = parseManifest(manifestRaw);
    } catch {
      return { success: false, sectionsRestored: [], warnings: [], error: 'Invalid manifest' };
    }

    // Extract signature and payload
    const signatureHex = rest.substring(rest.length - SIGNATURE_LENGTH);
    const payloadJson = rest.substring(0, rest.length - SIGNATURE_LENGTH);

    const warnings: string[] = [];

    // Verify integrity
    const computedHash = p.crypto.sha256(payloadJson);
    if (!verifyIntegrity(manifest, computedHash)) {
      return {
        success: false,
        sectionsRestored: [],
        warnings: [],
        error: 'Integrity hash mismatch — backup may be corrupted or tampered',
      };
    }

    // Verify signature (warn but proceed if invalid)
    if (manifest.signaturePublicKey && signatureHex.length === SIGNATURE_LENGTH) {
      try {
        const publicKey = Buffer.from(manifest.signaturePublicKey, 'hex');
        const sigBuffer = Buffer.from(signatureHex, 'hex');
        const sigValid = verify(Buffer.from(computedHash), sigBuffer, publicKey);
        if (!sigValid) {
          warnings.push('Signature verification failed — backup may be from a different device');
        }
      } catch {
        warnings.push('Could not verify backup signature');
      }
    }

    // Decrypt
    let encrypted: EncryptedPayload;
    try {
      encrypted = JSON.parse(payloadJson) as EncryptedPayload;
    } catch {
      return { success: false, sectionsRestored: [], warnings, error: 'Invalid encrypted payload' };
    }

    const salt = Buffer.from(manifest.salt, 'hex');
    const kdfResult = await deriveKey(passphrase, salt);

    let decrypted: string;
    try {
      decrypted = await p.crypto.decrypt(encrypted, kdfResult.keyHex);
    } catch {
      return { success: false, sectionsRestored: [], warnings, error: 'Wrong passphrase' };
    }

    // Parse sections
    let sections: BackupDataSection[];
    try {
      sections = JSON.parse(decrypted) as BackupDataSection[];
    } catch {
      return { success: false, sectionsRestored: [], warnings, error: 'Corrupted backup data' };
    }

    // Restore each section
    const sectionsRestored: string[] = [];
    for (const section of sections) {
      sectionsRestored.push(section.name);

      // Handle inheritance config specifically
      if (section.name === 'inheritanceConfig' && this.deps.inheritanceIntegration) {
        const importResult = this.deps.inheritanceIntegration.importInheritanceConfig(section.data);
        warnings.push(...importResult.warnings);
      }
    }

    // Knowledge Moment trigger: fire when 3+ sections restored
    if (sectionsRestored.length >= 3 && this.deps.knowledgeMomentTrigger) {
      this.deps.knowledgeMomentTrigger.triggerIfReady(sectionsRestored.length);
    }

    return {
      success: true,
      sectionsRestored,
      warnings,
    };
  }

  /**
   * Delete oldest backups when maxBackups is exceeded.
   */
  private enforceMaxBackups(p: ReturnType<typeof getPlatform>): void {
    while (this.history.length > this.config.maxBackups) {
      const oldest = this.history.shift();
      if (oldest) {
        try {
          p.fs.unlinkSync(oldest.filePath);
        } catch {
          // Best-effort deletion — file may already be gone
        }
      }
    }
  }
}
