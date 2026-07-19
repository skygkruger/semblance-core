import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { DeviceMembershipEventV1 } from '@semblance/protocol';
import { DeviceMembershipEventV1 as DeviceMembershipEventSchema } from '@semblance/protocol';
import {
  canonicalizeRecord,
  verifyPayload,
} from '../crypto/ed25519.js';
import type { DeviceRole, SovereigntyRootRecord, SyncDeviceRecord } from '../types.js';
import { computeMembershipEventHash } from './event.js';

const MEMBERSHIP_SCHEMA = `
CREATE TABLE IF NOT EXISTS sovereignty_root (
  root_id TEXT PRIMARY KEY,
  owner_device_id TEXT NOT NULL,
  membership_epoch INTEGER NOT NULL,
  root_public_key TEXT NOT NULL,
  recovery_threshold INTEGER NOT NULL,
  recovery_total INTEGER NOT NULL,
  prior_root_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS membership_devices (
  device_id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  role TEXT NOT NULL,
  enrolled_at TEXT NOT NULL,
  revoked_at TEXT,
  epoch_added INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS membership_events (
  event_hash TEXT PRIMARY KEY,
  membership_epoch INTEGER NOT NULL,
  event_json TEXT NOT NULL,
  prior_event_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_membership_events_epoch ON membership_events(membership_epoch);
`;

export class MembershipEpochConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MembershipEpochConflictError';
  }
}

export class MembershipStore {
  private readonly db: Database.Database;

  constructor(private readonly dbPath: string) {
    const dir = join(dbPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(MEMBERSHIP_SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  getRoot(): SovereigntyRootRecord | null {
    const row = this.db
      .prepare(
        `SELECT root_id, owner_device_id, membership_epoch, root_public_key,
                recovery_threshold, recovery_total, prior_root_hash, created_at, updated_at
         FROM sovereignty_root LIMIT 1`,
      )
      .get() as
      | {
          root_id: string;
          owner_device_id: string;
          membership_epoch: number;
          root_public_key: string;
          recovery_threshold: number;
          recovery_total: number;
          prior_root_hash: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      rootId: row.root_id,
      ownerDeviceId: row.owner_device_id,
      membershipEpoch: row.membership_epoch,
      rootPublicKey: row.root_public_key,
      recoveryThreshold: row.recovery_threshold,
      recoveryTotal: row.recovery_total,
      priorRootHash: row.prior_root_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  saveRoot(record: SovereigntyRootRecord): void {
    this.db
      .prepare(
        `INSERT INTO sovereignty_root (
          root_id, owner_device_id, membership_epoch, root_public_key,
          recovery_threshold, recovery_total, prior_root_hash, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(root_id) DO UPDATE SET
          owner_device_id = excluded.owner_device_id,
          membership_epoch = excluded.membership_epoch,
          root_public_key = excluded.root_public_key,
          recovery_threshold = excluded.recovery_threshold,
          recovery_total = excluded.recovery_total,
          prior_root_hash = excluded.prior_root_hash,
          updated_at = excluded.updated_at`,
      )
      .run(
        record.rootId,
        record.ownerDeviceId,
        record.membershipEpoch,
        record.rootPublicKey,
        record.recoveryThreshold,
        record.recoveryTotal,
        record.priorRootHash,
        record.createdAt,
        record.updatedAt,
      );
  }

  listDevices(includeRevoked = false): SyncDeviceRecord[] {
    const rows = this.db
      .prepare(
        `SELECT device_id, public_key, role, enrolled_at, revoked_at, epoch_added
         FROM membership_devices
         ${includeRevoked ? '' : 'WHERE revoked_at IS NULL'}
         ORDER BY enrolled_at ASC`,
      )
      .all() as Array<{
        device_id: string;
        public_key: string;
        role: DeviceRole;
        enrolled_at: string;
        revoked_at: string | null;
        epoch_added: number;
      }>;

    return rows.map((row) => ({
      deviceId: row.device_id,
      publicKey: row.public_key,
      role: row.role,
      enrolledAt: row.enrolled_at,
      revokedAt: row.revoked_at,
      epochAdded: row.epoch_added,
    }));
  }

  getDevice(deviceId: string): SyncDeviceRecord | null {
    const row = this.db
      .prepare(
        `SELECT device_id, public_key, role, enrolled_at, revoked_at, epoch_added
         FROM membership_devices WHERE device_id = ?`,
      )
      .get(deviceId) as
      | {
          device_id: string;
          public_key: string;
          role: DeviceRole;
          enrolled_at: string;
          revoked_at: string | null;
          epoch_added: number;
        }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      deviceId: row.device_id,
      publicKey: row.public_key,
      role: row.role,
      enrolledAt: row.enrolled_at,
      revokedAt: row.revoked_at,
      epochAdded: row.epoch_added,
    };
  }

  upsertDevice(device: SyncDeviceRecord): void {
    this.db
      .prepare(
        `INSERT INTO membership_devices (
          device_id, public_key, role, enrolled_at, revoked_at, epoch_added
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          public_key = excluded.public_key,
          role = excluded.role,
          revoked_at = excluded.revoked_at,
          epoch_added = excluded.epoch_added`,
      )
      .run(
        device.deviceId,
        device.publicKey,
        device.role,
        device.enrolledAt,
        device.revokedAt,
        device.epochAdded,
      );
  }

  getLatestEventHash(): string | null {
    const row = this.db
      .prepare(`SELECT event_hash FROM membership_events ORDER BY membership_epoch DESC, created_at DESC LIMIT 1`)
      .get() as { event_hash: string } | undefined;
    return row?.event_hash ?? null;
  }

  getLatestEpoch(): number {
    const root = this.getRoot();
    return root?.membershipEpoch ?? 0;
  }

  appendEvent(event: DeviceMembershipEventV1): string {
    const parsed = DeviceMembershipEventSchema.parse(event);
    if (parsed.membershipEpoch < this.getLatestEpoch()) {
      throw new MembershipEpochConflictError(
        `Rejected membership event with lower epoch ${parsed.membershipEpoch}; current epoch is ${this.getLatestEpoch()}`,
      );
    }

    const unsigned = { ...parsed };
    const { rootSignature, ...rest } = unsigned;
    const canonical = canonicalizeRecord(rest as unknown as Record<string, unknown>);
    if (!verifyPayload(canonical, rootSignature, this.getRoot()?.rootPublicKey ?? parsed.devicePublicKey)) {
      const rootPublicKey = this.getRoot()?.rootPublicKey;
      if (!rootPublicKey || !verifyPayload(canonical, rootSignature, rootPublicKey)) {
        throw new Error('Membership event root signature verification failed');
      }
    }

    const eventHash = computeMembershipEventHash(rest);
    this.db
      .prepare(
        `INSERT INTO membership_events (event_hash, membership_epoch, event_json, prior_event_hash, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        eventHash,
        parsed.membershipEpoch,
        JSON.stringify(parsed),
        parsed.priorEventHash,
        parsed.occurredAt,
      );

    return eventHash;
  }

  listEvents(): DeviceMembershipEventV1[] {
    const rows = this.db
      .prepare(`SELECT event_json FROM membership_events ORDER BY membership_epoch ASC, created_at ASC`)
      .all() as Array<{ event_json: string }>;
    return rows.map((row) => DeviceMembershipEventSchema.parse(JSON.parse(row.event_json)));
  }
}

export function openMembershipStore(dataDir: string): MembershipStore {
  const syncDir = join(dataDir, 'sync');
  if (!existsSync(syncDir)) {
    mkdirSync(syncDir, { recursive: true });
  }
  return new MembershipStore(join(syncDir, 'membership.db'));
}
