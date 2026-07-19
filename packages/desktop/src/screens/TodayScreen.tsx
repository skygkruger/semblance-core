import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@semblance/ui';
import { ContentBracket } from '../components/ContentBracket';
import { GhostSprite } from '../components/GhostSprite';
import { ShimmerDescription } from '../components/ShimmerDescription';
import { getTodaySnapshot } from '../ipc/commands';
import type { TodaySnapshotResult } from '../ipc/types';

const COLORS = {
  background: '#0B0E11',
  surface: '#111518',
  veridian: '#6ECFA3',
  silver: '#8593A4',
  text: '#EEF1F4',
  caution: '#B09A8A',
  critical: '#B07A8A',
} as const;

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: COLORS.text }}>{title}</h2>
      <span style={{ fontSize: 12, color: COLORS.silver }}>{count}</span>
    </div>
  );
}

function EmptySection({ message }: { message: string }) {
  return (
    <p style={{ margin: 0, fontSize: 13, color: COLORS.silver, lineHeight: 1.5 }}>{message}</p>
  );
}

interface ItemRowProps {
  title: string;
  subtitle?: string;
  meta?: string;
  accent?: string;
}

function ItemRow({ title, subtitle, meta, accent }: ItemRowProps) {
  return (
    <div
      style={{
        padding: '10px 0',
        borderBottom: `1px solid ${COLORS.surface}`,
      }}
    >
      <div style={{ fontSize: 14, color: accent ?? COLORS.text }}>{title}</div>
      {subtitle ? (
        <div style={{ fontSize: 12, color: COLORS.silver, marginTop: 4 }}>{subtitle}</div>
      ) : null}
      {meta ? (
        <div style={{ fontSize: 11, color: COLORS.silver, marginTop: 4, opacity: 0.8 }}>{meta}</div>
      ) : null}
    </div>
  );
}

export function TodayScreen() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<TodaySnapshotResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getTodaySnapshot();
      setSnapshot(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="page-scroll" style={{ backgroundColor: COLORS.background }}>
        <div className="page-layout">
          <ShimmerDescription text="Assembling your Today snapshot…" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-scroll" style={{ backgroundColor: COLORS.background }}>
        <div className="page-layout">
          <Card>
            <p style={{ color: COLORS.critical, margin: 0 }}>{error}</p>
          </Card>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="page-scroll" style={{ backgroundColor: COLORS.background }}>
        <div className="page-layout">
          <Card>
            <p style={{ color: COLORS.silver, margin: 0 }}>Today snapshot unavailable.</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="page-scroll" style={{ backgroundColor: COLORS.background }}>
      <div className="page-layout">
        <ContentBracket>
          <GhostSprite insight="Today surfaces real local changes, risks, and outcomes — never demo rows.">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h1 className="page-title" style={{ fontSize: 28, color: COLORS.text, margin: 0 }}>Today</h1>
                <ShimmerDescription text={`Outcome-aware control surface · ${snapshot.date}`} />
              </div>
              <button
                type="button"
                onClick={() => navigate('/morning-brief')}
                style={{
                  background: 'transparent',
                  border: `1px solid ${COLORS.veridian}`,
                  color: COLORS.veridian,
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Morning brief
              </button>
            </div>
          </GhostSprite>

        {snapshot.isEmpty ? (
          <Card>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <GhostSprite size={48} />
              <div>
                <p style={{ margin: 0, color: COLORS.text, fontSize: 15 }}>
                  Nothing queued yet today.
                </p>
                <p style={{ margin: '8px 0 0', color: COLORS.silver, fontSize: 13, lineHeight: 1.5 }}>
                  Connect services in Settings → Connections, index files, or let Semblance act on your behalf.
                  This surface only shows real local data — no demo rows.
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <SectionHeader title="Universal Inbox" count={
            snapshot.inbox.triage.length
            + snapshot.inbox.pendingReplies.length
            + snapshot.inbox.representativeActions.length
          } />
          {snapshot.inbox.triage.length === 0
            && snapshot.inbox.pendingReplies.length === 0
            && snapshot.inbox.representativeActions.length === 0 ? (
              <EmptySection message="No inbox triage, pending replies, or representative actions." />
            ) : (
              <>
                {snapshot.inbox.triage.map(item => (
                  <ItemRow
                    key={item.id}
                    title={item.title}
                    subtitle={item.summary}
                    meta={`Triage · ${item.priority} · ${formatTimestamp(item.createdAt)}`}
                    accent={COLORS.veridian}
                  />
                ))}
                {snapshot.inbox.pendingReplies.map(item => (
                  <ItemRow
                    key={item.id}
                    title={item.subject || '(no subject)'}
                    subtitle={`From ${item.from} · ${item.snippet}`}
                    meta={`Pending reply · ${formatTimestamp(item.receivedAt)}`}
                  />
                ))}
                {snapshot.inbox.representativeActions.map(item => (
                  <ItemRow
                    key={item.id}
                    title={item.subject}
                    subtitle={`Representative workflow · ${item.status}`}
                    meta={formatTimestamp(item.updatedAt)}
                  />
                ))}
              </>
            )}
          <button
            type="button"
            onClick={() => navigate('/inbox')}
            style={{
              marginTop: 12,
              background: 'transparent',
              border: 'none',
              color: COLORS.veridian,
              fontSize: 12,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Open inbox →
          </button>
        </Card>

        <Card>
          <SectionHeader title="Recent changes" count={snapshot.changes.length} />
          {snapshot.changes.length === 0 ? (
            <EmptySection message="No recent vault or indexed document changes in the last 7 days." />
          ) : (
            snapshot.changes.map(change => (
              <ItemRow
                key={change.id}
                title={change.title}
                subtitle={`${change.source}${change.sourcePath ? ` · ${change.sourcePath}` : ''}`}
                meta={`${change.changeType} · ${formatTimestamp(change.updatedAt)}`}
              />
            ))
          )}
        </Card>

        <Card>
          <SectionHeader title="Risks" count={snapshot.risks.length} />
          {snapshot.risks.length === 0 ? (
            <EmptySection message="No pending approvals, failed actions, or high-priority insights." />
          ) : (
            snapshot.risks.map(risk => (
              <ItemRow
                key={risk.id}
                title={risk.title}
                subtitle={risk.description}
                meta={`${risk.domain} · ${risk.severity} · ${formatTimestamp(risk.createdAt)}`}
                accent={risk.severity === 'high' ? COLORS.critical : COLORS.caution}
              />
            ))
          )}
        </Card>

        <Card>
          <SectionHeader title="Completed actions" count={snapshot.completedActions.length} />
          {snapshot.completedActions.length === 0 ? (
            <EmptySection message="No completed actions recorded today." />
          ) : (
            snapshot.completedActions.map(action => (
              <ItemRow
                key={action.id}
                title={action.description}
                subtitle={action.actionType}
                meta={formatTimestamp(action.completedAt)}
                accent={COLORS.veridian}
              />
            ))
          )}
        </Card>

        <Card>
          <SectionHeader title="Pending decisions" count={snapshot.pendingDecisions.length} />
          {snapshot.pendingDecisions.length === 0 ? (
            <EmptySection message="No approvals, intent observations, or workflows awaiting a decision." />
          ) : (
            snapshot.pendingDecisions.map(decision => (
              <ItemRow
                key={decision.id}
                title={decision.title}
                subtitle={decision.description}
                meta={`${decision.domain} · ${formatTimestamp(decision.createdAt)}`}
              />
            ))
          )}
        </Card>

        <Card>
          <SectionHeader title="Measured outcomes" count={snapshot.outcomes.length} />
          {snapshot.outcomes.length === 0 ? (
            <EmptySection message="No measured time-saved or workflow outcomes yet today." />
          ) : (
            snapshot.outcomes.map(outcome => (
              <ItemRow
                key={outcome.id}
                title={outcome.title}
                subtitle={outcome.timeSavedSeconds > 0 ? `${outcome.timeSavedSeconds}s saved` : outcome.source}
                meta={formatTimestamp(outcome.measuredAt)}
              />
            ))
          )}
        </Card>

        <Card>
          <SectionHeader title="Agency verticals" count={snapshot.agencyVerticals.length} />
          {snapshot.agencyVerticals.length === 0 ? (
            <EmptySection message="No domain vertical workflows completed yet. Run agency workflows from Work or sidecar IPC." />
          ) : (
            snapshot.agencyVerticals.map((vertical) => (
              <ItemRow
                key={`${vertical.domain}-${vertical.completedAt}`}
                title={`${vertical.domain}: ${vertical.title}`}
                subtitle={vertical.summary}
                meta={`${vertical.mode}${vertical.linkId ? ` · link ${vertical.linkId}` : ''} · ${formatTimestamp(vertical.completedAt)}`}
                accent={vertical.mode === 'gated' ? COLORS.caution : COLORS.veridian}
              />
            ))
          )}
          <button
            type="button"
            onClick={() => navigate('/work')}
            style={{
              marginTop: 12,
              background: 'transparent',
              border: 'none',
              color: COLORS.veridian,
              fontSize: 12,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Open work →
          </button>
        </Card>

        <Card>
          <SectionHeader title="Provenance" count={snapshot.provenance.totalDocuments} />
          {snapshot.provenance.totalDocuments === 0 ? (
            <EmptySection message="Vault is empty — index files or connect data sources to populate provenance." />
          ) : (
            <>
              <ItemRow
                title={`${snapshot.provenance.totalDocuments} indexed documents`}
                subtitle={
                  snapshot.provenance.connectedSources.length > 0
                    ? `Sources: ${snapshot.provenance.connectedSources.join(', ')}`
                    : undefined
                }
                meta={
                  snapshot.provenance.lastIndexedAt
                    ? `Last indexed ${formatTimestamp(snapshot.provenance.lastIndexedAt)}`
                    : undefined
                }
              />
              {snapshot.provenance.auditChainValid !== null ? (
                <ItemRow
                  title="Audit chain"
                  subtitle={snapshot.provenance.auditChainValid ? 'Integrity verified' : 'Integrity check failed'}
                  accent={snapshot.provenance.auditChainValid ? COLORS.veridian : COLORS.critical}
                />
              ) : null}
            </>
          )}
        </Card>
        </ContentBracket>
      </div>
    </div>
  );
}
