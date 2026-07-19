import type Database from 'better-sqlite3';

export const VAULT_DELETION_COMPLETION_SCHEMA = `
  CREATE TABLE IF NOT EXISTS vault_deletion_completion (
    tombstone_event_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    pending INTEGER NOT NULL DEFAULT 1,
    completed_at TEXT,
    PRIMARY KEY (tombstone_event_id, device_id)
  );

  CREATE TABLE IF NOT EXISTS vault_deletion_receipts (
    tombstone_event_id TEXT PRIMARY KEY,
    deletion_receipt_hash TEXT NOT NULL,
    record_reference TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vault_content_key_state (
    content_id TEXT NOT NULL,
    data_domain TEXT NOT NULL,
    destroyed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (content_id, data_domain)
  );
`;

export function initializeDeletionSchema(db: Database.Database): void {
  db.exec(VAULT_DELETION_COMPLETION_SCHEMA);
}

export interface DeletionCompletionDevice {
  deviceId: string;
  pending: boolean;
  completedAt: string | null;
}

export interface DeletionCompletionStatus {
  tombstoneEventId: string;
  authorizedDevices: string[];
  pendingDevices: string[];
  completedDevices: string[];
  isFullyComplete: boolean;
}

export class DeletionCompletionTracker {
  private readonly upsertDeviceStmt: Database.Statement;
  private readonly listDevicesStmt: Database.Statement;
  private readonly markCompleteStmt: Database.Statement;

  constructor(private readonly db: Database.Database) {
    initializeDeletionSchema(db);
    this.upsertDeviceStmt = db.prepare(`
      INSERT INTO vault_deletion_completion (tombstone_event_id, device_id, pending, completed_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(tombstone_event_id, device_id) DO UPDATE SET
        pending = excluded.pending,
        completed_at = excluded.completed_at
    `);
    this.listDevicesStmt = db.prepare(`
      SELECT device_id, pending, completed_at
      FROM vault_deletion_completion
      WHERE tombstone_event_id = ?
      ORDER BY device_id ASC
    `);
    this.markCompleteStmt = db.prepare(`
      UPDATE vault_deletion_completion
      SET pending = 0, completed_at = datetime('now')
      WHERE tombstone_event_id = ? AND device_id = ?
    `);
  }

  registerAuthorizedDevices(tombstoneEventId: string, deviceIds: string[]): void {
    for (const deviceId of [...deviceIds].sort()) {
      this.upsertDeviceStmt.run(tombstoneEventId, deviceId, 1, null);
    }
  }

  markDeviceComplete(tombstoneEventId: string, deviceId: string): void {
    const existing = this.listDevicesStmt.all(tombstoneEventId) as Array<{
      device_id: string;
    }>;
    if (!existing.some((row) => row.device_id === deviceId)) {
      this.upsertDeviceStmt.run(tombstoneEventId, deviceId, 0, new Date().toISOString());
      return;
    }
    this.markCompleteStmt.run(tombstoneEventId, deviceId);
  }

  getStatus(tombstoneEventId: string): DeletionCompletionStatus {
    const rows = this.listDevicesStmt.all(tombstoneEventId) as Array<{
      device_id: string;
      pending: number;
      completed_at: string | null;
    }>;

    const authorizedDevices = rows.map((row) => row.device_id);
    const pendingDevices = rows.filter((row) => row.pending === 1).map((row) => row.device_id);
    const completedDevices = rows.filter((row) => row.pending === 0).map((row) => row.device_id);

    return {
      tombstoneEventId,
      authorizedDevices,
      pendingDevices,
      completedDevices,
      isFullyComplete: authorizedDevices.length > 0 && pendingDevices.length === 0,
    };
  }

  listDevices(tombstoneEventId: string): DeletionCompletionDevice[] {
    const rows = this.listDevicesStmt.all(tombstoneEventId) as Array<{
      device_id: string;
      pending: number;
      completed_at: string | null;
    }>;

    return rows.map((row) => ({
      deviceId: row.device_id,
      pending: row.pending === 1,
      completedAt: row.completed_at,
    }));
  }
}

export function createDeletionCompletionTracker(db: Database.Database): DeletionCompletionTracker {
  return new DeletionCompletionTracker(db);
}
