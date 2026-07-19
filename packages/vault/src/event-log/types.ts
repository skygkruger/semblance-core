import { createHash, createHmac } from 'node:crypto';
import {
  VaultEventV1,
  type SourceRefV1,
  type SensitivityLevel,
  type VaultEventType,
} from '@semblance/protocol';

export const VAULT_EVENT_GENESIS_HASH = sha256('semblance-vault-event-genesis');
export const VAULT_EVENT_SIGNATURE_PREFIX = 'hmac-sha256:';

export interface StoredVaultEventRow {
  sequence: number;
  eventId: string;
  dataDomain: string;
  deviceId: string;
  membershipEpoch: number;
  eventType: VaultEventType;
  sourceRefs: SourceRefV1[];
  sensitivity: SensitivityLevel;
  occurredAt: string;
  payloadCiphertext: string;
  signature: string;
  chainHash: string;
}

export interface VaultEventAppendInput {
  eventId: string;
  dataDomain: string;
  deviceId: string;
  membershipEpoch: number;
  eventType: VaultEventType;
  sourceRefs: SourceRefV1[];
  sensitivity: SensitivityLevel;
  occurredAt: string;
  payloadPlaintext: string;
}

export interface VaultEventReadResult {
  sequence: number;
  event: VaultEventV1;
  payloadPlaintext: string;
  dataDomain: string;
  chainHash: string;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(',')}}`;
}

export function canonicalizeVaultEventForSigning(
  event: Omit<VaultEventV1, 'signature'>,
): string {
  return canonicalJson({
    schemaVersion: event.schemaVersion,
    eventId: event.eventId,
    deviceId: event.deviceId,
    membershipEpoch: event.membershipEpoch,
    eventType: event.eventType,
    sourceRefs: event.sourceRefs,
    sensitivity: event.sensitivity,
    occurredAt: event.occurredAt,
    payloadCiphertext: event.payloadCiphertext,
  });
}

export function signVaultEvent(
  event: Omit<VaultEventV1, 'signature'>,
  signingKey: Buffer,
): string {
  const canonical = canonicalizeVaultEventForSigning(event);
  const digest = createHmac('sha256', signingKey).update(canonical, 'utf-8').digest('base64');
  return `${VAULT_EVENT_SIGNATURE_PREFIX}${digest}`;
}

export function verifyVaultEventSignature(event: VaultEventV1, signingKey: Buffer): boolean {
  const { signature, ...unsigned } = event;
  const expected = signVaultEvent(unsigned, signingKey);
  return signature === expected;
}

export function computeVaultEventChainHash(
  previousChainHash: string,
  event: Pick<VaultEventV1, 'eventId' | 'signature' | 'payloadCiphertext'>,
): string {
  return sha256(
    `${previousChainHash}|${event.eventId}|${event.signature}|${event.payloadCiphertext}`,
  );
}

export function rowToVaultEvent(row: StoredVaultEventRow): VaultEventV1 {
  return VaultEventV1.parse({
    schemaVersion: 1,
    eventId: row.eventId,
    deviceId: row.deviceId,
    membershipEpoch: row.membershipEpoch,
    eventType: row.eventType,
    sourceRefs: row.sourceRefs,
    sensitivity: row.sensitivity,
    occurredAt: row.occurredAt,
    payloadCiphertext: row.payloadCiphertext,
    signature: row.signature,
  });
}

export interface VaultEventLogRowRecord {
  sequence: number;
  event_id: string;
  data_domain: string;
  device_id: string;
  membership_epoch: number;
  event_type: string;
  source_refs_json: string;
  sensitivity: string;
  occurred_at: string;
  payload_ciphertext: string;
  signature: string;
  chain_hash: string;
}

export function mapRowRecord(row: VaultEventLogRowRecord): StoredVaultEventRow {
  return {
    sequence: row.sequence,
    eventId: row.event_id,
    dataDomain: row.data_domain,
    deviceId: row.device_id,
    membershipEpoch: row.membership_epoch,
    eventType: row.event_type as VaultEventType,
    sourceRefs: JSON.parse(row.source_refs_json) as SourceRefV1[],
    sensitivity: row.sensitivity as SensitivityLevel,
    occurredAt: row.occurred_at,
    payloadCiphertext: row.payload_ciphertext,
    signature: row.signature,
    chainHash: row.chain_hash,
  };
}
