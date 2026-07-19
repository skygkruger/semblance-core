import Database from 'better-sqlite3';
import type { ActionRecord, CreateActionRecordParams } from './types.js';

const CREATE_IDEMPOTENCY_TABLE = `
  CREATE TABLE IF NOT EXISTS action_idempotency (
    idempotency_key TEXT PRIMARY KEY,
    action_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const CREATE_RECORDS_TABLE = `
  CREATE TABLE IF NOT EXISTS action_records (
    action_id TEXT PRIMARY KEY,
    record_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export class ActionLifecycleStore {
  private readonly db: Database.Database;
  private readonly getIdempotencyStmt: Database.Statement;
  private readonly insertIdempotencyStmt: Database.Statement;
  private readonly getRecordStmt: Database.Statement;
  private readonly upsertRecordStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_IDEMPOTENCY_TABLE);
    this.db.exec(CREATE_RECORDS_TABLE);

    this.getIdempotencyStmt = this.db.prepare(
      'SELECT action_id FROM action_idempotency WHERE idempotency_key = ?',
    );
    this.insertIdempotencyStmt = this.db.prepare(
      'INSERT INTO action_idempotency (idempotency_key, action_id) VALUES (?, ?)',
    );
    this.getRecordStmt = this.db.prepare(
      'SELECT record_json FROM action_records WHERE action_id = ?',
    );
    this.upsertRecordStmt = this.db.prepare(`
      INSERT INTO action_records (action_id, record_json, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(action_id) DO UPDATE SET
        record_json = excluded.record_json,
        updated_at = datetime('now')
    `);
  }

  getActionIdForKey(idempotencyKey: string): string | null {
    const row = this.getIdempotencyStmt.get(idempotencyKey) as { action_id: string } | undefined;
    return row?.action_id ?? null;
  }

  getRecord(actionId: string): ActionRecord | null {
    const row = this.getRecordStmt.get(actionId) as { record_json: string } | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.record_json) as ActionRecord;
  }

  getRecordByIdempotencyKey(idempotencyKey: string): ActionRecord | null {
    const actionId = this.getActionIdForKey(idempotencyKey);
    if (!actionId) {
      return null;
    }
    return this.getRecord(actionId);
  }

  saveRecord(record: ActionRecord): void {
    this.upsertRecordStmt.run(record.actionId, JSON.stringify(record));
  }

  createAction(params: CreateActionRecordParams): ActionRecord {
    const existingId = this.getActionIdForKey(params.idempotencyKey);
    if (existingId) {
      const existing = this.getRecord(existingId);
      if (existing) {
        return existing;
      }
    }

    const now = params.now ?? new Date().toISOString();
    const record: ActionRecord = {
      actionId: params.actionId,
      requestId: params.requestId,
      actionType: params.actionType,
      state: params.initialState ?? 'proposed',
      idempotencyKey: params.idempotencyKey,
      auditCorrelationId: params.auditCorrelationId,
      payloadHash: params.payloadHash,
      createdAt: now,
      updatedAt: now,
    };

    this.insertIdempotencyStmt.run(params.idempotencyKey, params.actionId);
    this.saveRecord(record);
    return record;
  }

  updateRecord(record: ActionRecord): void {
    const mappedId = this.getActionIdForKey(record.idempotencyKey);
    if (mappedId && mappedId !== record.actionId) {
      throw new Error(
        `Idempotency key ${record.idempotencyKey} already maps to action ${mappedId}`,
      );
    }
    this.saveRecord(record);
  }

  listRecords(limit = 100, offset = 0): ActionRecord[] {
    const rows = this.db.prepare(
      'SELECT record_json FROM action_records ORDER BY updated_at DESC LIMIT ? OFFSET ?',
    ).all(limit, offset) as Array<{ record_json: string }>;
    return rows.map((row) => JSON.parse(row.record_json) as ActionRecord);
  }
}

export function createActionLifecycleStore(db: Database.Database): ActionLifecycleStore {
  return new ActionLifecycleStore(db);
}

export function createInMemoryActionLifecycleStore(): ActionLifecycleStore {
  return createActionLifecycleStore(new Database(':memory:'));
}
