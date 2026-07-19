import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@semblance/ui';
import { ContentBracket } from '../components/ContentBracket';
import { GhostSprite } from '../components/GhostSprite';
import { ShimmerDescription } from '../components/ShimmerDescription';
import { getProofCenterSnapshot } from '../ipc/commands';
import type { ProofCenterSnapshotResult, ProofEvidenceStatus } from '../ipc/types';

const COLORS = {
  background: '#0B0E11',
  surface: '#111518',
  veridian: '#6ECFA3',
  silver: '#8593A4',
  text: '#EEF1F4',
  caution: '#B09A8A',
  critical: '#B07A8A',
} as const;

const SOVEREIGNTY_LINKS = [
  { path: '/privacy', label: 'Privacy' },
  { path: '/network', label: 'Network monitor' },
  { path: '/sovereignty-report', label: 'Sovereignty report' },
  { path: '/activity', label: 'Activity' },
  { path: '/witness', label: 'Witness' },
  { path: '/connections', label: 'Connections' },
  { path: '/settings/backup', label: 'Backup' },
] as const;

function statusColor(status: ProofEvidenceStatus): string {
  switch (status) {
    case 'current':
      return COLORS.veridian;
    case 'historical':
      return COLORS.silver;
    case 'pending':
    case 'stale':
      return COLORS.caution;
    case 'tampered':
      return COLORS.critical;
    case 'unavailable':
    default:
      return COLORS.silver;
  }
}

function statusLabel(status: ProofEvidenceStatus): string {
  switch (status) {
    case 'current':
      return 'Current';
    case 'historical':
      return 'Historical';
    case 'pending':
      return 'Pending';
    case 'stale':
      return 'Stale';
    case 'tampered':
      return 'Tampered';
    case 'unavailable':
      return 'Unavailable';
    default:
      return status;
  }
}

interface ProofClassRowProps {
  title: string;
  summary: string;
  status: ProofEvidenceStatus;
  artifactId: string | null;
  version: string | null;
  evidenceId: string | null;
  degradedReason?: string;
}

function ProofClassRow({
  title,
  summary,
  status,
  artifactId,
  version,
  evidenceId,
  degradedReason,
}: ProofClassRowProps) {
  const isDegraded = status === 'pending' || status === 'stale' || status === 'tampered' || status === 'unavailable';

  return (
    <div
      style={{
        padding: '14px 0',
        borderBottom: `1px solid ${COLORS.surface}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <div style={{ fontSize: 14, color: COLORS.text, fontWeight: 600 }}>{title}</div>
        <span
          style={{
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: statusColor(status),
            flexShrink: 0,
          }}
        >
          {statusLabel(status)}
        </span>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: COLORS.silver, lineHeight: 1.5 }}>{summary}</p>
      {isDegraded && degradedReason ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: statusColor(status), lineHeight: 1.5 }}>
          {degradedReason}
        </p>
      ) : null}
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, color: COLORS.silver }}>
        {artifactId ? <span>Artifact: {artifactId}</span> : null}
        {version ? <span>Version: {version}</span> : null}
        {evidenceId ? <span>Evidence: {evidenceId}</span> : null}
      </div>
    </div>
  );
}

export function ProofScreen() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<ProofCenterSnapshotResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getProofCenterSnapshot();
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
          <ShimmerDescription text="Assembling offline proof center…" />
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
            <p style={{ color: COLORS.silver, margin: 0 }}>Proof center snapshot unavailable.</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="page-scroll" style={{ backgroundColor: COLORS.background }}>
      <div className="page-layout">
        <ContentBracket>
          <GhostSprite insight="Every proof class is assembled from local records only — no telemetry or content egress.">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h1 className="page-title" style={{ fontSize: 28, color: COLORS.text, margin: 0 }}>Proof</h1>
                <ShimmerDescription text="Unified sovereignty proof center · offline inspectable" />
              </div>
              <button
                type="button"
                onClick={() => void refresh()}
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
                Refresh
              </button>
            </div>
          </GhostSprite>

          {snapshot.isEmpty ? (
            <Card>
              <p style={{ margin: 0, color: COLORS.text, fontSize: 15 }}>
                No user evidence artifacts yet.
              </p>
              <p style={{ margin: '8px 0 0', color: COLORS.silver, fontSize: 13, lineHeight: 1.5 }}>
                Architectural guarantees and policy pins are still inspectable below. Connect services, run actions,
                or enable Digital Representative capabilities to populate outcome-linked proof classes.
              </p>
            </Card>
          ) : null}

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: COLORS.text }}>Proof classes</h2>
              <span style={{ fontSize: 12, color: COLORS.silver }}>
                {snapshot.degradedCount} degraded · {snapshot.classes.length} total
              </span>
            </div>
            {snapshot.classes.map((entry) => (
              <ProofClassRow
                key={entry.id}
                title={entry.title}
                summary={entry.summary}
                status={entry.status}
                artifactId={entry.artifactId}
                version={entry.version}
                evidenceId={entry.evidenceId}
                degradedReason={entry.degradedReason}
              />
            ))}
          </Card>

          <Card>
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: COLORS.text }}>
              Related sovereignty surfaces
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SOVEREIGNTY_LINKS.map((link) => (
                <button
                  key={link.path}
                  type="button"
                  onClick={() => navigate(link.path)}
                  style={{
                    background: COLORS.surface,
                    border: `1px solid ${COLORS.silver}`,
                    color: COLORS.text,
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {link.label}
                </button>
              ))}
            </div>
          </Card>
        </ContentBracket>
      </div>
    </div>
  );
}
