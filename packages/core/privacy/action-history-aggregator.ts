// Action History Aggregator — Aggregates audit_log for action history summary.
// Counts by autonomy tier, computes approval rate and time savings.
// CRITICAL: No networking imports.

import type { DatabaseHandle } from '../platform/types.js';
import type { ActionHistorySummary } from './types.js';

export interface ActionHistoryAggregatorDeps {
  db: DatabaseHandle;
}

/**
 * Aggregates audit_log entries into an action history summary.
 * Extracts autonomy tier from metadata JSON column.
 */
export class ActionHistoryAggregator {
  private db: DatabaseHandle;

  constructor(deps: ActionHistoryAggregatorDeps) {
    this.db = deps.db;
  }

  /**
   * Aggregate all action history from the audit_log.
   */
  aggregate(): ActionHistorySummary {
    try {
      // Get all entries
      const rows = this.db.prepare(`
        SELECT
          metadata,
          estimated_time_saved_seconds,
          status
        FROM audit_log
        WHERE direction = 'request'
      `).all() as Array<{
        metadata: string | null;
        estimated_time_saved_seconds: number;
        status: string;
      }>;

      if (rows.length === 0) {
        return {
          totalActions: 0,
          byAutonomyTier: {},
          approvalRate: 0,
          averageTimeSavedSeconds: 0,
        };
      }

      const byAutonomyTier: Record<string, number> = {};
      let totalTimeSaved = 0;
      let approvedCount = 0;
      let requiresApprovalCount = 0;

      for (const row of rows) {
        totalTimeSaved += row.estimated_time_saved_seconds ?? 0;

        // Extract autonomy tier from metadata JSON
        let tier = 'unknown';
        if (row.metadata) {
          try {
            const meta = JSON.parse(row.metadata) as Record<string, unknown>;
            if (typeof meta.autonomyTier === 'string') {
              tier = meta.autonomyTier;
            }
          } catch {
            // Malformed metadata — count as unknown
          }
        }
        byAutonomyTier[tier] = (byAutonomyTier[tier] ?? 0) + 1;

        // Count approval rate from status
        if (row.status === 'success') approvedCount++;
        if (row.status !== 'rate_limited') requiresApprovalCount++;
      }

      const approvalRate = requiresApprovalCount > 0
        ? approvedCount / requiresApprovalCount
        : 0;

      return {
        totalActions: rows.length,
        byAutonomyTier,
        approvalRate,
        averageTimeSavedSeconds: totalTimeSaved / rows.length,
      };
    } catch {
      return {
        totalActions: 0,
        byAutonomyTier: {},
        approvalRate: 0,
        averageTimeSavedSeconds: 0,
      };
    }
  }
}
