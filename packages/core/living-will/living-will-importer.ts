// Living Will Importer — Decrypts, verifies, and restores archive sections.
// Premium-gated: requires Digital Representative tier.
// CRITICAL: No networking imports. No Gateway. No IPC. Entirely local.

import { getPlatform } from '../platform/index.js';
import type { DatabaseHandle } from '../platform/types.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { AttestationVerifier } from '../attestation/attestation-verifier.js';
import { ArchiveReader } from './archive-reader.js';
import type {
  LivingWillImportResult,
  EncryptedArchive,
  LivingWillArchive,
} from './types.js';

export interface LivingWillImporterDeps {
  db: DatabaseHandle;
  premiumGate: PremiumGate;
  localDeviceId: string;
  documentStore?: { insertDocument?: (params: Record<string, unknown>) => unknown };
  styleProfileStore?: { createProfile?: (profile: unknown) => unknown };
  contactStore?: { insertContact?: (contact: unknown) => unknown };
  autonomyManager?: { setDomainTier?: (domain: string, tier: string) => void };
  attestationVerifier?: AttestationVerifier;
}

/**
 * Imports a Living Will archive: reads, decrypts, verifies, restores sections.
 */
export class LivingWillImporter {
  private db: DatabaseHandle;
  private premiumGate: PremiumGate;
  private localDeviceId: string;
  private deps: LivingWillImporterDeps;
  private reader = new ArchiveReader();

  constructor(deps: LivingWillImporterDeps) {
    this.db = deps.db;
    this.premiumGate = deps.premiumGate;
    this.localDeviceId = deps.localDeviceId;
    this.deps = deps;
  }

  /**
   * Import a Living Will archive from a file path.
   */
  async import(
    archivePath: string,
    passphrase: string,
    verificationKey?: Buffer,
  ): Promise<LivingWillImportResult> {
    if (!this.premiumGate.isPremium()) {
      return {
        success: false,
        sectionsRestored: [],
        warnings: [],
        error: 'Living Will import requires Digital Representative tier',
      };
    }

    // Read the encrypted archive from disk
    const p = getPlatform();
    let raw: string;
    try {
      raw = p.fs.readFileSync(archivePath, 'utf-8');
    } catch {
      return {
        success: false,
        sectionsRestored: [],
        warnings: [],
        error: 'Could not read archive file',
      };
    }

    let encrypted: EncryptedArchive;
    try {
      encrypted = JSON.parse(raw) as EncryptedArchive;
    } catch {
      return {
        success: false,
        sectionsRestored: [],
        warnings: [],
        error: 'Invalid archive file format',
      };
    }

    // Decrypt
    let archive: LivingWillArchive;
    try {
      archive = await this.reader.decryptArchive(encrypted, passphrase);
    } catch (err) {
      return {
        success: false,
        sectionsRestored: [],
        warnings: [],
        error: err instanceof Error ? err.message : 'Decryption failed',
      };
    }

    const warnings: string[] = [];

    // Validate manifest
    const validation = this.reader.validateManifest(archive.manifest);
    if (!validation.valid) {
      return {
        success: false,
        sectionsRestored: [],
        warnings: validation.warnings,
        error: 'Invalid archive manifest',
      };
    }
    warnings.push(...validation.warnings);

    // Verify signature if key provided
    if (verificationKey && this.deps.attestationVerifier && archive.signature) {
      const verifyResult = this.deps.attestationVerifier.verify(
        {
          payload: archive.manifest as unknown as Record<string, unknown>,
          proof: {
            type: 'HmacSha256Signature',
            created: archive.manifest.createdAt,
            verificationMethod: `device:${archive.manifest.deviceId}`,
            proofPurpose: 'assertionMethod',
            proofValue: archive.signature,
          },
        },
        verificationKey,
      );

      if (!verifyResult.valid) {
        warnings.push('Signature verification failed — archive may have been modified');
      }

      if (verifyResult.signerDevice && verifyResult.signerDevice !== this.localDeviceId) {
        warnings.push(`Archive was created on a different device (${verifyResult.signerDevice})`);
      }
    }

    // Restore sections
    const sectionsRestored: string[] = [];

    if (archive.knowledgeGraph !== undefined) {
      this.restoreKnowledgeGraph(archive.knowledgeGraph);
      sectionsRestored.push('knowledgeGraph');
    }

    if (archive.styleProfile !== undefined) {
      this.restoreStyleProfile(archive.styleProfile);
      sectionsRestored.push('styleProfile');
    }

    if (archive.decisionProfile !== undefined) {
      sectionsRestored.push('decisionProfile');
    }

    if (archive.relationshipMap !== undefined) {
      this.restoreRelationshipMap(archive.relationshipMap);
      sectionsRestored.push('relationshipMap');
    }

    if (archive.preferences !== undefined) {
      this.restorePreferences(archive.preferences);
      sectionsRestored.push('preferences');
    }

    if (archive.actionSummary !== undefined) {
      sectionsRestored.push('actionSummary');
    }

    return {
      success: true,
      sectionsRestored,
      warnings,
    };
  }

  private restoreKnowledgeGraph(data: unknown): void {
    if (!this.deps.documentStore?.insertDocument) return;
    const kg = data as Record<string, unknown>;
    if (kg.documents && Array.isArray(kg.documents)) {
      for (const doc of kg.documents) {
        try {
          this.deps.documentStore.insertDocument(doc as Record<string, unknown>);
        } catch {
          // Skip duplicates silently (dedup by content hash)
        }
      }
    }
  }

  private restoreStyleProfile(data: unknown): void {
    if (!this.deps.styleProfileStore?.createProfile) return;
    try {
      this.deps.styleProfileStore.createProfile(data);
    } catch {
      // Profile may already exist
    }
  }

  private restoreRelationshipMap(data: unknown): void {
    if (!this.deps.contactStore?.insertContact) return;
    const rm = data as Record<string, unknown>;
    if (rm.contacts && Array.isArray(rm.contacts)) {
      for (const contact of rm.contacts) {
        try {
          this.deps.contactStore.insertContact(contact);
        } catch {
          // Skip duplicates
        }
      }
    }
  }

  private restorePreferences(data: unknown): void {
    if (!this.deps.autonomyManager?.setDomainTier) return;
    const prefs = data as Record<string, unknown>;
    const autonomy = prefs.autonomy as Record<string, string> | undefined;
    if (autonomy) {
      for (const [domain, tier] of Object.entries(autonomy)) {
        try {
          this.deps.autonomyManager.setDomainTier(domain, tier);
        } catch {
          // Domain may not exist
        }
      }
    }
  }
}
