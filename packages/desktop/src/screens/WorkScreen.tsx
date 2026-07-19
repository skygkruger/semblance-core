import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@semblance/ui';
import { ContentBracket } from '../components/ContentBracket';
import { GhostSprite } from '../components/GhostSprite';
import { ShimmerDescription } from '../components/ShimmerDescription';
import {
  approveWorkAction,
  getActionReceipt,
  listWorkActions,
} from '../ipc/commands';
import type { ActionReceipt, WorkActionState, WorkActionView } from '../ipc/types';

const COLORS = {
  background: '#0B0E11',
  surface: '#111518',
  veridian: '#6ECFA3',
  silver: '#8593A4',
  text: '#EEF1F4',
} as const;

const STATE_FILTERS: Array<{ id: 'all' | WorkActionState; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'proposed', label: 'Proposed' },
  { id: 'approved', label: 'Approved' },
  { id: 'dispatched', label: 'Dispatched' },
  { id: 'unknown', label: 'Unknown' },
  { id: 'failed', label: 'Failed' },
  { id: 'completed', label: 'Completed' },
];

function stateColor(state: WorkActionState): string {
  switch (state) {
    case 'completed':
      return COLORS.veridian;
    case 'failed':
    case 'rejected':
      return '#B07A8A';
    case 'unknown':
      return '#B09A8A';
    case 'proposed':
    case 'approved':
    case 'dispatched':
    default:
      return COLORS.silver;
  }
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function WorkScreen() {
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<WorkActionView[]>([]);
  const [filter, setFilter] = useState<'all' | WorkActionState>('all');
  const [error, setError] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<ActionReceipt | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await listWorkActions(100, 0);
      setActions(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredActions = useMemo(() => {
    if (filter === 'all') return actions;
    return actions.filter((action) => action.state === filter);
  }, [actions, filter]);

  const handleApprove = useCallback(async (actionId: string) => {
    setBusyActionId(actionId);
    setStatusMessage(null);
    setError(null);
    try {
      const result = await approveWorkAction(actionId);
      if (!result.success) {
        setError(result.error?.message ?? 'Approval failed');
      } else {
        setStatusMessage(`Action ${actionId} approved and dispatched.`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyActionId(null);
    }
  }, [refresh]);

  const handleViewReceipt = useCallback(async (actionId: string) => {
    setBusyActionId(actionId);
    setError(null);
    try {
      const receipt = await getActionReceipt(actionId);
      setReceiptPreview(receipt);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyActionId(null);
    }
  }, []);

  const handleUndoHint = useCallback((action: WorkActionView) => {
    if (!action.reversible) return;
    setStatusMessage(
      action.reversible.undoHint
        ?? `Undo token ${action.reversible.undoToken} expires ${formatTimestamp(action.reversible.undoExpiresAt)}`,
    );
  }, []);

  return (
    <div className="page-scroll" style={{ backgroundColor: COLORS.background, color: COLORS.text }}>
      <div className="page-layout">
        <ContentBracket>
          <GhostSprite insight="Every action Semblance takes on your behalf is logged, correlated, and provable.">
            <h1
              style={{
                fontFamily: '"Fraunces", serif',
                fontSize: '2rem',
                fontWeight: 500,
                color: COLORS.text,
                marginBottom: '0.5rem',
              }}
            >
              Work
            </h1>
            <ShimmerDescription>
              Proposed, approved, and completed actions with audit correlation and proof receipts.
            </ShimmerDescription>
          </GhostSprite>
        </ContentBracket>

        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap',
            margin: '1.5rem 0',
          }}
        >
          {STATE_FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                style={{
                  backgroundColor: active ? COLORS.veridian : COLORS.surface,
                  color: active ? COLORS.background : COLORS.text,
                  border: `1px solid ${active ? COLORS.veridian : '#1A2026'}`,
                  borderRadius: '999px',
                  padding: '0.4rem 0.9rem',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {statusMessage && (
          <p style={{ color: COLORS.veridian, marginBottom: '1rem' }}>{statusMessage}</p>
        )}
        {error && (
          <p style={{ color: '#B07A8A', marginBottom: '1rem' }}>{error}</p>
        )}

        {loading ? (
          <Card>
            <p style={{ color: COLORS.silver }}>Loading actions…</p>
          </Card>
        ) : filteredActions.length === 0 ? (
          <Card>
            <p style={{ color: COLORS.silver }}>No actions in this state yet.</p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredActions.map((action) => (
              <Card key={action.actionId}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span
                        style={{
                          color: stateColor(action.state),
                          fontSize: '0.75rem',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                        }}
                      >
                        {action.state}
                      </span>
                      <span style={{ color: COLORS.silver, fontSize: '0.85rem' }}>
                        {action.capability}
                      </span>
                    </div>
                    <p style={{ color: COLORS.text, margin: '0 0 0.35rem 0', fontWeight: 500 }}>
                      {action.actionType}
                    </p>
                    <p style={{ color: COLORS.silver, margin: '0 0 0.35rem 0', fontSize: '0.9rem' }}>
                      {action.autonomyRationale}
                    </p>
                    <p style={{ color: COLORS.silver, margin: 0, fontSize: '0.8rem' }}>
                      Audit: {action.auditCorrelationId}
                      {action.auditPendingId ? ` · pending ${action.auditPendingId}` : ''}
                    </p>
                    <p style={{ color: COLORS.silver, margin: '0.35rem 0 0 0', fontSize: '0.8rem' }}>
                      Updated {formatTimestamp(action.updatedAt)}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '140px' }}>
                    {action.state === 'proposed' && (
                      <button
                        type="button"
                        disabled={busyActionId === action.actionId}
                        onClick={() => void handleApprove(action.actionId)}
                        style={{
                          backgroundColor: COLORS.veridian,
                          color: COLORS.background,
                          border: 'none',
                          borderRadius: '8px',
                          padding: '0.5rem 0.75rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        Approve
                      </button>
                    )}
                    {action.state === 'completed' && (
                      <button
                        type="button"
                        disabled={busyActionId === action.actionId}
                        onClick={() => void handleViewReceipt(action.actionId)}
                        style={{
                          backgroundColor: COLORS.surface,
                          color: COLORS.veridian,
                          border: `1px solid ${COLORS.veridian}`,
                          borderRadius: '8px',
                          padding: '0.5rem 0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        View proof
                      </button>
                    )}
                    {action.reversible?.reversible && (
                      <button
                        type="button"
                        onClick={() => handleUndoHint(action)}
                        style={{
                          backgroundColor: COLORS.surface,
                          color: COLORS.text,
                          border: `1px solid ${COLORS.silver}`,
                          borderRadius: '8px',
                          padding: '0.5rem 0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        Undo
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {receiptPreview && (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ color: COLORS.text, fontSize: '1rem', margin: 0 }}>Action receipt</h2>
              <button
                type="button"
                onClick={() => setReceiptPreview(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: COLORS.silver,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
            <pre
              style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: COLORS.surface,
                color: COLORS.text,
                borderRadius: '8px',
                overflow: 'auto',
                fontSize: '0.75rem',
              }}
            >
              {JSON.stringify(receiptPreview, null, 2)}
            </pre>
          </Card>
        )}
      </div>
    </div>
  );
}
