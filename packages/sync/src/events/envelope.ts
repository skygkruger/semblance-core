import { randomUUID } from 'node:crypto';
import {
  EncryptedEventEnvelopeV1,
  SyncEnvelopeV1,
} from '@semblance/protocol';
import {
  canonicalizeRecord,
  signPayload,
  verifyPayload,
} from '../crypto/ed25519.js';
import {
  decryptWithDomainKey,
  encryptWithDomainKey,
  loadEpochBoundDomainKey,
} from '../keys/domain-keys.js';
import type { SyncSecureStorageAdapter } from '../keys/secure-storage.js';
import type { VectorClock, VaultEventPlaintext } from './types.js';

export interface CreateVaultEventEnvelopeInput {
  readonly deviceId: string;
  readonly devicePrivateKey: string;
  readonly membershipEpoch: number;
  readonly domainId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly causalParentIds?: readonly string[];
  readonly lamportClock: number;
  readonly vectorClock: VectorClock;
  readonly occurredAt?: string;
  readonly secureStorage: SyncSecureStorageAdapter;
}

export interface DecryptVaultEventEnvelopeInput {
  readonly envelope: EncryptedEventEnvelopeV1;
  readonly devicePublicKeys: ReadonlyMap<string, string>;
  readonly secureStorage: SyncSecureStorageAdapter;
  readonly minMembershipEpoch?: number;
}

function buildPlaintext(input: {
  eventType: string;
  payload: unknown;
  occurredAt: string;
}): VaultEventPlaintext {
  return {
    eventType: input.eventType,
    payload: input.payload,
    occurredAt: input.occurredAt,
  };
}

function unsignedEnvelopeFields(
  input: Omit<CreateVaultEventEnvelopeInput, 'devicePrivateKey' | 'secureStorage' | 'eventType' | 'payload'> & {
    eventId: string;
    ciphertext: string;
    occurredAt: string;
  },
): Omit<EncryptedEventEnvelopeV1, 'signature'> {
  return {
    schemaVersion: 1,
    eventId: input.eventId,
    deviceId: input.deviceId,
    membershipEpoch: input.membershipEpoch,
    domainId: input.domainId,
    causalParentIds: [...(input.causalParentIds ?? [])],
    lamportClock: input.lamportClock,
    vectorClock: { ...input.vectorClock },
    ciphertext: input.ciphertext,
  };
}

export async function createSignedEncryptedVaultEvent(
  input: CreateVaultEventEnvelopeInput,
): Promise<SyncEnvelopeV1> {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const plaintext = buildPlaintext({
    eventType: input.eventType,
    payload: input.payload,
    occurredAt,
  });

  const domainKey = await loadEpochBoundDomainKey(
    input.secureStorage,
    input.domainId,
    input.membershipEpoch,
  );
  const ciphertext = encryptWithDomainKey(JSON.stringify(plaintext), domainKey);
  const eventId = `evt-${randomUUID()}`;

  const unsigned = unsignedEnvelopeFields({
    ...input,
    eventId,
    ciphertext,
    occurredAt,
  });

  const signature = signPayload(
    canonicalizeRecord(unsigned as unknown as Record<string, unknown>),
    input.devicePrivateKey,
  );

  const payload: EncryptedEventEnvelopeV1 = {
    ...unsigned,
    signature,
  };

  EncryptedEventEnvelopeV1.parse(payload);

  return {
    schemaVersion: 1,
    envelopeKind: 'encrypted_event',
    payload,
  };
}

export function wrapEncryptedEventEnvelope(payload: EncryptedEventEnvelopeV1): SyncEnvelopeV1 {
  EncryptedEventEnvelopeV1.parse(payload);
  return {
    schemaVersion: 1,
    envelopeKind: 'encrypted_event',
    payload,
  };
}

export async function decryptAndVerifyVaultEvent(
  input: DecryptVaultEventEnvelopeInput,
): Promise<VaultEventPlaintext> {
  const envelope = EncryptedEventEnvelopeV1.parse(input.envelope);

  if (input.minMembershipEpoch !== undefined && envelope.membershipEpoch < input.minMembershipEpoch) {
    throw new Error(
      `Rejected event from revoked epoch ${envelope.membershipEpoch}; minimum epoch is ${input.minMembershipEpoch}`,
    );
  }

  const devicePublicKey = input.devicePublicKeys.get(envelope.deviceId);
  if (!devicePublicKey) {
    throw new Error(`Unknown device public key for ${envelope.deviceId}`);
  }

  const { signature, ...unsigned } = envelope;
  const canonical = canonicalizeRecord(unsigned as unknown as Record<string, unknown>);
  if (!verifyPayload(canonical, signature, devicePublicKey)) {
    throw new Error(`Vault event signature verification failed for ${envelope.eventId}`);
  }

  const domainKey = await loadEpochBoundDomainKey(
    input.secureStorage,
    envelope.domainId,
    envelope.membershipEpoch,
  );

  const decrypted = decryptWithDomainKey(envelope.ciphertext, domainKey);
  return JSON.parse(decrypted) as VaultEventPlaintext;
}

export function computeNextVectorClock(
  localClock: VectorClock,
  remoteClock: VectorClock,
  deviceId: string,
): VectorClock {
  const merged: VectorClock = { ...localClock };
  for (const [peerId, peerTime] of Object.entries(remoteClock)) {
    merged[peerId] = Math.max(merged[peerId] ?? 0, peerTime);
  }
  merged[deviceId] = (merged[deviceId] ?? 0) + 1;
  return merged;
}

export function computeNextLamportClock(
  localLamport: number,
  parentLamports: readonly number[],
): number {
  const maxParent = parentLamports.length > 0 ? Math.max(...parentLamports) : 0;
  return Math.max(localLamport, maxParent) + 1;
}

export {
  EncryptedEventEnvelopeV1,
  SyncEnvelopeV1,
};
