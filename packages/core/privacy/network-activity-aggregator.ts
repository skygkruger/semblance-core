// Network Activity Aggregator — Aggregates audit_log for network activity summary.
// Groups actions by service prefix (e.g. email.fetch -> email).
// CRITICAL: No networking imports.

import type { DatabaseHandle } from '../platform/types.js';
import type { NetworkActivitySummary, ServiceActivity } from './types.js';

export interface NetworkActivityAggregatorDeps {
  db: DatabaseHandle;
}

/**
 * Aggregates audit_log entries into a network activity summary.
 * Shows all Gateway connections grouped by service.
 */
export class NetworkActivityAggregator {
  private db: DatabaseHandle;

  constructor(deps: NetworkActivityAggregatorDeps) {
    this.db = deps.db;
  }

  /**
   * Aggregate network activity for a given time period.
   */
  aggregate(period: { start: string; end: string }): NetworkActivitySummary {
    const services = this.aggregateByService(period);

    let totalRequests = 0;
    let totalRejected = 0;
    let totalRateLimited = 0;
    let totalTimeSaved = 0;

    for (const svc of services) {
      totalRequests += svc.requestCount;
      totalRejected += svc.rejectedCount;
      totalRateLimited += svc.rateLimitedCount;
      totalTimeSaved += svc.totalTimeSavedSeconds;
    }

    return {
      services,
      totalRequests,
      totalRejected,
      totalRateLimited,
      dataExfiltratedBytes: 0,     // Always 0 — Semblance never exfiltrates
      unknownDestinations: 0,       // Always 0 — all destinations on allowlist
      totalTimeSavedSeconds: totalTimeSaved,
      period,
    };
  }

  private aggregateByService(period: { start: string; end: string }): ServiceActivity[] {
    try {
      const rows = this.db.prepare(`
        SELECT
          action,
          COUNT(*) as request_count,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
          SUM(CASE WHEN status = 'rate_limited' THEN 1 ELSE 0 END) as rate_limited_count,
          SUM(COALESCE(estimated_time_saved_seconds, 0)) as total_time_saved
        FROM audit_log
        WHERE timestamp >= ? AND timestamp <= ?
        GROUP BY action
        ORDER BY request_count DESC
      `).all(period.start, period.end) as Array<{
        action: string;
        request_count: number;
        success_count: number;
        error_count: number;
        rejected_count: number;
        rate_limited_count: number;
        total_time_saved: number;
      }>;

      // Group by service prefix (email.fetch -> email)
      const serviceMap = new Map<string, ServiceActivity>();
      for (const row of rows) {
        const service = this.actionToService(row.action);
        const existing = serviceMap.get(service);
        if (existing) {
          existing.requestCount += row.request_count;
          existing.successCount += row.success_count;
          existing.errorCount += row.error_count;
          existing.rejectedCount += row.rejected_count;
          existing.rateLimitedCount += row.rate_limited_count;
          existing.totalTimeSavedSeconds += row.total_time_saved;
        } else {
          serviceMap.set(service, {
            service,
            requestCount: row.request_count,
            successCount: row.success_count,
            errorCount: row.error_count,
            rejectedCount: row.rejected_count,
            rateLimitedCount: row.rate_limited_count,
            totalTimeSavedSeconds: row.total_time_saved,
          });
        }
      }

      return Array.from(serviceMap.values()).sort((a, b) => b.requestCount - a.requestCount);
    } catch {
      return [];
    }
  }

  private actionToService(action: string): string {
    const dot = action.indexOf('.');
    return dot > 0 ? action.substring(0, dot) : action;
  }
}
