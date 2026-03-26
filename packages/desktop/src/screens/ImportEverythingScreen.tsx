/**
 * ImportEverythingScreen — Import user's digital life into the local knowledge graph.
 * DR-gated: requires Digital Representative license.
 * Backend handlers: import_detect_sources, import_run_source, import_everything_get_history.
 */

import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Card, Button, FeatureGate, SkeletonCard, StatusIndicator, ProgressBar } from '@semblance/ui';
import { sidecarCall } from '../ipc/commands';
import { useLicense } from '../contexts/LicenseContext';

interface ImportSource {
  id: string;
  name: string;
  type: string;
  path?: string;
  size?: number;
}

interface ImportHistoryRecord {
  source: string;
  timestamp: string;
  itemsImported: number;
  status: 'success' | 'partial' | 'failed';
}

interface ImportProgress {
  source: string;
  current: number;
  total: number;
  phase?: string;
}


function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function ImportEverythingScreen() {
  const license = useLicense();
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [sources, setSources] = useState<ImportSource[]>([]);
  const [history, setHistory] = useState<ImportHistoryRecord[]>([]);
  const [importingSource, setImportingSource] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load history on mount
  useEffect(() => {
    setLoading(true);
    sidecarCall<ImportHistoryRecord[]>('import_everything_get_history')
      .then((hist) => {
        if (Array.isArray(hist)) setHistory(hist);
      })
      .catch((err) => console.error('[ImportEverythingScreen] Failed to load history:', err))
      .finally(() => setLoading(false));
  }, []);

  // Listen for import progress events
  useEffect(() => {
    const unlisten = listen<ImportProgress>('import:progress', (event) => {
      setProgress(event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const handleDetect = useCallback(async () => {
    setDetecting(true);
    setError(null);
    try {
      const detected = await sidecarCall<ImportSource[]>('import_detect_sources');
      setSources(Array.isArray(detected) ? detected : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetecting(false);
    }
  }, []);

  const handleImport = useCallback(async (sourceId: string) => {
    setImportingSource(sourceId);
    setProgress(null);
    setError(null);
    try {
      await sidecarCall<{ success: boolean }>('import_run_source', { source: sourceId });
      // Refresh history after import
      const hist = await sidecarCall<ImportHistoryRecord[]>('import_everything_get_history');
      if (Array.isArray(hist)) setHistory(hist);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImportingSource(null);
      setProgress(null);
    }
  }, []);

  // Premium gate
  if (!license.isPremium) {
    return (
      <div className="h-full overflow-y-auto">
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
          <h1 style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 28,
            fontWeight: 300,
            color: '#EEF1F4',
            margin: 0,
            marginBottom: 24,
          }}>
            Import Everything
          </h1>
          <FeatureGate
            feature="import-digital-life"
            isPremium={license.isPremium}
            onLearnMore={() => license.openCheckout?.('monthly')}
          >
            <div />
          </FeatureGate>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <h1 style={{
          fontFamily: "'Fraunces', serif",
          fontSize: 28,
          fontWeight: 300,
          color: '#EEF1F4',
          margin: 0,
          marginBottom: 6,
        }}>
          Import Everything
        </h1>
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 14,
          color: '#8593A4',
          margin: 0,
          marginBottom: 32,
          lineHeight: 1.5,
        }}>
          Bring your digital life into your local knowledge graph.
        </p>

        {/* Error */}
        {error && (
          <Card style={{ marginBottom: 20, borderColor: 'rgba(176, 122, 138, 0.3)', background: 'rgba(176, 122, 138, 0.12)' }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#B07A8A', margin: 0 }}>
              {error}
            </p>
          </Card>
        )}

        {/* Source Detection */}
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{
              fontFamily: "'Fraunces', serif",
              fontWeight: 300,
              fontSize: 18,
              color: '#EEF1F4',
              margin: 0,
            }}>
              Importable Sources
            </h2>
            <Button
              variant="ghost"
              size="sm"
              disabled={detecting}
              onClick={handleDetect}
            >
              {detecting ? 'Scanning...' : 'Detect Sources'}
            </Button>
          </div>

          {sources.length === 0 ? (
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              color: '#5E6B7C',
              margin: 0,
              lineHeight: 1.5,
            }}>
              {detecting
                ? 'Scanning your system for importable data...'
                : "Click 'Detect Sources' to scan your system for importable data."}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sources.map((source) => {
                const isImporting = importingSource === source.id;
                const showProgress = isImporting && progress && progress.source === source.id;
                return (
                  <div key={source.id} style={{
                    background: '#171B1F',
                    borderRadius: 8,
                    padding: 14,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#EEF1F4' }}>
                          {source.name}
                        </div>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', marginTop: 2 }}>
                          {source.type}
                          {source.path ? ` \u00B7 ${source.path}` : ''}
                          {source.size ? ` \u00B7 ${formatBytes(source.size)}` : ''}
                        </div>
                      </div>
                      <Button
                        variant="solid"
                        size="sm"
                        disabled={importingSource !== null}
                        onClick={() => handleImport(source.id)}
                      >
                        {isImporting ? 'Importing...' : 'Import'}
                      </Button>
                    </div>
                    {/* Progress bar */}
                    {showProgress && progress && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                        }}>
                          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#8593A4' }}>
                            {progress.phase ?? 'Importing'}
                          </span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#8593A4' }}>
                            {progress.current} / {progress.total}
                          </span>
                        </div>
                        <ProgressBar
                          value={progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}
                          max={100}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Import History */}
        <Card>
          <h2 style={{
            fontFamily: "'Fraunces', serif",
            fontWeight: 300,
            fontSize: 18,
            color: '#EEF1F4',
            margin: 0,
            marginBottom: 16,
          }}>
            Import History
          </h2>

          {loading ? (
            <SkeletonCard
              variant="generic"
              message="Scanning your digital life"
              subMessage="Detecting available import sources"
              showSpinner
            />
          ) : history.length === 0 ? (
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              color: '#5E6B7C',
              margin: 0,
            }}>
              No imports yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((record, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: i < history.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusIndicator
                      status={record.status === 'success' ? 'success' : record.status === 'partial' ? 'attention' : 'muted'}
                    />
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#EEF1F4' }}>
                      {record.source}
                    </span>
                    <span style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 11,
                      color: record.status === 'success' ? '#6ECFA3' : record.status === 'partial' ? '#B09A8A' : '#B07A8A',
                    }}>
                      {record.itemsImported} items
                    </span>
                  </div>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C' }}>
                    {formatTimestamp(record.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
