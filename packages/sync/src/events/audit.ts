import { createHash, randomUUID } from 'node:crypto';
import {
  canonicalizeRecord,
  hashHex,
  signPayload,
  verifyPayload,
} from '../crypto/ed25519.js';
import type { SyncAuditEntry, SyncCheckpoint } from './types.js';

export interface AppendAuditEntryInput {
  readonly sequence: number;
  readonly operation: SyncAuditEntry['operation'];
  readonly eventIds: readonly string[];
  readonly priorChainHash: string;
  readonly devicePrivateKey: string;
  readonly occurredAt?: string;
}

export interface CreateCheckpointInput {
  readonly deviceId: string;
  readonly auditChainHash: string;
  readonly eventCount: number;
  readonly membershipEpoch: number;
  readonly devicePrivateKey: string;
  readonly createdAt?: string;
}

const GENESIS_HASH = hashHex('semblance-sync-audit-genesis');

export function getAuditGenesisHash(): string {
  return GENESIS_HASH;
}

function computeAuditChainHash(entry: Omit<SyncAuditEntry, 'chainHash' | 'deviceSignature'>): string {
  return hashHex(
    canonicalizeRecord({
      sequence: entry.sequence,
      operation: entry.operation,
      eventIds: [...entry.eventIds].sort(),
      priorChainHash: entry.priorChainHash,
      occurredAt: entry.occurredAt,
    }),
  );
}

export function appendSignedAuditEntry(input: AppendAuditEntryInput): SyncAuditEntry {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const unsigned = {
    sequence: input.sequence,
    operation: input.operation,
    eventIds: [...input.eventIds].sort(),
    priorChainHash: input.priorChainHash,
    occurredAt,
  };

  const chainHash = computeAuditChainHash(unsigned);
  const deviceSignature = signPayload(chainHash, input.devicePrivateKey);

  return {
    ...unsigned,
    chainHash,
    deviceSignature,
  };
}

export function verifyAuditEntry(
  entry: SyncAuditEntry,
  expectedPriorHash: string,
  devicePublicKey: string,
): boolean {
  if (entry.priorChainHash !== expectedPriorHash) {
    return false;
  }

  const recomputed = computeAuditChainHash({
    sequence: entry.sequence,
    operation: entry.operation,
    eventIds: entry.eventIds,
    priorChainHash: entry.priorChainHash,
    occurredAt: entry.occurredAt,
  });

  if (recomputed !== entry.chainHash) {
    return false;
  }

  return verifyPayload(entry.chainHash, entry.deviceSignature, devicePublicKey);
}

export function verifyAuditChain(
  entries: readonly SyncAuditEntry[],
  devicePublicKey: string,
): boolean {
  let priorHash = GENESIS_HASH;

  for (const entry of entries) {
    if (!verifyAuditEntry(entry, priorHash, devicePublicKey)) {
      return false;
    }
    priorHash = entry.chainHash;
  }

  return true;
}

export function createSignedCheckpoint(input: CreateCheckpointInput): SyncCheckpoint {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const checkpointId = `chk-${randomUUID()}`;
  const unsigned = {
    checkpointId,
    deviceId: input.deviceId,
    auditChainHash: input.auditChainHash,
    eventCount: input.eventCount,
    membershipEpoch: input.membershipEpoch,
    createdAt,
  };

  const signature = signPayload(
    canonicalizeRecord(unsigned as unknown as Record<string, unknown>),
    input.devicePrivateKey,
  );

  return {
    ...unsigned,
    signature,
  };
}

export function verifyCheckpoint(
  checkpoint: SyncCheckpoint,
  devicePublicKey: string,
): boolean {
  const { signature, ...unsigned } = checkpoint;
  const canonical = canonicalizeRecord(unsigned as unknown as Record<string, unknown>);
  return verifyPayload(canonical, signature, devicePublicKey);
}

export function checkpointDigest(checkpoint: SyncCheckpoint): string {
  return createHash('sha256')
    .update(
      canonicalizeRecord({
        checkpointId: checkpoint.checkpointId,
        auditChainHash: checkpoint.auditChainHash,
        eventCount: checkpoint.eventCount,
        membershipEpoch: checkpoint.membershipEpoch,
      }),
    )
    .digest('hex');
}

export function latestAuditChainHash(entries: readonly SyncAuditEntry[]): string {
  if (entries.length === 0) {
    return GENESIS_HASH;
  }
  return entries[entries.length - 1]!.chainHash;
}
