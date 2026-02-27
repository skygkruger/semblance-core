// Data Inventory Collector — Queries all data stores for entity counts.
// Uses direct SQLite queries (same pattern as DailyDigestGenerator).
// CRITICAL: No networking imports.

import type { DatabaseHandle } from '../platform/types.js';
import type { DataInventory, DataCategoryCount } from './types.js';

export interface DataInventoryCollectorDeps {
  db: DatabaseHandle;
}

/** Tables that are safe to query for inventory counts. */
const KNOWN_TABLES = new Set([
  'indexed_emails', 'indexed_calendar_events', 'documents', 'contacts',
  'reminders', 'location_history', 'captures', 'imported_items',
  'transactions', 'health_entries',
]);

/** Columns that are safe to use in GROUP BY queries. */
const KNOWN_GROUP_COLUMNS = new Set([
  'source', 'relationship', 'source_type',
]);

/**
 * Validate a table name against the known tables whitelist.
 * Throws if the table is not in the whitelist — prevents SQL injection.
 */
function assertKnownTable(table: string): void {
  if (!KNOWN_TABLES.has(table)) {
    throw new Error(`Unknown table: ${table}. Only whitelisted tables are allowed.`);
  }
}

/**
 * Validate a column name against the known columns whitelist.
 */
function assertKnownColumn(column: string): void {
  if (!KNOWN_GROUP_COLUMNS.has(column)) {
    throw new Error(`Unknown column: ${column}. Only whitelisted columns are allowed.`);
  }
}

/**
 * Collects a full data inventory by querying each known table directly.
 * Missing tables return 0 (finance, health, etc. may not exist yet).
 */
export class DataInventoryCollector {
  private db: DatabaseHandle;

  constructor(deps: DataInventoryCollectorDeps) {
    this.db = deps.db;
  }

  /**
   * Collect counts from all known data stores.
   */
  collect(): DataInventory {
    const categories: DataCategoryCount[] = [];

    // Emails
    const emailCount = this.safeCount('indexed_emails');
    if (emailCount > 0) categories.push({ category: 'emails', count: emailCount });

    // Calendar events
    const calendarCount = this.safeCount('indexed_calendar_events');
    if (calendarCount > 0) categories.push({ category: 'calendarEvents', count: calendarCount });

    // Documents with source breakdown
    const docBreakdown = this.safeGroupCount('documents', 'source');
    const docTotal = Object.values(docBreakdown).reduce((sum, n) => sum + n, 0);
    if (docTotal > 0) categories.push({ category: 'documents', count: docTotal, breakdown: docBreakdown });

    // Contacts with relationship breakdown
    const contactBreakdown = this.safeGroupCount('contacts', 'relationship');
    const contactTotal = Object.values(contactBreakdown).reduce((sum, n) => sum + n, 0);
    if (contactTotal > 0) categories.push({ category: 'contacts', count: contactTotal, breakdown: contactBreakdown });

    // Reminders
    const reminderCount = this.safeCount('reminders');
    if (reminderCount > 0) categories.push({ category: 'reminders', count: reminderCount });

    // Locations
    const locationCount = this.safeCount('location_history');
    if (locationCount > 0) categories.push({ category: 'locations', count: locationCount });

    // Captures
    const captureCount = this.safeCount('captures');
    if (captureCount > 0) categories.push({ category: 'captures', count: captureCount });

    // Imports by source_type
    const importBreakdown = this.safeGroupCount('imported_items', 'source_type');
    const importTotal = Object.values(importBreakdown).reduce((sum, n) => sum + n, 0);
    if (importTotal > 0) categories.push({ category: 'imports', count: importTotal, breakdown: importBreakdown });

    // Finance (proprietary — may not exist)
    const financeCount = this.safeCount('transactions');
    if (financeCount > 0) categories.push({ category: 'finance', count: financeCount });

    // Health (not created yet — may not exist)
    const healthCount = this.safeCount('health_entries');
    if (healthCount > 0) categories.push({ category: 'health', count: healthCount });

    const totalEntities = categories.reduce((sum, c) => sum + c.count, 0);

    return {
      categories,
      totalEntities,
      collectedAt: new Date().toISOString(),
    };
  }

  /**
   * Safe COUNT(*) — returns 0 if table doesn't exist.
   * SECURITY: table name validated against whitelist to prevent SQL injection.
   */
  private safeCount(table: string): number {
    assertKnownTable(table);
    try {
      const row = this.db.prepare(`SELECT COUNT(*) as count FROM "${table}"`).get() as { count: number } | undefined;
      return row?.count ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Safe GROUP BY count — returns {} if table doesn't exist.
   * SECURITY: table and column names validated against whitelists.
   */
  private safeGroupCount(table: string, column: string): Record<string, number> {
    assertKnownTable(table);
    assertKnownColumn(column);
    try {
      const rows = this.db.prepare(
        `SELECT "${column}", COUNT(*) as count FROM "${table}" GROUP BY "${column}"`
      ).all() as Array<Record<string, unknown>>;

      const result: Record<string, number> = {};
      for (const row of rows) {
        const key = String(row[column] ?? 'unknown');
        result[key] = row.count as number;
      }
      return result;
    } catch {
      return {};
    }
  }
}
