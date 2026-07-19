import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, SkeletonCard, StatusIndicator } from '@semblance/ui';
import { ContentBracket } from '../components/ContentBracket';
import { GhostSprite } from '../components/GhostSprite';
import { ShimmerDescription } from '../components/ShimmerDescription';
import {
  deleteVaultSource,
  exportVaultSnapshot,
  listVaultAssertions,
  listVaultSources,
} from '../ipc/commands';
import type { VaultAssertionSummary, VaultSourceSummary } from '../ipc/types';
import { useTauriEvent } from '../hooks/useTauriEvent';

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatRetention(until: string | null): string {
  if (!until) return 'Default retention';
  const date = new Date(until);
  if (Number.isNaN(date.getTime())) return 'Default retention';
  return `Until ${date.toLocaleDateString()}`;
}

export function VaultScreen() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<VaultSourceSummary[]>([]);
  const [assertions, setAssertions] = useState<VaultAssertionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busySourceId, setBusySourceId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSources, nextAssertions] = await Promise.all([
        listVaultSources(),
        listVaultAssertions(),
      ]);
      setSources(nextSources);
      setAssertions(nextAssertions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useTauriEvent('semblance://indexing-complete', useCallback(() => {
    void refresh();
  }, [refresh]));

  const handleExport = useCallback(async () => {
    setActionMessage(null);
    try {
      const snapshot = await exportVaultSnapshot();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `semblance-vault-${snapshot.exportedAt.slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setActionMessage('Vault export downloaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleDeleteSource = useCallback(async (sourceId: string) => {
    setBusySourceId(sourceId);
    setActionMessage(null);
    setError(null);
    try {
      await deleteVaultSource(sourceId);
      setActionMessage('Source scheduled for cryptographic erasure.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusySourceId(null);
    }
  }, [refresh]);

  const activeSources = sources.filter((source) => !source.deleted);

  return (
    <div className="page-scroll">
      <div className="page-layout">
        <ContentBracket>
          <GhostSprite insight="Your personal vault keeps sources, assertions, and provenance on-device.">
            <h1
              className="page-title"
              style={{
                fontSize: 28,
                maxWidth: 880,
                width: '100%',
                marginLeft: 'auto',
                marginRight: 'auto',
                color: '#EEF1F4',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Personal Vault
            </h1>
            <div style={{ maxWidth: 880, width: '100%', margin: '0 auto' }}>
              <ShimmerDescription text="Sources, derived memory, and provenance — fully local" />
            </div>

            <div
              className="settings-screen surface-void"
              style={{ minHeight: 'auto', maxWidth: 880, margin: '0 auto' }}
            >
              <div className="settings-content">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '0 16px 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusIndicator status={activeSources.length > 0 ? 'success' : 'muted'} />
                    <span
                      style={{
                        color: '#8593A4',
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 12,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {activeSources.length} active sources · {assertions.length} assertions
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      aria-label="Export vault snapshot"
                      onClick={() => { void handleExport(); }}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid rgba(110, 207, 163, 0.35)',
                        background: '#111518',
                        color: '#6ECFA3',
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      aria-label="Refresh vault data"
                      onClick={() => { void refresh(); }}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid rgba(133, 147, 164, 0.35)',
                        background: '#111518',
                        color: '#8593A4',
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {actionMessage ? (
                  <p
                    role="status"
                    style={{
                      padding: '0 16px 12px',
                      color: '#6ECFA3',
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 12,
                    }}
                  >
                    {actionMessage}
                  </p>
                ) : null}

                {error ? (
                  <p
                    role="alert"
                    style={{
                      padding: '0 16px 12px',
                      color: '#B07A8A',
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 12,
                    }}
                  >
                    {error}
                  </p>
                ) : null}

                {loading ? (
                  <div style={{ padding: '0 16px' }}>
                    <SkeletonCard variant="generic" message="Loading vault" subMessage="Reading encrypted event projections" showSpinner />
                  </div>
                ) : (
                  <>
                    <div className="settings-section-header bracket-section">Sources</div>
                    {activeSources.length === 0 ? (
                      <div style={{ padding: '0 16px 20px' }}>
                        <Card>
                          <div style={{ padding: 16, color: '#8593A4', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
                            No vault sources yet. Index files from the Files screen to populate your vault.
                            <button
                              type="button"
                              aria-label="Open Files screen"
                              onClick={() => navigate('/files')}
                              style={{
                                display: 'block',
                                marginTop: 12,
                                padding: 0,
                                border: 'none',
                                background: 'transparent',
                                color: '#6ECFA3',
                                fontFamily: "'DM Sans', sans-serif",
                                fontSize: 14,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                            >
                              Go to Files
                            </button>
                          </div>
                        </Card>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px 20px' }}>
                        {activeSources.map((source) => (
                          <Card key={source.sourceId}>
                            <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    color: '#EEF1F4',
                                    fontFamily: "'DM Sans', sans-serif",
                                    fontSize: 15,
                                    marginBottom: 6,
                                  }}
                                >
                                  {source.title}
                                </div>
                                <div
                                  style={{
                                    color: '#8593A4',
                                    fontFamily: "'DM Mono', monospace",
                                    fontSize: 11,
                                    letterSpacing: '0.04em',
                                    marginBottom: 4,
                                  }}
                                >
                                  {source.sourceId}
                                </div>
                                <div
                                  style={{
                                    color: '#8593A4',
                                    fontFamily: "'DM Mono', monospace",
                                    fontSize: 11,
                                  }}
                                >
                                  Ingested {new Date(source.ingestedAt).toLocaleString()} · {formatRetention(source.retentionUntil)}
                                </div>
                              </div>
                              <button
                                type="button"
                                aria-label={`Delete vault source ${source.title}`}
                                disabled={busySourceId === source.sourceId}
                                onClick={() => { void handleDeleteSource(source.sourceId); }}
                                style={{
                                  alignSelf: 'flex-start',
                                  padding: '8px 12px',
                                  borderRadius: 8,
                                  border: '1px solid rgba(176, 122, 138, 0.45)',
                                  background: '#111518',
                                  color: '#B07A8A',
                                  fontFamily: "'DM Sans', sans-serif",
                                  fontSize: 12,
                                  cursor: busySourceId === source.sourceId ? 'wait' : 'pointer',
                                  opacity: busySourceId === source.sourceId ? 0.6 : 1,
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}

                    <div className="settings-section-header bracket-section">Derived Assertions</div>
                    {assertions.length === 0 ? (
                      <div style={{ padding: '0 16px 24px', color: '#8593A4', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                        Confirmed or corrected memories will appear here with confidence and provenance.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px 24px' }}>
                        {assertions.map((assertion) => (
                          <Card key={assertion.assertionId}>
                            <div style={{ padding: 16 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                                <span
                                  style={{
                                    color: '#EEF1F4',
                                    fontFamily: "'DM Sans', sans-serif",
                                    fontSize: 15,
                                  }}
                                >
                                  {assertion.object}
                                </span>
                                <span
                                  style={{
                                    color: '#6ECFA3',
                                    fontFamily: "'DM Mono', monospace",
                                    fontSize: 11,
                                  }}
                                >
                                  {formatConfidence(assertion.confidence)}
                                </span>
                              </div>
                              <div
                                style={{
                                  color: '#8593A4',
                                  fontFamily: "'DM Mono', monospace",
                                  fontSize: 11,
                                  marginBottom: 4,
                                }}
                              >
                                {assertion.subject} · {assertion.predicate} · {assertion.derivationMethod}
                                {assertion.corrected ? ' · corrected' : ''}
                              </div>
                              <div
                                style={{
                                  color: '#8593A4',
                                  fontFamily: "'DM Mono', monospace",
                                  fontSize: 11,
                                }}
                              >
                                Provenance: {assertion.sourceIds.length > 0 ? assertion.sourceIds.join(', ') : 'user confirmed'}
                                {' · '}
                                {formatRetention(assertion.retentionUntil)}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </GhostSprite>
        </ContentBracket>
      </div>
    </div>
  );
}
