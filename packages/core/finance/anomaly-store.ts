/**
 * Anomaly Store — Persistent storage for detected financial anomalies.
 */

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';

export type AnomalyType = 'first-time-merchant' | 'unusual-amount' | 'duplicate-charge' | 'category-spike';
export type AnomalySeverity = 'low' | 'medium' | 'high';

export interface Anomaly {
  id: string;
  transactionId: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  title: string;
  description: string;
  detectedAt: string;
  dismissed: boolean;
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS financial_anomalies (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    dismissed INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_anomaly_txn ON financial_anomalies(transaction_id);
  CREATE INDEX IF NOT EXISTS idx_anomaly_dismissed ON financial_anomalies(dismissed);
`;

export class AnomalyStore {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.exec(CREATE_TABLE);
  }

  saveAnomaly(anomaly: Omit<Anomaly, 'id'>): Anomaly {
    const id = nanoid();
    this.db.prepare(`
      INSERT OR IGNORE INTO financial_anomalies
        (id, transaction_id, type, severity, title, description, detected_at, dismissed)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, anomaly.transactionId, anomaly.type, anomaly.severity, anomaly.title, anomaly.description, anomaly.detectedAt);

    return { ...anomaly, id, dismissed: false };
  }

  getActiveAnomalies(): Anomaly[] {
    const rows = this.db.prepare(
      'SELECT * FROM financial_anomalies WHERE dismissed = 0 ORDER BY detected_at DESC'
    ).all() as RawAnomalyRow[];
    return rows.map(r => this.rowToAnomaly(r));
  }

  getAnomalyByTransaction(transactionId: string): Anomaly | null {
    const row = this.db.prepare(
      'SELECT * FROM financial_anomalies WHERE transaction_id = ? LIMIT 1'
    ).get(transactionId) as RawAnomalyRow | undefined;
    return row ? this.rowToAnomaly(row) : null;
  }

  dismissAnomaly(id: string): void {
    this.db.prepare('UPDATE financial_anomalies SET dismissed = 1 WHERE id = ?').run(id);
  }

  private rowToAnomaly(r: RawAnomalyRow): Anomaly {
    return {
      id: r.id,
      transactionId: r.transaction_id,
      type: r.type as AnomalyType,
      severity: r.severity as AnomalySeverity,
      title: r.title,
      description: r.description,
      detectedAt: r.detected_at,
      dismissed: r.dismissed === 1,
    };
  }
}

interface RawAnomalyRow {
  id: string;
  transaction_id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  detected_at: string;
  dismissed: number;
}
