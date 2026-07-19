import type { EncryptedEventEnvelopeV1, SyncEnvelopeV1 } from '@semblance/protocol';
import { z } from 'zod';
import { canonicalizeRecord, hashHex } from '../crypto/ed25519.js';

export const SYNC_RELAY_GENESIS_HEAD = hashHex('sync-relay-genesis');

export const FORBIDDEN_RELAY_PLAINTEXT_FIELDS = [
  'accountId',
  'customerId',
  'memberId',
  'userId',
  'email',
  'taskId',
  'requestId',
  'subagentId',
  'serial',
  'plaintext',
  'content',
  'body',
  'messages',
  'prompt',
  'ciphertext',
] as const;

export const ciphertextEnvelopeBlobSchema = z
  .object({
    blobId: z.string().length(64),
    deviceEpochHash: z.string().length(64),
    envelopeBlob: z.string().min(1),
    blobHash: z.string().length(64),
    lamportClock: z.number().int().nonnegative(),
  })
  .strict();

export type CiphertextEnvelopeBlob = z.infer<typeof ciphertextEnvelopeBlobSchema>;

export const syncRelayPushRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    rootIdHash: z.string().length(64),
    deviceEpochHash: z.string().length(64),
    batchId: z.string().min(1),
    blobs: z.array(ciphertextEnvelopeBlobSchema),
    batchMerkleRoot: z.string().length(64),
    priorHeadHash: z.string().length(64),
  })
  .strict();

export type SyncRelayPushRequest = z.infer<typeof syncRelayPushRequestSchema>;

export const syncRelayPushResponseSchema = z
  .object({
    accepted: z.number().int().nonnegative(),
    headHash: z.string().length(64),
    rejectedBlobIds: z.array(z.string()),
  })
  .strict();

export type SyncRelayPushResponse = z.infer<typeof syncRelayPushResponseSchema>;

export const syncRelayPullRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    rootIdHash: z.string().length(64),
    deviceEpochHash: z.string().length(64),
    sinceLamport: z.number().int().nonnegative().optional(),
    knownHeadHash: z.string().length(64),
  })
  .strict();

export type SyncRelayPullRequest = z.infer<typeof syncRelayPullRequestSchema>;

export const syncRelayPullResponseSchema = z
  .object({
    blobs: z.array(ciphertextEnvelopeBlobSchema),
    headHash: z.string().length(64),
    merkleRoot: z.string().length(64),
  })
  .strict();

export type SyncRelayPullResponse = z.infer<typeof syncRelayPullResponseSchema>;

export const syncRelayExchangeRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    push: syncRelayPushRequestSchema.optional(),
    pull: syncRelayPullRequestSchema.optional(),
  })
  .strict();

export type SyncRelayExchangeRequest = z.infer<typeof syncRelayExchangeRequestSchema>;

export const syncRelayExchangeResponseSchema = z
  .object({
    push: syncRelayPushResponseSchema.optional(),
    pull: syncRelayPullResponseSchema.optional(),
  })
  .strict();

export type SyncRelayExchangeResponse = z.infer<typeof syncRelayExchangeResponseSchema>;

export type SyncRelayIntegrityCode = 'replay' | 'substitution' | 'fork' | 'deletion';

export class SyncRelayIntegrityError extends Error {
  readonly code: SyncRelayIntegrityCode;

  constructor(code: SyncRelayIntegrityCode, message: string) {
    super(message);
    this.name = 'SyncRelayIntegrityError';
    this.code = code;
  }
}

export function assertRelayMessageHasNoPlaintextFields(raw: Record<string, unknown>): void {
  for (const field of FORBIDDEN_RELAY_PLAINTEXT_FIELDS) {
    if (field in raw) {
      throw new Error(`sync_relay_forbidden_field:${field}`);
    }
  }
}

export function computeRootIdHash(rootId: string): string {
  return hashHex(canonicalizeRecord({ rootId }));
}

export function computeDeviceEpochHash(
  rootId: string,
  membershipEpoch: number,
  deviceId: string,
): string {
  return hashHex(canonicalizeRecord({ rootId, membershipEpoch, deviceId }));
}

export function computeBlobId(deviceEpochHash: string, eventId: string): string {
  return hashHex(canonicalizeRecord({ deviceEpochHash, eventId }));
}

export function computeBatchMerkleRoot(blobHashes: readonly string[]): string {
  if (blobHashes.length === 0) {
    return hashHex('empty-batch');
  }
  const sorted = [...blobHashes].sort();
  let level = sorted.map((hash) => hashHex(hash));
  while (level.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index]!;
      const right = level[index + 1] ?? left;
      next.push(hashHex(left + right));
    }
    level = next;
  }
  return level[0]!;
}

export function computeHeadHash(priorHeadHash: string, blobHashes: readonly string[]): string {
  return hashHex(
    canonicalizeRecord({
      priorHeadHash,
      blobHashes: [...blobHashes].sort(),
    }),
  );
}

export function extractEventId(envelope: SyncEnvelopeV1): string {
  if (envelope.envelopeKind === 'encrypted_event') {
    return (envelope.payload as EncryptedEventEnvelopeV1).eventId;
  }
  return hashHex(JSON.stringify(envelope));
}

export function extractLamportClock(envelope: SyncEnvelopeV1): number {
  if (envelope.envelopeKind === 'encrypted_event') {
    return (envelope.payload as EncryptedEventEnvelopeV1).lamportClock;
  }
  return 0;
}

export function encodeEnvelopeBlob(
  envelope: SyncEnvelopeV1,
  deviceEpochHash: string,
): CiphertextEnvelopeBlob {
  const envelopeBlob = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
  const blobHash = hashHex(envelopeBlob);
  const eventId = extractEventId(envelope);
  return {
    blobId: computeBlobId(deviceEpochHash, eventId),
    deviceEpochHash,
    envelopeBlob,
    blobHash,
    lamportClock: extractLamportClock(envelope),
  };
}

export function decodeEnvelopeBlob(blob: CiphertextEnvelopeBlob): SyncEnvelopeV1 {
  assertNoSubstitution(blob);
  const serialized = Buffer.from(blob.envelopeBlob, 'base64url').toString('utf8');
  return JSON.parse(serialized) as SyncEnvelopeV1;
}

export function assertNoSubstitution(blob: CiphertextEnvelopeBlob): void {
  ciphertextEnvelopeBlobSchema.parse(blob);
  if (hashHex(blob.envelopeBlob) !== blob.blobHash) {
    throw new SyncRelayIntegrityError('substitution', `blob_hash_mismatch:${blob.blobId}`);
  }
}

export function assertNoReplay(blobId: string, seenBlobIds: ReadonlySet<string>): void {
  if (seenBlobIds.has(blobId)) {
    throw new SyncRelayIntegrityError('replay', `replay_detected:${blobId}`);
  }
}

export function assertNoFork(
  localHeadHash: string,
  remotePriorHeadHash: string,
): void {
  if (remotePriorHeadHash !== localHeadHash) {
    throw new SyncRelayIntegrityError(
      'fork',
      `head_hash_fork:local=${localHeadHash}:remote_prior=${remotePriorHeadHash}`,
    );
  }
}

export function assertNoDeletion(
  knownBlobIds: ReadonlySet<string>,
  remoteBlobIds: ReadonlySet<string>,
): void {
  for (const blobId of knownBlobIds) {
    if (!remoteBlobIds.has(blobId)) {
      throw new SyncRelayIntegrityError('deletion', `missing_blob:${blobId}`);
    }
  }
}

export function verifyPullHeadChain(
  knownHeadHash: string,
  responseHeadHash: string,
  priorHeadBeforePull: string,
): void {
  if (knownHeadHash !== priorHeadBeforePull && responseHeadHash !== knownHeadHash) {
    throw new SyncRelayIntegrityError(
      'fork',
      `pull_head_mismatch:known=${knownHeadHash}:response=${responseHeadHash}`,
    );
  }
}
