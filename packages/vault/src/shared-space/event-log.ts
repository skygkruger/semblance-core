import Database from 'better-sqlite3';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const SHARED_SPACE_EVENT_GENESIS_HASH = sha256('semblance-shared-space-event-genesis');
export const SHARED_SPACE_EVENT_SIGNATURE_PREFIX = 'hmac-sha256:';

export const SHARED_SPACE_EVENT_LOG_SCHEMA = `
  CREATE TABLE IF NOT EXISTS shared_space_event_log (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    shared_space_id TEXT NOT NULL,
    event_id TEXT NOT NULL UNIQUE,
    publisher_member_id TEXT NOT NULL,
    membership_epoch INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    source_personal_record_id TEXT,
    payload_ciphertext TEXT NOT NULL,
    signature TEXT NOT NULL,
    chain_hash TEXT NOT NULL,
    occurred_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_shared_space_event_log_space
    ON shared_space_event_log(shared_space_id, sequence);

  CREATE TABLE IF NOT EXISTS shared_space_event_log_meta (
    shared_space_id TEXT PRIMARY KEY,
    event_count INTEGER NOT NULL,
    tip_chain_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shared_space_pending_approvals (
    action_id TEXT PRIMARY KEY,
    shared_space_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    scope TEXT NOT NULL,
    actor_member_id TEXT NOT NULL,
    target_member_id TEXT,
    intent_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shared_space_approvals (
    action_id TEXT NOT NULL,
    approver_member_id TEXT NOT NULL,
    approved_at TEXT NOT NULL,
    PRIMARY KEY (action_id, approver_member_id)
  );
`;

export interface SharedSpaceEventAppendInput {
  readonly sharedSpaceId: string;
  readonly eventId?: string;
  readonly publisherMemberId: string;
  readonly membershipEpoch: number;
  readonly eventType: 'published_record' | 'shared_delete' | 'legal_hold';
  readonly sourcePersonalRecordId: string | null;
  readonly payloadPlaintext: string;
  readonly occurredAt?: string;
}

export interface SharedSpaceStoredEvent {
  readonly sequence: number;
  readonly sharedSpaceId: string;
  readonly eventId: string;
  readonly publisherMemberId: string;
  readonly membershipEpoch: number;
  readonly eventType: string;
  readonly sourcePersonalRecordId: string | null;
  readonly payloadPlaintext: string;
  readonly occurredAt: string;
  readonly chainHash: string;
}

export interface SharedSpaceEventLogRow {
  sequence: number;
  shared_space_id: string;
  event_id: string;
  publisher_member_id: string;
  membership_epoch: number;
  event_type: string;
  source_personal_record_id: string | null;
  payload_ciphertext: string;
  signature: string;
  chain_hash: string;
  occurred_at: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function deriveSharedSpaceSigningKey(sharedSpaceRootKey: Buffer): Buffer {
  return createHmac('sha256', sharedSpaceRootKey)
    .update('semblance-shared-space-event-signing-v1', 'utf-8')
    .digest();
}

function deriveSharedSpacePayloadKey(sharedSpaceRootKey: Buffer, sharedSpaceId: string): Buffer {
  return createHmac('sha256', sharedSpaceRootKey)
    .update(`semblance-shared-space-payload:${sharedSpaceId}`, 'utf-8')
    .digest();
}

function encryptPayload(sharedSpaceRootKey: Buffer, sharedSpaceId: string, plaintext: string): string {
  const key = deriveSharedSpacePayloadKey(sharedSpaceRootKey, sharedSpaceId);
  const digest = createHmac('sha256', key).update(plaintext, 'utf-8').digest('base64');
  return `hmac-payload:${digest}:${Buffer.from(plaintext, 'utf-8').toString('base64')}`;
}

function decryptPayload(sharedSpaceRootKey: Buffer, sharedSpaceId: string, ciphertext: string): string {
  const prefix = 'hmac-payload:';
  if (!ciphertext.startsWith(prefix)) {
    throw new Error('Invalid shared-space payload ciphertext');
  }
  const parts = ciphertext.slice(prefix.length).split(':');
  if (parts.length < 2) {
    throw new Error('Invalid shared-space payload ciphertext format');
  }
  const digest = parts[0];
  const encoded = parts.slice(1).join(':');
  const plaintext = Buffer.from(encoded, 'base64').toString('utf-8');
  const key = deriveSharedSpacePayloadKey(sharedSpaceRootKey, sharedSpaceId);
  const expected = createHmac('sha256', key).update(plaintext, 'utf-8').digest('base64');
  if (digest !== expected) {
    throw new Error('Shared-space payload integrity check failed');
  }
  return plaintext;
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
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function signSharedEvent(
  event: {
    eventId: string;
    sharedSpaceId: string;
    publisherMemberId: string;
    membershipEpoch: number;
    eventType: string;
    sourcePersonalRecordId: string | null;
    payloadCiphertext: string;
    occurredAt: string;
  },
  signingKey: Buffer,
): string {
  const canonical = canonicalJson(event);
  const digest = createHmac('sha256', signingKey).update(canonical, 'utf-8').digest('base64');
  return `${SHARED_SPACE_EVENT_SIGNATURE_PREFIX}${digest}`;
}

function computeChainHash(
  previousChainHash: string,
  event: { eventId: string; signature: string; payloadCiphertext: string },
): string {
  return sha256(`${previousChainHash}|${event.eventId}|${event.signature}|${event.payloadCiphertext}`);
}

export class SharedSpaceEventLog {
  private readonly db: Database.Database;
  private readonly signingKey: Buffer;
  private readonly sharedSpaceRootKey: Buffer;

  constructor(db: Database.Database, sharedSpaceRootKey: Buffer) {
    this.db = db;
    this.sharedSpaceRootKey = sharedSpaceRootKey;
    this.signingKey = deriveSharedSpaceSigningKey(sharedSpaceRootKey);
    this.db.exec(SHARED_SPACE_EVENT_LOG_SCHEMA);
  }

  private getTipChainHash(sharedSpaceId: string): string {
    const row = this.db
      .prepare('SELECT tip_chain_hash FROM shared_space_event_log_meta WHERE shared_space_id = ?')
      .get(sharedSpaceId) as { tip_chain_hash: string } | undefined;
    return row?.tip_chain_hash ?? SHARED_SPACE_EVENT_GENESIS_HASH;
  }

  append(input: SharedSpaceEventAppendInput): SharedSpaceStoredEvent {
    const eventId = input.eventId ?? `sspace-event-${randomUUID()}`;
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const payloadCiphertext = encryptPayload(
      this.sharedSpaceRootKey,
      input.sharedSpaceId,
      input.payloadPlaintext,
    );

    const unsigned = {
      eventId,
      sharedSpaceId: input.sharedSpaceId,
      publisherMemberId: input.publisherMemberId,
      membershipEpoch: input.membershipEpoch,
      eventType: input.eventType,
      sourcePersonalRecordId: input.sourcePersonalRecordId,
      payloadCiphertext,
      occurredAt,
    };
    const signature = signSharedEvent(unsigned, this.signingKey);
    const previousChainHash = this.getTipChainHash(input.sharedSpaceId);
    const chainHash = computeChainHash(previousChainHash, {
      eventId,
      signature,
      payloadCiphertext,
    });

    const result = this.db.prepare(`
      INSERT INTO shared_space_event_log (
        shared_space_id, event_id, publisher_member_id, membership_epoch, event_type,
        source_personal_record_id, payload_ciphertext, signature, chain_hash, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.sharedSpaceId,
      eventId,
      input.publisherMemberId,
      input.membershipEpoch,
      input.eventType,
      input.sourcePersonalRecordId,
      payloadCiphertext,
      signature,
      chainHash,
      occurredAt,
    );

    this.db.prepare(`
      INSERT INTO shared_space_event_log_meta (shared_space_id, event_count, tip_chain_hash, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(shared_space_id) DO UPDATE SET
        event_count = excluded.event_count,
        tip_chain_hash = excluded.tip_chain_hash,
        updated_at = excluded.updated_at
    `).run(input.sharedSpaceId, Number(result.lastInsertRowid), chainHash);

    return {
      sequence: Number(result.lastInsertRowid),
      sharedSpaceId: input.sharedSpaceId,
      eventId,
      publisherMemberId: input.publisherMemberId,
      membershipEpoch: input.membershipEpoch,
      eventType: input.eventType,
      sourcePersonalRecordId: input.sourcePersonalRecordId,
      payloadPlaintext: input.payloadPlaintext,
      occurredAt,
      chainHash,
    };
  }

  listEvents(sharedSpaceId: string): SharedSpaceStoredEvent[] {
    const rows = this.db.prepare(`
      SELECT sequence, shared_space_id, event_id, publisher_member_id, membership_epoch,
             event_type, source_personal_record_id, payload_ciphertext, signature, chain_hash, occurred_at
      FROM shared_space_event_log
      WHERE shared_space_id = ?
      ORDER BY sequence ASC
    `).all(sharedSpaceId) as SharedSpaceEventLogRow[];

    return rows.map((row) => ({
      sequence: row.sequence,
      sharedSpaceId: row.shared_space_id,
      eventId: row.event_id,
      publisherMemberId: row.publisher_member_id,
      membershipEpoch: row.membership_epoch,
      eventType: row.event_type,
      sourcePersonalRecordId: row.source_personal_record_id,
      payloadPlaintext: decryptPayload(this.sharedSpaceRootKey, row.shared_space_id, row.payload_ciphertext),
      occurredAt: row.occurred_at,
      chainHash: row.chain_hash,
    }));
  }

  savePendingApproval(input: {
    actionId: string;
    sharedSpaceId: string;
    actionType: string;
    scope: string;
    actorMemberId: string;
    targetMemberId?: string;
    intentJson: string;
  }): void {
    this.db.prepare(`
      INSERT INTO shared_space_pending_approvals (
        action_id, shared_space_id, action_type, scope, actor_member_id, target_member_id, intent_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(action_id) DO UPDATE SET
        intent_json = excluded.intent_json
    `).run(
      input.actionId,
      input.sharedSpaceId,
      input.actionType,
      input.scope,
      input.actorMemberId,
      input.targetMemberId ?? null,
      input.intentJson,
    );
  }

  getPendingApproval(actionId: string): {
    actionId: string;
    sharedSpaceId: string;
    actionType: string;
    scope: string;
    actorMemberId: string;
    targetMemberId: string | null;
    intentJson: string;
  } | null {
    const row = this.db.prepare(`
      SELECT action_id, shared_space_id, action_type, scope, actor_member_id, target_member_id, intent_json
      FROM shared_space_pending_approvals
      WHERE action_id = ?
    `).get(actionId) as {
      action_id: string;
      shared_space_id: string;
      action_type: string;
      scope: string;
      actor_member_id: string;
      target_member_id: string | null;
      intent_json: string;
    } | undefined;
    if (!row) {
      return null;
    }
    return {
      actionId: row.action_id,
      sharedSpaceId: row.shared_space_id,
      actionType: row.action_type,
      scope: row.scope,
      actorMemberId: row.actor_member_id,
      targetMemberId: row.target_member_id,
      intentJson: row.intent_json,
    };
  }

  recordApproval(actionId: string, approverMemberId: string, approvedAt: string): void {
    this.db.prepare(`
      INSERT INTO shared_space_approvals (action_id, approver_member_id, approved_at)
      VALUES (?, ?, ?)
      ON CONFLICT(action_id, approver_member_id) DO NOTHING
    `).run(actionId, approverMemberId, approvedAt);
  }

  listApprovals(actionId: string): Array<{ approverMemberId: string; approvedAt: string }> {
    const rows = this.db.prepare(`
      SELECT approver_member_id, approved_at
      FROM shared_space_approvals
      WHERE action_id = ?
      ORDER BY approved_at ASC
    `).all(actionId) as Array<{ approver_member_id: string; approved_at: string }>;
    return rows.map((row) => ({
      approverMemberId: row.approver_member_id,
      approvedAt: row.approved_at,
    }));
  }

  deletePendingApproval(actionId: string): void {
    this.db.prepare('DELETE FROM shared_space_pending_approvals WHERE action_id = ?').run(actionId);
    this.db.prepare('DELETE FROM shared_space_approvals WHERE action_id = ?').run(actionId);
  }
}

export function openSharedSpaceEventLog(dataDir: string, sharedSpaceRootKey: Buffer): SharedSpaceEventLog {
  const dir = join(dataDir, 'shared-space-vault');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const db = new Database(join(dir, 'shared-events.db'));
  return new SharedSpaceEventLog(db, sharedSpaceRootKey);
}

export function createInMemorySharedSpaceEventLog(sharedSpaceRootKey: Buffer): SharedSpaceEventLog {
  const db = new Database(':memory:');
  return new SharedSpaceEventLog(db, sharedSpaceRootKey);
}
