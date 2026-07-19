import type { EncryptedEventEnvelopeV1, SyncEnvelopeV1 } from '@semblance/protocol';

export type VectorClock = Record<string, number>;

export interface VaultEventPlaintext {
  readonly eventType: string;
  readonly payload: unknown;
  readonly occurredAt: string;
}

export interface DecryptedVaultEvent {
  readonly envelope: EncryptedEventEnvelopeV1;
  readonly syncEnvelope: SyncEnvelopeV1;
  readonly plaintext: VaultEventPlaintext;
}

export interface MergedVaultEvent {
  readonly eventId: string;
  readonly domainId: string;
  readonly deviceId: string;
  readonly membershipEpoch: number;
  readonly lamportClock: number;
  readonly vectorClock: VectorClock;
  readonly causalParentIds: readonly string[];
  readonly plaintext: VaultEventPlaintext;
  readonly conflictGroupId: string | null;
  readonly isConflictDuplicate: boolean;
}

export type RebuildIndexesCallback = (events: readonly MergedVaultEvent[]) => void | Promise<void>;

export interface MergeResult {
  readonly merged: MergedVaultEvent[];
  readonly conflicts: ConflictRecord[];
  readonly appliedEventIds: string[];
  readonly skippedEventIds: string[];
}

export interface ConflictRecord {
  readonly conflictGroupId: string;
  readonly eventIds: string[];
  readonly domainId: string;
  readonly reason: string;
}

export interface SyncAuditEntry {
  readonly sequence: number;
  readonly operation: 'push' | 'pull' | 'merge' | 'checkpoint';
  readonly eventIds: readonly string[];
  readonly priorChainHash: string;
  readonly chainHash: string;
  readonly deviceSignature: string;
  readonly occurredAt: string;
}

export interface SyncCheckpoint {
  readonly checkpointId: string;
  readonly deviceId: string;
  readonly auditChainHash: string;
  readonly eventCount: number;
  readonly membershipEpoch: number;
  readonly signature: string;
  readonly createdAt: string;
}

export interface PushEventsResult {
  readonly pushed: SyncEnvelopeV1[];
  readonly auditEntry: SyncAuditEntry;
}

export interface PullMergeResult extends MergeResult {
  readonly checkpoint: SyncCheckpoint | null;
  readonly auditEntry: SyncAuditEntry;
}
