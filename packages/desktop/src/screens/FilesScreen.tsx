import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DirectoryPicker, ProgressBar, Card, StatusIndicator, SkeletonCard } from '@semblance/ui';
import { startIndexing, getKnowledgeStats } from '../ipc/commands';
import { ContentBracket } from '../components/ContentBracket';
import { ShimmerDescription } from '../components/ShimmerDescription';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { useAppState, useAppDispatch } from '../state/AppState';

export function FilesScreen() {
  const { t } = useTranslation();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(true);

  // Fetch knowledge stats on mount
  useEffect(() => {
    setLoading(true);
    getKnowledgeStats().then((stats) => {
      dispatch({ type: 'SET_KNOWLEDGE_STATS', stats });
    }).catch((err) => {
      console.error('[FilesScreen] failed to get knowledge stats:', err);
    }).finally(() => setLoading(false));
  }, [dispatch]);

  // Listen for indexing progress events to update UI in real-time
  useTauriEvent('semblance://indexing-progress', useCallback((event: unknown) => {
    const payload = (event as { payload?: Record<string, unknown> })?.payload ?? event;
    const data = payload as {
      filesScanned?: number;
      filesTotal?: number;
      chunksCreated?: number;
      currentFile?: string | null;
    };
    dispatch({
      type: 'SET_INDEXING_STATUS',
      status: {
        state: 'indexing' as const,
        filesScanned: data.filesScanned ?? 0,
        filesTotal: data.filesTotal ?? 0,
        chunksCreated: data.chunksCreated ?? 0,
        currentFile: data.currentFile ?? null,
        error: null,
      },
    });
  }, [dispatch]));

  // Refresh stats when indexing completes
  useTauriEvent('semblance://indexing-complete', useCallback((event: unknown) => {
    const payload = (event as { payload?: Record<string, unknown> })?.payload ?? event;
    const data = (payload && typeof payload === 'object' ? payload : {}) as { error?: string };

    if (data.error) {
      dispatch({
        type: 'SET_INDEXING_STATUS',
        status: { state: 'error' as const, error: data.error, filesScanned: 0, filesTotal: 0, chunksCreated: 0, currentFile: null },
      });
    } else {
      dispatch({
        type: 'SET_INDEXING_STATUS',
        status: { state: 'complete' as const, filesScanned: 0, filesTotal: 0, chunksCreated: 0, currentFile: null, error: null },
      });
    }

    // Refresh stats
    getKnowledgeStats().then((stats) => {
      dispatch({ type: 'SET_KNOWLEDGE_STATS', stats });
    }).catch((err) => {
      console.error('[FilesScreen] failed to refresh knowledge stats:', err);
    });
  }, [dispatch]));

  const handleAddFolder = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        dispatch({ type: 'ADD_DIRECTORY', path: selected });
        dispatch({
          type: 'SET_INDEXING_STATUS',
          status: { state: 'scanning' as const, filesScanned: 0, filesTotal: 0, chunksCreated: 0, currentFile: null, error: null },
        });
        await startIndexing([...state.indexedDirectories, selected]);
      }
    } catch (err) {
      console.error('[FilesScreen] add folder failed:', err);
    }
  }, [dispatch, state.indexedDirectories]);

  const handleRemove = useCallback((path: string) => {
    dispatch({ type: 'REMOVE_DIRECTORY', path });
  }, [dispatch]);

  const handleRescan = useCallback(async (path: string) => {
    try {
      dispatch({
        type: 'SET_INDEXING_STATUS',
        status: { state: 'scanning' as const, filesScanned: 0, filesTotal: 0, chunksCreated: 0, currentFile: null, error: null },
      });
      await startIndexing([path]);
    } catch (err) {
      console.error('[FilesScreen] rescan failed:', err);
    }
  }, [dispatch]);

  const dirs = state.indexedDirectories.map((path) => ({
    path,
    fileCount: undefined,
    lastIndexed: undefined,
  }));

  const { indexingStatus, knowledgeStats } = state;

  return (
    <div className="page-scroll">
      <div className="page-layout">
        <ContentBracket>
        <h1 className="page-title" style={{ fontSize: 28, maxWidth: 720, width: '100%', margin: '0 auto' }}>{t('screen.files.title')}</h1>
        <div style={{ maxWidth: 720, width: '100%', margin: '0 auto' }}>
          <ShimmerDescription text="Your local knowledge base" />
        </div>
        <div className="settings-screen surface-void" style={{ minHeight: 'auto' }}>
          <div className="settings-content">
        {/* Indexed Directories */}
        <div className="settings-section-header bracket-section">{t('screen.files.section_directories')}</div>
        <div className="settings-row settings-row--static">
          {dirs.length === 0 && indexingStatus.state !== 'indexing' && indexingStatus.state !== 'scanning' ? (
            <span className="settings-row__label" style={{ color: '#A8B4C0', fontSize: 12, fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em' }}>
              {t('screen.files.empty_directories')}
            </span>
          ) : null}
        </div>
        <DirectoryPicker
          directories={dirs}
          onAdd={handleAddFolder}
          onRemove={handleRemove}
          onRescan={handleRescan}
        />

        {/* Indexing Status */}
        <div className="settings-section-header bracket-section" style={{ marginTop: 24 }}>{t('screen.files.section_indexing')}</div>
        <div className="settings-row settings-row--static">
          {indexingStatus.state === 'idle' || indexingStatus.state === 'complete' ? (
            <div className="flex items-center gap-2">
              <StatusIndicator status="success" />
              <span className="settings-row__label" style={{ color: '#A8B4C0', fontSize: 12, fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em' }}>
                {t('screen.files.indexing_up_to_date')}
              </span>
            </div>
          ) : indexingStatus.state === 'error' ? (
            <div className="flex items-center gap-2">
              <StatusIndicator status="attention" />
              <span style={{ color: '#B07A8A', fontSize: 12, fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em' }}>{t('screen.files.indexing_error', { error: indexingStatus.error })}</span>
            </div>
          ) : (
            <div style={{ width: '100%' }}>
              <div className="flex items-center gap-2 mb-2">
                <StatusIndicator status="accent" pulse />
                <span className="settings-row__label" style={{ color: '#A8B4C0', fontSize: 12, fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em' }}>
                  {indexingStatus.state === 'scanning' && t('screen.files.indexing_scanning')}
                  {indexingStatus.state === 'indexing' && t('screen.files.indexing_progress', { scanned: indexingStatus.filesScanned, total: indexingStatus.filesTotal })}
                </span>
              </div>
              <ProgressBar
                value={indexingStatus.filesScanned}
                max={indexingStatus.filesTotal || 1}
                indeterminate={indexingStatus.state === 'scanning'}
              />
              {indexingStatus.state === 'indexing' && (indexingStatus as { currentFile?: string | null }).currentFile && (
                <span style={{ color: '#5E6B7C', fontSize: 11, display: 'block', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                  {(indexingStatus as { currentFile?: string | null }).currentFile}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Knowledge Stats */}
        <div className="settings-section-header bracket-section" style={{ marginTop: 24 }}>{t('screen.files.section_stats')}</div>
        {loading ? (
          <div style={{ padding: '0 16px' }}>
            <SkeletonCard variant="generic" message="Loading file index" subMessage="Scanning your document library" showSpinner />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '0 16px' }}>
            {[
              { value: knowledgeStats.documentCount ?? 0, label: t('screen.files.stat_documents') },
              { value: knowledgeStats.chunkCount ?? 0, label: t('screen.files.stat_chunks') },
              { value: `${((knowledgeStats.indexSizeBytes ?? 0) / (1024 * 1024)).toFixed(1)} MB`, label: t('screen.files.stat_index_size') },
              { value: '.txt  .md  .pdf  .docx', label: t('screen.files.stat_supported_types') },
            ].map((stat) => (
              <Card key={stat.label}>
                <div style={{
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                  textAlign: 'center', minHeight: 80,
                }}>
                  <span style={{
                    fontSize: 11, color: '#5E6B7C', fontFamily: "'DM Mono', monospace",
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    marginBottom: 6,
                  }}>{stat.label}</span>
                  <span style={{
                    fontSize: 18, fontWeight: 400, color: '#6ECFA3', fontFamily: "'DM Mono', monospace",
                    letterSpacing: '0.02em',
                  }}>{stat.value}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
          </div>
        </div>
        </ContentBracket>
      </div>
    </div>
  );
}
