import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionCard, AlterEgoBatchReview } from '@semblance/ui';
import { getActionLog, getAlterEgoReceipts, approveAlterEgoBatch, rejectAlterEgoBatch, getPendingActions } from '../ipc/commands';
import type { LogEntry, AlterEgoReceiptData, PendingAction } from '../ipc/types';
import { useAppState } from '../state/AppState';
import { useSound } from '../sound/SoundEngineContext';

export function ActivityScreen() {
  const { t } = useTranslation();
  const state = useAppState();
  const name = state.userName || 'Semblance';
  const { play } = useSound();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [alterEgoReceipts, setAlterEgoReceipts] = useState<AlterEgoReceiptData[]>([]);
  const [pendingBatchItems, setPendingBatchItems] = useState<PendingAction[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const loadEntries = useCallback(async () => {
    try {
      const result = await getActionLog(50, 0);
      setEntries(result);
    } catch {
      // Gateway not yet wired
    }
  }, []);

  const loadAlterEgoReceipts = useCallback(async () => {
    try {
      const result = await getAlterEgoReceipts();
      setAlterEgoReceipts(result);
    } catch {
      // Not yet wired
    }
  }, []);

  const loadPendingBatch = useCallback(async () => {
    try {
      const result = await getPendingActions();
      setPendingBatchItems(result.filter(a => a.status === 'pending_approval'));
    } catch {
      // Not yet wired
    }
  }, []);

  const handleBatchConfirm = useCallback(async (approvedIds: string[], rejectedIds: string[]) => {
    if (approvedIds.length > 0) {
      play('action_approved');
      await approveAlterEgoBatch(approvedIds).catch(() => {});
    }
    if (rejectedIds.length > 0) {
      play('action_rejected');
      await rejectAlterEgoBatch(rejectedIds).catch(() => {});
    }
    loadPendingBatch();
    loadAlterEgoReceipts();
  }, [play, loadPendingBatch, loadAlterEgoReceipts]);

  useEffect(() => {
    loadEntries();
    loadAlterEgoReceipts();
    loadPendingBatch();
  }, [loadEntries, loadAlterEgoReceipts, loadPendingBatch]);

  const filtered = filterStatus === 'all'
    ? entries
    : filterStatus === 'alter_ego'
      ? [] // Alter Ego mode uses separate receipt list
      : entries.filter((e) => e.status === filterStatus);

  // Group alter ego receipts by weekGroup
  const receiptsByWeek = alterEgoReceipts.reduce<Record<string, AlterEgoReceiptData[]>>((acc, r) => {
    const key = r.weekGroup;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(r);
    return acc;
  }, {});

  const weekGroups = Object.keys(receiptsByWeek).sort().reverse();

  return (
    <div className="max-w-container-lg mx-auto px-6 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
        {t('screen.activity.title')}
      </h1>

      {/* Filter bar */}
      <div className="flex gap-2">
        {(['all', 'success', 'pending', 'error', 'alter_ego'] as const).map((status) => {
          const filterLabels: Record<string, string> = {
            all: t('screen.activity.filter_all'),
            success: t('screen.activity.filter_success'),
            pending: t('screen.activity.filter_pending'),
            error: t('screen.activity.filter_error'),
            alter_ego: t('screen.alter_ego.filter_alter_ego'),
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

      {/* Alter Ego batch review — pending actions */}
      {pendingBatchItems.length > 0 && (
        <AlterEgoBatchReview
          items={pendingBatchItems.map(a => ({
            id: a.id,
            actionType: a.action,
            summary: a.reasoning,
            reasoning: a.reasoning,
            category: a.domain,
            createdAt: a.createdAt,
          }))}
          onConfirm={handleBatchConfirm}
        />
      )}

      {/* Alter Ego receipt view */}
      {filterStatus === 'alter_ego' ? (
        alterEgoReceipts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              {t('screen.activity.empty', { name })}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {weekGroups.map((week) => (
              <div key={week} className="space-y-3">
                <h2 className="text-sm font-medium text-semblance-text-tertiary uppercase tracking-wider">
                  {t('screen.alter_ego.week_header', { week })}
                  <span className="ml-2 text-xs font-normal">({receiptsByWeek[week]!.length} actions)</span>
                </h2>
                {receiptsByWeek[week]!.map((receipt) => (
                  <div
                    key={receipt.id}
                    className="p-4 rounded-md bg-semblance-surface-1 dark:bg-semblance-surface-1-dark border border-semblance-border dark:border-semblance-border-dark"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
                          {receipt.summary}
                        </p>
                        <p className="text-xs text-semblance-text-tertiary mt-1">
                          {receipt.reasoning}
                        </p>
                        <p className="text-xs text-semblance-text-tertiary mt-1">
                          {new Date(receipt.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        receipt.status === 'undone'
                          ? 'bg-semblance-warning-subtle text-semblance-warning'
                          : 'bg-semblance-success-subtle text-semblance-success'
                      }`}>
                        {receipt.status === 'undone'
                          ? t('screen.alter_ego.receipt_undone')
                          : t('screen.alter_ego.receipt_executed')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      ) : (
        /* Standard action log */
        filtered.length === 0 ? (
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
        )
      )}
    </div>
  );
}
