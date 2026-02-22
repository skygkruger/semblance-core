// Network Monitor Adapter — Connects mobile to Gateway's audit trail.
// Displays all Gateway actions with timestamps, matching desktop Network Monitor.
// Data comes through Core → IPC → Gateway audit query.

export interface NetworkMonitorEntry {
  id: string;
  action: string;
  timestamp: string;
  status: 'success' | 'error' | 'pending' | 'rejected';
  direction: 'request' | 'response';
  service: string;
  estimatedTimeSavedSeconds: number;
}

export interface NetworkMonitorStats {
  totalActions: number;
  successCount: number;
  errorCount: number;
  totalTimeSavedSeconds: number;
  actionsByService: Record<string, number>;
}

/**
 * Map audit trail entries to network monitor display format.
 */
export function auditEntriesToMonitorEntries(
  entries: Array<{
    id: string;
    action: string;
    timestamp: string;
    status: string;
    direction: string;
    estimated_time_saved_seconds?: number;
  }>
): NetworkMonitorEntry[] {
  return entries.map(entry => ({
    id: entry.id,
    action: entry.action,
    timestamp: entry.timestamp,
    status: entry.status as NetworkMonitorEntry['status'],
    direction: entry.direction as NetworkMonitorEntry['direction'],
    service: extractService(entry.action),
    estimatedTimeSavedSeconds: entry.estimated_time_saved_seconds ?? 0,
  }));
}

/**
 * Compute stats from a list of monitor entries.
 */
export function computeMonitorStats(entries: NetworkMonitorEntry[]): NetworkMonitorStats {
  const actionsByService: Record<string, number> = {};

  let successCount = 0;
  let errorCount = 0;
  let totalTimeSaved = 0;

  for (const entry of entries) {
    if (entry.direction !== 'request') continue;
    if (entry.status === 'success') successCount++;
    if (entry.status === 'error') errorCount++;
    totalTimeSaved += entry.estimatedTimeSavedSeconds;

    actionsByService[entry.service] = (actionsByService[entry.service] ?? 0) + 1;
  }

  return {
    totalActions: entries.filter(e => e.direction === 'request').length,
    successCount,
    errorCount,
    totalTimeSavedSeconds: totalTimeSaved,
    actionsByService,
  };
}

/**
 * Extract service name from an action type (e.g., 'email.fetch' → 'email').
 */
function extractService(action: string): string {
  const dot = action.indexOf('.');
  return dot > 0 ? action.substring(0, dot) : action;
}
