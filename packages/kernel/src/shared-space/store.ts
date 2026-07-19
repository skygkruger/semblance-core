import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type {
  SharedSpaceConsentV1,
  SharedSpaceDepartureV1,
  SharedSpaceKeyRotationV1,
  SharedSpaceMembershipEventV1,
  SharedSpaceRecoveryV1,
  SharedSpaceRole,
} from '@semblance/protocol';
import {
  SharedSpaceConsentV1 as SharedSpaceConsentSchema,
  SharedSpaceDepartureV1 as SharedSpaceDepartureSchema,
  SharedSpaceKeyRotationV1 as SharedSpaceKeyRotationSchema,
  SharedSpaceMembershipEventV1 as SharedSpaceMembershipSchema,
  SharedSpaceRecoveryV1 as SharedSpaceRecoverySchema,
} from '@semblance/protocol';
import { canonicalizeRecord, hashHex, verifyPayload } from './crypto/ed25519.js';
import type { SharedSpaceMemberRecord, SharedSpaceRootRecord } from './types.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS shared_space_roots (
  shared_space_id TEXT PRIMARY KEY,
  shared_space_root_public_key TEXT NOT NULL,
  membership_epoch INTEGER NOT NULL,
  recovery_threshold INTEGER NOT NULL,
  recovery_total INTEGER NOT NULL,
  recovery_secret_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_space_members (
  member_id TEXT NOT NULL,
  shared_space_id TEXT NOT NULL,
  personal_root_id TEXT NOT NULL,
  member_public_key TEXT NOT NULL,
  role TEXT NOT NULL,
  consent_record_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  departed_at TEXT,
  epoch_added INTEGER NOT NULL,
  PRIMARY KEY (shared_space_id, member_id)
);

CREATE TABLE IF NOT EXISTS shared_space_consents (
  consent_record_id TEXT PRIMARY KEY,
  shared_space_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  consent_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_space_membership_events (
  event_hash TEXT PRIMARY KEY,
  shared_space_id TEXT NOT NULL,
  membership_epoch INTEGER NOT NULL,
  event_json TEXT NOT NULL,
  prior_event_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_space_key_rotations (
  rotation_id TEXT PRIMARY KEY,
  shared_space_id TEXT NOT NULL,
  membership_epoch INTEGER NOT NULL,
  rotation_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_space_departures (
  departure_id TEXT PRIMARY KEY,
  shared_space_id TEXT NOT NULL,
  membership_epoch INTEGER NOT NULL,
  departure_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_space_recoveries (
  recovery_id TEXT PRIMARY KEY,
  shared_space_id TEXT NOT NULL,
  membership_epoch INTEGER NOT NULL,
  recovery_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_space_members_active
  ON shared_space_members(shared_space_id, departed_at);
`;

export function computeMembershipEventHash(
  event: Omit<SharedSpaceMembershipEventV1, 'rootSignature'>,
): string {
  return hashHex(canonicalizeRecord(event as unknown as Record<string, unknown>));
}

export class SharedSpaceStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    const dir = join(dbPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  saveRoot(root: SharedSpaceRootRecord): void {
    this.db
      .prepare(
        `INSERT INTO shared_space_roots (
          shared_space_id, shared_space_root_public_key, membership_epoch,
          recovery_threshold, recovery_total, recovery_secret_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(shared_space_id) DO UPDATE SET
          shared_space_root_public_key = excluded.shared_space_root_public_key,
          membership_epoch = excluded.membership_epoch,
          recovery_threshold = excluded.recovery_threshold,
          recovery_total = excluded.recovery_total,
          recovery_secret_hash = excluded.recovery_secret_hash,
          updated_at = excluded.updated_at`,
      )
      .run(
        root.sharedSpaceId,
        root.sharedSpaceRootPublicKey,
        root.membershipEpoch,
        root.recoveryThreshold,
        root.recoveryTotal,
        root.recoverySecretHash,
        root.createdAt,
        root.updatedAt,
      );
  }

  getRoot(sharedSpaceId: string): SharedSpaceRootRecord | null {
    const row = this.db
      .prepare(
        `SELECT shared_space_id, shared_space_root_public_key, membership_epoch,
                recovery_threshold, recovery_total, recovery_secret_hash, created_at, updated_at
         FROM shared_space_roots WHERE shared_space_id = ?`,
      )
      .get(sharedSpaceId) as
      | {
          shared_space_id: string;
          shared_space_root_public_key: string;
          membership_epoch: number;
          recovery_threshold: number;
          recovery_total: number;
          recovery_secret_hash: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      sharedSpaceId: row.shared_space_id,
      sharedSpaceRootPublicKey: row.shared_space_root_public_key,
      membershipEpoch: row.membership_epoch,
      recoveryThreshold: row.recovery_threshold,
      recoveryTotal: row.recovery_total,
      recoverySecretHash: row.recovery_secret_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listRoots(): SharedSpaceRootRecord[] {
    const rows = this.db
      .prepare(
        `SELECT shared_space_id, shared_space_root_public_key, membership_epoch,
                recovery_threshold, recovery_total, recovery_secret_hash, created_at, updated_at
         FROM shared_space_roots ORDER BY created_at ASC`,
      )
      .all() as Array<{
        shared_space_id: string;
        shared_space_root_public_key: string;
        membership_epoch: number;
        recovery_threshold: number;
        recovery_total: number;
        recovery_secret_hash: string;
        created_at: string;
        updated_at: string;
      }>;
    return rows.map((row) => ({
      sharedSpaceId: row.shared_space_id,
      sharedSpaceRootPublicKey: row.shared_space_root_public_key,
      membershipEpoch: row.membership_epoch,
      recoveryThreshold: row.recovery_threshold,
      recoveryTotal: row.recovery_total,
      recoverySecretHash: row.recovery_secret_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  upsertMember(member: SharedSpaceMemberRecord & { sharedSpaceId: string }): void {
    this.db
      .prepare(
        `INSERT INTO shared_space_members (
          member_id, shared_space_id, personal_root_id, member_public_key, role,
          consent_record_id, joined_at, departed_at, epoch_added
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(shared_space_id, member_id) DO UPDATE SET
          personal_root_id = excluded.personal_root_id,
          member_public_key = excluded.member_public_key,
          role = excluded.role,
          consent_record_id = excluded.consent_record_id,
          departed_at = excluded.departed_at,
          epoch_added = excluded.epoch_added`,
      )
      .run(
        member.memberId,
        member.sharedSpaceId,
        member.personalRootId,
        member.memberPublicKey,
        member.role,
        member.consentRecordId,
        member.joinedAt,
        member.departedAt,
        member.epochAdded,
      );
  }

  getMember(sharedSpaceId: string, memberId: string): (SharedSpaceMemberRecord & { sharedSpaceId: string }) | null {
    const row = this.db
      .prepare(
        `SELECT member_id, shared_space_id, personal_root_id, member_public_key, role,
                consent_record_id, joined_at, departed_at, epoch_added
         FROM shared_space_members WHERE shared_space_id = ? AND member_id = ?`,
      )
      .get(sharedSpaceId, memberId) as
      | {
          member_id: string;
          shared_space_id: string;
          personal_root_id: string;
          member_public_key: string;
          role: string;
          consent_record_id: string;
          joined_at: string;
          departed_at: string | null;
          epoch_added: number;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      sharedSpaceId: row.shared_space_id,
      memberId: row.member_id,
      personalRootId: row.personal_root_id,
      memberPublicKey: row.member_public_key,
      role: row.role as SharedSpaceRole,
      consentRecordId: row.consent_record_id,
      joinedAt: row.joined_at,
      departedAt: row.departed_at,
      epochAdded: row.epoch_added,
    };
  }

  listMembers(sharedSpaceId: string, activeOnly: boolean): Array<SharedSpaceMemberRecord & { sharedSpaceId: string }> {
    const query = activeOnly
      ? `SELECT member_id, shared_space_id, personal_root_id, member_public_key, role,
                consent_record_id, joined_at, departed_at, epoch_added
         FROM shared_space_members WHERE shared_space_id = ? AND departed_at IS NULL`
      : `SELECT member_id, shared_space_id, personal_root_id, member_public_key, role,
                consent_record_id, joined_at, departed_at, epoch_added
         FROM shared_space_members WHERE shared_space_id = ?`;
    const rows = this.db.prepare(query).all(sharedSpaceId) as Array<{
      member_id: string;
      shared_space_id: string;
      personal_root_id: string;
      member_public_key: string;
      role: string;
      consent_record_id: string;
      joined_at: string;
      departed_at: string | null;
      epoch_added: number;
    }>;
    return rows.map((row) => ({
      sharedSpaceId: row.shared_space_id,
      memberId: row.member_id,
      personalRootId: row.personal_root_id,
      memberPublicKey: row.member_public_key,
      role: row.role as SharedSpaceRole,
      consentRecordId: row.consent_record_id,
      joinedAt: row.joined_at,
      departedAt: row.departed_at,
      epochAdded: row.epoch_added,
    }));
  }

  saveConsent(consent: SharedSpaceConsentV1): void {
    SharedSpaceConsentSchema.parse(consent);
    this.db
      .prepare(
        `INSERT INTO shared_space_consents (consent_record_id, shared_space_id, member_id, consent_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(consent_record_id) DO UPDATE SET consent_json = excluded.consent_json`,
      )
      .run(
        consent.consentRecordId,
        consent.sharedSpaceId,
        consent.memberId,
        JSON.stringify(consent),
      );
  }

  appendMembershipEvent(event: SharedSpaceMembershipEventV1, rootPublicKey: string): string {
    SharedSpaceMembershipSchema.parse(event);
    const unsigned = { ...event, rootSignature: undefined } as Omit<SharedSpaceMembershipEventV1, 'rootSignature'> & {
      rootSignature?: string;
    };
    delete unsigned.rootSignature;
    if (!verifyPayload(canonicalizeRecord(unsigned as unknown as Record<string, unknown>), event.rootSignature, rootPublicKey)) {
      throw new Error('Invalid shared-space membership event signature');
    }
    const eventHash = computeMembershipEventHash(unsigned as Omit<SharedSpaceMembershipEventV1, 'rootSignature'>);
    this.db
      .prepare(
        `INSERT INTO shared_space_membership_events (
          event_hash, shared_space_id, membership_epoch, event_json, prior_event_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        eventHash,
        event.sharedSpaceId,
        event.membershipEpoch,
        JSON.stringify(event),
        event.priorEventHash,
        event.occurredAt,
      );
    return eventHash;
  }

  getLatestMembershipEventHash(sharedSpaceId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT event_hash FROM shared_space_membership_events
         WHERE shared_space_id = ? ORDER BY membership_epoch DESC, created_at DESC LIMIT 1`,
      )
      .get(sharedSpaceId) as { event_hash: string } | undefined;
    return row?.event_hash ?? null;
  }

  saveKeyRotation(rotation: SharedSpaceKeyRotationV1): string {
    SharedSpaceKeyRotationSchema.parse(rotation);
    const rotationId = hashHex(
      `${rotation.sharedSpaceId}:${rotation.membershipEpoch}:${rotation.newMasterKeyFingerprint}`,
    );
    this.db
      .prepare(
        `INSERT INTO shared_space_key_rotations (
          rotation_id, shared_space_id, membership_epoch, rotation_json, created_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(rotation_id) DO UPDATE SET rotation_json = excluded.rotation_json`,
      )
      .run(
        rotationId,
        rotation.sharedSpaceId,
        rotation.membershipEpoch,
        JSON.stringify(rotation),
        rotation.occurredAt,
      );
    return rotationId;
  }

  saveDeparture(departure: SharedSpaceDepartureV1): void {
    SharedSpaceDepartureSchema.parse(departure);
    this.db
      .prepare(
        `INSERT INTO shared_space_departures (
          departure_id, shared_space_id, membership_epoch, departure_json, created_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(departure_id) DO UPDATE SET departure_json = excluded.departure_json`,
      )
      .run(
        departure.keyRotationId,
        departure.sharedSpaceId,
        departure.membershipEpoch,
        JSON.stringify(departure),
        departure.occurredAt,
      );
  }

  saveRecovery(recovery: SharedSpaceRecoveryV1): string {
    SharedSpaceRecoverySchema.parse(recovery);
    const recoveryId = hashHex(`${recovery.sharedSpaceId}:${recovery.membershipEpoch}:${recovery.newRootPublicKey}`);
    this.db
      .prepare(
        `INSERT INTO shared_space_recoveries (
          recovery_id, shared_space_id, membership_epoch, recovery_json, created_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(recovery_id) DO UPDATE SET recovery_json = excluded.recovery_json`,
      )
      .run(
        recoveryId,
        recovery.sharedSpaceId,
        recovery.membershipEpoch,
        JSON.stringify(recovery),
        recovery.occurredAt,
      );
    return recoveryId;
  }
}

export function openSharedSpaceStore(dataDir: string): SharedSpaceStore {
  return new SharedSpaceStore(join(dataDir, 'shared-spaces.db'));
}
