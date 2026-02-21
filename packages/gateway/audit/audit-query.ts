// Audit Trail Query Extensions for the Network Monitor
// Provides structured querying, aggregation, and timeline generation
// on top of the existing append-only audit trail.
// Does NOT add new tables — queries the existing audit_log table.

import type Database from 'better-sqlite3';
import type { AuditEntry, ActionType } from '@semblance/core';

interface AuditRow {
  id: string;
  request_id: string;
  timestamp: string;
  action: string;
  direction: string;
  status: string;
  payload_hash: string;
  signature: string;
  chain_hash: string;
  metadata: string | null;
  estimated_time_saved_seconds: number;
}

function rowToEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    requestId: row.request_id,
    timestamp: row.timestamp,
    action: row.action as ActionType,
    direction: row.direction as 'request' | 'response',
    status: row.status as AuditEntry['status'],
    payloadHash: row.payload_hash,
    signature: row.signature,
    chainHash: row.chain_hash,
    metadata: row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : undefined,
    estimatedTimeSavedSeconds: row.estimated_time_saved_seconds,
  };
}

export interface QueryOptions {
  after?: string;
  before?: string;
  action?: string;
  status?: 'success' | 'error' | 'pending' | 'rejected' | 'rate_limited';
  direction?: 'request' | 'response';
  limit?: number;
  offset?: number;
}

export interface ServiceAggregate {
  service: string;
  connectionCount: number;
  successCount: number;
  errorCount: number;
  totalTimeSavedSeconds: number;
  lastActivity: string;
}

export interface TimelinePoint {
  timestamp: string;
  connections: number;
}

/**
 * AUTONOMOUS DECISION: Derive "service" from action type prefix (email, calendar, finance, etc.)
 * Reasoning: The audit trail stores action types like 'email.fetch', 'calendar.create'.
 *   The service name is the prefix before the dot. This avoids schema changes.
 * Escalation check: No schema changes, no new tables — reads existing data only.
 */
function actionToService(action: string): string {
  const dot = action.indexOf('.');
  return dot > 0 ? action.substring(0, dot) : action;
}

export class AuditQuery {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Query audit entries with filtering. Returns entries in chronological order.
   */
  getEntries(options: QueryOptions = {}): AuditEntry[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.after) {
      conditions.push('timestamp >= ?');
      params.push(options.after);
    }
    if (options.before) {
      conditions.push('timestamp <= ?');
      params.push(options.before);
    }
    if (options.action) {
      conditions.push('action = ?');
      params.push(options.action);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.direction) {
      conditions.push('direction = ?');
      params.push(options.direction);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit ? `LIMIT ?` : '';
    const offset = options.offset ? `OFFSET ?` : '';

    if (options.limit) params.push(options.limit);
    if (options.offset) params.push(options.offset);

    const sql = `SELECT * FROM audit_log ${where} ORDER BY rowid ASC ${limit} ${offset}`;
    const rows = this.db.prepare(sql).all(...params) as AuditRow[];
    return rows.map(rowToEntry);
  }

  /**
   * Count entries matching criteria.
   */
  count(options: Omit<QueryOptions, 'limit' | 'offset'> = {}): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.after) {
      conditions.push('timestamp >= ?');
      params.push(options.after);
    }
    if (options.before) {
      conditions.push('timestamp <= ?');
      params.push(options.before);
    }
    if (options.action) {
      conditions.push('action = ?');
      params.push(options.action);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.direction) {
      conditions.push('direction = ?');
      params.push(options.direction);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT COUNT(*) as count FROM audit_log ${where}`;
    const row = this.db.prepare(sql).get(...params) as { count: number };
    return row.count;
  }

  /**
   * Aggregate connection data by service (derived from action type prefix).
   * Groups by the part before the dot: 'email.fetch' → 'email'.
   */
  aggregateByService(period: 'today' | 'week' | 'month' | 'all'): ServiceAggregate[] {
    const { after } = periodToRange(period);

    const conditions: string[] = ["direction = 'response'"];
    const params: unknown[] = [];

    if (after) {
      conditions.push('timestamp >= ?');
      params.push(after);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        action,
        COUNT(*) as connection_count,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
        SUM(estimated_time_saved_seconds) as total_time_saved,
        MAX(timestamp) as last_activity
      FROM audit_log
      ${where}
      GROUP BY action
      ORDER BY connection_count DESC
    `;

    const rows = this.db.prepare(sql).all(...params) as Array<{
      action: string;
      connection_count: number;
      success_count: number;
      error_count: number;
      total_time_saved: number;
      last_activity: string;
    }>;

    // Group by service prefix
    const serviceMap = new Map<string, ServiceAggregate>();
    for (const row of rows) {
      const service = actionToService(row.action);
      const existing = serviceMap.get(service);
      if (existing) {
        existing.connectionCount += row.connection_count;
        existing.successCount += row.success_count;
        existing.errorCount += row.error_count;
        existing.totalTimeSavedSeconds += row.total_time_saved;
        if (row.last_activity > existing.lastActivity) {
          existing.lastActivity = row.last_activity;
        }
      } else {
        serviceMap.set(service, {
          service,
          connectionCount: row.connection_count,
          successCount: row.success_count,
          errorCount: row.error_count,
          totalTimeSavedSeconds: row.total_time_saved,
          lastActivity: row.last_activity,
        });
      }
    }

    return Array.from(serviceMap.values()).sort((a, b) => b.connectionCount - a.connectionCount);
  }

  /**
   * Get timeline data for chart rendering.
   * Returns connection counts bucketed by hour or day.
   */
  getTimeline(options: {
    period: 'today' | 'week' | 'month';
    granularity: 'hour' | 'day';
  }): TimelinePoint[] {
    const { after } = periodToRange(options.period);

    const conditions: string[] = ["direction = 'response'"];
    const params: unknown[] = [];

    if (after) {
      conditions.push('timestamp >= ?');
      params.push(after);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Group by time bucket using strftime
    const format = options.granularity === 'hour' ? '%Y-%m-%dT%H:00:00' : '%Y-%m-%d';
    const sql = `
      SELECT
        strftime('${format}', timestamp) as bucket,
        COUNT(*) as connections
      FROM audit_log
      ${where}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    const rows = this.db.prepare(sql).all(...params) as Array<{
      bucket: string;
      connections: number;
    }>;

    return rows.map(row => ({
      timestamp: row.bucket,
      connections: row.connections,
    }));
  }

  /**
   * Get all entries with a specific status (e.g., 'rejected' for unauthorized attempts).
   */
  getByStatus(status: AuditEntry['status'], limit = 100): AuditEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_log WHERE status = ? ORDER BY rowid DESC LIMIT ?'
    ).all(status, limit) as AuditRow[];
    return rows.map(rowToEntry);
  }

  /**
   * Get distinct action types used in a period.
   */
  getDistinctActions(period: 'today' | 'week' | 'month' | 'all'): string[] {
    const { after } = periodToRange(period);

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (after) {
      conditions.push('timestamp >= ?');
      params.push(after);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT DISTINCT action FROM audit_log ${where} ORDER BY action ASC`;
    const rows = this.db.prepare(sql).all(...params) as Array<{ action: string }>;
    return rows.map(r => r.action);
  }
}

/**
 * Convert a period label to a time range { after } boundary.
 */
function periodToRange(period: 'today' | 'week' | 'month' | 'all'): { after: string | null } {
  const now = new Date();

  switch (period) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { after: start.toISOString() };
    }
    case 'week': {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { after: start.toISOString() };
    }
    case 'month': {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { after: start.toISOString() };
    }
    case 'all':
      return { after: null };
  }
}
