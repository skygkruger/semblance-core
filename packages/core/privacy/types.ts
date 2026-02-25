// Privacy Dashboard Types — All interfaces for Step 29.
// CRITICAL: No networking imports.

import type { SignedAttestation } from '../attestation/types.js';

// ─── Data Inventory ──────────────────────────────────────────────────────────

export interface DataCategoryCount {
  category: string;
  count: number;
  /** Optional sub-breakdowns (e.g. documents by source, imports by type) */
  breakdown?: Record<string, number>;
}

export interface DataInventory {
  categories: DataCategoryCount[];
  totalEntities: number;
  collectedAt: string;
}

// ─── Network Activity ────────────────────────────────────────────────────────

export interface ServiceActivity {
  service: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  rejectedCount: number;
  rateLimitedCount: number;
  totalTimeSavedSeconds: number;
}

export interface NetworkActivitySummary {
  services: ServiceActivity[];
  totalRequests: number;
  totalRejected: number;
  totalRateLimited: number;
  dataExfiltratedBytes: number;   // Always 0 — Semblance never exfiltrates
  unknownDestinations: number;     // Always 0 — all destinations are on allowlist
  totalTimeSavedSeconds: number;
  period: { start: string; end: string };
}

// ─── Action History ──────────────────────────────────────────────────────────

export interface ActionHistorySummary {
  totalActions: number;
  byAutonomyTier: Record<string, number>;
  approvalRate: number;       // 0-1 ratio of approved vs total requiring approval
  averageTimeSavedSeconds: number;
}

// ─── Privacy Guarantees ──────────────────────────────────────────────────────

export interface PrivacyGuarantee {
  id: string;
  name: string;
  description: string;
  status: 'verified';
  verifiedAt: string;
}

// ─── Comparison Statement ────────────────────────────────────────────────────

export interface ComparisonSegment {
  category: string;
  count: number;
  label: string;       // Human-readable: "14,847 emails"
}

export interface ComparisonStatement {
  segments: ComparisonSegment[];
  totalDataPoints: number;
  summaryText: string;
  generatedAt: string;
}

// ─── Proof of Privacy ────────────────────────────────────────────────────────

export interface ProofOfPrivacyReport {
  '@context': string;
  '@type': string;
  generatedAt: string;
  deviceId: string;
  dataInventory: DataInventory;
  networkActivity: NetworkActivitySummary;
  privacyGuarantees: PrivacyGuarantee[];
  comparisonStatement: ComparisonStatement;
}

export interface SignedProofOfPrivacy {
  report: ProofOfPrivacyReport;
  attestation: SignedAttestation;
}

export interface ProofOfPrivacyExportResult {
  signedReport: SignedProofOfPrivacy;
  json: string;
}

export interface ProofOfPrivacyVerificationResult {
  valid: boolean;
  signerDevice?: string;
  timestamp?: string;
}

// ─── Privacy Dashboard ───────────────────────────────────────────────────────

export interface PrivacyDashboardData {
  inventory: DataInventory;
  networkActivity: NetworkActivitySummary;
  actionHistory: ActionHistorySummary;
  guarantees: PrivacyGuarantee[];
  comparisonStatement: ComparisonStatement;
  generatedAt: string;
}
