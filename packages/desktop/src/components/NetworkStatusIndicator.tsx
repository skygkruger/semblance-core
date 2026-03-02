import { useCallback, useEffect, useState } from 'react';
import { getNetworkTrustStatus } from '../ipc/commands';
import type { TrustStatus } from '../ipc/types';

/**
 * Persistent Network Status Indicator
 * Always visible in the sidebar footer on every screen.
 * Shows "0 unauthorized connections" (green) when clean.
 * Shows unauthorized count (red) if any blocked attempts exist.
 * Clicking opens the full Network Monitor screen.
 */
export function NetworkStatusIndicator({ onClick }: { onClick: () => void }) {
  const [status, setStatus] = useState<TrustStatus>({
    clean: true,
    unauthorizedCount: 0,
    activeServiceCount: 0,
  });

  const loadStatus = useCallback(async () => {
    try {
      const result = await getNetworkTrustStatus();
      setStatus(result);
    } catch {
      // Sidecar not wired yet — default to clean
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 15000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark focus-visible:outline-none focus-visible:shadow-focus"
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${status.clean ? 'bg-semblance-success' : 'bg-semblance-attention'}`} />
      <span className="text-semblance-text-secondary dark:text-semblance-text-secondary-dark truncate">
        {status.clean
          ? `0 unauthorized${status.activeServiceCount > 0 ? ` \u00B7 ${status.activeServiceCount} service${status.activeServiceCount !== 1 ? 's' : ''}` : ''}`
          : `${status.unauthorizedCount} blocked`
        }
      </span>
    </button>
  );
}
