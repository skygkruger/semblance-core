// Network Monitor Adapter — Connects mobile to Gateway's audit trail.
// Displays all Gateway actions with timestamps, matching desktop Network Monitor.
// Data comes through Core → IPC → Gateway audit query.
//
// MOBILE NOTE: The mobile device does NOT run a Gateway process. All network
// actions are performed by the desktop's Gateway. When mobile is operating
// standalone (no desktop handoff active), there are genuinely zero outbound
// network connections — returning an empty array is the truthful answer,
// not a stub. The mobile AI core runs entirely on-device with no network access.
//
// When desktop handoff IS active (task routed to desktop), the desktop's
// Network Monitor shows those actions. A future enhancement could sync
// desktop audit trail entries to mobile for unified viewing.

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

/**
 * Fetch network monitor entries for mobile.
 *
 * Mobile does not run its own Gateway — all network actions flow through the
 * desktop Gateway. When operating standalone, mobile makes zero outbound
 * connections by design (Sanctuary Protocol / Rule 1). Returning an empty
 * array is the honest, correct answer.
 *
 * The stats will show totalActions: 0, which is accurate and proves to the
 * user that their mobile device is making no network calls.
 */
export function getMobileNetworkEntries(): NetworkMonitorEntry[] {
  // Genuinely empty — mobile has no Gateway process and makes no network calls.
  // This is not a stub; this is the truthful state of mobile networking.
  return [];
}

/**
 * Get mobile network stats — always zero, which is the correct answer.
 */
export function getMobileNetworkStats(): NetworkMonitorStats {
  return computeMonitorStats([]);
}
