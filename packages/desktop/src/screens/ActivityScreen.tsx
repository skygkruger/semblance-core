import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionCard } from '@semblance/ui';
import { getActionLog } from '../ipc/commands';
import type { LogEntry } from '../ipc/types';
import { useAppState } from '../state/AppState';

export function ActivityScreen() {
  const { t } = useTranslation();
  const state = useAppState();
  const name = state.userName || 'Semblance';
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const loadEntries = useCallback(async () => {
    try {
      const result = await getActionLog(50, 0);
      setEntries(result);
    } catch {
      // Gateway not yet wired
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const filtered = filterStatus === 'all'
    ? entries
    : entries.filter((e) => e.status === filterStatus);

  return (
    <div className="max-w-container-lg mx-auto px-6 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
        {t('screen.activity.title')}
      </h1>

      {/* Filter bar */}
      <div className="flex gap-2">
        {(['all', 'success', 'pending', 'error'] as const).map((status) => {
          const filterLabels: Record<string, string> = {
            all: t('screen.activity.filter_all'),
            success: t('screen.activity.filter_success'),
            pending: t('screen.activity.filter_pending'),
            error: t('screen.activity.filter_error'),
          };
          return (
            <button
              key={status}
              type="button"
              onClick={() => setFilterStatus(status)}
              className={`
                px-3 py-1.5 text-sm rounded-md transition-colors duration-fast
                focus-visible:outline-none focus-visible:shadow-focus
                ${filterStatus === status
                  ? 'bg-semblance-primary text-white'
                  : 'text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark'
                }
              `.trim()}
            >
              {filterLabels[status]}
            </button>
          );
        })}
      </div>

      {/* Action log */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            {t('screen.activity.empty', { name })}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => (
            <ActionCard
              key={entry.id}
              id={entry.id}
              timestamp={entry.timestamp}
              actionType={entry.action}
              description={entry.description}
              status={entry.status as 'success' | 'error' | 'pending' | 'rejected'}
              autonomyTier={entry.autonomy_tier}
              detail={
                <div className="space-y-2 font-mono text-xs">
                  <p>{t('screen.activity.payload_hash', { hash: entry.payload_hash })}</p>
                  <p>{t('screen.activity.audit_reference', { ref: entry.audit_ref })}</p>
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
