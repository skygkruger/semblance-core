export type ProofClassId =
  | 'process-network-policy'
  | 'connector-access'
  | 'capability-extensions'
  | 'execution-destinations'
  | 'disclosure-receipts'
  | 'workload-measurements'
  | 'model-extension-provenance'
  | 'action-audit-integrity'
  | 'sync-key-epochs'
  | 'entitlement-vouchers'
  | 'export-retention-deletion';

export type ProofEvidenceStatus =
  | 'current'
  | 'historical'
  | 'pending'
  | 'stale'
  | 'tampered'
  | 'unavailable';

export interface ProofClassEntry {
  readonly id: ProofClassId;
  readonly title: string;
  readonly status: ProofEvidenceStatus;
  readonly summary: string;
  readonly artifactId: string | null;
  readonly version: string | null;
  readonly evidenceId: string | null;
  readonly inspectedAt: string;
  readonly degradedReason?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ProofCenterSnapshot {
  readonly assembledAt: string;
  readonly offlineInspectable: true;
  readonly classes: readonly ProofClassEntry[];
  readonly degradedCount: number;
  readonly isEmpty: boolean;
}

export const PROOF_CLASS_DEFINITIONS: ReadonlyArray<{
  readonly id: ProofClassId;
  readonly title: string;
}> = [
  { id: 'process-network-policy', title: 'Process & network policy' },
  { id: 'connector-access', title: 'Connector access & last use' },
  { id: 'capability-extensions', title: 'Capabilities & extension permissions' },
  { id: 'execution-destinations', title: 'Execution destinations' },
  { id: 'disclosure-receipts', title: 'Disclosure, attestation & usage receipts' },
  { id: 'workload-measurements', title: 'Enclave & workload measurements' },
  { id: 'model-extension-provenance', title: 'Model & extension provenance' },
  { id: 'action-audit-integrity', title: 'Action & audit integrity' },
  { id: 'sync-key-epochs', title: 'Sync devices & key epochs' },
  { id: 'entitlement-vouchers', title: 'Entitlement & voucher receipts' },
  { id: 'export-retention-deletion', title: 'Export, retention & deletion state' },
];

export const DEGRADED_PROOF_STATUSES: ReadonlySet<ProofEvidenceStatus> = new Set([
  'pending',
  'stale',
  'tampered',
  'unavailable',
]);
