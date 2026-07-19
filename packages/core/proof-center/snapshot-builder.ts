import type { ActionLifecycleStore } from '@semblance/kernel';
import type { AuditTrail } from '@semblance/gateway/audit/trail.js';
import { PrivacyGuaranteeChecker } from '../privacy/privacy-guarantee-checker.js';
import {
  DEGRADED_PROOF_STATUSES,
  PROOF_CLASS_DEFINITIONS,
  type ProofCenterSnapshot,
  type ProofClassEntry,
  type ProofClassId,
  type ProofEvidenceStatus,
} from './types.js';

const CONNECTOR_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ConnectedServiceRecord {
  readonly connectorId: string;
  readonly lastSyncedAt: string | null;
}

export interface ExecutionDestinationPolicySummary {
  readonly schemaVersion: number;
  readonly capabilityCount: number;
  readonly updatedAt: string | null;
}

export interface ExecutionReceiptSummary {
  readonly id: string;
  readonly requestId: string;
  readonly timestamp: string;
  readonly status: string;
  readonly destination: string | null;
}

export interface ExtensionStatusSummary {
  readonly configured: boolean;
  readonly loaded: boolean;
  readonly manifestId: string | null;
  readonly manifestHash: string | null;
}

export interface ActiveModelSummary {
  readonly modelId: string | null;
  readonly provider: string | null;
  readonly inferenceEngine: string | null;
}

export interface EntitlementSummary {
  readonly active: boolean;
  readonly entitlementId: string | null;
  readonly tier: string | null;
  readonly revocationEpoch: number | null;
}

export interface VoucherSummary {
  readonly remainingCount: number;
  readonly lastRedeemedAt: string | null;
}

export interface SyncDeviceSummary {
  readonly deviceId: string;
  readonly label: string | null;
  readonly keyEpoch: number | null;
  readonly lastSeenAt: string | null;
}

export interface DeletionStateSummary {
  readonly pendingTombstones: number;
  readonly completedDeletions: number;
  readonly retentionPolicyId: string | null;
  readonly lastExportAt: string | null;
}

export interface MeasurementPolicySummary {
  readonly version: string;
  readonly allowedWorkloads: number;
}

export interface ProofCenterDeps {
  readonly auditTrail: AuditTrail | null;
  readonly actionLifecycleStore: ActionLifecycleStore | null;
  readonly connectedServices?: readonly ConnectedServiceRecord[];
  readonly executionPolicy?: ExecutionDestinationPolicySummary | null;
  readonly executionReceipts?: readonly ExecutionReceiptSummary[];
  readonly extensionStatus?: ExtensionStatusSummary | null;
  readonly activeModel?: ActiveModelSummary | null;
  readonly entitlement?: EntitlementSummary | null;
  readonly vouchers?: VoucherSummary | null;
  readonly syncDevices?: readonly SyncDeviceSummary[] | null;
  readonly deletionState?: DeletionStateSummary | null;
  readonly measurementPolicy?: MeasurementPolicySummary | null;
  readonly injectedOverrides?: Partial<Record<ProofClassId, Partial<ProofClassEntry>>>;
  readonly now?: () => Date;
}

function definitionTitle(id: ProofClassId): string {
  return PROOF_CLASS_DEFINITIONS.find((entry) => entry.id === id)?.title ?? id;
}

function finalizeEntry(
  base: ProofClassEntry,
  overrides: Partial<ProofClassEntry> | undefined,
  inspectedAt: string,
): ProofClassEntry {
  if (!overrides) {
    return base;
  }

  return {
    ...base,
    ...overrides,
    id: base.id,
    title: overrides.title ?? base.title,
    inspectedAt: overrides.inspectedAt ?? inspectedAt,
  };
}

function buildProcessNetworkPolicy(inspectedAt: string): ProofClassEntry {
  const checker = new PrivacyGuaranteeChecker();
  const guarantees = checker.check();
  return {
    id: 'process-network-policy',
    title: definitionTitle('process-network-policy'),
    status: 'current',
    summary: `${guarantees.length} architectural privacy guarantees verified locally`,
    artifactId: 'privacy-guarantee-registry',
    version: 'v1',
    evidenceId: 'zero-telemetry',
    inspectedAt,
    details: {
      guaranteeCount: guarantees.length,
      guaranteeIds: guarantees.map((entry) => entry.id),
    },
  };
}

function buildConnectorAccess(
  connectedServices: readonly ConnectedServiceRecord[] | undefined,
  inspectedAt: string,
  now: Date,
): ProofClassEntry {
  const services = connectedServices ?? [];
  if (services.length === 0) {
    return {
      id: 'connector-access',
      title: definitionTitle('connector-access'),
      status: 'unavailable',
      summary: 'No connectors authorized on this device',
      artifactId: null,
      version: null,
      evidenceId: null,
      inspectedAt,
      degradedReason: 'No connector tokens or native connector state found',
      details: { connectedCount: 0 },
    };
  }

  const staleServices = services.filter((service) => {
    if (!service.lastSyncedAt) return true;
    const syncedAt = new Date(service.lastSyncedAt).getTime();
    return Number.isNaN(syncedAt) || now.getTime() - syncedAt > CONNECTOR_STALE_MS;
  });

  const latestSync = services
    .map((service) => service.lastSyncedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0] ?? null;

  const status: ProofEvidenceStatus = staleServices.length > 0 ? 'stale' : 'current';

  return {
    id: 'connector-access',
    title: definitionTitle('connector-access'),
    status,
    summary: `${services.length} connector${services.length === 1 ? '' : 's'} authorized locally`,
    artifactId: services[0]?.connectorId ?? 'connector-registry',
    version: 'local-oauth',
    evidenceId: latestSync ? `connector-sync:${latestSync}` : null,
    inspectedAt,
    degradedReason: status === 'stale'
      ? `${staleServices.length} connector(s) have stale or missing sync timestamps`
      : undefined,
    details: {
      connectedCount: services.length,
      connectors: services,
      staleCount: staleServices.length,
    },
  };
}

function buildCapabilityExtensions(
  extensionStatus: ExtensionStatusSummary | null | undefined,
  inspectedAt: string,
): ProofClassEntry {
  if (!extensionStatus) {
    return {
      id: 'capability-extensions',
      title: definitionTitle('capability-extensions'),
      status: 'unavailable',
      summary: 'Extension status not initialized',
      artifactId: null,
      version: null,
      evidenceId: null,
      inspectedAt,
      degradedReason: 'Extension registry has not been inspected yet',
    };
  }

  if (!extensionStatus.configured) {
    return {
      id: 'capability-extensions',
      title: definitionTitle('capability-extensions'),
      status: 'unavailable',
      summary: 'Digital Representative extension not configured',
      artifactId: null,
      version: null,
      evidenceId: null,
      inspectedAt,
      degradedReason: 'No signed extension manifest configured for this install',
      details: extensionStatus,
    };
  }

  return {
    id: 'capability-extensions',
    title: definitionTitle('capability-extensions'),
    status: extensionStatus.loaded ? 'current' : 'pending',
    summary: extensionStatus.loaded
      ? 'Signed extension permissions loaded locally'
      : 'Signed extension manifest present but not loaded',
    artifactId: extensionStatus.manifestId,
    version: extensionStatus.manifestHash,
    evidenceId: extensionStatus.manifestId,
    inspectedAt,
    degradedReason: extensionStatus.loaded ? undefined : 'Extension manifest verified but runtime not loaded',
    details: extensionStatus,
  };
}

function buildExecutionDestinations(
  executionPolicy: ExecutionDestinationPolicySummary | null | undefined,
  inspectedAt: string,
): ProofClassEntry {
  if (!executionPolicy) {
    return {
      id: 'execution-destinations',
      title: definitionTitle('execution-destinations'),
      status: 'unavailable',
      summary: 'Execution destination policy not available',
      artifactId: null,
      version: null,
      evidenceId: null,
      inspectedAt,
      degradedReason: 'Destination policy store has not been initialized',
    };
  }

  return {
    id: 'execution-destinations',
    title: definitionTitle('execution-destinations'),
    status: 'current',
    summary: `${executionPolicy.capabilityCount} capability destination preferences stored locally`,
    artifactId: 'execution-destination-policy',
    version: `schema-${executionPolicy.schemaVersion}`,
    evidenceId: executionPolicy.updatedAt ?? 'execution-destination-policy',
    inspectedAt,
    details: executionPolicy,
  };
}

function buildDisclosureReceipts(
  executionReceipts: readonly ExecutionReceiptSummary[] | undefined,
  actionLifecycleStore: ActionLifecycleStore | null,
  inspectedAt: string,
): ProofClassEntry {
  const receipts = executionReceipts ?? [];
  const actionCount = actionLifecycleStore?.listRecords(5, 0).length ?? 0;

  if (receipts.length === 0 && actionCount === 0) {
    return {
      id: 'disclosure-receipts',
      title: definitionTitle('disclosure-receipts'),
      status: 'unavailable',
      summary: 'No disclosure, attestation, or usage receipts recorded yet',
      artifactId: null,
      version: null,
      evidenceId: null,
      inspectedAt,
      degradedReason: 'Receipt store is empty on this device',
      details: { receiptCount: 0, actionLifecycleCount: actionCount },
    };
  }

  const latest = receipts[0] ?? null;
  return {
    id: 'disclosure-receipts',
    title: definitionTitle('disclosure-receipts'),
    status: receipts.length > 0 ? 'current' : 'historical',
    summary: receipts.length > 0
      ? `${receipts.length} execution receipt(s) available for offline inspection`
      : `${actionCount} lifecycle action(s) recorded without confidential receipts`,
    artifactId: latest?.id ?? 'action-lifecycle',
    version: 'slice-9-receipt-v1',
    evidenceId: latest?.requestId ?? null,
    inspectedAt,
    details: {
      receiptCount: receipts.length,
      actionLifecycleCount: actionCount,
      latestReceiptAt: latest?.timestamp ?? null,
    },
  };
}

function buildWorkloadMeasurements(
  measurementPolicy: MeasurementPolicySummary | null | undefined,
  inspectedAt: string,
): ProofClassEntry {
  if (!measurementPolicy) {
    return {
      id: 'workload-measurements',
      title: definitionTitle('workload-measurements'),
      status: 'unavailable',
      summary: 'Measurement policy not loaded',
      artifactId: null,
      version: null,
      evidenceId: null,
      inspectedAt,
      degradedReason: 'Confidential workload measurement policy unavailable offline',
    };
  }

  return {
    id: 'workload-measurements',
    title: definitionTitle('workload-measurements'),
    status: 'current',
    summary: `${measurementPolicy.allowedWorkloads} attested workload measurement(s) pinned locally`,
    artifactId: 'measurement-policy',
    version: measurementPolicy.version,
    evidenceId: `measurement-policy:${measurementPolicy.version}`,
    inspectedAt,
    details: measurementPolicy,
  };
}

function buildModelExtensionProvenance(
  activeModel: ActiveModelSummary | null | undefined,
  extensionStatus: ExtensionStatusSummary | null | undefined,
  inspectedAt: string,
): ProofClassEntry {
  const modelId = activeModel?.modelId ?? null;
  const manifestId = extensionStatus?.manifestId ?? null;

  if (!modelId && !manifestId) {
    return {
      id: 'model-extension-provenance',
      title: definitionTitle('model-extension-provenance'),
      status: 'unavailable',
      summary: 'No active model or signed extension provenance recorded',
      artifactId: null,
      version: null,
      evidenceId: null,
      inspectedAt,
      degradedReason: 'Model runtime and extension manifest both absent',
      details: { activeModel, extensionStatus },
    };
  }

  return {
    id: 'model-extension-provenance',
    title: definitionTitle('model-extension-provenance'),
    status: 'current',
    summary: modelId
      ? `Active model ${modelId} via ${activeModel?.provider ?? 'local runtime'}`
      : `Extension manifest ${manifestId} pinned locally`,
    artifactId: modelId ?? manifestId,
    version: activeModel?.inferenceEngine ?? extensionStatus?.manifestHash ?? null,
    evidenceId: modelId ? `model:${modelId}` : manifestId,
    inspectedAt,
    details: { activeModel, extensionStatus },
  };
}

function buildActionAuditIntegrity(
  auditTrail: AuditTrail | null,
  inspectedAt: string,
): ProofClassEntry {
  if (!auditTrail) {
    return {
      id: 'action-audit-integrity',
      title: definitionTitle('action-audit-integrity'),
      status: 'unavailable',
      summary: 'Audit trail not initialized',
      artifactId: null,
      version: null,
      evidenceId: null,
      inspectedAt,
      degradedReason: 'Gateway audit trail unavailable for offline verification',
    };
  }

  const chain = auditTrail.verifyChainIntegrity();
  const entryCount = auditTrail.count();

  return {
    id: 'action-audit-integrity',
    title: definitionTitle('action-audit-integrity'),
    status: chain.valid ? (entryCount > 0 ? 'current' : 'historical') : 'tampered',
    summary: chain.valid
      ? `${entryCount} audit entries with intact Merkle chain`
      : `Audit chain integrity failure at ${chain.brokenAt ?? 'unknown entry'}`,
    artifactId: 'audit-trail',
    version: 'merkle-v1',
    evidenceId: chain.valid ? `audit-chain:${entryCount}` : chain.brokenAt ?? 'audit-chain-broken',
    inspectedAt,
    degradedReason: chain.valid ? undefined : 'Tamper-evident audit chain verification failed',
    details: {
      entryCount,
      valid: chain.valid,
      brokenAt: chain.valid ? null : chain.brokenAt ?? null,
    },
  };
}

function buildSyncKeyEpochs(
  syncDevices: readonly SyncDeviceSummary[] | null | undefined,
  inspectedAt: string,
): ProofClassEntry {
  if (syncDevices === null || syncDevices === undefined) {
    return {
      id: 'sync-key-epochs',
      title: definitionTitle('sync-key-epochs'),
      status: 'unavailable',
      summary: 'Device sync and key epoch records not present on this device',
      artifactId: null,
      version: null,
      evidenceId: null,
      inspectedAt,
      degradedReason: 'Sync mesh or key epoch store has not been configured',
      details: { available: false },
    };
  }

  if (syncDevices.length === 0) {
    return {
      id: 'sync-key-epochs',
      title: definitionTitle('sync-key-epochs'),
      status: 'historical',
      summary: 'No paired sync devices — single-device mode',
      artifactId: 'device-identity',
      version: 'local-only',
      evidenceId: 'sync-devices:0',
      inspectedAt,
      details: { deviceCount: 0 },
    };
  }

  return {
    id: 'sync-key-epochs',
    title: definitionTitle('sync-key-epochs'),
    status: 'current',
    summary: `${syncDevices.length} paired device(s) with local key epoch metadata`,
    artifactId: syncDevices[0]?.deviceId ?? 'sync-device',
    version: syncDevices[0]?.keyEpoch != null ? `epoch-${syncDevices[0]?.keyEpoch}` : null,
    evidenceId: `sync-device:${syncDevices[0]?.deviceId ?? 'unknown'}`,
    inspectedAt,
    details: { deviceCount: syncDevices.length, devices: syncDevices },
  };
}

function buildEntitlementVouchers(
  entitlement: EntitlementSummary | null | undefined,
  vouchers: VoucherSummary | null | undefined,
  inspectedAt: string,
): ProofClassEntry {
  const hasEntitlement = Boolean(entitlement?.active && entitlement.entitlementId);
  const hasVouchers = (vouchers?.remainingCount ?? 0) > 0 || Boolean(vouchers?.lastRedeemedAt);

  if (!hasEntitlement && !hasVouchers) {
    return {
      id: 'entitlement-vouchers',
      title: definitionTitle('entitlement-vouchers'),
      status: 'unavailable',
      summary: 'No active entitlement or confidential voucher receipts on device',
      artifactId: null,
      version: null,
      evidenceId: null,
      inspectedAt,
      degradedReason: 'Entitlement and voucher stores are empty',
      details: { entitlement, vouchers },
    };
  }

  const status: ProofEvidenceStatus = entitlement?.active ? 'current' : 'historical';

  return {
    id: 'entitlement-vouchers',
    title: definitionTitle('entitlement-vouchers'),
    status,
    summary: hasEntitlement
      ? `Entitlement ${entitlement?.entitlementId} (${entitlement?.tier ?? 'unknown tier'})`
      : `${vouchers?.remainingCount ?? 0} confidential voucher(s) available locally`,
    artifactId: entitlement?.entitlementId ?? 'voucher-wallet',
    version: entitlement?.revocationEpoch != null ? `revocation-${entitlement.revocationEpoch}` : 'voucher-v1',
    evidenceId: entitlement?.entitlementId ?? vouchers?.lastRedeemedAt ?? null,
    inspectedAt,
    degradedReason: entitlement?.active ? undefined : 'Historical entitlement or voucher material only',
    details: { entitlement, vouchers },
  };
}

function buildExportRetentionDeletion(
  deletionState: DeletionStateSummary | null | undefined,
  inspectedAt: string,
): ProofClassEntry {
  if (!deletionState) {
    return {
      id: 'export-retention-deletion',
      title: definitionTitle('export-retention-deletion'),
      status: 'unavailable',
      summary: 'Deletion and retention state unavailable',
      artifactId: null,
      version: null,
      evidenceId: null,
      inspectedAt,
      degradedReason: 'Vault deletion tracker not initialized',
    };
  }

  const status: ProofEvidenceStatus = deletionState.pendingTombstones > 0
    ? 'pending'
    : deletionState.completedDeletions > 0
      ? 'current'
      : 'historical';

  return {
    id: 'export-retention-deletion',
    title: definitionTitle('export-retention-deletion'),
    status,
    summary: deletionState.pendingTombstones > 0
      ? `${deletionState.pendingTombstones} deletion tombstone(s) awaiting completion`
      : `${deletionState.completedDeletions} completed deletion proof(s) on device`,
    artifactId: deletionState.retentionPolicyId ?? 'vault-deletion-tracker',
    version: deletionState.retentionPolicyId ?? 'retention-default',
    evidenceId: deletionState.lastExportAt ?? `deletions:${deletionState.completedDeletions}`,
    inspectedAt,
    degradedReason: status === 'pending'
      ? 'Deletion completion pending across one or more devices'
      : undefined,
    details: deletionState,
  };
}

function computeIsEmpty(classes: readonly ProofClassEntry[]): boolean {
  const userEvidenceClassIds: ProofClassId[] = [
    'connector-access',
    'disclosure-receipts',
    'action-audit-integrity',
    'entitlement-vouchers',
    'export-retention-deletion',
    'model-extension-provenance',
    'capability-extensions',
    'sync-key-epochs',
  ];

  return !classes.some((entry) => {
    if (!userEvidenceClassIds.includes(entry.id)) {
      return false;
    }
    if (entry.status === 'unavailable') {
      return false;
    }
    if (entry.id === 'action-audit-integrity') {
      const entryCount = entry.details?.entryCount;
      return typeof entryCount === 'number' && entryCount > 0;
    }
    if (entry.id === 'export-retention-deletion') {
      const pending = entry.details?.pendingTombstones;
      const completed = entry.details?.completedDeletions;
      return (typeof pending === 'number' && pending > 0)
        || (typeof completed === 'number' && completed > 0);
    }
    if (entry.id === 'sync-key-epochs') {
      const deviceCount = entry.details?.deviceCount;
      return typeof deviceCount === 'number' && deviceCount > 0;
    }
    if (entry.id === 'capability-extensions') {
      return entry.status === 'current';
    }
    return entry.status === 'current' || entry.status === 'historical' || entry.status === 'pending';
  });
}

export function buildProofCenterSnapshot(deps: ProofCenterDeps): ProofCenterSnapshot {
  const now = deps.now?.() ?? new Date();
  const inspectedAt = now.toISOString();
  const overrides = deps.injectedOverrides ?? {};

  const classes: ProofClassEntry[] = [
    finalizeEntry(buildProcessNetworkPolicy(inspectedAt), overrides['process-network-policy'], inspectedAt),
    finalizeEntry(
      buildConnectorAccess(deps.connectedServices, inspectedAt, now),
      overrides['connector-access'],
      inspectedAt,
    ),
    finalizeEntry(
      buildCapabilityExtensions(deps.extensionStatus, inspectedAt),
      overrides['capability-extensions'],
      inspectedAt,
    ),
    finalizeEntry(
      buildExecutionDestinations(deps.executionPolicy, inspectedAt),
      overrides['execution-destinations'],
      inspectedAt,
    ),
    finalizeEntry(
      buildDisclosureReceipts(deps.executionReceipts, deps.actionLifecycleStore, inspectedAt),
      overrides['disclosure-receipts'],
      inspectedAt,
    ),
    finalizeEntry(
      buildWorkloadMeasurements(deps.measurementPolicy, inspectedAt),
      overrides['workload-measurements'],
      inspectedAt,
    ),
    finalizeEntry(
      buildModelExtensionProvenance(deps.activeModel, deps.extensionStatus, inspectedAt),
      overrides['model-extension-provenance'],
      inspectedAt,
    ),
    finalizeEntry(
      buildActionAuditIntegrity(deps.auditTrail, inspectedAt),
      overrides['action-audit-integrity'],
      inspectedAt,
    ),
    finalizeEntry(
      buildSyncKeyEpochs(deps.syncDevices, inspectedAt),
      overrides['sync-key-epochs'],
      inspectedAt,
    ),
    finalizeEntry(
      buildEntitlementVouchers(deps.entitlement, deps.vouchers, inspectedAt),
      overrides['entitlement-vouchers'],
      inspectedAt,
    ),
    finalizeEntry(
      buildExportRetentionDeletion(deps.deletionState, inspectedAt),
      overrides['export-retention-deletion'],
      inspectedAt,
    ),
  ];

  const degradedCount = classes.filter((entry) => DEGRADED_PROOF_STATUSES.has(entry.status)).length;

  return {
    assembledAt: inspectedAt,
    offlineInspectable: true,
    classes,
    degradedCount,
    isEmpty: computeIsEmpty(classes),
  };
}

export function isProofCenterOfflineAcceptable(snapshot: ProofCenterSnapshot): boolean {
  if (snapshot.classes.length !== PROOF_CLASS_DEFINITIONS.length) {
    return false;
  }

  const ids = new Set(snapshot.classes.map((entry) => entry.id));
  for (const definition of PROOF_CLASS_DEFINITIONS) {
    if (!ids.has(definition.id)) {
      return false;
    }
  }

  return snapshot.classes.every((entry) => Boolean(entry.summary) && Boolean(entry.inspectedAt));
}
