/**
 * ImportEverythingScreen — Import user's digital life into the local knowledge graph.
 * DR-gated: requires Digital Representative license.
 * Backend handlers: import_detect_sources, import_run_source, import_everything_get_history.
 */

import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
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
      <div style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{
          fontFamily: "'Fraunces Variable', 'Fraunces', Georgia, serif",
          fontSize: 28,
          fontWeight: 300,
          color: '#EEF1F4',
          margin: 0,
          marginBottom: 6,
        }}>
          Import Everything
        </h1>
        <div style={{
          background: '#111518',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 12,
          padding: 24,
          marginTop: 24,
        }}>
          <p style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 14,
            color: '#A8B4C0',
            margin: 0,
            lineHeight: 1.6,
          }}>
            Import Everything brings your entire digital life into your local knowledge graph. This feature requires the Digital Representative tier.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}>
      {/* Header */}
      <h1 style={{
        fontFamily: "'Fraunces Variable', 'Fraunces', Georgia, serif",
        fontSize: 28,
        fontWeight: 300,
        color: '#EEF1F4',
        margin: 0,
        marginBottom: 6,
      }}>
        Import Everything
      </h1>
      <p style={{
        fontFamily: "'DM Sans', system-ui, sans-serif",
        fontSize: 14,
        color: '#A8B4C0',
        margin: 0,
        marginBottom: 32,
        lineHeight: 1.5,
      }}>
        Bring your digital life into your local knowledge graph.
      </p>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(176, 122, 138, 0.12)',
          border: '1px solid rgba(176, 122, 138, 0.3)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}>
          <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 13, color: '#B07A8A', margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      {/* Source Detection */}
      <div style={{
        background: '#111518',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 15,
            fontWeight: 500,
            color: '#CDD4DB',
            margin: 0,
          }}>
            Importable Sources
          </h2>
          <button
            onClick={handleDetect}
            disabled={detecting}
            style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 12,
              fontWeight: 500,
              color: detecting ? '#5E6B7C' : '#6ECFA3',
              background: 'transparent',
              border: '1px solid',
              borderColor: detecting ? 'rgba(94, 107, 124, 0.3)' : 'rgba(110, 207, 163, 0.3)',
              borderRadius: 6,
              padding: '5px 12px',
              cursor: detecting ? 'not-allowed' : 'pointer',
            }}
          >
            {detecting ? 'Scanning...' : 'Detect Sources'}
          </button>
        </div>

        {sources.length === 0 ? (
          <p style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
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
                      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14, color: '#CDD4DB' }}>
                        {source.name}
                      </div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#525A64', marginTop: 2 }}>
                        {source.type}
                        {source.path ? ` \u00B7 ${source.path}` : ''}
                        {source.size ? ` \u00B7 ${formatBytes(source.size)}` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => handleImport(source.id)}
                      disabled={importingSource !== null}
                      style={{
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        fontSize: 12,
                        fontWeight: 500,
                        color: isImporting ? '#5E6B7C' : '#0B0E11',
                        background: isImporting ? 'rgba(255,255,255,0.04)' : '#6ECFA3',
                        border: 'none',
                        borderRadius: 6,
                        padding: '5px 14px',
                        cursor: importingSource !== null ? 'not-allowed' : 'pointer',
                        opacity: importingSource !== null && !isImporting ? 0.4 : 1,
                      }}
                    >
                      {isImporting ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                  {/* Progress bar */}
                  {showProgress && progress && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}>
                        <span style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 11, color: '#8593A4' }}>
                          {progress.phase ?? 'Importing'}
                        </span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#8593A4' }}>
                          {progress.current} / {progress.total}
                        </span>
                      </div>
                      <div style={{
                        height: 4,
                        borderRadius: 2,
                        background: 'rgba(255,255,255,0.06)',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          borderRadius: 2,
                          background: '#6ECFA3',
                          width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%',
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Import History */}
      <div style={{
        background: '#111518',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 12,
        padding: 24,
      }}>
        <h2 style={{
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: 15,
          fontWeight: 500,
          color: '#CDD4DB',
          margin: 0,
          marginBottom: 16,
        }}>
          Import History
        </h2>

        {loading ? (
          <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 13, color: '#5E6B7C', margin: 0 }}>
            Loading history...
          </p>
        ) : history.length === 0 ? (
          <p style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
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
                <div>
                  <span style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 13, color: '#CDD4DB' }}>
                    {record.source}
                  </span>
                  <span style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 11,
                    color: record.status === 'success' ? '#6ECFA3' : record.status === 'partial' ? '#B09A8A' : '#B07A8A',
                    marginLeft: 8,
                  }}>
                    {record.itemsImported} items
                  </span>
                </div>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#525A64' }}>
                  {formatTimestamp(record.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
