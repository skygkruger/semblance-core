import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionCard, AlterEgoBatchReview, ActionLogItem, AlterEgoReceipt, AlterEgoDraftReview } from '@semblance/ui';
import { getActionLog, getAlterEgoReceipts, approveAlterEgoBatch, rejectAlterEgoBatch, getPendingActions, getEscalationPrompts, respondToEscalation, undoAlterEgoReceipt, getAlterEgoWeekProgress, completeAlterEgoDay, skipAlterEgoDay } from '../ipc/commands';
import type { LogEntry, AlterEgoReceiptData, PendingAction, EscalationPromptData, AlterEgoWeekProgressData } from '../ipc/types';
import { EscalationPromptCard } from '../components/EscalationPromptCard';
import { AlterEgoWeekCard } from '../components/AlterEgoWeekCard';
import { useAppState } from '../state/AppState';
import { useSound } from '../sound/SoundEngineContext';

export function ActivityScreen() {
  const { t } = useTranslation();
  const state = useAppState();
  const name = state.semblanceName || 'Semblance';
  const { play } = useSound();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [alterEgoReceipts, setAlterEgoReceipts] = useState<AlterEgoReceiptData[]>([]);
  const [pendingBatchItems, setPendingBatchItems] = useState<PendingAction[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [escalationPrompts, setEscalationPrompts] = useState<EscalationPromptData[]>([]);
  const [weekProgress, setWeekProgress] = useState<AlterEgoWeekProgressData | null>(null);

  const loadEntries = useCallback(async () => {
    try {
      const result = await getActionLog(50, 0);
      setEntries(result);
    } catch (err) {
      console.error('[ActivityScreen] loadEntries failed:', err);
    }
  }, []);

  const loadAlterEgoReceipts = useCallback(async () => {
    try {
      const result = await getAlterEgoReceipts();
      setAlterEgoReceipts(result);
    } catch (err) {
      console.error('[ActivityScreen] loadAlterEgoReceipts failed:', err);
    }
  }, []);

  const loadPendingBatch = useCallback(async () => {
    try {
      const result = await getPendingActions();
      setPendingBatchItems((result ?? []).filter(a => a.status === 'pending_approval'));
    } catch (err) {
      console.error('[ActivityScreen] loadPendingBatch failed:', err);
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

  const loadEscalations = useCallback(async () => {
    try {
      const result = await getEscalationPrompts();
      setEscalationPrompts(result);
    } catch (err) {
      console.error('[ActivityScreen] loadEscalations failed:', err);
    }
  }, []);

  const handleEscalationAccept = useCallback(async (promptId: string) => {
    await respondToEscalation(promptId, true).catch(() => {});
    setEscalationPrompts(prev => prev.filter(p => p.id !== promptId));
    play('action_approved');
  }, [play]);

  const handleEscalationDismiss = useCallback(async (promptId: string) => {
    await respondToEscalation(promptId, false).catch(() => {});
    setEscalationPrompts(prev => prev.filter(p => p.id !== promptId));
  }, []);

  const handleUndoReceipt = useCallback(async (receiptId: string) => {
    await undoAlterEgoReceipt(receiptId).catch(() => {});
    loadAlterEgoReceipts();
  }, [loadAlterEgoReceipts]);

  useEffect(() => {
    loadEntries();
    loadAlterEgoReceipts();
    loadPendingBatch();
    loadEscalations();
    getAlterEgoWeekProgress().then(setWeekProgress).catch(() => {});
  }, [loadEntries, loadAlterEgoReceipts, loadPendingBatch, loadEscalations]);

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
    <div className="h-full overflow-y-auto">
      <div className="max-w-container-lg mx-auto px-6 py-8 space-y-6">
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px' }}>
        {(['all', 'success', 'pending', 'error', 'alter_ego'] as const).map((status) => {
          const filterLabels: Record<string, string> = {
            all: t('screen.activity.filter_all'),
            success: t('screen.activity.filter_success'),
            pending: t('screen.activity.filter_pending'),
            error: t('screen.activity.filter_error'),
            alter_ego: t('screen.alter_ego.filter_alter_ego'),
          };
          const isActive = filterStatus === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setFilterStatus(status)}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                borderRadius: 6,
                border: isActive ? '1px solid rgba(110, 207, 163, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                background: isActive ? 'rgba(110, 207, 163, 0.06)' : 'none',
                color: isActive ? '#6ECFA3' : '#8593A4',
                fontFamily: "'DM Mono', monospace",
                cursor: 'pointer',
              }}
            >
              {filterLabels[status]}
            </button>
          );
        })}
      </div>

      {/* Alter Ego Week Progress */}
      {weekProgress?.isActive && (
        <AlterEgoWeekCard
          progress={weekProgress}
          currentDayConfig={weekProgress.currentDayConfig}
          onComplete={async (day) => {
            await completeAlterEgoDay(day).catch(() => {});
            const updated = await getAlterEgoWeekProgress().catch(() => null);
            setWeekProgress(updated);
          }}
          onSkip={async () => {
            await skipAlterEgoDay().catch(() => {});
            const updated = await getAlterEgoWeekProgress().catch(() => null);
            setWeekProgress(updated);
          }}
        />
      )}

      {/* Escalation Prompts */}
      {escalationPrompts.map(prompt => (
        <EscalationPromptCard
          key={prompt.id}
          prompt={prompt}
          onAccepted={() => handleEscalationAccept(prompt.id)}
          onDismissed={() => handleEscalationDismiss(prompt.id)}
        />
      ))}

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
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <p style={{ color: '#8593A4', fontSize: 14 }}>
              {t('screen.activity.empty', { name })}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '0 16px' }}>
            {weekGroups.map((week) => (
              <div key={week} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="settings-section-header">
                  {t('screen.alter_ego.week_header', { week })}
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400 }}>({receiptsByWeek[week]!.length} actions)</span>
                </div>
                {receiptsByWeek[week]!.map((receipt) => (
                  <AlterEgoReceipt
                    key={receipt.id}
                    id={receipt.id}
                    summary={receipt.summary}
                    reasoning={receipt.reasoning}
                    undoExpiresAt={receipt.undoExpiresAt ?? null}
                    onUndo={handleUndoReceipt}
                    onDismiss={() => {
                      // Refresh receipts list after dismiss
                      loadAlterEgoReceipts();
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )
      ) : (
        /* Standard action log */
        filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <p style={{ color: '#8593A4', fontSize: 14 }}>
              {t('screen.activity.empty', { name })}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px' }}>
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
                    {entry.reasoningContext && (
                      <div className="mt-3 pt-3 border-t border-semblance-border dark:border-semblance-border-dark space-y-2">
                        <p className="text-semblance-text-secondary dark:text-semblance-text-secondary-dark font-medium">
                          {t('screen.activity.reasoning_based_on')}
                        </p>
                        <p className="text-semblance-text-tertiary italic">
                          &ldquo;{entry.reasoningContext.query}&rdquo;
                        </p>
                        {entry.reasoningContext.chunks.map((chunk) => (
                          <div
                            key={chunk.chunkId}
                            className="flex items-start gap-2 py-1"
                          >
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-semblance-surface-2 dark:bg-semblance-surface-2-dark text-semblance-text-tertiary text-[10px] uppercase tracking-wider shrink-0">
                              {chunk.source}
                            </span>
                            <span className="text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                              {chunk.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        )
      )}
      </div>
    </div>
  );
}
