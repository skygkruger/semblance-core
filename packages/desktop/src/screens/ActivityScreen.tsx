import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionCard, AlterEgoBatchReview, ActionLogItem, AlterEgoReceipt, AlterEgoDraftReview, Input } from '@semblance/ui';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const loadEntries = useCallback(async () => {
    try {
      const result = await getActionLog(50, 0);
      const entries = result ?? [];
      setEntries(entries);
      setOffset(0);
      setHasMore(entries.length >= 50);
    } catch (err) {
      console.error('[ActivityScreen] loadEntries failed:', err);
    }
  }, []);

  const loadAlterEgoReceipts = useCallback(async () => {
    try {
      const result = await getAlterEgoReceipts();
      if (result) setAlterEgoReceipts(result);
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
      setEscalationPrompts(result ?? []);
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

  const loadMore = useCallback(async () => {
    try {
      const nextOffset = offset + 50;
      const more = await getActionLog(50, nextOffset) ?? [];
      if (more.length < 50) setHasMore(false);
      setEntries(prev => [...prev, ...more]);
      setOffset(nextOffset);
    } catch (err) {
      console.error('[ActivityScreen] loadMore failed:', err);
    }
  }, [offset]);

  useEffect(() => {
    loadEntries();
    loadAlterEgoReceipts();
    loadPendingBatch();
    loadEscalations();
    getAlterEgoWeekProgress().then(setWeekProgress).catch(() => {});
  }, [loadEntries, loadAlterEgoReceipts, loadPendingBatch, loadEscalations]);

  const searchFiltered = searchQuery.trim()
    ? entries.filter(e =>
        e.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.description.toLowerCase().includes(searchQuery.toLowerCase()))
    : entries;

  const filtered = filterStatus === 'all'
    ? searchFiltered
    : filterStatus === 'alter_ego'
      ? [] // Alter Ego mode uses separate receipt list
      : searchFiltered.filter((e) => e.status === filterStatus);

  // Group alter ego receipts by weekGroup
  const receiptsByWeek = alterEgoReceipts.reduce<Record<string, AlterEgoReceiptData[]>>((acc, r) => {
    const key = r.weekGroup;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(r);
    return acc;
  }, {});

  const weekGroups = Object.keys(receiptsByWeek).sort().reverse();

  return (
    <div className="page-scroll">
      <div className="page-layout">
      <h1 className="page-title" style={{ fontSize: 28, marginBottom: 16 }}>
        Activity Log
      </h1>

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <Input
          placeholder="Search actions..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px' }}>
        {(['all', 'success', 'pending', 'error', 'rejected', 'alter_ego'] as const).map((status) => {
          const filterLabels: Record<string, string> = {
            all: t('screen.activity.filter_all'),
            success: t('screen.activity.filter_success'),
            pending: t('screen.activity.filter_pending'),
            error: t('screen.activity.filter_error'),
            rejected: t('screen.activity.filter_rejected', 'Rejected'),
            alter_ego: t('screen.alter_ego.filter_alter_ego'),
          };
          const isActive = filterStatus === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setFilterStatus(status)}
              className={isActive ? 'surface-pill' : ''}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                borderRadius: 8,
                border: isActive ? 'none' : '1px solid rgba(255, 255, 255, 0.06)',
                background: isActive ? undefined : 'transparent',
                color: isActive ? '#6ECFA3' : '#5E6B7C',
                fontFamily: "'DM Mono', monospace",
                cursor: 'pointer',
                letterSpacing: '0.04em',
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
          <div className="surface-slate" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <p style={{ color: '#A8B4C0', fontSize: 12, fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em', margin: 0 }}>
              {t('screen.activity.empty', { name })}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '0 16px' }}>
            {weekGroups.map((week) => (
              <div key={week} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="settings-section-header">
                  {t('screen.alter_ego.week_header', { week })}
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: '#5E6B7C', fontFamily: "'DM Mono', monospace" }}>({receiptsByWeek[week]!.length} actions)</span>
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
          <div className="surface-slate" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <p style={{ color: '#A8B4C0', fontSize: 12, fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em', margin: 0 }}>
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
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <p style={{ margin: 0 }}>{t('screen.activity.payload_hash', { hash: entry.payload_hash })}</p>
                    <p style={{ margin: 0 }}>{t('screen.activity.audit_reference', { ref: entry.audit_ref })}</p>
                    {entry.estimatedTimeSaved > 0 && (
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#6ECFA3' }}>
                        ~{Math.round(entry.estimatedTimeSaved / 60)}min saved
                      </span>
                    )}
                    {entry.reasoningContext && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <p style={{ margin: 0, fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#B8C0C8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          {t('screen.activity.reasoning_based_on')}
                        </p>
                        <p style={{ margin: 0, fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#5E6B7C', letterSpacing: '0.04em', fontStyle: 'italic' }}>
                          &ldquo;{entry.reasoningContext.query}&rdquo;
                        </p>
                        {(entry.reasoningContext.chunks ?? []).map((chunk) => (
                          <div
                            key={chunk.chunkId}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingTop: 4, paddingBottom: 4 }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.04)', fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#5E6B7C', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
                              {chunk.source}
                            </span>
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#A8B4C0', letterSpacing: '0.04em' }}>
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
            {hasMore && filterStatus !== 'alter_ego' && (
              <button
                type="button"
                onClick={loadMore}
                className="surface-slate surface-slate--hoverable"
                style={{
                  padding: '10px 20px', margin: '12px auto', display: 'block',
                  color: '#5E6B7C', fontSize: 11,
                  fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em', cursor: 'pointer',
                }}
              >
                Load More
              </button>
            )}
          </div>
        )
      )}
      </div>
    </div>
  );
}
