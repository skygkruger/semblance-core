// Living Will Types — Archive format, export/import configuration.
// CRITICAL: No networking imports. All data structures are local-only.

import type { EncryptedPayload } from '../platform/types.js';

/**
 * Configuration for what to include/exclude in a Living Will export.
 */
export interface LivingWillExportConfig {
  includeKnowledgeGraph?: boolean;
  includeStyleProfile?: boolean;
  includeDecisionProfile?: boolean;
  includeRelationshipMap?: boolean;
  includePreferences?: boolean;
  includeActionSummary?: boolean;
  excludeFinancialData?: boolean;
  excludeHealthData?: boolean;
}

/**
 * Manifest embedded in every Living Will archive.
 */
export interface ArchiveManifest {
  version: number;
  semblanceMinVersion: string;
  createdAt: string;
  deviceId: string;
  contentSections: string[];
  signatureChainRef: string;
}

/**
 * Data collected for each section before assembly.
 */
export interface LivingWillSectionData {
  knowledgeGraph?: unknown;
  styleProfile?: unknown;
  decisionProfile?: unknown;
  relationshipMap?: unknown;
  preferences?: unknown;
  actionSummary?: unknown;
  inheritanceConfig?: unknown;
}

/**
 * The assembled archive before encryption.
 */
export interface LivingWillArchive {
  manifest: ArchiveManifest;
  knowledgeGraph?: unknown;
  styleProfile?: unknown;
  decisionProfile?: unknown;
  relationshipMap?: unknown;
  preferences?: unknown;
  actionSummary?: unknown;
  inheritanceConfig?: unknown;
  signature?: string;
}

/**
 * The encrypted archive written to disk as a .semblance file.
 */
export interface EncryptedArchive {
  header: {
    version: number;
    encrypted: boolean;
    createdAt: string;
  };
  payload: EncryptedPayload;
}

/**
 * Result of an export operation.
 */
export interface LivingWillExportResult {
  success: boolean;
  archivePath?: string;
  error?: string;
  sectionCounts: Record<string, number>;
}

/**
 * Result of an import operation.
 */
export interface LivingWillImportResult {
  success: boolean;
  sectionsRestored: string[];
  warnings: string[];
  error?: string;
}

/**
 * History entry for tracking exports.
 */
export interface ExportHistoryEntry {
  id: string;
  exportedAt: string;
  archivePath: string;
  sections: string[];
  deviceId: string;
}

/**
 * Scheduler configuration for automated exports.
 */
export interface SchedulerConfig {
  cadence: 'weekly' | 'monthly' | 'disabled';
  outputPath: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

/**
 * Result of a scheduler check-and-run cycle.
 */
export interface SchedulerRunResult {
  ran: boolean;
  skipped: boolean;
  reason?: string;
  exportResult?: LivingWillExportResult;
}
