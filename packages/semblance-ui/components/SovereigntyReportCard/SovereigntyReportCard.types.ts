export interface SovereigntyReportCardProps {
  /** Report period start (ISO date string) */
  periodStart: string;
  /** Report period end (ISO date string) */
  periodEnd: string;
  /** When the report was generated (ISO datetime) */
  generatedAt: string;
  /** Device identifier */
  deviceId: string;
  /** Knowledge item counts by source */
  knowledgeSummary: Record<string, number>;
  /** Autonomous action counts */
  autonomousActions: {
    byDomain: Record<string, number>;
    totalTimeSavedSeconds: number;
  };
  /** Number of hard limits enforced */
  hardLimitsEnforced: number;
  /** Audit chain integrity status */
  auditChainStatus: {
    verified: boolean;
    totalEntries: number;
    daysCovered: number;
  };
  /** Signature verification status */
  signatureVerified?: boolean;
  /** Public key fingerprint (hex) */
  publicKeyFingerprint?: string;
  /** Comparison statement text */
  comparisonStatement?: string;
  /** Called when user requests PDF export */
  onExportPDF?: () => void;
  /** Loading state */
  loading?: boolean;
  /** Additional class name */
  className?: string;
}
