// Living Will Exporter — Full export pipeline: collect, filter, sign, encrypt, write.
// Premium-gated: requires Digital Representative tier.
// CRITICAL: No networking imports. No Gateway. No IPC. Entirely local.

import { getPlatform } from '../platform/index.js';
import type { DatabaseHandle } from '../platform/types.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { AttestationSigner } from '../attestation/attestation-signer.js';
import { ArchiveBuilder } from './archive-builder.js';
import { SelectiveExporter } from './selective-export.js';
import type {
  LivingWillExportConfig,
  LivingWillExportResult,
  LivingWillSectionData,
  ExportHistoryEntry,
} from './types.js';
import { nanoid } from 'nanoid';

export interface LivingWillExporterDeps {
  db: DatabaseHandle;
  premiumGate: PremiumGate;
  deviceId: string;
  documentStore?: { listDocuments: (opts?: unknown) => unknown[]; getStats: () => Record<string, unknown> };
  styleProfileStore?: { getActiveProfile: (userId?: string) => unknown };
  approvalPatternTracker?: { getAllPatterns: () => unknown[] };
  contactStore?: { getAllContacts?: () => unknown[] };
  autonomyManager?: { getConfig: () => Record<string, unknown> };
  attestationSigner?: AttestationSigner;
}

/**
 * Exports a Living Will archive: collects data, filters, signs, encrypts, writes.
 */
export class LivingWillExporter {
  private db: DatabaseHandle;
  private premiumGate: PremiumGate;
  private deviceId: string;
  private deps: LivingWillExporterDeps;
  private archiveBuilder = new ArchiveBuilder();
  private selectiveExporter = new SelectiveExporter();

  constructor(deps: LivingWillExporterDeps) {
    this.db = deps.db;
    this.premiumGate = deps.premiumGate;
    this.deviceId = deps.deviceId;
    this.deps = deps;
  }

  /**
   * Initialize the export history table.
   */
  initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS living_will_exports (
        id TEXT PRIMARY KEY,
        exported_at TEXT NOT NULL,
        archive_path TEXT NOT NULL,
        sections TEXT NOT NULL,
        device_id TEXT NOT NULL
      )
    `);
  }

  /**
   * Export a Living Will archive.
   */
  async export(
    config: LivingWillExportConfig,
    passphrase: string,
    outputPath: string,
  ): Promise<LivingWillExportResult> {
    if (!this.premiumGate.isPremium()) {
      return {
        success: false,
        error: 'Living Will export requires Digital Representative tier',
        sectionCounts: {},
      };
    }

    // Collect raw data from all stores
    const rawData = this.collectData();

    // Apply selective export filters
    const filteredData = this.selectiveExporter.applyConfig(rawData, config);

    // Build the archive
    const archive = this.archiveBuilder.buildArchive(this.deviceId, filteredData);

    // Sign the manifest if attestation signer is available
    if (this.deps.attestationSigner) {
      const signed = this.deps.attestationSigner.sign(
        archive.manifest as unknown as Record<string, unknown>,
      );
      archive.signature = signed.proof.proofValue;
    }

    // Encrypt
    const encrypted = await this.archiveBuilder.createEncryptedArchive(archive, passphrase);

    // Write to disk
    const p = getPlatform();
    p.fs.writeFileSync(outputPath, JSON.stringify(encrypted));

    // Record in history
    const sectionCounts = this.countSections(filteredData);
    this.recordExport(outputPath, Object.keys(sectionCounts));

    return {
      success: true,
      archivePath: outputPath,
      sectionCounts,
    };
  }

  /**
   * Get export history.
   */
  getExportHistory(): ExportHistoryEntry[] {
    const rows = this.db.prepare(
      'SELECT id, exported_at, archive_path, sections, device_id FROM living_will_exports ORDER BY exported_at DESC',
    ).all() as Array<{ id: string; exported_at: string; archive_path: string; sections: string; device_id: string }>;

    return rows.map((row) => ({
      id: row.id,
      exportedAt: row.exported_at,
      archivePath: row.archive_path,
      sections: JSON.parse(row.sections) as string[],
      deviceId: row.device_id,
    }));
  }

  private collectData(): LivingWillSectionData {
    const data: LivingWillSectionData = {};

    if (this.deps.documentStore) {
      const docs = this.deps.documentStore.listDocuments();
      const stats = this.deps.documentStore.getStats();
      data.knowledgeGraph = { documents: docs, stats };
    }

    if (this.deps.styleProfileStore) {
      data.styleProfile = this.deps.styleProfileStore.getActiveProfile();
    }

    if (this.deps.approvalPatternTracker) {
      data.decisionProfile = { patterns: this.deps.approvalPatternTracker.getAllPatterns() };
    }

    if (this.deps.contactStore?.getAllContacts) {
      data.relationshipMap = { contacts: this.deps.contactStore.getAllContacts() };
    }

    if (this.deps.autonomyManager) {
      data.preferences = { autonomy: this.deps.autonomyManager.getConfig() };
    }

    // Action summary from audit trail
    const auditCount = this.getAuditCount();
    if (auditCount > 0) {
      data.actionSummary = { totalActions: auditCount };
    }

    return data;
  }

  private getAuditCount(): number {
    try {
      const row = this.db.prepare(
        "SELECT COUNT(*) as count FROM audit_trail WHERE direction = 'request'",
      ).get() as { count: number } | undefined;
      return row?.count ?? 0;
    } catch {
      return 0;
    }
  }

  private countSections(data: LivingWillSectionData): Record<string, number> {
    const counts: Record<string, number> = {};
    if (data.knowledgeGraph !== undefined) {
      const kg = data.knowledgeGraph as Record<string, unknown>;
      counts.knowledgeGraph = Array.isArray(kg.documents) ? kg.documents.length : 1;
    }
    if (data.styleProfile !== undefined) counts.styleProfile = 1;
    if (data.decisionProfile !== undefined) counts.decisionProfile = 1;
    if (data.relationshipMap !== undefined) {
      const rm = data.relationshipMap as Record<string, unknown>;
      counts.relationshipMap = Array.isArray(rm.contacts) ? rm.contacts.length : 1;
    }
    if (data.preferences !== undefined) counts.preferences = 1;
    if (data.actionSummary !== undefined) counts.actionSummary = 1;
    return counts;
  }

  private recordExport(archivePath: string, sections: string[]): void {
    this.db.prepare(
      'INSERT INTO living_will_exports (id, exported_at, archive_path, sections, device_id) VALUES (?, ?, ?, ?, ?)',
    ).run(nanoid(), new Date().toISOString(), archivePath, JSON.stringify(sections), this.deviceId);
  }
}
