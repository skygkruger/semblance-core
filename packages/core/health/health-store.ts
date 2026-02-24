// Health Store — SQLite storage for health entries.
// Handles both HealthKit and manual entries uniformly.
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import type { HealthEntry, HealthMetricType, DailySeries } from './types.js';
import { nanoid } from 'nanoid';

// ─── SQLite Schema ────────────────────────────────────────────────────────────

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS health_entries (
    id TEXT PRIMARY KEY,
    metric_type TEXT NOT NULL,
    value REAL NOT NULL,
    label TEXT,
    recorded_at TEXT NOT NULL,
    source TEXT NOT NULL,
    metadata TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_health_metric ON health_entries(metric_type);
  CREATE INDEX IF NOT EXISTS idx_health_date ON health_entries(recorded_at);
  CREATE INDEX IF NOT EXISTS idx_health_source ON health_entries(source);
`;

interface HealthRow {
  id: string;
  metric_type: string;
  value: number;
  label: string | null;
  recorded_at: string;
  source: string;
  metadata: string | null;
}

function rowToEntry(row: HealthRow): HealthEntry {
  return {
    id: row.id,
    metricType: row.metric_type as HealthMetricType,
    value: row.value,
    label: row.label ?? undefined,
    recordedAt: row.recorded_at,
    source: row.source as 'healthkit' | 'manual',
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

// ─── Health Store ─────────────────────────────────────────────────────────────

export class HealthStore {
  private db: DatabaseHandle;

  constructor(config: { db: DatabaseHandle }) {
    this.db = config.db;
    this.db.exec(CREATE_TABLE);
  }

  addEntry(entry: Omit<HealthEntry, 'id'>): HealthEntry {
    const id = `he_${nanoid()}`;
    this.db.prepare(`
      INSERT INTO health_entries (id, metric_type, value, label, recorded_at, source, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.metricType,
      entry.value,
      entry.label ?? null,
      entry.recordedAt,
      entry.source,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    );
    return { id, ...entry };
  }

  getEntries(type: HealthMetricType, startDate: Date, endDate: Date): HealthEntry[] {
    const rows = this.db.prepare(
      `SELECT * FROM health_entries
       WHERE metric_type = ? AND recorded_at >= ? AND recorded_at <= ?
       ORDER BY recorded_at ASC`
    ).all(type, startDate.toISOString(), endDate.toISOString()) as HealthRow[];
    return rows.map(rowToEntry);
  }

  getEntriesForDate(date: Date): HealthEntry[] {
    // Use UTC day boundaries to match ISO timestamps in the database
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const dayStart = `${year}-${month}-${day}T00:00:00.000Z`;
    const dayEnd = `${year}-${month}-${day}T23:59:59.999Z`;

    const rows = this.db.prepare(
      `SELECT * FROM health_entries
       WHERE recorded_at >= ? AND recorded_at <= ?
       ORDER BY recorded_at ASC`
    ).all(dayStart, dayEnd) as HealthRow[];
    return rows.map(rowToEntry);
  }

  getDailyAggregates(type: HealthMetricType, startDate: Date, endDate: Date): DailySeries {
    const rows = this.db.prepare(
      `SELECT DATE(recorded_at) as day, AVG(value) as avg_value
       FROM health_entries
       WHERE metric_type = ? AND recorded_at >= ? AND recorded_at <= ?
       GROUP BY DATE(recorded_at)
       ORDER BY day ASC`
    ).all(type, startDate.toISOString(), endDate.toISOString()) as { day: string; avg_value: number }[];

    return {
      dates: rows.map(r => r.day),
      values: rows.map(r => r.avg_value),
    };
  }

  deleteEntry(id: string): boolean {
    const result = this.db.prepare('DELETE FROM health_entries WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getLatestEntries(limit: number): HealthEntry[] {
    const rows = this.db.prepare(
      `SELECT * FROM health_entries ORDER BY recorded_at DESC LIMIT ?`
    ).all(limit) as HealthRow[];
    return rows.map(rowToEntry);
  }

  getEntriesBySource(source: 'healthkit' | 'manual', type: HealthMetricType, startDate: Date, endDate: Date): HealthEntry[] {
    const rows = this.db.prepare(
      `SELECT * FROM health_entries
       WHERE source = ? AND metric_type = ? AND recorded_at >= ? AND recorded_at <= ?
       ORDER BY recorded_at ASC`
    ).all(source, type, startDate.toISOString(), endDate.toISOString()) as HealthRow[];
    return rows.map(rowToEntry);
  }
}
